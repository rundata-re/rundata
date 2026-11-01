import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { project, W, H } from "../src/web/map.js";
import { NODATA, parse, pixel, WINDOW, type RadarImage } from "../src/providers/radar.js";
import { decodeMm, GH, GW, grid, MM_CHARS, mmChar, PATH, rainGrid } from "../src/web/pluie-radar.js";

// The real lame d'eau of 22/10/2026 05:35–05:40 UTC: almost dry over the island.
const file = readFileSync(new URL("./fixtures/radar_lame_eau.h5", import.meta.url));
const image = () => parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** The image with `v` (hundredths of a millimetre in 5 min, or NODATA) in a square of pixels around a point. */
function withValue(img: RadarImage, lon: number, lat: number, v: number, halfSide = 3): RadarImage {
  const { row, col } = pixel(lon, lat);
  const bin = atob(img.pluie);
  const a = new Uint16Array(new Uint8Array([...bin].map((c) => c.charCodeAt(0))).buffer);
  const width = WINDOW.col1 - WINDOW.col0;
  for (let r = row - halfSide; r <= row + halfSide; r++) for (let c = col - halfSide; c <= col + halfSide; c++) a[(r - WINDOW.row0) * width + (c - WINDOW.col0)] = v;
  return { ...img, pluie: btoa(String.fromCharCode(...new Uint8Array(a.buffer))) };
}
/** The cell of the map's grid holding a point. */
const cell = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return Math.floor((y / H) * GH) * GW + Math.floor((x / W) * GW);
};

describe("the radar's rain on the map's grid", () => {
  it("has one character a cell of the altitudes' grid, the image's times and its radars' state", async () => {
    const g = grid(await image());
    expect([g.w, g.h]).toEqual([125, 112]);
    expect(g.pluie).toHaveLength(125 * 112);
    expect(g.mal_vu).toHaveLength(125 * 112);
    expect(g.pluie).toMatch(/^[.0-8]+$/);
    expect(g.mal_vu).toMatch(/^[01]+$/);
    expect([g.debut, g.fin, g.pannes]).toEqual(["2026-10-22T05:35:00Z", "2026-10-22T05:40:00Z", []]);
  });

  it("puts a rain rate in its class where it falls, and says « not seen » apart from « no rain »", async () => {
    const [lon, lat] = [55.68, -21.03];
    // 50 hundredths in 5 min: 6 mm/h, class 5 (4 to 8 mm/h).
    expect(grid(withValue(await image(), lon, lat, 50)).pluie[cell(lon, lat)]).toBe("5");
    // 1 hundredth: 0.12 mm/h, the smallest step, class 1.
    expect(grid(withValue(await image(), lon, lat, 1)).pluie[cell(lon, lat)]).toBe("1");
    expect(grid(withValue(await image(), lon, lat, 300)).pluie[cell(lon, lat)]).toBe("8");
    expect(grid(withValue(await image(), lon, lat, NODATA)).pluie[cell(lon, lat)]).toBe(".");
    expect(grid(await image()).pluie[cell(lon, lat)]).toBe("0");
  });

  it("keeps, when asked, the lame d'eau in mm of each cell with rain, one character within 6 % of it", async () => {
    const [lon, lat] = [55.68, -21.03];
    // 50 hundredths in 5 min over the square around the point: a cell within it has 0,5 mm.
    const g = grid(withValue(await image(), lon, lat, 50), true);
    const wet = [...g.pluie].filter((c) => c !== "." && c !== "0").length;
    expect(g.mm).toHaveLength(wet);
    const mm = decodeMm(g.pluie, g.mm)!;
    expect(mm[cell(lon, lat)] / 0.5).toBeGreaterThan(0.94);
    expect(mm[cell(lon, lat)] / 0.5).toBeLessThan(1.06);
    // A cell without rain has 0, one not seen has none.
    expect(mm[g.pluie.indexOf("0")]).toBe(0);
    const unseen = grid(withValue(await image(), lon, lat, NODATA), true);
    expect(decodeMm(unseen.pluie, unseen.mm)![cell(lon, lat)]).toBeNaN();
    // The grid of the live layer keeps none.
    expect(grid(await image())).not.toHaveProperty("mm");
    // From 0,001 to about 27 mm in 5 minutes, each character a step of 12 %; nothing JSON escapes.
    expect([mmChar(0), mmChar(0.001), mmChar(1000)]).toEqual([MM_CHARS[0], MM_CHARS[0], MM_CHARS[90]]);
    expect(JSON.stringify(MM_CHARS)).toBe(`"${MM_CHARS}"`);
    for (const v of [0.002, 0.08, 1, 7.3, 20]) {
      const back = decodeMm("1", mmChar(v))![0];
      expect(Math.abs(back / v - 1)).toBeLessThan(0.06);
    }
    // A string that does not fit its grid is no lame d'eau.
    expect(decodeMm("011", "##")).not.toBeNull();
    expect(decodeMm("011", "#")).toBeNull();
    expect(decodeMm("011", "###")).toBeNull();
    expect(decodeMm("011", undefined)).toBeNull();
  });

  it("answers 503 when the radar cannot be read, never an empty grid passed off as no rain", async () => {
    const r = await rainGrid(new Cache(new MemoryStore(), () => Date.now()));
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ erreur: "image radar indisponible" });
    expect(PATH).toBe("/meteo/pluie-radar.json");
  });
});
