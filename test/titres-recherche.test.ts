import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as carburants from "../src/providers/carburants.js";
import * as collecte from "../src/vie/collecte.js";
import { carburantsPage, descriptionOf, titleOf } from "../src/web/carburants.js";
import { collectePage } from "../src/web/collecte.js";
import { cruesPage } from "../src/web/crues.js";
import { sentiersPage } from "../src/web/sentiers.js";

// Four pages titled in the words people type (marketing, 24/11/2026: « onf sentiers fermés », « vigicrue reunion »,
// « prix essence reunion », « collecte des déchets saint-paul 2026 »): their title and their description say first what
// the page holds.
const O = "https://rundata.re";
const NOW = new Date("2026-11-24T05:00:00Z");
const of = (html: string) => ({
  title: html.match(/<title>([^<]*)<\/title>/)![1].replaceAll("&#39;", "'"),
  og: html.match(/<meta property="og:title" content="([^"]*)">/)![1].replaceAll("&#39;", "'"),
  // As a search engine reads it: the no-break spaces of the French typography are spaces.
  meta: html.match(/<meta name="description" content="([^"]*)">/)![1].replaceAll("&#39;", "'").replace(/[  ]/g, " "),
  h1: html.match(/<h1>(.*?)<\/h1>/)![1].replaceAll("&#39;", "'"),
  hook: (html.match(/<p class="hook">(.*?)<\/p>/)?.[1] ?? "").split(/<[^>]*>/).join("").replaceAll("&#39;", "'"),
});
const fits = (x: { title: string; meta: string }, what: string) => {
  expect(x.title.length, `${what} : ${x.title}`).toBeLessThanOrEqual(60);
  expect(x.meta.length, `${what} : ${x.meta}`).toBeLessThanOrEqual(160);
};

describe("the pages people find by a question, titled by its answer", () => {
  it("/sentiers names the ONF's closed trails and says the day of its map", () => {
    const value = { resume: "", fermes_par_commune: [], routes_forestieres_fermees: [], carte_mise_a_jour: "23/11/2026 (ONF)", carte_lue: "2026-11-24T04:05:00Z", a_savoir: [], sources: [], points: [], suivis: 351, randonnees: [] };
    const x = of(sentiersPage(O, { value, fetchedAt: NOW, stale: false } as never, NOW));
    expect(x.title).toBe("Sentiers fermés ONF : la liste à jour · La Réunion (974)");
    expect(x.og).toBe(x.title);
    expect(x.meta).toBe("Sentier fermé ? La liste des sentiers fermés par l'ONF à La Réunion (974), d'après sa carte du 23/11 : la commune, le sentier et la raison de chaque fermeture.");
    expect(x.h1).toBe(`Sentiers fermés par l'ONF <span class="n974">974</span>`);
    // Its first line stays: the map's own date.
    expect(x.hook).toBe("Avant de partir : les sentiers fermés d'après la carte de l'ONF du 23/11, et pourquoi.");
    fits(x, "/sentiers");
    // A map without a date, or the list not here yet: no date, never one made up.
    const sans = "Sentier fermé ? La liste des sentiers fermés par l'ONF à La Réunion (974) : la commune, le sentier et la raison de chaque fermeture.";
    expect(of(sentiersPage(O, { value: { ...value, carte_mise_a_jour: undefined }, fetchedAt: NOW, stale: false } as never, NOW)).meta).toBe(sans);
    const cold = of(sentiersPage(O, null, NOW));
    expect(cold.title).toBe(x.title);
    expect(cold.meta).toBe(sans);
    // « Ouvert » is never said: a trail out of the list is not said open.
    expect(`${x.title} ${x.meta}`).not.toMatch(/ouvert/i);
  });

  it("/crues names its source, Vigicrues Réunion, always as « d'après », never as if it were the official service", () => {
    const x = of(cruesPage(O, null, NOW));
    expect(x.title).toBe("Crues en direct à La Réunion, d'après Vigicrues · 974");
    expect(x.og).toBe(x.title);
    expect(x.meta).toBe("Les crues à La Réunion (974) d'après Vigicrues Réunion : la vigilance rivière par rivière, la hauteur et le débit mesurés aux stations de la DEAL.");
    expect(x.hook).toBe("Fortes pluies ? La vigilance crues et la hauteur des rivières en ce moment, station par station, d'après Vigicrues Réunion.");
    // Its h1 stays, and neither the title nor the h1 starts with the service's name.
    expect(x.h1).toBe(`Crues des rivières <span class="n974">974</span>`);
    expect(x.title).not.toMatch(/^Vigicrues/);
    fits(x, "/crues");
  });

  it("/carburants says « essence » and « gazole (gasoil) », with the month of the prices", () => {
    const prix = carburants.parseRelease(readFileSync(new URL("./fixtures/carburants_octobre.html", import.meta.url), "utf8"), "https://www.reunion.gouv.fr/x", new Date("2026-10-24T05:00:00Z"))!;
    const x = of(carburantsPage(O, { value: prix, fetchedAt: NOW, stale: false }, NOW));
    expect(x.title).toBe("Prix de l'essence et du gazole à La Réunion · octobre 2026");
    expect(x.og).toBe(x.title);
    expect(x.meta).toBe("Prix de l'essence à La Réunion en octobre 2026 : sans plomb 2,00 €/L, gazole (gasoil) 1,80 €/L, gaz 20,81 € la bouteille. Prix maximum du préfet.");
    // Its h1 stays, and no GNR in the title: the prefect does not set its price.
    expect(x.h1).toBe(`Prix des carburants à La Réunion, octobre 2026 <span class="n974">974</span>`);
    expect(x.title).not.toMatch(/GNR/i);
    fits(x, "/carburants");
    // The longest month still fits, in fewer words when it has to; a price the order lacks is left out.
    for (const depuis of ["2026-09-01", "2026-12-01", "2027-02-01"]) {
      expect(titleOf({ ...prix, depuis }).length, depuis).toBeLessThanOrEqual(60);
      expect(titleOf({ ...prix, depuis }), depuis).toMatch(/^Prix (de l'essence et du|essence et) gazole à La Réunion · /);
      expect(descriptionOf({ ...prix, depuis }).length, depuis).toBeLessThanOrEqual(160);
    }
    expect(descriptionOf({ ...prix, produits: prix.produits.filter((p) => p.produit !== "Gazole") })).toBe("Prix de l'essence à La Réunion en octobre 2026 : sans plomb 2,00 €/L, gaz 20,81 € la bouteille. Prix maximum du préfet.");
    // Before the order is read: no month, no figure.
    expect(titleOf(undefined)).toBe("Prix de l'essence et du gazole à La Réunion (974)");
  });

  it("/collecte and a commune's page say the year of the calendars read", () => {
    const y = collecte.YEAR;
    const sp = of(collectePage(O, NOW, "Saint-Paul"));
    expect(sp.title).toBe(`Collecte des déchets Saint-Paul ${y} : jours par rue · 974`);
    expect(sp.og).toBe(sp.title);
    expect(sp.meta).toBe(`Calendrier ${y} de collecte des déchets à Saint-Paul (974) : ordures ménagères, tri et déchets verts, le jour de passage de votre rue, d'après le TCO.`);
    expect(sp.h1).toBe("Quel jour passent les poubelles à Saint-Paul ?");
    const all = of(collectePage(O, NOW));
    expect(all.title).toBe(`Calendrier collecte TCO ${y} : jours par rue · 974`);
    expect(all.h1).toBe("Quel jour passent les poubelles ?");
    expect(all.meta).toBe("Ordures ménagères, tri, déchets verts : le jour de collecte rue par rue à Saint-Paul, La Possession, Saint-Leu, Le Port et Trois-Bassins (974), d'après le TCO.");
    fits(all, "/collecte");
    // Every commune's fits, a long name without « jours par rue ».
    for (const c of collecte.COMMUNES) {
      const x = of(collectePage(O, NOW, c));
      fits(x, c);
      expect(x.title, c).toMatch(new RegExp(`^Collecte des déchets ${c} ${y}( : jours par rue)? · 974$`));
      expect(x.meta, c).toMatch(new RegExp(`^Calendrier ${y} de collecte des déchets (à|au|aux) `));
    }
    expect(of(collectePage(O, NOW, "Les Trois-Bassins")).title).toBe(`Collecte des déchets Les Trois-Bassins ${y} · 974`);
  });
});
