import { describe, expect, it } from "vitest";
import * as collecte from "../src/vie/collecte.js";
import { communePage, COMMUNES } from "../src/web/commune.js";
import { cruesPage } from "../src/web/crues.js";
import { enPage } from "../src/web/en.js";
import { homePage } from "../src/web/home.js";
import { pageOf } from "../src/web/places.js";

// Two pages of the sitemap that no other page led to, or only in two clicks from their commune's: the page in English,
// and a commune's waste collection. One useful link each, no block of links.
const O = "https://rundata.re";
const NOW = new Date("2026-11-24T05:00:00Z");
const commune = (slug: string) => communePage(O, pageOf(slug)!, { place: null } as never, NOW);
const tiles = (html: string) => [...html.matchAll(/<li class="tile[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);

describe("the links between the pages of the sitemap", () => {
  it("lead to the page in English from the footer of every page, in one word marked as English", () => {
    const link = '<a href="/en" lang="en" hreflang="en">English</a>';
    for (const html of [homePage(O, null), cruesPage(O, null, NOW), commune("saint-paul")]) {
      const foot = html.slice(html.indexOf("<footer"));
      expect(foot).toContain(link);
      expect(html.split(link)).toHaveLength(2);
      // In the row of the footer's links, after the guide to publish one's data.
      expect(foot.indexOf(link)).toBeGreaterThan(foot.indexOf('<a href="/publier">publier vos données</a>'));
      expect(foot.indexOf(link)).toBeLessThan(foot.indexOf("contact@"));
    }
    // Not on the page itself.
    expect(enPage(O)).not.toContain('<a href="/en"');
  });

  it("give the commune's page a tile to its waste collection, before its recycling centres, where the calendars are read", () => {
    expect(collecte.COMMUNES.length).toBe(5);
    for (const nom of collecte.COMMUNES) {
      const p = COMMUNES.find((c) => c.nom === nom)!;
      const href = `/collecte/${collecte.communeSlug(nom)}`;
      const all = tiles(communePage(O, p, { place: null } as never, NOW));
      const at = all.findIndex((t) => t.includes(">Collecte des déchets<"));
      expect(at, nom).toBeGreaterThanOrEqual(0);
      const tile = all[at];
      expect(tile, nom).toContain(`<h3><a href="${href}">Collecte des déchets<span class="sr"> `);
      expect(tile, nom).toContain('<p class="tv">Jour par rue</p>');
      // « TCO » is spelled out at its first occurrence on the page (web/sigles.ts): the words alone.
      const detail = tile.match(/<p class="td all">(.*?)<\/p>/)![1].split(/<[^>]*>/).join("").replaceAll("&#39;", "'");
      expect(detail, nom).toBe(`ordures ménagères, tri et déchets verts, d'après le calendrier ${collecte.YEAR} du TCO`);
      // The detail whole, never cut after three lines: it names the calendar's year and whose it is.
      expect(tile, nom).toContain(`<a href="${href}">Chercher ma rue →</a>`);
      // The collection every week, the recycling centre now and then: the collection first.
      expect(all[at + 1], nom).toContain(">Déchèteries<");
    }
    // A commune whose calendars are not read has no such tile.
    for (const slug of ["saint-denis", "cilaos", "saint-pierre"]) expect(commune(slug), slug).not.toContain("Collecte des déchets<");
  });
});
