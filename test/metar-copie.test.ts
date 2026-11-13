import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as metar from "../src/providers/metar.js";
import { COPY_MAX_MINUTES, islandTour } from "../src/tools/meteo.js";
import type { HomeData, StationNow } from "../src/web/data.js";
import { withTemp } from "../src/web/pages.js";
import { SHARED } from "../src/web/partagees.js";

const METAR = readFileSync(new URL("./fixtures/metar.json", import.meta.url), "utf8");
// The fixture's latest report, both airports.
const OBS = 1792350000 * 1000;
const GILLOT = "Saint-Denis Gillot (aéroport Roland-Garros)";

afterEach(() => vi.restoreAllMocks());

/** The island's tour at each time, aviationweather.gov answering only the first time; every other source down. */
async function tours(times: number[]) {
  let now = times[0];
  let first = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (new URL(String(input)).hostname === "aviationweather.gov" && first) {
      first = false;
      return new Response(METAR, { headers: { "content-type": "application/json" } });
    }
    throw new Error("The operation was aborted due to timeout");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const cache = new Cache(new MemoryStore(), () => now, false);
  const out = [];
  for (const t of times) {
    now = t;
    const { all, down } = await islandTour(cache, new Date(t));
    const gillot = all.find(({ o }) => o.station.nom === GILLOT);
    out.push({ gillot: gillot && { stale: gillot.stale, time: gillot.o.time.getTime() }, down });
  }
  return out;
}

describe("the airports' METAR when aviationweather.gov does not answer", () => {
  it("keeps each airport at its measure's time from the copy kept, and leaves it out past 3 hours, its source then said down", async () => {
    const min = 60_000;
    const [read, failed, late] = await tours([OBS + 20 * min, OBS + 40 * min, OBS + (COPY_MAX_MINUTES + 1) * min]);
    expect(read.gillot).toEqual({ stale: false, time: OBS });
    expect(read.down).not.toContain(metar.SOURCE.nom);
    // 20 minutes later the read times out: the copy is served, Gillot with it, at the time it was measured.
    expect(failed.gillot).toEqual({ stale: true, time: OBS });
    expect(failed.down).not.toContain(metar.SOURCE.nom);
    // Past 3 hours: no station from that copy, and the source said unavailable rather than nothing said.
    expect(late.gillot).toBeUndefined();
    expect(late.down).toContain(metar.SOURCE.nom);
  });

  it("counts a station from the kept copy in the island's temperatures (it hid Gillot and Pierrefonds, 07/11/2026)", () => {
    const s = (nom: string, stale: boolean, temperature: number) => ({ nom, stale, temperature, source: "metar", time: new Date(OBS).toISOString() }) as StationNow;
    const data = { value: { stations: [s(GILLOT, true, 27), s("Saint-Pierre Pierrefonds (aéroport)", false, 26)] }, fetchedAt: new Date(OBS), stale: false } as unknown as Parameters<typeof withTemp>[0] & { value: HomeData };
    expect(withTemp(data).map((x) => x.nom)).toEqual([GILLOT, "Saint-Pierre Pierrefonds (aéroport)"]);
  });

  it("is read by the scheduled event every 10 minutes, beside the other copies, into the copy the visits read", () => {
    const shared = SHARED.find((x) => x.key === metar.KEY);
    expect(shared).toMatchObject({ every: 10, cold: 1, alongside: true });
    expect(metar.KEY).toBe("metar");
  });
});
