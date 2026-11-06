import { describe, expect, it } from "vitest";
import network from "../src/transit/network.json" with { type: "json" };
import { normalize } from "../src/places/resolve.js";
import * as transit from "../src/providers/transit.js";
import { casseArret } from "../src/tools/casse.js";
import { departureRow, findStops, type Departure } from "../src/tools/transports.js";

// Estival writes most of its stop names in capitals (« GARE SAINT ANDRE »): they are shown as people read them, no
// word added or removed, accents and hyphens only from the names of places and a closed list of common nouns.
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
  });

  it("keeps the sigles of its list, the numbers and the single letters", () => {
    for (const n of ["ZAC N° 2", "Z.I. II", "55 CD 29", "CHD", "IUT"]) expect(casseArret(n)).toBe(n);
    expect(casseArret("CENTRE AFPAR")).toBe("Centre AFPAR");
    expect(casseArret("RUE DE LA ZAC")).toBe("Rue de la ZAC");
  });

  it("leaves a name with a lowercase letter as written", () => {
    expect(casseArret("Gare Routière Du Tampon")).toBe("Gare Routière Du Tampon");
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
      expect(pattern.headsign).toBe("Pichette par Sainte-Therese");
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
