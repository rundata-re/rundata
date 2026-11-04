import { describe, expect, it } from "vitest";
import { COMMON } from "../src/tools/eau.js";
import * as col from "../src/vie/collecte.js";
import { passeOf } from "../src/historique/cyclones-passes.js";
import { collectePage } from "../src/web/collecte.js";
import { passePage } from "../src/web/cyclones-passes.js";
import type { EauAnswer, HistoriqueAnswer, SeaData } from "../src/web/data.js";
import { daePage, duAu, eauPage, historiquePage } from "../src/web/domains.js";
import { enfantsCommunePage, enfantsPage } from "../src/web/enfants.js";
import { seaPage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { pressePage } from "../src/web/presse.js";
import { publierPage } from "../src/web/publier.js";

// The green dot that pulses reads « en direct »: only with what was measured or read today (marketing, 04/11/2026).
// Anything older says its date in the pill, « NATURE · DATE », without the dot; a pill with no data has no dot either.
const O = "https://rundata.re";
const NOW = new Date("2026-11-04T06:00:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
const pill = (page: string) => page.slice(page.indexOf('<p class="pill">'), page.indexOf("</p>", page.indexOf('<p class="pill">')) + 4);

describe("the pills without a green dot", () => {
  it("date the ARS's analyses with the days of their samples", () => {
    expect(duAu("2026-09-15", "2026-09-22")).toBe("du 15 au 22/09");
    expect(duAu("2026-08-28", "2026-09-22")).toBe("du 28/08 au 22/09");
    expect(duAu("2026-09-22", "2026-09-22")).toBe("du 22/09");
    const site = (s: string, d: string) => ({ site: s, commune: "Saint-Paul", lon: 55.22, lat: -21.08, qualite_dernier_prelevement: "bonne", dernier_prelevement: d, derniers_prelevements: [], mauvais_sur_12_mois: 0 });
    const value = { baignades: [site("Plage de l'Hermitage", "22/09/2026"), site("Plage de Boucan Canot", "15/09/2026")], communes: [], lu: NOW.toISOString(), a_savoir: COMMON, sources: [] } as unknown as EauAnswer;
    expect(pill(eauPage(O, cached(value), NOW))).toBe(`<p class="pill">Analyses de l'<abbr title="Agence régionale de santé">ARS</abbr> · du 15 au 22/09</p>`);
    expect(pill(eauPage(O, null, NOW))).toBe(`<p class="pill">Analyses de l'<abbr title="Agence régionale de santé">ARS</abbr></p>`);
  });

  it("date the satellite's sea temperature with its day", () => {
    const value: SeaData = { plages: [{ nom: "Saint-Leu", commune: "Saint-Leu", lon: 55.28, lat: -21.17, valeur: 25.1, jour: "2026-11-03", distance_km: 0.3 }], sources: [] };
    expect(pill(seaPage(O, cached(value), NOW))).toBe(`<p class="pill">Mesure satellite · 03/11</p>`);
    expect(pill(seaPage(O, null, NOW))).toBe(`<p class="pill">Mesure satellite</p>`);
  });

  it("say where a past cyclone's measures come from, the TCO's calendars their year, the past days how far they go", () => {
    expect(pill(passePage(O, passeOf("garance-2025")!))).toBe(`<p class="pill">Cyclones passés · Archives de Météo-France</p>`);
    expect(pill(collectePage(O, NOW))).toBe(`<p class="pill">Calendriers du <abbr title="Territoire de la Côte Ouest">TCO</abbr> · ${col.YEAR}</p>`);
    const value = { resume: "", periode: { du: "05/10/2026", au: "03/11/2026", jours: 30 }, stations: [], a_savoir: [], sources: [] } as HistoriqueAnswer;
    expect(pill(historiquePage(O, cached(value), NOW))).toBe(`<p class="pill">Mesures jusqu'au 03/11</p>`);
  });

  it("keep their words and lose the dot when they carry no data", () => {
    const pages = {
      "Guide gratuit": publierPage(O),
      "Espace presse": pressePage(O, []),
      "De 0 à 17 ans": enfantsPage(O, null, NOW),
      "Base nationale Géo'DAE": daePage(O, null, NOW),
    };
    for (const [words, page] of Object.entries(pages)) expect(pill(page), words).toBe(`<p class="pill">${words}</p>`);
    expect(pill(enfantsCommunePage(O, pageOf("saint-paul")!, null, NOW))).toBe(`<p class="pill">De 0 à 17 ans</p>`);
  });
});
