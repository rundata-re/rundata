/**
 * The mayor and the deputy mayors of each commune of La Réunion, from the ministry of the Interior's Répertoire
 * national des élus (src/vie/elus.json, scripts/build-elus.py). Public persons in their office: their name and their
 * office only, never their date of birth, their profession nor a political nuance (24/11/2026, as the elections,
 * vie/elections.ts). Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./elus.json" with { type: "json" };

export interface Personne {
  prenom: string;
  nom: string;
}

export interface Adjoint extends Personne {
  /** 1 for the first deputy mayor. */
  rang: number;
}

export interface Elus {
  maire: Personne;
  adjoints: Adjoint[];
}

export const SOURCE: SourceInfo = {
  id: "repertoire_national_elus",
  nom: "Répertoire national des élus",
  organisme: "Ministère de l'Intérieur",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Répertoire national des élus (ministère de l'Intérieur)",
  url: data.page,
};

/** The day of the ministry's files. */
export const MIS_A_JOUR: string = data.mis_a_jour;

const COMMUNES = data.communes as Record<string, Elus>;

/** A commune's elected officials, by its name as the gazetteer spells it; undefined for a name that is not a commune. */
export function elusDe(commune: string): Elus | undefined {
  const code = INSEE[commune];
  return code ? COMMUNES[code] : undefined;
}

/** « Jeannick ATCHAPA »: the first name, then the surname as the ministry writes it. */
export const nomDe = (p: Personne) => `${p.prenom} ${p.nom}`;

/** « 1er adjoint », « 2e adjoint ». */
export const fonctionDe = (a: Adjoint) => `${a.rang === 1 ? "1er" : `${a.rang}e`} adjoint`;

/** « données du 20/11/2026 ». */
export const DONNEES_DU = `données du ${MIS_A_JOUR.slice(8, 10)}/${MIS_A_JOUR.slice(5, 7)}/${MIS_A_JOUR.slice(0, 4)}`;
