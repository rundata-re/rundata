import { describe, expect, it } from "vitest";
import * as antennes from "../src/vie/antennes.js";
import { antennesPage } from "../src/web/antennes.js";
import { ficheScript, fichesFile, fichesJson, fichesPath, FICHES_DU, type Ligne } from "../src/web/antennes-fiche.js";
import { lienNom } from "../src/web/domains.js";
import { estDeclare } from "../src/web/scripts-declares.js";

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

/** The sheet's script on a map of `dots`, with the file answered by `answer`; the click and what the box holds. */
function run(dots: ReturnType<typeof dot>[], answer: () => Promise<unknown>) {
  const on: Record<string, (e: unknown) => void> = {};
  const box = { hidden: true, innerHTML: "", scrollIntoView: () => {}, addEventListener: (t: string, f: (e: unknown) => void) => (on[`box:${t}`] = f) };
  const svg = { querySelectorAll: () => dots, addEventListener: (t: string, f: (e: unknown) => void) => (on[`svg:${t}`] = f) };
  const asked: string[] = [];
  new Function("document", "fetch", ficheScript())({ getElementById: (i: string) => (i === "amap" ? svg : i === "antfiche" ? box : null) }, (u: string) => (asked.push(u), answer()));
  const click = async (x: number, y: number) => {
    on["svg:click"]({ clientX: x, clientY: y });
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { box, asked, click, close: () => on["box:click"]({ target: { closest: () => ({}) } }) };
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
    expect(h).toContain(`Support n° ${id} · ${f.c}`);
    expect(h).toContain("<h4>SFR Réunion</h4>");
    expect(h).toContain("5G (5G NR), bande des 3 500 MHz\u00a0: techniquement opérationnel, mise en service le 17/10/2024");
    expect(h).toContain("2G (GSM), bande des 900 MHz\u00a0: en service, mise en service le 15/03/2021");
    expect(h).toContain("Azimuts des antennes\u00a0: 60 °, 140 ° et 225 ° (0 ° = nord).");
    expect(h).toContain(`hauteur ${String(f.h).replace(".", ",")} m`);
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
    expect(m.box.innerHTML).toContain("Support n° 47169");
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

  it("leaves a click far from any dot, or on a hidden one, without a sheet, and says when the file failed", async () => {
    const m = run([dot(47165, 100, 100), dot(47169, 200, 200, true)], () => Promise.resolve({ ok: false }));
    await m.click(160, 160);
    await m.click(200, 200);
    expect(m.box.hidden).toBe(true);
    expect(m.asked).toEqual([]);
    await m.click(100, 100);
    expect(m.box.innerHTML).toBe("<p>La fiche n'a pas pu être chargée : réessayez.</p>");
  });
});
