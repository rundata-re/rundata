import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { counted, PAGE_BUDGET, SCHEDULED_BUDGET, scheduled } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as metar from "../src/providers/metar.js";

const METAR = readFileSync(new URL("./fixtures/metar.json", import.meta.url), "utf8");

afterEach(() => vi.restoreAllMocks());

/** The delays given to aviationweather.gov's read, from an empty cache. */
async function delays(event: boolean): Promise<number[]> {
  const asked: number[] = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => (asked.push(ms), timeout(ms)));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(METAR, { headers: { "content-type": "application/json" } }));
  const cache = new Cache(new MemoryStore(), () => Date.now(), false);
  const { value } = await counted(event ? SCHEDULED_BUDGET : PAGE_BUDGET, async () => {
    if (event) scheduled();
    return metar.observations(cache);
  });
  expect(value.value.length).toBeGreaterThan(0);
  return asked;
}

describe("the airports' METAR read", () => {
  it("waits up to 25 s in the scheduled event, past the slowest answer of the probe of 09/11/2026 (21,7 s)", async () => {
    expect(metar.PATIENCE_MS).toBe(25_000);
    expect(await delays(true)).toEqual([25_000]);
  });

  it("keeps 15 s for a visit or a question, which someone waits for", async () => {
    expect(await delays(false)).toEqual([15_000]);
  });
});
