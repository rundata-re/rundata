import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import * as elections from "../src/vie/elections.js";
import data from "../src/vie/elections.json" with { type: "json" };
import { communePage } from "../src/web/commune.js";
import { esc } from "../src/web/map.js";
import { pageOf } from "../src/web/places.js";

// Tuesday 3/11/2026, 20:00 at La Réunion.
const NOW = new Date("2026-11-03T16:00:00Z");
const COMMUNES = Object.keys(INSEE);
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null }, NOW);
const section = (slug: string) => {
  const html = page(slug);
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

describe("the part « Élections » of a commune's page", () => {
  it("comes after the doctors and before what holds for the whole island", () => {
    const html = page("saint-paul");
    expect(html.indexOf('<section id="medecins"')).toBeLessThan(html.indexOf('<section id="elections"'));
    expect(html.indexOf('<section id="elections"')).toBeLessThan(html.indexOf('id="h-ile"'));
  });

  it("says the ministry's words, then a card a type, a folded block a scrutin, its lines in the order of the panels", () => {
    const part = section("saint-paul");
    expect(part).toContain(`<p class="eyebrow">Ministère de l'Intérieur</p><h2 id="h-elections">Élections à Saint-Paul</h2>`);
    expect(part).toContain(esc("Chaque scrutin à Saint-Paul, tel que le ministère de l'Intérieur le publie : inscrits, votants, blancs, nuls, exprimés, puis les voix de chaque candidat ou liste. Le jeu de données commence en 1999 : les scrutins plus anciens ne sont pas repris."));
    expect(part).toContain(esc("Les candidats et les listes sont dans l'ordre des panneaux (N°), celui du ministère, quel que soit le résultat, avec leurs voix et leur % des exprimés. Les nuances politiques ne sont pas reprises. Sans panneaux dans le fichier (Européennes 2009, Municipales 2008, Européennes 2004), les listes sont dans l'ordre alphabétique. Jusqu'en 2015, le fichier compte les blancs avec les nuls."));
    expect(part).toContain(esc("La commune est partagée entre plusieurs circonscriptions : les résultats sont donnés pour chacune. La commune est partagée entre plusieurs cantons : les résultats sont donnés pour chacun. Quand le fichier ne nomme pas la circonscription ou le canton, les bureaux sont regroupés par leurs candidats."));
    expect(part).toContain(esc("Ces cantons ne sont pas ceux des départementales, redessinés en 2015 : les deux ne se comparent pas."));
    expect(part.match(/<h3>[^<]+<\/h3>/g)).toEqual(["Municipales", "Législatives", "Européennes", "Présidentielle", "Régionales", "Départementales", "Cantonales", "Participation"].map((t) => `<h3>${t}</h3>`));
    expect(part).toContain(esc("blancs et nuls : "));
    // Four short columns; none for the panels where the file has none.
    expect(part).toContain(`<thead><tr><th scope="col">N°</th><th scope="col">Candidat</th><th scope="col">Voix</th><th scope="col">%</th></tr></thead>`);
    const euro2009 = part.slice(part.indexOf("<h4>Européennes 2009</h4>"), part.indexOf("<h4>Européennes 2004</h4>"));
    expect(euro2009).toContain(`<thead><tr><th scope="col">Liste</th><th scope="col">Voix</th><th scope="col">%</th></tr></thead>`);
    expect(euro2009).not.toContain("N°");
    expect(part).toContain(esc("Les bureaux de vote changent de périmètre d'une élection à l'autre : la série est donnée pour la commune entière."));
    // The sources at the foot of the page.
    expect(page("saint-paul")).toContain(`<p class="sources">${esc("Source\u00a0: Ministère de l'Intérieur, données agrégées par data.gouv.fr (Licence Ouverte Etalab 2.0), jeu mis à jour le 07/07/2026.")}</p>`);
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
      expect(part).not.toMatch(/<b>|<strong|style=|class="[^"]*(?:bar|barre|q-)|élue?s?\b|en tête|gagn|vainqueur|href=/i);
      expect(page(slug)).not.toContain('"Person"');
    }
  });
});
