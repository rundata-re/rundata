import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import type { CommuneData, ElectriciteAnswer } from "../src/web/data.js";
import { electriciteCommune } from "../src/web/domains.js";

const NOW = new Date("2026-11-21T10:30:00Z");
const production = { renouvelable_pct: 82.2, total_mw: 412, heure_mesure: "20/11 17:10 heure de La Réunion", age_min: 0, parts: [], statut: "lu" };
const lien = "https://www.saint-andre.re/avis-coupures/";
const creneaux = [
  { jour: "2026-11-23", de: "09:00", a: "12:30", secteurs: ["237 avenue de la République"] },
  { jour: "2026-11-24", de: "09:00", a: "10:30", secteurs: ["650 chemin Balance"] },
  { jour: "2026-11-24", de: "10:00", a: "14:00", secteurs: ["N176 ruelle Lacotte"] },
];
const copy = (avis: object[], p: object | undefined = production) =>
  ({ value: { production: p, coupures_annoncees: { avis }, sources: [] }, fetchedAt: NOW, stale: false }) as unknown as Cached<ElectriciteAnswer>;
const row = (more: object = {}) => ({ texte: "…", commune: "Saint-André", nature: "programmée", lien, creneaux, ...more });

describe("the Électricité tile of a commune's page", () => {
  it("says the cut its mairie announces, its next range and the others in the notice, the notice's link under it", () => {
    const t = electriciteCommune(copy([row()]), "Saint-André", NOW);
    expect(t.live).toMatchObject({ valeur: "Coupure programmée", detail: "lundi 23/11 de 09:00 à 12:30, d&#39;après la mairie, et 2 autres plages dans l&#39;avis" });
    // EDF's figure with its day: its data stopped on 20/11 at 17:10, never « mesuré à » today's hour.
    expect(t.more).toBe(`<p class="td all note">82,2 % renouvelable sur l&#39;île, le 20/11 à 17:10</p>`);
    expect(t.foot).toBe(`<a href="${lien}" rel="noopener">L'avis de la mairie →</a>`);
  });

  it("says « aujourd'hui » during the day, « 1 autre plage », and EDF's letter as a PDF", () => {
    const monday = new Date("2026-11-23T06:00:00Z");
    expect(electriciteCommune(copy([row({ creneaux: creneaux.slice(0, 2) })]), "Saint-André", monday).live?.detail)
      .toBe("aujourd&#39;hui de 09:00 à 12:30, d&#39;après la mairie, et 1 autre plage dans l&#39;avis");
    const pdf = electriciteCommune(copy([row({ pdf: true, creneaux: [{ jour: "2026-11-23", secteurs: [] }] })]), "Saint-André", NOW);
    expect(pdf.live?.detail).toBe("lundi 23/11, d&#39;après la mairie, heures et secteurs dans l&#39;avis");
    expect(pdf.foot).toContain("L'avis de la mairie (PDF) →");
  });

  it("says a cut the mairie's notice gives under way, with the notice's hour, never from the hour of the day", () => {
    const t = electriciteCommune(copy([row({ nature: "en cours", publie_le: "21/11 08:53", creneaux: undefined })]), "Saint-André", NOW);
    expect(t.live).toMatchObject({ valeur: "Coupure en cours", detail: "d&#39;après la mairie, avis du 21/11 à 08:53" });
    // During a programmed range, « programmée » still, « aujourd'hui » its day.
    expect(electriciteCommune(copy([row()]), "Saint-André", new Date("2026-11-23T06:00:00Z")).live?.valeur).toBe("Coupure programmée");
  });

  it("stays the island's tile with no cut to come, never « pas de coupure »", () => {
    // A past notice of the commune (no `nature`), another commune's cut: neither on the tile.
    for (const avis of [[], [{ texte: "…", commune: "Saint-André", lien }], [row({ commune: "Sainte-Marie" })]]) {
      const t = electriciteCommune(copy(avis), "Saint-André", NOW);
      expect(t.live?.valeur).toBe("82 % renouvelable");
      expect([t.more, t.foot]).toEqual([undefined, undefined]);
    }
  });

  it("is on Saint-André's page, its link there", () => {
    const c = COMMUNES.find((x) => x.slug === "saint-andre")!;
    const live = { place: null, commune: { value: { sources: [] }, fetchedAt: NOW, stale: false } as unknown as Cached<CommuneData>, electricite: copy([row()]) };
    const page = communePage("https://rundata.re", c, live, NOW);
    expect(page).toMatch(/Électricité<\/a><\/h3><p class="tv">Coupure <span class="mc">pro\u00adgram\u00admée<\/span><\/p><p class="td all">lundi 23\/11 de 09:00 à 12:30/);
    expect(page).toContain(`href="${lien}" rel="noopener">L'avis de la mairie →</a>`);
  });
});
