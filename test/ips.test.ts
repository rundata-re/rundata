import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import * as ecoles from "../src/vie/ecoles.js";
import * as ips from "../src/vie/ips.js";
import { annuaireEcolesPage } from "../src/web/ecoles-annuaire.js";

const page = annuaireEcolesPage("https://rundata.re");
const at = (id: string) => page.indexOf(`<section id="${id}"`);
const html = page.slice(at("colleges-lycees"), page.indexOf("</section>", at("colleges-lycees")));
const q = (s: string) => s.replaceAll("'", "&#39;");
const sorted = (names: string[]) => expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
const college = (nom: string) => ips.COLLEGES.find((e) => e.nom === nom)!;
const lycee = (nom: string) => ips.LYCEES.find((e) => e.nom === nom)!;

describe("the collèges and lycées with their IPS and results (vie/ips.ts)", () => {
  it("are the rentrée 2025's and the session 2025's, named and placed as in the annuaire", () => {
    expect(ips.RENTREE).toBe(2025);
    expect(ips.SESSION).toBe(2025);
    expect(ips.COLLEGES).toHaveLength(87);
    expect(ips.LYCEES).toHaveLength(49);
    const annuaire = new Map(ecoles.LIST.map((e) => [e.uai, e]));
    for (const e of [...ips.COLLEGES, ...ips.LYCEES]) {
      expect(annuaire.get(e.uai)).toMatchObject({ nom: e.nom, commune: e.commune });
      expect(Object.keys(INSEE)).toContain(e.commune);
    }
    // The IVAC writes « SAINTE CLOTILDE » for some collèges of Saint-Denis: none is out of the 24 communes.
    expect(ips.parCommune().map(([c]) => c)).not.toContain("Sainte-Clotilde");
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: ips.SOURCE_IPS.id }));
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: ips.SOURCE_VA.id }));
  });

  it("expects the rate less its valeur ajoutée, and nothing where the ministry computes nothing", () => {
    expect(college("Collège le Dimitile")).toMatchObject({ ips: 97.1, candidats: 85, reussite: { taux: 95, attendu: 90 } });
    expect(lycee("Lycée polyvalent Roland Garros").pro).toEqual({ presents: 64, acces: { taux: 50, attendu: 64 }, reussite: { taux: 77, attendu: 85 } });
    const sans = ips.COLLEGES.filter((e) => e.reussite.attendu === null);
    expect(sans).toHaveLength(1);
    expect(sans[0]!.candidats).toBeLessThan(ips.SEUIL.college);
    expect(ips.LYCEES.filter((e) => !e.gt && !e.pro)).toHaveLength(1);
  });
});

describe("the part « Collèges et lycées : profil social et résultats » of /ecoles", () => {
  it("comes after the list of the annuaire and before « Après le bac »", () => {
    expect(page.indexOf('id="h-eliste"')).toBeLessThan(at("colleges-lycees"));
    expect(at("colleges-lycees")).toBeLessThan(at("apres-bac"));
  });

  it("says the ministry's words, then each commune's collèges and lycées, in alphabetical order", () => {
    expect(html).toContain('<p class="eyebrow">Ministère de l&#39;Éducation nationale, DEPP</p><h2 id="h-colleges-lycees">Collèges et lycées : profil social et résultats</h2>');
    expect(html).toContain("87 collèges et 49 lycées, publics et privés sous contrat");
    expect(html).toContain("avec le taux attendu calculé par le ministère.");
    expect(html).toContain(q("« L'indice de position sociale (IPS) permet d'appréhender le statut social des élèves à partir des professions et catégories sociales (PCS) de leurs parents. »"));
    expect(html).toContain(q("compte tenu de l'âge des élèves, de leur niveau scolaire à l'entrée en sixième, de leur origine sociale et de leur sexe"));
    expect(html).toContain("« La valeur ajoutée est une approche relative et non pas absolue. »");
    expect(html).toContain(q("Le ministère ne publie pas de marge pour ces écarts. D'une année à l'autre, ils changent souvent de plusieurs points, et dans un collège de 50 candidats, un élève reçu de plus ou de moins fait 2 points."));
    expect(html).toContain(q("Pour un lycée, on prend le niveau scolaire à l'entrée en seconde et les caractéristiques du lycée."));
    expect(html).toContain(q("Un palmarès ou un classement des établissements n'a guère de sens, écrit le ministère : ils sont ici dans l'ordre alphabétique."));
    expect(html).toContain("DEPP, ministère de l&#39;Éducation nationale, Licence Ouverte.");
    // Collèges: the rate with the terms of the comparison.
    expect(html).toContain("<tr><th scope=\"row\">Collège le Dimitile</th><td>97,1</td><td>95 % (attendu : 90 %)</td><td>85</td></tr>");
    // Lycées: the taux d'accès first, then the taux de réussite.
    expect(html).toContain("<tr><th scope=\"row\">Professionnelle</th><td>50 % (attendu : 64 %)</td><td>77 % (attendu : 85 %)</td><td>64</td></tr>");
    expect(html).toContain("non calculé, trop peu de candidats");
    expect(html).toContain("Pas encore de résultats au bac.");
    const communes = [...html.matchAll(/<summary><h3>([^<]+) <span/g)].map((m) => m[1]!);
    expect(communes).toHaveLength(ips.parCommune().length);
    sorted(communes);
    for (const [, cols, lycs] of ips.parCommune()) {
      for (const list of [cols, lycs]) {
        const where = list.map((e) => html.indexOf(e.nom.replaceAll("'", "&#39;")));
        expect(where.every((i) => i > 0)).toBe(true);
        expect(where).toEqual([...where].sort((a, b) => a - b));
      }
    }
  });

  it("gives nothing to sort, filter nor rank by, and links only to the ministry's data and its note", () => {
    expect(html).not.toMatch(/ data-|meilleur|palmarès des|moyenne de l'île|médiane|mention|class="q-|vg\d/i);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(links).toHaveLength(6);
    for (const l of links) expect(l).toMatch(/^https:\/\/(?:data\.education\.gouv\.fr\/explore\/dataset\/|doi\.org\/10\.48464\/ni-23-16$)/);
    expect(html).not.toContain("www.education.gouv.fr");
  });
});
