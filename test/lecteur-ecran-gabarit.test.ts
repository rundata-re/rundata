import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// What a screen reader gets from the shared CSS, checked in Chrome's accessibility tree on 24/11/2026: under 640 px a
// `display:none` head took the column headers out of the stacked tables, and the breadcrumb's « › » was read between links.
const narrow = CSS.slice(CSS.indexOf("@media (max-width:640px){table.niveaux"));

describe("screen readers and the shared CSS", () => {
  it("keeps the column headers of the stacked tables under 640 px, hidden from sight only", () => {
    expect(narrow).toMatch(/^@media \(max-width:640px\)\{table\.niveaux thead\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\);clip-path:inset\(50%\);white-space:nowrap\}/);
    expect(CSS).not.toMatch(/table\.niveaux thead\{display:none/);
    // The visible labels of the stacked cells stay.
    expect(narrow).toContain(`table.niveaux td::before{content:attr(data-label)`);
  });

  it("shows the breadcrumb's separator without reading it: empty alternative text, after a plain fallback for older browsers", () => {
    expect(CSS).toContain(`.crumbs li+li::before{content:"› ";content:"› " / "";opacity:.6}`);
  });
});
