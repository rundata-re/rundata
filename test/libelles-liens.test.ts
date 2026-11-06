import { describe, expect, it } from "vitest";
import { cartePage } from "../src/web/carte.js";
import type { HikeCard, RandonneesAnswer } from "../src/web/data.js";
import { etatOnf, randonneesPage, sectorLinks } from "../src/web/domains.js";
import { communeHikes } from "../src/web/liens.js";
import { cibles, norm, trouve } from "../src/web/menu.js";
import { meteoPage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

// Links of the same words for two pages (« écoles », « Volcan », « Randonnée », a trail's name): each now reads apart,
// in the words validated for it.
const O = "https://rundata.re";
const NOW = new Date("2026-11-06T12:00:00Z");

describe("links of the same words for two pages", () => {
  it("ask « école fermée ? » under Cyclone in the menu and in the field, « Écoles » left to /ecoles", () => {
    const page = meteoPage(O, null, NOW);
    expect(page).toContain(`<a href="/alerte-cyclone">alerte</a> · <a href="/ecoles-cyclone">école fermée ?</a></p>`);
    const D = cibles(true);
    expect(D.find((x) => x[1] === "/ecoles-cyclone")![0]).toBe("Cyclone : école fermée ?");
    expect(D.find((x) => x[1] === "/ecoles")![0]).toBe("Écoles");
    expect(trouve(D, norm("école fermée")).map((x) => x[1])).toContain("/ecoles-cyclone");
  });

  it("name each sector of the hikes « Randonnée au Volcan » for screen readers, its visible name kept", () => {
    const nav = sectorLinks("cilaos");
    expect(nav).toContain(`<a href="/randonnees/volcan" aria-label="Randonnée au Volcan">Volcan</a>`);
    expect(nav).toContain(`<a href="/randonnees/cilaos" aria-current="page" aria-label="Randonnée à Cilaos">Cilaos</a>`);
    const links = [...nav.matchAll(/<a [^>]*aria-label="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
    expect(links.length).toBe(nav.split("<a ").length - 1);
    for (const [, label, nom] of links) expect(label.startsWith("Randonnée ") && label.endsWith(nom)).toBe(true);
  });

  it("send « Randonnée » to /randonnees only: the map's closed trails and canyons under « Sentiers fermés », the commune's tile its sector", () => {
    const carte = cartePage(O);
    expect(carte).not.toContain("Voir la page Randonnée");
    expect(carte.match(/<a href="\/sentiers">Voir la page Sentiers fermés →<\/a>/g)).toHaveLength(2);
    expect(communeHikes(pageOf("le-tampon")!, null)).toEqual({ nom: "Randonnée dans le Sud", href: "/randonnees/sud" });
    expect(communeHikes(pageOf("cilaos")!, null)).toEqual({ nom: "Randonnée à Cilaos", href: "/randonnees/cilaos" });
    const hikes = { value: { randonnees: [], secteurs: [{ secteur: "Nord", communes: ["Saint-Denis"], sentiers: [{ k: "s1", nom: "Sentier A", commune: "Saint-Denis", communes: ["Saint-Denis"], km: 3, etat: "fermé", boucle: false, randonnees: [] }] }], lignes: [], fermes: 1, suivis: 1, sources: [] } as unknown as RandonneesAnswer, fetchedAt: NOW, stale: false };
    const tile = communeHikes(pageOf("saint-denis")!, hikes, NOW)!;
    expect(tile.nom).toBe("Randonnée dans le Nord");
    expect(tile.live!.detail).not.toContain("randonnée");
  });

  it("add « , état ONF » to a trail's ONF page when the same name leads to its hike on the page", () => {
    const hike = (nom: string, slug: string, ferme: string): HikeCard =>
      ({ k: slug, nom, slug, km: 5, dplus: 300, dmoins: 300, boucle: false, secteur: "Salazie", fermes: [{ sentier: ferme, slug: ferme === nom ? slug : "sentier-b", cause: "Éboulement" }], inconnus: [], onf: 1 }) as HikeCard;
    const answer = { randonnees: [hike("Sentier du Trou de Fer", "sentier-du-trou-de-fer", "Sentier du Trou de Fer"), hike("Boucle A", "boucle-a", "Sentier B")], secteurs: [], lignes: [], fermes: 2, suivis: 2, sources: [], hauts: [] } as unknown as RandonneesAnswer;
    const page = randonneesPage(O, { value: answer, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain(`<a href="/randonnees/sentier-du-trou-de-fer">Sentier du Trou de Fer</a>`);
    expect(page).toContain(`<a href="/sentiers/sentier-du-trou-de-fer">Sentier du Trou de Fer, état ONF</a>`);
    expect(page).not.toContain(`>Sentier du Trou de Fer</a> (`);
    expect(page).toContain(`<a href="/sentiers/sentier-b">Sentier B</a>`);
    expect(page).not.toContain("Sentier B, état ONF");
    // On /sentiers, the line to the hike keeps the name; the trail's own link takes the words.
    const sentiers = `<li><a href="/randonnees/sentier-c">Sentier C</a> : éboulement</li><li><a href="/sentiers/sentier-c">Sentier C</a></li>`;
    expect(etatOnf(sentiers)).toBe(`<li><a href="/randonnees/sentier-c">Sentier C</a> : éboulement</li><li><a href="/sentiers/sentier-c">Sentier C, état ONF</a></li>`);
    expect(etatOnf(`<a href="/sentiers/sentier-c">Sentier C</a>`)).toBe(`<a href="/sentiers/sentier-c">Sentier C</a>`);
  });
});
