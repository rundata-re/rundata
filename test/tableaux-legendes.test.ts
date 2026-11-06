import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accidentsSection } from "../src/web/domains.js";
import { crechesSection } from "../src/web/enfants.js";
import { pechePage } from "../src/web/peche.js";
import { publierPage } from "../src/web/publier.js";

const DIR = new URL("../src/web/", import.meta.url);
/** Each table of the site's pages, as written in src/web: its file and what follows its opening tag. */
const tables = readdirSync(DIR).filter((f) => f.endsWith(".ts")).flatMap((f) => {
  const s = readFileSync(new URL(f, DIR), "utf8");
  return [...s.matchAll(/<table\b[^>]*>/g)].map((m) => ({ f, next: s.slice(m.index + m[0].length, m.index + m[0].length + 40) }));
});

describe("the tables of the pages", () => {
  it("each have a name for a screen reader: the title shown above them, or what tells apart two under one title", () => {
    const sans = tables.filter((t) => !t.next.startsWith("<caption") && !t.next.startsWith("${titre ? `<caption"));
    expect(sans).toEqual([]);
    // Some tables found at all: a scan that finds none would pass the check above.
    expect(tables.length).toBeGreaterThan(25);
  });

  it("are named on the pages as their headings say", () => {
    const peche = pechePage("https://rundata.re");
    expect(peche).toContain('<caption class="sr">Les tailles et les quantités</caption>');
    expect(peche).toContain("<caption class=\"sr\">Interdits à la pêche de loisir, d'après l'arrêté</caption>");
    expect(peche).toMatch(/<caption class="sr">Aujourd'hui, [^<]+<\/caption>/);
    const publier = publierPage("https://rundata.re");
    const n = publier.match(/<table[^>]*>/g)?.length ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(publier.match(/<table[^>]*><caption class="sr">/g)).toHaveLength(n);
  });

  it("tell apart two tables under one title", () => {
    const creches = crechesSection();
    expect(creches).toContain('<caption class="sr">Crèches, par commune</caption>');
    expect(creches).toContain('<caption class="sr">Crèches, par intercommunalité</caption>');
    const route = accidentsSection();
    expect(route).toMatch(/<caption class="sr">Accidents en \d{4}, par route<\/caption>/);
    expect(route).toMatch(/<caption class="sr">Accidents en \d{4}, par commune<\/caption>/);
    expect(route).toMatch(/<caption class="sr">De \d{4} à \d{4}, par année<\/caption>/);
    expect(route).toMatch(/<caption class="sr">De \d{4} à \d{4}, tués par commune<\/caption>/);
  });
});
