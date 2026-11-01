import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { CODES_POSTAUX } from "../src/places/codes-postaux.js";
import { INSEE } from "../src/places/insee.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { DOCTOR, medecinsAnswer } from "../src/tools/medecins.js";
import * as medecins from "../src/vie/medecins.js";
import { communePage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// Sunday 1/11/2026, 21:00 at La Réunion.
const NOW = new Date("2026-11-01T17:00:00Z");
const C = medecins.COMPTES;
const GP_KEYS = ["depassement_permanent", "non_conventionnes", "optam", "secteur_1", "secteur_2", "total"];

/** Every key of an object, at any depth. */
const keys = (x: unknown): string[] => (x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => [k, ...keys(v)]) : []);

describe("the doctors of the Assurance Maladie's directory, counted", () => {
  it("holds numbers, the directory's specialities, communes, postcodes and dates only: never a name nor an address", () => {
    expect(Object.keys(C).sort()).toEqual(["communes", "construit", "ile", "mis_a_jour"]);
    for (const d of [C.construit, C.mis_a_jour]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const counts = (c: medecins.Comptes) => {
      expect(Object.keys(c.generalistes).sort()).toEqual(GP_KEYS);
      for (const v of Object.values(c.generalistes)) expect(Number.isInteger(v)).toBe(true);
      for (const [s, v] of Object.entries(c.specialistes)) {
        expect(medecins.SPECIALITES).toContain(s);
        expect(Object.keys(v).sort()).toEqual(["secteur_1", "total"]);
        expect(Number.isInteger(v.total) && Number.isInteger(v.secteur_1) && v.secteur_1 <= v.total).toBe(true);
      }
    };
    expect(Object.keys(C.ile).sort()).toEqual(["generalistes", "specialistes"]);
    counts(C.ile);
    expect(Object.keys(C.communes)).toHaveLength(24);
    for (const [name, c] of Object.entries(C.communes)) {
      expect(INSEE[name]).toBeDefined();
      expect(Object.keys(c).sort()).toEqual(["codes_postaux", "generalistes", "specialistes"]);
      for (const cp of c.codes_postaux) expect(CODES_POSTAUX[cp]).toBe(name);
      counts(c);
    }
    // The bundled list of names is gone, and nothing else of the directory is in src.
    expect(existsSync("src/vie/medecins.json")).toBe(false);
    expect(readdirSync("src/vie").filter((f) => f.startsWith("medecins"))).toEqual(["medecins-comptes.json", "medecins.ts"]);
  });

  it("counts the file of 26/10/2026: a doctor once in a commune however many practices, once in the island", () => {
    expect(C.mis_a_jour).toBe("2026-10-26");
    const sum = (c: medecins.Comptes) => c.generalistes.total + Object.values(c.specialistes).reduce((n, s) => n + s.total, 0);
    expect(sum(C.ile)).toBe(1751);
    expect(C.ile.generalistes.total).toBe(1043);
    expect(Object.values(C.communes).reduce((n, c) => n + sum(c), 0)).toBe(2038);
    for (const c of Object.values(C.communes)) {
      const g = c.generalistes;
      expect(g.secteur_1 + g.secteur_2 + g.depassement_permanent + g.non_conventionnes).toBe(g.total);
    }
  });
});

describe("annuaire_services_publics asked for a doctor", () => {
  it("knows a doctor question from a dentist's or a vet's", () => {
    for (const q of ["médecin", "médecin généraliste", "docteur", "pédiatre", "ophtalmo", "ORL", "spécialiste", "secteur 1", "IRM", "chirurgien"]) expect(DOCTOR.test(q)).toBe(true);
    for (const q of ["dentiste", "chirurgien-dentiste", "vétérinaire", "médecin vétérinaire", "mairie", "école"]) expect(DOCTOR.test(q)).toBe(false);
  });

  it("gives the commune's general practitioners by sector, with the directory's link for its postcode", () => {
    const g = C.communes.Cilaos.generalistes;
    const r = body(medecinsAnswer("médecin généraliste", "Cilaos"));
    expect(r.resume).toBe(
      `${g.total} médecins généralistes libéraux à Cilaos d'après l'annuaire santé de l'Assurance Maladie, dont ${g.secteur_1} en secteur 1. Leurs noms, adresses et horaires sont sur l'annuaire santé Ameli : https://annuairesante.ameli.fr/recherche/professions/37/974/97413.`,
    );
    expect(r.generalistes).toEqual(g);
    expect(r.specialistes).toBeUndefined();
    expect(r.ameli).toEqual({ accueil: "https://annuairesante.ameli.fr/", generalistes: [{ code_postal: "97413", lien: "https://annuairesante.ameli.fr/recherche/professions/37/974/97413" }] });
    expect(r.page).toBe("https://rundata.re/communes/cilaos#medecins");
    const said = r.avertissements.join(" ");
    expect(said).toContain("Les noms, les adresses et les horaires des médecins sont sur l'annuaire santé Ameli, https://annuairesante.ameli.fr/.");
    expect(said).toMatch(/ne dit pas si un médecin prend de nouveaux patients/);
    expect(said).toContain("le tarif de la Sécurité sociale");
    expect(r.sources[0]).toMatchObject({ licence: "Licence Ouverte Etalab 2.0" });
  });

  it("keeps a speciality asked, and gives both kinds for « médecin », a link per postcode", () => {
    const eyes = C.communes["Saint-Paul"].specialistes.Ophtalmologiste;
    const r = body(medecinsAnswer("ophtalmologiste", "Saint-Paul"));
    expect(r.resume.startsWith(`${eyes.total} médecins (Ophtalmologiste) libéraux à Saint-Paul d'après l'annuaire santé de l'Assurance Maladie, dont ${eyes.secteur_1} en secteur 1. Leurs noms, adresses et horaires sont sur l'annuaire santé Ameli : https://annuairesante.ameli.fr/.`)).toBe(true);
    expect(r.specialistes).toEqual([{ specialite: "Ophtalmologiste", nombre: eyes.total, secteur_1: eyes.secteur_1 }]);
    expect(r.generalistes).toBeUndefined();
    const all = body(medecinsAnswer("médecin", "Saint-Paul"));
    const sp = Object.values(C.communes["Saint-Paul"].specialistes).reduce((n, s) => n + s.total, 0);
    expect(all.resume.startsWith(`${C.communes["Saint-Paul"].generalistes.total} médecins généralistes et ${sp} médecins spécialistes libéraux à Saint-Paul`)).toBe(true);
    expect(all.ameli.generalistes.map((x: { code_postal: string }) => x.code_postal)).toEqual(["97411", "97422", "97423", "97434", "97435", "97460"]);
  });

  it("says where else in the island when the commune has none", () => {
    expect(C.communes.Salazie.specialistes.Ophtalmologiste).toBeUndefined();
    const r = body(medecinsAnswer("ophtalmologiste", "Salazie"));
    expect(r.resume).toMatch(/^Aucun médecin \(Ophtalmologiste\) libéral à Salazie dans l'annuaire santé de l'Assurance Maladie\. Ailleurs dans l'île : \d+ à /);
    expect(r.par_commune["Saint-Paul"]).toBe(C.communes["Saint-Paul"].specialistes.Ophtalmologiste.total);
  });

  it("counts them by commune without a place, and is reached through annuaireTool", async () => {
    const r = body(medecinsAnswer("pédiatre", undefined));
    const n = C.ile.specialistes["Pédiatre"].total;
    expect(r.resume.startsWith(`${n} médecins (Pédiatre) libéraux à La Réunion`)).toBe(true);
    expect(r.par_commune.Cilaos).toBeUndefined();
    expect(r.par_commune["Saint-Denis"]).toEqual({ nombre: C.communes["Saint-Denis"].specialistes["Pédiatre"].total, secteur_1: C.communes["Saint-Denis"].specialistes["Pédiatre"].secteur_1 });
    const viaTool = body(await annuaireTool(new Cache(new MemoryStore(), () => NOW.getTime()), "médecin généraliste", "Cilaos", NOW));
    expect(viaTool.page).toBe("https://rundata.re/communes/cilaos#medecins");
  });

  it("answers numbers only: no name nor address field anywhere", () => {
    for (const [quoi, lieu] of [["médecin", "Saint-Paul"], ["pédiatre", "Salazie"], ["secteur 1", undefined], ["spécialiste", "Le Port"]] as const) {
      const all = keys(body(medecinsAnswer(quoi, lieu)));
      for (const k of ["nom", "noms", "adresse", "medecins", "telephone"]) expect(all).not.toContain(k);
    }
  });
});

describe("the commune page's doctors", () => {
  const section = (slug: string) => {
    const html = communePage("https://rundata.re", pageOf(slug)!, { place: null }, NOW);
    return html.slice(html.indexOf('<section id="medecins"'), html.indexOf("</section>", html.indexOf('<section id="medecins"')));
  };

  it("counts the general practitioners by sector and the specialists by speciality", () => {
    const part = section("saint-paul");
    const c = C.communes["Saint-Paul"];
    expect(part).toContain("Médecins à Saint-Paul");
    expect(part).toContain(`<h3>Généralistes <span class="note">${c.generalistes.total}</span></h3>`);
    expect(part).toContain(`<li><span>En secteur 1</span><span>${c.generalistes.secteur_1}</span></li>`);
    expect(part).toContain(`<li><span>Adhérents à l&#39;OPTAM</span><span>${c.generalistes.optam}</span></li>`);
    const eyes = c.specialistes.Ophtalmologiste;
    expect(part).toContain(`<li><span>Ophtalmologistes<small>${eyes.secteur_1} en secteur 1</small></span><span>${eyes.total}</span></li>`);
    expect(part).toContain("le tarif de la Sécurité sociale, sans dépassement");
    expect(part).toContain("Un médecin qui a plusieurs cabinets dans la commune compte une fois\u00a0; Ameli montre chaque cabinet. L&#39;annuaire ne dit pas si un médecin prend de nouveaux patients");
    expect(part).toContain("fichier du 26/10");
    // The page gathers its sources at the bottom.
    expect(communePage("https://rundata.re", pageOf("saint-paul")!, { place: null }, NOW)).toContain("Annuaire santé Ameli (Licence Ouverte Etalab 2.0)");
  });

  it("sends to the Assurance Maladie's directory for the names, its general practitioners of each postcode", () => {
    expect(section("cilaos")).toContain('<a href="https://annuairesante.ameli.fr/recherche/professions/37/974/97413" rel="noopener">97413</a>');
    const part = section("saint-paul");
    expect(part).toContain('Leurs noms, adresses et horaires sont sur <a href="https://annuairesante.ameli.fr/" rel="noopener">');
    for (const cp of ["97411", "97422", "97423", "97434", "97435", "97460"]) expect(part).toContain(`/37/974/${cp}" rel="noopener">${cp}</a>`);
  });
});
