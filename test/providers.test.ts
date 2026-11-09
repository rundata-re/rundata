import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { humidity, parseMetar, presentWeather, type MetarJson } from "../src/providers/metar.js";
import { dayUrl, grid, KEY, type L3s, nearest, step } from "../src/providers/acspo.js";
import { coastwatch, parseAscii } from "./sst.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { observation as mfObservation, parseCsv as mfParse } from "../src/providers/meteofrance.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

describe("metar", () => {
  const obs = parseMetar(JSON.parse(fixture("metar.json")) as MetarJson[]);

  it("keeps the latest report of each airport", () => {
    expect(obs.map((o) => o.station.id).sort()).toEqual(["FMEE", "FMEP"]);
    const gillot = obs.find((o) => o.station.id === "FMEE")!;
    expect(gillot.time.toISOString()).toBe("2026-10-18T19:00:00.000Z");
    expect(gillot.brut).toBe("METAR FMEE 181900Z AUTO 13009KT CAVOK 22/16 Q1022 NOSIG");
  });

  it("converts units and flags computed values", () => {
    const r = Object.fromEntries(obs.find((o) => o.station.id === "FMEE")!.readings.map((x) => [x.variable, x]));
    expect(r.temperature.valeur).toBe(22);
    expect(r.vent_moyen.valeur).toBe(17); // 9 kt
    expect(r.vent_direction.valeur).toBe(130);
    expect(r.humidite).toMatchObject({ valeur: 69, nature: "derive" });
    expect(r.ciel.valeur).toBe("dégagé");
  });

  it("reports variable wind", () => {
    const r = obs.find((o) => o.station.id === "FMEP")!.readings.find((x) => x.variable === "vent_direction")!;
    expect(r.valeur).toBe("variable");
  });

  it("computes humidity", () => {
    expect(humidity(25, 25)).toBe(100);
    expect(humidity(30, 20)).toBe(55);
  });

  it("decodes present weather", () => {
    expect(presentWeather("-SHRA BR")).toBe("averses faible, brume");
    expect(presentWeather("+TSRA")).toBe("orage avec pluie fort");
  });
});

describe("acspo", () => {
  const days = [parseAscii(fixture("acspo.ascii"), "2026-10-23")];

  it("keeps the best-quality pixels of the day, in °C", () => {
    expect(days[0].pixels.length).toBeGreaterThan(10);
    expect(days[0].pixels[0]).toEqual([55.15, -20.79, 25.15]);
  });

  it("reads the day's file under /pub/, never /thredds/ nor /erddap/", () => {
    expect(dayUrl("2026-10-23")).toBe(
      "https://coastwatch.noaa.gov/pub/socd2/coastwatch/sst/nrt/l3s/leo/daily/2026/296/20261023120000-STAR-L3S_GHRSST-SSTsubskin-LEO_Daily-ACSPO_V2.81-v02.0-fv01.0.nc",
    );
    expect(dayUrl("2026-01-01")).toContain("/2026/001/20260101");
  });

  it("finds the nearest clear water", () => {
    const m = nearest(days, 55.2265, -21.0743)!; // plage de l'Ermitage
    expect(m.valeur).toBeGreaterThan(24);
    expect(m.valeur).toBeLessThan(26);
    expect(m.distance_km).toBeLessThan(6);
  });

  it("says nothing when the sea is too far", () => {
    expect(nearest(days, 55.47, -21.135)).toBeNull(); // Cilaos
  });
});

describe("acspo's reading of a day by ranges", () => {
  // 7 November 2026 at 12:09 UTC: the day due is the 6th (test/fixtures/acspo_l3s.nc, its file reduced to the island).
  const NOON = Date.parse("2026-11-07T12:09:00Z");
  const MIN = 60_000;
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The server, with its file of the day or none (404); the ranges asked. */
  function server(posted = true) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(`${url} ${(init?.headers as Record<string, string>).Range}`);
      if (!posted) return new Response("not found", { status: 404 });
      return coastwatch(url, init)!;
    });
    return asked;
  }

  it("asks one range at each step, keeps what it read, and has the day once its two variables are read", async () => {
    const asked = server();
    let state: L3s = { jours: [] };
    let steps = 0;
    while (!state.jours.length && steps < 30) {
      state = await step(state, new Date(NOON + steps * 10 * MIN));
      steps++;
      expect(asked).toHaveLength(steps);
    }
    expect(state.lecture).toBeUndefined();
    expect(state.jours[0].date).toBe("2026-11-06");
    // The island's clear water of that day, read the same with h5py from NOAA's file.
    expect(state.jours[0].pixels).toHaveLength(1229);
    expect(nearest(state.jours, 55.2265, -21.0743)).toMatchObject({ date: "2026-11-06", distance_km: expect.any(Number) });
    expect(steps).toBeGreaterThan(5);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.every((a) => a.startsWith(dayUrl("2026-11-06")) && / bytes=\d+-\d+$/.test(a))).toBe(true);
    // Read: not asked again that day.
    expect(await step(state, new Date(NOON + 60 * MIN))).toBe(state);
    expect(asked).toHaveLength(steps);
  });

  it("asks a day not posted yet again after half an hour, not before", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let asked = server(false);
    let state = await step({ jours: [] }, new Date(NOON));
    expect(state.lecture).toMatchObject({ date: "2026-11-06", essai: NOON });
    expect(asked).toHaveLength(1);
    asked = server();
    expect(await step(state, new Date(NOON + 29 * MIN))).toBe(state);
    expect(asked).toHaveLength(0);
    state = await step(state, new Date(NOON + 31 * MIN));
    expect(asked).toHaveLength(1);
    expect(state.lecture?.essai).toBeUndefined();
  });

  it("keeps the reading in KV, says it is under way, and fails only when no day was read nor is being read", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    server(false);
    let now = NOON;
    const cache = new Cache(new MemoryStore(), () => now);
    await expect(grid(cache, new Date(now))).rejects.toThrow("aucun jour lu");
    server();
    now += 31 * MIN;
    const first = await grid(cache, new Date(now));
    expect(first).toMatchObject({ value: [], enCours: true });
    for (let i = 0; i < 30 && !(await cache.kept<L3s>(KEY))?.value.jours.length; i++) {
      now += 10 * MIN;
      await grid(cache, new Date(now));
    }
    const g = await grid(cache, new Date(now));
    expect(g.value.map((d) => d.date)).toEqual(["2026-11-06"]);
    expect(g.enCours).toBeUndefined();
  });
});

describe("meteofrance", () => {
  const rows = mfParse(fixture("meteofrance_6min.csv"));

  it("keeps the Réunion rows of a slot", () => {
    expect(rows).toHaveLength(56);
    expect(rows.every((r) => r.id.startsWith("974"))).toBe(true);
    const france = "lat;lon;geo_id_insee;validity_time;t\n46.2;5.6;01014002;2026-10-22T05:18:00Z;277.05\n";
    expect(mfParse(france)).toEqual([]);
  });

  it("converts Kelvin, m/s and Pa, and names the station", () => {
    const o = mfObservation(rows.find((r) => r.id === "97418110")!, 0)!;
    expect(o.station).toMatchObject({ nom: "Saint-Denis Gillot (aéroport)", altitude_m: 8 });
    expect(o.time.toISOString()).toBe("2026-10-22T05:18:00.000Z");
    const r = Object.fromEntries(o.readings.map((x) => [x.variable, x.valeur]));
    expect(r).toMatchObject({ temperature: 27.9, humidite: 64, vent_moyen: 18, rafales: 21, vent_direction: 70, pluie_6min: 0, pluie_1h: 0, pression_mer: 1020.1 });
  });

  it("leaves out what a station does not measure", () => {
    const o = mfObservation(rows.find((r) => r.id === "97424410")!, null)!;
    expect(o.station.nom).toBe("Cilaos");
    expect(o.readings.map((x) => x.variable)).toEqual(["temperature", "vent_moyen", "vent_direction", "rafales", "pluie_6min"]);
  });
});
