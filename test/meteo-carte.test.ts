import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import type { HomeData, StationNow } from "../src/web/data.js";
import { apart, esc, NOMS_SCRIPT, project } from "../src/web/map.js";
import {
  ago,
  ALT_PATH,
  bands,
  blend,
  communeOf,
  discR,
  gaugeField,
  landBreeze,
  METEO_SCRIPT,
  pace,
  rainPill,
  rejeuScript,
  rejeuScriptPath,
  meteoVariant,
  shownAt,
  soften,
  stationsMap,
  trailOf,
  ventText,
  windAt,
  windPill,
} from "../src/web/meteo-carte.js";
import { CSS, meteoPage, stationId } from "../src/web/pages.js";
import { site } from "../src/web/site.js";

const NOW = new Date("2026-10-22T05:30:00Z");
const at = "2026-10-22T05:18:00Z";

const st = (o: Partial<StationNow> & { nom: string }): StationNow => ({
  source: "meteofrance", lon: 55.5, lat: -21.1, altitude_m: 10, time: at, stale: false, ...o,
});

// Stations of the tour (named on the map) and others (dots), with and without each measure.
const GILLOT = st({ nom: "Saint-Denis Gillot (aéroport)", id: "97418110", lon: 55.528667, lat: -20.892167, altitude_m: 8, temperature: 27.9, vent: 18, direction: 70, rafales: 21, pluie_1h: 0 });
const PLAINE = st({ nom: "Plaine des Cafres", id: "97422440", lon: 55.572833, lat: -21.209167, altitude_m: 1560, temperature: 17.2, vent: 12, direction: 95, pluie_1h: 2.4 });
const BRAS_SEC = st({ nom: "Bras-Sec", id: "97422445", lon: 55.525167, lat: -21.205667, altitude_m: 1210, temperature: 19.1, pluie_1h: 0.4 });
const PLUVIO = st({ nom: "Bélouve", id: "97421260", lon: 55.5365, lat: -21.060833, altitude_m: 1500, pluie_1h: 0 });
const BALISE = st({ nom: "Balise Cambaie", source: "pioupiou", id: "1300", lon: 55.29, lat: -20.98, altitude_m: 20, vent: 22, direction: 200 });
const ALL = [GILLOT, PLAINE, BRAS_SEC, PLUVIO, BALISE];

const links = (html: string) => [...html.matchAll(/<a class="mk([^"]*)" href="([^"]+)"/g)].map((m) => ({ cls: m[1], href: m[2] }));

describe("the wind and the commune of a station", () => {
  it("says where the wind comes from in words, on 8 points, never abbreviated", () => {
    expect(ventText({ ...GILLOT, direction: 70 })).toBe("vent d'est 18 km/h, rafales 21 km/h");
    expect(ventText({ ...GILLOT, direction: 350, rafales: undefined })).toBe("vent du nord 18 km/h");
    expect(ventText({ ...GILLOT, direction: 225 })).toMatch(/^vent du sud-ouest /);
    expect(ventText({ ...GILLOT, direction: 270 })).toMatch(/^vent d'ouest /);
    // Calm: no direction measured, the speed alone.
    expect(ventText({ ...GILLOT, vent: 0, direction: undefined, rafales: undefined })).toBe("vent 0 km/h");
    expect(ventText(PLUVIO)).toBeUndefined();
  });

  it("puts the wind and the rain of a tile in small pills, said in full to a screen reader and on hover", () => {
    const w = windPill(GILLOT);
    // An arrow where the wind goes: from 70°, towards 250°.
    expect(w).toContain(`style="transform:rotate(250deg)"`);
    expect(w).toContain(`18 km/h</span>`);
    expect(w).toContain(`<span class="sr">${esc("vent d'est 18 km/h, rafales 21 km/h")}</span>`);
    expect(windPill({ ...GILLOT, vent: 0, direction: undefined, rafales: undefined })).not.toContain("<svg");
    expect(windPill(PLUVIO)).toBe("");
    expect(rainPill(PLAINE)).toContain(`<span class="pl wet" title="${esc("2,4 mm de pluie dans l'heure")}">`);
    expect(rainPill(GILLOT)).toContain(`<span class="sr">${esc("pas de pluie mesurée depuis 1 h")}</span>`);
    expect(rainPill({ ...GILLOT, pluie_1h: undefined, pluie_6min: 0.2 })).toContain(esc("0,2 mm de pluie en 6 min"));
    expect(rainPill(BALISE)).toBe("");
  });

  it("finds a Météo-France station's commune from its INSEE code, another's from the nearest Météo-France station", () => {
    expect(communeOf(GILLOT, ALL)).toBe("Sainte-Marie");
    expect(communeOf(PLAINE, ALL)).toBe("Le Tampon");
    expect(communeOf(PLUVIO, ALL)).toBe("Salazie");
    // The beacon has no INSEE code: Gillot, the nearest Météo-France station of the list, gives its commune.
    expect(communeOf(BALISE, [GILLOT, PLAINE, BALISE])).toBe("Sainte-Marie");
  });
});

describe("the map of every station on /meteo", () => {
  it("draws one link per station for every measure, each to its row, hidden where the measure shown is missing", () => {
    const html = stationsMap(ALL);
    const l = links(html);
    expect(l.map((x) => x.href).sort()).toEqual(ALL.map((s) => `#${stationId(s.nom)}`).sort());
    expect(html).toContain("les 5 stations météo et leur dernière mesure, à 09:18");
    const of = (href: string) => l.find((x) => x.href === href)!.cls;
    expect(of("#st-plaine-des-cafres")).toBe(" has-t has-p has-v");
    expect(of("#st-belouve")).toBe(" has-p");
    // The wind beacon measures the wind alone: on the map under the wind only.
    expect(of(`#${stationId(BALISE.nom)}`)).toBe(" has-v");
    // The bubble's value for each measure, and the time and source said with the right agreement.
    expect(html).toContain(`data-tvt="${esc("17,2 °C")}"`);
    expect(html).toContain(`data-tvp="${esc("2,4 mm en 1 h")}"`);
    expect(html).toContain(`data-tvp="${esc("pas de pluie mesurée en 1 h")}"`);
    expect(html).toContain(`data-td="${esc("mesurée à 09:18 par Météo-France")}"`);
    expect(html).toContain(esc("Plaine des Cafres · 1 560 m : 17,2 °C, 2,4 mm en 1 h, vent d'est 12 km/h, mesures de 09:18 par Météo-France, voir le détail"));
    expect(ventText(PLAINE)).toBe("vent d'est 12\u202fkm/h");
    expect(html).toContain(`data-tvv="${esc(ventText(PLAINE)!)}"`);
  });

  it("animates the wind between the anemometers in the browser, with the measures on top, and says the movement is no measure", () => {
    const html = stationsMap(ALL);
    expect(html).toContain(`<label for="wxl-v">Vent</label>`);
    // Where each wind goes, in km/h along the map's x and y (y down): from 70°, Gillot's goes west and a little south.
    const [x, y] = project(GILLOT.lon, GILLOT.lat);
    const data = JSON.parse(html.match(/data-vent="([^"]+)"/)![1].replaceAll("&quot;", '"')) as number[][];
    expect(data).toHaveLength(3);
    const g = data.find((d) => d[0] === x && d[1] === y)!;
    expect(g[2]).toBeCloseTo(-18 * Math.sin((70 * Math.PI) / 180), 1);
    expect(g[3]).toBeCloseTo(18 * Math.cos((70 * Math.PI) / 180), 1);
    expect(g[2]).toBeLessThan(0);
    // Two canvases, the speed's veil and the particles, never a picture made in the page.
    expect(html).toContain(`<canvas class="flux" `);
    expect(html).not.toContain("data:");
    // The measure in a pill: an arrow where the wind goes (from 200°, towards 20°) and the speed.
    expect(html).toMatch(/<g class="sh l-v wv">[^]*?rotate\(20\)"\/><text [^>]*>22<\/text><\/g>/);
    expect(html).toContain("3 anémomètres, vent moyen mesuré en km/h, le plus récent à 09:18. La flèche montre où va le vent (un vent d'est vient de l'est). Entre les stations, le mouvement et les couleurs sont <b>estimés</b> à partir des stations voisines : ce n'est pas une mesure.");
    // The rain layer asks the radar's grid when first shown, with a place in its legend for what the radar sees.
    expect(html).toContain(`<canvas class="voile" data-pluie="/meteo/pluie-radar.json" data-alt="${ALT_PATH}" `);
    expect(html).toContain(`Point blanc : pas de pluie mesurée. <span data-radar hidden></span>`);
    // No anemometer: no tab, no canvas, no script data.
    expect(stationsMap([BALISE])).toContain("1 anémomètre, vent moyen");
    const calm = stationsMap([BRAS_SEC, PLUVIO]);
    expect(calm).not.toContain(`id="wxl-v"`);
    expect(calm).not.toContain("data-vent");
  });

  it("moves apart wind pills that would cover each other, each tied to its place, and leaves the others on theirs", () => {
    // Two anemometers 600 m apart, as Pointe des Trois-Bassins and the FFVL's beacon of the Trou d'Eau.
    const pointe = st({ nom: "Pointe des Trois-Bassins", lon: 55.2386, lat: -21.0978, vent: 5, direction: 120 });
    const trou = st({ nom: "Balise du Trou d'Eau", source: "ffvl", id: "1012", lon: 55.2441, lat: -21.1013, vent: 1, direction: 78 });
    const html = stationsMap([GILLOT, pointe, trou]);
    const rects = [...html.matchAll(/<g class="sh l-v wv"><rect x="([\d.-]+)" y="([\d.-]+)"/g)].map((m) => [+m[1] + 46, +m[2] + 24]);
    expect(rects).toHaveLength(3);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      expect(Math.abs(rects[i][0] - rects[j][0]) >= 96 || Math.abs(rects[i][1] - rects[j][1]) >= 48).toBe(true);
    }
    // Set aside, not one above the other: the room above and below stays for « Saint-Paul » on a phone.
    const [g0, g1] = project(GILLOT.lon, GILLOT.lat).map(Math.round);
    const moved = rects.filter(([x, y]) => x !== g0 || y !== g1);
    expect(moved).toHaveLength(2);
    expect(Math.abs(moved[0][0] - moved[1][0])).toBeGreaterThanOrEqual(96);
    // Gillot, alone, on its place; the two others each tied to theirs, under every pill, in the wind's layer only.
    expect(rects).toContainEqual(project(GILLOT.lon, GILLOT.lat).map(Math.round));
    const ties = html.match(/<g class="l-v wt" aria-hidden="true">(.*?)<\/g>/)![1];
    // A white line on a night edge, and a white dot on the place (marketing).
    expect(ties.match(/<line class="o" /g)).toHaveLength(2);
    expect(ties.match(/<line class="i" /g)).toHaveLength(2);
    for (const s of [pointe, trou]) expect(ties).toContain(`<circle cx="${project(s.lon, s.lat)[0]}" cy="${project(s.lon, s.lat)[1]}" r="9"/>`);
    expect(html.indexOf(`class="l-v wt"`)).toBeLessThan(html.indexOf(`class="sh l-v wv"`));
    expect(stationsMap(ALL)).not.toContain(`class="l-v wt"`);
    expect(CSS).toContain(".wxmap .wt .o{stroke:#0b1f36;");
    expect(CSS).toContain(".wxmap .wt .i{stroke:#fff;");
    // No name of a place on a line or a dot.
    expect(NOMS_SCRIPT).toContain(",.wt line,.wt circle\")");
  });

  it("moves apart rain discs with their figure that would cover each other, each tied to its place, the small dots left on theirs", () => {
    // Two rain gauges 600 m apart under a downpour, and a third with a little rain: a small dot without its figure.
    const a = st({ nom: "Pluviomètre A", id: "1", lon: 55.55, lat: -21.05, pluie_1h: 7.5 });
    const b = st({ nom: "Pluviomètre B", id: "2", lon: 55.555, lat: -21.052, pluie_1h: 6.9 });
    const c = st({ nom: "Pluviomètre C", id: "3", lon: 55.4, lat: -21.2, pluie_1h: 0.3 });
    const html = stationsMap([a, b, c]);
    const discs = [...html.matchAll(/<circle class="sh l-p" cx="([\d.-]+)" cy="([\d.-]+)" r="34"/g)].map((m) => [+m[1], +m[2]]);
    expect(discs).toHaveLength(2);
    // Their edges 16 units apart at least, as the home page's rounds (#607).
    expect(Math.hypot(discs[0][0] - discs[1][0], discs[0][1] - discs[1][1])).toBeGreaterThanOrEqual(68 + 16);
    // The figure moves with its disc.
    for (const [x, y] of discs) expect(html).toMatch(new RegExp(`<text class="mv l-p" x="${x}" y="${y + 11}">`));
    // The small dot on its place.
    const [cx, cy] = project(c.lon, c.lat);
    expect(html).toContain(`<circle class="sh l-p" cx="${cx}" cy="${cy}" r="17"`);
    // Each moved disc tied to its place, in the rain's layer only, under every disc.
    const ties = html.match(/<g class="l-p wt" aria-hidden="true">(.*?)<\/g>/)![1];
    expect(ties.match(/<line class="o" /g)).toHaveLength(2);
    for (const s of [a, b]) expect(ties).toContain(`<circle cx="${project(s.lon, s.lat)[0]}" cy="${project(s.lon, s.lat)[1]}" r="9"/>`);
    expect(html.indexOf(`class="l-p wt"`)).toBeLessThan(html.indexOf(`class="sh l-p"`));
    // Far from each other, no line.
    expect(stationsMap(ALL)).not.toContain(`class="l-p wt"`);
  });

  it("draws a figure of 4 characters or more at the same size, in a wider disc (« 12,3 »), set apart at its size", () => {
    const a = st({ nom: "Pluviomètre A", id: "1", lon: 55.45, lat: -21.05, pluie_1h: 12.3 });
    const b = st({ nom: "Pluviomètre B", id: "2", lon: 55.455, lat: -21.052, pluie_1h: 6.9 });
    const c = st({ nom: "Pluviomètre C", id: "3", lon: 55.35, lat: -21.2, pluie_1h: 104.5 });
    const html = stationsMap([a, b, c]);
    const disc = (v: string) => {
      const m = html.match(new RegExp(`<circle class="sh l-p" cx="([\\d.-]+)" cy="([\\d.-]+)" r="(\\d+)" fill="[^"]+"/><text class="mv l-p" x="([\\d.-]+)" y="([\\d.-]+)">${v}</text>`))!;
      expect(+m[4]).toBe(+m[1]);
      expect(+m[5]).toBe(+m[2] + 11);
      return { x: +m[1], y: +m[2], r: +m[3] };
    };
    const [da, db, dc] = [disc("12,3"), disc("6,9"), disc("104,5")];
    expect([da.r, db.r, dc.r]).toEqual([49, 34, 59]);
    // The figure never smaller: no size of its own.
    expect(html).not.toMatch(/class="mv l-p"[^>]*style=/);
    // Two neighbours 500 m apart, set apart by their own sizes, their edges 16 units apart at least.
    expect(Math.max(Math.abs(da.x - db.x) - da.r - db.r, Math.abs(da.y - db.y) - da.r - db.r)).toBeGreaterThanOrEqual(16);
    expect(discR()).toBe(17);
    expect(discR("6,2")).toBe(34);
    expect(discR("12,3")).toBe(49);
    expect(discR("−10°")).toBe(49);
  });

  it("leaves the rain's small dots free, the disc moved off them, unless it would then cover more", () => {
    // A disc of 4 characters with a small dot at 900 m and a dry gauge at 1 km: both left free, and so are their places.
    const a = st({ nom: "Pluviomètre A", id: "1", lon: 55.5, lat: -21.1, pluie_1h: 12.3 });
    const b = st({ nom: "Pluviomètre B", id: "2", lon: 55.508, lat: -21.1, pluie_1h: 0.3 });
    const c = st({ nom: "Pluviomètre C", id: "3", lon: 55.5, lat: -21.109, pluie_1h: 0 });
    const html = stationsMap([a, b, c]);
    const m = html.match(/<circle class="sh l-p" cx="([\d.-]+)" cy="([\d.-]+)" r="49"/)!;
    for (const s of [b, c]) {
      const [x, y] = project(s.lon, s.lat);
      expect(html).toContain(`<circle class="sh l-p" cx="${x}" cy="${y}" r="`);
      // The dot (19 with its edge), the disc's white edge and some air: never touching.
      expect(Math.abs(+m[1] - x) >= 49 + 25 || Math.abs(+m[2] - y) >= 49 + 25).toBe(true);
    }
    // Without a dot to avoid, apart() is as it was: the other maps do not change.
    const one = [{ lon: 55.5, lat: -21.1, label: "", name: "a", round: true }];
    expect(apart(one)).toEqual([project(55.5, -21.1)]);
    expect(apart(one, [98], 1, [98], [[...project(55.508, -21.1), 19]])).not.toEqual([project(55.5, -21.1)]);
  });

  it("keeps a summit's name inside the frame and off the markers, else does not show it (« Piton de la Fournaise », « 3 070 m » at 1280)", () => {
    expect(NOMS_SCRIPT).toContain("inn=(b)=>b[0]>=vb.x+e&&");
    expect(NOMS_SCRIPT).toContain("free=(b)=>inn(b)&&");
    // Else a place inside the frame that covers no marker's shape (a disc, a pill), the fewest lines and dots; else no name.
    // A disc as a disc, not its square, and the name's own box less 1 px (a line of text is taller than its letters): a
    // name may stand by its side.
    expect(NOMS_SCRIPT).toContain("raw=(d)=>[B[0]+d[0]+u,B[1]+d[1]+u,B[2]+d[0]-u,B[3]+d[1]-u]");
    expect(NOMS_SCRIPT).toContain('if(e.matches(".mk .sh"))hard.push(e.tagName==="circle"?[b.x+b.width/2,b.y+b.height/2,b.width/2]:box(b,0))');
    expect(NOMS_SCRIPT).toContain("ok=ds.filter((d)=>inn(at2(d))&&!hard.some((o)=>cut(raw(d),o))),go=ds.find((d)=>free(at2(d)))||(ok.length?");
    expect(NOMS_SCRIPT).toContain('if(!go){ts.forEach((t)=>t.style.display="none");return}');
    // The summits' names only: the names of communes and places (the maps of the roads, of electricity…) are placed
    // after them, by code that reads none of it.
    const end = NOMS_SCRIPT.indexOf("busy.push(...marks)");
    expect(end).toBeGreaterThan(0);
    for (const w of ["hard", "cut(", "raw(", "ok=ds"]) expect(NOMS_SCRIPT.lastIndexOf(w)).toBeLessThan(end);
    // Shown again when the map changes, if a place is free then.
    expect(NOMS_SCRIPT).toContain('ts.forEach((t,i)=>{t.style.display="";');
  });

  it("sets two pills on one place one above the other, unless asked to set them aside (the wind's)", () => {
    const two = [{ lon: 55.5, lat: -21.1, label: "", name: "a" }, { lon: 55.5, lat: -21.1, label: "", name: "b" }];
    const [a, b] = apart(two, [96, 96]);
    expect(a[0]).toBe(b[0]);
    const [c, d] = apart(two, [96, 96], 3);
    expect(c[1]).toBe(d[1]);
    expect(Math.abs(c[0] - d[0])).toBeGreaterThanOrEqual(96);
  });

  it("leaves a wind without its direction out of where the air goes, and keeps a calm in", () => {
    const sans = st({ nom: "Sans direction", lon: 55.4, lat: -21.0, vent: 14 });
    const calme = st({ nom: "Calme", lon: 55.6, lat: -21.3, vent: 0 });
    const html = stationsMap([GILLOT, sans, calme]);
    const data = JSON.parse(html.match(/data-vent="([^"]+)"/)![1].replaceAll("&quot;", '"')) as number[][];
    expect(data.map((d) => d.slice(0, 2))).toEqual([project(GILLOT.lon, GILLOT.lat), project(calme.lon, calme.lat)]);
    expect(data[1].slice(2)).toEqual([0, 0]);
    // Still a measure of the map and of its legend.
    expect(html).toContain("3 anémomètres, vent moyen");
    expect(html).toMatch(/<g class="sh l-v wv"><rect [^>]*\/><circle [^>]*\/><text [^>]*>14<\/text><\/g>/);
    // No direction at all: the measures without the movement.
    const seul = stationsMap([sans]);
    expect(seul).toContain(`id="wxl-v"`);
    expect(seul).not.toContain("data-vent");
  });

  describe("the land breeze, at night", () => {
    // 23:00 in La Réunion; 09:18 the morning before, by day.
    const NUIT = "2026-10-22T19:00:00Z";
    const cote = (nom: string, lon: number, lat: number, direction: number, o: Partial<StationNow> = {}) => st({ nom, lon, lat, altitude_m: 10, vent: 8, direction, time: NUIT, ...o });
    // Each coast's wind goes to its sea: the north's from 160°, the east's from 230°, the south's from 10°; the west's, from 40°, along its coast.
    const nuit = [cote("Nord", 55.53, -20.89, 160), cote("Est", 55.71, -21.03, 230), cote("Sud", 55.42, -21.32, 10), cote("Ouest", 55.29, -20.94, 40)];
    const breeze = " La nuit, l'air descend des pentes vers la mer (brise de terre). ";

    it("is said when the coast's winds go to the sea on two sides of the island at least", () => {
      expect(landBreeze(nuit)).toBe(true);
      expect(stationsMap(nuit)).toContain(`(un vent d'est vient de l'est).${breeze}Entre les stations`);
      expect(landBreeze(nuit.slice(1, 3))).toBe(true);
    });

    it("is not said by day, nor on one side alone: the trade wind blows to the western sea", () => {
      expect(landBreeze(nuit.map((s) => ({ ...s, time: at })))).toBe(false);
      expect(stationsMap(nuit.map((s) => ({ ...s, time: at })))).not.toContain("brise de terre");
      // The trade wind at night, from 110°: on the east, north and south coasts it comes from the sea or along them.
      const alize = nuit.map((s) => ({ ...s, direction: 110 }));
      expect(landBreeze(alize)).toBe(false);
      expect(landBreeze(nuit.slice(2))).toBe(false);
    });

    it("counts the coast's live winds only: not the heights, an old measure, a calm or a wind without its direction", () => {
      const [n, e, s] = nuit;
      expect(landBreeze([n, { ...e, altitude_m: 1500 }])).toBe(false);
      expect(landBreeze([n, { ...e, stale: true }])).toBe(false);
      expect(landBreeze([n, { ...e, vent: 0 }])).toBe(false);
      expect(landBreeze([n, { ...e, direction: undefined }])).toBe(false);
      // Most of a side's: one wind to the sea against two from it is not the side's.
      expect(landBreeze([n, e, cote("Est 2", 55.7, -21.0, 70), cote("Est 3", 55.72, -21.06, 90)])).toBe(false);
      expect(landBreeze([n, e, s, cote("Est 2", 55.7, -21.0, 70)])).toBe(true);
    });
  });

  it("writes the values of the tour's stations only, the others as dots told by the bubble", () => {
    const html = stationsMap(ALL);
    expect(html).toContain(`<text class="mv l-t" `);
    expect(html).toMatch(/<text class="mv l-t" [^>]*>28°<\/text>/);
    expect(html).toMatch(/<text class="mv l-t" [^>]*>17°<\/text>/);
    expect(html).not.toMatch(/<text class="mv l-t" [^>]*>19°<\/text>/);
    // Rain of 1 mm or more is written everywhere; less, at a station of the tour only.
    expect(html).toMatch(/<text class="mv l-p" [^>]*>2,4<\/text>/);
    expect(html).not.toMatch(/<text class="mv l-p" [^>]*>0,4<\/text>/);
  });

  it("estimates between the stations in the browser, from the temperatures measured and the altitudes' file, and says it is no measure", () => {
    const html = stationsMap(ALL);
    // The stations with a temperature only: x, y on the map, altitude, temperature.
    const data = [GILLOT, PLAINE, BRAS_SEC].map((s) => [...project(s.lon, s.lat), s.altitude_m, s.temperature]);
    expect(html).toContain(`data-voile="${esc(JSON.stringify(data))}"`);
    expect(html).toContain(`data-alt="${ALT_PATH}"`);
    expect(existsSync(new URL(`../public${ALT_PATH}`, import.meta.url))).toBe(true);
    // A canvas, never a picture made in the page: the site's policy allows none (img-src 'self').
    expect(html).toContain(`<canvas class="voile" `);
    expect(html).not.toContain("data:");
    // The legend's words are the page's own, written as they are (no value of a source in them).
    expect(html).toContain("3 stations, température mesurée sous abri, la plus récente à 09:18. Entre les stations, les couleurs sont <b>estimées selon l'altitude</b> : ce n'est pas une mesure.");
  });

  it("says one station in the singular, and leaves out the tab of a measure no station has", () => {
    const html = stationsMap([PLAINE, { ...BRAS_SEC, pluie_1h: undefined }]);
    expect(html).toContain("1 pluviomètre, pluie de la dernière heure");
    const rainOnly = stationsMap([PLUVIO]);
    expect(rainOnly).not.toContain(`id="wxl-t"`);
    expect(rainOnly).toContain(`<input type="radio" name="wxl" id="wxl-p" class="on" checked>`);
    expect(stationsMap([GILLOT])).toContain(`<input type="radio" name="wxl" id="wxl-t" class="on" checked>`);
  });

  it("says the rain of the last 6 minutes, tab and legend, while no station has the hour yet", () => {
    const hour = stationsMap(ALL);
    expect(hour).toContain(`<label for="wxl-p">Pluie 1 h</label>`);
    expect(hour).toContain("4 pluviomètres, pluie de la dernière heure en mm, la plus récente à 09:18. Point blanc : pas de pluie mesurée.");
    const six = stationsMap(ALL.map((s) => ({ ...s, pluie_6min: s.pluie_1h, pluie_1h: undefined })));
    expect(six).toContain(`<label for="wxl-p">Pluie 6 min</label>`);
    expect(six).toContain("4 pluviomètres, pluie des 6 dernières minutes seulement, en mm, la plus récente à 09:18 : l'heure complète n'est pas encore disponible.");
    expect(six).toContain(`data-tvp="${esc("2,4 mm en 6 min")}"`);
  });
});

describe("the page /meteo with every station", () => {
  const home = (toutes?: StationNow[]): HomeData => ({
    stations: [GILLOT, PLAINE], toutes, sources: [], indisponibles: [],
    mer: [{ nom: "Plage de Boucan Canot", valeur: 25.4, jour: "2026-10-21", distance_km: 2 }],
  });
  const page = (toutes?: StationNow[]) => meteoPage("https://rundata.re", { value: home(toutes), fetchedAt: NOW, stale: false }, NOW);

  it("puts the map at the top, the stations' list in the middle, the sea and the forecasts below", () => {
    const html = page(ALL);
    const map = html.indexOf(`<figure class="card mapcard airmap wxmap">`);
    const list = html.indexOf(`<ul class="stations" id="stl">`);
    const sea = html.indexOf(`id="h-mer"`);
    const forecast = html.indexOf(`id="h-communes"`);
    expect(map).toBeGreaterThan(0);
    expect(html.indexOf("<main")).toBeGreaterThan(map);
    expect(list).toBeGreaterThan(map);
    expect(sea).toBeGreaterThan(list);
    expect(forecast).toBeGreaterThan(sea);
    expect(html.match(/<li class="st tgt"/g)).toHaveLength(5);
    expect(html).toContain(esc("Les 5 stations, de la côte aux sommets"));
    expect(html).toContain("Pour chaque commune, les cirques, le volcan et les plages : la mesure de la station qui représente le mieux le lieu (proche, à une altitude voisine, du même versant) et la prévision sur 7 jours, aujourd'hui compris");
    expect(html).toContain(esc("IGN, RGE ALTI, pour les altitudes des couleurs estimées (Licence Ouverte 2.0)"));
    expect(html).toContain(esc("Météo-France, lame d'eau radar, pour la pluie estimée (Licence Ouverte 2.0)"));
    // The replay bar (marketing's words): hidden without a script, no length chosen, its script asked on a first touch.
    expect(html).toContain(`<div class="rj" data-rejeu="${rejeuScriptPath()}" data-fin="${ALL.reduce((m, x) => (x.time > m ? x.time : m), "")}" hidden><fieldset class="tabs"><legend>Revoir :</legend>` +
      `<input type="radio" name="rjd" id="rjd-6h" value="6h"><label for="rjd-6h">6\u00a0h</label><input type="radio" name="rjd" id="rjd-24h" value="24h"><label for="rjd-24h">24\u00a0h</label>` +
      `<input type="radio" name="rjd" id="rjd-7j" value="7j"><label for="rjd-7j">7\u00a0jours</label></fieldset><button type="button" class="rj-b" aria-label="Lire les 6\u00a0dernières heures">▶ Lire</button>` +
      `<input type="range" min="0" max="1" step="any" value="1" aria-label="Moment affiché sur la carte" hidden><span class="rj-q" hidden></span>` +
      `<span class="rj-ko" hidden>L'historique n'a pas pu être chargé : la carte reste sur la dernière mesure. <button type="button">Réessayer</button></span><span class="sr" aria-live="polite"></span></div>`);
    expect(html).toContain(`<g class="rj-st"></g><g class="rj-t" aria-hidden="true"><text class="rj-d" x="24" y="782"></text><text class="rj-h" x="24" y="846"></text><text class="rj-s" x="24" y="886"></text></g>`);
    // A replay legend for each layer, the temperatures' too.
    expect(html.match(/<span class="lg lg-[tpv](?: on)?"><span class="lg-now">/g)).toHaveLength(3);
    expect(html.match(/<span class="rj-lg"><\/span>/g)).toHaveLength(3);
  });

  it("folds the list after 12 stations, with a button for the rest; filters and sorts it, with its script on /meteo alone", () => {
    const many = Array.from({ length: 14 }, (_, i) => st({ nom: `Station ${String.fromCharCode(65 + i)}`, id: `974111${String(i).padStart(2, "0")}`, altitude_m: i * 100, temperature: 25 - i / 2 }));
    const html = page(many);
    expect(html).toContain(`<ul class="stations plie" id="stl">`);
    expect(html).toContain(`Voir les 14 stations</button>`);
    expect(html).toContain(`<span id="sttri">Trier par</span>`);
    expect(html.split(METEO_SCRIPT)).toHaveLength(2);
    expect(page(ALL)).not.toContain(`Voir les 5 stations`);
    expect(() => new Function(METEO_SCRIPT)).not.toThrow();
    // What the radar sees, said by the script once its grid has come: rain, none, or an image too old to show.
    expect(METEO_SCRIPT).toContain(`"la pluie estimée par le radar de Météo-France "+(past?"le "+dm_(j.fin)+" à "+hm(j.fin):at_(j.fin)))+"\u00a0; "+fo()`);
    // The blues darken with the rain in light, lighten in dark: the legend says which.
    expect(METEO_SCRIPT).toContain(`const fo=()=>(dark()?"plus c'est clair":"plus c'est foncé")+", plus elle est forte.";`);
    expect(METEO_SCRIPT).toContain(`"Le radar de Météo-France ne voit pas de pluie "+(tail?"sur l'île ":"")+at_(j.fin)+"."`);
    // In the replay, a past image: its date and the past tense, never "hier".
    expect(METEO_SCRIPT).toContain(`"Le "+dm_(j.fin)+" à "+hm(j.fin)+", le radar de Météo-France ne voyait pas de pluie."`);
    expect(METEO_SCRIPT).toContain(`say_(n,tg?(dist(Z).bad||tg.some(([j])=>dist(j).bad)?" "+BW+"\u00a0: zones que le radar a mal vues "+ago(wm)+", où la pluie peut être manquée.":"")`);
    expect(METEO_SCRIPT).toContain(`" et n'est pas affichée."`);
    // The hatches' sentence comes after a hatched square, styled by the page, which ties it to the hatches on the map.
    expect(METEO_SCRIPT).toContain(`w.append(i,"\u00a0"+BW);el.append(" ",w,bad.slice(BW.length+1))`);
    expect(METEO_SCRIPT).toContain(`BW="Hachures",BAD=" "+BW+"\u00a0: zones que le radar voit mal, où la pluie peut être manquée."`);
    expect(CSS).toContain(".wxmap .hsw{");
    expect(CSS).not.toContain(".hsv");
    // The radar's rain in blues only, deeper class after class: the two strongest were violet and magenta, which the
    // legend did not have (31/10/2026). Its scale before the sentence, from its first class to its last.
    // Four blues a theme, two classes each, opaque: darker as it rains harder in light, lighter in dark (31/10/2026).
    const TI: string[][] = JSON.parse(METEO_SCRIPT.match(/const TI=(\[\[[^\]]*\],\[[^\]]*\]\])/)![1]);
    const sum = (c: string) => [1, 3, 5].reduce((n, i) => n + parseInt(c.slice(i, i + 2), 16), 0);
    for (const [k, t] of TI.entries()) {
      expect(t).toHaveLength(4);
      for (const c of t) expect(parseInt(c.slice(5, 7), 16)).toBeGreaterThan(Math.max(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16)));
      for (let i = 1; i < t.length; i++) expect(k ? sum(t[i]) > sum(t[i - 1]) : sum(t[i]) < sum(t[i - 1])).toBe(true);
    }
    const KA: number[][][] = JSON.parse(METEO_SCRIPT.match(/KA=(\[\[\[.*?\]\]\])/)![1]);
    for (const t of KA) expect(t.map((c) => c[3])).toEqual(Array(8).fill(1));
    expect(METEO_SCRIPT).toContain(`SC=["0,1\u202fmm/h","plus de 32\u202fmm/h"]`);
    // On its own line, above the sentence.
    expect(METEO_SCRIPT).toContain(`s.className="lgs lgr"`);
    expect(CSS).toContain(".wxmap .lgr{display:flex;");
    expect(METEO_SCRIPT).toContain(`if(t.startsWith("En bleu"))el.prepend(scale(mm))`);
    // More drops as it rains harder, about ten times more in the strongest class than in the lightest.
    expect(METEO_SCRIPT).toContain(`DN=[3,4,6,8,12,16,23,32]`);
    expect(METEO_SCRIPT).toContain(`Wt=[0,...DN]`);
    for (const words of [`"sur l'île "`, `"Pas d'image radar à "+hm(e.a)+"."`, `"Pas d'image radar de "+hm(e.de)+" à "+hm(e.a)+"."`, `"hier à "`, `b.textContent="Chargement…"`, `b.textContent="▶ Lire"`]) {
      expect(METEO_SCRIPT).toContain(words);
    }
    // The replay's own script is not in the page: it is asked on a first touch of the bar.
    expect(METEO_SCRIPT).not.toContain("❚❚ Pause");
    expect(CSS).toContain(".wxmap.rejeu:not(.rj-fin) :is(.lg-now,.sts,.mtip){display:none}");
    expect(CSS).toContain("@media (prefers-reduced-motion:reduce){.wxmap .rj-b{display:none}}");
  });

  it("dates a measure of another day in the list, and says it old", () => {
    const html = page([GILLOT, { ...BRAS_SEC, time: "2026-10-21T15:00:00Z" }]);
    expect(html).toContain(`<span class="when">21/10 19:00 (ancienne)</span>`);
    expect(html).toContain(`<span class="when">09:18</span>`);
  });

  it("keeps the former page for a copy made before every station was kept", () => {
    const html = page(undefined);
    expect(html).not.toContain("wxmap");
    expect(html).toContain(esc("La mer au large"));
    expect(html).not.toContain(METEO_SCRIPT);
  });
});

describe("the map's layers in Safari", () => {
  // In a foreignObject, Safari paints what has a layer of its own (a positioned element, a canvas drawn on the
  // graphics card) unscaled, below and right of the map, over the legend and the text (iPhone, 29/10).
  it("stacks a layer's canvases without positioning them", () => {
    const rules = [...CSS.replace(/\/\*[^]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => /\.wxmap [^,]*(\.vt|canvas|\.voile|\.flux)/.test(sel));
    expect(rules.map(([, sel]) => sel.trim())).toEqual(expect.arrayContaining([".wxmap .vt", ".wxmap .vt canvas", ".wxmap .voile"]));
    for (const [, sel, body] of rules) expect(`${sel.trim()} ${body}`).not.toMatch(/position:|transform|will-change/);
    expect(CSS).toContain(".wxmap .vt{display:grid;grid-template:100%/100%;");
  });

  it("draws the map's canvases by the processor, the canvases made off the page alone otherwise", () => {
    expect(METEO_SCRIPT).toContain(`const c2d=(c)=>c.getContext("2d",{willReadFrequently:true});`);
    expect(METEO_SCRIPT.match(/c2d\(/g)!.length).toBeGreaterThanOrEqual(5);
    for (const line of METEO_SCRIPT.split("\n")) {
      for (const [, canvas] of line.matchAll(/(\w+)\.getContext\("2d"\)/g)) expect(line).toContain(`${canvas}=document.createElement("canvas")`);
    }
  });
});

describe("the station bubble on /meteo's map", () => {
  it("is placed against the map's figure, which is its containing block (not the page's top)", () => {
    const html = stationsMap([st({ nom: "Le Port", temperature: 26.5 })]);
    // The script computes the bubble's left and top from its parent's box: the figure.
    expect(html).toMatch(/^<figure class="card mapcard airmap wxmap">[\s\S]*<a class="mtip" data-mtip[\s\S]*<\/figure>$/);
    expect(CSS).toContain(".wxmap{position:relative}");
  });
});

describe("the replay bar's own script", () => {
  it("is served at its address, kept a year there, a script the page's policy lets run ('self')", async () => {
    const get = (p: string) => site(new Request(`https://rundata.re${p}`), new Cache(new MemoryStore()), () => {});
    const res = (await get(rejeuScriptPath()))!;
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe(rejeuScript());
    // Another version's address (a copy of the page kept offline) gets today's for a few minutes only.
    expect((await get("/meteo/rejeu-ancien.js"))!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(rejeuScriptPath()).toMatch(/^\/meteo\/rejeu-\w+\.js$/);
  });

  it("says marketing's words, plays in 12 s, and never says « temps réel » nor « prévision »", () => {
    const js = rejeuScript();
    expect(() => new Function(js)).not.toThrow();
    for (const words of [`"❚❚ Pause"`, `"↻ Relire"`, `"▶ Lire"`, `"Mettre en pause"`, `"Relire"`, `"Chargement…"`, `"Lire les 24 dernières heures"`, `"Lire les 7 derniers jours"`,
      `w="mesuré"`, `w="estimé"`, `w="estimé par radar"`, `", pluie estimée par le radar"`, `", pluie estimée par le radar entre ses images de "+hmm(r.a.t)+" et de "+hmm(r.z.t)`, `w="dernière mesure"`, `", estimé entre les mesures de "+hmm(r.a.t)+" et de "+hmm(r.z.t)`, `w="estimé entre les pluviomètres"`, `", estimée entre les pluviomètres"`,
      `"Historique gardé depuis le "+dm(S)+" à "+hmm(S)+"."`, `". Pas d'image radar de "`, `PLAY=12000`,
      `"Température sous abri de "+x+" de Météo-France, une mesure par heure.`, `" de Météo-France, une mesure par heure. Entre eux, le mouvement et les couleurs sont estimés : ce n'est pas une mesure. Les aéroports et les balises de vent ne sont pas dans ce rejeu."`,
      `" Points : la pluie mesurée par chaque pluviomètre pendant ces 3\u00a0heures, en mm. Point blanc : pas de pluie mesurée."`, `.lg-now .lgs`]) {
      expect(js).toContain(words);
    }
    expect(js).not.toMatch(/temps r[ée]el|prévision/i);
    expect(js).not.toContain("OpenWindMap");
    // The data it is given (the stations named on the map, the colours) cannot close a script.
    expect(js).not.toContain("</");
  });
});

describe("the rain's animation and its replay", () => {
  // The frames a loop draws at the rAF times given, and how far each moves (k, in frames of 1/30 s), as STEP does.
  const frames = (times: number[]) => {
    let last = 0,
      nx = 0;
    const out: number[] = [];
    for (const t of times) {
      const p = pace(t, last, nx);
      if (!p) continue;
      out.push(p[0]);
      nx = p[1];
      last = t;
    }
    return out;
  };
  const loop = METEO_SCRIPT.match(/const pace=([^]*?),loop=\(t\)=>\{raf=requestAnimationFrame\(loop\);(.*?)o\.frame\(k\)\};/)!;
  const tick = rejeuScript().match(/const pace=([^]*?),tick=\(t\)=>\{raf=requestAnimationFrame\(tick\);const was=last;(.*?)const dt=/)!;

  it("draws 30 frames a second on a 60 Hz screen never quite even, a 120 Hz one and a capture stepped at 1/30 s", () => {
    // The animations and the replay step alike, with pace as its text, as frames() does.
    expect(tick.slice(1)).toEqual(loop.slice(1));
    expect(loop[1]).toBe(String(pace));
    expect(loop[2]).toBe("const p=pace(t,last,nx);if(!p)return;const k=p[0];nx=p[1];last=t;");
    // The functions taken as their text need nothing of the module around them.
    expect(METEO_SCRIPT + rejeuScript()).not.toContain("__name");
    // 60 Hz, each frame up to 0.6 ms early or late: every other one, never two skipped (a frame at 32 ms at least made 15).
    const jitter = Array.from({ length: 600 }, (_, i) => 1000 + (i * 1000) / 60 + (i % 2 ? -0.6 : 0.6) * ((i * 7) % 3 === 0 ? 1 : -1));
    const k60 = frames(jitter);
    expect(k60.length).toBeGreaterThanOrEqual(299);
    expect(k60.length).toBeLessThanOrEqual(301);
    for (const k of k60.slice(1)) expect(k).toBeCloseTo(1, 1);
    expect(frames(Array.from({ length: 1200 }, (_, i) => 1000 + (i * 1000) / 120)).length).toBe(300);
    // Stepped at exactly 1/30 s, as the Reel's capture does: every step a frame, each moving one frame.
    const stepped = frames(Array.from({ length: 300 }, (_, i) => 1000 + (i * 1000) / 30));
    expect(stepped).toHaveLength(300);
    for (const k of stepped.slice(1)) expect(k).toBeCloseTo(1, 6);
    // A late frame moves things as far as the time gone by, never more than 100 ms' worth.
    expect(frames([1000, 1100])[1]).toBeCloseTo(3, 6);
    expect(frames([1000, 2000])[1]).toBeCloseTo(3, 6);
  });

  it("keeps the drops falling when the replay's image changes, born in each of the two faded by its share", () => {
    // Drops born in the image drawn, or in one of the two, as much as it shows.
    expect(METEO_SCRIPT).toContain(`s=Z&&Z.n&&(!A.n||Math.random()<f)?Z:A`);
    expect(METEO_SCRIPT).toContain(`P=[dist(A),dist(Z),f]`);
    // An image that changes draws the layer again and moves no drop; only rain after none starts the animation, and a
    // still picture is drawn again with its image for those who ask for less motion.
    expect(METEO_SCRIPT).toContain(`const turn=(was,nw)=>{if(cw)paint();if(!was&&moving()||nw&&calm())o.again()}`);
    expect(METEO_SCRIPT.match(/mix:\(a,z,f,el,gr,tr,wm\)=>\{[^\n]*/)![0]).not.toContain("o.again");
    // A drop at its end is born again, or leaves when the rain wants fewer; those lacking come a tenth at a time.
    expect(METEO_SCRIPT).toContain(`if((p.a+=k)>p.m){if(ds.length>n||!born(p))ds.splice(i,1)}`);
    expect(METEO_SCRIPT).toContain(`Math.ceil(n/10)`);
    // The two images faded added, each by its share: no dip half way.
    expect(METEO_SCRIPT).toContain(`x.globalCompositeOperation="lighter";x.globalAlpha=1-mx[2]`);
  });

  it("writes the time of a radar image during the replay, never a minute between two, the next one from half way", () => {
    const shown = shownAt;
    expect(rejeuScript()).toContain(`const shown=${shownAt};`);
    const at = (h: number, m: number) => Date.UTC(2026, 9, 31, h - 4, m);
    const a = { t: at(10, 45) }, z = { t: at(10, 50) };
    // 10:46, 10:47 and 10:47:29 show the image of 10:45; 10:47:30 and after, the one of 10:50, which the legend names then.
    for (const m of [46, 47, 47.49]) expect(shown(at(10, m), { a, z, f: (m - 45) / 5 }, "p")).toBe(a.t);
    for (const m of [47.5, 48, 49.9]) expect(shown(at(10, m), { a, z, f: (m - 45) / 5 }, "p")).toBe(z.t);
    expect(rejeuScript()).toContain(`t=end?E:shown(T,r,l)`);
    expect(rejeuScript()).toContain(`trail(shown(T,r,l)),wm())`);
    expect(METEO_SCRIPT).toContain(`n=f<.5?A:Z`);
    // On an image, its time; between two hours of the stations, the moment, said « estimé ».
    expect(shown(at(10, 46), { m: a }, "p")).toBe(a.t);
    expect(shown(at(10, 20), { a: { t: at(10, 0) }, z: { t: at(11, 0) }, f: 1 / 3 }, "t")).toBe(at(10, 20));
  });

  it("spreads the radar's cells smoothly, never in steps, and veils where the radars see badly", () => {
    expect(METEO_SCRIPT).toContain(`tg.drawImage(t,0,0,j.w,j.h,0,0,t.width,t.height)`);
    expect(METEO_SCRIPT).toContain(`soften(b.data,t.width,t.height,1)`);
    expect(METEO_SCRIPT).toContain(`c.fillStyle="rgba(255,255,255,.3)"`);
    // Every 12 px, twice the hatches' former spacing, their dark line darker than at first (the user, 31/10/2026).
    expect(METEO_SCRIPT).toContain(`t.width=t.height=12`);
    expect(METEO_SCRIPT).toContain(`["rgba(11,31,54,.62)",1.4,0]`);
  });

  it("lets where the radars saw badly linger during a play, fading over two seconds of it, and says how long before the time shown", () => {
    const at = (m: number) => m * 6e4, W = 60;
    // As the replay's script does: TRAIL of PLAY, an hour of radar over 6 hours; none for less motion.
    expect(rejeuScript()).toContain(`const keep=${trailOf},trail=(s)=>rm||d!=="6h"?null:keep(K.p,T,s,DU[d]*TRAIL/PLAY),wm=`);
    expect(rejeuScript()).toContain(`TRAIL=2000`);
    expect((216e5 * 2000) / 12000).toBe(at(W));
    const trail = (T: number, s: number) => trailOf(IMG.map((m) => ({ t: at(m), e: m })), T, s, at(W)) as [number, number][];
    // And as the rain's script does, each image's grid where the radars saw badly.
    expect(METEO_SCRIPT).toContain(`const blend=${blend},veils=(A,Z,f,tr)=>{const za=bad(Z);if(!O||O.length!==za.length)O=new Float32Array(za.length);
return blend(bad(A),za,A===Z,f,tr&&tr.map(([j,w])=>[bad(j),w]),O)};`);
    type G = { a: number[] };
    const bad = (g: G) => Object.assign(Float32Array.from(g.a), { z: !g.a.some(Boolean) });
    const veils = (A: G, Z: G, f: number, tr: [G, number][] | null) =>
      blend(bad(A), bad(Z), A === Z, f, tr && tr.map(([j, w]): [ReturnType<typeof bad>, number] => [bad(j), w]), new Float32Array(A.a.length));
    // An image of the radar every 5 minutes, each seeing badly in its own cell alone (cell n for the image at 5n).
    const IMG = Array.from({ length: 25 }, (_, n) => n * 5);
    const grid = (m: number) => ({ a: IMG.map((x) => (x === m ? 1 : 0)) });
    // The trail at 62 min, its time shown 60: the images of the hour before 60, each from 1 at its time down to 0.
    const t62 = trail(at(62), at(60))!;
    expect(t62.map(([e]) => e)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    for (const [e, w] of t62) expect(w).toBeCloseTo(1 - (62 - e) / W, 6);
    // A whole play, frame by frame: a zone is on the map only if the radar saw it badly on an image of the hour before
    // the time shown, that time in (marketing, 31/10/2026); and the zone of the image shown is all there.
    for (let T = at(2); T < at(120); T += 6e4 / 7) {
      const i = Math.floor(T / at(5)), a = IMG[i] * 6e4, z = IMG[i + 1] * 6e4, f = (T - a) / (z - a);
      const s = shownAt(T, { a: { t: a }, z: { t: z }, f }, "p");
      const O = veils(grid(IMG[i]), grid(IMG[i + 1]), f, trail(T, s).map(([e, w]): [G, number] => [grid(e), w]));
      IMG.forEach((m, n) => {
        const v = O ? O[n] : 0;
        if (v > 0) expect(at(m) <= s && at(m) > s - at(W)).toBe(true);
        if (at(m) === s && T - s < at(W)) expect(v).toBeGreaterThan(0);
      });
    }
    // Without a trail (less motion), the two images faded.
    const near = (got: Float32Array, want: number[]) => expect([...got]).toEqual(want.map((v) => expect.closeTo(v, 6)));
    const A = { a: [1, 0, 0] }, Z = { a: [0, 1, 0] }, old = { a: [0, 0, 1] };
    near(veils(A, Z, 0.25, null)!, [0.75, 0.25, 0]);
    near(veils(A, Z, 0.75, [[old, 0.4], [A, 0.9]])!, [0.9, 0.5, 0.4]);
    near(veils(Z, Z, 0, [[A, 0.5]])!, [0.5, 1, 0]);
    expect(veils({ a: [0, 0, 0] }, { a: [0, 0, 0] }, 0.5, [[{ a: [0, 0, 0] }, 1]])).toBeNull();
    // The legend says how long before the time shown (marketing's words, a no-break space between figure and unit).
    expect(METEO_SCRIPT).toContain(`const ago=${ago};`);
    expect([30, 60, 120, 240].map(ago)).toEqual(["au cours des 30\u00a0minutes précédentes", "au cours de l'heure précédente", "au cours des 2\u00a0heures précédentes", "au cours des 4\u00a0heures précédentes"]);
  });
});

describe("the rain's edges, its drops and the wind", () => {
  // An image of w by h pixels whose red is each pixel's value.
  const img = (red: number[]) => Uint8ClampedArray.from(red.flatMap((r) => [r, 0, 0, 255]));
  const PAL = [[100, 150, 230, 0.6], [20, 40, 130, 0.9]], EDGE = [10, 30, 80, 1];

  it("draws the rain in clear-cut blues, a line of ink around it, nothing outside", () => {
    // A row from dry to heavy, a step of 28 (the radar's class times 28) every 4 pixels.
    const red = [0, 0, 0, 0, 7, 14, 21, 28, 35, 42, 49, 56, 56, 56, 56];
    const o = bands(img(red), new Uint8ClampedArray(red.length * 4), red.length, 1, PAL, EDGE, 28, 0.5);
    const px = (i: number) => [...o.slice(i * 4, i * 4 + 4)];
    // Outside the rain (under half the first class), nothing; where it starts, the line, its outer side half seen;
    // then the blue of each class, never between two.
    for (const i of [0, 1, 2, 3, 4]) expect(px(i)[3]).toBe(0);
    expect(px(5)).toEqual([...EDGE.slice(0, 3), 128]);
    expect(px(8)).toEqual([100, 150, 230, 153]);
    expect(px(13)).toEqual([20, 40, 130, 230]);
    // From 0.4 of the first class, the rain starts sooner: its line more seen there.
    expect(bands(img(red), new Uint8ClampedArray(red.length * 4), red.length, 1, PAL, EDGE, 28, 0.4)[5 * 4 + 3]).toBeGreaterThan(200);
    expect(METEO_SCRIPT).toContain(`const bands=${bands},soften=${soften};`);
    // No inner named function in what the page embeds: the build would wrap it in a helper the page does not have.
    for (const m of ["M1", "M2", "M3"] as const) expect(meteoVariant(m)).not.toContain("__name");
    expect(rejeuScript()).not.toContain("__name");
    expect(METEO_SCRIPT).toContain(`o.data,cw,ch,KA[dark()?1:0],[...INK[dark()?1:0],1],28,0.4)`);
  });

  it("rounds the radar's cells before cutting them, a lone cell kept", () => {
    // A lone cell of the first class spread 4 times, smoothly (a peak 4 pixels wide each way): blurred, its middle stays
    // over where the rain starts (0.4 of the class), its corners fall under.
    const w = 13, red = Array.from({ length: w * w }, (_, k) => 28 * Math.max(0, 1 - Math.abs((k % w) - 6) / 4) * Math.max(0, 1 - Math.abs(((k / w) | 0) - 6) / 4));
    const a = soften(img(red), w, w, 1);
    expect(a[(6 * w + 6) * 4]).toBeGreaterThan(28 * 0.4);
    expect(a[(6 * w + 6) * 4]).toBeLessThan(28);
    expect(a[(4 * w + 4) * 4]).toBeLessThan(28 * 0.4);
    expect(a[(6 * w + 6) * 4 + 3]).toBe(255);
  });

  it("leans each drop with the wind of the anemometers less than 15 km away, and lets it fall straight without one", () => {
    const ws = [[100, 100, -20, 0], [130, 100, -10, 10]];
    // Next to the first anemometer, its wind; 40 units away, both; past the reach, none: straight down.
    expect(windAt(100, 100, ws, 50)![0]).toBeCloseTo(-20, 0);
    const mid = windAt(115, 100, ws, 50)!;
    expect(mid[0]).toBeCloseTo(-15, 5);
    expect(mid[1]).toBeCloseTo(5, 5);
    expect(windAt(400, 400, ws, 50)).toBeNull();
    expect(METEO_SCRIPT).toContain(`const wat=${windAt};`);
    expect(METEO_SCRIPT).toMatch(/wat\(p\.x\*\d+(\.\d+)?\/cw,p\.y\*\d+(\.\d+)?\/ch,WS,\d+(\.\d+)?\)/);
    // M1: down the screen, leaning 0.75° a km/h of east-west wind, 30° at most, the way the wind goes; straight without one.
    const m1 = meteoVariant("M1");
    expect(m1).toContain(`const t=w?Math.min(30,Math.abs(w[0])*0.75)*Math.PI/180:0;p.dx=w?Math.sign(w[0])*Math.sin(t):0;p.dy=Math.cos(t)`);
    // Each drop drawn back along its way, from where it is.
    expect(m1).not.toContain(`if(q>=2)`);
    expect(METEO_SCRIPT).toContain(`g.moveTo(p.x,p.y);g.lineTo(p.x-p.dx*p.l,p.y-p.dy*p.l)`);
    expect(METEO_SCRIPT).toContain(`p.x+=p.dx*p.v*k;p.y+=p.dy*p.v*k`);
    // M2 (the page's) and M3, seen from above: the way the wind goes, north or south too, in 16 directions, from 2 km/h;
    // faster as it blows harder. M3 a splash where a tenth of them end.
    const m3 = meteoVariant("M3");
    for (const s of [METEO_SCRIPT, m3]) expect(s).toContain(`p.v=(30+30*Math.min(q,50)/50)/30;if(q>=2){const s=Math.PI*2/16,a=Math.round(Math.atan2(w[1],w[0])/s)*s;p.dx=Math.cos(a);p.dy=Math.sin(a)}else{p.dx=0;p.dy=1}};`);
    expect(m3).toContain(`SP.push({x:p.x,y:p.y,a:0});if(ds.length>n||!born(p))ds.splice(i,1)`);
    expect(METEO_SCRIPT).not.toContain("SP.push");
    // In the replay, the anemometers of the image's hour.
    expect(rejeuScript()).toContain(`RJ.p.wind(b?(b.i<0?RJ.v&&RJ.v.live:sx("v",b.i)):null,b&&b.t)`);
    expect(METEO_SCRIPT).toContain(`back:()=>{const was=moving();mx=null;WS=WL;`);
  });

  it("halves the drops on a phone whose frames take over 30 ms, then holds them still", () => {
    // The median of 30 frames: over 30 ms, half the drops; again, none move (the map's own frames stop too).
    expect(METEO_SCRIPT).toContain(`FT.push(performance.now()-t0);if(FT.length===30){FT.sort((a,b)=>a-b);if(FT[15]>30){QF=QF===1?.5:0;if(!QF)o.again()}FT=[]}`);
    expect(METEO_SCRIPT).toContain(`Math.round(n*cw*ch/(A.j.w*A.j.h)/1e4*QF)`);
    expect(METEO_SCRIPT).toContain(`const moving=()=>!hush()&&QF>0&&`);
  });

  it("stops the drops with a button, and leaves them out of the replay in the variant without", () => {
    expect(METEO_SCRIPT).toContain(`className="gp";gl();gb.addEventListener("click",()=>{stop=!stop;gl();o.again()})`);
    expect(METEO_SCRIPT).toContain(`hush=()=>!true&&!!RJ.on`);
    expect(meteoVariant("M2", false)).toContain(`hush=()=>!false&&!!RJ.on`);
  });

  it("says what the drops show and the wind they follow, in marketing's words; none when they are left out", () => {
    const words = (verb: string) => `const gd=()=>hush()?"":"Les gouttes sont un effet visuel\u00a0: plus la pluie est forte, plus elles sont nombreuses et grosses"+(WT==null?". Le vent de cette heure n'est pas connu\u00a0: elles tombent droit.":
", et elles ${verb} dans le sens du vent estimé d'après les anémomètres "+(WT==="live"?"les plus proches, à leur dernière mesure.":"de Météo-France les plus proches, à "+hm(new Date(WT).toISOString())+".")+" Loin de tout anémomètre, elles tombent droit.");`;
    expect(METEO_SCRIPT).toContain(words("vont"));
    expect(meteoVariant("M1")).toContain(words("penchent"));
    expect(rejeuScript()).toContain(`sx("v",b.i)):null,b&&b.t)`);
    // Bigger and longer as it rains harder.
    expect(METEO_SCRIPT).toContain(`p.w=DW[c-1];p.l=DL[c-1];`);
  });

  it("plays the 24 hours an image an hour, the strongest rain of each, and says so", () => {
    expect(rejeuScript()).toContain(`const ST={"6h":3e5,"24h":36e5,"7j":36e5}`);
    expect(METEO_SCRIPT).toContain(`"à chaque endroit, la pluie la plus forte vue par le radar de Météo-France "+span(j)`);
    expect(METEO_SCRIPT).toContain(`Cap(span(j))+", le radar de Météo-France n'a pas vu de pluie sur l'île."`);
    expect(METEO_SCRIPT).toContain(`span=(j)=>"entre "+hx(j.de)+" et "+hx(j.fin)+" le "+dm_(j.fin)`);
    expect(METEO_SCRIPT).toContain(`" "+BW+"\u00a0: zones que le radar a mal vues pendant cette heure, où la pluie peut être manquée."`);
    // The hatches linger over 6 hours only: an hour's image is already where the radars saw badly in its hour.
    expect(rejeuScript()).toContain(`trail=(s)=>rm||d!=="6h"?null:keep(`);
    expect(rejeuScript()).toContain(`hh.textContent=!end&&de?hx(de)+" – "+hx(t):hmm(t)`);
    // Each image held 60 % of its time, then faded in smoothly, over 24 hours and 7 days; over 6 hours as before.
    expect(rejeuScript()).toContain(`const ease=(f)=>{if(d==="6h")return f;const x=Math.max(0,Math.min(1,(f-.6)/.4));return x*x*(3-2*x)};`);
  });

  it("spreads the week's rain gauges between them by 3 hours, said estimated", () => {
    // Four land cells in a row, a gauge at each end: 1.5 mm in the 3 hours and dry; the sea (0) left dry.
    const cl = [0.1, 0.5, 1, 2, 4, 8, 16, 32];
    expect(gaugeField([[0, 0, 1.5], [3, 0, 0]], [1, 1, 1, 1, 0], 5, 1, cl)).toBe("33100");
    expect(gaugeField([], [1, 1], 2, 1, cl)).toBe("00");
    expect(rejeuScript()).toContain(`field=${gaugeField}`);
    expect(METEO_SCRIPT).toContain(`"En bleu\u00a0: la pluie mesurée par les pluviomètres de Météo-France "+span(j)+", étalée entre eux par calcul\u00a0; "+fo()+" Entre deux pluviomètres, c'est une estimation, pas une mesure\u00a0: une averse qui tombe loin d'eux peut manquer."`);
    expect(METEO_SCRIPT).toContain(`Cap(span(j))+", aucun pluviomètre de Météo-France n'a mesuré de pluie."`);
    expect(METEO_SCRIPT).toContain(`plus de 32\u202fmm en 3\u00a0h`);
    // The 3 hours from midnight in La Réunion, each drawn whole at its middle.
    expect(rejeuScript()).toContain(`if(((th(i)/36e5+4)%24)%3===0&&st.some((s)=>three(s,{w})!=null))k.push({t:th(i)-54e5,end:th(i),i,w})`);
  });
});
