/**
 * The canyons of the Parc national de La Réunion's inventory (src/vie/canyons.json, scripts/build-canyons.py): 214 lines,
 * each its name, its length, in the cœur of the Parc or not, those the inventory marks forbidden with the text it gives,
 * and the ONF trails each runs along. The inventory has no date and its texts are of 1994 and 1997: a ban it gives is
 * said as given by it, never as a fact of today, and a canyon it does not ban is never said allowed. The ONF's state is
 * read live, of the trails it runs along only. Bundled: no read at all.
 */
import { communeAt } from "../places/resolve.js";
import type { Sentier } from "../providers/sentiers.js";
import { decode } from "../providers/traces.js";
import type { SourceInfo } from "../types.js";
import data from "./canyons.json" with { type: "json" };

export interface Canyon {
  id: string;
  nom: string;
  /** Its length along its line, as the inventory gives it. */
  km: number;
  /** In the cœur of the Parc national. */
  coeur: boolean;
  /** Marked forbidden in the inventory: the text it gives, cleaned (« arrêté préfectoral de 1997 (captage d'eau) »). */
  interdit?: string;
  /** « soumis à autorisation » in the inventory, without the mark. */
  autorisation?: true;
  /** The ONF trails it runs along, by their name on the ONF's map. */
  sentiers_onf: string[];
  /** Polylines (Google's encoding, 5 decimals), the longest first. */
  lignes: string[];
}

export const CANYONS = data.canyons as Canyon[];
/** The day the inventory was read from the portal. */
export const LU_LE = data.construit;

export const points = (c: Canyon) => decode(c.lignes[0]);
/** Its middle, the middle of its longest piece. */
export const milieu = (c: Canyon) => {
  const p = points(c);
  return p[Math.floor(p.length / 2)];
};

const COMMUNES = new Map(CANYONS.map((c) => [c.id, communeAt(...milieu(c))]));
/** Its commune, where its middle is. */
export const communeOf = (c: Canyon) => COMMUNES.get(c.id)!;

/** « 1,4 km ». */
export const longueur = (c: Canyon) => `${String(c.km).replace(".", ",")} km`;

// Said with them, in the tool as on /carte (data-run, 03/11).
export const RECENSE = "canyon recensé par le Parc national, inventaire sans date";
export const SECURITE = "Jamais de canyon par temps de pluie ou de vigilance : l'eau monte vite.";
export const AUTORISE = "L'inventaire ne dit pas si un canyon est autorisé : une interdiction a pu être levée, ou décidée depuis.";

/** What the inventory says of it, as said: « Signalé interdit dans l'inventaire du Parc national (sans date) : … ». */
export const signalement = (c: Canyon) =>
  c.interdit
    ? `Signalé interdit dans l'inventaire du Parc national (sans date) : ${c.interdit}.`
    : c.autorisation
      ? "Soumis à autorisation d'après l'inventaire."
      : undefined;

/** The ONF trails it runs along that the ONF closes, from its map, with the cause it gives. */
export const fermes = (c: Canyon, onf: Pick<Sentier, "nom" | "statut" | "cause" | "info">[]) =>
  c.sentiers_onf.flatMap((nom) => onf.filter((s) => s.nom === nom && s.statut === "fermé").slice(0, 1).map((s) => ({ sentier: nom, cause: s.cause, info: s.info })));

export const SOURCE: SourceInfo = {
  id: "parc_national_canyons",
  nom: "Inventaire des canyons de La Réunion",
  organisme: "Parc national de La Réunion",
  licence: "Licence Ouverte (Etalab)",
  attribution: "Parc national de La Réunion",
  url: data.page,
};
