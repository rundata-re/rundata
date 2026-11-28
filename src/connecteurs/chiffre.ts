/**
 * The secrets the platform connectors keep (a HelloAsso refresh token), encrypted before they reach D1: AES-256-GCM
 * under the Worker's secret CONNECTEURS_CLE, 32 random bytes in base64 set with `wrangler secret put`, never in the
 * repository. Each value is bound to its row by the additional data (its platform, the association there and the
 * hash of the row's link, known before the row is written): copied into another row, it does not open. A fresh
 * 12-byte IV each time; « v1. » in front leaves room for another key.
 *
 * Without the key (Node, the tests, a Worker not given it), nothing is encrypted and the connectors stay closed: a
 * secret is never kept in clear instead.
 */
import { secret } from "../contexte.js";

const VERSION = "v1";
const IV_BYTES = 12;

const bytes = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

// The key, imported once for the secret it was made from: undefined for a secret that is not 32 bytes of base64.
let importee: { de: string; cle: Promise<CryptoKey> | undefined } | undefined;

/** The key of CONNECTEURS_CLE (contexte.ts `secret`). A value that is not 32 bytes of base64 leaves the connectors closed, said once. */
function cle(): Promise<CryptoKey> | undefined {
  const raw = secret("connecteurs");
  if (!raw) return undefined;
  if (importee?.de === raw) return importee.cle;
  let key: Uint8Array<ArrayBuffer>;
  try {
    key = bytes(raw);
  } catch {
    key = new Uint8Array();
  }
  if (key.length !== 32) console.error("connecteurs : CONNECTEURS_CLE n'est pas une clé de 32 octets en base64, connecteurs fermés");
  importee = { de: raw, cle: key.length === 32 ? crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]) : undefined };
  return importee.cle;
}

export const enabled = () => !!cle();

/** What binds a value to its row: the columns plateforme, organisation and jeton (scripts/connecteurs.sql). */
export const lien = (plateforme: string, organisation: string, jeton: string) => new TextEncoder().encode(`${plateforme}|${organisation}|${jeton}`);

async function key(): Promise<CryptoKey> {
  const k = await cle();
  if (!k) throw new Error("connecteurs : pas de clé de chiffrement");
  return k;
}

/** `clair` encrypted for the row `ad` names (`lien()`): « v1.<iv>.<chiffré> », in base64. */
export async function chiffrer(clair: string, ad: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ad }, await key(), new TextEncoder().encode(clair)));
  return `${VERSION}.${b64(iv)}.${b64(out)}`;
}

/** The value back; throws when it was not encrypted with this key for this row. */
export async function dechiffrer(valeur: string, ad: Uint8Array<ArrayBuffer>): Promise<string> {
  const [version, iv, data] = valeur.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("connecteurs : valeur chiffrée illisible");
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: ad }, await key(), bytes(data));
  return new TextDecoder().decode(out);
}
