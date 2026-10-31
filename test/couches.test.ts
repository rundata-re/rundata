import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as dae from "../src/providers/dae.js";
import * as irve from "../src/providers/irve.js";
import { REGISTRY } from "../src/registre.js";
import * as enfants from "../src/vie/enfants.js";
import { COUCHES, couchePath, type CoucheJson, MAX_GZIP } from "../src/web/couches.js";

const NOW = new Date("2026-10-31T18:00:00Z");

beforeEach(() => {
  // A layer reads nothing: any fetch fails the test.
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => { throw new Error(`lu : ${String(url)}`); }));
});
afterEach(() => vi.unstubAllGlobals());

/** As the Worker serves it, its subrequests counted, the work after the response included. */
async function serve(path: string) {
  const { value, settled } = await counted(PAGE_BUDGET, () => handle(new Request(`https://rundata.re${path}`), new Cache(new MemoryStore(), () => NOW.getTime())));
  const total = await settled();
  return { r: value, text: await value.text(), used: total.used, reads: total.reads };
}

describe("the layers of /carte", () => {
  it("are the three fixed lists, the places for children one layer for each of their sources", () => {
    expect(COUCHES.map((c) => c.id)).toEqual(["defibrillateurs", "bornes", "enfants-osm", "enfants-data-es", "enfants-basilic"]);
    expect(new Set(COUCHES.map((c) => c.id)).size).toBe(COUCHES.length);
    for (const c of COUCHES) expect([c.nature, c.forme], c.id).toEqual(["fixe", "points"]);
  });

  it("send each its file, cached, with nothing read", async () => {
    for (const c of COUCHES) {
      const { r, text, used, reads } = await serve(couchePath(c.id));
      expect(r.status, c.id).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(r.headers.get("access-control-allow-origin")).toBe("*");
      expect([used, reads.size], c.id).toEqual([0, 0]);
      const j = JSON.parse(text) as CoucheJson;
      expect([j.id, j.nom, j.nature, j.precision], c.id).toEqual([c.id, c.nom, c.nature, c.precision]);
      expect(j.source, c.id).toEqual(c.source);
    }
  });

  it("give every object its nature, its precision and the time of its source", async () => {
    const heures: Record<string, string> = { defibrillateurs: dae.BUILT, bornes: irve.BUILT, "enfants-osm": enfants.BUILT, "enfants-data-es": enfants.BUILT, "enfants-basilic": enfants.BUILT };
    for (const c of COUCHES) {
      const j = c.donnees();
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
    const n = (id: string) => COUCHES.find((c) => c.id === id)!.donnees().objets.length;
    expect(n("defibrillateurs")).toBe(dae.DAES.length);
    expect(n("bornes")).toBe(irve.STATIONS.length);
    expect(n("enfants-osm") + n("enfants-data-es") + n("enfants-basilic")).toBe(enfants.LIEUX.length);
    expect(COUCHES.find((c) => c.id === "enfants-osm")!.source.licence).toBe("ODbL 1.0");
    // Only OpenStreetMap's places link to OpenStreetMap.
    for (const id of ["enfants-data-es", "enfants-basilic"]) {
      for (const o of COUCHES.find((c) => c.id === id)!.donnees().objets) expect(o.lien ?? "").not.toContain("openstreetmap.org");
    }
  });

  it("weigh at most 30 Ko compressed each", () => {
    for (const c of COUCHES) expect(gzipSync(JSON.stringify(c.donnees())).length, c.id).toBeLessThan(MAX_GZIP);
  });

  it("leave a path that names no layer to the page not found", async () => {
    for (const p of ["/carte/couche/inconnue.json", "/carte/couche/bornes", "/carte/couche/../bornes.json"]) {
      const { r, used } = await serve(p);
      expect(r.status, p).toBe(404);
      expect(used, p).toBeLessThanOrEqual(REGISTRY.find((e) => e.id === "*")!.run.subrequests);
    }
  });

  it("are in the budget's registry, with nothing read", () => {
    const e = REGISTRY.find((x) => x.id === "/carte/couche/*.json")!;
    expect([e.run.subrequests, e.run.kvReads ?? 0, e.run.d1Calls ?? 0]).toEqual([0, 0, 0]);
  });
});
