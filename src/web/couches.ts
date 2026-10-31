/**
 * The layers of /carte: what each one shows, where its data comes from and how it is to be read, and the file the page
 * asks for when its box is ticked (`/carte/couche/<id>.json`, never before).
 *
 * Each layer declares its nature (a measure, a forecast, an estimate, a fixed list, an announcement) and its precision
 * (the point is the place itself, a place near it, or only its commune), and each object of its file carries them
 * again, with the time of its source, so that a file read alone says what it is. One file a source: OpenStreetMap is
 * under ODbL, and a file that mixed it with another source would be a derived database (the places for children are
 * three layers, one for each of their sources).
 *
 * The fixed layers are the lists bundled with the server, as their pages show them: their file is built once per
 * isolate, with no read at all (no subrequest, no KV, no D1).
 */
import * as dae from "../providers/dae.js";
import * as irve from "../providers/irve.js";
import type { SourceInfo } from "../types.js";
import * as enfants from "../vie/enfants.js";

export type Nature = "mesure" | "prevision" | "estimation" | "fixe" | "annonce";
/** `adresse`: the thing itself, to a few metres; `lieu`: a named place, to a few hundred; `commune`: the commune only. */
export type Precision = "adresse" | "lieu" | "commune";
export type Theme = "secours" | "deplacements" | "sortir";
export type Forme = "points" | "traces" | "zones" | "champ";

/** An object of a layer's file. Coordinates in WGS 84, 5 decimals (about a metre). */
export interface Objet {
  nom: string;
  commune: string;
  lon: number;
  lat: number;
  nature: Nature;
  precision: Precision;
  /** The time of its source, ISO: for a fixed list, the day it was read. */
  heure: string;
  /** Its page, on rundata.re or in its source. */
  lien?: string;
  /** What its page says of it besides, by name. */
  infos?: Record<string, string | number | boolean | string[]>;
}

/** A layer's file, as /carte/couche/<id>.json sends it. */
export interface CoucheJson {
  id: string;
  nom: string;
  nature: Nature;
  precision: Precision;
  source: SourceInfo;
  /** The time of its source, ISO. */
  heure: string;
  objets: Objet[];
}

export interface Couche {
  id: string;
  nom: string;
  theme: Theme;
  forme: Forme;
  nature: Nature;
  precision: Precision;
  source: SourceInfo;
  /** The page that shows the same data, linked from the layer's panel. */
  page: string;
  /** How long a browser keeps its file, in seconds. */
  maxAge: number;
  /** Its file. */
  donnees: () => CoucheJson;
}

export const COUCHE_PATH = "/carte/couche/";
export const couchePath = (id: string) => `${COUCHE_PATH}${id}.json`;

/** The most a layer's file weighs, compressed (gzip), in octets: a phone on a slow network gets it in about a second. */
export const MAX_GZIP = 30_000;
/** A fixed list changes only with a release: a browser asks again once an hour. */
const FIXE_MAX_AGE = 3600;

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;

/**
 * The defibrillators of Géo'DAE, as /defibrillateurs lists them. Without their address and where they are in the
 * building, which would take the file past MAX_GZIP (1 260 of them): the page has both.
 */
export function daeCouche(list: dae.Dae[], built: string): CoucheJson {
  const objets = list.map((d): Objet => ({
    nom: d.nom,
    commune: d.commune,
    lon: r5(d.lon),
    lat: r5(d.lat),
    nature: "fixe",
    precision: "adresse",
    heure: built,
    infos: {
      exterieur: d.exterieur,
      acces_libre: d.acces_libre,
      ...(d.etage && { etage: d.etage }),
      ...(d.horaires && { horaires: d.horaires }),
    },
  }));
  return { id: "defibrillateurs", nom: "Défibrillateurs", nature: "fixe", precision: "adresse", source: dae.SOURCE, heure: built, objets };
}

/** The charging stations of the national base, as /bornes lists them, without their live state. */
export function bornesCouche(list: irve.Station[], built: string): CoucheJson {
  const objets = list.map((s): Objet => ({
    nom: s.nom || s.reseau,
    commune: s.commune,
    lon: r5(s.lon),
    lat: r5(s.lat),
    nature: "fixe",
    precision: "adresse",
    heure: built,
    infos: {
      ...(s.adresse && { adresse: s.adresse }),
      reseau: s.reseau,
      points: s.points.length,
      kw_max: Math.max(0, ...s.points.map((p) => p.kw)),
      prises: [...new Set(s.points.flatMap((p) => p.prises))],
      ...(s.horaires && { horaires: s.horaires }),
      ...(s.gratuit && { gratuit: true }),
      ...(s.acces_reserve && { acces_reserve: true }),
    },
  }));
  return { id: "bornes", nom: "Bornes de recharge", nature: "fixe", precision: "adresse", source: irve.SOURCE, heure: built, objets };
}

/** The places for children of one source, as /enfants lists them. */
export function enfantsCouche(id: string, source: enfants.Lieu["source"], list: enfants.Lieu[], built: string): CoucheJson {
  const objets = list.filter((l) => l.source === source).map((l): Objet => ({
    nom: enfants.nameOf(l),
    commune: l.commune,
    lon: r5(l.lon),
    lat: r5(l.lat),
    nature: "fixe",
    precision: "adresse",
    heure: built,
    ...(l.lien && { lien: l.lien }),
    infos: { type: enfants.typeOf(l.type).un, ...(l.adresse && { adresse: l.adresse }) },
  }));
  return { id, nom: NOMS_ENFANTS[source], nature: "fixe", precision: "adresse", source: enfants.SOURCES[source], heure: built, objets };
}

const NOMS_ENFANTS: Record<enfants.Lieu["source"], string> = {
  osm: "Lieux pour les enfants (OpenStreetMap)",
  data_es: "Équipements sportifs pour les enfants (Data ES)",
  basilic: "Bibliothèques (Basilic)",
};

const fixe = (c: Omit<Couche, "nature" | "maxAge" | "forme">): Couche => ({ ...c, nature: "fixe", forme: "points", maxAge: FIXE_MAX_AGE });

/** Every layer, by its id. */
export const COUCHES: Couche[] = [
  fixe({ id: "defibrillateurs", nom: "Défibrillateurs", theme: "secours", precision: "adresse", source: dae.SOURCE, page: "/defibrillateurs", donnees: () => daeCouche(dae.DAES, dae.BUILT) }),
  fixe({ id: "bornes", nom: "Bornes de recharge", theme: "deplacements", precision: "adresse", source: irve.SOURCE, page: "/bornes", donnees: () => bornesCouche(irve.STATIONS, irve.BUILT) }),
  ...(["osm", "data_es", "basilic"] as const).map((s) => {
    const id = `enfants-${s.replace("_", "-")}`;
    return fixe({ id, nom: NOMS_ENFANTS[s], theme: "sortir", precision: "adresse", source: enfants.SOURCES[s], page: "/enfants", donnees: () => enfantsCouche(id, s, enfants.LIEUX, enfants.BUILT) });
  }),
];

const BY_ID = new Map(COUCHES.map((c) => [c.id, c]));
export const coucheOf = (id: string) => BY_ID.get(id);

// A fixed layer's file, built at its first ask by the isolate.
const built = new Map<string, string>();

/** The file of /carte/couche/<id>.json, or null for a path that names no layer. */
export function coucheResponse(path: string): Response | null {
  const m = /^\/carte\/couche\/([a-z0-9-]+)\.json$/.exec(path);
  const c = m && coucheOf(m[1]);
  if (!c) return null;
  let body = built.get(c.id);
  if (body === undefined) built.set(c.id, (body = JSON.stringify(c.donnees())));
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${c.maxAge}`,
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
