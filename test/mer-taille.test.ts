import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { MAX_BYTES } from "../src/bin/check-sources.js";
import { coastwatch, parseAscii } from "./sst.js";
import { SATELLITES, TOUR, temperatureMer } from "../src/tools/mer.js";

// Waves recorded from Open-Meteo (MFWAM and WAM), the grid of ACSPO, and a week of NOAA Coral Reef Watch in alert: the
// longest words of the coral levels.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const NOW = new Date("2026-10-22T06:00:00Z");

beforeEach(() =>
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("marine-api.open-meteo")) return new Response(fixture(u.includes("meteofrance_wave") ? "openmeteo_houle_mf.json" : "openmeteo_houle.json"));
    if (u.includes("dhw_5km")) return new Response(fixture("coraux_dhw_5km_7j.csv"));
    const pub = coastwatch(u, init);
    if (pub) return pub;
    throw new Error(`unexpected ${u}`);
  }));
afterEach(() => vi.unstubAllGlobals());

async function withSea() {
  const store = new MemoryStore();
  await store.put(SATELLITES, { value: [{ source: "acspo", jours: [parseAscii(String(fixture("acspo.ascii")), "2026-10-21")], lu: NOW.getTime() }], fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime());
}

describe("the size of temperature_mer", () => {
  it("keeps a beach's answer, sharks and corals included, well under the ceiling the daily check of the sources sets", async () => {
    const cache = await withSea();
    // The server adds about 600 bytes (citer, lien, fraicheur, serveur, the warnings' spaces): 1 500 kept for them and
    // for longer days, a day's mean of several days ago or a source down.
    const max = MAX_BYTES["temperature_mer (Saint-Gilles)"] - 1_500;
    for (const lieu of ["Saint-Gilles", ...TOUR]) {
      const r = await temperatureMer(cache, lieu, NOW);
      const bytes = new TextEncoder().encode(r.content[0].text).length;
      expect(bytes, lieu).toBeLessThanOrEqual(max);
    }
  });
});
