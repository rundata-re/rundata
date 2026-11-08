/**
 * Sea surface temperature of the satellite's last passes over the island: NOAA ACSPO L3U, VIIRS on NOAA-20, 0.02°
 * (~2 km), one NetCDF-4 file per 10 minutes of orbit (a granule) under /pub/ of CoastWatch, which its robots.txt allows
 * (/thredds/ and /erddap/ are refused to all robots). A granule over La Réunion is posted 35 to 80 minutes after it was
 * measured, where the day's mean (acspo.ts) comes a day and a half later.
 *
 * Read only by the scheduled event (web/partagees.ts), at most one granule each time, so that CoastWatch is never asked
 * more than once a minute (its robots.txt asks 10 s between two reads). Which granules: the island is seen twice a day by
 * NOAA-20, on its way south around 01:40 at La Réunion and on its way north around 14:00, each time from the one or two
 * orbits whose 3 000 km swath reaches it, up to an hour on either side. Once a pass is seen, the next ones are expected a
 * whole number of orbits later, in the same window: a granule or two per orbit instead of the whole window.
 */
import type { Cache } from "../cache.js";
import { distanceKm } from "../geo.js";
import { region, inMemory, variable, type Reader } from "../hdf5.js";
import { getBytes } from "../http.js";
import { type SourceInfo, why } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "viirs",
  nom: "Température de surface de la mer par satellite, passage du satellite (NOAA ACSPO VIIRS L3U)",
  organisme: "NOAA CoastWatch / NESDIS STAR",
  licence: "Domaine public (NOAA)",
  attribution: "NOAA CoastWatch, ACSPO VIIRS L3U SST",
  url: "https://coastwatch.noaa.gov/pub/socd2/coastwatch/sst/nrt/viirs/",
};

/** The shared copy of the passes (web/partagees.ts): the passes seen, and the granules asked. */
export const KEY = "mer:passages";

export interface Satellite {
  id: string;
  nom: string;
  /** Its directory under viirs/ and its name in the files'. */
  dossier: string;
  fichier: string;
  /** Its orbit, minutes. */
  periode: number;
}

// NOAA-20 first (14.1955 orbits a day). Suomi NPP and NOAA-21 have the same files, under viirs/npp/ and viirs/n21/.
export const SATELLITES: Satellite[] = [{ id: "N20", nom: "NOAA-20", dossier: "n20", fichier: "VIIRS_N20", periode: 1440 / 14.1955 }];

const BASE = "https://coastwatch.noaa.gov/pub/socd2/coastwatch/sst/nrt/viirs";
const MINUTE = 60_000;
const GRANULE = 10 * MINUTE;
/**
 * Where the island is seen, in minutes after midnight UTC: the middle of each window, when an orbit right above the
 * island crosses 21° S (21:39 UTC on 7 November 2026, read in its pixels' times; 10:00 by the orbit's 13:30 equator
 * crossing), and how far on either side an orbit's swath still reaches it, with a margin for the drift of the orbit.
 */
export const WINDOWS = [{ sens: "descendant", milieu: 21 * 60 + 39 }, { sens: "montant", milieu: 10 * 60 }] as const;
const HALF_WINDOW = 80 * MINUTE;
/** A granule is asked this long after its end at the earliest (33 to 80 minutes seen on 7 November 2026), then again. */
const POSTED_AFTER = 35 * MINUTE;
const RETRY = 10 * MINUTE;
/** A granule still missing this long after it was measured is given up. */
const GIVE_UP = 6 * 3600_000;
/** How long passes are kept, and the newest pass of each window kept to expect the next ones. */
const KEEP = 30 * 3600_000;
const ANCHOR = 4 * 86_400_000;
/** A predicted crossing this near a granule's start or end asks the granule next to it too. */
const EDGE = 2 * MINUTE;
// The granule's few Mo come in a few seconds; a stuck server must not hold the scheduled event.
const TIMEOUT_MS = 20_000;

// The island with 0.1° around it for the pixels along its coast: 20.85 to 21.40° S, 55.2 to 55.9° E.
const BOX = { latMax: -20.75, latMin: -21.5, lonMin: 55.1, lonMax: 56.0 };
// The global grid of 0.02°: rows from 89.99° N southwards, columns from 179.99° W eastwards.
const row = (lat: number) => Math.round((89.99 - lat) / 0.02);
const col = (lon: number) => Math.round((lon + 179.99) / 0.02);
const R0 = row(BOX.latMax);
const R1 = row(BOX.latMin) + 1;
const C0 = col(BOX.lonMin);
const C1 = col(BOX.lonMax) + 1;

/** A pass over the island: its valid pixels, [lon, lat, °C], and when they were measured (ms, their mean time). */
export interface Pass {
  satellite: string;
  /** The granule's start, ms. */
  granule: number;
  heure: number;
  /** Clear pixels (quality level 5); none when clouds hid the island. */
  pixels: [number, number, number][];
  /** Clouds over the whole island: `heure` is the granule's middle, not a time measured. */
  nuages?: true;
}

/** A granule asked: read (whether it saw the island or not), or not yet posted and asked again later. */
export interface Probe {
  satellite: string;
  granule: number;
  lu: boolean;
  essai: number;
}

export interface Passages {
  passages: Pass[];
  sondes: Probe[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** The URL of the granule of `sat` starting at `start` (ms, on a multiple of 10 minutes). */
export function granuleUrl(sat: Satellite, start: number): string {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const doy = Math.round((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  const stamp = `${y}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
  return `${BASE}/${sat.dossier}/l3u/${y}/${pad(doy, 3)}/${stamp}-STAR-L3U_GHRSST-SSTsubskin-${sat.fichier}-ACSPO_V2.80-v02.0-fv01.0.nc`;
}

/**
 * The island's part of a granule: its clear pixels and their mean time; null when the granule's swath does not reach
 * the island. The temperature is in hundredths of a degree above 0 °C (scale 0.01, offset 273.15 K), -32768 where there
 * is none; the time in quarters of a second after the granule's start. NOAA writes a temperature and a time only for
 * the clear pixels (quality level 5): the swath is told by the quality level, 0 under clouds and over land, -128 out
 * of it. A pass that saw only clouds has no time of its own: the granule's middle, marked as such.
 */
export async function readPass(read: Reader, satellite: string, granule: number): Promise<Pass | null> {
  const [sst, ql, dt] = await Promise.all([
    variable(read, "sea_surface_temperature").then((v) => region(read, v, R0, R1, C0, C1, -32768)),
    variable(read, "quality_level").then((v) => region(read, v, R0, R1, C0, C1, -128)),
    variable(read, "sst_dtime").then((v) => region(read, v, R0, R1, C0, C1, -(2 ** 31))),
  ]);
  if (!ql.some((q) => q !== -128)) return null;
  const pixels: [number, number, number][] = [];
  let sum = 0;
  const width = C1 - C0;
  sst.forEach((v, i) => {
    if (v === -32768 || ql[i] !== 5 || dt[i] === -(2 ** 31)) return;
    sum += dt[i];
    const lat = Math.round((89.99 - 0.02 * (R0 + Math.floor(i / width))) * 100) / 100;
    const lon = Math.round((-179.99 + 0.02 * (C0 + (i % width))) * 100) / 100;
    pixels.push([lon, lat, v / 100]);
  });
  if (!pixels.length) return { satellite, granule, heure: granule + GRANULE / 2, pixels, nuages: true };
  return { satellite, granule, heure: Math.round(granule + (sum / pixels.length / 4) * 1000), pixels };
}

/** The window a time falls in, by its time of day UTC; undefined outside both. */
export function windowOf(t: number): (typeof WINDOWS)[number] | undefined {
  const day = Math.floor(t / 86_400_000) * 86_400_000;
  return WINDOWS.find((w) => [-1, 0, 1].some((k) => Math.abs(t - (day + k * 86_400_000 + w.milieu * MINUTE)) <= HALF_WINDOW));
}

const floor = (t: number) => Math.floor(t / GRANULE) * GRANULE;

/**
 * The granules of `sat` that may hold a pass, from KEEP before `until`: in each window, a whole number of orbits after
 * the newest pass seen in it with a time measured (and the granule next to it near a granule's edge), or every granule
 * of the window when none was seen in the last days.
 */
export function expected(state: Passages, sat: Satellite, until: number): number[] {
  const out = new Set<number>();
  const from = until - KEEP;
  for (let day = Math.floor(from / 86_400_000) * 86_400_000; day <= until; day += 86_400_000) {
    for (const w of WINDOWS) {
      const mid = day + w.milieu * MINUTE;
      if (mid + HALF_WINDOW < from || mid - HALF_WINDOW > until) continue;
      const anchor = state.passages
        .filter((p) => p.satellite === sat.id && !p.nuages && windowOf(p.heure) === w && p.heure < mid - HALF_WINDOW && p.heure > mid - ANCHOR)
        .sort((a, b) => b.heure - a.heure)[0];
      if (!anchor) {
        for (let g = floor(mid - HALF_WINDOW); g <= mid + HALF_WINDOW; g += GRANULE) out.add(g);
        continue;
      }
      const P = sat.periode * MINUTE;
      for (let n = Math.ceil((mid - HALF_WINDOW - anchor.heure) / P); anchor.heure + n * P <= mid + HALF_WINDOW; n++) {
        const t = anchor.heure + n * P;
        out.add(floor(t));
        if (t - floor(t) < EDGE) out.add(floor(t) - GRANULE);
        if (floor(t) + GRANULE - t < EDGE) out.add(floor(t) + GRANULE);
      }
    }
  }
  return [...out].filter((g) => g >= from && g <= until).sort((a, b) => b - a);
}

/** The next granule to ask at `now`, the newest first: posted by now, never read, not tried in the last RETRY. */
export function nextProbe(state: Passages, now: number): { sat: Satellite; granule: number } | undefined {
  const due: { sat: Satellite; granule: number }[] = [];
  for (const sat of SATELLITES) {
    for (const g of expected(state, sat, now)) {
      if (g + GRANULE + POSTED_AFTER > now || now - g > GIVE_UP) continue;
      const tried = state.sondes.find((s) => s.satellite === sat.id && s.granule === g);
      if (tried && (tried.lu || now - tried.essai < RETRY)) continue;
      due.push({ sat, granule: g });
    }
  }
  return due.sort((a, b) => b.granule - a.granule)[0];
}

/**
 * Minutes until the copy is built again: 10 while a granule is to be asked or will be posted within the hour, else an
 * hour (each build is a write to KV).
 */
export function passagesEvery(last: unknown, now = new Date()): number {
  const state = (last as Passages | undefined)?.passages ? (last as Passages) : { passages: [], sondes: [] };
  const soon = now.getTime() + 60 * MINUTE;
  return nextProbe(state, now.getTime()) || nextProbe(state, soon) ? 10 : 60;
}

/** What is kept: the passes of the last KEEP and, to expect the next ones, the newest of each window of the last days. */
function prune(state: Passages, now: number): Passages {
  const anchors = new Set<Pass>();
  for (const sat of SATELLITES) {
    for (const w of WINDOWS) {
      const newest = state.passages.filter((p) => p.satellite === sat.id && !p.nuages && windowOf(p.heure) === w).sort((a, b) => b.heure - a.heure)[0];
      if (newest && now - newest.heure < ANCHOR) anchors.add(newest);
    }
  }
  return {
    passages: state.passages.filter((p) => now - p.heure < KEEP || anchors.has(p)).map((p) => (now - p.heure < KEEP ? p : { ...p, pixels: [] })),
    sondes: state.sondes.filter((s) => now - s.granule < KEEP),
  };
}

/** The scheduled event's build: the last copy, with at most one more granule asked. */
export async function build(cache: Cache, now = new Date()): Promise<Passages> {
  const last = (await cache.peek<Passages>(KEY).catch(() => undefined))?.value;
  const state = prune(last?.passages ? last : { passages: [], sondes: [] }, now.getTime());
  const next = nextProbe(state, now.getTime());
  if (!next) return state;
  const { sat, granule } = next;
  let lu = false;
  let pass: Pass | null = null;
  try {
    pass = await readPass(inMemory(await getBytes(SOURCE.id, granuleUrl(sat, granule), TIMEOUT_MS)), sat.id, granule);
    lu = true;
  } catch (err) {
    // Not posted yet (404) is the usual case: asked again after RETRY, given up after GIVE_UP.
    console.log(`source viirs : granule ${new Date(granule).toISOString()} pas lu:`, why(err));
  }
  return {
    passages: pass ? [pass, ...state.passages].sort((a, b) => b.heure - a.heure) : state.passages,
    sondes: [{ satellite: sat.id, granule, lu, essai: now.getTime() }, ...state.sondes.filter((s) => !(s.satellite === sat.id && s.granule === granule))],
  };
}

/** A pass's reading near a point: the nearest clear pixels within `maxKm`, and when, how far. */
export interface PassReading {
  satellite: string;
  heure: number;
  valeur: number;
  lon: number;
  lat: number;
  distance_km: number;
  pixels: number;
}

/**
 * The newest pass of the last `maxAgeMs` before `now` with a clear pixel within `maxKm` of the point; the pixels about as
 * close as the nearest one averaged, as acspo.ts does for the day's mean.
 */
export function latest(state: Passages | undefined, lon: number, lat: number, now: number, maxKm: number, maxAgeMs: number): PassReading | null {
  for (const p of [...(state?.passages ?? [])].sort((a, b) => b.heure - a.heure)) {
    if (now - p.heure > maxAgeMs || p.heure > now) continue;
    const near = p.pixels
      .map(([plon, plat, v]) => ({ plon, plat, v, d: distanceKm(lon, lat, plon, plat) }))
      .filter((x) => x.d <= maxKm)
      .sort((a, b) => a.d - b.d);
    if (!near.length) continue;
    const group = near.filter((x) => x.d <= near[0].d + 2);
    const mean = group.reduce((s, x) => s + x.v, 0) / group.length;
    return {
      satellite: SATELLITES.find((s) => s.id === p.satellite)?.nom ?? p.satellite,
      heure: p.heure,
      valeur: Math.round(mean * 10) / 10,
      lon: near[0].plon,
      lat: near[0].plat,
      distance_km: Math.round(near[0].d * 10) / 10,
      pixels: group.length,
    };
  }
  return null;
}
