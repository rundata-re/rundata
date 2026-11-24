import { describe, expect, it } from "vitest";
import { b64u, chiffrer, cleVapid, enteteVapid, unb64u } from "../src/push/webpush.js";

const subtle = crypto.subtle;

/** A P-256 key pair from its raw private key and public point (base64url), as RFC 8291's example gives them. */
async function paire(d: string, pub: string, usages: KeyUsage[]): Promise<CryptoKeyPair> {
  const p = unb64u(pub);
  const jwk = { kty: "EC", crv: "P-256", d, x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)) };
  const privateKey = await subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, usages);
  const publicKey = await subtle.importKey("raw", p, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return { privateKey, publicKey };
}

describe("Web Push encryption (RFC 8291)", () => {
  // RFC 8291, appendix A: every input given, the body known byte for byte.
  const A = {
    message: "When I grow up, I want to be a watermelon",
    asPriv: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    asPub: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    uaPriv: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
    uaPub: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    sel: "DGv6ra1nlYgDCS1FRnbzlw",
    corps:
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  };

  it("gives the body of the RFC's example, byte for byte", async () => {
    const serveur = await paire(A.asPriv, A.asPub, ["deriveBits"]);
    const corps = await chiffrer(A.message, A.uaPub, A.auth, { serveur, sel: unb64u(A.sel) });
    expect(b64u(corps)).toBe(A.corps);
  });

  it("encrypts each message with a new key and salt, never the same body twice", async () => {
    const a = await chiffrer("Volcan : Alerte 1", A.uaPub, A.auth);
    const b = await chiffrer("Volcan : Alerte 1", A.uaPub, A.auth);
    expect(b64u(a)).not.toBe(b64u(b));
    expect(a.length).toBe(16 + 4 + 1 + 65 + "Volcan : Alerte 1".length + 1 + 16);
  });

  it("refuses keys of the wrong size", async () => {
    await expect(chiffrer("x", b64u(new Uint8Array(64)), A.auth)).rejects.toThrow("p256dh");
    await expect(chiffrer("x", A.uaPub, b64u(new Uint8Array(8)))).rejects.toThrow("auth");
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs a JWT for the push service's origin, valid 12 h, with the site's public key after k=", async () => {
    const paireVapid = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = JSON.stringify(await subtle.exportKey("jwk", paireVapid.privateKey));
    const cle = await cleVapid(jwk);
    expect(b64u(cle.publique)).toBe(b64u(await subtle.exportKey("raw", paireVapid.publicKey)));

    const now = Date.UTC(2026, 10, 24, 12);
    const h = await enteteVapid("https://fcm.googleapis.com/fcm/send/abc", cle, "mailto:contact@rundata.re", now);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(k).toBe(b64u(cle.publique));
    const [tete, corps, sig] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(unb64u(corps)))).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:contact@rundata.re" });
    expect(JSON.parse(new TextDecoder().decode(unb64u(tete)))).toEqual({ typ: "JWT", alg: "ES256" });
    const ok = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, paireVapid.publicKey, unb64u(sig), new TextEncoder().encode(`${tete}.${corps}`));
    expect(ok).toBe(true);
  });

  it("refuses a key that is not a P-256 JWK with its private part", async () => {
    await expect(cleVapid(JSON.stringify({ kty: "EC", crv: "P-256", x: "a", y: "b" }))).rejects.toThrow("JWK");
  });
});
