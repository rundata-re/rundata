/**
 * For a test file whose modules differ from the others' (a vi.mock, every source agreed: test/autorisees.ts, the Worker
 * run, which sets the readers of its copies in them), before its imports (test/modules-neufs.test.ts checks it is there):
 *   await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());
 * vitest runs the files one after the other in the same modules (vitest.config.ts, isolate false): this file loads its
 * own, and drops them after it, so that the next file loads them anew, as they are. Without it, a module already loaded
 * by an earlier file would not see this file's vi.mock, and one loaded here would keep it for the files after.
 */
import { afterAll, vi } from "vitest";

export async function modulesNeufs() {
  vi.resetModules();
  // What the setup file sets in the modules (no network, no minute between a site's requests), set again in the new ones.
  await import("./sans-reseau.js");
  afterAll(() => {
    vi.resetModules();
  });
}
