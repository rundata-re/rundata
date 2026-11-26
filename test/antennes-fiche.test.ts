import { describe, expect, it } from "vitest";
import * as antennes from "../src/vie/antennes.js";
import { antennesPage } from "../src/web/antennes.js";
import { ficheScript, fichesFile, fichesJson, fichesPath, FICHES_DU, type Ligne } from "../src/web/antennes-fiche.js";
import { lienNom } from "../src/web/domains.js";
import { estDeclare } from "../src/web/scripts-declares.js";
import { H, W } from "../src/web/map.js";
import island from "../src/places/island.json" with { type: "json" };
import { distanceKm } from "../src/geo.js";
import { antennas } from "../src/tools/terrain.js";

type Sheet = { du: string; s: Record<string, { c: string; h: number; n: string; e: Ligne[] }> };
const sheets = () => JSON.parse(fichesJson()) as Sheet;

/** A dot of the map, at (x, y) on screen. */
const dot = (id: number, x: number, y: number, hidden = false) => {
  const cls = new Set(["s", hidden ? "h" : "ko"]);
  return {
    dataset: { i: String(id) },
    classList: { contains: (c: string) => cls.has(c), add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), has: (c: string) => cls.has(c) },
    getBoundingClientRect: () => ({ x: x - 6, y: y - 6, width: 12, height: 12 }),
  };
};

const [LON0, LAT0, LON1, LAT1] = island.bbox;
/** Screen point = map point (no zoom, the map at the window's corner): a click at (x, y) is that point of the map. */
const lieu = (lon: number, lat: number): [number, number] => [((lon - LON0) / (LON1 - LON0)) * W, ((LAT1 - lat) / (LAT1 - LAT0)) * H];
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/**
 * The sheet's script on a map of `dots`, with the file answered by `answer` and the visitor's position by `position`
 * (null: refused); the clicks, the button « autour de moi » and what the box holds.
 */
function run(dots: ReturnType<typeof dot>[], answer: () => Promise<unknown>, position?: { lat: number; lon: number } | null) {
  const on: Record<string, (e: unknown) => void> = {};
  const marks: { cx?: string; cy?: string }[] = [];
  const box = { hidden: true, innerHTML: "", scrollIntoView: () => {}, addEventListener: (t: string, f: (e: unknown) => void) => (on[`box:${t}`] = f) };
  const group = { appendChild: (c: { a: Record<string, string> }) => marks.push({ cx: c.a.cx, cy: c.a.cy }) };
  const svg = {
    querySelectorAll: () => dots,
    querySelector: () => group,
    addEventListener: (t: string, f: (e: unknown) => void) => (on[`svg:${t}`] = f),
    getScreenCTM: () => ({ inverse: () => "id" }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } }),
  };
  const bloc = { hidden: true }, msg = { hidden: true, textContent: "" };
  const moi = { disabled: false, addEventListener: (t: string, f: (e: unknown) => void) => (on[`moi:${t}`] = f) };
  const els: Record<string, unknown> = { amap: svg, antfiche: box, "ant-moi-bloc": bloc, "ant-moi": moi, "ant-moi-msg": msg };
  const document = { getElementById: (i: string) => els[i] ?? null, createElementNS: () => ({ a: {} as Record<string, string>, setAttribute(k: string, v: string) { this.a[k] = String(v); }, remove() {} }) };
  const navigator = {
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void, ko: (e: unknown) => void) => (position ? ok({ coords: { latitude: position.lat, longitude: position.lon } }) : ko({ code: 1 })),
    },
  };
  const asked: string[] = [];
  new Function("document", "fetch", "navigator", ficheScript())(document, (u: string) => (asked.push(u), answer()), navigator);
  const click = async (x: number, y: number) => {
    on["svg:click"]({ clientX: x, clientY: y });
    await flush();
  };
  const target = (sel: string, data: Record<string, string> = {}) => ({ target: { closest: (q: string) => (q === sel ? { dataset: data } : null) } });
  return {
    box, asked, click, marks, bloc, msg,
    close: () => on["box:click"](target(".antf-x")),
    autour: async (id: string) => {
      on["box:click"](target(".antf-autour", { i: id }));
      await flush();
    },
    voir: async (id: string) => {
      on["box:click"](target(".antf-voir", { i: id }));
      await flush();
    },
    moi: async () => {
      on["moi:click"]({});
      await flush();
    },
  };
}

const ok = () => Promise.resolve({ ok: true, json: async () => sheets() });

describe("the sheet of an antenna (ANFR)", () => {
  it("has a sheet for every support of the map, from the same weekly file", () => {
    const s = sheets();
    expect(s.du).toBe(antennes.MOBILE_DU);
    expect(FICHES_DU).toBe(antennes.MOBILE_DU);
    expect(Object.keys(s.s).sort()).toEqual(antennes.SUPPORTS.map((x) => String(x.id)).sort());
    const rows = Object.values(s.s).flatMap((x) => x.e);
    // Counted on the file of 19/11/2026: 9 744 systems, of which 736 projects with no day in service.
    expect(rows).toHaveLength(9744);
    expect(rows.filter((r) => !r[3])).toHaveLength(736);
    expect(rows.every((r) => !r[3] || /^\d{4}-\d\d-\d\d$/.test(r[3]))).toBe(true);
    expect(new Set(rows.map((r) => r[0]))).toEqual(new Set(["o", "s", "f", "z"]));
    expect(new Set(rows.map((r) => r[2]))).toEqual(new Set(["s", "o", "p"]));
    // The operators of each sheet are those of the map's dot.
    for (const x of antennes.SUPPORTS) {
      const ops = new Set(s.s[x.id].e.map((r) => r[0]));
      expect(ops, String(x.id)).toEqual(new Set(Object.keys(x.ops).map((o) => o[0].toLowerCase())));
    }
  });

  it("is served at its hashed address, kept a year there, five minutes at an older one", async () => {
    const r = fichesFile(fichesPath())!;
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await r.json()).toEqual(sheets());
    expect(fichesFile("/antennes/fiches-ancien.json")!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(fichesFile("/antennes")).toBeNull();
  });

  it("is on the page: a number on each dot, the help, the box and its declared script; the file is not in the page", () => {
    const page = antennesPage("https://rundata.re", null);
    expect(page.match(/<circle class="s [^"]*"[^>]*data-i="\d+"/g)).toHaveLength(antennes.SUPPORTS.length);
    expect(page).toContain('id="antfiche"');
    expect(page).toContain("pour voir sa fiche");
    expect(estDeclare(ficheScript())).toBe(true);
    expect(page).not.toContain("5G NR 3500");
  });

  it("opens the nearest dot's sheet: bands, states, days, height, azimuths, the power never published", async () => {
    const id = 47165;
    const f = sheets().s[id];
    const m = run([dot(id, 100, 100), dot(47169, 300, 300)], ok);
    await m.click(110, 104);
    expect(m.asked).toEqual([fichesPath()]);
    expect(m.box.hidden).toBe(false);
    const h = m.box.innerHTML;
    expect(h).toContain(`Support n°\u00a0${id}\u00a0· ${f.c}`);
    expect(h).toContain("<h4>SFR Réunion</h4>");
    expect(h).toContain("5G (5G NR), bande des 3\u202f500\u00a0MHz\u00a0: techniquement opérationnel, mise en service le 17/10/2024");
    expect(h).toContain("2G (GSM), bande des 900\u00a0MHz\u00a0: en service, mise en service le 15/03/2021");
    expect(h).toContain("Azimuts des antennes\u00a0: 60\u00a0°, 140\u00a0° et 225\u00a0° (0\u00a0° = nord).");
    expect(h).toContain(`hauteur ${String(f.h).replace(".", ",")}\u00a0m`);
    expect(h).toContain("Puissance d'émission\u00a0: non publiée par l'ANFR.");
    expect(h).toContain("pas des mesures");
    // By generation, then by band: the 2G first, the 5G last.
    expect(h.indexOf("2G (GSM), bande des 900")).toBeLessThan(h.indexOf("4G (LTE), bande des 700"));
    expect(h.indexOf("4G (LTE), bande des 700")).toBeLessThan(h.indexOf("4G (LTE), bande des 1\u202f800"));
    expect(h.indexOf("4G (LTE), bande des 2\u202f600")).toBeLessThan(h.indexOf("5G (5G NR)"));
    expect(h).toContain(lienNom("https://www.cartoradio.fr", "cartoradio.fr", ' rel="noopener"'));
    // A second dot: the file is not asked again.
    await m.click(300, 300);
    expect(m.asked).toHaveLength(1);
    expect(m.box.innerHTML).toContain("Support n°\u00a047169");
    m.close();
    expect(m.box.hidden).toBe(true);
  });

  it("says « non publié » for what the file leaves out: a project's day, a height", async () => {
    const s = sheets();
    const projet = Object.entries(s.s).find(([, x]) => x.e.some((r) => !r[3]))!;
    const m = run([dot(Number(projet[0]), 50, 50)], () => Promise.resolve({ ok: true, json: async () => ({ ...s, s: { ...s.s, [projet[0]]: { ...projet[1], h: 0, n: "" } } }) }));
    await m.click(50, 50);
    expect(m.box.innerHTML).toContain("projet approuvé, date de mise en service non publiée");
    expect(m.box.innerHTML).toContain("Nature du support non publiée, hauteur non publiée.");
  });

  it("says when the file failed", async () => {
    const m = run([dot(47165, 100, 100)], () => Promise.resolve({ ok: false }));
    await m.click(100, 100);
    expect(m.box.innerHTML).toBe("<p>La fiche n'a pas pu être chargée\u00a0: réessayez.</p>");
  });

  /** What the file says around a point: actives and projects within r metres, the nearest active. */
  const compte = (lon: number, lat: number) => {
    const L = Object.entries(sheets().s).map(([id, f]) => ({ id, f, d: distanceKm(lon, lat, (f as unknown as { p: number[] }).p[0], (f as unknown as { p: number[] }).p[1]) * 1000 }));
    const actif = (x: (typeof L)[number]) => x.f.e.some((r) => r[2] !== "p");
    return {
      r: [500, 1000, 2000].map((r) => [L.filter((x) => x.d <= r && actif(x)).length, L.filter((x) => x.d <= r && !actif(x)).length]),
      proche: L.filter(actif).sort((a, b) => a.d - b.d)[0],
    };
  };

  it("counts, on a click away from any dot, the supports around that point, and opens the nearest one's sheet", async () => {
    // Saint-Denis, the Barachois: many supports around.
    const [lon, lat] = [55.4489, -20.8746];
    const want = compte(lon, lat);
    const [x, y] = lieu(lon, lat);
    const m = run([dot(47165, x + 200, y + 200), dot(47169, x - 100, y, true)], ok);
    await m.click(x, y);
    expect(m.asked).toEqual([fichesPath()]);
    expect(m.marks.at(-1)).toEqual({ cx: String(x), cy: String(y) });
    const h = m.box.innerHTML;
    expect(h).toContain("<h3>Autour de ce point</h3>");
    const n = (a: number, p: number, t: string) => `<li>à moins de ${t}\u00a0: ${a ? `${a} actif${a > 1 ? "s" : ""}` : "aucun actif"}${p ? `, ${p} en projet` : ""}</li>`;
    expect(h).toContain(n(want.r[0][0], want.r[0][1], "500\u00a0m") + n(want.r[1][0], want.r[1][1], "1\u00a0km") + n(want.r[2][0], want.r[2][1], "2\u00a0km"));
    expect(want.r[2][0]).toBeGreaterThan(10);
    expect(h).toContain(`Le plus proche des actifs\u00a0: support n°\u00a0${want.proche.id}, Saint-Denis, à `);
    expect(h).toContain("pas une mesure de l'exposition aux ondes");
    await m.voir(want.proche.id);
    expect(m.box.innerHTML).toContain(`<h3>Support n°\u00a0${want.proche.id}\u00a0· Saint-Denis</h3>`);
    expect(m.asked).toHaveLength(1);
  });

  it("counts around a support from its sheet, without that support", async () => {
    const id = "47165";
    const f = sheets().s[id] as unknown as { p: number[] };
    const m = run([dot(47165, 100, 100)], ok);
    await m.click(100, 100);
    expect(m.box.innerHTML).toContain('class="antf-voir antf-autour" data-i="47165">Les antennes autour de ce support</button>');
    await m.autour(id);
    const h = m.box.innerHTML;
    expect(h).toContain("<h3>Autour de ce support</h3>");
    const L = Object.entries(sheets().s).filter(([k]) => k !== id).map(([k, x]) => ({ k, d: distanceKm(f.p[0], f.p[1], (x as unknown as { p: number[] }).p[0], (x as unknown as { p: number[] }).p[1]) * 1000, a: x.e.some((r) => r[2] !== "p") }));
    const proche = L.filter((x) => x.a).sort((a, b) => a.d - b.d)[0];
    expect(h).toContain(`support n°\u00a0${proche.k},`);
    expect(m.marks).toHaveLength(1);
  });

  it("leaves a click outside the map without anything", async () => {
    const m = run([dot(47165, 100, 100)], ok);
    await m.click(-50, -50);
    expect(m.box.hidden).toBe(true);
    expect(m.asked).toEqual([]);
  });

  it("counts around the visitor's position, with the button shown by the script; out of the island or refused, says so", async () => {
    const [lon, lat] = [55.4489, -20.8746];
    const m = run([], ok, { lat, lon });
    expect(m.bloc.hidden).toBe(false);
    await m.moi();
    expect(m.box.innerHTML).toContain("<h3>Autour de votre position</h3>");
    expect(m.box.innerHTML).toContain(`support n°\u00a0${compte(lon, lat).proche.id}`);
    const loin = run([], ok, { lat: 48.85, lon: 2.35 });
    await loin.moi();
    expect(loin.msg.textContent).toBe("Votre position n'est pas à La Réunion.");
    expect(loin.asked).toEqual([]);
    const non = run([], ok, null);
    await non.moi();
    expect(non.msg.textContent).toBe("Position non autorisée.");
  });
});

describe("fiche_terrain and the page count the same antennas around a place", () => {
  it("gives the counts of /antennes at 500 m, 1 km and 2 km, active or planned, with the page's sentence", () => {
    const sheet = JSON.parse(fichesJson()) as { s: Record<string, { e: Ligne[]; p: [number, number] }> };
    // The page's rule (ficheScript): active when one of a support's lines is not « projet ».
    const page = (lon: number, lat: number) =>
      [500, 1000, 2000].map((r) => {
        const a = Object.values(sheet.s).filter((f) => distanceKm(lon, lat, f.p[0], f.p[1]) * 1000 <= r);
        const n = a.filter((f) => f.e.some((x) => x[2] !== "p")).length;
        return { rayon_m: r, actifs: n, en_projet: a.length - n };
      });
    // The Barachois (Saint-Denis), Cilaos, and the Plaine des Cafres' forest.
    for (const [lon, lat] of [[55.4481, -20.8789], [55.4719, -21.1347], [55.53, -21.13]] as [number, number][]) {
      const m = antennas(lon, lat).bloc.antennes_mobiles;
      expect(m.autour).toEqual(page(lon, lat));
      expect(m.autour[0].actifs + m.autour[0].en_projet).toBe(m.supports);
    }
    expect(antennas(55.4481, -20.8789).bloc.antennes_mobiles.autour[2].actifs).toBeGreaterThan(13);
    expect(antennas(55.4481, -20.8789).bloc.antennes_mobiles.autour_note).toBe("Un nombre et une distance de supports déclarés, pas une mesure de l'exposition aux ondes.");
  });
});
