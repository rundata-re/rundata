import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { autour, averse, CUMULS_LOADER, cumulsScript, cumulsScriptPath, cumulsSection, pluvio, somme } from "../src/web/pluie-cumuls.js";
import { site } from "../src/web/site.js";

const H = 3_600_000;
const M5 = 300_000;
/** Images of 5 minutes ending at t0 + 5 min, …, their starts and ends. */
const spans = (t0: number, n: number) => ({ de: Array.from({ length: n }, (_, i) => t0 + i * M5), a: Array.from({ length: n }, (_, i) => t0 + (i + 1) * M5) });

describe("the shower around a place", () => {
  it("starts after the last hour without rain, and ends with the last wet image", () => {
    const { de, a } = spans(0, 40);
    // Wet at 0-2, dry 3-14 (an hour), wet 15-20 with 30 minutes dry inside, dry after.
    const wet = Array.from({ length: 40 }, (_, i) => i <= 2 || (i >= 15 && i <= 20) || (i >= 27 && i <= 29));
    for (let i = 21; i <= 26; i++) wet[i] = false;
    expect(averse(wet, de, a)).toEqual({ de: 15 * M5, fin: 30 * M5 });
  });

  it("is longer than the images when no hour of them is dry, and is none without rain", () => {
    const { de, a } = spans(0, 30);
    const wet = Array.from({ length: 30 }, (_, i) => i % 6 !== 0);
    expect(averse(wet, de, a)).toEqual({ de: null, fin: 30 * M5 });
    expect(averse(Array(30).fill(false), de, a)).toBeNull();
  });

  it("does not count a gap in the images as dry", () => {
    const { de, a } = spans(0, 20);
    const wet: (boolean | null)[] = Array(20).fill(false);
    wet[19] = true;
    for (let i = 5; i < 18; i++) wet[i] = null;
    // 13 images missing, then 5 dry: less than an hour known to be dry, before the data's start.
    expect(averse(wet, de, a)).toEqual({ de: null, fin: 20 * M5 });
  });
});

describe("the rain fallen", () => {
  it("adds up the lame d'eau of the images ending in the length, and counts the minutes no image with mm covers", () => {
    const mm = (v: number[]) => Float32Array.from(v);
    const ims: [number, number, Float32Array | null][] = [
      [0, M5, mm([1, 0, NaN])],
      [M5, 2 * M5, null],
      [2 * M5, 3 * M5, mm([0.5, 2, NaN])],
      [3 * M5, 4 * M5, mm([0.25, NaN, NaN])],
    ];
    const [out, miss] = somme(ims, 3, 0, 4 * M5);
    expect([...out.slice(0, 2)]).toEqual([1.75, 2]);
    expect(out[2]).toBeNaN();
    expect(miss).toBe(5);
    // From the second image on: the first is left out.
    expect(somme(ims, 3, M5, 4 * M5)[0][0]).toBe(0.75);
  });

  it("takes from the rain gauge the whole hours of the length only, none when one is not measured", () => {
    const fin = 10 * H;
    const rr = [1, 2, 3, 4];
    expect(pluvio(rr, fin, 7.5 * H, fin)).toEqual([7, 8 * H, 10 * H]);
    expect(pluvio(rr, fin, 9.5 * H, fin)).toBeNull();
    expect(pluvio([1, null, 3, 4], fin, 6 * H, fin)).toEqual([null, 6 * H, 10 * H]);
  });

  it("looks for the shower within a disc of cells, cut by the grid's edge", () => {
    expect(autour(5, 5, 20, 20, 1)).toEqual([85, 104, 105, 106, 125]);
    expect(autour(0, 0, 20, 20, 1)).toEqual([0, 1, 20]);
  });
});

describe("/meteo's « Pluie tombée »", () => {
  it("is a title in the page, hidden until its script, asked near it, writes the map and the Météo-France stations", () => {
    const html = cumulsSection();
    expect(html).toContain(`data-cumuls="${cumulsScriptPath()}" hidden`);
    expect(html).not.toContain("<option");
    expect(html.length).toBeLessThan(1000);
    const js = cumulsScript();
    expect(js.match(/<option /g)!.length).toBe(meteofrance.stations().length);
    expect(js).toContain(">Le Tévelave</option>");
    // Both scripts are valid JavaScript.
    expect(() => new Script(js)).not.toThrow();
    expect(() => new Script(CUMULS_LOADER)).not.toThrow();
  });

  it("serves its script at its address, kept a year", async () => {
    const res = await site(new Request(`https://rundata.re${cumulsScriptPath()}`), new Cache(new MemoryStore()), () => {});
    expect(res!.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res!.text()).toBe(cumulsScript());
  });
});
