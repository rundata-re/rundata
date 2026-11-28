/**
 * What the Worker gives the modules, built once per isolate (worker.ts `setup`) instead of a `configure` per module: a
 * module that reads the store asks it here at the time of the read, so no order of calls counts and none is forgotten.
 *
 * Outside the Worker (a local server, the tests) nothing is installed: `worker` is false and there is no store, and each
 * module does what it did when it was not configured. A test gives its data by `installer` and takes it back by
 * `retirer` (test/contexte.ts).
 */
import { count } from "./budget.js";
import type { KvBinding } from "./kv.js";

/** The KV store as the modules read it: a JSON value, or null when the key is absent. Each read is a counted subrequest. */
export interface Stockage {
  json<T>(cle: string): Promise<T | null>;
}

export interface Contexte {
  /** Whether this runs in the Worker: some modules never read their source there, even without a store. */
  worker: boolean;
  /** The store, when the Worker has its binding. */
  kv?: Stockage;
  /**
   * The same store, its reads not counted here: only for a module that counts each of its reads and writes itself, with
   * the kind it needs (budget.ts `count`), or that writes.
   */
  brut?: KvBinding;
  /** The keys of the sources that ask for one, given only with the store (the state they read is kept there). */
  secrets?: Secrets;
}

/** A source's key as the Worker's secret holds it; never written in a log or an answer. */
export interface Secrets {
  /** The Candhis API's key (CANDHIS_API_KEY), for the buoys. */
  candhis?: string;
  /** The token SolarDB sent (SOLARDB_JETON), for the UV index measured at Moufia. */
  solardb?: string;
}

/** A secret of the context, without its spaces; undefined when it is not given or empty. */
export function secret(nom: keyof Secrets): string | undefined {
  return courant.secrets?.[nom]?.trim() || undefined;
}

const HORS_WORKER: Contexte = Object.freeze({ worker: false });

let courant: Contexte = HORS_WORKER;

export function contexte(): Contexte {
  return courant;
}

export function installer(c: Contexte) {
  courant = c;
}

export function retirer() {
  courant = HORS_WORKER;
}

/** The Worker's store binding as a `Stockage`, its reads counted. */
export function stockageKv(kv: { get(cle: string, type: "json"): Promise<unknown> }): Stockage {
  return {
    json: async <T>(cle: string) => {
      count();
      return (await kv.get(cle, "json")) as T | null;
    },
  };
}
