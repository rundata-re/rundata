import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { copieAncienne } from "../src/tools/copie-ancienne.js";
import { coupuresEau } from "../src/tools/coupures.js";
import { courantBlock, type CourantAnswer } from "../src/tools/courant.js";
import { copieBandeau, coupuresPage, electriciteCommune, electricitePage } from "../src/web/domains.js";
import { coupuresCommunePage } from "../src/web/coupures.js";
import { pageOf } from "../src/web/places.js";
import { CSS, icon } from "../src/web/pages.js";

// 23/11/2026 at 12:00 in La Réunion.
const NOW = new Date("2026-11-23T08:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const unescape = (t: string) => t.replace(/&#39;/g, "'");

// The banner, with the site's sign of a warning (as the other card.warn), beside its text: with no title in the card, the
// sign alone on a line of its own stood above the sentence.
const WARN = `<div class="card warn enligne">${icon("alert")}<p>`;
const EAU_PAGE = "Les avis de coupure d'eau affichés ici ont été lus le 23/11 à 09:30 et n'ont pas pu être relus depuis : une coupure terminée ou une nouvelle coupure peut ne pas y figurer.";

describe("the notices of cuts not read again for a while", () => {
  it("puts the warning's sign on the line of its text, in a column of its own", () => {
    expect(copieBandeau("Lu hier.", "Voir le site.")).toBe(`${WARN}Lu hier. Voir le site.</p></div>`);
    expect(copieBandeau(undefined)).toBe("");
    // The sign in the first column, the text in the second, which takes the rest and may shrink (a long address).
    expect(CSS).toContain(".warn.enligne{grid-template-columns:auto minmax(0,1fr);align-items:start}");
    // A warning with a title keeps its sign above it.
    expect(CSS).not.toMatch(/\.card\.warn\{[^}]*grid-template-columns/);
  });

  it("are said past 2 hours for the water, 6 hours for the power cuts, with the day and the hour of the read", () => {
    expect(copieAncienne("eau", ago(2), NOW, "page")).toBeUndefined();
    expect(copieAncienne("eau", ago(2.5), NOW, "page")).toBe(EAU_PAGE);
    expect(copieAncienne("courant", ago(5.9), NOW, "outil")).toBeUndefined();
    expect(copieAncienne("courant", ago(7), NOW, "outil")).toBe("Les avis de coupure de courant de cette réponse ont été lus le 23/11 à 05:00 et n'ont pas pu être relus depuis : une coupure terminée ou une nouvelle coupure peut ne pas y figurer.");
  });

  it("come first in the tool coupures_eau, for the island and for a commune", async () => {
    const store = new MemoryStore();
    const read = ago(3);
    await new Cache(store, () => read.getTime()).island("avis-eau:flux", 3600, async () => [{ de: "de runéo", site: "https://www.runeo.re", avis: [] }]);
    const c = new Cache(store, () => NOW.getTime());
    const isle = body(await coupuresEau(c, undefined, NOW));
    expect(Object.keys(isle)[0]).toBe("avertissement");
    expect(isle.avertissement).toBe("Les avis de coupure d'eau de cette réponse ont été lus le 23/11 à 09:00 et n'ont pas pu être relus depuis : une coupure terminée ou une nouvelle coupure peut ne pas y figurer. Voir le site du distributeur d'eau ou de la mairie.");
    const commune = body(await coupuresEau(c, "Saint-Paul", NOW));
    expect(Object.keys(commune)[0]).toBe("avertissement");
    // Read within the 2 hours: nothing said.
    const fresh = new Cache(store, () => ago(1.5).getTime());
    expect(body(await coupuresEau(fresh, undefined, ago(1.5)))).not.toHaveProperty("avertissement");
  });

  it("are said first in the tool electricite's cuts, the commune's mairie named, and on /electricite, never from the page's copy", () => {
    const value: CourantAnswer = { avis: [], lues: ["Saint-André"], indisponibles: [], sources: [] };
    const old = { value, fetchedAt: ago(7), stale: false };
    const tool = courantBlock(old, "Saint-André", NOW, true);
    expect(Object.keys(tool)[0]).toBe("avertissement");
    expect(tool.avertissement).toMatch(/^Les avis de coupure de courant de cette réponse ont été lus le 23\/11 à 05:00 .* Voir le site de la mairie de Saint-André, qui relaie les avis d'EDF\.$/);
    expect(courantBlock(old, undefined, NOW, true).avertissement).toMatch(/Voir le site de la mairie, qui relaie les avis d'EDF\.$/);
    expect(courantBlock({ ...old, fetchedAt: ago(5) }, undefined, NOW, true).avertissement).toBeUndefined();
    // The page's copy: no sentence of its own, the hour of the read only; the page says it at its view.
    const copy = courantBlock(old, undefined, ago(7));
    expect(copy.avertissement).toBeUndefined();
    const html = unescape(electricitePage("https://rundata.re", { value: { resume: "", avertissements: [], sources: [], coupures_annoncees: copy }, fetchedAt: ago(7), stale: false } as never, NOW));
    const section = html.slice(html.indexOf('id="coupures"'));
    expect(section).toContain(WARN + "Les avis de coupure de courant affichés ici ont été lus le 23/11 à 05:00 et n'ont pas pu être relus depuis : une coupure terminée ou une nouvelle coupure peut ne pas y figurer. Voir le site de la mairie, qui relaie les avis d'EDF.</p></div>");
    const recent = unescape(electricitePage("https://rundata.re", { value: { resume: "", avertissements: [], sources: [], coupures_annoncees: copy }, fetchedAt: ago(7), stale: false } as never, ago(5)));
    expect(recent).not.toContain("n'ont pas pu être relus");
  });

  it("are said under a commune's power cut in the tile's short form, its mairie's site linked above the tile's link", () => {
    const value: CourantAnswer = {
      avis: [{ commune: "Saint-André", titre: "Coupure", lien: "https://www.saint-andre.re/avis", publie: ago(30).toISOString(), nature: "programmée", secteurs: [], creneaux: [{ jour: "2026-11-24", de: "09:00", a: "12:00", secteurs: ["Rue A"] }] }],
      lues: ["Saint-André"], indisponibles: [], sources: [],
    } as never;
    const copy = courantBlock({ value, fetchedAt: ago(7), stale: false }, undefined, ago(7));
    const tile = electriciteCommune({ value: { resume: "", avertissements: [], sources: [], coupures_annoncees: copy }, fetchedAt: ago(7), stale: false } as never, "Saint-André", NOW);
    expect(unescape(tile.more ?? "")).toMatch(/^<p class="td all note">Avis lus le 23\/11 à 05:00, pas relus depuis\. À vérifier sur <a class="dessus" href="https:\/\/[^"]+" rel="noopener">le site de la mairie<\/a>\.<\/p>/);
    // Above the link that covers the whole tile (.tile h3 a::after), so that a touch opens the mairie's site.
    expect(CSS).toMatch(/\.dessus\{position:relative;z-index:2\}/);
  });

  it("are written in the page's ink and links inside the night band, whose text and links are white", () => {
    expect(CSS).toContain(".band .card.warn{color:var(--ink)}.band .card.warn a{color:var(--link)}");
  });

  it("are said first on /coupures-eau and a commune's page, the distributor's site linked, the mairie's when known", () => {
    const value = { resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: ["Saint-Paul"], avis: [] };
    const isle = unescape(coupuresPage("https://rundata.re", { value, fetchedAt: ago(2.5), stale: false } as never, NOW));
    expect(isle).toContain(`${WARN}${EAU_PAGE} Voir le site du distributeur d'eau ou de la mairie.</p></div>`);
    expect(unescape(coupuresPage("https://rundata.re", { value, fetchedAt: ago(1), stale: false } as never, NOW))).not.toContain("n'ont pas pu être relus");
    const page = unescape(coupuresCommunePage("https://rundata.re", pageOf("saint-paul")!, { coupures: { value, fetchedAt: ago(2.5) } } as never, NOW));
    const banner = page.slice(page.indexOf(`${WARN}Les avis de coupure`));
    expect(banner.slice(0, banner.indexOf("</div>"))).toMatch(new RegExp(`^${WARN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${EAU_PAGE} Voir le site de <a href="https://[^"]+" rel="noopener">La Créole</a> ou de la mairie de Saint-Paul\\.</p>$`));
    // The mairie's site linked where the site knows it (eau/distributeurs.ts LIENS).
    const etang = unescape(coupuresCommunePage("https://rundata.re", pageOf("l-etang-sale")!, { coupures: { value, fetchedAt: ago(2.5) } } as never, NOW));
    expect(etang).toContain(`<a href="https://www.letangsale.fr/" rel="noopener">la mairie de L'Étang-Salé</a>.</p></div>`);
  });
});
