import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transit from "../src/providers/transit.js";
import { findStops, stopPageDepartures } from "../src/tools/transports.js";
import { searchPage, stopPage } from "../src/web/arret.js";
import type { Cached } from "../src/cache.js";
import type { ActualitesAnswer, AgendaAnswer, ElectriciteAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/agenda.js";
import { actualitesPage, courantItem, electriciteCommune, noticeCard } from "../src/web/domains.js";
import { weekendPage } from "../src/web/evenements.js";
import { type Fiche, fichePage, fichePassee } from "../src/web/fiche-evenement.js";

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
    // Nor in the structured data, whose `url` search engines follow: the event is given there without it.
    const page = agendaPage(O, { value, fetchedAt: now, stale: false }, now);
    expect(page).not.toMatch(/javascript:/i);
    expect(horsJsonLd(page)).toContain('href="#"');
    expect(page).toContain('"@type":"Event"');
  });

  it("on an event's page, to come and over: its title, day, place, price, text, source and who publishes it", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const cles = new Set(["titre", "quand", "lieu", "prix", "publie_par", "description", "source", "annonce", "reporte_au", "media"]);
    const value = piege(copie<AgendaAnswer>("agenda"), cles);
    const r = { ...value.evenements[0], statut: "REPORTÉ", reporte_au: PIEGE, statut_d_apres: { media: PIEGE, lien: "https://exemple.re/a" }, autres_dates: [PIEGE] } as typeof value.evenements[number];
    sansInjection(fichePage(O, r, { value, fetchedAt: now, stale: false }, undefined));
    const passe = { titre: PIEGE, date: "2026-10-01T10:00", lieu: PIEGE, commune: "Saint-Paul", publie_par: PIEGE, lien: "https://exemple.re/b", fiche: "abcdabcd" } as unknown as Fiche;
    sansInjection(fichePassee(O, passe));
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

describe("a link read elsewhere never runs a script", () => {
  // Escaped, « javascript:… » would still run on a tap: a link of another site goes through href() (web/html.ts), which
  // writes « # » for a scheme that is not the web's, a mail or a phone. Elsewhere (a filter's key in data-k) the link
  // is only a text, escaped.
  const J = " JavaScript:alert(3)";
  const sansScript = (page: string) => {
    expect(horsJsonLd(page)).not.toMatch(/(href|src)="\s*javascript:/i);
    expect(page).toContain('href="#"');
  };

  it("in the headlines, the live pages and the prefecture's releases (/actualites)", () => {
    const now = new Date("2026-10-24T08:05:00Z");
    const value = piege(copie<ActualitesAnswer>("actualites"), new Set(["lien"]), J);
    sansScript(actualitesPage(O, { value, fetchedAt: now, stale: false }, now));
  });

  it("on an event's page, its announcement, its tickets and the medium that says it is cancelled", () => {
    const now = new Date("2026-10-24T04:00:00Z");
    const value = piege(copie<AgendaAnswer>("agenda"), new Set(["lien", "billetterie"]), J);
    const r = { ...value.evenements[0], statut: "ANNULÉ", statut_d_apres: { media: "Un média", lien: J } } as typeof value.evenements[number];
    sansScript(fichePage(O, r, { value, fetchedAt: now, stale: false }, undefined));
  });

  it("in a water cut's notice, and a power cut's on /electricite and a commune's tile", () => {
    const avis = { titre: "Coupure d'eau", communes: ["Saint-Louis"], distributeur: "runéo", publie_le: "20/11/2026 à 09:40", lien: J, texte: "Coupure." };
    sansScript(noticeCard(avis as never));
    sansScript(courantItem({ texte: "Coupure de courant.", lien: J, nature: "programmée" } as never));
    const now = new Date("2026-11-20T06:30:00Z");
    const avisCourant = [{ texte: "…", commune: "Saint-André", nature: "programmée", lien: J, creneaux: [{ jour: "2026-11-23", de: "09:00", a: "12:30", secteurs: [] }] }];
    const copy = { value: { coupures_annoncees: { avis: avisCourant }, sources: [] }, fetchedAt: now, stale: false } as unknown as Cached<ElectriciteAnswer>;
    sansScript(electriciteCommune(copy, "Saint-André", now).foot ?? "");
  });
});
