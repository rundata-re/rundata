import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import { TEXTES } from "../src/web/communes-textes.js";
import type { CommuneData } from "../src/web/data.js";
import * as ecoles from "../src/vie/ecoles.js";

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-20T06:00:00Z");
const live = { place: null, commune: { value: { sources: [] }, fetchedAt: NOW, stale: false } as unknown as Cached<CommuneData> };
/** A paragraph's text as written: the page escapes it and adds no tag inside, so only the entities are decoded. */
const plain = (html: string) => html.replace(/&#39;/g, "'").replace(/&amp;/g, "&");
/** What the band holds between the page's title and its hook (the hook included). */
const under = (page: string) => page.match(/<\/h1>(.*?<p class="hook">[^<]*<\/p>)/s)![1];

describe("a commune's own text", () => {
  it("opens the five pages that have one, under the title and above the hook, word for word", () => {
    expect(Object.keys(TEXTES).sort()).toEqual(["entre-deux", "la-possession", "le-tampon", "les-avirons", "saint-andre", "saint-denis", "saint-leu", "saint-louis", "saint-paul", "saint-pierre", "sainte-marie"]);
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

  it("leaves the 13 other pages as they were: their hook right under the title", () => {
    const others = COMMUNES.filter((c) => !TEXTES[c.slug]);
    expect(others).toHaveLength(13);
    for (const c of others) expect(under(communePage(ORIGIN, c, live, NOW))).toMatch(/^\n    <p class="hook">La fiche [^<]*<\/p>$/);
  });

  /**
   * The schools, collèges and lycées a text says, by type: « 84 écoles », « un collège », « le lycée ». Letters and
   * digits told by Unicode (`\p{L}`), not `\b`, which sees « é » or « è » as no letter.
   */
  const counted = (text: string) => {
    const said = { ecole: 0, college: 0, lycee: 0 };
    const types = { école: "ecole", collège: "college", lycée: "lycee" } as const;
    for (const m of text.matchAll(/(?<![\p{L}\d])(\d+|un|le) (école|collège|lycée)s?(?!\p{L})/giu)) said[types[m[2].toLowerCase() as keyof typeof types]] = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    return said;
  };

  it("reads the counts in the plural and in the singular", () => {
    expect(counted("6 écoles, un collège et un lycée.")).toEqual({ ecole: 6, college: 1, lycee: 1 });
    expect(counted("21 écoles, 3 collèges et le lycée.")).toEqual({ ecole: 21, college: 3, lycee: 1 });
    expect(counted("Le collège, le lycée, une école")).toEqual({ ecole: 0, college: 1, lycee: 1 });
  });

  it("counts the schools, collèges and lycées the page lists, from the same directory", () => {
    for (const [slug, paragraphs] of Object.entries(TEXTES)) {
      const c = COMMUNES.find((x) => x.slug === slug)!;
      const listed = Object.fromEntries((["ecole", "college", "lycee"] as const).map((k) => [k, ecoles.inCommune(c.nom).filter((e) => e.type === k).length]));
      expect([slug, counted(plain(paragraphs.join(" ")))]).toEqual([slug, listed]);
    }
  });
});
