import { describe, expect, it } from "vitest";
import * as accidents from "../src/routes/accidents.js";
import { toutesLesSources } from "../src/server.js";
import { enGrand } from "../src/tools/format.js";
import { communePage } from "../src/web/commune.js";
import { accidentsSection } from "../src/web/domains.js";
import { pageOf } from "../src/web/places.js";

// Tuesday 03/11/2026, 15:00 at La Réunion.
const NOW = new Date("2026-11-03T11:00:00Z");
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null, commune: null }, NOW);
const tile = (html: string) => html.match(/<li class="tile[^>]*>(?:(?!<li class="tile).)*?<h3>(?:<a [^>]*>)?Accidents de la route(?:<\/a>)?<\/h3>.*?(?=<li class="tile|<\/ul>)/s)?.[0];

describe("the road accidents of the year (routes/accidents.ts)", () => {
  it("are the national file's of 2025: the island, by kind of road and by commune", () => {
    expect(accidents.ANNEE).toBe(2025);
    expect(accidents.PUBLIE_LE).toBe("2026-10-30");
    expect(accidents.ILE).toEqual({ accidents: 924, tues: 42, blesses: 1126, mortels: 39, hospitalises: 308, legers: 818 });
    expect(accidents.ROUTES).toMatchObject({
      nationales: { accidents: 332, tues: 26 },
      departementales: { accidents: 154, tues: 6 },
      communales: { accidents: 432, tues: 10 },
      autres: { accidents: 6, tues: 0 },
    });
    expect(Object.values(accidents.ROUTES).reduce((n, r) => n + r.blesses, 0)).toBe(1126);
    expect(accidents.ofCommune("Saint-Denis")).toEqual({ accidents: 284, tues: 3, blesses: 361 });
    // In alphabetical order, never ranked.
    const names = accidents.communes().map(([nom]) => nom);
    expect(names).toHaveLength(24);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    expect(accidents.communes().reduce((n, [, b]) => n + b.accidents, 0)).toBe(924);
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: accidents.SOURCE.id }));
  });

  it("never says « aucun tué » alone", () => {
    expect(accidents.bilan({ accidents: 2, tues: 0, blesses: 3 })).toBe("aucun tué recensé en 2025, 3 blessés");
    expect(accidents.bilan({ accidents: 1, tues: 1, blesses: 1 })).toBe("1 tué, 1 blessé en 2025");
    expect(accidents.bilan({ accidents: 1, tues: 1, blesses: 0 })).toBe("1 tué, aucun blessé recensé en 2025");
  });
});

describe("the tile « Accidents de la route » of a commune", () => {
  it("says the year's counts plainly, from the national file, and goes to /trafic", () => {
    const t = tile(page("saint-denis"))!;
    expect(t).toContain(`<p class="tv">${enGrand("284 accidents corporels")}</p>`);
    expect(t).toContain("3 tués, 361 blessés en 2025 · d'après le fichier national des accidents (ONISR)");
    expect(t).toContain('href="/trafic#accidents"');
    expect(page("saint-denis")).toContain(accidents.SOURCE.nom);
  });

  it("says « aucun tué recensé en 2025 » for none", () => {
    const t = tile(page("salazie"))!;
    expect(t).toContain(`<p class="tv">${enGrand("2 accidents corporels")}</p>`);
    expect(t).toContain("aucun tué recensé en 2025, 3 blessés · d'après le fichier national des accidents (ONISR)");
  });
});

describe("the accidents' part of /trafic", () => {
  const html = accidentsSection();

  it("defines an accident and the ONISR's words, then tables the roads and the 24 communes", () => {
    expect(html).toContain('<section id="accidents"');
    expect(html).toContain("Un accident corporel est un accident de la route qui fait au moins une victime.");
    expect(html).toContain("en ont relevé 924 à La Réunion : 42 tués, 308 blessés hospitalisés et 818 blessés légers.");
    expect(html).toContain("dans les 30 jours");
    expect(html).toContain("plus de 24 heures à l'hôpital");
    expect(html).toContain("n'est plus labellisé par la statistique publique depuis 2019");
    expect(html).toContain('<tr><th scope="row">Routes nationales</th><td>332</td><td>26</td></tr>');
    expect(html).toContain('<tr><th scope="row">Saint-Denis</th><td>284</td><td>3</td><td>361</td></tr>');
    // The roads and the communes of the year, then the five years: the island and its total, the communes.
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(4 + 24 + 5 + 1 + 24);
    expect(html).toContain("seuls les tués se comparent d'une commune à l'autre");
    expect(html).toContain("année 2025, publiée le 30/10/2026.");
    // Never a rank nor a colour.
    expect(html).not.toMatch(/dangereu|class="q-|vg\d/);
  });
});

describe("the last five years (routes/accidents.ts, /trafic)", () => {
  const html = accidentsSection();

  it("are each year's file as read, the island's and the killed of each commune", () => {
    expect(accidents.ANNEES).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(accidents.MIS_EN_LIGNE).toEqual(["2022-10-24", "2026-10-30"]);
    expect(accidents.serieIle().map(([, a]) => a.tues)).toEqual([42, 45, 30, 40, 42]);
    expect(accidents.serieIle()[0]).toEqual([2021, { accidents: 814, tues: 42, hospitalises: 270, legers: 696, gravite_inconnue: 1 }]);
    const t = Object.fromEntries(accidents.tuesParCommune());
    expect(t["Saint-Paul"]).toEqual([12, 6, 4, 7, 4]);
    expect(t["Salazie"]).toEqual([0, 0, 0, 0, 0]);
    // Every year's killed, commune by commune, sum to the island's.
    for (const [i, [, a]] of accidents.serieIle().entries()) expect(accidents.tuesParCommune().reduce((n, [, c]) => n + c[i], 0)).toBe(a.tues);
    expect(accidents.tuesParCommune().map(([nom]) => nom)).toEqual(accidents.communes().map(([nom]) => nom));
  });

  it("says when the files were read, tables the years with their total, and the communes in alphabetical order", () => {
    expect(html).toContain('<h3 id="h-accidents-serie">De 2021 à 2025</h3>');
    expect(html).toContain(`dans sa version lue le ${accidents.jour(accidents.LU_LE)}. L'ONISR corrige ces fichiers après leur publication : une année peut encore changer de quelques unités.`);
    expect(html).toContain('<tr><th scope="row">2022</th><td>748</td><td>45</td><td>233</td><td>681</td></tr>');
    expect(html).toContain('<tfoot><tr><th scope="row">5 ans</th><td>4\u202f302</td><td>199</td><td>1\u202f387</td><td>3\u202f881</td></tr></tfoot>');
    expect(html).toContain('<tr><th scope="row">Saint-Paul</th><td>12</td><td>6</td><td>4</td><td>7</td><td>4</td><td>33</td></tr>');
    expect(html).toContain('<tr><th scope="row">Salazie</th><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>');
    expect(html.match(/<div class="card table-wrap defile"><table class="drought histo passe colle">/g)).toHaveLength(2);
    expect(html).toContain("Tués à 30 jours, relevés par les forces de l'ordre.");
    expect(html).toContain("fichiers des accidents corporels de 2021 à 2025 (BAAC), Licence Ouverte : mis en ligne du 24/10/2022 au 30/10/2026.");
    expect(html).not.toMatch(/tendance|[↑↓↗↘]/);
  });
});
