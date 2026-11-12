import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteorOi from "../src/providers/meteor-oi.js";
import { enTete } from "../src/tools/representativeness.js";
import { amateur, islandTour, meteoActuelle, NATURE_AMATEUR } from "../src/tools/meteo.js";
import type { StationAnswer, StationNow } from "../src/web/data.js";
import { stationsMap, VALEURS_JS, windArrow, windColor } from "../src/web/meteo-carte.js";
import { chip, CSS, meteoPage, placePage } from "../src/web/pages.js";
import { PAGES } from "../src/web/places.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-18T19:20:00Z");
const ORIGIN = "https://rundata.re";

/** The airports' METAR and the FFVL's beacons of 18/10 at 19:16, and MétéoR-OI's copy with Cambaie and Marla only. */
async function cache(): Promise<Cache> {
  const store = new MemoryStore();
  const at = NOW.getTime();
  const releves = (JSON.parse(fixture("ffvl_releves.json")) as { date: string }[]).map((r) => ({ ...r, date: "2026-10-18T19:16:00Z" }));
  await store.put("metar", { value: JSON.parse(fixture("metar.json")), fetchedAt: at });
  await store.put("ffvl:releves", { value: releves, fetchedAt: at });
  meteorOi.configure(async () => ({
    lu: NOW.toISOString(),
    mesures: [
      { code: "CAM015", mesure_a: "2026-10-18T19:15:00.000Z", temperature: 24.2, humidite: 70, vent: 18, direction: 135, rafales: 30, pluie_1h: 0 },
      { code: "MDM1570", mesure_a: "2026-10-18T19:15:00.000Z", temperature: 9.1, vent: 0, pluie_1h: 0 },
    ],
  }));
  return new Cache(store, () => at);
}

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  meteorOi.configure(undefined);
});

describe("an amateur network's stations (the user, 10/11/2026: « telles quelles, avec une fiabilité non vérifiée »)", () => {
  it("is said by its source, not by its name: MétéoR-OI's is amateur, the official networks' are not", () => {
    expect(meteorOi.SOURCE.amateur).toBe(true);
    expect(amateur("meteor_oi")).toBe(true);
    for (const id of ["meteofrance", "metar", "ffvl"]) expect(amateur(id), id).toBe(false);
  });

  it("answers a place with an official station first, the amateur one after them, said so, with its credit, out of the summary", async () => {
    const r = body(await meteoActuelle(await cache(), "Le Port", NOW));
    const stations = r.stations as (StationAnswer & { credit?: string; lien?: string })[];
    // Cambaie is the nearest (« bonne »), still after the others.
    expect(stations[0].source).not.toBe("meteor_oi");
    expect(stations.findIndex((s) => s.amateur)).toBe(stations.length - 1);
    expect(stations.at(-1)).toMatchObject({
      station: "Cambaie", source: "meteor_oi", amateur: true, nature: NATURE_AMATEUR, credit: "Données : MétéoR-OI, licence CC BY-NC 4.0", lien: "https://www.meteor-oi.re", pertinence: "bonne",
    });
    expect(NATURE_AMATEUR).toBe("mesure de station amateur, fiabilité non vérifiée");
    expect(r.resume).not.toContain("Cambaie");
    expect(stations.filter((s) => !s.amateur).every((s) => s.nature === undefined)).toBe(true);
    // The station a page or a summary names first is never the amateur one.
    expect(enTete(stations)?.station).not.toBe("Cambaie");
  });

  it("leaves the amateur stations out of the island's tour", async () => {
    const { tour, all } = await islandTour(await cache(), NOW);
    expect(tour.some(({ o }) => o.station.source === "meteor_oi")).toBe(false);
    expect(all.filter(({ o }) => o.station.source === "meteor_oi")).toHaveLength(2);
  });
});

// /meteo's stations: two of Météo-France's, and MétéoR-OI's Marla, the coldest and the only one with a wind here.
const st = (nom: string, source: string, extra: Partial<StationNow>): StationNow => ({
  nom, source, lon: 55.5, lat: -21.1, altitude_m: 500, time: "2026-10-18T19:12:00Z", stale: false, ...extra,
});
const STATIONS: StationNow[] = [
  st("Saint-Denis Gillot", "meteofrance", { id: "97418110", lon: 55.52, lat: -20.89, altitude_m: 8, temperature: 24.6, vent: 20, direction: 120, pluie_1h: 0 }),
  st("Plaine des Cafres", "meteofrance", { id: "97422440", lon: 55.57, lat: -21.21, altitude_m: 1560, temperature: 12.3, vent: 8, direction: 90, pluie_1h: 0.4 }),
  st("Marla", "meteor_oi", { id: "MDM1570", lon: 55.4, lat: -21.1, altitude_m: 1570, temperature: 9.1, vent: 0, pluie_1h: 0, amateur: true }),
];
const COPY = { value: { stations: STATIONS.slice(0, 2), toutes: STATIONS, mer: [], sources: [], indisponibles: [] }, fetchedAt: NOW, stale: false };

describe("/meteo with an amateur station", () => {
  it("draws it on its map only in a group of its own, under an unticked box, dotted, its bubble saying what it is", () => {
    const svg = stationsMap(STATIONS);
    const group = (cls: string) => svg.slice(svg.indexOf(`<g class="sts ${cls}">`), svg.indexOf("</g><g class=", svg.indexOf(`<g class="sts ${cls}">`)));
    expect(svg).toContain('<label class="amchk"><input type="checkbox" id="wx-am"> Stations amateur</label>');
    // The official stations' group without it; the other with every station, Marla's mark of class « am ».
    expect(svg.split('<g class="sts sts-of">')[1].split('<g class="sts sts-am">')[0]).not.toContain("Marla");
    const am = svg.split('<g class="sts sts-am">')[1].split('<g class="rj-st">')[0];
    expect(am).toContain("Gillot");
    expect(am).toMatch(/<a class="mk[^"]* am" href="#st-marla"/);
    expect(am).toContain("station amateur (MétéoR-OI), fiabilité non vérifiée. Données : MétéoR-OI, licence CC BY-NC 4.0");
    expect(group("sts-of")).not.toContain(" am\"");
    // The colours between the stations and the wind field without it, unless the box is ticked (the page's script).
    const voile = JSON.parse(svg.match(/data-voile="([^"]+)"/)![1].replaceAll("&quot;", '"')) as number[][];
    expect(voile.map((v) => v[3])).toEqual([24.6, 12.3]);
    expect(JSON.parse(svg.match(/data-voile-am="([^"]+)"/)![1].replaceAll("&quot;", '"'))).toHaveLength(1);
    expect(svg).toContain("data-vent-am=");
    // The legends count the official stations; ticked, a line says what the dotted outline is (marketing).
    expect(svg).toContain("Température mesurée sous abri à 2 des 2 stations");
    expect(svg).toContain("2 anémomètres");
    expect(svg).toContain('<span class="amlg">Contour pointillé : station amateur.</span>');
  });

  it("draws neither the box nor the amateur group without an amateur station", () => {
    const svg = stationsMap(STATIONS.slice(0, 2));
    for (const no of ['id="wx-am"', "sts-am", "data-voile-am", "data-vent-am", "amlg"]) expect(svg, no).not.toContain(no);
  });

  it("says the island's range and counts its stations without it, and lists it apart, folded, said so", () => {
    const page = meteoPage(ORIGIN, COPY, NOW);
    const status = page.slice(page.indexOf('<div class="now">'), page.indexOf("</div>", page.indexOf('<div class="now">')));
    expect(status).toContain("Plaine des Cafres");
    expect(status).not.toContain("Marla");
    expect(page).toContain("Les 2 stations, de la côte aux sommets");
    const list = page.slice(page.indexOf('id="stl"'), page.indexOf("</ul>", page.indexOf('id="stl"')));
    expect(list).not.toContain("Marla");
    const folded = page.slice(page.indexOf('<details class="pli amdet" id="sta">'));
    expect(folded).toMatch(/^<details class="pli amdet" id="sta"><summary><h3>La station amateur de MétéoR-OI : fiabilité non vérifiée<\/h3><\/summary>/);
    expect(folded.slice(0, folded.indexOf("</details>"))).toContain('<p class="cr">station amateur (MétéoR-OI), fiabilité non vérifiée</p>');
  });

  it("counts several amateur stations in the title of their section", () => {
    const two = [...STATIONS, st("Cambaie", "meteor_oi", { id: "CAM015", lon: 55.28, lat: -20.96, altitude_m: 20, temperature: 24.2, amateur: true })];
    const page = meteoPage(ORIGIN, { ...COPY, value: { ...COPY.value, toutes: two } }, NOW);
    expect(page).toContain("<summary><h3>Les 2 stations amateur de MétéoR-OI : fiabilité non vérifiée</h3></summary>");
  });

  it("gives the amateur list the cards of Météo-France's, its wind arrow sized, not filling the screen (10/11/2026)", () => {
    // Its list a child of its section, as the rules aim at it.
    expect(meteoPage(ORIGIN, COPY, NOW)).toMatch(/<details class="pli amdet" id="sta"><summary>.*?<\/summary><ul class="stations"><li class="st tgt" id="st-marla"/);
    // Every rule of Météo-France's list for the amateur one too, but its folding after twelve.
    const rules = [...CSS.replace(/\/\*[^]*?\*\//g, "").matchAll(/([^{}]*#stl[^{}]*)\{/g)].map((m) => m[1].trim());
    expect(rules.filter((s) => !s.startsWith(":is(#stl,#sta>.stations)"))).toEqual(["html:has([data-js]:not([hidden])) #stl.plie>li:nth-child(n+13)"]);
    for (const part of ["{display:grid", " .st{", " .t{", " .pl{", " .pl svg{width:.85rem;height:.85rem}", " .ar{fill:none"]) {
      expect(CSS, part).toContain(`:is(#stl,#sta>.stations)${part}`);
    }
  });
});

describe("a place's page with an amateur station", () => {
  it("gives the official stations' measures, and the amateur one folded under them, said so, with its distance and credit", async () => {
    const p = PAGES.find((x) => x.slug === "le-port")!;
    const meteo = body(await meteoActuelle(await cache(), "Le Port", NOW));
    const page = placePage(ORIGIN, p, { value: { meteo }, fetchedAt: NOW, stale: false }, NOW);
    const two = page.slice(page.indexOf('<div class="two">'), page.indexOf('<details class="pli amdet">'));
    expect(two).not.toContain("Cambaie");
    const folded = page.slice(page.indexOf('<details class="pli amdet">'), page.indexOf("</details>", page.indexOf('<details class="pli amdet">')));
    expect(folded).toMatch(/<summary><h3>Station amateur la plus proche, à [\d,]+ km \(MétéoR-OI\) : fiabilité non vérifiée<\/h3><\/summary>/);
    expect(folded).toContain("<h3>Cambaie</h3>");
    expect(folded).toContain('<p class="cr">Données : <a href="https://www.meteor-oi.re" rel="noopener">MétéoR-OI</a>');
  });
});

describe("/meteo's list script and an amateur station aimed at", () => {
  it("opens the amateur section for a link to one of its stations, and brings its row into view", async () => {
    const { runInNewContext } = await import("node:vm");
    const { LISTE_STATIONS_JS } = await import("../src/web/meteo-carte.js");
    const row = { id: "st-marla", scrolled: false, scrollIntoView() { this.scrolled = true; } };
    const sta = { open: false, contains: (x: unknown) => x === row };
    const stl = { classList: { remove() {} }, querySelectorAll: () => [], children: [] };
    const sel = { value: "", addEventListener() {} };
    const ids: Record<string, unknown> = { stl, stc: sel, sta, "st-marla": row };
    runInNewContext(LISTE_STATIONS_JS, {
      location: { hash: "#st-marla" },
      document: { readyState: "complete", getElementById: (id: string) => ids[id] ?? null, querySelectorAll: () => [] },
      addEventListener() {},
      decodeURIComponent,
    });
    expect(sta.open).toBe(true);
    expect(row.scrolled).toBe(true);
  });
});

describe("/meteo's map with « Valeurs » (the user, 10/11/2026: « afficher/masquer les valeurs, en gardant toujours les points »)", () => {
  const svg = stationsMap(STATIONS);
  /** The first link of a station whose words hold `name`, in `of`. */
  const mark = (name: string, of = svg) => of.split("</a>").find((a) => a.includes("<a class=\"mk") && a.slice(a.lastIndexOf("<a class=\"mk")).includes(name))!.replace(/^[^]*(?=<a class="mk)/, "");
  const rules = CSS.replace(/\/\*[^]*?\*\//g, "");

  /** A fake page around the map: each station's link and group, the box, the figure, the storage; VALEURS_JS run in it. */
  async function run(stored: string | null) {
    const { runInNewContext } = await import("node:vm");
    type El = { name: string; attrs: Record<string, string>; kids: El[]; append: (...k: El[]) => void; setAttribute: (k: string, v: string) => void };
    const el = (name: string): El => ({ name, attrs: {}, kids: [], append(...k) { this.kids.push(...k); }, setAttribute(k, v) { this.attrs[k] = String(v); } });
    const links = [...svg.matchAll(/<a class="mk[^"]*"[^>]*data-pt="([^"]*)"[^>]*><g class="mo" style="([^"]*)">/g)].map((m) => {
      const g = { ...el("g"), getAttribute: (k: string) => (k === "style" ? m[2] : null) };
      return { pt: m[1], g, getAttribute: (k: string) => (k === "data-pt" ? m[1] : null), querySelector: () => g };
    });
    const classes = new Set<string>();
    const figure = { querySelectorAll: () => links, classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } };
    let change = () => {};
    const box = { checked: true, closest: () => figure, addEventListener: (_: string, f: () => void) => (change = f) };
    const kept: Record<string, string> = {};
    const ready: (() => void)[] = [], later: (() => void)[] = [];
    runInNewContext(VALEURS_JS, {
      document: { readyState: "loading", addEventListener: (_: string, f: () => void) => ready.push(f), getElementById: (id: string) => (id === "wx-val" ? box : null), createElementNS: (_: string, n: string) => el(n) },
      setTimeout: (f: () => void) => later.push(f),
      localStorage: { getItem: () => stored, setItem: (k: string, v: string) => (kept[k] = v) },
      Math,
    });
    const untick = () => { box.checked = false; change(); };
    const tick = () => { box.checked = true; change(); };
    /** The page ready, then what it put off. */
    const settle = () => { ready.splice(0).forEach((f) => f()); later.splice(0).forEach((f) => f()); };
    return { box, classes, links, kept, untick, tick, settle };
  }
  const drawn = (l: { g: { kids: { attrs: Record<string, string> }[] } }) => l.g.kids.map((k) => k.attrs.class);

  it("has one box for the three layers, ticked, beside « Stations amateur », hidden without a script", () => {
    expect(svg).toContain('<div class="wxchk"><label class="amchk" data-js hidden><input type="checkbox" id="wx-val" checked> Valeurs</label><label class="amchk"><input type="checkbox" id="wx-am">');
    expect(svg.match(/id="wx-val"/g)).toHaveLength(1);
    expect(svg).toContain(VALEURS_JS);
  });

  it("draws no point with the page, only what each station's would be", () => {
    expect(svg).not.toContain('class="pt ');
    // Gillot: its temperature's colour, no rain, an arrow towards the north-west (wind from the south-east, 120°) of 20 km/h.
    const [L, w] = windArrow(20);
    expect(mark("Gillot")).toContain(`data-pt="t:${chip(24.6).slice(1)}|p:0|v:${L}:${w}:300:${windColor(20).slice(1)}"`);
    // Marla: a calm, a small disc; amateur, dotted.
    const marla = mark("Marla", svg.slice(svg.indexOf('<g class="sts sts-am">')));
    expect(marla).toMatch(/^<a class="mk[^"]* am"/);
    expect(marla).toContain('data-pt="t:');
    expect(marla).toContain("|v:0:0:0:4668b0\"");
    expect(rules).toContain(".map a.mk.am circle.pt{stroke-dasharray:7 5}");
  });

  it("hides the discs, pills and their ties once unticked, and shows each station's points, made once", async () => {
    expect(rules).toContain(".wxmap:not(.sansv) .pt{display:none!important}.wxmap.vatt .sts{visibility:hidden}");
    expect(rules).toContain(".wxmap.sansv :is(.sh,.mv,.wv,.wt,.hit:not(.pt)){display:none!important}");
    expect(rules).not.toMatch(/:has\(#wx-val/);
    const r = await run(null);
    expect(r.box.checked).toBe(true);
    expect(r.classes.has("sansv")).toBe(false);
    expect(r.links.every((l) => l.g.kids.length === 0)).toBe(true);
    r.untick();
    expect(r.classes.has("sansv")).toBe(true);
    expect(r.kept["wx-valeurs"]).toBe("0");
    const gillot = r.links.find((l) => l.pt.startsWith(`t:${chip(24.6).slice(1)}`))!;
    expect(drawn(gillot)).toEqual(["pt l-t", "hit pt l-t", "pt l-p", "hit pt l-p", "pt l-v wa", "hit pt l-v"]);
    const arrow = gillot.g.kids[4] as unknown as { attrs: Record<string, string>; kids: { attrs: Record<string, string> }[] };
    expect(arrow.attrs.transform).toMatch(/^translate\([\d.]+ [\d.]+\) rotate\(300\)$/);
    expect(arrow.kids[1].attrs.style).toBe(`stroke:${windColor(20)};stroke-width:${windArrow(20)[1]}`);
    expect(gillot.g.kids[2].attrs.style).toBe("fill:#fff;stroke:#7d93a8;stroke-width:4");
    // On its place, where the station's marks are scaled about.
    expect(gillot.g.kids[0].attrs.cx).toBe(/transform-origin:([\d.]+)px/.exec(svg.slice(svg.indexOf('data-pt="' + gillot.pt)))![1]);
    // Ticked again then unticked: the class goes and comes back, the points are not made twice.
    r.tick();
    expect(r.classes.has("sansv")).toBe(false);
    expect(r.kept["wx-valeurs"]).toBe("1");
    r.untick();
    expect(gillot.g.kids).toHaveLength(6);
  });

  it("starts unticked when the reader left it so, its points made once the page is ready", async () => {
    const r = await run("0");
    expect(r.box.checked).toBe(false);
    // While the page loads, the marks unseen, laid out still; the points once it is ready.
    expect([...r.classes]).toEqual(["vatt"]);
    expect(r.links.every((l) => l.g.kids.length === 0)).toBe(true);
    r.settle();
    expect([...r.classes]).toEqual(["sansv"]);
    expect(r.links.every((l) => l.g.kids.length > 0)).toBe(true);
  });

  it("draws a wind's arrow longer and thicker as it blows harder, from the legend's blue to its red", () => {
    expect(windColor(0)).toBe("#4668b0");
    expect(windColor(60)).toBe("#b22c48");
    expect(windColor(90)).toBe("#b22c48");
    const [l5, w5] = windArrow(5), [l40, w40] = windArrow(40);
    expect(l40).toBeGreaterThan(l5);
    expect(w40).toBeGreaterThan(w5);
    expect(windArrow(1)[0]).toBeGreaterThanOrEqual(34);
  });
});
