import { describe, expect, it } from "vitest";
import { a, de, le } from "../src/articles.js";

const trois = (nom: string) => [a(nom), de(nom), le(nom)];

describe("the article before a place's name", () => {
  it("contracts the article a name carries, as before", () => {
    expect(trois("Le Tampon")).toEqual(["au Tampon", "du Tampon", "Le Tampon"]);
    expect(trois("Les Avirons")).toEqual(["aux Avirons", "des Avirons", "Les Avirons"]);
    expect(trois("La Possession")).toEqual(["à La Possession", "de La Possession", "La Possession"]);
    expect(trois("L'Étang-Salé")).toEqual(["à L'Étang-Salé", "de L'Étang-Salé", "L'Étang-Salé"]);
    expect(trois("Entre-Deux")).toEqual(["à l'Entre-Deux", "de l'Entre-Deux", "l'Entre-Deux"]);
    for (const [nom, au, du] of [["Le Guillaume", "au Guillaume", "du Guillaume"], ["Le Tévelave", "au Tévelave", "du Tévelave"], ["Le Brûlé", "au Brûlé", "du Brûlé"]]) {
      expect([a(nom), de(nom)]).toEqual([au, du]);
    }
  });

  it("adds none to a commune, a quartier, a village or a cirque", () => {
    for (const nom of ["Saint-Paul", "Grand Coude", "Bois de Nèfles", "Hell-Bourg", "Mafate", "Salazie", "Cilaos", "La Plaine-des-Palmistes"]) {
      expect(a(nom)).toBe(`à ${nom}`);
      expect(le(nom)).toBe(nom);
    }
    // A name a quartier and a ravine both bear: the quartier's.
    expect(a("Rivière des Roches")).toBe("à Rivière des Roches");
    // A name that starts with a vowel: « de » elided.
    expect(de("Îlet à Cordes")).toBe("d'Îlet à Cordes");
  });

  it("gives a natural place the article of its first word, its capital kept", () => {
    expect(trois("Piton des Neiges")).toEqual(["au Piton des Neiges", "du Piton des Neiges", "le Piton des Neiges"]);
    expect(trois("Piton de la Fournaise")).toEqual(["au Piton de la Fournaise", "du Piton de la Fournaise", "le Piton de la Fournaise"]);
    expect(trois("Pointe des Trois-Bassins")).toEqual(["à la Pointe des Trois-Bassins", "de la Pointe des Trois-Bassins", "la Pointe des Trois-Bassins"]);
    expect(trois("Anse des Cascades")).toEqual(["à l'Anse des Cascades", "de l'Anse des Cascades", "l'Anse des Cascades"]);
    expect(trois("Cap Méchant")).toEqual(["au Cap Méchant", "du Cap Méchant", "le Cap Méchant"]);
    expect(a("Bassin Bleu")).toBe("au Bassin Bleu");
    expect(a("Trou de Fer")).toBe("au Trou de Fer");
  });

  it("writes « plage », « baie », « port » and « aéroport » in lowercase after their article", () => {
    expect(trois("Plage de l'Ermitage-les-Bains")).toEqual(["à la plage de l'Ermitage-les-Bains", "de la plage de l'Ermitage-les-Bains", "la plage de l'Ermitage-les-Bains"]);
    expect(a("Baie de Saint-Paul")).toBe("à la baie de Saint-Paul");
  });

  it("follows the island's usage for the Maïdo and the Plaines that are not a commune", () => {
    expect(trois("Maïdo")).toEqual(["au Maïdo", "du Maïdo", "le Maïdo"]);
    for (const p of ["Plaine des Cafres", "Plaine des Makes", "Plaine des Grègues"]) expect(trois(p)).toEqual([`à la ${p}`, `de la ${p}`, `la ${p}`]);
    expect(a("La Plaine-des-Palmistes")).toBe("à La Plaine-des-Palmistes");
  });

  it("leaves a name it does not know as before", () => {
    expect(trois("Station inconnue")).toEqual(["à Station inconnue", "de Station inconnue", "Station inconnue"]);
  });
});
