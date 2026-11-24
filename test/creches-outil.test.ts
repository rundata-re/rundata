import { describe, expect, it } from "vitest";
import { Cache } from "../src/cache.js";
import { annuaireTool, branche } from "../src/tools/annuaire.js";
import { textOf } from "../src/providers/avis-eau.js";
import * as creches from "../src/vie/creches.js";
import { communePage } from "../src/web/commune.js";
import { crechesSection } from "../src/web/enfants.js";
import { esc } from "../src/web/map.js";
import { pageOf } from "../src/web/places.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-24T06:00:00Z");
/** A text without its no-break spaces, to compare the tool's words with the page's whatever spaces each one writes. */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const ask = async (quoi: string, lieu?: string) => {
  const r = await annuaireTool(new Cache(), quoi, lieu, NOW);
  return { ...JSON.parse(plain(r.content[0].text)), isError: (r as { isError?: boolean }).isError };
};
/**
 * What a person reads of a piece of page (textOf, the site's own reader of a page's text), a space between two cells;
 * an apostrophe stays as the page wrote it: escaped in the table of /enfants (looked for with esc), plain in a commune's tile.
 */
const read = (html: string) => plain(textOf(html.replace(/</g, " <"))).replace(/\s+/g, " ");

describe("the places in crèche, asked to annuaire_services_publics", () => {
  it("are what a question about crèches or childcare gets, and no other question", () => {
    for (const quoi of ["crèche", "creches", "places en crèche", "Crèche municipale", "mode de garde", "garde d'enfants", "halte-garderie", "multi-accueil"]) {
      expect(branche(quoi), quoi).toBe("creches");
    }
    // The neighbours keep their own answers.
    expect(branche("médecin de garde")).toBe("garde");
    expect(branche("pharmacie de garde")).toBe("pharmacies");
    expect(branche("aire de jeux")).toBe("enfants");
    expect(branche("où aller avec les enfants")).toBe("enfants");
    expect(branche("école maternelle")).toBe("ecoles");
    // An « assistante maternelle » keeps the offices of the annuaire: the answer on crèches lists none.
    expect(branche("assistante maternelle")).toBe("annuaire");
    expect(branche("nounou")).toBe("annuaire");
    expect(branche("mairie")).toBe("annuaire");
  });

  it("give a commune its own figures, the CAF's, in the words of its page", async () => {
    const r = await ask("crèche", "Saint-Paul");
    expect(r.isError).toBeFalsy();
    expect(r.commune).toEqual({ nom: "Saint-Paul", en_creche_pour_100_enfants: 21.6, tous_modes_pour_100_enfants: 43.3, places_en_creche: 815 });
    expect(r.resume).toBe("Saint-Paul : 21,6 places en crèche pour 100 enfants de moins de 3 ans · 43,3 pour 100 en comptant les assistantes maternelles, la garde à domicile et l'école · 815 places en crèche · offre théorique fin 2023, d'après la CAF. Ce sont des places d'accueil, pas des places libres aujourd'hui.");
    // The tile of the commune's page says the same figures in the same words.
    const tile = read(communePage(O, pageOf("saint-paul")!, { place: null }, NOW));
    expect(tile).toContain("21,6 places");
    expect(tile).toContain("en crèche pour 100 enfants de moins de 3 ans · 43,3 pour 100 en comptant les assistantes maternelles, la garde à domicile et l'école · 815 places en crèche · offre théorique fin 2023, d'après la CAF");
    // The island beside it, the page that shows the table, the day the CAF published, its source.
    expect(r.ile).toEqual({ en_creche_pour_100_enfants: 22, tous_modes_pour_100_enfants: 38.5, places_en_creche: 8150 });
    expect(r.page).toBe(`${O}/enfants#creches`);
    expect(r.annee).toBe(2023);
    expect(r.publie_le).toBe("22/01/2026");
    expect(r.sources).toEqual([expect.objectContaining({ attribution: "Cnaf, data.caf.fr", licence: "Licence Ouverte Etalab 2.0" })]);
    // A place of the commune: its commune's figures.
    expect((await ask("crèche", "Saint-Gilles-les-Bains")).commune.nom).toBe("Saint-Paul");
  });

  it("never gives a commune under 10 000 inhabitants its intercommunalité's figure as its own", async () => {
    const r = await ask("places en crèche", "Cilaos");
    expect(r.commune).toBeUndefined();
    expect(r.resume).toBe("Pas de chiffre pour Cilaos : la CAF ne le donne que pour les communes de plus de 10 000 habitants. Pour la CIVIS, ses 6 communes ensemble : 19,2 places en crèche pour 100 enfants de moins de 3 ans · offre théorique fin 2023, d'après la CAF. Ce sont des places d'accueil, pas des places libres aujourd'hui.");
    expect(r.intercommunalite).toMatchObject({ nom: "la CIVIS", en_creche_pour_100_enfants: 19.2, tous_modes_pour_100_enfants: 39.8, places_en_creche: 1458 });
    expect(r.intercommunalite.communes).toHaveLength(6);
    expect(r.intercommunalite.communes).toContain("Cilaos");
    // As its page says it.
    const tile = read(communePage(O, pageOf("cilaos")!, { place: null }, NOW));
    expect(tile).toContain("Pas de chiffre pour la commune");
    expect(tile).toContain("la CAF ne le donne que pour les communes de plus de 10 000 habitants · pour la CIVIS, ses 6 communes ensemble : 19,2 places en crèche pour 100 enfants de moins de 3 ans · offre théorique fin 2023, d'après la CAF");
    // The 7 communes without a figure, every one of them.
    for (const nom of creches.sansChiffre()) expect((await ask("crèche", nom)).commune, nom).toBeUndefined();
    expect(creches.sansChiffre()).toHaveLength(7);
  });

  it("without a place, gives the island, each commune that has a figure and each intercommunalité, as the table of /enfants", async () => {
    const r = await ask("crèches");
    expect(r.resume).toBe("La Réunion : 22,0 places en crèche pour 100 enfants de moins de 3 ans · 38,5 pour 100 en comptant les assistantes maternelles, la garde à domicile et l'école · 8 150 places en crèche · offre théorique fin 2023, d'après la CAF. Ce sont des places d'accueil, pas des places libres aujourd'hui.");
    expect(r.communes).toHaveLength(17);
    expect(r.intercommunalites.map((e: { nom: string }) => e.nom)).toEqual(["la CINOR", "la CIREST", "le TCO", "la CIVIS", "la CASUD"]);
    expect(r.sans_chiffre).toEqual(creches.sansChiffre());
    // Row by row, the figures of the page's table.
    const table = read(crechesSection());
    const fr = (n: number) => n.toFixed(1).replace(".", ",");
    for (const c of r.communes) expect(table, c.nom).toContain(`${esc(c.nom)} ${fr(c.en_creche_pour_100_enfants)} ${fr(c.tous_modes_pour_100_enfants)} ${plain(c.places_en_creche.toLocaleString("fr-FR"))}`);
    expect(table).toContain("La Réunion 22,0 38,5 8 150");
    expect(r.communes.find((c: { nom: string }) => c.nom === "Saint-Paul")).toEqual({ nom: "Saint-Paul", en_creche_pour_100_enfants: 21.6, tous_modes_pour_100_enfants: 43.3, places_en_creche: 815 });
  });

  it("says what the figures are not, and where to find a crèche: never a crèche's name, never a free place", async () => {
    const SAID = "Ce sont des places d'accueil, pas des places libres aujourd'hui.";
    for (const lieu of ["Saint-Paul", "Cilaos", undefined]) {
      const r = await ask("crèche", lieu);
      expect(r.a_savoir.join(" "), String(lieu)).toContain("La CAF ne donne le chiffre d'une commune qu'au-dessus de 10 000 habitants");
      expect(r.a_savoir.join(" "), String(lieu)).toContain("Pour trouver une crèche et ses places : monenfant.fr, de la CAF");
      expect(r.trouver_une_creche, String(lieu)).toBe("https://monenfant.fr");
      // The only free places named are the ones the figures are not, in the words of /enfants.
      expect(r.a_savoir, String(lieu)).toContain(SAID);
      expect(r.resume.endsWith(SAID), String(lieu)).toBe(true);
      expect(JSON.stringify(r).split(SAID).join(""), String(lieu)).not.toMatch(/places? libres?|disponibles? (?:aujourd|en ce moment)/i);
    }
    expect(read(crechesSection())).toContain(esc(`C'est une offre théorique : ${SAID[0].toLowerCase()}${SAID.slice(1)}`));
    expect(read(crechesSection())).toMatch(/Pour trouver une crèche et ses places : monenfant\. ?fr ?, de la CAF\./);
  });

  it("says a place it does not know, and leaves the places to go with children as they were", async () => {
    expect((await ask("crèche", "Zzyzx")).isError).toBe(true);
    const lieux = await ask("aire de jeux", "Saint-Paul");
    expect(lieux.lieux.length).toBeGreaterThan(3);
    expect(lieux.commune).toBeUndefined();
    // Their note now says where the crèches' figures are.
    expect(lieux.avertissements.join(" ")).toContain("quoi = « crèche »");
  });
});
