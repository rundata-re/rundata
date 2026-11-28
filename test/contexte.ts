import { contexte, installer, retirer, type Contexte, type Secrets } from "../src/contexte.js";
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
  installe = {
    worker: true,
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

export function horsWorker() {
  installe = undefined;
  retirer();
}
