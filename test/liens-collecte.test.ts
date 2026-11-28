import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCirest,
  parseCirestEvenements,
  parseDrupalNews,
  parseIntraMuros,
  parseOpenAgenda,
  parseRss,
  parseSaintBenoit,
  parseSportsregions,
  parseTco,
  parseTribe,
  parseWpNews,
  servis,
  type Agenda,
  type Evenement,
} from "../src/providers/agenda.js";
import { office } from "../src/providers/annuaire.js";
import { parse as communiquesTco } from "../src/providers/tco-communiques.js";

/**
 * A link a source gives is kept only when it is the web's (http or https), where it is read: a source whose links were
 * changed to « javascript:… » gives its events without a link, its releases not at all. The pages check them again
 * (web/html.ts `href`, test/injection.test.ts).
 */
const J = " JavaScript:alert(3)";
const fixture = (f: string) => readFileSync(new URL(`./fixtures/agenda/${f}`, import.meta.url), "utf8");
const at = (iso: string) => new Date(`${iso}+04:00`);

/** The links read: some, none a script's, and the trapped ones left empty. */
function sansScript(liens: string[]) {
  expect(liens.length).toBeGreaterThan(0);
  for (const l of liens) expect(l).not.toMatch(/^\s*javascript:/i);
  expect(liens).toContain("");
}

/** `v` with the texts under the keys `cles` replaced by J, at every depth. */
function piege<T>(v: T, cles: Set<string>): T {
  if (Array.isArray(v)) return v.map((x) => piege(x, cles)) as T;
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cles.has(k) && typeof x === "string" ? J : piege(x, cles)])) as T;
  return v;
}

/** An RSS or Atom feed whose items' links are J (the channel's own link too). */
const liensRss = (xml: string) => xml.replace(/<link>[^<]*<\/link>/g, `<link>${J}</link>`);

describe("an event's link, read only when it is the web's", () => {
  it("in The Events Calendar's agendas (a mairie's, the volley-ball league's)", () => {
    sansScript(parseTribe(piege(JSON.parse(fixture("tribe_saint-paul.json")), new Set(["url"])), "Mairie de Saint-Paul", "Saint-Paul").map((e) => e.lien));
  });

  it("in OpenAgenda's", () => {
    sansScript(parseOpenAgenda(piege(JSON.parse(fixture("openagenda_cinor.json")), new Set(["canonicalUrl"])), "CINOR").map((e) => e.lien));
  });

  it("in a mairie's news on WordPress, and in its RSS feed", () => {
    sansScript(parseWpNews(piege(JSON.parse(fixture("actus_saint-philippe.json")), new Set(["link"])), "Mairie de Saint-Philippe", "Saint-Philippe", new Date("2026-10-24T04:00:00Z")).map((e) => e.lien));
    const rss = `<rss><channel><item><title>Noël au Colosse</title><link>${J}</link><pubDate>Thu, 29 Oct 2026 09:16:37 +0000</pubDate><description><![CDATA[Un marché de Noël.]]></description><content:encoded><![CDATA[<p>Les 4, 5 et 6 décembre 2026 De 15 h à 22 h</p>]]></content:encoded></item></channel></rss>`;
    sansScript(parseRss(rss, "Ville de Saint-André", "Saint-André", true).map((e) => e.lien));
  });

  it("in Saint-Pierre's (Drupal) and La Possession's (IntraMuros) feeds", () => {
    sansScript(parseDrupalNews(liensRss(fixture("rss_saint-pierre.xml")), "Mairie de Saint-Pierre", "Saint-Pierre", new Date("2026-10-25T00:00:00Z")).map((e) => e.lien));
    sansScript(parseIntraMuros(liensRss(fixture("rss_la-possession.xml")), "Ville de La Possession", "La Possession").map((e) => e.lien));
  });

  it("in Saint-Benoît's agenda, whose test of an event's address is not anchored", () => {
    const html = fixture("saint-benoit.html").replace(/href="https:\/\/www\.saint-benoit\.re(\/evenements\/articles\/[^"]*)"/g, `href="${J}//x$1"`);
    sansScript(parseSaintBenoit(html, new Date("2026-10-24T04:00:00Z")).map((e) => e.lien));
  });

  it("in the clubs' calendar (Sportsregions)", () => {
    const pages = [1, 2, 3, 4].map((n) => fixture(`sportsregions_${n}.html`).replace(/"url": "https:\/\/[^"]*\/evenements\/[^"]*"/g, `"url": "${J}"`));
    sansScript(parseSportsregions(pages).evenements.map((e) => e.lien));
  });

  it("in the CIREST's news and events, and the TCO's agenda", () => {
    const post = { id: 1, date: "2026-10-20T09:00:00", link: J, title: { rendered: "Médiathèque de Bras-Panon : planning de novembre 2026" }, content: { rendered: "<p>🎨 <strong>Mercredi 4 novembre, de 14h à 16h</strong>Collage de feuilles – dès 5 ans</p>" } };
    sansScript(parseCirest([post], new Date("2026-10-24T04:00:00Z")).map((e) => e.lien));
    const evenement = { date: "2026-11-06T14:55:09", link: J, title: { rendered: "Dipavali 2026 à Saint-André" }, excerpt: { rendered: "<p>Du 13 au 15 novembre 2026, Saint-André accueillera le Dipavali&#8230;</p>\n" } };
    sansScript(parseCirestEvenements([evenement], at("2026-11-07T08:00")).map((e) => e.lien));
    const tco = fixture("agenda-tco-2411.html").replace(/(<a class="h5[^"]*" href=")[^"]+"/g, `$1${J}"`);
    sansScript(parseTco(tco, at("2026-11-24T23:30")).map((e) => e.lien));
  });
});

describe("an event whose link is not the web's, served without it", () => {
  it("even from a copy kept from before its links were checked", () => {
    const ev = (id: string, lien: string) => ({ id, titre: id, seances: [{ debut: "2026-12-05" }], categories: [], lien }) as unknown as Evenement;
    const copie = [ev("bon", "https://www.saint-paul.re/agenda/a"), ev("piege", J), ev("vide", "")];
    expect(servis({ id: "x", nom: "x" } as Agenda, copie).map((e) => [e.id, e.lien])).toEqual([["bon", "https://www.saint-paul.re/agenda/a"], ["piege", ""], ["vide", ""]]);
    // Linking to its home page, an agenda serves them all, each with that link.
    expect(servis({ id: "x", nom: "x", accueil: "https://www.saint-paul.re/" } as Agenda, copie).map((e) => e.lien)).toEqual(Array(3).fill("https://www.saint-paul.re/"));
  });
});

describe("a link of another source, read only when it is the web's", () => {
  it("a TCO release without one is not kept", () => {
    const feed = readFileSync(new URL("./fixtures/tco_feed.xml", import.meta.url), "utf8");
    const avant = communiquesTco(feed);
    expect(avant.length).toBeGreaterThan(0);
    expect(communiquesTco(liensRss(feed))).toEqual([]);
  });

  it("a public office's site and its page on service-public.fr", () => {
    const row = { nom: "Mairie de Saint-Paul", site_internet: JSON.stringify([{ valeur: J }]), url_service_public: J };
    expect(office(row)).toMatchObject({ fiche: "" });
    expect(office(row).site).toBeUndefined();
    const bon = office({ ...row, site_internet: JSON.stringify([{ valeur: "https://www.mairie-saintpaul.re" }]), url_service_public: "https://lannuaire.service-public.fr/x" });
    expect([bon.site, bon.fiche]).toEqual(["https://www.mairie-saintpaul.re", "https://lannuaire.service-public.fr/x"]);
  });
});
