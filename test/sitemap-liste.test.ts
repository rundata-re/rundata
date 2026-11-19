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
    // 842 kept, less three: /feux with no FIRMS key here, /entreprises while it is discreet (test/sitemap-entreprises.test.ts),
    // and the water cuts of Les Avirons while their page is in noindex. 1 406 before, 567 left out.
    expect(urls).toHaveLength(842 - 3);
    expect(urls).not.toContain("/feux");
    expect(urls).not.toContain("/entreprises");
    expect(urls).not.toContain("/coupures-eau/les-avirons");
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
});
