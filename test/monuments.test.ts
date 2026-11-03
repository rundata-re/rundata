import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { resume } from "../src/tools/resume.js";
import { aujourdhuiPage, monumentsCard } from "../src/web/aujourdhui.js";
import { monumentsCouche } from "../src/web/couches.js";
import { pageOf } from "../src/web/places.js";
import { FICHIER_DU, MONUMENTS, ofCommune, protege, SOURCE } from "../src/vie/monuments.js";

const NOW = new Date("2026-11-03T08:00:00Z");

describe("the historic monuments (vie/monuments.ts)", () => {
  it("are those of the base Mérimée protected now, each with its communes", () => {
    // 206 rows of 974 in the file of 29/10/2026: a notice that only sends to another, and a delisted chimney, left out.
    expect(MONUMENTS.length).toBe(204);
    expect(MONUMENTS.some((m) => m.ref === "PA97400065")).toBe(false);
    expect(new Set(MONUMENTS.map((m) => m.ref)).size).toBe(MONUMENTS.length);
    const codes = new Set(Object.values(INSEE));
    for (const m of MONUMENTS) {
      expect(m.ref).toMatch(/^PA\d{8}$|^PA974\d{5}$/);
      expect(m.nom, m.ref).not.toBe("");
      expect(m.insee.every((c) => codes.has(c)), m.ref).toBe(true);
    }
    expect(MONUMENTS.filter((m) => m.lon != null).length).toBe(202);
    expect(FICHIER_DU).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SOURCE.licence).toBe("Licence Ouverte Etalab 2.0");
  });

  it("put a monument on two communes under both", () => {
    const lazarets = (nom: string) => ofCommune(nom).find((m) => m.nom === "Lazarets de la Grande Chaloupe");
    expect(lazarets("Saint-Denis")).toBeDefined();
    expect(lazarets("La Possession")).toBeDefined();
  });

  it("say their protection and their centuries", () => {
    const m = { ref: "PA00000000", nom: "x", insee: ["97411"], protection: "inscrit", partiel: true, siecles: ["18e", "19e"] } as const;
    expect(protege(m)).toBe("inscrit en partie · 18e et 19e s.");
    expect(protege({ ...m, partiel: undefined, protection: "classé", siecles: undefined })).toBe("classé");
  });
});

describe("a commune's monuments on its day's page", () => {
  it("lists them folded, each to its notice, the other commune said", () => {
    const html = monumentsCard("Saint-Denis");
    expect(html).toMatch(/^<div class="card"><details><summary><h3>Monuments historiques<\/h3> <span class="note">\d+ classés ou inscrits<\/span><\/summary>/);
    expect(html).toContain('<a href="https://pop.culture.gouv.fr/notice/merimee/PA97400026" rel="noopener">Lazarets de la Grande Chaloupe</a> <span class="note">inscrit · 19e s. · aussi à La Possession</span>');
    expect(html).toContain("D'après la base Mérimée du ministère de la Culture, liste du 29/10/2026 : chaque nom mène à sa notice.");
  });

  it("opens a short list, and says when the base has none", () => {
    expect(monumentsCard("Cilaos")).toContain('<details open><summary><h3>Monuments historiques</h3> <span class="note">1 classé ou inscrit</span>');
    expect(monumentsCard("Les Trois-Bassins")).toBe('<div class="card"><h3>Monuments historiques</h3><p>Aucun immeuble protégé au titre des monuments historiques aux Trois-Bassins dans la base Mérimée du ministère de la Culture.</p></div>');
  });

  it("comes after the practical life, its source credited", () => {
    const p = pageOf("saint-pierre")!;
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, {}, NOW), null);
    expect(html.indexOf('id="h-patrimoine"')).toBeGreaterThan(html.indexOf('id="h-pratique"'));
    expect(html).toContain("Immeubles protégés au titre des Monuments historiques (base Mérimée) (Licence Ouverte Etalab 2.0)");
  });
});

describe("the monuments' layer of /carte", () => {
  it("has those with a point, each leading to its commune's monuments", () => {
    const j = monumentsCouche(MONUMENTS, FICHIER_DU);
    expect(j.objets.length).toBe(202);
    const l = j.objets.find((o) => o.nom === "Lazarets de la Grande Chaloupe")!;
    expect([l.commune, l.lien]).toEqual(["Saint-Denis, La Possession", "/aujourdhui/saint-denis#h-patrimoine"]);
    expect(l.infos).toEqual({ type: "inscrit · 19e s.", notice: "https://pop.culture.gouv.fr/notice/merimee/PA97400026" });
  });
});
