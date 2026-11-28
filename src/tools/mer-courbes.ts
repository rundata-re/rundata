/**
 * The sea's curves and their figures: what the buoys measured (providers/candhis.ts, the series of 30 days), the
 * waves forecast at each buoy (providers/houle.ts), and the temperature of 30 days off four beaches by satellite
 * (providers/crw-serie.ts). One computation for the page /mer and the tool temperature_mer, so that both say the same
 * figures: the last value with its time, how it moved in 24 hours, the week's highest, and over the 30 days the mean,
 * the lowest and the highest. A measurement missing stays missing: a hole, never a value carried over.
 */
import { localTime } from "../geo.js";
import * as candhis from "../providers/candhis.js";
import { REFERENCE_OUTIL, type SerieMer } from "../providers/crw-serie.js";
import type * as houle from "../providers/houle.js";
import { fr } from "./format.js";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** The measurement 24 hours before is looked for this close to that time. */
const TREND_SLACK = HOUR;

/** The columns of a series' point (candhis.Point). */
export const CHAMPS = { hauteur: 1, hmax: 2, periode: 3, direction: 4, temperature: 5 } as const;
export type Champ = keyof typeof CHAMPS;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface Chiffres {
  /** The last value measured and when (epoch ms, or the day for a daily series). */
  derniere: number;
  le: number | string;
  /** The last value minus that of 24 hours before (the day before, for a daily series); missing without one. */
  sur_24h?: number;
  /** The highest of the last 7 days, and when; `depuis` is the first measurement when the series is younger than 7 days. */
  max_7j?: { valeur: number; le: number | string; depuis?: number };
  /** Over the whole period shown. */
  periode?: { moyenne: number; min: number; max: number; jours: number };
}

/** The figures of one column of a buoy's series, at `now`; undefined when it never measured it. */
export function chiffresBouee(points: candhis.Point[], champ: Champ, now: Date, periode = false): Chiffres | undefined {
  const k = CHAMPS[champ];
  const has = points.filter((p) => p[k] != null && p[0] <= now.getTime() + 10 * 60_000);
  if (!has.length) return undefined;
  const last = has[has.length - 1];
  const before = has.filter((p) => Math.abs(p[0] - (last[0] - DAY)) <= TREND_SLACK)
    .sort((a, b) => Math.abs(a[0] - (last[0] - DAY)) - Math.abs(b[0] - (last[0] - DAY)))[0];
  const week = has.filter((p) => p[0] > now.getTime() - 7 * DAY);
  const top = week.reduce<candhis.Point | undefined>((a, b) => (!a || b[k]! > a[k]! ? b : a), undefined);
  const vs = has.map((p) => p[k]!);
  return {
    derniere: last[k]!,
    le: last[0],
    ...(before ? { sur_24h: r2(last[k]! - before[k]!) } : {}),
    ...(top ? { max_7j: { valeur: top[k]!, le: top[0], ...(has[0][0] > now.getTime() - 7 * DAY ? { depuis: has[0][0] } : {}) } } : {}),
    ...(periode ? { periode: { moyenne: r2(vs.reduce((a, b) => a + b, 0) / vs.length), min: Math.min(...vs), max: Math.max(...vs), jours: Math.max(1, Math.round((last[0] - has[0][0]) / DAY)) } } : {}),
  };
}

/** The figures of one beach's daily series by satellite: the day before for « 24 h ». */
export function chiffresJours(jours: string[], vs: (number | null)[]): Chiffres | undefined {
  const at = vs.map((v, i) => [jours[i], v] as const).filter((x): x is readonly [string, number] => x[1] != null);
  if (!at.length) return undefined;
  const [jour, v] = at[at.length - 1];
  const i = jours.indexOf(jour);
  const before = i > 0 ? vs[i - 1] : null;
  const week = at.slice(-7);
  const top = week.reduce((a, b) => (b[1] > a[1] ? b : a));
  const all = at.map((x) => x[1]);
  return {
    derniere: v,
    le: jour,
    ...(before != null ? { sur_24h: r2(v - before) } : {}),
    max_7j: { valeur: top[1], le: top[0] },
    periode: { moyenne: r2(all.reduce((a, b) => a + b, 0) / all.length), min: Math.min(...all), max: Math.max(...all), jours: at.length },
  };
}

/**
 * A series on a grid of hours from `debut` (epoch ms): at each hour the measurement within half an hour of it, the
 * nearest; none, a hole.
 */
export function heures(points: candhis.Point[], champ: Champ, debut: number, n: number): (number | null)[] {
  const k = CHAMPS[champ];
  const out: (number | null)[] = new Array(n).fill(null);
  const gap: number[] = new Array(n).fill(Infinity);
  for (const p of points) {
    if (p[k] == null) continue;
    const i = Math.round((p[0] - debut) / HOUR);
    if (i < 0 || i >= n) continue;
    const d = Math.abs(p[0] - (debut + i * HOUR));
    if (d <= HOUR / 2 && d < gap[i]) {
      out[i] = p[k];
      gap[i] = d;
    }
  }
  return out;
}

/** Midnight in La Réunion (UTC+4) of the day of `t`, as epoch ms. */
export const minuitLocal = (t: number) => {
  const local = t + 4 * HOUR;
  return local - (local % DAY) - 4 * HOUR;
};

export interface CourbeBouee {
  code: string;
  nom: string;
  hauteur_selon: candhis.Mesure["hauteur_selon"];
  periode_selon: candhis.Mesure["periode_selon"];
  /** The hours of the waves' chart: the last 7 days and the 4 to come, from local midnight. */
  debut: number;
  hauteur: (number | null)[];
  hmax: (number | null)[];
  periode: (number | null)[];
  /** The hours of the temperature's chart: the last 30 days from local midnight, or from the day of its first measurement when later. */
  debut_t: number;
  temperature: (number | null)[];
  chiffres: Partial<Record<"hauteur" | "hmax" | "periode" | "temperature", Chiffres>>;
  /** The waves forecast at this buoy's place, when its place is known and the model covers it. */
  prevision?: CourbePrevision;
}

export interface CourbePrevision {
  /** The model's name (houle.WaveModel.nom) and its source's id. */
  modele: string;
  source: string;
  /** MFWAM's period is the mean one, WAM's the peak's. */
  periode_moyenne: boolean;
  /** The forecast steps on the waves' chart: its hour index of the first one, then one every `pas` hours. */
  premier: number;
  pas: number;
  hauteur: (number | null)[];
  periode: (number | null)[];
}

export interface Courbes {
  /** Every buoy with points, in the order of candhis.BOUEES: the same order whichever measured last. */
  bouees: CourbeBouee[];
  satellite?: SerieMer & { chiffres: (Chiffres | undefined)[]; ecart: (number | null)[] };
}

/** Days kept in the waves' chart before today, and after. */
export const AVANT = 6;
export const APRES = 4;

/**
 * Everything the curves need, from what was read: the series (null without the key), the waves forecast at each
 * buoy, and the satellite's days. Missing parts are left out, never invented.
 */
export function courbes(
  serie: candhis.Serie | null | undefined,
  crw: SerieMer | null | undefined,
  forecast: Forecast | undefined,
  now: Date,
): Courbes {
  const debut = minuitLocal(now.getTime()) - AVANT * DAY;
  const n = (AVANT + 1 + APRES) * 24;
  const debutT = minuitLocal(now.getTime()) - (candhis.SERIE_JOURS - 1) * DAY;
  const nT = candhis.SERIE_JOURS * 24;
  const bouees: CourbeBouee[] = candhis.BOUEES.flatMap((b) => {
    const s = serie?.bouees[b.code];
    if (!s?.points.length) return [];
    const pts = s.points.filter((p) => p[0] <= now.getTime() + 10 * 60_000);
    const chiffres = {
      hauteur: chiffresBouee(pts, "hauteur", now),
      hmax: chiffresBouee(pts, "hmax", now),
      periode: chiffresBouee(pts, "periode", now),
      temperature: chiffresBouee(pts, "temperature", now, true),
    };
    const prevision = previsionAu(b, forecast, now, debut, n);
    // The temperature's chart starts on the day of its first measurement: a buoy measuring for 3 days is not drawn on 30.
    const premierT = pts.find((p) => p[CHAMPS.temperature] != null)?.[0];
    const debutB = premierT != null ? Math.max(debutT, minuitLocal(premierT)) : debutT;
    return [{
      code: b.code,
      nom: b.nom,
      hauteur_selon: s.hauteur_selon,
      periode_selon: s.periode_selon,
      debut,
      hauteur: heures(pts, "hauteur", debut, n),
      hmax: heures(pts, "hmax", debut, n),
      periode: heures(pts, "periode", debut, n),
      debut_t: debutB,
      temperature: heures(pts, "temperature", debutB, nT - Math.round((debutB - debutT) / HOUR)),
      chiffres: Object.fromEntries(Object.entries(chiffres).filter(([, v]) => v)) as CourbeBouee["chiffres"],
      ...(prevision ? { prevision } : {}),
    }];
  });
  const satellite = crw?.jours.length
    ? { ...crw, chiffres: crw.points.map((p) => chiffresJours(crw.jours, p.sst)), ecart: crw.points.map((p) => [...p.ecart].reverse().find((v) => v != null) ?? null) }
    : undefined;
  return { bouees, ...(satellite ? { satellite } : {}) };
}

type Forecast = (lon: number, lat: number) => { steps: { time: Date; hauteur: number; periode: number | null }[]; model: houle.WaveModel; modele: houle.ModelId } | null;

/** The forecast steps at one buoy's place that fall on its waves' chart, or undefined without its place or the model. */
function previsionAu(b: candhis.Bouee, forecast: Forecast | undefined, now: Date, debut: number, n: number): CourbePrevision | undefined {
  const f = b.lat != null && b.lon != null && forecast ? forecast(b.lon, b.lat) : null;
  const steps = f?.steps.filter((s) => s.time.getTime() >= now.getTime() - 3 * HOUR && s.time.getTime() < debut + n * HOUR) ?? [];
  if (!f || !steps.length) return undefined;
  return {
    modele: f.model.nom,
    source: f.model.source.id,
    periode_moyenne: f.modele === "mfwam",
    premier: Math.round((steps[0].time.getTime() - debut) / HOUR),
    pas: steps.length > 1 ? Math.round((steps[1].time.getTime() - steps[0].time.getTime()) / HOUR) : 3,
    hauteur: steps.map((s) => s.hauteur),
    periode: steps.map((s) => s.periode),
  };
}

/** « Sainte-Marie » for « Sainte-Marie », « Saint-Pierre » for « Saint-Pierre (large) »: the place a buoy is off. */
export const auLargeDe = (nom: string) => nom.replace(/\s*\(large\)$/, "");

/**
 * The sentence that says which buoys measure, from those that do: « Une seule bouée, au large de Saint-Pierre : sa
 * mesure ne vaut pas pour toute l'île », « Deux bouées, au large de Sainte-Marie et de Saint-Pierre : … ».
 */
export function boueesDites(bouees: { nom: string }[]): string {
  const n = bouees.length;
  const lieux = bouees.map((b) => auLargeDe(b.nom));
  const ou = lieux.length > 1 ? `${lieux.slice(0, -1).join(", de ")} et de ${lieux.at(-1)}` : lieux[0];
  const combien = n === 1 ? "Une seule bouée" : n === 2 ? "Deux bouées" : n === 3 ? "Trois bouées" : `${n} bouées`;
  return `${combien}, au large de ${ou}\u00a0: ${n === 1 ? "sa mesure ne vaut" : "leurs mesures ne valent"} pas pour toute l'île.`;
}

/* Words, for the page and the tool alike. */

export const metres = (v: number) => `${fr(r1(v))}\u00a0m`;
export const secondes = (v: number) => `${fr(Math.round(v))}\u00a0s`;
export const degres = (v: number) => `${fr(r1(v))}\u00a0°C`;
/** « +0,3 °C », « \u22120,2 m », « stable » under a tenth. */
export function ecartDit(v: number, unite: "m" | "°C" | "s"): string {
  const k = unite === "s" ? 1 : 10;
  const x = Math.round(v * k) / k;
  if (x === 0) return "stable";
  return `${x > 0 ? "+" : "\u2212"}${fr(Math.abs(x))}\u00a0${unite}`;
}
/** « le 24/11 à 09:50 », « le 22/11 » for a day. */
/** « 25/11 », the day of an instant in La Réunion. */
export const jourMois = (t: number) => localTime(new Date(t)).slice(0, 5);
export const leQuand = (le: number | string) => (typeof le === "number" ? `le ${localTime(new Date(le)).replace(" ", " à ")}` : `le ${le.slice(8, 10)}/${le.slice(5, 7)}`);

/** The figures as an answer says them, with the same words as the page. */
export function chiffresBlock(c: Chiffres, mot: (v: number) => string, unite: "m" | "°C" | "s") {
  return {
    derniere: mot(c.derniere),
    mesuree: leQuand(c.le).replace(/^le /, ""),
    ...(c.sur_24h != null ? { evolution_24h: ecartDit(c.sur_24h, unite) } : {}),
    ...(c.max_7j && c.max_7j.depuis == null ? { maximum_sur_7_jours: `${mot(c.max_7j.valeur)} ${leQuand(c.max_7j.le)}` } : {}),
    ...(c.max_7j?.depuis != null ? { maximum_depuis_la_premiere_mesure: `${mot(c.max_7j.valeur)} ${leQuand(c.max_7j.le)}, mesures depuis le ${jourMois(c.max_7j.depuis)}` } : {}),
    ...(c.periode ? { sur_la_periode: { jours: c.periode.jours, moyenne: mot(c.periode.moyenne), min: mot(c.periode.min), max: mot(c.periode.max) } } : {}),
  };
}

/**
 * The curves' figures for temperature_mer: the buoy's (near `near` when given, within `maxKm`) and the satellite's
 * beaches (the nearest within `maxKm`, else all four). Undefined when there is nothing.
 */
export function historiqueBlock(c: Courbes, near?: { lon: number; lat: number }, maxKm = 25, km?: (lon1: number, lat1: number, lon2: number, lat2: number) => number) {
  const close = (lon: number, lat: number) => !near || !km || km(near.lon, near.lat, lon, lat) <= maxKm;
  const bouees = c.bouees.filter((b) => {
    const at = candhis.BOUEES.find((x) => x.code === b.code);
    return at?.lat != null && at.lon != null && close(at.lon, at.lat);
  }).map((b) => ({
    bouee: b.nom,
    nature: "mesure",
    ...(b.chiffres.hauteur ? { hauteur_significative: chiffresBlock(b.chiffres.hauteur, metres, "m") } : {}),
    ...(b.chiffres.hmax ? { vague_max: chiffresBlock(b.chiffres.hmax, metres, "m") } : {}),
    ...(b.chiffres.periode ? { periode: chiffresBlock(b.chiffres.periode, secondes, "s") } : {}),
    ...(b.chiffres.temperature ? { temperature_eau: chiffresBlock(b.chiffres.temperature, degres, "°C") } : {}),
  }));
  const s = c.satellite;
  const all = s ? s.points.map((p, i) => ({ p, f: s.chiffres[i], e: s.ecart[i] })).filter((x) => x.f) : [];
  const nearest = near && km && all.length ? all.reduce((a, b) => (km(near.lon, near.lat, b.p.lon, b.p.lat) < km(near.lon, near.lat, a.p.lon, a.p.lat) ? b : a)) : undefined;
  const pts = near ? (nearest && close(nearest.p.lon, nearest.p.lat) ? [nearest] : []) : all;
  const satellite = pts.map(({ p, f, e }) => ({
    au_large_de: p.nom,
    nature: "satellite, analyse quotidienne de NOAA (CoralTemp)\u00a0: estimation au large, pas une mesure à la plage",
    temperature_eau: chiffresBlock(f!, degres, "°C"),
    ...(e != null ? { ecart_a_la_reference_noaa: ecartDit(e, "°C") } : {}),
  }));
  if (!bouees.length && !satellite.length) return undefined;
  return {
    ...(bouees.length ? { bouees } : {}),
    ...(satellite.length ? { satellite, reference_noaa: REFERENCE_OUTIL } : {}),
    page: bouees.length ? "https://rundata.re/mer#h-courbes" : "https://rundata.re/mer#h-satellite-courbes",
  };
}
