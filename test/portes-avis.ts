/**
 * The modules that write in the feedback database, given their doors as a test did when each module had its own
 * `configure` (test/contexte.ts `baseAvis`): the database is one, so the last call's doors are every module's.
 */
import * as avis from "../src/avis.js";
import * as espace from "../src/clubs/espace.js";
import * as connexions from "../src/connecteurs/connexions.js";
import * as propositions from "../src/propositions.js";
import * as abonnements from "../src/push/abonnements.js";
import { baseAvis, type PortesTest } from "./contexte.js";

type Run = NonNullable<PortesTest["run"]>;
type All = NonNullable<PortesTest["all"]>;
type Batch = NonNullable<PortesTest["batch"]>;

export function donnerAvis(run?: Run, sel?: string) {
  baseAvis({ run });
  avis.configure(sel);
}

export function donnerPropositions(run?: Run, envoi?: propositions.Envoi, all?: All) {
  baseAvis({ run, all });
  propositions.configure(envoi);
}

export function donnerAbonnements(run?: Run, all?: All, vapid?: Parameters<typeof abonnements.configure>[0]) {
  baseAvis({ run, all });
  abonnements.configure(vapid);
}

export function donnerConnexions(run?: Run, all?: All, envoi?: propositions.Envoi, batch?: Batch) {
  baseAvis({ run, all, batch });
  connexions.configure(envoi);
}

export function donnerEspace(run?: Run, all?: All, envoi?: propositions.Envoi) {
  baseAvis({ run, all });
  espace.configure(envoi);
}

/** sans-reponse.ts's batch takes its statements as { sql, params }, and says nothing back. */
export function donnerSansReponse(run?: Run, all?: All, batch?: (statements: { sql: string; params: unknown[] }[]) => Promise<void>) {
  baseAvis({ run, all, batch: batch && (async (st) => (await batch(st.map(([sql, ...params]) => ({ sql, params }))), st.map(() => 0))) });
}
