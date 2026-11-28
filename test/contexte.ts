import { contexte, installer, retirer, type Contexte } from "../src/contexte.js";

let installe: Contexte | undefined;
let donneesInstallees: Record<string, unknown> = {};

/**
 * The Worker's context for a test (src/contexte.ts): its store answers each key from `donnees`, a value or a function
 * giving it (to count a read, or change between reads); any other key is absent. A second call adds its keys to the
 * first's, as a module configured after another left the other's reader. `horsWorker` takes it all back.
 */
export function dansLeWorker(donnees: Record<string, unknown> = {}) {
  donneesInstallees = contexte() === installe ? { ...donneesInstallees, ...donnees } : { ...donnees };
  const lues = donneesInstallees;
  installe = {
    worker: true,
    kv: {
      json: async <T>(cle: string) => {
        const v = lues[cle];
        return ((typeof v === "function" ? await v() : v) ?? null) as T | null;
      },
    },
  };
  installer(installe);
}

export function horsWorker() {
  installe = undefined;
  retirer();
}
