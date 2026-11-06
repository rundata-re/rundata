import { describe, expect, it } from "vitest";
import type { Alerte } from "../src/web/data.js";
import { hasZones, zoneClavier, ZONES_SCRIPT } from "../src/web/defilement.js";
import { homePage } from "../src/web/home.js";
import { islandMap } from "../src/web/map.js";
import { layout, meteoPage, notFoundPage } from "../src/web/pages.js";

// Every page: « Aller au contenu » first, then the bar; the vigilance's band, the title's and the text in one main
// landmark. Before, 13 stops of Tab through the bar on each page, and the title outside any landmark on all 50 pages read.
const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-10-22T06:00:00Z");
const ALERTE = { couleur: 3, texte: "ALERTE CYCLONIQUE orange", ecoles: false, court: { cyclone: 3, prevue: false } } as Alerte;

const inMain = (html: string, what: string) => {
  const from = html.indexOf('<main id="contenu" tabindex="-1">');
  return from >= 0 && html.indexOf(what, from) > from && html.indexOf(what, from) < html.indexOf("</main>");
};

describe("the skip link and the main landmark", () => {
  for (const [name, html] of [
    ["the home page", homePage(ORIGIN, null, NOW)],
    ["/meteo", meteoPage(ORIGIN, null, NOW)],
    ["a page not found", notFoundPage(ORIGIN, "/nulle-part")],
  ] as const) {
    it(`${name}: « Aller au contenu » before anything else, to the main landmark, the title in it`, () => {
      const body = html.slice(html.indexOf("<body>"));
      expect(body).toMatch(/^<body>\n<a class="evite" href="#contenu">Aller au contenu<\/a>\n<header class="top">/);
      expect(html.match(/<main[ >]/g)).toHaveLength(1);
      expect(inMain(html, "<h1")).toBe(true);
      expect(inMain(html, '<div class="band')).toBe(true);
      // The page's text keeps its column and its spacing, in a block of its own.
      expect(inMain(html, '<div class="wrap corps">')).toBe(true);
      // The footer, the sharing and the review stay out: landmarks of their own.
      expect(html.indexOf("<footer")).toBeGreaterThan(html.indexOf("</main>"));
    });
  }

  it("keeps the vigilance's band first in the main landmark, above the title's", () => {
    const html = meteoPage(ORIGIN, null, NOW, ALERTE);
    const band = html.indexOf('<div class="alerte vg vg3"');
    expect(inMain(html, '<div class="alerte vg vg3"')).toBe(true);
    expect(band).toBeLessThan(html.indexOf('<div class="band'));
    expect(html.indexOf("</header>")).toBeLessThan(band);
  });

  it("names the sources at the end of a page as a region", () => {
    const html = meteoPage(ORIGIN, null, NOW);
    if (html.includes("fin-sources")) expect(html).toContain('<div class="wrap fin-sources" role="region" aria-label="Sources">');
  });
});

/** A zone as the script sees it: its widths, what it holds, its section. */
function zone(o: { scroll: number; client: number; tag?: string; link?: boolean; caption?: string; section?: { by?: string; title?: string } }) {
  const attrs = new Map<string, string>();
  const section = o.section && {
    getAttribute: (a: string) => (a === "aria-labelledby" ? (o.section!.by ?? null) : null),
    querySelector: () => (o.section!.title ? { textContent: o.section!.title } : null),
  };
  return {
    attrs,
    tagName: o.tag ?? "DIV",
    scrollWidth: o.scroll,
    clientWidth: o.client,
    getAttribute: (a: string) => attrs.get(a) ?? null,
    hasAttribute: (a: string) => attrs.has(a),
    setAttribute: (a: string, v: string) => void attrs.set(a, v),
    removeAttribute: (a: string) => void attrs.delete(a),
    querySelector: (s: string) => (s === "caption" ? (o.caption ? { textContent: ` ${o.caption} ` } : null) : o.link ? {} : null),
    closest: () => section ?? null,
  };
}
const run = (z: ReturnType<typeof zone>) => zoneClavier(z as unknown as Element);

describe("the zones that scroll sideways", () => {
  it("makes a table wider than its box a stop of Tab, a group named by its caption", () => {
    const z = zone({ scroll: 520, client: 288, caption: "De 2020 à 2025, par année" });
    run(z);
    expect(Object.fromEntries(z.attrs)).toEqual({ tabindex: "0", role: "group", "aria-label": "De 2020 à 2025, par année", "data-zone": "" });
  });

  it("takes it out of the Tab order again once it fits, the role and the name with it", () => {
    const z = zone({ scroll: 520, client: 288, caption: "Par domaine" });
    run(z);
    z.clientWidth = 900;
    z.scrollWidth = 900;
    run(z);
    expect(z.attrs.size).toBe(0);
  });

  it("leaves alone a zone that fits, or one a link or a button inside already reaches", () => {
    for (const z of [zone({ scroll: 288, client: 288, caption: "Par domaine" }), zone({ scroll: 520, client: 288, link: true, caption: "Sources" })]) {
      run(z);
      expect(z.attrs.size).toBe(0);
    }
  });

  it("names a zone without a caption by its section's title: the forecast's days, still a list, a code sample", () => {
    const days = zone({ scroll: 900, client: 288, tag: "UL", section: { by: "h-prev", title: "Prévision météo Cilaos" } });
    run(days);
    expect(days.attrs.get("aria-labelledby")).toBe("h-prev");
    expect(days.attrs.has("aria-label")).toBe(false);
    expect(days.attrs.has("role")).toBe(false);
    const code = zone({ scroll: 700, client: 288, section: { title: "Le flux iCalendar" } });
    run(code);
    expect(code.attrs.get("aria-label")).toBe("Le flux iCalendar");
    expect(code.attrs.get("role")).toBe("group");
  });

  it("gives no group without a name, only the stop of Tab", () => {
    const bare = zone({ scroll: 520, client: 288 });
    run(bare);
    expect(Object.fromEntries(bare.attrs)).toEqual({ tabindex: "0", "data-zone": "" });
  });

  it("is in the script of a page with such a zone only, with no function named inside", () => {
    expect(notFoundPage(ORIGIN, "/nulle-part")).not.toContain(ZONES_SCRIPT);
    const head = { title: "Chiffres", description: "Les chiffres", path: "/chiffres", jsonld: [] };
    expect(layout(ORIGIN, head, "", '<div class="card table-wrap"><table><caption class="sr">Par domaine</caption></table></div>')).toContain(`${ZONES_SCRIPT}</script>`);
    expect(hasZones('<div class="card table-wrap defile"><table>')).toBe(true);
    expect(hasZones('<ul class="days">')).toBe(true);
    expect(hasZones("<pre><code>")).toBe(true);
    expect(hasZones('<p class="holidays">')).toBe(false);
    expect(ZONES_SCRIPT).not.toContain("__name");
  });
});

describe("a map that holds links", () => {
  it("is a group, not an image, even with its links out of the Tab order (the schools' dots)", () => {
    const dots = '<g class="spots" aria-hidden="true"><a class="sp" href="#e-1" tabindex="-1"><circle r="4"/></a></g>';
    expect(islandMap({ overlay: dots, label: "Carte" })).toMatch(/<svg [^>]*role="group"/);
    expect(islandMap({ overlay: '<g class="kl"></g>', label: "Carte" })).toMatch(/<svg [^>]*role="img"/);
  });
});
