import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changelog, NOUVEAUTES, parJour } from "../src/nouveautes.js";
import { CSS, DESCRIPTION_MAX } from "../src/web/pages.js";
import { chiffreMot, DESCRIPTION, nouveautesPage, TITLE } from "../src/web/nouveautes.js";

describe("the changes, said once", () => {
  it("CHANGELOG.md is the list of src/nouveautes.ts: run `npm run changelog` after changing it", () => {
    expect(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8")).toBe(changelog());
  });

  it("are listed newest first, one plain sentence each, nothing internal", () => {
    const times = NOUVEAUTES.map((n) => new Date(n.date).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const n of NOUVEAUTES) {
      expect(n.date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+04:00$/);
      expect(n.texte.length, n.texte).toBeLessThanOrEqual(140);
      expect(n.texte).not.toMatch(/quota|(?<!date )limite|sous-requête|cloudflare|staging|tailnet|NAS\b/i);
    }
  });

  it("are grouped by day at La Réunion", () => {
    const days = parJour([
      { date: "2026-10-25T00:30:00+04:00", texte: "b" },
      { date: "2026-10-24T23:30:00+04:00", texte: "a2" },
      { date: "2026-10-24T08:00:00+04:00", texte: "a1" },
    ]);
    expect(days).toEqual([
      { jour: "2026-10-25", titre: "Dimanche 25 octobre 2026", textes: ["b"] },
      { jour: "2026-10-24", titre: "Samedi 24 octobre 2026", textes: ["a2", "a1"] },
    ]);
  });

  it("make the page /nouveautes", () => {
    const page = nouveautesPage("https://rundata.re");
    expect(page).toContain("<h1>Les nouveautés de rundata.re</h1>");
    // The day's number with its month (marketing), on one line: a span, nowrap in the style sheet but under 19.9 em, where
    // « 4 novembre » can be wider than the title's line and the month goes whole to the next one (never « novembr/e »).
    const [jour, mois] = parJour()[0].titre.match(/(\d+(?:er)?) (\p{L}+)/u)!.slice(1);
    expect(page).toContain(`<time datetime="${parJour()[0].jour}">${parJour()[0].titre.replace(`${jour} ${mois}`, `<span class="jm">${jour} ${mois}</span>`)}</time>`);
    const dates = [...page.matchAll(/<time datetime="[^"]+">(.*?)<\/time>/g)].map(([, t]) => t);
    expect(dates.length).toBeGreaterThan(3);
    expect(dates.filter((t) => !/^\p{Lu}\p{Ll}+ <span class="jm">\d+(?:er)? \p{Ll}+<\/span> \d{4}$/u.test(t))).toEqual([]);
    expect(CSS).toContain(".jm{white-space:nowrap}");
    for (const n of NOUVEAUTES.slice(0, 3)) expect(page).toContain(n.texte.replace(/'/g, "&#39;").replace(/"/g, "&quot;"));
    expect(page).toContain('<link rel="canonical" href="https://rundata.re/nouveautes">');
    expect(page).toContain('<a href="/nouveautes">nouveautés</a>');
    expect(TITLE.length).toBeLessThanOrEqual(60);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

// With the text at 150 % on a 320 px phone, the lists widened the page (356 px): their grid had no column, and its implicit
// track took the width of the longest word, an address (« rundata.re/associations. »). Once the column is as wide as the
// card, a number bound to its word by a no-break space (« 24 communes ») was wider than the line, and Chrome, which never
// hyphenates after one, cut the word at a letter (« 24 commune/s » at 200 %).
describe("the lists of /nouveautes, with the text enlarged", () => {
  const page = nouveautesPage("https://rundata.re");

  it("have a column no wider than their card", () => {
    expect(CSS).toContain("ul.nouv{grid-template-columns:minmax(0,1fr)}");
    const listes = [...page.matchAll(/<ul class="([^"]*)">/g)].map((m) => m[1]).filter((c) => c.split(" ").includes("plain"));
    expect(listes.length).toBeGreaterThan(3);
    expect(listes.every((c) => c === "plain nouv")).toBe(true);
  });

  it("keep a number with its word in a .jm, never by a no-break space, a unit still bound", () => {
    expect(chiffreMot("Électricité : la carte rejoue les 24 dernières heures, le graphique va jusqu'à 30 jours."))
      .toBe('Électricité : la carte rejoue les <span class="jm">24 dernières</span> heures, le graphique va jusqu&#39;à <span class="jm">30 jours</span>.');
    expect(chiffreMot("les 6 ou 24 h, 1,5 km, 2 %, version 1.0.455")).toBe("les 6 ou 24 h, 1,5 km, 2 %, version 1.0.455");
    expect(chiffreMot("<b>3 communes</b>")).toBe('&lt;b&gt;<span class="jm">3 communes</span>&lt;/b&gt;');
    const items = [...page.matchAll(/<ul class="plain nouv">(.*?)<\/ul>/gs)].map((m) => m[1]).join("");
    expect(items).toContain('<span class="jm">');
    expect(items.match(/\d \p{L}{3,}/gu) ?? []).toEqual([]);
  });
});
