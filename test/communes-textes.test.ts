import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import { TEXTES } from "../src/web/communes-textes.js";
import type { CommuneData } from "../src/web/data.js";

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-20T06:00:00Z");
const live = { place: null, commune: { value: { sources: [] }, fetchedAt: NOW, stale: false } as unknown as Cached<CommuneData> };
/** A paragraph's text as written: the page escapes it and adds no tag inside, so only the entities are decoded. */
const plain = (html: string) => html.replace(/&#39;/g, "'").replace(/&amp;/g, "&");
/** What the band holds between the page's title and its hook (the hook included). */
const under = (page: string) => page.match(/<\/h1>(.*?<p class="hook">[^<]*<\/p>)/s)![1];

describe("a commune's own text", () => {
  it("opens the five pages that have one, under the title and above the hook, word for word", () => {
    expect(Object.keys(TEXTES).sort()).toEqual(["le-tampon", "les-avirons", "saint-denis", "saint-paul", "saint-pierre"]);
    for (const [slug, [qui, page]] of Object.entries(TEXTES)) {
      const c = COMMUNES.find((x) => x.slug === slug)!;
      const band = under(communePage(ORIGIN, c, live, NOW));
      const [p1, p2, hook] = [...band.matchAll(/<p class="(lead|hook)">(.*?)<\/p>/gs)].map((m) => [m[1], plain(m[2])]);
      expect(band.match(/<p class="lead">[^<]*<\/p>/g)).toHaveLength(2);
      expect(p1).toEqual(["lead", qui]);
      expect(p2).toEqual(["lead", page]);
      // The hook, « La fiche de … : la mairie, les écoles… », comes after the text.
      expect(hook[0]).toBe("hook");
      expect(hook[1]).toMatch(/^La fiche .*: la mairie, les écoles/);
      // Fixed words: no figure of the moment, the same page after page.
      expect(band).not.toMatch(/°C|mesurés <b>/);
    }
  });

  it("leaves the 19 other pages as they were: their hook right under the title", () => {
    const others = COMMUNES.filter((c) => !TEXTES[c.slug]);
    expect(others).toHaveLength(19);
    for (const c of others) expect(under(communePage(ORIGIN, c, live, NOW))).toMatch(/^\n    <p class="hook">La fiche [^<]*<\/p>$/);
  });
});
