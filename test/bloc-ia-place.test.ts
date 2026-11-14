import { describe, expect, it } from "vitest";
import { communePage } from "../src/web/commune.js";
import { airPage, volcanPage } from "../src/web/domains.js";
import { feuxPage } from "../src/web/feux.js";
import { ask, askAfterData, meteoPage, seaPage, vigilancePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

// The question to an assistant (« Domann out IA ») after the page's first block of data, by one rule in layout(), and
// none on the emergency pages /vigilance and /feux (UX review, 04/11/2026).
const O = "https://rundata.re";
const NOW = new Date("2026-11-06T15:30:00Z");
const box = ask("Kosa i spas ?", "Que se passe-t-il ?");
const at = (html: string, s: string) => html.indexOf(s);
const band = (html: string) => html.slice(at(html, '<div class="band'), at(html, '<div class="wrap corps">'));
const text = (html: string) => html.slice(at(html, '<div class="wrap corps">'), at(html, "</main>"));

describe("the question to an assistant", () => {
  it("goes after the band when the band shows a map on a phone too, unchanged, leaving no empty line", () => {
    const written = `<div class="pitch">\n    <h1>Titre</h1>\n    ${box}\n  </div>\n  <figure class="card mapcard">carte</figure>`;
    const [b, m] = askAfterData(written, `<section id="un">un</section>\n<section id="deux">deux</section>`);
    expect(b).toBe(`<div class="pitch">\n    <h1>Titre</h1>\n  </div>\n  <figure class="card mapcard">carte</figure>`);
    expect(m).toBe(`${box}\n<section id="un">un</section>\n<section id="deux">deux</section>`);
  });

  it("goes after the main text's first block when the band's map is hidden on a phone, or there is none", () => {
    const main = `<section id="un"><section id="dedans">x</section></section>\n<section id="deux">deux</section>`;
    for (const figure of ['<figure class="card mapcard nophone">carte</figure>', ""]) {
      const [b, m] = askAfterData(`<div class="pitch">\n    ${box}\n  </div>\n  ${figure}`, main);
      expect(b).not.toContain("askbox");
      expect(m).toBe(`<section id="un"><section id="dedans">x</section></section>\n${box}\n<section id="deux">deux</section>`);
    }
  });

  it("stays where a page put it in the main text", () => {
    const main = `<section id="un">un</section>\n${box}`;
    expect(askAfterData('<div class="pitch"><h1>Titre</h1></div>', main)).toEqual(['<div class="pitch"><h1>Titre</h1></div>', main]);
  });

  it("is in no band, and follows the band's map on /air and /mer", () => {
    for (const [html, first] of [[airPage(O, null, NOW), "<section"], [seaPage(O, null, NOW), "<section"]]) {
      expect(band(html)).not.toContain('class="askbox"');
      expect(band(html)).toContain("<figure");
      const t = text(html);
      expect(at(t, '<div class="askbox">')).toBeGreaterThan(0);
      expect(at(t, '<div class="askbox">')).toBeLessThan(at(t, first));
    }
  });

  it("is after <main> on the head pages (/meteo, the communes), in the aside, its Creole question as written", () => {
    const st = { nom: "Saint-Denis-Gillot", source: "meteofrance", lon: 55.52, lat: -20.89, altitude_m: 10, time: "2026-11-06T15:24:00Z", stale: false, temperature: 26.1 };
    const meteo = meteoPage(O, { value: { stations: [st], toutes: [st], sources: [], indisponibles: [], mer: [] }, fetchedAt: NOW, stale: false } as never, NOW);
    const commune = communePage(O, pageOf("saint-paul")!, { place: null } as never, NOW);
    for (const html of [meteo, commune]) {
      expect(band(html)).not.toContain('class="askbox"');
      expect(text(html)).not.toContain('class="askbox"');
      expect(html.slice(at(html, "</main>"))).toContain('<div class="askbox">');
    }
    // The Creole question as written, in French typography.
    expect(meteo).toContain("Gèt bann mézir an dirèk si <span class=\"adrweb\">https://<wbr>rundata.<wbr>re/<wbr>meteo</span> é di amwin lèr la mézir.");
  });

  it("is after <main> on /volcan without an alert, in the aside, as on the head pages", () => {
    const html = volcanPage(O, null, NOW);
    expect(band(html)).not.toContain('class="askbox"');
    expect(text(html)).not.toContain('class="askbox"');
    expect(html.slice(at(html, "</main>"))).toContain('<div class="askbox">');
  });

  it("is not on /vigilance nor on /feux", () => {
    expect(vigilancePage(O, null, NOW)).not.toContain('class="askbox"');
    expect(feuxPage(O, { fires: null, sentiers: null } as never, NOW)).not.toContain('class="askbox"');
  });
});
