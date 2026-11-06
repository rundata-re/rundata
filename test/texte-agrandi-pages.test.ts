import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// /meteo, /mer, /vigilance, /carburants, a commune's page at 320 px with the text at 150 % and at 280 px: nothing wider
// than the screen.
describe("larger text on a narrow screen, on the pages of facts and of search", () => {
  it("cuts a word, an address or a tool's name longer than its line in a heading, the question to an assistant, the connector card", () => {
    expect(CSS).toContain(".sec-h h2,.pitch h1,.askq,.cta code{overflow-wrap:anywhere}");
    expect(CSS).toContain(".connect code{font:600 1.05rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);overflow-wrap:anywhere;");
  });

  it("lets the search field, the reefs' columns, a reef's scale and a tile's columns shrink with their container", () => {
    expect(CSS).toContain(".search input{flex:1;min-width:0;width:100%;");
    expect(CSS).toContain(".reefs{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(14rem,100%),1fr));");
    expect(CSS).toContain(".echelle{display:flex;gap:4px;margin:.2rem 0;min-width:0}");
    expect(CSS).toContain(".tile .rows.cols{grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr));");
  });

  it("puts one tile per row when the text is larger, in rem, and keeps two columns at 100 % on a 320 px phone", () => {
    expect(CSS).toContain("section:has(>ul.tiles){container-type:inline-size}");
    const rule = CSS.match(/@container \(max-width:([\d.]+)rem\)\{\.tiles\{grid-template-columns:minmax\(0,1fr\)\}\.tiles>li\.tile,\.tiles\.fit>li\.tile\{grid-column:auto\}\}/);
    expect(rule).not.toBeNull();
    // The grid of a 320 px phone is 288 px wide: at 16 px a rem, still two columns; at 24 px (150 %), one, even on a
    // 390 px phone (a 358 px grid).
    const px = Number(rule![1]) * 16;
    expect(px).toBeLessThan(288);
    expect(px * 1.5).toBeGreaterThan(390 - 32);
  });
});
