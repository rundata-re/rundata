/**
 * The vegetation fires seen by satellite: the hot spots of NASA's FIRMS (Fire Information for Resource Management
 * System) from the three VIIRS instruments (Suomi NPP, NOAA-20, NOAA-21, 375 m), over the island's box. Each satellite
 * passes over the island about twice a day: 4 to 6 looks a day in all, hours apart, none through thick cloud.
 *
 * A detection is a hot pixel, not a confirmed fire: a hot roof, an industrial site or an authorised burn give one
 * too. Every point is said as « détection satellite, faux positifs possibles ».
 *
 * The API takes one satellite per request and a free MAP_KEY (configure()). Without one, nothing is fetched, shown
 * or logged. NASA data, full and open sharing; credit NASA FIRMS.
 *
 * Two days are asked (`/2`): FIRMS's « 1 » is the current UTC day only, from 04:00 at La Réunion, which would drop the
 * night's passes each morning; the 24 hours are cut here (load). A satellite that stops publishing answers an empty
 * list, which reads as « no fire »: the last day each one has data for (FIRMS's data_availability, read a few times
 * a day) leaves out one silent for more than a day, said apart (`muets`).
 */
import { left, perInvocation } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import { placeAt } from "../places/resolve.js";
import { type SourceInfo, UpstreamError, why } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "nasa_firms",
  nom: "Feux actifs détectés par les satellites VIIRS (Suomi NPP, NOAA-20, NOAA-21)",
  organisme: "NASA FIRMS (LANCE, Earth Science Data and Information System)",
  licence: "Données de la NASA, partage libre et ouvert\u00a0; citer NASA FIRMS",
  attribution: "We acknowledge the use of data and/or imagery from NASA's FIRMS (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS).",
  url: "https://firms.modaps.eosdis.nasa.gov/",
};

export const LABEL = "détection satellite, faux positifs possibles";

const API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const AVAILABILITY = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv";
// The island, west, south, east, north.
const AREA = "55.2,-21.4,55.85,-20.85";
const SATELLITES: Record<string, string> = { VIIRS_SNPP_NRT: "Suomi NPP", VIIRS_NOAA20_NRT: "NOAA-20", VIIRS_NOAA21_NRT: "NOAA-21" };
/** One request per satellite, and the days they have data for. */
export const COST = Object.keys(SATELLITES).length + 1;
const FRESH_SECONDS = 30 * 60;
const AVAILABILITY_SECONDS = 6 * 3600;
const DAY_MS = 24 * 3600_000;

let mapKey: string | undefined;

export function configure(key?: string) {
  mapKey = key?.trim() || undefined;
}

export function enabled(): boolean {
  return !!mapKey;
}

export type Confiance = "faible" | "moyenne" | "forte";
const CONFIANCE: Record<string, Confiance> = { l: "faible", n: "moyenne", h: "forte" };

export interface Detection {
  lat: number;
  lon: number;
  /** When the satellite saw it, ISO (UTC). */
  t: string;
  satellite: string;
  confiance: Confiance;
  /** Fire radiative power, MW. */
  frp_mw: number | null;
  /** The nearest place of the gazetteer, and its commune. */
  lieu: string;
  commune: string;
}

export interface Feux {
  detections: Detection[];
  /** The satellites whose list came back. */
  satellites: string[];
  /** The satellites left out, FIRMS having nothing of theirs for more than a day: their last day, YYYY-MM-DD (UTC). */
  muets?: { nom: string; dernier_jour: string }[];
}

/** FIRMS's data_availability: « data_id,min_date,max_date », one line per product. The last day of each one. */
export function parseAvailability(csv: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of csv.trim().split(/\r?\n/).slice(1)) {
    const [id, , last] = row.split(",").map((x) => x.trim());
    if (id && /^\d{4}-\d{2}-\d{2}$/.test(last ?? "")) out[id] = last;
  }
  return out;
}

/** Silent: its last day of data before yesterday (UTC), when FIRMS said it. */
export function silent(lastDay: string | undefined, now: Date): boolean {
  return !!lastDay && lastDay < new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
}

/** One satellite's CSV: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,… */
export function parse(csv: string, satellite: string): Detection[] {
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = (head ?? "").split(",");
  const at = (name: string) => cols.indexOf(name);
  const [iLat, iLon, iDate, iTime, iConf, iFrp] = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp"].map(at);
  if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) return [];
  return rows.flatMap((row) => {
    const f = row.split(",");
    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    const hhmm = (f[iTime] ?? "").trim().padStart(4, "0");
    const t = new Date(`${f[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(t.getTime())) return [];
    const frp = Number(f[iFrp]);
    const p = placeAt(lon, lat);
    return [{ lat, lon, t: t.toISOString(), satellite, confiance: CONFIANCE[(f[iConf] ?? "").trim().toLowerCase()] ?? "moyenne", frp_mw: iFrp >= 0 && Number.isFinite(frp) ? frp : null, lieu: p.nom, commune: p.commune }];
  });
}

/** The last day of data of each satellite, or {} when FIRMS does not say: then every satellite is asked. */
async function availability(cache: Cache): Promise<Record<string, string>> {
  try {
    return (await cache.island("feux:dispo", AVAILABILITY_SECONDS, async () => parseAvailability(await getText(SOURCE.id, `${AVAILABILITY}/${mapKey}/ALL`)))).value;
  } catch (err) {
    console.error(`source ${SOURCE.id} : jours disponibles non lus:`, scrub(why(err)));
    return {};
  }
}

async function island(cache: Cache, now: Date): Promise<Cached<Feux>> {
  return cache.island("feux:ile", FRESH_SECONDS, async () => {
    const days = await availability(cache);
    const asked = Object.entries(SATELLITES).filter(([id]) => !silent(days[id], now));
    const muets = Object.entries(SATELLITES).filter(([id]) => silent(days[id], now)).map(([id, nom]) => ({ nom, dernier_jour: days[id] }));
    const lists = await Promise.allSettled(asked.map(async ([id, nom]) => parse(await getText(SOURCE.id, `${API}/${mapKey}/${id}/${AREA}/2`), nom)));
    const ok = lists.flatMap((r, i) => (r.status === "fulfilled" ? [{ nom: asked[i][1], list: r.value }] : []));
    if (!ok.length) throw (lists[0] as PromiseRejectedResult | undefined)?.reason ?? new UpstreamError(SOURCE.id, "aucun satellite");
    const detections = ok.flatMap((x) => x.list).sort((x, y) => y.t.localeCompare(x.t));
    return { detections, satellites: ok.map((x) => x.nom), ...(muets.length ? { muets } : {}) };
  });
}

/**
 * The fires seen in the 24 hours before `now`, newest first, or null: without a key, with less than twice the cost
 * left (a page must keep its other writes), or when FIRMS does not answer. Never throws. Once per invocation: a page
 * built from a tool's answer gets the same fires as the answer, whatever is left after it.
 */
export function feuxNow(cache: Cache, now: Date): Promise<(Feux & { fetchedAt: Date }) | null> {
  if (!enabled()) return Promise.resolve(null);
  const memo = perInvocation("feux", () => ({}) as { seen?: Promise<(Feux & { fetchedAt: Date }) | null> });
  return (memo.seen ??= load(cache, now));
}

async function load(cache: Cache, now: Date): Promise<(Feux & { fetchedAt: Date }) | null> {
  if (left() < 2 * COST) return null;
  try {
    const c = await island(cache, now);
    const since = now.getTime() - DAY_MS;
    return { detections: c.value.detections.filter((d) => Date.parse(d.t) >= since), satellites: c.value.satellites, ...(c.value.muets ? { muets: c.value.muets } : {}), fetchedAt: c.fetchedAt };
  } catch (err) {
    console.error(`source ${SOURCE.id} indisponible:`, scrub(why(err)));
    return null;
  }
}

/** The key sits in the request's path: never in a log line, whatever an error ends up saying. */
const scrub = (s: string) => (mapKey ? s.split(mapKey).join("<MAP_KEY>") : s);
