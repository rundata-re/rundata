import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { blurOf, downOf, fadeOf, flowOf, flowStage, matchOf, meanWay, METEO_SCRIPT, sadOf, turnsBack, upOf } from "../src/web/meteo-carte.js";

// The radar's grid: 125 × 112 cells of about 1 km, classes 0 to 8.
const w = 125, h = 112;

/** A round shower of class `top` at its middle, `r` cells across, centred on (cx, cy). */
const shower = (g: Float32Array, cx: number, cy: number, r: number, top: number) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r) g[y * w + x] = Math.max(g[y * w + x], Math.max(1, Math.round(top * (1 - d / r))));
  }
  return g;
};
const grid = (...s: [number, number, number, number][]) => s.reduce((g, [cx, cy, r, top]) => shower(g, cx, cy, r, top), new Float32Array(w * h));

/** The field's way at cell (x, y), from its block. */
const at = (f: ReturnType<typeof flowOf>, x: number, y: number) => {
  const i = Math.min(f.h - 1, ((y * f.h) / h) | 0) * f.w + Math.min(f.w - 1, ((x * f.w) / w) | 0);
  return [f.U[i], f.V[i]];
};
/** How far, on average, a pushed all the way along the field is from z, over the wet cells (0 for no field). */
const residual = (a: Float32Array, z: Float32Array, f?: ReturnType<typeof flowOf>) => {
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [u, v] = f ? at(f, x, y) : [0, 0], X = Math.round(x - u), Y = Math.round(y - v);
    const va = X < 0 || Y < 0 || X >= w || Y >= h ? 0 : a[Y * w + X], vz = z[y * w + x];
    if (va > 0 || vz > 0) { s += Math.abs(va - vz); n++; }
  }
  return s / n;
};

describe("the rain moved between two images of the radar", () => {
  it("finds where a shower went, to the cell, and pushes the first image onto the second", () => {
    // A shower 3 cells east and 2 north a quarter of an hour later.
    const a = grid([60, 60, 12, 6]), z = grid([63, 58, 12, 6]), f = flowOf(a, z, w, h, 15);
    const [u, v] = at(f, 61, 59);
    expect(Math.abs(u - 3)).toBeLessThan(0.5);
    expect(Math.abs(v + 2)).toBeLessThan(0.5);
    expect(residual(a, z, f)).toBeLessThan(residual(a, z) / 3);
    // The way as the page's WebGL reads it: 128 + 4 × the way, in quarter cells.
    const i = Math.min(f.h - 1, ((59 * f.h) / h) | 0) * f.w + Math.min(f.w - 1, ((61 * f.w) / w) | 0);
    expect([f.t[i * 4], f.t[i * 4 + 1], f.t[i * 4 + 3]]).toEqual([Math.round(128 + f.U[i] * 4), Math.round(128 + f.V[i] * 4), 255]);
  });

  it("leaves rain that keeps its place, held by the relief, where another shower moves", () => {
    const a = grid([30, 30, 9, 5], [90, 80, 10, 6]), z = grid([30, 30, 9, 5], [94, 80, 10, 6]), f = flowOf(a, z, w, h, 15);
    const [us, vs] = at(f, 30, 30), [um] = at(f, 92, 80);
    expect(Math.hypot(us, vs)).toBeLessThan(0.5);
    expect(Math.abs(um - 4)).toBeLessThan(1);
    // An image that does not change: no way at all.
    const still = flowOf(a, a, w, h, 5);
    expect(Math.max(...still.U.map(Math.abs), ...still.V.map(Math.abs))).toBe(0);
  });

  it("measures over coarser grids and blocks, as the page's script's own functions", () => {
    const [d, W, H] = downOf(Float32Array.from({ length: 16 }, (_, k) => k), 4, 4, 2);
    expect([W, H, ...d]).toEqual([2, 2, 2.5, 4.5, 10.5, 12.5]);
    // Rain one cell east in the next image: nothing differs once moved by it.
    const a = Float32Array.from([3, 0, 0]), z = Float32Array.from([0, 3, 0]);
    expect([sadOf(a, z, 3, 1, 0, 0, 1, 0, 0, Infinity), sadOf(a, z, 3, 1, 0, 0, 1, 1, 0, Infinity)]).toEqual([6, 0]);
    const U = Float32Array.from([0, 4, 0, 0]), V = new Float32Array(4);
    blurOf(U, V, 2, 2, 1);
    expect([...U]).toEqual([1, 1, 1, 1]);
    expect([...upOf(Float32Array.from([1, 3]), 2, 1, 4, 1, 2)]).toEqual([2, 3, 5, 6]);
    // A dry block is left to be filled at the first size; it keeps the way given at a finer one.
    const dry = new Float32Array(25);
    expect([...matchOf(dry, dry, 5, 5, 1, 1, 2, 1, new Float32Array(1), new Float32Array(1), true)]).toEqual([0]);
    expect([...matchOf(dry, dry, 5, 5, 1, 1, 2, 1, new Float32Array(1), new Float32Array(1), false)]).toEqual([1]);
  });

  it("mixes the two images as amounts of rain, then cuts them in blues as one image, on the map", () => {
    expect(METEO_SCRIPT).toContain(`const downOf=${downOf},sadOf=${sadOf},matchOf=${matchOf},blurOf=${blurOf},upOf=${upOf},flowStage=${flowStage};`);
    // Each image's smooth field pushed along the way, forward for the first and back for the second, mixed by its share.
    expect(METEO_SCRIPT).toContain(`return(texture2D(A,q-f*m).r*(1.-f)+texture2D(Z,q+(1.-f)*m).r*f)*255.;`);
    // Then the blues and the line around the rain, as bands draws them (the class at 28, the cut at 0.4 of the first).
    expect(METEO_SCRIPT).toContain(`float d=(v-28.*cut)/max(length(vec2(gx,gy)),1e-3)+.5;`);
    expect(METEO_SCRIPT).toContain(`gl.uniform1f(gl.getUniformLocation(p,"cut"),0.4)`);
    expect(METEO_SCRIPT).toContain(`for(const[i,j]of[[0,A],[1,Z]]){const t=tex(j);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t)}`);
    // Each image's field uploaded once, its red alone, and kept for the frames after (the 16 last used).
    expect(METEO_SCRIPT).toContain(`gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,j.w*4,j.h*4,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,soft(j))`);
    expect(METEO_SCRIPT).toContain(`if(TX.size>16){const[k,v]=TX.entries().next().value;gl.deleteTexture(v);TX.delete(k)}`);
    // Faded as before without WebGL, with the rain gauges' estimate, or between images over 15 minutes apart (played
    // fast, one image in 4: the way found between them turned back from one pair to the next, the rain went aside then back).
    expect(METEO_SCRIPT).toContain(`const wy=(A,Z)=>A!==Z&&!A.pg&&!Z.pg&&Date.parse(Z.fin)-Date.parse(A.fin)<=900000&&glInit();`);
    expect(METEO_SCRIPT).toContain(`const F=way(mx[0],mx[1],mx[4])&&flow(mx[0],mx[1]);`);
    expect(METEO_SCRIPT).toContain(`if(F){warp(mx[0],mx[1],F,mx[2]);x.drawImage(GC,0,0)}else{`);
  });
});

describe("the way between two images found a step at a time", () => {
  it("finds it in four steps, the same as all at once", () => {
    const a = grid([40, 50, 14, 6], [90, 30, 9, 3]), z = grid([46, 53, 14, 6], [95, 33, 9, 3]);
    const s = { a, z, w, h, dt: 15, k: 0 } as Parameters<typeof flowStage>[0];
    const done = [];
    for (let i = 0; i < 4; i++) done.push(flowStage(s));
    expect(done).toEqual([false, false, false, true]);
    const f = flowOf(a, z, w, h, 15);
    expect(s.r!.w).toBe(f.w);
    expect(s.r!.U).toEqual(f.U);
    expect(s.r!.V).toEqual(f.V);
    expect(s.r!.t).toEqual(f.t);
    // The showers moved by about (6, 3) cells.
    const [u, v] = at(f, 40, 50);
    expect(u).toBeGreaterThan(3);
    expect(v).toBeGreaterThan(1);
  });
});

describe("a pair of images moved only when the next pair's way does not turn back", () => {
  it("is a way of a cell or more, more than 120° from the other", () => {
    expect(turnsBack([2, 0], [-2, 0.1])).toBe(true);
    expect(turnsBack([2, 0], [-1, 1.5])).toBe(true);
    // 90°, or less than a cell either way: not a U-turn.
    expect(turnsBack([2, 0], [0, 2])).toBe(false);
    expect(turnsBack([0.6, 0], [-2, 0])).toBe(false);
    expect(turnsBack([2, 0], [-0.6, 0])).toBe(false);
  });

  it("weighs each block's way by the rain over it", () => {
    // Two blocks across, the left one wet with 3, the right with 1.
    const a = new Float32Array([3, 0, 0, 1]);
    expect(meanWay(new Float32Array([4, 0]), new Float32Array([0, 8]), 2, 1, a, 4, 1)).toEqual([3, 2]);
    expect(meanWay(new Float32Array([4, 0]), new Float32Array([0, 8]), 2, 1, new Float32Array(4), 4, 1)).toEqual([0, 0]);
  });

  it("leaves no U-turn on 9 images of the radar's 7 days, a quarter of an hour apart (04/11/2026, 23:00 to 01:00)", () => {
    const j = JSON.parse(readFileSync(new URL("./fixtures/radar-7j-demi-tours.json", import.meta.url), "utf8"));
    const un = (s: string) => s.split(",").map((r) => (r ? r[0].repeat(parseInt(r.slice(1), 36)) : "")).join("");
    const g = j.entrees.map((e: { pluie: string }) => {
      const s = un(e.pluie), v = new Float32Array(j.w * j.h);
      for (let k = 0; k < v.length; k++) v[k] = +s[k] || 0;
      return v;
    });
    const ways = g.slice(1).map((z: Float32Array, i: number) => {
      const f = flowOf(g[i], z, j.w, j.h, 15);
      return meanWay(f.U, f.V, f.w, f.h, g[i], j.w, j.h);
    });
    // The U-turns from a pair moved to the next one moved.
    const uTurns = (moved: boolean[]) => ways.slice(1).filter((x: number[], i: number) => moved[i] && moved[i + 1] && turnsBack(ways[i], x)).length;
    // Every pair moved, as before: twice the rain went one way, then back.
    expect(uTurns(ways.map(() => true))).toBe(2);
    // Moved only when the next pair's way does not turn back; the last, with no next, faded.
    const moved = ways.map((x: number[], i: number) => i + 1 < ways.length && !turnsBack(x, ways[i + 1]));
    expect(uTurns(moved)).toBe(0);
    // The third (2.4 cells west) before the fourth (2.3 east), the seventh before the eighth.
    expect(moved).toEqual([true, true, false, true, true, true, false, false]);
  });

  it("fades two images in the middle third of the way only: each alone the rest of the time, half of each half way", () => {
    expect([0, 0.2, 1 / 3].map(fadeOf)).toEqual([0, 0, 0]);
    expect(fadeOf(0.5)).toBeCloseTo(0.5, 9);
    expect([0.8, 1].map(fadeOf)).toEqual([1, 1]);
    expect(fadeOf(2 / 3)).toBeCloseTo(1, 9);
    expect(fadeOf(0.4)).toBeCloseTo(0.2, 9);
    // Both images on the map a third of the time, rather than all of it.
    const both = Array.from({ length: 300 }, (_, i) => fadeOf(i / 300)).filter((e) => e > 0 && e < 1).length;
    expect(both).toBeGreaterThanOrEqual(98);
    expect(both).toBeLessThanOrEqual(101);
  });

  it("is decided once a pair in the page, from the two ways made ready, faded without a next image", () => {
    expect(METEO_SCRIPT).toContain(`const meanWay=${meanWay},turnsBack=${turnsBack},fadeOf=${fadeOf},WB=new Map();`);
    expect(METEO_SCRIPT).toContain("const decide=(A,Z,N)=>{if(!N||!wy(A,Z))return false;");
    expect(METEO_SCRIPT).toContain("b=!q||!turnsBack(meanWay(r.U,r.V,r.w,r.h,gv(A),A.w,A.h),meanWay(q.U,q.V,q.w,q.h,gv(Z),Z.w,Z.h));WB.set(key,b);");
    expect(METEO_SCRIPT).toContain("const F=way(mx[0],mx[1],mx[4])&&flow(mx[0],mx[1]);");
    // The images made ready ahead: each pair with the next image, the last without (its way found, decided later).
    expect(METEO_SCRIPT).toContain(`(dl)=>pair(js[i-1],js[i],i+1<xs.length&&typeof xs[i+1]!=="function"?grid(xs[i+1],gr):undefined,dl)`);
  });
});
