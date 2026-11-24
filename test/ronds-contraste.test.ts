import { describe, expect, it } from "vitest";
import { ROND } from "../src/web/carte-legende.js";

// The discs of /bornes, /velos and /eau hold a figure or a mark in white (map.ts, marker(); carte-legende.ts, legende()):
// each colour must read over 4.5:1 under it (WCAG 1.4.3), whatever the theme, since a disc keeps its colour on the map.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("the discs with a white figure", () => {
  it("are the site's green, grey and orange, each over 4.5:1 under white", () => {
    expect(ROND).toEqual({ vert: "#237534", gris: "#5f6b75", orange: "#c2410c" });
    for (const c of Object.values(ROND)) expect(ratio(c, "#ffffff")).toBeGreaterThan(4.5);
  });

  it("replace colours that did not (24/11/2026)", () => {
    for (const old of ["#2b8a3e", "#868e96", "#e8590c"]) expect(ratio(old, "#ffffff")).toBeLessThan(4.5);
  });
});
