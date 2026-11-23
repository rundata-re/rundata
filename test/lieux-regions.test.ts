import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/places/resolve.js";
import { REGIONS, regionOf } from "../src/places/regions.js";
import { ZONE_OF_COMMUNE, ZONES } from "../src/providers/vigilance.js";
import { placeBlock, placeWarning } from "../src/tools/format.js";

// The parts of the island asked as places, and names of places people use that the gazetteer did not find (23/11/2026).
const found = (q: string) => {
  const r = resolvePlace(q);
  return r && `${r.lieu.nom} (${r.lieu.commune})`;
};

describe("a part of the island asked as a place", () => {
  it("is its chief town, said a stand-in for the part, not a lieu-dit whose name holds the word", () => {
    for (const [q, commune] of [
      ["le Nord", "Saint-Denis"], ["Nord", "Saint-Denis"], ["le sud", "Saint-Pierre"], ["Sud", "Saint-Pierre"], ["la région Sud", "Saint-Pierre"],
      ["le sud de l'île", "Saint-Pierre"], ["l'Est", "Saint-Benoît"], ["côte est", "Saint-Benoît"], ["l'Ouest", "Saint-Paul"], ["côte ouest", "Saint-Paul"],
      ["dans l'ouest", "Saint-Paul"], ["le Sud sauvage", "Saint-Joseph"], ["le sud-est", "Saint-Joseph"],
    ] as const) {
      const r = resolvePlace(q)!;
      expect([r.lieu.nom, r.lieu.type, r.correspondance, r.tient_lieu], q).toEqual([commune, "commune", "approchee", true]);
    }
    const w = placeWarning("le Sud", resolvePlace("le Sud")!);
    expect(w).toBe("« le Sud » est une partie de l'île, pas un lieu : réponse pour Saint-Pierre, sa ville principale. Le Sud compte Saint-Pierre, Le Tampon, Entre-Deux, Saint-Louis, Cilaos, L'Étang-Salé, Les Avirons, Petite-Île (zone Sud de la vigilance de Météo-France). Le dire à l'utilisateur et lui proposer de donner sa commune.");
    expect(placeBlock("le Sud", resolvePlace("le Sud")!).avertissement).toBe(w);
  });

  it("is Météo-France's zone of the same name, its communes those of the zone, its town in it", () => {
    for (const r of Object.values(REGIONS)) {
      const zone = ZONE_OF_COMMUNE[r.pour]!;
      expect(ZONES[zone]!.split(" :")[0], r.nom).toBe(r.zone);
      expect(Object.entries(ZONE_OF_COMMUNE).filter(([, z]) => z === zone).map(([c]) => c).sort(), r.nom).toEqual([...r.communes].sort());
    }
  });

  it("leaves the places that bear the word, asked by their name, and the parts that are no zone", () => {
    expect(found("Îlet Sud")).toBe("Îlet Sud (La Possession)");
    expect(found("Port Réunion Ouest")).toBe("Port Réunion Ouest (Le Port)");
    expect(found("Rivière de l'Est")).toMatch(/^(?:La )?Rivière de l'Est/);
    expect(regionOf("Saint-Pierre")).toBeUndefined();
    expect(regionOf("Est-ce qu'il pleut")).toBeUndefined();
    for (const q of ["les Hauts", "dans les hauts", "les cirques"]) expect(resolvePlace(q), q).toBeNull();
    expect(found("Lambert les Hauts")).toBe("Lambert les Hauts (L'Étang-Salé)");
  });
});

describe("names people use", () => {
  it("finds the valley of Takamaka, the quartier of Saint-Philippe said beside it", () => {
    const r = resolvePlace("Takamaka")!;
    expect([r.lieu.nom, r.lieu.commune, r.correspondance]).toEqual(["Village de Takamaka", "Saint-Benoît", "exacte"]);
    expect(r.autres.map((a) => `${a.nom} (${a.commune})`)).toEqual(["Takamaka (Saint-Philippe)"]);
    expect(placeWarning("Takamaka", r)).toContain("Takamaka (quartier, Saint-Philippe)");
    expect(found("barrage de Takamaka")).toBe("Village de Takamaka (Saint-Benoît)");
  });

  it("finds the Plaine d'Affouches, the kilometres of Le Tampon, the NRL, Patate à Durand and a postcode", () => {
    expect(found("Plaine d'Affouches")).toBe("Les Affouches (Saint-Denis)");
    expect(found("le 14e km")).toBe("Le Quatorzième (Le Tampon)");
    expect(found("23e km")).toBe("Le Vingt-Troisième (Le Tampon)");
    expect(found("NRL")).toBe("Nouvelle Route du Littoral (Saint-Denis)");
    expect(found("Patate à Durand")).toBe("Ravine des Patates à Durand (Saint-Denis)");
    expect(found("97430")).toBe("Le Tampon (Le Tampon)");
    expect(found("97411")).toBe("Saint-Paul (Saint-Paul)");
    expect(resolvePlace("97499")).toBeNull();
  });
});
