import { describe, expect, it } from "vitest";
import { CARTE_CSS } from "../src/web/carte-style.js";
import { CSS } from "../src/web/pages.js";

// A 320 px phone, the text at 100, 150 and 200 % (chrome-headless-shell 1248, 07/11/2026): a word cut anywhere or
// past the screen in /carte's layers, the map buttons and a commune's election results.
describe("on a 320 px phone", () => {
  it("keeps /carte's groups of layers inside the screen, a name too long for its line going under, never cut off", () => {
    // A fieldset's minimum width is its content's by default: 431 px at 200 % for a 288 px column, clipped by the page.
    expect(CARTE_CSS).toContain(".kths fieldset{min-width:0;margin:0;");
    expect(CARTE_CSS).toContain(".kths label>span{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;overflow-wrap:break-word}");
    // Text at 125 % and more on a phone: the box's and the row's spaces narrower, a name's line 175 px at 200 % (« Séismes »
    // 158 px) rather than 140.
    expect(CARTE_CSS).toContain("@media (max-width:19.9rem){.kths fieldset{padding-inline:.4rem}.kths label{gap:.35rem}}");
  });

  it("puts a map's buttons on two lines rather than « Recentr/er » in a squeezed button, at any size", () => {
    expect(CSS).toContain(".kzoom{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0 0}");
    expect(CSS).toContain(".kzoom button{min-width:44px;min-height:44px;");
  });

  it("scrolls an election's table in its frame, its numbers and names never cut (« 10/0 », « GLUCKSMAN/N »)", () => {
    expect(CSS).not.toContain("#elections table.votes td{overflow-wrap:anywhere}");
    expect(CSS).toContain("#elections table.votes td{hyphens:manual;-webkit-hyphens:manual}");
    expect(CSS).toContain("th,td,:is(th,td) .note{overflow-wrap:normal}");
  });
});
