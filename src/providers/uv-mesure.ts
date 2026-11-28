/**
 * The UV index MEASURED at Moufia (Saint-Denis), computed by rundata.re from the erythemal (UV-E) channel of ENERGY-Lab's
 * radiometer (Université de La Réunion), published by SolarDB as a voltage each minute (`UIO_pz04_Avg`, in mV). Under
 * ENERGY-Lab's written agreement of 23/11/2026, CC BY 4.0, cited as it asks: « ENERGY-Lab. (year). title [Data set]. DOI. ».
 * A MEASUREMENT, never mixed with the CAMS forecast of providers/uv.ts.
 *
 * - The conversion is that of the radiometer's certificate (PMOD/WRC n° 2022-2611-2-1, Kipp & Zonen UV-S-AE-T
 *   n° 140040, calibrated in 2022, the last calibration known): E = S · C · fn(SZA, O3) · Coscor(SZA), the index being
 *   40 · E (Webb, Gröbner and Blumthaler, COST 726, 2007). The table fn and the cosine correction are the certificate's.
 *   The dark signal is left out: -0.02 mV at night at Moufia (09/11/2026), against 300 to 1 300 mV by day.
 * - The ozone column is NASA's OMI (Aura) over La Réunion, its overpass nearest the island, read once a day (the last
 *   4 kB of the station's file, its ~20 last overpasses); a month's mean over 2004-2026 when it does not answer.
 * - Read by the scheduled event only, every 10 minutes while the sun is up: a login (the token, a Worker secret, goes in
 *   the address, as the API asks: never logged by us, sans-reponse.ts keeps only the host), then the last 20 minutes.
 *   The index is the mean of the last 10 minutes measured. The state is kept in KV; pages and answers read KV, never
 *   SolarDB. Without the secret, nothing is asked, kept or shown, and nothing says it is missing.
 */
import type { Cache } from "../cache.js";
import { contexte, secret } from "../contexte.js";
import { getCookie, getJson, getText } from "../http.js";
import { type SourceInfo, UpstreamError } from "../types.js";

/**
 * The data set, as ENERGY-Lab asks it cited: « ENERGY-Lab. (year). title [Data set]. DOI. ». Its title and DOI are asked
 * of ENERGY-Lab and not known yet (23/11/2026): never invented, and while they are empty the citation leaves them out
 * and names ENERGY-Lab, SolarDB, its link and the licence. To set when ENERGY-Lab gives them.
 */
export const JEU_DE_DONNEES: { titre?: string; doi?: string; lien: string } = { titre: undefined, doi: undefined, lien: "https://solardb.univ-reunion.fr/" };

/** The data set's address in the citation: its DOI once known, SolarDB until then. */
export const lienCite = () => (JEU_DE_DONNEES.doi ? `https://doi.org/${JEU_DE_DONNEES.doi}` : JEU_DE_DONNEES.lien);
/** ENERGY-Lab's citation, with the year the data were read; without the data set's title, ENERGY-Lab, SolarDB and the licence. */
export const citation = (annee: number) =>
  JEU_DE_DONNEES.titre
    ? `ENERGY-Lab. (${annee}). ${JEU_DE_DONNEES.titre} [Data set]. ${lienCite()}.`
    : `ENERGY-Lab, Université de La Réunion, SolarDB (${lienCite()}), licence CC BY 4.0.`;

export const SOURCE: SourceInfo = {
  id: "solardb_uv",
  nom: "Indice UV mesuré au Moufia (Saint-Denis), calculé par rundata.re d'après le radiomètre UV d'ENERGY-Lab (SolarDB)",
  organisme: "ENERGY-Lab, Université de La Réunion (SolarDB)",
  licence: "CC BY 4.0",
  attribution: citation(2026),
  url: JEU_DE_DONNEES.lien,
};

export const SOURCE_OZONE: SourceInfo = {
  id: "nasa_omi_ozone",
  nom: "Colonne d'ozone au-dessus de La Réunion, satellite Aura (instrument OMI), pour le calcul de l'indice UV mesuré",
  organisme: "NASA (Aura Validation Data Center)",
  licence: "Politique de données de la NASA (sciences de la Terre)\u00a0: partage complet et ouvert, sans exclusivité",
  attribution: "NASA OMI OMTO3, Aura Validation Data Center",
  url: "https://avdc.gsfc.nasa.gov/",
};

/** Where the radiometer is (SolarDB's site `urmoufia`). */
export const STATION = { nom: "Moufia (Saint-Denis)", lat: -20.90146, lon: 55.483593 };
/** The places it answers for: within this distance, the lowlands of Saint-Denis and their neighbours. */
export const RAYON_KM = 10;

/**
 * The error possible, a provisional estimate (23/11/2026). Its terms, combined in quadrature: the scale, 14 % (in 2026
 * the index lies between the certificate's and the one fitted on the LACy's Bentham in 2025, 1.136 apart, and there is
 * no reference on the ground after 10/2025); the calibration, 3.3 % (k = 2); the ozone, 3 %; the table and the cosine
 * correction, 3 %. √(14² + 3.3² + 3² + 3²) ≈ 15.0 %.
 * The ozone's term: OMI's value 3 to 7 days old (its file comes ~3 days late), over 2004-2026 (6 569 days), is 2.1 % off
 * the day's column at the median, 6.5 % at the 95th percentile; the certificate's table moves the index by ~0.45 % per
 * 1 % of ozone at noon (13.71 at 260 DU, 12.82 at 300 DU), so ~1 % at the median and ~3 % at the 95th. With the day's
 * own column, ~1 %, the total would be ≈ 14.7 %. To narrow with the Bentham's 2026 indices, once the LACy gives them.
 */
export const ERREUR_MAX_PCT = 15;

const API = "https://solardb.univ-reunion.fr/api/v1";
const CAPTEUR = "UIO_pz04_Avg";
const OMI_URL = "https://avdc.gsfc.nasa.gov/pub/data/satellite/Aura/OMI/V03/L2OVP/OMTO3/aura_omi_l2ovp_omto3_col4_v8.5_la.reunion_436.txt";

export const KEY = "uv-mesure:etat";
/** Past a week without a write, nothing is shown. */
export const TTL_SECONDS = 7 * 86_400;
/** The scheduled event reads every 10 minutes (UTC), at 2, 12, 22… past the hour: SolarDB's minutes come 2 to 3 minutes late. */
export const REFRESH_EVERY = 10;
export const REFRESH_OFFSET = 2;
/** A measurement older than this is not « now ». */
export const MESURE_MAX_MIN = 30;
const READ_SECONDS = 120;
const TIMEOUT_MS = 20_000;
const MINUTE = 60_000;
const DAY = 86_400_000;
/** OMI is read again after this. */
const OZONE_EVERY_MS = 20 * 3_600_000;
/** An overpass older than this is not used: the month's mean is. */
const OZONE_MAX_DAYS = 10;
/** OMI's monthly mean over La Réunion, 2004-2026 (the station's file, overpass nearest the island each day), in DU. */
export const OZONE_MOIS = [259.9, 256.8, 256.9, 257.2, 252.8, 253.7, 258.7, 268.6, 281.0, 287.0, 283.2, 271.8];

// ---------------------------------------------------------------- The certificate

const C = 0.2242; // W m-2 V-1
const O3 = [200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500];
const SZA = Array.from({ length: 19 }, (_, i) => i * 5);
/** fn(SZA, O3): a row per 5° of the sun's zenith angle, from 0 to 90°, a column per 20 DU of ozone, from 200 to 500; 1.000 at 40° and 300 DU. */
const FN = [
  [1.378, 1.321, 1.269, 1.223, 1.182, 1.144, 1.109, 1.078, 1.049, 1.022, 0.997, 0.974, 0.952, 0.932, 0.913, 0.895],
  [1.376, 1.318, 1.267, 1.221, 1.179, 1.142, 1.107, 1.076, 1.047, 1.02, 0.995, 0.972, 0.95, 0.93, 0.911, 0.893],
  [1.368, 1.311, 1.26, 1.214, 1.173, 1.135, 1.101, 1.069, 1.04, 1.014, 0.989, 0.966, 0.945, 0.925, 0.906, 0.888],
  [1.356, 1.299, 1.248, 1.202, 1.161, 1.124, 1.09, 1.059, 1.03, 1.004, 0.979, 0.956, 0.935, 0.915, 0.897, 0.879],
  [1.338, 1.282, 1.231, 1.186, 1.145, 1.108, 1.075, 1.044, 1.016, 0.99, 0.965, 0.943, 0.922, 0.902, 0.884, 0.867],
  [1.315, 1.259, 1.209, 1.165, 1.125, 1.088, 1.055, 1.025, 0.997, 0.971, 0.948, 0.926, 0.905, 0.886, 0.868, 0.851],
  [1.287, 1.232, 1.182, 1.139, 1.099, 1.064, 1.031, 1.001, 0.974, 0.949, 0.926, 0.904, 0.884, 0.866, 0.848, 0.832],
  [1.253, 1.198, 1.15, 1.107, 1.069, 1.034, 1.003, 0.974, 0.947, 0.923, 0.9, 0.879, 0.86, 0.842, 0.824, 0.809],
  [1.213, 1.16, 1.113, 1.071, 1.034, 1.0, 0.969, 0.941, 0.916, 0.892, 0.87, 0.85, 0.831, 0.814, 0.797, 0.782],
  [1.167, 1.116, 1.07, 1.03, 0.994, 0.961, 0.932, 0.905, 0.88, 0.857, 0.836, 0.817, 0.799, 0.782, 0.767, 0.752],
  [1.115, 1.065, 1.022, 0.983, 0.949, 0.917, 0.889, 0.864, 0.84, 0.819, 0.799, 0.78, 0.763, 0.747, 0.732, 0.719],
  [1.057, 1.01, 0.968, 0.931, 0.898, 0.869, 0.842, 0.818, 0.796, 0.776, 0.757, 0.74, 0.724, 0.709, 0.695, 0.682],
  [0.993, 0.948, 0.909, 0.875, 0.844, 0.816, 0.791, 0.769, 0.748, 0.729, 0.712, 0.696, 0.681, 0.668, 0.655, 0.643],
  [0.924, 0.882, 0.845, 0.813, 0.785, 0.759, 0.737, 0.716, 0.697, 0.68, 0.664, 0.65, 0.637, 0.624, 0.613, 0.603],
  [0.85, 0.811, 0.778, 0.749, 0.723, 0.7, 0.679, 0.661, 0.644, 0.629, 0.615, 0.602, 0.591, 0.58, 0.57, 0.561],
  [0.773, 0.738, 0.708, 0.682, 0.659, 0.639, 0.621, 0.605, 0.591, 0.578, 0.566, 0.555, 0.546, 0.537, 0.528, 0.521],
  [0.695, 0.665, 0.639, 0.617, 0.597, 0.58, 0.565, 0.552, 0.54, 0.529, 0.52, 0.511, 0.503, 0.496, 0.49, 0.484],
  [0.625, 0.599, 0.577, 0.558, 0.542, 0.529, 0.516, 0.506, 0.496, 0.488, 0.48, 0.474, 0.468, 0.462, 0.457, 0.452],
  [0.613, 0.587, 0.565, 0.547, 0.531, 0.518, 0.506, 0.496, 0.487, 0.478, 0.471, 0.465, 0.459, 0.454, 0.449, 0.444],
];
/** The cosine correction, clear sky, per 5° from 0 to 90°. */
const COS = [0.992, 0.986, 0.986, 0.985, 0.984, 0.983, 0.98, 0.978, 0.978, 0.978, 0.979, 0.979, 0.977, 0.979, 0.98, 0.986, 0.988, 0.985, 0.984];

function interp(xs: number[], ys: number[], x: number): number {
  const step = xs[1] - xs[0];
  const v = Math.min(Math.max(x, xs[0]), xs[xs.length - 1]);
  const i = Math.min(Math.floor((v - xs[0]) / step), xs.length - 2);
  const f = (v - xs[i]) / step;
  return ys[i] * (1 - f) + ys[i + 1] * f;
}

export const fn = (sza: number, o3: number) => interp(SZA, FN.map((row) => interp(O3, row, o3)), sza);

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The sun's zenith angle at `t` over a place, in degrees (NOAA's solar position). */
export function sza(t: Date, lat = STATION.lat, lon = STATION.lon): number {
  const T = (t.getTime() / DAY + 2440587.5 - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Cc = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const lam = L0 + Cc - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * T));
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * T));
  const dec = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqt = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const mins = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60 + eqt + 4 * lon;
  const ha = mins / 4 - 180;
  const c = Math.sin(rad(lat)) * Math.sin(rad(dec)) + Math.cos(rad(lat)) * Math.cos(rad(dec)) * Math.cos(rad(ha));
  return deg(Math.acos(Math.max(-1, Math.min(1, c))));
}

/** The UV index from the radiometer's voltage (mV) at `t`, under `o3` DU of ozone; never below 0. */
export function indice(mv: number, t: Date, o3: number): number {
  const z = sza(t);
  return Math.max(0, 40 * (mv / 1000) * C * fn(z, o3) * interp(SZA, COS, z));
}

// ---------------------------------------------------------------- The ozone

/** The latest day's overpass nearest the island, from the end of OMI's file: its day (UTC, « 2026-11-19 ») and column. */
export function parseOzone(text: string): { jour: string; du: number } | undefined {
  let best: { jour: string; du: number; dist: number } | undefined;
  for (const l of text.split("\n")) {
    const p = l.trim().split(/\s+/);
    if (p.length < 12 || !/^\d{8}T/.test(p[0])) continue;
    const jour = `${p[0].slice(0, 4)}-${p[0].slice(4, 6)}-${p[0].slice(6, 8)}`;
    const dist = Number(p[9]);
    const du = Number(p[11]);
    if (!(du > 100 && du < 600) || !(dist >= 0 && dist < 150)) continue;
    if (!best || jour > best.jour || (jour === best.jour && dist < best.dist)) best = { jour, du, dist };
  }
  return best && { jour: best.jour, du: best.du };
}

// ---------------------------------------------------------------- What is kept

export interface Mesure {
  /** Epoch ms of the last minute of the 10 averaged. */
  t: number;
  /** The index, one decimal. */
  uv: number;
}

export interface Etat {
  /** When SolarDB was last asked, answered or not; when it last answered. */
  essai: number;
  lu?: number;
  /** The last measurement. */
  mesure?: Mesure;
  /** The day's highest (10-minute mean), and its local date « 2026-11-23 ». */
  max?: Mesure & { jour: string };
  /** The ozone column used: from OMI (its day) or the month's mean, and when OMI was last asked. */
  ozone?: { du: number; jour?: string; essai: number };
  /** The last failure, if the last read failed. */
  echec?: { at: number; message: string };
}

interface Reponse {
  data?: Record<string, Record<string, { dates?: string[]; values?: (number | null)[] }>>;
}

/** In the Worker, the token SolarDB sent (contexte.ts): given only with the store, where the state is kept. */
const leJeton = () => secret("solardb");

export const configured = () => !!leJeton();

const localDate = (t: number) => new Date(t + 4 * 3_600_000).toISOString().slice(0, 10);

/** Whether the scheduled event at `now` (every 5 minutes) reads: at its minutes, while the sun is up at Moufia. */
export const refreshDue = (now: Date) =>
  (((now.getUTCMinutes() - REFRESH_OFFSET) % REFRESH_EVERY) + REFRESH_EVERY) % REFRESH_EVERY < 5 && sza(now) < 90;

/** The mean of the last 10 minutes of the answer, with 8 of them at least; nothing else. */
export function dernieres10(r: Reponse): { t: number; mv: number } | undefined {
  const s = r.data?.urmoufia?.[CAPTEUR];
  if (!s?.dates || !s.values) return undefined;
  const pts = s.dates.flatMap((d, i) => {
    const v = s.values![i];
    const t = Date.parse(d);
    return typeof v === "number" && Number.isFinite(v) && Number.isFinite(t) ? [{ t, v }] : [];
  });
  if (!pts.length) return undefined;
  const fin = Math.max(...pts.map((p) => p.t));
  const w = pts.filter((p) => p.t > fin - 10 * MINUTE);
  if (w.length < 8) return undefined;
  return { t: fin, mv: w.reduce((a, p) => a + p.v, 0) / w.length };
}

/** An index above this is a fault of the reading, not the sun: the highest at Moufia from the certificate is about 15. */
const UV_MAX_PLAUSIBLE = 25;

/**
 * One read: the ozone when due, a login, the last 20 minutes; the state handed to `write`, failures included. Returns
 * what was done, for the logs; throws after writing when SolarDB failed.
 */
export async function refresh(before: Etat | null, write: (etat: Etat) => Promise<void>, now = new Date()): Promise<string> {
  const t = now.getTime();
  const jeton = leJeton();
  if (!jeton) return "sans jeton";
  const etat: Etat = { essai: t, ...(before?.lu ? { lu: before.lu } : {}), ...(before?.mesure ? { mesure: before.mesure } : {}), ...(before?.max ? { max: before.max } : {}), ...(before?.ozone ? { ozone: before.ozone } : {}) };
  if (etat.max && etat.max.jour !== localDate(t)) delete etat.max;
  if (!etat.ozone || t - etat.ozone.essai >= OZONE_EVERY_MS) {
    let lu: { jour: string; du: number } | undefined;
    try {
      lu = parseOzone(await getText(SOURCE_OZONE.id, OMI_URL, TIMEOUT_MS, { Range: "bytes=-4000" }));
    } catch {
      lu = undefined;
    }
    etat.ozone = lu ? { ...lu, essai: t } : { ...(etat.ozone?.jour ? { jour: etat.ozone.jour, du: etat.ozone.du } : { du: 0 }), essai: t };
  }
  const o3 = ozoneDu(etat, now);
  try {
    const session = await getCookie(SOURCE.id, `${API}/login?token=${encodeURIComponent(jeton)}`, "solardb", TIMEOUT_MS);
    const r = await getJson<Reponse>(SOURCE.id, `${API}/data/json/urmoufia/${CAPTEUR}?start=-20m`, TIMEOUT_MS, { Cookie: `solardb=${session}` });
    const m = dernieres10(r);
    if (!m) throw new UpstreamError(SOURCE.id, "pas assez de minutes mesurées");
    const uv = Math.round(indice(m.mv, new Date(m.t), o3.du) * 10) / 10;
    if (uv > UV_MAX_PLAUSIBLE) throw new UpstreamError(SOURCE.id, `valeur hors d'échelle (${uv})`);
    etat.lu = t;
    etat.mesure = { t: m.t, uv };
    if (!etat.max || uv > etat.max.uv) etat.max = { t: m.t, uv, jour: localDate(m.t) };
    await write(etat);
    return `indice ${uv} à ${new Date(m.t).toISOString().slice(11, 16)} UTC, ozone ${o3.du} DU (${o3.jour ?? "moyenne du mois"})`;
  } catch (err) {
    // The token goes in the login's address: never in what is kept or logged, whatever the error says.
    const message = (err instanceof Error ? err.message : String(err)).split(jeton).join("<jeton>");
    etat.echec = { at: t, message };
    await write(etat);
    throw new UpstreamError(SOURCE.id, message.replace(/^solardb_uv: /, ""), err instanceof UpstreamError ? err.status : undefined);
  }
}

/** The ozone the index uses: OMI's when fresh enough, else the month's mean. */
export function ozoneDu(e: Etat, now: Date): { du: number; jour?: string } {
  const o = e.ozone;
  if (o?.jour && o.du > 0 && now.getTime() - Date.parse(o.jour) <= OZONE_MAX_DAYS * DAY) return { du: o.du, jour: o.jour };
  return { du: OZONE_MOIS[new Date(now.getTime() + 4 * 3_600_000).getUTCMonth()] };
}

/** The state the scheduled event keeps: read from KV in the Worker; nothing elsewhere, nor without the token. */
export async function etat(cache: Cache) {
  return cache.get(KEY, READ_SECONDS, async () => {
    // In the Worker, the state the scheduled event keeps in its store (contexte.ts).
    const v = (await contexte().kv?.json<Etat>(KEY)) ?? null;
    if (!v?.essai) throw new UpstreamError(SOURCE.id, "état de l'indice UV mesuré absent du stockage");
    return v;
  });
}

// ---------------------------------------------------------------- What a page and an answer say, the same words

/** What prevision_meteo answers and the place's page shows, for a place near the station. */
export interface Bloc {
  nature: "mesure";
  station: string;
  distance_km: number;
  /** The last measurement, while it is less than MESURE_MAX_MIN old: « 9 (très élevé) », and its time « 14:20 ». */
  indice?: string;
  mesure_a?: string;
  /** The day's highest so far, and its time. */
  max_du_jour?: { indice: string; a: string };
  /** The last read failed, after the last measurement: its time. */
  lecture_en_echec_a?: string;
  resume: string;
  incertitude: string;
  /** ENERGY-Lab's citation, whole; `lien`, the address it ends with. */
  citation: string;
  lien: string;
}

const NIVEAUX: [number, string][] = [[11, "extrême"], [8, "très élevé"], [6, "élevé"], [3, "modéré"], [0, "faible"]];
const dit = (uv: number) => {
  const v = Math.round(uv);
  return `${v} (${NIVEAUX.find(([s]) => v >= s)![1]})`;
};
const hhmm = (t: number) => new Date(t + 4 * 3_600_000).toISOString().slice(11, 16);

// The validated words (23/11/2026). The ozone and angle correction is the one ENERGY-Lab advised, applied with the
// certificate's table; « le dernier connu », « estimation provisoire » are the words of our mail to ENERGY-Lab.
export const INCERTITUDE =
  "Indice calculé par rundata.re à partir de la mesure du radiomètre UV d'ENERGY-Lab (Université de La Réunion), avec son certificat " +
  "d'étalonnage de 2022, le dernier connu, et une correction de l'ozone et de la hauteur du soleil. Erreur possible\u00a0: jusqu'à " +
  `${ERREUR_MAX_PCT}\u00a0% (estimation provisoire), surtout liée à l'étalonnage et à la conversion en indice UV. C'est une mesure, pas la prévision CAMS.`;

/**
 * The block for a place `km` from the station, from the state at `now`: the measurement of now, the day's highest, a
 * failed read with its time. Nothing at night before the first measurement of the day, nor without a state.
 */
export function bloc(e: Etat | null | undefined, km: number, now: Date): Bloc | undefined {
  if (!e?.essai) return undefined;
  const t = now.getTime();
  const today = localDate(t);
  const m = e.mesure && t - e.mesure.t <= MESURE_MAX_MIN * MINUTE && e.mesure.t <= t + 5 * MINUTE ? e.mesure : undefined;
  const max = e.max?.jour === today ? e.max : undefined;
  const echec = e.echec && localDate(e.echec.at) === today && e.echec.at > (e.lu ?? 0) ? e.echec : undefined;
  if (!m && !max && !echec) return undefined;
  const ou = `au ${STATION.nom}, à ${Math.round(km)} km`;
  const parts: string[] = [];
  if (m) parts.push(`Indice UV MESURÉ ${ou} : ${dit(m.uv)} à ${hhmm(m.t)}, moyenne des 10 minutes précédentes.`);
  else if (max) parts.push(`Indice UV MESURÉ ${ou} : pas de mesure depuis ${hhmm(e.mesure!.t)}.`);
  else parts.push(`Indice UV MESURÉ ${ou} : pas de mesure aujourd'hui.`);
  if (max && (!m || max.t !== m.t)) parts.push(`Le plus haut aujourd'hui : ${dit(max.uv)} à ${hhmm(max.t)}.`);
  if (echec) parts.push(`La lecture de SolarDB a échoué à ${hhmm(echec.at)}.`);
  return {
    nature: "mesure",
    station: STATION.nom,
    distance_km: Math.round(km * 10) / 10,
    ...(m ? { indice: dit(m.uv), mesure_a: hhmm(m.t) } : {}),
    ...(max ? { max_du_jour: { indice: dit(max.uv), a: hhmm(max.t) } } : {}),
    ...(echec ? { lecture_en_echec_a: hhmm(echec.at) } : {}),
    resume: parts.join(" "),
    incertitude: INCERTITUDE,
    citation: citation(new Date((e.lu ?? t) + 4 * 3_600_000).getUTCFullYear()),
    lien: lienCite(),
  };
}
