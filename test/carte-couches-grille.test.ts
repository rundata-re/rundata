import { describe, expect, it } from "vitest";
import { cartePage } from "../src/web/carte.js";
import { CARTE_CSS } from "../src/web/carte-style.js";

// /carte's layers on a wide screen: two columns, then four from 64rem, and the group holding a second list (« Avec
// les enfants ») over the whole row, its two lists side by side, rather than alone under the four others (UX review,
// 04/11/2026). On a phone, one column, unchanged.
describe("/carte's groups of layers", () => {
  it("go in two columns, then four, the group with a sub-list over the whole row", () => {
    expect(CARTE_CSS).toContain(".kths{display:grid;gap:.75rem;margin-top:.75rem}@media (min-width:48rem){.kths{grid-template-columns:repeat(2,minmax(0,1fr))}");
    expect(CARTE_CSS).toContain(".kths fieldset:has(.ksg){grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:1.5rem}");
    expect(CARTE_CSS).toContain(".kths fieldset:has(.ksg)>ul:first-of-type{grid-row:span 2}}");
    expect(CARTE_CSS).toContain("@media (min-width:64rem){.kths{grid-template-columns:repeat(4,minmax(0,1fr))}}");
    expect(CARTE_CSS).not.toContain("minmax(15rem,1fr)");
  });

  it("are five, the last alone holding a sub-list, so that four fill the first row", () => {
    const html = cartePage("https://rundata.re");
    const groups = html.slice(html.indexOf('<div class="kths">')).split("</fieldset>").slice(0, -1);
    expect(groups.map((g) => g.slice(g.indexOf("<legend>") + 8, g.indexOf("</legend>")))).toEqual(["Météo", "Nature", "Secours", "Se déplacer", "Sortir"]);
    expect(groups.map((g) => g.includes('class="ksg"'))).toEqual([false, false, false, false, true]);
  });
});
