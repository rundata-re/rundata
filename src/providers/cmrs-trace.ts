/**
 * The path already travelled by a system the RSMC of La Réunion (Météo-France) watches, for the basin's map on /cyclones
 * (web/cyclones-bassin.ts): its successive positions at the RSMC's advisories, the last with its name, its stage and the
 * advisory's time. Nothing of the future: no forecast track, no cone, no distance to La Réunion (the user's decision of
 * 31/10/2026). The RSMC's own map, with its forecast, stays above (cmrs-carte.ts).
 *
 * - The source is the RSMC's bulletin WTIO31 FMEE (« Bulletin d'analyse et de prévision cyclonique », in French), sent
 *   on the WMO's network and copied by the NOAA in one file (`URL`), replaced at each advisory, whichever system it is
 *   about. Of it, only its number, the system's stage and name, and the position of « 2.A » are kept: never its
 *   forecasts (« 1.B » and after), its winds nor its comments.
 * - That bulletin is not open data: nothing is read, kept nor shown before `ACCORD`, the date of Météo-France's written
 *   agreement, is set. Until then, no request and no read of KV.
 * - Read by the scheduled event only, every 5 minutes from 25 minutes to 2 h 30 after each synoptic hour (00, 06, 12
 *   and 18 UTC), the RSMC's bulletins being out about an hour after it; also while GDACS (cyclones.ts) has no system,
 *   whose list comes later and leaves out a disturbance the RSMC already follows (« zone perturbée », 05/11/2026). With two systems, their bulletins come one after the other into the same file: read this often, each is
 *   seen. A bulletin missed leaves a gap, said by its number.
 * - The positions are kept in KV, one list per system, written only when a new bulletin comes (about 4 a day each).
 */
import type { Cache } from "../cache.js";
import { count, perInvocation } from "../budget.js";
import { getText } from "../http.js";
import { noteLecture } from "../lectures.js";
import { type SourceInfo, why } from "../types.js";
import * as gdacs from "./cyclones.js";
import type { Store } from "./vigilance-carte.js";

/** The date of Météo-France's written agreement to show these positions; null: nothing is read nor shown. */
export const ACCORD: string | null = "2026-11-02";
let ouvert = ACCORD !== null;
export const enLigne = () => ouvert;
/** For the tests: the trace read and shown, or not, whatever the agreement. */
export function ouvrir(v: boolean) {
  ouvert = v;
}

export const URL = "https://tgftp.nws.noaa.gov/data/raw/wt/wtio31.fmee..txt";

/** In sources_donnees, on /chiffres and in the catalogue's check, while the agreement holds (server.ts). */
export const SOURCE: SourceInfo = {
  id: "meteofrance_cmrs_wtio31",
  nom: "Bulletins d'avis de cyclone du CMRS de La Réunion (WTIO31 FMEE), copie de la NOAA",
  organisme: "Météo-France, CMRS de La Réunion",
  licence: "Repris avec l'accord écrit de Météo-France La Réunion du 02/11/2026\u00a0: numéro du bulletin, stade, nom et position du système seulement, jamais la prévision",
  attribution: "Météo-France, CMRS de La Réunion",
  url: URL,
};
const SOURCE_ID = SOURCE.id;

/** The minutes after each synoptic hour (00, 06, 12, 18 UTC) the scheduled event reads the bulletin: from 25 to 150. */
export const FROM_MINUTE = 25;
export const TO_MINUTE = 150;
/** A system's trace is shown while its last advisory is newer than this, as GDACS's active systems (cyclones.ts). */
export const SHOWN_HOURS = gdacs.ACTIVE_HOURS;

const KEY = "cmrs:trace";
// Kept 30 days after the last bulletin read, then forgotten; a system is dropped 30 days after its last advisory.
const TTL_SECONDS = 30 * 86_400;
const TIMEOUT_MS = 20_000;
const MAX_POINTS = 200;
const HOUR = 3_600_000;

let store: Store | undefined;

/** The Worker's KV (worker.ts). Without it, nothing is read, kept or shown. */
export function configure(kv?: Store): void {
  store = kv;
}

/** One advisory, as its bulletin gives it. */
export interface Avis {
  /** The bulletin's number for this system, its system's number in the season, and the season (« 20262027 »). */
  numero: number;
  systeme: number;
  saison: string;
  /** « Agueda », or « système n° 2 (non baptisé) ». */
  nom: string;
  /** In the RSMC's words: « tempête tropicale modérée ». */
  stade: string;
  /** The position's time, ISO, UTC. */
  heure: string;
  /** The bulletin's own time (« WTIO31 FMEE 060654 »: the 6th at 06:54 UTC), ISO, UTC. */
  emis: string;
  lon: number;
  lat: number;
  /** Its last bulletin on this system, in the RSMC's words (`FIN`). */
  fin?: true;
}

/** A system's positions, oldest first. */
export interface Trace {
  saison: string;
  systeme: number;
  nom: string;
  points: { numero: number; heure: string; lon: number; lat: number; stade: string }[];
  /** The newest bulletin's own time, and whether it was the last on this system (Avis). */
  emis?: string;
  fin?: true;
}

/** What the scheduled event keeps. */
export interface Etat {
  traces: Trace[];
  /**
   * The last read that succeeded (written at least every QUIET_MINUTES while a system is followed, for the tool's
   * freshness), and the last that failed since, ISO.
   */
  lu?: string;
  echec?: string;
}

/** What the page draws of a system: its positions (lon, lat), oldest first, and the last advisory's. */
export interface Parcours {
  nom: string;
  stade: string;
  /** The last advisory's time, ISO, UTC. */
  heure: string;
  points: [number, number][];
  /** The first and last advisories read, and how many between them were missed. */
  premier: number;
  dernier: number;
  manquent: number;
}

/** The RSMC's stages, as its bulletins write them (capitals, no accent), in its words. */
const STADES: Record<string, string> = Object.fromEntries(
  Object.values(gdacs.STAGES).map((s) => [squash(s), s]),
);

function squash(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
}

/** « DEPRESSION RESIDUELLE » → « dépression résiduelle »; a stage not known, in small letters as written. */
export function stade(s: string): string {
  return STADES[squash(s)] ?? s.trim().toLowerCase();
}

/**
 * How the RSMC writes its last bulletin on a system, in its comments (Agueda's, n° 15 of 23/10/2026): « DERNIER
 * BULLETIN EMIS PAR LE CMRS DE LA REUNION CONCERNANT CE SYSTEME ». Only looked for, never shown.
 */
const FIN = /DERNIER BULLETIN EMIS PAR LE CMRS DE LA REUNION CONCERNANT CE SYSTEME/;

/**
 * The advisory of a bulletin WTIO31 FMEE: its number (« 0.A »), its system's stage and name (« 1.A ») and its position
 * (« 2.A »), nothing else. Undefined when one is missing or not as expected.
 */
export function parse(raw: string): Avis | undefined {
  const text = raw.replace(/\r/g, "");
  const head = /^WTIO31 FMEE (\d\d)(\d\d)(\d\d)/m.exec(text);
  if (!head) return undefined;
  const num = /^0\.A NUMERO DU BULLETIN\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d{8})\s*$/m.exec(text);
  const sys = /^1\.A (.+?) (\d+)(?: \(([A-Z' -]+)\))?\s*$/m.exec(text);
  const pos = /^2\.A POSITION A (\d\d)(\d\d) UTC LE (\d\d)\/(\d\d)\/(\d{4})\s*:\s*\n.*?POINT (\d+(?:\.\d+)?) ([NS]) \/ (\d+(?:\.\d+)?) ([EW])/m.exec(text);
  if (!num || !sys || !pos || +sys[2] !== +num[2]) return undefined;
  const t = new Date(Date.UTC(+pos[5], +pos[4] - 1, +pos[3], +pos[1], +pos[2]));
  if (Number.isNaN(t.getTime()) || t.getUTCDate() !== +pos[3] || t.getUTCHours() !== +pos[1]) return undefined;
  // The bulletin's day, after its position's: in the position's month, or the next one when it is past its end.
  let emis = new Date(Date.UTC(+pos[5], +pos[4] - 1, +head[1], +head[2], +head[3]));
  if (emis.getTime() < t.getTime() - 86_400_000) emis = new Date(Date.UTC(+pos[5], +pos[4], +head[1], +head[2], +head[3]));
  const lat = +pos[6] * (pos[7] === "S" ? -1 : 1);
  const lon = +pos[8] * (pos[9] === "W" ? -1 : 1);
  if (!gdacs.inBasin(lon, Math.min(lat, 0))) return undefined;
  const nom = sys[3]
    ? sys[3].toLowerCase().replace(/(^|[ '-])\p{L}/gu, (c) => c.toUpperCase())
    : `système n° ${+sys[2]} (non baptisé)`;
  const fin = FIN.test(text.replace(/\s+/g, " "));
  return { numero: +num[1], systeme: +num[2], saison: num[3], nom, stade: stade(sys[1]), heure: t.toISOString(), emis: emis.toISOString(), lon, lat, ...(fin && { fin: true as const }) };
}

/** The state with an advisory added: once per number, in order; a named system's name given to all its positions. */
export function ajoute(e: Etat, a: Avis, now: Date): Etat {
  const keep = e.traces.filter((t) => now.getTime() - Date.parse(t.points[t.points.length - 1].heure) < TTL_SECONDS * 1000);
  const i = keep.findIndex((t) => t.saison === a.saison && t.systeme === a.systeme);
  const old = i >= 0 ? keep[i] : { saison: a.saison, systeme: a.systeme, nom: a.nom, points: [] };
  if (old.points.some((p) => p.numero === a.numero)) return keep.length === e.traces.length ? e : { ...e, traces: keep };
  const points = [...old.points, { numero: a.numero, heure: a.heure, lon: a.lon, lat: a.lat, stade: a.stade }]
    .sort((x, y) => x.numero - y.numero)
    .slice(-MAX_POINTS);
  // The newest bulletin names the system: a disturbance named once it is a storm.
  const newest = points[points.length - 1].numero === a.numero;
  const nom = newest ? a.nom : old.nom;
  const { emis: _e, fin: _f, ...rest } = old as Trace;
  const t: Trace = newest ? { ...rest, nom, points, emis: a.emis, ...(a.fin && { fin: true as const }) } : { ...old, nom, points };
  return { ...e, traces: i >= 0 ? keep.map((x, k) => (k === i ? t : x)) : [...keep, t] };
}

/** What the page draws: the systems whose last advisory is newer than SHOWN_HOURS, newest first. */
export function parcours(e: Etat, now: Date): Parcours[] {
  return e.traces
    .filter((t) => t.points.length && now.getTime() - Date.parse(t.points[t.points.length - 1].heure) < SHOWN_HOURS * HOUR)
    .map((t) => {
      const last = t.points[t.points.length - 1];
      const premier = t.points[0].numero;
      return {
        nom: t.nom,
        stade: last.stade,
        heure: last.heure,
        points: t.points.map((p): [number, number] => [p.lon, p.lat]),
        premier,
        dernier: last.numero,
        manquent: last.numero - premier + 1 - t.points.length,
      };
    })
    .sort((a, b) => b.heure.localeCompare(a.heure));
}

/**
 * A system the RSMC follows, by its newest bulletin: issued less than SUIVI_HOURS ago, and not its last on the system.
 * Only its number, stage, name and the bulletin's time: what the pages say while GDACS has no system (tools/cyclones.ts).
 */
export interface Suivi {
  systeme: number;
  saison: string;
  /** Its name, once it has one; none while « non baptisé ». */
  nom?: string;
  stade: string;
  numero: number;
  /** The bulletin's own time, ISO, UTC. */
  emis: string;
}
export const SUIVI_HOURS = 24;
const UNNAMED = /^système n° \d+ \(non baptisé\)$/;

/** The systems the RSMC follows at `now`, newest bulletin first. */
export function suivis(e: Etat, now: Date): Suivi[] {
  return e.traces
    .filter((t) => t.points.length && !t.fin && t.emis && now.getTime() - Date.parse(t.emis) < SUIVI_HOURS * HOUR)
    .map((t) => {
      const last = t.points[t.points.length - 1];
      return { systeme: t.systeme, saison: t.saison, ...(!UNNAMED.test(t.nom) && { nom: t.nom }), stade: last.stade, numero: last.numero, emis: t.emis! };
    })
    .sort((a, b) => b.emis.localeCompare(a.emis));
}

/** Whether the scheduled event at `now` (every 5 minutes) reads the bulletin. */
export function due(now: Date): boolean {
  const m = (now.getUTCHours() % 6) * 60 + now.getUTCMinutes();
  return m >= FROM_MINUTE && m < TO_MINUTE;
}

/** Without a system in GDACS: once every QUIET_MINUTES of those minutes only (25, 40… 145), 9 reads by synoptic hour. */
export const QUIET_MINUTES = 15;
export function dueQuiet(now: Date): boolean {
  const m = (now.getUTCHours() % 6) * 60 + now.getUTCMinutes();
  return due(now) && (m - FROM_MINUTE) % QUIET_MINUTES === 0;
}

async function etat(): Promise<Etat | undefined> {
  if (!store) return undefined;
  count(1, "read");
  return ((await store.json(KEY)) as Etat | null) ?? undefined;
}

/** The state kept, for a page: one read of KV per invocation, whatever is asked of it. Never throws. */
function lu(): Promise<Etat | undefined> {
  return perInvocation("cmrs:trace", async () => {
    try {
      return await etat();
    } catch (err) {
      console.error("trace du CMRS : état illisible", why(err));
      return undefined;
    }
  });
}

/** The systems to draw, for a page: none before the agreement. Never throws. */
export async function kept(now = new Date()): Promise<Parcours[]> {
  if (!enLigne()) return [];
  const e = await lu();
  return e ? parcours(e, now) : [];
}

/** The systems the RSMC follows, for a page or a tool: none before the agreement. Never throws. */
export async function suivisKept(now = new Date()): Promise<Suivi[]> {
  if (!enLigne()) return [];
  const e = await lu();
  const list = e ? suivis(e, now) : [];
  // The answer that says them dates from this read too (tools/fraicheur.ts): the oldest of its reads, GDACS's or this one.
  // A failure since the last success: its last copy, said as such.
  if (list.length && e?.lu) {
    const stale = !!e.echec && e.echec > e.lu;
    noteLecture({ key: KEY, fetchedAt: Date.parse(e.lu), stale, freshSeconds: QUIET_MINUTES * 60, ...(stale && { source: SOURCE.id }), from: SOURCE.id });
  }
  return list;
}

/**
 * The scheduled event's turn: nothing before the agreement or outside the minutes of `due`, and without an active
 * system in GDACS only at those of `dueQuiet`; else one read of the bulletin, and the state written if it changed. A
 * bulletin older than the state's keeping (the file keeps the last one for weeks) adds nothing. Returns what it did.
 */
export async function passage(cache: Cache, now = new Date()): Promise<string> {
  if (!enLigne()) return "pas d'accord";
  if (!store || !due(now)) return "rien à lire";
  const list = (await gdacs.systemes(cache, now)).value;
  if (!list.some((s) => gdacs.isActive(s, now)) && !dueQuiet(now)) return "aucun système actif";
  const before = (await etat()) ?? { traces: [] };
  let after: Etat, dit: string;
  try {
    const read = parse(await getText(SOURCE_ID, URL, TIMEOUT_MS));
    const a = read && now.getTime() - Date.parse(read.emis) < TTL_SECONDS * 1000 ? read : undefined;
    const { echec: _, ...rest } = before;
    // An old bulletin read is no failure: nothing to add, nothing to write.
    after = a ? { ...ajoute(rest, a, now), lu: now.toISOString() } : read ? before : { ...before, echec: now.toISOString() };
    dit = a ? `bulletin ${a.numero}/${a.systeme} (${a.nom})` : read ? "bulletin ancien" : "bulletin illisible";
  } catch (err) {
    console.error("trace du CMRS : bulletin indisponible", why(err));
    after = { ...before, echec: now.toISOString() };
    dit = "bulletin sans réponse";
  }
  // The time of a read alone is worth a write only while a system is followed, the time the tool says (suivisKept), and
  // at most once every QUIET_MINUTES: 4 an hour, in the minutes of `due`. Else only a new position, or a failure after a
  // success, or back.
  const verifie = !!after.lu && after.lu !== before.lu && suivis(after, now).length > 0
    && (!before.lu || now.getTime() - Date.parse(before.lu) >= (QUIET_MINUTES - 1) * 60_000);
  const changed = verifie || JSON.stringify(after.traces) !== JSON.stringify(before.traces) || !!after.echec !== !!before.echec;
  if (changed) {
    count(1, true);
    await store.put(KEY, JSON.stringify(after), TTL_SECONDS);
  }
  return dit;
}
