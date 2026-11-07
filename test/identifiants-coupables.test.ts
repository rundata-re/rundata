import { describe, expect, it } from "vitest";
import * as boamp from "../src/providers/marches-publics.js";
import * as col from "../src/vie/collecte.js";
import { collectePage } from "../src/web/collecte.js";
import { buildDae } from "../src/web/data.js";
import { daePage, lienNom, soulignesCoupables } from "../src/web/domains.js";
import { marchesPage } from "../src/web/marches-publics.js";
import { CSS } from "../src/web/pages.js";
import { render } from "../src/web/publier.js";

// An identifier from a source, joined by « _ », goes to the next line after a « _ » only: Chrome and Safari cut
// « 2026_PORT_05 » into « 2026_POR » and « T_05 » at 160 px (a 320 px screen at 200 %).
const O = "https://rundata.re";
const NOW = new Date("2026-11-07T10:00:00Z");

describe("identifiers joined by « _ »", () => {
  it("get a <wbr> after each « _ » between two letters or digits, in a span without hyphenation, in the text only", () => {
    expect(soulignesCoupables("calendrier 2026_PORT_05 du TCO")).toBe('calendrier <span class="ident">2026_<wbr>PORT_<wbr>05</span> du TCO');
    expect(soulignesCoupables("DGFIP4_Trésorerie hospitalière")).toBe('<span class="ident">DGFIP4_<wbr>Trésorerie</span> hospitalière');
    // Never in a tag, nor a « _ » that joins nothing, nor a text without one.
    expect(soulignesCoupables('<a href="/x_y" title="a_b">c_d</a>')).toBe('<a href="/x_y" title="a_b"><span class="ident">c_<wbr>d</span></a>');
    expect(soulignesCoupables("_x, y_ et __")).toBe("_x, y_ et __");
    expect(soulignesCoupables("Fournaise, 1 km")).toBe("Fournaise, 1 km");
    // The words around keep their spaces, a no-break one included.
    expect(soulignesCoupables("Réf. MINT_BA974ATB-128439 ok")).toBe('Réf. <span class="ident">MINT_<wbr>BA974ATB-128439</span> ok');
    // No hyphen in it: Chrome 1248 and Safari hyphenate « Trésorerie » under 19.9 rem.
    expect(CSS).toContain(".ident{hyphens:manual;-webkit-hyphens:manual}");
  });

  it("keep a link's name whole in aria-label (Chrome names it with a space for each <wbr>)", () => {
    expect(lienNom("https://x.re/a.pdf", "calendrier 2026_PORT_05 du TCO (PDF)", ' rel="noopener"')).toBe(
      '<a href="https://x.re/a.pdf" rel="noopener" aria-label="calendrier 2026_PORT_05 du TCO (PDF)">calendrier <span class="ident">2026_<wbr>PORT_<wbr>05</span> du TCO (PDF)</a>',
    );
  });

  it("are cut after their « _ » on /collecte, /marches-publics, /defibrillateurs and in /publier's <code>", async () => {
    const cal = col.CALENDARS.find((c) => c.code.includes("_"))!;
    expect(collectePage(O, NOW)).toContain(`aria-label="calendrier ${cal.code} du TCO (PDF)">calendrier <span class="ident">${cal.code.replaceAll("_", "_<wbr>")}</span> du TCO (PDF)</a>`);

    const a: boamp.Avis = { id: "x", objet: "26DTP259_Travaux de dragage", acheteur: "Région Réunion", types: ["travaux"], parution: "2026-11-05", limite: "2026-12-08", lien: "https://www.boamp.fr/pages/avis/?q=idweb:x" };
    expect(marchesPage(O, { value: { nombre: 1, avis: [a], sources: [] }, fetchedAt: NOW, stale: false }, NOW)).toContain(
      '<a href="https://www.boamp.fr/pages/avis/?q=idweb:x" rel="noopener" aria-label="26DTP259_Travaux de dragage"><span class="ident">26DTP259_<wbr>Travaux</span> de dragage</a>',
    );

    const dae = daePage(O, { value: await buildDae(), fetchedAt: NOW, stale: false }, NOW);
    const names = [...dae.matchAll(/<li><span>(.*?)<small>/g)].map((m) => m[1]);
    expect(names.some((n) => n.includes('<span class="ident">'))).toBe(true);
    // Every name joined by « _ » gets it, its <wbr> after the « _ » only.
    expect(names.filter((n) => /[\p{L}\p{N}]_[\p{L}\p{N}]/u.test(n.replaceAll("_<wbr>", "")) && !n.includes("_<wbr>"))).toEqual([]);

    expect(render("- `date_debut` et `contact_public` ;")).toContain("<code><span class=\"ident\">date_<wbr>debut</span></code> et <code><span class=\"ident\">contact_<wbr>public</span></code>");
  });
});
