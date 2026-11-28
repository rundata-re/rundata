/**
 * The feedback people and their assistants leave: through the `donner_avis` tool (canal « mcp ») and the form at the
 * bottom of every page (canal « site », POST /avis). One row each in the D1 table `avis` (scripts/avis.sql), read with
 * a script by whoever runs the service.
 *
 * Kept: the time, the kind, the tool and the place concerned, the message, the need in a few words (column `question`:
 * never the conversation itself), the client's name when its User-Agent
 * says it (« Claude », « ChatGPT (connecteur) »…), the page of the form. No address: to refuse a flood, each row
 * carries a fingerprint of the sender (a hash of its address and the day, salted with a secret or, without one, a
 * value drawn by each instance), wiped after a day; the table forgets every row after 12 months (both by trigger).
 * Phone numbers and e-mail addresses in a message are blanked before it is written. Once a feedback is dealt with,
 * whoever reads them notes when and what was done (`traite_le`, `suite`), never anything about the sender.
 *
 * In the Worker the rows go to D1; in Node, without a database, nothing is kept and the tool says where to write.
 */
import { portesAvis } from "./contexte.js";
import { visitor } from "./metrics.js";

export const TYPES = ["manque", "erreur", "suggestion", "bravo"] as const;
export type TypeAvis = (typeof TYPES)[number];
export type Canal = "mcp" | "site";

export const MESSAGE_MAX = 1000;
// The need in a few words, never the conversation (the Claude directory's rule on conversation data).
export const BESOIN_MAX = 160;
export const COURT_MAX = 100;
// Rows a sender may write in an hour, and all senders together: enough for a conversation, not for a script.
export const PAR_SOURCE_HEURE = 10;
export const EN_TOUT_HEURE = 120;

export interface Avis {
  canal: Canal;
  type?: TypeAvis;
  outil?: string;
  lieu?: string;
  message: string;
  question?: string;
  client?: string;
  page?: string;
}

/** Runs one statement, returns the number of rows it changed. */
export type Run = (sql: string, ...params: unknown[]) => Promise<number>;

let sel: string | undefined;

/** `secret`: the salt of the fingerprints, if the Worker has one (AVIS_SEL); the rows go to the feedback's database (contexte.ts `portesAvis`). */
export function configure(secret?: string) {
  sel = secret || undefined;
}

export const enabled = () => !!portesAvis().run;

// Without a secret, a salt drawn once per instance: the fingerprints can never be traced back to an address. Drawn at
// first use, since a Worker may not draw random values while its module loads.
let ownSalt: string | undefined;
const salt = () => (ownSalt ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

/** The part of a connection's address that names it: the address in IPv4, its /64 in IPv6 (a home's whole network). */
export function reseau(ip: string): string {
  const v4 = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const all8 = [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${all8.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * A short hash of the sender's connection and the day: the same within a day, meaningless without the salt. The
 * connection is its `reseau`: in IPv6 the /64, which a single home or script holds whole, so it counts once.
 */
export async function empreinte(adresse: string, now: Date): Promise<string> {
  const data = new TextEncoder().encode(`${sel ?? salt()}|${now.toISOString().slice(0, 10)}|${reseau(adresse)}`);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The sender's address as Cloudflare gives it (or a proxy in front of Node); « » when unknown. */
export function adresseOf(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (k: string) => (headers instanceof Headers ? headers.get(k) : [headers[k]].flat()[0]) ?? "";
  return get("cf-connecting-ip") || get("x-forwarded-for").split(",")[0].trim();
}

// « 0X XX XX XX XX » in its usual spellings, or after +33 / +262 (00 for +), « (0) » allowed; any other country's
// number written with its « + » (« +44 20 7946 0958 »), not with dots, which coordinates have (« +55.2212345 »).
// Never inside a longer number.
const PHONE = /(?<![\d.,])(?:(?:(?:\+|00)\s?(?:33|262)\s?(?:\(0\)\s?)?[1-9]|0[1-9])(?:[\s.-]?\d\d){4}|\+[1-9]\d{0,2}(?:[\s-]?\d){6,13})(?![\d])/g;

/** The client, from its User-Agent (metrics.ts); undefined for a browser or an unknown one. */
export function clientOf(userAgent: string): string | undefined {
  const v = visitor(userAgent);
  return v === "navigateur" || v === "inconnu" ? undefined : v;
}

/**
 * Control characters out, spaces folded, phone numbers and e-mail addresses blanked, cut to `max`. The numbers are the
 * French and Réunion ones (« 0692 12 34 56 », « +262 692 12 34 56 », « 0033 6… ») and the others written with their
 * « + », whole: a run of digits that is part of a longer number, such as GPS coordinates (« -21.0512345 55.2212345 »),
 * is what the feedback is about, and stays.
 */
export function nettoie(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  const t = s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[courriel retiré]")
    .replace(PHONE, "[numéro retiré]")
    .trim()
    .slice(0, max);
  return t || undefined;
}

export type Issue = "ok" | "limite" | "indisponible";

const INSERT = `INSERT INTO avis (t, canal, type, outil, lieu, message, question, client, page, source)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE (SELECT COUNT(*) FROM avis WHERE source = ? AND t > ?) < ? AND (SELECT COUNT(*) FROM avis WHERE t > ?) < ?`;

/**
 * Writes one feedback, in one statement that also refuses it when its sender, or everyone together, has sent too
 * many in the last hour. The message must already be checked (nettoie).
 */
export async function enregistrer(avis: Avis, adresse: string, now = new Date()): Promise<Issue> {
  const { run } = portesAvis();
  if (!run) return "indisponible";
  const t = Math.floor(now.getTime() / 1000);
  const source = await empreinte(adresse, now);
  try {
    const changed = await run(
      INSERT,
      t, avis.canal, avis.type ?? null, avis.outil ?? null, avis.lieu ?? null, avis.message, avis.question ?? null, avis.client ?? null, avis.page ?? null, source,
      source, t - 3600, PAR_SOURCE_HEURE, t - 3600, EN_TOUT_HEURE,
    );
    return changed > 0 ? "ok" : "limite";
  } catch (err) {
    console.error("avis : écriture impossible", err instanceof Error ? err.message : String(err));
    return "indisponible";
  }
}
