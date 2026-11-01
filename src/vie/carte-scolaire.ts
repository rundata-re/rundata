/**
 * The public collèges' map of sectors (scripts/build-carte-scolaire.py): which collège each street of a commune, or
 * each stretch of it, depends on. Its files are in public/carte-scolaire/, one per commune, loaded by /ecoles in the
 * browser and read by annuaire_services_publics (`fichier`, the Worker's static assets); here, its day, its counts, the
 * file of each commune, the communes with a single sector, and the search of an address in a commune's file (`trouve`).
 */
import type { SourceInfo } from "../types.js";
import data from "./carte-scolaire.json" with { type: "json" };

export const CARTE = data as { maj: string; troncons: number; colleges: number; communes: Record<string, string>; uniques: string[] };

export const SOURCE: SourceInfo = {
  id: "carte_scolaire_colleges",
  nom: "Carte scolaire des collèges publics",
  organisme: "Ministère de l'Éducation nationale",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Carte scolaire des collèges publics (ministère de l'Éducation nationale)",
  url: "https://data.education.gouv.fr/explore/dataset/fr-en-carte-scolaire-colleges-publics/",
};

/** How a commune's file is read, from its path: the Worker's static assets (worker.ts), public/ under Node (bin/). */
let lire: ((path: string) => Promise<CarteCommune | null>) | undefined;
export function configure(read: typeof lire) {
  lire = read;
}

/** The file of a commune, by its INSEE code: null when there is none, or nothing to read it with. */
export async function fichier(insee: string): Promise<CarteCommune | null> {
  const path = CARTE.communes[insee];
  return path && lire ? lire(path) : null;
}

/** A row of a commune's file: the street, its place, its first and last numbers, both sides (0), odd (1) or even (2), its collège. */
export type Troncon = [string, string, number, number, number, number];
export interface CarteCommune {
  maj: string;
  colleges: { uai: string; nom: string; adresse?: string; tel?: string; web?: string; onisep?: string }[];
  v: Troncon[];
  /** The collège of the whole commune, when it has a single sector. */
  u?: number;
}
/** What the search found: the commune's one collège, a street's, its collèges by number, streets to pick from, or nothing. */
export type Trouve =
  | { k: "unique"; c: number }
  | { k: "college"; c: number; voie: [string, string]; hors: boolean }
  | { k: "numeros"; voie: [string, string]; num: boolean; hors: boolean; rows: [number, number, number, number][] }
  | { k: "choix"; voies: [string, string][] }
  | { k: "vide" }
  | { k: "inconnue" };

/**
 * The words of a street or of what was typed, to compare them: no accents, upper case, the usual abbreviations in full.
 * Pure, with nothing from the module: written into the page's script as it is (`${motsVoie}`).
 */
export function motsVoie(s: string): string[] {
  const ab: Record<string, string> = { R: "RUE", CH: "CHEMIN", CHE: "CHEMIN", CHEM: "CHEMIN", AV: "AVENUE", AVE: "AVENUE", BD: "BOULEVARD", BLD: "BOULEVARD", IMP: "IMPASSE", ALL: "ALLEE",
    PL: "PLACE", RTE: "ROUTE", LOT: "LOTISSEMENT", RES: "RESIDENCE", SQ: "SQUARE", SENT: "SENTIER", ST: "SAINT", STE: "SAINTE", PDT: "PRESIDENT", GAL: "GENERAL", DR: "DOCTEUR" };
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => ab[w] ?? w);
}

/**
 * The collège of what was typed (« 12 rue … »), in a commune's file. A street matches when every word typed is in its
 * name or its place (« rue », « chemin »… and « de », « la »… optional), the last one possibly cut short; the closest
 * names win. Several streets of that name with different collèges: the person picks one (`voie`, « name|place »). Then
 * the number, odd or even, picks the stretch; without it, or out of every stretch, the street's collèges by number.
 * Pure, `mots` given (motsVoie): written into the page's script as it is, and tested as it runs there.
 */
export function trouve(d: CarteCommune, saisie: string, mots: (s: string) => string[], voie?: string): Trouve {
  if (d.u != null && !d.v.length) return { k: "unique", c: d.u };
  const stop = new Set("DE DU DES LA LE LES D L ET A AU AUX EN".split(" "));
  const kinds = new Set("RUE CHEMIN AVENUE BOULEVARD IMPASSE ALLEE PLACE ROUTE LOTISSEMENT RESIDENCE SQUARE PASSAGE SENTIER RUELLE CITE VOIE ZA ZI QUAI MAIL TRAVERSE VENELLE LIGNE SENTE COUR COURS ROCADE PROMENADE CHAUSSEE DOMAINE ILET".split(" "));
  const w = mots(saisie);
  let n: number | null = null;
  if (w.length && /^\d+$/.test(w[0])) {
    n = Number(w.shift());
    while (w.length > 1 && /^(BIS|TER|QUATER|[A-Z])$/.test(w[0])) w.shift();
  }
  const streets = new Map<string, Troncon[]>();
  for (const v of d.v) {
    const k = `${v[0]}|${v[1]}`;
    if (!streets.has(k)) streets.set(k, []);
    streets.get(k)!.push(v);
  }
  let cand: Troncon[][] = [];
  if (voie && streets.has(voie)) cand = [streets.get(voie)!];
  else {
    const q = w.filter((x) => !stop.has(x) && !kinds.has(x));
    if (!q.length) return { k: "vide" };
    const kind = w.find((x) => kinds.has(x));
    let best = 0;
    for (const rows of streets.values()) {
      const sw = mots(rows[0][0]);
      const sk = sw.filter((x) => !stop.has(x) && !kinds.has(x));
      const lk = mots(rows[0][1]).filter((x) => !stop.has(x));
      if (!q.every((x, i) => sk.includes(x) || lk.includes(x) || (i === q.length - 1 && x.length > 2 && [...sk, ...lk].some((y) => y.startsWith(x))))) continue;
      const m = q.filter((x) => sk.includes(x) || (x.length > 2 && sk.some((y) => y.startsWith(x)))).length;
      if (!m) continue;
      const score = (m >= sk.length ? 2 : 1 + m / sk.length) + (kind && sw[0] === kind ? 0.5 : 0) + (q.some((x) => lk.includes(x)) ? 0.25 : 0);
      if (score > best) {
        best = score;
        cand = [];
      }
      if (score === best) cand.push(rows);
    }
    if (!cand.length) return { k: "inconnue" };
    if (cand.length > 1 && new Set(cand.flat().map((v) => v[5])).size > 1) return { k: "choix", voies: cand.slice(0, 12).map((r) => [r[0][0], r[0][1]]) };
  }
  const rows = cand.flat();
  const said: [string, string] = [rows[0][0], rows[0][1]];
  const by = n == null ? rows : rows.filter((v) => v[2] <= n! && n! <= v[3] && (!v[4] || n! % 2 === 2 - v[4]));
  const use = by.length ? by : rows;
  const cs = [...new Set(use.map((v) => v[5]))];
  const hors = n != null && !by.length;
  if (cs.length === 1) return { k: "college", c: cs[0], voie: said, hors };
  return { k: "numeros", voie: said, num: n != null, hors, rows: use.map((v) => [v[2], v[3], v[4], v[5]]) };
}
