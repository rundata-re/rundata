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
});
