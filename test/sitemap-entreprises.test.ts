import { describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";

// /entreprises once announced: DISCRETE false (web/entreprises.ts). While it is true: test/sitemap-liste.test.ts.
vi.mock("../src/web/entreprises.js", async () => ({ ...(await vi.importActual<object>("../src/web/entreprises.js")), DISCRETE: false }));
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

describe("the sitemap once /entreprises is announced", () => {
  it("holds /entreprises", async () => {
    const xml = await (await handle(new Request("https://rundata.re/sitemap.xml"), new Cache(new MemoryStore()))).text();
    expect(xml).toContain("<loc>https://rundata.re/entreprises</loc>");
  });
});
