import { describe, expect, it } from "vitest";
import { daePage } from "../src/web/domains.js";
import { CSS } from "../src/web/pages.js";

// The long words at 320 px (ux review of 04/11/2026): none out of its box, not one word changed. In the menu and in the
// table of Parcoursup's courses, the word hyphenated in French where it no longer fits (the page in `lang="fr"`); on a
// home tile, the value smaller below 355 px, so that « 1 271 défibrillateurs » keeps its word whole (#737).
describe("the long words on a phone", () => {
  it("hyphenates a menu entry that no longer fits beside its icon, « Défibrilla-teurs »", () => {
    expect(CSS).toContain(".sheet .groupe .gn{display:block;text-align:left;hyphens:auto;-webkit-hyphens:auto}");
    expect(daePage("https://rundata.re", null)).toContain('<html lang="fr">');
  });

  it("puts a tile's value in a smaller size below 355 px, its word never cut", () => {
    expect(CSS).toContain(".tv .nw{white-space:nowrap;overflow-wrap:normal}@media (max-width:22.2rem){.tv{font-size:1rem}}");
  });

  it("cuts a course's long words in its narrow column, hyphenated where the browser can, so that none covers its places", () => {
    expect(CSS).toContain("table.psup{table-layout:fixed}table.psup tbody th{hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere}");
  });
});
