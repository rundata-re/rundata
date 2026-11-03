/**
 * The places offered to the children under 3 (src/vie/creches.json, scripts/build-creches.py): the Cnaf's open data, by
 * commune, intercommunalité and département, for December of a year. A theoretical offer: a place may be empty, or
 * shared by several children. Only the communes above 10 000 inhabitants have their own figure; the others have their
 * intercommunalité's, never to be read as theirs. Never a crèche's name nor a person: the list is on monenfant.fr,
 * which does not allow its reuse.
 * Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./creches.json" with { type: "json" };

export interface Offre {
  /** Crèche places (EAJE) for 100 children under 3. */
  creche: number;
  /** Places of every formal care together for 100 children under 3: crèches, assistantes maternelles, at home, school. */
  global: number;
  places_creche: number;
  places: number;
}

export interface Epci extends Offre {
  siren: string;
  /** As said, with its article: « la CIVIS », « le TCO ». */
  nom: string;
  /** Its communes, by INSEE code. */
  communes: string[];
}

/** The year the figures are of (December). */
export const ANNEE = data.annee;
/** The day the Cnaf put it online, « 2026-01-22 ». */
export const PUBLIE_LE = data.publie_le;
export const ILE = data.ile as Offre;
const COMMUNES = data.communes as Record<string, Offre>;
const EPCI = data.epci as Epci[];

/** The commune's own figure; none below 10 000 inhabitants. */
export const ofCommune = (nom: string): Offre | undefined => COMMUNES[INSEE[nom]];
/** The intercommunalité the commune is in. */
export const epciOf = (nom: string): Epci | undefined => EPCI.find((e) => e.communes.includes(INSEE[nom]));

/** The intercommunalité's communes, by name. */
export const nomsDe = (e: Epci): string[] => e.communes.map((code) => Object.keys(INSEE).find((nom) => INSEE[nom] === code)!);
/** The communes with a figure, by name. */
export const communes = (): [string, Offre][] =>
  Object.entries(INSEE).filter(([, code]) => COMMUNES[code]).map(([nom, code]) => [nom, COMMUNES[code]] as [string, Offre]).sort((a, b) => a[0].localeCompare(b[0], "fr"));
/** The intercommunalités, in the order of the island's tour: north, east, west, south. */
export const intercommunalites = (): Epci[] => EPCI;
/** The communes without a figure, by name. */
export const sansChiffre = (): string[] => Object.keys(INSEE).filter((nom) => !ofCommune(nom)).sort((a, b) => a.localeCompare(b, "fr"));

/** « 29,7 ». */
export const taux = (x: number) => x.toFixed(1).replace(".", ",");

export const SOURCE: SourceInfo = {
  id: "caf_accueil_jeune_enfant",
  nom: "Taux de couverture d'accueil du jeune enfant et places offertes aux enfants de moins de 3 ans",
  organisme: "Caisse nationale des Allocations familiales (Cnaf)",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Cnaf, data.caf.fr",
  url: data.page,
};
