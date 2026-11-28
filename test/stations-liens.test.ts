import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import * as meteorOi from "../src/providers/meteor-oi.js";
import { meteoActuelle, stationLien } from "../src/tools/meteo.js";
import { stationOf } from "../src/web/station.js";
import { dansLeWorker, horsWorker, meteoFrance } from "./contexte.js";

// Off Saint-Gilles, meteo_actuelle named four stations and linked one page, which showed one of them (26/11/2026): each
// station now gives where its measure is read, its page on rundata.re or its producer's public page.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-22T05:20:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

/** Météo-France's 6-minute package of 22/10 at 05:18, the Trou d'Eau's beacon and Mont Roquefeuil (MétéoR-OI). */
async function cache(): Promise<Cache> {
  const store = new MemoryStore();
  const at = NOW.getTime();
  const rows = meteofrance.parseCsv(fixture("meteofrance_6min.csv"));
  const slot = Date.parse("2026-10-22T05:18:00Z");
  await store.put("meteofrance:6min", { value: { [iso(slot)]: { value: rows, fetchedAt: at } }, fetchedAt: at });
  await store.put("metar", { value: [], fetchedAt: at });
  await store.put("ffvl:releves", { value: [{ idbalise: 1012, date: "2026-10-22T05:16:00Z", vitesseVentMoy: 12, vitesseVentMax: 20, directVentMoy: 200 }], fetchedAt: at });
  dansLeWorker({ [meteorOi.KV_KEY]: async () => ({
    lu: NOW.toISOString(),
    mesures: [{ code: "ROQ070", mesure_a: "2026-10-22T05:15:00.000Z", temperature: 23.4, humidite: 75, vent: 10, direction: 180, rafales: 18, pluie_1h: 0 }],
  }) });
  return new Cache(store, () => at);
}

beforeEach(() => {
  meteoFrance({ token: "test" });
  vi.stubGlobal("fetch", async () => {
    throw new Error("no network in tests");
  });
});
afterEach(() => {
  meteoFrance({});
  horsWorker();
  vi.unstubAllGlobals();
});

describe("where each station of meteo_actuelle is read", () => {
  it("off Saint-Gilles: every station named with its link, the Météo-France ones to their page on rundata.re", async () => {
    const r = body(await meteoActuelle(await cache(), "-21.0545, 55.2270", NOW));
    const liens = Object.fromEntries((r.stations as { station: string; lien?: string }[]).map((s) => [s.station, s.lien]));
    expect(liens).toEqual({
      "Balise du Trou d'Eau": "https://www.balisemeteo.com/balise.php?idBalise=1012",
      "Pointe des Trois-Bassins": "https://rundata.re/meteo/station/97415590?ref=mcp",
      "Le Port": "https://rundata.re/meteo/station/97407520?ref=mcp",
      "Mont Roquefeuil": "https://www.meteor-oi.re",
    });
    expect(Object.values(liens).every(Boolean)).toBe(true);
    // More than the one page the answer cites: the pages of rundata.re the answer gives, for a reader and the checks.
    const pages = new Set(JSON.stringify(r).match(/https:\/\/rundata\.re\/[^"?\s]+/g));
    expect(pages.size).toBeGreaterThan(1);
  });

  it("is a public page: never an API's address, never one with a key, and a page the site serves for Météo-France's", () => {
    const de = (source: string, id: string) => stationLien({ source, id, nom: id, lon: 55.5, lat: -21, altitude_m: 0, variables: [] })!;
    const all = [de("meteofrance", "97407520"), de("ffvl", "164"), de("metar", "FMEE"), de("meteor_oi", "ROQ070")];
    for (const u of all) {
      expect(new URL(u).protocol, u).toBe("https:");
      expect(u, u).not.toMatch(/\/api\b|api\.|token|key|cle=|apikey/i);
    }
    expect(all[0]).toBe("https://rundata.re/meteo/station/97407520?ref=mcp");
    expect(stationOf("97407520")?.nom).toBe("Le Port");
    expect(all[2]).toBe("https://aviationweather.gov/data/metar/?ids=FMEE");
    expect(stationLien({ source: "autre", id: "x", nom: "x", lon: 0, lat: 0, altitude_m: 0, variables: [] })).toBeUndefined();
  });
});
