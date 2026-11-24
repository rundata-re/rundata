import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { REGLE_COURTE } from "../src/eau/requin.js";
import { SATELLITES, temperatureMer } from "../src/tools/mer.js";
import { seaPage } from "../src/web/pages.js";
import { esc } from "../src/web/map.js";
import { coastwatch, parseAscii } from "./sst.js";

// The swimming rule said where one asks about the sea, not only in a field of its own (24/11/2026):
// the résumé of temperature_mer and the top of /mer, the same words as a place's page (marketing, 20/11).
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const NOW = new Date("2026-10-22T06:00:00Z");
const AFTER = new Date("2027-02-17T06:00:00Z");

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

async function withSea(now = NOW) {
  const store = new MemoryStore();
  await store.put(SATELLITES, { value: [{ source: "acspo", jours: [parseAscii(String(fixture("acspo.ascii")), "2026-10-21")], lu: now.getTime() }], fetchedAt: now.getTime() });
  return new Cache(store, () => now.getTime());
}
const resumeOf = async (cache: Cache, lieu: string | undefined, now = NOW) => JSON.parse((await temperatureMer(cache, lieu, now)).content[0].text).resume as string;

describe("the swimming rule where one asks about the sea", () => {
  it("is in the résumé of temperature_mer, for a beach and for the island, while the order is in force", async () => {
    const cache = await withSea();
    expect(REGLE_COURTE).toMatch(/^Baignade, surf, bodyboard et paddle sont interdits dans la bande des 300 m de tout le littoral, sauf dans le lagon/);
    expect(await resumeOf(cache, "Saint-Gilles")).toContain(REGLE_COURTE);
    expect(await resumeOf(cache, undefined)).toContain(REGLE_COURTE);
    // Inland, no sea: no rule.
    expect(await resumeOf(cache, "Cilaos")).not.toContain(REGLE_COURTE);
  });

  it("is never said once the order has ended", async () => {
    expect(await resumeOf(await withSea(AFTER), "Saint-Gilles", AFTER)).not.toContain("bande des 300 m");
    expect(seaPage("https://rundata.re", null, AFTER)).not.toContain(esc(REGLE_COURTE).slice(0, 60));
  });

  it("opens /mer, under the temperature, linked to the zones further down", () => {
    const html = seaPage("https://rundata.re", null, NOW);
    const top = html.indexOf("interdits dans la bande des 300");
    expect(top).toBeGreaterThan(html.indexOf("<h1"));
    expect(top).toBeLessThan(html.indexOf('id="h-plages"'));
    expect(html.slice(top, html.indexOf("</p>", top))).toContain('<a href="#h-requin">Toutes les zones et la règle →</a>');
  });
});
