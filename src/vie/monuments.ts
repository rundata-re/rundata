/**
 * The historic monuments of the island (src/vie/monuments.json, scripts/build-monuments.py): the buildings protected as
 * historic monuments, classé or inscrit, from the base Mérimée of the Ministère de la Culture, its list for all of
 * France updated once a week. A few protections change in a year: read again by hand. Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./monuments.json" with { type: "json" };

export interface Monument {
  /** Its reference in the base Mérimée, « PA00105809 »: its notice is POP's page of that name. */
  ref: string;
  nom: string;
  /** Its communes, by INSEE code: two for a monument on their limit (the lazarets of La Grande Chaloupe). */
  insee: string[];
  adresse?: string;
  /** Classé when any part of it is, the higher protection. */
  protection: "classé" | "inscrit";
  /** Only part of it protected (its façades, its roofs…), as its decree says. */
  partiel?: true;
  /** The centuries of its building, « 18e », « 19e ». */
  siecles?: string[];
  /** Its point, when the base has one (all but two). */
  lon?: number;
  lat?: number;
}

export const MONUMENTS = data.monuments as Monument[];
/** The day of the ministry's file, « 2026-10-29 ». */
export const FICHIER_DU = data.fichier_du;

/** Its notice on POP, the ministry's platform of the heritage bases. */
export const notice = (m: Monument) => `https://pop.culture.gouv.fr/notice/merimee/${m.ref}`;

/** The commune's monuments, by name. */
export function ofCommune(nom: string): Monument[] {
  const insee = INSEE[nom];
  return MONUMENTS.filter((m) => m.insee.includes(insee)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Its communes, by name. */
export const communes = (m: Monument) => m.insee.map((c) => Object.keys(INSEE).find((n) => INSEE[n] === c) ?? c);

/** Its communes but this one: « La Possession » for the lazarets seen from Saint-Denis. */
export const autres = (m: Monument, nom: string) => communes(m).filter((n) => n !== nom);

/** « classé », « inscrit en partie », then « 18e et 19e s. ». */
export function protege(m: Monument): string {
  const s = m.siecles?.length ? `${m.siecles.length > 1 ? `${m.siecles.slice(0, -1).join(", ")} et ${m.siecles.at(-1)}` : m.siecles[0]}\u00a0s.` : "";
  return [`${m.protection}${m.partiel ? " en partie" : ""}`, s].filter(Boolean).join(" · ");
}

export const SOURCE: SourceInfo = {
  id: "merimee_monuments",
  nom: "Immeubles protégés au titre des Monuments historiques (base Mérimée)",
  organisme: "Ministère de la Culture",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Ministère de la Culture, base Mérimée",
  url: data.page,
};
