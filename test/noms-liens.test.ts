import { describe, expect, it } from "vitest";
import { aller, SCRIPT } from "../src/web/aller.js";
import type { HikeCard, RandonneesAnswer, SportAnswer } from "../src/web/data.js";
import { communePage } from "../src/web/commune.js";
import type { CommuneData } from "../src/web/data.js";
import { decheteriesPage } from "../src/web/decheteries.js";
import { departureLi, randonneesPage, sportPage } from "../src/web/domains.js";
import { pageOf } from "../src/web/places.js";

// Links whose text is the same for several targets on a page (« Carte et profil », « GPX », « vers St-Denis »): a screen
// reader's list of links shows them alike. Each says, to screen readers only, which one it is; no visible word changes.
const O = "https://rundata.re";
const NOW = new Date("2026-11-06T12:00:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
const sr = (html: string) => [...html.matchAll(/<span class="sr">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("links of the same text for several targets", () => {
  it("name the itinerary after « Carte et profil » and « GPX » on /randonnees", () => {
    const hike = (nom: string, slug: string): HikeCard =>
      ({ k: slug, nom, slug, km: 5, dplus: 300, dmoins: 300, boucle: true, secteur: "Cilaos", fermes: [], inconnus: [], onf: 1 }) as HikeCard;
    const answer = { randonnees: [hike("Sentier de la Roche Merveilleuse", "roche-merveilleuse"), hike("Bassin des Hirondelles", "bassin-des-hirondelles")], secteurs: [], lignes: [], fermes: 0, suivis: 2, sources: [], hauts: [] } as unknown as RandonneesAnswer;
    const html = randonneesPage(O, cached(answer), NOW);
    expect(html).toContain(`<a href="/randonnees/roche-merveilleuse">Carte et profil<span class="sr"> : Sentier de la Roche Merveilleuse</span></a>`);
    expect(html).toContain(`<a href="/randonnees/bassin-des-hirondelles.gpx" download>GPX<span class="sr"> de Bassin des Hirondelles</span></a>`);
  });

  it("give the competition after « Le classement sur le site de la fédération » on /sport", () => {
    const lignes = Array.from({ length: 6 }, (_, i) => ({ place: i + 1, equipe: `Équipe ${i + 1}`, joues: 3, points: 9 - i }));
    const classements = [
      { competition: "Handball, Nationale 3 masculine", lien: "https://www.ffhandball.fr/a", lignes },
      { competition: "Volley-ball, Régionale 1 féminine", lien: "https://www.ffvbbeach.org/b", lignes },
    ];
    const html = sportPage(O, cached({ resume: "", non_couvert: "", sources: [], a_venir: [], classements } as unknown as SportAnswer), NOW);
    expect(html).toContain(`<a href="https://www.ffhandball.fr/a" rel="noopener">Le classement sur le site de la fédération<span class="sr"> : Handball, Nationale 3 masculine</span> ↗</a>`);
    expect(sr(html).filter((t) => t.includes("Régionale 1 féminine"))).toHaveLength(1);
  });

  it("give a bus's hour after its direction, when the hour is one", () => {
    const row = { ligne: "E3", direction: "ST-DENIS", reseau: "Car Jaune", trajet: "/bus/trajet/carjaune/1/x", dans_min: 6, heure: "16:12" } as Parameters<typeof departureLi>[0];
    expect(departureLi(row, "dans 6 min", "16:12")).toContain(`<a href="/bus/trajet/carjaune/1/x">vers St-Denis<span class="sr">, départ à 16:12</span></a>`);
    expect(departureLi(row, "demain 05:30", "demain 05:30")).toContain(`<a href="/bus/trajet/carjaune/1/x">vers St-Denis</a>`);
    expect(departureLi(row, "dans 6 min")).toContain(`<a href="/bus/trajet/carjaune/1/x">vers St-Denis</a>`);
  });

  it("say the commune of each déchèterie in its « Y aller », and the sheet still shows the name alone", () => {
    const b = aller({ nom: "Déchèterie de la Marine", lat: -20.9, lon: 55.6, ou: "Sainte-Suzanne" });
    expect(b).toContain(`data-n="Déchèterie de la Marine" aria-label="Y aller\u00a0: Déchèterie de la Marine, Sainte-Suzanne"`);
    expect(aller({ nom: "Plage de Boucan", lat: -21, lon: 55.2 })).not.toContain("data-n");
    expect(SCRIPT).toContain("n=a.dataset.n||l.slice(T.titre.length)");
    const page = decheteriesPage(O, null, NOW);
    const labels = [...page.matchAll(/aria-label="(Y aller\u00a0: [^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
    expect(labels.every((l) => /, [^,]+$/.test(l))).toBe(true);
  });

  it("say the commune after « Météo » and « Déchèteries » on a commune's page, and the hour after each departure", () => {
    const departs = [
      { heure: "16:12", dans_min: 12, ligne: "A1", direction: "Ville A", reseau: "Réseau A", arret: "Gare A", trajet: "/bus/trajet/a/1/x" },
      { heure: "16:30", dans_min: 30, ligne: "A1", direction: "Ville A", reseau: "Réseau A", arret: "Gare A", trajet: "/bus/trajet/a/1/y" },
    ] as NonNullable<CommuneData["bus"]>["departs"];
    const l = { place: null, commune: { value: { sources: [], bus: { gare: true, arrets: [], departs } } as unknown as CommuneData, fetchedAt: NOW, stale: false } };
    const html = communePage(O, pageOf("saint-paul")!, l, NOW);
    expect(html).toContain(`<a href="/meteo/saint-paul">Météo<span class="sr"> à Saint-Paul</span></a>`);
    expect(html).toMatch(/<a href="\/decheteries#[^"]+">Déchèteries<span class="sr"> à Saint-Paul<\/span><\/a>/);
    expect(html).toContain(`vers Ville A<span class="sr">, départ à 16:12</span></a>`);
    expect(html).toContain(`vers Ville A<span class="sr">, départ à 16:30</span></a>`);
    expect(communePage(O, pageOf("le-tampon")!, l, NOW)).toContain(`Météo<span class="sr"> au Tampon</span>`);
  });
});
