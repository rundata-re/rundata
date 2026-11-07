/**
 * Météo-France ground stations, from the "Package Observations" API (DPPaquetObs v2). One call returns every
 * station in France for one 6-minute slot; about 56 of them are in Réunion, from the coast to the summits.
 * Needs a free key from portail-api.meteofrance.fr: without one this provider is off and the server answers
 * from the open sources only.
 *
 * A slot is published 2 to 10 minutes after its time and fills up as stations report, so the latest slots are
 * read together (each station's newest row wins) and each slot is re-read until it is final.
 */
import { isScheduled } from "../budget.js";
import type { Bundle, Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import { noteLecture } from "../lectures.js";
import type { Observation, Reading, Station } from "../types.js";
import { download, held, session, type Session } from "./mf-auth.js";
import { SOURCE, STATIONS_974, VEILLE, type Veille } from "./meteofrance-stations.js";

export { SOURCE, VEILLE, type Veille } from "./meteofrance-stations.js";

const BASE = "https://public-api.meteofrance.fr/public/DPPaquetObs/v2/paquet/stations/infrahoraire-6m";
const SLOT_MS = 6 * 60_000;
const FINAL_AFTER_MS = 15 * 60_000; // a slot no longer changes after this
const RECHECK_SECONDS = 2 * 60;
// Slots read per question: enough for the newest row of each station and the nine before it (rain over an hour).
const SLOTS = 11;
// The slots are kept together, one read and one write of the Worker's edge cache instead of eleven of each.
const BUNDLE = "meteofrance:6min";
const SYNC_SECONDS = 60;
// The same entries in the Worker's KV, written by the scheduled event alone, at each of its events (`refreshShared`):
// a question or a view whose data center's copy of a slot or of the hourly package is too old takes KV's when it is as
// fresh as its own would have to be, at one read of KV per isolate and per minute, rather than reading the slots again
// (meteo_actuelle, 31/10-07/11/2026: 44 calls of 76 read them, median 2.5 s, against 29 ms for the 32 others).
export const KV_BUNDLE = "meteofrance:6min:kv";

// The hourly package of the 974: every station's last days hour by hour in one call (about 900 kB of CSV), an hour
// being in it about 10 minutes after it ends (measured 25/10/2026). Kept in the same bundle as each station's rain
// over the last hours only, and asked again only once the next hour should be in it.
const HOURLY = "horaire";
const HOURLY_URL = "https://public-api.meteofrance.fr/public/DPPaquetObs/v2/paquet/horaire?id-departement=974&format=csv";
const HOUR_MS = 3_600_000;
const HOURLY_IN_MS = 15 * 60_000;
const HOURLY_RECHECK_SECONDS = 5 * 60;
export const HOURS_KEPT = 24;

export { configure, enabled, keepFresh, share, KV_KEY as TOKEN_KV_KEY, type Credentials, type Token } from "./mf-auth.js";

const STATIONS = new Map<string, Omit<Station, "variables">>(
  STATIONS_974.map(([id, nom, lat, lon, altitude_m]) => [id, { source: "meteofrance", id, nom, lon, lat, altitude_m }]),
);

export function stations(): Station[] {
  return [...STATIONS.values()].map((s) => ({ ...s, variables: [] }));
}

/** One station in one slot, in the published units (Kelvin, m/s, Pa), restricted to the columns used. */
export interface Row {
  id: string;
  time: string;
  t: number | null;
  td: number | null;
  u: number | null;
  dd: number | null;
  ff: number | null;
  raf10: number | null;
  rr_per: number | null;
  pmer: number | null;
}

const COLUMNS = ["t", "td", "u", "dd", "ff", "raf10", "rr_per", "pmer"] as const;

/** The Réunion rows of a slot (the CSV covers all of France). */
export function parseCsv(csv: string): Row[] {
  const head = csv.slice(0, csv.indexOf("\n")).trim().split(";");
  const at = (name: string) => head.indexOf(name);
  const id = at("geo_id_insee");
  const time = at("validity_time");
  // A regex rather than a split of all ~1 900 lines: the Worker has little CPU time per request.
  return (csv.match(/^[^;\n]*;[^;\n]*;974\d{5};.*$/gm) ?? []).map((line) => {
    const f = line.trim().split(";");
    const row = { id: f[id], time: f[time] } as Row;
    for (const c of COLUMNS) row[c] = f[at(c)] ? Number(f[at(c)]) : null;
    return row;
  });
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const celsius = (k: number) => r1(k - 273.15);
const kmh = (ms: number) => Math.round(ms * 3.6);

export function observation(row: Row, rain1h: number | null): Observation | null {
  const s = STATIONS.get(row.id);
  if (!s) return null; // a station opened after the list was taken: no name or altitude to show
  const readings: Reading[] = [];
  const add = (variable: string, valeur: number | string, unite?: string) =>
    readings.push({ variable, valeur, unite, nature: "mesure" });
  if (row.t != null) add("temperature", celsius(row.t), "°C");
  if (row.u != null) add("humidite", Math.round(row.u), "%");
  if (row.td != null) add("point_de_rosee", celsius(row.td), "°C");
  if (row.ff != null) {
    add("vent_moyen", kmh(row.ff), "km/h");
    if (row.dd != null && row.ff > 0) add("vent_direction", Math.round(row.dd), "° (d'où vient le vent)");
  }
  if (row.raf10 != null) add("rafales", kmh(row.raf10), "km/h");
  if (row.rr_per != null) add("pluie_6min", r1(row.rr_per), "mm en 6 min");
  if (rain1h != null) add("pluie_1h", r1(rain1h), "mm en 1 h");
  if (row.pmer != null) add("pression_mer", r1(row.pmer / 100), "hPa");
  if (!readings.length) return null;
  return { station: { ...s, variables: readings.map((r) => r.variable) }, time: new Date(row.time), readings };
}

function iso(ms: number) {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

// Re-read every two minutes while the slot fills up; once final, a copy taken after that point stays good.
const slotFresh = (start: number, now: number) => Math.max(RECHECK_SECONDS, (now - start - FINAL_AFTER_MS) / 1000);

/** The entry `key` of `b` if it is good for `freshSeconds`, as `Bundle.get` judges it. */
function good(b: Bundle | undefined, key: string, freshSeconds: number) {
  const e = b?.peek(key);
  return e && e.ageMs < freshSeconds * 1000 ? e : undefined;
}

/**
 * KV's copy of `key` (KV_BUNDLE) when this data center's is not good for `freshSeconds` and KV's is: served as the
 * data center's would be, and noted as it for the answer's freshness (lectures.ts), under the same key.
 */
async function fromKv<T>(b: Bundle, kv: (() => Promise<Bundle | undefined>) | undefined, key: string, freshSeconds: (e: unknown) => number): Promise<Cached<T> | undefined> {
  if (!kv || good(b, key, freshSeconds(b.peek(key)?.value))) return undefined;
  const k = await kv();
  const shared = good(k, key, freshSeconds(k?.peek(key)?.value));
  if (!shared) return undefined;
  noteLecture({ key: `${BUNDLE}|${key}`, fetchedAt: shared.fetchedAt, stale: false, freshSeconds: freshSeconds(shared.value) });
  return { value: shared.value as T, fetchedAt: new Date(shared.fetchedAt), stale: false };
}

/**
 * KV's copy (KV_BUNDLE) as the scheduled event's readers take it (/chiffres, the day before): the one the event's step
 * has just read and written (`refreshShared`, synced at each event), from this isolate's memory, never read again in
 * the event. KV is read here only when the isolate holds none, the step not having run (no token): one read in place
 * of the step's (registre.ts, meteofrance:stations).
 */
const inEvent = (cache: Cache) => cache.bundle(KV_BUNDLE, 24 * 3600, true);

/** KV's copy (KV_BUNDLE), read at the first need of a question and once a minute at most in an isolate. */
const kvOf = (cache: Cache) => {
  let p: Promise<Bundle | undefined> | undefined;
  return () => (p ??= cache.bundle(KV_BUNDLE, SYNC_SECONDS, true).catch(() => undefined));
};

async function slot(b: Bundle, start: number, now: number, s: Session, kv?: () => Promise<Bundle | undefined>): Promise<Cached<Row[]> | Error> {
  const date = iso(start);
  const fresh = slotFresh(start, now);
  try {
    const shared = await fromKv<Row[]>(b, kv, date, () => fresh);
    if (shared) return shared;
    return await b.get(date, fresh, async () =>
      parseCsv(await download(`${BASE}?date=${date}&format=csv`, s, getText)),
    );
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Each station's rain hour by hour. `end` is the end of the newest hour, as Météo-France dates its hourly values:
 * `rr[id][k]` is the rain from end − (k + 1) h to end − k h, null when the station did not report it.
 * `mesures[id]`: the rest of each hour, same order (the value at the hour's end, the wind averaged over its last 10
 * minutes, the strongest gust within it); absent from a copy saved before it was kept.
 */
export interface HourlyRain {
  end: string;
  rr: Record<string, (number | null)[]>;
  mesures?: Record<string, HourlyMeasures>;
}

/**
 * One station's hours, newest first: °C, %, degrees the wind comes from, km/h, km/h, hPa, minutes of sunshine, and the
 * lowest and highest temperature within the hour (°C); null when not reported. `ins`, `tn` and `tx` are absent from a
 * copy saved before they were kept, and `ins` is null at the stations without a sunshine recorder.
 */
export interface HourlyMeasures {
  t: (number | null)[];
  u: (number | null)[];
  dd: (number | null)[];
  ff: (number | null)[];
  raf: (number | null)[];
  pmer: (number | null)[];
  ins?: (number | null)[];
  tn?: (number | null)[];
  tx?: (number | null)[];
}

// The columns kept besides the rain, how each becomes the unit of HourlyMeasures, and its column when named otherwise.
const HOURLY_MEASURES: [keyof HourlyMeasures, (v: number) => number, string?][] = [
  ["t", celsius], ["u", Math.round], ["dd", Math.round], ["ff", kmh], ["raf", kmh], ["pmer", (pa) => r1(pa / 100)], ["ins", Math.round, "insolh"],
  ["tn", celsius], ["tx", celsius],
];

/**
 * The stations' hourly rain (rr1) and measures over the HOURS_KEPT hours up to the newest one in the package, at most
 * `newest`.
 */
export function parseHourly(csv: string, newest: number): HourlyRain {
  let end = Math.floor(newest / HOUR_MS) * HOUR_MS;
  while (end > newest - 6 * HOUR_MS && !csv.includes(`;${iso(end)};`)) end -= HOUR_MS;
  const hours = new Map(Array.from({ length: HOURS_KEPT }, (_, k) => [iso(end - k * HOUR_MS), k]));
  const rr: HourlyRain["rr"] = {};
  const mesures: Record<string, HourlyMeasures> = {};
  const none = () => Array<number | null>(HOURS_KEPT).fill(null);
  scanHours(csv, hours, ["rr1", ...HOURLY_MEASURES.map(([c, , col]) => col ?? c)], (station, k, [value, ...rest]) => {
    rr[station] ??= none();
    // The two airports write -0.1 now and then: no rain counted.
    if (value) rr[station][k] = Math.max(0, Number(value));
    const m = (mesures[station] ??= { t: none(), u: none(), dd: none(), ff: none(), raf: none(), pmer: none(), ins: none(), tn: none(), tx: none() });
    HOURLY_MEASURES.forEach(([c, unit], i) => {
      if (rest[i] && Number.isFinite(Number(rest[i]))) m[c]![k] = unit(Number(rest[i]));
    });
  });
  return { end: iso(end), rr, mesures };
}

/**
 * Each Réunion line of the hourly package whose time is one of `hours`: its station, the index of its hour, and the
 * text of the columns `cols` ("" when empty). Each line is only looked at up to its time, and read further only when
 * it is wanted, since a regex or a split of the whole of it takes the Worker's CPU time of a request.
 */
function scanHours(csv: string, hours: Map<string, number>, cols: string[], each: (station: string, k: number, values: string[]) => void) {
  const head = csv.slice(0, csv.indexOf("\n")).trim().split(";");
  const [id, time] = ["geo_id_insee", "validity_time"].map((c) => head.indexOf(c));
  const wanted = cols.map((c) => head.indexOf(c));
  const last = Math.max(id, ...wanted) + 1;
  for (let from = csv.indexOf("\n") + 1; from > 0 && from < csv.length; ) {
    let to = csv.indexOf("\n", from);
    if (to < 0) to = csv.length;
    // The start of each field: up to the time on every line, up to the last column wanted on the wanted ones only.
    const at = [from];
    for (let n = 1; n <= time + 1; n++) at.push(csv.indexOf(";", at[n - 1]) + 1);
    const k = hours.get(csv.slice(at[time], at[time] + 20));
    if (k != null) {
      for (let n = at.length; n <= last; n++) at.push(csv.indexOf(";", at[n - 1]) + 1);
      const station = csv.slice(at[id], at[id + 1] - 1);
      if (station.startsWith("974")) {
        // The line's last field has no ";" after it: it ends with the line.
        const end = (c: number) => (at[c + 1] > 0 && at[c + 1] <= to + 1 ? at[c + 1] - 1 : c === head.length - 1 ? to : -1);
        each(station, k, wanted.map((c) => (c >= 0 && end(c) >= 0 ? csv.slice(at[c], end(c)).trim() : "")));
      }
    }
    from = to + 1;
  }
}

/** The day `jour` (YYYY-MM-DD at La Réunion, UTC+4) at each station: only what it measured every hour of the 24. */
export function parseDay(csv: string, jour: string): Veille {
  // Météo-France dates an hour by its end: the day's first hour ends at 01:00, 21:00 UTC the day before.
  const start = Date.parse(`${jour}T00:00:00Z`) - 4 * HOUR_MS;
  const hours = new Map(Array.from({ length: 24 }, (_, k) => [iso(start + (k + 1) * HOUR_MS), k]));
  const got = new Map<string, { rr: (number | null)[]; tn: (number | null)[]; tx: (number | null)[] }>();
  scanHours(csv, hours, ["rr1", "tn", "tx"], (station, k, [rr, tn, tx]) => {
    let s = got.get(station);
    if (!s) got.set(station, (s = { rr: Array(24).fill(null), tn: Array(24).fill(null), tx: Array(24).fill(null) }));
    // The two airports write -0.1 now and then: no rain counted.
    if (rr) s.rr[k] = Math.max(0, Number(rr));
    if (tn) s.tn[k] = Number(tn);
    if (tx) s.tx[k] = Number(tx);
  });
  const all = (xs: (number | null)[]): xs is number[] => xs.every((x) => x != null && Number.isFinite(x));
  const stations: Veille["stations"] = {};
  for (const [id, s] of got) {
    const v = {
      ...(all(s.rr) && { rr: r1(s.rr.reduce((a, b) => a + b, 0)) }),
      ...(all(s.tn) && { tn: celsius(Math.min(...s.tn)) }),
      ...(all(s.tx) && { tx: celsius(Math.max(...s.tx)) }),
    };
    if (Object.keys(v).length) stations[id] = v;
  }
  return { jour, complet: csv.includes(`;${iso(start + 24 * HOUR_MS)};`), stations };
}

/**
 * The day `jour` as `parseDay` reads it, from the hourly package already parsed (`parseHourly`): its 24 hours are the
 * package's newest ones when it holds the day's last, which ends at its midnight.
 */
export function veilleDe(hourly: HourlyRain, jour: string): Veille {
  const start = Date.parse(`${jour}T00:00:00Z`) - 4 * HOUR_MS;
  const end = Date.parse(hourly.end);
  // Where the day's hour j (ending at start + (j + 1) h) is in the package's hours, newest first.
  const ks = Array.from({ length: 24 }, (_, j) => (end - (start + (j + 1) * HOUR_MS)) / HOUR_MS);
  const at = (xs: (number | null)[] | undefined) => ks.map((k) => (xs && k >= 0 && k < xs.length ? xs[k] : null));
  const all = (xs: (number | null)[]): xs is number[] => xs.every((x) => x != null && Number.isFinite(x));
  const stations: Veille["stations"] = {};
  for (const [id, r] of Object.entries(hourly.rr)) {
    const [rr, tn, tx] = [at(r), at(hourly.mesures?.[id]?.tn), at(hourly.mesures?.[id]?.tx)];
    const v = {
      ...(all(rr) && { rr: r1(rr.reduce((a, b) => a + b, 0)) }),
      ...(all(tn) && { tn: Math.min(...tn) }),
      ...(all(tx) && { tx: Math.max(...tx) }),
    };
    if (Object.keys(v).length) stations[id] = v;
  }
  return { jour, complet: end >= start + 24 * HOUR_MS, stations };
}

/** The passes that keep the day before: 00:20 at La Réunion (20:20 UTC), and 00:35 when its last hour was not out yet. */
export function veilleDue(now: Date): boolean {
  const m = now.getUTCMinutes();
  return now.getUTCHours() === 20 && ((m >= 20 && m < 25) || (m >= 35 && m < 40));
}

/**
 * At a pass of `veilleDue`: the day that just ended, from the hourly package of KV's copy (KV_BUNDLE), which the
 * event's step has just brought up to date (`refreshShared`), and kept, unless kept whole already. The package is
 * never read here: its hour is in that copy by 00:20 once Météo-France has put it out, and at 00:35 otherwise.
 */
export async function keepVeille(cache: Cache, now = new Date()): Promise<Veille | undefined> {
  const jour = iso(now.getTime() + 4 * HOUR_MS - 24 * HOUR_MS).slice(0, 10);
  if (now.getUTCMinutes() >= 35) {
    const kept = (await cache.kept<Veille>(VEILLE))?.value;
    if (kept?.jour === jour && kept.complet) return undefined;
  }
  const hourly = (await inEvent(cache)).peek(HOURLY)?.value as HourlyRain | undefined;
  if (!hourly) throw new Error("paquet horaire absent de la copie de KV");
  const v = veilleDe(hourly, jour);
  await cache.keep(VEILLE, v);
  return v;
}

/** The rain of the last hours: every station's hour by hour, and a station's 6-minute slots since the newest hour. */
export interface RecentRain {
  hourly: HourlyRain;
  /** The station's slots after `hourly.end` that are there, newest first, the temperature in °C. */
  slots(id: string): { time: string; rr: number | null; t?: number | null }[];
}

/** One hour of a station: `fin` ends it, the measures are null when not reported or not yet kept. */
export interface StationHour {
  fin: string;
  rr: number | null;
  t: number | null;
  u: number | null;
  dd: number | null;
  ff: number | null;
  raf: number | null;
  pmer: number | null;
  /** Minutes of sunshine in the hour. */
  ins: number | null;
}

/** A station's kept hours, newest first; empty when the package has none of it. */
export function stationHours(hourly: HourlyRain, id: string): StationHour[] {
  const rr = hourly.rr[id];
  if (!rr) return [];
  const m = hourly.mesures?.[id];
  const end = Date.parse(hourly.end);
  return rr.map((r, k) => ({
    fin: iso(end - k * HOUR_MS),
    rr: r,
    t: m?.t[k] ?? null,
    u: m?.u[k] ?? null,
    dd: m?.dd[k] ?? null,
    ff: m?.ff[k] ?? null,
    raf: m?.raf[k] ?? null,
    pmer: m?.pmer[k] ?? null,
    ins: m?.ins?.[k] ?? null,
  }));
}

/** How long the hourly package is good: until the next hour is due once it holds the newest one, else 5 minutes. */
function hourlyFresh(have: unknown, now: Date): number {
  const due = Math.floor((now.getTime() - HOURLY_IN_MS) / HOUR_MS) * HOUR_MS;
  const end = (have as HourlyRain | undefined)?.end;
  return end && Date.parse(end) >= due ? (2 * HOUR_MS) / 1000 : HOURLY_RECHECK_SECONDS;
}

/** The hourly package of `b`, read again when it is not good (`hourlyFresh`). */
const readHourly = (b: Bundle, now: Date) =>
  b.get(HOURLY, hourlyFresh(b.peek(HOURLY)?.value, now), async () => parseHourly(await download(HOURLY_URL, session(SOURCE.id), getText), now.getTime()));

/**
 * Undefined when the hourly package cannot be read. Call after `observations`, whose bundles it reads again without
 * I/O. In the scheduled event, KV's copy as the event's step left it, never read.
 */
export async function recentRain(cache: Cache, now = new Date()): Promise<RecentRain | undefined> {
  const latest = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  const rainOf = (hourly: HourlyRain, ...bs: (Bundle | undefined)[]): RecentRain => ({
    hourly,
    slots: (id) => {
      const out: { time: string; rr: number | null; t: number | null }[] = [];
      for (let t = latest; t > Date.parse(hourly.end); t -= SLOT_MS) {
        // The newer of the bundles' copies of the slot: a slot served from KV is not in the data center's.
        const e = bs.map((b) => b?.peek(iso(t))).reduce((a, x) => (x && (!a || x.fetchedAt > a.fetchedAt) ? x : a), undefined);
        const row = (e?.value as Row[] | undefined)?.find((r) => r.id === id);
        if (row) out.push({ time: row.time, rr: row.rr_per, t: row.t == null ? null : celsius(row.t) });
      }
      return out;
    },
  });
  if (isScheduled()) {
    const k = await inEvent(cache);
    const hourly = k.peek(HOURLY)?.value as HourlyRain | undefined;
    return hourly && rainOf(hourly, k);
  }
  const b = await cache.bundle(BUNDLE, SYNC_SECONDS);
  const kv = kvOf(cache);
  let hourly: HourlyRain;
  try {
    const shared = await fromKv<HourlyRain>(b, kv, HOURLY, (e) => hourlyFresh(e, now));
    hourly = shared?.value ?? (await readHourly(b, now)).value;
    await b.save();
  } catch (err) {
    console.error("pluie heure par heure indisponible", err instanceof Error ? err.message : String(err));
    return undefined;
  }
  // KV's copy beside, for the slots since the hour that `observations` took from it: already read then, if it was.
  const since = Array.from({ length: SLOTS }, (_, k) => latest - k * SLOT_MS).filter((t) => t > Date.parse(hourly.end));
  return rainOf(hourly, b, since.some((t) => !b.has(iso(t))) ? await kv() : undefined);
}

/** Rain over the hour ending with `time`, when all ten slots of that hour are there. */
function rainHour(byTime: Map<string, Row>, time: string): number | null {
  let sum = 0;
  for (let k = 0; k < 10; k++) {
    const rr = byTime.get(iso(Date.parse(time) - k * SLOT_MS))?.rr_per;
    if (rr == null) return null;
    sum += rr;
  }
  return sum;
}

/** The starts of the slots read, newest first. */
const starts = (now: Date) => {
  const latest = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  return Array.from({ length: SLOTS }, (_, k) => latest - k * SLOT_MS);
};

/** Forgets the slots older than the ones read; the hourly package stays. */
const dropOld = (b: Bundle, now: Date) => {
  const oldest = iso(starts(now)[SLOTS - 1]);
  b.drop((key) => key === HOURLY || key >= oldest);
};

/**
 * The scheduled event's step (worker.ts), at each event, before the shared copies: the slots and the hourly package
 * that a question would read again now (the same freshness), read into KV's copy (KV_BUNDLE), which is written once
 * when one was read. In the event, `observations` and `recentRain` then read that copy, never Météo-France: /chiffres's
 * count of the stations, the day before (`keepVeille`). What is good in it, said. It never takes a token: without one
 * held (`keepFresh` failed), it reads nothing, and the copy waits for the next event (registre.ts, meteofrance:stations).
 */
export async function refreshShared(cache: Cache, now = new Date()): Promise<{ creneaux: number; horaire?: string } | "sans jeton"> {
  if (!held()) return "sans jeton";
  const s = session(SOURCE.id);
  const b = await cache.bundle(KV_BUNDLE, SYNC_SECONDS, true);
  const got = await Promise.all(starts(now).map((t) => slot(b, t, now.getTime(), s)));
  const hourly = await readHourly(b, now).then((h) => h.value, () => undefined);
  dropOld(b, now);
  await b.save();
  return { creneaux: got.filter((g) => !(g instanceof Error) && !g.stale).length, ...(hourly && { horaire: hourly.end }) };
}

export async function observations(cache: Cache, now = new Date()): Promise<Cached<Observation[]>> {
  let got: (Cached<Row[]> | Error)[];
  if (isScheduled()) {
    // In the scheduled event: KV's copy as the event's step left it, a slot not good there said stale.
    const k = await inEvent(cache);
    got = starts(now).map((t) => {
      const e = k.peek(iso(t));
      return e ? { value: e.value as Row[], fetchedAt: new Date(e.fetchedAt), stale: e.ageMs >= slotFresh(t, now.getTime()) * 1000 } : new Error(`créneau ${iso(t)} absent de la copie de KV`);
    });
  } else {
    const s = session(SOURCE.id);
    const b = await cache.bundle(BUNDLE, SYNC_SECONDS);
    const kv = kvOf(cache);
    got = await Promise.all(starts(now).map((t) => slot(b, t, now.getTime(), s, kv)));
    dropOld(b, now);
    await b.save();
  }
  const ok = got.filter((g): g is Cached<Row[]> => !(g instanceof Error));
  if (!ok.length) throw got[0];

  const byStation = new Map<string, Map<string, Row>>();
  for (const g of ok) for (const row of g.value) {
    if (!byStation.has(row.id)) byStation.set(row.id, new Map());
    byStation.get(row.id)!.set(row.time, row);
  }
  const value: Observation[] = [];
  for (const byTime of byStation.values()) {
    const newest = [...byTime.values()].reduce((a, b) => (b.time > a.time ? b : a));
    const o = observation(newest, rainHour(byTime, newest.time));
    if (o) value.push(o);
  }
  // Stale when the newest slot with data could not be refreshed.
  const newestSlot = ok.find((g) => g.value.length) ?? ok[0];
  return {
    value,
    fetchedAt: new Date(Math.max(...ok.map((g) => g.fetchedAt.getTime()))),
    stale: newestSlot.stale,
  };
}

