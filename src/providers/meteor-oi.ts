/**
 * The stations of MétéoR Océan Indien, an association of La Réunion whose network fills where Météo-France has none: in
 * Mafate, the Hauts of the South, the coast of Saint-Joseph and the East. Its measures are under CC BY-NC 4.0; the
 * association agreed in writing on 09/11/2026 that rundata.re, which is non-commercial, takes their wind, temperature
 * and rain (providers/autorisations.ts, `meteo:meteor_oi`), on its conditions: its credit with a link to its site
 * wherever a measure is said, each page read at most once in 5 minutes with a User-Agent that names rundata.re and its
 * address, each measure with its station and its time, no station placed more precisely than on its map, and taken
 * down on a simple request.
 *
 * It has no API yet: each station has its page on https://obs.meteor-oi.re/<CODE>/, and beside it the file that page and
 * the association's own table read (`json/daily.json`, about 8 Ko), written again every 5 minutes. A scheduled event of
 * its own cron (wrangler.jsonc, CRON) reads every station's file every REFRESH_EVERY minutes and keeps their last
 * measures in KV, which the questions and the pages read: never the network, from a visit.
 */
import type { Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import type { Observation, SourceInfo, Station } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "meteor_oi",
  nom: "Stations de l'association MétéoR Océan Indien",
  organisme: "MétéoR Océan Indien (association)",
  licence: "CC BY-NC 4.0",
  attribution: "Données : MétéoR-OI, licence CC BY-NC 4.0",
  url: "https://www.meteor-oi.re",
  amateur: true,
  court: "MétéoR-OI",
};

/** The credit the association asked for, word for word, wherever one of its measures is said. */
export const CREDIT = SOURCE.attribution;
/** Its site, linked from the credit. */
export const SITE = SOURCE.url;
export const CC_BY_NC = "https://creativecommons.org/licenses/by-nc/4.0/deed.fr";
/** Its agreement (providers/autorisations.ts): nothing is read without it. */
export const AUTORISATION = "meteo:meteor_oi";

/** As the association asked: a User-Agent naming rundata.re and its address (ASCII only, as every header). */
export const UA = "rundata.re (https://rundata.re; contact@rundata.re)";

/**
 * Its own cron (wrangler.jsonc), at 3 past the hour and every 10 minutes after: never at the minute of the event of every
 * 5 minutes, whose budget it never shares.
 */
export const CRON = "3,13,23,33,43,53 * * * *";
export const REFRESH_EVERY = 10;
export const REFRESH_OFFSET = 3;

export const KV_KEY = "meteor:stations";
export const KV_TTL_SECONDS = 86_400;

/** A station whose last measure is older than this is left out: it sends every 5 minutes. */
export const MAX_AGE_MS = 60 * 60_000;

/**
 * The stations of La Réunion on the association's portal (https://obs.meteor-oi.re/resources/js/stations.js and
 * stations_provisioned.js, read on 09/11/2026 at 18:39) that had sent in the 7 days before, its 3 partners' stations
 * there included (« © MétéoR-OI » on their pages). Not those of other sites the portal shows (their own terms), nor
 * those silent for longer (back here when they send again). `ancien`: an older server, under /stations-proxy/.
 *
 * Placed to the hundredth of a degree (about a kilometre), never more precisely than on the association's map: many
 * are at a member's home. Named after their place, as on the association's pages, without the name of a person;
 * with their altitude where another station has the name (Météo-France's Piton Saint-Leu is at 530 m).
 */
export const STATIONS: readonly { code: string; nom: string; lat: number; lon: number; altitude_m: number; ancien?: true }[] = [
  { code: "ALF1370", nom: "Carreau Alfred", lat: -21.14, lon: 55.34, altitude_m: 1370 },
  { code: "BDN350", nom: "Bois-de-Nèfles (350 m)", lat: -21, lon: 55.32, altitude_m: 351 },
  { code: "BDN380", nom: "Bois-de-Nèfles (380 m)", lat: -20.99, lon: 55.33, altitude_m: 380 },
  { code: "BOCO1370", nom: "Bois-Court", lat: -21.2, lon: 55.54, altitude_m: 1380 },
  { code: "BOMU1610", nom: "Bourg-Murat", lat: -21.19, lon: 55.58, altitude_m: 1600 },
  { code: "BP130", nom: "Bassin Plat", lat: -21.33, lon: 55.49, altitude_m: 135 },
  { code: "BRT155", nom: "La Bretagne", lat: -20.91, lon: 55.49, altitude_m: 155 },
  { code: "CAM015", nom: "Cambaie", lat: -20.96, lon: 55.28, altitude_m: 20 },
  { code: "CBG270", nom: "Cambourg", lat: -21.11, lon: 55.73, altitude_m: 258 },
  { code: "CHAR645", nom: "Charrié", lat: -21.33, lon: 55.57, altitude_m: 644 },
  { code: "CHP690", nom: "La Chapelle", lat: -21.22, lon: 55.34, altitude_m: 690 },
  { code: "CJS400", nom: "Collège Joseph-Suacot", lat: -21.35, lon: 55.56, altitude_m: 400 },
  { code: "ESB005", nom: "L'Étang-Salé-les-Bains", lat: -21.27, lon: 55.34, altitude_m: 10 },
  { code: "ESH555", nom: "L'Étang-Salé-les-Hauts", lat: -21.24, lon: 55.38, altitude_m: 550 },
  { code: "GDC030", nom: "Grand Canal", lat: -20.96, lon: 55.69, altitude_m: 27 },
  { code: "LAN030", nom: "École de Langevin", lat: -21.38, lon: 55.65, altitude_m: 40 },
  { code: "LIA570", nom: "Les Lianes", lat: -21.34, lon: 55.6, altitude_m: 570 },
  { code: "MDM1570", nom: "Marla", lat: -21.1, lon: 55.43, altitude_m: 1570 },
  { code: "MTG280", nom: "La Montagne (280 m)", lat: -20.88, lon: 55.43, altitude_m: 280 },
  { code: "MTG320", nom: "La Montagne (Brises)", lat: -20.88, lon: 55.43, altitude_m: 317 },
  { code: "PAH575", nom: "Piton Armand", lat: -21.12, lon: 55.7, altitude_m: 575 },
  { code: "PDO1600", nom: "Piton Doret", lat: -21.18, lon: 55.56, altitude_m: 1610 },
  { code: "PFD040", nom: "Pierrefonds", lat: -21.3, lon: 55.42, altitude_m: 50 },
  { code: "PHE890", nom: "Pandanaie des Hauts de l'Est", lat: -21.12, lon: 55.65, altitude_m: 890 },
  { code: "PSL310", nom: "Piton Saint-Leu (310 m)", lat: -21.22, lon: 55.31, altitude_m: 310 },
  { code: "RDP540", nom: "Ravine du Pont", lat: -21.34, lon: 55.56, altitude_m: 540 },
  { code: "RIO045", nom: "Rio", lat: -20.95, lon: 55.67, altitude_m: 45 },
  { code: "RMZ310", nom: "Ravine Sèche", lat: -21.24, lon: 55.35, altitude_m: 310 },
  { code: "ROQ070", nom: "Mont Roquefeuil", lat: -21.06, lon: 55.23, altitude_m: 70 },
  { code: "SBBM100", nom: "Bras-Madeleine", lat: -21.05, lon: 55.7, altitude_m: 100 },
  { code: "SJB030", nom: "Butor", lat: -21.38, lon: 55.62, altitude_m: 30 },
  { code: "SLB090", nom: "La Saline-les-Bains", lat: -21.1, lon: 55.25, altitude_m: 90 },
  { code: "SRC1430", nom: "Chemin de la Source", lat: -21.17, lon: 55.35, altitude_m: 1430 },
  { code: "STC940", nom: "Saint-Christophe", lat: -21.15, lon: 55.33, altitude_m: 940 },
  { code: "TBL105", nom: "École du Tremblet", lat: -21.32, lon: 55.8, altitude_m: 105 },
  { code: "TRG170", nom: "Terre Rouge", lat: -21.34, lon: 55.51, altitude_m: 170 },
  { code: "PAM290", nom: "Parc à Moutons", lat: -21.36, lon: 55.66, altitude_m: 290, ancien: true },
  { code: "GPN1413", nom: "Grandes Pentes", lat: -21.24, lon: 55.75, altitude_m: 1413 },
];

export type StationMor = (typeof STATIONS)[number];

/** The file of a station: its page and `json/daily.json`. */
export const page = (s: StationMor) => `https://obs.meteor-oi.re/${s.ancien ? "stations-proxy/" : ""}${s.code}/`;
export const fichier = (s: StationMor) => `${page(s)}json/daily.json`;

/** What is kept of a station's file: what it measured, and when. */
export interface Mesure {
  code: string;
  /** ISO time of the measure. */
  mesure_a: string;
  temperature?: number;
  humidite?: number;
  vent?: number;
  /** Where the wind comes from, in degrees: only with a wind. */
  direction?: number;
  rafales?: number;
  pluie_1h?: number;
}

/** The copy in KV: the stations' last measures and when they were read; the stations not read at the last pass. */
export interface Copie {
  lu: string;
  mesures: Mesure[];
  /** The stations whose file could not be read at the last pass: their measure is the one before. */
  sans_reponse?: string[];
}

/** The parts of `daily.json` read here. */
export interface Daily {
  time?: string;
  tempsunix?: string;
  stats?: { current?: Record<string, string | undefined> };
}

/** « 14,2 », « 0.0 mm », « 1016,7 » as numbers; « N/A », empty or anything else as nothing. */
export function nombre(raw: string | undefined): number | undefined {
  const m = raw?.trim().match(/^-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  const v = Number(m[0].replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
}

/**
 * The time of the measure: `tempsunix` (seconds) where the station's software writes it, else « 09/11/2026 à 18h40 » or
 * « … à 18:40 », in La Réunion's time (UTC+4, no summer time).
 */
export function heure(d: Daily): Date | undefined {
  const unix = Number(d.tempsunix);
  if (d.tempsunix && Number.isFinite(unix) && unix > 0) return new Date(unix * 1000);
  const m = d.time?.match(/^(\d{2})\/(\d{2})\/(\d{4}) à (\d{2})[h:](\d{2})/);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 4, +m[5]));
}

/** A station's measure from its file; nothing when it has no time or measured nothing of what is kept. */
export function parse(s: StationMor, d: Daily): Mesure | undefined {
  const t = heure(d);
  const c = d.stats?.current ?? {};
  if (!t) return undefined;
  const m: Mesure = { code: s.code, mesure_a: t.toISOString() };
  const temperature = nombre(c.outTemp);
  const humidite = nombre(c.humidity);
  const vent = nombre(c.windSpeed);
  const direction = nombre(c.windDir);
  const rafales = nombre(c.windGust);
  const pluie = nombre(c.rainSum1h);
  // An absurd value is a sensor's fault, not a measure: left out.
  if (temperature != null && temperature > -10 && temperature < 45) m.temperature = temperature;
  if (humidite != null && humidite >= 0 && humidite <= 100) m.humidite = Math.round(humidite);
  if (vent != null && vent >= 0 && vent < 300) {
    m.vent = Math.round(vent);
    if (direction != null && direction >= 0 && direction <= 360 && vent > 0) m.direction = Math.round(direction) % 360;
  }
  if (rafales != null && rafales >= 0 && rafales < 400) m.rafales = Math.round(rafales);
  if (pluie != null && pluie >= 0 && pluie < 500) m.pluie_1h = pluie;
  return Object.keys(m).length > 2 ? m : undefined;
}

/**
 * One pass: every station's file, at most IN_FLIGHT at once (http.ts), each with the association's User-Agent; a
 * station not read keeps its measure of the pass before, said in `sans_reponse`. Writes the copy and says what it did.
 */
export async function collect(before: Copie | null, write: (c: Copie) => Promise<void>, now = new Date()): Promise<string> {
  const lus = await Promise.allSettled(STATIONS.map(async (s) => parse(s, JSON.parse(await getText(SOURCE.id, fichier(s), 20_000, { "User-Agent": UA })) as Daily)));
  const avant = new Map((before?.mesures ?? []).map((m) => [m.code, m]));
  const mesures: Mesure[] = [];
  const sansReponse: string[] = [];
  lus.forEach((r, i) => {
    const code = STATIONS[i].code;
    const m = r.status === "fulfilled" ? r.value : avant.get(code);
    if (r.status === "rejected") sansReponse.push(code);
    if (m && now.getTime() - Date.parse(m.mesure_a) <= MAX_AGE_MS && Date.parse(m.mesure_a) <= now.getTime() + 5 * 60_000) mesures.push(m);
  });
  if (sansReponse.length === STATIONS.length) throw new Error("aucune station de MétéoR-OI n'a répondu");
  await write({ lu: now.toISOString(), mesures, ...(sansReponse.length ? { sans_reponse: sansReponse } : {}) });
  return `${mesures.length} stations à jour sur ${STATIONS.length}${sansReponse.length ? `, sans réponse : ${sansReponse.join(", ")}` : ""}`;
}

export function station(s: StationMor): Station {
  return { source: SOURCE.id, id: s.code, nom: s.nom, lon: s.lon, lat: s.lat, altitude_m: s.altitude_m, variables: ["temperature", "humidite", "vent", "pluie"] };
}

/** The copy's measures as observations, each with its station and its time. */
export function toObservations(c: Copie, now: Date): Observation[] {
  const out: Observation[] = [];
  for (const m of c.mesures) {
    const s = STATIONS.find((x) => x.code === m.code);
    if (!s || now.getTime() - Date.parse(m.mesure_a) > MAX_AGE_MS) continue;
    const readings: Observation["readings"] = [];
    if (m.temperature != null) readings.push({ variable: "temperature", valeur: m.temperature, unite: "°C", nature: "mesure" });
    if (m.humidite != null) readings.push({ variable: "humidite", valeur: m.humidite, unite: "%", nature: "mesure" });
    if (m.vent != null) readings.push({ variable: "vent_moyen", valeur: m.vent, unite: "km/h", nature: "mesure" });
    if (m.direction != null) readings.push({ variable: "vent_direction", valeur: m.direction, unite: "° (d'où vient le vent)", nature: "mesure" });
    if (m.rafales != null) readings.push({ variable: "rafales", valeur: m.rafales, unite: "km/h", nature: "mesure" });
    if (m.pluie_1h != null) readings.push({ variable: "pluie_1h", valeur: m.pluie_1h, unite: "mm", nature: "mesure" });
    if (readings.length) out.push({ station: station(s), time: new Date(m.mesure_a), readings });
  }
  return out;
}

let reader: (() => Promise<Copie | null>) | undefined;
let memo: { at: number; copie: Copie } | undefined;

/** In the Worker: the copy read from KV, where the scheduled event writes it; never the network, from a visit. */
export function configure(read: (() => Promise<Copie | null>) | undefined) {
  reader = read;
  memo = undefined;
}

// Written every REFRESH_EVERY minutes: asked of KV once in 5 minutes by an isolate.
const FRESH_MS = 5 * 60_000;

/**
 * The stations' last measures, from the copy in KV: none where nothing is configured (a local server, the tests) or
 * while the association's agreement is not given. A copy not written for longer than 3 passes is `stale`.
 */
export async function observations(_cache: Cache, now = new Date()): Promise<Cached<Observation[]>> {
  if (!reader) return { value: [], fetchedAt: now, stale: false };
  if (!memo || now.getTime() - memo.at >= FRESH_MS) {
    const v = await reader();
    if (!v) throw new Error("stations de MétéoR-OI absentes du stockage");
    memo = { at: now.getTime(), copie: v };
  }
  const c = memo.copie;
  return { value: toObservations(c, now), fetchedAt: new Date(c.lu), stale: now.getTime() - Date.parse(c.lu) > 3 * REFRESH_EVERY * 60_000 };
}
