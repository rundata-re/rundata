import { describe, expect, it } from "vitest";
import { Cache } from "../src/cache.js";
import { textOf } from "../src/providers/avis-eau.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import * as sd from "../src/vie/creches-saint-denis.js";
import { communePage } from "../src/web/commune.js";
import { crechesSection, enfantsCommunePage, enfantsPage } from "../src/web/enfants.js";
import { pageOf } from "../src/web/places.js";
import { CSS } from "../src/web/style.js";
import { lu, separateursEnFlex } from "./lecteur.js";

/**
 * The crèches of Saint-Denis, from the list its CCAS publishes (src/vie/creches-saint-denis.json,
 * scripts/build-creches-saint-denis.py): an extraction of July 2023, said with its date wherever it is shown.
 */
const O = "https://rundata.re";
const NOW = new Date("2026-11-24T06:00:00Z");
const plain = (s: string) => s.replace(/[  ]/g, " ");
const ask = async (quoi: string, lieu?: string) => JSON.parse(plain((await annuaireTool(new Cache(), quoi, lieu, NOW)).content[0].text));
const read = (html: string) => plain(textOf(html.replace(/</g, " <"))).replace(/&#39;/g, "'").replace(/\s+/g, " ");

describe("the crèches of Saint-Denis", () => {
  it("are those the CCAS listed open in July 2023, each with its position, never one in works or yet to open", () => {
    expect(sd.EXTRACTION).toBe("2023-07-11");
    expect(sd.LISTE_DU).toBe("liste du CCAS de Saint-Denis, juillet 2023");
    expect(sd.LISTE).toHaveLength(83);
    const names = sd.LISTE.map((c) => c.nom);
    // « Réhabilitation - Ouverture fin 1er semestre 2023 », « Ouverture prochaine », « Fermé pour réhabilitation ».
    for (const gone of ["Les Alamandas", "Case Marmailles", "Paul Demange (Réhabilitation)"]) expect(names).not.toContain(gone);
    for (const c of sd.LISTE) {
      expect(c.lon, c.nom).toBeGreaterThan(55.38);
      expect(c.lon, c.nom).toBeLessThan(55.56);
      expect(c.lat, c.nom).toBeGreaterThan(-20.98);
      expect(c.lat, c.nom).toBeLessThan(-20.86);
      expect(c.adresse, c.nom).not.toMatch(/\s{2}|\S- 97/);
    }
    // Two of one name, of two kinds, at one address: both kept.
    expect(sd.LISTE.filter((c) => c.nom === "Léonel Payet").map((c) => c.categorie).sort()).toEqual(["crèche collective", "multi-accueil"]);
  });

  it("say each one's kind, management, places, and the year it opened when the list gives it", () => {
    const of = (nom: string) => sd.detail(sd.LISTE.find((c) => c.nom === nom)!);
    expect(of("Le Manège Enchanté")).toBe("micro-crèche associative · 10 places");
    expect(of("Soeur Colette")).toBe("crèche collective municipale · 60 places");
    // « Multi-accueil » is masculine: its management agrees with it.
    expect(of("Canebie")).toBe("multi-accueil associatif · 15 places");
    expect(of("Les Tulipiers")).toBe("multi-accueil municipal · 44 places");
    expect(of("Les Onyx")).toBe("multi-accueil privé · 40 places");
    // « Ouvert - 20 Janvier 2023 ».
    expect(of("Beb'éveil 5")).toBe("micro-crèche privée · 12 places · ouverte en 2023");
    // « Ouvert » agrees with the kind too, as the management does; none of the multi-accueils opened in 2023.
    const multi = sd.LISTE.find((c) => c.nom === "Canebie")!;
    expect(sd.detail({ ...multi, ouvert_en: 2023 })).toBe("multi-accueil associatif · 15 places · ouvert en 2023");
    // A place of meeting has no places.
    expect(of("LAEP")).toBe("lieu d'accueil enfants-parents");
  });

  it("are given by annuaire_services_publics for a place of Saint-Denis, the nearest first, with the list's date and to check", async () => {
    const r = await ask("crèche", "Sainte-Clotilde");
    expect(r.liste_des_creches.a_dire).toBe("Crèches : liste du CCAS de Saint-Denis, juillet 2023, les établissements alors ouverts. Vérifiez l'accueil auprès de la crèche.");
    expect(r.a_savoir).toContain(r.liste_des_creches.a_dire);
    expect(r.liste_des_creches.nombre).toBe(83);
    expect(r.liste_des_creches.creches).toHaveLength(15);
    const km = r.liste_des_creches.creches.map((c: { distance_km: number }) => c.distance_km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(r.liste_des_creches.donnees).toContain("https://rundata.re/enfants/saint-denis#creches");
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(sd.SOURCE.nom);
    // The CAF's figures stay, as for any commune.
    expect(r.commune.nom).toBe("Saint-Denis");
  });

  it("are not given for another commune, whose crèches are named nowhere", async () => {
    for (const lieu of ["Saint-Paul", undefined]) {
      const r = await ask("crèche", lieu);
      expect(r.liste_des_creches, String(lieu)).toBeUndefined();
      expect(r.a_savoir.join(" "), String(lieu)).toContain("Aucune crèche n'est nommée ici, sauf à Saint-Denis");
    }
  });

  it("a crèche's name and its detail are two words for a screen reader, and the space between them moves nothing on screen", () => {
    const page = enfantsCommunePage(O, pageOf("saint-denis")!, null, NOW);
    const part = page.slice(page.indexOf('<section id="creches"'), page.indexOf("</section>", page.indexOf('<section id="creches"')));
    expect(lu(part, CSS)).toContain(`${sd.LISTE[0].nom} ${sd.detail(sd.LISTE[0])}`);
    expect(separateursEnFlex(part, CSS)).toEqual([]);
  }, 30_000);

  it("are on Saint-Denis's children's page, with the list's date and to check, and pointed to from the island's and the commune's pages", () => {
    const page = enfantsCommunePage(O, pageOf("saint-denis")!, null, NOW);
    const part = page.slice(page.indexOf('<section id="creches"'), page.indexOf("</section>", page.indexOf('<section id="creches"')));
    expect(read(part)).toContain("83 crèches, multi-accueils et lieux d'accueil des tout-petits, d'après la liste du CCAS de Saint-Denis, juillet 2023 : les établissements alors ouverts, avec leurs places. Vérifiez l'accueil auprès de la crèche.");
    expect(part.match(/<li>/g)).toHaveLength(83);
    expect(part.match(/class="aller"/g)).toHaveLength(83);
    expect(read(part)).toContain("Licence Ouverte : extraction de juillet 2023.");
    expect(enfantsCommunePage(O, pageOf("saint-paul")!, null, NOW)).not.toContain('id="creches"');
    expect(crechesSection()).toContain('href="/enfants/saint-denis#creches"');
    expect(enfantsPage(O, null, NOW)).toContain('href="/enfants/saint-denis#creches"');
    expect(communePage(O, pageOf("saint-denis")!, { place: null }, NOW)).toContain('href="/enfants/saint-denis#creches"');
  });
});
