import { describe, expect, it } from "vitest";
import { carburantsPage } from "../src/web/carburants.js";
import { airPage } from "../src/web/domains.js";

// The connector card of a domain page: a tool's name may be cut after each « _ » on a narrow screen (/carburants at
// 280 to 320 px), and a copy of it is still the name, with no hidden character.
const codeOf = (html: string) => {
  const start = html.indexOf("(outil <code>") + "(outil <code>".length;
  return html.slice(start, html.indexOf("</code>", start));
};
const HIDDEN = ["​", "‌", "‍", "⁠", "­", "﻿"];

describe("the tool's name in the connector card", () => {
  it("may be cut after each « _ », and reads as the exact name once the <wbr> elements, which hold no text, are left out", () => {
    for (const [html, tool, cut] of [
      [carburantsPage("https://rundata.re", null), "annuaire_services_publics", "annuaire_<wbr>services_<wbr>publics"],
      [airPage("https://rundata.re", null), "qualite_air", "qualite_<wbr>air"],
    ]) {
      const code = codeOf(html);
      expect(code).toBe(cut);
      // <wbr> is a void element with no text: what a reader copies is what is left between them.
      expect(code.split("<wbr>").join("")).toBe(tool);
      expect(HIDDEN.filter((c) => code.includes(c))).toEqual([]);
    }
  });
});
