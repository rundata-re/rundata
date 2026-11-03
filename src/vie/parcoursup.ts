/**
 * The formations of La Réunion in Parcoursup, counted by commune (src/vie/parcoursup.json, scripts/build-parcoursup.py):
 * the ministry of Higher education's open data of a session, apprenticeship apart. The list itself is in
 * vie/parcoursup-formations.ts, which /ecoles alone reads. Never the admitted's profile, the candidates per place nor
 * the rank of the last called: they do not compare from one formation to another. Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./parcoursup.json" with { type: "json" };

export interface Compte {
  formations: number;
  /** The formations' places (capacité d'accueil), together. */
  places: number;
  etablissements: number;
}

/** The session, « 2025 ». */
export const SESSION = data.session;
/** The day the session's figures stop, « 2025-09-10 ». */
export const ARRETE_LE = data.arrete_le;
const COMMUNES = data.communes as Record<string, Compte>;

/** A commune's count; zero for a commune with no formation. */
export const ofCommune = (nom: string): Compte | undefined => COMMUNES[INSEE[nom]];

/** « 10/09/2025 ». */
export const jour = (iso: string) => iso.split("-").reverse().join("/");

export const SOURCE: SourceInfo = {
  id: "esr_parcoursup",
  nom: data.titre,
  organisme: "Ministère de l'Enseignement supérieur, de la Recherche et de l'Espace, SIES",
  licence: "Licence Ouverte 2.0",
  attribution: "Parcoursup - Traitement SIES",
  url: data.page,
};
