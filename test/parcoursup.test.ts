import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import { enGrand } from "../src/tools/format.js";
import * as parcoursup from "../src/vie/parcoursup.js";
import { ETABLISSEMENTS, parCommune } from "../src/vie/parcoursup-formations.js";
import { communePage } from "../src/web/commune.js";
import { annuaireEcolesPage } from "../src/web/ecoles-annuaire.js";
import { pageOf } from "../src/web/places.js";

// Tuesday 03/11/2026, 17:00 at La Réunion.
const NOW = new Date("2026-11-03T13:00:00Z");
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null, commune: null }, NOW);
const tile = (html: string) => html.match(/<li class="tile[^>]*>(?:(?!<li class="tile).)*?<h3>(?:<a [^>]*>)?Après le bac(?:<\/a>)?<\/h3>.*?(?=<li class="tile|<\/ul>)/s)?.[0];
const section = (html: string) => html.slice(html.indexOf('<section id="apres-bac"'), html.indexOf("</section>", html.indexOf('<section id="apres-bac"')));
const SANS = ["Cilaos", "Entre-Deux", "L'Étang-Salé", "Petite-Île", "Saint-Philippe", "Sainte-Rose", "Salazie"];

describe("the formations of La Réunion in Parcoursup (vie/parcoursup.ts)", () => {
  it("are the 2025 session's, counted by commune", () => {
    expect(parcoursup.SESSION).toBe(2025);
    expect(parcoursup.ARRETE_LE).toBe("2025-09-10");
    expect(parcoursup.ofCommune("Saint-Denis")).toEqual({ formations: 86, places: 7165, etablissements: 16 });
    const counts = Object.keys(INSEE).map((nom) => [nom, parcoursup.ofCommune(nom)!] as const);
    expect(counts.filter(([, c]) => !c.formations).map(([nom]) => nom).sort()).toEqual([...SANS].sort());
    expect(counts.reduce((n, [, c]) => n + c.formations, 0)).toBe(246);
    expect(counts.reduce((n, [, c]) => n + c.places, 0)).toBe(13734);
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: parcoursup.SOURCE.id }));
  });

  it("are listed by commune, establishment and formation, in alphabetical order, each with its sheet", () => {
    expect(ETABLISSEMENTS).toHaveLength(65);
    const all = parCommune();
    const sorted = (names: string[]) => expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    sorted(all.map(([c]) => c));
    for (const [c, list] of all) {
      sorted(list.map((e) => e.nom));
      for (const e of list) {
        expect(e.commune).toBe(c);
        sorted(e.formations.map((f) => f.nom));
        for (const f of e.formations) {
          expect(f.fiche).toMatch(/^https:\/\/dossierappel\.parcoursup\.fr\/Candidats\/public\/fiches\/afficherFicheFormation\?g_ta_cod=\d+&typeBac=0&originePc=0$/);
          expect(f.tauxAcces).toBeGreaterThanOrEqual(0);
          expect(f.tauxAcces).toBeLessThanOrEqual(100);
          expect(f.places).toBeGreaterThan(0);
        }
      }
    }
    // The tile's counts are the list's.
    for (const [c, list] of all) expect(list.reduce((n, e) => n + e.formations.length, 0)).toBe(parcoursup.ofCommune(c)!.formations);
  });
});

describe("the tile « Après le bac » of a commune", () => {
  it("counts the commune's formations, places and establishments, and goes to /ecoles", () => {
    const t = tile(page("saint-denis"))!;
    expect(t).toContain(`<p class="tv">${enGrand("86 formations")}</p>`);
    expect(t).toContain("dans Parcoursup · 7\u202f165 places en 2025, dans 16 établissements</p>");
    expect(t).not.toContain("après Parcoursup");
    expect(t).toContain('href="/ecoles#apres-bac"');
    expect(t).not.toContain("%");
    expect(page("saint-denis")).toContain(parcoursup.SOURCE.nom.replaceAll("'", "&#39;"));
  });

  it("says a single formation in the singular", () => {
    const t = tile(page("la-plaine-des-palmistes"))!;
    expect(t).toContain(`<p class="tv">${enGrand("1 formation")}</p>`);
    expect(t).toContain("dans Parcoursup · 25 places en 2025, dans 1 établissement</p>");
  });

  it("says « aucune formation » for a commune without one", () => {
    const t = tile(page("salazie"))!;
    expect(t).toContain(`<p class="tv">${enGrand("Aucune formation Parcoursup dans la commune en 2025")}</p>`);
  });
});

describe("the part « Après le bac » of /ecoles", () => {
  const html = section(annuaireEcolesPage("https://rundata.re"));

  it("says the ministry's words, then tables each establishment's formations", () => {
    expect(html).toContain('<h2 id="h-apres-bac">Après le bac</h2>');
    expect(html).toContain("246 formations dans 17 communes, hors apprentissage");
    expect(html).toContain("« rapport entre le nombre de candidats dont le rang de classement est inférieur ou égal au rang du dernier appelé de son groupe et le nombre de candidats ayant validé un vœu pour la formation étudiée en phase principale (hors GDD) »");
    expect(html).toContain("« Si le taux est de 100 %, cela signifie qu&#39;aucun candidat n&#39;était en attente de proposition dans cette formation à la fin de la PP (hors GDD). »");
    expect(html).toContain("Un taux d&#39;accès bas veut dire que les candidats étaient nombreux pour les places : il ne dit rien de la qualité de la formation. Chaque candidat fait jusqu&#39;à 10 vœux.");
    expect(html.match(/<tr><th scope="row"><a href="https:\/\/dossierappel\.parcoursup\.fr\//g)).toHaveLength(246);
    expect(html).toContain("<h4>Lycée Paul Moreau</h4>");
    expect(html).toContain("Parcoursup - Traitement SIES, session 2025 (données arrêtées au 10/09/2025), Licence Ouverte.");
  });

  it("never sorts, colours, averages, nor says the admitted's profile", () => {
    // « Mention » alone is in some formations' names (BPJEPS): the bac's mentions are what is never said.
    expect(html).not.toMatch(/moyenne|médiane|mention (?:très |assez )?bien|boursier|par place|class="q-|vg\d/i);
    // In each establishment, the formations stay in alphabetical order, whatever their taux.
    for (const e of ETABLISSEMENTS) {
      const at = e.formations.map((f) => html.indexOf(`href="${f.fiche.replaceAll("&", "&amp;")}"`));
      expect(at.every((i) => i > 0)).toBe(true);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });
});
