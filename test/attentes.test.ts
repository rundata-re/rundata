import { afterEach, describe, expect, it, vi } from "vitest";
import { attendu, lenteSaid, SLOW_MS, withAttentes } from "../src/attentes.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { snapshot } from "../src/web/data.js";

const NOW = new Date("2026-11-24T08:00:00Z");
const after = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

// A slow view says what it waited for, in one line; a quick one says nothing (worker.ts).
describe("the line of a slow view", () => {
  afterEach(() => vi.useRealTimers());

  it("names the page's copy and the source read for it, the longest first, the one still going said so", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const later: Promise<unknown>[] = [];
    const t = Date.now();
    const view = withAttentes(async () => {
      // A page without a copy, built from a source answering in 1.2 s, and a banner cut at 300 ms.
      const page = snapshot(c, "web:commune:bras-panon", async () => (await c.get("radar:974", 60, () => after(1200, "r"))).value, (p) => later.push(p), NOW, 4000);
      const banner = Promise.race([attendu("vigilance", after(3000, "v")), after(300, null)]);
      return Promise.all([page, banner]);
    });
    await vi.advanceTimersByTimeAsync(1500);
    const { attentes } = await view;
    const line = lenteSaid(Date.now() - t, "/communes/bras-panon", attentes);
    expect(line).toBe("vue lente : 1500 ms (/communes/bras-panon) : vigilance 1500 ms non finie, copie web:commune:bras-panon 1200 ms, radar:974 1200 ms");
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(later);
  });

  it("says nothing up to SLOW_MS", () => {
    expect(lenteSaid(SLOW_MS, "/", new Map())).toBeUndefined();
    expect(lenteSaid(SLOW_MS + 1, "/", new Map())).toBe(`vue lente : ${SLOW_MS + 1} ms (/) : aucune lecture notée`);
  });

  it("notes nothing outside a view, and keeps four waits at most", async () => {
    await expect(attendu("x", Promise.resolve(1))).resolves.toBe(1);
    const { attentes } = await withAttentes(() => Promise.all(["a", "b", "c", "d", "e"].map((k, i) => attendu(k, after(i * 5, k)))));
    expect(lenteSaid(2000, "/p", attentes, Date.now())!.split(", ")).toHaveLength(4);
  });
});
