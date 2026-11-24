/**
 * The cache entries a tool call read, for the freshness of its answer (tools/citer.ts): when rundata.re read each
 * source, and whether one was served from its last copy because the source did not answer. Noted by the cache
 * (cache.ts) in the context of the call, so that no tool has to say it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { later } from "./budget.js";
import { UpstreamError } from "./types.js";

export interface Lecture {
  key: string;
  fetchedAt: number;
  /** The source failed: this is its last good copy. */
  stale: boolean;
  /** How long the entry is fresh: a day or more means reference data (stations, lists), not a measurement. */
  freshSeconds: number;
  /** For a last copy: the id of the source that did not answer (`SourceInfo.id`), when its error said it. */
  source?: string;
  /** For a last copy: its source did not fail, it was too slow for the answer (`callDeadline`). */
  tardive?: true;
  /** The source the entry was read from (`SourceInfo.id`), when it was one, fresh or not (`withSource`). */
  from?: string;
  /**
   * With `tardive`: a collector's copy in the Worker's KV (cache.ts `getCopy`), not a source read live: the source was
   * not slow, our newer copy of it could not be read again within the answer's time.
   */
  copie?: true;
}

const current = new AsyncLocalStorage<Lecture[]>();
const asked = new AsyncLocalStorage<Set<string>>();
// When the tool call being answered stops waiting for a source that has a copy (`withLectures`), in ms (Date.now).
const until = new AsyncLocalStorage<number>();

/**
 * Runs `fn`, and returns with its value the entries the cache served it. `waitMs`: past that much time from now, a
 * source with a copy is no longer waited for: its copy is served, said as such, and its read ends after the answer
 * (cache.ts).
 */
export async function withLectures<T>(fn: () => Promise<T>, waitMs?: number): Promise<{ value: T; lectures: Lecture[] }> {
  const lectures: Lecture[] = [];
  const run = () => current.run(lectures, fn);
  const value = await (waitMs == null ? run() : until.run(Date.now() + waitMs, run));
  return { value, lectures };
}

/** When the tool call being answered stops waiting for a source that has a copy; nothing outside one that set it. */
export const callDeadline = () => until.getStore();

/**
 * In a tool call, a source read without a copy is waited for this long past the call's deadline for copies (5 s): 8 s in
 * all. Past it, the read is said not answered and ends after the answer, stored for the next question. 22/11/2026: the
 * ARS's site silent, its two tries (8 then 12 s) waited for, qualite_eau answered in 20 and 28 s, the assistants gone
 * before it; 21/11/2026: three fiche_terrain calls in a row, 19,5 to 19,9 s, on sources without a copy.
 */
export const PAST_DEADLINE_MS = 3_000;
/**
 * With `shared`, the least a read started past the shared end is given: enough for a copy in the Worker's KV (a few ms),
 * not for a source.
 */
const SHARED_FLOOR_MS = 500;

/** A source read without a copy, not answered within `bounded`'s time: its read goes on after the answer. */
export class LectureTardive extends UpstreamError {
  constructor(source: string, public ms: number) {
    super(source, `pas de réponse en ${Math.round(ms / 1000)} s, lecture poursuivie après la réponse`);
  }
}

/**
 * `read` within a tool call: waited for until `PAST_DEADLINE_MS` past the call's deadline (`callDeadline`), a read
 * started after it `PAST_DEADLINE_MS` more; past that, `LectureTardive`, and the read ends after the answer. With
 * `shared`, every read of the call ends at the same time, the deadline plus `PAST_DEADLINE_MS`, however late it starts: a
 * read that waits on another (an address, then its parcel) is not given 3 s more each (tools/terrain.ts). Outside a tool
 * call (the island's copy, a page, a summary brought up to date apart), `read` is waited for as long as it takes.
 */
export async function bounded<T>(source: string, read: Promise<T>, shared = false): Promise<T> {
  const end = callDeadline();
  if (end == null) return read;
  const left = end - Date.now();
  const ms = shared ? Math.max(SHARED_FLOOR_MS, left + PAST_DEADLINE_MS) : Math.max(0, left) + PAST_DEADLINE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new LectureTardive(source, ms)), ms)));
  try {
    return await Promise.race([read, late]);
  } catch (err) {
    later(read.catch(() => undefined));
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs `fn` apart from the tool call being answered: a copy brought up to date after the answer (tools/resume.ts). What
 * it reads never dates the answer, and it waits for its sources as long as it needs, not the answer's time. On
 * 31/10/2026 the summary of Le Tampon said « il y a 21 h » while its parts were minutes old.
 */
export const apart = <T>(fn: () => T): T => until.run(undefined as unknown as number, () => current.run([], fn));

/**
 * Runs `fn` within the tool call being answered, its sources waited for as long as the call waits, but without noting
 * what it reads: a read that only helps the answer and says nothing of its data (providers/openmeteo.ts, the time of
 * the model's run). From 13 to 16/11/2026 that file's copy, 90 h old, dated forecasts read minutes before.
 */
export const unnoted = <T>(fn: () => T): T => current.run([], fn);

/** Called by the cache for each entry it serves; nothing outside a tool call. */
export function noteLecture(l: Lecture) {
  current.getStore()?.push(l);
}

/** Runs `fn` (a cache load), and returns with its value the source it asked, when it asked one and only one. */
export async function withSource<T>(fn: () => Promise<T>): Promise<{ value: T; from?: string }> {
  const ids = new Set<string>();
  const value = await asked.run(ids, fn);
  return { value, ...(ids.size === 1 && { from: [...ids][0] }) };
}

/** Called by http.ts for each source asked; nothing outside a cache load. */
export function noteSource(id: string) {
  asked.getStore()?.add(id);
}
