import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as openmeteo from "../src/providers/openmeteo.js";
import { resolvePlace } from "../src/places/resolve.js";
import { withLectures } from "../src/lectures.js";
import type { Place } from "../src/places/resolve.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const meta = JSON.parse(fixture("openmeteo_meta.json"));
// The fixture's run was out at last_run_availability_time; the next one six hours after its initialisation, out later.
const OUT = meta.last_run_availability_time * 1000;
const NEXT = { ...meta, last_run_initialisation_time: meta.last_run_initialisation_time + 6 * 3600, last_run_availability_time: meta.last_run_availability_time + 6 * 3600 };
const MIN = 60_000;
const cilaos = resolvePlace("Cilaos")!.lieu;

describe("Open-Meteo's forecast, one copy per cell and per run of the model", () => {
  let asked: string[];
  let run: typeof meta;
  beforeEach(() => {
    asked = [];
    run = meta;
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(url.includes("/static/meta.json") ? JSON.stringify(run) : fixture("openmeteo_cilaos.json"));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const forecasts = () => asked.filter((u) => u.includes("/v1/forecast"));
  // Each question its own isolate (memory), all of them the same KV.
  const isolate = (kv: MemoryStore, clock: { t: number }) => new Cache(new MemoryStore(), () => clock.t, false, kv);

  it("sends Open-Meteo the point to 0.01° and the altitude to 10 m, and keys the copy on that", () => {
    const p: Place = { ...cilaos, lat: -21.13649, lon: 55.47121, altitude_m: 1214 };
    expect(openmeteo.cacheKey(p)).toBe("openmeteo:-21.14,55.47,1210");
    expect(openmeteo.cacheKey({ ...p, altitude_m: 1205 })).toBe("openmeteo:-21.14,55.47,1210");
    expect(openmeteo.cacheKey({ ...p, altitude_m: undefined })).toBe("openmeteo:-21.14,55.47,dem");
  });

  it("reads a cell once for every question of the same run, in another isolate too, and again once the next run is out", async () => {
    const kv = new MemoryStore();
    const clock = { t: OUT + 30 * MIN };
    const first = await openmeteo.forecast(isolate(kv, clock), cilaos);
    expect(forecasts()).toHaveLength(1);
    expect(first.value.runAt?.getTime()).toBe(meta.last_run_initialisation_time * 1000);
    // Five hours later, another isolate: the copy in KV, without Open-Meteo.
    clock.t += 5 * 60 * MIN;
    const later = await openmeteo.forecast(isolate(kv, clock), cilaos);
    expect(later).toMatchObject({ stale: false });
    expect(forecasts()).toHaveLength(1);
    // The next run out: the copy is the run before's, read again.
    run = NEXT;
    clock.t = NEXT.last_run_availability_time * 1000 + 31 * MIN;
    const next = await openmeteo.forecast(isolate(kv, clock), cilaos);
    expect(forecasts()).toHaveLength(2);
    expect(next.value.runAt?.getTime()).toBe(NEXT.last_run_initialisation_time * 1000);
  });

  it("shares one copy between two places that send the same request, and keeps two for two altitudes", async () => {
    const kv = new MemoryStore();
    const clock = { t: OUT + 30 * MIN };
    const here: Place = { ...cilaos, lat: -21.1362, lon: 55.4712, altitude_m: 1211 };
    const near: Place = { ...cilaos, nom: "à côté", lat: -21.1371, lon: 55.4709, altitude_m: 1208 };
    await openmeteo.forecast(isolate(kv, clock), here);
    await openmeteo.forecast(isolate(kv, clock), near);
    expect(forecasts()).toHaveLength(1);
    await openmeteo.forecast(isolate(kv, clock), { ...here, altitude_m: 1400 });
    expect(forecasts()).toHaveLength(2);
    expect(forecasts()[1]).toContain("elevation=1400");
    expect(await kv.get(`lecture:${openmeteo.cacheKey(here)}`)).toBeDefined();
    // Each says its own altitude, not the one sent to 10 m.
    expect((await openmeteo.forecast(isolate(kv, clock), near)).value.altitude_m).toBe(1208);
  });

  it("is fresh until the next run is out, six hours at most without the run's time", () => {
    expect(openmeteo.freshFor(OUT + 2 * 60 * MIN, OUT)).toBe(2 * 3600);
    expect(openmeteo.freshFor(OUT + 9 * 60 * MIN, OUT)).toBe(6 * 3600);
    expect(openmeteo.freshFor(OUT + 10_000, OUT)).toBe(60);
    expect(openmeteo.freshFor(OUT)).toBe(6 * 3600);
  });

  it("leaves the run's file out of the answer's freshness, and its copy kept after a failure out of the run's time", async () => {
    // 13 to 16/11/2026: meta.json answered HTTP 404 to the Worker now and then; its copy of 12/11, 90 h old, made the
    // answers say « copie de secours, il y a 90 h » and the run of 12/11, while the forecast was minutes old.
    const kv = new MemoryStore();
    const clock = { t: OUT + 90 * 60 * MIN };
    // The isolate's copy of the run's file (cache.get reads the isolate's stores, not KV).
    const mem = new MemoryStore();
    await mem.put("openmeteo:meta", { value: meta, fetchedAt: OUT });
    let down = true;
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.includes("/static/meta.json")) return down ? new Response("", { status: 404 }) : new Response(JSON.stringify(run));
      return new Response(fixture("openmeteo_cilaos.json"));
    });
    const { value, lectures } = await withLectures(() => openmeteo.forecast(new Cache(mem, () => clock.t, false, kv), cilaos));
    expect(value.stale).toBe(false);
    expect(value.value.runAt).toBeUndefined();
    expect(lectures.map((l) => l.key)).toEqual([openmeteo.cacheKey(cilaos)]);
    expect(lectures.some((l) => l.stale)).toBe(false);
    // The file answers again, its breaker closed: the run's time is back, still not in the freshness.
    down = false;
    run = { ...meta, last_run_initialisation_time: Math.floor(clock.t / 1000) - 7 * 3600, last_run_availability_time: Math.floor(clock.t / 1000) - 3600 };
    clock.t += 31 * MIN;
    const again = await withLectures(() => openmeteo.forecast(new Cache(mem, () => clock.t, false, kv), cilaos));
    expect(again.value.value.runAt?.getTime()).toBe(run.last_run_initialisation_time * 1000);
    expect(again.lectures.some((l) => l.key === "openmeteo:meta")).toBe(false);
  });

  it("keeps the run's time of a copy kept after a failure while no newer run can be out", async () => {
    const kv = new MemoryStore();
    const clock = { t: OUT + 2 * 60 * MIN };
    // The isolate's copy of the run's file (cache.get reads the isolate's stores, not KV).
    const mem = new MemoryStore();
    await mem.put("openmeteo:meta", { value: meta, fetchedAt: OUT });
    vi.stubGlobal("fetch", async (url: string) => (url.includes("/static/meta.json") ? new Response("", { status: 404 }) : new Response(fixture("openmeteo_cilaos.json"))));
    const f = await openmeteo.forecast(new Cache(mem, () => clock.t, false, kv), cilaos);
    expect(f.value.runAt?.getTime()).toBe(meta.last_run_initialisation_time * 1000);
  });
});
