/**
 * The layers of /carte: what each one shows, where its data comes from and how it is to be read, and the file the page
 * asks for when its box is ticked (`/carte/couche/<id>.json`, never before; the radar's rain, /meteo's own file).
 *
 * Each layer declares its nature (a measure, a forecast, an estimate, a fixed list, an announcement) and its precision
 * (the point is the place itself, a place near it, or only its commune), and each object of its file carries them
 * again, with the time of its source, so that a file read alone says what it is. One file a source: OpenStreetMap is
 * under ODbL, and a file that mixed it with another source would be a derived database (the places for children are
 * three layers, one for each of their sources). Lists under the same Licence Ouverte may share one, each object naming its
 * own (the bike lanes and racks: the Région's, the Ville de Saint-Denis's and the CIVIS's).
 *
 * The fixed layers are the lists bundled with the server, as their pages show them: their file is built once per
 * isolate, with no read at all (no subrequest, no KV, no D1). The live layers read the last copy of their page, or of
 * the source's list that the scheduled event shares (cache.peek: never a build, never a read of the source), however
 * old: without one, their file says so (`copie: "absente"`), and with an old one, its time (`copie: "ancienne"`), so that
 * an empty layer never reads as « nothing there » (no earthquake, no flood).
 */
import type { Cache } from "../cache.js";
import { communeAt } from "../places/resolve.js";
import * as dae from "../providers/dae.js";
import * as irve from "../providers/irve.js";
import * as mfStations from "../providers/meteofrance-stations.js";
import * as radar from "../providers/radar.js";
import * as seismes from "../providers/seismes.js";
import * as onf from "../providers/sentiers.js";
import * as traces from "../providers/traces.js";
import * as vigicrues from "../providers/vigicrues.js";
import type { SourceInfo } from "../types.js";
import * as enfants from "../vie/enfants.js";
import * as canyons from "../vie/canyons.js";
import * as marmailles from "../vie/marmailles.js";
import * as monuments from "../vie/monuments.js";
import * as velo from "../vie/velo.js";
import * as vitesses from "../vie/vitesses.js";
import type { BornesAnswer, CruesAnswer, HomeData } from "./data.js";
import { slugify } from "./places.js";
import { PATH as PLUIE_RADAR } from "./pluie-radar.js";
import { STATION_PATH } from "./station.js";

export type Nature = "mesure" | "prevision" | "estimation" | "fixe" | "annonce";
/** `adresse`: the thing itself, to a few metres; `lieu`: a named place, to a few hundred; `commune`: the commune only. */
export type Precision = "adresse" | "lieu" | "commune";
export type Theme = "meteo" | "nature" | "secours" | "deplacements" | "sortir";
export type Forme = "points" | "traces" | "zones" | "champ";

/** An object of a layer's file. Coordinates in WGS 84, 5 decimals (about a metre). */
export interface Objet {
  nom: string;
  /** Its commune, when its list names it (not a station's, nor an earthquake's). */
  commune?: string;
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
  /** A line (a closed trail), longitude and latitude, 4 decimals (about 10 m); `lon` and `lat` are then its middle. */
  trace?: [number, number][];
}

/** A layer's file, as /carte/couche/<id>.json sends it. */
export interface CoucheJson {
  id: string;
  nom: string;
  nature: Nature;
  precision: Precision;
  source: SourceInfo;
  /** The time of its source, ISO; for a live layer, when its copy was made. */
  heure: string;
  /**
   * A live layer's copy: « absente », none in this data center (an isolate just started, a copy expired), its objects
   * then none and `heure` the time of the answer; « ancienne », older than the layer's `vieille`, `heure` saying when.
   */
  copie?: "absente" | "ancienne";
  objets: Objet[];
}

export interface Couche {
  id: string;
  /** Its name in the page's list and legend. */
  nom: string;
  /** Its file's name, read alone: what it shows and its source. */
  long: string;
  theme: Theme;
  forme: Forme;
  nature: Nature;
  precision: Precision;
  source: SourceInfo;
  /** The page that shows the same data, linked from the layer's panel. */
  page: string;
  /** How long a browser keeps its file, in seconds. */
  maxAge: number;
  /** Its file, for a fixed layer: built once. */
  donnees?: () => CoucheJson;
  /** Its file, for a live layer: from the last copy, read each time. */
  lire?: (cache: Cache, now: Date) => Promise<CoucheJson>;
  /** A live layer's copy older than this, in minutes, is said old with its time. */
  vieille?: number;
  /** Its address, when not COUCHE_PATH's: the radar's rain is /meteo's file. */
  fichier?: string;
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
  return { id: "defibrillateurs", nom: "Défibrillateurs (Géo'DAE)", nature: "fixe", precision: "adresse", source: dae.SOURCE, heure: built, objets };
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
  return { id: "bornes", nom: "Bornes de recharge (base nationale des IRVE)", nature: "fixe", precision: "adresse", source: irve.SOURCE, heure: built, objets };
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

/**
 * The historic monuments of the base Mérimée that have a point (all but two), each leading to the monuments of its
 * commune on its day's page; one on two communes, to the first one's. A place near them, not the building: for 10
 * monuments drawn at random, the base's points stood 40 to 400 m from their geocoded address (8 found).
 */
export function monumentsCouche(list: monuments.Monument[], du: string): CoucheJson {
  const objets = list.filter((m) => m.lon != null && m.lat != null).map((m): Objet => {
    const noms = monuments.communes(m);
    return {
      nom: m.nom,
      commune: noms.join(", "),
      lon: r5(m.lon!),
      lat: r5(m.lat!),
      nature: "fixe",
      precision: "lieu",
      heure: du,
      lien: `/aujourdhui/${slugify(noms[0])}#h-patrimoine`,
      infos: { type: monuments.protege(m), ...(m.adresse && { adresse: m.adresse }), notice: monuments.notice(m) },
    };
  });
  return { id: "monuments", nom: "Monuments historiques (base Mérimée)", nature: "fixe", precision: "lieu", source: monuments.SOURCE, heure: du, objets };
}

// The names of the files, read alone: what they show and their source (marketing).
const NOMS_ENFANTS: Record<enfants.Lieu["source"], string> = {
  osm: "Aires de jeux, parcs, musées et médiathèques (OpenStreetMap)",
  data_es: "Piscines, skateparks, city-stades et escalade (Data ES)",
  basilic: "Médiathèques et bibliothèques (Basilic)",
};
// Their names in the page's list and legend (marketing).
const COURTS_ENFANTS: Record<enfants.Lieu["source"], string> = { osm: "Jeux, parcs et musées", data_es: "Piscines et sport en accès libre", basilic: "Médiathèques" };

const fixe = (c: Omit<Couche, "nature" | "maxAge" | "forme">): Couche => ({ ...c, nature: "fixe", forme: "points", maxAge: FIXE_MAX_AGE });

/** How old a copy in the isolate's memory may be before the slower stores are asked for a newer one. */
const COPIE_FRAICHE_MS = 5 * 60_000;

/** A live layer's file is kept 2 minutes by a browser: its copy changes every 5 to 15. */
const DIRECT_MAX_AGE = 120;

/** A live layer's file from its copy (`key`), however old; `objets` makes its objects, `heure` its time if not the copy's. */
async function deCopie<T>(
  cache: Cache, now: Date, key: string, c: { id: string; nom: string; nature: Nature; precision: Precision; source: SourceInfo; vieille: number },
  objets: (value: T, heure: string) => Objet[], heure?: (value: T) => string | undefined,
): Promise<CoucheJson> {
  const base = { id: c.id, nom: c.nom, nature: c.nature, precision: c.precision, source: c.source };
  // One in the isolate's memory from the last 5 minutes will do: the slower stores (the data center's cache, then KV)
  // are asked only otherwise, one read each.
  const copy = await cache.peek<T>(key, now.getTime() - COPIE_FRAICHE_MS);
  if (!copy) return { ...base, heure: now.toISOString(), copie: "absente", objets: [] };
  const at = heure?.(copy.value) ?? copy.fetchedAt.toISOString();
  const old = now.getTime() - copy.fetchedAt.getTime() > c.vieille * 60_000;
  return { ...base, heure: at, ...(old && { copie: "ancienne" as const }), objets: objets(copy.value, at) };
}

/** The stations of Météo-France that measured, from /meteo's copy: their latest measure, each at its time. */
export function stationsObjets(d: HomeData): Objet[] {
  return (d.toutes ?? d.stations).filter((s) => s.source === mfStations.SOURCE.id).map((s): Objet => ({
    nom: s.nom,
    lon: r5(s.lon),
    lat: r5(s.lat),
    nature: "mesure",
    precision: "adresse",
    heure: s.time,
    ...(s.id && { lien: `${STATION_PATH}/${s.id}` }),
    infos: {
      altitude_m: s.altitude_m,
      ...(s.temperature != null && { temperature: s.temperature }),
      ...(s.vent != null && { vent: s.vent }),
      ...(s.rafales != null && { rafales: s.rafales }),
      ...(s.pluie_1h != null && { pluie_1h: s.pluie_1h }),
      ...(s.stale && { ancienne: true }),
    },
  }));
}

/** The earthquakes located in the last 7 days, newest first, each at its time. */
export const SEISMES_JOURS = 7;
export function seismesObjets(list: seismes.Seisme[], now: Date): Objet[] {
  const since = now.getTime() - SEISMES_JOURS * 86_400_000;
  return list.filter((q) => Date.parse(q.time) >= since).map((q): Objet => ({
    nom: seismes.where(q.lon, q.lat),
    lon: r5(q.lon),
    lat: r5(q.lat),
    nature: "mesure",
    precision: "lieu",
    heure: q.time,
    lien: "/volcan#seismes",
    infos: { magnitude: q.magnitude, profondeur_km: q.profondeur_km },
  }));
}

/** The river gauges of /crues's copy, where Vigicrues places them; the time of their copy, their measure's besides. */
export function cruesObjets(d: CruesAnswer, heure: string): Objet[] {
  return d.stations.flatMap((s) => {
    const g = vigicrues.STATIONS.find((x) => x.nom === s.station);
    if (!g) return [];
    return [{
      nom: s.station,
      commune: s.commune,
      lon: r5(g.lon),
      lat: r5(g.lat),
      nature: "mesure",
      precision: "adresse",
      heure,
      lien: "/crues",
      infos: {
        riviere: s.riviere,
        ...(s.hauteur_m != null && { hauteur_m: s.hauteur_m }),
        ...(s.tendance_30_min && { tendance: s.tendance_30_min }),
        ...(s.heure_mesure && { heure_mesure: s.heure_mesure }),
        ...(s.avertissement && { ancienne: true }),
      },
    } satisfies Objet];
  });
}

/** A line kept to points about 50 m apart at least, 4 decimals: what the island's map can show of a trail. */
function tracer(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lon, lat] of points) {
    const p: [number, number] = [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.0005) out.push(p);
  }
  const last = points[points.length - 1];
  if (last && out.length > 1) out[out.length - 1] = [Math.round(last[0] * 1e4) / 1e4, Math.round(last[1] * 1e4) / 1e4];
  return out;
}

/**
 * The « sentiers marmailles », each drawn as its longest piece (the others, a few points, are spurs), its dot in its
 * middle, leading to its commune's walks on /enfants. Their state is not in the file: the source has none, and the
 * ONF's closed trails are their own layer.
 */
export function marmaillesCouche(list: marmailles.Marmaille[], lu: string): CoucheJson {
  const objets = list.map((m): Objet => {
    const [lon, lat] = marmailles.milieu(m);
    const commune = marmailles.communeOf(m);
    return {
      nom: m.nom,
      commune,
      lon: r5(lon),
      lat: r5(lat),
      nature: "fixe",
      precision: "adresse",
      heure: lu,
      lien: `/enfants#m-${slugify(commune)}`,
      trace: tracer(marmailles.points(m)),
      infos: { type: marmailles.figures(m), ...(m.sentiers_onf.length && { sentiers_onf: m.sentiers_onf }) },
    };
  });
  return { id: "marmailles", nom: "Sentiers marmailles (Conseil Général de La Réunion / AGORAH)", nature: "fixe", precision: "adresse", source: marmailles.SOURCE, heure: lu, objets };
}

/**
 * The canyons of the Parc national's inventory, each drawn as its longest piece, its dot in its middle. Those it marks
 * forbidden carry `alerte`, drawn in red, with what it says of them as said; the others are never said allowed. Each
 * leads to the page of the first ONF trail it runs along, else to the layer's page: the ONF's state is not in the file.
 */
export function canyonsCouche(list: canyons.Canyon[], lu: string): CoucheJson {
  const objets = list.map((c): Objet => {
    const [lon, lat] = canyons.milieu(c);
    const along = c.sentiers_onf.find((nom) => traces.SENTIERS[nom]);
    const said = canyons.signalement(c);
    return {
      nom: c.nom,
      commune: canyons.communeOf(c),
      lon: r5(lon),
      lat: r5(lat),
      nature: "fixe",
      precision: "adresse",
      heure: lu,
      ...(along && { lien: `/sentiers/${traces.SENTIERS[along].slug}` }),
      trace: tracer(canyons.points(c)),
      infos: { type: canyons.longueur(c), ...(said && { signalement: said }), ...(c.interdit && { alerte: true }), ...(c.sentiers_onf.length && { sentiers_onf: c.sentiers_onf }) },
    };
  });
  return { id: "canyons", nom: "Canyons (Parc national de La Réunion)", nature: "fixe", precision: "adresse", source: canyons.SOURCE, heure: lu, objets };
}

/** « 31/12/2025 ». */
const jma = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The bike lanes of the Région and of the Ville de Saint-Denis, drawn, and the bike racks of the CIVIS, each with its
 * source and the date of its list (none for the CIVIS's). What a list gives is said as given, never a lane said usable:
 * the Région's « Requalification » does not say if it is done (data-run, 03/11).
 */
export function veloCouche(voies: velo.Voie[], accroches: velo.Accroche[], lu: string): CoucheJson {
  const listes: Record<velo.Liste, string> = { region: `liste du ${jma(velo.REGION_DU)}`, "saint-denis": "février 2023", civis: "sans date" };
  const deVoies = voies.map((v): Objet => {
    const [lon, lat] = velo.milieu(v);
    return {
      nom: v.nom ?? v.type,
      commune: velo.communeOf(v),
      lon: r5(lon),
      lat: r5(lat),
      nature: "fixe",
      precision: "adresse",
      heure: lu,
      trace: tracer(velo.points(v)),
      infos: {
        source: velo.SOURCES[v.s].attribution,
        liste: listes[v.s],
        ...(v.nom && { type: v.type }),
        ...(v.sens && { sens: v.sens }),
        ...(v.annee && { annee: v.annee }),
        ...(v.requalification && { etat: "Requalification (d'après la Région)" }),
        ...(v.provisoire && { etat: "provisoire d'après la Ville" }),
      },
    };
  });
  const deAccroches = accroches.map((a): Objet => ({
    nom: a.nom ?? "Accroches vélo",
    commune: communeAt(a.lon, a.lat),
    lon: r5(a.lon),
    lat: r5(a.lat),
    nature: "fixe",
    precision: "adresse",
    heure: lu,
    infos: { source: velo.SOURCES.civis.attribution, liste: listes.civis, accroches: a.n },
  }));
  return { id: "velo", nom: "Aménagements cyclables (Région Réunion, Ville de Saint-Denis) et accroches vélo (CIVIS)", nature: "fixe", precision: "adresse", source: velo.SOURCE, heure: lu, objets: [...deVoies, ...deAccroches] };
}

/** The speed limits on the routes nationales, each piece drawn with its speed, its route and its year. */
export function vitessesCouche(list: vitesses.Troncon[], lu: string): CoucheJson {
  const objets = list.map((t): Objet => {
    const p = vitesses.points(t);
    const [lon, lat] = p[Math.floor(p.length / 2)];
    return {
      nom: `${t.v}\u00a0km/h · ${t.route}`,
      lon: r5(lon),
      lat: r5(lat),
      nature: "fixe",
      precision: "adresse",
      heure: lu,
      trace: tracer(p),
      infos: { vitesse_kmh: t.v, ...(t.annee && { annee: t.annee }) },
    };
  });
  return { id: "vitesses", nom: "Limitations de vitesse sur les routes nationales (Région Réunion)", nature: "fixe", precision: "adresse", source: vitesses.SOURCE, heure: lu, objets };
}

/** The trails the ONF closes, as its map draws them, with why and until when. */
export function sentiersObjets(c: onf.Carte, heure: string): Objet[] {
  return c.sentiers.filter((t) => t.statut === "fermé" && t.points.length).map((t): Objet => {
    const [lon, lat] = t.points[Math.floor(t.points.length / 2)];
    const slug = traces.SENTIERS[t.nom]?.slug;
    return {
      nom: t.nom,
      lon: r5(lon),
      lat: r5(lat),
      nature: "annonce",
      precision: "adresse",
      heure,
      lien: slug ? `/sentiers/${slug}` : "/sentiers",
      trace: tracer(t.points as [number, number][]),
      infos: { ...(t.cause && { cause: t.cause }), ...(t.info && { precision: t.info }), longueur_km: t.longueur_km },
    };
  });
}

/**
 * The charging stations with their state, from /bornes's copy: how many of their points are free, at the copy's time.
 * Each leads to its row of /bornes. Without a copy, the bundled list, its state said missing.
 */
export function bornesObjets(d: BornesAnswer, heure: string): Objet[] {
  const fixe = bornesCouche(irve.STATIONS, irve.BUILT).objets;
  return d.stations.flatMap((s, i) => {
    const st = s.id ? irve.STATIONS.find((x) => x.id === s.id) : irve.STATIONS.find((x) => x.lon === s.lon && x.lat === s.lat);
    if (!st) return [];
    const o = fixe[irve.STATIONS.indexOf(st)] ?? fixe[i];
    return [{ ...o, nature: "mesure", heure, lien: `/bornes#s-${st.id}`, infos: { ...o.infos, libres: s.libres, total: s.total } } satisfies Objet];
  });
}

/** Every layer, by its id, in the order of the page's list: the themes as there, the weather first. */
export const COUCHES: Couche[] = [
  {
    id: "stations", nom: "Stations météo", long: "Stations météo (Météo-France)", theme: "meteo", forme: "points", nature: "mesure", precision: "adresse", source: mfStations.SOURCE, page: "/meteo",
    maxAge: DIRECT_MAX_AGE, vieille: 30,
    lire: (cache, now) => deCopie<HomeData>(cache, now, "web:meteo", { id: "stations", nom: "Stations météo (Météo-France)", nature: "mesure", precision: "adresse", source: mfStations.SOURCE, vieille: 30 }, stationsObjets),
  },
  // The radar's grid, a kilometre a cell: /meteo's file, kept 5 minutes.
  { id: "pluie", nom: "Pluie au radar", long: "Pluie au radar (Météo-France)", theme: "meteo", forme: "champ", nature: "mesure", precision: "lieu", source: radar.SOURCE, page: "/meteo", maxAge: 300, fichier: PLUIE_RADAR },
  {
    id: "rivieres", nom: "Rivières", long: "Hauteur des rivières (DEAL Réunion, © VIGICRUES)", theme: "nature", forme: "points", nature: "mesure", precision: "adresse", source: vigicrues.SOURCE, page: "/crues",
    maxAge: DIRECT_MAX_AGE, vieille: 60,
    lire: (cache, now) => deCopie<CruesAnswer>(cache, now, "web:crues", { id: "rivieres", nom: "Hauteur des rivières (DEAL Réunion, © VIGICRUES)", nature: "mesure", precision: "adresse", source: vigicrues.SOURCE, vieille: 60 }, cruesObjets),
  },
  {
    id: "seismes", nom: "Séismes", long: "Séismes des 7 derniers jours (OVPF-IPGP)", theme: "nature", forme: "points", nature: "mesure", precision: "lieu", source: seismes.SOURCE, page: "/volcan",
    maxAge: DIRECT_MAX_AGE, vieille: 60,
    lire: (cache, now) => deCopie<seismes.Seisme[]>(cache, now, seismes.KEY, { id: "seismes", nom: "Séismes des 7 derniers jours (OVPF-IPGP)", nature: "mesure", precision: "lieu", source: seismes.SOURCE, vieille: 60 }, (list) => seismesObjets(list, now)),
  },
  {
    id: "sentiers", nom: "Sentiers fermés", long: "Sentiers fermés (ONF)", theme: "nature", forme: "traces", nature: "annonce", precision: "adresse", source: onf.SOURCE, page: "/sentiers",
    maxAge: DIRECT_MAX_AGE, vieille: 6 * 60,
    lire: (cache, now) => deCopie<onf.Carte>(cache, now, onf.KEY, { id: "sentiers", nom: "Sentiers fermés (ONF)", nature: "annonce", precision: "adresse", source: onf.SOURCE, vieille: 6 * 60 }, sentiersObjets),
  },
  fixe({ id: "defibrillateurs", nom: "Défibrillateurs", long: "Défibrillateurs (Géo'DAE)", theme: "secours", precision: "adresse", source: dae.SOURCE, page: "/defibrillateurs", donnees: () => daeCouche(dae.DAES, dae.BUILT) }),
  {
    id: "bornes", nom: "Bornes de recharge", long: "Bornes de recharge (base nationale des IRVE)", theme: "deplacements", forme: "points", nature: "mesure", precision: "adresse", source: irve.SOURCE, page: "/bornes",
    maxAge: DIRECT_MAX_AGE, vieille: 60,
    // Without /bornes's copy, the bundled list, its state not read (`copie: "absente"`).
    lire: async (cache, now) => {
      const j = await deCopie<BornesAnswer>(cache, now, "web:bornes", { id: "bornes", nom: "Bornes de recharge (base nationale des IRVE)", nature: "mesure", precision: "adresse", source: irve.SOURCE, vieille: 60 }, bornesObjets);
      return j.copie === "absente" ? { ...j, objets: bornesCouche(irve.STATIONS, irve.BUILT).objets.map((o, i) => ({ ...o, lien: `/bornes#s-${irve.STATIONS[i].id}` })) } : j;
    },
  },
  // Drawn as lines but the racks, both leading to /velos and /trafic: no page of their own.
  { ...fixe({ id: "velo", nom: "Vélo", long: "Aménagements cyclables (Région Réunion, Ville de Saint-Denis) et accroches vélo (CIVIS)", theme: "deplacements", precision: "adresse", source: velo.SOURCE, page: "/velos", donnees: () => veloCouche(velo.VOIES, velo.ACCROCHES, velo.LU_LE) }), forme: "traces" },
  { ...fixe({ id: "vitesses", nom: "Vitesses sur les routes nationales", long: "Limitations de vitesse sur les routes nationales (Région Réunion)", theme: "deplacements", precision: "adresse", source: vitesses.SOURCE, page: "/trafic", donnees: () => vitessesCouche(vitesses.TRONCONS, vitesses.LU_LE) }), forme: "traces" },
  ...(["osm", "data_es", "basilic"] as const).map((s) => {
    const id = `enfants-${s.replace("_", "-")}`;
    return fixe({ id, nom: COURTS_ENFANTS[s], long: NOMS_ENFANTS[s], theme: "sortir", precision: "adresse", source: enfants.SOURCES[s], page: "/enfants", donnees: () => enfantsCouche(id, s, enfants.LIEUX, enfants.BUILT) });
  }),
  // No page of their own: each leads to its commune's monuments on /aujourdhui, the layer's panel to the communes.
  // Drawn as lines: each leads to its commune's walks on /enfants.
  { ...fixe({ id: "marmailles", nom: "Sentiers marmailles", long: "Sentiers marmailles (Conseil Général de La Réunion / AGORAH)", theme: "sortir", precision: "adresse", source: marmailles.SOURCE, page: "/enfants", donnees: () => marmaillesCouche(marmailles.SENTIERS, marmailles.LU_LE) }), forme: "traces" },
  // Drawn as lines, those the inventory marks forbidden in red: no page of their own, the layer's is the hikes'.
  { ...fixe({ id: "canyons", nom: "Canyons", long: "Canyons (Parc national de La Réunion)", theme: "sortir", precision: "adresse", source: canyons.SOURCE, page: "/sentiers", donnees: () => canyonsCouche(canyons.CANYONS, canyons.LU_LE) }), forme: "traces" },
  fixe({ id: "monuments", nom: "Monuments historiques", long: "Monuments historiques (base Mérimée)", theme: "sortir", precision: "lieu", source: monuments.SOURCE, page: "/communes", donnees: () => monumentsCouche(monuments.MONUMENTS, monuments.FICHIER_DU) }),
];

const BY_ID = new Map(COUCHES.map((c) => [c.id, c]));
export const coucheOf = (id: string) => BY_ID.get(id);

// A fixed layer's file, built at its first ask by the isolate.
const built = new Map<string, string>();

/** The file of /carte/couche/<id>.json, or null for a path that names no layer of its own. */
export async function coucheResponse(path: string, cache: Cache, now = new Date()): Promise<Response | null> {
  const m = /^\/carte\/couche\/([a-z0-9-]+)\.json$/.exec(path);
  const c = m && coucheOf(m[1]);
  if (!c || c.fichier) return null;
  let body = built.get(c.id);
  if (c.lire) body = JSON.stringify(await c.lire(cache, now));
  else if (body === undefined) built.set(c.id, (body = JSON.stringify(c.donnees!())));
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${c.maxAge}`,
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

/** The figures of /carte's « En direct » band, one small file: asked by every visit, instead of four layers' files. */
export const RESUME_PATH = "/carte/resume.json";

/**
 * Each figure from its layer's copy, as its file would give it (never a read of a source). A layer whose copy is
 * missing or old has no figure: the band then says nothing of it, rather than a count that is not of now.
 */
export interface Resume {
  heure: string;
  /** The stations that measured rain in their last hour, out of all; the time of the newest measure. */
  stations?: { pluie: number; total: number; heure: string };
  /** The river gauges whose height rises. */
  rivieres?: { hausse: number; total: number; heure: string };
  sentiers?: { fermes: number; heure: string };
  /** The earthquakes located in the last 7 days. */
  seismes?: { n: number; heure: string };
}

export async function resume(cache: Cache, now = new Date()): Promise<Resume> {
  const [st, ri, se, sq] = await Promise.all(["stations", "rivieres", "sentiers", "seismes"].map((id) => coucheOf(id)!.lire!(cache, now)));
  const frais = (j: CoucheJson) => !j.copie;
  const r: Resume = { heure: now.toISOString() };
  if (frais(st) && st.objets.length) {
    const vues = st.objets.filter((o) => !o.infos?.ancienne);
    // A station whose time is empty or unreadable gives no time; with none readable, the copy's time.
    const lues = st.objets.map((o) => Date.parse(o.heure)).filter(Number.isFinite);
    r.stations = { pluie: vues.filter((o) => Number(o.infos?.pluie_1h) > 0).length, total: vues.length, heure: lues.length ? new Date(Math.max(...lues)).toISOString() : st.heure };
  }
  if (frais(ri) && ri.objets.length) r.rivieres = { hausse: ri.objets.filter((o) => o.infos?.tendance === "en hausse" && !o.infos?.ancienne).length, total: ri.objets.length, heure: ri.heure };
  if (frais(se)) r.sentiers = { fermes: se.objets.length, heure: se.heure };
  if (frais(sq)) r.seismes = { n: sq.objets.length, heure: sq.heure };
  return r;
}

export async function resumeResponse(cache: Cache, now = new Date()): Promise<Response> {
  return new Response(JSON.stringify(await resume(cache, now)), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${DIRECT_MAX_AGE}`, "x-content-type-options": "nosniff" },
  });
}
