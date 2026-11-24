/**
 * The files of a worker run one after the other in the same modules (vitest.config.ts, isolate false), and the tests of
 * a file one after the other: the work a test left after its answers (a rebuild handed to `later`, a slow source's read)
 * would go on in the next test, or the next file, its requests on their fetch stub, its lines on their console. Each
 * test, and each file, runs in its own context: at its end, the work handed to `later` in it is waited for, at most
 * `FIN_DE_TEST_MS` for a test (a rebuild on stubbed reads takes a few milliseconds; past it, the work waits for a read
 * that hangs or for fake timers, and would not end in time) and `FIN_DE_FICHIER_MS` for a file (its `beforeAll`'s work);
 * then what is left of it is cut, its reads refused (http.ts `delai`) and its console lines dropped.
 * test/debordement.test.ts checks it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as attendre } from "node:timers/promises";
import { aroundAll, aroundEach } from "vitest";

export interface Fichier {
  travail: Set<Promise<unknown>>;
  /** Aborted once its test or its file is over. */
  signal: AbortSignal;
}

// One for the worker, as console is: this file is run again for each test file, and test/sans-reseau.ts with the
// modules a file loads anew (test/modules-neufs.ts).
const g = globalThis as { fichiers?: AsyncLocalStorage<Fichier>; console: Console };
const fichiers = (g.fichiers ??= new AsyncLocalStorage<Fichier>());

const FICHIER_MS = Number(process.env.FIN_DE_FICHIER_MS ?? 2000);
const TEST_MS = Number(process.env.FIN_DE_TEST_MS ?? 300);
const CONSOLE = new Set(["log", "info", "warn", "error", "debug", "trace"]);
const muet = () => {};
// The lines of work whose test or file is over go nowhere: read at each call, the console a test spies on is its own.
if (!(g.console as Console & { fichiers?: true }).fichiers) {
  g.console = new Proxy(g.console, {
    get: (c, k, r) => (k === "fichiers" ? true : typeof k === "string" && CONSOLE.has(k) && fichiers.getStore()?.signal.aborted ? muet : Reflect.get(c, k, r)),
  });
}

/** Runs `run` in a context of its own, within the file's for a test; waits for its work at its end, then cuts the rest. */
async function apart(run: () => Promise<unknown>, quoi: string, attenteMs: number, dans?: Fichier) {
  const fin = new AbortController();
  const f: Fichier = { travail: new Set(), signal: dans ? AbortSignal.any([dans.signal, fin.signal]) : fin.signal };
  try {
    await fichiers.run(f, run);
  } finally {
    // Work done may hand over more work: waited for too, within the same time.
    const limite = Date.now() + attenteMs;
    while (f.travail.size && Date.now() < limite) {
      const temps = new AbortController();
      await Promise.race([Promise.allSettled([...f.travail]), attendre(limite - Date.now(), undefined, { signal: temps.signal }).catch(() => {})]);
      temps.abort();
    }
    fin.abort(new Error(`travail laissé par ${quoi} déjà fini`));
  }
}

aroundAll((suite) => apart(suite, "un fichier de test", FICHIER_MS));
aroundEach((test) => apart(test, "un test", TEST_MS, fichiers.getStore()));
