import { installer, retirer } from "../src/contexte.js";

/**
 * The Worker's context for a test (src/contexte.ts): its store answers each key from `donnees`, a value or a function
 * giving it (to count a read, or change between reads); any other key is absent. `horsWorker` takes it back.
 */
export function dansLeWorker(donnees: Record<string, unknown> = {}) {
  installer({
    worker: true,
    kv: {
      json: async <T>(cle: string) => {
        const v = donnees[cle];
        return ((typeof v === "function" ? await v() : v) ?? null) as T | null;
      },
    },
  });
}

export const horsWorker = retirer;
