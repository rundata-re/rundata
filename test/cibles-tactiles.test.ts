import { describe, expect, it } from "vitest";
import { annuaireEcolesPage } from "../src/web/ecoles-annuaire.js";
import { enfantsPage } from "../src/web/enfants.js";
import { CSS } from "../src/web/pages.js";

// Touch targets of 24 px at least at 320 and 390 px (WCAG 2.5.8), and no text under 12 px, without moving the page.
describe("touch targets and small texts", () => {
  it("grow the links of lists, tables, crumbs and the cyclone line by padding that moves no line", () => {
    expect(CSS).toContain(":is(.rows,.plain,table,.crumbs,.cyc) a:not([class]){padding-block:max(0px,calc(12.5px - .55em))}");
    expect(CSS).toContain(".cyc a{padding-inline:4px;margin-inline:-4px}");
  });

  it("grow the accounts' links and a hike's by padding their margin takes back, and never a summary under 24 px", () => {
    expect(CSS).toContain(".social a,.hike .links a{padding-block:2px;margin-block:-2px}");
    expect(CSS).toMatch(/(^|[}\n])summary\{min-height:24px\}/);
  });

  it("grow the link under an opened commune's title downwards, the title's tap area extended above it only", () => {
    expect(CSS).toContain(".card>details[open]>summary:has(+.kinds>p:first-child>a){padding-block:1rem 0;margin-block:-1rem 0}");
    expect(CSS).toContain(".kinds>p:first-child>a{padding-bottom:max(0px,calc(25px - 1.1em))}");
    // The rules hold for the link to the commune's page, first in the opened card, on /ecoles and on /enfants.
    for (const page of [annuaireEcolesPage("https://rundata.re"), enfantsPage("https://rundata.re", null)]) {
      expect(page).toMatch(/<\/summary><div class="kinds"><p><a href="\/(?:communes|enfants)\/saint-paul[#"]/);
    }
  });

  it("grow a trail's and a station's name, a closed trail and the footer's links, spaced so that no two areas overlap", () => {
    expect(CSS).toContain(".hike>h3>a,.st>h3>a,.hike .shut li>a,footer.foot p:not(.social) a{padding-block:max(0px,calc(12.5px - .55em))}");
    expect(CSS).toContain(".hike .shut ul,footer.foot p:not(.social):has(a){line-height:max(26px,1.5em)}");
    // The accounts' links, flex boxes, keep their own rule above.
    expect(CSS).not.toMatch(/footer\.foot p a\{/);
  });

  it("let the second account of a pair go under the first rather than widen the footer", () => {
    expect(CSS).toContain(".social .pair{display:inline-flex;flex-wrap:wrap;align-items:center;gap:inherit}");
  });

  it("set no font size under 12 px in the stylesheet", () => {
    const small: string[] = [];
    for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const d of rule[2].matchAll(/font(?:-size)?:[^;}]*?(\d*\.?\d+)(rem|px)\b/g)) {
        if (parseFloat(d[1]) * (d[2] === "px" ? 1 : 16) < 12) small.push(`${rule[1].trim()} ${d[0]}`);
      }
    }
    expect(small).toEqual([]);
    expect(CSS).toContain(".badge{display:inline-block;font:700 .75rem system-ui");
    expect(CSS).toContain(".menu summary .m{font:700 12px/1 system-ui");
    expect(CSS).toContain("table.passe small{font-size:.75rem}");
    expect(CSS).toContain("section.guide pre code{overflow-wrap:normal;font-size:1em}");
  });
});
