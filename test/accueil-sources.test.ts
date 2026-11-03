import { describe, expect, it } from "vitest";
import { chiffres } from "../src/chiffres.js";
import { toutesLesSources } from "../src/server.js";
import { chiffresPage } from "../src/web/chiffres.js";
import { homePage } from "../src/web/home.js";

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-03T04:30:00Z");

describe("the home page's line to /chiffres and /valeurs", () => {
  it("gives the count of public sources that /chiffres gives, under the follow line, in the text of the hero", () => {
    const n = chiffres(toutesLesSources(), undefined, NOW, 0).sources;
    expect(n).toBeGreaterThan(50);
    // The count /chiffres shows, read on its page.
    const lues = chiffresPage(ORIGIN, chiffres(toutesLesSources(), undefined, NOW, 0)).match(/>(\d+)<\/a><span>sources publiques lues/)![1];
    expect(Number(lues)).toBe(n);
    const home = homePage(ORIGIN, null, NOW);
    const line = `<p class="hero-follow"><a href="/chiffres">${n} sources publiques</a> · <a href="/valeurs">nos valeurs</a></p>`;
    expect(home).toContain(line);
    const txt = home.slice(home.indexOf('<div class="hero-txt">'));
    expect(txt.indexOf('<p class="social hero-follow">')).toBeLessThan(txt.indexOf(line));
    expect(txt.indexOf(line)).toBeLessThan(txt.indexOf("</div>"));
  });
});
