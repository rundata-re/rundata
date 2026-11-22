import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as transit from "../src/providers/transit.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { alertsFor, busiestStops, departureRow, departures, findStops, searchStops, stopPageDepartures, transports, tripRun, type Departure } from "../src/tools/transports.js";
import { cite } from "../src/tools/citer.js";
import { communeFaq } from "../src/web/commune-texte.js";
import { communePage } from "../src/web/commune.js";
import type { CommuneData } from "../src/web/data.js";
import { pageOf as placeOf } from "../src/web/places.js";
import { ARRETS_PROCHES, LIGNES_DITES, searchPage, SEARCH_MAX, stopPage, stopText } from "../src/web/arret.js";
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

describe("a stop's lasting text", () => {
  const pageOf = (q: string) => transit.pageOfStop(findStops(q).groups[0].ids[0])!;
  const links = (html: string) => [...html.matchAll(/href="\/bus\/arret\/([^"]+)"/g)].map((m) => m[1]);
  // The text between the tags: each piece after a « < » keeps what follows its « > » (the text escapes both).
  const plain = (html: string) =>
    html
      .split("<")
      .map((piece, i) => (i === 0 ? piece : piece.slice(piece.indexOf(">") + 1)))
      .join("")
      .replace(/&#39;/g, "'");

  it("names, at a stop of two networks with more than 8 lines, its networks, 8 lines with their terminus, then the others counted", async () => {
    const p = station();
    const d = await stopPageDepartures(p.groups, NOW);
    expect(d.desserte.length).toBeGreaterThan(LIGNES_DITES);
    const html = stopPage(O, p, d, NOW);
    const t = plain(stopText(p, d.desserte));
    expect(t).toContain(`L'arrêt Gare de St-Pierre se trouve à Saint-Pierre. Il est desservi par ${d.desserte.length} lignes de Car Jaune et d'Alternéo\u00a0: O1 vers Gare de St-Denis\u00a0; O1X vers Gare de St-Denis ou Campus\u00a0; O2 vers Gare de St-Denis\u00a0; S1 vers Gare de St-Benoît\u00a0; S2 vers Gare de St-Benoît\u00a0; S3 vers Gare du Tampon ou Gare de St-Joseph\u00a0; S4 vers Gare de St-Paul\u00a0; S5 vers Gare de l'Entre-Deux\u00a0; et ${d.desserte.length - LIGNES_DITES} autres lignes.`);
    // Each line once.
    expect(new Set(d.desserte.map((l) => `${l.reseau} ${l.ligne}`)).size).toBe(d.desserte.length);
    // Both networks announce their times in their real-time feed.
    expect(t).toContain("Cette page donne les prochains départs de toutes ces lignes, à l'heure annoncée en direct par Car Jaune et Alternéo quand ils la publient, sinon à l'horaire théorique. Chaque départ mène à son parcours, arrêt par arrêt.");
    expect(t).toContain("Arrêts proches\u00a0: Gare Routière de St Pierre, Rue du Presbytère, Casabona, ");
    // Under the departures, before the traffic info; 5 stops linked, never the stop itself, then the commune's day.
    expect(html.indexOf('class="arret-texte"')).toBeGreaterThan(html.indexOf('class="rows departs"'));
    const text = stopText(p, d.desserte);
    expect(links(text)).toHaveLength(ARRETS_PROCHES);
    expect(links(text)).not.toContain(p.slug);
    expect(links(html)).not.toContain(p.slug);
    expect(text).toContain(`<a href="/aujourdhui/saint-pierre">La journée à Saint-Pierre\u00a0: météo, vigilance, eau, sorties →</a>`);
    expect(html).not.toMatch(/temps r[ée]el/i);
  });

  it("says that a network without a real-time feed gives its timetable only, at a stop of one line (Hell-Bourg, Estival)", async () => {
    const p = pageOf("mairie annexe Hell Bourg");
    const d = await stopPageDepartures(p.groups, NOW);
    const t = plain(stopText(p, d.desserte));
    expect(t).toContain("L'arrêt Mairie Annexe Hell-Bourg se trouve à Salazie. Il est desservi par 1 ligne d'Estival\u00a0: 83 vers Gare Saint-André, Chemin Terre Plate ou Mairie de Salazie.");
    expect(t).toContain("Cette page donne les prochains départs de cette ligne, à l'horaire théorique\u00a0: rundata.re n'a pas d'heures en direct d'Estival.");
    expect(links(stopText(p, d.desserte))).toHaveLength(ARRETS_PROCHES);
    expect(links(stopText(p, d.desserte))).not.toContain(p.slug);
  });

  it("says, at a stop of two networks where one has no real-time feed, which one gives its timetable only", () => {
    const p = [...transit.stopPages().values()].find((x) => x.groups.some((g) => g.reseau === "carjaune") && x.groups.some((g) => g.reseau === "citalis"))!;
    const t = plain(stopText(p, [{ ligne: "O1", reseau: "Car Jaune", terminus: ["Gare de St-Pierre"] }, { ligne: "1", reseau: "Citalis", terminus: [] }]));
    expect(t).toContain("Il est desservi par 2 lignes de Car Jaune et de Citalis\u00a0: O1 vers Gare de St-Pierre\u00a0; 1.");
    expect(t).toContain("à l'heure annoncée en direct par Car Jaune quand il la publie, sinon à l'horaire théorique. Pour Citalis, rundata.re n'a que l'horaire théorique.");
  });

  it("links, at a stop of one line among a few others (Manapany les Bains), its 5 nearest stops and never itself", async () => {
    const p = pageOf("Manapany les Bains");
    const d = await stopPageDepartures(p.groups, NOW);
    const html = stopText(p, d.desserte);
    expect(plain(html)).toContain("Il est desservi par 1 ligne de Car Jaune\u00a0: S1 vers Gare de St-Pierre ou Gare de St-Benoît.");
    expect(links(html)).toEqual(transit.pagesNear(p).map((x) => x.page.slug));
    expect(links(html)).not.toContain(p.slug);
 
    // No line known: the departures, without « cette ligne ».
    expect(plain(stopText(p, []))).toContain("L'arrêt Manapany les Bains se trouve à Saint-Joseph.\nCette page donne les prochains départs, à l'heure annoncée en direct par Car Jaune et CarSud quand ils la publient");
  });
});

describe("the links to the stop pages from a commune's page", () => {
  it("ranks a commune's stops by their lines, then their departures of the day, and its FAQ links 5 of them", async () => {
    const top = await busiestStops("Saint-Pierre", NOW);
    // Its bus station, the stop of 15 lines of two networks, first.
    expect(top[0]).toMatchObject({ page: "saint-pierre/gare-de-saint-pierre", lignes: 15 });
    expect(top[0].departs).toBeGreaterThan(0);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].lignes > top[i].lignes || (top[i - 1].lignes === top[i].lignes && top[i - 1].departs >= top[i].departs)).toBe(true);
    const five = [1, 2, 3, 4, 5].map((k) => ({ nom: `Arrêt ${k}`, page: `saint-pierre/arret-${k}` }));
    const faq = communeFaq("Saint-Pierre", "saint-pierre", five).find((f) => f.q === "Quels bus desservent Saint-Pierre ?")!;
    expect(faq.a).toMatch(/\. Les arrêts les plus desservis\u00a0: <a href="\/bus\/arret\/saint-pierre\/arret-1">Arrêt 1<\/a>, (<a [^>]+>Arrêt \d<\/a>, ){3}<a href="\/bus\/arret\/saint-pierre\/arret-5">Arrêt 5<\/a>\.$/);
    // Without them (a copy made before), the answer as it was.
    expect(communeFaq("Saint-Pierre", "saint-pierre").find((f) => f.q === "Quels bus desservent Saint-Pierre ?")!.a).not.toContain("desservis");
  });

  it("links, in the Bus block of a commune's page, the stop it names to its page, with the same words", () => {
    const at = new Date("2026-10-23T03:30:00Z");
    const departs = [{ heure: "07:40", dans_min: 10, ligne: "S1", direction: "Saint-Joseph", reseau: "Car Jaune", arret: "Gare de St-Pierre" }];
    const page = (bus: CommuneData["bus"]) =>
      communePage(O, placeOf("saint-pierre")!, { place: null, commune: { value: { bus, sources: [] } as CommuneData, fetchedAt: at, stale: false } as never }, at);
    expect(page({ gare: true, arrets: [{ nom: "Gare de St-Pierre", reseau: "Car Jaune", page: "saint-pierre/gare-de-saint-pierre" }], departs }))
      .toContain(`prochain départ à <a href="/bus/arret/saint-pierre/gare-de-saint-pierre">la gare de Saint-Pierre</a> : ligne S1`);
    expect(page({ gare: false, arrets: [{ nom: "Casabona", reseau: "Car Jaune", page: "saint-pierre/casabona" }], departs }))
      .toContain(`près du centre, arrêt <a href="/bus/arret/saint-pierre/casabona">Casabona</a>`);
    // A copy made before the pages were kept: the words alone.
    expect(page({ gare: true, arrets: [{ nom: "Gare de St-Pierre", reseau: "Car Jaune" }], departs })).toContain("prochain départ à la gare de Saint-Pierre : ligne S1");
  });

  it("gives in the tool the stops nearest a stop named, as its page links them", async () => {
    const r = JSON.parse((await transports("gare routière Saint-Pierre", undefined, NOW)).content[0].text);
    expect(r.arrets_proches.map((x: { nom: string }) => x.nom)).toEqual(transit.pagesNear(station()).map((x) => x.page.nom));
    expect(r.arrets_proches[0]).toMatchObject({ nom: "Gare Routière de St Pierre", commune: "Saint-Pierre" });
    expect(r.arrets_proches.every((x: { distance_m: number }) => x.distance_m >= 0)).toBe(true);
  });

  it("cites the page of a stop named, in `lien` and at the end of the résumé, and /bus for a line or a place", async () => {
    const said = async (arret?: string, ligne?: string) => JSON.parse((cite("transports", await transports(arret, ligne, NOW)) as { content: { text: string }[] }).content[0].text);
    const gare = "https://rundata.re/bus/arret/saint-pierre/gare-de-saint-pierre";
    // Three stops of three networks, in two pages: the first one's, each stop with its own.
    const r = await said("Gare de St-Pierre, Saint-Pierre");
    expect(r.lien).toBe(`${gare}?ref=mcp`);
    expect(r.resume.endsWith(`${gare}?ref=mcp.`)).toBe(true);
    expect(r.arrets.map((a: { reseau: string; lien: string }) => [a.reseau, a.lien])).toEqual([
      ["Car Jaune", `${gare}?ref=mcp`],
      ["Alternéo", `${gare}?ref=mcp`],
      ["CarSud", "https://rundata.re/bus/arret/saint-pierre/gare-routiere-de-saint-pierre?ref=mcp"],
    ]);
    // A line alone, a commune, and a stop no bus serves (the stops served nearest it given): /bus.
    for (const [arret, ligne] of [[undefined, "S1"], ["Saint-Pierre", undefined], ["mairie de Saint-Pierre", undefined]] as const) {
      const x = await said(arret, ligne);
      expect(x.lien, `${arret ?? ligne}`).toBe("https://rundata.re/bus?ref=mcp");
      expect(x.resume).toMatch(/https:\/\/rundata\.re\/bus\?ref=mcp\.$/);
      expect(x.arrets?.some((a: { lien?: string }) => a.lien) ?? false).toBe(false);
    }
  });
});

describe("an alert of a network's feed", () => {
  it("names every line of it that stops there, even with none of its departures given (the commune's tile)", async () => {
    const groups = findStops("gare routière Saint-Pierre").groups.filter((g) => g.reseau === "carjaune");
    const read = await transit.passes(groups.flatMap((g) => g.ids));
    const n = transit.NETWORKS.carjaune;
    const routes = [...new Set(read.map((p) => transit.ENDS[p.pattern][0]))].filter((r) => transit.ROUTES[r][0] === "carjaune");
    expect(routes.length).toBeGreaterThan(2);
    const alert = { titre: "Arrêt non desservi", lignes: routes.map((r) => n.temps_reel!.lignes[r - n.first_route]), arrets: [], periodes: [] };
    const feeds = new Map([["carjaune", { at: NOW.getTime() / 1000, trips: {}, cancelled: [], alerts: [alert] }]]);
    // No departure given: the lines are those of the passes read.
    const [a] = alertsFor(groups, [], feeds, NOW, read);
    expect(a.lignes!.length).toBe(routes.length);
    // Without the passes, as before: only the lines of the departures given, here none.
    expect(alertsFor(groups, [], feeds, NOW)).toEqual([]);
  });
});

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
    // Today's service: its trip without « ?jour= », which only another day keeps.
    expect(d.departs[0].trajet).toMatch(/^\/bus\/trajet\/carjaune\/\d+\/[^?]+\?arret=\d+#arret-\d+$/);
    expect(d.departs.every((x) => !x.trajet?.includes("jour="))).toBe(true);
    expect(d.lignes).toContain("S2");
    const html = stopPage(O, p, d, NOW);
    expect(html).toContain("<title>Arrêt Gare de St-Pierre : prochains bus · La Réunion (974)</title>");
    expect(html).toContain("<h1>Arrêt Gare de St-Pierre\u00a0: prochains bus</h1>");
    expect(html).toContain("Les prochains bus qui passent à cet arrêt, toutes lignes et tous réseaux confondus.</p>");
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
    expect(await page.text()).toContain("<h1>Arrêt Gare de St-Pierre\u00a0: prochains bus</h1>");
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
