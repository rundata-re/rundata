import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/web/categories.js";
import { airPage, bornesPage, eauPage, traficPage } from "../src/web/domains.js";
import { decheteriesPage } from "../src/web/decheteries.js";
import { esc } from "../src/web/map.js";
import { marchesPage } from "../src/web/marches-publics.js";
import { seaPage } from "../src/web/pages.js";

// One name per section, shared by the menu, the breadcrumb and the start of the H1 (marketing's words, 04/11/2026).
const O = "https://rundata.re";
const NOW = new Date("2026-11-04T06:00:00Z");
const between = (s: string, from: string, to: string) => {
  const i = s.indexOf(from);
  return i < 0 ? "" : s.slice(i, s.indexOf(to, i) + to.length);
};
const crumb = (page: string) => between(page, '<li aria-current="page">', "</li>");

describe("each section's name", () => {
  const sections = [
    { path: "/bornes", nom: "Bornes de recharge", h1: "Bornes de recharge à La Réunion", page: bornesPage(O, null, NOW) },
    { path: "/eau", nom: "Qualité de l'eau", h1: "Qualité de l'eau à La Réunion", page: eauPage(O, null, NOW) },
    { path: "/air", nom: "Qualité de l'air", h1: "Qualité de l'air à La Réunion", page: airPage(O, null, NOW) },
    { path: "/mer", nom: "Mer", h1: "Mer à La Réunion\u00a0: température et houle", page: seaPage(O, null, NOW) },
    { path: "/trafic", nom: "Circulation", page: traficPage(O, null, NOW) },
  ];

  it("is the menu's, the breadcrumb's and the start of the H1", () => {
    for (const s of sections) {
      expect(CATEGORIES.find((c) => c.path === s.path)?.nom, s.path).toBe(s.nom);
      expect(crumb(s.page), s.path).toBe(`<li aria-current="page">${esc(s.nom)}</li>`);
      expect(between(s.page, '"BreadcrumbList"', "]"), s.path).toContain(`"position":2,"name":"${s.nom}","item":"${O}${s.path}"`);
      if (s.h1) expect(between(s.page, "<h1>", "</h1>"), s.path).toBe(`<h1>${s.h1} <span class="n974">974</span></h1>`);
    }
  });

  // « Titre 974 » everywhere (marketing, 06/11/2026): the pages that had no « 974 » take it, none loses it. The others
  // of the ten are checked in their own tests (peche, emploi, antennes, carburants, feux, requin, traces, coupures).
  it("ends the H1 with « 974 » on the pages that had none", () => {
    expect(between(decheteriesPage(O, null, NOW), "<h1>", "</h1>")).toBe(`<h1>Les déchèteries de l&#39;île, et les bennes en direct dans l&#39;Ouest <span class="n974">974</span></h1>`);
    expect(between(marchesPage(O, null, NOW), "<h1>", "</h1>")).toBe(`<h1>Marchés publics à La Réunion <span class="n974">974</span></h1>`);
  });
});
