/**
 * The risk of coral bleaching, from NOAA Coral Reef Watch's daily 5 km grid (dhw_5km, version 3.1), on PacIOOS's
 * ERDDAP mirror: the HotSpot (CRW_HOTSPOT, °C above the mean of the warmest month), the degree heating weeks (CRW_DHW,
 * °C-weeks: that heat, from 1 °C up, accumulated over 12 weeks) and the sea surface temperature they are computed from
 * (CRW_SST). A heat index of the sea, computed from satellites, not a look at the corals. One value a day, dated 12:00
 * UTC, published about 2 days later.
 *
 * The level is NOAA's bleaching alert on its scale of 0 to 7 (December 2023), the highest of the last 7 days, the
 * product NOAA puts forward: one day's level « does not consistently and adequately identify potentially harmful heat
 * stress ». The mirror has only the old scale of 0 to 4 (CRW_BAA): the level is computed from HotSpot and DHW, by
 * NOAA's table (`niveauDuJour`). Capped at 4, it gives PacIOOS's CRW_BAA_7D_MAX on every cell with a value, 05/04 to
 * 11/04/2025.
 *
 * Public domain from 2002 on (« available for use without restriction », crediting NOAA Coral Reef Watch). Its years
 * before 2002 come from the Met Office's OSTIA, for academic research only: only the last days are ever asked (`last`).
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

// The island's box, northernmost latitude first (ERDDAP's order for this grid): 195 cells a day. `last-9:last` is the
// last 10 days present, not of the calendar: the mirror misses some (30 and 31/10/2026), so 10 are asked and the days
// within 7 of the last kept (`parse`). About 100 KB, one request.
const BOX = "%5Blast-9:last%5D%5B(-20.825):(-21.425)%5D%5B(55.175):(55.875)%5D";
export const CSV_URL = `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.csv?CRW_HOTSPOT${BOX},CRW_DHW${BOX},CRW_SST${BOX}`;
// A new day once a day: read at most once a day, by a question or a view of /mer, and kept in KV for every data
// center.
const FRESH_SECONDS = 24 * 3600;
// A view of /mer waits for it when no data center has it yet: ERDDAP answers in a second or two.
const TIMEOUT_MS = 8_000;

// NOAA's levels, 0 to 7 (methodology, updated in December 2023), in the words data-run validated on 07/11/2026.
export const NIVEAUX = [
  "Pas de stress thermique",
  "Veille",
  "Avertissement\u00a0: risque de blanchissement",
  "Alerte niveau 1\u00a0: risque de blanchissement de tout le récif",
  "Alerte niveau 2\u00a0: risque de blanchissement du récif et de mortalité des coraux les plus sensibles à la chaleur",
  "Alerte niveau 3\u00a0: risque de mortalité de plusieurs espèces",
  "Alerte niveau 4\u00a0: risque de mortalité sévère de plusieurs espèces (plus de 50\u00a0% des coraux)",
  "Alerte niveau 5\u00a0: risque de mortalité presque complète (plus de 80\u00a0% des coraux)",
];

// Marketing's words (31/10/2026), the same on /mer and in temperature_mer.
export const TITRE = "Coraux\u00a0: risque de blanchissement";
export const CASE = "Chaque point est une case de 5\u00a0km de côté de la grille de NOAA, pas une mesure sur le récif.";
export const PAS_OBSERVATION = "C'est un indice de chaleur de la mer, pas une observation des coraux\u00a0: le blanchissement se constate sur place.";
export const AIDE_CHALEUR =
  "La chaleur accumulée compte de combien, et pendant combien de semaines sur les 12 dernières, la mer a dépassé d'au moins 1\u00a0°C la moyenne de son mois le plus chaud. " +
  "Selon NOAA, si la mer dépasse encore ce seuil\u00a0: à partir de 4\u00a0°C-semaines, risque de blanchissement de tout le récif\u00a0; " +
  "à partir de 8, risque de mortalité des coraux les plus sensibles à la chaleur\u00a0; à partir de 12, risque de mortalité de plusieurs espèces\u00a0; " +
  "à partir de 16, risque de mortalité sévère de plusieurs espèces (plus de 50\u00a0% des coraux)\u00a0; à partir de 20, risque de mortalité presque complète (plus de 80\u00a0% des coraux).";
export const CREDIT = "NOAA Coral Reef Watch (domaine public)";

const SELON = "selon NOAA Coral Reef Watch";
const ESTIMATION = " (estimation par satellite, pas une observation sur le récif)";
/**
 * What the level is: the highest of the last 7 days, or of the `jours` days of them the source has. `estimation`: false
 * in temperature_mer, whose warnings say it.
 */
export const niveauSur = (jours: number, estimation = true) =>
  `${jours >= 7 ? "maximum des 7 derniers jours" : `maximum des ${jours} jours disponibles sur les 7 derniers (jours manquants chez la source)`}, ${SELON}${estimation ? ESTIMATION : ""}`;

/**
 * A day's level on NOAA's scale of 0 to 7, from that day's HotSpot (°C) and DHW (°C-weeks) at one cell: 0 without
 * HotSpot, 1 (watch) under 1 °C, then from a HotSpot of 1 °C up by the DHW, 2 under 4 and one more every 4 °C-weeks,
 * up to 7 from 20. Null when either is missing.
 */
export function niveauDuJour(hotspot: number | null, dhw: number | null): number | null {
  if (hotspot == null || dhw == null) return null;
  if (hotspot <= 0) return 0;
  if (hotspot < 1) return 1;
  return Math.min(7, 2 + Math.floor(Math.max(0, dhw) / 4));
}

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
  /** NOAA's level, 0 to 7, the highest of the days kept; null when no day has both HotSpot and DHW at the cell. */
  niveau: number | null;
  /** °C-weeks, the last day. */
  dhw: number | null;
  /** °C, the satellites' sea surface temperature of the last day. */
  sst: number | null;
}

export interface Coraux {
  /** The last day of the values, YYYY-MM-DD (12:00 UTC). */
  jour: string;
  /** The days kept, of the 7 up to `jour`: fewer when the source misses some. */
  jours: number;
  points: PointCoraux[];
}

const num = (s: string | undefined) => {
  const v = s == null || s === "" || s === "NaN" ? NaN : Number(s);
  return Number.isFinite(v) ? v : null;
};

const JOUR_MS = 24 * 3600_000;

/**
 * ERDDAP's CSV (names, then units, then one line per cell and day, time first) to the three points: the days within 7
 * of the last one present kept, the level the highest of theirs, the heat and the temperature those of the last day.
 */
export function parse(csv: string): Coraux {
  const lines = csv.trim().split("\n").map((l) => l.trim().split(","));
  const head = lines[0] ?? [];
  const [it, ilat, ilon, ihot, idhw, isst] = ["time", "latitude", "longitude", "CRW_HOTSPOT", "CRW_DHW", "CRW_SST"].map((n) => head.indexOf(n));
  if ([it, ilat, ilon, ihot, idhw, isst].some((i) => i < 0)) throw new Error("dhw_5km : colonnes inattendues");
  const rows = lines.slice(2).map((r) => ({ r, jour: r[it]?.slice(0, 10) ?? "" })).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.jour));
  if (!rows.length) throw new Error("dhw_5km : pas de date");
  const jour = rows.reduce((m, x) => (x.jour > m ? x.jour : m), "");
  const depuis = new Date(Date.parse(`${jour}T00:00:00Z`) - 6 * JOUR_MS).toISOString().slice(0, 10);
  const kept = rows.filter((x) => x.jour >= depuis);
  const at = (lat: number, lon: number) => kept.filter((x) => Math.abs(Number(x.r[ilat]) - lat) < 0.001 && Math.abs(Number(x.r[ilon]) - lon) < 0.001);
  const points = POINTS.map((p) => {
    const days = at(p.lat, p.lon);
    const levels = days.map((x) => niveauDuJour(num(x.r[ihot]), num(x.r[idhw]))).filter((n): n is number => n != null);
    const last = days.find((x) => x.jour === jour)?.r;
    return { ...p, niveau: levels.length ? Math.max(...levels) : null, dhw: num(last?.[idhw]), sst: num(last?.[isst]) };
  });
  if (points.every((p) => p.niveau == null && p.dhw == null)) throw new Error("dhw_5km : aucune valeur aux trois points");
  return { jour, jours: new Set(kept.map((x) => x.jour)).size, points };
}

/** Its own key since the scale of 0 to 7: the copies of « coraux:ile » hold one day's level on the scale of 0 to 4. */
export const KEY = "coraux:ile:7j";

/** The last 7 days, read for the whole island at most once a day, kept in KV. */
export function coraux(cache: Cache): Promise<Cached<Coraux>> {
  return cache.island(KEY, FRESH_SECONDS, async () => parse(await getText(SOURCE.id, CSV_URL, TIMEOUT_MS)));
}
