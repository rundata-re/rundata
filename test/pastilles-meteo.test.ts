import { describe, expect, it } from "vitest";
import { BALISES } from "../src/providers/ffvl.js";
import { STATIONS_974 } from "../src/providers/meteofrance-stations.js";
import type { StationNow } from "../src/web/data.js";
import { project } from "../src/web/map.js";
import { stationId } from "../src/web/pages.js";
import { discR, nudge, stationsMap } from "../src/web/meteo-carte.js";

// Every station of /meteo's map can be touched where it is seen: in each layer, its dot's centre and at least half of
// its dot (69 points of a 9 × 9 grid inside the disc) have no other station's mark over them, its touch area included.
// The marks are drawn in their order, the last on top, as the browser draws and hit-tests an SVG; a layer hidden by the
// page's CSS (display:none) catches nothing. The map is drawn at the same scale at every width (its viewBox): the same
// share at 320 and 390 px, in the page and in full screen.

const at = "2026-11-07T05:12:00Z";
// The stations the map drew in each layer on 07/11/2026 at 09:12 (1.0.452): 46 temperatures, 55 rain gauges, 20 winds.
const LIVE = {
  t: "bagatelle beauvallon bellecombe-jacob bellevue-bras-panon bois-de-nefles-saint-paul bois-rouge bras-pistolet bras-sec chaudron cilaos colimacons colorado dos-d-ane grand-coude grand-galet grand-ilet gros-piton-sainte-rose hauts-de-sainte-rose la-crete la-nouvelle le-baril le-dimitile le-guillaume le-port le-tevelave le-tremblet mare-a-vieille-place menciol palmiste-rouge petite-france piton-bloc piton-maido piton-saint-leu plaine-des-cafres plaine-des-chicots plaine-des-makes plaine-des-palmistes pointe-des-trois-bassins pont-d-yves pont-mathurin saint-benoit saint-denis-gillot-aeroport saint-francois saint-joseph saint-leu saint-pierre-pierrefonds-aeroport",
  p: "bagatelle beauvallon bellecombe-jacob bellevue-bras-panon belouve bois-de-nefles-saint-paul bois-rouge bras-pistolet bras-sec chaudron chemin-de-ceinture cilaos colimacons colorado commerson dos-d-ane grand-coude grand-galet grand-ilet gros-piton-sainte-rose hauts-de-sainte-rose ilet-a-cordes ilet-a-vidot la-crete la-nouvelle le-baril le-brule-val-fleuri le-dimitile le-guillaume le-port le-tevelave le-tremblet menciol montauban palmiste-rouge petite-france piton-bloc piton-maido piton-saint-leu plaine-des-cafres plaine-des-chicots plaine-des-fougeres plaine-des-makes plaine-des-palmistes pointe-des-trois-bassins pont-d-yves pont-mathurin saint-benoit saint-denis-gillot-aeroport saint-francois saint-joseph saint-leu saint-pierre-pierrefonds-aeroport salazie-village takamaka-pk-12",
  v: "balise-de-kelonia balise-du-maido balise-du-trou-d-eau balise-pole-aeronautique-de-cambaie bellecombe-jacob bellevue-bras-panon cilaos colimacons gros-piton-sainte-rose le-baril le-port petite-france piton-maido plaine-des-cafres plaine-des-palmistes pointe-des-trois-bassins pont-mathurin saint-benoit saint-denis-gillot-aeroport saint-pierre-pierrefonds-aeroport",
};
const PLACES = [
  ...STATIONS_974.map(([id, nom, lat, lon, altitude_m]) => ({ id, nom, lat, lon, altitude_m, source: "meteofrance" })),
  ...BALISES.map((b) => ({ id: String(b.id), nom: b.nom, lat: b.lat, lon: b.lon, altitude_m: b.altitude_m, source: "ffvl" })),
  { id: "1300", nom: "Balise Pôle Aéronautique de Cambaie", lat: -20.98, lon: 55.29, altitude_m: 5, source: "pioupiou" },
];
/** The stations of `sets` (ids by layer, « tous » for every Météo-France station), each with the measures of its layers. */
function stations(sets: Record<"t" | "p" | "v", string | "tous">, rain: (i: number) => number): StationNow[] {
  const has = (l: "t" | "p" | "v", s: { nom: string; source: string }) =>
    sets[l] === "tous" ? s.source === "meteofrance" : sets[l].split(" ").includes(stationId(s.nom).slice(3));
  return PLACES.map((s, i) => ({
    ...s, time: at, stale: false,
    ...(has("t", s) && { temperature: 12 + (i % 17) }),
    ...(has("p", s) && { pluie_1h: rain(i) }),
    ...(has("v", s) && { vent: 5 + (i % 30), direction: (i * 47) % 360 }),
  })).filter((s) => s.temperature != null || s.pluie_1h != null || s.vent != null);
}

type Shape = { owner: string; layer: string; kind: "hit" | "dot" | "pill"; x: number; y: number; r: number };
/** The marks of the stations' group, in the order they are drawn: circles with their white edge, wind pills. */
function shapes(svg: string): Shape[] {
  const sts = svg.slice(svg.indexOf('<g class="sts">'), svg.indexOf('<g class="rj-st">'));
  const out: Shape[] = [];
  for (const a of sts.split('<a class="mk').slice(1)) {
    const owner = /href="#([^"]+)"/.exec(a)![1];
    for (const m of a.matchAll(/<circle class="(hit|sh) l-([tpv])" cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"([^>]*)>/g)) {
      const stroke = /stroke-width:(\d+)/.exec(m[6]);
      // The page's white edge (4) on a dot, or the hollow dot's own stroke; none on a touch area.
      const edge = m[1] === "hit" ? 0 : stroke ? +stroke[1] / 2 : 2;
      out.push({ owner, layer: m[2], kind: m[1] === "hit" ? "hit" : "dot", x: +m[3], y: +m[4], r: +m[5] + edge });
    }
    for (const m of a.matchAll(/<g class="sh l-v wv"><rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="96" height="48" rx="24"\/>/g))
      out.push({ owner, layer: "v", kind: "pill", x: +m[1] + 46, y: +m[2] + 24, r: 24 });
  }
  return out;
}
/** A pill is the line between its two round ends (x - 22, x + 26), 24 around it, and its white edge. */
const inside = (s: Shape, x: number, y: number) =>
  s.kind === "pill" ? Math.hypot(x - Math.min(Math.max(x, s.x - 22), s.x + 26), y - s.y) <= s.r + 1.5 : Math.hypot(x - s.x, y - s.y) <= s.r;
/** For each station's dot of a layer, the points of its disc where it is on top, of how many, and at its centre. */
function onTop(svg: string, layer: string) {
  const all = shapes(svg).filter((s) => s.layer === layer);
  const top = (x: number, y: number) => all.findLast((s) => inside(s, x, y))?.owner;
  return all.filter((s) => s.kind !== "hit").map((d) => {
    let n = 0, on = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const x = d.x - d.r + (2 * d.r * (i + 0.5)) / 9, y = d.y - d.r + (2 * d.r * (j + 0.5)) / 9;
      if (Math.hypot(x - d.x, y - d.y) > d.r) continue;
      n++;
      if (top(x, y) === d.owner) on++;
    }
    const by = all.findLast((s) => s.owner !== d.owner && inside(s, d.x, d.y));
    return { st: d.owner, on, n, centre: top(d.x, d.y) === d.owner, by: by && `${by.owner} ${by.kind} r${by.r} @${by.x},${by.y} / ${d.x},${d.y}` };
  });
}

const RAINS: [string, (i: number) => number][] = [
  ["pas de pluie", () => 0],
  ["petites pluies", (i) => (i % 3 ? 0 : 0.4)],
  ["averses", (i) => [0, 0.4, 2.5, 12.6, 0, 31][i % 6]],
];
// The stations of 07/11, and every Météo-France station measuring temperature and rain (the winds of 07/11).
const SETS: [string, Record<"t" | "p" | "v", string>][] = [["07/11", LIVE], ["toutes", { t: "tous", p: "tous", v: LIVE.v }]];
const CASES: [string, StationNow[]][] = SETS.flatMap(([n, set]) => RAINS.map(([r, rain]): [string, StationNow[]] => [`${n}, ${r}`, stations(set, rain)]));

describe("stations' map: every dot touched where it is seen", () => {
  it("the stations of 07/11 are all found", () => {
    for (const l of ["t", "p", "v"] as const) expect(stations(LIVE, () => 0).filter((s) => (l === "t" ? s.temperature : l === "p" ? s.pluie_1h : s.vent) != null).length, l).toBe(LIVE[l].split(" ").length);
  });
  for (const [name, list] of CASES) {
    it(`each layer, ${name}`, () => {
      const svg = stationsMap(list);
      const bad: string[] = [];
      for (const layer of ["t", "p", "v"]) {
        const got = onTop(svg, layer);
        expect(got.length, layer).toBeGreaterThanOrEqual(20);
        bad.push(...got.filter((g) => !g.centre || 2 * g.on < g.n).map((g) => `${layer} ${g.st} ${g.on}/${g.n}${g.centre ? "" : " centre"} ${g.by}`));
      }
      expect(bad).toEqual([]);
    });
  }

  it("a dot never leaves its place by more than its radius, and only when it would cover another", () => {
    for (const [name, list] of CASES) {
      const svg = stationsMap(list);
      const marks = shapes(svg);
      for (const s of list) {
        const [x, y] = project(s.lon, s.lat);
        for (const m of marks.filter((m) => m.owner === stationId(s.nom) && m.kind === "dot" && m.layer === "t"))
          expect(Math.hypot(m.x - x, m.y - y), `${name} ${s.nom}`).toBeLessThanOrEqual(m.r - 2 + 0.5);
      }
    }
    // Two dots 18 units apart (Grand-Coude, Grand-Galet): just touching, half the way each.
    expect(nudge([[100, 100], [100, 118]], [17, 17])).toEqual([[100, 92], [100, 126]]);
    // Apart already: unmoved; on the same place: side by side, each by its radius at most.
    expect(nudge([[100, 100], [140, 100]], [17, 17])).toEqual([[100, 100], [140, 100]]);
    expect(nudge([[100, 100], [100, 100]], [17, 17])).toEqual([[83, 100], [117, 100]]);
    // Three on one place: each stops at its radius at most, the room left kept.
    const three: [number, number][] = [[100, 100], [100, 100], [100, 100]];
    for (const [i, [x, y]] of nudge(three, [17, 17, 17]).entries()) expect(Math.hypot(x - three[i][0], y - three[i][1])).toBeLessThanOrEqual(17.5);
    expect(discR()).toBe(17);
  });

  it("each touch area is shown with its layer", () => {
    const svg = stationsMap(CASES[0][1]);
    expect(svg).not.toContain('<circle class="hit" ');
    expect(svg).toMatch(/<circle class="hit l-t" cx="\d+" cy="\d+" r="\d+" style="fill:transparent;stroke:none"\/>/);
    expect(svg).toMatch(/<circle class="hit l-p" /);
    expect(svg).toMatch(/<circle class="hit l-v" /);
  });
});
