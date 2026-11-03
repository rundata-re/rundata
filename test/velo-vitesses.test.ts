import { describe, expect, it } from "vitest";
import * as velo from "../src/vie/velo.js";
import * as vitesses from "../src/vie/vitesses.js";
import { cartePage } from "../src/web/carte.js";
import { CARTE_CSS, VITESSES } from "../src/web/carte-style.js";
import { veloCouche, vitessesCouche } from "../src/web/couches.js";

// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll(" ", " ");

/** Metres between two points, on a flat projection around the first. */
const metres = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * (Math.PI / 180) * 6_371_000;
/** Metres from p to the segment a-b. */
function toSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const [ax, ay, bx, by] = [(a[0] - p[0]) * k, a[1] - p[1], (b[0] - p[0]) * k, b[1] - p[1]];
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
  return Math.hypot(ax + t * dx, ay + t * dy) * (Math.PI / 180) * 6_371_000;
}

describe("the bike lanes and racks of /carte (vie/velo.ts)", () => {
  const region = velo.VOIES.filter((v) => v.s === "region");
  const saintDenis = velo.VOIES.filter((v) => v.s === "saint-denis");

  it("are the Région's pieces built, Saint-Denis's lanes not under them, the CIVIS's racks", () => {
    expect([region.length, saintDenis.length, velo.ACCROCHES.length]).toEqual([338, 31, 104]);
    expect([velo.REGION_DU, velo.SAINT_DENIS_DU]).toEqual(["2025-12-31", "2023-02-06"]);
    for (const v of velo.VOIES) expect(velo.points(v).length, v.type).toBeGreaterThan(1);
    // A name the CIVIS cuts at 30 characters is not said.
    for (const a of velo.ACCROCHES) expect((a.nom ?? "").length).toBeLessThan(30);
    expect(velo.ACCROCHES.filter((a) => !a.nom)).toHaveLength(25);
    for (const s of Object.values(velo.SOURCES)) expect(s.licence).toBe("Licence Ouverte (Etalab)");
  });

  it("never draw twice a lane of Saint-Denis that lies under the Voie vélo régionale (60 % of it within 25 m)", () => {
    const segs = region.flatMap((v) => v.lignes.flatMap((l) => {
      const p = velo.points({ ...v, lignes: [l] });
      return p.slice(1).map((b, i) => [p[i], b] as const);
    }));
    for (const v of saintDenis) {
      let on = 0;
      let total = 0;
      for (const l of v.lignes) {
        const p = velo.points({ ...v, lignes: [l] });
        for (let i = 1; i < p.length; i++) {
          // Every 10 m along the piece, its points may be far apart.
          const n = Math.max(1, Math.ceil(metres(p[i - 1], p[i]) / 10));
          for (let k = 0; k < n; k++) {
            const at = (f: number): [number, number] => [p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * f) / n, p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * f) / n];
            const [a, b] = [at(k), at(k + 1)];
            const d = metres(a, b);
            total += d;
            if ([a, b].every((x) => segs.some(([s, e]) => toSegment(x, s, e) <= 25))) on += d;
          }
        }
      }
      expect(on / total, v.nom).toBeLessThan(0.6);
    }
  });

  it("are a layer that says each source and its date, and never a lane usable", () => {
    const j = veloCouche(velo.VOIES, velo.ACCROCHES, velo.LU_LE);
    expect(j.objets).toHaveLength(338 + 31 + 104);
    const racks = j.objets.filter((o) => !o.trace);
    expect(racks).toHaveLength(104);
    expect(racks.reduce((n, o) => n + Number(o.infos!.accroches), 0)).toBeGreaterThan(104);
    const by = (s: string) => j.objets.filter((o) => o.infos!.source === s).map((o) => o.infos!.liste);
    expect(new Set(by("Région Réunion"))).toEqual(new Set(["liste du 31/12/2025"]));
    expect(new Set(by("Ville de Saint-Denis"))).toEqual(new Set(["février 2023"]));
    expect(new Set(by("CIVIS"))).toEqual(new Set(["sans date"]));
    // « Requalification » said as the Région's, never as done.
    const requalifie = j.objets.filter((o) => o.infos!.etat === "Requalification (d'après la Région)");
    expect(requalifie.length).toBe(region.filter((v) => v.requalification).length);
    expect(requalifie.length).toBeGreaterThan(0);
    const all = flat(JSON.stringify(j) + JSON.stringify(velo));
    for (const word of ["A définir", "exploitant", "sûr", "praticable", "Etude", "Supprimé", "En travaux"]) expect(all, word).not.toContain(word);
    // A « marché couvert » is a place's name.
    expect(all).not.toMatch(/\bouvert/);
  });
});

describe("the speeds of the routes nationales on /carte (vie/vitesses.ts)", () => {
  it("are their pieces, each its speed, its route and its year, a side kept only where it differs", () => {
    expect(vitesses.TRONCONS).toHaveLength(968);
    expect(vitesses.MISE_A_JOUR).toBe("2024-08");
    expect([...new Set(vitesses.TRONCONS.map((t) => t.v))].sort((a, b) => a - b)).toEqual(VITESSES);
    for (const t of vitesses.TRONCONS) {
      expect(t.route).toMatch(/^RN\d+[A-Z]?$/);
      if (t.annee) expect(t.annee).toBeGreaterThanOrEqual(2016);
      if (t.annee) expect(t.annee).toBeLessThanOrEqual(2024);
    }
    const j = vitessesCouche(vitesses.TRONCONS, vitesses.LU_LE);
    expect(flat(j.objets.find((o) => o.infos!.vitesse_kmh === 110)!.nom)).toMatch(/^110 km\/h · RN\d+[A-Z]?$/);
    expect(j.source.organisme).toBe("Région Réunion");
  });

  it("are a scale of greys to the night's blue, never red", () => {
    const scale = CARTE_CSS.match(/\.kc-vitesses \.v\d+\{--c:#[0-9a-f]{6}\}/g)!;
    expect(scale).toHaveLength(VITESSES.length);
    for (const s of scale) {
      const [r, g, b] = s.slice(-7, -1).match(/../g)!.map((x) => parseInt(x, 16));
      expect(r, s).toBeLessThanOrEqual(b);
      expect(g, s).toBeLessThanOrEqual(b);
    }
  });
});

describe("the two layers' panels", () => {
  it("say the lists' dates, that the map does not say a lane's state, and that the signs come first", () => {
    const html = flat(cartePage("https://rundata.re"));
    expect(html).toContain(
      "Aménagements recensés par la Région (liste du 31/12/2025), la Ville de Saint-Denis (février 2023) et la CIVIS (sans date) : la carte ne dit pas leur état ce jour. Accroches vélo : la CIVIS seulement.",
    );
    expect(html).toContain("Limitations relevées par la Région, mise à jour d'août 2024 : les panneaux sur place et les zones de travaux font foi.");
    expect(html).toMatch(/data-c="velo"[^]*?<a href="\/velos">Voir la page Vélos →<\/a>/);
    expect(html).toMatch(/data-c="vitesses"[^]*?<a href="\/trafic">Voir la page Circulation →<\/a>/);
  });
});
