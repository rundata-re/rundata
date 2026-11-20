import { describe, expect, it } from "vitest";
import { LIENS, distributeur } from "../src/eau/distributeurs.js";
import { ACCUEILS, AGENDAS, LISIBLES, servis } from "../src/providers/agenda.js";
import { sansLien } from "../src/liens.js";

// Until 20/11/2026, Petite-Île's agenda linked its home page only and nothing linked Saint-Benoît's site (#381, #427).
// Since then their sites are read as the communes' public information (autorisations.ts « publique »), as Le Tampon's:
// each fact with its own page's link, the site read slowly under an honest User-Agent, taken out on a written request.
describe("the links to the communes' sites read as public information", () => {
  it("go to each event's own page: no agenda links its home page instead", () => {
    expect(LISIBLES.filter((a) => a.accueil).map((a) => a.id)).toEqual([]);
    expect([...ACCUEILS]).toEqual([]);
    for (const id of ["petite_ile", "saint_benoit", "la_possession", "le_tampon"]) {
      const a = AGENDAS.find((x) => x.id === id)!;
      expect(a, id).toBeDefined();
      const lien = `${a.source.url}fete-de-la-commune`;
      const [e] = servis(a, [{ id: "x", titre: "Fête", seances: [{ debut: "2026-11-21" }], commune: a.commune!, categories: [], lien, publie_par: a.nom }]);
      expect(e?.lien, id).toBe(lien);
    }
  });

  it("are no longer refused for any site, Saint-Benoît's included, whatever the page", () => {
    expect(sansLien("https://www.saint-benoit.re/evenements/articles/10641-trail-urbain-des-letchis")).toBe(false);
    expect(sansLien("http://saint-benoit.re/")).toBe(false);
    expect(sansLien(undefined)).toBe(false);
    expect(sansLien("")).toBe(false);
    // Saint-Benoît's events are served, each with its page.
    const a = AGENDAS.find((x) => x.id === "saint_benoit")!;
    const lien = "https://www.saint-benoit.re/evenements/articles/10641-trail-urbain-des-letchis";
    expect(servis(a, [{ id: lien, titre: "Trail urbain des letchis", seances: [{ debut: "2026-12-19" }], commune: "Saint-Benoît", categories: [], lien, publie_par: a.nom }]).map((e) => e.lien)).toEqual([lien]);
  });

  it("read the notices of cuts of Petite-Île on its page of them, no longer only linked to (20/11/2026)", () => {
    expect(LIENS["Petite-Île"]).toBeUndefined();
    expect(distributeur("Petite-Île")?.site).toBe("https://www.petite-ile.re/taxonomy/term/301");
  });
});
