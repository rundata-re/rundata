import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as atmo from "../src/providers/atmo.js";
import { parse } from "../src/providers/atmo.js";
import { airEvery, qualiteAir } from "../src/tools/air.js";
import { airPage } from "../src/web/domains.js";
import { CSS } from "../src/web/pages.js";
import { sourceRevision } from "../src/web/revisions.js";
import { esc } from "../src/web/map.js";
import { mapPoints, tabStops } from "./cartes.js";

// The ATMO index of the 24 communes for 22 and 23/10/2026: "moyen" everywhere, set by ozone.
const list = parse(JSON.parse(readFileSync(new URL("./fixtures/atmo_974.json", import.meta.url), "utf8")));
const NOW = new Date("2026-10-23T05:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
function cache(value = list) {
  const store = new MemoryStore();
  void store.put("atmo:974", { value, fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime());
}

describe("air quality", () => {
  it("reads the 24 communes for two days", () => {
    expect(list).toHaveLength(48);
    expect(new Set(list.map((x) => x.insee)).size).toBe(24);
  });

  it("names each commune as the site does, by its INSEE code: the layer's « Petite-Ile » with its accent", async () => {
    const names = [...new Set(list.map((x) => x.commune))];
    expect(names).toContain("Petite-Île");
    expect(names).toContain("L'Étang-Salé");
    expect(names).toContain("La Plaine-des-Palmistes");
    expect(names.filter((n) => /Petite-Ile|Etang|Plaine-Des/.test(n))).toEqual([]);
    expect(body(await qualiteAir(cache(), "Petite-Île", NOW)).resume).toMatch(/^Qualité de l'air prévue aujourd'hui à Petite-Île : /);
    // A code not in the table keeps the layer's name.
    expect(parse({ features: [{ properties: { code_zone: "97499", lib_zone: "Ailleurs", date_ech: "2026-10-23", code_qual: 2, date_maj: "" } }] })[0].commune).toBe("Ailleurs");
  });

  it("answers for a place's commune, accents and articles aside", async () => {
    const r = body(await qualiteAir(cache(), "plage de l'Étang-Salé", NOW));
    expect(r.resume).toMatch(/^Qualité de l'air prévue aujourd'hui à L'Étang-Salé : moyen \(2\/6\), surtout ozone/);
    expect(r.indices).toHaveLength(1);
  });

  it("sums up the island", async () => {
    const r = body(await qualiteAir(cache(), undefined, NOW));
    expect(r.resume).toBe("Qualité de l'air prévue aujourd'hui à La Réunion : au pire moyen (2/6) dans toutes les communes.");
    // A level each, its communes listed: one group for the 24 at « moyen » set by ozone.
    expect(r).not.toHaveProperty("communes");
    expect(r.communes_par_niveau).toHaveLength(1);
    expect(r.communes_par_niveau[0]).toMatchObject({ niveau: 2, qualite: "moyen", polluants: ["ozone"] });
    expect(r.communes_par_niveau[0].communes).toHaveLength(24);
    expect(r.nature).toBe("PRÉVISION du jour par commune, calculée par Atmo Réunion : pas une mesure.");
    // /air keeps a commune each.
    expect(body(await qualiteAir(cache(), undefined, NOW, true)).communes).toHaveLength(24);
  });
});

// The fixture predates date_dif: the diffusion of 22/10 at 10:45 (06:45 UTC) is set here, as the layer gave it on 28/10.
const diffused = (at: string) => list.map((x) => ({ ...x, diffuse_le: at }));
const YESTERDAY = "2026-10-22T06:45:48Z";

describe("air quality: what the index is and where it comes from", () => {
  it("reads when Atmo Réunion diffused the index (date_dif), and a level 0 or 7 in the guide's words", () => {
    const [x] = parse({ features: [{ properties: { code_zone: "97411", lib_zone: "Saint-Denis", date_ech: "2026-10-29", code_qual: 2, date_dif: YESTERDAY } }] });
    expect(x.diffuse_le).toBe(YESTERDAY);
    expect(parse({ features: [{ properties: { code_zone: "97411", lib_zone: "Saint-Denis", date_ech: "2026-10-29", code_qual: 2 } }] })[0]).not.toHaveProperty("diffuse_le");
    expect([atmo.level(0), atmo.level(2), atmo.level(7)]).toEqual(["indisponible", "moyen", "événement"]);
    // An entry read before date_dif is not kept across the deploy (cache.ts, `outdated`).
    expect(sourceRevision("atmo:974")).toBe(1);
  });

  it("says it is a forecast, diffused the day before, apart from when rundata.re read it", async () => {
    const r = body(await qualiteAir(cache(diffused(YESTERDAY)), "Saint-Denis", NOW));
    expect(r.nature).toBe("PRÉVISION du jour par commune, calculée par Atmo Réunion : pas une mesure.");
    expect(r.diffusion).toBe("Prévision diffusée par Atmo Réunion la veille, le 22/10 à 10:45.");
    expect(r.lu_par_rundata).toBe("23/10 09:00");
    // Diffused the same day: no « la veille ».
    expect(body(await qualiteAir(cache(diffused("2026-10-23T04:30:00Z")), undefined, NOW)).diffusion).toBe("Prévision diffusée par Atmo Réunion le 23/10 à 08:30.");
    expect(body(await qualiteAir(cache(), undefined, NOW))).not.toHaveProperty("diffusion");
  });

  it("names the producer, the layer it is spread by, its licence, and how it is made with the guide's link", async () => {
    const r = body(await qualiteAir(cache(), undefined, NOW));
    expect(r.provenance).toEqual({
      producteur: "Atmo Réunion, observatoire agréé de la qualité de l'air",
      diffuseur: "Atmo France, couche WFS ind_atmo_2021",
      licence: "ODbL 1.0",
      licence_lien: "https://opendatacommons.org/licenses/odbl/1-0/",
      fiche: "https://www.data.gouv.fr/datasets/indice-de-la-qualite-de-lair-quotidien-par-commune-indice-atmo",
      site: "https://www.atmo-reunion.net",
    });
    expect(r.comment_c_est_fait.lien).toBe(atmo.GUIDE);
    expect(r.comment_c_est_fait.d_apres).toBe("Guide de calcul de l'indice ATMO d'Atmo France (version du 14/12/2020)");
    // The island's answer keeps the step of the « air de fond » (marketing); its nature says it is a forecast.
    expect(r.comment_c_est_fait.etapes).toEqual([atmo.FOND]);
    expect(r.nature).toMatch(/^PRÉVISION du jour par commune/);
    // A place's answer and /air give every step.
    for (const all of [body(await qualiteAir(cache(), "Les Avirons", NOW)), body(await qualiteAir(cache(), undefined, NOW, true))]) {
      expect(all.comment_c_est_fait).toEqual({ ...r.comment_c_est_fait, etapes: atmo.METHODE });
      expect(all.comment_c_est_fait.etapes[0]).toMatch(/^C'est une prévision : /);
    }
  });

  it("gives each commune's sub-index of every pollutant, not only the worst: for a place, and on /air", async () => {
    const subs = { "particules PM10": 1, "particules fines PM2,5": 1, ozone: 2, "dioxyde d'azote": 1, "dioxyde de soufre": 1 };
    expect(body(await qualiteAir(cache(), undefined, NOW, true)).communes[0].sous_indices).toEqual(subs);
    expect(body(await qualiteAir(cache(), "Les Avirons", NOW)).indices[0].sous_indices).toEqual(subs);
  });

  it("shows on /air the forecast by its value, its diffusion, our reading, the source and the method", async () => {
    const answer = body(await qualiteAir(cache(diffused(YESTERDAY)), undefined, NOW, true));
    const page = airPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, NOW);
    // Each commune and station is a row below: their points on the maps out of the Tab order.
    expect(mapPoints(page)).toBeGreaterThanOrEqual(24);
    expect(tabStops(page)).toBe(0);
    const status = page.slice(page.indexOf('<div class="status">'), page.indexOf("</div>", page.indexOf('<div class="status">')));
    expect(status).toContain("Une prévision d'Atmo Réunion pour la journée, pas une mesure. Prévision diffusée par Atmo Réunion la veille, le 22/10 à 10:45. Lue par rundata.re le 23/10 à 09:00.");
    expect(page).toContain("Prévision du jour</p>");
    expect(page).toContain(`${'<span class="aq aq2">moyen</span>'} prévu dans 24 communes`);
    expect(page).not.toContain("Mis à jour à");
    // The description dated by the day the index is forecast for, never « aujourd'hui »; an old copy without that
    // day, the sentence without a value.
    expect(answer.echeance).toBe("2026-10-23");
    expect(page).toContain(`<meta name="description" content="Qualité de l&#39;air à La Réunion (974) le 23/10, indice ATMO prévu par Atmo Réunion\u00a0: au pire moyen (2/6)`);
    const old = airPage("https://rundata.re", { value: { ...answer, echeance: undefined }, fetchedAt: NOW, stale: false }, NOW);
    expect(old).toContain(`<meta name="description" content="Qualité de l&#39;air à La Réunion (974)\u00a0: l&#39;indice ATMO d&#39;Atmo Réunion dans chaque commune, avec le polluant en cause.">`);
    // The tool's answer, for a place or the island, keeps its fields: the day is the page's only.
    expect(body(await qualiteAir(cache(diffused(YESTERDAY)), undefined, NOW)).echeance).toBeUndefined();
    const source = page.slice(page.indexOf('id="h-source-air"'), page.indexOf("</section>", page.indexOf('id="h-source-air"')));
    expect(source).toContain('<a href="https://www.atmo-reunion.net" rel="noopener">Atmo Réunion</a>');
    expect(source).toContain(`<a href="${atmo.DIFFUSION}" rel="noopener" aria-label="sa fiche sur data.gouv.fr">sa fiche sur data.<wbr>gouv.<wbr>fr</a>`);
    expect(source).toContain(`<a href="${atmo.ODBL}" rel="noopener">ODbL 1.0</a>`);
    expect(source).toContain(`<a href="${esc(atmo.GUIDE)}" rel="noopener">guide de calcul de l'indice ATMO</a>`);
    expect(source).toContain("Prévision diffusée par Atmo Réunion la veille, le 22/10 à 10:45. Lue par rundata.re le 23/10 à 09:00.</p>");
    for (const step of atmo.METHODE) expect(source).toContain(esc(step));
    // The sub-indices, a row per commune.
    expect(page.match(/<td data-label="ozone"><span class="aq aq2">moyen<\/span><\/td>/g)).toHaveLength(24);
  });

  it("rereads the layer every quarter of an hour from 10 h to 14 h while the day's diffusion is not in it", async () => {
    const at = (iso: string) => new Date(iso);
    const of = (diffuse_le: string) => list.map((x) => ({ ...x, diffuse_le }));
    // 11:40 at La Réunion: the day before's diffusion only, then the day's.
    expect(atmo.diffusionAttendue(of("2026-11-03T07:44:00Z"), at("2026-11-04T07:40:00Z"))).toBe(true);
    expect(atmo.diffusionAttendue(of("2026-11-04T07:27:01Z"), at("2026-11-04T07:40:00Z"))).toBe(false);
    // Before 10 h and from 14 h, the hour's reading.
    expect(atmo.diffusionAttendue(of("2026-11-03T07:44:00Z"), at("2026-11-04T05:59:00Z"))).toBe(false);
    expect(atmo.diffusionAttendue(of("2026-11-03T07:44:00Z"), at("2026-11-04T10:00:00Z"))).toBe(false);

    const read: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      read.push(url);
      return new Response(readFileSync(new URL("./fixtures/atmo_974.json", import.meta.url), "utf8"), { headers: { "content-type": "application/json" } });
    });
    let t = Date.parse("2026-11-04T07:00:00Z");
    const store = new MemoryStore();
    void store.put("atmo:974", { value: of("2026-11-03T07:44:00Z"), fetchedAt: t });
    const c = new Cache(store, () => t);
    // 11:20: read 20 minutes ago, the day's diffusion missing: read again. Once it is there, the hour holds.
    t += 20 * 60_000;
    await atmo.indices(c, new Date(t));
    expect(read).toHaveLength(1);
    void store.put("atmo:974", { value: of("2026-11-04T07:44:00Z"), fetchedAt: t });
    t += 20 * 60_000;
    await atmo.indices(c, new Date(t));
    expect(read).toHaveLength(1);
  });
  it("builds the copy of /air every quarter of an hour from 10 h to 14 h while it lacks the day's diffusion, else every hour", () => {
    const at = new Date("2026-11-04T07:40:00Z");
    expect(airEvery({ diffusion: "Prévision diffusée par Atmo Réunion la veille, le 03/11 à 11:44." }, at)).toBe(15);
    expect(airEvery({}, at)).toBe(15);
    expect(airEvery(undefined, at)).toBe(15);
    expect(airEvery({ diffusion: "Prévision diffusée par Atmo Réunion le 04/11 à 11:27." }, at)).toBe(60);
    expect(airEvery({}, new Date("2026-11-04T05:59:00Z"))).toBe(60);
    expect(airEvery({}, new Date("2026-11-04T10:00:00Z"))).toBe(60);
  });
  it("writes « D'où vient l'indice » in the card's colours, the night ones kept for the dark band of a trail's page", () => {
    // 06/11/2026: its dt and dd were in the band's colours, #f1f5f9 on a white card.
    expect(airPage("https://rundata.re", null)).toContain(`<div class="card"><dl class="facts">`);
    expect(CSS).toContain(".facts dt{font-size:.82rem;color:var(--muted)}");
    expect(CSS).toContain("color:var(--ink)}.band .facts dt{color:var(--on-night-muted)}.band .facts dd{color:var(--on-night)}");
    expect(CSS).not.toMatch(/(?:^|[}\n])\.facts d[td]\{[^}]*on-night/);
  });
  afterEach(() => vi.unstubAllGlobals());
});
