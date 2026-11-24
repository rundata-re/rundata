import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/places/resolve.js";

// Names of places people use that the gazetteer did not find, and « la Plaine », which in La Réunion is as often the
// Plaine des Cafres or the Plaine des Palmistes as the quartier of Saint-Paul (24/11/2026, after #1306).
const where = (q: string) => {
  const r = resolvePlace(q);
  return r && { lieu: `${r.lieu.nom} (${r.lieu.commune})`, autres: r.autres.map((p) => `${p.nom} (${p.commune})`) };
};

describe("« la Plaine »", () => {
  it("names the two plains of the Hauts among its others", () => {
    for (const q of ["la Plaine", "Plaine", "La Plaine"]) {
      const r = where(q)!;
      expect(r.autres, q).toContain("La Plaine des Cafres (Le Tampon)");
      expect(r.autres, q).toContain("La Plaine-des-Palmistes (La Plaine-des-Palmistes)");
      expect(r.autres.length, q).toBeLessThanOrEqual(3);
    }
  });

  it("leaves a plain asked by its whole name alone", () => {
    expect(where("Plaine des Cafres")!.lieu).toBe("La Plaine des Cafres (Le Tampon)");
    expect(where("Plaine des Cafres")!.autres).not.toContain("La Plaine-des-Palmistes (La Plaine-des-Palmistes)");
  });
});

describe("places asked by name that the gazetteer did not have", () => {
  it("are found, in their commune", () => {
    for (const [q, lieu] of [
      ["Beauséjour", "Beauséjour (Sainte-Marie)"],
      ["Beauséjour, Sainte-Marie", "Beauséjour (Sainte-Marie)"],
      ["Notre-Dame des Laves", "Notre-Dame des Laves (Sainte-Rose)"],
      ["Tour des Roches", "Tour des Roches (Saint-Paul)"],
      ["Bas de la Rivière", "Les Bas de la Rivière (Saint-Denis)"],
      ["le Bas de la Rivière", "Les Bas de la Rivière (Saint-Denis)"],
    ] as const) {
      expect(where(q)?.lieu, q).toBe(lieu);
      expect(resolvePlace(q)!.correspondance, q).toBe("exacte");
    }
  });
});
