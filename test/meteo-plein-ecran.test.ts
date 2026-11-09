import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { MOTS, ZOOM_SCRIPT } from "../src/web/carte-zoom.js";
import type { StationNow } from "../src/web/data.js";
import { FIN_SCRIPT, H, NOMS_SCRIPT, project, RELIEF_FIN, RELIEF_FIN_N, RELIEF_PX, W } from "../src/web/map.js";
import { MARQUES_JS, MARQUES_PX, METEO_SCRIPT, stationsMap, ZOOM_METEO } from "../src/web/meteo-carte.js";
import { CSS } from "../src/web/pages.js";
import { pleinEcran } from "../src/web/plein-ecran.js";

// Two of Météo-France's stations, an anemometer of the FFVL a few hundred metres from one (its pill moved apart), and
// two of MétéoR-OI's: one with a temperature and a wind, a rain gauge alone.
const st = (nom: string, source: string, extra: Partial<StationNow>): StationNow => ({
  nom, source, lon: 55.5, lat: -21.1, altitude_m: 500, time: "2026-11-10T07:54:00Z", stale: false, ...extra,
});
const OFFICIELLES: StationNow[] = [
  st("Saint-Denis Gillot", "meteofrance", { id: "97418110", lon: 55.52, lat: -20.89, altitude_m: 8, temperature: 24.6, vent: 20, direction: 120, pluie_1h: 0 }),
  st("Plaine des Cafres", "meteofrance", { id: "97422440", lon: 55.57, lat: -21.21, altitude_m: 1560, temperature: 12.3, vent: 8, direction: 90, pluie_1h: 0.4 }),
  st("Gillot balise", "ffvl", { id: "b1", lon: 55.521, lat: -20.891, altitude_m: 10, vent: 22, direction: 110 }),
];
const AMATEUR: StationNow[] = [
  st("Marla", "meteor_oi", { id: "MDM1570", lon: 55.4, lat: -21.1, altitude_m: 1570, temperature: 9.1, vent: 4, direction: 100, time: "2026-11-10T07:58:00Z", amateur: true }),
  st("Grandes Pentes", "meteor_oi", { id: "GPN1413", lon: 55.6, lat: -21.2, altitude_m: 1413, pluie_1h: 0, amateur: true }),
];
const svg = stationsMap([...OFFICIELLES, ...AMATEUR]);

describe("/meteo's map in its full screen (the user, 10/11/2026: « une meilleure résolution et plus de commandes comme le zoom »)", () => {
  it("zooms in its full screen only, ZOOM_METEO times closer at most, its buttons in its bar, the zoom's script after it", () => {
    expect(ZOOM_METEO).toBe(4);
    expect(svg).toContain(`<svg class="map terrain" data-fd="w" data-zoom="${ZOOM_METEO}" data-zpe data-fin `);
    const bar = svg.slice(svg.indexOf('<div class="wxbar">'), svg.indexOf("<svg"));
    // The words of the hikes' map: « Recentrer », said « Recentrer sur toute l'île ».
    expect(bar).toContain(`<div class="kzoom" data-fd="w" hidden><button type="button" data-z="+" aria-label="${MOTS.zoomIn}">+</button>`);
    expect(bar).toContain(`aria-label="${MOTS.recadrerAria.ile}">${MOTS.recadrer}</button></div>`);
    expect(svg.indexOf(ZOOM_SCRIPT)).toBeGreaterThan(svg.indexOf("</svg>"));
    // Out of the full screen: no button, a finger scrolls and pinches the page, the text can be selected.
    expect(CSS).toContain(".wxmap:not(.pe-m) .wxbar>.kzoom{display:none}");
    // In it, the buttons sit in the bar, at the end of its line or on a line of their own, above the map: never over it (a 390 px phone hid stations under them).
    expect(CSS).toContain(".pe-on .wxbar>.kzoom{margin-left:auto}");
    expect(CSS).not.toMatch(/\.kzoom\{[^}]*position:absolute/);
    expect(CSS).toContain(".map[data-zoom][data-zpe]{touch-action:auto;user-select:auto;-webkit-user-select:auto}.pe-on .map[data-zoom][data-zpe]{touch-action:none;");
  });

  it("takes no wheel, no pinch and holds no click out of the full screen, and is whole again once it is left", () => {
    const script = ZOOM_SCRIPT.slice("<script>".length, -"</script>".length);
    expect(script).toContain('const off=()=>svg.hasAttribute("data-zpe")&&!svg.closest(".pe-on"),most=()=>off()?1:');
    expect(script).toContain('svg.addEventListener("click",(e)=>{if(off())return;');
    expect(script).toContain('if(svg.hasAttribute("data-zpe"))addEventListener("resize",()=>{if(off())v=B.slice();clamp()});');
    // The full screen tells a change of size as a resize, a choice in its block too (a box ticked lengthens a legend).
    const pe = pleinEcran({ boite: ".wxbox", carte: ".wxmap", barre: ".wxbar", panneau: [] });
    expect(pe).toContain('box.addEventListener("change",()=>{if(on)fit()});');
    expect(pe).toContain('dispatchEvent(new Event("resize"))');
  });

  it("scales each station's marks about its place, a mark moved off it coming back towards it with its tie", () => {
    const [x, y] = project(OFFICIELLES[2].lon, OFFICIELLES[2].lat);
    const mark = svg.slice(svg.indexOf('href="#st-gillot-balise"'));
    expect(mark).toMatch(new RegExp(`^href="#st-gillot-balise"[^>]*><g class="mo" style="transform-origin:${x}px ${y}px"><circle class="hit`));
    // Its pill is apart (two beacons 150 m apart): the tie from its place, scaled about the same point.
    expect(svg).toContain(`<line class="o" x1="${x}" y1="${y}" x2=`);
    expect(svg).toMatch(new RegExp(`<line class="o" x1="${x}" y1="${y}" x2="[\\d.]+" y2="[\\d.]+" style="transform-origin:${x}px ${y}px"/>`));
    expect(CSS).toContain(".wxmap .map :is(.mo,.wt line){transform-box:view-box;transform:scale(var(--mk,1))}");
    expect(CSS).toContain(".wxmap .map :is(.wt circle,.rj-st circle,.rj-t text){transform-box:fill-box;transform-origin:center;transform:scale(var(--mk,1))}");
    // The names of places avoid them at the size drawn, about the same point.
    expect(NOMS_SCRIPT).toContain('mk=+svg.style.getPropertyValue("--mk")||1;');
    expect(NOMS_SCRIPT).toContain('const m=e.closest(".mo"),o=m?getComputedStyle(m).transformOrigin.split(" ").map(parseFloat):[b.x+b.width/2,b.y+b.height/2];');
  });

  /** MARQUES_JS on a map `width` px wide, its viewBox `vb` wide, in its full screen or not: the scale it sets. */
  function marques(width: number, vb: number, full: boolean) {
    const props = new Map<string, string>();
    const svg = {
      clientWidth: width,
      viewBox: { baseVal: { width: vb } },
      closest: (s: string) => (s === ".pe-on" && full ? {} : null),
      style: { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => void props.delete(k) },
    };
    const observer = class { observe() {} };
    runInNewContext(MARQUES_JS, {
      document: { currentScript: { closest: () => ({ querySelector: () => svg }) } },
      window: { ResizeObserver: observer },
      ResizeObserver: observer,
      MutationObserver: observer,
      addEventListener() {},
      String,
      Math,
    });
    return props.get("--mk");
  }

  it("keeps the marks at the size of a map MARQUES_PX wide, whatever the screen and the zoom, never larger than drawn", () => {
    expect(MARQUES_PX).toBe(560);
    // 1920 × 1080: the island 973 px wide, the marks 0.576 of their size; zoomed 2.56 times, 0.225.
    expect(marques(973, W, true)).toBe("0.576");
    expect(marques(973, W / 2.56, true)).toBe("0.225");
    // A phone: the island narrower than MARQUES_PX, the marks as drawn; zoomed twice, smaller.
    expect(marques(389, W, true)).toBeUndefined();
    expect(marques(389, W / 2, true)).toBe(String(Math.round((MARQUES_PX * 500 / (W * 389)) * 1000) / 1000));
    // Out of the full screen, never.
    expect(marques(973, W, false)).toBeUndefined();
  });

  /** FIN_SCRIPT on a map `width` px wide, its viewBox `v`, at `dpr`, in its full screen or not: the tiles it lays. */
  function fin(width: number, v: { x: number; y: number; width: number }, dpr: number, full: boolean) {
    const tiles: { dataset: Record<string, string>; attrs: Record<string, string> }[] = [];
    const rg = {
      querySelector: (s: string) => tiles.find((t) => s === `[data-t="${t.dataset.t}"]`) ?? null,
      appendChild: (t: (typeof tiles)[number]) => void tiles.push(t),
    };
    const svg = {
      dataset: {} as Record<string, string>,
      clientWidth: width,
      viewBox: { baseVal: { ...v, height: (v.width * H) / W } },
      querySelector: () => rg,
      closest: (s: string) => (s === ".pe-on" && full ? {} : null),
    };
    let changed: (() => void) | undefined;
    runInNewContext(FIN_SCRIPT, {
      document: {
        querySelectorAll: () => [svg],
        createElementNS: () => {
          const attrs: Record<string, string> = {};
          return { dataset: {}, attrs, setAttribute: (k: string, x: unknown) => void (attrs[k] = String(x)) };
        },
      },
      MutationObserver: class { constructor(f: () => void) { changed = f; } observe() {} },
      addEventListener() {},
      setTimeout: (f: () => void) => f(),
      clearTimeout() {},
      devicePixelRatio: dpr,
      Math,
    });
    changed!();
    return tiles.map((t) => t.attrs.href);
  }

  it("lays the fine relief's tiles in view once the screen asks for more pixels than the relief has, in its full screen only", () => {
    expect(RELIEF_PX).toBe(1200);
    const whole = { x: 0, y: 0, width: W };
    // 1920 × 1080, a density of 1: 973 px for the island, the relief is enough.
    expect(fin(973, whole, 1, true)).toEqual([]);
    // A density of 2: every tile; zoomed on the cirques, the four in view.
    expect(fin(973, whole, 2, true)).toHaveLength(RELIEF_FIN_N ** 2);
    expect(fin(973, { x: 300, y: 270, width: W / 2.56 }, 1, true).sort()).toEqual(["1-1", "1-2", "2-1", "2-2"].map((t) => `${RELIEF_FIN}${t}.webp`));
    // Out of the full screen, never.
    expect(fin(973, whole, 2, false)).toEqual([]);
    // Its BD ORTHO is credited with the relief, as on the maps that zoom.
    expect(svg).toContain('<g id="rf-w" class="rf" clip-path="url(#isl-clip)"></g>');
  });

  it("draws the wind's and the rain's canvases at the whole map's size, never the zoomed one's", () => {
    // Zoomed 4 times, the canvases at the map's size on screen would be 4 times as wide and high: 16 times the memory.
    expect(METEO_SCRIPT).toContain(`const rect=()=>{const r=o.fl.getBoundingClientRect(),s=o.fl.closest("svg"),z=s&&s.viewBox.baseVal.width?s.viewBox.baseVal.width/${W}:1;return{width:r.width*z,height:r.height*z}};`);
    expect(METEO_SCRIPT).toContain("const r=rect();cw=Math.round(r.width);o.size(r);");
    expect(METEO_SCRIPT).not.toContain("o.fl.getBoundingClientRect().width");
  });
});

describe("the legends of /meteo's map with « Stations amateur » ticked (marketing, 10/11/2026)", () => {
  const legend = (l: string) => {
    const at = svg.indexOf(`<span class="lg lg-${l}`);
    return svg.slice(at, svg.indexOf('<span class="rj-lg">', at));
  };
  const part = (html: string, cls: string) => html.slice(html.indexOf(`<span class="${cls}">`) + cls.length + 15, html.indexOf("</span>", html.indexOf(`<span class="${cls}">`) + cls.length + 15));

  it("keeps the legends unticked as they were, counting the official stations", () => {
    expect(part(legend("t"), "lg-of")).toBe("Température mesurée sous abri à 2 des 3 stations, la plus récente le 10/11 à 11:54. Entre les stations, les couleurs sont <b>estimées selon l'altitude</b> : ce n'est pas une mesure.");
    expect(part(legend("v"), "lg-of")).toMatch(/^3 anémomètres, vent moyen mesuré en km\/h, le plus récent le 10\/11 à 11:54\. /);
  });

  it("counts the amateur stations apart, says their reliability once, and dates the latest of all those shown", () => {
    expect(part(legend("t"), "lg-am")).toBe("Température mesurée sous abri à 2 des 3 stations officielles, et par 1 station amateur, fiabilité non vérifiée. La plus récente le 10/11 à 11:58. Entre les stations, les couleurs sont <b>estimées selon l'altitude</b>, stations amateur comprises : ce n'est pas une mesure.");
    const v = part(legend("v"), "lg-am");
    expect(v).toMatch(/^3 anémomètres officiels et 1 amateur \(fiabilité non vérifiée\), vent moyen mesuré en km\/h, le plus récent le 10\/11 à 11:58\. /);
    expect(v).toContain("à partir des stations voisines, stations amateur comprises : ce n'est pas une mesure.");
    expect(part(legend("p"), "lg-am")).toBe("2 pluviomètres officiels et 1 amateur (fiabilité non vérifiée), pluie de la dernière heure en mm, la plus récente le 10/11 à 11:58.");
    for (const l of ["t", "p", "v"]) expect(legend(l).match(/fiabilité non vérifiée/g) ?? [], l).toHaveLength(1);
    expect(CSS).toContain(".wxmap .lg-am{display:none}.wxmap:has(#wx-am:checked) .lg-am{display:inline}.wxmap:has(#wx-am:checked) .lg-of{display:none}");
  });

  it("says the singular, and keeps one legend where no amateur station measures the layer", () => {
    const one = stationsMap([...OFFICIELLES.slice(0, 1), AMATEUR[1]]);
    const p = one.slice(one.indexOf('<span class="lg lg-p'), one.indexOf('<span class="rj-lg">', one.indexOf('<span class="lg lg-p')));
    expect(p).toContain("1 pluviomètre officiel et 1 amateur (fiabilité non vérifiée)");
    const t = one.slice(one.indexOf('<span class="lg lg-t'), one.indexOf('<span class="rj-lg">', one.indexOf('<span class="lg lg-t')));
    expect(t).not.toContain("lg-am");
  });
});
