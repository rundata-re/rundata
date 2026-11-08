/**
 * Sea surface temperature measured by satellite: NOAA ACSPO L3S-LEO, daily, 0.02° (~2 km). Real radiometer readings
 * gridded per day, not an interpolated analysis: cloudy pixels are simply missing. A day is published the next morning
 * (UTC). Only pixels with GHRSST quality level 5 ("best") are kept.
 *
 * Read from /pub/ of CoastWatch, which its robots.txt allows (/thredds/ and /erddap/ are refused to all robots): one
 * NetCDF-4 file of about 420 Mo a day, of which only the chunks of the island are read, by ranges (hdf5.ts). One range
 * each time the scheduled event builds the satellites' copy, so that CoastWatch is never asked more than once a minute
 * (its robots.txt asks 10 s): a day takes about ten of them, its reading kept in KV between two.
 */
import type { Cache, Cached } from "../cache.js";
import { distanceKm } from "../geo.js";
import { type Kept, ReadsSpent, region, resumable, variable } from "../hdf5.js";
import { getBytes } from "../http.js";
import { type SourceInfo, why } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "acspo",
  nom: "Température de surface de la mer par satellite (NOAA ACSPO L3S)",
  organisme: "NOAA CoastWatch / NESDIS STAR",
  licence: "Domaine public (NOAA)",
  attribution: "NOAA CoastWatch, ACSPO L3S-LEO SST",
  url: "https://coastwatch.noaa.gov/cwn/products/acspo-global-002o-gridded-super-collated-sst-and-thermal-fronts-low-earth-orbiting.html",
};

const DAYS = 4;
/** One range at most, and the reading kept in KV: its read and its write. */
export const COST = 3;
// A range comes in a few seconds, the island's chunk (about 5 Mo) in a few more; a stuck server must not hold the
// scheduled event.
const TIMEOUT_MS = 20_000;
/** The days read and the one being read, kept in KV across deploys (cache.ts `keep`). */
export const KEY = "acspo:l3s";
/** A day the server did not have yet is asked again after this. */
const RETRY_MS = 30 * 60_000;

const BASE = "https://coastwatch.noaa.gov/pub/socd2/coastwatch/sst/nrt/l3s/leo/daily";
const FILE = "120000-STAR-L3S_GHRSST-SSTsubskin-LEO_Daily-ACSPO_V2.81-v02.0-fv01.0.nc";
// The island with 0.1° around it, on the global grid of 0.02°: rows from 89.99° N southwards, columns from 179.99° W
// eastwards.
const BOX = { latMax: -20.75, latMin: -21.5, lonMin: 55.1, lonMax: 56.0 };
const row = (lat: number) => Math.round((89.99 - lat) / 0.02);
const col = (lon: number) => Math.round((lon + 179.99) / 0.02);
const R0 = row(BOX.latMax);
const R1 = row(BOX.latMin) + 1;
const C0 = col(BOX.lonMin);
const C1 = col(BOX.lonMax) + 1;

/** The file of the day `date` (YYYY-MM-DD). */
export function dayUrl(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const doy = Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `${BASE}/${d.getUTCFullYear()}/${String(doy).padStart(3, "0")}/${date.replace(/-/g, "")}${FILE}`;
}

/** One day of valid pixels: [lon, lat, °C]. JSON-friendly so that any cache store can keep it. */
export interface SstDay {
  date: string;
  pixels: [number, number, number][];
}

/** ERDDAP CSV (header, units line, rows) to days of valid pixels. `variable` names the temperature column. */
export function parseCsv(csv: string, variable = "sea_surface_temperature"): SstDay[] {
  const days = new Map<string, SstDay>();
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const col = (name: string) => header.indexOf(name);
  const [it, ilat, ilon, isst, iql] = ["time", "latitude", "longitude", variable, "quality_level"].map(col);
  for (const line of lines.slice(2)) {
    const f = line.split(",");
    const sst = parseFloat(f[isst]);
    if (Number.isNaN(sst)) continue;
    if (iql >= 0 && f[iql] !== "5") continue;
    const date = f[it].slice(0, 10);
    if (!days.has(date)) days.set(date, { date, pixels: [] });
    days.get(date)!.pixels.push([parseFloat(f[ilon]), parseFloat(f[ilat]), sst]);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export interface SstReading {
  date: string;
  valeur: number;
  lon: number;
  lat: number;
  distance_km: number;
  /** Valid pixels averaged (the nearest ones, within 2 km of the nearest). */
  pixels: number;
}

/**
 * Most recent day with a clear pixel within `maxKm` of the point. Averages the pixels that are about as close
 * as the nearest one, which smooths the 0.01 °C noise without mixing in water from further offshore.
 */
export function nearest(days: SstDay[], lon: number, lat: number, maxKm = 12): SstReading | null {
  for (const day of days) {
    const near = day.pixels
      .map(([plon, plat, v]) => ({ plon, plat, v, d: distanceKm(lon, lat, plon, plat) }))
      .filter((p) => p.d <= maxKm)
      .sort((a, b) => a.d - b.d);
    if (near.length === 0) continue;
    const group = near.filter((p) => p.d <= near[0].d + 2);
    const mean = group.reduce((s, p) => s + p.v, 0) / group.length;
    return {
      date: day.date,
      valeur: Math.round(mean * 10) / 10,
      lon: near[0].plon,
      lat: near[0].plat,
      distance_km: Math.round(near[0].d * 10) / 10,
      pixels: group.length,
    };
  }
  return null;
}

/** The newest day the server should have at `now`: a day is published the next morning, before 06:00 UTC. */
export const due = (now: Date) => new Date(now.getTime() - 30 * 3600_000).toISOString().slice(0, 10);

/** The days read, newest first, and the day being read: the ranges kept, the temperatures once read, the last try. */
export interface L3s {
  jours: SstDay[];
  lecture?: { date: string; plages: Kept[]; sst?: number[]; essai?: number };
}

/** The island's pixels of a day from its temperatures and quality levels, row after row over the box. */
function pixelsOf(sst: ArrayLike<number>, ql: ArrayLike<number>): SstDay["pixels"] {
  const width = C1 - C0;
  const out: SstDay["pixels"] = [];
  for (let i = 0; i < sst.length; i++) {
    if (sst[i] === -32768 || ql[i] !== 5) continue;
    const lat = Math.round((89.99 - 0.02 * (R0 + Math.floor(i / width))) * 100) / 100;
    const lon = Math.round((-179.99 + 0.02 * (C0 + (i % width))) * 100) / 100;
    out.push([lon, lat, sst[i] / 100]);
  }
  return out;
}

/**
 * One step of the reading of the day `due` when it is not among the days read: at most one range asked. The day comes
 * once its temperatures and its quality levels are read, the temperature stored in hundredths of a degree above 0 °C
 * (scale 0.01, offset 273.15 K), -32768 where there is none.
 */
export async function step(state: L3s, now = new Date()): Promise<L3s> {
  const date = due(now);
  if ((state.jours[0]?.date ?? "") >= date) return state;
  const lecture = state.lecture?.date === date ? { ...state.lecture, plages: [...state.lecture.plages] } : { date, plages: [] };
  if (lecture.essai != null && now.getTime() - lecture.essai < RETRY_MS) return state;
  const read = resumable(lecture.plages, async (o, l) => new Uint8Array(await getBytes(SOURCE.id, dayUrl(date), TIMEOUT_MS, { Range: `bytes=${o}-${o + l - 1}` })));
  try {
    lecture.sst ??= [...(await region(read, await variable(read, "sea_surface_temperature"), R0, R1, C0, C1, -32768))];
    const ql = await region(read, await variable(read, "quality_level"), R0, R1, C0, C1, -128);
    const day = { date, pixels: pixelsOf(lecture.sst, ql) };
    return { jours: [day, ...state.jours.filter((d) => d.date < date)].slice(0, DAYS) };
  } catch (err) {
    if (err instanceof ReadsSpent) return { ...state, lecture: { ...lecture, essai: undefined } };
    // Not posted yet (404) is the usual case before the morning (UTC): asked again after RETRY_MS.
    console.log(`source acspo : jour ${date} pas lu:`, why(err));
    return { ...state, lecture: { ...lecture, essai: now.getTime() } };
  }
}

/**
 * The days read, newest first, after one more step of the reading of the day due (`step`): none yet while the first is
 * being read, `enCours` saying so; fails when none was ever read and none is being read. Their state is kept in KV, the
 * scheduled event's isolates sharing nothing else.
 */
export async function grid(cache: Cache, now = new Date()): Promise<Cached<SstDay[]> & { enCours?: boolean }> {
  const kept = await cache.kept<L3s>(KEY).catch(() => undefined);
  const before = kept?.value?.jours ? kept.value : { jours: [] };
  const after = await step(before, now);
  if (after !== before) await cache.keep(KEY, after).catch((err) => console.error("source acspo : lecture non gardée:", why(err)));
  const enCours = !!after.lecture && !after.lecture.essai;
  if (!after.jours.length && !enCours) throw new Error("source acspo : aucun jour lu");
  const read = after === before ? (kept?.fetchedAt ?? now) : now;
  return { value: after.jours, fetchedAt: read, stale: false, ...(enCours ? { enCours: true } : {}) };
}
