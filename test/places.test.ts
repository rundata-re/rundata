import { describe, expect, it } from "vitest";
import gazetteer from "../src/places/gazetteer.json" with { type: "json" };
import { offIsland, resolvePlace, wholeIsland } from "../src/places/resolve.js";
import { notFound, placeBlock, placeWarning } from "../src/tools/format.js";

const name = (q: string) => resolvePlace(q)?.lieu.nom;

describe("resolvePlace", () => {
  it.each([
    ["plage de l'Hermitage", "Plage de l'Ermitage-les-Bains"],
    ["Hermitage", "Plage de l'Ermitage-les-Bains"],
    ["cilaos", "Cilaos"],
    ["St Pierre", "Saint-Pierre"],
    ["plage de Saint-Pierre", "Plage de Saint-Pierre"],
    ["Saint-Gilles", "Saint-Gilles-les-Bains"],
    ["Boucan Canot", "Boucan-Canot"],
    ["plage de Boucan Canot", "Plage de Boucan-Canot"],
    ["le Maïdo", "Maïdo"],
    ["Mafate", "La Nouvelle"],
    ["volcan", "Pas de Bellecombe - Jacob"],
    ["Le Port", "Le Port"],
    ["Etang Salé", "L'Étang-Salé"],
    ["salazie", "Salazie"],
    ["Saint-Denis", "Saint-Denis"],
  ])("%s → %s", (q, expected) => {
    expect(name(q)).toBe(expected);
  });

  it.each([
    ["Gillot", "Aéroport de la Réunion Roland-Garros", "Sainte-Marie"],
    ["aéroport de Gillot", "Aéroport de la Réunion Roland-Garros", "Sainte-Marie"],
    ["aéroport Roland Garros", "Aéroport de la Réunion Roland-Garros", "Sainte-Marie"],
    ["l'aéroport Roland-Garros", "Aéroport de la Réunion Roland-Garros", "Sainte-Marie"],
    ["aéroport de Pierrefonds", "Aéroport de Saint-Pierre - Pierrefonds", "Saint-Pierre"],
    ["aeroport pierrefonds", "Aéroport de Saint-Pierre - Pierrefonds", "Saint-Pierre"],
  ])("the airport %s → %s (%s)", (q, expected, commune) => {
    const r = resolvePlace(q)!;
    expect(r.lieu.nom).toBe(expected);
    expect(r.lieu.commune).toBe(commune);
  });

  it("keeps Pierrefonds the place apart from its airport", () => {
    expect(name("Pierrefonds")).toBe("Pierrefonds");
  });

  it("tolerates typos", () => {
    expect(name("Cilaoss")).toBe("Cilaos");
    expect(name("Sainte Suzane")).toBe("Sainte-Suzanne");
  });

  it("accepts coordinates in either order", () => {
    const a = resolvePlace("-21.05, 55.22")!;
    expect(a.correspondance).toBe("coordonnees");
    expect(a.lieu.lat).toBeCloseTo(-21.05);
    expect(resolvePlace("55.22 -21.05")!.lieu.lon).toBeCloseTo(55.22);
  });

  it("rejects places outside Réunion and nonsense", () => {
    expect(resolvePlace("48.85, 2.35")).toBeNull();
    expect(resolvePlace("zzzzqqq")).toBeNull();
  });

  it("finds no place of the island for a place off it, which a word of an island's name would give otherwise", () => {
    // Before: Le Petit Paris, Camp de Marseille, Fond Maurice (Les Avirons), Saint-Pierre, Le Port, « échelles ».
    for (const q of ["Paris", "Marseille", "Maurice", "l'île Maurice", "Saint-Pierre et Miquelon", "Port-Louis, Maurice", "Les Seychelles", "Mayotte", "la Métropole"]) {
      expect(offIsland(q)).toBe(true);
      expect(resolvePlace(q)).toBeNull();
    }
    const r = JSON.parse(notFound("Maurice").content[0].text);
    expect(r.erreur).toBe("«\u00a0Maurice\u00a0» n'est pas à La Réunion\u00a0: ces données ne couvrent que La Réunion.");
    expect(JSON.parse(notFound("Tombouctou").content[0].text).erreur).toBe("Lieu introuvable à La Réunion : « Tombouctou ».");
    // The places of the island that bear those names stay found, alone or with their commune.
    expect(resolvePlace("Le Petit Paris")).toMatchObject({ lieu: { nom: "Le Petit Paris", commune: "Saint-Pierre" }, correspondance: "exacte" });
    expect(resolvePlace("Petit Paris, Saint-Pierre")).toMatchObject({ lieu: { nom: "Le Petit Paris" }, correspondance: "exacte" });
    expect(resolvePlace("Camp de Marseille")).toMatchObject({ lieu: { nom: "Camp de Marseille" }, correspondance: "exacte" });
    expect(resolvePlace("Fond Maurice")).toMatchObject({ lieu: { nom: "Fond Maurice", commune: "Les Avirons" }, correspondance: "exacte" });
    expect(resolvePlace("Saint-Pierre")).toMatchObject({ lieu: { nom: "Saint-Pierre" }, correspondance: "exacte" });
  });

  it("says, first, what a word that is only part of a name was taken for", () => {
    const r = resolvePlace("France")!;
    expect([r.lieu.nom, r.correspondance]).toEqual(["Petite France", "partielle"]);
    const said = "«\u00a0France\u00a0» compris comme Petite France (localite, Saint-Paul), dont le nom ne correspond qu'en partie\u00a0: le dire à l'utilisateur.";
    expect(placeWarning("France", r)).toBe(said);
    expect(Object.entries(placeBlock("France", r))[0]).toEqual(["avertissement", said]);
    expect(placeWarning("Bellecombe", resolvePlace("Bellecombe")!)).toMatch(/^«\u00a0Bellecombe\u00a0» compris comme Rempart de Bellecombe \(lieu_dit, Sainte-Rose\)/);
    // A name found whole, or found with words left aside (said by mots_ignores), gets no such warning.
    expect(placeWarning("Cilaos", resolvePlace("Cilaos")!)).toBeUndefined();
    expect(placeWarning("Square des Lilas, Saint-Pierre", resolvePlace("Square des Lilas, Saint-Pierre")!)).toBeUndefined();
    expect(placeBlock("Cilaos", resolvePlace("Cilaos")!).avertissement).toBeUndefined();
  });

  it("gives for a cirque or the volcan one place of it, said so, not as the place's own name", () => {
    for (const [q, nom] of [["Mafate", "La Nouvelle"], ["Cirque de Mafate", "La Nouvelle"], ["Volcan", "Pas de Bellecombe - Jacob"], ["Piton de la Fournaise", "Pas de Bellecombe - Jacob"]]) {
      const r = resolvePlace(q)!;
      expect([r.lieu.nom, r.correspondance, r.tient_lieu], q).toEqual([nom, "approchee", true]);
    }
    expect(placeWarning("Mafate", resolvePlace("Mafate")!)).toBe("«\u00a0Mafate\u00a0» compris comme La Nouvelle (quartier, La Possession), un lieu de ce secteur, pas tout le secteur\u00a0: le dire à l'utilisateur.");
    // Said with words around it, the same.
    expect(resolvePlace("volcan Sainte-Rose")).toMatchObject({ correspondance: "approchee", tient_lieu: true });
    // A cirque named by its commune is that commune; a spelling of a place's name stays that place.
    expect(resolvePlace("Cirque de Cilaos")).toMatchObject({ lieu: { nom: "Cilaos" }, correspondance: "exacte" });
    expect(resolvePlace("Plage de l'Hermitage")).toMatchObject({ lieu: { nom: "Plage de l'Ermitage-les-Bains" }, correspondance: "exacte" });
    expect(resolvePlace("La Nouvelle")!.tient_lieu).toBeUndefined();
  });

  it("knows the altitude, so that Cilaos is not treated as a seaside town", () => {
    expect(resolvePlace("Cilaos")!.lieu.altitude_m).toBeGreaterThan(1100);
  });

  it("knows the parc des Palmiers of Le Tampon, alone or with its commune, at its own altitude (IGN BD TOPO, RGE ALTI)", () => {
    for (const q of ["Parc des Palmiers", "Parc des Palmiers, Le Tampon"]) {
      const r = resolvePlace(q)!;
      expect([r.lieu.nom, r.lieu.commune, r.correspondance, r.autres]).toEqual(["Parc des Palmiers du Monde", "Le Tampon", "exacte", []]);
      expect([r.lieu.type, r.lieu.lon, r.lieu.lat, r.lieu.altitude_m]).toEqual(["parc", 55.49519, -21.25297, 576]);
    }
    // Its name as the BD TOPO writes it.
    expect(name("Parc des Palmiers du Monde")).toBe("Parc des Palmiers du Monde");
  });

  it("knows the named places of IGN's BD TOPO, each where it is, without one taking another's name", () => {
    const at = (q: string) => { const r = resolvePlace(q); return r && [r.lieu.nom, r.lieu.type, r.lieu.commune, r.correspondance]; };
    expect(at("Le Gol les Hauts")).toEqual(["Le Gol les Hauts", "quartier", "Saint-Louis", "exacte"]);
    expect(at("Jardin de l'État")).toEqual(["Jardin de l'État", "parc", "Saint-Denis", "exacte"]);
    // Names alike once their small words are out: the one written as asked, its article aside.
    expect(at("Plaine des Sables")).toEqual(["Plaine des Sables", "lieu_dit", "Sainte-Rose", "exacte"]);
    expect(at("Sainte-Clotilde")?.slice(1, 3)).toEqual(["quartier", "Saint-Denis"]);
    expect(at("Ravine des Cabris")).toEqual(["La Ravine des Cabris", "localite", "Saint-Pierre", "exacte"]);
    // Two places of a kind and a name: the one the BD TOPO ranks better known.
    expect(at("Trois-Mares")?.slice(0, 3)).toEqual(["Trois Mares", "quartier", "Le Tampon"]);
    expect(at("Vincendo")?.slice(0, 3)).toEqual(["Vincendo", "quartier", "Saint-Joseph"]);
    expect(at("Dimitile")?.slice(0, 2)).toEqual(["Le Dimitile", "sommet"]);
    // Every commune and every town of OSM is still itself.
    for (const p of gazetteer.places.filter((p) => p.type === "commune" || p.type === "localite")) {
      if (p.nom !== "L'Ermitage") expect([p.nom, resolvePlace(p.nom)!.lieu.nom]).toEqual([p.nom, p.nom]);
    }
  });

  it("gives a road a point of it, said so, and its usual names", () => {
    for (const q of ["Route du Littoral", "route littoral"]) expect(resolvePlace(q)).toMatchObject({ lieu: { nom: "Route du Littoral", type: "route", commune: "La Possession" }, correspondance: "exacte" });
    for (const q of ["RN1", "RN 1", "N1", "Route nationale 1"]) expect(resolvePlace(q)).toMatchObject({ lieu: { nom: "RN1", type: "route" }, correspondance: "exacte" });
    expect(resolvePlace("Route des Tamarins")!.lieu.type).toBe("route");
    const r = resolvePlace("Route du Littoral")!;
    expect(placeBlock("Route du Littoral", r).route).toBe("Une route\u00a0: la réponse vaut pour un point de son tracé, à La Possession, pas pour toute sa longueur.");
    expect(placeBlock("Cilaos", resolvePlace("Cilaos")!).route).toBeUndefined();
  });

  it("finds no place in words that name a kind of place, nor in the island itself", () => {
    for (const q of ["route forestière", "parc", "près de l'école", "Stade", "4 bis chemin Qwrt Zzyzx", "Zzyzx, 15 allée des Qwrt"]) expect(resolvePlace(q)).toBeNull();
    // A dash lists places, rather than making one name of them (« La Plaine du Bois de Nèfles » is in Saint-Louis).
    expect(resolvePlace("La Plaine – Bois-de-Nèfles")!.lieu).toMatchObject({ nom: "Bois de Nèfles", commune: "Saint-Paul" });
    expect(["La Réunion", "l'île de la Réunion", "974", "Saint-Denis", ""].map(wholeIsland)).toEqual([true, true, true, false, false]);
  });

  it("says the words it left aside when it keeps the commune named beside a place it does not know", () => {
    const r = resolvePlace("Square des Lilas, Saint-Pierre")!;
    expect([r.lieu.nom, r.correspondance, r.ignores]).toEqual(["Saint-Pierre", "partielle", ["square", "lilas"]]);
    expect(placeBlock("Square des Lilas, Saint-Pierre", r).mots_ignores).toBe("«\u00a0square lilas\u00a0» laissé de côté\u00a0: la réponse vaut pour Saint-Pierre.");
    // A place said with its commune is that place, nothing left aside.
    expect(resolvePlace("Saint-Gilles, Saint-Paul")).toMatchObject({ lieu: { nom: "Saint-Gilles-les-Bains" }, correspondance: "exacte" });
    expect(resolvePlace("Saint-Gilles, Saint-Paul")!.ignores).toBeUndefined();
    // A name alone that no place has stays unknown, rather than given a commune.
    expect(resolvePlace("Square des Lilas")).toBeNull();
  });
});
