/**
 * The markets of La Réunion: those OpenStreetMap maps (src/vie/marches.json, scripts/build-marches.py), the forains and
 * the covered markets its contributors have mapped, with their days and hours when given; and those of the town halls'
 * own pages (src/vie/marches-mairies.json, read on 31/10/2026 and 20/11/2026), each with its page's date. Not all of them.
 * - A town hall's hours prevail over OpenStreetMap's for the same market (by its OpenStreetMap object).
 * - A market without hours in OpenStreetMap is held on the day its name says (« Marché Forain de Saint-Pierre (Samedi
 *   Matin) »): its name is OpenStreetMap's too.
 * - A market open five days a week or more is kept apart: a covered market is never « the market of the day ».
 * - A commune's public information is taken from its own site (decision of 20/11/2026): its markets' days, hours and
 *   place only, with its name and its page's link, read slowly (a page a minute), removed on request. A commune whose page gives a day without hours, or only a
 *   cancellation, is linked instead (`liens`). Nothing from the tourist offices'.
 */
import { distanceKm } from "../geo.js";
import { communeAt } from "../places/resolve.js";
import { minutees, paire } from "../tools/format.js";
import type { SourceInfo } from "../types.js";
import mairies from "./marches-mairies.json" with { type: "json" };
import data from "./marches.json" with { type: "json" };

export interface Marche {
  nom: string;
  horaires: string | null;
  horaires_osm: string | null;
  note: string | null;
  adresse: string | null;
  /** Its position, from OpenStreetMap: none for a market only a town hall gives. */
  lon?: number;
  lat?: number;
  osm?: string;
}

export const OSM: SourceInfo = {
  id: "osm_marches",
  nom: "Marchés cartographiés dans OpenStreetMap",
  organisme: "Les contributeurs d'OpenStreetMap",
  licence: "ODbL 1.0",
  attribution: "© les contributeurs d'OpenStreetMap",
  url: "https://www.openstreetmap.org/",
};

type Mairie = keyof typeof mairies.sources;
export const dayMonthYear = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
/** The page of a town hall a market comes from, its date when the page gives one. */
export const MAIRIES: Record<Mairie, SourceInfo & { date?: string; lu?: string }> = Object.fromEntries(Object.entries(mairies.sources).map(([id, s]) => [id, {
  id: `marches_${id}`,
  nom: `${s.organisme} : « ${s.nom} »${"date" in s ? `, page du ${dayMonthYear(s.date)}` : ""}`,
  organisme: s.organisme,
  licence: s.licence,
  attribution: s.organisme,
  url: s.url,
  ...("date" in s && { date: s.date }),
  lu: s.lu,
}])) as Record<Mairie, SourceInfo & { date?: string; lu?: string }>;

export type Lieu = Marche & { commune: string; source: SourceInfo & { date?: string; lu?: string }; lien: string };

let all: Lieu[] | undefined;
/** Every market with its commune and its source: OpenStreetMap's, a town hall's hours over them, then the town halls' own. */
export const MARCHES = () => (all ??= (() => {
  const theirs = mairies.marches.map((m) => ({ ...m, source: MAIRIES[m.source as Mairie] }));
  const osm = (data.marches as Marche[]).map((m): Lieu => {
    const t = theirs.find((x) => "osm" in x && x.osm === m.osm);
    const commune = communeAt(m.lon!, m.lat!);
    return t
      ? { ...m, nom: t.nom, horaires: t.horaires, horaires_osm: t.horaires_osm, adresse: t.lieu ?? m.adresse, commune, source: t.source, lien: t.source.url }
      : { ...m, commune, source: OSM, lien: m.osm! };
  });
  const only = theirs.filter((t) => !("osm" in t)).map((t): Lieu => ({ nom: t.nom, horaires: t.horaires, horaires_osm: t.horaires_osm, note: null, adresse: t.lieu, commune: t.commune, source: t.source, lien: t.source.url }));
  return [...osm, ...only];
})());

export const inCommune = (commune: string) => MARCHES().filter((m) => m.commune === commune);

/** The nearest markets OpenStreetMap places; those only a town hall gives have no position. */
export function nearest(lon: number, lat: number, max = 5) {
  return MARCHES().flatMap((m) => (m.lon != null && m.lat != null ? [{ ...m, km: distanceKm(lon, lat, m.lon, m.lat) }] : [])).sort((a, b) => a.km - b.km).slice(0, max);
}

/**
 * The page of the town hall that gives its markets' days, where nothing is taken from it (a day without hours, or only a
 * cancellation): its markets' page when it is the current one, else its home page.
 */
export const lienMairie = (commune: string): string | undefined => (mairies.liens as Record<string, string>)[commune];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
/** « 06:00 » → minutes after midnight. */
const minutes = (t: string) => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m ?? 0);
};

/**
 * The spans of a place's hours on the day of `now` at La Réunion, in minutes after midnight, from its OpenStreetMap
 * rules (« Fr 08:00-18:00;Sa 08:00-12:00 », « Mo-Sa 07:00-17:00 »), or undefined when it is not open that day or its
 * days are not given in that form.
 */
export function spansOn(m: Pick<Marche, "horaires_osm">, now: Date): [number, number][] | undefined {
  const today = new Date(now.getTime() + 4 * 3600_000).getUTCDay();
  for (const rule of (m.horaires_osm ?? "").split(";")) {
    const r = RULE.exec(rule);
    if (!r) continue;
    const held = r[1].split(",").some((d) => {
      const [from, to = from] = d.split("-").map((x) => DAYS.indexOf(x));
      return from >= 0 && to >= 0 && (from <= to ? from <= today && today <= to : today >= from || today <= to);
    });
    if (held) return spansOf(r[2]);
  }
  return undefined;
}

const RULE = /^\s*([A-Za-z,-]+)\s+([\d:,\s-]+)$/;
const spansOf = (times: string) => times.split(",").map((span) => span.trim().split("-").map(minutes) as [number, number]);

/** Whether a place's hours are written with their minutes, on every day: when one of its times, any day, has some (minutees()). */
export const withMinutes = (m: Pick<Marche, "horaires_osm">) =>
  minutees((m.horaires_osm ?? "").split(";").flatMap((rule) => {
    const r = RULE.exec(rule);
    return r ? spansOf(r[2]) : [];
  }));

/**
 * The hours of a market on the day of `now` (spansOn()): « de 8 h à 18 h », « de 06:00 à 12:00 » when another of its
 * times has minutes (withMinutes()), or undefined when it is not held that day.
 */
export const hoursOn = (m: Pick<Marche, "horaires_osm">, now: Date) => {
  const all = withMinutes(m);
  const spans = spansOn(m, now);
  // Only that day's spans: « Mo 06:00-12:00; Fr 0:00-12:00 » keeps its Monday hours.
  if (spans?.some(midnightSpan)) return NOT_FOUND;
  return spans?.map(([de, a]) => `de ${paire(de, a, all).join(" à ")}`).join(" et ");
};

/** What is said of a market's hours when its source gives none we can trust. */
export const NOT_FOUND = "heures non trouvées";

/**
 * Whether one of a market's spans starts at midnight and ends in the day (« Fr 0:00-12:00 »). No market of the island
 * opens at midnight: such hours are most likely an entry error in OpenStreetMap (Saint-André's « Marché », node
 * 5482625028, read on 24/10/2026), not a market's. Its day is kept, its hours are said not found, and no other hour is
 * guessed in their place. A whole day (« 00:00-24:00 ») is not such a span.
 */
export const fromMidnight = (m: Pick<Marche, "horaires_osm">) => (m.horaires_osm ?? "").split(";").some(ruleFromMidnight);

const midnightSpan = ([de, a]: [number, number]) => de === 0 && a > 0 && a < 24 * 60;
/** Whether one rule of OpenStreetMap hours (« Fr 0:00-12:00 ») has a span from midnight. */
const ruleFromMidnight = (rule: string) => {
  const r = RULE.exec(rule);
  return !!r && spansOf(r[2]).some(midnightSpan);
};

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * The day a market's name or note gives in OpenStreetMap when it has no hours there: « Marché Forain de Saint-Pierre
 * (Samedi Matin) », « le samedi entre 5h et 12h »; its part of the day, or its hours when they are written. Undefined
 * when they give no day, or several.
 */
export function dayOfName(m: Pick<Marche, "nom" | "note">): { jour: number; quand?: string } | undefined {
  const t = `${m.nom} ${m.note ?? ""}`.toLowerCase();
  const found = JOURS.flatMap((j, i) => (new RegExp(`(?<!\\p{L})${j}s?(?!\\p{L})`, "u").test(t) ? [i] : []));
  if (found.length !== 1) return undefined;
  const h = /(?:entre|de)\s*(\d{1,2})\s*h\s*(?:et|à)\s*(\d{1,2})\s*h/.exec(t);
  const quand = h ? `de ${Number(h[1])}\u00a0h à ${Number(h[2])}\u00a0h` : /après-midi/.test(t) ? "l'après-midi" : /matin/.test(t) ? "le matin" : undefined;
  return { jour: found[0], ...(quand && { quand }) };
}

/** Its days in words: its hours, else the day its name gives (« le samedi matin »), else undefined. */
export function jours(m: Pick<Marche, "nom" | "note" | "horaires" | "horaires_osm">): string | undefined {
  // Its days without the hours of a span from midnight (fromMidnight()): « le vendredi, heures non trouvées ».
  if (m.horaires && fromMidnight(m)) {
    const said = (horaires_osm: string) => `le ${[...daysOf({ horaires_osm })].map((d) => JOURS[d]).join(", le ")}, ${NOT_FOUND}`;
    // `horaires` is written rule by rule, joined by « ; » (scripts/build-marches.py): only the rules from midnight lose their
    // hours, the others keep theirs. Parts that do not match the rules: every day said without hours, nothing guessed.
    const rules = m.horaires_osm!.split(";");
    const parts = m.horaires.split("\u00a0; ");
    return parts.length === rules.length ? parts.map((p, i) => (ruleFromMidnight(rules[i]) ? said(rules[i]) : p)).join("\u00a0; ") : said(m.horaires_osm!);
  }
  if (m.horaires) return m.horaires;
  const d = dayOfName(m);
  return d && `le ${JOURS[d.jour]}${d.quand === "le matin" ? " matin" : d.quand === "l'après-midi" ? " après-midi" : d.quand ? ` ${d.quand}` : ""}`;
}

/** The days of the week its OpenStreetMap hours hold it, 0 for Sunday. */
function daysOf(m: Pick<Marche, "horaires_osm">): Set<number> {
  const out = new Set<number>();
  for (const rule of (m.horaires_osm ?? "").split(";")) {
    const r = RULE.exec(rule);
    for (const d of r ? r[1].split(",") : []) {
      const [from, to = from] = d.split("-").map((x) => DAYS.indexOf(x));
      if (from < 0 || to < 0) continue;
      for (let i = from; ; i = (i + 1) % 7) {
        out.add(i);
        if (i === to) break;
      }
    }
  }
  return out;
}

/** Open five days a week or more: a covered or craft market, never « the market of the day ». */
export const permanent = (m: Pick<Marche, "horaires_osm">) => daysOf(m).size >= 5;

/**
 * The commune's markets held on the day of `now`, with their hours that day, or the part of the day their name gives;
 * those open all week are not among them (apart()).
 */
export const heldOn = (commune: string, now: Date) =>
  inCommune(commune).flatMap((m) => {
    if (permanent(m)) return [];
    const h = m.horaires_osm ? hoursOn(m, now) : undefined;
    const d = m.horaires_osm ? undefined : dayOfName(m);
    const today = new Date(now.getTime() + 4 * 3600_000).getUTCDay();
    const said = h ?? (d?.jour === today ? (d.quand ?? NOT_FOUND) : undefined);
    return said ? [{ ...m, horaires_aujourd_hui: said }] : [];
  });

/** The commune's markets open all week, apart: their week, and their hours on the day of `now` or « fermé aujourd'hui ». */
export const apart = (commune: string, now: Date) =>
  inCommune(commune).filter(permanent).map((m) => ({ ...m, horaires_aujourd_hui: hoursOn(m, now) ?? "fermé aujourd'hui" }));

/** The commune's markets whose days no source gives: never dropped, never said closed. */
export const sansJours = (commune: string) => inCommune(commune).filter((m) => !m.horaires_osm && !dayOfName(m));

/** The day OpenStreetMap's markets were read (scripts/build-marches.py): « relevé le 24/10/2026 ». */
export const OSM_LU = data.construit;

/** A market held on a day, for the agenda: its hours that day as its source gives them, and where they come from. */
export interface DuJour {
  nom: string;
  commune: string;
  horaires: string;
  adresse?: string;
  /** « OpenStreetMap, relevé le 24/10/2026 », « Ville de Saint-Paul, site lu le 31/10/2026 », with its page's date. */
  d_apres: string;
  lien: string;
}

/**
 * The markets held on a day of La Réunion (« 2026-11-21 »), in every commune or in one: those whose day and hours come
 * from a source, its hours that day (heldOn()), or the part of the day its name gives (« le matin »). Never one whose
 * hours no source gives, never one open all week, and never « open »: the day a source gives, with that source and the
 * day it was read.
 */
export function marchesDuJour(day: string, commune?: string): DuJour[] {
  // Noon at La Réunion that day: heldOn() takes the weekday of its time there.
  const at = new Date(`${day}T08:00:00Z`);
  const communes = commune ? [commune] : [...new Set(MARCHES().map((m) => m.commune))];
  return communes.flatMap((c) => heldOn(c, at))
    .filter((m) => m.horaires_aujourd_hui !== "heures non trouvées")
    .map((m) => ({
      nom: m.nom,
      commune: m.commune,
      horaires: m.horaires_aujourd_hui,
      ...(m.adresse && { adresse: m.adresse }),
      d_apres: m.source === OSM
        ? `OpenStreetMap, relevé le ${dayMonthYear(OSM_LU)}`
        : `${m.source.organisme}, site lu le ${dayMonthYear(m.source.lu ?? mairies.lu)}${m.source.date ? ` (page du ${dayMonthYear(m.source.date)})` : ""}`,
      lien: m.lien,
    }))
    .sort((x, y) => x.commune.localeCompare(y.commune, "fr") || x.nom.localeCompare(y.nom, "fr"));
}
