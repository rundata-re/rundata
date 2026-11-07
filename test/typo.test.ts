import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { nombre } from "../src/tools/format.js";
import type { HikeCard } from "../src/web/data.js";
import { coupuresPage, hikeCard } from "../src/web/domains.js";
import { homePage } from "../src/web/home.js";
import { esc } from "../src/web/map.js";
import { CSS, layout } from "../src/web/pages.js";
import { site } from "../src/web/site.js";
import { typo } from "../src/web/typo.js";

const NOW = new Date("2026-10-24T04:00:00Z");
const ORIGIN = "https://rundata.re";

// The rule as marketing wrote it, the slow way: what is kept as written, then the prose between.
const KEPT = /<(script|style|pre|code|textarea)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
// typographie.ts' units, and its thousands: 1 to 3 figures not starting with 0, not after a decimal, a date, an hour, a
// « + », a letter or another figure (« 0 800 333 », « 2025 100 »).
const UNITS = "%|‰|°C|°|km\\/h|km²|km|m²|m³|mm|cm|m|GWh|MWh|MW|kWh|kW|hPa|€|h|min|nœuds|ha|µg\\/m³";
const slow = (t: string) =>
  t
    .replace(/(?<![\d,./:+\p{L}]|\d[ \u202f])[1-9]\d{0,2}(?:[ \u202f]\d{3})+(?!\d)/gu, (n) => n.replace(/ /g, "\u202f"))
    .replace(/ (?=[:;?!»])|(?<=«) |(?<=(?<!\p{L})[àÀ]) (?=\d)/gu, "\u00a0")
    .replace(new RegExp(`(?<=\\d) (?=(?:${UNITS})(?![\\p{L}\\d]))`, "gu"), "\u00a0");
const reference = (html: string) => html.replace(new RegExp(`${KEPT.source}|[^<]+`, "g"), (m) => (m.startsWith("<") ? m : slow(m)));
const kept = (html: string) => html.match(KEPT) ?? [];
const prose = (html: string) => html.replace(KEPT, "<>");
const jsonld = (html: string) => /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];

describe("French typography on the pages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts a no-break space before : ; ? ! » and after «, in the text only", () => {
    expect(typo("<h1>Après un cyclone : l'eau du robinet</h1>")).toBe("<h1>Après un cyclone : l'eau du robinet</h1>");
    expect(typo("<p>Il pleut ? Oui ! Ici ; là.</p>")).toBe("<p>Il pleut ? Oui ! Ici ; là.</p>");
    // A quotation keeps its words: only the spaces inside the marks change.
    expect(typo("<p>Le préfet dit « ne montez pas ! » ce soir.</p>")).toBe("<p>Le préfet dit « ne montez pas ! » ce soir.</p>");
    // The colon of an hour, URLs and the spaces already written by hand stay as they are.
    expect(typo("<p>Ouvert à 6:00, voir https://rundata.re/mer?ref=wa, 25\u202fkm, Titre\u00a0: déjà.</p>")).toBe("<p>Ouvert à\u00a06:00, voir https://rundata.re/mer?ref=wa, 25\u202fkm, Titre\u00a0: déjà.</p>");
  });

  it("holds « à » to the figure after it: an hour, a distance, an altitude, a capital « À » too", () => {
    expect(typo("<p>Lu le samedi 24/10 à 08:00.</p>")).toBe("<p>Lu le samedi 24/10 à\u00a008:00.</p>");
    expect(typo("<p>Station à 3 km, sommet à 2\u202f000 m.</p>")).toBe("<p>Station à\u00a03\u00a0km, sommet à\u00a02\u202f000\u00a0m.</p>");
    expect(typo("<p>À 14:00, coupure.</p>")).toBe("<p>À\u00a014:00, coupure.</p>");
    // Already no-break (U+00A0 or U+202F): left as it is, never doubled.
    expect(typo("<p>à\u00a008:00, à\u202f9:00</p>")).toBe("<p>à\u00a008:00, à\u202f9:00</p>");
    // Not the end of a word (« voilà 3 »), not before a word (« à pied »), and never in a tag or its attributes.
    expect(typo("<p>voilà 3 fois, à pied</p>")).toBe("<p>voilà 3 fois, à pied</p>");
    const tag = `<a href="/x?q=à 3" title="à 08:00" aria-label="à 3 km"><img alt="à 2 000 m"></a>`;
    expect(typo(tag)).toBe(tag);
    expect(typo(`<script>const s = "à 08:00";</script>`)).toBe(`<script>const s = "à 08:00";</script>`);
  });

  it("leaves the tags, their attributes, the comments, the scripts and the code as written", () => {
    const html = [
      `<meta name="description" content="Coupures : où ? quand !">`,
      `<a href="https://wa.me/?text=Mer : houle" title="Mer : houle">Mer : houle</a>`,
      `<script type="application/ld+json">{"name":"Mer : houle ?"}</script>`,
      `<script>const a = b ? c : d;</script>`,
      `<style>a :hover { color: red ; }</style>`,
      `<pre>x : y</pre><code>a ? b : c</code><textarea>Avis : rien</textarea>`,
      `<!-- note : interne -->`,
      `<img alt="Le volcan : en éruption">`,
    ].join("\n");
    const out = typo(html);
    expect(kept(out)).toEqual(kept(html));
    expect(out).toContain(">Mer : houle</a>");
    expect(out.match(/ /g)).toHaveLength(1);
  });

  it("does on real pages what the rule says, changing nothing but spaces", () => {
    for (const html of [homePage(ORIGIN, null, NOW), coupuresPage(ORIGIN, null, NOW)]) {
      const out = typo(html);
      expect(out).toBe(reference(html));
      expect(kept(out)).toEqual(kept(html));
      expect(jsonld(out)).toBe(jsonld(html));
      expect(out.replace(/[\u00a0\u202f]/g, " ")).toBe(html.replace(/[\u00a0\u202f]/g, " "));
      expect(prose(out)).not.toMatch(/ [:;?!»]|« /);
    }
  });

  it("puts the descriptions of the metas and of the JSON-LD in French typography, the no-break space itself, never the titles", () => {
    // As describe() gives it for /coupures-eau/la-plaine-des-palmistes (rundata.re, 25/10 18:17), under 160 characters.
    const title = "Coupure d'eau La Plaine-des-Palmistes : avis en cours · 974";
    const description = "La Plaine-des-Palmistes (974) : eau à ne pas boire ; 5 avis de CIREST / CISE Réunion en cours ou à venir, avec les rues, les heures et les consignes.";
    const jsonld = [{ "@type": "WebPage", name: title, description, url: "https://rundata.re/x?a=1&b=2", about: { "@type": "Place", description: "Est : la côte au vent" } }];
    const html = layout(ORIGIN, { title, description, path: "/coupures-eau/la-plaine-des-palmistes", jsonld }, "", "");
    const said = "La Plaine-des-Palmistes (974)\u00a0: eau à ne pas boire\u00a0; 5 avis de CIREST / CISE Réunion en cours ou à venir, avec les rues, les heures et les consignes.";
    for (const meta of ["name=\"description\"", "property=\"og:description\"", "name=\"twitter:description\""]) {
      const content = new RegExp(`<meta ${meta} content="([^"]*)">`).exec(html)![1];
      expect(content, meta).toBe(said);
      expect(content.length, meta).toBe(esc(description).length);
    }
    expect(html).not.toContain("&nbsp;");
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
    expect(ld).not.toContain("&nbsp;");
    const page = JSON.parse(ld);
    expect(page.description).toBe(said);
    expect(page.about.description).toBe("Est\u00a0: la côte au vent");
    // The titles keep their ordinary space, the same in the JSON-LD as in <title>; the other values are as written.
    expect(page.name).toBe(title);
    expect(page.url).toBe("https://rundata.re/x?a=1&b=2");
    expect(html).toContain(`<title>${esc(title)}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${esc(title)}">`);
  });

  it("serves /coupures-eau without an ordinary space before « : », the titles of its JSON-LD and metas as written", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("hors ligne");
    });
    const res = await site(new Request(`${ORIGIN}/coupures-eau`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW);
    const html = await res!.text();
    expect(prose(html)).not.toMatch(/ :/);
    expect(prose(html)).toMatch(/ :/);
    // The title's words as written in the JSON-LD and in the metas, with their ordinary space.
    expect(jsonld(html)).toMatch(/ : /);
    expect(html).toMatch(/<meta property="og:title" content="[^"]* : [^"]*">/);
    expect(html).not.toMatch(/<meta name="description" content="[^"]* [:;?!][^"]*">/);
  });

  // As a page is served: its spaces and its « rundata.re ».
  it("takes a fraction of a millisecond on a page of the site, and eight times as long on eight times the page", () => {
    const html = homePage(ORIGIN, null, NOW);
    const eight = html.repeat(8);
    for (let i = 0; i < 3; i++) typo(eight, true);
    // Each round times 8 passes over the page, then one pass over the page repeated 8 times: the same work, a few
    // milliseconds each, one right after the other, so the rest of the suite running in parallel weighs on both alike.
    // That work only ever adds time: the fastest of 12 rounds is the cost of typo itself, on each side.
    let one = Infinity;
    let big = Infinity;
    for (let r = 0; r < 12; r++) {
      let t = performance.now();
      for (let i = 0; i < 8; i++) typo(html, true);
      one = Math.min(one, (performance.now() - t) / 8);
      t = performance.now();
      typo(eight, true);
      big = Math.min(big, performance.now() - t);
    }
    // From 0.3 ms to 1.6 ms on the 130 kB home page, depending on the machine (a regular expression took twice as long).
    expect(one).toBeLessThan(3);
    // Linear in the page's length: eight times the page about eight times the time, where a quadratic pass would take 64
    // times as long. Measured 7.9 to 8.2 alone and 6.8 to 8.5 under two whole suites in parallel (5/11/2026); twice the
    // page had read 1.7 to 3.2 under load, too close to a bound of 3 to tell noise from a slow pass.
    expect(big / one).toBeLessThan(20);
  });
});

describe("the site's name in the prose", () => {
  const nom = (h: string) => typo(h, true);
  const S = '<span class="ident">rundata.re</span>';

  it("is put in a span without hyphenation, so that Safari never cuts it « runda-ta.re » at 160 px", () => {
    expect(nom("<p>Mettre rundata.re sur l'écran d'accueil.</p>")).toBe(`<p>Mettre ${S} sur l'écran d'accueil.</p>`);
    expect(nom("<p>Sur rundata.re. (rundata.re) «\u00a0rundata.re\u00a0»</p>")).toBe(`<p>Sur ${S}. (${S}) «\u00a0${S}\u00a0»</p>`);
    expect(nom("<aside>rundata.re</aside><abbr>rundata.re</abbr>")).toBe(`<aside>${S}</aside><abbr>${S}</abbr>`);
    expect(CSS).toContain(".ident{hyphens:manual;-webkit-hyphens:manual}");
  });

  it("goes to the next line after its « . » in an <h1>, where it is wider than its line at 160 px, not in an <h2>", () => {
    const T = '<span class="ident">rundata.<wbr class="adr">re</span>';
    expect(nom("<h1>Brancher rundata.re à votre IA</h1><p>rundata.re</p>")).toBe(`<h1>Brancher ${T} à votre IA</h1><p>${S}</p>`);
    expect(nom('<h1 id="x">Joindre <b>rundata.re</b></h1><h2>Ce que rundata.re promet</h2><header>rundata.re</header>')).toBe(
      `<h1 id="x">Joindre <b>${T}</b></h1><h2>Ce que ${S} promet</h2><header>${S}</header>`,
    );
    expect(nom(nom("<h1>rundata.re</h1>"))).toBe(`<h1>${T}</h1>`);
    // Its <wbr> seen under 19.9 rem only, as an address's.
    expect(CSS).toContain("wbr.adr{display:none}");
    expect(CSS).toContain("wbr.adr{display:inline}");
  });

  it("is left as written in a link, the title, an option, an SVG, the code and the attributes", () => {
    for (const h of [
      '<a href="https://rundata.re/" aria-label="rundata.re">rundata.re</a>',
      '<a href="/">voir <b>rundata.re</b></a>',
      "<title>Météo · rundata.re</title>",
      "<select><option>rundata.re</option></select>",
      '<svg viewBox="0 0 9 9"><title>rundata.re</title><text>rundata.re</text></svg>',
      "<code>rundata.re</code><pre>rundata.re</pre><script>s = \"rundata.re\";</script>",
      '<img alt="rundata.re" src="/a.png"><meta name="description" content="rundata.re">',
    ])
      expect(nom(h)).toBe(h);
    // After the link, the prose again.
    expect(nom('<a href="/">rundata.re</a> et rundata.re')).toBe(`<a href="/">rundata.re</a> et ${S}`);
  });

  it("is left as written in a path, an address or a longer name, and is put in its span once", () => {
    for (const h of [
      '<p>sur rundata.re/<wbr class="adr">associations.</p>',
      "<p>https://rundata.re, mcp.rundata.re, contact@rundata.re, rundata.reunion, rundata.re-x, rundata.re2</p>",
    ])
      expect(nom(h)).toBe(h);
    expect(nom(nom("<p>rundata.re</p>"))).toBe(`<p>${S}</p>`);
    // Only on a whole page: never in a text that goes in an attribute (the metas' description).
    expect(typo("<p>rundata.re</p>")).toBe("<p>rundata.re</p>");
  });

  it("changes nothing else on a real page", () => {
    const html = homePage(ORIGIN, null, NOW);
    const out = nom(html);
    expect(out).toContain(S);
    expect(out.replaceAll(S, "rundata.re").replaceAll('<span class="ident">rundata.<wbr class="adr">re</span>', "rundata.re")).toBe(typo(html));
    expect(jsonld(out)).toBe(jsonld(html));
  });
});

describe("numbers", () => {
  it("separates the thousands from 4 digits with a narrow no-break space, as toLocaleString fr-FR", () => {
    expect([999, 1000, 3210, 12_500.5, 410_000].map(nombre)).toEqual(["999", "1\u202f000", "3\u202f210", "12\u202f500,5", "410\u202f000"]);
  });

  it("holds a trail's climb and its top to their unit", () => {
    const card = { k: "pdn", nom: "Piton des Neiges", slug: "piton-des-neiges", km: 15.2, dplus: 1720, dmoins: 1720, alt_max: 3070, boucle: false, secteur: "Cilaos", fermes: [], inconnus: [], onf: 3 } as unknown as HikeCard;
    const html = hikeCard(card);
    expect(html).toContain("+1\u202f720\u00a0m");
    expect(html).toContain("jusqu&#39;à 3\u202f070\u00a0m");
    expect(html).not.toMatch(/\d \d{3}/);
  });
});
