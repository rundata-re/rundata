/**
 * The wave buoys of the Candhis network (Cerema) around La Réunion: what each measured in its last half hour, the
 * height of the waves, their period and direction, and the temperature of the sea. MEASUREMENTS, never mixed with the
 * forecast of providers/houle.ts. A free key (CANDHIS_API_KEY), sent in the Authorization header, never in a URL.
 *
 * The API counts each key's requests a day (HTTP 429 past its quota, which its documentation does not give). So the
 * Worker asks it only in its scheduled event, every 30 minutes, with one getCampListeTR request per type of buoy (all
 * the island's buoys of that type at once), and keeps what they measured in KV under `candhis:etat`: the pages and the
 * answers read KV, never the API. Which buoys of the island are active, and of which type, comes from getCampListe,
 * asked once for each of its three types when KV does not hold it, and again every day: a buoy of the island that
 * starts measuring is asked the day it shows there. Without the key, nothing is
 * asked, kept or shown.
 *
 * Documentation: « API PHP REST de Candhis (v1), documentation utilisateur », Cerema, octobre 2024.
 */
import type { Cache } from "../cache.js";
import { getText } from "../http.js";
import { type SourceInfo, UpstreamError } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "candhis",
  nom: "Houlographes du réseau Candhis à La Réunion",
  organisme: "Cerema",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Cerema / Candhis",
  url: "https://candhis.cerema.fr/",
};

const API = "https://candhis.cerema.fr/API/v1/";

/** The types of buoy getCampListe and getCampListeTR take, and what each measures. */
export type Kind = 0 | 1 | 2;
export const KINDS: Record<Kind, string> = { 0: "non directionnel H13", 1: "directionnel Hm0", 2: "directionnel H13" };

export interface Bouee {
  code: string;
  nom: string;
  /** Where it is, when known: neither getCampListe nor getCampListeTR gives it. */
  lat?: number;
  lon?: number;
}

/**
 * The island's measuring campaigns, from the Cerema's list of stations on data.gouv.fr (candhis_houlographes_202412),
 * then the two buoys of Météo-France, with their codes and names from the Cerema's answer of 18/11/2026. Saint-Pierre
 * (large) measures since November 2026, its place from getCampInfos (23/11/2026); Sainte-Marie's is asked of
 * getCampInfos the day it shows active (`refresh`). Only these codes are read from the API's lists.
 */
export const BOUEES: Bouee[] = [
  { code: "97401", nom: "Baie de la Possession", lat: -20.91018, lon: 55.34598 },
  { code: "97402", nom: "Pointe du Phare", lat: -20.921, lon: 55.28683 },
  { code: "97403", nom: "Rivière des Galets", lat: -20.94572, lon: 55.27732 },
  { code: "97404", nom: "Pointe du Gouffre", lat: -20.87615, lon: 55.3903 },
  { code: "97405", nom: "Saint-Pierre", lat: -21.35283, lon: 55.47767 },
  { code: "97406", nom: "Sainte-Rose", lat: -21.12133, lon: 55.78417 },
  { code: "97407", nom: "Vincendo", lat: -21.381, lon: 55.681 },
  { code: "97408", nom: "Port Réunion Est", lat: -20.92452, lon: 55.3242 },
  { code: "97409", nom: "Sainte-Marie" },
  { code: "97410", nom: "Saint-Pierre (large)", lat: -21.365, lon: 55.46525 },
];
const CODES = new Set(BOUEES.map((b) => b.code));

/** Where the scheduled event keeps the buoys' state, and for how long: past a week without a write, nothing is shown. */
export const KEY = "candhis:etat";
export const TTL_SECONDS = 7 * 86_400;
/** The scheduled event asks every 30 minutes, at 10 and 40 past the hour (UTC): the buoys measure on the half hour. */
export const REFRESH_EVERY = 30;
export const REFRESH_OFFSET = 10;
/**
 * The list of the active buoys and their types, asked again after this: a day, so that a buoy which starts measuring is
 * read the same day. Three requests a day, against up to three every 30 minutes for the measurements.
 */
const TYPES_DAYS = 1;
// Each data center reads its copy of the state again after this.
const READ_SECONDS = 120;
const TIMEOUT_MS = 20_000;
const DAY = 86_400_000;

/** What one buoy measured in its last half hour. A value it did not measure is null. */
export interface Mesure {
  code: string;
  /** Epoch milliseconds of the measurement. */
  t: number;
  /** Significant height of the waves, in metres: H1/3 (from the waves counted) or Hm0 (from their spectrum), as the buoy gives it. */
  hauteur: number | null;
  hauteur_selon: "H1/3" | "Hm0";
  /** Height of the highest wave, in metres. */
  hmax: number | null;
  /** Period, in seconds: TH1/3 (that of the highest third of the waves) or T02 (the mean period of the spectrum). */
  periode: number | null;
  periode_selon: "TH1/3" | "T02";
  /** Peak period, in seconds (the non-directional buoys). */
  periode_pic: number | null;
  /** Where the waves of the peak come from, in degrees (the directional buoys). */
  direction: number | null;
  /** Their spread around that direction, in degrees (the directional H1/3 buoys). */
  etalement: number | null;
  /** Temperature of the sea at the buoy, °C. */
  temperature: number | null;
}

/** What KV keeps between two scheduled events. */
export interface Etat {
  /** When the API was last asked, answered or not; when it last answered. */
  essai: number;
  lu?: number;
  /** Each buoy's last measurement, kept until a newer one comes: a buoy silent for a while still says when it measured. */
  mesures: Record<string, Mesure>;
  /** The type of each active buoy of the island (getCampListe), and when that list was read. */
  types?: { lu: number; actives: Record<string, Kind> };
  /** Where each active buoy whose place BOUEES lacks is, from getCampInfos: asked once, the day it shows active. */
  positions?: Record<string, { lat: number; lon: number }>;
  /** The last failure, if the last try failed. */
  echec?: { at: number; status?: number; message: string };
  /** No request before then: after a refusal (key refused, address banned, quota reached). */
  pause_jusqu_a?: number;
}

interface Reponse {
  apiVer?: string;
  success?: boolean | string;
  message?: string;
  nbLig?: number;
  entete?: string[] | null;
  results?: unknown[] | null;
}

let apiKey: string | undefined;
let reader: (() => Promise<Etat | null>) | undefined;

/** In the Worker: the key, and the reader of the state the scheduled event keeps in KV. */
export function configure(key: string | undefined, read?: () => Promise<Etat | null>) {
  apiKey = key?.trim() || undefined;
  reader = read;
}

export const configured = () => !!apiKey;

/** Whether the scheduled event at `now` (every 5 minutes) is one of those that ask the buoys. */
export const refreshDue = (now: Date) => (((now.getUTCMinutes() - REFRESH_OFFSET) % REFRESH_EVERY) + REFRESH_EVERY) % REFRESH_EVERY < 5;

const ok = (r: Reponse) => r.success === true || String(r.success).toLowerCase() === "true";
// The documentation's headers break lines in places (« H1/3\n(m) »): compared without their spaces.
const label = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** A value as the API writes it, in a string; 999.9999 says the buoy did not measure it. */
export function value(s: unknown): number | null {
  if (s == null || String(s).trim() === "") return null;
  const v = Number(String(s).trim());
  return Number.isFinite(v) && Math.abs(v - 999.9999) > 1e-6 ? v : null;
}

/** « 2024-03-04 10:30 », in UTC (the time of the Candhis tables). */
export function timeOf(s: unknown): number {
  const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)(?::\d\d)?$/.exec(label(s));
  return m ? Date.parse(`${m[1]}T${m[2]}:00Z`) : NaN;
}

async function ask(path: string): Promise<Reponse> {
  if (!apiKey) throw new UpstreamError(SOURCE.id, "pas de clé");
  const text = await getText(SOURCE.id, `${API}${path}`, TIMEOUT_MS, { Authorization: apiKey });
  try {
    return JSON.parse(text) as Reponse;
  } catch {
    throw new UpstreamError(SOURCE.id, "réponse illisible (pas du JSON)");
  }
}

/**
 * getCampListe for one type: the island's campaigns of that type that are active. Columns: code, name, active (« 1 »),
 * type of the real-time data.
 */
export function parseListe(r: Reponse): string[] {
  if (!ok(r) || !Array.isArray(r.results)) return [];
  return r.results.flatMap((row) => (Array.isArray(row) && CODES.has(label(row[0])) && label(row[2]) === "1" ? [label(row[0])] : []));
}

/**
 * getCampListeTR: the last measurement of each campaign asked. The columns differ by type of buoy, so they are read by
 * their header: Campagne, Date, then H1/3 or Hm0, Hmax, TH1/3 or T02, Dir. au pic or T. au pic, Etal. au pic, Temp. mer.
 */
export function parseTR(r: Reponse): Mesure[] {
  return rowsOf(r);
}

/**
 * The rows of getCampListeTR (a column « Campagne ») or of getCampTR for the campaign `camp` (no such column), read by
 * their header, oldest first: the API's order is not documented.
 */
function rowsOf(r: Reponse, camp?: string): Mesure[] {
  if (!ok(r) || !Array.isArray(r.results) || !Array.isArray(r.entete)) return [];
  const head = r.entete.map(label);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const at = {
    code: col("Campagne"),
    t: col("Date"),
    h13: col("H1/3 (m)"),
    hm0: col("Hm0 (m)"),
    hmax: col("Hmax (m)"),
    th13: col("TH1/3 (s)"),
    t02: col("T02 (s)"),
    tpic: col("T. au pic (s)"),
    dir: col("Dir. au pic (°)"),
    etal: col("Etal. au pic (°)"),
    temp: col("Temp. mer (°C)"),
  };
  const get = (row: unknown[], i: number) => (i >= 0 ? value(row[i]) : null);
  return r.results.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const code = camp ?? label(row[at.code]);
    const t = timeOf(row[at.t]);
    if (!CODES.has(code) || !Number.isFinite(t)) return [];
    return [{
      code,
      t,
      hauteur: get(row, at.h13 >= 0 ? at.h13 : at.hm0),
      hauteur_selon: at.h13 >= 0 ? "H1/3" : "Hm0",
      hmax: get(row, at.hmax),
      periode: get(row, at.th13 >= 0 ? at.th13 : at.t02),
      periode_selon: at.th13 >= 0 ? "TH1/3" : "T02",
      periode_pic: get(row, at.tpic),
      direction: get(row, at.dir),
      etalement: get(row, at.etal),
      temperature: get(row, at.temp),
    } satisfies Mesure];
  }).sort((a, b) => a.t - b.t);
}

/** getCampTR for one campaign: its measurements from `dateDeb` (YYYY-MM-DD, UTC), oldest first. */
export const parseSerieTR = (r: Reponse, camp: string) => rowsOf(r, camp);

/** getCampInfos: the campaign's place (columns Nom, Latitude, Longitude, …), when it gives one. */
export function parseInfos(r: Reponse): { lat: number; lon: number } | undefined {
  if (!ok(r) || !Array.isArray(r.results) || !Array.isArray(r.entete)) return undefined;
  const head = r.entete.map(label);
  const row = r.results[0];
  if (!Array.isArray(row)) return undefined;
  const [lat, lon] = [value(row[head.indexOf("Latitude")]), value(row[head.indexOf("Longitude")])];
  return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { lat, lon } : undefined;
}

/**
 * How long to wait after a refusal: a key refused or an address banned is for a person to look at (a day); a quota
 * reached, until the quota can have turned (3 hours, as its period is not documented).
 */
const pauseOf = (status: number | undefined) => (status === 401 || status === 423 ? DAY : status === 429 ? 3 * 3600_000 : 0);

/**
 * In the Worker's scheduled event: the island's active buoys and their types when `before` lacks them or they are a day
 * old (one request per type), then one getCampListeTR request per type of active buoy, merged into `before`'s
 * measurements and handed to `write`, failures included. Returns what was done, for the logs; throws after writing when
 * a request failed.
 */
export async function refresh(before: Etat | null, write: (etat: Etat) => Promise<void>, now = new Date()): Promise<string> {
  const t = now.getTime();
  if (!apiKey) return "sans clé";
  if (before?.pause_jusqu_a && before.pause_jusqu_a > t) return `en pause jusqu'à ${new Date(before.pause_jusqu_a).toISOString()}`;
  const etat: Etat = { essai: t, mesures: { ...before?.mesures }, ...(before?.lu ? { lu: before.lu } : {}), ...(before?.types ? { types: before.types } : {}), ...(before?.positions ? { positions: before.positions } : {}) };
  let asked = 0;
  try {
    if (!etat.types || t - etat.types.lu >= TYPES_DAYS * DAY) {
      const actives: Record<string, Kind> = {};
      for (const k of [0, 1, 2] as Kind[]) {
        asked++;
        for (const code of parseListe(await ask(`getCampListe.php?type=${k}`))) actives[code] = k;
      }
      etat.types = { lu: t, actives };
    }
    // A buoy that starts measuring with no place known (Sainte-Marie): its place once, so that it can be shown.
    for (const code of Object.keys(etat.types.actives).sort()) {
      const b = BOUEES.find((x) => x.code === code);
      if (b?.lat != null || etat.positions?.[code]) continue;
      asked++;
      const at = parseInfos(await ask(`getCampInfos.php?camp=${code}`));
      if (at) etat.positions = { ...etat.positions, [code]: at };
    }
    const byKind = new Map<Kind, string[]>();
    for (const [code, k] of Object.entries(etat.types.actives)) byKind.set(k, [...(byKind.get(k) ?? []), code]);
    let fresh = 0;
    for (const [k, codes] of [...byKind].sort((a, b) => a[0] - b[0])) {
      asked++;
      for (const m of parseTR(await ask(`getCampListeTR.php?type=${k}&camp=${codes.sort().join(",")}`))) {
        if (!(etat.mesures[m.code]?.t >= m.t)) fresh++;
        if (!(etat.mesures[m.code]?.t > m.t)) etat.mesures[m.code] = m;
      }
    }
    etat.lu = t;
    await write(etat);
    return `${Object.keys(etat.types.actives).length} bouées actives, ${fresh} mesures nouvelles, ${asked} requêtes`;
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : undefined;
    const pause = pauseOf(status);
    etat.echec = { at: t, ...(status ? { status } : {}), message: err instanceof Error ? err.message : String(err) };
    if (pause) etat.pause_jusqu_a = t + pause;
    await write(etat);
    throw err;
  }
}

/** The state the scheduled event keeps: read from KV in the Worker; nothing elsewhere (no key outside the Worker). */
export async function etat(cache: Cache) {
  return cache.get(KEY, READ_SECONDS, async () => {
    const v = reader ? await reader() : null;
    if (!v?.mesures) throw new UpstreamError(SOURCE.id, "état des bouées absent du stockage");
    return v;
  });
}

/** Past this, a buoy's last measurement is not shown: a buoy silent for half a day is not the sea of now. */
export const MESURE_MAX_HOURS = 6;

export interface Releve extends Mesure {
  nom: string;
  lat: number;
  lon: number;
}

/**
 * The buoys that measured in the last MESURE_MAX_HOURS hours and whose place is known, nearest first to `near` when
 * given; none without the key or the state.
 */
export function releves(e: Etat | null | undefined, now: Date, near?: { lon: number; lat: number }, km?: (lon1: number, lat1: number, lon2: number, lat2: number) => number): Releve[] {
  if (!e?.mesures) return [];
  const out = BOUEES.flatMap((b) => {
    const m = e.mesures[b.code];
    const at = b.lat != null && b.lon != null ? { lat: b.lat, lon: b.lon } : e.positions?.[b.code];
    if (!m || !at || now.getTime() - m.t > MESURE_MAX_HOURS * 3600_000 || m.t > now.getTime() + 600_000) return [];
    return [{ ...m, nom: b.nom, ...at }];
  });
  return near && km ? out.sort((a, b) => km(near.lon, near.lat, a.lon, a.lat) - km(near.lon, near.lat, b.lon, b.lat)) : out;
}

/*
 * The series: what each buoy measured over the last 30 days, for the curves of /mer and the figures of temperature_mer.
 * Its own key, so that the answers which only want the last measurement do not read a month. Fed by the scheduled
 * event 5 minutes after the state (`serieDue`), from the state's last measurements: no request of its own. A buoy not
 * filled yet from the start of its days (`rempli`), or with a hole of more than SERIE_TROU minutes not asked for in
 * vain (`trou_vu`), asks getCampTR, at most once a buoy a day; a refusal (quota reached, address banned) stops them until the next day.
 */
export const SERIE_KEY = "candhis:serie";
export const SERIE_JOURS = 30;
/** Kept a little longer than its days: a series a scheduled event did not write for a while is still shown, dated. */
export const SERIE_TTL_SECONDS = (SERIE_JOURS + 2) * 86_400;
export const SERIE_OFFSET = 15;
/** More than this between two measurements (they come every 30 minutes): a hole getCampTR is asked to fill. */
export const SERIE_TROU = 70;

/** One measurement of the series: [t (epoch ms), hauteur, hmax, periode, direction, temperature]. */
export type Point = [number, number | null, number | null, number | null, number | null, number | null];

export interface Serie {
  bouees: Record<string, { hauteur_selon: Mesure["hauteur_selon"]; periode_selon: Mesure["periode_selon"]; points: Point[] }>;
  /** When getCampTR was last asked for each buoy, answered or not. */
  tr?: Record<string, number>;
  /**
   * When getCampTR first brought lines from the start of the days, for each buoy: until then, it is asked from there
   * again (once a day), whatever the scheduled event added since; a first fill that failed is never lost.
   */
  rempli?: Record<string, number>;
  /** The start of the last hole getCampTR was asked for and did not fill: a buoy that did not measure. Not asked again. */
  trou_vu?: Record<string, number>;
  /** The last write, and the last failure of a getCampTR. */
  essai: number;
  echec?: { at: number; status?: number; message: string };
  pause_jusqu_a?: number;
}

export const serieDue = (now: Date) => (((now.getUTCMinutes() - SERIE_OFFSET) % REFRESH_EVERY) + REFRESH_EVERY) % REFRESH_EVERY < 5;

const pointOf = (m: Mesure): Point => [m.t, m.hauteur, m.hmax, m.periode, m.direction, m.temperature];

/** `points` and `more` merged on their time, the newer reading of a time kept, those older than `from` left out. */
export function fusion(points: Point[], more: Point[], from: number): Point[] {
  const by = new Map<number, Point>();
  for (const p of [...points, ...more]) if (p[0] >= from) by.set(p[0], p);
  return [...by.values()].sort((a, b) => a[0] - b[0]);
}

/**
 * The first hole of the series within its days that starts after `apres` (a hole already asked for in vain), as the
 * time getCampTR should start from; undefined when none.
 */
export function premierTrou(points: Point[], from: number, apres = -Infinity): number | undefined {
  if (!points.length) return from;
  for (let i = 1; i < points.length; i++) if (points[i][0] - points[i - 1][0] > SERIE_TROU * 60_000 && points[i - 1][0] > apres) return points[i - 1][0];
  return undefined;
}

/** The start of the next day in La Réunion (UTC+4), when a refused getCampTR may be asked again. */
const lendemain = (t: number) => {
  const local = t + 4 * 3600_000;
  return local - (local % DAY) + DAY - 4 * 3600_000;
};

let serieReader: (() => Promise<Serie | null>) | undefined;

/** In the Worker: the reader of the series the scheduled event keeps in KV. */
export function configureSerie(read?: () => Promise<Serie | null>) {
  serieReader = read;
}

/**
 * In the Worker's scheduled event: the state's last measurement of each active buoy added to its series, the days
 * older than SERIE_JOURS dropped, then getCampTR for a buoy whose series is empty or has a hole, once a day at most.
 * Throws after writing when a getCampTR failed, for the logs.
 */
export async function completer(before: Serie | null, write: (s: Serie) => Promise<void>, now = new Date(), state?: Etat | null): Promise<string> {
  const t = now.getTime();
  if (!apiKey) return "sans clé";
  const etat = state === undefined ? (reader ? await reader() : null) : state;
  const from = t - SERIE_JOURS * DAY;
  const serie: Serie = {
    bouees: {},
    essai: t,
    ...(before?.tr ? { tr: { ...before.tr } } : {}),
    ...(before?.rempli ? { rempli: { ...before.rempli } } : {}),
    ...(before?.trou_vu ? { trou_vu: { ...before.trou_vu } } : {}),
    ...(before?.pause_jusqu_a && before.pause_jusqu_a > t ? { pause_jusqu_a: before.pause_jusqu_a } : {}),
  };
  for (const [code, b] of Object.entries(before?.bouees ?? {})) {
    const points = fusion(b.points, [], from);
    if (points.length) serie.bouees[code] = { ...b, points };
  }
  let ajoutes = 0;
  for (const m of Object.values(etat?.mesures ?? {})) {
    if (m.t < from) continue;
    const b = serie.bouees[m.code] ?? { hauteur_selon: m.hauteur_selon, periode_selon: m.periode_selon, points: [] };
    const n = b.points.length;
    serie.bouees[m.code] = { hauteur_selon: m.hauteur_selon, periode_selon: m.periode_selon, points: fusion(b.points, [pointOf(m)], from) };
    ajoutes += serie.bouees[m.code].points.length - n;
  }
  const actives = Object.keys(etat?.types?.actives ?? {}).sort();
  let asked = 0;
  try {
    for (const code of actives) {
      if (serie.pause_jusqu_a) break;
      // Not filled yet from the start of the days: from there, whatever the state added since. Else its first hole
      // not asked for in vain.
      const premier = !serie.rempli?.[code];
      const trou = premier ? from : premierTrou(serie.bouees[code]?.points ?? [], from, serie.trou_vu?.[code]);
      if (trou == null || t - (serie.tr?.[code] ?? 0) < DAY) continue;
      serie.tr = { ...serie.tr, [code]: t };
      asked++;
      const dateDeb = new Date(Math.max(trou, from)).toISOString().slice(0, 10);
      const ms = parseSerieTR(await ask(`getCampTR.php?camp=${code}&dateDeb=${dateDeb}&dateFin=${new Date(t + DAY).toISOString().slice(0, 10)}`), code);
      if (ms.length) {
        if (premier) serie.rempli = { ...serie.rempli, [code]: t };
        const last = ms[ms.length - 1];
        const b = serie.bouees[code] ?? { hauteur_selon: last.hauteur_selon, periode_selon: last.periode_selon, points: [] };
        const n = b.points.length;
        serie.bouees[code] = { ...b, points: fusion(b.points, ms.map(pointOf), from) };
        ajoutes += serie.bouees[code].points.length - n;
      }
      // A hole getCampTR did not fill: the buoy did not measure then. Not asked again.
      if (!premier && premierTrou(serie.bouees[code]?.points ?? [], from, serie.trou_vu?.[code]) === trou) serie.trou_vu = { ...serie.trou_vu, [code]: trou };
    }
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : undefined;
    serie.echec = { at: t, ...(status ? { status } : {}), message: err instanceof Error ? err.message : String(err) };
    // A quota reached or an address banned: no getCampTR before the next day.
    if (status === 429 || status === 423 || status === 401) serie.pause_jusqu_a = lendemain(t);
    await write(serie);
    throw err;
  }
  await write(serie);
  return `${Object.keys(serie.bouees).length} bouées en série, ${ajoutes} mesures ajoutées, ${asked} requêtes`;
}

/** The series the scheduled event keeps: read from KV in the Worker; nothing elsewhere. */
export async function serie(cache: Cache) {
  return cache.get(SERIE_KEY, READ_SECONDS, async () => {
    const v = serieReader ? await serieReader() : null;
    if (!v?.bouees) throw new UpstreamError(SOURCE.id, "série des bouées absente du stockage");
    return v;
  });
}
