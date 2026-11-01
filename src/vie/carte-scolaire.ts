/**
 * The public collèges' map of sectors (scripts/build-carte-scolaire.py): which collège each street of a commune, or
 * each stretch of it, depends on. Its files are in public/carte-scolaire/, one per commune, loaded by /ecoles in the
 * browser; here, its day, its counts, the file of each commune and the communes with a single sector.
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
