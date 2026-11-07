import { describe, expect, it } from "vitest";
import { carburantsPage } from "../src/web/carburants.js";
import { airPage, coupable } from "../src/web/domains.js";

// A tool's name in the connector card and the values of /air's source list may be cut after each « . » and « _ » on a
// narrow screen (/carburants at 280 to 320 px, /air at 320 px with the text at 150 %), never in the middle of a word;
// a copy of them, and what a screen reader says, are still the text, with no hidden character.
const between = (html: string, from: string, to: string) => {
  const start = html.indexOf(from) + from.length;
  return html.slice(start, html.indexOf(to, start));
};
// <wbr> is a void element that holds no text: what is copied or read aloud is what is left between them.
const text = (html: string) => html.split("<wbr>").join("");
const HIDDEN = ["​", "‌", "‍", "⁠", "­", "﻿"];

describe("text that may be cut after a « . » or a « _ »", () => {
  it("is the same text once its <wbr> elements are left out, with no hidden character", () => {
    expect(coupable("annuaire_services_publics")).toBe("annuaire_<wbr>services_<wbr>publics");
    expect(coupable("sa fiche sur data.gouv.fr")).toBe("sa fiche sur data.<wbr>gouv.<wbr>fr");
    for (const s of ["annuaire_services_publics", "ind_atmo_2021", "sa fiche sur data.gouv.fr", "qualite_air"]) {
      expect(text(coupable(s))).toBe(s);
      expect(HIDDEN.filter((c) => coupable(s).includes(c))).toEqual([]);
    }
  });

  it("holds the tool's name in the connector card", () => {
    for (const [html, cut] of [
      [carburantsPage("https://rundata.re", null), "annuaire_<wbr>services_<wbr>publics"],
      [airPage("https://rundata.re", null), "qualite_<wbr>air"],
    ]) {
      expect(between(html, "(outil <code>", "</code>")).toBe(cut);
    }
  });

  it("holds the layer's code in /air's source list, never the link", () => {
    const dd = between(airPage("https://rundata.re", null), "<dt>Diffusé par</dt><dd>", "</dd>");
    expect(dd).toContain("couche ouverte ind_<wbr>atmo_<wbr>2021 (");
    // In the link too, after each « . » of its address, its whole text in aria-label: a <wbr> alone would make a screen
    // reader say « data. gouv. fr ».
    expect(dd).toContain('rel="noopener" aria-label="sa fiche sur data.gouv.fr">sa fiche sur data.<wbr>gouv.<wbr>fr</a>)');
    expect(dd).toContain('<a href="https://www.data.gouv.fr/datasets/indice-de-la-qualite-de-lair-quotidien-par-commune-indice-atmo" ');
  });
});
