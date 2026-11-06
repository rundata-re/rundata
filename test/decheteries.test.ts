import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as tco from "../src/providers/tco.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { WASTE } from "../src/tools/decheteries.js";
import { communePage } from "../src/web/commune.js";
import { anchorOf, decheteriesPage, descriptionOf, TITLE } from "../src/web/decheteries.js";
import { pageOf } from "../src/web/places.js";
import { ELSEWHERE, ELSEWHERE_COMMUNES, epciOf, SITES, sitesNow, SURVEY, TCO_COMMUNES, wasteAsked } from "../src/vie/decheteries.js";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/tco_meteo.json", import.meta.url), "utf8"));
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
    expect(SITES).toHaveLength(13);
    expect(TCO_COMMUNES.sort()).toEqual(["La Possession", "Le Port", "Les Trois-Bassins", "Saint-Leu", "Saint-Paul"]);
    expect(etats).toHaveLength(13);
    const dosDane = etats.find((e) => e.lien.endsWith("decheterie-de-dos-dane"))!;
    expect(dosDane.maj).toBe("2026-10-24T11:02:00.000Z");
    expect(dosDane.accepte).toMatchObject({ dechets_verts: true, encombrants: false });
    expect(sitesNow(etats, NOW).every((s) => s.mis_a_jour)).toBe(true);
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
    expect(r.avertissements).toContain("Horaires par déchèterie sur sa page du TCO, qui les dit ouvertes 7 jours sur 7.");
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
    expect(page).toContain('<h1>Les déchèteries de l&#39;île, et les bennes en direct dans l&#39;Ouest <span class="n974">974</span></h1>');
    for (const id of ["saint-paul", "le-port", "la-possession", "les-trois-bassins", "saint-leu"]) expect(page).toContain(`<section id="${id}"`);
    expect(TITLE).toBe("Déchèteries 974 : adresses, bennes en direct dans l'Ouest");
    expect(descriptionOf(sitesNow(etats, NOW))).toBe("Déchèteries de La Réunion (974) : où déposer déchets verts, encombrants, gravats, dans toute l'île ; bennes pleines en direct dans l'Ouest (TCO).");
    expect(descriptionOf(sitesNow(etats, NEXT_MORNING))).toBe("Déchèteries de La Réunion (974) : où déposer déchets verts, encombrants, gravats, dans toute l'île ; bennes pleines en direct dans l'Ouest (TCO).");
    expect(decheteriesPage("https://rundata.re", copy, NEXT_MORNING)).toContain("Mise à jour il y a plus de 6 h : à vérifier sur place.");
    // The green dot only with a state the staff filled in today, read in direct; the next morning, none.
    expect(page).toContain('<p class="pill"><span class="dot"></span>État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr></p>');
    expect(decheteriesPage("https://rundata.re", copy, NEXT_MORNING)).toContain('<p class="pill">État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr></p>');
    expect(decheteriesPage("https://rundata.re", null, NOW)).toContain('<p class="pill">État des bennes · déchèteries du <abbr title="Territoire de la Côte Ouest">TCO</abbr></p>');
  });

  it("fold each commune under its name, its number of sites and its full skips, never « aucune » deduced", () => {
    const heads = (html: string) => new Map([...html.matchAll(/<summary><h2 id="h-([a-z-]+)">[^<]+ <small>·\u00a0([^<]+)<\/small><\/h2><\/summary>/g)].map((m) => [m[1], m[2]]));
    const now = sitesNow(etats, NOW);
    const page = heads(decheteriesPage("https://rundata.re", copy, NOW));
    expect(page.size).toBe(TCO_COMMUNES.length + ELSEWHERE_COMMUNES.length);
    for (const c of TCO_COMMUNES) {
      const here = now.filter((x) => x.commune === c);
      const full = here.reduce((n, x) => n + (x.a_jour ? x.refuse.length : 0), 0);
      const sites = `${here.length}\u00a0déchèterie${here.length > 1 ? "s" : ""}`;
      expect(page.get(anchorOf(c)), c).toBe(full ? `${sites} ·\u00a0${full}\u00a0benne${full > 1 ? "s" : ""} pleine${full > 1 ? "s" : ""}` : sites);
    }
    for (const c of ELSEWHERE_COMMUNES) expect(page.get(anchorOf(c))).toMatch(/^\d+\u00a0déchèteries?$/);
    // The fixture has full skips somewhere; the next morning, nothing recent: no count, and never « aucune ».
    expect([...page.values()].some((v) => v.includes("pleine"))).toBe(true);
    const late = decheteriesPage("https://rundata.re", copy, NEXT_MORNING);
    expect([...heads(late).values()].some((v) => v.includes("benne"))).toBe(false);
    expect(late).not.toMatch(/aucune benne/i);
    expect(heads(decheteriesPage("https://rundata.re", null, NOW)).size).toBe(TCO_COMMUNES.length + ELSEWHERE_COMMUNES.length);
    // Folded, the commune's anchor on its section: the page's script opens the details inside (UNFOLD_SCRIPT).
    const html = decheteriesPage("https://rundata.re", copy, NOW);
    expect(html).toContain('<section id="saint-paul" aria-labelledby="h-saint-paul">\n  <details class="pli"><summary>');
    expect(html).not.toMatch(/<details class="pli" open/);
    expect(html).toContain('t.querySelector(":scope>details")');
  });

  it("have a tile on the West's commune pages, with the state of their skips", () => {
    const paul = communePage("https://rundata.re", pageOf("saint-paul")!, { place: null, dechets: copy }, NOW);
    expect(paul).toMatch(/<h3><a href="\/decheteries#saint-paul">Déchèteries<span class="sr"> à Saint-Paul<\/span><\/a><\/h3><p class="tv">5 déchèteries<\/p><p class="td">d'après les agents : déchets verts acceptés dans \d sur 5, encombrants dans \d sur 5<\/p>/);
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

  it("are the sites of its latest survey in the four other intercommunalités, none of the TCO's", () => {
    expect(SURVEY).toBe(2026);
    const count = (nom: string) => ELSEWHERE.filter((s) => s.epci.nom === nom).length;
    expect([count("la CIVIS"), count("la CASUD"), count("la CINOR"), count("la CIREST")]).toEqual([8, 4, 11, 7]);
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

  it("answer a commune without a site with the nearest others, each with its own intercommunalité", async () => {
    const r = body(await annuaireTool(new Cache(), "encombrants", "Saint-Philippe", NOW));
    expect(r.decheteries).toHaveLength(3);
    expect(r.decheteries.some((d: { commune: string }) => d.commune === "Saint-Philippe")).toBe(false);
    expect(r.decheteries[0]).toMatchObject({ commune: "Saint-Joseph", horaires: "voir le site de la CASUD", page: "https://www.casud.re/au-quotidien/preserver-lenvironnement/je-depose-en-decheterie" });
  });

  it("are on the page, a block per commune, and on the commune's page", () => {
    const page = decheteriesPage("https://rundata.re", copy, NOW);
    for (const c of ELSEWHERE_COMMUNES) expect(page).toContain(`<section id="${anchorOf(c)}"`);
    expect(page).toContain('<h3>Déchèterie Saint-Pierre Palama</h3><p>2 Chemin Palama</p>');
    expect(page).toContain('Horaires\u00a0: voir le site de <a href="https://www.civis.re/" rel="noopener">la CIVIS</a>.');
    expect(page).toContain("Déchèteries selon l&#39;annuaire des déchèteries de l&#39;<abbr title=\"Agence de la transition écologique\">ADEME</abbr> (enquête 2026, mis à jour le ");
    const pierre = communePage("https://rundata.re", pageOf("saint-pierre")!, { place: null }, NOW);
    expect(pierre).toContain('<h3><a href="/decheteries#saint-pierre">Déchèteries<span class="sr"> à Saint-Pierre</span></a></h3><p class="tv">4 déchèteries</p><p class="td">horaires\u00a0: voir le site de la <abbr title="Communauté intercommunale des villes solidaires">CIVIS</abbr></p>');
    expect(communePage("https://rundata.re", pageOf("saint-philippe")!, { place: null }, NOW)).not.toMatch(/Déchèteries(<span class="sr">[^<]*<\/span>)?<\/a><\/h3>/);
  });
});
