import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

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
