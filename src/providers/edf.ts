/**
 * Electricity in La Réunion, from EDF SEI's open data portal (data-fair API, no key):
 * - the production by source every 5 minutes ("Estimé": telemetered, consolidated each month);
 * - the "météo de l'électricité": a signal per hour for the coming days (optimal, heures de pointe, contraint,
 *   très contraint), with the share of charging EDF advises for electric vehicles.
 */
import { left } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import { getFile, getJson } from "../http.js";
import type { SourceInfo } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "edf_sei_reunion",
  nom: "Production d'électricité et météo de l'électricité à La Réunion (EDF SEI)",
  organisme: "EDF Systèmes énergétiques insulaires, La Réunion",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "EDF SEI Réunion",
  url: "https://opendata-reunion.edf.fr",
};

const API = "https://opendata-reunion.edf.fr/data-fair/api/v1/datasets";
const MIX = `${API}/njq-knwu0diqrdup6tya8qxi/lines?size=1&sort=-date`;
const SIGNAL = `${API}/7tgfic35sejxtbi0ose84dbx/lines?size=200&sort=dateheure`;
/**
 * EDF keeps the last 24 hours, a line every 5 minutes (287 to 289 lines): one request reads them all, the latest line
 * with them.
 */
const DAY = `${API}/njq-knwu0diqrdup6tya8qxi/lines?size=300&sort=-date&select=date,photovoltaique,eolien,hydraulique,bioenergies,charbon,diesel,turbines_combustion,stockage,total,statut`;
const MIX_FRESH_SECONDS = 4 * 60;
/** The day gives the page its latest line too: read again as often as that line. */
const DAY_FRESH_SECONDS = MIX_FRESH_SECONDS;
const SIGNAL_FRESH_SECONDS = 60 * 60;

export interface Mix {
  date: string;
  total: number;
  photovoltaique: number;
  eolien: number;
  hydraulique: number;
  bioenergies: number;
  charbon: number;
  diesel: number;
  turbines_combustion: number;
  stockage: number;
  statut: string;
}

export interface Hour {
  dateheure: string;
  signal_horaire_texte: string;
  signal_horaire_couleur: string;
  signal_horaire_taux_recharge_conseille: number;
  cyclone_en_cours: boolean;
}

export async function mix(cache: Cache): Promise<Cached<Mix>> {
  return cache.get("edf:mix", MIX_FRESH_SECONDS, async () => {
    const r = await getJson<{ results: (Mix & Record<string, unknown>)[] }>(SOURCE.id, MIX);
    if (!r.results[0]) throw new Error("edf : aucune ligne de production");
    const { _id, _i, _rand, _score, _updatedAt, jour, ...m } = r.results[0];
    return m as Mix;
  });
}

/**
 * The hourly signal, and when EDF last updated its dataset (ISO): EDF's terms ask for that date with the data, as
 * opendata-reunion.edf.fr's portal shows it (« dataUpdatedAt », the lines' Last-Modified).
 */
export interface Signal {
  heures: Hour[];
  mis_a_jour?: string;
}

/** The hours from the start of today (local time) onwards, with the dataset's update, from the same request. */
export async function signal(cache: Cache, now = new Date()): Promise<Cached<Signal>> {
  const c = await cache.get<Signal | Hour[]>("edf:signal", SIGNAL_FRESH_SECONDS, async () => {
    const today = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
    const { bytes, modifie } = await getFile(SOURCE.id, `${SIGNAL}&dateheure_gte=${encodeURIComponent(`${today}T00:00:00+04:00`)}`);
    const r = JSON.parse(new TextDecoder().decode(bytes)) as { results: (Hour & Record<string, unknown>)[] };
    const at = modifie ? Date.parse(modifie) : NaN;
    return { heures: r.results.map((h) => ({
      dateheure: h.dateheure,
      signal_horaire_texte: h.signal_horaire_texte,
      signal_horaire_couleur: h.signal_horaire_couleur,
      signal_horaire_taux_recharge_conseille: h.signal_horaire_taux_recharge_conseille,
      cyclone_en_cours: h.cyclone_en_cours,
    })), ...(!Number.isNaN(at) && { mis_a_jour: new Date(at).toISOString() }) };
  });
  // A copy kept from before the date was read (31/10/2026): the hours alone.
  return Array.isArray(c.value) ? { ...c, value: { heures: c.value } } : (c as Cached<Signal>);
}

/** The last 24 hours of production, oldest first, and when EDF last updated the dataset (ISO, the lines' Last-Modified). */
export interface Journee {
  lignes: Mix[];
  mis_a_jour?: string;
}

/** The latest line of the day, as mix() would read it: the page's copy reads the dataset once for both. */
export function latest(c: Cached<Journee>): Cached<Mix> {
  return { ...c, value: c.value.lignes[c.value.lignes.length - 1] };
}

export async function journee(cache: Cache): Promise<Cached<Journee>> {
  return cache.get("edf:journee", DAY_FRESH_SECONDS, async () => {
    const { bytes, modifie } = await getFile(SOURCE.id, DAY);
    const r = JSON.parse(new TextDecoder().decode(bytes)) as { results: (Mix & Record<string, unknown>)[] };
    if (!r.results.length) throw new Error("edf : aucune ligne de production sur 24 h");
    const at = modifie ? Date.parse(modifie) : NaN;
    // Newest first, so that the latest line is there even if EDF kept more than the request reads; kept oldest first.
    const lignes = [...r.results].reverse().map(({ date, photovoltaique, eolien, hydraulique, bioenergies, charbon, diesel, turbines_combustion, stockage, total, statut }) =>
      ({ date, photovoltaique, eolien, hydraulique, bioenergies, charbon, diesel, turbines_combustion, stockage, total, statut }));
    return { lignes, ...(!Number.isNaN(at) && { mis_a_jour: new Date(at).toISOString() }) };
  });
}

/**
 * rundata.re's own archive of the production (31/10/2026, the user's yes for the charts over 7 and 30 days): EDF keeps
 * 24 hours. Each complete hour of the day's lines, its means, added by the build that has just the day's copy
 * (web/data.ts buildElectricite), at most once an hour, with no more request to EDF, and only with what the scheduled
 * task has left (ARCHIVE_RESERVE): outside its cost, as the OVPF's PDF; a pass that leaves too little leaves it to the
 * next, the day's 24 hours giving a day to catch up. Kept 400 days, for a year's sums from 2027. An hour: its start in hours since 1970 (UTC), then the means of HEURE_CHAMPS, MW to a tenth. About 50
 * bytes an hour, 480 Ko for 400 days, under KV's 25 Mo for a value.
 */
export const ARCHIVE_KEY = "edf:archive";
export const ARCHIVE_JOURS = 400;
export const HEURE_CHAMPS = ["photovoltaique", "eolien", "hydraulique", "bioenergies", "charbon", "diesel", "turbines_combustion", "stockage", "total"] as const;
export type Heure = number[];
export interface Archive {
  heures: Heure[];
}

/**
 * The day's complete hours, oldest first, each the means of its lines: complete when the day has a line after it and
 * at least half of its 12 lines (a gap in EDF's lines leaves the hour out rather than a mean of two).
 */
export function heuresOf(lignes: Mix[]): Heure[] {
  const read = lignes.filter((l) => !Number.isNaN(Date.parse(l.date)) && typeof l.total === "number");
  if (!read.length) return [];
  const end = Math.floor(Math.max(...read.map((l) => Date.parse(l.date))) / 3600_000);
  const by = new Map<number, Mix[]>();
  for (const l of read) {
    const h = Math.floor(Date.parse(l.date) / 3600_000);
    if (h < end) by.set(h, [...(by.get(h) ?? []), l]);
  }
  return [...by].filter(([, ls]) => ls.length >= 6).sort(([a], [b]) => a - b).map(([h, ls]) =>
    [h, ...HEURE_CHAMPS.map((k) => Math.round((ls.reduce((n, l) => n + (typeof l[k] === "number" ? (l[k] as number) : 0), 0) / ls.length) * 10) / 10)]);
}

/** The archive with the new hours, a new one over an older one of the same hour, without what is older than 400 days. */
export function fusion(before: Heure[], nouvelles: Heure[], now: Date): Heure[] {
  const from = Math.floor(now.getTime() / 3600_000) - ARCHIVE_JOURS * 24;
  const by = new Map(before.map((h) => [h[0], h]));
  for (const h of nouvelles) by.set(h[0], h);
  return [...by.values()].filter((h) => h[0] >= from).sort((a, b) => a[0] - b[0]);
}

/** Its read and its write of KV. */
const ARCHIVE_COST = 2;
/**
 * Subrequests left to what comes after the shared copies when they are all due from cold: the planned agendas, the
 * counts of /chiffres and their events, the earthquakes and the ONF's map (112, test/partagees.test.ts), and a little.
 */
const ARCHIVE_RESERVE = 115;

/** The last hour archived by this isolate: the next build of the hour need not read the archive again. */
let archivee = -Infinity;

/**
 * Adds the day's complete hours to the archive when its last hour is missing: a read of KV, and a write once an hour,
 * outside the build's cost (web/data.ts: `unmeasured`). A failure is logged, never thrown: the page's copy is written
 * all the same.
 */
export async function archiver(cache: Cache, j: Journee, now = new Date()): Promise<void> {
  try {
    const nouvelles = heuresOf(j.lignes);
    const last = nouvelles.at(-1)?.[0];
    if (last === undefined || last <= archivee || left() < ARCHIVE_COST + ARCHIVE_RESERVE) return;
    const before = (await cache.kept<Archive>(ARCHIVE_KEY))?.value.heures ?? [];
    if ((before.at(-1)?.[0] ?? -Infinity) < last) await cache.keep(ARCHIVE_KEY, { heures: fusion(before, nouvelles, now) } satisfies Archive, (ARCHIVE_JOURS + 30) * 86_400);
    archivee = last;
  } catch (err) {
    console.error("edf : archive non écrite", err instanceof Error ? err.message : String(err));
  }
}

/** Forgets the last hour archived (the tests: each its own isolate). */
export function oublierArchive(): void {
  archivee = -Infinity;
}

/**
 * EDF SEI's yearly production by filière in La Réunion, MWh (« Production annuelle d'électricité par filière »,
 * 2018 to 2024 on 01/11/2026), and when EDF last updated it: read at most once a day.
 */
const ANNUEL = `${API}/bgsxf72q0jmza3q4ed6qon2n/lines?size=50&sort=annee_prod`;
const ANNUEL_FRESH_SECONDS = 24 * 3600;
export const ANNEE_CHAMPS = ["solaire_photovoltaique", "eolien", "hydraulique", "bioenergie", "charbon", "moteurs_diesel", "turbines_a_combustion_fioul"] as const;
export interface Annee {
  annee: number;
  /** MWh, in the order of ANNEE_CHAMPS. */
  filieres: number[];
  total: number;
  part_enr: number;
}
export interface Annuel {
  annees: Annee[];
  mis_a_jour?: string;
}

export async function annuel(cache: Cache): Promise<Cached<Annuel>> {
  return cache.island("edf:annuel", ANNUEL_FRESH_SECONDS, async () => {
    const { bytes, modifie } = await getFile(SOURCE.id, ANNUEL);
    const r = JSON.parse(new TextDecoder().decode(bytes)) as { results: Record<string, unknown>[] };
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    const annees = r.results.filter((x) => typeof x.annee_prod === "number" && typeof x.total === "number")
      .map((x) => ({ annee: x.annee_prod as number, filieres: ANNEE_CHAMPS.map((k) => n(x[k])), total: x.total as number, part_enr: n(x.part_enr) }))
      .sort((a, b) => a.annee - b.annee);
    if (!annees.length) throw new Error("edf : aucune année de production");
    const at = modifie ? Date.parse(modifie) : NaN;
    return { annees, ...(!Number.isNaN(at) && { mis_a_jour: new Date(at).toISOString() }) };
  });
}
