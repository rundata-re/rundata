import { describe, expect, it } from "vitest";
import { findStops } from "../src/tools/transports.js";

const first = (q: string) => {
  const g = findStops(q).groups[0];
  return `${g.nom} (${g.reseau})`;
};

describe("a stop asked by its exact name comes first, whatever its network (live check of 24/11/2026)", () => {
  it("gives first the stop of that exact name, among stops of other networks that match as well", () => {
    // Kar'Ouest's « Pôle d'Echanges » came after Car Jaune's « Pôle d'Échanges Le Port », and the tool's page was Car Jaune's.
    expect(first("Pôle d'Echanges")).toBe("Pôle d'Echanges (karouest)");
    expect(first("Gare Saint Louis")).toBe("Gare Saint-Louis (alterneo)");
  });

  it("keeps the other network's stop when it is the one named exactly", () => {
    expect(first("Pôle d'Échanges Le Port")).toBe("Pôle d'Échanges Le Port (carjaune)");
    expect(first("Gare de St-Louis")).toBe("Gare de St-Louis (carjaune)");
  });

  it("still gives both stops, each with its own page", () => {
    expect(findStops("Pôle d'Echanges").groups.map((g) => g.reseau).sort()).toEqual(["carjaune", "karouest"]);
  });
});
