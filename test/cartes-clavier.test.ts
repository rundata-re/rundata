import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { configure, IDS, parseLive } from "../src/providers/irve.js";
import { type AgendaAnswer, buildBornes, buildDae, type HomeData, type StationNow } from "../src/web/data.js";
import { agendaPage, bornesPage, daePage } from "../src/web/domains.js";
import { islandMap } from "../src/web/map.js";
import { meteoPage } from "../src/web/pages.js";
import { deadAnchors, mapLinks, tabStops } from "./cartes.js";

// The maps of the pages that list the same places under them: their points out of the Tab order, as /ecoles' and
// /carte's, still links for the mouse and a finger. Before, 3 stops of Tab per point: 72 on /defibrillateurs, 63 on
// /bornes, 195 on /evenements, 46 on /meteo (one per station, its bubble its own).
const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-10-27T06:00:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });

afterEach(() => configure(undefined));

/** What the keyboard meets: no stop on the map, every point still a link to a place the page has. */
function keyboardSkips(page: string, points: number) {
  expect(mapLinks(page).length).toBeGreaterThanOrEqual(points);
  expect(tabStops(page)).toBe(0);
  expect(deadAnchors(page)).toEqual([]);
}

describe("the maps whose page lists the same places", () => {
  it("/defibrillateurs: no commune's count is a stop of Tab, each leads to its commune's card", async () => {
    const page = daePage(ORIGIN, cached(await buildDae()), NOW);
    keyboardSkips(page, 24);
    expect(mapLinks(page).every((l) => l.href.startsWith("#c-"))).toBe(true);
  });

  it("/bornes: no commune's count is a stop of Tab", async () => {
    const live = parseLive(readFileSync(new URL("./fixtures/irve_dynamique.csv", import.meta.url), "utf8"), IDS, new Date("2026-10-24T00:37:00Z"));
    configure(async () => live);
    const at = new Date("2026-10-24T00:40:00Z");
    const data = await buildBornes(new Cache(new MemoryStore(), () => at.getTime()), at);
    keyboardSkips(bornesPage(ORIGIN, { value: data, fetchedAt: at, stale: false }, at), 19);
  });

  it("/evenements: neither a commune's count nor a venue's point is a stop of Tab, an announcement's link kept", () => {
    type Row = NonNullable<AgendaAnswer["evenements"]>[number];
    const row = (titre: string, date: string, quand: string, commune: string, lon: number, lat: number): Row =>
      ({ titre, date, quand, genres: ["concert"], lien: `https://example.re/${encodeURIComponent(titre)}`, commune, lieu: `Salle ${titre}`, position: { lon, lat } }) as Row;
    const rows = [
      row("Kabar", "2026-10-27T19:00", "mardi 27/10 à 19:00", "Saint-Paul", 55.27, -21.01),
      row("Maloya", "2026-10-27T20:00", "mardi 27/10 à 20:00", "Le Port", 55.29, -20.94),
      row("Séga", "2026-10-28T20:00", "mercredi 28/10 à 20:00", "Saint-Pierre", 55.48, -21.34),
    ];
    const page = agendaPage(ORIGIN, { value: { resume: "", nombre: rows.length, evenements: rows, couverture: "", a_savoir: "", sources: [], ce_week_end: [] } as AgendaAnswer, fetchedAt: NOW }, NOW);
    expect(page).toMatch(/<a class="mk evp" href="https:\/\/example.re\/Kabar"[^>]* tabindex="-1">/);
    expect(page.match(/<svg class="map[^]*?<\/svg>/)?.[0]).toContain('<a class="mk" href="#jours"');
    expect(tabStops(page)).toBe(0);
  });

  it("/meteo: no station is a stop of Tab, each leads to its row of the list", () => {
    const st = (nom: string, lon: number, lat: number, o: Partial<StationNow>): StationNow =>
      ({ nom, source: "meteofrance", lon, lat, altitude_m: 10, time: "2026-10-27T05:48:00Z", stale: false, ...o }) as StationNow;
    const all = [st("Saint-Denis-Gillot", 55.52, -20.89, { temperature: 26.1, vent: 18, direction: 110 }), st("Plaine des Cafres", 55.57, -21.21, { temperature: 14.2, pluie_1h: 0.4 })];
    const home: HomeData = { stations: all, toutes: all, sources: [], indisponibles: [], mer: [] };
    const page = meteoPage(ORIGIN, cached(home), NOW);
    expect(page.match(/<a class="mk[^"]*" href="#[^"]+"[^>]* tabindex="-1">/g)).toHaveLength(2);
    expect(tabStops(page)).toBe(0);
  });

  it("keeps the points in the Tab order on a map whose page has no such list (the home page's)", () => {
    const marker = { lon: 55.52, lat: -20.89, label: "26°", name: "Gillot", round: true, href: "/meteo#s-gillot" };
    expect(tabStops(islandMap({ markers: [marker], label: "Carte" }))).toBe(1);
    expect(tabStops(islandMap({ markers: [marker], listed: true, label: "Carte" }))).toBe(0);
  });
});
