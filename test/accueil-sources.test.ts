import { describe, expect, it } from "vitest";
import { chiffres, inventaire } from "../src/chiffres.js";
import { toutesLesSources } from "../src/server.js";
import { chiffresPage } from "../src/web/chiffres.js";
import { homePage } from "../src/web/home.js";
import { meteoPage } from "../src/web/pages.js";

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-03T04:30:00Z");

describe("the footer's line to /chiffres, and the home page's lighter top", () => {
  it("gives the count of public sources that /chiffres gives, in the footer of every page, beside « nos valeurs »", () => {
    const n = chiffres(toutesLesSources(), undefined, NOW, 0).sources;
    expect(n).toBeGreaterThan(50);
    // The count /chiffres shows, read on its page.
    const lues = chiffresPage(ORIGIN, chiffres(toutesLesSources(), undefined, NOW, 0), inventaire(toutesLesSources())).match(/>(\d+)<\/a><span>sources publiques lues/)![1];
    expect(Number(lues)).toBe(n);
    for (const page of [homePage(ORIGIN, null, NOW), meteoPage(ORIGIN, null, NOW)]) {
      const foot = page.split('<footer class="foot')[1];
      expect(foot).toContain(`<a href="/valeurs">nos valeurs</a> · <a href="/chiffres">${n} sources publiques</a> · `);
      // The sites that do not answer, beside the guide to opening one's data (marketing, 04/11/2026).
      expect(foot).toContain(`<a href="/ouvrir-ses-donnees">ouvrir ses données</a> · <a href="/sites-sans-reponse">sites sans réponse</a> · `);
    }
  });

  it("keeps the title, the hook and the two buttons at the top of the home page, the assistant's to /mcp", () => {
    const home = homePage(ORIGIN, null, NOW);
    const txt = home.slice(home.indexOf('<div class="hero-txt">'), home.indexOf('<figure class="hero-map">'));
    expect(txt).toContain('<h1>La Réunion <span class="n974">974</span> en direct</h1>');
    expect(txt).toContain('<p class="hook">');
    expect(txt).toContain(`<p class="hero-cta"><a class="btn sun" href="#en-ce-moment">Voir l'île</a><a class="btn glass" href="/mcp">`);
    expect(txt).toContain("Brancher mon IA</a></p>");
    // The accounts, the Creole line, the count of sources and the figures went down to the footer or the tiles.
    for (const gone of ['class="social', 'class="slogan"', 'class="lead"', "sources publiques", "facts-live", "live-pill"]) expect(txt, gone).not.toContain(gone);
  });
});
