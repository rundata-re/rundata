import { contexte, installer, retirer, type Bases, type Contexte, type Secrets } from "../src/contexte.js";
import type { KvBinding } from "../src/kv.js";

let installe: Contexte | undefined;
let donneesInstallees: Record<string, unknown> = {};
let secretsInstalles: Secrets = {};
let brutInstalle: KvBinding | undefined;

/**
 * The Worker's context for a test (src/contexte.ts): its store answers each key from `donnees`, a value or a function
 * giving it (to count a read, or change between reads); any other key is absent. `secrets` are the sources' keys (a
 * key given as undefined is taken back). A second call adds its keys and secrets to the first's, as a module configured
 * after another left the other's reader. `horsWorker` takes it all back.
 */
export function dansLeWorker(donnees: Record<string, unknown> = {}, secrets: Secrets = {}) {
  const suite = contexte() === installe;
  donneesInstallees = suite ? { ...donneesInstallees, ...donnees } : { ...donnees };
  secretsInstalles = suite ? { ...secretsInstalles, ...secrets } : { ...secrets };
  if (!suite) brutInstalle = undefined;
  const lues = donneesInstallees;
  const bases = contexte().bases;
  installe = {
    worker: true,
    ...(bases && { bases }),
    ...(brutInstalle && { brut: brutInstalle }),
    secrets: secretsInstalles,
    kv: {
      json: async <T>(cle: string) => {
        const v = lues[cle];
        return ((typeof v === "function" ? await v() : v) ?? null) as T | null;
      },
    },
  };
  installer(installe);
}

/**
 * The store as the modules that count their own reads see it (contexte.ts `brut`), added to the test's context: `brut`
 * answers and records as the test needs.
 */
export function stockageBrut(brut: KvBinding) {
  if (contexte() !== installe) dansLeWorker();
  brutInstalle = brut;
  installe = { ...installe!, brut };
  installer(installe);
}

/**
 * The D1 databases as a test gives them (contexte.ts `bases`), added to the context in place, in the Worker or not: a
 * database given as undefined is taken back. Giving them does not put the other modules in the Worker.
 */
export function bases(donnees: Bases) {
  const avant = contexte();
  const fusion: Bases = { ...avant.bases, ...donnees };
  for (const k of Object.keys(fusion) as (keyof Bases)[]) if (fusion[k] === undefined) delete fusion[k];
  const apres: Contexte = { ...avant, bases: fusion };
  if (avant === installe) installe = apres;
  installer(apres);
}

/** The feedback database's doors as a test gives them, uncounted here (contexte.ts `portesAvis` counts them). */
export interface PortesTest {
  run?: (sql: string, ...params: unknown[]) => Promise<number>;
  all?: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
  batch?: (statements: [sql: string, ...params: unknown[]][]) => Promise<number[]>;
}

/**
 * The feedback database (contexte.ts `bases.avis` and `avisEcriture`) from a test's doors: none given, no database, as
 * the Worker without its binding. Writes given without a batch (or the reverse): the other one fails if it is called.
 */
export function baseAvis(p: PortesTest = {}) {
  const refus = async (): Promise<never> => {
    throw new Error("porte non donnée par le test");
  };
  bases({ avis: p.all && { all: p.all }, avisEcriture: p.run || p.batch ? { run: p.run ?? refus, batch: p.batch ?? refus } : undefined });
}

export function horsWorker() {
  installe = undefined;
  retirer();
}
