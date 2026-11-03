/**
 * The mairies annexes and centres municipaux of Saint-Denis (src/vie/mairies-annexes.json, scripts/build-mairies-annexes.py):
 * the Ville's list, each its kind, name, quarter, address and point, for annuaire_services_publics and the page of the
 * commune. The Annuaire de l'administration has only the Hôtel de Ville; the list gives no hours and no phone, which are
 * asked of the Hôtel de Ville. Bundled: no read at all.
 */
import { distanceKm } from "../geo.js";
import type { SourceInfo } from "../types.js";
import data from "./mairies-annexes.json" with { type: "json" };

export interface Lieu {
  /** « Mairie annexe » or « Centre municipal ». */
  nature: string;
  /** As the Ville writes it: « Bois de Nèfles », « Montagne 8ème ». */
  nom: string;
  /** As the Ville writes it, in capitals: « BOIS DE NEFLES ». */
  quartier: string;
  /** Its street as written, its commune spelled out after the postcode when it has one. */
  adresse: string;
  lon: number;
  lat: number;
}

export const COMMUNE = "Saint-Denis";
export const LIEUX = data.lieux as Lieu[];
/** « 2026-07-16 », the export's day in every row. */
export const EXPORT_DU = data.export_du;
/** The day the list was read from the portal. */
export const LU_LE = data.construit;

const [y, mo, d] = EXPORT_DU.split("-");
/** Said with the list, in the tool's answer and on the page (data-run, 03/11). */
export const LISTE = `Liste de la Ville de Saint-Denis (export du ${d}/${mo}/${y}), sans horaires ni téléphone : les demander à l'Hôtel de Ville.`;
export const TITRE = "Mairies annexes et centres municipaux";

/** The places nearest a point, with how far. */
export const nearest = (lon: number, lat: number, n = 3) =>
  LIEUX.map((l) => ({ ...l, km: distanceKm(lon, lat, l.lon, l.lat) })).sort((a, b) => a.km - b.km).slice(0, n);

export const SOURCE: SourceInfo = {
  id: "saint_denis_mairies_annexes",
  nom: "Les mairies annexes de la Ville de Saint-Denis",
  organisme: "Ville de Saint-Denis",
  licence: "Licence Ouverte (Etalab)",
  attribution: "Ville de Saint-Denis",
  url: data.page,
};
