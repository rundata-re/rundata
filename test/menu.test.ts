import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ouvrir } from "../src/web/associations-drapeau.js";
import { associationsPage } from "../src/web/associations.js";
import { WITH_PAGE } from "../src/web/categories.js";
import * as enfants from "../src/vie/enfants.js";
import type { Alerte } from "../src/web/data.js";
import { homePage, type HomeLive } from "../src/web/home.js";
import { esc } from "../src/web/map.js";
import { CSS, meteoPage, SOCIAL, STYLE_PATH } from "../src/web/pages.js";
import { type VolcanAlerte, withVolcan } from "../src/web/volcan-alerte.js";

const O = "https://rundata.re";
const NOW = new Date("2026-10-25T06:00:00Z");
const VIGILANCE: Alerte = { couleur: 3, texte: "Vigilance Météo-France : orange fortes pluies / orages (Est).", court: { couleur: "orange", phenomenes: ["Fortes pluies / orages"], zones: ["Est : Sainte-Suzanne, Saint-André"] } };
const VOLCAN: VolcanAlerte = { niveau: "Alerte 1", eruption: false };

// The keys in the bar on wide screens and in the menu's grid, in their order.
const bar = (html: string) => [...html.match(/<nav class="quick"[^>]*>(.*?)<\/nav>/s)![1].matchAll(/class="k-([a-z]+)"/g)].map((m) => m[1]);
const sheet = (html: string) => html.match(/<nav class="sheet"[^>]*>(.*?)<\/nav>/s)![1];
const menu = (html: string) => [...sheet(html).matchAll(/<a class="(?:kcomm )?k-([a-z]+)"/g)].map((m) => m[1]);
// The menu's five groups: their names and the pages of each, in their order.
const groupes = (html: string) =>
  [...sheet(html).matchAll(/<p class="sheet-h">([^<]+)<\/p>\s*<ul class="grid groupe">(.*?)<\/ul>/gs)].map((m) => [m[1], [...m[2].matchAll(/ href="([^"]+)"/g)].map((h) => h[1])]);
const tiles = (html: string) => [...html.match(/<ul class="tiles"[^>]*>(.*?)<\/ul>/s)![1].matchAll(/<li class="tile k-([a-z]+)/g)].map((m) => m[1]);

describe("the order of the pages", () => {
  it("puts the events, the hikes and the weather in the bar, without the vigilance, the volcano, the sea or the buses when all is quiet", () => {
    const page = meteoPage(O, null, NOW);
    expect(bar(page)).toEqual(["agenda", "sentiers", "meteo", "communes"]);
    expect(page).toContain('<a class="k-sentiers" href="/randonnees">');
    // The menu: « Communes » first, then the five groups in marketing's order (04/11/2026).
    expect(menu(page)[0]).toBe("communes");
    expect(groupes(page)).toEqual([
      ["Sécurité", ["/vigilance", "/cyclones", "/crues", "/volcan", "/feux", "/defibrillateurs"]],
      ["Météo et mer", ["/meteo", "/carte", "/historique", "/mer", "/baignade", "/air"]],
      ["Se déplacer", ["/trafic", "/bus", "/velos", "/bornes", "/carburants"]],
      ["Vie pratique", ["/actualites", "/eau", "/coupures-eau", "/secheresse", "/electricite", "/collecte", "/decheteries", "/ecoles", "/enfants", "/emploi", "/marches-publics", "/antennes", "/calendrier"]],
      ["Sortir", ["/evenements", "/randonnees", "/sentiers", "/sport", "/associations?ref=menu", "/peche"]],
    ]);
    // Under « Sécurité », the cyclone's three pages on one line.
    expect(sheet(page)).toContain(`<p class="cyc">Cyclone\u00a0: <a href="/kit-cyclone">kit</a> · <a href="/alerte-cyclone">alerte</a> · <a href="/ecoles-cyclone">écoles</a></p>`);
  });

  it("puts the vigilance first while it is above green, the volcano first while in alert, both when both are", () => {
    expect(bar(meteoPage(O, null, NOW, VIGILANCE))).toEqual(["vigilance", "agenda", "sentiers", "meteo", "communes"]);
    expect(bar(withVolcan(VOLCAN, () => meteoPage(O, null, NOW)))).toEqual(["volcan", "agenda", "sentiers", "meteo", "communes"]);
    const both = withVolcan(VOLCAN, () => meteoPage(O, null, NOW, VIGILANCE));
    expect(bar(both)).toEqual(["vigilance", "volcan", "agenda", "sentiers", "meteo", "communes"]);
    // The menu's groups stay as they are: the bar and the banners carry the alerts.
    expect(groupes(both)).toEqual(groupes(meteoPage(O, null, NOW)));
    // The home page shows the volcano's alert itself, without the banner: the bar still has it first.
    expect(bar(withVolcan(VOLCAN, () => homePage(O, null, NOW)))[0]).toBe("volcan");
  });

  it("keeps every page in the menu, quiet or not", () => {
    const all = [...WITH_PAGE.map((c) => c.key), "associations", "carte", "communes"];
    for (const page of [meteoPage(O, null, NOW), withVolcan(VOLCAN, () => meteoPage(O, null, NOW, VIGILANCE))]) {
      for (const k of all) expect(menu(page), k).toContain(k);
      for (const c of WITH_PAGE) expect(sheet(page), c.key).toContain(` href="${c.path}"`);
    }
  });

  it("has the map of every layer right after the first few pages, in the menu only", () => {
    const page = meteoPage(O, null, NOW);
    expect(menu(page).indexOf("carte")).toBe(menu(page).indexOf("meteo") + 1);
    expect(/<nav class="quick"[^]*?<\/nav>/.exec(page)![0]).not.toContain("k-carte");
  });

  it("has a tile for the clubs' space right after the sport's, with its own icon and colour, while the space is out", () => {
    const page = meteoPage(O, null, NOW);
    const keys = menu(page);
    expect(keys[keys.indexOf("sport") + 1]).toBe("associations");
    expect(page).toContain(`<li><a class="k-associations" href="/associations?ref=menu"><span class="kb"><svg class="ic"`);
    expect(page).toContain(`<span class="gn">Associations</span>`);
    expect(CSS).toContain(".k-associations{--k:#f472d0}");
    // Its page marked as the one shown, whatever the ?ref= of the link.
    expect(associationsPage(O, { clubs: 0, evenements: 0, prochains: [] })).toContain(`<a class="k-associations" href="/associations?ref=menu" aria-current="page">`);
    ouvrir(false);
    try {
      expect(menu(meteoPage(O, null, NOW))).not.toContain("associations");
    } finally {
      ouvrir(true);
    }
  });

  it("orders the home page's tiles as the menu, the traffic and a quiet vigilance and volcano with the sea and the buses at the end", () => {
    const quiet = homePage(O, null, NOW);
    expect(tiles(quiet)).toEqual(["agenda", "enfants", "sentiers", "meteo", "actualites", "historique", "cyclones", "peche", "velos", "bornes", "coupures", "dae",
      "feux", "secheresse", "sport", "eau", "air", "electricite", "calendrier", "antennes", "emploi", "marches", "trafic", "vigilance", "crues", "volcan", "mer", "bus", "services", "terrain"]);
    // Nothing hidden.
    expect([...tiles(quiet)].sort()).toEqual([...tiles(homePage(O, null, NOW, VIGILANCE))].sort());
  });

  it("puts the home page's vigilance and volcano tiles back first while in force, the other one still at the end", () => {
    const vigilance = tiles(homePage(O, null, NOW, VIGILANCE));
    expect(vigilance.slice(0, 5)).toEqual(["vigilance", "agenda", "enfants", "sentiers", "meteo"]);
    expect(vigilance.slice(-7)).toEqual(["trafic", "crues", "volcan", "mer", "bus", "services", "terrain"]);
    const volcan = tiles(withVolcan(VOLCAN, () => homePage(O, null, NOW)));
    expect(volcan.slice(0, 3)).toEqual(["volcan", "agenda", "enfants"]);
    expect(volcan.slice(-7)).toEqual(["trafic", "vigilance", "crues", "mer", "bus", "services", "terrain"]);
    const both = tiles(withVolcan(VOLCAN, () => homePage(O, null, NOW, VIGILANCE)));
    expect(both.slice(0, 3)).toEqual(["vigilance", "volcan", "agenda"]);
    expect(both.slice(-6)).toEqual(["trafic", "crues", "mer", "bus", "services", "terrain"]);
  });

  it("gives the children's tile the number of places, then the playgrounds, the parks and the pools, with nothing to fetch", () => {
    const tile = homePage(O, null, NOW).match(/<li class="tile k-enfants">(.*?)<\/li>/s)![1];
    expect(tile).toContain('<a href="/enfants">Enfants</a>');
    expect(tile).toContain(`<p class="tv">${enfants.LIEUX.length} lieux</p>`);
    const n = (k: string) => enfants.LIEUX.filter((l) => l.type === k).length;
    expect(tile).toContain(`<p class="td">${n("aire_de_jeux")} aires de jeux · ${n("parc")} parcs et jardins · ${n("piscine")} piscines · …</p>`);
    expect(tile).not.toContain("rechargez la page");
  });

  it("links rundata.re's accounts from the bar, the menu and the footer, counted as visits from the site", () => {
    const page = meteoPage(O, null, NOW);
    const header = page.match(/<header class="top">(.*?)<\/header>/s)![1];
    const top = header.match(/<nav class="follow-top"[^>]*>(.*?)<\/nav>/s)![1];
    const sheet = header.match(/<nav class="sheet"[^>]*>(.*?)<\/nav>/s)![1];
    // Out of the home page's top since it was made lighter (04/11/2026): in the footer of every page.
    const foot = homePage(O, null, NOW).split('<footer class="foot">')[1];
    for (const s of SOCIAL) {
      const link = `<a href="${s.nom === "GitHub" ? s.url : `${s.url}?ref=site`}" rel="noopener" aria-label="rundata.re sur ${s.nom}">`;
      expect(top).toContain(`${link}${s.svg}</a>`);
      expect(sheet).toContain(`${link}${s.svg}${s.nom}</a>`);
      expect(foot).toContain(`${link}${s.svg}${s.nom}</a>`);
    }
  });
});

describe("the alerts on a phone", () => {
  // The words of the vigilance's line on a page other than /vigilance.
  const said = (a: Alerte) => [...meteoPage(O, null, NOW, a).matchAll(/<a class="ligne" href="[^"]+">(?:<span aria-hidden="true">[^<]+<\/span>)?<span class="txt">(.*?)<\/span><span aria-hidden="true">→/g)].map((m) => m[1]);
  // The HTML of a line's words: the last part kept whole in its own span, the apostrophe escaped. Compared as HTML,
  // never with the tags taken out.
  const frag = (t: string) => {
    const i = t.lastIndexOf(" · ");
    return i < 0 ? esc(t) : `${esc(t.slice(0, i))} <span class="nw">· ${esc(t.slice(i + 3))}</span>`;
  };
  const frags = (ts: string[]) => ts.map(frag);
  const vigilance = (couleur: string, phenomenes: string[], zones: string[]): Alerte => ({ couleur: 2, texte: "Vigilance Météo-France : …", court: { couleur, phenomenes, zones } });
  const LAND = ["Nord : Saint-Denis", "Est : Saint-Benoît", "Sud-Est : Saint-Joseph", "Sud : Saint-Pierre", "Ouest : Saint-Paul"];
  const coasts = (n: number) => Array.from({ length: n }, (_, i) => `Zone côtière ${i}`);

  it("are one line each, stacked without a gap, the vigilance then the volcano, each to its page", () => {
    const home = withVolcan(VOLCAN, () => homePage(O, null, NOW, VIGILANCE));
    const lines = [...home.matchAll(/<a class="ligne" href="([^"]+)"><span aria-hidden="true">([^<]+)<\/span><span class="txt">(.*?)<\/span><span aria-hidden="true">→<\/span>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(lines).toEqual([
      ["/vigilance", "⚠", frag("Météo-France : vigilance orange pluies-orages · Est")],
      ["/volcan", "🌋", frag("Volcan\u00a0: alerte\u00a01 du préfet · Enclos interdit")],
    ]);
    // The sentences stay on wider screens: only below 600 px the line replaces them, never cut with « … ».
    expect(CSS).toContain(".ligne{display:none}");
    expect(CSS).toContain("@media (max-width:599.98px){[data-court]>.wrap,[data-court]>.card{display:none}");
    expect(CSS).toContain(".ligne .txt{flex:1;min-width:0}");
    expect(CSS).not.toContain("text-overflow:ellipsis");
    // On two lines, the break comes before the last « · », never inside « Sud-Est » nor « Enclos interdit ».
    expect(home).toContain('<span class="txt">Météo-France : vigilance orange pluies-orages <span class="nw">· Est</span></span>');
    expect(CSS).toContain(".ligne .nw{white-space:nowrap}");
    expect(CSS).toContain(".volcan-une[data-court]{padding:0;max-width:none}");
  });

  it("say the vigilance's colour, two phenomena at most by their short names, and the zones named, counted or whole (marketing)", () => {
    expect(said(vigilance("jaune", ["Fortes pluies / orages"], ["Sud-Est : Saint-Joseph, Saint-Philippe"]))).toEqual(frags(["Météo-France : vigilance jaune pluies-orages · Sud-Est"]));
    expect(said(vigilance("orange", ["Vents forts"], LAND))).toEqual(frags(["Météo-France : vigilance orange vents forts · toute l'île"]));
    expect(said(vigilance("jaune", ["Fortes pluies / orages"], LAND.slice(2, 4)))).toEqual(frags(["Météo-France : vigilance jaune pluies-orages · Sud-Est, Sud"]));
    expect(said(vigilance("jaune", ["Fortes pluies / orages"], LAND.slice(0, 3)))).toEqual(frags(["Météo-France : vigilance jaune pluies-orages · 3 zones"]));
    expect(said(vigilance("jaune", ["Vagues - submersion"], coasts(3)))).toEqual(frags(["Météo-France : vigilance jaune vagues-submersion · 3 zones côtières"]));
    expect(said(vigilance("jaune", ["Vagues - submersion"], coasts(1)))).toEqual(frags(["Météo-France : vigilance jaune vagues-submersion · 1 zone côtière"]));
    expect(said(vigilance("orange", ["Vagues - submersion"], coasts(8)))).toEqual(frags(["Météo-France : vigilance orange vagues-submersion · toutes les côtes"]));
    expect(said(vigilance("orange", ["Fortes pluies / orages", "Vents forts", "Vagues - submersion"], [LAND[1], ...coasts(2)]))).toEqual(frags(["Météo-France : vigilance orange pluies-orages, vents forts · Est, 2 zones côtières"]));
  });

  it("give the cyclone alert to the prefect, with the schools closed on a line of their own (marketing)", () => {
    const cyclone = (c: number, prevue = false, ecoles?: boolean): Alerte => ({ couleur: c, texte: "Météo-France : …", ecoles, court: { cyclone: c, prevue } });
    expect(said(cyclone(2))).toEqual(frags(["Pré-alerte cyclonique du préfet"]));
    expect(said(cyclone(3))).toEqual(frags(["Alerte cyclonique orange du préfet"]));
    expect(said(cyclone(4))).toEqual(frags(["Alerte cyclonique rouge du préfet"]));
    expect(said(cyclone(6))).toEqual(frags(["Phase de sauvegarde cyclonique du préfet"]));
    expect(said(cyclone(3, true))).toEqual(frags(["Alerte cyclonique prévue par le préfet"]));
    const schools = meteoPage(O, null, NOW, cyclone(4, false, true));
    expect(said(cyclone(4, false, true))).toEqual(frags(["Alerte cyclonique rouge du préfet", "Écoles et crèches fermées"]));
    expect(schools).toContain('<a class="ligne" href="/ecoles-cyclone"><span class="txt">Écoles et crèches fermées</span><span aria-hidden="true">→</span></a>');
  });
});
