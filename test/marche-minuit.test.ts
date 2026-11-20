import { describe, expect, it } from "vitest";
import { marchesAnswer } from "../src/tools/marches.js";
import { resume } from "../src/tools/resume.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import { pageOf } from "../src/web/places.js";
import { fromMidnight, heldOn, hoursOn, jours, NOT_FOUND } from "../src/vie/marches.js";

// Friday 20/11/2026, 09:00 at La Réunion.
const FRI = new Date("2026-11-20T05:00:00Z");

describe("a market's span from midnight, an entry error in its source", () => {
  it("keeps its day and says its hours not found, never « de 0 h à 12 h » nor another hour", () => {
    const m = { nom: "Marché", note: null, horaires: "le vendredi de 0 h à 12 h", horaires_osm: "Fr 0:00-12:00" };
    expect(fromMidnight(m)).toBe(true);
    expect(hoursOn(m, FRI)).toBe(NOT_FOUND);
    expect(jours(m)).toBe("le vendredi, heures non trouvées");
    // Not held on another day.
    expect(hoursOn(m, new Date("2026-11-21T05:00:00Z"))).toBeUndefined();
    // A whole day, or a span later in the night, is not one.
    expect(fromMidnight({ horaires_osm: "Su 00:00-24:00" })).toBe(false);
    expect(fromMidnight({ horaires_osm: "Sa 05:00-12:00" })).toBe(false);
  });

  it("leaves the market's other days their hours", () => {
    const m = { nom: "Marché", note: null, horaires: "le lundi de 6\u00a0h à 12\u00a0h\u00a0; le vendredi de 0\u00a0h à 12\u00a0h", horaires_osm: "Mo 06:00-12:00; Fr 0:00-12:00" };
    expect(hoursOn(m, new Date("2026-11-16T05:00:00Z"))).toBe("de 6\u00a0h à 12\u00a0h");
    expect(hoursOn(m, FRI)).toBe(NOT_FOUND);
    expect(jours(m)).toBe("le lundi de 6\u00a0h à 12\u00a0h\u00a0; le vendredi, heures non trouvées");
  });

  it("says so for Saint-André's market, on its Friday and in the markets' tool", () => {
    const here = heldOn("Saint-André", FRI);
    expect(here.map((m) => m.horaires_aujourd_hui)).toEqual([NOT_FOUND]);
    const said = JSON.stringify(marchesAnswer("Saint-André"));
    expect(said).not.toContain("de 0 h");
    expect(said).toContain("le vendredi, heures non trouvées");
  });

  it("is never « the market of today » without an hour: its place, where its hours were looked for, and the town hall's site", () => {
    const sa = pageOf("saint-andre")!;
    const mairie = { nom: "Mairie de Saint-André", insee: "97409", adresse: "", lon: null, lat: null, horaires: [], site: "https://www.saint-andre.re/", fiche: "" };
    const r = resume(sa, { commune: { value: { mairie }, fetchedAt: FRI.getTime() } } as never, FRI);
    const mk = r.marches_du_jour!;
    expect(mk.liste).toEqual([]);
    expect(mk.heures_non_trouvees).toEqual([expect.objectContaining({ nom: "Marché", manque: expect.stringMatching(/^heures non données par OpenStreetMap, relevé le \d\d\/\d\d\/\d{4}$/) })]);
    expect(mk.mairie?.site).toBe("https://www.saint-andre.re/");
    expect(r.resume).not.toMatch(/marché aujourd'hui/i);
    const html = aujourdhuiPage("https://rundata.re", sa, r, null);
    expect(html).not.toContain("Marché aujourd'hui");
    expect(html).toMatch(/<li>Marché sans heures : <a [^>]*><b>Marché<\/b><\/a> <span class="note">heures non données par OpenStreetMap, relevé le /);
    expect(html).toContain("site de la mairie de Saint-André →");
    expect(html).not.toContain("non trouvé");
  });
});
