import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// The home page's night sky drew its stars over the title: a white star under the « 974 » at 1024 px (2.02:1 at the
// worst pixel, 04/11/2026) and under the white words at 390, 820 and 1920 px. The stars now keep out of the text
// column, with one set per layout of the hero: below 58rem the text sits across the top, from 58rem it is the left
// column. The zones are the text column measured from 320 to 2560 px, in % of the hero, with a margin.
const rule = (start: string) => {
  const i = CSS.indexOf(start);
  return CSS.slice(i, CSS.indexOf("}", i) + 1);
};
const stars = (css: string) => [...css.matchAll(/radial-gradient\([\d.]+px [\d.]+px at ([\d.]+)% ([\d.]+)%,#fff,transparent\)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

describe("the stars of the home page's night sky", () => {
  const narrow = stars(rule(".sky-nuit::before{"));
  const wide = stars(rule("@media (min-width:58rem){.sky-nuit::before{"));

  it("switch layout where the hero does", () => {
    expect(CSS).toContain("@media (min-width:58rem){.hero-in{grid-template-columns:");
    expect(narrow).toHaveLength(9);
    expect(wide).toHaveLength(9);
  });

  it("stay below the text when it sits across the top", () => {
    // The text column goes down to 48.5 % of the hero at 320 px; the map's caption is centred at the bottom.
    for (const s of narrow) {
      expect(s.y).toBeGreaterThanOrEqual(52);
      expect(s.x > 15 && s.x < 85 && s.y > 86).toBe(false);
    }
  });

  it("stay out of the left column and the map's caption when the text is a column", () => {
    // The text column ends at 49.6 % across and runs from 18.4 % to 81.9 % down; the caption sits around 90 %.
    for (const s of wide) {
      expect(s.x < 52 && s.y > 15 && s.y < 86).toBe(false);
      expect(s.x > 52 && s.y > 85 && s.y < 96).toBe(false);
    }
  });

  it("leave the sky and the brand's yellow as they were", () => {
    expect(rule(".sky-nuit{")).toBe(".sky-nuit{--sky1:#030a14;--sky2:#0c2a4a;--glow:rgb(76 110 245/.25)}");
    expect(CSS).toMatch(/--sun:#ffcf1f;/);
    expect(CSS).toContain("{.sky-nuit::before{animation:twinkle 6s ease-in-out infinite alternate}}");
  });
});
