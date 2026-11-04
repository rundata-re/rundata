import { describe, expect, it } from "vitest";
import type { Carte } from "../src/providers/sentiers.js";
import { RANDONNEES, SENTIERS } from "../src/providers/traces.js";
import { climb, fits, relief, routeRow } from "../src/tools/sentiers.js";
import { avis, parseTrails } from "../src/providers/sentiers.js";
import { readFileSync } from "node:fs";
import type { TraceAnswer } from "../src/web/data.js";
import { hikeCard, randonneesPage, stateHead, tracePage, trailLi, twinOf } from "../src/web/domains.js";

// A trace runs the way it was drawn: the ONF draws the Sentier de la Roche Écrite downhill (bundle of 04/11/2026).
const ROCHE = SENTIERS["Sentier de la Roche Écrite"];
const ENTITIES: Record<string, string> = { "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const meta = (html: string, name: string) =>
  (html.match(new RegExp(`<meta property="${name}" content="([^"]*)"`))?.[1] ?? "").replace(/&(?:#39|quot|lt|gt|amp);/g, (e) => ENTITIES[e]);
const titleOf = (html: string) => (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(/&(?:#39|quot|lt|gt|amp);/g, (e) => ENTITIES[e]);
const answer = (nom: string, genre: TraceAnswer["genre"], x: { slug: string; km: number; dplus: number; dmoins: number; alt_min?: number; alt_max?: number }): TraceAnswer => ({
  nom, slug: x.slug, genre, km: x.km, dplus: x.dplus, dmoins: x.dmoins, alt_min: x.alt_min, alt_max: x.alt_max,
  etat: "Ouvert d'après l'ONF", ferme: false, troncons: [{ etat: "ouvert" }], lignes: [], profil: [], randonnees: [], fermes: [], inconnus: [], sources: [],
});
const page = (d: TraceAnswer) => tracePage("https://rundata.re", d.genre, d.slug, d.nom, { value: d, fetchedAt: new Date("2026-11-04T10:00:00Z"), stale: false });

describe("dénivelé d'un sentier tracé en descente", () => {
  it("la Roche Écrite : 0 m en montée dans le paquet, 1 131 m en descente", () => {
    expect(ROCHE).toMatchObject({ dplus: 0, dmoins: 1131, alt_min: 1108, alt_max: 2275 });
  });

  it("l'aperçu donne les altitudes, jamais « 0 m de dénivelé positif »", () => {
    const said = meta(page(answer("Sentier de la Roche Écrite", "sentier", ROCHE)), "og:description");
    expect(said.replace(/[\u00a0\u202f]/g, " ")).toContain("de 1 108 à 2 275 m d'altitude");
    expect(said).not.toMatch(/dénivelé positif/);
  });

  it("un sentier qui monte plus qu'il ne descend garde son dénivelé positif", () => {
    const scout = SENTIERS["Sentier Scout"];
    expect(relief(scout)).toBe("959 m de dénivelé positif");
    expect(relief({ dplus: 0, dmoins: 300 })).toBe("300 m de dénivelé négatif");
    expect(relief({})).toBeUndefined();
  });

  it("le filtre compare le plus grand des deux dénivelés", () => {
    expect(climb(ROCHE)).toBe(1131);
    // « sans trop de dénivelé » (400 m) ne propose plus la Roche Écrite.
    expect(fits({ denivele_max_m: 400 }, ROCHE.km, climb(ROCHE))).toBe(false);
    expect(fits({ denivele_max_m: 1200 }, ROCHE.km, climb(ROCHE))).toBe(true);
  });
});

describe("sentiers en double", () => {
  it("9 noms ont une page de sentier ONF et une d'itinéraire", () => {
    const both = RANDONNEES.filter((r) => SENTIERS[r.nom]).map((r) => r.nom);
    expect(both).toHaveLength(9);
    expect(twinOf("sentier", "Sentier Bayonne")).toBe("sentier ONF");
    expect(twinOf("randonnee", "Sentier Bayonne")).toBe("itinéraire");
    expect(twinOf("sentier", "Sentier Kapor")).toBeUndefined();
  });

  it("leurs titres se distinguent", () => {
    const bayonne = SENTIERS["Sentier Bayonne"];
    const hike = RANDONNEES.find((r) => r.slug === "sentier-bayonne")!;
    const a = titleOf(page(answer("Sentier Bayonne", "sentier", bayonne)));
    const b = titleOf(page(answer("Sentier Bayonne", "randonnee", hike)));
    expect(a).toMatch(/^Sentier Bayonne \(sentier ONF/);
    expect(b).toMatch(/^Sentier Bayonne \(itinéraire/);
    expect(a).not.toBe(b);
    expect(titleOf(page(answer("Sentier Kapor", "sentier", SENTIERS["Sentier Kapor"])))).toMatch(/^Sentier Kapor( \(|\s:)/);
  });
});

describe("randonnée dont un tronçon hors gestion ONF porte un avis", () => {
  const hike = RANDONNEES.find((r) => r.slug === "sentier-bayonne")!;
  // As the ONF's map writes it (04/11/2026): the date and the cause in one field, a space between them.
  const BAYONNE = "Fermé le 02/06/26 Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs";
  const carte = (bayonne: Partial<Carte["sentiers"][number]>): Carte => ({
    sentiers: [
      { nom: "Sentier Bayonne", statut: "hors gestion ONF", longueur_km: 9, points: [], ...bayonne },
      { nom: "Sentier du point de vue du Dimitile", statut: "ouvert", longueur_km: 1, points: [] },
    ],
    routes: [],
  });

  it("l'avis suit les tronçons ouverts, cité entre guillemets anglais", () => {
    const row = routeRow(hike, carte({ cause: avis(BAYONNE) }));
    expect(row.etat).toBe("tronçons suivis par l'ONF ouverts ; Sentier Bayonne (hors gestion ONF), sur la carte de l'ONF : “Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs”");
    expect(row.troncons_onf?.[0]).toMatchObject({ sentier: "Sentier Bayonne", etat: "hors gestion ONF", cause: avis(BAYONNE) });
  });

  it("l'aperçu de la randonnée commence par l'avis, jamais par « ouverts »", () => {
    const row = routeRow(hike, carte({ cause: avis(BAYONNE) }));
    const d: TraceAnswer = {
      ...answer("Sentier Bayonne", "randonnee", hike),
      etat: row.etat.charAt(0).toUpperCase() + row.etat.slice(1),
      troncons: (row.troncons_onf ?? []).map((t) => ({ sentier: t.sentier, etat: t.etat, cause: t.cause, precision: t.precision })),
    };
    const notice = "sur la carte de l'ONF\u00a0: “Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs”";
    // The section is named as the hike, which the title names.
    expect(stateHead(d)).toBe(`Hors gestion ONF\u00a0; ${notice}`);
    expect(meta(page(d), "og:description")).toBe(`Hors gestion ONF\u00a0; ${notice}.`);
    // Another name: the section's.
    expect(stateHead({ ...d, nom: "Boucle du Dimitile" })).toBe(`Sentier Bayonne (hors gestion ONF), ${notice}`);
    const said = meta(page(d), "og:description");
    expect(said.length).toBeLessThanOrEqual(160);
    expect(said).not.toMatch(/GPX/);
  });

  it("la carte de l'ONF lue : « · » entre la date et la cause", () => {
    const trails = parseTrails(JSON.parse(readFileSync(new URL("./fixtures/onf/sentiers.json", import.meta.url), "utf8")).features);
    expect(trails.find((t) => t.nom === "Sentier Bayonne")?.cause).toBe(avis(BAYONNE));
    expect(avis(BAYONNE)).toBe("Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs");
    // A date followed by a small letter stays as it is.
    expect(avis("Fermé jusqu'au 30/10/26 inclus - Sentier ouvert les samedis et dimanches")).toBe("Fermé jusqu'au 30/10/26 inclus - Sentier ouvert les samedis et dimanches");
  });

  it("sans avis, la phrase d'avant", () => {
    expect(routeRow(hike, carte({})).etat).toBe("tronçons suivis par l'ONF ouverts");
  });
});

describe("listes de /randonnees et /sentiers", () => {
  const plain = (html: string) => html.replace(/[\u00a0\u202f]/g, " ");
  const dp = (html: string) => html.match(/data-dp="([^"]*)"/)?.[1];
  const trail = (x: { dplus?: number; dmoins?: number }) =>
    trailLi({ k: "s1", nom: "Sentier de la Roche Écrite", slug: "sentier-de-la-roche-ecrite", commune: "Saint-Denis", km: 9.9, etat: "ouvert", boucle: false, randonnees: [], ...x });
  const hike = (x: { dplus: number; dmoins: number; avis?: string[] }) =>
    hikeCard({ k: "h1", nom: "Boucle A", slug: "boucle-a", km: 9.9, boucle: false, secteur: "Saint-Denis", fermes: [], inconnus: [], onf: 1, ...x });

  it("un sentier tracé en descente : « +0 m · −1 131 m », et le filtre lit la descente", () => {
    const li = trail(ROCHE);
    expect(plain(li)).toContain("9,9 km · +0 m · −1 131 m");
    expect(dp(li)).toBe("1131");
    const card = hike(ROCHE);
    expect(plain(card)).toContain("9,9 km · +0 m · −1 131 m");
    expect(dp(card)).toBe("1131");
  });

  it("un sentier qui monte plus qu'il ne descend : la montée seule, lue par le filtre", () => {
    const li = trail({ dplus: 959, dmoins: 120 });
    expect(plain(li)).toContain("9,9 km · +959 m");
    expect(li).not.toContain("−");
    expect(dp(li)).toBe("959");
    expect(dp(hike({ dplus: 959, dmoins: 120 }))).toBe("959");
    // No figures: nothing said, nothing filtered.
    expect(dp(trail({}))).toBe("");
    expect(plain(trail({}))).not.toMatch(/\+\d/);
  });

  it("l'avis d'un tronçon hors gestion, en gras sur la carte de la randonnée", () => {
    const said = "Sentier Bayonne (hors gestion ONF), sur la carte de l'ONF : “Fermé le 02/06/26 · Désordres constatés”";
    const card = hike({ dplus: 300, dmoins: 300, avis: [said] });
    expect(card).toContain(`<p class="note"><b>${said.replace(/'/g, "&#39;")}.</b></p>`);
    expect(hike({ dplus: 300, dmoins: 300 })).not.toContain("<b>");
  });

  it("le filtre s'appelle « Dénivelé »", () => {
    const html = randonneesPage("https://rundata.re", { value: { randonnees: [], secteurs: [], lignes: [], fermes: 0, suivis: 0, sources: [], hauts: [] } as never, fetchedAt: new Date("2026-11-04T10:00:00Z"), stale: false });
    expect(html).toContain("<label>Dénivelé <select name=\"dp\">");
    expect(html).not.toContain("Dénivelé positif <select");
  });
});
