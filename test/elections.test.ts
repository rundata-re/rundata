import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import * as elections from "../src/vie/elections.js";
import data from "../src/vie/elections.json" with { type: "json" };
import { communePage, electionsPage } from "../src/web/commune.js";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { adresseTexte } from "../src/web/adresse.js";
import { esc } from "../src/web/map.js";
import { PAGES, pageOf } from "../src/web/places.js";

// Tuesday 3/11/2026, 20:00 at La Réunion.
const NOW = new Date("2026-11-03T16:00:00Z");
const COMMUNES = Object.keys(INSEE);
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null }, NOW);
/** The commune's elections page (/communes/<commune>/elections). */
const elec = (slug: string) => electionsPage("https://rundata.re", pageOf(slug)!)!;
const section = (slug: string) => {
  const html = elec(slug);
  const at = html.indexOf('<section id="elections"');
  return html.slice(at, html.indexOf("</section>", at));
};
/** Every key of an object, at any depth. */
const keys = (x: unknown): string[] => (x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => [k, ...keys(v)]) : []);

describe("the elections of each commune (vie/elections.ts)", () => {
  it("are every scrutin of the file from 1999, newest first, never the régionales 2004, in the 24 communes but the cantonales", () => {
    const ids = data.scrutins.map((s) => s.id);
    expect(ids).toHaveLength(30);
    expect(ids.slice(0, 6)).toEqual(["2026_muni", "2024_legi", "2024_euro", "2022_legi", "2022_pres", "2021_regi"]);
    expect(ids.at(-1)).toBe("1999_euro");
    expect(ids).not.toContain("2004_regi");
    expect(data.scrutins.reduce((n, s) => n + s.tours.length, 0)).toBe(54);
    expect(elections.DEBUT).toBe(1999);
    for (const c of COMMUNES) {
      const all = elections.ofCommune(c);
      expect(all.filter((s) => s.type !== "cant")).toHaveLength(26);
      expect(all.map((s) => s.annee)).toEqual([...all.map((s) => s.annee)].sort((x, y) => y - x));
    }
    // Half the cantons each time: Cilaos's in 2004 and 2011, Saint-Pierre's in 2001 and 2008.
    expect(elections.ofCommune("Cilaos").filter((s) => s.type === "cant").map((s) => s.annee)).toEqual([2011, 2004]);
    expect(elections.ofCommune("Saint-Pierre").filter((s) => s.type === "cant").map((s) => s.annee)).toEqual([2008, 2001]);
    expect(elections.ofCommune("Saint-Paul").find((s) => s.id === "2024_euro")!.tours).toHaveLength(1);
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: elections.SOURCE.id }));
  });

  it("add up: in every block, the voix of its lines make its exprimés, and its votants its exprimés, blancs and nuls", () => {
    for (const c of COMMUNES)
      for (const s of elections.ofCommune(c))
        for (const blocs of s.tours)
          for (const b of blocs) {
            expect(b.lignes.reduce((n, l) => n + l.voix, 0)).toBe(b.exprimes);
            // Up to 2015 the file has no blancs: its nuls are both.
            expect(b.exprimes + (b.blancs ?? 0) + b.nuls).toBe(b.votants);
            expect(b.blancs === null).toBe(s.annee <= 2015);
            expect(b.votants + b.abstentions).toBe(b.inscrits);
          }
  });

  it("keep each block's lines in the order of their panels, one line a panel, or of the alphabet when the file has no panel", () => {
    const sans = new Set<string>();
    for (const c of COMMUNES)
      for (const s of elections.ofCommune(c))
        for (const b of s.tours.flat()) {
          const panels = b.lignes.map((l) => l.panneau);
          if (panels.every((x) => x === null)) {
            sans.add(s.id);
            const names = b.lignes.map((l) => (l.nom ?? l.tete)!.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
            expect(names).toEqual([...names].sort());
            continue;
          }
          expect(panels).toEqual([...panels].sort((x, y) => x! - y!));
          expect(new Set(panels).size).toBe(panels.length);
        }
    expect([...sans].sort()).toEqual(["2004_euro", "2008_muni", "2009_euro"]);
  });

  it("split a commune by circonscription or canton, named as the file names them, or by its ballots when it does not", () => {
    const blocs = (c: string, id: string) => elections.ofCommune(c).find((s) => s.id === id)!.tours[0]!;
    expect(blocs("Saint-Denis", "2024_legi").map((b) => b.lieu)).toEqual(["1re circonscription", "6e circonscription"]);
    expect(blocs("Saint-Denis", "2012_legi").map((b) => b.lieu)).toEqual(["1re circonscription", "6e circonscription"]);
    expect(blocs("Saint-Denis", "2021_dpmt").map((b) => b.lieu)).toEqual(["Saint-Denis-1", "Saint-Denis-2", "Saint-Denis-3", "Saint-Denis-4"]);
    expect(blocs("Saint-Denis", "2008_cant").map((b) => b.lieu)).toEqual(Array(7).fill(null));
    expect(blocs("Saint-Denis", "2007_legi")).toHaveLength(1);
    expect(elections.partie("dpmt", blocs("Saint-Denis", "2021_dpmt")[1]!, 1, 4)).toBe("Canton de Saint-Denis-2");
    expect(elections.partie("cant", blocs("Saint-Denis", "2008_cant")[1]!, 1, 7)).toBe("Canton non nommé dans le fichier (2 sur 7)");
  });

  it("hold no political nuance, no bureau and no sex: figures, panels and names as published", () => {
    expect(keys(data).filter((k) => /nuance|bureau|bv|sexe|elu/i.test(k))).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/"(?:LDVD|LDVG|LDVC|LUG|LRN|DVD|DVG|BC-[A-Z]+)"/);
  });

  it("count the participation of the first rounds since 2002 where the whole commune votes", () => {
    const p = elections.participation("Saint-Paul");
    expect(p.map((x) => x.type)).toEqual(["muni", "legi", "euro", "pres", "regi", "dpmt"]);
    expect(p.find((x) => x.type === "euro")!.tours[0]!.annee).toBe(1999);
    // Never the régionales 2004 (three communes in the file), never the cantonales (half the cantons each time).
    expect(p.find((x) => x.type === "regi")!.tours.map((t) => t.annee)).not.toContain(2004);
    expect(Object.keys(data.participation)).not.toContain("cant");
    for (const c of COMMUNES) for (const x of elections.participation(c)) for (const t of x.tours) expect(t.votants).toBeLessThanOrEqual(t.inscrits);
  });
});

describe("the tables of a commune's elections page", () => {
  it("each have a name for a screen reader, the titles shown above them", () => {
    const html = elec("saint-paul");
    const tables = html.match(/<table[^>]*>/g) ?? [];
    expect(tables.length).toBeGreaterThan(50);
    expect(html.match(/<table[^>]*><caption class="sr">/g)).toHaveLength(tables.length);
    // The scrutin, then its round and its part where it has several, as its headings say.
    expect(html).toContain('<caption class="sr">Municipales 2020, 1er tour</caption>');
    expect(html).toMatch(/<caption class="sr">Législatives 2024, 1er tour, [^<]+<\/caption>/);
    expect(html).toContain('<caption class="sr">Participation</caption>');
  });
});

describe("the part « Élections » of a commune's page", () => {
  it("comes after the doctors and before what holds for the whole island", () => {
    const html = page("saint-paul");
    expect(html.indexOf('<section id="medecins"')).toBeLessThan(html.indexOf('<section id="elections"'));
    expect(html.indexOf('<section id="elections"')).toBeLessThan(html.indexOf('id="h-ile"'));
  });

  it("says the ministry's words, then a card a type, a folded block a scrutin, its lines in the order of the panels", () => {
    const part = section("saint-paul");
    expect(elec("saint-paul")).toContain("<h1>Élections à Saint-Paul</h1>");
    expect(elec("saint-paul")).toContain(esc("Chaque scrutin à Saint-Paul, tel que le ministère de l'Intérieur le publie : inscrits, votants, blancs, nuls, exprimés, puis les voix de chaque candidat ou liste. Le jeu de données commence en 1999 : les scrutins plus anciens ne sont pas repris."));
    expect(part).toContain(esc("Les candidats et les listes sont dans l'ordre des panneaux (N°), celui du ministère, quel que soit le résultat, avec leurs voix et leur % des exprimés. Les nuances politiques ne sont pas reprises. Sans panneaux dans le fichier (Européennes 2009, Municipales 2008, Européennes 2004), les listes sont dans l'ordre alphabétique. Jusqu'en 2015, le fichier compte les blancs avec les nuls."));
    expect(part).toContain(esc("La commune est partagée entre plusieurs circonscriptions : les résultats sont donnés pour chacune. La commune est partagée entre plusieurs cantons : les résultats sont donnés pour chacun. Quand le fichier ne nomme pas la circonscription ou le canton, les bureaux sont regroupés par leurs candidats."));
    // The cantonales' note in one sentence, in full on /a-propos.
    expect(part).toContain(`<p class="note">${esc("Aux cantonales, la moitié des cantons votait à chaque fois\u00a0: seuls les bureaux des cantons qui votaient sont comptés.")} <a href="/a-propos#cantonales">Pourquoi elles ne se comparent pas aux départementales →</a></p>`);
    expect(part).not.toContain("redessinés en 2015");
    expect(part.match(/<h3>[^<]+<\/h3>/g)).toEqual(["Municipales", "Législatives", "Européennes", "Présidentielle", "Régionales", "Départementales", "Cantonales", "Participation"].map((t) => `<h3>${t}</h3>`));
    expect(part).toContain(esc("blancs et nuls : "));
    // Four short columns; none for the panels where the file has none.
    expect(part).toContain(`<thead><tr><th scope="col">N°</th><th scope="col">Candidat</th><th scope="col">Voix</th><th scope="col">%</th></tr></thead>`);
    const euro2009 = part.slice(part.indexOf("<h4>Européennes 2009</h4>"), part.indexOf("<h4>Européennes 2004</h4>"));
    expect(euro2009).toContain(`<thead><tr><th scope="col">Liste</th><th scope="col">Voix</th><th scope="col">%</th></tr></thead>`);
    expect(euro2009).not.toContain("N°");
    expect(part).toContain(esc("Les bureaux de vote changent de périmètre d'une élection à l'autre : la série est donnée pour la commune entière."));
    // The sources at the foot of the page.
    expect(elec("saint-paul")).toContain(`<p class="sources">${adresseTexte("Source\u00a0: Ministère de l'Intérieur, données agrégées par data.gouv.fr (Licence Ouverte Etalab 2.0), jeu mis à jour le 07/07/2026.")}</p>`);
    for (const s of elections.ofCommune("Saint-Paul")) expect(part).toContain(`<summary><h4>${s.nom}</h4></summary>`);
    // The présidentielle's first round: its twelve candidates in the order of their panels.
    const pres = elections.ofCommune("Saint-Paul").find((s) => s.type === "pres")!.tours[0]![0]!;
    const where = pres.lignes.map((l) => part.indexOf(`<tr><td>${l.panneau}</td><td>${esc(l.nom!)}</td>`));
    expect(where.every((i) => i > 0)).toBe(true);
    expect(where).toEqual([...where].sort((x, y) => x - y));
  });

  it("marks no line: no bold, no colour, no bar, no « élu » nor « en tête », no link, no person in the page's data", () => {
    for (const slug of ["saint-paul", "cilaos", "le-port"]) {
      const part = section(slug);
      // One link only, the cantonales' note's.
      expect(part.replace('<a href="/a-propos#cantonales">', "")).not.toMatch(/<b>|<strong|style=|class="[^"]*(?:bar|barre|q-)|élue?s?\b|en tête|gagn|vainqueur|href=/i);
      expect(page(slug)).not.toContain('"Person"');
      expect(elec(slug)).not.toContain('"Person"');
    }
  });
});

describe("a commune's elections page, and its summary on the commune's page", () => {
  it("has marketing's title, description and h1, its own canonical, and the first year of the commune's scrutins", () => {
    const html = elec("le-port");
    expect(html).toContain("<title>Élections au Port depuis 1999 · La Réunion (974)</title>");
    // The suffix of the other pages, within the 60 characters a search engine shows, for the 24 communes.
    const communes = PAGES.filter((p) => p.commune);
    expect(communes).toHaveLength(24);
    for (const c of communes) {
      const t = electionsPage("https://rundata.re", c)!.match(/<title>(.*?)<\/title>/)![1].replaceAll("&#39;", "'");
      expect(t, c.nom).toMatch(/^Élections .+ · La Réunion \(974\)$/);
      expect(t.length, t).toBeLessThanOrEqual(60);
    }
    expect(elec("la-plaine-des-palmistes")).toContain("<title>Élections à La Plaine-des-Palmistes · La Réunion (974)</title>");
    expect(html).toContain(`<meta name="description" content="Chaque scrutin au Port depuis 1999, tel que le ministère de l&#39;Intérieur le publie\u00a0: inscrits, votants, blancs et nuls, résultats.">`);
    expect(html).toContain("<h1>Élections au Port</h1>");
    expect(html).toContain('<link rel="canonical" href="https://rundata.re/communes/le-port/elections">');
    expect(html).not.toContain("noindex");
    expect(html).toContain('<li><a href="/communes/le-port">Le Port</a></li><li aria-current="page">Élections</li>');
  });

  it("leaves on the commune's page the last participation against the island's, no candidate, and the link", () => {
    const h = page("saint-paul");
    const at = h.indexOf('<section id="elections"');
    const part = h.slice(at, h.indexOf("</section>", at));
    expect(part).toContain(`<h2 id="h-elections">Élections à Saint-Paul</h2>`);
    expect(part).toContain(esc("Municipales 2026, 1er tour\u00a0: 50,51\u00a0% des inscrits ont voté à Saint-Paul, 55,27\u00a0% dans toute l'île."));
    expect(part).toContain(`<a href="/communes/saint-paul/elections">${esc("Les élections à Saint-Paul depuis 1999\u00a0: participation et résultats →")}</a>`);
    expect(part).not.toContain("<table");
    // No candidate: each line by the name it has, its list's or its head's (in 2026 the lines have no head, `tete: null`).
    const names = elections.ofCommune("Saint-Paul")[0]!.tours[0]![0]!.lignes.map((l) => l.nom ?? l.tete).filter((x): x is string => !!x);
    expect(names.length).toBeGreaterThan(1);
    for (const n of names) expect(part).not.toContain(esc(n));
  });

  it("is served for each commune, never for a place that is not one, and /a-propos holds the cantonales' note", async () => {
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    for (const slug of ["petite-ile", "le-port", "saint-denis"]) {
      const r = await handle(new Request(`https://rundata.re/communes/${slug}/elections`), cache);
      expect(r.status, slug).toBe(200);
    }
    expect((await handle(new Request("https://rundata.re/communes/l-hermitage/elections"), cache)).status).toBe(404);
    const about = await (await handle(new Request("https://rundata.re/a-propos"), cache)).text();
    expect(about).toContain('<h2 id="cantonales">');
    expect(about).toContain("Ces cantons ne sont pas ceux des départementales, redessinés en 2015");
  });
});
