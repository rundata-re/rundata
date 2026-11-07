import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// A 320 px phone with the text at 200 %: /meteo was 352 px wide, the home page 333 px; each block now inside its column.
describe("three blocks that widened the page at 320 px with the text at 200 %", () => {
  it("never makes a weather station wider than the list (10.5 rem is 336 px at 200 %, the list 288 px)", () => {
    expect(CSS).toContain("#stl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(10.5rem,100%),1fr));gap:.6rem}");
  });

  it("keeps the weather map's scale inside its caption: the bar shrinks, down to 1.5 rem, the values stay whole", () => {
    expect(CSS).toContain(".wxmap .lgs{display:inline-flex;align-items:center;gap:.35rem;margin-right:.5rem;white-space:nowrap;max-width:100%}");
    expect(CSS).toContain(".wxmap .lgs .vgrad{min-width:1.5rem}");
  });

  it("gives the home page's news a column no wider than its card, a word longer than the line cut rather than the page widened", () => {
    expect(CSS).toContain(".now-news ul.plain{grid-template-columns:minmax(0,1fr)}");
  });
});
