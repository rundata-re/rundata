import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import { communePage } from "../src/web/commune.js";
import { crechesSection } from "../src/web/enfants.js";
import { pageOf } from "../src/web/places.js";
import * as creches from "../src/vie/creches.js";

// Saturday 31/10/2026, 01:13 at La Réunion.
const NOW = new Date("2026-10-30T21:13:00Z");
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null, commune: null }, NOW);
const tile = (html: string) => html.match(/<li class="tile[^>]*>(?:(?!<li class="tile).)*?<h3>(?:<a [^>]*>)?Crèches(?:<\/a>)?<\/h3>.*?(?=<li class="tile|<\/ul>)/s)?.[0];
const NBSP = " ";

describe("the places for the children under 3 (vie/creches.ts)", () => {
  it("are the CAF's of December 2023: 17 communes of their own, the five intercommunalités and the island", () => {
    expect(creches.ANNEE).toBe(2023);
    expect(creches.PUBLIE_LE).toBe("2026-01-22");
    expect(creches.communes()).toHaveLength(17);
    expect(creches.ofCommune("Saint-Denis")).toEqual({ creche: 29.7, global: 40.6, places_creche: 1966, places: 2688 });
    // Read from the département's file, never a mean of the communes' rates.
    expect(creches.ILE).toEqual({ creche: 22.0, global: 38.5, places_creche: 8150, places: 14287 });
    expect(creches.sansChiffre()).toEqual(["Cilaos", "Entre-Deux", "La Plaine-des-Palmistes", "Les Trois-Bassins", "Saint-Philippe", "Sainte-Rose", "Salazie"]);
    // Every commune in one intercommunalité, and one only.
    const all = creches.intercommunalites().flatMap((e) => e.communes);
    expect(all.sort()).toEqual(Object.values(INSEE).sort());
    expect(creches.intercommunalites().map((e) => e.nom)).toEqual(["la CINOR", "la CIREST", "le TCO", "la CIVIS", "la CASUD"]);
    expect(creches.epciOf("Cilaos")).toMatchObject({ nom: "la CIVIS", creche: 19.2 });
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: creches.SOURCE.id }));
  });
});

describe("the tile « Crèches » of a commune", () => {
  it("gives the commune's own figure, with its year and « offre théorique »", () => {
    const t = tile(page("saint-denis"))!;
    expect(t).toContain('<p class="tv">29,7 places</p>');
    expect(t).toContain(`en crèche pour 100 enfants de moins de 3${NBSP}ans · 40,6 pour 100 en comptant les assistantes maternelles, la garde à domicile et l'école · 1\u202f966 places en crèche · offre théorique fin 2023, d'après la CAF`);
    expect(t).toContain('href="/enfants#creches"');
    expect(t).toContain(`<a href="https://monenfant.fr" rel="noopener" aria-label="Trouver une crèche${NBSP}: monenfant.fr">Trouver une crèche${NBSP}: monenfant.<wbr>fr</a>`);
    expect(page("saint-denis")).toContain(creches.SOURCE.nom.replaceAll("'", "&#39;"));
  });

  it("never gives its intercommunalité's figure as the commune's", () => {
    const t = tile(page("cilaos"))!;
    expect(t).toContain('<p class="tv">Pas de chiffre pour la commune</p>');
    expect(t).toContain(`la CAF ne le donne que pour les communes de plus de 10${NBSP}000 habitants · pour la CIVIS, ses 6 communes ensemble${NBSP}: 19,2 places en crèche pour 100 enfants de moins de 3${NBSP}ans · offre théorique fin 2023, d'après la CAF`);
    expect(t).not.toMatch(/Cilaos[^<]*19,2/);
  });
});

describe("the crèches' part of /enfants", () => {
  const html = crechesSection();

  it("tables the communes and the island, then the intercommunalités with their communes", () => {
    expect(html).toContain('<section id="creches"');
    expect(html).toContain('<tr><th scope="row">La Réunion</th><td>22,0</td><td>38,5</td><td>8\u202f150</td></tr>');
    expect(html.match(/<tr><th scope="row">[^<]+<\/th>/g)).toHaveLength(18);
    expect(html).toContain("<tr><th scope=\"row\">La CIVIS<small>Saint-Pierre, Saint-Louis, Petite-Île, L&#39;Étang-Salé, Les Avirons, Cilaos</small></th>");
    expect(html).toContain(`Cilaos, Entre-Deux, La Plaine-des-Palmistes, Les Trois-Bassins, Saint-Philippe, Sainte-Rose et Salazie n&#39;en ont pas`);
    expect(html).toContain("C&#39;est une offre théorique");
    expect(html).toContain("chiffres de décembre 2023, publiés le 22/01/2026.");
  });
});
