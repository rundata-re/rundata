/**
 * Forecasts of the ECMWF IFS HRES model (9 km), served by Open-Meteo. No key; free API for non-commercial use.
 *
 * Why not Météo-France: over Réunion Open-Meteo only has ARPEGE World (0.25°, AROME covers mainland France only),
 * whose nearest grid points to Saint-Denis and Saint-Pierre are at sea: on 22/10/2026 it gave Saint-Denis a
 * 24 °C maximum while Gillot had measured 28 °C by 9 am. IFS HRES has a grid point on the town (27 °C).
 * Open-Meteo brings the temperature to the `elevation` it is given; rain, wind and clouds stay those of the cell.
 * The tool (tools/prevision.ts) only sees the Forecast type, so that Météo-France AROME outre-mer (0.025°) can
 * replace this source once its API is found.
 */
import type { Cache, Cached } from "../cache.js";
import { getJson } from "../http.js";
import type { Place } from "../places/resolve.js";
import type { Forecast, ForecastModel, SourceInfo } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "openmeteo",
  nom: "Prévisions du modèle IFS du Centre européen (ECMWF), via Open-Meteo",
  organisme: "ECMWF (données ouvertes IFS HRES), diffusé par Open-Meteo",
  licence: "CC BY 4.0 (ECMWF et Open-Meteo)\u00a0; API Open-Meteo gratuite réservée aux usages non commerciaux",
  attribution: "Weather data by Open-Meteo.com <https://open-meteo.com/>\u00a0; modèle IFS, ECMWF",
  url: "https://open-meteo.com/en/docs/ecmwf-api",
};

export const MODEL: ForecastModel = {
  nom: "IFS HRES du Centre européen (ECMWF)",
  maille_km: 9,
  // The model runs 15 days; past a week a point forecast says little.
  echeance_jours: 7,
  mise_a_jour: "toutes les 6 h",
};

const API = "https://api.open-meteo.com/v1/forecast";
const META = "https://api.open-meteo.com/data/ecmwf_ifs/static/meta.json";
const FRESH_SECONDS = 30 * 60;
// IFS HRES runs every 6 hours (meta.json's update_interval_seconds): a cell's forecast read once serves until the next.
const RUN_EVERY_SECONDS = 6 * 3600;
// The forecast of a cell kept in KV as the copy served when Open-Meteo does not answer: older than a day, it says little.
const KEEP_SECONDS = 24 * 3600;

const HOURLY = ["temperature_2m", "precipitation", "weather_code", "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"];
const DAILY = ["weather_code", "temperature_2m_min", "temperature_2m_max", "precipitation_sum", "wind_gusts_10m_max"];

type Series = (number | null)[];

export interface OpenMeteoJson {
  latitude: number;
  longitude: number;
  utc_offset_seconds: number;
  elevation: number;
  hourly: { time: string[] } & Record<string, Series | string[]>;
  daily: { time: string[] } & Record<string, Series | string[]>;
}

interface MetaJson {
  last_run_initialisation_time: number;
  /** When the run was out, in seconds: the forecasts read before it are those of the run before. */
  last_run_availability_time?: number;
}

/** What is sent to Open-Meteo: the point to 0.01° (about 1 km, the grid is 9 km), the altitude to 10 m. */
const asked = (place: Place) => ({
  lat: place.lat.toFixed(2),
  lon: place.lon.toFixed(2),
  altitude: place.altitude_m == null ? undefined : Math.round(place.altitude_m / 10) * 10,
});

/** Places that send Open-Meteo the same request share one copy, in KV for every data center. */
export function cacheKey(place: Place): string {
  const a = asked(place);
  return `openmeteo:${a.lat},${a.lon},${a.altitude ?? "dem"}`;
}

function url(place: Place): string {
  const a = asked(place);
  const q = new URLSearchParams({
    latitude: a.lat,
    longitude: a.lon,
    models: "ecmwf_ifs",
    timezone: "Indian/Reunion",
    forecast_days: String(MODEL.echeance_jours),
    hourly: HOURLY.join(","),
    daily: DAILY.join(","),
  });
  // Without it, Open-Meteo uses its own 90 m terrain model at that point, which is just as good on flat ground.
  if (a.altitude != null) q.set("elevation", String(a.altitude));
  return `${API}?${q}`;
}

const num = (s: Series | string[] | undefined, i: number): number | null => {
  const v = s?.[i];
  return typeof v === "number" ? v : null;
};

export function parse(j: OpenMeteoJson, runAt?: Date): Forecast {
  // Times come as local wall-clock strings ("2026-10-22T13:00"); the offset makes them instants.
  const toDate = (t: string) => new Date(Date.parse(`${t}:00Z`) - j.utc_offset_seconds * 1000);
  const h = j.hourly;
  const d = j.daily;
  return {
    model: MODEL,
    source: SOURCE,
    runAt,
    grid: { lat: j.latitude, lon: j.longitude },
    altitude_m: j.elevation,
    // Open-Meteo gives rain and gusts over the hour before each time: shifted to the hour after it.
    hours: h.time.map((t, i) => ({
      time: toDate(t),
      duree_h: 1,
      temperature: num(h.temperature_2m, i),
      pluie_mm: num(h.precipitation, i + 1),
      code: num(h.weather_code, i),
      nuages_pct: num(h.cloud_cover, i),
      vent_kmh: num(h.wind_speed_10m, i),
      rafales_kmh: num(h.wind_gusts_10m, i + 1),
      vent_dir: num(h.wind_direction_10m, i),
    })),
    days: d.time.map((t, i) => ({
      date: t,
      code: num(d.weather_code, i),
      tmin: num(d.temperature_2m_min, i),
      tmax: num(d.temperature_2m_max, i),
      pluie_mm: num(d.precipitation_sum, i),
      rafales_max_kmh: num(d.wind_gusts_10m_max, i),
    })),
  };
}

async function runMeta(cache: Cache): Promise<MetaJson | undefined> {
  try {
    return (await cache.get("openmeteo:meta", FRESH_SECONDS, () => getJson<MetaJson>(SOURCE.id, META))).value;
  } catch {
    return undefined; // the run time is a nicety; the forecast stands without it
  }
}

/**
 * How long a cell's copy is fresh at `now` (ms), in seconds: one read since the run was out (`availableAt`, ms) is that
 * run's, one read before is the run before's. Without the run's time, or a run late, 6 hours at most.
 */
export function freshFor(now: number, availableAt?: number): number {
  if (availableAt == null) return RUN_EVERY_SECONDS;
  return Math.max(60, Math.min(RUN_EVERY_SECONDS, Math.floor((now - availableAt) / 1000)));
}

/**
 * The forecast of the place's cell: read once per run of the model, then the copy in KV for every place, question and
 * data center that asks the same (cacheKey), one read of KV each, without an index. The run's time comes first.
 */
export async function forecast(cache: Cache, place: Place): Promise<Cached<Forecast>> {
  const meta = await runMeta(cache);
  const available = meta && (meta.last_run_availability_time ?? meta.last_run_initialisation_time) * 1000;
  const raw = await cache.island(cacheKey(place), freshFor(cache.time(), available), () => getJson<OpenMeteoJson>(SOURCE.id, url(place)), KEEP_SECONDS);
  const f = parse(raw.value, meta && new Date(meta.last_run_initialisation_time * 1000));
  // The place's own altitude in the answer, the one its page shows: Open-Meteo answers with the one sent, to 10 m.
  return { ...raw, value: place.altitude_m == null ? f : { ...f, altitude_m: place.altitude_m } };
}
