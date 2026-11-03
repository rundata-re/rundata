/**
 * The speed limits on the routes nationales (src/vie/vitesses.json, scripts/build-vitesses.py), for the layer of /carte:
 * the Système d'Information Routier of the Région Réunion, updated in August 2024, each piece its route, its speed and
 * the year it was last changed. Never a speed of today: the signs on the spot and the works' limits come first.
 * Bundled: no read at all.
 */
import { decode } from "../providers/traces.js";
import type { SourceInfo } from "../types.js";
import data from "./vitesses.json" with { type: "json" };

export interface Troncon {
  /** « RN2 », « RN1A ». */
  route: string;
  /** km/h. */
  v: number;
  /** The year it was last changed in the Région's system, when it has one. */
  annee?: number;
  /** Its line (Google's encoding, 5 decimals). */
  ligne: string;
}

export const TRONCONS = data.troncons as Troncon[];
/** The day the list was read from the portal. */
export const LU_LE = data.construit;
/** « 2024-08 », its fiche's last update. */
export const MISE_A_JOUR = data.mise_a_jour;

export const points = (t: Troncon) => decode(t.ligne);

/** Said with the layer, in its legend and its panel (data-run, 03/11). */
export const RELEVE = "Limitations relevées par la Région, mise à jour d'août 2024 : les panneaux sur place et les zones de travaux font foi.";

export const SOURCE: SourceInfo = {
  id: "region_vitesses_rn",
  nom: "Les limitations de vitesse sur les routes nationales de La Réunion",
  organisme: "Région Réunion",
  licence: "Licence Ouverte (Etalab)",
  attribution: "Région Réunion",
  url: data.page,
};
