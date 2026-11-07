import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";
import { nobreak } from "../src/web/domains.js";

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
    expect(CSS).toContain("@container tuile (max-width:12rem){.th{flex-wrap:wrap}.th h3{order:1;flex:1 0 100%;hyphens:auto;-webkit-hyphens:auto}.th .go{margin-left:auto}}");
    // The figure no bigger than the tile allows, the same as before at 100 % (4.6vw is the smaller there); its word whole.
    expect(CSS).toContain(".tv{font:800 clamp(1.15rem,min(4.6vw,13cqi),1.5rem)/1.12 ");
    expect(CSS).toContain(".tv .nw{white-space:nowrap;overflow-wrap:normal;font-size:min(1em,12.5cqi)}");
  });

  it("never lets the closed menu or an address in the connector's steps widen the page", () => {
    expect(CSS).toContain(".menu:not([open])>.sheet{display:none}");
    expect(CSS).toContain(".tab a{font-weight:600;overflow-wrap:anywhere}");
  });

  it("puts the open menu's names in one column on a narrow screen with the text larger, two from 320 px at 100 %", () => {
    // In rem: 19.9 × 16 = 318 px at 100 %, so every phone keeps its two columns; 19.9 × 24 = 478 px at 150 %.
    expect(CSS).toContain("@media (max-width:19.9rem){.sheet .groupe{grid-template-columns:1fr}}");
    expect(19.9 * 16).toBeLessThan(320);
    expect(19.9 * 24).toBeGreaterThan(390);
    // After the two columns' rule, which it overrides at the same specificity.
    expect(CSS.indexOf("@media (max-width:19.9rem)")).toBeGreaterThan(CSS.indexOf(".sheet .groupe{grid-template-columns:repeat(auto-fill,"));
  });
});

// /coupures-eau and a commune's page on a 390 px phone with the text at 150 and 200 %: « La Plaine-des-Palmistes » kept on
// one line made the page 413 px wide; two folded elections one under the other overlapped their titles by 5 px.
describe("larger text on a narrow screen, on /coupures-eau and a commune's elections", () => {
  it("keeps a hyphenated name on one line at 100 %, and lets it break at its hyphens from 125 % on a phone", () => {
    expect(nobreak("La Plaine-des-Palmistes")).toBe('La <span class="nom">Plaine-des-Palmistes</span>');
    expect(CSS).toContain(".nom{white-space:nowrap}@media (max-width:19.9rem){.nom{white-space:normal}}");
    expect(19.9 * 16).toBeLessThan(320);
  });

  it("parts two folds of a card by as much as their titles reach past them, at any text size", () => {
    expect(CSS).toContain(".card>details>summary{cursor:pointer;list-style:none;display:block;min-height:44px;padding:.5rem 0;margin:-.5rem 0;");
    expect(CSS).toContain(".card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:1.3rem;display:grid;gap:.8rem;");
    expect(CSS).toContain(".card>details+details{margin-top:.2rem}");
    // Each title reaches .5rem past its fold, above and below: 1rem between two folds, the gap and the margin together.
    expect(0.8 + 0.2).toBe(2 * 0.5);
  });
});
