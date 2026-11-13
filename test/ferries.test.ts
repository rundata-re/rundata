import { describe, expect, it } from "vitest";
import { asksCrossing, T } from "../src/tools/ferries.js";
import { transports } from "../src/tools/transports.js";
import { busPage } from "../src/web/domains.js";

const NOW = new Date("2026-10-24T16:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("the boat to Mauritius", () => {
  it("tell a crossing from a bus stop that bears the same word", () => {
    for (const q of ["ferry pour Maurice", "bateau Réunion Maurice", "aller à l'île Maurice en bateau", "traversée vers Maurice", "Rodrigues", "Mauritius Trochetia"]) expect(asksCrossing(q), q).toBe(true);
    for (const q of ["Jules Ferry, Saint-Denis", "Rue Jules Ferry", "Chemin Bateau", "Fonds Maurice", "Maurice Tomi", "Rue Maurice Chevalier", "Gare Maritime"]) expect(asksCrossing(q), q).toBe(false);
  });

  it("answer that there is no regular passenger line, dated, whatever the timetables", async () => {
    expect(body(await transports("ferry pour Maurice", undefined, NOW))).toEqual({ resume: T.outil });
    expect(T.outil).toMatch(/^Il n'y a pas de liaison maritime régulière de passagers entre La Réunion et Maurice \(vérifié le 24\/10\/2026\)\./);
  });

  it("say it in /bus's questions, with the day it was checked and no link, and in its FAQPage", () => {
    const html = busPage("https://rundata.re", null, NOW);
    const s = html.slice(html.indexOf('<h3 id="h-bateau">'));
    expect(s).toMatch(/^<h3 id="h-bateau">Et le bateau pour Maurice\s\?<\/h3><p>Aucun bateau régulier/);
    expect(s).toContain(`<p class="note">Vérifié le 24/10/2026.</p>`);
    expect(s.slice(0, s.indexOf("</section>"))).not.toContain("href");
    expect(html).toMatch(/"@type":"Question","name":"Et le bateau pour Maurice\s\?","acceptedAnswer":\{"@type":"Answer","text":"Aucun bateau régulier/);
  });

  it("let the ship's name go to the next line on a narrow screen, never the airlines' names nor the duration", () => {
    // « Mauritius Trochetia » bound in one piece was wider than a 320 px line at 200 % and cut into « Troche » and « tia ».
    expect(T.page).toContain("Le Mauritius Trochetia relie");
    expect(T.page).toContain("Air\u00a0Austral ou Air\u00a0Mauritius");
    expect(T.page).toContain("45\u00a0minutes");
  });
});
