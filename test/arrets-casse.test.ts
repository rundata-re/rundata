import { describe, expect, it } from "vitest";
import network from "../src/transit/network.json" with { type: "json" };
import { normalize } from "../src/places/resolve.js";
import * as transit from "../src/providers/transit.js";
import { casseArret } from "../src/tools/casse.js";
import { departureRow, findStops, type Departure } from "../src/tools/transports.js";

// Estival writes most of its stop names in capitals (« GARE SAINT ANDRE »), Alternéo and CarSud many with a capital on
// every word (« Rue Des Amphiboles »): they are shown as people read them, no word added or removed, accents and
// hyphens only from the names of places and a closed list of words.
describe("a stop name in capitals, as people read it", () => {
  it("gives each word a capital, the small words none but at the head", () => {
    expect(casseArret("LES GLOXINIAS")).toBe("Les Gloxinias");
    expect(casseArret("RUE AUGUSTE BRUNET")).toBe("Rue Auguste Brunet");
    expect(casseArret("CHEMIN DES SŒURS")).toBe("Chemin des Sœurs");
    expect(casseArret("BOUTIQUE MARE A CITRONS")).toBe("Boutique Mare à Citrons");
    expect(casseArret("A LA CROISEE")).toBe("À la Croisee");
    expect(casseArret("CHATEAU D'EAU LES BAS")).toBe("Chateau d'Eau les Bas");
    expect(casseArret("P'TIT KIOSQUE")).toBe("P'tit Kiosque");
    expect(casseArret("RUISSEAU BLANC PAR VIGIE")).toBe("Ruisseau Blanc par Vigie");
  });

  it("takes accents and hyphens only from the names of places and its list of nouns", () => {
    expect(casseArret("GARE SAINT ANDRE")).toBe("Gare Saint-André");
    expect(casseArret("ECOLE BRAS PANON")).toBe("École Bras-Panon");
    expect(casseArret("LYCEE II")).toBe("Lycée II");
    // A word of neither list stays without accent; an abbreviation is not written out.
    expect(casseArret("CHEMIN DE L'ETANG")).toBe("Chemin de l'Etang");
    expect(casseArret("ST ANDRE MAIRIE")).toBe("St Andre Mairie");
    expect(casseArret("EC CLG STE GENEVIEVE")).toBe("Ec Clg Ste Genevieve");
    // The list's words, names of places among them that the resolver does not hold or writes without accent.
    expect(casseArret("PICHETTE PAR SAINTE-THERESE")).toBe("Pichette par Sainte-Thérèse");
    expect(casseArret("ROUTE DU MAIDO")).toBe("Route du Maïdo");
    expect(casseArret("DOS D'ANE")).toBe("Dos d'Âne");
    expect(casseArret("LA GLACIERE")).toBe("La Glacière");
    expect(casseArret("COLLEGE GASTON CROCHET")).toBe("Collège Gaston Crochet");
    expect(casseArret("POLE D'ECHANGE")).toBe("Pôle d'Échange");
    expect(casseArret("Pôle D'Echange Marché Couvert")).toBe("Pôle d'Échange Marché Couvert");
  });

  it("keeps the sigles of its list, the numbers and the single letters", () => {
    for (const n of ["ZAC N° 2", "Z.I. II", "55 CD 29", "CHD", "IUT"]) expect(casseArret(n)).toBe(n);
    // « A » with a point is an initial, alone at the end a letter, not « à ».
    expect(casseArret("CHEMIN A. HOARAU")).toBe("Chemin A. Hoarau");
    expect(casseArret("GARE ROUTIERE QUAI A")).toBe("Gare Routiere Quai A");
    expect(casseArret("CENTRE AFPAR")).toBe("Centre AFPAR");
    expect(casseArret("RUE DE LA ZAC")).toBe("Rue de la ZAC");
  });

  it("gives a name with a capital on every word its small words in lowercase, its other words as written", () => {
    expect(casseArret("Rue Des Amphiboles")).toBe("Rue des Amphiboles");
    expect(casseArret("Gare Routière Du Tampon Quai E")).toBe("Gare Routière du Tampon Quai E");
    expect(casseArret("Fruit A Pain Baril")).toBe("Fruit à Pain Baril");
    expect(casseArret("Chemin Ligne D'Equerre")).toBe("Chemin Ligne d'Equerre");
    // A place written as the resolver writes it, as in capitals.
    expect(casseArret("Gare De Saint Pierre")).toBe("Gare de Saint-Pierre");
    expect(casseArret("Gare De La Plaine Des Cafres Quai A")).toBe("Gare de La Plaine des Cafres Quai A");
    expect(casseArret("Dos D'âne (Poteau Vert)")).toBe("Dos d'Âne (Poteau Vert)");
    // The same accents as in capitals, and a word in capitals or with a point left as written.
    expect(casseArret("Ecole Primaire Du Grand Tampon")).toBe("École Primaire du Grand Tampon");
    expect(casseArret("PE.La Saline (Prisami)")).toBe("PE.La Saline (Prisami)");
    expect(casseArret("Cambaie Z.A.")).toBe("Cambaie Z.A.");
  });

  it("leaves a name with a word in lowercase as written", () => {
    expect(casseArret("Mairie de La Possession")).toBe("Mairie de La Possession");
    expect(casseArret("Allée des Palmiers")).toBe("Allée des Palmiers");
    expect(casseArret("Barachois")).toBe("Barachois");
  });

  it("changes no stop's words: the same once normalized, so its page and its search stay the same", () => {
    const names = (network.stops as unknown as [string, string][]).map(([, n]) => n);
    const changed = names.filter((n) => normalize(casseArret(n)) !== normalize(n));
    expect(changed).toEqual([]);
    expect(names.filter((n) => casseArret(n) !== n).length).toBeGreaterThan(1000);
  });

  it("is shown in the stops and their groups, and found whatever the case asked", () => {
    const shown = transit.GROUPS.filter((g) => g.reseau === "estival" && g.nom === "Gare Saint-André");
    expect(shown).toHaveLength(1);
    expect(transit.stop(shown[0].ids[0]).nom).toBe("Gare Saint-André");
    for (const asked of ["gare saint andre", "GARE SAINT ANDRE", "Gare Saint-André"]) {
      expect(findStops(asked).groups.map((g) => g.nom), asked).toContain("Gare Saint-André");
    }
  });

  it("writes a trip's direction and a line's long name the same way, its short name as the network writes it", async () => {
    // A pattern of Estival with its headsign in capitals, as its feed gives it.
    const net = transit.NETWORKS.estival;
    const all = async <T>() => [{ feed: net.feed, id: 0, route: 0, headsign: "PICHETTE PAR SAINTE-THERESE", trips: "[]" }] as T[];
    transit.configure({ all });
    try {
      const [pattern] = (await transit.patterns([net.first_pattern])).values();
      expect(pattern.headsign).toBe("Pichette par Sainte-Thérèse");
    } finally {
      transit.configure(undefined);
    }
    const route = transit.ROUTES.findIndex(([n, , long]) => n === "estival" && long === "CAMBOURG - GARE SAINT BENOIT");
    expect(route).toBeGreaterThanOrEqual(0);
    const row = departureRow({ route, headsign: "Gare Saint-Benoît", at: Date.UTC(2026, 10, 6, 6), in: 600 } as unknown as Departure);
    expect(row).toMatchObject({ ligne: transit.ROUTES[route][1], nom_ligne: "Cambourg - Gare Saint-Benoît", direction: "Gare Saint-Benoît" });
    // An abbreviation of the network is not written out.
    const gr = transit.ROUTES.findIndex(([n, , long]) => n === "estival" && long === "LE COLOSSE - GR SAINT-ANDRE");
    expect(departureRow({ route: gr, headsign: "x", at: 0, in: 0 } as unknown as Departure).nom_ligne).toBe("Le Colosse - Gr Saint-André");
  });
});
