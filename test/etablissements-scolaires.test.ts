import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { INSEE } from "../src/places/insee.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { byName, communeIn, ecolesAnswer, SCHOOL } from "../src/tools/etablissements.js";
import * as carteScolaire from "../src/vie/carte-scolaire.js";
import * as ecoles from "../src/vie/ecoles.js";
import * as ips from "../src/vie/ips.js";
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

  it("keeps the service asked, gives all of a commune's collèges, and says how to get the écoles it does not list", () => {
    const r = body(ecolesAnswer("internat", "Saint-Paul"));
    expect(r.etablissements.length).toBeGreaterThan(0);
    for (const e of r.etablissements) expect(e.services).toContain("internat");
    // Saint-Denis has the most collèges: the 15, nothing left out.
    const all = body(ecolesAnswer("collège", "Saint-Denis"));
    expect(all.resume).toMatch(/^15 établissements à Saint-Denis \(15 collèges\)\. Le plus proche/);
    expect(all.etablissements).toHaveLength(15);
    expect(all.etablissements.map((e: { uai: string }) => e.uai)).toContain("9741260B");
    expect(all.autres).toBeUndefined();
    // Its 84 écoles: ten, and the others counted with how to get them.
    const ecolesSd = body(ecolesAnswer("école", "Saint-Denis"));
    expect(ecolesSd.resume).toMatch(/^84 établissements à Saint-Denis \(84 écoles\), les 10 plus proches de Saint-Denis ci-dessous\. /);
    expect(ecolesSd.etablissements).toHaveLength(10);
    expect(ecolesSd.autres).toBe("74 autres à Saint-Denis, non listés ici : redemander avec le nom de l'établissement dans quoi, ou un quartier dans lieu, ou voir la page de la commune.");
  });

  it("finds an establishment by its name, accents aside or one letter off, the place's commune first", () => {
    const hugot = "Collège Émile Hugot (Saint-Denis), 7 rue d'Emmerez de Charmoy, 97494 Saint-Denis.";
    // Said as heard, without its T: the nearest name, said so.
    for (const [quoi, lieu] of [["collège Émile Hugo", "Saint-Denis"], ["collège Emile Hugo", undefined], ["résultats au brevet du collège Émile Hugo", undefined]] as const) {
      const r = body(ecolesAnswer(quoi, lieu));
      expect(r.resume, quoi).toBe(`Aucun nom exact\u00a0; nom approchant, à une lettre près : ${hugot}`);
      expect(r.etablissements.map((e: { uai: string }) => e.uai), quoi).toEqual(["9741260B"]);
    }
    expect(body(ecolesAnswer("collège emile hugot", undefined)).resume).toBe(hugot);
    // Not in the commune asked: the island's, with its distance.
    const loin = body(ecolesAnswer("collège Émile Hugo", "Saint-Paul"));
    expect(loin.etablissements[0]).toMatchObject({ uai: "9741260B", commune: "Saint-Denis" });
    expect(loin.etablissements[0].distance_km).toBeGreaterThan(10);
    // In the commune asked, those of the commune alone.
    const pro = body(ecolesAnswer("lycée professionnel", "Saint-Paul"));
    expect(pro.etablissements.map((e: { nom: string }) => e.nom)).toEqual(["Lycée professionnel de Vue Belle"]);
    // Several of one name, each with its commune.
    expect(body(ecolesAnswer("école Leconte de Lisle", undefined)).resume).toMatch(/^3 établissements : École élémentaire publique Leconte de Lisle \(Saint-Paul\) ; /);
  });

  it("says a name none has, then lists as without it; the words of a question are no name", () => {
    const r = body(ecolesAnswer("collège Zzyzx", "Saint-Paul"));
    expect(r.nom).toBe("Aucun établissement dont le nom approche « zzyzx » : voici ceux du lieu.");
    expect(r.etablissements).toHaveLength(11);
    for (const [quoi, lieu] of [["collège le plus proche", "Saint-Paul"], ["école maternelle publique", "Saint-Denis"], ["collège de Sainte-Clotilde", "Sainte-Clotilde"], ["lycée avec internat", "Saint-Paul"], ["école fermée aujourd'hui", "Le Port"]] as const) {
      const q = body(ecolesAnswer(quoi, lieu));
      expect(q.nom, quoi).toBeUndefined();
      expect(q.resume, quoi).toMatch(/^\d+ établissements? (?:à|au) /);
    }
  });

  it("is one letter off at most, and exact for a short word", () => {
    const colleges = ecoles.LIST.filter((e) => e.type === "college");
    expect(byName(colleges, "Hugo").found.map((e) => e.uai)).toEqual(["9741260B"]);
    expect(byName(colleges, "Hugo").exact).toBe(false);
    // An exact name wins over one a letter off: the écoles Victor Hugo, not the collège Émile Hugot.
    const exact = byName(ecoles.LIST, "Hugo");
    expect([exact.exact, exact.found.length > 0, exact.found.every((e) => / Hugo(?: |$)/.test(e.nom))]).toEqual([true, true, true]);
    // Two letters off, or three letters: nothing.
    expect(byName(colleges, "Hugoxx").found).toEqual([]);
    expect(byName(colleges, "Ugo").found).toEqual([]);
    expect(byName(ecoles.LIST, "collège", ["Saint-Denis"]).words).toEqual([]);
  });

  it("takes a commune said whole in quoi as the place, without a place", () => {
    expect(communeIn("collège Saint-Denis")).toBe("Saint-Denis");
    expect(communeIn("collège Saint-Michel")).toBeUndefined();
    // « collège Saint-Denis »: the 15 collèges of Saint-Denis, no name looked for.
    const sd = body(ecolesAnswer("collège Saint-Denis", undefined));
    expect(sd.nom).toBeUndefined();
    expect(sd.resume).toMatch(/^15 établissements à Saint-Denis \(15 collèges\)\. /);
    expect(sd.etablissements).toHaveLength(15);
    // « collège Saint-Michel »: no commune of that name, so a name, found on the whole island.
    const sm = body(ecolesAnswer("collège Saint-Michel", undefined));
    expect(sm.lieu).toBeUndefined();
    expect(sm.etablissements.map((e: { uai: string }) => e.uai)).toEqual(["9740072K"]);
    // A name with its commune: the name, in that commune (the école Bellepierre, at Saint-Denis).
    const bp = body(ecolesAnswer("école Bellepierre Saint-Denis", undefined));
    expect(bp.resume).toMatch(/^École primaire publique Bellepierre \(Saint-Denis\), /);
    expect(bp.etablissements.map((e: { uai: string }) => e.uai)).toEqual(["9740583R"]);
  });

  it("gives a collège's IPS and brevet, a lycée's IPS and bac by voie, with the DEPP's note and sources", () => {
    const hugot = body(ecolesAnswer("collège Émile Hugo", undefined));
    // ips.json: 108.7, 106 candidates, 92 % with a valeur ajoutée of +2, so 90 % expected.
    expect(hugot.etablissements[0]).toMatchObject({
      uai: "9741260B",
      indice_position_sociale: { valeur: 108.7, rentree: 2025 },
      brevet: { session: 2025, serie: "générale", candidats: 106, taux_reussite: "92\u00a0%", taux_reussite_attendu: "90\u00a0%" },
    });
    expect(hugot.avertissements.at(-1)).toBe(
      "IPS et résultats\u00a0: DEPP, jeux des établissements publics et privés sous contrat\u00a0; aucun taux attendu sous 40 candidats (20 en voie professionnelle). rundata.re ne classe pas les établissements.",
    );
    expect(hugot.sources.map((s: { source: string }) => s.source)).toEqual([ecoles.SOURCE.nom, ips.SOURCE_IPS.nom, ips.SOURCE_VA.nom]);
    expect(hugot.sources[1].licence).toBe("Licence Ouverte 2.0");
    // Too few candidates: no expected rate, said why (the Medersa, 23 candidates; Jean Joly's voie professionnelle, 18 present).
    expect(body(ecolesAnswer("collège Medersa", undefined)).etablissements[0].brevet).toMatchObject({ candidats: 23, taux_reussite: "100\u00a0%", taux_reussite_attendu: "non calculé, trop peu de candidats" });
    const joly = body(ecolesAnswer("lycée Jean Joly", undefined)).etablissements[0];
    expect(joly.bac.voie_professionnelle).toEqual({ presents: 18, taux_reussite: "67\u00a0%", taux_reussite_attendu: "non calculé, trop peu de candidats", taux_acces_seconde_bac: "31\u00a0%", taux_acces_attendu: "non calculé, trop peu de candidats" });
    expect(joly.bac.voie_generale_et_technologique).toMatchObject({ presents: 274, taux_reussite: "89\u00a0%", taux_reussite_attendu: "95\u00a0%" });
  });

  it("gives nothing of the DEPP for an établissement its datasets leave out, nor ranks any", () => {
    const r = body(ecolesAnswer("collège Montessori", undefined));
    for (const e of r.etablissements) expect(Object.keys(e).filter((k) => /ips|brevet|bac|indice/.test(k)), e.nom).toEqual([]);
    expect(r.avertissements.join(" ")).not.toContain("DEPP");
    expect(r.sources).toHaveLength(1);
    // A commune's collèges stay by distance, whatever their figures; no word that ranks them.
    const sd = body(ecolesAnswer("collège", "Saint-Denis"));
    const km = sd.etablissements.map((e: { distance_km: number }) => e.distance_km);
    expect(km).toEqual([...km].sort((x: number, y: number) => x - y));
    expect(JSON.stringify(sd)).not.toMatch(/meilleur|moins bon|class(?:ement|é)|\brangs?\b/i);
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
    expect(html).toContain("5 écoles, 1 collège, publics et privés, avec la cantine, l&#39;internat ou l&#39;<abbr title=\"unité localisée pour l&#39;inclusion scolaire\">ULIS</abbr> quand l&#39;établissement les déclare.");
    expect(html).toContain('<h3>Écoles <span class="note">5</span></h3>');
    expect(html).toContain('<a href="tel:0262317075">02 62 31 70 75</a>');
    expect(html).toContain("l&#39;établissement le plus proche n&#39;est pas forcément celui du secteur");
    expect(html).toContain("Annuaire de l&#39;éducation du ministère de l&#39;Éducation nationale (Licence Ouverte Etalab 2.0)");
  });
});

describe("the collège of an address's sector (annuaire_services_publics, adresse)", () => {
  const ask = async (quoi: string, lieu: string | undefined, adresse: string) => body(await annuaireTool(new Cache(), quoi, lieu, NOW, adresse));
  // Read as the Worker reads its static assets: the commune's file, by its path.
  const lire = async (path: string) => JSON.parse(readFileSync(`public${path}`, "utf8"));
  beforeAll(() => carteScolaire.configure(lire));
  afterAll(() => carteScolaire.configure(undefined));

  it("gives the collège of a street, with the note that the collège or the Département confirms it and the link to /ecoles", async () => {
    const r = await ask("quel collège", "Le Port", "12 allée Pablo Neruda");
    expect(r.resume).toBe("Pour « ALLEE PABLO NERUDA » au Port, collège public de secteur : Collège Edmond Albius.");
    expect(r.college).toMatchObject({ nom: "Collège Edmond Albius", telephone: "02 62 43 06 02", uai: "9740548C" });
    expect(r.page).toBe("https://rundata.re/ecoles#college");
    expect(r.avertissements[0]).toContain("Le collège ou le Département confirme le secteur");
    expect(r.note).toBe("D'après la carte scolaire des collèges publics, mise à jour le 09/10/2026.");
    expect(r.sources[0].source).toBe("Carte scolaire des collèges publics");
  });

  it("picks the stretch by the number, and gives the collèges by number without it", async () => {
    const sans = await ask("collège", "Saint-Denis", "avenue Joseph Bédier");
    expect(sans.resume).toBe("La voie « AVENUE JOSEPH BEDIER », STE CLOTILDE à Saint-Denis dépend de plusieurs collèges selon le numéro : donner le numéro.");
    expect(sans.par_numero.map((x: { numeros: string }) => x.numeros)).toEqual(["du 1 au 42", "à partir du 43"]);
    expect(sans.colleges).toHaveLength(2);
    const avec = await ask("collège", "Saint-Denis", "50 av Joseph Bedier");
    expect(avec.college.nom).toBe(sans.par_numero[1].college);
    const cotes = await ask("collège", "Saint-Denis", "allée des Opales");
    expect(cotes.par_numero.map((x: { numeros: string }) => x.numeros)).toEqual(["tous les numéros (côté impair)", "tous les numéros (côté pair)"]);
  });

  it("gives each street's collège when several of that name depend on different ones", async () => {
    const r = await ask("collège", "Saint-Paul", "10 route Hubert Delisle");
    expect(r.resume).toContain("Plusieurs voies de ce nom à Saint-Paul");
    expect(r.voies.map((v: { voie: string }) => v.voie)).toEqual(["« ROUTE HUBERT DELISLE »", "« ROUTE HUBERT DELISLE », BELLEMENE", "« ROUTE HUBERT DELISLE », BOIS DE NEFLES ST PAUL", "« ROUTE HUBERT DELISLE », LA SALINE"]);
    for (const v of r.voies) expect(v.college).toMatch(/^Collège /);
  });

  it("gives a commune's one collège, and says what it cannot find", async () => {
    expect((await ask("collège", "Cilaos", "rue du Père Boiteau")).resume).toMatch(/^Un seul collège public pour toute la commune de Cilaos : Collège /);
    expect((await ask("collège", "Le Port", "12 rue Zzyzx")).resume).toBe("Voie introuvable dans la carte scolaire du Port : vérifier son nom, ou la chercher sur la page.");
    expect((await ask("collège", undefined, "12 allée Pablo Neruda")).resume).toContain("Donner la commune de l'adresse dans lieu");
    // A primary school: its sector is the mairie's, not published.
    const ecole = await ask("école maternelle", "Le Port", "12 allée Pablo Neruda");
    expect(ecole.resume).toContain("fixé par la mairie du Port");
    expect(ecole.page).toBe("https://rundata.re/communes/le-port#ecoles");
    // No address: the list of the commune's, as before.
    expect(body(await annuaireTool(new Cache(), "collège", "Le Port", NOW)).etablissements).toBeDefined();
  });

  it("says the file cannot be read, logging the commune alone, never the address", async () => {
    carteScolaire.configure(async () => {
      throw new TypeError("12 allée Pablo Neruda");
    });
    const logs = ["log", "info", "warn", "error", "debug"].map((k) => vi.spyOn(console, k as "log"));
    try {
      const r = await annuaireTool(new Cache(), "collège", "Le Port", NOW, "12 allée Pablo Neruda");
      expect(r.isError).toBe(true);
      expect(body(r).erreur).toContain("La carte scolaire du Port ne se lit pas");
      const logged = JSON.stringify(logs.flatMap((l) => l.mock.calls));
      expect(logged).toContain("carte scolaire du Port illisible");
      expect(logged).not.toMatch(/Neruda|allée/i);
    } finally {
      for (const l of logs) l.mockRestore();
      carteScolaire.configure(lire);
    }
  });

  it("never says back the number typed, nor the words as typed", async () => {
    const r = JSON.stringify(await ask("collège", "Le Port", "137 allée pablo neruda"));
    expect(r).not.toContain("137");
    expect(r).not.toContain("pablo neruda");
  });
});
