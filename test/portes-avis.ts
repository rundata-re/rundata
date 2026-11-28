/**
 * The modules that write in the feedback database, given their doors as a test did when each module had its own
 * `configure` (test/contexte.ts `baseAvis`): the database is one, so the last call's doors are every module's.
 */
import * as avis from "../src/avis.js";
import type { Envoi } from "../src/contexte.js";
import { baseAvis, cles, courriel, type PortesTest } from "./contexte.js";

type Run = NonNullable<PortesTest["run"]>;
type All = NonNullable<PortesTest["all"]>;
type Batch = NonNullable<PortesTest["batch"]>;

export function donnerAvis(run?: Run, sel?: string) {
  baseAvis({ run });
  cles({ selAvis: sel });
}

export function donnerPropositions(run?: Run, envoi?: Envoi, all?: All) {
  baseAvis({ run, all });
  courriel(envoi);
}

/** `vapid`: the secret VAPID_PRIVE, a P-256 JWK. */
export function donnerAbonnements(run?: Run, all?: All, vapid?: string) {
  baseAvis({ run, all });
  cles({ vapid });
}

export function donnerConnexions(run?: Run, all?: All, envoi?: Envoi, batch?: Batch) {
  baseAvis({ run, all, batch });
  courriel(envoi);
}

export function donnerEspace(run?: Run, all?: All, envoi?: Envoi) {
  baseAvis({ run, all });
  courriel(envoi);
}

/** sans-reponse.ts's batch takes its statements as { sql, params }, and says nothing back. */
export function donnerSansReponse(run?: Run, all?: All, batch?: (statements: { sql: string; params: unknown[] }[]) => Promise<void>) {
  baseAvis({ run, all, batch: batch && (async (st) => (await batch(st.map(([sql, ...params]) => ({ sql, params }))), st.map(() => 0))) });
}
