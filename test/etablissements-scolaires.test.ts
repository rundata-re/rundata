import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { INSEE } from "../src/places/insee.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { ecolesAnswer, SCHOOL } from "../src/tools/etablissements.js";
import * as ecoles from "../src/vie/ecoles.js";
import { communePage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// Sunday 1/11/2026, 14:00 at La Réunion.
const NOW = new Date("2026-11-01T10:00:00Z");

describe("the schools, collèges and lycées of the directory", () => {
  it("keeps the island's écoles, collèges and lycées, each in a commune the server knows", () => {
    expect(ecoles.LIST).toHaveLength(698);
    expect(ecoles.KINDS.map((k) => ecoles.LIST.filter((e) => e.type === k.type).length)).toEqual([543, 95, 60]);
    for (const e of ecoles.LIST) {
      expect(INSEE[e.commune]).toBeDefined();
      expect(e.nom).not.toMatch(/^Section|\s{2}/);
    }
  });

  it("says what each declares, and nothing it leaves blank", () => {
    const corre = ecoles.LIST.find((e) => e.uai === "9740096L")!;
    expect(ecoles.services(corre)).toEqual(["public", "cantine", "internat", "ULIS", "éducation prioritaire (REP)"]);
    const neiges = ecoles.LIST.find((e) => e.uai === "9740510L")!;
    expect(ecoles.services(neiges)).toEqual(["privée", "maternelle et élémentaire", "cantine"]);
  });
});

describe("annuaire_services_publics asked for a school", () => {
  it("knows a school question from a surf or driving school", () => {
    for (const q of ["école", "école maternelle", "collège", "lycée", "internat", "ULIS", "établissement scolaire"]) expect(SCHOOL.test(q)).toBe(true);
    for (const q of ["école de surf", "école de conduite", "mairie", "écologie"]) expect(SCHOOL.test(q)).toBe(false);
  });

  it("gives a commune's, the nearest the place first, with their services and the catchment's rule", () => {
    const r = body(ecolesAnswer("collège", "Cilaos"));
    expect(r.resume).toBe("1 établissement à Cilaos (1 collège). Le plus proche de Cilaos : Collège Alsace Corré, 14 rue des Écoles, 97413 Cilaos, à 0,2 km.");
    expect(r.etablissements[0]).toMatchObject({ nom: "Collège Alsace Corré", type: "collège", telephone: "02 62 31 70 75", site: "https://etab.ac-reunion.fr/clg-alsace-corre", uai: "9740096L" });
    expect(r.page).toBe("https://rundata.re/communes/cilaos#ecoles");
    expect(r.avertissements.join(" ")).toContain("la mairie fixe le secteur des écoles, le Département celui des collèges");
    expect(r.sources[0].licence).toContain("Licence Ouverte");
  });

  it("keeps the service asked, and shows ten of a large commune", () => {
    const r = body(ecolesAnswer("internat", "Saint-Paul"));
    expect(r.etablissements.length).toBeGreaterThan(0);
    for (const e of r.etablissements) expect(e.services).toContain("internat");
    const all = body(ecolesAnswer("collège", "Saint-Paul"));
    expect(all.resume).toMatch(/^11 établissements à Saint-Paul \(11 collèges\)\./);
    expect(all.etablissements).toHaveLength(10);
    expect(all.autres).toBe("1 autre à Saint-Paul, sur la page de la commune.");
  });

  it("counts by commune without a place, and is reached through the annuaire", async () => {
    const r = body(ecolesAnswer("lycée", undefined));
    expect(r.resume).toMatch(/^60 établissements à La Réunion d'après l'annuaire de l'Éducation nationale \(60 lycées\)\./);
    const via = body(await annuaireTool(new Cache(new MemoryStore(), () => NOW.getTime()), "collège", "Cilaos", NOW));
    expect(via.etablissements[0].nom).toBe("Collège Alsace Corré");
  });
});

describe("a commune's page", () => {
  it("lists its schools, collèges and lycées by kind, with the catchment's rule and the source", () => {
    const html = communePage("https://rundata.re", pageOf("cilaos")!, { place: null }, NOW);
    expect(html).toContain('<section id="ecoles" aria-labelledby="h-ecoles">');
    expect(html).toContain("Écoles, collèges et lycées à Cilaos</h2>");
    expect(html).toContain("5 écoles, 1 collège, publics et privés, avec la cantine, l&#39;internat ou l&#39;ULIS quand l&#39;établissement les déclare.");
    expect(html).toContain('<h3>Écoles <span class="note">5</span></h3>');
    expect(html).toContain('<a href="tel:0262317075">02 62 31 70 75</a>');
    expect(html).toContain("l&#39;établissement le plus proche n&#39;est pas forcément celui du secteur");
    expect(html).toContain("Annuaire de l&#39;éducation du ministère de l&#39;Éducation nationale (Licence Ouverte Etalab 2.0)");
  });
});
