import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The files of a worker share their modules (vitest.config.ts, isolate false). A file that changes them for itself loads
 * its own and drops them after it (test/modules-neufs.ts): one with a vi.mock, one that runs the Worker, which sets
 * the readers of its copies in the modules at each request (worker.ts), and one that checks the footer's count of
 * sources, counted once per process. Without that line, what it changed would stay
 * for the files run after it, and a test would pass or fail by the order of the files.
 */
describe("a test file that changes its modules", () => {
  it("loads its own, and drops them after it", () => {
    const dir = new URL("./", import.meta.url);
    const sans = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .filter((f) => {
        const s = readFileSync(new URL(f, dir), "utf8");
        // The footer's count of sources is counted once per process (web/pages.ts), with the readers set then.
        const change = /^\s*vi\.mock\(/m.test(s) || /from "\.\.\/src\/worker\.js"/.test(s) || /sources publiques<\/a>/.test(s);
        return change && !/\.(modulesNeufs|chargeesToutesAccordees)\(\)\);$/m.test(s);
      });
    expect(sans).toEqual([]);
  });

  it("forgets, when it refreshes the shared copies, what an earlier file wrote to KV (web/partagees.ts, as an isolate keeps it)", () => {
    const dir = new URL("./", import.meta.url);
    const sans = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .filter((f) => {
        const s = readFileSync(new URL(f, dir), "utf8");
        return /\bwarmShared\(/.test(s) && !/^before(All|Each)\(oublierEcritures\);$/m.test(s) && !/\.modulesNeufs\(\)\);$/m.test(s);
      });
    expect(sans).toEqual([]);
  });
});
