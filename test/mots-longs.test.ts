import { describe, expect, it } from "vitest";
import { daePage, wholeName } from "../src/web/domains.js";
import { CSS } from "../src/web/pages.js";

// The long words at 320 px (ux review of 04/11/2026): none out of its box, not one word changed. In the menu and in the
// table of Parcoursup's courses, the word hyphenated in French where it no longer fits (the page in `lang="fr"`); on a
// home tile, the value smaller below 355 px, so that « 1 271 défibrillateurs » keeps its word whole (#737).
describe("the long words on a phone", () => {
  it("hyphenates a menu entry that no longer fits beside its icon, « Défibrilla-teurs »", () => {
    // A browser without a French dictionary breaks the word anywhere, rather than letting it run past the screen's edge
    // (ux at 320 px, 06/11/2026: « Défibrillateurs » to 324 px in a tile that ends at 304).
    expect(CSS).toContain(".sheet .groupe .gn{display:block;text-align:left;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere}");
    expect(daePage("https://rundata.re", null)).toContain('<html lang="fr">');
  });

  it("puts a tile's value in a smaller size below 355 px, its word never cut", () => {
    expect(CSS).toContain(".tv .nw{white-space:nowrap;overflow-wrap:normal;font-size:min(1em,12.5cqi)}@media (max-width:22.2rem){.tv{font-size:1rem}}");
  });

  it("keeps a commune's name in a tile's figure whole where it fits, broken at its hyphen in a narrower tile, never cut by its edge", () => {
    // 768 px, three tiles a row, the text at 200 %: « crise à Saint-Joseph » went 27 px past the Sécheresse tile's edge.
    expect(CSS).toContain(".tv .nm{display:inline-block;max-width:100%}");
    expect(wholeName("à Saint-Joseph")).toBe(`à <span class="nm">Saint-Joseph</span>`);
    expect(wholeName("à L'Étang-Salé")).toBe(`à L&#39;<span class="nm">Étang-Salé</span>`);
    expect(wholeName("au Tampon")).toBe("au Tampon");
  });

  it("keeps the example of a conversation on the home page in the screen's width, its tool call cut where it must", () => {
    // 390 px, the text at 200 %: « meteo_actuelle(lieu: », in a fixed-width font, widened the page to 401 px.
    expect(CSS).toContain(".duo{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;align-items:start}");
    expect(CSS).toContain("display:grid;grid-template-columns:minmax(0,1fr);gap:.7rem;box-shadow:0 30px 60px -20px rgb(0 0 0/.5);min-width:0}");
    expect(CSS).toContain("border-radius:8px;padding:.2rem .55rem;max-width:100%;overflow-wrap:anywhere}");
  });

  it("cuts a course's long words in its narrow column, hyphenated where the browser can, so that none covers its places", () => {
    expect(CSS).toContain("table.psup{table-layout:fixed}table.psup tbody th{hyphens:auto;-webkit-hyphens:auto;overflow-wrap:anywhere}");
  });
});
