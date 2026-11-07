import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { ETABLISSEMENTS, nearest } from "../src/sante/etablissements.js";
import { territoires, TERRITOIRES } from "../src/sante/garde.js";
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
    expect(page).toMatch(/<h3>Pharmacies<\/h3><p class="tv">\d+ <span class="mc">phar\u00adma\u00adcies<\/span><\/p>/);
    expect(page).toContain('<a href="https://www.3237.fr/" rel="noopener" aria-label="Pharmacie de garde : 3237.fr">Pharmacie de garde : <span class="adrweb">3237.<wbr>fr</span></a>');
  });
});

describe("the doctor on duty", () => {
  it("is asked in many words, never for a child's care nor a vet, and « médecin » alone stays the doctors' numbers", () => {
    for (const q of ["médecin de garde", "medecin de garde", "garde", "docteur de garde", "maison médicale de garde", "SOS médecin", "SOS Médecins", "médecin la nuit", "docteur ce soir", "médecin le dimanche", "permanence des soins", "dentiste de garde"]) expect(GARDE.test(q), q).toBe(true);
    for (const q of ["médecin", "médecin généraliste", "pédiatre", "garde d'enfants", "garde alternée", "vétérinaire de garde", "mairie", "urgences"]) expect(GARDE.test(q), q).toBe(false);
  });

  it("sends to the 15 before going anywhere, then gives the duty's hours and the place's territory (a whole commune)", () => {
    const r = body(gardeAnswer("médecin de garde", "Saint-Pierre"));
    expect(r.lieu).toBeDefined();
    expect(r.resume).toBe(
      "Médecin de garde : appelez le 15 avant de vous déplacer, comme le demande l'ARS La Réunion. Le médecin du 15 dit où consulter, ou envoie les secours. " +
        "La garde des médecins, la même dans toute l'île d'après l'arrêté n°82/ARS/2026 : tous les soirs de 19 h à 23 h\u00a0; le samedi de 12 h à 19 h\u00a0; les dimanches et jours fériés de 7 h à 19 h\u00a0; et les ponts que l'ARS fixe chaque année. " +
        "Saint-Pierre est dans le territoire de garde Sud Bas, où l'arrêté prévoit la maison médicale de garde hospitalière du CHU Sud. " +
        "La nuit, de 23 h à 7 h, une garde seulement là où des médecins sont volontaires : sinon, le 15 oriente vers les urgences du CHU site Sud (Saint-Pierre). " +
        "Urgence vitale : le 15 ou le 112. Pharmacie de garde : le site 3237.fr, ou le 32 37 (numéro payant : 0,35 € TTC la minute). En journée, pour une consultation sans rendez-vous : la carte des lieux de soins de Santé.fr, https://www.sante.fr/carte-des-lieux-de-soins.",
    );
    expect(r.territoires_de_garde).toEqual([
      {
        territoire: "Sud Bas",
        communes: ["Saint-Pierre", "Entre-Deux"],
        lieu_prevu_par_l_arrete: "la maison médicale de garde hospitalière du CHU Sud",
        nuit_profonde: "De 23 h à 7 h, une garde seulement là où des médecins sont volontaires\u00a0; sinon, le 15 oriente vers les urgences du CHU site Sud (Saint-Pierre).",
      },
    ]);
    expect(r.horaires_de_garde).toMatchObject({ soirs: "tous les soirs de 19 h à 23 h", samedi: "le samedi de 12 h à 19 h", dimanches_et_feries: "les dimanches et jours fériés de 7 h à 19 h" });
    expect(r.numeros).toEqual({ samu: "15", europeen: "112", sourds_et_malentendants: "114" });
    expect(r.pharmacie_de_garde.site).toBe("https://www.3237.fr/");
    expect(r.consultation_en_journee.carte).toBe("https://www.sante.fr/carte-des-lieux-de-soins");
    // The East's duty centre of FINESS in the North-East only.
    expect(r.maison_medicale_de_garde).toBeUndefined();
    expect(r.avertissements).toEqual([
      "rundata.re ne sait pas quel médecin est de garde : le tableau de garde n'est pas publié. Ne jamais désigner un médecin ni une pharmacie comme étant de garde.",
      "Les lieux de garde nommés par l'arrêté sont prévus : leur ouverture n'est pas vérifiée. Le 15 dit où aller.",
    ]);
    expect(r.sources[0]).toMatchObject({ source: expect.stringContaining("arrêté n°82/ARS/2026") });
    // No doctor's name, nothing of the repealed n°54 (Sunday from 8 h, the night until 8 h).
    expect(JSON.stringify(r)).not.toMatch(/\bDr\b|docteur [A-Z]|\b8 h\b|n°54/);
    expect(JSON.stringify(body(gardeAnswer("garde", "Nulle-Part-Ici")))).not.toContain("Médecin de garde");
  });

  it("gives both territories of Saint-Denis without a quarter, one with a quarter the arrêté lists", () => {
    const r = body(gardeAnswer("médecin de garde", "Saint-Denis"));
    expect(r.resume).toContain("Saint-Denis relève de deux territoires de garde selon le quartier : Nord 1 et Nord 2. La nuit, de 23 h à 7 h, une garde seulement là où des médecins sont volontaires : sinon, le 15 oriente vers les urgences du CHU site Nord (Saint-Denis).");
    expect(r.territoires_de_garde.map((t: { territoire: string }) => t.territoire)).toEqual(["Nord 1", "Nord 2"]);
    expect(r.territoires_de_garde[0].communes).toEqual(["Sainte-Marie", "Saint-Denis (Sainte-Clotilde, Moufia, Chaudron, Bois de Nèfles, La Bretagne, Domenjod)"]);
    expect(r.territoires_de_garde[1].lieu_prevu_par_l_arrete).toBe("la maison médicale de garde hospitalière du CHU Nord");
    for (const [lieu, t] of [["Moufia", "Nord 1"], ["Bellepierre", "Nord 2"], ["L'Éperon", "Ouest 1"], ["Saint-Gilles-les-Bains", "Ouest 2"]]) {
      expect(body(gardeAnswer("garde", lieu)).territoires_de_garde.map((x: { territoire: string }) => x.territoire), lieu).toEqual([t]);
    }
    // A quarter the arrêté does not list: both.
    expect(body(gardeAnswer("garde", "Les Camélias")).territoires_de_garde).toHaveLength(2);
  });

  it("invents no night hospital for Cilaos, and every commune has its territory", () => {
    const r = body(gardeAnswer("médecin de garde", "Cilaos"));
    expect(r.resume).toContain("Cilaos est à lui seul un territoire de garde. La nuit, de 23 h à 7 h : le 15 oriente.");
    expect(r.territoires_de_garde).toEqual([{ territoire: "Cilaos", communes: ["Cilaos"], nuit_profonde: "De 23 h à 7 h : le 15 oriente." }]);
    for (const c of Object.keys(INSEE)) expect(territoires(c, c).length, c).toBeGreaterThan(0);
    expect(TERRITOIRES).toHaveLength(12);
    const est = body(gardeAnswer("garde", "Saint-André"));
    expect(est.territoires_de_garde[0].territoire).toBe("Nord-Est");
    expect(est.maison_medicale_de_garde).toEqual({ nom: "Maison de soins de l'Est (maison médicale de garde)", adresse: "60 rue Dumesgnil d'Engente, 97440 Saint-André", a_savoir: "Appeler le 15 avant de s'y rendre. Ses horaires ne sont pas donnés ici." });
    expect(body(gardeAnswer("garde", "Saint-Benoît")).territoires_de_garde[0]).toMatchObject({ territoire: "Est", lieu_prevu_par_l_arrete: "le cabinet de garde du GHER" });
  });

  it("lists the places the arrêté plans without a place, and the paediatric SMUR for a child", () => {
    const r = body(gardeAnswer("garde", undefined));
    expect(r.lieu).toBeUndefined();
    expect(r.resume).toContain("Donner une commune pour son territoire de garde.");
    expect(r.lieux_prevus_par_l_arrete).toEqual([
      "la maison médicale de garde hospitalière du CHU Nord (Nord 2)",
      "le cabinet de garde du GHER (Est)",
      "la maison médicale de garde hospitalière du CHOR (Ouest 1)",
      "la maison médicale de garde hospitalière du CHU Sud (Sud Bas)",
    ]);
    expect(r.urgences_pediatriques).toBeUndefined();
    const smur = "SMUR pédiatrique régional (24 h/24, basé au CHU Nord), déclenché par le 15 : annoncé le 30/09/2026 par l'ARS et le CHU";
    expect(body(gardeAnswer("pédiatre de garde", "Le Port")).urgences_pediatriques.smur).toBe(smur);
    const u = body(urgencesAnswer("Saint-Pierre")).urgences_pediatriques;
    expect(u.smur).toBe(smur);
    expect(u.smur_source).toBe("https://www.lareunion.ars.sante.fr/system/files/2026-09/CP%20annonce%20SMUR%20p%C3%A9diatrique.pdf");
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

describe("the points of the health establishments", () => {
  it("are at their address, not at the commune's centre FINESS gives for some (Mont-Vert-les-Hauts, 04/11/2026)", () => {
    const chon = ETABLISSEMENTS.find((e) => e.nom === "Pharmacie Chon-Sen")!;
    // Mont-Vert-les-Hauts, not the centre of Saint-Pierre (55.47784, -21.3418).
    expect(chon.lon).toBeGreaterThan(55.53);
    expect(chon.lat).toBeGreaterThan(-21.33);
  });
});
