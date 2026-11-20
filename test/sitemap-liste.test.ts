import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { empreinte, retiree } from "../src/web/sitemap-retires.js";

const O = "https://rundata.re";
const get = (path: string) => new Request(`${O}${path}`, { headers: { accept: "text/html" } });
async function sitemap(): Promise<string[]> {
  const xml = await (await handle(get("/sitemap.xml"), new Cache(new MemoryStore()))).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(O.length) || "/");
}

// Pages of marketing's list of 18/11/2026 left out of the sitemap: a commune's day, a commune's children's page, a stop.
const RETIREES = ["/aujourdhui/cilaos", "/enfants/les-avirons", "/bus/arret/saint-andre/lot-grand-pelvoisin"];

describe("the sitemap from 19/11/2026, marketing's list of 18/11/2026", () => {
  it("holds the 842 pages kept, but for those not indexable here, and none of the 567 left out", async () => {
    const urls = await sitemap();
    // 842 kept, less two: /feux with no FIRMS key here and /entreprises while it is discreet (test/sitemap-entreprises.test.ts).
    // The water cuts of Les Avirons are in it, said in words of their own (eau/distributeurs.ts GUIDES_AVIS). 1 406 before, 567 left out.
    // Three since 20/11/2026: the water cuts of Saint-Philippe, Cilaos and Petite-Île, whose notices are read.
    // Less /meteo/l-hermitage since 20/11/2026, out of the index: Saint-Gilles-les-Bains's says the same (places.ts PRINCIPAL).
    // And one: the fiche of an address, /terrain (20/11/2026).
    // 24 since 20/11/2026: each commune's elections page.
    expect(urls).toHaveLength(842 - 2 + 3 - 1 + 1 + 24);
    expect(urls).toContain("/communes/petite-ile/elections");
    for (const u of ["/coupures-eau/saint-philippe", "/coupures-eau/cilaos", "/coupures-eau/petite-ile"]) expect(urls, u).toContain(u);
    expect(urls).not.toContain("/meteo/l-hermitage");
    expect(urls).toContain("/meteo/saint-gilles-les-bains");
    expect(urls).toContain("/terrain");
    expect(urls).not.toContain("/feux");
    expect(urls).not.toContain("/entreprises");
    expect(urls).toContain("/coupures-eau/les-avirons");
    for (const u of ["/", "/meteo", "/communes/les-avirons", "/meteo/les-avirons", "/bus/arret/les-avirons/gare-des-avirons"]) expect(urls, u).toContain(u);
    for (const u of RETIREES) expect(urls, u).not.toContain(u);
    expect(urls.filter(retiree)).toEqual([]);
  });

  it("keeps the pages left out online and known", async () => {
    for (const u of RETIREES) {
      expect(retiree(u), u).toBe(true);
      const r = await handle(get(u), new Cache(new MemoryStore()));
      expect(r.status, u).not.toBe(404);
      // Not put in noindex for it; a stop's page is, here only, with no timetables to read.
      if (!u.startsWith("/bus/")) expect(await r.text(), u).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
    }
  });

  it("prints a path as FNV-1a over its UTF-8 bytes", () => {
    expect(empreinte("")).toBe("811c9dc5");
    expect(empreinte("a")).toBe("e40c292c");
    expect(empreinte("/bus/arret/saint-andre/lot-grand-pelvoisin")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("keeps a place that says what another says online, out of the index, sending to the other (places.ts PRINCIPAL)", async () => {
    const page = await (await handle(get("/meteo/l-hermitage"), new Cache(new MemoryStore()))).text();
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).toContain('<link rel="canonical" href="https://rundata.re/meteo/l-hermitage">');
    expect(page).toMatch(/L&#39;Hermitage a la même station, la même prévision et la même houle que Saint-Gilles-les-Bains, sa voisine\. <a href="\/meteo\/saint-gilles-les-bains">La météo de Saint-Gilles-les-Bains →<\/a>/);
    const other = await (await handle(get("/meteo/saint-gilles-les-bains"), new Cache(new MemoryStore()))).text();
    expect(other).not.toContain('content="noindex"');
    expect(other).not.toContain("a la même station");
  });
});
