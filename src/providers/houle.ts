/**
 * Wave forecasts of two wave models, served by Open-Meteo's marine API: Météo-France's MFWAM (1/12°, for the Copernicus
 * Marine service of the EU) and the ECMWF's WAM (9 km). No key; free API for non-commercial use. A FORECAST, never a
 * measurement, and never mixed with one: the Candhis buoys of the Cerema (providers/candhis.ts) are the measurement,
 * but none of the island's publishes any (all inactive, the last measures in April 2023, read 08/11/2026).
 *
 * MFWAM splits the main swell from the rest of the sea, which WAM does not. But its sea cells keep off part of the
 * coast: the nearest one lies 16 km from Saint-Denis, 17 km from Saint-Benoît and 20 km from Sainte-Marie, off another
 * stretch of coast, where WAM has one within 3 to 9 km of every beach; west and south, MFWAM's lie 1 to 5 km off the
 * beaches (checked 08/11/2026). So every point of the coast is asked of both models, and each place reads the model
 * whose cell is near it (tools/mer.ts, `wavesAt`). MFWAM gives no peak period at all (null at every step): its mean
 * period stands in for it, said as such; its main swell's own period jumps from one system to the other where two
 * swells of a like height cross (5.5 to 10 s from one step to the next off Saint-Pierre, 08/11/2026).
 *
 * Every point of the coast goes in one request per model (Open-Meteo takes lists of coordinates), and both go in one
 * copy: two subrequests for the island. One model down, the other's points stand alone.
 */
import type { Cache, Cached } from "../cache.js";
import { getJson } from "../http.js";
import { type SourceInfo, why } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "openmeteo_houle",
  nom: "Prévision des vagues du modèle WAM du Centre européen (ECMWF), via Open-Meteo",
  organisme: "ECMWF (données ouvertes, modèle de vagues WAM), diffusé par Open-Meteo",
  licence: "CC BY 4.0 (ECMWF et Open-Meteo)\u00a0; API Open-Meteo gratuite réservée aux usages non commerciaux",
  attribution: "Marine data by Open-Meteo.com <https://open-meteo.com/>\u00a0; modèle de vagues WAM, ECMWF",
  url: "https://open-meteo.com/en/docs/marine-weather-api",
};

export const SOURCE_MF: SourceInfo = {
  id: "openmeteo_houle_mf",
  nom: "Prévision des vagues du modèle MFWAM de Météo-France (service Copernicus Marine), via Open-Meteo",
  organisme: "Météo-France pour le service Copernicus Marine de l'Union européenne (modèle de vagues MFWAM), diffusé par Open-Meteo",
  licence: "Licence du service Copernicus Marine (libre, à citer) et CC BY 4.0 (Open-Meteo)\u00a0; API Open-Meteo gratuite réservée aux usages non commerciaux",
  attribution: "Generated using E.U. Copernicus Marine Service Information <https://doi.org/10.48670/moi-00017>\u00a0; marine data by Open-Meteo.com <https://open-meteo.com/>",
  url: "https://open-meteo.com/en/docs/marine-weather-api",
};

export type ModelId = "wam" | "mfwam";

export interface WaveModel {
  nom: string;
  maille_km: number;
  echeance_jours: number;
  mise_a_jour: string;
  source: SourceInfo;
}

export const MODEL: WaveModel = {
  nom: "WAM du Centre européen (ECMWF)",
  maille_km: 9,
  echeance_jours: 4,
  mise_a_jour: "toutes les 6 h",
  source: SOURCE,
};

/** Its cells are 1/12° apart: 9.3 km north to south, 8.6 km east to west at the island. */
export const MODEL_MF: WaveModel = {
  nom: "MFWAM de Météo-France",
  maille_km: 9,
  echeance_jours: 4,
  mise_a_jour: "toutes les 12 h",
  source: SOURCE_MF,
};

export const MODELS: Record<ModelId, WaveModel> = { wam: MODEL, mfwam: MODEL_MF };

/** Open-Meteo's name of each model, and what is asked of it. */
const ASKED: Record<ModelId, { models: string; hourly: string }> = {
  wam: { models: "ecmwf_wam", hourly: "wave_height,wave_peak_period,wave_direction" },
  mfwam: { models: "meteofrance_wave", hourly: "wave_height,wave_period,wave_direction,swell_wave_height" },
};

const API = "https://marine-api.open-meteo.com/v1/marine";
const FRESH_SECONDS = 30 * 60;
/** Steps kept: the model's own are 3-hourly beyond the first days, and three hours is how the answers read. */
export const STEP_H = 3;
const HOUR = 3600_000;

type Series = (number | null)[];

interface MarineJson {
  latitude: number;
  longitude: number;
  utc_offset_seconds: number;
  hourly: { time: string[]; wave_height: Series; wave_peak_period?: Series; wave_period?: Series; wave_direction: Series; swell_wave_height?: Series };
}

/** One point of the coast: a model's sea cell, and its steps from `debut`, every STEP_H hours. */
export interface WavePoint {
  /** Missing on a copy written before MFWAM came: WAM's. */
  modele?: ModelId;
  lat: number;
  lon: number;
  /** Significant height, in metres. */
  hauteur: Series;
  /**
   * In seconds. WAM: the peak period, that of the waves carrying the most energy, the swell's when there is one.
   * MFWAM: the mean period of all the waves, shorter than the peak's.
   */
  periode: Series;
  /** MFWAM only: the significant height of the main swell, in metres. */
  houle?: Series;
  /** Where the waves come from, in degrees. */
  direction: Series;
}

export interface Waves {
  /** Epoch milliseconds of the first step. */
  debut: number;
  points: WavePoint[];
}

function url(points: { lat: number; lon: number }[], model: ModelId): string {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(3)).join(","),
    longitude: points.map((p) => p.lon.toFixed(3)).join(","),
    ...ASKED[model],
    forecast_days: String(MODEL.echeance_jours),
    // Local hours: the steps start at 0, 3, 6… h in Réunion, as the weather forecast's do.
    timezone: "Indian/Reunion",
    // A beach's own cell is land for a wave model: the nearest one at sea.
    cell_selection: "sea",
  });
  return `${API}?${q}`;
}

const round = (v: number | null | undefined, k: number) => (typeof v === "number" ? Math.round(v * k) / k : null);

export function parse(raw: MarineJson | MarineJson[], model: ModelId = "wam"): Waves {
  const all = Array.isArray(raw) ? raw : [raw];
  const times = all[0]?.hourly.time ?? [];
  // Times come as local wall-clock strings ("2026-10-24T15:00"); the offset makes them instants.
  const keep = times.flatMap((t, i) => (Number(t.slice(11, 13)) % STEP_H === 0 ? [i] : []));
  return {
    debut: keep.length ? Date.parse(`${times[keep[0]]}:00Z`) - all[0].utc_offset_seconds * 1000 : 0,
    points: all.map((j) => {
      const h = j.hourly;
      const period = (model === "mfwam" ? h.wave_period : h.wave_peak_period) ?? [];
      return {
        modele: model,
        lat: j.latitude,
        lon: j.longitude,
        hauteur: keep.map((i) => round(h.wave_height[i], 10)),
        periode: keep.map((i) => round(period[i], 1)),
        direction: keep.map((i) => round(h.wave_direction[i], 1)),
        ...(model === "mfwam" ? { houle: keep.map((i) => round(h.swell_wave_height?.[i], 10)) } : {}),
      };
    }),
  };
}

/** The time of step `i`. */
export const stepTime = (w: Waves, i: number) => new Date(w.debut + i * STEP_H * HOUR);

/** The model of a point: WAM's on a copy written before MFWAM came. */
export const modelOf = (p: WavePoint): ModelId => p.modele ?? "wam";

/**
 * The forecast of both models at every point of `points`, WAM's then MFWAM's, each in their order: one request per
 * model, kept half an hour. One model down, the other's alone; both down, the error.
 */
export async function coast(cache: Cache, key: string, points: { lat: number; lon: number }[]): Promise<Cached<Waves>> {
  return cache.get(`houle:${key}`, FRESH_SECONDS, async () => {
    const ids = Object.keys(ASKED) as ModelId[];
    const got = await Promise.allSettled(ids.map((m) => getJson<MarineJson | MarineJson[]>(MODELS[m].source.id, url(points, m))));
    const parts: Waves[] = [];
    got.forEach((g, i) => {
      if (g.status === "fulfilled") parts.push(parse(g.value, ids[i]));
      else console.error(`source ${MODELS[ids[i]].source.id} indisponible:`, why(g.reason));
    });
    if (!parts.length) throw (got[0] as PromiseRejectedResult).reason;
    // Both start at local midnight of the same day; a model whose steps start otherwise is left out rather than shifted.
    const same = parts.filter((p) => p.debut === parts[0].debut);
    return { debut: parts[0].debut, points: same.flatMap((p) => p.points) };
  });
}
