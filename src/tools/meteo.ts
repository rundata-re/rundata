import type { Cache, Cached } from "../cache.js";
import { distanceKm, versant } from "../geo.js";
import { INSEE } from "../places/insee.js";
import { communeAt, resolvePlace, type Resolution } from "../places/resolve.js";
import * as meteofrance from "../providers/meteofrance.js";
import * as metar from "../providers/metar.js";
import * as ffvl from "../providers/ffvl.js";
import * as meteorOi from "../providers/meteor-oi.js";
import * as radar from "../providers/radar.js";
import { radarAt } from "./radar.js";
import { recentRainBlock } from "./pluie-recente.js";
import { hasExtremes, todayTemperatureBlock } from "./temperature-du-jour.js";
import { type Observation, type SourceInfo, why } from "../types.js";
import { fit, mieux } from "./representativeness.js";
import { credits, de, fr, notFound, phrases, placeBlock, placeWarning, show, text, when } from "./format.js";

interface Provider {
  source: SourceInfo;
  observations: (c: Cache, now: Date) => Promise<Cached<Observation[]>>;
  /** False when the source needs a key this server was not given: it is then left out, not reported down. */
  enabled?: () => boolean;
}

const ALL_PROVIDERS: Provider[] = [
  { source: meteofrance.SOURCE, observations: meteofrance.observations, enabled: meteofrance.enabled },
  { source: metar.SOURCE, observations: (c) => metar.observations(c) },
  { source: ffvl.SOURCE, observations: ffvl.observations },
  { source: meteorOi.SOURCE, observations: meteorOi.observations },
];

/** Every network a station can come from, keyed or not: what a station's `source` names (resume.ts credits by it). */
export const NETWORKS: SourceInfo[] = ALL_PROVIDERS.map((p) => p.source);

/** True for a station of an amateur network (SourceInfo `amateur`): its measure as it is, its reliability not checked. */
export const amateur = (source: string) => NETWORKS.some((n) => n.id === source && n.amateur);

/** What a station of an amateur network is said to be, beside its measures (the user's words, 10/11/2026). */
export const NATURE_AMATEUR = "mesure de station amateur, fiabilité non vérifiée";

/** An amateur network's short name (« MétéoR-OI »); undefined for an official one. */
export const reseauAmateur = (source: string) => {
  const n = NETWORKS.find((x) => x.id === source && x.amateur);
  return n && (n.court ?? n.organisme);
};

/** What a page says of an amateur station, beside it (the user's words, 10/11/2026): « station amateur (MétéoR-OI), fiabilité non vérifiée ». */
export const ditAmateur = (source: string) => {
  const n = reseauAmateur(source);
  return n ? `station amateur (${n}), fiabilité non vérifiée` : undefined;
};

export function providers(): Provider[] {
  return ALL_PROVIDERS.filter((p) => p.enabled?.() ?? true);
}

/** What the stations are; with `n`, how many measured in the answer's reading (sources_donnees reads none: no number). */
export function coverage(n?: number): string {
  return meteofrance.enabled()
    ? `${n ? `Les ${n}\u00a0stations qui ont mesuré dans cette lecture\u00a0: celles` : "Les stations"} de Météo-France, de la côte aux sommets et dans les cirques (mesures toutes les ` +
        "6 min, publiées 5 à 10 min après : température, pluie, et pour une partie d'entre elles humidité et vent), " +
        "les observations des 2 aéroports (METAR, état du ciel), et des balises de vent : " +
        "Kélonia à Saint-Leu, le Trou d'Eau et le Maïdo à Saint-Paul, Matouta à Saint-Joseph (FFVL, quand elles émettent)\u00a0; " +
        "et les stations de l'association MétéoR Océan Indien (température, pluie, vent, mesurés toutes les 5 min et relus toutes les 10 min), en particulier à Marla dans Mafate, dans les Hauts du Sud, sur la côte de Saint-Joseph et dans l'Est."
    : "Version 0.1 : seules les sources ouvertes sans clé sont branchées, soit les 2 stations des aéroports " +
        "(Saint-Denis Gillot et Saint-Pierre Pierrefonds, toutes les 30 min), les balises de vent de la FFVL qui émettent, " +
        "et les stations de l'association MétéoR Océan Indien (température, pluie, vent, mesurés toutes les 5 min et relus toutes les 10 min), dont Marla dans Mafate.";
}

// Without a place, the tour of the island: coast on every side, the Hauts and a cirque, not all of them.
const TOUR_METEOFRANCE = [
  "97418110", // Saint-Denis Gillot
  "97407520", // Le Port
  "97415590", // Pointe des Trois-Bassins
  "97416463", // Saint-Pierre Pierrefonds
  "97417360", // Le Baril
  "97410238", // Saint-Benoît
  "97419350", // Gros Piton Sainte-Rose (côte est, au vent)
  "97422440", // Plaine des Cafres
  "97424410", // Cilaos
  "97415566", // Piton Maïdo
];

/**
 * Past this age a station's measure is said old (« Mesure ancienne »), here and on the place's page (web/pages.ts). A
 * station that sends its hour at once (Mare à Vieille Place) reaches 63 min before its next hour, without a fault;
 * one that misses more leaves the readings (SLOTS, providers/meteofrance.ts). /meteo read 19 times, 06/11/2026.
 */
export const OLD_MINUTES = 90;

/**
 * Past this age, a measure of a copy kept after a failed read is left out, its source said unavailable: until then it is
 * shown with its time, as every measure (rule of 3 ter: the last reading kept, said with its hour). A copy read minutes
 * before a failure hid Gillot and Pierrefonds from the island's temperatures (aviationweather.gov, 07/11/2026).
 */
export const COPY_MAX_MINUTES = 3 * 60;

async function collect(cache: Cache, now: Date, list: Provider[]) {
  const results = await Promise.allSettled(list.map((p) => p.observations(cache, now)));
  // `stale`: its source did not answer at the last read, the measure served from the copy kept (said to an assistant).
  const obs: { o: Observation; stale: boolean }[] = [];
  const down: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const kept = r.value.value.filter((o) => !r.value.stale || now.getTime() - o.time.getTime() <= COPY_MAX_MINUTES * 60_000);
      kept.forEach((o) => obs.push({ o, stale: r.value.stale }));
      // Every measure of the copy too old: the source is said unavailable, as when there is no copy.
      if (r.value.stale && r.value.value.length && !kept.length) down.push(list[i].source.nom);
    } else {
      down.push(list[i].source.nom);
      console.error(`source ${list[i].source.id} indisponible:`, why(r.reason)); // shows in the Worker logs
    }
  });
  return { obs, down };
}

// The commune of each INSEE code. A station of Météo-France has its commune's code first in its id (97422445, Bras-Sec,
// is in Le Tampon, not in Cilaos with the îlet of that name); another, the commune of the nearest named place.
const BY_INSEE = new Map(Object.entries(INSEE).map(([nom, code]) => [code, nom]));
const stationCommune = (s: Observation["station"]) =>
  (s.source === "meteofrance" && BY_INSEE.get(s.id.slice(0, 5))) || communeAt(s.lon, s.lat);

function stationBlock(o: Observation, stale: boolean, now: Date) {
  const mesures: Record<string, string> = {};
  for (const r of o.readings) mesures[r.variable] = show(r);
  const t = when(o.time, now);
  const avertissements: string[] = [];
  if (t.age_min > OLD_MINUTES) avertissements.push(`Mesure ancienne (${t.age_texte}).`);
  if (stale) avertissements.push("Source momentanément injoignable : dernière valeur connue.");
  return {
    station: o.station.nom,
    // Said wherever the station stands in another commune than the place's (« Bellevue Bras-Panon » for Salazie).
    commune: stationCommune(o.station),
    source: o.station.source,
    // The credit the association asked for, beside each of its measures.
    ...(amateur(o.station.source) ? { amateur: true, nature: NATURE_AMATEUR } : {}),
    ...(o.station.source === meteorOi.SOURCE.id ? { credit: meteorOi.CREDIT, lien: meteorOi.SITE } : {}),
    altitude_m: o.station.altitude_m,
    ...t,
    mesures,
    avertissements,
    brut: o.brut,
  };
}

function rainText(o: Observation): string | undefined {
  const mm = (variable: string) => o.readings.find((r) => r.variable === variable)?.valeur as number | undefined;
  const now6 = mm("pluie_6min");
  const hour = mm("pluie_1h");
  if (now6 != null && now6 > 0) return `il pleut (${fr(now6)} mm en 6 min${hour != null ? `, ${fr(hour)} mm en 1 h` : ""})`;
  if (hour != null && hour > 0) return `${fr(hour)} mm de pluie dans l'heure, plus rien ces 6 dernières minutes`;
  if (hour === 0) return "pas de pluie depuis 1 h";
  if (now6 === 0) return "pas de pluie ces 6 dernières minutes";
  return undefined;
}

// What people ask about the weather; a station bringing only the sky or the pressure is no reason to look further.
const ASKED = new Set(["temperature", "humidite", "vent_moyen", "rafales", "pluie_6min", "pluie_1h"]);

/** True for a second station at the same spot (an airport is both a Météo-France station and a METAR). */
function sameSpot(a: Observation, b: Observation): boolean {
  return a !== b && distanceKm(a.station.lon, a.station.lat, b.station.lon, b.station.lat) < 1;
}

function sentence(name: string, o: Observation, now: Date): string {
  const v = Object.fromEntries(o.readings.map((r) => [r.variable, show(r)]));
  const parts: string[] = [];
  if (v.temperature) parts.push(v.temperature);
  if (v.humidite) parts.push(`humidité ${v.humidite.replace(" (calculée)", "")}`);
  if (v.vent_moyen) {
    const dir = v.vent_direction ? `${v.vent_direction.split(" ")[0]} ` : "";
    parts.push(`vent ${dir}${v.vent_moyen}${v.rafales ? `, rafales ${v.rafales}` : ""}`);
  }
  const rain = rainText(o);
  if (rain) parts.push(rain);
  if (v.temps_present) parts.push(v.temps_present);
  else if (v.ciel) parts.push(v.ciel);
  const t = when(o.time, now);
  return `${name} : ${parts.join(", ")} (mesuré à ${t.heure_mesure.split(" ")[1]} heure de La Réunion, ${t.age_texte})`;
}

/**
 * Every station that measured, an airport's METAR left out where Météo-France measures at the same spot: the stations
 * /meteo counts in its title, the press page and the coverage of meteo_actuelle, one number for all (counted at each
 * answer, never written in the code).
 */
export function toutes<T extends { o: Observation }>(obs: T[]): T[] {
  const mf = obs.filter(({ o }) => o.station.source === "meteofrance");
  return obs.filter(({ o }) => !(o.station.source === "metar" && mf.some((m) => sameSpot(o, m.o))));
}

/** The tour of the island, without a place: the stations of TOUR_METEOFRANCE, then the other sources' own, never an amateur one. */
export async function islandTour(cache: Cache, now = new Date()) {
  const list = providers();
  const { obs, down } = await collect(cache, now, list);
  const mf = obs.filter(({ o }) => o.station.source === "meteofrance");
  const rank = (o: Observation) => (o.station.source === "meteofrance" ? TOUR_METEOFRANCE.indexOf(o.station.id) : 99);
  const tour = obs
    .filter(({ o }) =>
      o.station.source === "meteofrance"
        ? rank(o) >= 0
        : !amateur(o.station.source) && !(o.station.source === "metar" && mf.some((m) => sameSpot(o, m.o))),
    )
    .sort((a, b) => rank(a.o) - rank(b.o));
  return { tour, all: toutes(obs), down, sources: list.map((p) => p.source) };
}

// A METAR's sky now, its trend (TEMPO, BECMG) left out: broken or overcast clouds, drizzle, rain or showers nearby.
const LOADED_SKY = /\b(BKN|OVC)\d{3}|(^|\s)[-+]?(DZ|RA|SHRA)\b|\bVCSH\b/;

/**
 * With a place, the rain of the last hours at its nearest gauge and the max and min since midnight (`recent`). The place
 * pages' build asks for the max and min only (`"jour"`).
 */
export async function meteoActuelle(cache: Cache, lieu: string | undefined, now = new Date(), recent: boolean | "jour" = true) {
  if (!lieu?.trim()) {
    const { tour, all, down, sources } = await islandTour(cache, now);
    return text({
      resume: tour.map(({ o }) => sentence(o.station.nom, o, now)).join("\u00a0; ") || "Aucune mesure disponible.",
      stations: tour.map(({ o, stale }) => ({ ...stationBlock(o, stale, now), versant: versant(o.station.lon, o.station.lat) })),
      sources_indisponibles: down.length ? down : undefined,
      couverture: coverage(all.length),
      sources: credits(sources),
    });
  }

  const r: Resolution | null = resolvePlace(lieu);
  if (!r) return notFound(lieu);

  const list = providers();
  const [{ obs, down }, rain] = await Promise.all([collect(cache, now, list), radarAt(cache, r.lieu, now)]);
  const sources = credits([...list.map((p) => p.source), ...(rain ? [radar.SOURCE] : [])]);
  const indisponibles = down.length ? down : undefined;

  const all = obs
    .map(({ o, stale }) => ({ o, stale, f: fit(r.lieu, o.station) }))
    .sort((a, b) => mieux(a.f, b.f));
  // The stations of the official networks answer; an amateur one only comes after them, as a complement (below).
  const ranked = all.filter((x) => !amateur(x.o.station.source));

  // Best station first. Second, the best one that brings what people ask about and the first lacks (a temperature
  // next to a wind-only beacon), else simply the next best: on a summit, another summit station, not an airport
  // that only adds the sky. Last, one more for any variable still missing, however far: its warnings say how much
  // to trust it, and it is listed but not summed up.
  const chosen: typeof ranked = [];
  const covered = new Set<string>();
  const take = (x: (typeof ranked)[number] | undefined) => {
    if (!x) return;
    chosen.push(x);
    x.o.readings.forEach((rd) => covered.add(rd.variable));
  };
  const elsewhere = (x: (typeof ranked)[number]) => !chosen.includes(x) && !chosen.some((y) => sameSpot(x.o, y.o));
  take(ranked[0]);
  // At the same spot too when it brings the temperature a wind beacon lacks: Le Port's station is 0,5 km from Cambaie's.
  const warms = (x: (typeof ranked)[number]) => !covered.has("temperature") && x.o.readings.some((rd) => rd.variable === "temperature");
  take(ranked.find((x) => (elsewhere(x) || (!chosen.includes(x) && warms(x))) && x.o.readings.some((rd) => ASKED.has(rd.variable) && !covered.has(rd.variable))) ?? ranked.find(elsewhere));
  take(ranked.find((x) => !chosen.includes(x) && x.o.readings.some((rd) => !covered.has(rd.variable))));
  // Last, the nearest amateur station when it speaks for the place (« bonne » or « moyenne »): listed with what it is,
  // never summed up, never first (the user, 10/11/2026: « telles quelles, avec une fiabilité non vérifiée »).
  const complement = all.find((x) => amateur(x.o.station.source) && x.f.pertinence !== "faible");
  if (complement) chosen.push(complement);

  const shown = chosen.filter((x) => x !== complement).slice(0, 2);
  // Named, since the warning often concerns the second station only.
  const warnings = [...new Set(shown.filter((x) => x.f.pertinence !== "bonne" && x.f.avertissements[0])
    .map((x) => `${x.o.station.nom} : ${x.f.avertissements[0].replace(/^La station est/, "station")}`))];
  // The rain of the last hours at the best-placed gauge.
  const recentRain = recent && meteofrance.enabled() ? await meteofrance.recentRain(cache, now) : undefined;
  const gauge = recent === true && recentRain && ranked.find((x) => x.o.station.source === "meteofrance" && recentRain.hourly.rr[x.o.station.id]);
  // Nothing in the hour under way nor in the newest full hour.
  const dry = (id: string) => recentRain!.slots(id).every((x) => !x.rr) && recentRain!.hourly.rr[id][0] === 0;
  const sky = obs.some(({ o }) =>
    o.station.source === "metar" && o.brut && fit(r.lieu, o.station).versant === versant(r.lieu.lon, r.lieu.lat) &&
    LOADED_SKY.test(o.brut.split(/\b(TEMPO|BECMG|NOSIG)\b/)[0]));
  // The drizzle note: nothing at the gauge nor on the radar at the place, under a loaded sky or rain on the radar nearby.
  const drizzle = Boolean(gauge && dry(gauge.o.station.id) && (!rain || rain.bloc.au_lieu_mm_h === 0) &&
    (sky || Number(rain?.bloc.max_3km_mm_h ?? 0) > 0));
  const pluie = gauge ? recentRainBlock(recentRain!, { id: gauge.o.station.id, nom: gauge.o.station.nom, fit: gauge.f }, r.lieu.nom, now, drizzle) : undefined;
  // The lowest and highest temperature since midnight, from the same hourly package, at the best-placed station that has them.
  const thermo = recentRain && ranked.find((x) => x.o.station.source === "meteofrance" && hasExtremes(recentRain, x.o.station.id));
  const jour = thermo ? todayTemperatureBlock(recentRain!, { id: thermo.o.station.id, nom: thermo.o.station.nom, fit: thermo.f }, now) : undefined;

  const resume = shown.length
    ? `Mesures les plus proches ${de(r.lieu.nom)} — ` +
      shown
        .map((x) => sentence(`${x.o.station.nom} (${fr(x.f.distance_km)} km, direction ${x.f.direction}, pertinence ${x.f.pertinence})`, x.o, now))
        .join("\u00a0; ") +
      (warnings.length ? `. Attention : ${warnings.join(" ")}` : "")
    : "Aucune mesure disponible pour le moment.";
  // Each piece a sentence: the stations' end with their time in brackets, and « Depuis minuit » starts a new one.
  const resumeAll = phrases([placeWarning(lieu, r), resume, jour?.resume, rain?.resume, pluie?.resume]);

  return text({
    lieu: placeBlock(lieu, r),
    resume: resumeAll,
    stations: chosen.map(({ o, stale, f }) => {
      const { avertissements, score: _score, ...rest } = f;
      const block = stationBlock(o, stale, now);
      return { ...block, ...rest, avertissements: [...avertissements, ...block.avertissements] };
    }),
    temperature_depuis_minuit: jour && (({ resume: _, ...block }) => block)(jour),
    radar: rain?.bloc,
    pluie_recente: pluie && (({ resume: _, ...block }) => block)(pluie),
    sources_indisponibles: indisponibles,
    couverture: coverage(toutes(obs).length),
    sources,
  });
}
