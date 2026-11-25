import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as climat from "../src/providers/climat.js";
import { confianceExplication } from "../src/tools/prevision.js";
import { historiqueMeteo, reperesMois, type ReperesMois } from "../src/tools/historique.js";
import { placePage, reperesBlock } from "../src/web/lieu-page.js";
import { meteoPage } from "../src/web/meteo-page.js";
import { pageOf } from "../src/web/places.js";

// « Repères du mois » of a place's weather page (wording validated on 14/11/2026; the records' sentence, 19/11/2026), from real
// rows of the archive (scripts/build-climat.py): records stored up to 2025, days of 2026 up to 23 October.
const NOW = new Date("2026-10-24T08:00:00Z");
const O = "https://rundata.re";
let db: DatabaseSync;
beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./fixtures/historique/climat.sql", import.meta.url), "utf8"));
});
afterEach(() => climat.configure(undefined));

function plug() {
  let queries = 0;
  climat.configure({ all: async <T>(sql: string, ...params: unknown[]) => (queries++, db.prepare(sql).all(...(params as (string | number)[])) as T[]) });
  return () => queries;
}

const R: ReperesMois = {
  poste: "97424410",
  station: "Cilaos",
  distance_km: 0.4,
  mois: 9,
  periode: "1991-2020",
  normale: { tx: 22.4, tn: 9.8, rr: 33 },
  depuis: 1952,
  chaleur: { valeur: 29.5, annee: 2019 },
  pluie: { valeur: 120.4, annee: 1998 },
};

describe("the month's landmarks of a place", () => {
  it("are the normals and records of this month at the station that speaks best for the place, in two queries after the stations", async () => {
    const cache = new Cache(new MemoryStore());
    const queries = plug();
    await climat.postes(cache);
    const before = queries();
    const r = await reperesMois(cache, pageOf("cilaos")!.place, NOW);
    expect(queries() - before).toBe(2);
    expect(r).toMatchObject({ poste: "97424410", mois: 9, periode: "1991-2020", depuis: 1952 });
    // October's normals, read from the bundled file, never written here.
    const n = climat.normalesOf("97424410")!;
    expect(r!.normale).toEqual({ tx: n.tx![9], tn: n.tn![9], rr: n.rr![9] });
    expect(r!.chaleur?.annee).toBeGreaterThanOrEqual(1952);
    expect(r!.pluie?.annee).toBeGreaterThanOrEqual(1952);
    expect(r!.distance_km).toBeLessThan(8);
  });

  it("keep the normals when the records do not answer", async () => {
    const cache = new Cache(new MemoryStore());
    plug();
    await climat.postes(cache);
    climat.configure({ all: async () => { throw new Error("D1 indisponible"); } });
    const r = await reperesMois(cache, pageOf("cilaos")!.place, NOW);
    expect(r?.normale).toBeDefined();
    expect(r?.chaleur).toBeUndefined();
    expect(r?.pluie).toBeUndefined();
  });

  it("are given by historique_meteo too when its records are not at the page's station, the same figures (audit of 20/11/2026)", async () => {
    plug();
    const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
    // Entre-Deux: no station measured its last 14 days' temperatures, the page has its landmarks at Pierrefonds.
    const page = await reperesMois(new Cache(new MemoryStore()), pageOf("entre-deux")!.place, NOW);
    const a = json(await historiqueMeteo(new Cache(new MemoryStore()), "Entre-Deux", { jours: 14 }, NOW));
    expect(a.records).toBeUndefined();
    expect(a.reperes_du_mois).toMatchObject({
      station: page!.station,
      distance_km: page!.distance_km,
      mois: "octobre",
      normale: { maximale: page!.normale.tx, minimale: page!.normale.tn, pluie_du_mois_mm: page!.normale.rr, periode: "1991-2020" },
      record_de_chaleur: page!.chaleur,
      releves_depuis: page!.depuis,
    });
    expect(a.reperes_du_mois.a_savoir).toMatch(/^Les repères d'octobre de la page du lieu sur rundata\.re \(\/meteo\), à la station /);
    // Saint-Pierre: the records already are the page's station's, nothing twice.
    const b = json(await historiqueMeteo(new Cache(new MemoryStore()), "Saint-Pierre", { jours: 14 }, NOW));
    expect(b.records.station).toBe((await reperesMois(new Cache(new MemoryStore()), pageOf("saint-pierre")!.place, NOW))!.station);
    expect(b.reperes_du_mois).toBeUndefined();
  });

  it("are nothing without the archive", async () => {
    expect(await reperesMois(new Cache(new MemoryStore()), pageOf("cilaos")!.place, NOW)).toBeUndefined();
  });

  it("are said in the validated words, with no-break spaces, the station named", () => {
    const b = reperesBlock(R, NOW);
    expect(b).toContain(`<h2 id="h-reperes">Repères\u00a0: station Cilaos, à 0,4\u00a0km</h2>`);
    expect(b).toContain("<p>En octobre, la normale est de 22,4 °C pour la maximale et 9,8 °C pour la minimale, avec 33 mm de pluie sur le mois (normales 1991-2020 de Météo-France).</p>");
    expect(b).toContain("<p>Record de chaleur en octobre : 29,5 °C (2019). Record de pluie en un jour en octobre : 120,4 mm (1998). Relevés depuis 1952.</p>");
    expect(b).toContain(`<a href="/meteo/station/97424410">Tout l'historique de la station →</a>`);
    expect(b).not.toMatch(/battu|aujourd'hui/);
  });

  it("leave out the records' line without records, its last sentence without a first year, and all in another month", () => {
    const sans = reperesBlock({ ...R, chaleur: undefined, pluie: undefined }, NOW);
    expect(sans).toContain("la normale est de");
    expect(sans).not.toMatch(/Record|Relevés/);
    const pluie = reperesBlock({ ...R, chaleur: undefined, depuis: undefined }, NOW);
    expect(pluie).toContain("<p>Record de pluie en un jour en octobre : 120,4 mm (1998).</p>");
    expect(pluie).not.toContain("Relevés");
    // A copy of October viewed on 1 November.
    expect(reperesBlock(R, new Date("2026-10-31T20:00:00Z"))).toBe("");
    expect(reperesBlock(undefined, NOW)).toBe("");
  });

  it("are on the place's page, which links to /meteo for the other places instead of listing them", () => {
    const html = placePage(O, pageOf("cilaos")!, { value: { reperes: R }, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain('id="h-reperes"');
    expect(html).toContain(`<a href="/meteo#communes">Météo ailleurs à La Réunion →</a>`);
    expect(html).not.toContain("Cirques, volcan, plages");
    expect(html).not.toContain('id="filtre"');
  });
});

describe("what the confidence says", () => {
  it("is said once, on /meteo, at the anchor the place pages link to", () => {
    const html = meteoPage(O, null, NOW);
    expect(html).toContain('<p id="confiance">');
    expect(html).toContain("<b>La confiance des prévisions, pour chaque commune et chaque lieu\u00a0:</b>");
    expect(html).toContain(confianceExplication().replace(/'/g, "&#39;"));
    expect(confianceExplication()).not.toContain("calcul du");
  });
});
