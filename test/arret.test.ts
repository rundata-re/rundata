import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as transit from "../src/providers/transit.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { departureRow, departures, findStops, searchStops, stopPageDepartures, tripRun, type Departure } from "../src/tools/transports.js";
import { searchPage, SEARCH_MAX, stopPage } from "../src/web/arret.js";
import { busPage } from "../src/web/domains.js";
import { site } from "../src/web/site.js";
import { tripGonePage, tripPage } from "../src/web/trajet.js";

// The rows of the database for Saint-Pierre's bus station, as in test/transports.test.ts (GTFS of 23/10/2026).
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
// Friday 23/10/2026, 7h30 in La Réunion.
const NOW = new Date("2026-10-23T03:30:00Z");
const O = "https://rundata.re";
const station = () => transit.pageOfStop(findStops("gare routière Saint-Pierre").groups.find((g) => g.reseau === "carjaune")!.ids[0])!;

beforeEach(() => transit.configure(fake));
afterEach(() => transit.configure(undefined));

describe("the stop pages", () => {
  it("are one per name and commune, all networks together, and fewer than 1 000 of them are indexed", () => {
    const pages = [...transit.stopPages().values()];
    expect(pages.length).toBeGreaterThan(4000);
    const indexed = pages.filter((p) => p.indexe);
    // The sitemap holds them: more would read as thin content (scripts/build-transit.py, INDEX_LINES and INDEX_PASSES).
    expect(indexed.length).toBeGreaterThan(300);
    expect(indexed.length).toBeLessThan(1000);
    expect(new Set(pages.map((p) => p.slug)).size).toBe(pages.length);
    const p = station();
    expect(p.slug).toBe("saint-pierre/gare-de-saint-pierre");
    expect(p.indexe).toBe(true);
    expect(transit.pageOfStop(-1)).toBeUndefined();
    expect(transit.pageOfStop(1e9)).toBeUndefined();
  });

  it("have the addresses made from the names people read, all 4 900 of them, which are written only when read", async () => {
    // As they were made until 10/11/2026: from each group's name written as people read it (stopName()).
    const slug = (s: string) => transit.expand(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const before = new Map<string, transit.StopGroup[]>();
    for (const g of transit.GROUPS) {
      const key = `${slug(g.commune)}/${slug(g.nom)}`;
      before.set(key, [...(before.get(key) ?? []), g]);
    }
    const pages = transit.stopPages();
    expect([...pages.keys()]).toEqual([...before.keys()]);
    for (const [key, groups] of before) {
      const p = pages.get(key)!;
      expect(p.groups, key).toEqual(groups);
      expect(p.nom, key).toBe(groups[0].nom);
      expect(p.commune, key).toBe(groups[0].commune);
    }
    // A new isolate builds them at its first trip's or stop's page: without writing a single name as people read it,
    // some 170 ms of CPU of the 200 that robots made it pay on 09/11/2026.
    vi.resetModules();
    let written = 0;
    vi.doMock("../src/tools/casse.js", async (actual) => {
      const m = await actual<typeof import("../src/tools/casse.js")>();
      return { ...m, casseArret: (...a: Parameters<typeof m.casseArret>) => (written++, m.casseArret(...a)) };
    });
    try {
      const fresh = await import("../src/providers/transit.js");
      expect(fresh.stopPages().size).toBe(pages.size);
      expect(written).toBe(0);
      expect(fresh.pageOfStop(station().groups[0].ids[0])?.nom).toBe(station().nom);
      expect(written).toBeGreaterThan(0);
    } finally {
      vi.doUnmock("../src/tools/casse.js");
      vi.resetModules();
    }
  });

  it("give the next buses of all lines, each leading to its trip with this stop chosen, and the lines in the description", async () => {
    const p = station();
    const d = await stopPageDepartures(p.groups, NOW);
    expect(d.departs.length).toBeGreaterThan(2);
    expect(d.departs[0].trajet).toMatch(/^\/bus\/trajet\/carjaune\/\d+\/[^?]+\?jour=20261023&arret=\d+#arret-\d+$/);
    expect(d.lignes).toContain("S2");
    const html = stopPage(O, p, d, NOW);
    expect(html).toContain("<title>Arrêt Gare de St-Pierre : prochains bus · La Réunion (974)</title>");
    expect(html).toContain("<h1>Arrêt Gare de St-Pierre</h1>");
    expect(html).toContain("Les prochains bus qui passent à cet arrêt, toutes lignes et tous réseaux confondus. Chaque départ mène à son parcours, arrêt par arrêt.");
    // Car Jaune's and Alternéo's stops of that name, one page. (The French spacing of the page comes at the response: typo.ts.)
    expect(html).toContain(`<p class="lead">Saint-Pierre · Car Jaune : Gare de St-Pierre · Alternéo : `);
    const description = html.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(description.replace(/&#39;/g, "'").length).toBeLessThanOrEqual(160);
    // Its name says its commune: the commune goes before the lines do.
    expect(description).toMatch(/^Prochains bus à l&#39;arrêt Gare de St-Pierre, tous réseaux\u00a0: lignes [^,]+(, [^,]+)*( et \d+ autres)?, (directions et heures de passage, )?d&#39;après les horaires et les annonces en direct( de Car Jaune et Alternéo)?\.$/);
    expect(html).toContain(`<link rel="canonical" href="${O}/bus/arret/saint-pierre/gare-de-saint-pierre">`);
    expect(html).not.toContain(`content="noindex"`);
    expect(html).toContain("Sinon, horaires théoriques publiés par chaque réseau, sans les retards ni les déviations. Mis à jour le 23/10 à 07:30.");
    // Each wait says the time of the bus too, « 07:42, dans 12 min », and its direction in the case of a sentence.
    const first = d.departs.find((x) => x.dans_min >= 1 && x.dans_min < 90)!;
    expect(html).toContain(`<span class="note">${first.heure_annoncee ?? first.heure}, dans ${first.dans_min} min`);
    expect(html.match(/vers [^<]*/g)!.filter((v) => !/\p{Ll}/u.test(v.slice(5)) && v.length > 12)).toEqual([]);
  });

  it("are not indexed below the threshold, and say the commune unless the name has it", async () => {
    const quiet = [...transit.stopPages().values()].find((p) => !p.indexe && p.groups[0].reseau === "carjaune" && !transit.expand(p.nom).includes(transit.expand(p.commune)))!;
    const lignes = Array.from({ length: 30 }, (_, i) => `L${i + 1}`);
    const html = stopPage(O, quiet, { departs: [], alertes: [], lignes, direct: [], sources: [transit.SOURCE] }, NOW);
    // As many lines as its 160 signs allow, then how many more.
    const description = html.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(description.replace(/&#39;/g, "'").length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/: lignes L1(, L\d+)* et \d+ autres, (directions et heures de passage, )?d&#39;après les horaires/);
    expect(html).toContain(`<meta name="robots" content="noindex">`);
    expect(html).toContain(`<title>Arrêt ${quiet.nom}, ${quiet.commune} · La Réunion (974)</title>`.replace(/'/g, "&#39;"));
    expect(html).toContain("Pas de départ prévu dans les prochaines heures.");
  });

  it("write each time of their list with its minutes, « demain 05:00 » beside « demain 05:15 »", () => {
    const row = (heure: string, dans_min: number) => ({ heure, dans_min, ligne: "S2", direction: "Gare de Saint-Pierre", reseau: "Car Jaune", arret: "Gare de St-Pierre" });
    const departs = [row("demain 5\u00a0h", 1290), row("demain 05:15", 1305), row("9\u00a0h", 90)] as unknown as Parameters<typeof stopPage>[2]["departs"];
    const html = stopPage(O, station(), { departs, alertes: [], lignes: ["S2"], direct: [], sources: [transit.SOURCE] }, NOW);
    expect(html).toContain(">demain 05:00<");
    expect(html).toContain(">demain 05:15<");
    expect(html).toContain(">à 09:00<");
    expect(html).not.toMatch(/\d\u00a0h</);
  });

  it("are written the same in the connector's list: « demain 05:00 », « 09:00 »", () => {
    const row = (at: number) => departureRow({ route: 0, headsign: "x", at, in: 0 } as unknown as Departure).heure;
    expect(row(86400 + 5 * 3600)).toBe("demain 05:00");
    expect(row(86400 + 5 * 3600 + 15 * 60)).toBe("demain 05:15");
    expect(row(9 * 3600)).toBe("09:00");
  });

  it("elide « de » before a network whose name starts with a vowel: « d'Alternéo »", () => {
    const live = (p: transit.StopPage) => p.groups.every((g) => transit.NETWORKS[g.reseau]?.nom === "Alternéo" && transit.NETWORKS[g.reseau]?.temps_reel);
    const sud = [...transit.stopPages().values()].find((p) => live(p) && p.nom.length < 12)!;
    const html = stopPage(O, sud, { departs: [], alertes: [], lignes: ["1"], direct: [], sources: [transit.SOURCE] }, NOW);
    const description = html.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(description).toMatch(/les annonces en direct d&#39;Alternéo\.$/);
    expect(description).not.toContain("de Alternéo");
  });
});

describe("the search for a stop", () => {
  it("finds the stops by their name, within a commune when given, never the stops near a place", () => {
    expect(searchStops("gare routière Saint-Pierre").map((p) => p.slug)).toContain("saint-pierre/gare-de-saint-pierre");
    const mairies = searchStops("mairie");
    expect(mairies.length).toBeGreaterThan(SEARCH_MAX);
    expect(searchStops("mairie Le Tampon").every((p) => p.commune === "Le Tampon")).toBe(true);
    expect(searchStops("plage de l'Hermitage zzz")).toEqual([]);
    expect(searchStops("xqzw")).toEqual([]);
  });

  it("lists the stops to choose from, the first 20, or says what to type; never indexed", () => {
    const html = searchPage(O, "mairie", searchStops("mairie"));
    expect(html).toMatch(/<h2>\d+ arrêts pour « mairie » : choisissez le vôtre<\/h2>/);
    expect(html.match(/<li><span><a href="\/bus\/arret\//g)).toHaveLength(SEARCH_MAX);
    expect(html).toContain(`Les ${SEARCH_MAX} premiers sont affichés : ajoutez la commune pour affiner.`);
    expect(html).toContain(`<meta name="robots" content="noindex">`);
    expect(html).toContain(`value="mairie"`);
    expect(searchPage(O, "xqzw", [])).toContain("Aucun arrêt de bus trouvé pour « xqzw ». Donnez le nom de l'arrêt et sa commune (« Gare routière, Saint-Pierre »).");
  });

  it("goes straight to the stop when one answers, works without a script, and sends an empty search back to /bus", async () => {
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    const get = (path: string) => site(new Request(`${O}${path}`), cache, () => {}, NOW);
    const one = searchStops("gare de saint pierre car jaune");
    expect(one).toHaveLength(1);
    const r = (await get(`/bus/arret?q=${encodeURIComponent("gare de saint pierre car jaune")}`))!;
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(`/bus/arret/${one[0].slug}`);
    expect((await get("/bus/arret?q="))!.headers.get("location")).toBe("/bus");
    expect((await get("/bus/arret/nulle-part/rien"))!.status).toBe(404);
    const page = (await get("/bus/arret/saint-pierre/gare-de-saint-pierre"))!;
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<h1>Arrêt Gare de St-Pierre</h1>");
    // The form on /bus, a plain GET.
    const bus = busPage(O, null, NOW);
    expect(bus).toContain(`<form class="card filter" role="search" action="/bus/arret" method="get"><label class="q">Arrêt de bus <input name="q" type="search" placeholder="Mairie, Le Tampon"`);
    expect(bus).toContain(`<button class="btn sun" type="submit">Chercher</button>`);
  });
});

describe("the trip's links to the stops", () => {
  it("lead each stop of a trip to its page, and an old link to the stop it named", async () => {
    const CJ = transit.NETWORKS.carjaune;
    const withStops = new Set(rows[CJ.stops_feed!].pattern_stops!.map((r) => CJ.first_pattern + r.id));
    const d = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).find((x) => x.reseau === "carjaune" && withStops.has(x.pattern))!;
    const t = (await tripRun("carjaune", d.pattern - CJ.first_pattern, d.trip, 20261023, NOW))!;
    const html = tripPage(O, "/x", t, d.stop, NOW);
    expect(html).toContain(`<a href="/bus/arret/saint-pierre/gare-de-saint-pierre">Gare de St-Pierre</a>`);
    expect(html.match(/<span><a href="\/bus\/arret\//g)).toHaveLength(t.arrets!.length);
    const gone = tripGonePage(O, "/x", "carjaune", undefined, false, station());
    expect(gone).toContain(`<a href="/bus/arret/saint-pierre/gare-de-saint-pierre">Prochains bus à Gare de St-Pierre →</a>`);
  });
});
