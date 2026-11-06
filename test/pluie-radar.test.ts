import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILD_BUDGET, counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { project, W, H } from "../src/web/map.js";
import { NODATA, parse, pixel, WINDOW, type RadarImage } from "../src/providers/radar.js";
import { configure, decodeMm, GH, GW, grid, MM_CHARS, mmChar, PATH, rainGrid } from "../src/web/pluie-radar.js";
import { derniere, rle, type Historique } from "../src/web/pluie-retro.js";

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

describe("the live layer when this data center holds only an old copy of the radar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    meteofrance.configure({});
    configure();
  });

  /** The history in KV with one image of `g` ending at `fin`, after a gap. */
  const history = (g: ReturnType<typeof grid>, fin: string): Historique => ({
    w: g.w,
    h: g.h,
    entrees: [{ trou: true, de: "2026-11-06T00:00:00Z", a: "2026-11-06T00:05:00Z" }, { fin, pannes: ["Colorado"], pluie: rle(g.pluie), mal_vu: rle(g.mal_vu), mm: "#" }],
  });
  /** A data center that read the radar at `read`, asked at `now` while Météo-France answers 500. */
  async function oldCopy(read: number, now: number) {
    let t = read;
    const cache = new Cache(new MemoryStore(), () => t);
    await cache.get("radar:2", 240, image);
    t = now;
    meteofrance.configure({ applicationId: "test" });
    vi.stubGlobal("fetch", async (url: string) => (String(url).includes("/token") ? Response.json({ access_token: "t", expires_in: 3600 }) : new Response("", { status: 500 })));
    return cache;
  }

  it("serves the history's latest image when it is newer than the copy, its 5 minutes and its radars' state", async () => {
    const g = grid(await image());
    // The copy is the image of 22/10 05:40 UTC, read then; the history, written by the scheduled event, has 06/11 08:00.
    const cache = await oldCopy(Date.parse("2026-10-22T05:41:00Z"), Date.parse("2026-11-06T08:03:00Z"));
    let reads = 0;
    configure(async () => (reads++, derniere(history(g, "2026-11-06T08:00:00Z"))));
    const r = await rainGrid(cache);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect([body.debut, body.fin, body.pannes]).toEqual(["2026-11-06T07:55:00Z", "2026-11-06T08:00:00Z", ["Colorado"]]);
    // The same cells as the image's, without the lame d'eau the history keeps for the totals.
    expect([body.w, body.h, body.pluie, body.mal_vu]).toEqual([g.w, g.h, g.pluie, g.mal_vu]);
    expect(body.mm).toBeUndefined();
    expect(reads).toBe(1);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("keeps the copy when the history is not newer, and reads KV only when the copy is kept or missing", async () => {
    const g = grid(await image());
    const cache = await oldCopy(Date.parse("2026-10-22T05:41:00Z"), Date.parse("2026-10-22T06:30:00Z"));
    let reads = 0;
    configure(async () => (reads++, derniere(history(g, "2026-10-22T05:30:00Z"))));
    expect((await (await rainGrid(cache)).json()).fin).toBe(g.fin);
    expect(reads).toBe(1);
    // A fresh image: no read of KV.
    const fresh = new Cache(new MemoryStore(), () => Date.now());
    await fresh.get("radar:2", 240, image);
    meteofrance.configure({ applicationId: "test" });
    expect((await (await rainGrid(fresh)).json()).fin).toBe(g.fin);
    expect(reads).toBe(1);
  });

  it("serves the history when the radar was never read here, and still 503 when it holds no image either", async () => {
    const g = grid(await image());
    const cache = new Cache(new MemoryStore(), () => Date.now());
    configure(async () => derniere(history(g, "2026-11-06T08:00:00Z")));
    expect((await (await rainGrid(cache)).json()).fin).toBe("2026-11-06T08:00:00Z");
    configure(async () => derniere({ w: g.w, h: g.h, entrees: [{ trou: true, de: "2026-11-06T00:00:00Z", a: "2026-11-06T08:00:00Z" }] }));
    expect((await rainGrid(cache)).status).toBe(503);
    configure(async () => null);
    expect((await rainGrid(cache)).status).toBe(503);
    configure(async () => { throw new Error("KV indisponible"); });
    expect((await rainGrid(cache)).status).toBe(503);
  });

  it("counts its read of KV as a subrequest", async () => {
    const g = grid(await image());
    configure(async () => derniere(history(g, "2026-11-06T08:00:00Z")));
    const run = await counted(BUILD_BUDGET, () => rainGrid(new Cache(new MemoryStore(), () => Date.now())));
    expect(run.used).toBe(1);
  });
});
