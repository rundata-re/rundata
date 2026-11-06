import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// The neutral grey of « pas de vigilance » and the orange of an average water quality (marketing, 06/11/2026): each read
// over 4.5:1, the grey under white text, the orange on the cards in both themes; the bars that used the grey keep their contrast.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const dark = CSS.slice(CSS.indexOf("@media (prefers-color-scheme:dark){:root{"));
const token = (css: string, name: string): string => {
  const v = css.match(new RegExp(`--${name}:([^;}]+)[;}]`))![1];
  if (v.startsWith("var(--")) return token(css.includes(`--${v.slice(6, -1)}:`) ? css : CSS, v.slice(6, -1));
  return v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v;
};

describe("the grey of « pas de vigilance »", () => {
  it("is #5f6b75 under white text, 5.46:1, in both themes", () => {
    expect(token(CSS, "vg0")).toBe("#5f6b75");
    expect(dark).not.toContain("--vg0:");
    expect(CSS).toContain(".vg{display:inline-block;font-weight:700;font-size:.9rem;border-radius:8px;padding:.1rem .6rem;color:#fff;background:var(--vg0)}");
    expect(ratio(token(CSS, "vg0"), "#ffffff")).toBeGreaterThan(5.4);
  });

  it("leaves the bars of /volcan and /electricite at least as visible as before, over 3:1 on their background", () => {
    expect(CSS).toContain(".qdays i{display:block;width:100%;background:var(--barre);");
    expect(CSS).toContain(".bars i{grid-column:1/-1;display:block;height:.55rem;border-radius:1rem;background:var(--barre)}.band .bars i{background:var(--barre-nuit)}");
    // On the cards: the darker grey in the light theme, the grey of before in the dark one; on the night band, the grey of before.
    expect(ratio(token(CSS, "barre"), token(CSS, "surface"))).toBeGreaterThan(5);
    expect(token(dark, "barre")).toBe("#7d8a94");
    expect(ratio(token(dark, "barre"), token(dark, "surface"))).toBeGreaterThan(4.5);
    expect(token(CSS, "barre-nuit")).toBe("#7d8a94");
    for (const css of [CSS, dark]) expect(ratio(token(CSS, "barre-nuit"), token(css, "night"))).toBeGreaterThan(4.5);
  });
});

describe("the orange of an average water quality", () => {
  it("is #c2410c in the light theme and #e8590c in the dark one, over 4.5:1 on the cards", () => {
    expect(CSS).toContain(".rows.eau .q-moyenne{color:var(--q-moyenne);font-weight:700}");
    expect(token(CSS, "q-moyenne")).toBe("#c2410c");
    expect(token(dark, "q-moyenne")).toBe("#e8590c");
    expect(ratio(token(CSS, "q-moyenne"), token(CSS, "surface"))).toBeGreaterThan(5);
    expect(ratio(token(dark, "q-moyenne"), token(dark, "surface"))).toBeGreaterThan(4.5);
  });
});
