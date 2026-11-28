import { contexte, installer, retirer, type Bases, type Contexte, type Fichiers, type Navigateur, type Secrets } from "../src/contexte.js";
import type { KvBinding } from "../src/kv.js";
import type { Credentials } from "../src/providers/mf-auth.js";
import type { Store } from "../src/providers/vigilance-carte.js";

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
  secretsInstalles = suite ? { ...secretsInstalles, ...secrets } : { ...contexte().secrets, ...secrets };
  if (!suite) brutInstalle = contexte().brut;
  const lues = donneesInstallees;
  const { bases, navigateur, fichiers } = contexte();
  installe = {
    worker: true,
    ...(bases && { bases }),
    ...(navigateur && { navigateur }),
    ...(fichiers && { fichiers }),
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

/** Some of the context's parts changed in place, in the Worker or not: a part given as undefined is taken back. */
function enPlace(parts: Partial<Contexte>) {
  const avant = contexte();
  const apres: Contexte = { ...avant, ...parts };
  for (const k of Object.keys(parts) as (keyof Contexte)[]) if (parts[k] === undefined) delete apres[k];
  if (avant === installe) installe = apres;
  installer(apres);
}

/**
 * The maps' store and browser (contexte.ts `brut` and `navigateur`, read by providers/vigilance-carte.ts and the RSMC's
 * maps) from a test's `Store`, a new store each call, as each `configure` gave before; none given, both taken back.
 * Giving them does not put the other modules in the Worker.
 */
export function cartes(kv?: Store, navigateur?: Navigateur) {
  const brut: KvBinding | undefined = kv && {
    get: ((cle: string, type: "json" | "arrayBuffer") => (type === "json" ? kv.json(cle) : kv.bytes(cle))) as KvBinding["get"],
    put: (cle, valeur, options) => kv.put(cle, valeur, options?.expirationTtl),
  };
  if (contexte() === installe) brutInstalle = brut;
  enPlace({ brut, navigateur });
}

/**
 * The Worker's secrets as a test gives them (contexte.ts `secret`), added to the context's in place, in the Worker or
 * not: a secret given as undefined is taken back. Giving them does not put the other modules in the Worker.
 */
export function cles(s: Secrets) {
  const fusion: Secrets = { ...contexte().secrets, ...s };
  for (const k of Object.keys(fusion) as (keyof Secrets)[]) if (fusion[k] === undefined) delete fusion[k];
  if (contexte() === installe) secretsInstalles = fusion;
  enPlace({ secrets: fusion });
}

/** Météo-France's portal keys as a test gives them, as `configure` took them before: the ones not given taken back. */
export function meteoFrance(c: Credentials = {}) {
  cles({ meteofranceApplication: c.applicationId, meteofranceCle: c.apiKey, meteofranceJeton: c.token });
}

/** The store as the modules that count their own reads see it (contexte.ts `brut`), in place; none given, taken back. */
export function brutEnPlace(brut?: KvBinding) {
  if (contexte() === installe) brutInstalle = brut;
  enPlace({ brut });
}

/** The site's static files as a test gives them (contexte.ts `fichiers`); none given, taken back. */
export function fichiers(f?: Fichiers) {
  enPlace({ fichiers: f });
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
