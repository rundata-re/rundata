import { describe, expect, it } from "vitest";
import { aProposPage } from "../src/web/a-propos.js";
import { signalDit } from "../src/web/domains.js";
import { SIGLES, withSigles } from "../src/web/sigles.js";

const TCO = '<abbr title="Territoire de la Côte Ouest">TCO</abbr>';

describe("the acronyms spelled out once per page", () => {
  it("spells out the first occurrence only, across the band and the main text", () => {
    const [band, main] = withSigles(["<h1>Collecte du TCO</h1>", "<p>Le TCO publie, l'ARS contrôle.</p><p>L'ARS encore.</p>"]);
    expect(band).toBe(`<h1>Collecte du ${TCO}</h1>`);
    expect(main).toBe('<p>Le TCO publie, l\'<abbr title="Agence régionale de santé">ARS</abbr> contrôle.</p><p>L\'ARS encore.</p>');
  });

  it("never touches attributes, scripts, drawings, comments, a name holding the acronym, or a longer word", () => {
    const html = '<a href="/tco" title="TCO" data-x="ARS">voir</a><script>const TCO = 1;</script><svg><text>TCO</text></svg><!-- TCO -->' +
      "<p>Géo'DAE, TCOX, ARSENAL</p>";
    expect(withSigles([html])[0]).toBe(html);
    // A tag whose attribute holds a « > » in quotes is read whole.
    expect(withSigles(['<p data-x="a>b">CMRS</p>'])[0]).toBe('<p data-x="a>b"><abbr title="Centre météorologique régional spécialisé (Météo-France La Réunion)">CMRS</abbr></p>');
  });

  it("lists every acronym in the « Sigles » section of /a-propos, and RECIL in marketing's words", () => {
    const page = aProposPage("https://rundata.re");
    expect(page).toContain('<h2 id="sigles">Sigles</h2>');
    for (const s of Object.keys(SIGLES)) expect(page).toContain(`>${s}</`);
    expect(page).toContain("<li><b>RECIL</b>\u00a0: le distributeur d'eau de Cilaos (d'après l'ARS)</li>");
  });

  it("says what EDF's « optimal » means, and keeps its other words", () => {
    expect(signalDit("Optimal")).toBe("optimal (le réseau électrique a de la marge)");
    expect(signalDit("Heures de pointe")).toBe("heures de pointe");
  });
});
