import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type CacheEntry, MemoryStore } from "../src/cache.js";
import { ISLAND_ALONE_MS, ISLAND_PAGES, ISLAND_PEEK_MS, snapshot, WAIT_MS } from "../src/web/data.js";
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

  // 19 to 21/11/2026: 8 % of the views of /aujourdhui/<commune> past 3 s, each a whole build of web:lieu where its data
  // center had no copy, KV having one of the current revision 4 to 36 minutes old.
  it("waits for KV longer when the data center has no copy at all: a person gets the island's, nothing built before", async () => {
    vi.useFakeTimers({ now: T0 });
    class SlowKv extends MemoryStore {
      constructor(private ms: number) {
        super();
      }
      async get(key: string, freshAfter?: number) {
        await new Promise((resolve) => setTimeout(resolve, this.ms));
        return super.get(key, freshAfter);
      }
    }
    expect(ISLAND_ALONE_MS).toBeGreaterThan(ISLAND_PEEK_MS);
    expect(ISLAND_ALONE_MS).toBeLessThan(WAIT_MS);
    const kv = new SlowKv(1200);
    await kv.put("lecture:web:lieu:saint-andre", { value: { construite: "ailleurs" }, fetchedAt: T0 - 20 * MIN });
    const c = new Cache(new MemoryStore(), () => T0, false, kv);
    let builds = 0;
    const build = () => new Promise((resolve) => setTimeout(() => resolve({ construite: ++builds }), 6000));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let got: unknown;
    void snapshot(c, "web:lieu:saint-andre", build, () => {}, new Date(T0)).then((r) => (got = r?.value));
    await vi.advanceTimersByTimeAsync(1200);
    expect(got).toEqual({ construite: "ailleurs" });
    expect(log.mock.calls.map((x) => String(x[0]))).toContain(
      `copie de l'île lue en 1200 ms : web:lieu:saint-andre, servie, aucune copie au centre de données, attente ${ISLAND_ALONE_MS} ms`);
    log.mockRestore();
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it("still waits for KV ISLAND_PEEK_MS only when the data center has a copy, and says when KV answered", async () => {
    vi.useFakeTimers({ now: T0 });
    class SlowKv extends MemoryStore {
      async get(key: string, freshAfter?: number) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return super.get(key, freshAfter);
      }
    }
    const kv = new SlowKv();
    await kv.put("lecture:web:lieu:saint-andre", { value: { construite: "ailleurs" }, fetchedAt: T0 - MIN });
    const memory = new MemoryStore();
    await memory.put("web:lieu:saint-andre", { value: { construite: "ici" }, fetchedAt: T0 - 20 * MIN });
    const c = new Cache(memory, () => T0, false, kv);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let got: unknown;
    void snapshot(c, "web:lieu:saint-andre", async () => ({ construite: "neuve" }), () => {}, new Date(T0)).then((r) => (got = r?.value));
    await vi.advanceTimersByTimeAsync(ISLAND_PEEK_MS);
    expect(got).toEqual({ construite: "ici" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.mock.calls.map((x) => String(x[0]))).toContain(
      `copie de l'île lue en 1200 ms : web:lieu:saint-andre, arrivée trop tard, copie du centre de données là, attente ${ISLAND_PEEK_MS} ms`);
    log.mockRestore();
  });

  it("keeps the other pages' copies in the data center, out of KV", async () => {
    const kv = new Kv();
    const c = new Cache(new MemoryStore(), () => T0, false, kv);
    await snapshot(c, "web:mer", async () => ({ mer: 1 }), () => {}, new Date(T0));
    expect(kv.writes).toBe(0);
  });
});

// From 17 to 20/11/2026, OAI-SearchBot read /communes/<commune> 65 times, 41 past 2 s: whole builds where its data
// center had no copy.
describe("the pages of the communes, one copy for the island (web/data.ts ISLAND_PAGES)", () => {
  it("are the 24 communes' own copies and their weather's, nothing else", async () => {
    const { PAGES } = await import("../src/web/places.js");
    const communes = PAGES.filter((p) => p.commune);
    expect(communes).toHaveLength(24);
    for (const p of communes) expect([ISLAND_PAGES.has(`web:commune:${p.slug}`), ISLAND_PAGES.has(`web:lieu:${p.slug}`)]).toEqual([true, true]);
    expect(ISLAND_PAGES.size).toBe(49);
    // A place that is not a commune keeps its copy in its data center.
    const quartier = PAGES.find((p) => !p.commune)!;
    expect(ISLAND_PAGES.has(`web:lieu:${quartier.slug}`)).toBe(false);
  });

  it("are never built by the scheduled event: some 80 subrequests each, of its 600", async () => {
    const { SHARED, SHARED_AFTER } = await import("../src/web/partagees.js");
    const scheduled = [...SHARED, ...SHARED_AFTER].map((s) => s.key);
    expect(scheduled.filter((k) => ISLAND_PAGES.has(k) && k !== "web:meteo")).toEqual([]);
    expect(scheduled.filter((k) => /^web:(commune|lieu):/.test(k))).toEqual([]);
  });

  it("cost at most one KV write per key every 5 minutes: 423 360 a month, under half the 1 million included", async () => {
    const { islandPagesMonth, KV_WRITES_INCLUDED } = await import("../src/registre.js");
    expect(islandPagesMonth()).toBe(49 * 288 * 30);
    expect(islandPagesMonth()).toBeLessThan(KV_WRITES_INCLUDED / 2);
  });

  it("serve the copy another data center built, and write KV once per key in 5 minutes, two builds or not", async () => {
    const kv = new Kv();
    const clock = { t: T0 };
    const center = (memory = new MemoryStore()) => new Cache(memory, () => clock.t, false, kv);
    let builds = 0;
    const build = async () => ({ construite: ++builds });
    const key = "web:commune:bras-panon";

    await snapshot(center(), key, build, () => {}, new Date(clock.t));
    expect([builds, kv.writes]).toEqual([1, 1]);
    // Another data center, a minute later: the copy of the first, nothing built.
    clock.t += MIN;
    expect((await snapshot(center(), key, build, () => {}, new Date(clock.t)))?.value).toEqual({ construite: 1 });
    expect(builds).toBe(1);

    // Two data centers that each build it within the 5 minutes (a copy of another revision, say): KV written once.
    const other = new Cache(new MemoryStore(), () => clock.t, false, kv);
    await other.getFrom(key, undefined, 0, build, 5 * 60);
    expect([builds, kv.writes]).toEqual([2, 1]);
    // Past the 5 minutes, the next build is written.
    clock.t += 5 * MIN;
    await other.getFrom(key, undefined, 0, build, 5 * 60);
    expect([builds, kv.writes]).toEqual([3, 2]);
  });
});
