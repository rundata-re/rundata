import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { inMemory, ReadsSpent, region, resumable, variable, type Kept } from "../src/hdf5.js";
import * as viirs from "../src/providers/viirs.js";
import { SATELLITES, temperatureMer } from "../src/tools/mer.js";
import { coastwatch, parseAscii } from "./sst.js";

// Two granules of NOAA-20 reduced to the island (scripts/fixture-ghrsst.py): the night of 7 to 8 November 2026, clear,
// and the afternoon of 5 November, clouds over the west and the north.
const bytes = (f: string) => {
  const b = readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const CLEAR = { file: "viirs_l3u_n20.nc", granule: Date.parse("2026-11-07T21:30:00Z") };
const CLOUDY = { file: "viirs_l3u_n20_nuageux.nc", granule: Date.parse("2026-11-05T11:00:00Z") };
const N20 = viirs.SATELLITES[0];
const MIN = 60_000;
const pass = (g: typeof CLEAR) => viirs.readPass(inMemory(bytes(g.file)), "N20", g.granule);
const at = (iso: string) => new Date(iso).getTime();
const hm = (t: number) => new Date(t).toISOString().slice(11, 16);

describe("hdf5's reader of NOAA's NetCDF-4 files", () => {
  it("finds a variable's chunks and filters, and decodes the island's box", async () => {
    const read = inMemory(bytes(CLEAR.file));
    const sst = await variable(read, "sea_surface_temperature");
    expect(sst).toMatchObject({ size: 2, filters: [2, 1, 1] });
    expect(sst.chunks.length).toBeGreaterThan(0);
    const box = await region(read, sst, 5537, 5575, 11755, 11800, -32768);
    expect(box).toHaveLength(38 * 45);
    const valid = [...box].filter((v) => v !== -32768);
    expect(valid.length).toBeGreaterThan(400);
    // Hundredths of a degree above 0 °C: the sea around the island in November.
    expect(Math.min(...valid)).toBeGreaterThan(2300);
    expect(Math.max(...valid)).toBeLessThan(2800);
  });

  it("reads by ranges, one per budget, keeping the small ones to go on from them", async () => {
    const all = new Uint8Array(bytes(CLEAR.file));
    const asked: [number, number][] = [];
    const fetchRange = async (o: number, l: number) => (asked.push([o, l]), all.slice(o, o + l));
    const kept: Kept[] = [];
    let box: Int32Array | undefined;
    for (let i = 0; i < 30 && !box; i++) {
      const read = resumable(kept, fetchRange);
      try {
        box = await region(read, await variable(read, "quality_level"), 5537, 5575, 11755, 11800, -128);
      } catch (err) {
        expect(err).toBeInstanceOf(ReadsSpent);
      }
    }
    expect(box).toEqual(await region(inMemory(bytes(CLEAR.file)), await variable(inMemory(bytes(CLEAR.file)), "quality_level"), 5537, 5575, 11755, 11800, -128));
    expect(new Set(asked.map(([o, l]) => `${o}+${l}`)).size).toBe(asked.length);
  });
});

describe("viirs: a pass of NOAA-20 over the island", () => {
  it("keeps the clear pixels and their mean time", async () => {
    const p = (await pass(CLEAR))!;
    expect(p.pixels).toHaveLength(532);
    expect(new Date(p.heure).toISOString().slice(0, 19)).toBe("2026-11-07T21:39:09");
    expect(p.nuages).toBeUndefined();
    const near = (lon: number, lat: number) => viirs.latest({ passages: [p], sondes: [] }, lon, lat, p.heure + 60 * MIN, 5, 86_400_000);
    expect(near(55.475, -21.345)).toMatchObject({ satellite: "NOAA-20", valeur: 26, distance_km: 0.8 }); // Saint-Pierre
    expect(near(55.22, -21.075)).toMatchObject({ valeur: 25.6, distance_km: 1.2 }); // Saint-Gilles
    expect(near(55.72, -21.035)).toBeNull(); // Saint-Benoît: no clear water within 5 km
  });

  it("keeps the clear water of a cloudy pass, and nothing where the clouds were", async () => {
    const p = (await pass(CLOUDY))!;
    expect(p.pixels).toHaveLength(85);
    expect(new Date(p.heure).toISOString().slice(0, 19)).toBe("2026-11-05T11:04:34");
    const near = (lon: number, lat: number) => viirs.latest({ passages: [p], sondes: [] }, lon, lat, p.heure + 60 * MIN, 5, 86_400_000);
    expect(near(55.475, -21.345)).toMatchObject({ valeur: 25.8, distance_km: 0.8 }); // Saint-Pierre
    expect(near(55.22, -21.075)).toBeNull(); // Saint-Gilles, under the clouds
  });

  it("names the granule's file under /pub/", () => {
    expect(viirs.granuleUrl(N20, CLEAR.granule)).toBe(
      "https://coastwatch.noaa.gov/pub/socd2/coastwatch/sst/nrt/viirs/n20/l3u/2026/311/20261107213000-STAR-L3U_GHRSST-SSTsubskin-VIIRS_N20-ACSPO_V2.80-v02.0-fv01.0.nc",
    );
  });

  it("asks the whole window without a pass, then the granules a whole number of orbits after the last one", async () => {
    const empty = { passages: [], sondes: [] };
    const night = (s: viirs.Passages) => viirs.expected(s, N20, at("2026-11-08T23:30:00Z")).filter((g) => g >= at("2026-11-08T19:00:00Z")).map(hm);
    // 21:39 ± 80 minutes, every granule.
    expect(night(empty)).toHaveLength(17);
    expect(night(empty).at(-1)).toBe("20:10");
    // 14 orbits after 7 November 21:39:09: 21:19:19 on the 8th, under 2 minutes before the granule of 21:20.
    const p = (await pass(CLEAR))!;
    expect(night({ passages: [p], sondes: [] })).toEqual(["21:20", "21:10"]);
    // A pass of clouds only has no time of its own: it predicts nothing.
    expect(night({ passages: [{ ...p, pixels: [], nuages: true }], sondes: [] })).toHaveLength(17);
  });

  it("asks a granule once posted, again 10 minutes after it was missing, never once read", async () => {
    const p = (await pass(CLEAR))!;
    const s = { passages: [p], sondes: [] as viirs.Probe[] };
    const g = at("2026-11-08T21:10:00Z");
    expect(viirs.nextProbe(s, g + 10 * MIN + 34 * MIN)?.granule).not.toBe(g);
    expect(viirs.nextProbe(s, g + 10 * MIN + 36 * MIN)?.granule).toBe(g);
    // The granule after it, 21:20, read already.
    const next = { satellite: "N20", granule: g + 10 * MIN, lu: true, essai: g + 56 * MIN };
    s.sondes = [{ satellite: "N20", granule: g, lu: false, essai: g + 46 * MIN }, next];
    expect(viirs.nextProbe(s, g + 50 * MIN)?.granule).not.toBe(g);
    expect(viirs.nextProbe(s, g + 57 * MIN)?.granule).toBe(g);
    s.sondes = [{ satellite: "N20", granule: g, lu: true, essai: g + 46 * MIN }, next];
    expect(viirs.nextProbe(s, g + 3 * 60 * MIN)?.granule).not.toBe(g);
  });

  it("is built again every 10 minutes around a pass, else every hour", async () => {
    const p = (await pass(CLEAR))!;
    const s = { passages: [p], sondes: [] };
    expect(viirs.passagesEvery(s, new Date("2026-11-08T21:30:00Z"))).toBe(10);
    // The granules of the afternoon given up (6 hours), those of the night not before 20:19.
    expect(viirs.passagesEvery(s, new Date("2026-11-08T19:00:00Z"))).toBe(60);
  });
});

describe("viirs's build, one granule at most", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks one granule, keeps its pass, and asks a missing one again later", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const asked: string[] = [];
    let posted = false;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(url);
      return posted ? coastwatch(url, init)! : new Response("not found", { status: 404 });
    });
    let now = at("2026-11-07T23:00:00Z");
    const cache = new Cache(new MemoryStore(), () => now);
    let state = await viirs.build(cache, new Date(now));
    expect(asked).toHaveLength(1);
    expect(state.passages).toEqual([]);
    expect(state.sondes[0]).toMatchObject({ lu: false, essai: now });
    posted = true;
    // The granule of 21:30 is the one of the pass (test/fixtures/viirs_l3u_n20.nc).
    state = { ...state, sondes: state.sondes.map((x) => ({ ...x, essai: 0 })) };
    const store = new MemoryStore();
    await store.put(viirs.KEY, { value: state, fetchedAt: now });
    now += 11 * MIN;
    state = await viirs.build(new Cache(store, () => now), new Date(now));
    expect(asked).toHaveLength(2);
    expect(asked.every((u) => u.includes("/pub/socd2/coastwatch/sst/nrt/viirs/n20/l3u/"))).toBe(true);
    expect(state.passages).toHaveLength(1);
    expect(state.sondes[0].lu).toBe(true);
  });
});

describe("temperature_mer with the satellite's passes", () => {
  beforeEach(() =>
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    }));
  afterEach(() => vi.unstubAllGlobals());

  const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

  /** The shared copies as the scheduled event leaves them: the passes, and the grids with the day `jour`. */
  async function copies(passes: viirs.Pass[], jour: string, now: number) {
    const store = new MemoryStore();
    await store.put(viirs.KEY, { value: { passages: passes, sondes: [] }, fetchedAt: now - 5 * MIN });
    await store.put(SATELLITES, { value: [{ source: "acspo", jours: [parseAscii(String(readFileSync(new URL("./fixtures/acspo.ascii", import.meta.url))), jour)], lu: now }], fetchedAt: now });
    return new Cache(store, () => now);
  }

  it("gives the pass of the night, its time at La Réunion and its distance, before the day's mean", async () => {
    const now = at("2026-11-07T23:10:00Z"); // 8 November, 03:10 at La Réunion
    const cache = await copies([(await pass(CLEAR))!], "2026-11-06", now);
    const r = body(await temperatureMer(cache, "Saint-Pierre", new Date(now)));
    expect(r.mesure).toMatchObject({
      temperature_eau: "26 °C",
      nature: "mesure_satellite",
      produit: "passage du satellite",
      satellite: "NOAA-20",
      heure_mesure: "08/11 01:39",
      jour_mesure: "2026-11-08",
      quand: "cette nuit à 01:39",
      distance_km: 1.2,
    });
    expect(r.resume).toContain("mesurée par satellite (passage de cette nuit à 01:39, NOAA-20, point de mesure à 1,2 km).");
  });

  it("gives the day's mean where a cloudy pass saw no clear water near the place", async () => {
    const now = at("2026-11-05T12:00:00Z"); // 16:00 at La Réunion
    const cache = await copies([(await pass(CLOUDY))!], "2026-11-04", now);
    const gilles = body(await temperatureMer(cache, "Saint-Gilles", new Date(now)));
    expect(gilles.mesure).toMatchObject({ produit: "moyenne du jour", jour_mesure: "2026-11-04" });
    expect(gilles.resume).toContain("mesurée par satellite (moyenne d'hier, 04/11, ");
    const pierre = body(await temperatureMer(cache, "Saint-Pierre", new Date(now)));
    expect(pierre.mesure).toMatchObject({ produit: "passage du satellite", heure_mesure: "05/11 15:04", quand: "aujourd'hui à 15:04" });
  });
});
