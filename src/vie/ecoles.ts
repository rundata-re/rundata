/**
 * The schools, collèges and lycées of La Réunion (src/vie/ecoles.json, scripts/build-ecoles.py), from the Éducation
 * nationale's directory: for each, public or private, its address and position, its phone and site, and the services
 * the directory declares (canteen, boarding, ULIS, SEGPA). A service the directory leaves blank is not said « non ».
 */
import type { SourceInfo } from "../types.js";
import data from "./ecoles.json" with { type: "json" };

export type Kind = "ecole" | "college" | "lycee";

export interface Etablissement {
  /** The UAI code, the key of the ministry's other datasets. */
  uai: string;
  nom: string;
  type: Kind;
  commune: string;
  /** A school's levels. */
  niveau?: "maternelle" | "élémentaire" | "maternelle et élémentaire";
  prive?: boolean;
  adresse: string;
  lon: number;
  lat: number;
  tel?: string;
  web?: string;
  /** Its sheet on onisep.fr (collèges and lycées). */
  onisep?: string;
  cantine?: boolean;
  internat?: boolean;
  ulis?: boolean;
  segpa?: boolean;
  section_sport?: boolean;
  rep?: "REP" | "REP+";
}

/** The day the bundled list was rebuilt, and the newest row of the directory then. */
export const BUILT: string = data.construit;
export const UPDATED: string = data.mis_a_jour;
export const LIST = data.etablissements as Etablissement[];

export const SOURCE: SourceInfo = {
  id: "annuaire_education",
  nom: "Annuaire de l'éducation du ministère de l'Éducation nationale",
  organisme: "Ministère de l'Éducation nationale",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Annuaire de l'éducation (ministère de l'Éducation nationale)",
  url: "https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/",
};

/** Each kind's words, one and several, in the page's order. */
export const KINDS: { type: Kind; un: string; court: string }[] = [
  { type: "ecole", un: "école", court: "écoles" },
  { type: "college", un: "collège", court: "collèges" },
  { type: "lycee", un: "lycée", court: "lycées" },
];
/** « 1 collège », « 12 écoles ». */
export const counted = (k: Kind, n: number) => `${n} ${n > 1 ? KINDS.find((x) => x.type === k)!.court : KINDS.find((x) => x.type === k)!.un}`;

export const inCommune = (commune: string) => LIST.filter((e) => e.commune === commune);

/** What the directory declares of it, in words: « publique · cantine · ULIS », « privée · cantine · internat ». */
export function services(e: Etablissement): string[] {
  const fem = e.type === "ecole";
  return [
    e.prive ? (fem ? "privée" : "privé") : fem ? "publique" : "public",
    e.niveau,
    e.cantine && "cantine",
    e.internat && "internat",
    e.ulis && "ULIS",
    e.segpa && "SEGPA",
    e.section_sport && "section sportive",
    e.rep && `éducation prioritaire (${e.rep})`,
  ].filter((x): x is string => !!x);
}
