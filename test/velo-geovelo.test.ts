import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toutesLesSources } from "../src/server.js";
import * as velo from "../src/vie/velo.js";
import * as geovelo from "../src/vie/velo-geovelo.js";
import { cartePage } from "../src/web/carte.js";
import { COUCHES, geoveloCouche, veloCouche } from "../src/web/couches.js";

// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll(" ", " ");
const ATTRIBUTION = "© les contributeurs d'OpenStreetMap, traitement Geovelo";

describe("the bike lanes of the whole island, Geovelo's (vie/velo-geovelo.ts)", () => {
  it("are Geovelo's list of 03/11/2026, every commune but Salazie, each lane its type and one line", () => {
    expect(geovelo.VOIES).toHaveLength(824);
    expect(geovelo.LISTE_DU).toBe("2026-11-03");
    expect(new Set(geovelo.VOIES.map((v) => v.commune)).size).toBe(23);
    for (const v of geovelo.VOIES) expect(geovelo.points(v).length, v.type).toBeGreaterThan(1);
    expect(new Set(geovelo.VOIES.map((v) => v.type))).toContain("Piste cyclable");
    expect(geovelo.VOIES.filter((v) => v.type === "Bande cyclable, couloir bus et vélo").length).toBeGreaterThan(0);
  });

  it("say the ODbL and OpenStreetMap's contributors, as the licence asks, apart from the Licence Ouverte's lists", () => {
    expect(geovelo.SOURCE).toMatchObject({ licence: "ODbL 1.0", attribution: ATTRIBUTION, url: "https://www.data.gouv.fr/datasets/amenagements-cyclables-ile-de-la-reunion" });
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: geovelo.SOURCE.id, licence: "ODbL 1.0", attribution: ATTRIBUTION }));
    // The data's README: the list, its licence and its attribution.
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toMatch(/\| Aménagements cyclables de l'île cartographiés dans OpenStreetMap, de \[Geovelo\]\(https:\/\/www\.data\.gouv\.fr\/datasets\/amenagements-cyclables-ile-de-la-reunion\)[^\n]*\| ODbL, « © les contributeurs d'OpenStreetMap », traitement Geovelo \|/);
  });

  it("are a layer of their own, which says its source and its date, and never a lane usable", () => {
    const c = COUCHES.find((x) => x.id === "velo-osm")!;
    expect(c).toMatchObject({ nom: "Pistes cyclables (OpenStreetMap)", forme: "traces", page: "/velos" });
    expect(c.source.licence).toBe("ODbL 1.0");
    const j = geoveloCouche(geovelo.VOIES, geovelo.LU_LE);
    expect(j.objets).toHaveLength(824);
    for (const o of j.objets) {
      expect(o.trace).toBeTruthy();
      expect(o.infos).toMatchObject({ source: ATTRIBUTION, liste: "liste du 03/11/2026" });
    }
    const all = flat(JSON.stringify(j));
    for (const word of ["praticable", "sûr", "Région", "CIVIS"]) expect(all, word).not.toContain(word);
    expect(all).not.toMatch(/\bouvert/);
  });

  it("replace the Ville de Saint-Denis's list of February 2023: the layer Vélo keeps the Région's and the CIVIS's", () => {
    expect(new Set(velo.VOIES.map((v) => v.s))).toEqual(new Set(["region"]));
    expect(Object.keys(velo.SOURCES).sort()).toEqual(["civis", "region"]);
    const j = veloCouche(velo.VOIES, velo.ACCROCHES, velo.LU_LE);
    // Saint-Denis stays a commune of the Région's lanes: the Ville's list is gone.
    expect(JSON.stringify(j)).not.toContain("Ville de Saint-Denis");
    expect(JSON.stringify(j)).not.toContain("février 2023");
    expect(COUCHES.find((x) => x.id === "velo")!.source.licence).toBe("Licence Ouverte (Etalab)");
  });

  it("say in each panel that they are two lists, each to be read alone", () => {
    const html = flat(cartePage("https://rundata.re"));
    expect(html).toContain(
      "Aménagements recensés par la Région (liste du 31/12/2025) et accroches vélo de la CIVIS (sans date) : la carte ne dit pas leur état ce jour. Les pistes cartographiées dans OpenStreetMap : la couche Pistes cyclables (OpenStreetMap).",
    );
    expect(html).toContain(
      "Pistes et bandes cyclables de l'île cartographiées dans OpenStreetMap, d'après la liste de Geovelo du 03/11/2026 : la carte ne dit pas leur état ce jour. La Voie vélo régionale, avec ses dates, est dans la couche Vélo.",
    );
    expect(html).toMatch(/data-c="velo-osm"[^]*?<a href="\/velos">Voir la page Vélos →<\/a>/);
    expect(html).not.toContain("février 2023");
  });
});
