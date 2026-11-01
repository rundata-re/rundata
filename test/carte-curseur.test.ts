import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import island from "../src/places/island.json" with { type: "json" };
import * as meteofrance from "../src/providers/meteofrance.js";
import { CARTE_CSS } from "../src/web/carte-style.js";
import { curseurScript, curseurScriptPath, LONGUEURS } from "../src/web/carte-curseur.js";
import { project, W, H } from "../src/web/map.js";
import { PATHS } from "../src/web/rejeu.js";
import { site } from "../src/web/site.js";

async function serve(path: string) {
  const { value, settled } = await counted(PAGE_BUDGET, () => handle(new Request(`https://rundata.re${path}`), new Cache(new MemoryStore(), () => Date.parse("2026-10-31T18:00:00Z"))));
  const total = await settled();
  return { r: value, html: await value.text(), used: total.used };
}

describe("/carte's time cursor", () => {
  it("is a bar under the map, hidden without a script, in « Revoir »'s words, with /meteo's files of 6 and 24 hours", async () => {
    const { html, used } = await serve("/carte");
    expect(used).toBe(0);
    const bar = html.indexOf(`<div class="kcur" data-cur="${curseurScriptPath()}" hidden><fieldset class="tabs"><legend>Revoir\u00a0:</legend>`);
    expect(bar).toBeGreaterThan(html.indexOf('<svg id="kmap"'));
    expect(bar).toBeLessThan(html.indexOf('<figcaption class="note"><ul class="klg"'));
    for (const w of ['<label for="kcd-6h">6 h</label>', '<label for="kcd-24h">24 h</label>', 'aria-label="Lire les 6 dernières heures">▶ Lire</button>', 'aria-label="Moment affiché sur la carte"',
      "L'historique n'a pas pu être chargé\u00a0: la carte reste sur la dernière mesure. <button type=\"button\">Réessayer</button>"]) {
      expect(html).toContain(w);
    }
    // Its settings: /meteo's replay files, never asked by the page before a touch.
    const conf = JSON.parse(/<script type="application\/json" id="k-conf">(.*?)<\/script>/.exec(html)![1]);
    expect(conf.curseur.fichiers).toEqual({ "6h": PATHS["6h"], "24h": PATHS["24h"] });
    expect(conf.curseur.ms).toEqual({ "6h": 12000, "24h": 24000 });
    expect(LONGUEURS).toEqual(["6h", "24h"]);
    // Shown only while the rain or the stations are ticked; in the full screen's panel.
    expect(html).toContain('b.checked&&(b.value==="pluie"||b.value==="stations")');
    expect(html).toContain('"panneau":[".kcur",".kvues"');
  });

  it("is a script of its own, served at its address and kept a year there, asked only on a first touch", async () => {
    const get = (p: string) => site(new Request(`https://rundata.re${p}`), new Cache(new MemoryStore()), () => {});
    const res = (await get(curseurScriptPath()))!;
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe(curseurScript());
    expect((await get("/carte/curseur-ancien.js"))!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(curseurScriptPath()).toMatch(/^\/carte\/curseur-\w+\.js$/);
  });

  it("says « Revoir »'s words, never changes the address, and never says « temps réel »", () => {
    const js = curseurScript();
    expect(() => new Function(js)).not.toThrow();
    for (const w of [`"❚❚ Pause"`, `"▶ Lire"`, `"Mettre en pause"`, `"Chargement…"`, `"pas d'image radar"`, `"mesures de "`, `"image de "`,
      `"à chaque endroit, la pluie la plus forte vue par le radar de Météo-France pendant les heures écrites sur la carte"`]) {
      expect(js).toContain(w);
    }
    expect(js).not.toMatch(/history\.|location\.hash/);
    expect(js).not.toMatch(/temps r[ée]el|prévision/i);
    expect(js).not.toContain("</");
    // Less motion asked: the bar is moved by hand; the moment over the map follows the page's tokens nowhere (white on the sea).
    expect(js).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(CARTE_CSS).toContain(".kcur-m{position:absolute");
  });

  it("puts the replay's stations where /carte puts them: the same projection, to half a unit", () => {
    const [A, B, C, D] = island.bbox;
    for (const s of meteofrance.stations()) {
      const [x, y] = project(s.lon, s.lat);
      expect(Math.abs(Math.round(((s.lon - A) / (C - A)) * W * 10) / 10 - x), s.id).toBeLessThanOrEqual(0.5);
      expect(Math.abs(Math.round(((D - s.lat) / (D - B)) * H * 10) / 10 - y), s.id).toBeLessThanOrEqual(0.5);
    }
  });
});
