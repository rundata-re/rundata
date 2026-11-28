/**
 * What the Worker gives the modules, built once per isolate (worker.ts `setup`) instead of a `configure` per module: a
 * module that reads the store asks it here at the time of the read, so no order of calls counts and none is forgotten.
 *
 * Outside the Worker (a local server, the tests) `worker` is false and there is no store, and each module does what it
 * did when it was not configured; a local server gives only the databases it has a copy of (src/bin/http.ts). A test gives its data by `installer` and takes it back by
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
  /** The D1 databases the Worker has (on Node, the local copies src/bin/http.ts is given). */
  bases?: Bases;
}

/** A D1 database's reads as the modules make them: the rows of a query. Not counted here: each module counts its own. */
export interface Lecture {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

/** The databases, each by what it holds. */
export interface Bases {
  /** The bus timetables (binding TRANSIT). */
  transit?: Lecture;
  /** The daily weather measurements since 1900, and the sea's history (binding CLIMAT). */
  climat?: Lecture;
  /** The hourly weather measurements since 2000 (binding CLIMAT_H). */
  climatHoraire?: Lecture;
  /** The feedback, the clubs' proposals and the declared associations (binding AVIS). */
  avis?: Lecture;
  /**
   * The same database's writes: only for the modules that write there (the feedback, the proposals, the alerts'
   * subscriptions, the associations' links, the clubs' space, the sites that do not answer), through `portesAvis` or
   * counting their own calls. Not counted here.
   */
  avisEcriture?: Ecriture;
}

/** A D1 database's writes: a statement's rows changed, or several statements in one call, in one transaction. */
export interface Ecriture {
  run(sql: string, ...params: unknown[]): Promise<number>;
  batch(statements: [sql: string, ...params: unknown[]][]): Promise<number[]>;
}

/** The feedback database's doors as the modules that write there use them, each absent without its binding. */
export interface PortesAvis {
  run?: (sql: string, ...params: unknown[]) => Promise<number>;
  all?: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
  batch?: (statements: [sql: string, ...params: unknown[]][]) => Promise<number[]>;
}

/**
 * The feedback database (AVIS), each call counted when it is made, as every call to a bound service (an invocation's
 * calls to them are limited together, budget.ts): a write in the room kept for them, a read in the common one.
 */
export function portesAvis(): PortesAvis {
  const lecture = courant.bases?.avis;
  const ecriture = courant.bases?.avisEcriture;
  return {
    run: ecriture && (async (sql, ...params) => (count(1, true), await ecriture.run(sql, ...params))),
    all: lecture && (async <T>(sql: string, ...params: unknown[]) => (count(), await lecture.all<T>(sql, ...params))),
    batch: ecriture && (async (statements) => (count(1, true), await ecriture.batch(statements))),
  };
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
