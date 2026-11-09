import { describe, expect, it } from "vitest";
import { journeeOf } from "../src/web/data.js";
import { installationsReplay, productionChart } from "../src/web/electricite-carte.js";
import { IMAGES_FAST, IMAGES_MAX, imagesMaxOf, keepsUp, rejeuScript, skipOf } from "../src/web/meteo-carte.js";
import { CSS } from "../src/web/pages.js";
import { VITESSE_JS, VITESSES, vitesseBouton } from "../src/web/vitesse.js";

// EDF's lines of 31/10/2026 05:15 and 05:20 (test/electricite-carte.test.ts).
const l1515 = { date: "2026-10-31T05:15:00+04:00", stockage: 1.5, diesel: 108, turbines_combustion: 14, bioenergies: 51, charbon: 77, photovoltaique: 2, total: 284, hydraulique: 25, eolien: 5, statut: "Estimé" };
const l0520 = { date: "2026-10-31T05:20:00+04:00", stockage: -2.1174, diesel: 107.732, turbines_combustion: 13.926, bioenergies: 51.316, charbon: 76.542, photovoltaique: 3.77, total: 281.028, hydraulique: 25.248, eolien: 4.612, statut: "Estimé" };
const j0 = journeeOf({ lignes: [l1515, l0520], mis_a_jour: "Sat, 31 Oct 2026 01:15:35 GMT" })!;

/** A button as the script sees it: its text, its label, its clicks. */
const button = () => {
  const on: (() => void)[] = [];
  const attrs: Record<string, string> = {};
  return { textContent: "×1", setAttribute: (k: string, v: string) => (attrs[k] = v), attrs, addEventListener: (_: string, f: () => void) => on.push(f), click: () => on.forEach((f) => f()) };
};

/** VITESSE_JS run in a page of its own: a storage (or one that refuses), the page's events, two replays' buttons. */
const page = (stored: string | null, refuse = false) => {
  const kept: Record<string, string> = stored == null ? {} : { "rundata-vitesse": stored };
  const ls = { getItem: (k: string) => { if (refuse) throw new Error("refusé"); return kept[k] ?? null; }, setItem: (k: string, v: string) => { if (refuse) throw new Error("refusé"); kept[k] = v; } };
  const listeners: ((e: { detail: number }) => void)[] = [];
  const doc = { addEventListener: (_: string, f: (e: { detail: number }) => void) => listeners.push(f), dispatchEvent: (e: { detail: number }) => listeners.forEach((f) => f(e)) };
  class Ev { detail: number; constructor(_: string, o: { detail: number }) { this.detail = o.detail; } }
  // The script's own text, from the module (not taken out of a page): its speed and its binding returned.
  const run = new Function("localStorage", "document", "CustomEvent", `${VITESSE_JS}return {get V(){return V},vbind}`);
  // Its getter read as it goes (a spread would copy the speed once).
  return Object.assign(run(ls, doc, Ev) as { V: number; vbind: (bs: unknown[], on?: () => void) => void }, { kept });
};

describe("the speed of the replays", () => {
  it("goes ×1, ×2, ×4, ×0,5 a touch at a time, kept in the browser and the same for every replay of the page", () => {
    expect(VITESSES).toEqual([1, 2, 4, 0.5]);
    const p = page(null);
    const [a, b] = [button(), button()];
    let changed = 0;
    p.vbind([a], () => changed++);
    p.vbind([b]);
    expect([p.V, a.textContent]).toEqual([1, "×1"]);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      a.click();
      seen.push([p.V, a.textContent, b.textContent, p.kept["rundata-vitesse"]]);
    }
    expect(seen).toEqual([[2, "×2", "×2", "2"], [4, "×4", "×4", "4"], [0.5, "×0,5", "×0,5", "0.5"], [1, "×1", "×1", "1"]]);
    expect(changed).toBe(4);
    expect(b.attrs["aria-label"]).toBe("Vitesse de lecture\u00a0: ×1");
  });

  it("starts at the speed kept, ×1 when none is, when it is not one of them or when the browser refuses its storage", () => {
    expect(page("4").V).toBe(4);
    expect(page("0.5").V).toBe(0.5);
    for (const v of [null, "3", "abc"]) expect(page(v).V).toBe(1);
    const p = page("2", true);
    expect(p.V).toBe(1);
    const a = button();
    p.vbind([a]);
    a.click();
    // Not kept, but the page goes on at the speed chosen.
    expect([p.V, a.textContent]).toEqual([2, "×2"]);
  });

  it("is next to « Lire » in every replay: the map of /meteo, the chart and map of /electricite; hidden with less motion", () => {
    expect(vitesseBouton("rj-v")).toBe(`<button type="button" class="rj-v" aria-label="Vitesse de lecture\u00a0: ×1">×1</button>`);
    expect(CSS).toContain(`@media (prefers-reduced-motion:reduce){.wxmap :is(.rj-b,.rj-v){display:none}}`);
    expect(rejeuScript()).toContain(VITESSE_JS);
    expect(rejeuScript()).toContain(`vbind([rb.querySelector(".rj-v")].filter(Boolean));`);
    const chart = productionChart(j0);
    expect(chart).toContain(`▶ Lire</button>${vitesseBouton("rj-v")}<input type="range"`);
    expect(installationsReplay(j0)).toContain(`▶ Lire</button>${vitesseBouton("rj-v")}<input type="range"`);
    expect(chart).toContain(`(()=>{${VITESSE_JS}const go=()=>{`);
    expect(chart).toContain(`vbind(bars.map((x)=>x.querySelector(".rj-v")).filter(Boolean));`);
    // From where it is, at the speed of each moment: a speed changed while it plays goes on from there.
    expect(chart).toContain(`if(t0)x+=(now-t0)/12000*(P.length-1)*V;t0=now;`);
  });

  it("plays faster, skipping images rather than frames: at most 7 new ones a second, as 7 days at ×1", () => {
    const js = rejeuScript();
    expect(js).toContain(`T=Math.min(E,T+(E-S)*dt*V/PL[d]);`);
    // The rain's new images a second at ×1: 6 h, 24 h, 7 days, then the finer files (24 h, a day, 7 days).
    const n = { "6h": 72 / 12, "24h": 96 / 24, "7j": 168 / 24, "24h+": 288 / 54, "7j+": 672 / 96 };
    const at = (v: number) => Object.values(n).map((x) => skipOf(v, x, 7));
    expect(at(1)).toEqual([1, 1, 1, 1, 1]);
    expect(at(0.5)).toEqual([1, 1, 1, 1, 1]);
    expect(at(2)).toEqual([2, 2, 2, 2, 2]);
    expect(at(4)).toEqual([4, 3, 4, 4, 4]);
    // Never more than 7 shown a second.
    for (const v of VITESSES) for (const x of Object.values(n)) expect((v * x) / skipOf(v, x, 7)).toBeLessThanOrEqual(7);
    expect(js).toContain(`const skipOf=${skipOf},keepsUp=${keepsUp},imagesMaxOf=${imagesMaxOf};`);
    expect(js).toContain(`const kk=(n,x)=>skipOf(V,n,x||7),ne=(n)=>V*n/kk(n)`);
    // Only while playing: paused, the slider shows every image.
    expect(js).toContain(`sub=(l)=>{const k=K[l],n=playing?kk(ips(l),l==="p"?imx():0):1;`);
    expect(js).toContain(`trail=(s)=>rm||!tw()?null:keep(sub("p"),T,s,tw())`);
    // The finer files asked automatically on the images they would show a second at the speed.
    expect(js).toContain(`can=(m)=>keepsUp(CW,slow,ne(nps(m)),0.6,25),`);
  });

  it("shows up to 14 new images of the rain a second to a device that keeps up with them, as for the finer files; 7 to the others", () => {
    expect([IMAGES_MAX, IMAGES_FAST]).toEqual([7, 14]);
    // Measured in the first seconds of a play: a new image's ms, another frame's, the frames a second.
    const quick = [20, 2, 30], slowish = [45, 3, 30], jerky = [10, 1, 20];
    const max = (cw: number[] | null, v: number, n: number, slow = false) => imagesMaxOf(cw, slow, v, n, 0.6, 25, 7, 14);
    // The rain's new images a second at ×1: 6 h, 24 h, 7 days, then the finer files of 24 h and 7 days.
    const n = { "6h": 72 / 12, "24h": 96 / 24, "7j": 168 / 24, "24h+": 288 / 54, "7j+": 672 / 96 };
    // At ×4, a quick device: one image in 2 rather than in 4 (in 3 over 24 hours), 10 minutes apart over 6 hours and
    // the finer 24 hours, rather than 20.
    expect(Object.values(n).map((x) => skipOf(4, x, max(quick, 4, x)))).toEqual([2, 2, 2, 2, 2]);
    expect(Object.values(n).map((x) => skipOf(4, x, max(null, 4, x)))).toEqual([4, 3, 4, 4, 4]);
    // 12 new images a second at 45 ms each and 30 frames at 3 ms fill more than 0.6 s: 7, though it keeps up with the
    // finer files' 6 (the same measure, keepsUp).
    expect(max(slowish, 4, n["6h"])).toBe(7);
    expect(keepsUp(slowish, false, (4 * n["6h"]) / skipOf(4, n["6h"], 7), 0.6, 25)).toBe(true);
    // Fewer than 25 frames a second, a connection that saves data, or not measured yet: 7.
    expect([max(jerky, 4, n["6h"]), max(quick, 4, n["6h"], true), max(null, 4, n["6h"])]).toEqual([7, 7, 7]);
    // At ×1, every image either way; at ×2, every image rather than one in 2.
    expect(Object.values(n).map((x) => skipOf(1, x, max(quick, 1, x)))).toEqual([1, 1, 1, 1, 1]);
    expect(Object.values(n).map((x) => skipOf(2, x, max(quick, 2, x)))).toEqual([1, 1, 1, 1, 1]);
    const js = rejeuScript();
    // Chosen when a play starts or its speed changes, never during it; only for the rain.
    expect(js).toContain(`const imx=()=>{const q=V+" "+PN+" "+d;if(IQ!==q){IQ=q;IM=DN?7:imagesMaxOf(CW,slow,V,ips("p"),0.6,25,7,14)}return IM};`);
    expect(js).toContain(`const play=()=>{if(T>=E)T=S;playing=true;RJ.pl=true;AZ=null;last=nx=0;PN++;FW.length=0;`);
    // A device that draws fewer than 25 frames a second over the last 30 goes back to 7 at once, for the rest of the visit.
    expect(js).toContain(`if(IM>7&&was&&t-was<250){FW.push(t-was);if(FW.length>30)FW.shift();if(FW.length===30&&FW.reduce((a,b)=>a+b,0)>30e3/25){DN=true;IM=7}}`);
    // The rain's next image shown, for the page to decide whether a pair is moved (test/pluie-mouvement.test.ts).
    expect(js).toContain(`RJ.p.mix(r.a.e,r.z.e,r.f,el,gr,trail(shown(T,r,l)),wm(),nxt(r.z))`);
  });
});
