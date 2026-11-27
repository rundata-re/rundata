/**
 * The bundle of the agendas read by the scheduled event only (`planifie`, providers/agenda.ts), in KV, written by
 * `refreshPlanned` (tools/agenda.ts) once per invocation at most. Its own module so that the water's notices
 * (providers/avis-eau.ts) read it without importing the agendas, which import them.
 */
import type { Cache } from "../cache.js";

// Those of the agendas read by the scheduled event (`planifie`), in KV, written by it only: it runs in any data center,
// and the questions are answered in all of them (in the data center's cache, its copies were seen only where it ran).
export const PLANIFIES = "agendas:planifies";

/** The copies of the agendas read by the scheduled event: one read of KV per isolate and per minute at most. */
export const planifiees = (cache: Pick<Cache, "bundle">) => cache.bundle(PLANIFIES, 60, true);

/**
 * Saint-Joseph's feed of news is read once an hour, for its news (agenda.ts) and for Sudéau's notices it posts
 * (avis-eau.ts): one read, two parses (27/11/2026). Before, the notices read it again every quarter of an hour, four
 * times as many requests to a site that answered 522 to the Worker (and 200 elsewhere). The notices it held are kept
 * in the bundle under this key, with the time of that read.
 */
export const AVIS_SAINT_JOSEPH = "avis:saint_joseph";
