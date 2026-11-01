/**
 * The files of /meteo's replay bar, one a length, each asked by the page only when its visitor plays it:
 * - 6 hours: the radar's images, one every 5 minutes (pluie-retro.ts), and the stations' last 6 round hours;
 * - 24 hours: the radar's images, one a quarter of an hour, each the strongest rain of the hour up to it (parHeure),
 *   and the stations' last 24 round hours;
 * - 7 days: the stations' round hours of the week; and the radar's week (radar-semaine.ts) for the hours it holds, 3
 *   hours an hour apart, each the strongest rain of the 3 hours, as the 24 hours; the rain gauges before them.
 * The finer files, for the visitors who ask for more images or whose device keeps up (meteo-carte.ts), take the radar's
 * own images, not the strongest rain of an hour, from its days kept in KV (radar-semaine.ts):
 * - 24 hours, an image every 5 minutes, the 6 hours' for the hours not yet in a day;
 * - 7 days, an image every quarter of an hour, for the hours the days hold;
 * - a day of La Réunion, an image every 5 minutes, among the days kept (joursOf).
 * None of them carries the lame d'eau in mm of the images (pluie-retro.ts, sansLame): only the file of rain totals,
 * CUMULS_PATH, the 24 hours an image every 5 minutes, asked by /meteo's « Pluie tombée » (pluie-cumuls.ts).
 * The stations' hours are Météo-France's hourly package (providers/meteofrance.ts), already read for /meteo: the
 * temperature and the wind at each round hour, the rain of the hour before it. It holds 24 hours; the week is kept in
 * KV (SEMAINE_KV_KEY), merged with each newer package a data center already holds, never one asked for it, and at
 * first from the hourly archive in D1 (providers/climat.ts). Each file is kept by the data center as long as nothing
 * newer can be in it.
 */
import { count } from "../budget.js";
import type { Cache } from "../cache.js";
import * as climat from "../providers/climat.js";
import * as meteofrance from "../providers/meteofrance.js";
import { project } from "./map.js";
import { endOf, type Entree, fenetres, type Historique, isTrou, KEEP_MS, LONG_MS, parHeure, sansLame } from "./pluie-retro.js";
import { KEEP_MS as WEEK_KEEP_MS, PREMIER_JOUR } from "./radar-semaine.js";

export const DUREES = ["6h", "24h", "7j"] as const;
export type Duree = (typeof DUREES)[number];
export const PATHS: Record<Duree, string> = { "6h": "/meteo/rejeu-6h.json", "24h": "/meteo/rejeu-24h.json", "7j": "/meteo/rejeu-7j.json" };
/** The finer files of 24 hours and 7 days. */
export const FINS = { "24h": "/meteo/rejeu-24h-5min.json", "7j": "/meteo/rejeu-7j-15min.json" } as const;
export type Fin = keyof typeof FINS;
/** The file of rain totals: the finer 24 hours, with the lame d'eau in mm of each image. */
export const CUMULS_PATH = "/meteo/cumuls.json";
export const JOUR_FILE = /^\/meteo\/rejeu-jour-(\d{4}-\d{2}-\d{2})\.json$/;
export const jourPath = (date: string) => `/meteo/rejeu-jour-${date}.json`;
/** The days of a day's file: that of today and the 7 before, as long as their keys are kept (radar-semaine.ts). */
export const JOURS = 8;
/**
 * The days of La Réunion one can replay at `now` (ms), the newest first: `n` of them, none before `premier`. The page's
 * script takes it as its text.
 */
export const joursOf = (now: number, premier: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(now + 144e5 - i * 864e5).toISOString().slice(0, 10)).filter((x) => x >= premier);

/** The round hours of each file: 6 hours are 7 of them, the first one starting the 6 hours. */
export const HEURES: Record<Duree, number> = { "6h": 7, "24h": 24, "7j": 7 * 24 + 1 };
export const SEMAINE_KV_KEY = "stations:7j";
export const SEMAINE_KV_TTL_SECONDS = 8 * 86_400;
/** The archive in D1 is read again for the hours the week lacks no more than once in this time. */
const D1_AGAIN_MS = 6 * 3600_000;
const HOUR_MS = 3_600_000;
const FIELDS = ["t", "rr", "ff", "dd"] as const;
type Field = (typeof FIELDS)[number];

/** A station's hours, oldest first, the last one ending at the file's `fin`: °C, mm, km/h, degrees; null when not measured. */
export type Series = Record<Field, (number | null)[]>;

/** The week as kept in KV: each station's HEURES["7j"] hours up to `fin`; `d1`, when the archive was last read. */
export interface Semaine {
  fin: string;
  st: Record<string, Series>;
  d1?: string;
}

/** A station of a file: its place on the map, its altitude (for the temperatures' veil), its hours. */
export interface SerieCarte extends Series {
  id: string;
  x: number;
  y: number;
  alt: number;
}

export interface Heures {
  /** The end of the newest hour, ISO UTC. */
  fin: string;
  heures: number;
  st: SerieCarte[];
}

export interface Rejeu {
  radar?: Historique | null;
  heures: Heures | null;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const empty = (n: number): Series => ({ t: Array(n).fill(null), rr: Array(n).fill(null), ff: Array(n).fill(null), dd: Array(n).fill(null) });

/** The hours of `semaine`, or of none, shifted to end at `fin`, with the package's hours over them. */
export function merge(before: Semaine | null, hourly: meteofrance.HourlyRain | undefined, now: Date): Semaine | null {
  const n = HEURES["7j"];
  const fin = Math.max(before ? Date.parse(before.fin) : 0, hourly ? Date.parse(hourly.end) : 0);
  if (!fin || fin > now.getTime()) return before;
  const st: Record<string, Series> = {};
  const at = (ms: number) => n - 1 - Math.round((fin - ms) / HOUR_MS);
  if (before) {
    const end = Date.parse(before.fin);
    for (const [id, s] of Object.entries(before.st)) {
      const out = (st[id] = empty(n));
      for (const f of FIELDS) s[f].forEach((v, i) => {
        const k = at(end - (s[f].length - 1 - i) * HOUR_MS);
        if (k >= 0 && k < n && v != null) out[f][k] = v;
      });
    }
  }
  if (hourly) {
    for (const s of meteofrance.stations()) {
      for (const h of meteofrance.stationHours(hourly, s.id)) {
        const k = at(Date.parse(h.fin));
        if (k < 0 || k >= n) continue;
        const out = (st[s.id] ??= empty(n));
        const v = { t: h.t, rr: h.rr, ff: h.ff, dd: h.dd };
        for (const f of FIELDS) if (v[f] != null) out[f][k] = v[f];
      }
    }
  }
  return { fin: iso(fin), st, ...(before?.d1 ? { d1: before.d1 } : {}) };
}

/** The round hours (ISO UTC) of the week where no station has a measure: what the archive may fill. */
export function holes(s: Semaine): number[] {
  const n = HEURES["7j"];
  const fin = Date.parse(s.fin);
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (!Object.values(s.st).some((x) => FIELDS.some((f) => x[f][k] != null))) out.push(fin - (n - 1 - k) * HOUR_MS);
  return out;
}

/**
 * The archive's hours over the holes of the week. Its hours are local time (UTC+4), each the one ending then; its
 * wind in m/s.
 */
export function fill(s: Semaine, months: Map<string, Map<number, climat.Month>>, now: Date): Semaine {
  const n = HEURES["7j"];
  const fin = Date.parse(s.fin);
  const st = { ...s.st };
  const of: Record<Field, [climat.HourField, (v: number) => number]> = {
    t: ["T", (v) => v], rr: ["RR1", (v) => v], ff: ["FF", (v) => Math.round(v * 3.6)], dd: ["DD", (v) => v],
  };
  for (const ms of holes(s)) {
    const local = new Date(ms + 4 * HOUR_MS).toISOString();
    const k = n - 1 - Math.round((fin - ms) / HOUR_MS);
    for (const [id, m] of months) {
      for (const f of FIELDS) {
        const v = climat.valueAt(m, of[f][0], local.slice(0, 10), +local.slice(11, 13));
        if (v == null) continue;
        st[id] ??= empty(n);
        st[id] = { ...st[id], [f]: st[id][f].map((x, i) => (i === k ? of[f][1](v) : x)) };
      }
    }
  }
  return { ...s, st, d1: now.toISOString() };
}

/**
 * The file's hours: the last `n` of the week up to `end` (ms, at most the week's end), at the Météo-France stations
 * that measured any.
 */
export function heures(s: Semaine | null, n: number, end?: number): Heures | null {
  if (!s) return null;
  const all = HEURES["7j"];
  const last = Date.parse(s.fin);
  const after = end === undefined || end >= last ? 0 : Math.round((last - end) / HOUR_MS);
  n = Math.min(n, all - after);
  if (n <= 0) return null;
  const st: SerieCarte[] = [];
  for (const x of meteofrance.stations()) {
    const series = s.st[x.id];
    if (!series) continue;
    const cut = Object.fromEntries(FIELDS.map((f) => [f, series[f].slice(all - after - n, all - after)])) as Series;
    if (!FIELDS.some((f) => cut[f].some((v) => v != null))) continue;
    const [px, py] = project(x.lon, x.lat);
    st.push({ id: x.id, x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10, alt: x.altitude_m, ...cut });
  }
  return st.length ? { fin: after ? iso(last - after * HOUR_MS) : s.fin, heures: n, st } : null;
}

export interface Sources {
  /** The radar's 6 hours (KV, pluie-retro.ts), with the lame d'eau in mm of its images. */
  six(): Promise<Historique | null>;
  /** Its day of La Réunion `date`, an image every 5 minutes (radar-semaine.ts), with their lame d'eau in mm. */
  jour(date: string): Promise<Historique | null>;
  /** Its 24 hours, a quarter of an hour apart. */
  day(): Promise<Historique | null>;
  /** Its week, an hour apart (radar-semaine.ts). */
  week(): Promise<Historique | null>;
  semaine: { get(): Promise<Semaine | null>; put(s: Semaine): Promise<void> };
}

let sources: Sources | undefined;

/** Set by worker.ts: KV. Without it, the files say they have no history. */
export function configure(s?: Sources) {
  sources = s;
}

/**
 * The week, merged with the package this data center holds, and with the archive where neither has an hour (at most
 * once in D1_AGAIN_MS); written back when it changed, by `background`.
 */
async function semaine(cache: Cache, now: Date, background: (p: Promise<unknown>) => void): Promise<Semaine | null> {
  if (!sources) return null;
  count();
  const before = await sources.semaine.get().catch(() => null);
  const hourly = meteofrance.enabled() ? (await meteofrance.recentRain(cache, now))?.hourly : undefined;
  let s = merge(before, hourly, now);
  if (!s) return null;
  const lastD1 = s.d1 ? Date.parse(s.d1) : 0;
  if (climat.hourlyEnabled() && holes(s).length && now.getTime() - lastD1 > D1_AGAIN_MS) {
    const first = Math.min(...holes(s));
    const ym = (ms: number) => { const d = new Date(ms + 4 * HOUR_MS); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; };
    try {
      count();
      s = fill(s, await climat.months(meteofrance.stations().map((x) => x.id), ym(first), ym(Date.parse(s.fin))), now);
    } catch (err) {
      console.error("rejeu : archive horaire illisible", err instanceof Error ? err.message : String(err));
    }
  }
  if (!before || s.fin !== before.fin || s.d1 !== before.d1) {
    const write = s;
    count(1, true);
    background(sources.semaine.put(write).catch((err) => console.error("rejeu : semaine non écrite", err instanceof Error ? err.message : String(err))));
  }
  return s;
}

/** How long each file is kept: until something newer can be in it. */
export function freshSeconds(d: Duree, now: Date): number {
  if (d === "6h") return 300;
  if (d === "24h") return 900;
  // The next round hour is in the package about 15 minutes after it.
  const next = (Math.floor((now.getTime() - 15 * 60_000) / HOUR_MS) + 1) * HOUR_MS + 15 * 60_000;
  return Math.max(300, Math.round((next - now.getTime()) / 1000));
}

async function build(d: Duree, cache: Cache, now: Date, background: (p: Promise<unknown>) => void): Promise<Rejeu> {
  const radar = async (read: () => Promise<Historique | null>, keep: number) => {
    count();
    const h = await read().catch((err) => (console.error("rejeu : historique radar illisible", err instanceof Error ? err.message : String(err)), null));
    const entrees = h?.entrees.filter((e) => endOf(e) > now.getTime() - keep) ?? [];
    return h && entrees.length ? sansLame({ ...h, entrees }) : null;
  };
  const [s, r] = await Promise.all([
    semaine(cache, now, background),
    !sources ? undefined
    : d === "6h" ? radar(sources.six, KEEP_MS)
    : d === "24h" ? radar(sources.day, LONG_MS).then((h) => h && parHeure(h))
    : radar(sources.week, WEEK_KEEP_MS).then((h) => h && written(h, now) ? fenetres(h, HOUR_MS, 3 * HOUR_MS) : null),
  ]);
  // The week of the radar while it is written; the page shows the rain gauges for the hours before its first.
  return { ...(d === "7j" ? r ? { radar: r } : {} : { radar: r ?? null }), heures: heures(s, HEURES[d]) };
}

/**
 * Whether the radar's week (radar-semaine.ts) is still written: an image among its hours, the last within 3 hours. Shown
 * from its first hour, not only once it holds 7 days (the user, 01/11/2026: the rain gauges alone put rain over the
 * whole island the evening of 31/10, the radar had it).
 */
export function written(h: Historique, now: Date): boolean {
  return h.entrees.some((e) => !isTrou(e)) && endOf(h.entrees[h.entrees.length - 1]) > now.getTime() - 3 * HOUR_MS;
}

const DAY_MS = 24 * HOUR_MS;
/** The days of La Réunion (AAAA-MM-JJ) whose images end after `from` up to `to` (ms), oldest first. */
export function joursEntre(from: number, to: number): string[] {
  const out: string[] = [];
  for (let t = Math.floor((from + 4 * HOUR_MS) / DAY_MS) * DAY_MS - 4 * HOUR_MS; t < to; t += DAY_MS) out.push(iso(t + 4 * HOUR_MS).slice(0, 10));
  return out;
}

/**
 * The entries of the histories `hs` that end after `from`, oldest first, each once: a gap the longest it was said;
 * one size of grid, the first's.
 */
export function assembler(hs: (Historique | null)[], from: number): Historique | null {
  const first = hs.find((h) => h?.entrees.length);
  if (!first) return null;
  const seen = new Map<string, Entree>();
  for (const h of hs) {
    if (!h || h.w !== first.w || h.h !== first.h) continue;
    for (const e of h.entrees) {
      if (endOf(e) <= from) continue;
      const key = isTrou(e) ? `trou ${e.de}` : e.fin;
      const was = seen.get(key);
      if (!was || endOf(e) > endOf(was)) seen.set(key, e);
    }
  }
  const entrees = [...seen.values()].sort((a, b) => endOf(a) - endOf(b));
  return entrees.length ? { w: first.w, h: first.h, entrees } : null;
}

/** Over 7 days, the images of the quarters of an hour, and the gaps of half an hour or more. */
const QUART = (e: Entree) => (isTrou(e) ? endOf(e) - Date.parse(e.de) >= 30 * 60_000 : new Date(e.fin).getUTCMinutes() % 15 === 0);

/** A history of the radar, without the lame d'eau of its images unless `lame` (the file of rain totals). */
const radarOf = async (read: () => Promise<Historique | null>, lame = false) => {
  count();
  const h = await read().catch((err) => (console.error("rejeu : historique radar illisible", err instanceof Error ? err.message : String(err)), null));
  return h && !lame ? sansLame(h) : h;
};

async function buildFin(f: Fin, cache: Cache, now: Date, background: (p: Promise<unknown>) => void, lame = false): Promise<Rejeu> {
  const from = now.getTime() - (f === "24h" ? LONG_MS : 7 * DAY_MS);
  const src = sources;
  const reads = !src ? [] : [...joursEntre(from, now.getTime()).map((d) => radarOf(() => src.jour(d), lame)), ...(f === "24h" ? [radarOf(src.six, lame)] : [])];
  const [s, hs] = await Promise.all([semaine(cache, now, background), Promise.all(reads)]);
  if (f === "24h") return { radar: src ? assembler(hs, from) : null, heures: heures(s, HEURES["24h"]) };
  // The days for the hours they hold while written, as the file of an image an hour; the rain gauges before them.
  const all = src && assembler(hs, from);
  const radar = all && written(all, now) ? { ...all, entrees: all.entrees.filter(QUART) } : null;
  return { ...(radar ? { radar } : {}), heures: heures(s, HEURES["7j"]) };
}

/** The day `date`: its images, and the stations' hours from the midnight it starts at (`end` the one it ends at). */
async function buildJour(date: string, end: number, cache: Cache, now: Date, background: (p: Promise<unknown>) => void): Promise<Rejeu> {
  const src = sources;
  const [s, h] = await Promise.all([semaine(cache, now, background), src ? radarOf(() => src.jour(date)) : null]);
  const fin = s ? Math.min(end, Date.parse(s.fin)) : end;
  return { radar: src ? (h?.entrees.length ? h : null) : undefined, heures: heures(s, Math.round((fin - end + DAY_MS) / HOUR_MS) + 1, end) };
}

const answer = async (key: string, fresh: number, cache: Cache, build: () => Promise<Rejeu>) =>
  new Response(JSON.stringify((await cache.get(key, fresh, build)).value), {
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": `public, max-age=${fresh}` },
  });

/** The answer of PATHS[d], kept by the data center and the browser for freshSeconds(). */
export async function rejeu(d: Duree, cache: Cache, background: (p: Promise<unknown>) => void, now = new Date()): Promise<Response> {
  return answer(`rejeu:${d}`, freshSeconds(d, now), cache, () => build(d, cache, now, background));
}

/** The answer of FINS[f]: the 24 hours kept as the 6 hours' newest image, the week as the days' last hour. */
export async function rejeuFin(f: Fin, cache: Cache, background: (p: Promise<unknown>) => void, now = new Date()): Promise<Response> {
  return answer(`rejeu:${f}:fin`, f === "24h" ? 300 : freshSeconds("7j", now), cache, () => buildFin(f, cache, now, background));
}

/** The answer of CUMULS_PATH: the finer 24 hours with the lame d'eau of each image, kept as they are. */
export async function rejeuCumuls(cache: Cache, background: (p: Promise<unknown>) => void, now = new Date()): Promise<Response> {
  return answer("rejeu:cumuls", 300, cache, () => buildFin("24h", cache, now, background, true));
}

/**
 * The answer of jourPath(date), or null for a day not kept (joursOf): until its last hour is written, kept as the
 * week; then 6 hours, the stations' holes it may still fill.
 */
export async function rejeuJour(date: string, cache: Cache, background: (p: Promise<unknown>) => void, now = new Date()): Promise<Response | null> {
  if (!joursOf(now.getTime(), PREMIER_JOUR, JOURS).includes(date)) return null;
  const end = Date.parse(`${date}T20:00:00Z`);
  const fresh = now.getTime() < end + HOUR_MS ? freshSeconds("7j", now) : 6 * 3600;
  return answer(`rejeu:jour:${date}`, fresh, cache, () => buildJour(date, end, cache, now, background));
}
