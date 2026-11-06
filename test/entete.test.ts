import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// The header's « Menu » button never shrinks. At 320 px it ended 14 px past the margin, cut with a fallback font, and
// off the screen with the browser's text at 125 or 150 %. The bar wraps, so the button stays on the screen, and below
// 352 px it is tighter, so it stays on one line at 320 px when the title font is loaded.
describe("en-tête étroit", () => {
  it("lets the bar wrap rather than push the « Menu » button off the screen", () => {
    expect(CSS).toMatch(/\.bar\{display:flex;flex-wrap:wrap;/);
  });

  it("tightens the bar and the « Mon IA » button below 352 px, after their own rules so it wins", () => {
    const narrow = "@media (max-width:351px){.bar{gap:.35rem}.cta-ia{padding-inline:.6rem}}";
    expect(CSS).toContain(narrow);
    expect(CSS.indexOf(narrow)).toBeGreaterThan(CSS.indexOf(".cta-ia{display:inline-flex;"));
    expect(CSS.indexOf(narrow)).toBeGreaterThan(CSS.indexOf(".bar{display:flex;"));
  });
});
