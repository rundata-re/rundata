import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as dae from "../src/providers/dae.js";
import * as irve from "../src/providers/irve.js";
import { REGISTRY } from "../src/registre.js";
import * as enfants from "../src/vie/enfants.js";
import * as seismes from "../src/providers/seismes.js";
import * as vigicrues from "../src/providers/vigicrues.js";
import { COUCHES, couchePath, type CoucheJson, MAX_GZIP } from "../src/web/couches.js";

const NOW = new Date("2026-10-31T18:00:00Z");

beforeEach(() => {
  // A layer reads nothing: any fetch fails the test.
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => { throw new Error(`lu : ${String(url)}`); }));
  // The route takes its time from the clock, the cache from NOW: the same, or a copy's age depends on when the test runs.
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** As the Worker serves it, its subrequests counted, the work after the response included. */
async function serve(path: string, store = new MemoryStore()) {
  const { value, settled } = await counted(PAGE_BUDGET, () => handle(new Request(`https://rundata.re${path}`), new Cache(store, () => NOW.getTime())));
  const total = await settled();
  return { r: value, text: await value.text(), used: total.used, reads: total.reads };
}

const FIXES = COUCHES.filter((c) => c.donnees);
const DIRECTES = COUCHES.filter((c) => c.lire);

describe("the layers of /carte", () => {
  it("are the weather, nature, the fixed lists, the places for children one layer for each of their sources", () => {
    expect(COUCHES.map((c) => c.id)).toEqual(["stations", "pluie", "rivieres", "seismes", "sentiers", "defibrillateurs", "bornes", "enfants-osm", "enfants-data-es", "enfants-basilic"]);
    expect(new Set(COUCHES.map((c) => c.id)).size).toBe(COUCHES.length);
    for (const c of FIXES) expect([c.nature, c.forme], c.id).toEqual(["fixe", "points"]);
    // Each a file of its own, read from a page's copy or built from the bundle; the radar's rain is /meteo's file.
    for (const c of COUCHES) expect([!!c.donnees, !!c.lire, !!c.fichier].filter(Boolean).length, c.id).toBe(1);
    expect(COUCHES.find((c) => c.id === "pluie")!.fichier).toBe("/meteo/pluie-radar.json");
  });

  it("send each fixed one its file, cached, with nothing read", async () => {
    for (const c of FIXES) {
      const { r, text, used, reads } = await serve(couchePath(c.id));
      expect(r.status, c.id).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(r.headers.get("access-control-allow-origin")).toBe("*");
      expect([used, reads.size], c.id).toEqual([0, 0]);
      const j = JSON.parse(text) as CoucheJson;
      expect([j.id, j.nom, j.nature, j.precision], c.id).toEqual([c.id, c.long, c.nature, c.precision]);
      expect(j.source, c.id).toEqual(c.source);
    }
  });

  it("give every object its nature, its precision and the time of its source", async () => {
    const heures: Record<string, string> = { defibrillateurs: dae.BUILT, bornes: irve.BUILT, "enfants-osm": enfants.BUILT, "enfants-data-es": enfants.BUILT, "enfants-basilic": enfants.BUILT };
    for (const c of FIXES) {
      const j = c.donnees!();
      expect(j.heure, c.id).toBe(heures[c.id]);
      expect(j.heure).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(j.objets.length, c.id).toBeGreaterThan(0);
      for (const o of j.objets) {
        expect([o.nature, o.precision, o.heure], `${c.id} ${o.nom}`).toEqual([j.nature, j.precision, j.heure]);
        expect(o.lon).toBeGreaterThan(55.2);
        expect(o.lon).toBeLessThan(55.9);
        expect(o.lat).toBeGreaterThan(-21.4);
        expect(o.lat).toBeLessThan(-20.8);
        expect(o.nom, c.id).not.toBe("");
      }
    }
  });

  it("hold every object of their list, and one source a file", () => {
    const n = (id: string) => COUCHES.find((c) => c.id === id)!.donnees!().objets.length;
    expect(n("defibrillateurs")).toBe(dae.DAES.length);
    expect(n("enfants-osm") + n("enfants-data-es") + n("enfants-basilic")).toBe(enfants.LIEUX.length);
    expect(COUCHES.find((c) => c.id === "enfants-osm")!.source.licence).toBe("ODbL 1.0");
    // Only OpenStreetMap's places link to OpenStreetMap.
    for (const id of ["enfants-data-es", "enfants-basilic"]) {
      for (const o of COUCHES.find((c) => c.id === id)!.donnees!().objets) expect(o.lien ?? "").not.toContain("openstreetmap.org");
    }
  });

  it("weigh at most 30 Ko compressed each", () => {
    for (const c of FIXES) expect(gzipSync(JSON.stringify(c.donnees!())).length, c.id).toBeLessThan(MAX_GZIP);
  });

  it("leave a path that names no layer to the page not found", async () => {
    for (const p of ["/carte/couche/inconnue.json", "/carte/couche/bornes", "/carte/couche/../bornes.json", "/carte/couche/pluie.json"]) {
      const { r, used } = await serve(p);
      expect(r.status, p).toBe(404);
      expect(used, p).toBeLessThanOrEqual(REGISTRY.find((e) => e.id === "*")!.run.subrequests);
    }
  });

  it("are in the budget's registry: a copy read at most, never a source nor a write", () => {
    const e = REGISTRY.find((x) => x.id === "/carte/couche/*.json")!;
    expect([e.run.subrequests, e.run.kvReads ?? 0, e.run.kvWrites ?? 0, e.run.d1Calls ?? 0]).toEqual([3, 1, 0, 0]);
  });

  it("say when their page has no copy, never an empty layer that reads as « nothing there »", async () => {
    for (const c of DIRECTES) {
      const { r, text, used } = await serve(couchePath(c.id));
      expect([r.status, used], c.id).toEqual([200, 0]);
      expect(r.headers.get("cache-control"), c.id).toBe("public, max-age=120");
      const j = JSON.parse(text) as CoucheJson;
      expect([j.id, j.nom, j.copie], c.id).toEqual([c.id, c.long, "absente"]);
      // The charging stations keep their bundled list, their state said not read.
      expect(j.objets.length, c.id).toBe(c.id === "bornes" ? irve.STATIONS.length : 0);
    }
  });

  it("read their page's last copy, its objects at their time, an old one said with its time", async () => {
    const store = new MemoryStore();
    const old = NOW.getTime() - 3 * 3600_000;
    const q = { id: "q1", time: "2026-10-30T00:12:00.000Z", lon: 55.7137, lat: -21.2443, profondeur_km: -1.2, magnitude: 1.4, type_magnitude: "ml" };
    const gone = { ...q, id: "q0", time: "2026-10-20T00:12:00.000Z" };
    await store.put(seismes.KEY, { value: [q, gone], fetchedAt: old });
    const g = vigicrues.STATIONS[0];
    await store.put("web:crues", { value: { resume: "", stations: [{ station: g.nom, riviere: g.riviere, commune: g.commune, hauteur_m: 1.24, tendance_30_min: "en hausse", heure_mesure: "21:45" }], sources: [] }, fetchedAt: NOW.getTime() - 60_000 });
    const s = irve.STATIONS[3];
    await store.put("web:bornes", { value: { stations: [{ id: s.id, station: s.nom, lon: s.lon, lat: s.lat, libres: 2, total: 4 }] }, fetchedAt: NOW.getTime() - 60_000 });
    const sq = JSON.parse((await serve(couchePath("seismes"), store)).text) as CoucheJson;
    expect([sq.copie, sq.heure]).toEqual(["ancienne", new Date(old).toISOString()]);
    // The last 7 days only, each at its own time, where the OVPF located it.
    expect(sq.objets.map((o) => [o.heure, o.nom, o.infos!.magnitude])).toEqual([[q.time, seismes.SOMMET, 1.4]]);
    const cr = JSON.parse((await serve(couchePath("rivieres"), store)).text) as CoucheJson;
    expect(cr.copie).toBeUndefined();
    expect(cr.objets).toMatchObject([{ nom: g.nom, lon: g.lon, lat: g.lat, nature: "mesure", infos: { hauteur_m: 1.24, tendance: "en hausse", heure_mesure: "21:45" } }]);
    const bo = JSON.parse((await serve(couchePath("bornes"), store)).text) as CoucheJson;
    expect(bo.objets).toMatchObject([{ lien: `/bornes#s-${s.id}`, infos: { libres: 2, total: 4 } }]);
  });
});
