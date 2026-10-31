/**
 * The risk of coral bleaching, from NOAA Coral Reef Watch's daily 5 km grid (dhw_5km, version 3.1), on PacIOOS's
 * ERDDAP mirror: the bleaching alert area (CRW_BAA, 0 to 4), the degree heating weeks (CRW_DHW, °C-weeks: the heat
 * above the mean of the warmest month, accumulated over 12 weeks) and the sea surface temperature it is computed from
 * (CRW_SST). A heat index of the sea, computed from satellites, not a look at the corals. One value a day, dated 12:00
 * UTC, published about 2 days later.
 *
 * Public domain from 2002 on (« available for use without restriction », crediting NOAA Coral Reef Watch). Its years
 * before 2002 come from the Met Office's OSTIA, for academic research only: only the last day is ever asked (`last`).
 */
import type { Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import type { SourceInfo } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "noaa_crw_dhw_5km",
  nom: "Risque de blanchissement des coraux, grille de 5 km (NOAA Coral Reef Watch)",
  organisme: "NOAA Coral Reef Watch",
  licence: "Domaine public (NOAA)",
  attribution: "NOAA Coral Reef Watch",
  url: "https://coralreefwatch.noaa.gov/product/5km/",
};

/** Three cells of the grid off the coast, each with a value (the cells along the shore are masked). */
export const POINTS = [
  { nom: "Récif de Saint-Gilles et l'Hermitage", lat: -21.075, lon: 55.225 },
  { nom: "au large de Saint-Pierre", lat: -21.375, lon: 55.475 },
  { nom: "au large de Saint-Benoît", lat: -21.125, lon: 55.825 },
];

// The island's box, northernmost latitude first (ERDDAP's order for this grid): 195 cells, about 10 KB, one request.
const BOX = "%5B(last)%5D%5B(-20.825):(-21.425)%5D%5B(55.175):(55.875)%5D";
export const CSV_URL = `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.csv?CRW_BAA${BOX},CRW_DHW${BOX},CRW_SST${BOX}`;
// A new day once a day: read at most once a day, by a question or a view of /mer, and kept in KV for every data
// center.
const FRESH_SECONDS = 24 * 3600;
// A view of /mer waits for it when no data center has it yet: ERDDAP answers in a second or two.
const TIMEOUT_MS = 8_000;

// CRW_BAA's levels in this product (its metadata, read on 31/10/2026); 251 is land or missing.
export const NIVEAUX = [
  "Pas de stress thermique",
  "Veille : la mer est plus chaude que d'habitude",
  "Avertissement : un blanchissement est possible",
  "Alerte niveau 1 : blanchissement important probable",
  "Alerte niveau 2 : blanchissement sévère et mortalité importante probables",
];

// Marketing's words (31/10/2026), the same on /mer and in temperature_mer.
export const TITRE = "Coraux\u00a0: risque de blanchissement";
export const CASE = "Chaque point est une case de 5\u00a0km de côté de la grille de NOAA, pas une mesure sur le récif.";
export const PAS_OBSERVATION = "C'est un indice de chaleur de la mer, pas une observation des coraux\u00a0: le blanchissement se constate sur place.";
export const AIDE_CHALEUR =
  "La chaleur accumulée compte de combien, et pendant combien de semaines, la mer a dépassé d'au moins 1\u00a0°C la moyenne de son mois le plus chaud. " +
  "Selon NOAA, à partir de 4\u00a0°C-semaines un blanchissement important est probable\u00a0; à partir de 8, un blanchissement sévère et une mortalité importante.";
export const CREDIT = "NOAA Coral Reef Watch (domaine public)";

/** « 0,0 °C-semaine », « 4,2 °C-semaines ». */
export const chaleur = (dhw: number) => `${dhw.toFixed(1).replace(".", ",")}\u00a0°C-semaine${dhw >= 2 ? "s" : ""}`;

/** « … le 29/10, publié environ 2 jours après. » */
export function nature(jour: string): string {
  const [, m, d] = jour.split("-");
  return `Indice calculé par NOAA Coral Reef Watch d'après la température de la mer mesurée par satellite le ${d}/${m}, publié environ 2 jours après.`;
}

export interface PointCoraux {
  nom: string;
  lat: number;
  lon: number;
  /** CRW_BAA, 0 to 4; null when the cell has no value or a level this product does not have. */
  niveau: number | null;
  /** °C-weeks. */
  dhw: number | null;
  /** °C, the satellites' sea surface temperature of the day. */
  sst: number | null;
}

export interface Coraux {
  /** The day of the values, YYYY-MM-DD (12:00 UTC). */
  jour: string;
  points: PointCoraux[];
}

const num = (s: string | undefined) => {
  const v = s == null || s === "" || s === "NaN" ? NaN : Number(s);
  return Number.isFinite(v) ? v : null;
};

/** ERDDAP's CSV (names, then units, then one line per cell) to the three points. */
export function parse(csv: string): Coraux {
  const lines = csv.trim().split("\n").map((l) => l.trim().split(","));
  const head = lines[0] ?? [];
  const [it, ilat, ilon, ibaa, idhw, isst] = ["time", "latitude", "longitude", "CRW_BAA", "CRW_DHW", "CRW_SST"].map((n) => head.indexOf(n));
  if ([it, ilat, ilon, ibaa, idhw, isst].some((i) => i < 0)) throw new Error("dhw_5km : colonnes inattendues");
  const rows = lines.slice(2);
  const jour = rows[0]?.[it]?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error("dhw_5km : pas de date");
  const at = (lat: number, lon: number) => rows.find((r) => Math.abs(Number(r[ilat]) - lat) < 0.001 && Math.abs(Number(r[ilon]) - lon) < 0.001);
  const points = POINTS.map((p) => {
    const r = at(p.lat, p.lon);
    const baa = num(r?.[ibaa]);
    return {
      ...p,
      niveau: baa != null && Number.isInteger(baa) && baa >= 0 && baa < NIVEAUX.length ? baa : null,
      dhw: num(r?.[idhw]),
      sst: num(r?.[isst]),
    };
  });
  if (points.every((p) => p.niveau == null && p.dhw == null)) throw new Error("dhw_5km : aucune valeur aux trois points");
  return { jour, points };
}

/** The last day, read for the whole island at most once a day, kept in KV. */
export function coraux(cache: Cache): Promise<Cached<Coraux>> {
  return cache.island("coraux:ile", FRESH_SECONDS, async () => parse(await getText(SOURCE.id, CSV_URL, TIMEOUT_MS)));
}
