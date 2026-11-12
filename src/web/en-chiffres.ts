/**
 * « <Commune> en chiffres », on the weather page of a place (/meteo/<lieu>), after its band and before the question to
 * an assistant: six figures (the last 24 hours, yesterday, the rain, the month, the wind, a station near) and a curve of
 * 24 hours, 7 days or 30 days, each figure and each point giving its exact value, its time and its station on hover or
 * touch, never the place's name again nor « Voir la page ». Its settings (the station, the units, the curve's period,
 * the figures shown) are kept in the browser only. The UX review and marketing's words of 10/11/2026, which the user
 * accepted the same day: « oui, supprime les variantes 6h et ajoute 30j ».
 *
 * The figures come from what the place's copy already reads (the 6-minute and hourly packages of Météo-France), from
 * the day before kept in KV each night (meteofrance:veille), and from the climatological archive (D1, the same table as
 * a station's page, one query for the nearest stations): all read when the copy is built, none at a view.
 *
 * One drawing for the server and the page's script (`dessine`): the server writes the block as the default settings
 * show it, for a reader or an assistant that runs no script; the script draws it again for the visitor's settings and
 * its width. It is put in the page as its text, so it needs nothing of this module and names no function inside
 * (esbuild's keepNames would wrap it in a helper the page does not have): its helpers are default parameters.
 */
import type { Cache } from "../cache.js";
import { distanceKm } from "../geo.js";
import { INSEE } from "../places/insee.js";
import * as climat from "../providers/climat.js";
import * as meteofrance from "../providers/meteofrance.js";
import { VEILLE, type Veille } from "../providers/meteofrance-stations.js";
import { type Observation, why } from "../types.js";
import { esc, inScript } from "./map.js";
import type { MeteoAnswer } from "./data.js";
import { hash } from "./pwa.js";

/** How many stations the block offers: the nearest with a temperature each hour. */
export const OFFERTES = 5;
/** Past this distance or this gap of altitude, the block says that the temperature may differ at the place. */
export const LOIN_KM = 5;
export const ECART_M = 300;
/** The days of the longest curve. */
export const JOURS = 30;
/** Days the archive keeps: a whole month, for the month's rain up to the 31st, more than the curve's JOURS. */
export const GARDES = 31;

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const COMMUNE_OF_INSEE = new Map(Object.entries(INSEE).map(([nom, code]) => [code, nom]));
const communeOf = (id: string) => COMMUNE_OF_INSEE.get(id.slice(0, 5));
const r1 = (v: number) => Math.round(v * 10) / 10;
/** A station's name in a sentence: « Saint-Pierre Pierrefonds, aéroport (21 m) », never two brackets. */
export const dit = (nom: string) => nom.replace(/ \(aéroport\)$/, ", aéroport");

/** A station of the block, its figures as read; the hours and the days oldest first. */
export interface StationChiffres {
  id: string;
  nom: string;
  alt: number;
  /** Its distance to the place, in km. */
  d: number;
  /** Its first year in the archive: the link to its page says it. */
  dep?: number;
  /** An amateur station (MétéoR-OI): its last temperature only, said « fiabilité non vérifiée ». */
  am?: true;
  /** Its last temperature and when (ISO). */
  now?: { t: number; at: string };
  /** The hourly package: the end of its newest hour (ISO), and each hour's values. */
  h?: { end: string; t: (number | null)[]; tn: (number | null)[]; tx: (number | null)[]; rr: (number | null)[]; ff: (number | null)[]; raf: (number | null)[]; dd: (number | null)[] };
  /** Yesterday, 0 h to 24 h at La Réunion: from the archive when it has it, else added up from the hours (provisional). */
  hier?: { j: string; tn?: number; tx?: number; rr?: number; prov: boolean };
  /** The archive's last GARDES days, up to `au` (YYYY-MM-DD). */
  j?: { au: string; tn: (number | null)[]; tx: (number | null)[]; rr: (number | null)[] };
  /** Its normal rain month by month, January first (1991-2020). */
  nrr?: (number | null)[];
  /** What the block says under its title for this station: where and when it measured, and how far. */
  lead: string;
}

export interface Chiffres {
  /** When it was read (ISO). */
  lu: string;
  stations: StationChiffres[];
  /** The station shown by default: the one the page's headline names, else the nearest with a temperature. */
  defaut: string;
}

/** « 1 560 m », as the page writes an altitude. */
const altitude = (m: number) => String(m).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + "\u00a0m";
/** « 2,5 » */
const km = (d: number) => String(r1(d)).replace(".", ",");
const hm = (iso: string) => new Date(Date.parse(iso) + 4 * HOUR_MS).toISOString().slice(11, 16);
const ymd = (t: number) => new Date(t + 4 * HOUR_MS).toISOString().slice(0, 10);

/**
 * What the block says for a station (the review's rule): where and when it measured; past LOIN_KM or ECART_M, that the
 * temperature may differ at the place, and, when the place's commune has a station that measures only the rain, so.
 * Never « plus frais » or « plus chaud » by deduction.
 */
export function leadOf(s: { nom: string; alt: number; d: number; at?: string; am?: boolean }, lieu: { nom: string; alt?: number; pluieSeule?: string; tempIci?: boolean }): string {
  const at = s.at ? ` à ${hm(s.at)}` : "";
  if (s.am) return `Station amateur ${s.nom} (MétéoR-OI), ${altitude(s.alt)}, à ${km(s.d)}\u00a0km\u00a0: fiabilité non vérifiée.`;
  const gap = lieu.alt != null ? s.alt - lieu.alt : 0;
  if (s.d <= LOIN_KM && Math.abs(gap) <= ECART_M) return `Mesuré${at} par la station Météo-France ${de(s.nom)} (${altitude(s.alt)}), à ${km(s.d)}\u00a0km.`;
  const ecart = Math.abs(gap) > ECART_M ? ` et ${Math.abs(Math.round(gap))}\u00a0m plus ${gap < 0 ? "bas" : "haut"}` : "";
  // A station of the commune measures the temperature: the visitor chose another one, nothing is missing.
  const first = lieu.pluieSeule ? `La station ${de(lieu.pluieSeule)} ne mesure que la pluie. Température mesurée` : lieu.tempIci ? "Mesuré" : `Pas de mesure de température ${a(lieu.nom)}. Mesuré`;
  return `${first}${at} ${a(s.nom)} (${altitude(s.alt)}), à ${km(s.d)}\u00a0km${ecart}\u00a0: ${lieu.pluieSeule ? "elle" : "la température"} peut être différente ${a(lieu.nom)}.`;
}

/** « à Saint-Leu », « au Tampon », « aux Avirons ». */
const a = (nom: string) => (/^Le /.test(nom) ? `au ${nom.slice(3)}` : /^Les /.test(nom) ? `aux ${nom.slice(4)}` : `à ${nom}`);
/** « de Saint-Leu », « du Tévelave », « des Avirons ». */
const de = (nom: string) => (/^Le /.test(nom) ? `du ${nom.slice(3)}` : /^Les /.test(nom) ? `des ${nom.slice(4)}` : `de ${nom}`);

/**
 * The block's figures for a place, from its copy's reads (`meteo`, the place's answer) and the archive: undefined
 * without the hourly package. One read of KV (the day before) and one query of the archive, at the copy's build.
 */
export async function buildChiffres(cache: Cache, place: Lieu, meteo: MeteoAnswer | undefined, now = new Date()): Promise<Chiffres | undefined> {
  const [o, rain] = await Promise.all([meteofrance.observations(cache, now), meteofrance.recentRain(cache, now)]);
  const hourly = rain?.hourly;
  if (!hourly) return undefined;
  const ids = offertes(place, hourly).map(({ s }) => s.id);
  if (!ids.length) return undefined;
  const [veille, archive] = await Promise.all([
    cache.kept<Veille>(VEILLE).then((v) => v?.value).catch((e) => {
      console.error("en chiffres : veille indisponible", why(e));
      return undefined;
    }),
    archiveOf(cache, ids, now).catch((e) => {
      console.error("en chiffres : archive indisponible", why(e));
      return undefined;
    }),
  ]);
  return chiffresDe({ place, meteo, hourly, observations: o.value, lu: o.fetchedAt, veille, archive, now });
}

/** A place of the block: its name, where it is, its altitude and its commune. */
export interface Lieu {
  nom: string;
  lon: number;
  lat: number;
  altitude_m?: number | null;
  commune?: string;
}

/** The stations of Météo-France nearest the place, each with its distance: all of them, and the OFFERTES with a temperature each hour. */
const near = (place: Lieu) => meteofrance.stations().map((s) => ({ s, d: distanceKm(place.lon, place.lat, s.lon, s.lat) })).sort((x, y) => x.d - y.d);
const warm = (hourly: meteofrance.HourlyRain, id: string) => (hourly.mesures?.[id]?.t ?? []).some((v) => v != null);
export const offertes = (place: Lieu, hourly: meteofrance.HourlyRain) => near(place).filter(({ s }) => warm(hourly, s.id)).slice(0, OFFERTES);

/** The block's figures from what was read; undefined when no station near has a temperature each hour. */
export function chiffresDe(r: {
  place: Lieu; meteo?: MeteoAnswer; hourly: meteofrance.HourlyRain; observations: Observation[]; lu: Date; veille?: Veille;
  archive?: Awaited<ReturnType<typeof archiveOf>>; now: Date;
}): Chiffres | undefined {
  const { place, meteo, hourly, now, veille, archive } = r;
  const offered = offertes(place, hourly);
  if (!offered.length) return undefined;
  // A station of the place's commune that measures only the rain: Salazie-Village.
  const commune = place.commune || place.nom;
  const rainOnly = near(place).find(({ s }) => communeOf(s.id) === commune && !warm(hourly, s.id) && hourly.rr[s.id]?.some((v) => v != null))?.s.nom;
  // Another station of the commune measuring the temperature (Grand-Îlet in Salazie): the rain-only one is not said.
  const tempIci = near(place).some(({ s }) => communeOf(s.id) === commune && warm(hourly, s.id));
  const pluieSeule = !tempIci && rainOnly ? dit(rainOnly) : undefined;
  const yesterday = ymd(now.getTime() - DAY_MS);
  const end = Date.parse(hourly.end);
  // The package's hours are newest first: here oldest first.
  const series = (xs: (number | null)[] | undefined) => (xs ?? Array(meteofrance.HOURS_KEPT).fill(null)).slice().reverse();
  const stations: StationChiffres[] = offered.map(({ s, d }) => {
    const m = hourly.mesures?.[s.id];
    const obs = r.observations.find((x) => x.station.id === s.id);
    const t = obs?.readings.find((r) => r.variable === "temperature")?.valeur;
    const lastT = series(m?.t).map((v, k) => [v, k] as const).filter(([v]) => v != null).at(-1);
    const nowT = typeof t === "number" ? { t, at: obs!.time.toISOString() } : lastT ? { t: lastT[0]!, at: new Date(end - (meteofrance.HOURS_KEPT - 1 - lastT[1]) * HOUR_MS).toISOString() } : undefined;
    const days = archive?.get(s.id);
    const fromArchive = days && days.au === yesterday ? { j: yesterday, tn: days.tn.at(-1) ?? undefined, tx: days.tx.at(-1) ?? undefined, rr: days.rr.at(-1) ?? undefined, prov: false } : undefined;
    const kept = veille?.jour === yesterday ? veille.stations[s.id] : undefined;
    const hier = fromArchive && (fromArchive.tn != null || fromArchive.tx != null) ? fromArchive : kept && (kept.tn != null || kept.tx != null) ? { j: yesterday, tn: kept.tn, tx: kept.tx, rr: kept.rr, prov: true } : undefined;
    const dep = archive?.postes.get(s.id);
    const nrr = climat.normalesOf(s.id)?.rr;
    return {
      id: s.id,
      nom: dit(s.nom),
      alt: s.altitude_m,
      d: r1(d),
      ...(dep ? { dep } : {}),
      ...(nowT ? { now: nowT } : {}),
      h: { end: hourly.end, t: series(m?.t), tn: series(m?.tn), tx: series(m?.tx), rr: series(hourly.rr[s.id]), ff: series(m?.ff), raf: series(m?.raf), dd: series(m?.dd) },
      ...(hier ? { hier: Object.fromEntries(Object.entries(hier).filter(([, v]) => v !== undefined)) as StationChiffres["hier"] } : {}),
      ...(days ? { j: { au: days.au, tn: days.tn, tx: days.tx, rr: days.rr } } : {}),
      ...(nrr ? { nrr } : {}),
      lead: leadOf({ nom: dit(s.nom), alt: s.altitude_m, d, at: nowT?.at }, { nom: place.nom, alt: place.altitude_m ?? undefined, pluieSeule, tempIci }),
    };
  });
  // The amateur station the place's answer gives, its last temperature only.
  for (const x of meteo?.stations.filter((s) => s.amateur && s.mesures.temperature) ?? []) {
    const t = Number(x.mesures.temperature!.replace(/\s|°C/g, "").replace(",", "."));
    if (!Number.isFinite(t) || x.distance_km == null) continue;
    const at = new Date(r.lu.getTime() - x.age_min * 60_000).toISOString();
    stations.push({ id: `am-${x.station}`, nom: x.station, alt: x.altitude_m, d: x.distance_km, am: true, now: { t, at }, lead: leadOf({ nom: x.station, alt: x.altitude_m, d: x.distance_km, am: true }, { nom: place.nom }) });
  }
  const named = meteo?.stations.find((s) => !s.amateur && s.mesures.temperature);
  const defaut = stations.find((s) => !s.am && s.nom === dit(named?.station ?? ""))?.id ?? stations[0].id;
  return { lu: r.lu.toISOString(), stations, defaut };
}

/** The archive's last GARDES days of the stations, up to the last day it has before today, and their first year. */
export async function archiveOf(cache: Cache, ids: string[], now: Date) {
  if (!climat.enabled()) return undefined;
  const postes = new Map((await climat.postes(cache)).value.filter((p) => ids.includes(p.poste)).map((p) => [p.poste, p.debut]));
  const yesterday = ymd(now.getTime() - DAY_MS);
  const year = +yesterday.slice(0, 4);
  // One query; the year before only while the last GARDES days reach into it.
  const from = ymd(Date.parse(yesterday) - (GARDES + 6) * DAY_MS).slice(0, 4);
  const read = await climat.years(ids, Math.min(year, +from), year);
  const out = new Map<string, { au: string; tn: (number | null)[]; tx: (number | null)[]; rr: (number | null)[] }>();
  for (const id of ids) {
    const ys = read.get(id);
    if (!ys) continue;
    const day = (iso: string, f: climat.Field) => climat.valueOn(ys, f, iso);
    // Its last day with a rain or a temperature, yesterday at most.
    let au: string | undefined;
    for (let k = 0; k < 7 && !au; k++) {
      const iso = new Date(Date.parse(yesterday) - k * DAY_MS).toISOString().slice(0, 10);
      if (day(iso, "RR") != null || day(iso, "TX") != null) au = iso;
    }
    if (!au) continue;
    const dates = Array.from({ length: GARDES }, (_, k) => new Date(Date.parse(au!) - (GARDES - 1 - k) * DAY_MS).toISOString().slice(0, 10));
    out.set(id, { au, tn: dates.map((d) => day(d, "TN")), tx: dates.map((d) => day(d, "TX")), rr: dates.map((d) => day(d, "RR")) });
  }
  return Object.assign(out, { postes });
}

/** The settings, kept in the browser (KEY): the station of each place, the units, the curve's period, the figures hidden. */
export interface Reglages {
  st?: string;
  am: boolean;
  ut: "c" | "f";
  uv: "kmh" | "kt" | "ms";
  p: "24" | "7" | "30";
  hide: string[];
}
export const DEFAUT: Reglages = { am: false, ut: "c", uv: "kmh", p: "24", hide: [] };
export const KEY = "rd-meteo-reglages";

/** The six figures, in their order: key and label (the month's is its name). */
export const FIGURES: [string, string][] = [["h24", "24 dernières heures"], ["hier", "Hier"], ["pluie", "Pluie"], ["mois", "Mois"], ["vent", "Vent"], ["vois", "Station voisine"]];
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const VENT = ["du nord", "du nord-est", "d'est", "du sud-est", "du sud", "du sud-ouest", "d'ouest", "du nord-ouest"];

/** What the drawing gives: the block's parts, and the curve's points with what each says. */
export interface Dessin {
  lead: string;
  chips: string;
  titre: string;
  svg: string;
  note: string;
  lien: string;
  href: string;
  pts: { x: number; y: number; html: string }[];
}

/**
 * The block for the settings `R` at the width `W` of its curve: put in the page as its text (no function named inside,
 * nothing of this module), run by the server for the default settings and by the page's script for the visitor's.
 */
export const dessine = (
  D: Chiffres & { mois: string[]; vent: string[]; figures: [string, string][] },
  R: Reglages,
  W: number,
  e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  fr = (v: number | null | undefined, d = 1) => (v == null ? "—" : String(Math.round(v * 10 ** d) / 10 ** d).replace("-", "\u2212").replace(".", ",")),
  T = (c: number) => (R.ut === "f" ? (c * 9) / 5 + 32 : c),
  tu = () => (R.ut === "f" ? "\u00a0°F" : "\u00a0°C"),
  t = (c: number | null | undefined, u = true) => (c == null ? "—" : fr(T(c)) + (u ? tu() : "")),
  v = (k: number | null | undefined) => (k == null ? "—" : (R.uv === "kt" ? fr(k / 1.852, 0) : R.uv === "ms" ? fr(k / 3.6) : fr(k, 0)) + "\u00a0" + (R.uv === "kt" ? "nœuds" : R.uv === "ms" ? "m/s" : "km/h")),
  mm = (x: number | null | undefined) => fr(x) + "\u00a0mm",
  loc = (iso: string) => new Date(Date.parse(iso) + 4 * 3600_000).toISOString(),
  hh = (iso: string) => loc(iso).slice(11, 16),
  jm = (iso: string) => loc(iso).slice(8, 10) + "/" + loc(iso).slice(5, 7),
  dj = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7),
  hourAt = (h: { end: string; t: unknown[] }, i: number) => new Date(Date.parse(h.end) - (h.t.length - 1 - i) * 3600_000).toISOString(),
  al = (m: number) => String(m).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + "\u00a0m",
  sum = (xs: (number | null)[]) => (xs.some((x) => x == null) ? null : xs.reduce((a: number, b) => a + (b as number), 0)),
  // The curve's place of a value: x of the i-th of n (`pad` at each end), y of a temperature between lo and hi.
  X = (i: number, n: number, pad: number) => Math.round((40 + pad + (n === 1 ? 0 : (i * (W - 50 - 2 * pad)) / (n - 1))) * 10) / 10,
  Y = (c: number, lo: number, hi: number) => Math.round((196 - ((c - lo) * 182) / (hi - lo)) * 10) / 10,
  /** « de Saint-Leu », « du Tévelave », « des Avirons », escaped. */
  du = (nom: string) => (/^Les /.test(nom) ? `des ${e(nom.slice(4))}` : /^Le /.test(nom) ? `du ${e(nom.slice(3))}` : `de ${e(nom)}`),
): Dessin => {
  const shown = D.stations.filter((s) => !s.am || R.am);
  const s = shown.find((x) => x.id === R.st) ?? shown.find((x) => x.id === D.defaut) ?? shown[0];
  const who = s.am ? `station amateur ${e(s.nom)} (MétéoR-OI), ${al(s.alt)}, fiabilité non vérifiée` : `station Météo-France ${du(s.nom)}, ${al(s.alt)}`;
  const chips: [string, string, string, string, string][] = [];
  const h = s.h;
  const idx = h ? h.t.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0) : [];
  if (h && idx.length) {
    const lo = idx.map((i) => [h.tn[i] ?? h.t[i]!, i] as const).reduce((a, b) => (b[0] < a[0] ? b : a));
    const hi = idx.map((i) => [h.tx[i] ?? h.t[i]!, i] as const).reduce((a, b) => (b[0] > a[0] ? b : a));
    chips.push(["h24", D.figures[0][1], `${t(lo[0], false)} → ${t(hi[0])}`, `min. à ${hh(hourAt(h, lo[1]))} · max. à ${hh(hourAt(h, hi[1]))}`,
      `<b>${t(hi[0])} à ${hh(hourAt(h, hi[1]))} le ${jm(hourAt(h, hi[1]))}</b><br>${who}<br>le plus bas\u00a0: ${t(lo[0])} à ${hh(hourAt(h, lo[1]))} le ${jm(hourAt(h, lo[1]))} · mesures horaires`]);
  } else chips.push(["h24", D.figures[0][1], "—", s.am ? "pas de relevé heure par heure" : "pas de relevé lu", `${who}<br>pas de relevé heure par heure lu pour cette station`]);
  const y = s.hier;
  if (y && (y.tn != null || y.tx != null))
    chips.push(["hier", `Hier, ${dj(y.j)}`, `${t(y.tn, false)} → ${t(y.tx)}`, y.prov ? "provisoire, d'après les relevés horaires" : "mesures du jour, Météo-France",
      `<b>${t(y.tn)} et ${t(y.tx)}, le ${dj(y.j)} de 0\u00a0h à 24\u00a0h</b><br>${who}<br>${y.prov ? "relevés horaires additionnés, provisoire\u00a0: la valeur du jour arrive vers midi" : "mesures du jour, Météo-France"}${y.rr != null ? ` · pluie ${mm(y.rr)}` : ""}`]);
  else chips.push(["hier", D.figures[1][1], "—", "pas encore lu", `${who}<br>la journée d'hier n'est pas encore lue pour cette station`]);
  const j = s.j;
  const month = j ? +j.au.slice(5, 7) - 1 : -1;
  const n7 = j && s.nrr ? Array.from({ length: 7 }, (_, k) => { const d = new Date(Date.parse(j.au) - k * 86400_000); const n = s.nrr![d.getUTCMonth()]; return n == null ? null : n / new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); }) : [];
  const norm7 = n7.length ? sum(n7) : null;
  const r24 = h ? sum(h.rr) : null;
  const r7 = j ? sum(j.rr.slice(-7)) : null;
  // The archive's days end the day before yesterday each morning, until the day before is loaded (marketing's words,
  // 12/11/2026): its 7 days then said by their dates, « 31 mm du 04/11 au 10/11 », never « en 7 jours ».
  const veille = loc(new Date(Date.parse(D.lu) - 86400_000).toISOString()).slice(0, 10);
  const avant = j != null && j.au !== veille;
  const in7 = j && avant ? ` <span class="nw">du ${dj(new Date(Date.parse(j.au) - 6 * 86400_000).toISOString())} au ${dj(j.au)}</span>` : " en 7 jours";
  if (r24 != null || r7 != null)
    chips.push(["pluie", D.figures[2][1], r24 != null ? `${mm(r24)} en 24\u00a0h` : `${mm(r7)}${in7}`, (r24 != null && r7 != null ? `${mm(r7)}${in7}` : "") + (norm7 != null && r7 != null ? ` · d'habitude ≈ ${fr(norm7, 0)}\u00a0mm` : ""),
      `<b>${r7 != null ? `${mm(r7)} du ${dj(new Date(Date.parse(j!.au) - 6 * 86400_000).toISOString())} au ${dj(j!.au)}` : `${mm(r24)} en 24\u00a0h, jusqu'à ${hh(h!.end)} le ${jm(h!.end)}`}</b><br>${who}<br>` +
      (r7 != null ? `pluie de chaque jour comptée de 10\u00a0h à 10\u00a0h le lendemain, comme Météo-France${norm7 != null ? ` · habituel ≈ ${fr(norm7, 0)}\u00a0mm, calculé par rundata.re sur la normale 1991-2020 de la station` : ""}` : "relevés horaires")]);
  else chips.push(["pluie", D.figures[2][1], "—", "pas de cumul lu", `${who}<br>pas de pluie lue pour cette station`]);
  if (j && month >= 0) {
    const day = +j.au.slice(8, 10);
    const m = sum(j.rr.slice(-day));
    const nm = s.nrr?.[month];
    chips.push(["mois", D.mois[month], m != null ? mm(m) : "—", `du 1er au ${dj(j.au)}${nm != null ? ` · normale du mois entier\u00a0: ${fr(nm, 0)}\u00a0mm` : ""}`,
      `<b>${m != null ? mm(m) : "—"} du 1er au ${dj(j.au)}</b><br>${who}<br>${nm != null ? `normale ${/^[AO]/.test(D.mois[month]) ? "d'" : "de "}${D.mois[month].toLowerCase()} 1991-2020 de cette station\u00a0: ${fr(nm, 0)}\u00a0mm (Météo-France, moyenne calculée par rundata.re)` : "pas de normale pour cette station"}`]);
  } else chips.push(["mois", D.figures[3][1], "—", "pas de jour de l'archive lu", `${who}<br>pas de jour lu dans l'archive de Météo-France pour cette station`]);
  const windy = [s, ...shown.filter((x) => x !== s && !x.am).sort((a, b) => a.d - b.d)].find((x) => x.h && x.h.ff.some((f) => f != null));
  if (windy) {
    const w = windy.h!;
    const k = w.ff.map((f, i) => (f == null ? -1 : i)).filter((i) => i >= 0).at(-1)!;
    const g = w.raf.map((r, i) => [r, i] as const).filter(([r]) => r != null).reduce((a, b) => (b[0]! > a[0]! ? b : a), [null, -1] as readonly [number | null, number]);
    const dd = w.dd[k];
    const from = dd != null && (w.ff[k] ?? 0) > 0 ? " " + D.vent[((Math.round(dd / 45) % 8) + 8) % 8] : "";
    const there = windy === s ? "" : `${e(windy.nom)}, `;
    chips.push(["vent", D.figures[4][1], `${v(w.ff[k])}${from}`, `${there}${g[0] != null ? `rafale la plus forte ${v(g[0])} vers ${hh(hourAt(w, g[1]))}` : `à ${hh(hourAt(w, k))}`}`,
      `<b>${v(w.ff[k])}${from} à ${hh(hourAt(w, k))} le ${jm(hourAt(w, k))}</b><br>station Météo-France ${du(windy.nom)}, ${al(windy.alt)}${windy === s ? "" : `, à ${fr(windy.d)}\u00a0km`}<br>vent moyen de l'heure${g[0] != null ? ` · rafale la plus forte ${v(g[0])} entre ${hh(hourAt(w, g[1] - 1))} et ${hh(hourAt(w, g[1]))} le ${jm(hourAt(w, g[1]))}` : ""} · mesures horaires`]);
  } else chips.push(["vent", D.figures[4][1], "—", "pas de vent mesuré près d'ici", `pas de vent mesuré par les stations proposées`]);
  const near = shown.filter((x) => x !== s && x.now).sort((a, b) => a.d - b.d)[0];
  if (near && near.now)
    chips.push(["vois", D.figures[5][1], `${e(near.nom)}\u00a0: ${t(near.now.t)}${near.am ? '<span class="mk-am">amateur</span>' : ""}`, `${al(near.alt)} d'altitude, à ${fr(near.d)}\u00a0km`,
      `<b>${t(near.now.t)} à ${hh(near.now.at)} le ${jm(near.now.at)}</b><br>${near.am ? `station amateur ${e(near.nom)} (MétéoR-OI), ${al(near.alt)}, fiabilité non vérifiée` : `station Météo-France ${du(near.nom)}, ${al(near.alt)}`}`]);
  const chipsHtml = chips.filter((c) => !R.hide.includes(c[0])).map(([k, l, val, sub, tip]) =>
    `<button type="button" class="mk" data-k="${k}" aria-expanded="false"><span class="mk-l">${l}</span><span class="mk-v">${val}</span><span class="mk-s">${sub}</span><span class="mk-tip" role="tooltip">${tip}</span></button>`).join("");
  // The curve.
  // The curve: 230 high, its values between 14 and 196, from x 40 to W - 10 (X and Y).
  const H = 230, L = 40, Rr = 10, Tp = 14, Bt = 196;
  const days = R.p !== "24";
  const n = days ? +R.p : 24;
  const items: { lo?: number | null; hi?: number | null; t?: number | null; rr: number | null; lab: string; at: string }[] = days
    ? (j ? j.tx.slice(-n).map((x, i) => ({ lo: j.tn.slice(-n)[i], hi: x, rr: j.rr.slice(-n)[i], lab: dj(new Date(Date.parse(j.au) - (n - 1 - i) * 86400_000).toISOString()), at: "" })) : [])
    : h ? h.t.map((x, i) => ({ t: x, rr: h.rr[i], lab: hh(hourAt(h, i)), at: jm(hourAt(h, i)) })) : [];
  const vals = items.flatMap((it) => (days ? [it.lo, it.hi] : [it.t])).filter((x): x is number => x != null);
  let svg = "";
  const pts: Dessin["pts"] = [];
  if (vals.length) {
    const lo = Math.floor(Math.min(...vals)) - 1, hi = Math.ceil(Math.max(...vals)) + 1;
    const pad = days ? Math.min(30, (W - L - Rr) / (2 * n)) : 0;
    for (let k = 0; k <= 2; k++) {
      const c = lo + ((hi - lo) * k) / 2;
      svg += `<line class="gr" x1="${L}" x2="${W - Rr}" y1="${Y(c, lo, hi)}" y2="${Y(c, lo, hi)}"/><text class="ax" x="${L - 6}" y="${Y(c, lo, hi) + 4}" text-anchor="end">${fr(T(c), 0)}</text>`;
    }
    const rmax = Math.max(2, ...items.map((it) => it.rr ?? 0));
    const bw = Math.max(2, Math.min(18, ((W - L - Rr) / n) * 0.5));
    items.forEach((it, i) => {
      if ((it.rr ?? 0) > 0) svg += `<rect class="br" x="${X(i, n, pad) - bw / 2}" y="${Bt - (it.rr! / rmax) * 46}" width="${bw}" height="${(it.rr! / rmax) * 46}" rx="2"/>`;
    });
    if (days)
      items.forEach((it, i) => {
        if (it.lo != null && it.hi != null) svg += `<rect class="bd" x="${X(i, n, pad) - bw / 2}" y="${Y(it.hi, lo, hi)}" width="${bw}" height="${Math.max(1, Y(it.lo, lo, hi) - Y(it.hi, lo, hi))}" rx="${bw / 2}"/>`;
        if (it.hi != null) svg += `<circle class="dx" cx="${X(i, n, pad)}" cy="${Y(it.hi, lo, hi)}" r="3.5"/>`;
        if (it.lo != null) svg += `<circle class="dn" cx="${X(i, n, pad)}" cy="${Y(it.lo, lo, hi)}" r="3.5"/>`;
      });
    else svg += `<path class="lt" d="${items.map((it, i) => (it.t == null ? "" : `${i && items[i - 1].t != null ? "L" : "M"}${X(i, n, pad)},${Y(it.t, lo, hi)}`)).join("")}"/>`;
    const every = days ? (n > 7 ? (W < 520 ? 10 : 5) : 1) : W < 520 ? 6 : 4;
    items.forEach((it, i) => {
      if (i % every === (days ? 0 : (n - 1) % every)) svg += `<text class="ax" x="${X(i, n, pad)}" y="${H - 10}" text-anchor="${!days && i === n - 1 ? "end" : "middle"}">${days && n === 7 && W < 520 && i ? it.lab.slice(0, 2) : it.lab}</text>`;
    });
    svg += `<line class="cur" y1="${Tp}" y2="${Bt}" x1="-9" x2="-9"/><circle class="dot" r="5" cx="-9" cy="-9"/>`;
    items.forEach((it, i) => {
      const y0 = days ? it.hi ?? it.lo : it.t;
      if (y0 == null) return;
      pts.push({
        x: X(i, n, pad), y: Y(y0, lo, hi),
        html: days
          ? `<b>${it.lab}\u00a0: ${t(it.lo)} → ${t(it.hi)}</b><br>${who}<br>pluie ${mm(it.rr)} (de 10\u00a0h à 10\u00a0h le lendemain) · mesures du jour, Météo-France`
          : `<b>${t(it.t)} à ${it.lab} le ${it.at}</b><br>${who}<br>pluie de l'heure ${mm(it.rr)} · mesure horaire`,
      });
    });
  } else svg = `<text class="ax" x="${W / 2}" y="110" text-anchor="middle">${s.am ? "Pas de relevé heure par heure pour une station amateur." : days ? "Pas de jour lu dans l'archive pour cette station." : "Pas de relevé heure par heure lu pour cette station."}</text>`;
  return {
    lead: e(s.lead),
    chips: chipsHtml,
    titre: `Température mesurée à ${e(s.nom)}`,
    svg: `<svg class="mx-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Température mesurée à ${e(s.nom)}, ${days ? `${n} derniers jours` : "24 dernières heures"}">${svg}</svg>`,
    note: !vals.length ? "" : days ? (avant ? `Jusqu'au ${dj(j!.au)}\u00a0: la journée d'hier est ajoutée vers midi. ` : "") + "Barres\u00a0: le plus bas et le plus haut de chaque jour ; en bleu, la pluie (de 10\u00a0h à 10\u00a0h le lendemain)." : "Relevé de chaque heure ; en bleu, la pluie de l'heure.",
    lien: s.am ? "" : `Les relevés de la station ${du(s.nom)}${s.dep ? ` depuis ${s.dep}` : ""} →`,
    href: s.am ? "" : `/meteo/station/${s.id}`,
    pts,
  };
};

/** The curve's width the server draws at; the page's script draws it again at its own. */
export const LARGEUR = 640;

/** The block's data as the page's script reads them. */
const donnees = (c: Chiffres) => ({ ...c, mois: MOIS, vent: VENT, figures: FIGURES });

/**
 * The page's script: the settings read from the browser (a failure keeps the defaults), the block drawn again at the
 * curve's width, the bubbles of the curve on pointer and arrows, the settings' panel. No function named inside.
 * Drawn again after the page's first paint: the server's drawing (default settings, 640 wide) shows meanwhile.
 */
const SCRIPT = () => `{const mx=document.getElementById("mx");if(mx){const D=JSON.parse(document.getElementById("mx-d").textContent),draw=${dessine},K=${JSON.stringify(KEY)},SL=mx.dataset.s,DEF=${JSON.stringify(DEFAUT)};
let S={};try{S=JSON.parse(localStorage.getItem(K)||"{}")||{}}catch(x){}
let R=Object.assign({},DEF,S,{st:(S.st||{})[SL],hide:Array.isArray(S.hide)?S.hide:[]});
const $=(i)=>document.getElementById(i);let pts=[],cw=640,cur=-1;
const save=()=>{try{const o=Object.assign({},S,{am:R.am,ut:R.ut,uv:R.uv,p:R.p,hide:R.hide,st:Object.assign({},S.st||{},R.st?{[SL]:R.st}:{})});S=o;localStorage.setItem(K,JSON.stringify(o))}catch(x){}};
const all=()=>{cw=Math.max(300,Math.round($("mx-plot").clientWidth)||640);const d=draw(D,R,cw);$("mx-lead").innerHTML=d.lead;$("mx-chips").innerHTML=d.chips;$("mx-ct").innerHTML=d.titre;$("mx-svg").innerHTML=d.svg;$("mx-cn").textContent=d.note;
const l=$("mx-link");l.innerHTML=d.lien;l.href=d.href||"#";l.hidden=!d.href;pts=d.pts;cur=-1;
mx.querySelectorAll(".tabs button").forEach((b)=>b.setAttribute("aria-pressed",String(b.dataset.p===R.p)));
mx.querySelectorAll(".mk").forEach((b)=>{b.addEventListener("click",()=>{const o=b.getAttribute("aria-expanded")==="true";mx.querySelectorAll(".mk").forEach((x)=>x.setAttribute("aria-expanded","false"));b.removeAttribute("data-x");b.setAttribute("aria-expanded",String(!o))});b.addEventListener("pointerleave",()=>b.removeAttribute("data-x"));b.addEventListener("blur",()=>b.removeAttribute("data-x"))});
$("mx-am").checked=R.am;mx.querySelectorAll("input[name=mx-ut],input[name=mx-uv],input[name=mx-p]").forEach((i)=>{i.checked=i.value===R[i.name.slice(3)]});
const sh=D.stations.filter((s)=>!s.am||R.am),cs=sh.find((s)=>s.id===R.st)||sh.find((s)=>s.id===D.defaut)||sh[0];
$("mx-st").innerHTML=sh.map((s)=>'<label><input type="radio" name="mx-st" value="'+s.id+'"'+(s===cs?" checked":"")+'> <span>'+s.nom.replace(/&/g,"&amp;").replace(/</g,"&lt;")+(s.am?'<span class="mk-am">amateur</span>':"")+'<br><small>'+String(s.alt).replace(/\\B(?=(\\d{3})+(?!\\d))/g,"\\u202f")+"\\u00a0m · à "+String(s.d).replace(".",",")+"\\u00a0km</small></span></label>").join("");
$("mx-st").querySelectorAll("input").forEach((i)=>i.addEventListener("change",()=>{R.st=i.value;save();all()}));
$("mx-show").querySelectorAll("input").forEach((i)=>{i.checked=!R.hide.includes(i.value)})};
const show=(i)=>{const p=pts[i];if(!p)return;cur=i;const sv=$("mx-svg").querySelector("svg"),k=sv.getBoundingClientRect().width/cw,c=sv.querySelector(".cur"),o=sv.querySelector(".dot");
c.setAttribute("x1",p.x);c.setAttribute("x2",p.x);o.setAttribute("cx",p.x);o.setAttribute("cy",p.y);const tp=$("mx-tip");tp.innerHTML=p.html;tp.hidden=false;
const w=tp.offsetWidth,pw=sv.getBoundingClientRect().width;tp.style.left=Math.max(w/2,Math.min(pw-w/2,p.x*k))+"px";tp.style.top=Math.max(0,p.y*k-tp.offsetHeight-14)+"px"};
const hide=()=>{$("mx-tip").hidden=true;const sv=$("mx-svg").querySelector("svg");if(!sv)return;sv.querySelector(".cur")?.setAttribute("x1",-9);sv.querySelector(".cur")?.setAttribute("x2",-9);sv.querySelector(".dot")?.setAttribute("cx",-9);cur=-1};
const plot=$("mx-plot"),near=(ev)=>{if(!pts.length)return;const r=plot.getBoundingClientRect(),x=(ev.clientX-r.left)*cw/r.width;let b=0;pts.forEach((p,i)=>{if(Math.abs(p.x-x)<Math.abs(pts[b].x-x))b=i});show(b)};
plot.addEventListener("pointermove",near);plot.addEventListener("pointerdown",near);
document.addEventListener("pointerdown",(ev)=>{if(!(ev.target instanceof Element&&ev.target.closest("#mx .mk")))mx.querySelectorAll(".mk[aria-expanded=true]").forEach((x)=>x.setAttribute("aria-expanded","false"))});
document.addEventListener("keydown",(ev)=>{if(ev.key==="Escape")mx.querySelectorAll(".mk").forEach((x)=>{if(x.getAttribute("aria-expanded")==="true"||x.matches(":hover,:focus"))x.setAttribute("data-x","");x.setAttribute("aria-expanded","false")})});
plot.addEventListener("pointerleave",(ev)=>{if(ev.pointerType==="mouse")hide()});plot.addEventListener("blur",hide);
plot.addEventListener("keydown",(ev)=>{if(ev.key==="ArrowRight"||ev.key==="ArrowLeft"){ev.preventDefault();show(Math.max(0,Math.min(pts.length-1,(cur<0?pts.length-1:cur)+(ev.key==="ArrowRight"?1:-1))))}else if(ev.key==="Escape")hide()});
mx.querySelectorAll(".tabs button").forEach((b)=>b.addEventListener("click",()=>{R.p=b.dataset.p;save();all()}));
$("mx-am").addEventListener("change",(ev)=>{R.am=ev.target.checked;save();all()});
mx.querySelectorAll("input[name=mx-ut],input[name=mx-uv],input[name=mx-p]").forEach((i)=>i.addEventListener("change",()=>{R[i.name.slice(3)]=i.value;save();all()}));
$("mx-show").querySelectorAll("input").forEach((i)=>i.addEventListener("change",()=>{R.hide=[...$("mx-show").querySelectorAll("input")].filter((x)=>!x.checked).map((x)=>x.value);save();all()}));
$("mx-reset").addEventListener("click",()=>{R=Object.assign({},DEF,{hide:[]});S={};try{localStorage.removeItem(K)}catch(x){}all()});
let rw=0;addEventListener("resize",()=>{const w=Math.round(plot.clientWidth);if(w!==rw){rw=w;all()}});requestAnimationFrame(()=>setTimeout(()=>{all();rw=Math.round(plot.clientWidth)}))}}`;

let text: string | undefined;
/** The block's script, one for every place (its slug read from the block), kept a year by the browser at its address. */
export const chiffresScript = () => (text ??= SCRIPT());
let path: string | undefined;
export const chiffresScriptPath = () => (path ??= `/meteo/chiffres-${hash(chiffresScript())}.js`);

/**
 * The block for a place (`lieu`, its name; `slug`, its page), its figures as the default settings show them, or nothing
 * without figures. Marked so that the question to an assistant comes after it (pages.ts, askAfterData).
 */
export function enChiffres(c: Chiffres | undefined, lieu: string, slug: string): string {
  if (!c?.stations.length) return "";
  const D = donnees(c);
  const d = dessine(D, DEFAUT, LARGEUR);
  const radio = (name: string, v: string, label: string, on: boolean) => `<label><input type="radio" name="mx-${name}" value="${v}"${on ? " checked" : ""}> ${label}</label>`;
  const tab = (p: string, label: string) => `<button type="button" data-p="${p}" aria-pressed="${p === DEFAUT.p}">${label}</button>`;
  return `<section class="mx" id="mx" aria-labelledby="mx-t" data-s="${esc(slug)}" data-avant-ia>
<div class="mx-bar"><div><h2 id="mx-t">${esc(lieu)} en chiffres</h2><p class="mx-lead" id="mx-lead">${d.lead}</p></div>
<details class="mx-reg"><summary>Réglages</summary>
<div class="mx-panel">
<fieldset><legend>Station</legend><div id="mx-st"></div><label><input type="checkbox" id="mx-am"> <span>Montrer aussi les stations amateur (MétéoR-OI), à la fiabilité non vérifiée</span></label></fieldset>
<fieldset><legend>Unités</legend>${radio("ut", "c", "°C", true)}${radio("ut", "f", "°F", false)}${radio("uv", "kmh", "km/h", true)}${radio("uv", "kt", "nœuds", false)}${radio("uv", "ms", "m/s", false)}</fieldset>
<fieldset><legend>Période de la courbe</legend>${radio("p", "24", "24\u00a0h", true)}${radio("p", "7", "7 jours", false)}${radio("p", "30", "30 jours", false)}</fieldset>
<fieldset><legend>Chiffres affichés</legend><div id="mx-show">${FIGURES.map(([k, l]) => `<label><input type="checkbox" value="${k}" checked> ${l}</label>`).join("")}</div></fieldset>
<div class="mx-foot"><span>Vos réglages restent dans ce navigateur. Rien n'est envoyé, sans compte.</span><button type="button" id="mx-reset">Revenir aux réglages d'origine</button></div>
</div></details></div>
<div class="mx-chips" id="mx-chips">${d.chips}</div>
<div class="mx-card"><div class="mx-ch"><h3 id="mx-ct">${d.titre}</h3><div class="tabs" role="group" aria-label="Période de la courbe">${tab("24", "24\u00a0h")}${tab("7", "7 jours")}${tab("30", "30 jours")}</div></div>
<div class="mx-plot" id="mx-plot" tabindex="0" aria-label="Courbe\u00a0: flèches gauche et droite pour lire chaque valeur"><div id="mx-svg">${d.svg}</div><div class="mx-tip" id="mx-tip" role="status" hidden></div></div>
<p class="note" id="mx-cn">${d.note}</p></div>
<a class="mx-link" id="mx-link" href="${d.href}"${d.href ? "" : " hidden"}>${d.lien}</a>
<script type="application/json" id="mx-d">${inScript(D)}</script>
<script src="${chiffresScriptPath()}" defer></script>
</section>`;
}

/** The block's styles, in the site's sheet: the tokens of the page (the warm and cool of measure charts, kit.md). */
export const CSS_CHIFFRES = `.mx{margin:0 0 1.6rem}.mx h2{margin:0 0 .2rem}.mx-lead{color:var(--muted);margin:0 0 .8rem;max-width:62ch}
.mx-bar{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem 1rem;flex-wrap:wrap;margin-bottom:.6rem}.mx-bar>div:first-child{min-width:0;flex:1 1 20rem}
.mx-reg{flex:0 1 auto}.mx-reg[open]{flex-basis:100%}.mx-reg>summary{list-style:none;cursor:pointer;font-weight:700;font-size:.9rem;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:.5rem .9rem;display:inline-flex;gap:.4rem;align-items:center;min-height:44px}
.mx-reg>summary::-webkit-details-marker{display:none}.mx-reg>summary::before{content:"⚙";font-weight:400}
.mx-panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:.9rem;margin-top:.6rem;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.9rem}
@media (max-width:760px){.mx-panel{grid-template-columns:1fr 1fr}}@media (max-width:420px){.mx-panel{grid-template-columns:1fr}}
.mx fieldset{border:0;margin:0;padding:0;min-width:0}.mx legend{font-weight:700;font-size:.8rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:.3rem}
.mx-panel label{display:flex;gap:.45rem;align-items:flex-start;font-size:.9rem;margin:.3rem 0;cursor:pointer}.mx-panel small{color:var(--muted)}
.mx-foot{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.6rem;justify-content:space-between;align-items:center;font-size:.85rem;color:var(--muted);border-top:1px solid var(--line);padding-top:.6rem}
.mx-foot button{font:inherit;font-weight:700;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);border-radius:999px;padding:.5rem .8rem;cursor:pointer;min-height:44px}
.mx-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem}@media (max-width:640px){.mx-chips{grid-template-columns:repeat(2,minmax(0,1fr))}}
.mk{display:block;width:100%;position:relative;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:.7rem .75rem;font:inherit;color:inherit;cursor:help;min-width:0}
.mk:hover,.mk:focus-visible,.mk[aria-expanded=true]{border-color:var(--accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.mk-l{display:block;font-weight:700;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.mk-v{display:block;font-weight:800;font-size:1.3rem;line-height:1.2;margin:.25rem 0 .1rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.mk-s{display:block;font-size:.82rem;color:var(--muted);line-height:1.3}.mk-am{font-weight:700;font-size:.75rem;background:var(--hl);color:var(--ink);border-radius:6px;padding:.1rem .3rem;margin-left:.3rem;vertical-align:.15em}
.mk-tip,.mx-tip{position:absolute;z-index:5;background:var(--night);color:var(--on-night);border-radius:10px;padding:.5rem .65rem;font-size:.82rem;line-height:1.35;box-shadow:0 8px 24px rgb(0 0 0/.25);font-weight:400;text-transform:none;letter-spacing:0}
.mk-tip{left:.5rem;right:.5rem;top:calc(100% + 6px);display:none}.mk:hover .mk-tip,.mk:focus-visible .mk-tip,.mk[aria-expanded=true] .mk-tip{display:block}
.mk[data-x] .mk-tip{display:none}.mk .nw{white-space:nowrap}
@media (max-width:640px){.mx-chips>.mk:nth-child(odd) .mk-tip{right:calc(-100% - .6rem)}.mx-chips>.mk:nth-child(even) .mk-tip{left:calc(-100% - .6rem)}.mk-v{font-size:1.08rem}}
.mx-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:.9rem .9rem .6rem;margin-top:.75rem}
.mx-ch{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}.mx-ch h3{margin:0;font-size:1rem}
.mx .tabs{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:3px}.mx .tabs button{font:inherit;font-weight:700;font-size:.85rem;border:0;background:none;padding:.45rem .8rem;border-radius:999px;color:var(--ink);cursor:pointer;min-height:40px}
.mx .tabs button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.mx-plot{position:relative;margin-top:.4rem;touch-action:pan-y}.mx-plot:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
.mx-svg{display:block;width:100%;height:auto}.mx-svg .ax{font-size:.75rem;fill:var(--muted)}.mx-svg .gr{stroke:var(--line)}
.mx-svg .lt{fill:none;stroke:var(--chaud);stroke-width:2.5;stroke-linejoin:round}.mx-svg .bd{fill:var(--chaud);opacity:.25}.mx-svg .br{fill:var(--pluie)}
.mx-svg .dx{fill:var(--chaud)}.mx-svg .dn{fill:var(--frais)}.mx-svg .cur{stroke:var(--ink);stroke-dasharray:3 3}.mx-svg .dot{fill:var(--surface);stroke:var(--chaud);stroke-width:2.5}
.mx-tip{top:0;pointer-events:none;width:max-content;max-width:min(340px,calc(100% - 4px));transform:translateX(-50%)}.mx-tip[hidden]{display:none}
.mx-link{display:inline-block;margin-top:.7rem;font-weight:700}`;
