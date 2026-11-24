import { describe, expect, it } from "vitest";
import { marchesDesJours, periode, SPORT_CE_WEEK_END } from "../src/tools/agenda.js";
import { agendaMarketDays, agendaPage } from "../src/web/agenda.js";
import { weekend, weekendMarketDays, weekendPage } from "../src/web/evenements.js";
import { MARCHES_NOTE, SPORT_LIEN } from "../src/web/marches-agenda.js";
import { marchesDuJour } from "../src/vie/marches.js";

const O = "https://rundata.re";
// Thursday 19/11/2026, 10:00 at La Réunion; Saturday 21/11 and Sunday 22/11 are the weekend.
const THU = new Date("2026-11-19T06:00:00Z");
const FRI = new Date("2026-11-20T06:00:00Z");

describe("the markets of the agenda's days", () => {
  it("gives a Saturday's markets with their hours and their dated source, never one open all week or without hours", () => {
    const sat = marchesDuJour("2026-11-21");
    const leu = sat.find((m) => m.nom === "Marché forain de Saint-Leu")!;
    expect(leu).toMatchObject({ commune: "Saint-Leu", horaires: "de 6 h à 13 h", d_apres: "Mairie de Saint-Leu, site lu le 31/10/2026" });
    // Saint-Pierre's own page gives the hours, its reading day and the page's date.
    expect(sat.find((m) => m.nom === "Marché forain de Saint-Pierre")).toMatchObject({ horaires: "de 5\u00a0h à 12\u00a0h", d_apres: "Mairie de Saint-Pierre, site lu le 20/11/2026 (page du 23/01/2023)" });
    // A town hall's page with its own date says it.
    expect(sat.find((m) => m.commune === "Sainte-Marie")!.d_apres).toContain("(page du 03/09/2021)");
    // Open all week (a covered market), or no day nor hours in any source: not a market of the day.
    expect(sat.some((m) => m.nom === "Marché couvert de Saint-Pierre")).toBe(false);
    expect(sat.every((m) => m.horaires && m.horaires !== "heures non trouvées")).toBe(true);
    // A Sunday has its own.
    expect(marchesDuJour("2026-11-22").map((m) => m.nom)).toContain("Marché du Mail de Rodrigues");
    expect(marchesDuJour("2026-11-22", "Saint-Paul").map((m) => m.commune)).toEqual(["Saint-Paul"]);
  });

  it("lists them on /evenements for today, tomorrow and the weekend, apart from the events and their count", () => {
    expect(agendaMarketDays(THU)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const html = agendaPage(O, null, THU);
    expect(html).toContain('<h2 id="h-marches">Marchés forains</h2>');
    expect(html).toContain(MARCHES_NOTE.replaceAll("'", "&#39;").slice(0, 40));
    expect(html).toContain("Marché du Mail de Rodrigues");
    expect(html).toContain(SPORT_LIEN);
  });

  it("lists the weekend's own on /evenements/ce-week-end: not the Friday's, held in the morning before the weekend begins", () => {
    const w = weekend(THU);
    expect(weekendMarketDays(w, THU)).toEqual(["2026-11-21", "2026-11-22"]);
    expect(weekendMarketDays(weekend(new Date("2026-11-21T06:00:00Z")), new Date("2026-11-21T06:00:00Z"))).toEqual(["2026-11-21", "2026-11-22"]);
    const html = weekendPage(O, null, THU);
    expect(html).toContain('<h2 id="h-marches">Marchés forains</h2>');
    expect(html).toContain("Marché forain de Saint-Leu");
    expect(html).not.toContain("Marché forain de La Rivière");
    expect(html).toContain(SPORT_LIEN);
  });

  it("gives them in the tool for a short period, by day, for the commune asked; not for two weeks, the evening or a concert", () => {
    const we = marchesDesJours(periode("ce_week_end", FRI), "Saint-Paul", true)!;
    expect(we.jours.map((j) => j.jour)).toEqual(["samedi 21/11", "dimanche 22/11"]);
    expect(we.jours[0].marches[0]).toMatchObject({ nom: "Marché forain de Saint-Paul", horaires: "de 7 h à 12 h", d_apres: "Ville de Saint-Paul, site lu le 31/10/2026" });
    expect(we.note).toContain("pas comptés dans nombre");
    expect(marchesDesJours(periode(undefined, FRI), undefined, true)).toBeUndefined();
    expect(marchesDesJours(periode("samedi soir", FRI), undefined, true)).toBeUndefined();
    expect(marchesDesJours(periode("ce_week_end", FRI), undefined, false)).toBeUndefined();
    expect(SPORT_CE_WEEK_END).toContain("ce_week_end");
  });
});
