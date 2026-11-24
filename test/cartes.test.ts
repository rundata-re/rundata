import { describe, expect, it } from "vitest";
import baignades from "../src/eau/baignades.json" with { type: "json" };
import { COMMON } from "../src/tools/eau.js";
import type { EauAnswer, HistoriqueAnswer, SeaData } from "../src/web/data.js";
import { eauPage } from "../src/web/domains.js";
import { historiquePage } from "../src/web/historique.js";
import { project } from "../src/web/map.js";
import { anchorId, seaPage } from "../src/web/pages.js";
import { deadAnchors, doubleIds, mapLinks, tabStops } from "./cartes.js";

const NOW = new Date("2026-10-24T06:00:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
const sub = ([a, b]: [number, number], [c, d]: [number, number]): [number, number] => [a - c, b - d];

describe("the maps of the pages read from a bundle or a database", () => {
  it("lead each bathing site to its line on /eau", () => {
    const site = (s: string, commune: string, lon: number, lat: number, q: string) => ({
      site: s, commune, lon, lat, qualite_dernier_prelevement: q, dernier_prelevement: "20/10/2026", derniers_prelevements: [], mauvais_sur_12_mois: 0,
    });
    const value = {
      baignades: [site("Plage de l'Hermitage", "Saint-Paul", 55.22, -21.08, "bonne"), site("Bassin Manapany", "Saint-Joseph", 55.6, -21.37, "moyenne")],
      communes: [],
      lu: NOW.toISOString(),
      a_savoir: COMMON,
      sources: [],
    } as unknown as EauAnswer;
    const page = eauPage("https://rundata.re", cached(value), NOW);
    expect(mapLinks(page).map((l) => l.href)).toEqual(["#b-plage-de-l-hermitage", "#b-bassin-manapany"]);
    expect(mapLinks(page)[1].label).toBe("Bassin Manapany : qualité moyenne au dernier prélèvement, voir le détail");
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
  });

  it("draws every bathing site's round apart on /eau, none over another", () => {
    // 24/11/2026: the ARS's 26 sites at their places, seven on the 15 km of coast from Boucan Canot to the Pointe des Trois
    // Roches, four in Saint-Pierre: the rounds covered each other and their mark (✓) could not be read.
    const value = {
      baignades: baignades.sites.map((s) => ({ site: s.nom, commune: s.commune, lon: s.lon, lat: s.lat, qualite_dernier_prelevement: "bonne", dernier_prelevement: "15/09/2026", derniers_prelevements: [], mauvais_sur_12_mois: 0 })),
      communes: [],
      lu: NOW.toISOString(),
      a_savoir: COMMON,
      sources: [],
    } as unknown as EauAnswer;
    const page = eauPage("https://rundata.re", cached(value), NOW);
    // Each round with the site it stands for (its link), and the site's point on the map.
    const rounds = [...page.matchAll(/<a class="mk" href="#([^"]+)"[^>]*>(?:(?!<\/a>).)*?<circle class="sh" cx="(-?\d+)" cy="(-?\d+)" r="(\d+)"/gs)]
      .map((m) => ({ id: m[1], x: +m[2], y: +m[3], r: +m[4] }));
    const point = (id: string) => {
      const s = baignades.sites.find((b) => anchorId("b", b.nom) === id);
      return project(s!.lon, s!.lat);
    };
    // A site left off the map is named under it, with a link to its line.
    const under = page.match(/<p class="note hors"[^>]*>(.*?)<\/p>/s)?.[1] ?? "";
    const out = [...under.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(rounds.length + out.length).toBe(baignades.sites.length);
    expect(out.length).toBeLessThanOrEqual(4);
    const over = rounds.flatMap((a, i) => rounds.slice(i + 1).filter((b) => Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r).map((b) => `${a.id} / ${b.id}`));
    expect(over).toEqual([]);
    // 24/11/2026 (/eau online): Citerne Quarante Six's point under the round of Saint-Leu's town centre, the Bassin de la
    // Passerelle's bitten by Manapany's. No round covers another place's point (10, its white ring 2).
    const hides = rounds.flatMap((a) => rounds.filter((b) => b.id !== a.id && Math.hypot(...sub(point(b.id), [a.x, a.y])) < a.r + 12).map((b) => `${a.id} sur ${b.id}`));
    expect(hides).toEqual([]);
    // La Saline-les-Bains and the Pointe des Trois Roches, their lines under each other's round: each line, from its
    // point to its own round's edge, is seen over half its length at least.
    const hidden = rounds.flatMap((a) => {
      const [x0, y0] = point(a.id);
      const d = Math.hypot(a.x - x0, a.y - y0);
      const len = d - a.r;
      if (len <= 0) return [];
      const steps = 100;
      let seen = 0;
      for (let k = 0; k < steps; k++) {
        const t = ((k + 0.5) / steps) * (len / d);
        const [x, y] = [x0 + (a.x - x0) * t, y0 + (a.y - y0) * t];
        if (!rounds.some((b) => b.id !== a.id && Math.hypot(b.x - x, b.y - y) < b.r)) seen++;
      }
      return seen < steps / 2 ? [`${a.id} : ${seen} %`] : [];
    });
    expect(hidden).toEqual([]);
    // 24/11/2026 (/eau online): the line of the Ermitage sud embouchure went under the round of Trou d'Eau, though seen over
    // half its length, and four others under another round. A line passes under no round but its own where a free place
    // exists, and no site leaves the map for it: five did before, two are left. Known limits, with no free place on this
    // crowded coast (not regressions): Ermitage sud embouchure under Trou d'Eau, Pointe Trois Roches under La Saline.
    const underOther = rounds.flatMap((a) => {
      const [x0, y0] = point(a.id);
      const d = Math.hypot(a.x - x0, a.y - y0);
      const len = d - a.r;
      if (len <= 0) return [];
      const steps = 100;
      return rounds.filter((b) => b.id !== a.id && Array.from({ length: steps }, (_, k) => ((k + 0.5) / steps) * (len / d))
        .some((t) => Math.hypot(b.x - (x0 + (a.x - x0) * t), b.y - (y0 + (a.y - y0) * t)) < b.r)).map((b) => `${a.id} sous ${b.id}`);
    });
    expect(underOther.length, underOther.join(", ")).toBeLessThanOrEqual(2);
    // 25/11/2026 (/eau online): four lines crossed on the west coast, Hermitage centre's and La Saline-les-Bains's
    // nearly side by side, La Saline's under Hermitage centre's round. Two rounds whose lines cross swap their places.
    const line = (a: (typeof rounds)[number]): [[number, number], [number, number]] => [point(a.id), [a.x, a.y]];
    const cross = ([p, q]: [number, number][], [u, v]: [number, number][]) => {
      const side = (a: [number, number], b: [number, number], c: [number, number]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      return side(p, q, u) * side(p, q, v) < 0 && side(u, v, p) * side(u, v, q) < 0;
    };
    const crossed = rounds.flatMap((a, i) => rounds.slice(i + 1).filter((b) => cross(line(a), line(b))).map((b) => `${a.id} × ${b.id}`));
    expect(crossed).toEqual([]);
  });

  it("lead each station of the rain map to its row on /historique", () => {
    const station = (s: string, lon: number, lat: number, rapport: string) => ({
      zone: "Nord", station: s, altitude_m: 10, lon, lat, pluie: { total_mm: 20, jours_de_pluie: 3, normale_mm: 60, rapport_a_la_normale: rapport },
    });
    const value: HistoriqueAnswer = {
      resume: "",
      periode: { du: "24/09/2026", au: "23/10/2026", jours: 30 },
      stations: [station("Saint-Denis-Gillot", 55.52, -20.89, "33 %"), station("Plaine des Cafres", 55.57, -21.21, "120 %")],
      a_savoir: [],
      sources: [],
    };
    const page = historiquePage("https://rundata.re", cached(value), NOW);
    expect(mapLinks(page).map((l) => l.href)).toEqual(["#s-saint-denis-gillot", "#s-plaine-des-cafres"]);
    expect(tabStops(page)).toBe(0);
    expect(mapLinks(page)[0].label).toBe("Saint-Denis-Gillot : 33\u00a0% de la pluie normale en 30\u00a0jours, voir le détail");
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
  });

  it("lead each beach of the sea map to its line on /mer", () => {
    const value: SeaData = {
      plages: [
        { nom: "Plage de Boucan Canot", commune: "Saint-Paul", lon: 55.22, lat: -21.03, valeur: 25.4, jour: "2026-10-22", distance_km: 3 },
        { nom: "Plage de Grande Anse", commune: "Petite-Île", lon: 55.55, lat: -21.37, valeur: 24.1, jour: "2026-10-22", distance_km: 4 },
      ],
      sources: [],
    } as SeaData;
    const page = seaPage("https://rundata.re", cached(value), NOW);
    expect(mapLinks(page).map((l) => l.href)).toEqual(["#p-plage-de-boucan-canot", "#p-plage-de-grande-anse"]);
    expect(tabStops(page)).toBe(0);
    expect(mapLinks(page)[0].label).toMatch(/ : eau à 25 °C, voir le détail$/);
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
  });

  it("keep two close markers' hit areas apart, so that a tap between them goes to the nearer", () => {
    const value = cached({
      plages: [
        { nom: "Plage A", commune: "Saint-Paul", lon: 55.22, lat: -21.03, valeur: 25, jour: "2026-10-22", distance_km: 3 },
        { nom: "Plage B", commune: "Saint-Paul", lon: 55.287, lat: -21.03, valeur: 25, jour: "2026-10-22", distance_km: 3 },
        { nom: "Plage C", commune: "Saint-Joseph", lon: 55.6, lat: -21.37, valeur: 24, jour: "2026-10-22", distance_km: 3 },
      ],
      sources: [],
    } as SeaData);
    const hits = [...seaPage("https://rundata.re", value, NOW).matchAll(/<circle class="hit" cx="(\d+)" cy="(\d+)" r="(\d+)"/g)].map((m) => m.slice(1).map(Number));
    const [a, b, c] = hits;
    // A and B about 100 units apart: each at most half the way, so they never overlap; C, alone, the full size.
    expect(a[2]).toBeLessThan(66);
    expect(a[2] + b[2]).toBeLessThanOrEqual(Math.hypot(a[0] - b[0], a[1] - b[1]));
    expect(c[2]).toBe(66);
  });

  it("draw two close beaches' discs apart, never one over the other (Boucan-Canot and L'Hermitage, both 26°, the review of 31/10)", () => {
    const value = cached({
      plages: [
        { nom: "Plage de Boucan Canot", commune: "Saint-Paul", lon: 55.224, lat: -21.028, valeur: 25.6, jour: "2026-10-29", distance_km: 3 },
        { nom: "Plage de l'Hermitage", commune: "Saint-Paul", lon: 55.222, lat: -21.077, valeur: 25.7, jour: "2026-10-29", distance_km: 3 },
      ],
      sources: [],
    } as SeaData);
    const discs = [...seaPage("https://rundata.re", value, NOW).matchAll(/<circle class="sh" cx="([\d.]+)" cy="([\d.]+)" r="(\d+)"/g)].map((m) => m.slice(1).map(Number));
    expect(discs).toHaveLength(2);
    const [a, b] = discs;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(a[2] + b[2]);
  });
});
