import { describe, expect, it } from "vitest";
import * as velo from "../src/vie/velo.js";
import * as vitesses from "../src/vie/vitesses.js";
import { cartePage } from "../src/web/carte.js";
import { CARTE_CSS, VITESSES } from "../src/web/carte-style.js";
import { veloCouche, vitessesCouche } from "../src/web/couches.js";

// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll(" ", " ");

describe("the bike lanes and racks of /carte (vie/velo.ts)", () => {
  const region = velo.VOIES.filter((v) => v.s === "region");

  it("are the Région's pieces built and the CIVIS's racks (the lanes of the whole island: velo-geovelo.test.ts)", () => {
    expect([region.length, velo.ACCROCHES.length]).toEqual([338, 104]);
    expect(velo.REGION_DU).toBe("2025-12-31");
    for (const v of velo.VOIES) expect(velo.points(v).length, v.type).toBeGreaterThan(1);
    // A name the CIVIS cuts at 30 characters is not said.
    for (const a of velo.ACCROCHES) expect((a.nom ?? "").length).toBeLessThan(30);
    expect(velo.ACCROCHES.filter((a) => !a.nom)).toHaveLength(25);
    for (const s of Object.values(velo.SOURCES)) expect(s.licence).toBe("Licence Ouverte (Etalab)");
  });

  it("are a layer that says each source and its date, and never a lane usable", () => {
    const j = veloCouche(velo.VOIES, velo.ACCROCHES, velo.LU_LE);
    expect(j.objets).toHaveLength(338 + 104);
    const racks = j.objets.filter((o) => !o.trace);
    expect(racks).toHaveLength(104);
    expect(racks.reduce((n, o) => n + Number(o.infos!.accroches), 0)).toBeGreaterThan(104);
    const by = (s: string) => j.objets.filter((o) => o.infos!.source === s).map((o) => o.infos!.liste);
    expect(new Set(by("Région Réunion"))).toEqual(new Set(["liste du 31/12/2025"]));
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
      "Aménagements recensés par la Région (liste du 31/12/2025) et accroches vélo de la CIVIS (sans date) : la carte ne dit pas leur état ce jour. Les pistes cartographiées dans OpenStreetMap : la couche Pistes cyclables (OpenStreetMap).",
    );
    expect(html).toContain("Limitations relevées par la Région, mise à jour d'août 2024 : les panneaux sur place et les zones de travaux font foi.");
    expect(html).toMatch(/data-c="velo"[^]*?<a href="\/velos">Voir la page Vélos →<\/a>/);
    expect(html).toMatch(/data-c="vitesses"[^]*?<a href="\/trafic">Voir la page Circulation →<\/a>/);
  });
});
