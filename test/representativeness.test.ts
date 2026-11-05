import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/places/resolve.js";
import { stations as mfStations } from "../src/providers/meteofrance.js";
import { stations } from "../src/providers/metar.js";
import { fit, mieux } from "../src/tools/representativeness.js";

const [gillot, pierrefonds] = stations();
const place = (q: string) => resolvePlace(q)!.lieu;

describe("fit", () => {
  it("Gillot speaks well for Sainte-Marie", () => {
    expect(fit(place("Sainte-Marie"), gillot).pertinence).toBe("bonne");
  });

  it("no airport speaks well for Cilaos", () => {
    const f = fit(place("Cilaos"), pierrefonds);
    expect(f.pertinence).toBe("faible");
    expect(f.avertissements.join(" ")).toMatch(/plus bas/);
  });

  it("warns when the station is on the other side of the island", () => {
    const f = fit(place("Saint-Benoît"), pierrefonds);
    expect(f.avertissements.join(" ")).toMatch(/versant/);
  });

  it("prefers the nearer airport", () => {
    const p = place("Saint-Louis");
    expect(fit(p, pierrefonds).score).toBeLessThan(fit(p, gillot).score);
  });

  it("puts the better relevance first, then the lower score: Gros Piton before Saint-Benoît for a place of Sainte-Rose at 31 m", () => {
    // At a given altitude, not the gazetteer's (30 m since 05/11/2026): Gros Piton (181 m) is then 150 m higher, « bonne ».
    const p = { ...place("Sainte-Rose"), altitude_m: 31 };
    const mf = (nom: string) => mfStations().find((s) => s.nom === nom)!;
    const piton = fit(p, mf("Gros Piton Sainte-Rose"));
    const benoit = fit(p, mf("Saint-Benoît"));
    // By score alone Saint-Benoît came first, nearer in altitude but further and only « moyenne ».
    expect([piton.pertinence, benoit.pertinence]).toEqual(["bonne", "moyenne"]);
    expect(benoit.score).toBeLessThan(piton.score);
    expect([benoit, piton].sort(mieux)).toEqual([piton, benoit]);
    // At equal relevance, the lower score: both airports are « faible » for Sainte-Rose.
    const [g, pf] = [fit(p, gillot), fit(p, pierrefonds)];
    expect([g.pertinence, pf.pertinence]).toEqual(["faible", "faible"]);
    const [near, far] = g.score < pf.score ? [g, pf] : [pf, g];
    expect([far, near].sort(mieux)).toEqual([near, far]);
  });

  it("takes one coast across the line between two sides: Pont-Mathurin for the beach of L'Étang-Salé, not Saint-Leu", () => {
    const p = place("Plage de L'Étang-Salé");
    const mf = (nom: string) => mfStations().find((s) => s.nom === nom)!;
    // The beach is « ouest », just past the line; Pont-Mathurin, 5,4 km away in the same commune, « sud ».
    const pm = fit(p, mf("Pont-Mathurin"));
    const leu = fit(p, mf("Saint-Leu"));
    expect([pm.versant, pm.pertinence, pm.avertissements]).toEqual(["sud", "bonne", []]);
    expect([pm, leu].sort(mieux)[0]).toBe(pm);
    // Further than 10 km, or from a cirque to the coast, the sides stay apart.
    expect(fit(place("Saint-Benoît"), pierrefonds).avertissements.join(" ")).toMatch(/versant/);
    expect(fit(place("Salazie"), mf("Bellevue Bras-Panon")).avertissements.join(" ")).toMatch(/versant est \(au vent\), Salazie sur le versant centre/);
  });
});
