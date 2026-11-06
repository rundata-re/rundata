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

  it("puts a narrow tile's title on its own line, and keeps a tile's figure and its word inside the tile", () => {
    // Three columns at 768 px with the text at 150 %: the title beside the icon and the arrow was cut by the tile's edge.
    expect(CSS).toContain(".tile{container:tuile/inline-size}");
    expect(CSS).toContain("@container tuile (max-width:12rem){.th{flex-wrap:wrap}.th h3{order:1;flex:1 0 100%}.th .go{margin-left:auto}}");
    // The figure no bigger than the tile allows, the same as before at 100 % (4.6vw is the smaller there); its word whole.
    expect(CSS).toContain(".tv{font:800 clamp(1.15rem,min(4.6vw,13cqi),1.5rem)/1.12 ");
    expect(CSS).toContain(".tv .nw{white-space:nowrap;overflow-wrap:normal;font-size:min(1em,12.5cqi)}");
  });

  it("never lets the closed menu or an address in the connector's steps widen the page", () => {
    expect(CSS).toContain(".menu:not([open])>.sheet{display:none}");
    expect(CSS).toContain(".tab a{font-weight:600;overflow-wrap:anywhere}");
  });
});
