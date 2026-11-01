/**
 * The radar's week, kept by rundata.re: Météo-France serves only its latest image and the scheduled event keeps 6 and
 * 24 hours of them (pluie-retro.ts); an image not kept is lost for good. So, once an hour, the radar's run adds the
 * hours just ended to two stores in KV:
 * - each day of La Réunion (UTC+4) in its own key (JOUR_PREFIX), every image of the 6 hours, 5 minutes apart: about
 *   1,15 Mo a day at the most (the evening of 31/10/2026, rain over all the east: about 4 Ko an image), 1,7 Mo with
 *   the lame d'eau in mm each image keeps since 01/11/2026 (pluie-retro.ts), for finer replays and rain totals;
 * - the week, an image an hour (HEURES_KEY), each the strongest rain of its hour in each cell: about 1 Mo at the most,
 *   for /meteo's 7-day replay, which shows it for the hours it holds (rejeu.ts) and the rain gauges before them.
 * At its first run, the 24 hours (an image a quarter of an hour) fill the hours before the 6 hours; a run that cannot
 * write leaves its hours to the next one, while the 6 hours (or the 24 for the hours of the week) still hold them.
 * Its reads and writes of KV are outside the run's cost (`unmeasured`), with what the run has left.
 */
import { count, left } from "../budget.js";
import { endOf, type Entree, type Historique, type Image, isTrou, maxOf, reader, type Store } from "./pluie-retro.js";

export const HEURES_KEY = "radar:7j";
export const JOUR_PREFIX = "radar:j:";
/** The first day of La Réunion with a key: its hours from 07:00, the first run's, taken from the 24 hours. */
export const PREMIER_JOUR = "2026-10-31";
/** A day longer than the week: the first hours of the oldest day are still there when the week starts with it. */
export const TTL_SECONDS = 8 * 86_400;
const HOUR_MS = 3_600_000;
const STEP_MS = 5 * 60_000;
/** The week and its first window of 3 hours (rejeu.ts). */
export const KEEP_MS = (7 * 24 + 3) * HOUR_MS;
/** Its reads and writes of KV at the most: the week's, and two days' when its hours run over midnight. */
export const COST = 6;

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
/** The day of La Réunion an entry ends in: an image that ends at midnight is the day before's last. */
export const jourOf = (e: Entree) => new Date(endOf(e) - 1 + 4 * HOUR_MS).toISOString().slice(0, 10);
const startOf = (e: Entree) => (isTrou(e) ? Date.parse(e.de) : Date.parse(e.de ?? e.fin) - (e.de ? 0 : STEP_MS));

export interface Stores {
  heures: Store;
  jour(date: string): Store;
}

/**
 * What the run knows of the radar, oldest first: the 24 hours (`day`) before the 6 hours start, then the 6 hours
 * (`six`); one size of grid, the 6 hours'.
 */
export function pool(six: Historique, day: Historique | null): Entree[] {
  const first = six.entrees[0];
  if (!first) return [];
  const cut = startOf(first);
  const older = day && day.w === six.w && day.h === six.h ? day.entrees.filter((e) => endOf(e) <= cut) : [];
  return [...older, ...six.entrees];
}

/** The end of the last hour the pool holds whole. */
export const lastHour = (p: Entree[]) => (p.length ? Math.floor(endOf(p[p.length - 1]) / HOUR_MS) * HOUR_MS : -Infinity);

const keptOf = (before: Historique | null, w: number, h: number, now: Date) =>
  before && before.w === w && before.h === h ? before.entrees.filter((e) => endOf(e) > now.getTime() - KEEP_MS) : [];

/** The end of the first hour the week lacks: the one after its last, or the first the pool holds whole; within KEEP_MS. */
export function firstHour(kept: Entree[], p: Entree[], now: Date): number {
  const last = kept[kept.length - 1];
  const from = last ? endOf(last) + HOUR_MS : p.length ? Math.ceil(startOf(p[0]) / HOUR_MS) * HOUR_MS + HOUR_MS : Infinity;
  return Math.max(from, Math.ceil((now.getTime() - KEEP_MS) / HOUR_MS) * HOUR_MS + HOUR_MS);
}

/**
 * The week with the hours of `p` it lacks, up to `upTo`, each the strongest rain of the images that end in it (maxOf),
 * an hour without one a gap; over KEEP_MS old, gone. Undefined when it has them all. Its first hour, the first the pool
 * holds whole.
 */
export function semaine(before: Historique | null, p: Entree[], w: number, h: number, upTo: number, now: Date): Historique | undefined {
  const kept = keptOf(before, w, h, now);
  const start = firstHour(kept, p, now);
  if (start > upTo) return undefined;
  const images = p.filter((e): e is Image => !isTrou(e));
  const cells = reader();
  const out = [...kept];
  for (let end = start; end <= upTo; end += HOUR_MS) {
    const hour = images.filter((x) => Date.parse(x.fin) > end - HOUR_MS && Date.parse(x.fin) <= end);
    const prev = out[out.length - 1];
    if (hour.length) out.push({ fin: iso(end), de: iso(end - HOUR_MS), ...maxOf(hour, w * h, cells) });
    else if (prev && isTrou(prev) && Date.parse(prev.a) >= end - HOUR_MS) prev.a = iso(end);
    else out.push({ trou: true, de: iso(end - HOUR_MS), a: iso(end) });
  }
  return { w, h, entrees: out };
}

/** The day `date` with the entries of `p` that end in it after its last one, up to `upTo`; undefined when none. */
export function jour(before: Historique | null, p: Entree[], date: string, w: number, h: number, upTo: number): Historique | undefined {
  const kept = before && before.w === w && before.h === h ? before.entrees : [];
  const last = kept.length ? endOf(kept[kept.length - 1]) : -Infinity;
  const added = p.filter((e) => jourOf(e) === date && endOf(e) > last && endOf(e) <= upTo);
  return added.length ? { w, h, entrees: [...kept, ...added] } : undefined;
}

/** The last hour this isolate added: the next runs of the hour need not read the week again. */
let added = -Infinity;

/**
 * Adds the hours just ended to the days and to the week: a read and a write of each day they are in, then of the
 * week, at most once an hour, with COST left. A failure is said, never thrown: the next hour tries again.
 */
export async function ajouter(stores: Stores, six: Historique, day: Historique | null, now: Date): Promise<string> {
  const p = pool(six, day);
  const upTo = lastHour(p);
  if (upTo <= added) return "";
  if (left() < COST) return ", semaine : remise, trop peu de sous-requêtes";
  try {
    count();
    const before = await stores.heures.get();
    const week = semaine(before, p, six.w, six.h, upTo, now);
    if (!week) {
      added = upTo;
      return "";
    }
    // The days of the hours added; two at the most (COST), the latest: a day's first minutes lost after a long stop.
    const from = firstHour(keptOf(before, six.w, six.h, now), p, now) - HOUR_MS;
    const days = [...new Set(p.filter((e) => endOf(e) > from && endOf(e) <= upTo).map(jourOf))].slice(-2);
    for (const date of days) {
      const store = stores.jour(date);
      count();
      const next = jour(await store.get(), p, date, six.w, six.h, upTo);
      if (next) {
        count(1, true);
        await store.put(next);
      }
    }
    count(1, true);
    await stores.heures.put(week);
    added = upTo;
    return `, semaine : ${week.entrees.length} heures, jusqu'à ${iso(upTo)}`;
  } catch (err) {
    return `, semaine non écrite (${err instanceof Error ? err.message : String(err)})`;
  }
}

/** Forgets the last hour added (the tests: each its own isolate). */
export function oublier(): void {
  added = -Infinity;
}
