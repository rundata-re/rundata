import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as irve from "../src/providers/irve.js";
import { REGISTRY } from "../src/registre.js";
import { ORDRE, PAR_DEFAUT } from "../src/web/carte.js";
import { COUCHES } from "../src/web/couches.js";
import { borneRow } from "../src/web/domains.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => { throw new Error(`lu : ${String(url)}`); }));
});
afterEach(() => vi.unstubAllGlobals());

async function serve(path: string) {
  const { value, settled } = await counted(PAGE_BUDGET, () => handle(new Request(`https://rundata.re${path}`), new Cache(new MemoryStore(), () => Date.parse("2026-10-31T18:00:00Z"))));
  const total = await settled();
  return { r: value, html: await value.text(), used: total.used };
}

describe("/carte", () => {
  it("is the island's map that zooms, a box and a block per layer, out of the search engines until the menu has it", async () => {
    const { r, html, used } = await serve("/carte");
    expect(r.status).toBe(200);
    expect(used).toBeLessThanOrEqual(REGISTRY.find((e) => e.id === "/carte")!.run.subrequests);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('id="kmap" data-kc=""');
    expect(html).toContain('class="kzoom" data-fd="k"');
    for (const c of COUCHES) {
      expect(html, c.id).toContain(`<input type="checkbox" name="c" value="${c.id}">`);
      expect(html, c.id).toContain(`<article class="kp" data-c="${c.id}" hidden>`);
    }
    // The script's settings, readable as JSON.
    const conf = JSON.parse(/<script type="application\/json" id="k-conf">(.*?)<\/script>/.exec(html)![1]);
    expect(conf.couches.map((c: { id: string }) => c.id)).toEqual(COUCHES.map((c) => c.id));
    expect(conf.dae["Saint-Pierre"]).toBe("c-saint-pierre");
  });

  it("draws every layer but the rain in a group of its own, in a fixed order, and ticks the weather when the address names none", () => {
    expect([...ORDRE].sort()).toEqual(COUCHES.filter((c) => c.id !== "pluie").map((c) => c.id).sort());
    expect(PAR_DEFAUT.every((id) => COUCHES.some((c) => c.id === id))).toBe(true);
  });

  it("leads a charging station's bubble to its row of /bornes", () => {
    const s = irve.STATIONS[0];
    const row = { id: s.id, station: s.nom, commune: s.commune, reseau: s.reseau, puissance_max_kw: 22, prises: ["Type 2"], horaires: "24 h/24, 7 j/7", carte: "", lon: s.lon, lat: s.lat, libres: 1, total: 2 };
    expect(borneRow(row as Parameters<typeof borneRow>[0], undefined, true)).toContain(`<li id="s-${s.id}" class="tgt">`);
  });
});
