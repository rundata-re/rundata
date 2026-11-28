/**
 * Web Push without a library, with WebCrypto alone (the Worker's, and Node's in the tests): the VAPID header (RFC 8292,
 * a JWT signed ES256) and the body encrypted for one subscription (RFC 8291, `aes128gcm` of RFC 8188: ECDH P-256,
 * HKDF-SHA-256, AES-128-GCM, one record). The npm packages (`web-push`) need Node's `crypto` and `https`, which a
 * Worker does not have; this file is about 2 KB once built.
 *
 * Measured in Node 22 on 24/11/2026: 2.5 ms of CPU a send (encryption and JWT), 2.0 ms with a JWT kept for its push
 * service; a message of 187 bytes is 290 once encrypted (the services take 4 KB).
 */

const subtle = crypto.subtle;
const enc = new TextEncoder();

/** base64url without padding, as Web Push writes keys. */
export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The bytes of a base64url (or base64) text; throws on anything else. */
export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_+/-]*={0,2}$/.test(s)) throw new Error("base64url invalide");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "") + "===".slice((s.replace(/=+$/, "").length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The site's VAPID key: the private key to sign, and its public key (65 bytes) that the browser subscribes with. */
export interface CleVapid {
  privee: CryptoKey;
  publique: Uint8Array<ArrayBuffer>;
}

/**
 * The VAPID key from its JWK (the secret VAPID_PRIVE, written by scripts/vapid-cles.mjs): a P-256 key with `d`, `x`
 * and `y`. Its public key is `x` and `y` after the byte 4 (uncompressed point), so that only one secret is kept.
 */
export async function cleVapid(jwk: string): Promise<CleVapid> {
  let j: JsonWebKey;
  try {
    j = JSON.parse(jwk) as JsonWebKey;
  } catch {
    // Never the parser's error: it quotes the beginning of the secret.
    throw new Error("clé VAPID : JWK P-256 attendue, pas du JSON");
  }
  if (j.kty !== "EC" || j.crv !== "P-256" || !j.d || !j.x || !j.y) throw new Error("clé VAPID : JWK P-256 attendue");
  const privee = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: j.d, x: j.x, y: j.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { privee, publique: concat(new Uint8Array([4]), unb64u(j.x), unb64u(j.y)) };
}

/** A JWT of VAPID lasts 12 h here (RFC 8292 allows up to 24 h). */
export const JWT_DUREE_S = 12 * 3600;

/**
 * The header `Authorization: vapid t=<JWT>, k=<public key>` for a subscription's address: the JWT's audience is the
 * push service's origin, so one JWT serves every subscriber of that service for its 12 h. `contact` is a mailto: or
 * https: address the service can write to (RFC 8292 § 2.1).
 */
export async function enteteVapid(endpoint: string, cle: CleVapid, contact: string, now = Date.now()): Promise<string> {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + JWT_DUREE_S, sub: contact })));
  // WebCrypto's ECDSA signature is r and s, 32 bytes each: the JWS form ES256 wants (RFC 7518 § 3.4).
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle.privee, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(cle.publique)}`;
}

/** The record size written in the header: one record holds the whole message (4 KB at most at the services). */
const RS = 4096;

/** For the test of RFC 8291's example only: the server's key pair and the salt it uses, instead of new ones. */
export interface Fixe {
  serveur: CryptoKeyPair;
  sel: Uint8Array<ArrayBuffer>;
}

/**
 * The body of a push to one subscription (RFC 8291 § 3.4, RFC 8188 § 2): a new ECDH key and salt for each message, the
 * keys of the subscription (`p256dh`, `auth`, base64url, as the browser gives them). The header of the body holds the
 * salt, the record size and the server's public key; then the message, its delimiter 2 (last record, no padding),
 * encrypted.
 */
export async function chiffrer(message: string, p256dh: string, auth: string, fixe?: Fixe): Promise<Uint8Array<ArrayBuffer>> {
  const uaPub = unb64u(p256dh);
  const secret = unb64u(auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error("clé p256dh invalide");
  if (secret.length !== 16) throw new Error("secret auth invalide");
  const serveur = fixe?.serveur ?? ((await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPub = new Uint8Array(await subtle.exportKey("raw", serveur.publicKey));
  const uaKey = await subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const partage = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, serveur.privateKey, 256));
  const ikm = await hkdf(secret, partage, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const sel = fixe?.sel ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const chiffre = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(message), new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RS);
  return concat(sel, rs, new Uint8Array([asPub.length]), asPub, chiffre);
}
