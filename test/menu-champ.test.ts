import { describe, expect, it } from "vitest";
import { ouvrir } from "../src/web/associations-drapeau.js";
import { CATEGORIES, WITH_PAGE } from "../src/web/categories.js";
import { feuxLive } from "../src/web/domains.js";
import { homePage } from "../src/web/home.js";
import { esc } from "../src/web/map.js";
import { CHAMP, champScript, cibles, GROUPES, norm, SYNONYMES, trouve } from "../src/web/menu.js";
import { CSS, icon, meteoPage } from "../src/web/pages.js";
import { PAGES } from "../src/web/places.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-04T10:00:00Z");
const D = cibles(true);
const to = (t: string) => trouve(D, norm(t)).map((x) => x[1]);

describe("the menu in five groups", () => {
  it("has every category with a page in a group, once, and the clubs' space only while it is out", () => {
    const paths = GROUPES.flatMap((g) => g.entrees.map((e) => e.path));
    for (const c of WITH_PAGE) expect(paths, c.key).toContain(c.path);
    expect(new Set(paths).size).toBe(paths.length);
    ouvrir(false);
    try {
      expect(meteoPage(O, null, NOW)).not.toContain('href="/associations?ref=menu"');
      expect(cibles(false).map((x) => x[1])).not.toContain("/associations?ref=menu");
    } finally {
      ouvrir(true);
    }
  });

  it("gives the fires a page of their own, their own icon (not the vigilance's triangle) and the safety colour", () => {
    const feux = CATEGORIES.find((c) => c.key === "feux")!;
    expect(feux).toMatchObject({ nom: "Feux", path: "/feux", icon: "flame" });
    expect(icon("flame")).toContain("<path d=");
    expect(icon("flame")).not.toBe(icon(CATEGORIES.find((c) => c.key === "vigilance")!.icon));
    expect(CSS).toContain(".k-secheresse,.k-feux{--k:#4fd1c5}");
  });

  it("names the pages as marketing does", () => {
    const nom = (k: string) => CATEGORIES.find((c) => c.key === k)!.nom;
    expect([nom("bornes"), nom("eau"), nom("air")]).toEqual(["Bornes de recharge", "Qualité de l'eau", "Qualité de l'air"]);
  });
});

describe("the home page's field « Aller à une rubrique, une commune ou un lieu »", () => {
  const page = homePage(O, null, NOW);
  const section = page.slice(page.indexOf('<section class="champ"'), page.indexOf("</section>", page.indexOf('<section class="champ"')));

  it("sits above the tiles, shown with the script only, with marketing's words", () => {
    expect(page.indexOf('<section class="champ" data-js hidden>')).toBeGreaterThan(page.indexOf('<div class="hero-txt">'));
    expect(page.indexOf('<section class="champ"')).toBeLessThan(page.indexOf('<ul class="tiles"'));
    expect(section).toContain(`<label for="aller-q">Aller à une rubrique, une commune ou un lieu</label>`);
    expect(section).toContain(`<input id="aller-q" type="search" placeholder="${esc(CHAMP.exemple)}" autocomplete="off" enterkeyhint="go">`);
    expect(CHAMP.exemple).toBe("Ex. : Cilaos, carburants, plage");
    expect(section).toContain('<ul class="chips" id="aller-r" hidden></ul>');
    // Nothing found: the words typed in their own span, set as text by the script, then the connector's link.
    expect(section).toContain(
      `<p class="note" id="aller-rien" hidden>Aucune page pour « <span id="aller-s"></span> ». Essayez le nom d&#39;une commune ou d&#39;un lieu, ou posez la question à votre IA avec <a href="/mcp">le connecteur rundata.re</a>.</p>`,
    );
    expect(section).not.toContain("2 000");
    expect(page).toContain(`<script>${champScript(true)}</script>`);
  });

  it("writes its two pure functions into the script as they are, the list as a safe literal", () => {
    const script = champScript(true);
    expect(script).toContain(`n=${norm},f=${trouve};`);
    expect(script).not.toMatch(/<\/script|<!--/i);
    expect(script).toContain("textContent=x[0]");
    expect(script).not.toContain("innerHTML");
  });

  it("leads from the start of a name, without accents or capitals, eight pages at most", () => {
    expect(norm("  Étang-Salé ")).toBe("etang sale");
    expect(to("cilaos")).toContain("/communes/cilaos");
    expect(to("CARBU")).toEqual(["/carburants"]);
    // The names first, then the other words: the buses' « car jaune », the defibrillators' « arrêt cardiaque ».
    expect(to("car").slice(0, 2).sort()).toEqual(["/carburants", "/carte"]);
    expect(to("car")).toEqual(expect.arrayContaining(["/bus", "/defibrillateurs"]));
    expect(to("salé")).toContain("/communes/l-etang-sale");
    expect(to("e").length).toBe(8);
    expect(to("")).toEqual([]);
    expect(to("xyzw")).toEqual([]);
  });

  it("leads from marketing's other words to their pages", () => {
    expect(to("essence")).toEqual(["/carburants"]);
    expect(to("poubelle")).toEqual(["/collecte", "/decheteries"]);
    expect(to("plage")).toEqual(expect.arrayContaining(["/mer", "/baignade"]));
    expect(to("éruption")).toEqual(["/volcan"]);
    expect(to("bichique")).toEqual(["/peche"]);
    expect(to("incendie")).toEqual(["/feux"]);
    // Every other word leads somewhere the field knows.
    const known = new Set(D.map((x) => x[1]));
    for (const [words, paths] of SYNONYMES) for (const p of paths) expect(known.has(p), `${words[0]} → ${p}`).toBe(true);
  });

  it("knows the cyclone's three pages, the sites that do not answer, every commune and every place with a page", () => {
    for (const p of ["/kit-cyclone", "/alerte-cyclone", "/ecoles-cyclone", "/sites-sans-reponse"]) expect(D.map((x) => x[1])).toContain(p);
    for (const p of PAGES) expect(D.map((x) => x[1])).toContain(`/${p.commune ? "communes" : "meteo"}/${p.slug}`);
  });
});

describe("the fires' tile", () => {
  const copy = (feux: unknown) => ({ value: { feux }, fetchedAt: NOW, stale: false }) as never;

  it("says « aucun point chaud détecté » with the hour of the read, never « aucun feu »", () => {
    const l = feuxLive(copy({ detections: [], satellites: ["VIIRS_SNPP_NRT"], lu: "2026-11-04T09:52:00Z" }))!;
    expect(l.valeur).toBe("aucun point chaud détecté");
    expect(l.detail).toBe("ces dernières 24 h, par satellite (NASA FIRMS), lu à 13:52");
    expect(JSON.stringify(l)).not.toMatch(/aucun feu/i);
  });

  it("counts the points seen, and says they may be false", () => {
    const d = { lat: -21.1, lon: 55.5, t: "2026-11-04T08:00:00Z", satellite: "N", confiance: "forte", frp_mw: 3, lieu: "x" };
    const l = feuxLive(copy({ detections: [d, d], satellites: ["N"], lu: "2026-11-04T09:52:00Z" }))!;
    expect(l.valeur).toBe("2 points chauds");
    expect(l.detail).toContain("faux positifs possibles");
    expect(feuxLive(copy({ detections: [d], satellites: ["N"] }))!.valeur).toBe("1 point chaud");
  });

  it("waits for the hikes' copy, the fires being read with it", () => {
    expect(feuxLive(null)).toBeUndefined();
    expect(feuxLive(copy(undefined))).toBeUndefined();
  });
});
