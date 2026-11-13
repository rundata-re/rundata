/**
 * The particles measured by sensors that private people set up and share on two networks: Sensor.Community, a citizen
 * network of sensors (DbCL 1.0), and sensors.social, Robonomics' map (ODbL 1.0, its written yes of 09/11/2026,
 * providers/autorisations.ts). Not calibrated nor checked by Atmo Réunion: said apart from its index
 * (providers/atmo.ts), always under it, without an index, a colour or a threshold.
 *
 * Sensor.Community's filter by area gives the measures of its last 5 minutes. The scheduled event reads it for the whole
 * island every 15 minutes (`collect`, worker.ts), and sensors.social once an hour, as it asked; it keeps in KV each
 * sensor's last measure for 2 hours, written when it changed or an hour after; pages and tools read that copy
 * (`capteurs`), never the networks. A sensor is said by its commune alone: never its identifier, nor its place, which
 * both networks publish as precise as an address. Its identifier is kept in the store only, to tell one sensor's
 * measures from another's.
 */
import type { Cached } from "../cache.js";
import { getJson } from "../http.js";
import { placeAt } from "../places/resolve.js";
import { distanceKm } from "../geo.js";
import type { SourceInfo } from "../types.js";
import { autorisee } from "./autorisations.js";

export const SOURCE: SourceInfo = {
  id: "sensor_community",
  nom: "Capteurs amateurs de particules partagés sur Sensor.Community",
  organisme: "Sensor.Community, réseau citoyen de capteurs (Stuttgart), d'après les capteurs de particuliers",
  licence: "DbCL 1.0",
  attribution: "Sensor.Community",
  url: "https://sensor.community/",
};

/** The network's general map, never a sensor's page. */
export const CARTE = "https://maps.sensor.community/";
export const DBCL = "https://opendatacommons.org/licenses/dbcl/1-0/";
/** The official guide to build and share an airRohr sensor, read on 29/10/2026 at 10:53. */
export const GUIDE = "https://sensor.community/en/sensors/airrohr/";

export const SOURCE_SOCIAL: SourceInfo = {
  id: "sensors_social",
  nom: "Capteurs amateurs de particules partagés sur sensors.social",
  organisme: "sensors.social (Robonomics), d'après les capteurs de particuliers",
  licence: "ODbL 1.0",
  attribution: "Sensor data © sensors.social contributors, ODbL 1.0",
  url: "https://sensors.social/",
};
/** Its credit, as it asked it on 09/11/2026: in English, as on its map, wherever one of its measures is said. */
export const SOCIAL_CREDIT = SOURCE_SOCIAL.attribution;
export const ODBL = "https://opendatacommons.org/licenses/odbl/1-0/";
/** Its map, never a sensor's page. */
export const SOCIAL_CARTE = "https://sensors.social/";
/** Its guide to set up an Altruist sensor, read on 09/11/2026 at 15:15. */
export const SOCIAL_GUIDE = "https://sensors.social/altruist-setup/";
/** Its key in providers/autorisations.ts: not read until it agrees. */
export const SOCIAL_AUTORISATION = "capteurs:sensors_social";
export const SC = "Sensor.Community";
export const SS = "sensors.social";
export type Reseau = typeof SC | typeof SS;

// The island and its sea, as south, west, north, east.
const BOX = { south: -21.42, west: 55.2, north: -20.85, east: 55.87 };
const URL = `https://data.sensor.community/airrohr/v1/filter/box=${BOX.south.toFixed(2)},${BOX.west.toFixed(2)},${BOX.north.toFixed(2)},${BOX.east.toFixed(2)}`;
// The server behind sensors.social's map (RoSeMAN), as the map's own code calls it (src/providers/remote.js).
const ROSEMAN = "https://roseman.robonomics.network/api/v2/sensor/";
/** Asked by sensors.social: rundata.re's site and address in the User-Agent of its reads (ASCII only). */
export const SOCIAL_UA = "rundata.re (https://rundata.re; contact@rundata.re)";
/**
 * The island's sensors on sensors.social read at most: one request each, besides the list (1 on 09/11/2026). Past it,
 * the ones that sent last are kept. 3 until 14/11/2026, when the budget counted this read where it runs, in its own
 * queue after the event's reads (worker.ts, registre.ts `queue`): 11 requests an hour at most, in the hour's one pass
 * that sensors.social's condition allows (« une lecture par heure au plus pour l'île »).
 */
export const SOCIAL_MAX = 10;
/** Once an hour, at 10 past (UTC), the first of the hour's passes: sensors.social asked for one read an hour at most. */
export const socialDue = (now: Date) => refreshDue(now) && now.getUTCMinutes() < REFRESH_EVERY;

/** Written by the scheduled event (`collect`), read by worker.ts. */
export const KV_KEY = "capteurs:air";
export const KV_TTL_SECONDS = 86_400;
/** Every 15 minutes, at 10, 25, 40 and 55 past (UTC). */
export const REFRESH_EVERY = 15;
export const REFRESH_OFFSET = 10;
export const refreshDue = (now: Date) => (((now.getUTCMinutes() - REFRESH_OFFSET) % REFRESH_EVERY) + REFRESH_EVERY) % REFRESH_EVERY < 5;
/** A sensor is said only if it measured within this. */
export const WINDOW_MS = 2 * 3600_000;
// Farther than this from every place of the gazetteer, a point is at sea or off the island.
const ISLAND_KM = 10;

export interface Capteur {
  /** The network's identifier of the sensor, « ss: » before it for sensors.social: kept in the store, never said. */
  cle: string;
  /** sensors.social; none for Sensor.Community, as the copies written before it was read. */
  reseau?: typeof SS;
  commune: string;
  /** µg/m³. */
  pm10?: number;
  pm2_5?: number;
  /** When it measured (ISO, UTC), as the network says. */
  mesure_a: string;
}

export interface Copie {
  /** When the scheduled event last read a network (ISO, UTC). */
  lu: string;
  capteurs: Capteur[];
  /**
   * A network that did not answer while the other did, and since when (ISO, UTC): its sensors kept as last read until
   * their 2 hours are past, then the failure said, never that none measured.
   */
  echecs?: Partial<Record<Reseau, string>>;
}

/**
 * Stored instead of a copy when the network did not answer and nothing was read before: never an empty list, which
 * would say no sensor measured (a silent site is neither dead nor empty). `echec`, when reading began to fail (ISO, UTC).
 */
export interface Echec {
  echec: string;
  source: "sensor.community";
  /** When it was last written (ISO, UTC): again every 12 hours while the network fails, before the store drops it. */
  ecrit: string;
}

export type Stocke = Copie | Echec;

type Entry = {
  timestamp: string;
  location: { latitude: string; longitude: string; indoor?: number };
  sensor: { id: number };
  sensordatavalues: { value_type: string; value: string }[];
};

const value = (e: Entry, type: string) => {
  const v = e.sensordatavalues.find((x) => x.value_type === type)?.value;
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * The sensors of the island in an answer of the network: those outdoors with a value of particles (P1 is PM10, P2
 * PM2,5), each by its commune; its time in UTC, as the network writes it.
 */
export function parse(entries: Entry[]): Capteur[] {
  const out: Capteur[] = [];
  for (const e of entries) {
    if (e.location.indoor) continue;
    const pm10 = value(e, "P1");
    const pm2_5 = value(e, "P2");
    if (pm10 === undefined && pm2_5 === undefined) continue;
    const commune = communeAt(Number(e.location.latitude), Number(e.location.longitude));
    if (!commune) continue;
    out.push({
      cle: String(e.sensor.id),
      commune,
      ...(pm10 !== undefined && { pm10 }),
      ...(pm2_5 !== undefined && { pm2_5 }),
      mesure_a: `${e.timestamp.replace(" ", "T")}Z`,
    });
  }
  return out;
}

/** Each sensor's latest measure, among those kept and those read, if within the last 2 hours. */
export function merge(before: Capteur[], read: Capteur[], now: Date): Capteur[] {
  const by = new Map<string, Capteur>();
  for (const c of [...before, ...read]) {
    const had = by.get(c.cle);
    if (!had || Date.parse(c.mesure_a) > Date.parse(had.mesure_a)) by.set(c.cle, c);
  }
  return [...by.values()]
    .filter((c) => now.getTime() - Date.parse(c.mesure_a) <= WINDOW_MS)
    .sort((a, b) => a.commune.localeCompare(b.commune, "fr") || a.mesure_a.localeCompare(b.mesure_a));
}

// Unchanged, the copy is written again past this, so that its time says when the network was last read (an empty
// list is a reading too): 24 writes a day at most with no sensor.
const REWRITE_MS = 3600_000;

// The network's filter by area answered in 1.5 to 3.5 s on 29/10/2026, and past 30 s at times: waited for longer than
// the pages' reads, as only the scheduled event reads it (waiting is not CPU time).
const TIMEOUT_MS = 45_000;
// The failure is kept for a day in KV (KV_TTL_SECONDS): written again before, with its first time.
const ECHEC_REWRITE_MS = 12 * 3600_000;

type Marker = { sensor_id?: unknown; geo?: { lat?: unknown; lng?: unknown }; timestamp?: unknown };
type Point = { data?: Record<string, unknown>; timestamp?: unknown };

/** A place of the island, by its commune; undefined at sea or off it. */
function communeAt(lat: number, lon: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < BOX.south || lat > BOX.north || lon < BOX.west || lon > BOX.east) return undefined;
  const place = placeAt(lon, lat);
  return distanceKm(lon, lat, place.lon, place.lat) > ISLAND_KM ? undefined : place.commune;
}

/**
 * The island's sensors in sensors.social's list of the last hour, each by its commune and its identifier, the latest
 * to send first, SOCIAL_MAX at most. Its identifiers are hexadecimal or base 58: any other is left, never put in a path.
 */
export function socialMarkers(markers: Marker[]): { id: string; commune: string }[] {
  const out: { id: string; commune: string; at: number }[] = [];
  for (const m of markers) {
    const id = typeof m.sensor_id === "string" && /^[A-Za-z0-9]{8,128}$/.test(m.sensor_id) ? m.sensor_id : undefined;
    const commune = communeAt(Number(m.geo?.lat), Number(m.geo?.lng));
    if (id && commune) out.push({ id, commune, at: Number(m.timestamp) || 0 });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, SOCIAL_MAX).map(({ id, commune }) => ({ id, commune }));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** A sensor's latest measure of particles in its last hour on sensors.social (pm10, pm25), its time in UTC. */
export function socialLast(sensor: { id: string; commune: string }, points: Point[]): Capteur | undefined {
  let best: Capteur | undefined;
  let at = -Infinity;
  for (const p of points) {
    const t = Number(p.timestamp);
    const pm10 = num(p.data?.pm10);
    const pm2_5 = num(p.data?.pm25);
    if (!Number.isFinite(t) || t <= at || (pm10 === undefined && pm2_5 === undefined)) continue;
    at = t;
    best = {
      cle: `ss:${sensor.id}`,
      reseau: SS,
      commune: sensor.commune,
      ...(pm10 !== undefined && { pm10 }),
      ...(pm2_5 !== undefined && { pm2_5 }),
      mesure_a: new Date(t * 1000).toISOString().replace(/\.000Z$/, "Z"),
    };
  }
  return best;
}

/** sensors.social's last hour over the island: its list of sensors, then each of the island's (SOCIAL_MAX at most). */
export async function readSocial(now: Date): Promise<Capteur[]> {
  const end = Math.floor(now.getTime() / 1000);
  const start = end - 3600;
  const headers = { "User-Agent": SOCIAL_UA };
  const list = await getJson<{ result?: Marker[] }>(SOURCE_SOCIAL.id, `${ROSEMAN}markers/${start}/${end}`, TIMEOUT_MS, headers);
  const out: Capteur[] = [];
  for (const sensor of socialMarkers(Array.isArray(list?.result) ? list.result : [])) {
    const points = await getJson<{ result?: Point[] }>(SOURCE_SOCIAL.id, `${ROSEMAN}${sensor.id}/${start}/${end}`, TIMEOUT_MS, headers);
    const last = socialLast(sensor, Array.isArray(points?.result) ? points.result : []);
    if (last) out.push(last);
  }
  return out;
}

/**
 * The scheduled event's read: Sensor.Community's last 5 minutes over the island and, once an hour (`social`, when
 * sensors.social has agreed), sensors.social's last hour, merged with the copy. Writes it when the sensors kept or the
 * failures changed, or when it was written an hour ago or more. When no network answers: the copy kept as it is,
 * with its time; without one, the failure and its time, written once. When one answers and not the other: the copy
 * written, the other's failure and since when with it.
 */
export async function collect(before: Stocke | null, write: (s: Stocke) => Promise<void>, now = new Date(), social = false): Promise<string> {
  const failed = before && "echec" in before ? before : null;
  const kept = before && "capteurs" in before ? before : null;
  let entries: Entry[] | undefined;
  let scError: unknown;
  try {
    entries = await getJson<Entry[]>(SOURCE.id, URL, TIMEOUT_MS);
  } catch (err) {
    scError = err;
  }
  let fromSocial: Capteur[] | undefined;
  let ssError: unknown;
  if (social && autorisee(SOCIAL_AUTORISATION)) {
    try {
      fromSocial = await readSocial(now);
    } catch (err) {
      ssError = err;
    }
  }
  if (!entries && !fromSocial) {
    if (!before) await write({ echec: now.toISOString(), source: "sensor.community", ecrit: now.toISOString() });
    else if (failed && now.getTime() - Date.parse(failed.ecrit) >= ECHEC_REWRITE_MS) await write({ ...failed, ecrit: now.toISOString() });
    throw scError ?? ssError;
  }
  const echecs: Partial<Record<Reseau, string>> = { ...kept?.echecs };
  if (entries) delete echecs[SC];
  else echecs[SC] ??= failed?.echec ?? now.toISOString();
  if (fromSocial) delete echecs[SS];
  else if (ssError) echecs[SS] ??= now.toISOString();
  const fromSc = entries ? parse(entries) : undefined;
  const read = [...(fromSc ?? []), ...(fromSocial ?? [])];
  const capteurs = merge(kept?.capteurs ?? [], read, now);
  const said =
    `${fromSc ? `${fromSc.length} lus sur ${SC}` : `${SC} sans réponse`}` +
    `${fromSocial ? `, ${fromSocial.length} sur ${SS}` : ssError ? `, ${SS} sans réponse` : ""}, ${capteurs.length} des 2 dernières heures`;
  const same = kept && JSON.stringify(capteurs) === JSON.stringify(kept.capteurs) && JSON.stringify(echecs) === JSON.stringify(kept.echecs ?? {});
  if (same && now.getTime() - Date.parse(kept.lu) < REWRITE_MS) return `${said}, inchangés : non réécrits`;
  await write({ lu: now.toISOString(), capteurs, ...(Object.keys(echecs).length && { echecs }) });
  return `${said}, écrits`;
}

let reader: (() => Promise<Stocke | null>) | undefined;
let memo: { at: number; copie: Stocke } | undefined;

/** In the Worker: read the sensors from the KV store, where the scheduled event writes them, and the network never. */
export function configure(read: (() => Promise<Stocke | null>) | undefined) {
  reader = read;
  memo = undefined;
}

// The scheduled event writes every 15 minutes at most: the copy is asked of KV once in that time by an isolate.
const FRESH_MS = 15 * 60_000;
// A read writes the copy again an hour after at the latest (REWRITE_MS), at a pass every 15 minutes: older than this,
// the network has not been read since.
const RECENT_MS = REWRITE_MS + 2 * REFRESH_EVERY * 60_000;

/**
 * The stored sensors of the last 2 hours, their time the scheduled event's last write, or the failure to read them and
 * since when; null where nothing is configured (a local server, the tests), as the Worker alone has them. Fails while
 * the store has neither. A copy not written lately is `stale`, its sensors as last read: never dropped to none by
 * their age, which would say that no sensor measured when the network was not read (a silent site is neither dead nor
 * empty).
 * Read from KV directly and kept in memory, never through the data center's cache: 1 subrequest instead of 3 in the
 * build of /air's copy, which the scheduled event's budget counts (BUDGET.md).
 */
export async function capteurs(now = new Date()): Promise<Cached<Stocke> | null> {
  if (!reader) return null;
  if (!memo || now.getTime() - memo.at >= FRESH_MS) {
    const v = await reader();
    if (!v) throw new Error("capteurs amateurs absents du stockage");
    memo = { at: now.getTime(), copie: v };
  }
  const v = memo.copie;
  if ("echec" in v) return { value: v, fetchedAt: new Date(v.echec), stale: false };
  if (now.getTime() - Date.parse(v.lu) > RECENT_MS) return { value: v, fetchedAt: new Date(v.lu), stale: true };
  return { value: { ...v, capteurs: v.capteurs.filter((x) => now.getTime() - Date.parse(x.mesure_a) <= WINDOW_MS) }, fetchedAt: new Date(v.lu), stale: false };
}
