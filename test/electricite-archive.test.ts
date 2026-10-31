import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { counted } from "../src/budget.js";
import { Cache, type CacheEntry, MemoryStore } from "../src/cache.js";
import * as edf from "../src/providers/edf.js";
import { buildElectricite } from "../src/web/data.js";
import { parts } from "../src/web/electricite-carte.js";
import { dureeOf, type Historique } from "../src/web/electricite-historique.js";

// 31/10/2026 from 04:00 (La Réunion): a line every 5 minutes, the sun rising, the rest steady.
const H0 = Date.parse("2026-10-31T00:00:00Z");
const ligne = (t: number, pv: number): edf.Mix => ({
  date: new Date(t).toISOString(), photovoltaique: pv, eolien: 5, hydraulique: 25, bioenergies: 51, charbon: 77, diesel: 108, turbines_combustion: 14, stockage: -1, total: 280 + pv, statut: "Estimé",
});
const lignes = (from: number, n: number) => Array.from({ length: n }, (_, i) => ligne(from + i * 300_000, i));
const h = (t: number) => Math.floor(t / 3600_000);

beforeEach(() => edf.oublierArchive());
afterEach(() => vi.unstubAllGlobals());

describe("rundata.re's archive of EDF's production", () => {
  it("keeps each complete hour of the day, the means of its lines, never the hour still going nor one with too few lines", () => {
    // 04:00 to 05:55, and 06:00 still going; 07:00 has 5 lines, then 08:00 one.
    const day = [...lignes(H0, 24), ligne(H0 + 2 * 3600_000, 0), ...lignes(H0 + 3 * 3600_000, 5), ligne(H0 + 4 * 3600_000, 0)];
    const hs = edf.heuresOf(day);
    expect(hs.map((x) => x[0])).toEqual([h(H0), h(H0) + 1, h(H0) + 2].filter((x) => x !== h(H0) + 2));
    // 04:00: photovoltaïque 0 to 11, its mean 5.5; the others as read, the batteries charging kept as EDF says.
    expect(hs[0]).toEqual([h(H0), 5.5, 5, 25, 51, 77, 108, 14, -1, 285.5]);
    expect(hs[1][1]).toBe(17.5);
  });

  it("puts a new hour over an older one of the same hour, and forgets what is older than 400 days", () => {
    const now = new Date(H0);
    const old = [h(H0) - 401 * 24, 1, 1, 1, 1, 1, 1, 1, 0, 7];
    const kept = [h(H0) - 2, 9, 9, 9, 9, 9, 9, 9, 0, 63];
    const fresh = [h(H0) - 2, 1, 2, 3, 4, 5, 6, 7, 0, 28];
    expect(edf.fusion([old, kept], [fresh, [h(H0) - 1, ...fresh.slice(1)]], now)).toEqual([fresh, [h(H0) - 1, ...fresh.slice(1)]]);
  });

  it("is written once an hour: a read of KV, then nothing until a new hour completes", async () => {
    const store = new MemoryStore();
    const gets = vi.spyOn(store, "get");
    const puts = vi.spyOn(store, "put");
    const cache = new Cache(new MemoryStore(), () => H0 + 3 * 3600_000, true, store);
    await edf.archiver(cache, { lignes: lignes(H0, 25) }, new Date(H0 + 3 * 3600_000));
    expect([gets.mock.calls.length, puts.mock.calls.length]).toEqual([1, 1]);
    // Kept 430 days in KV, its hours as heuresOf gives them.
    expect(puts.mock.calls[0][2]).toBe(430 * 86_400);
    expect((puts.mock.calls[0][1] as CacheEntry).value).toEqual({ heures: edf.heuresOf(lignes(H0, 25)) });
    await edf.archiver(cache, { lignes: lignes(H0, 25) }, new Date(H0 + 3 * 3600_000));
    expect([gets.mock.calls.length, puts.mock.calls.length]).toEqual([1, 1]);
    // Another isolate, the hour already there: read, not written.
    edf.oublierArchive();
    await edf.archiver(cache, { lignes: lignes(H0, 25) }, new Date(H0 + 3 * 3600_000));
    expect([gets.mock.calls.length, puts.mock.calls.length]).toEqual([2, 1]);
    // A new hour: added to what was kept.
    await edf.archiver(cache, { lignes: lignes(H0, 37) }, new Date(H0 + 4 * 3600_000));
    expect(puts.mock.calls.length).toBe(2);
    expect(((puts.mock.calls[1][1] as CacheEntry).value as edf.Archive).heures.map((x) => x[0])).toEqual([h(H0), h(H0) + 1, h(H0) + 2]);
  });

  it("waits for a pass that leaves enough after it, outside the copy's cost", async () => {
    const store = new MemoryStore();
    const gets = vi.spyOn(store, "get");
    const cache = new Cache(new MemoryStore(), () => H0 + 3 * 3600_000, true, store);
    // A pass with 100 subrequests left: what the agendas and /chiffres need after the copies; nothing read.
    await counted(100, () => edf.archiver(cache, { lignes: lignes(H0, 25) }, new Date(H0 + 3 * 3600_000)));
    expect(gets).not.toHaveBeenCalled();
    await counted(500, () => edf.archiver(cache, { lignes: lignes(H0, 25) }, new Date(H0 + 3 * 3600_000)));
    expect(gets).toHaveBeenCalledTimes(1);
  });

  it("leaves the page's copy and its 24 hours written when the archive cannot be", async () => {
    const day = { results: [...lignes(H0, 25)].reverse() };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("njq-knwu0diqrdup6tya8qxi")) return Response.json(day);
      return new Response("", { status: 404 });
    });
    const store = new MemoryStore();
    const durable = new MemoryStore();
    vi.spyOn(durable, "put").mockRejectedValue(new Error("KV : quota"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const now = new Date(H0 + 2 * 3600_000 + 60_000);
    const d = await buildElectricite(new Cache(store, () => now.getTime(), true, durable), now);
    expect(d.journee?.points).toHaveLength(25);
    expect((await store.get("edf:journee"))?.value).toBeDefined();
    expect(log.mock.calls.some((c) => String(c[0]).includes("archive non écrite"))).toBe(true);
  });
});

describe("the chart over 7 and 30 days", () => {
  const hours = (n: number) => Array.from({ length: n }, (_, i) => [h(H0) + i, i, 5, 25, 51, 77, 108, 14, 0, 280 + i]);

  it("takes a point an hour, from the archive's first hour when it is shorter than the duration", () => {
    const j = dureeOf(hours(30), 7, 1)!;
    expect(j.points).toHaveLength(30);
    expect(j.depuis).toBe(new Date(H0).toISOString());
    // Renewable as tools/electricite.ts counts EDF's filières (its charbon and diesel lines included), the turbines not.
    expect(j.points[1]).toEqual([60, 1 + 5 + 25 + 51 + 77 + 108, 14, 281]);
    expect(j.filieres![1]).toEqual([1, 5, 25, 51 + 77 + 108 + 14, 0]);
  });

  it("takes a point every 3 hours on La Réunion's hours, the mean of its hours, and no « depuis » once full", () => {
    // From 04:00 (La Réunion): 03:00 to 06:00 has 2 hours, then 3 each.
    const j = dureeOf(hours(30 * 24 + 5), 30, 3)!;
    expect(j.depuis).toBeUndefined();
    expect(j.points.length).toBeGreaterThanOrEqual(240);
    expect(j.points.length).toBeLessThanOrEqual(241);
    expect(new Date(Date.parse(j.debut) + 4 * 3600_000).getUTCHours() % 3).toBe(0);
  });

  it("has none under two points", () => {
    expect(dureeOf(hours(1), 7, 1)).toBeUndefined();
    expect(dureeOf([], 30, 3)).toBeUndefined();
  });
});

describe("/electricite/historique.json", () => {
  it("serves the durations from the archive and EDF's years read once, never EDF's production", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const u = String(input);
      asked.push(u);
      if (u.includes("bgsxf72q0jmza3q4ed6qon2n")) {
        return Response.json({ results: [{ annee_prod: 2024, solaire_photovoltaique: 310551, eolien: 35404, hydraulique: 419186, bioenergie: 2069042, charbon: 40607, moteurs_diesel: 32295, turbines_a_combustion_fioul: 157155, total: 3064242, part_enr: 92.49 }, { annee_prod: 2023, total: 3081584, part_enr: 56.6 }] }, { headers: { "last-modified": "Thu, 23 Oct 2025 13:23:00 GMT" } });
      }
      return new Response("", { status: 404 });
    });
    const store = new MemoryStore();
    const heures = Array.from({ length: 50 }, (_, i) => [h(H0) + i, i, 5, 25, 51, 77, 108, 14, 0, 280 + i]);
    await store.put(edf.ARCHIVE_KEY, { value: { heures }, fetchedAt: H0 });
    const now = H0 + 50 * 3600_000;
    const r = await handle(new Request("https://rundata.re/electricite/historique.json"), new Cache(store, () => now));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=900");
    const j = (await r.json()) as Historique;
    expect(j.depuis).toBe(new Date(H0).toISOString());
    expect(j.j7?.p).toHaveLength(50);
    expect(j.j7?.f).toEqual(parts(dureeOf(heures, 7, 1)!.filieres!));
    expect(j.j7?.depuis).toBe(new Date(H0).toISOString());
    expect(j.j30?.pas).toBe(3);
    expect(j.annuel?.annees.map((y) => y.annee)).toEqual([2023, 2024]);
    expect(j.annuel?.annees[1].filieres).toEqual([310551, 35404, 419186, 2069042, 40607, 32295, 157155]);
    expect(j.annuel?.mis_a_jour).toBe("2025-10-23T13:23:00.000Z");
    expect(asked.some((u) => u.includes("njq-knwu0diqrdup6tya8qxi"))).toBe(false);
    // Within the day, EDF's years not read again.
    await handle(new Request("https://rundata.re/electricite/historique.json"), new Cache(store, () => now + 3600_000));
    expect(asked.filter((u) => u.includes("bgsxf72q0jmza3q4ed6qon2n"))).toHaveLength(1);
  });
});
