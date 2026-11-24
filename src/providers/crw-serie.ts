/**
 * The sea's temperature of the last 30 days off four beaches, day by day, with its gap to NOAA's reference (REFERENCE):
 * NOAA Coral Reef Watch's daily 5 km analysis (CoralTemp, CRW_SST and CRW_SSTANOMALY of dhw_5km), on PacIOOS's ERDDAP
 * mirror, the grid providers/coraux.ts reads for the corals. A satellite analysis that fills the clouds, not a
 * measurement at a point: a day missing at the source stays missing.
 *
 * One request per beach, for its own cell only (about 1.5 Ko, under 2 s on 24/11/2026), the four at once: the
 * island's box over 30 days took 11 s, too long beside a view. Read at a view of /mer once a day for every data
 * center, kept in KV, never by the scheduled event.
 */
import type { Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import { SOURCE } from "./coraux.js";

export { SOURCE };

export const JOURS = 30;

/**
 * What CRW_SSTANOMALY compares each day to, from NOAA's methodology (coralreefwatch.noaa.gov/product/5km/methodology.php,
 * read 24/11/2026): a climatology of CoralTemp over 1985-2012, brought back to the years 1985-1990 and 1993. An old
 * reference, warmer seas read as a gap above it: never called « la normale ».
 */
export const REFERENCE =
  "L'écart compare chaque jour à la moyenne de référence de NOAA Coral Reef Watch, tirée des années 1985 à 2012 et ramenée aux années 1985 à 1990 et 1993\u00a0: une référence ancienne, qui n'est pas la normale climatique 1991-2020.";
/** The same for the tools, in the fewest words: a tool answer has a size cap (src/bin/check-sources.ts). */
export const REFERENCE_OUTIL = "Écart à la moyenne de référence de NOAA (années 1985 à 1993), ancienne\u00a0: pas la normale climatique 1991-2020.";

/**
 * The beaches, each with the cell of the grid that has a value nearest to it (the cells along the shore are masked):
 * 2 to 2.4 km off each, on the grid of 24/11/2026.
 */
export const POINTS = [
  { nom: "Saint-Gilles", lat: -21.075, lon: 55.225, km: 2.3 },
  { nom: "Saint-Pierre", lat: -21.325, lon: 55.475, km: 2.0 },
  { nom: "Saint-Denis", lat: -20.875, lon: 55.425, km: 2.4 },
  { nom: "Sainte-Rose", lat: -21.125, lon: 55.775, km: 2.1 },
] as const;

export const KEY = "mer:crw30";
const FRESH_SECONDS = 24 * 3600;
const TIMEOUT_MS = 8_000;
/** The four requests, the read and the write of the copy. */
export const COST = POINTS.length + 2;

export const urlOf = (p: { lat: number; lon: number }) => {
  const at = `%5Blast-${JOURS - 1}:last%5D%5B(${p.lat}):(${p.lat})%5D%5B(${p.lon}):(${p.lon})%5D`;
  return `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.csv?CRW_SST${at},CRW_SSTANOMALY${at}`;
};

export interface SeriePoint {
  nom: string;
  lat: number;
  lon: number;
  km: number;
  /** °C, one a day of `jours`; null when the source has none. */
  sst: (number | null)[];
  /** °C above (or under) NOAA's reference for that day (REFERENCE). */
  ecart: (number | null)[];
}

export interface SerieMer {
  /** The days, YYYY-MM-DD (12:00 UTC), every day from the first to the last one any point has. */
  jours: string[];
  points: SeriePoint[];
}

const num = (s: string | undefined) => {
  const v = s == null || s === "" || s === "NaN" ? NaN : Number(s);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};

/** One beach's CSV: its days with their temperature and gap. */
export function parsePoint(csv: string): Map<string, [number | null, number | null]> {
  const lines = csv.trim().split("\n").map((l) => l.trim().split(","));
  const head = lines[0] ?? [];
  const [it, isst, iano] = ["time", "CRW_SST", "CRW_SSTANOMALY"].map((n) => head.indexOf(n));
  if ([it, isst, iano].some((i) => i < 0)) throw new Error("dhw_5km : colonnes inattendues");
  const out = new Map<string, [number | null, number | null]>();
  for (const r of lines.slice(2)) {
    const jour = r[it]?.slice(0, 10) ?? "";
    if (/^\d{4}-\d\d-\d\d$/.test(jour)) out.set(jour, [num(r[isst]), num(r[iano])]);
  }
  return out;
}

/** The four beaches' days on one calendar: a day the source misses is a hole, never a value carried over. */
export function assemble(per: Map<string, [number | null, number | null]>[]): SerieMer {
  const known = per.flatMap((m) => [...m.keys()]).sort();
  if (!known.length) throw new Error("dhw_5km : pas de jour");
  const jours: string[] = [];
  for (let t = Date.parse(`${known[0]}T00:00:00Z`); t <= Date.parse(`${known[known.length - 1]}T00:00:00Z`); t += 86_400_000) jours.push(new Date(t).toISOString().slice(0, 10));
  return {
    jours,
    points: POINTS.map((p, i) => ({ ...p, sst: jours.map((j) => per[i]?.get(j)?.[0] ?? null), ecart: jours.map((j) => per[i]?.get(j)?.[1] ?? null) })),
  };
}

/**
 * The four beaches, at most once a day for the whole island: the four small requests at once, so that a question waits
 * for one of them (TIMEOUT_MS at most), not four in a row; a beach that fails is left empty, the others kept.
 */
export function serieMer(cache: Cache): Promise<Cached<SerieMer>> {
  return cache.island(KEY, FRESH_SECONDS, async () => {
    const got = await Promise.allSettled(POINTS.map(async (p) => parsePoint(await getText(SOURCE.id, urlOf(p), TIMEOUT_MS))));
    if (got.every((g) => g.status === "rejected")) throw (got[0] as PromiseRejectedResult).reason;
    return assemble(got.map((g) => (g.status === "fulfilled" ? g.value : new Map())));
  });
}
