import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as irve from "../src/providers/irve.js";
import { REGISTRY } from "../src/registre.js";
import { DIRECT_VERS, MOTS, ORDRE, PAR_DEFAUT, VUES } from "../src/web/carte.js";
import { CARTE_CSS } from "../src/web/carte-style.js";
import { PLEIN_ECRAN_CSS, pleinEcran } from "../src/web/plein-ecran.js";
import { COUCHES, RESUME_PATH } from "../src/web/couches.js";
import { borneRow } from "../src/web/domains.js";
import { VENT_DE, ventDe } from "../src/web/meteo-carte.js";

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
  it("is the island's map that zooms, a box and a block per layer, open to the search engines", async () => {
    const { r, html, used } = await serve("/carte");
    expect(r.status).toBe(200);
    expect(used).toBeLessThanOrEqual(REGISTRY.find((e) => e.id === "/carte")!.run.subrequests);
    expect(html).not.toContain("noindex");
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
    // A button per view, its address its own; the full screen's script, after the page's.
    for (const v of VUES) expect(html, v.id).toContain(`<a href="#${v.id}" data-v="${v.id}">`);
    expect(conf.vues.map((v: { id: string }) => v.id)).toEqual(VUES.map((v) => v.id));
    expect(html.indexOf('className="pe-b"')).toBeGreaterThan(html.indexOf('id="k-conf"'));
    // A fixed list's chip: the date of its data when its producer gives one, else the day it was read, never « liste du ».
    expect(html).not.toMatch(/<span class="kh" data-c="[^"]+"> · liste du/);
    expect(html).toMatch(/<span class="kh" data-c="vitesses"> · mise à jour d'août 2024<\/span>/);
    expect(html).toMatch(/<span class="kh" data-c="canyons"> · inventaire sans date<\/span>/);
    expect(html).toMatch(/<span class="kh" data-c="defibrillateurs"> · lue le \d\d\/\d\d<\/span>/);
  });

  it("says a station's wind with its direction in words when there is one, never « vent undefined »", async () => {
    const { html } = await serve("/carte");
    const conf = JSON.parse(/<script type="application\/json" id="k-conf">(.*?)<\/script>/.exec(html)![1]);
    expect(conf.vent).toEqual(VENT_DE);
    // The bubble's words come from the function of /meteo's tiles, put in the script as is.
    expect(html).toContain(`ventd=${ventDe};`);
    expect(html).toContain(`"vent "+ventd(i.direction,i.vent,K.vent)+Math.round(i.vent)`);
    expect(html).not.toContain("i.direction??-1");
  });

  it("in full screen on a phone, puts the map's buttons in their place, never over it, and the legend over the panel", async () => {
    const { html } = await serve("/carte");
    // The buttons over the map only on a large screen, where they sit over the sea of its corner.
    const wide = PLEIN_ECRAN_CSS.indexOf("@media (min-width:48rem){");
    const over = [...PLEIN_ECRAN_CSS.matchAll(/\.pe-on \.pe-c\{position:absolute/g)].map((m) => m.index);
    expect(over).toHaveLength(1);
    expect(over[0]).toBeGreaterThan(wide);
    expect(PLEIN_ECRAN_CSS).toMatch(/@media \(min-width:48rem\) and \(max-height:35\.98rem\)\{[^@]*\.pe-on \.pe-c\{position:static/);
    // On a phone, the panel in the map's block, the legend at its top; the same screens in the script as in the style.
    const s = pleinEcran({ boite: ".b", carte: ".c", barre: ".z", panneau: [], legende: ".c>figcaption" });
    expect(s).toContain('matchMedia("(min-width:48rem) and (min-height:36rem)")');
    expect(s).toContain("(small?map:box).append(p)");
    expect(s).toContain("p.prepend(leg)");
    expect(PLEIN_ECRAN_CSS).toContain(".pe-p:empty{display:none}");
    expect(html).toContain('"legende":".kmapc\\u003efigcaption"');
  });

  it("has views that tick layers there are, at least two of them crossing two layers, the weather now first", () => {
    for (const v of VUES) for (const id of v.couches) expect(COUCHES.some((c) => c.id === id), `${v.id} ${id}`).toBe(true);
    expect(VUES.filter((v) => v.couches.length >= 2).length).toBeGreaterThanOrEqual(2);
    expect(new Set(VUES.map((v) => v.id)).size).toBe(VUES.length);
    expect(VUES[0].id).toBe("meteo");
    // Each frame within the island's, west before east, south before north.
    for (const v of VUES.filter((x) => x.cadre)) {
      const [o, s, e, n] = v.cadre!;
      expect(o < e && s < n && o >= 55.19 && e <= 55.86 && s >= -21.41 && n <= -20.85, v.id).toBe(true);
    }
  });

  it("is in the menu of every page, in the sitemap, and the weather's map leads to its view", async () => {
    const home = await serve("/meteo");
    expect(home.html).toContain('href="/carte"');
    const map = await serve("/sitemap.xml");
    expect(map.html).toContain("<loc>https://rundata.re/carte</loc>");
  });

  it("draws every layer but the rain in a group of its own, in a fixed order, and ticks the weather when the address names none", () => {
    expect([...ORDRE].sort()).toEqual(COUCHES.filter((c) => c.id !== "pluie").map((c) => c.id).sort());
    expect(PAR_DEFAUT.every((id) => COUCHES.some((c) => c.id === id))).toBe(true);
  });

  it("has its « En direct » band over the map, each figure leading to a view or a layer there is, and its views on the map's sea", async () => {
    const { html } = await serve("/carte");
    expect(html).toContain('<p class="kdir" hidden>');
    expect(html.indexOf('class="kdir"')).toBeLessThan(html.indexOf('class="card mapcard kmapc"'));
    expect(html).toMatch(/<figure class="card mapcard kmapc"><nav class="kvues"/);
    const conf = JSON.parse(/<script type="application\/json" id="k-conf">(.*?)<\/script>/.exec(html)![1]);
    expect([conf.resume, conf.direct]).toEqual([RESUME_PATH, DIRECT_VERS]);
    expect(Object.keys(DIRECT_VERS)).toEqual(Object.keys(MOTS.enDirect));
    for (const h of Object.values(DIRECT_VERS)) {
      const c = /^#c=(.+)$/.exec(h);
      expect(c ? COUCHES.some((x) => x.id === c[1]) : VUES.some((v) => `#${v.id}` === h), h).toBe(true);
    }
    // None, one, many: the figure in the words but for none.
    for (const [k, w] of Object.entries(MOTS.enDirect)) expect(w.map((x) => x.includes("{n}")), k).toEqual([false, true, true]);
  });

  it("moves only when the phone allows it: the rings' pulse and the band's dot", () => {
    const calm = /@media \(prefers-reduced-motion:no-preference\)\{([^@]*)\}/.exec(CARTE_CSS)![1];
    expect(calm).toContain("animation:kpulse");
    expect(calm).toContain("animation:kbeat");
    expect(CARTE_CSS.split("animation:").length - 1).toBe(2);
  });

  it("leads a charging station's bubble to its row of /bornes", () => {
    const s = irve.STATIONS[0];
    const row = { id: s.id, station: s.nom, commune: s.commune, reseau: s.reseau, puissance_max_kw: 22, prises: ["Type 2"], horaires: "24 h/24, 7 j/7", carte: "", lon: s.lon, lat: s.lat, libres: 1, total: 2 };
    expect(borneRow(row as Parameters<typeof borneRow>[0], undefined, true)).toContain(`<li id="s-${s.id}" class="tgt">`);
  });
});
