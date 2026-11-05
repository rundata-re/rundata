import { describe, expect, it } from "vitest";
import { BILLETTERIES, versBilletterie } from "../src/http.js";
import { parseRss as agendaRss } from "../src/providers/agenda.js";
import { eventRow } from "../src/tools/agenda.js";
import type { AgendaAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/domains.js";

// The real event pages each ticket office was checked on (05/11/2026): 200 and the same page with « ?ref=rundata ».
const CHECKED = [
  "https://www.monticket.re/spectacle/detail/9268",
  "https://www.sportpro.re/courses/epreuves/07123-maloya-trail/",
  "https://my.weezevent.com/desinvolt-301026-20-years-rekids",
  "https://www.billetweb.fr/decouvrez-l-histoire-du-pirate-saint-paulois-gilles-fontaine-lespas",
];
const COMMUNE = "https://www.mairie-saintpaul.re/evenement/kafe-asso-la-saline/";
const NOW = new Date("2026-11-05T04:00:00Z");

describe("links to the ticket offices", () => {
  it("leave rundata.re with « ref=rundata », one ticket office per page checked", () => {
    expect(CHECKED.map((u) => new URL(u).host)).toEqual(BILLETTERIES);
    expect(CHECKED.map(versBilletterie)).toEqual(CHECKED.map((u) => `${u}?ref=rundata`));
  });

  it("keep their own parameters and anchor, and a « ref » already there", () => {
    expect(versBilletterie("https://my.weezevent.com/gala?lang=fr#billets")).toBe("https://my.weezevent.com/gala?lang=fr&ref=rundata#billets");
    expect(versBilletterie("https://www.billetweb.fr/gala?ref=asso")).toBe("https://www.billetweb.fr/gala?ref=asso");
  });

  it("leave every other link as it is: a commune's site, another host of the same company, http, nothing", () => {
    for (const u of [COMMUNE, "https://billetterie.monticket.re/awprod/MTIPP/AWLogin.aspx?Action=LOG&INS=MTI", "http://www.monticket.re/spectacle/detail/9268", "https://www.helloasso.com/associations/x/evenements/y", "pas un lien"]) {
      expect(versBilletterie(u)).toBe(u);
    }
    expect(versBilletterie(undefined)).toBeUndefined();
  });

  it("carry it in the events tool's answer and on the page, the commune's link unchanged", () => {
    const item = (titre: string, lien: string) =>
      `<item><title>${titre}</title><link>${lien}</link><pubDate>Thu, 05 Nov 2026 06:00:00 +0400</pubDate></item>`;
    const xml = `<?xml version="1.0"?><rss><channel>${item("Gala samedi 7 novembre 2026", CHECKED[2])}${item("Kafé Asso samedi 7 novembre 2026", COMMUNE)}</channel></rss>`;
    const events = agendaRss(xml, "Mairie de Saint-Paul", "Saint-Paul", true);
    const rows = events.map((e, i) => eventRow({ ...e, billetterie: i === 0 ? CHECKED[3] : undefined }, e.seances));
    expect(rows.map((r) => [r.lien, r.billetterie])).toEqual([
      [`${CHECKED[2]}?ref=rundata`, `${CHECKED[3]}?ref=rundata`],
      [COMMUNE, undefined],
    ]);
    const d = { resume: "", nombre: rows.length, evenements: rows, couverture: "", a_savoir: "", sources: [], ce_week_end: rows } as unknown as AgendaAnswer;
    const html = agendaPage("https://rundata.re", { value: d, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain(`<a href="${CHECKED[3]}?ref=rundata" rel="noopener">billets</a>`);
    expect(html).toContain(`href="${COMMUNE}"`);
    expect(html).not.toContain(`${COMMUNE}?ref`);
  });
});
