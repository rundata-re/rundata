import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { withLectures } from "../src/lectures.js";
import { TOOL_WAIT_MS } from "../src/server.js";
import { meteoActuelle, meteoActuelleOutil, METEO_ACTUELLE_WAIT_MS } from "../src/tools/meteo.js";

/**
 * meteo_actuelle waits for a slow station's read as an assistant's view of /meteo/<lieu> does, 800 ms, then gives its
 * last copy with the time it was read; the read goes on after the answer. It waited the call's whole time (TOOL_WAIT_MS,
 * 5 s): from 21 to 24/11/2026, 10 calls of 107 took over 2 s, each one reading the stations again.
 */
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const FIX = new Date("2026-10-18T19:20:00Z");

/** The airports' METAR and a FFVL beacon, read at `at`; the clock at FIX. */
async function weatherCache(at: number) {
  const store = new MemoryStore();
  const date = new Date(at - 4 * 60_000).toISOString();
  await store.put("metar", { value: JSON.parse(fixture("metar.json")), fetchedAt: at });
  await store.put("ffvl:releves", { value: [{ idbalise: 164, date, vitesseVentMoy: 8, vitesseVentMax: 15, directVentMoy: 112 }], fetchedAt: at });
  return new Cache(store, () => FIX.getTime());
}

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  // aviationweather.gov answers in 3 s, with an error; every other read fails at once.
  vi.stubGlobal("fetch", async (url: unknown) => {
    fetched.push(String(url));
    if (new URL(String(url)).hostname === "aviationweather.gov") await new Promise((r) => setTimeout(r, 3_000));
    throw new Error("offline (test)");
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("meteo_actuelle with a slow station", () => {
  it("answers within an assistant's wait, from the copy, said read before and not down", async () => {
    // Read 20 min ago: past the METAR's 15 min, its refresh is under way when the call asks.
    const cache = await weatherCache(FIX.getTime() - 20 * 60_000);
    const t0 = Date.now();
    const { value, lectures } = await withLectures(() => meteoActuelleOutil(cache, "Saint-Pierre", FIX), TOOL_WAIT_MS);
    const ms = Date.now() - t0;
    expect(METEO_ACTUELLE_WAIT_MS).toBe(800);
    expect(ms).toBeLessThan(METEO_ACTUELLE_WAIT_MS + 700);
    expect(fetched.some((u) => new URL(u).hostname === "aviationweather.gov")).toBe(true);
    const a = body(value);
    const pierrefonds = a.stations.find((s: { station: string }) => /Pierrefonds/.test(s.station));
    expect(pierrefonds).toBeDefined();
    // Too slow for the answer, not silent: never « injoignable » (the FFVL's beacon, whose read fails at once, is).
    expect(pierrefonds.avertissements.join(" ")).not.toContain("injoignable");
    expect(lectures.find((l) => l.key === "metar")).toMatchObject({ stale: true, tardive: true });
  }, 10_000);

  it("gives the same answer as before when the copies are fresh", async () => {
    // Read a minute ago: nothing to wait for.
    const at = FIX.getTime() - 60_000;
    const fresh = await weatherCache(at);
    const call = await withLectures(() => meteoActuelleOutil(fresh, "Saint-Pierre", FIX), TOOL_WAIT_MS);
    const outside = await meteoActuelle(await weatherCache(at), "Saint-Pierre", FIX);
    expect(body(call.value)).toEqual(body(outside));
    expect(fetched.filter((u) => new URL(u).hostname === "aviationweather.gov")).toEqual([]);
  });

  it("leaves the place pages' build waiting for its stations, as before", async () => {
    // A page's copy, built inside a call (resume_du_jour), is kept for minutes: never filled with a too slow read.
    const cache = await weatherCache(FIX.getTime() - 20 * 60_000);
    const t0 = Date.now();
    await withLectures(() => meteoActuelle(cache, "Saint-Pierre", FIX, "jour"), TOOL_WAIT_MS);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2_900);
  }, 10_000);
});
