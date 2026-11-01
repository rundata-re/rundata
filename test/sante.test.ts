import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { ETABLISSEMENTS, nearest } from "../src/sante/etablissements.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { EMERGENCY, GARDE, gardeAnswer, PHARMACY, pharmaciesAnswer, urgencesAnswer } from "../src/tools/sante.js";
import { communePage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";
import { Cache } from "../src/cache.js";

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("the pharmacies and hospitals of FINESS", () => {
  it("are bundled for the whole island, each in a commune and on the island", () => {
    const n = (t: string) => ETABLISSEMENTS.filter((e) => e.type === t).length;
    expect(n("pharmacie")).toBeGreaterThan(200);
    expect(n("hopital")).toBeGreaterThanOrEqual(6);
    for (const e of ETABLISSEMENTS) {
      expect(Object.keys(INSEE), e.nom).toContain(e.commune);
      expect(e.lon).toBeGreaterThan(55.2);
      expect(e.lon).toBeLessThan(55.85);
      expect(e.lat).toBeGreaterThan(-21.4);
      expect(e.lat).toBeLessThan(-20.85);
    }
    // No psychiatric site or hospital pharmacy among the hospitals.
    expect(ETABLISSEMENTS.filter((e) => e.type !== "pharmacie").map((e) => e.nom).join(" ")).not.toMatch(/PSY|PUI/);
    // The CHU's northern site, where its coordinates put it (Bellepierre, Saint-Denis).
    const nord = ETABLISSEMENTS.find((e) => e.finess === "970400024")!;
    expect(nord.commune).toBe("Saint-Denis");
    expect(Math.abs(nord.lon - 55.444) + Math.abs(nord.lat + 20.899)).toBeLessThan(0.01);
  });

  it("give the nearest pharmacies, and the duty one only as the ARS says to find it", () => {
    const r = body(pharmaciesAnswer("Boucan Canot"));
    expect(r.resume).toMatch(/^Pharmacie de garde \(la nuit, le dimanche et les jours fériés\) : le site 3237\.fr, ou le 32 37 \(numéro payant : 0,35 € TTC la minute\), d'après l'ARS La Réunion\. Les pharmacies les plus proches de Boucan-Canot : /);
    expect(r.pharmacies).toHaveLength(5);
    expect(r.pharmacies[0].distance_km).toBeLessThan(3);
    expect(r.pharmacie_de_garde.a_savoir.join(" ")).toMatch(/ordonnance et de la carte Vitale.*sonnette/);
    expect(r.pharmacie_de_garde.source).toBe("https://www.lareunion.ars.sante.fr/trouver-la-pharmacie-de-garde-la-plus-proche-0");
    expect(r.avertissements[0]).toMatch(/ne sait pas quelle pharmacie est de garde/);
    expect(r.sources.map((s: { source: string }) => s.source)).toEqual(expect.arrayContaining([expect.stringMatching(/^FINESS/), expect.stringMatching(/ARS La Réunion/)]));
    // Without a place: where to find the duty pharmacy, and nothing listed.
    const island = body(pharmaciesAnswer(undefined));
    expect(island.pharmacies).toBeUndefined();
    expect(island.resume).toMatch(/Donner un lieu/);
  });

  it("send to the 15 first, then name the nearest hospitals without saying they have an emergency department", () => {
    const r = body(urgencesAnswer("Cilaos"));
    expect(r.resume).toMatch(/^Urgence : appeler le 15 \(SAMU\) ou le 112\. Ne pas se rendre aux urgences sans avoir appelé le 15/);
    expect(r.etablissements[0].nom).toBe("CHU Site Sud (Cilaos)");
    expect(r.numeros).toEqual({ samu: "15", europeen: "112", pompiers: "18", sourds_et_malentendants: "114" });
    expect(r.urgences_pediatriques.sites).toHaveLength(3);
    expect(r.avertissements[0]).toMatch(/FINESS ne dit pas quels établissements ont un service d'urgences/);
    expect(nearest(55.45, -20.9, ["hopital"], 1)[0].commune).toBe("Saint-Denis");
  });

  it("are what the public services tool answers about them", async () => {
    expect(body(await annuaireTool(new Cache(), "pharmacie de garde", "Saint-Leu")).pharmacie_de_garde.site).toBe("https://www.3237.fr/");
    expect(body(await annuaireTool(new Cache(), "urgences", "Saint-Pierre")).numeros.samu).toBe("15");
    for (const q of ["pharmacie", "pharmacie de garde", "médicaments"]) expect(PHARMACY.test(q), q).toBe(true);
    for (const q of ["urgences", "hôpital", "hopital", "clinique", "CHU", "SAMU"]) expect(EMERGENCY.test(q), q).toBe(true);
    for (const q of ["mairie", "CAF", "CPAM", "impôts", "France Travail", "tribunal"]) expect(PHARMACY.test(q) || EMERGENCY.test(q), q).toBe(false);
  });

  it("are counted on each commune's page, with where to find the duty pharmacy", () => {
    const page = communePage("https://rundata.re", pageOf("saint-leu")!, { place: null });
    expect(page).toMatch(/<h3>Pharmacies<\/h3><p class="tv">\d+ pharmacies<\/p>/);
    expect(page).toContain('<a href="https://www.3237.fr/" rel="noopener">Pharmacie de garde : 3237.fr</a>');
  });
});

describe("the doctor on duty", () => {
  it("is asked in many words, never for a child's care nor a vet, and « médecin » alone stays the doctors' numbers", () => {
    for (const q of ["médecin de garde", "medecin de garde", "garde", "docteur de garde", "maison médicale de garde", "SOS médecin", "SOS Médecins", "médecin la nuit", "docteur ce soir", "médecin le dimanche", "permanence des soins", "dentiste de garde"]) expect(GARDE.test(q), q).toBe(true);
    for (const q of ["médecin", "médecin généraliste", "pédiatre", "garde d'enfants", "garde alternée", "vétérinaire de garde", "mairie", "urgences"]) expect(GARDE.test(q), q).toBe(false);
  });

  it("sends to the 15 before going anywhere, the 32 37 for the duty pharmacy, Santé.fr's map in the daytime", () => {
    const r = body(gardeAnswer("Saint-Pierre"));
    expect(r.lieu).toBeDefined();
    expect(r.resume).toBe(
      "Médecin de garde : appelez le 15 avant de vous déplacer, comme le demande l'ARS La Réunion. Le médecin du 15 dit où consulter, ou envoie les secours. Urgence vitale : le 15 ou le 112. Pharmacie de garde : le site 3237.fr, ou le 32 37 (numéro payant : 0,35 € TTC la minute). En journée, pour une consultation sans rendez-vous : la carte des lieux de soins de Santé.fr, https://www.sante.fr/carte-des-lieux-de-soins.",
    );
    expect(r.numeros).toEqual({ samu: "15", europeen: "112", sourds_et_malentendants: "114" });
    expect(r.pharmacie_de_garde.site).toBe("https://www.3237.fr/");
    expect(r.consultation_en_journee.carte).toBe("https://www.sante.fr/carte-des-lieux-de-soins");
    expect(r.maison_medicale_de_garde).toEqual({ nom: "Maison de soins de l'Est (maison médicale de garde)", adresse: "60 rue Dumesgnil d'Engente, 97440 Saint-André", a_savoir: "Appeler le 15 avant de s'y rendre. Ses horaires ne sont pas donnés ici." });
    expect(r.avertissements[0]).toMatch(/ne sait pas quel médecin est de garde/);
    // No hour of the duty, no doctor's name, until the ARS's text of 2026 is read.
    expect(JSON.stringify(r)).not.toMatch(/\b\d{1,2} ?h(?:\b|\d)|\bDr\b|docteur [A-Z]/);
    expect(body(gardeAnswer(undefined)).lieu).toBeUndefined();
    expect(JSON.stringify(body(gardeAnswer("Nulle-Part-Ici")))).not.toContain("Médecin de garde");
  });

  it("is what the public services tool answers, where it used to find no public service", async () => {
    for (const q of ["médecin de garde", "maison médicale de garde", "SOS médecins", "garde"]) {
      expect(body(await annuaireTool(new Cache(), q, "Saint-Pierre")).resume, q).toMatch(/^Médecin de garde : appelez le 15 avant de vous déplacer/);
    }
    expect(body(await annuaireTool(new Cache(), "pharmacie de garde", "Saint-Pierre")).resume).toMatch(/^Pharmacie de garde .*3237\.fr/);
    expect(body(await annuaireTool(new Cache(), "urgences", "Saint-Pierre")).resume).toMatch(/^Urgence : appeler le 15/);
    expect(body(await annuaireTool(new Cache(), "médecin", "Saint-Pierre")).resume).toMatch(/médecins généralistes et \d+ médecins spécialistes libéraux à Saint-Pierre/);
  });
});
