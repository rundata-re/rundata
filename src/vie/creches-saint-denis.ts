/**
 * The crèches and the other places for the children under 3 of Saint-Denis (src/vie/creches-saint-denis.json,
 * scripts/build-creches-saint-denis.py): the list the commune's CCAS publishes under the Licence Ouverte, an extraction
 * of July 2023. Always said with its date (`QUAND`) and with « vérifiez l'accueil auprès de la crèche »: a crèche may
 * have closed, moved or changed its places since. Those not open in 2023 (works, « ouverture prochaine ») are left out.
 * The only commune with such a list: the others' crèches are on monenfant.fr, which does not allow their reuse.
 * Bundled: no read at all.
 */
import { distanceKm } from "../geo.js";
import type { SourceInfo } from "../types.js";
import data from "./creches-saint-denis.json" with { type: "json" };

export interface Creche {
  nom: string;
  /** « micro-crèche », « crèche collective », « multi-accueil », « halte-garderie », « jardin d'enfants »… */
  categorie: string;
  /** « associative », « privée » or « municipale ». */
  gestion: string;
  /** Its places in 2023; none for a place of meeting (the relais, the lieu d'accueil enfants-parents). */
  places: number | null;
  adresse: string;
  lon: number;
  lat: number;
  /** The year it opened, when the list says it opened that year (2023). */
  ouvert_en?: number;
}

export const COMMUNE = "Saint-Denis";
export const LISTE: readonly Creche[] = data.lieux as Creche[];
/** The day of the CCAS's extraction, « 2023-07-11 ». */
export const EXTRACTION = data.extraction;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « juillet 2023 ». */
export const QUAND = `${MOIS[Number(EXTRACTION.slice(5, 7)) - 1]} ${EXTRACTION.slice(0, 4)}`;
/** What the list is, said before it, on the page and in the answer. */
export const LISTE_DU = `liste du CCAS de Saint-Denis, ${QUAND}`;
export const VERIFIER = "Vérifiez l'accueil auprès de la crèche.";

/** The masculine of each word said of a place, for a masculine kind (`MASCULINS`): the list's kinds are mostly « crèche ». */
const AU_MASCULIN: Record<string, string> = { associative: "associatif", privée: "privé", municipale: "municipal", ouverte: "ouvert" };
/** The kinds of the list that are masculine: « un multi-accueil », « un jardin d'enfants », « un lieu d'accueil ». */
const MASCULINS = new Set(["multi-accueil", "jardin d'enfants", "lieu d'accueil", "lieu d'accueil enfants-parents"]);
/** `feminin` (« associative », « ouverte ») agreed with the kind `categorie`. */
const accorde = (categorie: string, feminin: string) => (MASCULINS.has(categorie) ? (AU_MASCULIN[feminin] ?? feminin) : feminin);

/** « micro-crèche associative · 10 places · ouverte en 2023 », « multi-accueil associatif · 15 places ». */
export function detail(c: Creche): string {
  const kind = c.categorie.startsWith("lieu d'accueil") || c.categorie === "jardin d'enfants" ? c.categorie : `${c.categorie} ${accorde(c.categorie, c.gestion)}`;
  const ouvert = c.ouvert_en ? `${accorde(c.categorie, "ouverte")} en ${c.ouvert_en}` : undefined;
  return [kind, c.places ? `${c.places} places` : undefined, ouvert].filter(Boolean).join(" · ");
}

/** The `n` nearest to a point, with their distance. */
export const nearest = (lon: number, lat: number, n: number): (Creche & { km: number })[] =>
  LISTE.map((c) => ({ ...c, km: distanceKm(lon, lat, c.lon, c.lat) })).sort((a, b) => a.km - b.km).slice(0, n);

export const SOURCE: SourceInfo = {
  id: "ccas_saint_denis_eaje",
  nom: "Les établissements d'accueil des jeunes enfants de la Ville de Saint-Denis",
  organisme: "Centre communal d'action sociale (CCAS) de Saint-Denis",
  licence: "Licence Ouverte (Etalab)",
  attribution: `CCAS de Saint-Denis, data.regionreunion.com, extraction de ${QUAND}`,
  url: data.page,
};
