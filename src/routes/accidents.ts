/**
 * The road accidents with casualties of La Réunion over a year (src/routes/accidents.json, scripts/build-accidents.py):
 * the ministry of the Interior's national file (ONISR, BAAC) on data.gouv.fr, bundled, one year a year. Counts only:
 * never an accident by itself, a person or a vehicle. The kind of road, never its number (free text in the file). The
 * communes in alphabetical order, never ranked, nor per inhabitant: only the killed compare from one to another.
 * Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import { nombre } from "../tools/format.js";
import type { SourceInfo } from "../types.js";
import data from "./accidents.json" with { type: "json" };

export interface Bilan {
  /** Accidents with at least one casualty. */
  accidents: number;
  /** Killed on the spot or within 30 days. */
  tues: number;
  /** Hurt, in hospital or not. */
  blesses: number;
}

export interface Ile extends Bilan {
  /** Accidents with at least one killed. */
  mortels: number;
  /** In hospital more than 24 h: no longer certified since 2019, and not to be compared from one commune to another. */
  hospitalises: number;
  legers: number;
}

/** The year the counts are of. */
export const ANNEE = data.annee;
/** The day the ministry put that year online, « 2026-10-30 ». */
export const PUBLIE_LE = data.publie_le;
export const ILE = data.ile as Ile;
/** By kind of road: national, departmental, communal, the others (car parks…). */
export const ROUTES = data.routes as Record<"nationales" | "departementales" | "communales" | "autres", Bilan>;
const COMMUNES = data.communes as Record<string, Bilan>;

/** A commune's year. */
export const ofCommune = (nom: string): Bilan | undefined => COMMUNES[INSEE[nom]];
/** The 24 communes, in alphabetical order. */
export const communes = (): [string, Bilan][] =>
  Object.keys(INSEE).sort((a, b) => a.localeCompare(b, "fr")).map((nom) => [nom, COMMUNES[INSEE[nom]]]);

/** « 3 tués », « 1 tué », and for none « aucun tué recensé en 2025 », never « aucun tué » alone. */
export const tues = (n: number) => (n ? `${nombre(n)} tué${n > 1 ? "s" : ""}` : `aucun tué recensé en ${ANNEE}`);
export const blesses = (n: number) => (n ? `${nombre(n)} blessé${n > 1 ? "s" : ""}` : `aucun blessé recensé en ${ANNEE}`);
/** « 3 tués, 361 blessés en 2025 », the year said once. */
export const bilan = (b: Bilan) => {
  const s = `${tues(b.tues)}, ${blesses(b.blesses)}`;
  return s.includes(`en ${ANNEE}`) ? s : `${s} en ${ANNEE}`;
};

export const SOURCE: SourceInfo = {
  id: "onisr_accidents",
  nom: "Bases de données annuelles des accidents corporels de la circulation routière",
  organisme: "Ministère de l'Intérieur, Observatoire national interministériel de la sécurité routière (ONISR)",
  licence: "Licence Ouverte 2.0",
  attribution: "Ministère de l'Intérieur, ONISR, fichier national des accidents corporels (BAAC)",
  url: data.page,
};
