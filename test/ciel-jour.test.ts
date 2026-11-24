import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// The home page's « 974 », in the brand's yellow, over the daytime sky: the sky's lower half was too light under the
// bottom of its letters at 1024 px and wider (2.87:1 in the light theme, 3.07:1 in the dark one, measured at the worst
// pixel on 04/11/2026). The daytime sky keeps its deep blue down to 55 % of its height; the yellow does not change.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const rule = (sel: string) => CSS.slice(CSS.indexOf(`${sel}{`), CSS.indexOf("}", CSS.indexOf(`${sel}{`)) + 1);
const dark = CSS.slice(CSS.indexOf("@media (prefers-color-scheme:dark){:root{"));
const sun = (css: string) => css.match(/--sun:(#[0-9a-f]{6});/)![1];

describe("the daytime sky behind the home page's title", () => {
  const jour = rule(".sky-jour");
  const sky1 = jour.match(/--sky1:(#[0-9a-f]{6})/)![1];
  const mid = jour.match(/var\(--sky1\) 0%,(#[0-9a-f]{6}) 55%,var\(--sky2\) 100%/)![1];

  it("stays dark enough down to the bottom of the « 974 », over 3:1 for the brand's yellow in both themes", () => {
    expect(sun(CSS)).toBe("#ffcf1f");
    expect(sun(dark)).toBe("#ffd84d");
    // From the top down to 55 %, the sky goes from sky1 to the stop: the stop, the lighter of the two, is the worst.
    for (const yellow of [sun(CSS), sun(dark)]) {
      expect(ratio(yellow, sky1)).toBeGreaterThan(3);
      expect(ratio(yellow, mid)).toBeGreaterThan(3.3);
    }
  });

  it("changes the daytime sky only", () => {
    expect(rule(".sky-nuit")).toBe(".sky-nuit{--sky1:#030a14;--sky2:#0c2a4a;--glow:rgb(76 110 245/.25)}");
    expect(rule(".sky-aube")).toBe(".sky-aube{--sky1:#1b2452;--sky2:#d96b5a;--glow:rgb(255 190 120/.55)}");
    expect(rule(".sky-soir")).toBe(".sky-soir{--sky1:#231a52;--sky2:#e0703f;--glow:rgb(255 140 80/.5)}");
    expect(jour).toContain("--sky1:#0a5b9c;--sky2:#20a4c8;--glow:rgb(255 236 170/.35);");
  });
});

// The bottom of the home page's band, from 5:00 to 19:00 (accessibility audit of 24/11/2026): under the dawn, day and
// evening skies, the map's caption, its sources and « Brancher mon IA » were at 2.3 to 3.4:1. The skies stay the validated
// drawing; a night-blue veil goes under the caption, the button turns to dark glass (wording validated on 24/11/2026).
describe("the bottom of the home page's band under the light skies", () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const over = (top: number[], a: number, bottom: number[]) => top.map((t, i) => t * a + bottom[i] * (1 - a));
  const rgba = (css: string) => { const m = css.match(/rgb\((\d+) (\d+) (\d+)\/(\.\d+)\)/)!; return { c: [+m[1], +m[2], +m[3]], a: +m[4] }; };
  // The bottom of each light sky, lit by its glow at full strength: lighter than anywhere the caption sits.
  const bottoms = ["aube", "jour", "soir"].map((s) => {
    const r = rule(`.sky-${s}`);
    const glow = rgba(r.match(/--glow:(rgb\([^)]*\))/)![1]);
    return [s, over(glow.c, glow.a, hex(r.match(/--sky2:(#[0-9a-f]{6})/)![1]))] as const;
  });
  const white = [255, 255, 255];

  it("puts the caption and its sources on a veil, over 4.5:1 under each sky", () => {
    const veil = rgba(rule(".ile figcaption").match(/background:(rgb\([^)]*\))/)![1]);
    expect(rule(".ile figcaption")).toContain("color:#fff");
    const small = rgba(rule(".ile figcaption small").match(/color:(rgb\([^)]*\))/)![1]);
    for (const [s, bottom] of bottoms) {
      const bg = over(veil.c, veil.a, bottom);
      expect(ratio("#ffffff", toHex(bg)), s).toBeGreaterThan(4.5);
      expect(ratio(toHex(over(small.c, small.a, bg)), toHex(bg)), s).toBeGreaterThan(4.5);
    }
  });

  it("gives « Brancher mon IA » a dark glass, over 4.5:1 under each sky", () => {
    const glass = rgba(rule(".hero .btn.glass").match(/background:(rgb\([^)]*\))/)![1]);
    for (const [s, bottom] of bottoms) expect(ratio("#ffffff", toHex(over(glass.c, glass.a, bottom))), s).toBeGreaterThan(4.5);
  });

  it("keeps the other bands' glass buttons as they were", () => {
    expect(rule(".btn.glass,.band .btn.glass")).toContain("background:rgb(255 255 255/.12)");
  });

  it("writes the hook in white on the home page's band", () => {
    expect(CSS).toContain(".hero .hook{color:#fff}");
  });
});
