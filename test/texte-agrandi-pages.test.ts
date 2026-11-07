import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nobreak } from "../src/web/domains.js";
import { adressesCoupables, credits, CSS, lienAdresse } from "../src/web/pages.js";

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

  it("cuts an address written out after a « / » or a « . », and a copy of it is still the address", () => {
    // overflow-wrap:anywhere filled each line up to its last letter: « https://rundata.re/coupur | es-eau ».
    expect(adressesCoupables("Lis https://rundata.re/coupures-eau é di amwin.")).toBe("Lis https://<wbr>rundata.<wbr>re/<wbr>coupures-eau é di amwin.");
    expect(adressesCoupables("REFMAR. http://dx.doi.org/10.17183/REFMAR#RONIM")).toBe("REFMAR. http://<wbr>dx.<wbr>doi.<wbr>org/<wbr>10.<wbr>17183/<wbr>REFMAR#RONIM");
    // An address without its scheme, an ellipsis kept whole, the text around escaped.
    expect(adressesCoupables("🇫🇷 www.ipgp.fr/volcanoweb/r... & <b>")).toBe("🇫🇷 www.<wbr>ipgp.<wbr>fr/<wbr>volcanoweb/<wbr>r... &amp; &lt;b&gt;");
    expect(adressesCoupables("https://x.re/a?b=1&c=2")).toBe("https://<wbr>x.<wbr>re/<wbr>a?b=1&amp;c=2");
    // A text without an address: escaped, nothing more.
    expect(adressesCoupables("Saint-Denis, l'été.")).toBe("Saint-Denis, l&#39;été.");
    expect(credits([{ source: "©\u00a0www.departement974.fr - Département de La Réunion", licence: "Information publique", attribution: "" }])).toBe(
      "©\u00a0www.<wbr>departement974.<wbr>fr - Département de La Réunion (Information publique)",
    );
  });

  it("cuts a link written as its address after a « / », a « . » or a « @ », and names it by its address", () => {
    // Chrome names a link with a space for each <wbr> (« rundata. re/ actualites »): aria-label holds the address.
    expect(lienAdresse("https://rundata.re/actualites", "rundata.re/actualites")).toBe(
      '<a href="https://rundata.re/actualites" aria-label="rundata.re/actualites">rundata.<wbr>re/<wbr>actualites</a>',
    );
    expect(lienAdresse("mailto:contact@rundata.re", "contact@rundata.re", ' class="x"')).toBe(
      '<a href="mailto:contact@rundata.re" class="x" aria-label="contact@rundata.re">contact@<wbr>rundata.<wbr>re</a>',
    );
  });

  it("keeps a hyphenated name whole on its line, and breaks it at its hyphens only when it is longer than the line", () => {
    // « La Plaine-des-Palmistes » kept whole by white-space:nowrap made /coupures-eau 413 px wide at 200 %.
    expect(nobreak("La Plaine-des-Palmistes")).toBe('La <span class="nb">Plaine-des-Palmistes</span>');
    expect(CSS).toContain(".nb{display:inline-block;max-width:100%;text-decoration:inherit}");
  });
});

// /coupures-eau and a commune's page on a 390 px phone with the text at 150 and 200 %: « La Plaine-des-Palmistes » kept on
// one line made the page 413 px wide; two folded elections one under the other overlapped their titles by 5 px.
describe("larger text on a narrow screen, on /coupures-eau and a commune's elections", () => {
  it("keeps a hyphenated name whole while it fits its line, even with the text at 200 % on a phone (.nb)", () => {
    // « Saint-Leu » stays whole at any size; « La Plaine-des-Palmistes » breaks at its hyphens only where it is longer
    // than a card's line. No rule lets every hyphenated name break once the text is larger.
    expect(nobreak("Saint-Leu, La Plaine-des-Palmistes")).toBe('<span class="nb">Saint-Leu</span>, La <span class="nb">Plaine-des-Palmistes</span>');
    expect(CSS).not.toMatch(/\.nom\{/);
  });

  it("parts two folds of a card by as much as their titles reach past them, at any text size", () => {
    expect(CSS).toContain(".card>details>summary{cursor:pointer;list-style:none;display:block;min-height:44px;padding:.5rem 0;margin:-.5rem 0;");
    expect(CSS).toContain(".card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:1.3rem;display:grid;gap:.8rem;");
    expect(CSS).toContain(".card>details+details{margin-top:.2rem}");
    // Each title reaches .5rem past its fold, above and below: 1rem between two folds, the gap and the margin together.
    expect(0.8 + 0.2).toBe(2 * 0.5);
  });
});

// A tool's name written in a <code> (« sources_donnees ») is one word for the browser: French hyphenation does not cut it
// at its « _ », so at 200 % overflow-wrap cut it anywhere (« sources_donne | es »). Read in the source, so that a name
// written later is checked too.
describe("a tool's name in a <code>, with the text at 200 %", () => {
  it("can go to the next line after each « _ » and nowhere else", () => {
    const dir = new URL("../src/web/", import.meta.url);
    const noms = readdirSync(dir).filter((f) => f.endsWith(".ts")).flatMap((f) =>
      [...readFileSync(new URL(f, dir), "utf8").matchAll(/<code>([^<$]*_(?:[^<$]|<wbr>)*)<\/code>/g)].map((m) => `${f} ${m[1]}`),
    );
    expect(noms.length).toBeGreaterThanOrEqual(8);
    expect(noms.filter((x) => /_(?!<wbr>)/.test(x))).toEqual([]);
  });

  it("is never hyphenated: French hyphenation would cut « donnees » once alone after the « _ »", () => {
    expect(CSS).toContain("@media (max-width:19.9rem){body{hyphens:auto;-webkit-hyphens:auto}code,#jours h3,h2>time{hyphens:manual;-webkit-hyphens:manual}.jm{white-space:normal}");
  });

  it("lets a day's month go to the next line, whole, in the titles of /evenements and /nouveautes", () => {
    // Out of the block (390 px at 100 %, a wide screen), « 10 novembre » stays on one line (marketing); in it, where it can
    // be wider than the title's line, the month goes to the next line, never cut with or without a hyphen.
    const bloc = CSS.slice(CSS.indexOf("@media (max-width:19.9rem){body{hyphens:auto"));
    expect(bloc.slice(0, bloc.indexOf("}}") + 2)).toContain("code,#jours h3,h2>time{hyphens:manual;-webkit-hyphens:manual}.jm{white-space:normal}");
    expect(CSS.indexOf(".jm{white-space:nowrap}")).toBeLessThan(CSS.indexOf(".jm{white-space:normal}"));
  });
});
