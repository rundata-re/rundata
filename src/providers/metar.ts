/**
 * METAR of the two airports, from NOAA aviationweather.gov. No key, every 30 minutes, ~20 min latency.
 * Temperature and dew point are whole degrees, so the humidity computed from them is ±5 %.
 */
import { isScheduled } from "../budget.js";
import type { Cache } from "../cache.js";
import { getJson, patiently } from "../http.js";
import type { Observation, Reading, SourceInfo, Station } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "metar",
  nom: "Observations aéroport (METAR)",
  organisme: "Météo-France, diffusé par NOAA aviationweather.gov",
  licence: "Données OMM diffusées librement (NOAA, domaine public)",
  attribution: "Météo-France / NOAA aviationweather.gov",
  url: "https://aviationweather.gov/data/api/",
};

const URL = "https://aviationweather.gov/api/data/metar?ids=FMEE,FMEP&format=json&hours=3";
/**
 * Shared through KV (web/partagees.ts), brought up to date by the scheduled event every SHARED_EVERY minutes with its
 * patience: a visit or a question reads the source itself only when that copy is older than this. Visits read it with
 * 15 s, and from 06/11 to 13/11/2026 it gave up on aviationweather.gov 6 to 14 times a day, mostly between 16:00 and
 * 23:00 in La Réunion, the source up to date (Worker's logs).
 */
const FRESH_SECONDS = 15 * 60;
/** The scheduled event's refresh of the shared copy, minutes: the airports send a METAR every half hour or hour. */
export const SHARED_EVERY = 10;
export const KEY = "metar";

/**
 * The scheduled event's patience with aviationweather.gov, which nobody waits for: past the 21,7 s of its slowest answer
 * in 171 reads of 09/11/2026 (one every 5 minutes, 09:17 to 23:27; median 1,68 s, 8 over 15 s, each held before its
 * first byte, none lost). A visit or a question keeps the usual 15 s, and the copy of less than 5 minutes.
 */
export const PATIENCE_MS = 25_000;

// Positions and altitudes from the Météo-France station list (the METAR feed rounds them).
const STATIONS: Record<string, Station> = {
  FMEE: {
    source: "metar", id: "FMEE", nom: "Saint-Denis Gillot (aéroport Roland-Garros)", lon: 55.528667, lat: -20.892167,
    altitude_m: 8, variables: ["temperature", "humidite", "vent", "pression", "temps_present", "ciel"],
  },
  FMEP: {
    source: "metar", id: "FMEP", nom: "Saint-Pierre Pierrefonds (aéroport)", lon: 55.4255, lat: -21.32,
    altitude_m: 21, variables: ["temperature", "humidite", "vent", "pression", "temps_present", "ciel"],
  },
};

export interface MetarJson {
  icaoId: string;
  obsTime: number;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  altim?: number | null;
  wxString?: string | null;
  cover?: string | null;
  clouds?: { cover: string; base: number | null }[];
  rawOb: string;
}

/** Relative humidity from temperature and dew point (Magnus formula). */
export function humidity(t: number, td: number): number {
  const f = (x: number) => Math.exp((17.625 * x) / (243.04 + x));
  return Math.round((100 * f(td)) / f(t));
}

const KT_TO_KMH = 1.852;

const COVER: Record<string, string> = {
  CAVOK: "dégagé", SKC: "dégagé", CLR: "dégagé", NSC: "pas de nuage significatif", NCD: "dégagé",
  FEW: "quelques nuages", SCT: "nuages épars", BKN: "très nuageux", OVC: "couvert", OVX: "ciel invisible",
};

const COVER_ORDER = ["CAVOK", "SKC", "CLR", "NCD", "NSC", "FEW", "SCT", "BKN", "OVC", "OVX"];

const WX: Record<string, string> = {
  RA: "pluie", DZ: "bruine", SHRA: "averses", SH: "averses", TS: "orage", TSRA: "orage avec pluie",
  BR: "brume", FG: "brouillard", HZ: "brume sèche", FU: "fumée", VA: "cendres volcaniques", SQ: "grains",
  GR: "grêle", GS: "grésil", DU: "poussière", SA: "sable", PRFG: "brouillard partiel", BCFG: "bancs de brouillard",
  MIFG: "brouillard mince", VCSH: "averses à proximité", VCTS: "orage à proximité", VCFG: "brouillard à proximité",
};

/** "-SHRA BR" → "averses faibles, brume". Unknown groups are passed through. */
export function presentWeather(wx: string): string {
  return wx
    .trim()
    .split(/\s+/)
    .map((g) => {
      const intensity = g.startsWith("-") ? " faible" : g.startsWith("+") ? " fort" : "";
      const code = g.replace(/^[-+]/, "");
      const text = WX[code] ?? (code.startsWith("SH") && WX[code.slice(2)] ? `averses (${WX[code.slice(2)]})` : code);
      return text + intensity;
    })
    .join(", ");
}

export function parseMetar(rows: MetarJson[]): Observation[] {
  const latest = new Map<string, MetarJson>();
  for (const r of rows) {
    if (!STATIONS[r.icaoId]) continue;
    const cur = latest.get(r.icaoId);
    if (!cur || r.obsTime > cur.obsTime) latest.set(r.icaoId, r);
  }
  return [...latest.values()].map((m) => {
    const readings: Reading[] = [];
    if (m.temp != null) readings.push({ variable: "temperature", valeur: m.temp, unite: "°C", nature: "mesure" });
    if (m.temp != null && m.dewp != null) {
      readings.push({ variable: "humidite", valeur: humidity(m.temp, m.dewp), unite: "%", nature: "derive" });
      readings.push({ variable: "point_de_rosee", valeur: m.dewp, unite: "°C", nature: "mesure" });
    }
    if (m.wspd != null) {
      readings.push({ variable: "vent_moyen", valeur: Math.round(m.wspd * KT_TO_KMH), unite: "km/h", nature: "mesure" });
      if (typeof m.wdir === "number") {
        readings.push({ variable: "vent_direction", valeur: m.wdir, unite: "° (d'où vient le vent)", nature: "mesure" });
      } else if (m.wdir === "VRB") {
        readings.push({ variable: "vent_direction", valeur: "variable", nature: "mesure" });
      }
    }
    if (m.wgst != null) {
      readings.push({ variable: "rafales", valeur: Math.round(m.wgst * KT_TO_KMH), unite: "km/h", nature: "mesure" });
    }
    if (m.altim != null) readings.push({ variable: "pression_mer", valeur: m.altim, unite: "hPa", nature: "mesure" });
    if (m.wxString) readings.push({ variable: "temps_present", valeur: presentWeather(m.wxString), nature: "mesure" });
    // The most covering layer says how the sky looks: "SCT030 OVC048" is overcast, "BKN030 FEW250" is not.
    const cover = m.clouds?.length
      ? m.clouds.map((c) => c.cover).sort((a, b) => COVER_ORDER.indexOf(b) - COVER_ORDER.indexOf(a))[0]
      : m.cover;
    if (cover && COVER[cover]) readings.push({ variable: "ciel", valeur: COVER[cover], nature: "mesure" });
    return { station: STATIONS[m.icaoId], time: new Date(m.obsTime * 1000), readings, brut: m.rawOb };
  });
}

export function stations(): Station[] {
  return Object.values(STATIONS);
}

const read = () => getJson<MetarJson[]>(SOURCE.id, URL);

/**
 * The upstream JSON as received, so that any store (memory, KV) can hold it: patiently in the scheduled event, which
 * logs how long aviationweather.gov took to answer from Cloudflare (« METAR lu en 1 680 ms »), the measure the probes
 * from La Réunion could not give. A failure is logged by the cache (« source metar sans réponse »).
 */
export async function lire(): Promise<MetarJson[]> {
  if (!isScheduled()) return read();
  const t0 = Date.now();
  const rows = await patiently(PATIENCE_MS, read);
  console.log(`METAR lu en ${Date.now() - t0} ms`);
  return rows;
}

export async function observations(cache: Cache) {
  const raw = await cache.get(KEY, FRESH_SECONDS, lire);
  return { ...raw, value: parseMetar(raw.value) };
}
