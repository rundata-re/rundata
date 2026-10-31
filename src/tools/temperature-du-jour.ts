/**
 * « Il a fait combien au plus chaud aujourd'hui ? » at a place: the lowest and the highest temperature since midnight at
 * a Météo-France station, from the hourly package already read for the rain of the last hours (its tn and tx, the
 * extremes within each hour), then the 6-minute slots of the hour under way. No request of its own.
 */
import { fr, paire } from "./format.js";
import type { RecentRain } from "../providers/meteofrance.js";
import type { Fit } from "./representativeness.js";
import { day, mins } from "./pluie-recente.js";

const HOUR_MS = 3_600_000;
const SLOT_MS = 6 * 60_000;
const LOCAL_MS = 4 * HOUR_MS;
/** « 20:42 », « 20:00 »: a time with its minutes, Réunion time. */
const hhmm = (ms: number) => paire(mins(ms), mins(ms), true)[0];

export interface StationTemperature {
  id: string;
  nom: string;
  fit: Fit;
}

interface Extreme {
  valeur: number;
  /** When: « entre 12 h et 13 h » for an hour, « à 20:42 » for a 6-minute measure. */
  quand: string;
}

/** True when the station has the extremes of its hours in the package (a copy saved before tn and tx were kept has not). */
export function hasExtremes(rain: RecentRain, id: string): boolean {
  const m = rain.hourly.mesures?.[id];
  return !!m?.tx?.some((v) => v != null) && !!m.tn?.some((v) => v != null);
}

/** The block for `station`, or undefined when nothing of today is measured there yet. */
export function todayTemperatureBlock(rain: RecentRain, station: StationTemperature, now: Date) {
  const m = rain.hourly.mesures?.[station.id];
  if (!m?.tx || !m.tn) return undefined;
  const t = now.getTime();
  const end = Date.parse(rain.hourly.end);
  const midnight = day(t) * 24 * HOUR_MS - LOCAL_MS;

  let max: Extreme | undefined;
  let min: Extreme | undefined;
  const meet = (hi: number | null | undefined, lo: number | null | undefined, quand: string) => {
    if (hi != null && (!max || hi > max.valeur)) max = { valeur: hi, quand };
    if (lo != null && (!min || lo < min.valeur)) min = { valeur: lo, quand };
  };
  // The full hours that began today, oldest first so that a tie keeps the first time it was reached.
  let missing = 0;
  for (let k = m.tx.length - 1; k >= 0; k--) {
    const e = end - k * HOUR_MS;
    if (e - HOUR_MS < midnight) continue;
    if (m.tx[k] == null || m.tn[k] == null) missing++;
    const [x, y] = paire(mins(e - HOUR_MS), mins(e));
    meet(m.tx[k], m.tn[k], `entre ${x} et ${y}`);
  }
  // Then the hour under way, from the 6-minute measures (a value at the slot's end, not the extreme within it).
  const slots = rain.slots(station.id).filter((s) => Date.parse(s.time) > Math.max(end, midnight)).reverse();
  for (const s of slots) meet(s.t, s.t, `à ${hhmm(Date.parse(s.time))}`);
  if (!max || !min) return undefined;

  const newest = slots.length ? Date.parse(slots.at(-1)!.time) : end;
  // The hours not read: before the first slot kept when the newest hour is late, and the hours the station left blank.
  const first = slots.length ? Date.parse(slots[0].time) - SLOT_MS : end;
  const gap = first - Math.max(end, midnight) > SLOT_MS;
  const periode = `de 00:00 à ${hhmm(newest)}`;
  const avertissements = [...station.fit.avertissements];
  if (missing || gap) {
    avertissements.push("Des mesures manquent depuis minuit : la température a pu monter plus haut ou descendre plus bas.");
  }
  return {
    station: station.nom,
    distance_km: station.fit.distance_km,
    ecart_altitude_m: station.fit.ecart_altitude_m,
    pertinence: station.fit.pertinence,
    nature: "mesure",
    periode,
    maximum: { valeur: max.valeur, unite: "°C", quand: max.quand },
    minimum: { valeur: min.valeur, unite: "°C", quand: min.quand },
    avertissements,
    resume: `Depuis minuit (${periode}) à ${station.nom}, à ${fr(station.fit.distance_km)} km : ${fr(max.valeur)} °C au plus (${max.quand}), ${fr(min.valeur)} °C au moins (${min.quand}).`,
  };
}
