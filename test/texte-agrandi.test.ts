import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";
import { FORMS_CSS } from "../src/web/formulaires-style.js";
import { ELECTRICITE_CSS } from "../src/web/electricite-carte.js";

// /air at 320 px with the text at 150 %: the language choice and the source list went past the screen; nothing moves at 100 %.
describe("larger text on a narrow screen", () => {
  it("lets the second language go under the first, in a pill whose radius is over half its one-line height", () => {
    expect(CSS).toContain(".lang{display:inline-flex;flex-wrap:wrap;gap:.2rem;padding:.2rem;border-radius:calc(1.1rem + 1px);");
    // Half the one-line height: the buttons' .88rem line and .4rem padding each side, the group's .2rem each side, its 1 px border.
    expect(CSS).toContain(".lang button{display:inline-flex;align-items:center;gap:.4rem;font:600 .88rem/1 system-ui,sans-serif;padding:.4rem .8rem;");
    expect((0.88 + 0.8 + 0.4) / 2).toBeLessThan(1.1);
  });

  it("breaks a word of a fact that does not fit on its line", () => {
    expect(CSS).toContain(".facts dd{margin:0;font:800 1.45rem/1.15 system-ui,sans-serif;overflow-wrap:anywhere;color:var(--ink)}");
  });

  it("grows the running text with the size the reader chose: 17 px at 100 %, 25.5 px at 150 %", () => {
    // In rem, as the headings: a body in px kept the running text at 17 px whatever the browser's text size.
    expect(CSS).toContain("body{margin:0;background:var(--bg);color:var(--ink);font:1.0625rem/1.6 system-ui,");
    expect(1.0625 * 16).toBe(17);
    expect(CSS).toContain(".menu summary .m{font:700 .75rem/1 system-ui,sans-serif}");
    expect(CSS).toContain(".fond-ia{position:absolute;top:.4rem;right:16px;margin:0;font-size:.75rem;");
    // Every font size left in px is a map's or a chart's, drawn in its SVG's units, which grow with the drawing.
    const px = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((r) => /font(?:-size)?:[^;}]*\b\d+(?:\.\d+)?px/.test(r[2]))
      .map((r) => r[1].trim());
    expect(px.filter((s) => !/^\.(map|wxmap|profile|ch|mlg|kmapc)\b/.test(s))).toEqual([]);
  });

  it("lets /meteo's choice of a commune go under its word and shrink to the screen, at 320 px with the text at 150 %", () => {
    // Its longest commune, at 25.5 px, made the station tools 346 px wide: the page went 42 px past the screen.
    expect(CSS).toContain(".sttools{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;margin-bottom:.8rem;min-width:0}");
    expect(CSS).toContain(".sttools label{min-width:0;max-width:100%}.sttools select{max-width:100%;");
  });
});

// The sitemap at 390 px with the text at 150 % and 200 % (200 %: WCAG 1.4.4): 34 renders went past the screen, through a
// word longer than its line (an e-mail address, an offer's reference) widening its section's implicit column, or a row's
// date squeezing the name beside it to nothing.
describe("text at 150 and 200 % on a 390 px phone", () => {
  it("cuts a word longer than its line inside its box, a section, a card or a heading block being one column its width", () => {
    expect(CSS).toContain("font-variant-numeric:tabular-nums;overflow-wrap:break-word}");
    expect(CSS).toContain(":where(section,.card,.pitch,.sec-h,.fil-l){grid-template-columns:minmax(0,1fr)}");
    // A table's frame scrolls: its cells keep their words whole.
    expect(CSS).toContain("th,td,:is(th,td) .note{overflow-wrap:normal}");
  });

  it("hyphenates, and puts a row's date, an hour or an air level's word on its own line, only from 125 % on a phone", () => {
    const at = CSS.indexOf("@media (max-width:19.9rem){body{hyphens:auto;-webkit-hyphens:auto}");
    expect(at).toBeGreaterThan(-1);
    const block = CSS.slice(at, CSS.indexOf(".kzoom,.btn{flex-wrap:wrap}}", at));
    expect(block).toContain(".minuit li{grid-template-columns:minmax(0,1fr)}");
    expect(block).toContain(":is(.rows.eau,.rows.bornes,.rows.velos,.rows.bikes) li>:last-child:not(:first-child){grid-column:1/-1}");
    expect(block).toContain(".rows:not(.eau,.bornes,.velos,.bikes) li>.note:last-child:not(:first-child){grid-column:2/-1}");
    expect(block).toContain(".scale li{grid-template-columns:minmax(0,1fr)}");
    // 19.9 em is 318 px at 100 %: under any phone, so nothing moves at the browser's default size.
    expect(19.9 * 16).toBeLessThan(320);
  });

  it("gives a commune's chips the page's gutter, never more, and lets a row's title share its line with a long date", () => {
    expect(CSS).toContain(".kchips{display:flex;gap:.4rem;margin:0 -16px .8rem;padding:0 16px .2rem;");
    expect(CSS).toContain(".rows.eau li{grid-template-columns:minmax(0,1fr) fit-content(60%)}");
    expect(CSS).toContain(".minuit li{display:grid;grid-template-columns:5.2rem minmax(0,1fr);");
  });

  it("shrinks a tool's column to the screen and lets the map's power legend go on two lines", () => {
    // 16 rem is 384 px at 150 %, wider than the 358 px of a 390 px phone's column.
    expect(FORMS_CSS).toContain("grid-template-columns:repeat(auto-fill,minmax(min(16rem,100%),1fr))}");
    expect(ELECTRICITE_CSS).toContain(".iprw{display:flex;flex-wrap:wrap;align-items:center;");
  });
});
