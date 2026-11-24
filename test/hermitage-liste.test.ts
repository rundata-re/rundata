import { describe, expect, it } from "vitest";
import { cibles, norm, trouve } from "../src/web/menu.js";
import { placeLinks } from "../src/web/pages.js";

// 21/11/2026, the site's watch: the chip « L'Hermitage » led to /meteo/l-hermitage, sent (301) to Saint-Gilles-les-Bains,
// the next chip of the same list.
describe("a place sent to another's page (places.ts PRINCIPAL), in the lists of places", () => {
  it("has no chip of its own; its name stays on the principal's chip, for the filter", () => {
    for (const html of [placeLinks(), placeLinks(undefined, true), placeLinks("saint-denis")]) {
      expect(html).not.toContain("/meteo/l-hermitage");
      // Its name as the page writes it, the apostrophe escaped.
      expect(html).not.toMatch(/>L(?:'|&#39;)Hermitage</);
      expect(html).toContain(`<li data-aussi="L&#39;Hermitage"><a href="/meteo/saint-gilles-les-bains">Saint-Gilles-les-Bains</a></li>`);
    }
  });

  it("has no entry in the site's search, and its name finds the principal's page", () => {
    const D = cibles(true);
    expect(D.map((x) => x[1])).not.toContain("/meteo/l-hermitage");
    expect(D.map((x) => x[0])).not.toContain("L'Hermitage");
    expect(trouve(D, norm("hermitage")).map((x) => x[1])).toContain("/meteo/saint-gilles-les-bains");
  });
});
