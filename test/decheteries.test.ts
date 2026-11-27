import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as casud from "../src/providers/casud.js";
import * as tco from "../src/providers/tco.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { WASTE } from "../src/tools/decheteries.js";
import { resume } from "../src/tools/resume.js";
import { communePage } from "../src/web/commune.js";
import { anchorOf, decheteriesPage, descriptionOf, TITLE } from "../src/web/decheteries.js";
import { pageOf } from "../src/web/places.js";
import { CASUD_SITES, ELSEWHERE, ELSEWHERE_COMMUNES, epciOf, labelsOf, LIVE_COMMUNES, SITES, sitesNow, SURVEY, TCO_COMMUNES, wasteAsked } from "../src/vie/decheteries.js";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/tco_meteo.json", import.meta.url), "utf8"));
// The CASUD's page read on 26/11/2026 at 08:54, its icons (SVG) cut: 960 kB down to 73.
const CASUD_PAGE = readFileSync(new URL("./fixtures/casud_meteo.html", import.meta.url), "utf8");
// Saturday 24 October 2026, 17:30 at La Réunion: the fixture's updates were made between 15:02 and 17:00.
const NOW = new Date("2026-10-24T13:30:00Z");
const NEXT_MORNING = new Date("2026-10-25T06:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const etats = tco.parse(FIXTURE);
const copy = { value: { etats, sources: [] }, fetchedAt: NOW, stale: false };

beforeEach(() => vi.stubGlobal("fetch", async (url: string) => (String(url).includes("data.tco.re") ? Response.json(FIXTURE) : new Response("", { status: 404 }))));
afterEach(() => vi.unstubAllGlobals());

describe("the déchèteries of the West", () => {
  it("are the TCO's thirteen, in its five communes, each matched with its live state", () => {
    expect(SITES.filter((s) => s.par === "tco")).toHaveLength(13);
    expect(TCO_COMMUNES.sort()).toEqual(["La Possession", "Le Port", "Les Trois-Bassins", "Saint-Leu", "Saint-Paul"]);
    expect(etats).toHaveLength(13);
    const dosDane = etats.find((e) => e.lien.endsWith("decheterie-de-dos-dane"))!;
    expect(dosDane.maj).toBe("2026-10-24T11:02:00.000Z");
    expect(dosDane.accepte).toMatchObject({ dechets_verts: true, encombrants: false });
    expect(sitesNow(etats, NOW).filter((s) => s.par === "tco").every((s) => s.mis_a_jour)).toBe(true);
  });

  it("say the state only while it is recent: older than 6 hours, or of another day, it is to be checked", () => {
    const now = sitesNow(etats, NOW);
    expect(now.find((s) => s.nom === "Déchèterie de Dos d'Âne")).toMatchObject({ a_jour: true, mis_a_jour: "24/10 15:02" });
    expect(now.find((s) => s.nom === "Déchèterie de Dos d'Âne")!.refuse).toContain("encombrants");
    const late = sitesNow(etats, new Date("2026-10-24T17:30:00Z"));
    expect(late.find((s) => s.nom === "Déchèterie de Dos d'Âne")!.a_jour).toBe(false);
    expect(sitesNow(etats, NEXT_MORNING).some((s) => s.a_jour)).toBe(false);
  });

  it("answer which nearby sites take the waste asked", async () => {
    const r = body(await annuaireTool(new Cache(), "déchets verts", "Saint-Gilles-les-Bains", NOW));
    expect(r.resume).toMatch(/^Déchets verts acceptés en ce moment : /);
    expect(r.decheteries[0].etat).toBe("à jour");
    expect(r.avertissements.join(" ")).toMatch(/plus de 6 h est à vérifier sur place/);
    expect(r.avertissements).toContain("Horaires des déchèteries du TCO sur leur page, qui les dit ouvertes 7 jours sur 7.");
    expect(r.avertissements[0]).toBe("État des bennes rempli par les agents sur place, au TCO environ toutes les 2 heures : une mise à jour de plus de 6 h est à vérifier sur place.");
    // The next morning, before the staff's first update: nothing said to be the state now.
    const next = body(await annuaireTool(new Cache(), "encombrants", "Le Port", NEXT_MORNING));
    expect(next.resume).toMatch(/À vérifier sur place \(mise à jour il y a plus de 6 h\)/);
    expect(next.decheteries[0].accepte).toBeUndefined();
    for (const q of ["déchèterie", "déchetterie", "encombrants", "déchets verts", "gravats", "benne"]) expect(WASTE.test(q), q).toBe(true);
    for (const q of ["mairie", "CAF", "pharmacie", "marché"]) expect(WASTE.test(q), q).toBe(false);
    expect(wasteAsked("où jeter un vieux frigo")).toBe("refrigerateurs_congelateurs");
    expect(wasteAsked("tonte de pelouse et branches")).toBe("dechets_verts");
  });

  it("have their page, a block per commune, its description with the time of the latest update", () => {
    const page = decheteriesPage("https://rundata.re", copy, NOW);
    expect(TITLE.length).toBeLessThanOrEqual(60);
    expect(page).toContain(`<title>${TITLE.replace(/'/g, "&#39;")}</title>`);
    expect(page).toContain('<h1>Les déchèteries de l&#39;île, et les bennes en direct dans l&#39;Ouest, au Tampon et à Saint-Joseph <span class="n974">974</span></h1>');
    for (const id of ["saint-paul", "le-port", "la-possession", "les-trois-bassins", "saint-leu"]) expect(page).toContain(`<section id="${id}"`);
    expect(TITLE).toBe("Déchèteries : adresses, bennes en direct (TCO, CASUD) · 974");
    expect(descriptionOf(sitesNow(etats, NOW))).toBe("Déchèteries de La Réunion (974) le 24/10 à 17:00 : où déposer déchets verts, encombrants, gravats ; bennes pleines en direct (TCO, CASUD).");
    expect(descriptionOf(sitesNow(etats, NEXT_MORNING))).toBe("Déchèteries de La Réunion (974) : où déposer déchets verts, encombrants, gravats, dans toute l'île ; bennes pleines en direct (TCO, CASUD).");
    expect(decheteriesPage("https://rundata.re", copy, NEXT_MORNING)).toContain("Mise à jour il y a plus de 6 h : à vérifier sur place.");
    // The green dot only with a state the staff filled in today, read in direct; the next morning, none.
    expect(page).toContain('<p class="pill"><span class="dot"></span>État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr> et de la CASUD</p>');
    expect(decheteriesPage("https://rundata.re", copy, NEXT_MORNING)).toContain('<p class="pill">État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr> et de la CASUD</p>');
    expect(decheteriesPage("https://rundata.re", null, NOW)).toContain('<p class="pill">État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr> et de la CASUD</p>');
  });

  it("fold each commune under its name, its number of sites and its full skips, never « aucune » deduced", () => {
    const heads = (html: string) => new Map([...html.matchAll(/<summary><h2 id="h-([a-z-]+)">[^<]+ <small>· ([^<]+)<\/small><\/h2><\/summary>/g)].map((m) => [m[1], m[2]]));
    const now = sitesNow(etats, NOW);
    const page = heads(decheteriesPage("https://rundata.re", copy, NOW));
    expect(page.size).toBe(LIVE_COMMUNES.length + ELSEWHERE_COMMUNES.length);
    for (const c of TCO_COMMUNES) {
      const here = now.filter((x) => x.commune === c);
      const full = here.reduce((n, x) => n + (x.a_jour ? x.refuse.length : 0), 0);
      const sites = `${here.length}\u00a0déchèterie${here.length > 1 ? "s" : ""}`;
      expect(page.get(anchorOf(c)), c).toBe(full ? `${sites} · ${full}\u00a0benne${full > 1 ? "s" : ""} pleine${full > 1 ? "s" : ""}` : sites);
    }
    for (const c of ELSEWHERE_COMMUNES) expect(page.get(anchorOf(c))).toMatch(/^\d+\u00a0déchèteries?$/);
    // The fixture has full skips somewhere; the next morning, nothing recent: no count, and never « aucune ».
    expect([...page.values()].some((v) => v.includes("pleine"))).toBe(true);
    const late = decheteriesPage("https://rundata.re", copy, NEXT_MORNING);
    expect([...heads(late).values()].some((v) => v.includes("benne"))).toBe(false);
    expect(late).not.toMatch(/aucune benne/i);
    expect(heads(decheteriesPage("https://rundata.re", null, NOW)).size).toBe(LIVE_COMMUNES.length + ELSEWHERE_COMMUNES.length);
    // Folded, the commune's anchor on its section: the page's script opens the details inside (UNFOLD_SCRIPT).
    const html = decheteriesPage("https://rundata.re", copy, NOW);
    expect(html).toContain('<section id="saint-paul" aria-labelledby="h-saint-paul">\n  <details class="pli"><summary>');
    expect(html).not.toMatch(/<details class="pli" open/);
    expect(html).toContain('t.querySelector(":scope>details")');
  });

  it("have a tile on the West's commune pages, with the state of their skips", () => {
    const paul = communePage("https://rundata.re", pageOf("saint-paul")!, { place: null, dechets: copy }, NOW);
    expect(paul).toMatch(/<h3><a href="\/decheteries#saint-paul">Déchèteries<span class="sr"> à Saint-Paul<\/span><\/a><\/h3><p class="tv">5 <span class="mc">dé\u00adchè\u00adte\u00adries<\/span><\/p><p class="td">d'après les agents : déchets verts acceptés dans \d sur 5, encombrants dans \d sur 5<\/p>/);
  });
});

describe("the TCO's state of the déchèteries", () => {
  it("is read again after 10 minutes: a copy of 30 kept a full bin the TCO had emptied", async () => {
    let t = Date.parse("2026-11-04T10:07:00Z");
    let reads = 0;
    vi.stubGlobal("fetch", async () => (reads++, Response.json(FIXTURE)));
    const cache = new Cache(new MemoryStore(), () => t, false);
    await tco.meteo(cache);
    t += 9 * 60_000;
    await tco.meteo(cache);
    expect(reads).toBe(1);
    t += 2 * 60_000;
    await tco.meteo(cache);
    expect(reads).toBe(2);
    expect(tco.FRESH_SECONDS).toBe(600);
  });
});

describe("the déchèteries outside the TCO, from the ADEME's directory", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string) => (calls.push(String(url)), new Response("", { status: 404 })));
  });

  it("are the sites of its latest survey in the three other intercommunalités, none of the TCO's nor the CASUD's", () => {
    expect(SURVEY).toBe(2026);
    const count = (nom: string) => ELSEWHERE.filter((s) => s.epci.nom === nom).length;
    // The CASUD's four, since 26/11/2026, with their state (CASUD_SITES).
    expect([count("la CIVIS"), count("la CASUD"), count("la CINOR"), count("la CIREST")]).toEqual([8, 0, 11, 7]);
    expect(ELSEWHERE.filter((s) => TCO_COMMUNES.includes(s.commune) || epciOf(s.commune) === undefined)).toEqual([]);
    // Placed in Saint-Pierre by the directory's code, in Saint-Denis by its town and its point.
    expect(ELSEWHERE.find((s) => s.nom === "Déchèterie de Bois de Nèfles")!.commune).toBe("Saint-Denis");
    // More than a kilometre from its address in the directory: at its address, geocoded.
    expect(ELSEWHERE.find((s) => s.nom === "Déchèterie ZAC Roland Hoareau")).toMatchObject({ adresse: "66 Rue Saint-Louis", lat: -21.30161, lon: 55.42257 });
    expect(ELSEWHERE.every((s) => !("horaires" in s))).toBe(true);
  });

  it("answer a commune of the South with its own sites, nearest first, and their intercommunalité's site for the hours", async () => {
    const r = body(await annuaireTool(new Cache(), "déchèterie", "Saint-Pierre", NOW));
    const noms = r.decheteries.map((d: { nom: string }) => d.nom);
    expect(noms).toEqual(expect.arrayContaining(["Déchèterie Saint-Pierre Palama", "Déchèterie Saint-Pierre Allée Bois Noirs"]));
    expect(r.decheteries.every((d: { commune: string }) => d.commune === "Saint-Pierre")).toBe(true);
    expect(r.decheteries.map((d: { distance_km: number }) => d.distance_km)).toEqual([...r.decheteries.map((d: { distance_km: number }) => d.distance_km)].sort((x: number, y: number) => x - y));
    expect(r.decheteries[0]).toMatchObject({ horaires: "voir le site de la CIVIS", page: "https://www.civis.re/" });
    expect(r.resume).toMatch(/^Déchèteries les plus proches de Saint-Pierre, selon l'annuaire des déchèteries de l'ADEME \(enquête 2026, mis à jour le \d\d\/\d\d\/\d{4}\)\u00a0: Déchèterie /);
    expect(r.resume).toMatch(/Horaires\u00a0: voir le site de la CIVIS \(https:\/\/www\.civis\.re\/\)\.$/);
    expect(r.page).toBe("https://rundata.re/decheteries#saint-pierre");
    expect(r.sources.map((x: { source: string }) => x.source)).toEqual(["Annuaire des déchèteries de l'ADEME (SINOE)"]);
    // No hours, from anywhere, and nothing read to answer.
    expect(JSON.stringify(r)).not.toMatch(/\d{1,2}[:h]\d\d/);
    expect(calls).toEqual([]);
  });

  it("answer a commune of the CASUD without a site with the CASUD's nearest, saying when its state is not read", async () => {
    const r = body(await annuaireTool(new Cache(), "encombrants", "Saint-Philippe", NOW));
    expect(r.decheteries.some((d: { commune: string }) => d.commune === "Saint-Philippe")).toBe(false);
    expect(r.decheteries[0]).toMatchObject({ nom: "Déchèterie des Grègues", commune: "Saint-Joseph", etat: "non disponible", page: "https://tri-casud.re/meteo-des-dechets#decheterie-des-gregues" });
    expect(r.decheteries[0].horaires).toBe("du lundi au samedi de 8\u00a0h à 12\u00a0h et de 14\u00a0h à 17\u00a0h, sauf les jours fériés");
    expect(r.resume).toMatch(/^L'état des bennes de la CASUD n'est pas disponible pour le moment\. Déchèteries les plus proches à Saint-Philippe : Déchèterie des Grègues \(à /);
  });

  it("are on the page, a block per commune, and on the commune's page", () => {
    const page = decheteriesPage("https://rundata.re", copy, NOW);
    for (const c of ELSEWHERE_COMMUNES) expect(page).toContain(`<section id="${anchorOf(c)}"`);
    expect(page).toContain('<h3>Déchèterie Saint-Pierre Palama</h3><p>2 Chemin Palama</p>');
    expect(page).toContain('Horaires\u00a0: voir le site de <a href="https://www.civis.re/" rel="noopener">la CIVIS</a>.');
    expect(page).toContain("Déchèteries selon l&#39;annuaire des déchèteries de l&#39;<abbr title=\"Agence de la transition écologique\">ADEME</abbr> (enquête 2026, mis à jour le ");
    const pierre = communePage("https://rundata.re", pageOf("saint-pierre")!, { place: null }, NOW);
    expect(pierre).toContain('<h3><a href="/decheteries#saint-pierre">Déchèteries<span class="sr"> à Saint-Pierre</span></a></h3><p class="tv">4 <span class="mc">dé\u00adchè\u00adte\u00adries</span></p><p class="td">horaires\u00a0: voir le site de la <abbr title="Communauté intercommunale des villes solidaires">CIVIS</abbr></p>');
    expect(communePage("https://rundata.re", pageOf("saint-philippe")!, { place: null }, NOW)).not.toMatch(/Déchèteries(<span class="sr">[^<]*<\/span>)?<\/a><\/h3>/);
  });
});

describe("the CASUD's state of the déchèteries", () => {
  // Thursday 26 November 2026, 09:00 at La Réunion: the page read at 08:54, its sites updated from 07:49 to 08:46,
  // Bois Court the day before at 16:20.
  const AT = new Date("2026-11-26T05:00:00Z");
  const read = casud.parse(CASUD_PAGE);
  const page = (url: string) => (String(url).startsWith("https://tri-casud.re/") ? new Response(CASUD_PAGE) : String(url).includes("data.tco.re") ? Response.json(FIXTURE) : new Response("", { status: 404 }));

  it("is read from its page: each site's time and each kind of waste, a full skip refused, a half-full one taken", () => {
    expect(read.map((e) => e.lien)).toEqual(CASUD_SITES.map((s) => s.lien).sort((x, y) => read.findIndex((e) => e.lien === x) - read.findIndex((e) => e.lien === y)));
    expect(new Set(read.map((e) => e.lien))).toEqual(new Set(CASUD_SITES.map((s) => s.lien)));
    const gregues = read.find((e) => e.lien.endsWith("#decheterie-des-gregues"))!;
    expect(gregues.maj).toBe("2026-11-26T03:49:00.000Z");
    // « Magazine / Journaux » Plein; « Déchet vert » Moitié plein.
    expect(gregues.accepte).toMatchObject({ "journaux et revues": false, "déchets verts": true, cartons: true, "huiles de friture": true });
    // Every kind in words: none the page would name anew.
    for (const e of read) for (const k of Object.keys(e.accepte)) expect(Object.values(casud.KINDS), k).toContain(k);
    const now = sitesNow(read, AT).filter((s) => s.par === "casud");
    expect(now.find((s) => s.nom === "Déchèterie des Grègues")).toMatchObject({ a_jour: true, mis_a_jour: "26/11 07:49", refuse: ["journaux et revues"] });
    expect(now.find((s) => s.nom === "Point d'apport de Bois Court")!.a_jour).toBe(false);
    expect(casud.FRESH_SECONDS).toBe(1800);
  });

  it("answers at Le Tampon and L'Entre-Deux, with the hours, and the kinds the CASUD sorts otherwise", async () => {
    vi.stubGlobal("fetch", page);
    const r = body(await annuaireTool(new Cache(), "déchèterie pour les cartons", "Le Tampon", AT));
    expect(r.decheteries[0].page).toMatch(/^https:\/\/tri-casud\.re\/meteo-des-dechets#/);
    expect(r.decheteries[0].horaires).toMatch(/^du lundi au samedi de 8\u00a0h/);
    expect(r.resume).toMatch(/^Papiers et cartons acceptés en ce moment : /);
    expect(r.sources.map((x: { source: string }) => x.source)).toContain("Météo des déchèteries de la CASUD");
    expect(labelsOf("papiers_cartons")).toEqual(["papiers et cartons", "cartons", "journaux et revues"]);
    const e2 = body(await annuaireTool(new Cache(), "déchets verts", "Entre-Deux", AT));
    expect(e2.decheteries.every((d: { page: string }) => d.page.startsWith("https://tri-casud.re/"))).toBe(true);
    expect(e2.avertissements).toContain("Seuls le TCO (Ouest) et la CASUD (Le Tampon, Saint-Joseph) publient l'état des bennes en direct. Ailleurs, la liste des déchèteries vient de l'annuaire de l'ADEME, sans les horaires.");
  });

  it("is on the page, under Le Tampon and Saint-Joseph, with the hours; unread, said so", () => {
    const both = { value: { etats: [...etats, ...read], sources: [] }, fetchedAt: AT, stale: false };
    const html = decheteriesPage("https://rundata.re", both, AT);
    for (const id of ["le-tampon", "saint-joseph"]) expect(html).toContain(`<section id="${id}"`);
    expect(html).toContain('<h3><a href="https://tri-casud.re/meteo-des-dechets#decheterie-des-gregues" rel="noopener">Déchèterie des Grègues</a></h3><p>rue de la Station de Transit</p><p>Horaires\u00a0: du lundi au samedi de 8\u00a0h à 12\u00a0h et de 14\u00a0h à 17\u00a0h, sauf les jours fériés.</p>');
    expect(html).toContain("<p><b>Benne pleine :</b> journaux et revues.</p>");
    const unread = decheteriesPage("https://rundata.re", { ...copy, value: { etats, absents: ["casud" as const], sources: [] } }, NOW);
    expect(unread.match(/État des bennes non disponible pour le moment\./g)).toHaveLength(CASUD_SITES.length);
  });

  it("unread, is said « non disponible » on the commune's tile and in the day's summary, never « à vérifier »", () => {
    const mute = { ...copy, value: { etats, absents: ["casud" as const], sources: [] } };
    const tampon = communePage("https://rundata.re", pageOf("le-tampon")!, { place: null, dechets: mute }, NOW);
    expect(tampon).toMatch(/<h3><a href="\/decheteries#le-tampon">Déchèteries<span class="sr"> au Tampon<\/span><\/a><\/h3><p class="tv">4 <span class="mc">dé\u00adchè\u00adte\u00adries<\/span><\/p><p class="td">état des bennes non disponible pour le moment<\/p>/);
    const r = resume(pageOf("saint-joseph")!, { dechets: mute } as never, NOW);
    expect(r.decheteries!.sites.map((x) => x.etat)).toEqual(["non disponible"]);
    // The TCO answering, its sites keep their state.
    const paul = resume(pageOf("saint-paul")!, { dechets: mute } as never, NOW);
    expect(paul.decheteries!.sites.every((x) => x.etat !== "non disponible")).toBe(true);
  });

  it("names the site left out of the count, its state older than 6 h, on the tile and in the day's summary (27/11/2026)", () => {
    const morning = { ...copy, value: { etats: read, absents: [], sources: [] } };
    const tampon = communePage("https://rundata.re", pageOf("le-tampon")!, { place: null, dechets: morning }, AT);
    expect(tampon).toMatch(/<p class="tv">4 <span class="mc">dé\u00adchè\u00adte\u00adries<\/span><\/p><p class="td">d'après les agents : déchets verts acceptés dans \d sur 3, encombrants dans \d sur 3 ; sans mise à jour depuis plus de 6\u00a0h, hors du compte\u00a0: Point d'apport de Bois Court<\/p>/);
    expect(resume(pageOf("le-tampon")!, { dechets: morning } as never, AT).resume).toMatch(/déchets verts acceptés dans \d déchèteries? sur 3 à jour\u00a0;/);
    // Every site counted, or none: nothing more said.
    expect(resume(pageOf("saint-joseph")!, { dechets: morning } as never, AT).resume).not.toMatch(/à jour\u00a0;/);
    const joseph = communePage("https://rundata.re", pageOf("saint-joseph")!, { place: null, dechets: morning }, AT);
    expect(joseph).not.toContain("hors du compte");
  });
});
