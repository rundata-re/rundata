// No test reaches the network: fetch throws, as it does offline, unless a test stubs its own. Assigned, not
// vi.stubGlobal: vi.unstubAllGlobals() after a test's own stub puts this one back, never the real fetch.
globalThis.fetch = async (input: string | URL | Request) => {
  throw new TypeError(`network refused in tests: ${input instanceof Request ? input.url : String(input)}`);
};

// The scheduled event's requests to one commune's site go a minute apart (http.ts `siteSpacing`): at once in the tests,
// which would otherwise wait for it; test/rythme-sites.test.ts sets the minute back to check it.
import { siteSpacing } from "../src/http.js";
siteSpacing.ms = 0;

// The work each test and each test file hand to `later` and the cut of what they left (test/fin-de-fichier.ts), told to
// these modules.
import { finDeFichier } from "../src/budget.js";
import type { AsyncLocalStorage } from "node:async_hooks";
import type { Fichier } from "./fin-de-fichier.js";
const fichiers = (globalThis as { fichiers?: AsyncLocalStorage<Fichier> }).fichiers;
finDeFichier.suivre = (work) => {
  const f = fichiers?.getStore();
  if (!f) return;
  f.travail.add(work);
  const fait = () => f.travail.delete(work);
  work.then(fait, fait);
};
finDeFichier.coupure = () => fichiers?.getStore()?.signal;
