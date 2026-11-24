/**
 * The declared associations of La Réunion, from the Répertoire national des associations (RNA): the table `associations`
 * of scripts/associations.sql in D1, filled by scripts/build-associations.py (.github/workflows/associations.yml), read by
 * /associations (web/associations.ts) and the tool annuaire_services_publics (tools/associations.ts).
 *
 * Of each, only what the RNA says of the association itself: its title, its object, its commune, its year of creation, its
 * site. Never an address: its seat is often a home. rundata.re corrects nothing in it: an association corrects its own
 * entry with the greffe des associations (CORRIGER).
 */
import { count } from "../budget.js";
import { INSEE } from "../places/insee.js";
import { normalize } from "../places/resolve.js";
import type { SourceInfo } from "../types.js";

export interface Association {
  /** Its number in the RNA, « W9R… ». */
  id: string;
  titre: string;
  objet: string;
  insee: string;
  /** « AAAA-MM-JJ », when the RNA gives it. */
  creee: string | null;
  /** An http(s) address of a valid form, when it gives one. */
  site: string | null;
}

export type All = <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
let all: All | undefined;

/** The database, from the worker (worker.ts); none in a test that does not set it. */
export function configure(read?: All): void {
  all = read;
}

/** Whether the table can be read here. */
export const lisible = () => all !== undefined;

export const SOURCE: SourceInfo = {
  id: "rna",
  nom: "Répertoire national des associations (RNA)",
  organisme: "Ministère de l'Intérieur",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Répertoire national des associations (ministère de l'Intérieur)",
  url: "https://www.data.gouv.fr/datasets/repertoire-national-des-associations",
};

/** Where an association corrects its entry: rundata.re only shows the RNA's. */
export const CORRIGER = "https://www.service-public.fr/associations/vosdroits/F1123";

/** The INSEE code of each commune, and back. */
const COMMUNE_OF = Object.fromEntries(Object.entries(INSEE).map(([c, code]) => [code, c])) as Record<string, string>;
export const communeOf = (insee: string): string | undefined => COMMUNE_OF[insee];

/** An object is cut there on the page, the rest behind « la suite ». */
export const OBJET_COURT = 300;
/** « Club de surf… » → its first 300 characters, cut at a word, and whether there is more. */
export function court(objet: string, max = OBJET_COURT): { debut: string; suite: boolean } {
  if (objet.length <= max) return { debut: objet, suite: false };
  const cut = objet.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return { debut: `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, "")}…`, suite: true };
}

/**
 * The words asked as an FTS5 query: each word a prefix (« surf » finds « surfeurs »), all of them needed, quoted so that
 * no word is read as an operator (« NOT », « OR », a « - »). Words of 1 letter and the commonest ones left out.
 */
const VIDES = new Set(["de", "des", "du", "la", "le", "les", "l", "d", "et", "a", "au", "aux", "en", "pour", "un", "une", "association", "associations", "asso", "club", "clubs"]);
export function requete(mots: string): string | undefined {
  const words = normalize(mots).split(" ").filter((w) => w.length > 1 && !VIDES.has(w)).slice(0, 6);
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : undefined;
}

/**
 * The file imported: `fichier`, the date in its name (« 2026-10-01 » for rna_waldec_20261001.zip), which the import
 * compares; `maj`, its newest row's day (« 2026-09-30 »), the day the page says. Undefined when nothing was imported yet.
 */
export async function importe(): Promise<{ fichier: string; maj: string } | undefined> {
  if (!all) return undefined;
  count(1, "read");
  const r = await all<{ cle: string; valeur: string }>("SELECT cle, valeur FROM associations_import WHERE cle IN ('fichier', 'maj')");
  const v = Object.fromEntries(r.map((x) => [x.cle, x.valeur]));
  return v.fichier ? { fichier: v.fichier, maj: v.maj ?? v.fichier } : undefined;
}

/**
 * The associations of a commune (an INSEE code) or of the whole island, with every word asked in their title or
 * object when there are words, best match first, else in the order of their titles. `total`: how many there are.
 */
export async function chercher(opts: { insee?: string; mots?: string; limit: number; offset?: number }): Promise<{ liste: Association[]; total: number }> {
  if (!all) return { liste: [], total: 0 };
  const q = opts.mots ? requete(opts.mots) : undefined;
  const cols = "a.id, a.titre, a.objet, a.insee, a.creee, a.site";
  const where = opts.insee ? " AND a.insee = ?" : "";
  const args: unknown[] = opts.insee ? [opts.insee] : [];
  count(2, "read");
  if (q) {
    const [liste, n] = await Promise.all([
      all<Association>(`SELECT ${cols} FROM associations_mots JOIN associations a ON a.rowid = associations_mots.rowid WHERE associations_mots MATCH ?${where} ORDER BY rank LIMIT ? OFFSET ?`, q, ...args, opts.limit, opts.offset ?? 0),
      all<{ n: number }>(`SELECT count(*) AS n FROM associations_mots JOIN associations a ON a.rowid = associations_mots.rowid WHERE associations_mots MATCH ?${where}`, q, ...args),
    ]);
    return { liste, total: n[0]?.n ?? 0 };
  }
  // Words asked, none of them left once the common ones are set aside (« association »): the list, as without words.
  const [liste, n] = await Promise.all([
    all<Association>(`SELECT ${cols} FROM associations a WHERE 1 = 1${where} ORDER BY a.titre LIMIT ? OFFSET ?`, ...args, opts.limit, opts.offset ?? 0),
    all<{ n: number }>(`SELECT count(*) AS n FROM associations a WHERE 1 = 1${where}`, ...args),
  ]);
  return { liste, total: n[0]?.n ?? 0 };
}

/** « 2026-09-30 » → « 30/09/2026 ». */
export const dateDite = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
