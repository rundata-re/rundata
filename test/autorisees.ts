/**
 * src/providers/autorisations.ts as if every source had agreed, the communes, the halls and the sports sites: their sites
 * read, for the tests of their readers. What is said while none has agreed: test/autorisations.test.ts.
 *
 * In a test file, before its imports:
 *   await vi.hoisted(async () => (await import("./autorisees.js")).chargeesToutesAccordees());
 * Its modules are loaded anew with every source agreed, and dropped after it (test/modules-neufs.ts). Never a vi.mock of
 * the module, nor a setting left on: what is made from it when a module loads (AGENDAS…) or once (the count of the
 * sources in the footer) would be that of the first file to make it.
 */
import { afterAll } from "vitest";
import { modulesNeufs } from "./modules-neufs.js";

export async function chargeesToutesAccordees() {
  await modulesNeufs();
  const fraiches = await import("../src/providers/autorisations.js");
  fraiches.accorderToutes(true);
  afterAll(() => fraiches.accorderToutes(false));
}
