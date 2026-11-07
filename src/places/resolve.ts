/**
 * Free-text place → point with altitude. "plage de l'Hermitage", "St Pierre", "cilaos", "-21.05, 55.22".
 * Built on src/places/gazetteer.json (scripts/build-gazetteer.py): communes, villages, quartiers, beaches,
 * peaks, viewpoints and freshwater pools from OpenStreetMap, the named places of IGN's BD TOPO (lieux-dits, parks,
 * stadiums, ravines, roads…), with IGN altitudes.
 */
import gazetteer from "./gazetteer.js";
import { distanceKm, inReunion } from "../geo.js";

export interface Place {
  nom: string;
  type: string;
  lon: number;
  lat: number;
  altitude_m: number | null;
  commune: string;
  population?: number;
}

export interface Resolution {
  lieu: Place;
  correspondance: "exacte" | "partielle" | "approchee" | "coordonnees";
  /** A place given for a whole area the text names (« Mafate », La Nouvelle): « approchee », said so. */
  tient_lieu?: true;
  /** Other places the text could mean, when the match is not exact. */
  autres: Place[];
  /** The words of the text left aside around the name found, but its commune's (« parc », « palmiers » around « Saint-Pierre »). */
  ignores?: string[];
}

// Words that carry no identity ("plage de la …"), dropped from both the question and the names.
const FILLER = new Set([
  "a", "au", "aux", "d", "de", "des", "du", "en", "l", "la", "le", "les", "sur", "pres", "vers", "cote", "plage",
  "commune", "ville", "quartier", "ile", "reunion", "974", "the", "beach", "in", "at", "near", "town",
]);
const SPELLING: Record<string, string> = { st: "saint", ste: "sainte", hermitage: "ermitage" };
const BEACH_WORDS = /\b(plage|beach|lagon|baignade|se baigner)\b/;

// When several places match equally well, the more common meaning wins.
const RANK: Record<string, number> = {
  commune: 0, localite: 1, plage: 2, quartier: 3, sommet: 4, point_de_vue: 5, bassin: 6, port: 7, baie: 8,
  cap: 9, lieu_dit: 10, aeroport: 11, parc: 12, site: 13, equipement: 14, ravine: 15, route: 16,
};

// Words that name a kind of place, not one: alone (« route forestière », « parc »), they are no place, rather than the
// first of the many places so named.
// The words of a street address: no place is found in them, nor in their likes (« allée » is not « La Vallée »,
// « chemin » not « Chemin Commune »).
const STREET_WORDS = new Set([
  "chemin", "rue", "allee", "impasse", "avenue", "av", "boulevard", "bd", "lot", "lotissement", "residence", "res",
  "bis", "lieu", "dit", "sentier", "piste",
]);
const KIND_WORDS = new Set([
  ...STREET_WORDS, "route", "forestiere", "nationale", "numero", "parc", "jardin", "square", "stade", "piscine",
  "ravine", "riviere", "cascade", "gite", "zone", "activites", "aire", "accueil", "jeux",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .map((t) => SPELLING[t] ?? t)
    .filter((t) => t && !FILLER.has(t));
}

interface Entry {
  place: Place;
  tokens: string[];
  key: string;
  alias: boolean;
  /** An alias of an area for one place of it (STAND_INS). */
  standIn?: boolean;
}

// Aliases that name an area, a cirque or the volcan, for the one place of it that answers stand for: a match, but not
// that place's name (« Mafate » is the cirque, La Nouvelle one of its îlets).
const STAND_INS = new Set(["Cirque de Mafate", "Mafate", "Volcan", "Piton de la Fournaise"]);

const PLACES = [...gazetteer.places, ...gazetteer.places_ign] as Place[];
const byName = new Map(PLACES.map((p) => [p.nom, p]));
const INDEX: Entry[] = [
  ...PLACES.map((place) => ({ place, tokens: tokens(place.nom), alias: false })),
  ...Object.entries(gazetteer.aliases as Record<string, string>).map(([alias, target]) => ({
    place: byName.get(target)!,
    tokens: tokens(alias),
    alias: true,
    standIn: STAND_INS.has(alias),
  })),
]
  .filter((e) => e.tokens.length > 0)
  .map((e) => ({ ...e, key: e.tokens.join(" ") }));

// The entries by their exact key: a question that is a name, as most are, needs no comparison with the others.
const EXACT = new Map<string, Entry[]>();
for (const e of INDEX) EXACT.set(e.key, [...(EXACT.get(e.key) ?? []), e]);

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function similar(a: string, b: string): number {
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function score(q: string[], e: Entry): { score: number; kind: Resolution["correspondance"]; rest?: string[] } | null {
  const qk = q.join(" ");
  if (qk === e.key) return { score: e.alias ? 101 : 100, kind: "exacte" };
  const inName = q.every((t) => e.tokens.includes(t));
  if (inName) return { score: 80 - 3 * (e.tokens.length - q.length), kind: "partielle" };
  // The question carries extra words around the name ("il fait beau à cilaos aujourd'hui").
  const inQuestion = e.tokens.every((t) => q.includes(t)) && !e.tokens.every((t) => STREET_WORDS.has(t));
  if (inQuestion) {
    // The name and its commune ("parc des palmiers, le tampon") is the name, said where it is.
    const commune = tokens(e.place.commune);
    const rest = q.filter((t) => !e.tokens.includes(t) && !commune.includes(t));
    if (rest.length === 0) return { score: 95, kind: "exacte" };
    return { score: 50 + 5 * e.tokens.length, kind: "partielle", rest };
  }
  // Typos: every name token close to some question token. Two words whose lengths differ by more than 30 % cannot be
  // that close (the distance is at least the difference), so they are not compared.
  if (e.tokens.length <= q.length + 1) {
    let sum = 0;
    for (const t of e.tokens) {
      let best = 0;
      for (const u of q) {
        if (STREET_WORDS.has(u)) continue;
        if (Math.abs(t.length - u.length) <= 0.3 * Math.max(t.length, u.length)) best = Math.max(best, similar(t, u));
      }
      if (best < 0.7) return null;
      sum += best;
    }
    const avg = sum / e.tokens.length;
    if (avg >= 0.8) return { score: 40 * avg, kind: "approchee" };
  }
  return null;
}

// Places off the island that a word of its own names would give otherwise (« Paris », Le Petit Paris ; « Maurice », Fond
// Maurice, Les Avirons ; « Saint-Pierre et Miquelon », Saint-Pierre): no place of La Réunion, rather than the wrong one. Only
// when the text says nothing else and no name of the island is written so.
const ELSEWHERE = [
  "maurice", "port louis", "curepipe", "rodrigues", "mayotte", "mamoudzou", "madagascar", "antananarivo", "tananarive",
  "tamatave", "comores", "moroni", "seychelles", "maldives", "tromelin", "afrique sud", "paris", "marseille", "lyon",
  "toulouse", "nice", "nantes", "bordeaux", "lille", "strasbourg", "montpellier", "rennes", "metropole", "hexagone",
  "france metropolitaine", "martinique", "guadeloupe", "guyane", "nouvelle caledonie", "tahiti", "polynesie", "miquelon",
  "saint pierre et miquelon",
].map(tokens);

/** Whether a text names a place off the island alone (« Paris », « l'île Maurice », « Port-Louis, Maurice »). */
export function offIsland(text: string): boolean {
  const q = tokens(text);
  if (!q.length || EXACT.has(q.join(" "))) return false;
  const hits = ELSEWHERE.filter((n) => n.every((t) => q.includes(t)));
  return hits.length > 0 && q.every((t) => hits.some((n) => n.includes(t)));
}

const COORDS = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;

// The last texts asked and what they gave: a question's place is resolved by its tool, then again by the metrics.
// Shared answers: callers must not change them.
const RECENT = new Map<string, Resolution | null>();
const RECENT_SIZE = 64;

export function resolvePlace(text: string): Resolution | null {
  if (RECENT.has(text)) return RECENT.get(text)!;
  const r = resolve(text);
  RECENT.set(text, r);
  if (RECENT.size > RECENT_SIZE) RECENT.delete(RECENT.keys().next().value!);
  return r;
}

function resolve(text: string): Resolution | null {
  const m = COORDS.exec(text);
  if (m) {
    let [a, b] = [parseFloat(m[1].replace(",", ".")), parseFloat(m[2].replace(",", "."))];
    if (Math.abs(a) > 50) [a, b] = [b, a]; // "55.22, -21.05": longitude first
    if (!inReunion(b, a)) return null;
    return {
      lieu: { nom: `${a.toFixed(4)}, ${b.toFixed(4)}`, type: "coordonnees", lon: b, lat: a, altitude_m: null, commune: "" },
      correspondance: "coordonnees",
      autres: [],
    };
  }

  const q = tokens(text);
  if (q.length === 0) return null;
  const wantsBeach = BEACH_WORDS.test(normalize(text));
  const rank = (p: Place) => (wantsBeach && p.type === "plage" ? -1 : RANK[p.type] ?? 99);

  const order = (x: { score: number; place: Place }, y: { score: number; place: Place }) =>
    y.score - x.score || rank(x.place) - rank(y.place) || (y.place.population ?? 0) - (x.place.population ?? 0);

  // An exact name scores above any other kind of match, and comes alone. Among names that differ only by their small
  // words (« Plaine des Sables », « La Plaine aux Sables »), the one written as asked comes first, its article aside
  // (« Ravine des Cabris » is the town of La Ravine des Cabris as much as the ravine).
  const bare = (s: string) => normalize(s).replace(/^(?:le|la|les|l) /, "");
  const asked = bare(text);
  // A dash between names lists places (« La Plaine – Bois-de-Nèfles »): not one name that only differs from them by its
  // small words (« La Plaine du Bois de Nèfles », in another commune).
  const listed = /\s[–—-]\s/.test(text) && !EXACT.get(q.join(" "))?.some((e) => bare(e.place.nom) === asked);
  const exact = listed ? undefined : EXACT.get(q.join(" "));
  if (exact) {
    const best = exact.map((e) => ({ score: (e.alias ? 101 : 100) + (bare(e.place.nom) === asked ? 0.5 : 0), place: e.place, standIn: e.standIn })).sort(order)[0];
    return best.standIn ? { lieu: best.place, correspondance: "approchee", autres: [], tient_lieu: true } : { lieu: best.place, correspondance: "exacte", autres: [] };
  }
  if (q.every((t) => KIND_WORDS.has(t))) return null;
  if (offIsland(text)) return null;

  const matches = INDEX.flatMap((e) => {
    const s = listed && e.key === q.join(" ") ? null : score(q, e);
    return s ? [{ ...s, place: e.place, standIn: e.standIn && s.kind === "exacte" }] : [];
  }).sort(order);
  if (matches.length === 0) return null;

  const best = matches[0];
  const seen = new Set([best.place.nom]);
  const autres: Place[] = [];
  if (best.kind !== "exacte") {
    for (const m of matches.slice(1)) {
      if (autres.length >= 3) break;
      if (!seen.has(m.place.nom)) {
        seen.add(m.place.nom);
        autres.push(m.place);
      }
    }
  }
  if (best.standIn) return { lieu: best.place, correspondance: "approchee", autres: [], tient_lieu: true };
  return { lieu: best.place, correspondance: best.kind, autres, ...(best.rest && { ignores: best.rest }) };
}

/** « La Réunion », « l'île », « 974 » alone: the whole island, no place in it. */
export const wholeIsland = (text: string): boolean => normalize(text) !== "" && tokens(text).length === 0;

/** The nearest place of the gazetteer to a point (a hamlet, a beach, a cape…). */
export function placeAt(lon: number, lat: number): Place {
  let best = PLACES[0];
  let min = Infinity;
  for (const p of PLACES) {
    const d = distanceKm(lon, lat, p.lon, p.lat);
    if (d < min) [best, min] = [p, d];
  }
  return best;
}

/** The commune of a point: that of the nearest place of the gazetteer. */
export const communeAt = (lon: number, lat: number): string => placeAt(lon, lat).commune;

export const GAZETTEER_ATTRIBUTION: string = gazetteer.attribution;
