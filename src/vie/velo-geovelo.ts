/**
 * The bike lanes of the whole island (src/vie/velo-geovelo.json, scripts/build-geovelo.py), for their own layer of
 * /carte: those mapped in OpenStreetMap, put by Geovelo in the national schema of bike lanes, a list a month on
 * data.gouv.fr. Under the ODbL: a file of its own, never mixed with the Licence Ouverte's lists of the layer « Vélo »
 * (web/couches.ts), and its attribution said wherever it is shown. It does not say the state of a lane on the day: what
 * it gives is said as Geovelo's, never a lane said usable. Bundled: no read at all.
 */
import { decode } from "../providers/traces.js";
import type { SourceInfo } from "../types.js";
import data from "./velo-geovelo.json" with { type: "json" };

export interface VoieGeovelo {
  /** Its sides' types as Geovelo gives them, in French: « Piste cyclable », « Bande cyclable, couloir bus et vélo ». */
  type: string;
  /** Its commune's INSEE code, as Geovelo gives it. */
  commune: string;
  /** One polyline (Google's encoding, 5 decimals): its pieces of the same type that touch, end to end. */
  ligne: string;
}

export const VOIES = data.voies as VoieGeovelo[];
/** The day the list was read from data.gouv.fr. */
export const LU_LE = data.construit;
/** The day of Geovelo's list (its file's). */
export const LISTE_DU = data.source.liste_du;

/** Said with the layer, in its legend and its panel, the licence's attribution last. */
export const RECENSE =
  `Pistes et bandes cyclables de l'île cartographiées dans OpenStreetMap, d'après la liste de Geovelo du ${LISTE_DU.slice(8, 10)}/${LISTE_DU.slice(5, 7)}/${LISTE_DU.slice(0, 4)}\u00a0: la carte ne dit pas leur état ce jour. La Voie vélo régionale, avec ses dates, est dans la couche Vélo. © les contributeurs d'OpenStreetMap, traitement Geovelo, ODbL.`;

export const points = (v: VoieGeovelo) => decode(v.ligne);
/** Its middle. */
export const milieu = (v: VoieGeovelo) => {
  const p = points(v);
  return p[Math.floor(p.length / 2)];
};

export const SOURCE: SourceInfo = {
  id: "geovelo_amenagements_cyclables",
  nom: "Aménagements cyclables Île de la Réunion",
  organisme: "Geovelo, d'après les contributeurs d'OpenStreetMap",
  licence: "ODbL 1.0",
  attribution: "© les contributeurs d'OpenStreetMap, traitement Geovelo",
  url: data.source.page,
  court: "Geovelo",
};
