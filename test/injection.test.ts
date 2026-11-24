import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transit from "../src/providers/transit.js";
import { findStops, stopPageDepartures } from "../src/tools/transports.js";
import { searchPage, stopPage } from "../src/web/arret.js";
import type { ActualitesAnswer, AgendaAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/agenda.js";
import { actualitesPage } from "../src/web/domains.js";
import { weekendPage } from "../src/web/evenements.js";

/**
 * The pages that show a text read elsewhere (an event's title, a headline, a stop's name), rendered with that text set
 * to a trap: none of it may come out as a tag or leave its attribute. They escape it by hand today (map.ts `esc`); the
 * pages moved to `html\`…\`` (web/html.ts) keep this test, and each page moved adds its case here.
 */
const PIEGE = `Fête <script>alert(1)</script><img src=x onerror=alert(2)> "du" l'île & co`;
/** The trap as it shows once escaped, between tags or in an attribute. */
const ECHAPPE = "Fête &lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt; &quot;du&quot; l&#39;île &amp; co";

/** `v` with the texts under the keys `cles` replaced by the trap, at every depth. */
function piege<T>(v: T, cles: Set<string>, valeur = PIEGE): T {
  if (Array.isArray(v)) return v.map((x) => piege(x, cles, valeur)) as T;
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cles.has(k) && typeof x === "string" ? valeur : piege(x, cles, valeur)])) as T;
  return v;
}

/**
 * The page's structured data (`<script type="application/ld+json">`) carries the text as JSON: there, a `<` is written
 * `\u003c`, so the text can never close the block, and it must read back as the very text. The rest of the page is HTML.
 */
function horsJsonLd(page: string): string {
  return page.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, json: string) => {
    expect(json).not.toMatch(/<|<!--/);
    expect(JSON.stringify(JSON.parse(json))).not.toBe("");
    return "";
  });
}

function sansInjection(complete: string): void {
  const page = horsJsonLd(complete);
  expect(page).not.toContain("<script>alert(1)");
  expect(page).not.toContain("<img src=x");
  expect(page).not.toMatch(/onerror=alert\(2\)>/);
  expect(page).not.toContain(`"du"`);
  // The text is shown, escaped: the page did read it.
  expect(page).toContain(ECHAPPE);
}

const copie = <T>(nom: string): T => JSON.parse(readFileSync(new URL(`./fixtures/pages/copie-${nom}.json`, import.meta.url), "utf8")) as T;
const O = "https://rundata.re";

describe("a text read elsewhere, trapped, never comes out as a tag", () => {
  it("in the events' titles, venues, prices and publishers (/evenements, the weekend)", () => {
    // The agenda's copy of 24/10/2026, as test/agenda.test.ts builds it from its agendas.
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["titre", "lieu", "prix", "publie_par", "description"]));
    sansInjection(agendaPage(O, { value, fetchedAt: now, stale: false }, now));
    sansInjection(weekendPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  it("in the events' links, never one that runs a script (/evenements)", () => {
    // An agenda's link is put in an href: escaped, « javascript:… » would still run on a tap. The page writes « # » instead.
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["lien", "billetterie"]), " JavaScript:alert(3)");
    // The structured data keeps the source's address as its `url`, JSON that no browser runs (checked apart).
    const page = horsJsonLd(agendaPage(O, { value, fetchedAt: now, stale: false }, now));
    expect(page).not.toMatch(/javascript:/i);
    expect(page).toContain('href="#"');
  });

  it("in the headlines (/actualites)", () => {
    // The news' copy of 24/10/2026, as test/actualites.test.ts builds it from the media's feeds.
    const now = new Date("2026-10-24T08:05:00Z");
    const value = piege(copie<ActualitesAnswer>("actualites"), new Set(["titre"]));
    sansInjection(actualitesPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  describe("in the names of the stops and the directions of the buses (/bus/arret)", () => {
    const rows = JSON.parse(readFileSync(new URL("./fixtures/transit/rows.json", import.meta.url), "utf8")) as Record<
      string,
      { passes?: { id: number }[]; patterns?: { id: number }[]; pattern_stops?: { id: number }[] }
    >;
    const fake: transit.TransitDb = {
      all: async <T>(sql: string, keys: unknown) =>
        (JSON.parse(String(keys)) as [string, number][]).flatMap(([feed, id]) =>
          (/FROM passes/.test(sql) ? rows[feed]?.passes : /FROM pattern_stops/.test(sql) ? rows[feed]?.pattern_stops : rows[feed]?.patterns)
            ?.filter((r) => r.id === id).map((r) => ({ feed, ...r })) ?? [],
        ) as T[],
    };
    beforeEach(() => transit.configure(fake));
    afterEach(() => transit.configure(undefined));
    // Friday 23/10/2026, 7h30, at Saint-Pierre's bus station, as test/arret.test.ts.
    const now = new Date("2026-10-23T03:30:00Z");

    it("on a stop's page", async () => {
      const p = transit.pageOfStop(findStops("gare routière Saint-Pierre").groups.find((g) => g.reseau === "carjaune")!.ids[0])!;
      const d = await stopPageDepartures(p.groups, now);
      expect(d.departs.length).toBeGreaterThan(0);
      sansInjection(stopPage(O, piege(p, new Set(["nom"])), piege(d, new Set(["headsign", "arret", "nom"])), now));
    });

    it("on the search for a stop, whose words are the visitor's", () => {
      const found = findStops("gare routière Saint-Pierre").groups.map((g) => transit.pageOfStop(g.ids[0])!).filter(Boolean);
      sansInjection(searchPage(O, PIEGE, found.map((p) => piege(p, new Set(["nom"])))));
    });
  });
});
