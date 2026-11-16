import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { resolvePlace } from "../src/places/resolve.js";
import { heuresHier } from "../src/tools/historique.js";
import { meteoActuelle } from "../src/tools/meteo.js";
import { ECART_FOIS, ECART_MM, gaugesOf, pluieCommune } from "../src/tools/pluie-commune.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

// Saint-Philippe on 15/11/2026, as the hourly package of Météo-France had it at 11:00 (07:00Z), newest hour first:
// Le Tremblet 76,1 mm since midnight (33,7 mm from 07:00 to 08:00), Le Baril 4,8 mm. Read in the Worker's KV.
const NOW = new Date("2026-11-15T07:13:00Z");
const zeros = (n: number) => Array<number>(n).fill(0);
const TREMBLET = [2.6, 9.7, 11.9, 33.7, 8.9, 5.3, 3.8, 0, 0.2, 0, 0, ...zeros(13)];
const BARIL = [0.2, 1.2, 3, 0.4, 0, 0, 0, 0, 0, 0, 0, ...zeros(13)];
const HOURLY: meteofrance.HourlyRain = { end: "2026-11-15T07:00:00Z", rr: { "97417340": TREMBLET, "97417360": BARIL } };
// Yesterday 0 h to 24 h, as kept at 00:20.
const VEILLE: meteofrance.Veille = { jour: "2026-11-14", complet: true, stations: { "97417340": { rr: 0.8 }, "97417360": { rr: 0 } } };
const rain = (hourly = HOURLY): meteofrance.RecentRain => ({ hourly, slots: () => [] });

async function cache() {
  const store = new MemoryStore();
  const at = NOW.getTime();
  const rows = meteofrance.parseCsv(fixture("meteofrance_6min.csv"));
  const entries: Record<string, { value: unknown; fetchedAt: number }> = { horaire: { value: HOURLY, fetchedAt: at } };
  for (const t of [Date.parse("2026-11-15T07:06:00Z"), Date.parse("2026-11-15T07:12:00Z")]) {
    entries[iso(t)] = { value: rows.map((r) => ({ ...r, time: iso(t), rr_per: r.rr_per == null ? null : 0 })), fetchedAt: at };
  }
  entries[iso(Date.parse("2026-11-15T07:18:00Z"))] = { value: [], fetchedAt: at };
  await store.put("meteofrance:6min", { value: entries, fetchedAt: at });
  await store.put("metar", { value: [], fetchedAt: at });
  return new Cache(store, () => NOW.getTime());
}

describe("the rain at every gauge of a commune asked as a whole", () => {
  beforeEach(() => {
    meteofrance.configure({ token: "test" });
    vi.stubGlobal("fetch", async () => {
      throw new Error("no network in tests");
    });
  });
  afterEach(() => {
    meteofrance.configure({});
    vi.unstubAllGlobals();
  });

  it("finds a commune's gauges by its INSEE code", () => {
    expect(gaugesOf("Saint-Philippe").map(([id, nom]) => `${id} ${nom}`)).toEqual(["97417340 Le Tremblet", "97417360 Le Baril"]);
    expect(gaugesOf("Nulle part")).toEqual([]);
  });

  it("says each gauge's rain since midnight, the wettest first, and the gap the nearest one hides", () => {
    const b = pluieCommune(rain(), "Saint-Philippe", { id: "97417360", nom: "Le Baril" }, NOW)!;
    // The period said once, as every gauge was read to the same minute.
    expect(b.periode).toBe("de 00:00 à 11:00");
    expect(b.depuis_minuit).toEqual({ "Le Tremblet": "76,1 mm", "Le Baril": "4,8 mm" });
    expect(b.fort_ecart).toBe(true);
    expect(b.resume).toBe(
      "Pluie mesurée de 00:00 à 11:00 aux 2 pluviomètres Météo-France de Saint-Philippe : Le Tremblet 76,1 mm ; Le Baril 4,8 mm. " +
        "Fort écart de 00:00 à 11:00 : Le Tremblet a mesuré 76,1 mm, Le Baril 4,8 mm. La pluie au Baril ne dit pas celle de toute la commune : dire les deux. " +
        // Yesterday: historique_meteo's, hour by hour at each gauge, no read more in meteo_actuelle.
        "Hier heure par heure à chacun : historique_meteo.",
    );
  });

  it("names together the gauges with the same rain, the period said once", () => {
    // Saint-Denis has six: one wet, five dry, as on 16/11/2026 at 07:42.
    const ids = gaugesOf("Saint-Denis").map(([id]) => id);
    expect(ids.length).toBe(6);
    const rr = Object.fromEntries(ids.map((id, k) => [id, k === 2 ? [0.2, ...zeros(23)] : zeros(24)]));
    const b = pluieCommune(rain({ end: HOURLY.end, rr }), "Saint-Denis", undefined, NOW)!;
    const [wet, ...dry] = Object.keys(b.depuis_minuit);
    expect(b.depuis_minuit[wet]).toBe("0,2 mm");
    expect(b.resume).toContain(`aux 6 pluviomètres Météo-France de Saint-Denis : ${wet} 0,2 mm ; ${dry.slice(0, -1).join(", ")} et ${dry.at(-1)} 0 mm.`);
  });

  it("says no gap below the threshold read from the archive, nor when the wettest is the one shown", () => {
    // 19,9 mm more: under ECART_MM.
    const close = { ...HOURLY, rr: { "97417340": [ECART_MM - 0.1 + 4.8, ...zeros(23)], "97417360": BARIL } };
    expect(pluieCommune(rain(close), "Saint-Philippe", { id: "97417360", nom: "Le Baril" }, NOW)!.fort_ecart).toBeUndefined();
    // 25 mm more but less than ECART_FOIS times as much.
    const wet = { ...HOURLY, rr: { "97417340": [35, ...zeros(23)], "97417360": [10, ...zeros(23)] } };
    expect(35 < ECART_FOIS * 10).toBe(true);
    expect(pluieCommune(rain(wet), "Saint-Philippe", { id: "97417360", nom: "Le Baril" }, NOW)!.fort_ecart).toBeUndefined();
    expect(pluieCommune(rain(), "Saint-Philippe", { id: "97417340", nom: "Le Tremblet" }, NOW)!.fort_ecart).toBeUndefined();
    // A commune whose only gauge is the one shown: nothing to add.
    expect(pluieCommune(rain({ end: HOURLY.end, rr: { "97417360": BARIL } }), "Saint-Philippe", { id: "97417360", nom: "Le Baril" }, NOW)).toBeUndefined();
  });

  it("meteo_actuelle on Saint-Philippe gives Le Tremblet's 76,1 mm beside Le Baril's, with the gap, in its summary", async () => {
    const r = body(await meteoActuelle(await cache(), "Saint-Philippe", NOW));
    expect(r.pluie_recente.station).toBe("Le Baril");
    expect(Object.keys(r.pluie_commune.depuis_minuit)).toEqual(["Le Tremblet", "Le Baril"]);
    // To the last 6-minute slot read, 11:12.
    expect(r.pluie_commune.periode).toBe("de 00:00 à 11:12");
    expect(r.pluie_commune.depuis_minuit["Le Tremblet"]).toBe("76,1 mm");
    expect(r.resume).toContain("Le Tremblet a mesuré 76,1 mm");
    expect(r.resume).toContain("Fort écart de 00:00 à 11:12");
  });

  it("gives no commune block for a place within it", async () => {
    expect(body(await meteoActuelle(await cache(), "Le Tremblet", NOW)).pluie_commune).toBeUndefined();
  });

  it("keeps yesterday's rain hour by hour at 00:20, and historique_meteo gives it at every gauge of the commune", () => {
    // Made-up day, shaped like Saint-Philippe's morning of 15/11/2026 (index 0: 00:00 to 01:00), read as « yesterday ».
    const tremblet = [0, 0, 0.2, 0, 3.8, 5.3, 8.9, 33.7, 11.9, 9.7, 2.6, ...zeros(13)];
    const baril = [...zeros(7), 0.4, 3, 1.2, 0.2, ...zeros(13)];
    const hourly: meteofrance.HourlyRain = { end: "2026-11-15T20:00:00Z", rr: { "97417340": [...tremblet].reverse(), "97417360": [...baril].reverse() } };
    const kept = meteofrance.veilleDe(hourly, "2026-11-15");
    expect(kept.complet).toBe(true);
    expect(kept.stations["97417340"]).toMatchObject({ rr: 76.1, rr_h: tremblet });
    const h = heuresHier(kept, resolvePlace("Saint-Philippe")!.lieu)!;
    expect(h.bloc.stations.map((s) => [s.station, s.pluie_mm])).toEqual([["Le Tremblet", 76.1], ["Le Baril", 4.8]]);
    expect(h.bloc.stations[0].heures_de_pluie).toContain("entre 7 h et 8 h : 33,7 mm");
    expect(h.texte).toContain("aux pluviomètres de Saint-Philippe : Le Tremblet 76,1 mm (entre 2 h et 3 h : 0,2 mm, entre 4 h et 5 h : 3,8 mm");
    expect(h.texte).toContain("Le Baril 4,8 mm (entre 7 h et 8 h : 0,4 mm, entre 8 h et 9 h : 3 mm, entre 9 h et 10 h : 1,2 mm, entre 10 h et 11 h : 0,2 mm)");
    // A place within the commune: its best-placed gauge only. A day kept before the hours were: nothing.
    expect(heuresHier(kept, resolvePlace("Le Tremblet")!.lieu)!.bloc.stations.map((s) => s.station)).toEqual(["Le Tremblet"]);
    expect(heuresHier(VEILLE, resolvePlace("Saint-Philippe")!.lieu)).toBeUndefined();
  });
});
