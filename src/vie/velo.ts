/**
 * The bike lanes and racks of La Réunion (src/vie/velo.json, scripts/build-velo.py), for the layer « Vélo » of /carte:
 * the Voie vélo régionale's pieces built, as the Région Réunion gives their state; the lanes of the Ville de Saint-Denis
 * (February 2023) that do not lie under it; the bike racks of the CIVIS. Three lists of the Licence Ouverte, none of
 * which says the state of a lane on the day: what they give is said as theirs, never a lane said usable. Bundled: no
 * read at all.
 */
import { communeAt } from "../places/resolve.js";
import { decode } from "../providers/traces.js";
import type { SourceInfo } from "../types.js";
import data from "./velo.json" with { type: "json" };
import { particules } from "../noms.js";

export type Liste = "region" | "saint-denis" | "civis";

export interface Voie {
  s: "region" | "saint-denis";
  /** As its list gives it: « Bande cyclable », « Voie verte », « Accotement multifonctions »… */
  type: string;
  /** The Région's: the year it was opened, when the list has one. */
  annee?: number;
  /** The Région's « Requalification »: it does not say if done, planned or under way. */
  requalification?: true;
  /** Saint-Denis's: its name, its way, « provisoire » when the Ville says so. */
  nom?: string;
  sens?: string;
  provisoire?: true;
  /** Polylines (Google's encoding, 5 decimals), the longest first. */
  lignes: string[];
}

export interface Accroche {
  /** The place's name, when the list gives it whole. */
  nom?: string;
  /** How many racks. */
  n: number;
  lon: number;
  lat: number;
}

export const VOIES = (data.voies as Voie[]).map((v) => (v.nom ? { ...v, nom: particules(v.nom) } : v));
/** The racks, their places' names as French writes them (noms.ts: « Église des Avirons »), as the lanes'. */
export const ACCROCHES = (data.accroches as Accroche[]).map((a) => (a.nom ? { ...a, nom: particules(a.nom) } : a));
/** The day the lists were read from the portal. */
export const LU_LE = data.construit;
/** The Région's list's day, Saint-Denis's export's. */
export const REGION_DU = data.sources.region.liste_du;
export const SAINT_DENIS_DU = data.sources["saint-denis"].export_du;

export const points = (v: Voie) => decode(v.lignes[0]);
/** Its middle, the middle of its longest piece. */
export const milieu = (v: Voie) => {
  const p = points(v);
  return p[Math.floor(p.length / 2)];
};
/** Its commune, where its middle is. */
export const communeOf = (v: Voie) => communeAt(...milieu(v));

/** Said with the layer, in its legend and its panel (data-run, 03/11). */
export const RECENSE =
  "Aménagements recensés par la Région (liste du 31/12/2025), la Ville de Saint-Denis (février 2023) et la CIVIS (sans date) : la carte ne dit pas leur état ce jour. Accroches vélo : la CIVIS seulement.";

const LO = "Licence Ouverte (Etalab)";
const PAGES = data.sources;
export const SOURCES: Record<Liste, SourceInfo> = {
  region: { id: "region_voie_velo", nom: "Voie vélo régionale", organisme: "Région Réunion", licence: LO, attribution: "Région Réunion", url: PAGES.region.page },
  "saint-denis": {
    id: "saint_denis_pistes_cyclables", nom: "Les pistes et bandes cyclables de la Ville de Saint-Denis", organisme: "Ville de Saint-Denis", licence: LO, attribution: "Ville de Saint-Denis",
    url: PAGES["saint-denis"].page,
  },
  civis: { id: "civis_accroches_velo", nom: "Localisation des accroches vélo de la CIVIS", organisme: "CIVIS", licence: LO, attribution: "CIVIS", url: PAGES.civis.page },
};
/** The layer's, its three lists under the same licence: each object names its own. */
export const SOURCE: SourceInfo = {
  id: "velo_carte", nom: "Aménagements cyclables et accroches vélo", organisme: "Région Réunion, Ville de Saint-Denis, CIVIS", licence: LO,
  attribution: "Région Réunion, Ville de Saint-Denis, CIVIS", url: PAGES.region.page,
};
