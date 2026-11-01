import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/places/resolve.js";
import { placeBlock } from "../src/tools/format.js";

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

  it("knows the altitude, so that Cilaos is not treated as a seaside town", () => {
    expect(resolvePlace("Cilaos")!.lieu.altitude_m).toBeGreaterThan(1100);
  });

  it("knows the parc des Palmiers of Le Tampon, alone or with its commune, at its own altitude (IGN BD TOPO, RGE ALTI)", () => {
    for (const q of ["Parc des Palmiers", "Parc des Palmiers, Le Tampon"]) {
      const r = resolvePlace(q)!;
      expect([r.lieu.nom, r.lieu.commune, r.correspondance, r.autres]).toEqual(["Parc des Palmiers du Monde", "Le Tampon", "exacte", []]);
      expect([r.lieu.lon, r.lieu.lat, r.lieu.altitude_m]).toEqual([55.49519, -21.25297, 577]);
    }
    // Its name as the BD TOPO writes it.
    expect(name("Parc des Palmiers du Monde")).toBe("Parc des Palmiers du Monde");
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
