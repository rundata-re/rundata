import { describe, expect, it, vi } from "vitest";
import { count, counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";

// Its mocks its own: loaded for this file, dropped after it (test/modules-neufs.ts).
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

// The builds, counted: each takes 30 subrequests, as a read of its sources would.
const built: string[] = [];
vi.mock("../src/web/data.js", async (original) => ({
  ...(await original<typeof import("../src/web/data.js")>()),
  buildPlace: async (_c: unknown, p: { slug: string }) => (built.push(`lieu:${p.slug}`), count(30), { lieu: p.slug }),
  buildCommune: async (_c: unknown, p: { slug: string }) => (built.push(`commune:${p.slug}`), count(30), { commune: p.slug }),
}));
const { minuit, minuitDu, MINUIT_BUDGET, MINUIT_PAR_PASSAGE, minuitSaid } = await import("../src/web/minuit.js");
const { COMMUNES } = await import("../src/web/commune.js");

// 25/11/2026 at 00:05 in La Réunion; the copies made at 23:50 the day before.
const NOW = new Date("2026-11-24T20:05:00Z");
const VEILLE = new Date("2026-11-24T19:50:00Z").getTime();

async function veille() {
  const store = new MemoryStore();
  for (const p of COMMUNES) for (const k of [`web:lieu:${p.slug}`, `web:commune:${p.slug}`]) await store.put(k, { value: {}, fetchedAt: VEILLE });
  return { store, cache: new Cache(store, () => NOW.getTime()) };
}

describe("the communes' copies built again after midnight", () => {
  it("builds MINUIT_PAR_PASSAGE communes an event at most, the next event going on from the first left, all 24 within the window", async () => {
    built.length = 0;
    const { cache } = await veille();
    const first = await counted(MINUIT_BUDGET, () => minuit(cache, NOW));
    expect(first.value.faites).toHaveLength(2 * MINUIT_PAR_PASSAGE);
    expect(first.value.faites[0]).toBe(`web:lieu:${COMMUNES[0].slug}`);
    expect(first.used).toBeLessThanOrEqual(MINUIT_BUDGET);
    const second = await counted(MINUIT_BUDGET, () => minuit(cache, new Date(NOW.getTime() + 5 * 60_000)));
    // The communes done before are passed over: of the day now.
    expect(second.value.deja).toHaveLength(MINUIT_PAR_PASSAGE);
    expect(second.value.faites[0]).toBe(`web:lieu:${COMMUNES[MINUIT_PAR_PASSAGE].slug}`);
    // The 5-minute events up to 00:35 are enough for the 24 communes, with one to spare.
    const events = Math.ceil(COMMUNES.length / MINUIT_PAR_PASSAGE);
    expect(events).toBeLessThan(8);
    for (let i = 2; i < events; i++) await counted(MINUIT_BUDGET, () => minuit(cache, new Date(NOW.getTime() + i * 5 * 60_000)));
    expect(new Set(built).size).toBe(2 * COMMUNES.length);
    expect(built).toHaveLength(2 * COMMUNES.length);
  });

  it("stops without an error when its budget is spent, the next event going on from there", async () => {
    built.length = 0;
    // The copies' costs known in this isolate (30 each), as after a first night.
    await counted(MINUIT_BUDGET, async () => minuit((await veille()).cache, NOW));
    built.length = 0;
    const { cache } = await veille();
    // Room for one copy (45 left past the cache's tenth): the second is left.
    const short = await counted(50, () => minuit(cache, NOW));
    expect(short.value.faites).toEqual([`web:lieu:${COMMUNES[0].slug}`]);
    expect(short.value.arret).toMatch(/^budget : \d+ sous-requêtes restantes pour web:commune:/);
    expect(minuitSaid(short.value, short.used)).toContain("arrêt : budget");
    const next = await counted(MINUIT_BUDGET, () => minuit(cache, new Date(NOW.getTime() + 5 * 60_000)));
    expect(next.value.faites[0]).toBe(`web:commune:${COMMUNES[0].slug}`);
  });

  it("does nothing outside the window, nor for a commune whose copies are of the day", async () => {
    built.length = 0;
    const { cache, store } = await veille();
    expect(minuitDu(new Date("2026-11-24T20:41:00Z"))).toBe(false);
    expect((await minuit(cache, new Date("2026-11-24T20:41:00Z"))).faites).toEqual([]);
    expect((await minuit(cache, new Date("2026-11-24T19:59:00Z"))).faites).toEqual([]);
    for (const k of [`web:lieu:${COMMUNES[0].slug}`, `web:commune:${COMMUNES[0].slug}`]) await store.put(k, { value: {}, fetchedAt: NOW.getTime() - 60_000 });
    const m = await minuit(cache, NOW);
    expect(m.deja).toEqual([COMMUNES[0].slug]);
    expect(built).not.toContain(`lieu:${COMMUNES[0].slug}`);
  });
});
