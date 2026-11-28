import { enLigne } from "../src/web/alertes-drapeau.js";
import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { gardee, NOMBRE } from "../src/web/sitemap-gardees.js";
import { lien } from "../src/tools/citer.js";
import { resolvePlace } from "../src/places/resolve.js";

const O = "https://rundata.re";
const get = (path: string) => new Request(`${O}${path}`, { headers: { accept: "text/html" } });
async function sitemap(): Promise<string[]> {
  const xml = await (await handle(get("/sitemap.xml"), new Cache(new MemoryStore()))).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(O.length) || "/");
}

// Pages left out of the sitemap by the validated list of 24/11/2026: a commune's day, its children's page, its elections, a
// stop of Saint-Pierre, a stop of the old sitemap, a place's weather.
const RETIREES = ["/aujourdhui/cilaos", "/enfants/les-avirons", "/communes/petite-ile/elections", "/bus/arret/saint-pierre/pierrefonds", "/bus/arret/les-avirons/gare-des-avirons", "/meteo/les-avirons"];

describe("the sitemap from 24/11/2026, the validated list of that day", () => {
  it("holds the 245 pages kept, but for those not served here, and nothing else", async () => {
    const urls = await sitemap();
    // 231 kept, less /feux with no FIRMS key here. 893 before. 230 from 24/11/2026: a deviation the ONF took off its
    // map, its page no longer a trail's state. 231 the same day: Le Tampon's water cuts, its notices read; 232: Saint-Joseph's; 237: the waste collection of the CIREST's five communes with calendars; 240 (26/11/2026): the CINOR's three; 244 the same day: the CASUD's four; 245 (27/11/2026): the alerts on the phone,
    // only once they are open.
    expect(NOMBRE).toBe(245);
    expect(urls).not.toContain("/sentiers/sentier-du-trou-de-fer-deviation-par-rf-fleurs-jaunes");
    expect(urls).toHaveLength(NOMBRE - 1 - (enLigne() ? 0 : 1));
    expect(urls).not.toContain("/feux");
    expect(urls.filter((u) => !gardee(u))).toEqual([]);
    expect(new Set(urls).size).toBe(urls.length);
    // The home page, the head pages, the 24 communes, the water cuts whose page is indexable, and what people look for.
    for (const u of ["/", "/meteo", "/communes/les-avirons", "/coupures-eau/les-avirons", "/coupures-eau/petite-ile", "/meteo/maido", "/meteo/saint-gilles-les-bains", "/collecte/saint-paul", "/enfants/saint-leu", "/randonnees/mafate", "/sentiers/le-bloc-piton-des-neiges", "/terrain", "/en"]) expect(urls, u).toContain(u);
    expect(urls.filter((u) => u.startsWith("/communes/"))).toHaveLength(24);
    // 23 since 24/11/2026: Saint-Joseph, its notices read; L'Entre-Deux alone left out.
    expect(urls.filter((u) => u.startsWith("/coupures-eau/"))).toHaveLength(23);
    // No stop, no event's page, no elections, no past cyclone, no day of a commune.
    expect(urls.filter((u) => /^\/(bus|evenements|cyclones|aujourdhui)\/|\/elections$/.test(u))).toEqual([]);
    for (const u of RETIREES) expect(urls, u).not.toContain(u);
    expect(urls).not.toContain("/meteo/l-hermitage");
    expect(urls).not.toContain("/entreprises");
  });

  it("keeps the pages left out online, and out of noindex", async () => {
    for (const u of RETIREES) {
      expect(gardee(u), u).toBe(false);
      const r = await handle(get(u), new Cache(new MemoryStore()));
      expect(r.status, u).not.toBe(404);
      expect(r.headers.get("x-robots-tag") ?? "", u).not.toContain("noindex");
      // Not put in noindex for it; a stop's page is, here only, with no timetables to read.
      if (!u.startsWith("/bus/")) expect(await r.text(), u).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
    }
  });

  it("sends a place that says what another says to the other for good, and the tools' link with it (places.ts PRINCIPAL)", async () => {
    const r = await handle(get("/meteo/l-hermitage?ref=x"), new Cache(new MemoryStore()));
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/meteo/saint-gilles-les-bains?ref=x");
    const other = await handle(get("/meteo/saint-gilles-les-bains"), new Cache(new MemoryStore()));
    expect(other.status).toBe(200);
    expect(await other.text()).not.toContain('content="noindex"');
    // The tools still know the place, and give the page the address leads to.
    expect(resolvePlace("L'Hermitage")).toBeTruthy();
    expect(lien("meteo_actuelle", { lieu: { trouve: "L'Hermitage", commune: "Saint-Paul" } })).toBe(`${O}/meteo/saint-gilles-les-bains?ref=mcp`);
  });
});
