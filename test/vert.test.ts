import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// « Ouvert », « bonne », vigilance verte: one green for the site, darker in the light theme and lighter in the dark one,
// so that it reads over 4.5:1 in both (marketing, 04/11/2026: #237534 is 5.73:1 on white, #4cc765 7.84:1 on #0f1d2c).
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const token = (css: string, name: string) => {
  const h = css.match(new RegExp(`--${name}:(#[0-9a-f]{3}(?:[0-9a-f]{3})?)[;}]`))![1];
  return h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h;
};
const dark = CSS.slice(CSS.indexOf("@media (prefers-color-scheme:dark){:root{"));

describe("the site's green", () => {
  it("is one variable, #237534 in the light theme and #4cc765 in the dark one, each read over 4.5:1", () => {
    expect(token(CSS, "vert")).toBe("#237534");
    expect(token(dark, "vert")).toBe("#4cc765");
    // As text on the cards, and with its ink when it is a background (pills, markers).
    expect(ratio(token(CSS, "vert"), token(CSS, "surface"))).toBeGreaterThan(4.5);
    expect(ratio(token(CSS, "vert"), token(CSS, "vert-ink"))).toBeGreaterThan(4.5);
    expect(ratio(token(dark, "vert"), token(dark, "surface"))).toBeGreaterThan(4.5);
    expect(ratio(token(dark, "vert"), token(dark, "vert-ink"))).toBeGreaterThan(4.5);
  });

  it("is what « ouvert », « bonne », « Déjà lu » and the green vigilance use, the old greens gone", () => {
    for (const rule of [".hike .okay{font-size:.88rem;color:var(--vert)}", ".rows.eau .q-bonne{color:var(--vert);", ".etat.lu{background:var(--vert);color:var(--vert-ink);",
      ".vg1{background:var(--vg1);color:var(--vert-ink)}", "--vg1:var(--vert);", "--ren:var(--vert);"]) expect(CSS).toContain(rule);
    // The old greens, under 4.5:1 as text or under white (4.36 and 4.35), are gone from these rules.
    expect(CSS).not.toMatch(/color:#2b8a3e|background:#2b8a46|--vg1:#|--ren:#/);
  });

  it("leaves the alert colours as they are", () => {
    for (const t of ["--vg2:#ffd400", "--vg3:#f08a00", "--vg4:#c8231a", "--vg5:#6b2fa8", "--lave:#c0321f"]) expect(CSS).toContain(t);
  });
});
