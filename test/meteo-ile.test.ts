import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type CacheEntry, MemoryStore } from "../src/cache.js";
import { ISLAND_PAGES, ISLAND_PEEK_MS, snapshot } from "../src/web/data.js";
import { HOME_READER_WAIT_MS, homeWaits } from "../src/web/site.js";

const T0 = Date.parse("2026-11-07T03:18:00Z");
const MIN = 60_000;
const CHATGPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
const reader = homeWaits(new Request("https://rundata.re/", { headers: { "user-agent": CHATGPT } }));

/** KV, counting its writes. */
class Kv extends MemoryStore {
  writes = 0;
  async put(key: string, entry: CacheEntry) {
    this.writes++;
    await super.put(key, entry);
  }
}

// 07/11/2026, 03:18 UTC: three reads of / in the same second were given the weather 204, 1 344 and 1 344 min old, each
// data center serving its own copy, built again after the view in that data center only.
describe("the weather of / and /meteo, one copy for the island (web/data.ts ISLAND_PAGES)", () => {
  it("serves a data center seldom asked the copy built last in another, and builds it again for all of them", async () => {
    expect(ISLAND_PAGES.has("web:meteo")).toBe(true);
    const kv = new Kv();
    const clock = { t: T0 };
    // Each data center its own memory and cache, all of them the same KV.
    const center = (memory = new MemoryStore()) => new Cache(memory, () => clock.t, false, kv);
    const seldom = new MemoryStore();
    await seldom.put("web:meteo", { value: { construite: "la veille" }, fetchedAt: T0 - 1344 * MIN });
    let builds = 0;
    const build = async () => ({ construite: ++builds });
    const behind: Promise<unknown>[] = [];
    const later = (p: Promise<unknown>) => behind.push(p);

    await snapshot(center(), "web:meteo", build, later, new Date(clock.t));
    expect(builds).toBe(1);
    expect(kv.writes).toBe(1);

    // A minute later, the data center that had the day before's: the island's copy, a minute old, nothing built.
    clock.t += MIN;
    const got = await snapshot(center(seldom), "web:meteo", build, later, new Date(clock.t), reader.meteo, reader.reader);
    expect(got).toMatchObject({ value: { construite: 1 }, fetchedAt: new Date(T0) });
    expect(builds).toBe(1);
    // Put in its own stores: its next view does not ask KV again.
    expect((await seldom.get("web:meteo"))?.fetchedAt).toBe(T0);

    // Past FRESH_SECONDS: built again (within the reader's 800 ms here), and the new one is the island's.
    clock.t += 5 * MIN;
    const old = await snapshot(center(seldom), "web:meteo", build, later, new Date(clock.t), reader.meteo, reader.reader);
    await Promise.all(behind);
    expect(old?.value).toEqual({ construite: 2 });
    expect(builds).toBe(2);
    expect(kv.writes).toBe(2);
    const third = await snapshot(center(), "web:meteo", build, later, new Date(clock.t + MIN));
    expect(third?.value).toEqual({ construite: 2 });
    expect(builds).toBe(2);
  });

  afterEach(() => vi.useRealTimers());

  it("waits for KV 300 ms at most: past it, the data center's copy, within the reader's 800 ms in all", async () => {
    vi.useFakeTimers({ now: T0 });
    // A KV that takes 5 s to answer (a read slower than a tool call's time, 09/11/2026), a build of 3 s.
    class SlowKv extends MemoryStore {
      async get(key: string, freshAfter?: number) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return super.get(key, freshAfter);
      }
    }
    const kv = new SlowKv();
    await kv.put("lecture:web:meteo", { value: { construite: "ailleurs" }, fetchedAt: T0 - MIN });
    const memory = new MemoryStore();
    await memory.put("web:meteo", { value: { construite: "ici" }, fetchedAt: T0 - 20 * MIN });
    const c = new Cache(memory, () => T0, false, kv);
    const build = () => new Promise((resolve) => setTimeout(() => resolve({ construite: "neuve" }), 3000));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let got: unknown;
    void snapshot(c, "web:meteo", build, () => {}, new Date(T0), reader.meteo, reader.reader).then((r) => (got = r?.value));
    await vi.advanceTimersByTimeAsync(ISLAND_PEEK_MS);
    expect(got).toBeUndefined();
    await vi.advanceTimersByTimeAsync(HOME_READER_WAIT_MS - ISLAND_PEEK_MS);
    expect(got).toEqual({ construite: "ici" });
    log.mockRestore();
    await vi.advanceTimersByTimeAsync(5000);
  });

  it("keeps the other pages' copies in the data center, out of KV", async () => {
    const kv = new Kv();
    const c = new Cache(new MemoryStore(), () => T0, false, kv);
    await snapshot(c, "web:mer", async () => ({ mer: 1 }), () => {}, new Date(T0));
    expect(kv.writes).toBe(0);
  });
});
