import { describe, expect, it } from "vitest";
import { bathingPage } from "../src/web/baignade.js";
import { collectePage } from "../src/web/collecte.js";
import { coupuresCommunePage } from "../src/web/coupures.js";
import { coupuresPage } from "../src/web/domains.js";
import { enfantsCommunePage, enfantsPage } from "../src/web/enfants.js";
import { ISLAND } from "../src/web/pages.js";
import { legalPage } from "../src/web/legal-page.js";
import { pageOf } from "../src/web/places.js";
import { pressePage } from "../src/web/presse.js";

// What the pages tell the search engines about themselves (JSON-LD): a page of its own for each, its address the
// page's, and its subject the place it is about, the commune for a commune's page. Nothing a page does not show.
const O = "https://rundata.re";
const NOW = new Date("2026-11-24T05:00:00Z");
type Ld = Record<string, unknown> & { "@type"?: string };
const ld = (html: string): Ld[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const j = JSON.parse(m[1]) as Ld | Ld[];
    return Array.isArray(j) ? j : [j];
  });
const of = (html: string, type: string) => ld(html).filter((x) => x["@type"] === type);
const canonical = (html: string) => html.match(/<link rel="canonical" href="([^"]*)">/)![1];
const title = (html: string) => html.match(/<title>([^<]*)<\/title>/)![1].replaceAll("&#39;", "'");
const city = (slug: string) => {
  const p = pageOf(slug)!;
  return { "@type": "City", name: `${p.nom} (La Réunion, 974)`, geo: { "@type": "GeoCoordinates", latitude: p.place.lat, longitude: p.place.lon }, containedInPlace: ISLAND };
};

describe("the structured data of the pages", () => {
  it("say a WebPage on the pages that only had their breadcrumb: /baignade, /presse, /confidentialite, /conditions", () => {
    const pages = [bathingPage(O, NOW), pressePage(O, []), legalPage(O, "confidentialite"), legalPage(O, "conditions")];
    for (const html of pages) {
      const url = canonical(html);
      const [page, ...more] = of(html, "WebPage");
      expect(page, url).toBeDefined();
      expect(more, url).toEqual([]);
      // Its name the page's title, its address the page's, as on every other page: nothing it does not show.
      expect(page.name, url).toBe(title(html));
      expect(page.url, url).toBe(url);
      expect(page.inLanguage, url).toBe("fr-FR");
      expect(typeof page.description, url).toBe("string");
      expect(page.about, url).toEqual(ISLAND);
      // No date without a copy read: these pages hold no data of a day.
      expect(page.dateModified, url).toBeUndefined();
      // The breadcrumb stays, its last element the page.
      const [crumbs] = of(html, "BreadcrumbList") as { itemListElement: { item: string }[] }[];
      expect(crumbs.itemListElement.at(-1)!.item, url).toBe(url);
    }
  });

  it("say a commune's page is about the commune, with its coordinates, as /communes/<commune> does", () => {
    const pages: [string, string][] = [
      ["saint-paul", coupuresCommunePage(O, pageOf("saint-paul")!, {}, NOW)],
      ["saint-paul", collectePage(O, NOW, "Saint-Paul")],
      ["les-trois-bassins", collectePage(O, NOW, "Les Trois-Bassins")],
      ["saint-leu", enfantsCommunePage(O, pageOf("saint-leu")!, null, NOW)],
    ];
    for (const [slug, html] of pages) {
      const [page] = of(html, "WebPage");
      expect(page.about, canonical(html)).toEqual(city(slug));
      expect(page.url, canonical(html)).toBe(canonical(html));
    }
    // The coordinates are the place's own, never rounded nor made up.
    expect((city("saint-paul").geo as { latitude: number }).latitude).toBe(pageOf("saint-paul")!.place.lat);
  });

  it("keep the island as the subject of the pages of the whole island", () => {
    for (const html of [coupuresPage(O, null, NOW), collectePage(O, NOW), enfantsPage(O, null, NOW)]) {
      expect(of(html, "WebPage")[0].about, canonical(html)).toEqual(ISLAND);
    }
  });
});
