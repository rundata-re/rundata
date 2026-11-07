import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changelog, NOUVEAUTES, parJour } from "../src/nouveautes.js";
import { CSS, DESCRIPTION_MAX } from "../src/web/pages.js";
import { DESCRIPTION, nouveautesPage, TITLE } from "../src/web/nouveautes.js";

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
