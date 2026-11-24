import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import type { Alerte } from "../src/web/data.js";
import { enPage, PAGES } from "../src/web/en.js";
import { DESCRIPTION_MAX } from "../src/web/pages.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string) => new Request(`https://rundata.re${path}`, { headers: { accept: BROWSER } });
const text = async (path: string, cache = new Cache(new MemoryStore())) => (await handle(get(path), cache)).text();

// /en (text of 09/11/2026, read again 23/11/2026): the one page in English, for the visitors of the island.
describe("/en, the page in English", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline"); // nothing of this page is read from a source
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is in English, with its own canonical address and no twin in French", async () => {
    const r = await handle(get("/en"), new Cache(new MemoryStore()));
    expect(r.status).toBe(200);
    expect((await handle(get("/en/"), new Cache(new MemoryStore()))).headers.get("location")).toBe("/en");
    const page = await r.text();
    expect(page).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(page).toContain('<link rel="canonical" href="https://rundata.re/en">');
    expect(page).not.toContain("hreflang");
    expect(page).toContain('<meta property="og:locale" content="en_GB">');
    expect(page).toContain("<title>rundata.re in English: Réunion Island live public data</title>");
    const description = page.match(/<meta name="description" content="([^"]*)"/)![1];
    expect(description).toBe("Live weather measured at stations, volcano, sea, trails and cyclone warnings for Réunion Island, from official sources, dated and cited. Free, no account.");
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(page).toContain('"inLanguage":"en"');
    expect(page).toContain("<h1>Réunion Island, live, from public data</h1>");
    for (const id of ["assistant", "pages", "safety", "who"]) expect(page).toContain(`<h2 id="${id}">`);
  });

  it("keeps the site's French menu, footer and forms in French, said so", async () => {
    const page = await text("/en");
    expect(page).toContain('<header lang="fr" ');
    expect(page).toMatch(/<footer class="foot[^"]*" lang="fr">/);
    // In English like the page around it: a screen reader says it with the page's voice (WCAG 3.1.2).
    expect(page).toContain('<a class="evite" href="#contenu">Skip to content</a>');
    // The text itself, in English: no French typography, no « nous ».
    const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
    expect(main).not.toMatch(/ [:;?!]/);
    expect(main).not.toMatch(/\b(we|our)\b/i);
  });

  it("links the ten pages it names, each with its address shown, and says they are in French", async () => {
    const page = await text("/en");
    const paths = ["/mcp", ...PAGES.map((p) => p.path), "/a-propos"];
    expect(paths).toEqual(["/mcp", "/meteo", "/volcan", "/mer", "/baignade", "/sentiers", "/trafic", "/vigilance", "/alerte-cyclone", "/a-propos"]);
    for (const p of paths) {
      expect(page).toContain(`<a href="${p}">rundata.re${p}</a>`);
      expect((await handle(get(p), new Cache(new MemoryStore()))).status, p).not.toBe(404);
    }
    expect(page).toContain("These pages are in French, but the figures, maps and times speak for themselves:");
    expect(page).toContain("<li>Weather measured now, town by town: <a href=\"/meteo\">rundata.re/meteo</a></li>");
    // The words as read, rundata.re in its own span (« ident ») as everywhere on the site.
    const read = page.split(/<[^>]*>/).join("");
    expect(read).toContain("The assistant reads rundata.re's live data and answers in English, with the source and the time.");
    expect(read).toContain("rundata.re does not translate them in their place.");
    expect(page).toContain("In an emergency, call 112 (or 15 for medical help, 18 for fire).");
  });

  it("is in the sitemap, once", async () => {
    const xml = await text("/sitemap.xml");
    expect(xml.match(/<loc>https:\/\/rundata\.re\/en<\/loc>/g)).toHaveLength(1);
  });

  it("shows the cyclone alert's banner in French, above the English text", () => {
    const alerte = { couleur: 3, texte: "ALERTE CYCLONIQUE orange", ecoles: false, court: { cyclone: 3, prevue: false } } as Alerte;
    const page = enPage("https://rundata.re", alerte);
    const at = page.indexOf('<div lang="fr" style="display:contents">');
    expect(at).toBeGreaterThan(page.indexOf("<main"));
    expect(page.indexOf("ALERTE CYCLONIQUE", at)).toBeGreaterThan(at);
    expect(page.indexOf("ALERTE CYCLONIQUE", at)).toBeLessThan(page.indexOf("<h1>"));
  });
});
