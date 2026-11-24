import { describe, expect, it } from "vitest";
import { ask, credits, placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { INSTALL } from "../src/web/pwa.js";

const O = "https://rundata.re";
const NOW = new Date("2026-10-24T14:42:00Z");
// The page's text as the search engines read it: no <template>'s content, as no script's, style's or svg's.
const text = (html: string) => html.replace(/<(template|script|style|svg)\b[\s\S]*?<\/\1>/g, " ");

describe("the template of every page, lighter by its repeated words", () => {
  it("keeps the install steps in a <template>, out of the page's text, copied by the script where it showed them", () => {
    const html = placePage(O, pageOf("cilaos")!, null, NOW);
    expect(INSTALL.startsWith('<template id="inst-t"><div class="card inst" id="inst" hidden>')).toBe(true);
    expect(INSTALL.endsWith("</div></template>")).toBe(true);
    // A second-level heading: on the bus pages it comes right after the h1, and a h3 there skipped a level.
    expect(INSTALL).toContain("<h2>rundata.re sur votre écran d'accueil</h2>");
    expect(INSTALL).not.toContain("<h3>");
    expect(html).toContain(INSTALL);
    expect(text(html)).not.toContain("rundata.re sur votre écran d'accueil");
    expect(text(html)).not.toContain("Faites défiler les options");
    // Copied into the page before the block is shown, only when it would be.
    expect(html).toContain(`if(Date.now()-later>30*864e5){tpl.replaceWith(tpl.content.cloneNode(true));const inst=document.getElementById("inst");`);
  });

  it("writes the question to the assistants in the language shown only, the other in a <template> the switch copies", () => {
    const box = ask("Ka i pass ?", "Que se passe-t-il ?");
    expect(box).toContain('<div data-l="rcf" lang="rcf"><p class="askt">Domann out IA</p>');
    expect(box).toContain('<template data-tl="fr"><div data-l="fr" lang="fr"><p class="askt">Demandez à votre IA</p>');
    expect(text(box)).not.toContain("Que se passe-t-il");
    expect(text(box)).toContain("Ka i pass");
    // Never a data-l on the <template>: the grid of .askbox>[data-l] would show it as an empty row.
    expect(box).not.toMatch(/<template data-l=/);
    const html = placePage(O, pageOf("cilaos")!, null, NOW);
    expect(html).toContain('if(bind){majOn(d);copieOn(d)}');
    expect(html).toContain("askl(b.dataset.askl,true)");
  });

  it("lists the categories once, in the menu, not again in the footer", () => {
    const html = placePage(O, pageOf("cilaos")!, null, NOW);
    expect(html).not.toContain('<ul class="pages"');
    expect(html.slice(html.indexOf("<footer"))).not.toContain('href="/volcan"');
    expect(html.slice(0, html.indexOf("<main"))).toContain('href="/volcan"');
  });

  it("names every source with its licence, the sources of one licence together, a licence with its own terms apart", () => {
    const lo = "Licence Ouverte Etalab 2.0";
    const said = credits([
      { source: "Stations Météo-France", licence: lo, attribution: "" },
      { source: "Indice ATMO", licence: "ODbL 1.0", attribution: "" },
      { source: "EDF SEI", licence: lo, attribution: "" },
      { source: "Vigilance", licence: `${lo} ; Météo-France La Réunion : bulletin affiché tel quel, avec son accord écrit`, attribution: "" },
    ]);
    expect(said).toBe(`Stations Météo-France, EDF SEI (${lo}) ; Indice ATMO (ODbL 1.0) ; Vigilance (${lo} ; Météo-France La Réunion : bulletin affiché tel quel, avec son accord écrit)`);
  });

  it("says a licence with its own terms once only for sources under that same text, which then binds each of them", () => {
    const sr = "Reprise soumise à son accord écrit : chaque événement cité avec son lien";
    const said = credits([
      { source: "Club A", licence: sr, attribution: "" },
      { source: "Club B", licence: `${sr} du 02/11/2026`, attribution: "" },
      { source: "Club C", licence: sr, attribution: "" },
    ]);
    expect(said).toBe(`Club A, Club C (${sr}) ; Club B (${sr} du 02/11/2026)`);
  });
});
