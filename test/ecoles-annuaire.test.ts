import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { INSEE } from "../src/places/insee.js";
import * as ecoles from "../src/vie/ecoles.js";
import { annuaireEcolesPage, CARTE, COLLEGE_SCRIPT, motsVoie, trouve, type CarteCommune } from "../src/web/ecoles-annuaire.js";
import { communePage } from "../src/web/commune.js";
import { enfantsPage } from "../src/web/enfants.js";
import { pageOf } from "../src/web/places.js";

/** A commune's file of the map of sectors, as the page loads it. */
const fichier = (commune: string): CarteCommune => JSON.parse(readFileSync(`public${CARTE.communes[INSEE[commune]]}`, "utf8"));
const college = (commune: string, saisie: string, voie?: string) => {
  const d = fichier(commune);
  const r = trouve(d, saisie, motsVoie, voie);
  return "c" in r ? d.colleges[r.c].nom : r.k;
};
/** The part of the page between two marks. */
const between = (html: string, from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)) + to.length);

describe("the public collèges' map of sectors (public/carte-scolaire/)", () => {
  it("has a file for each of the 24 communes, with every collège of the directory, the commune's only collège when it has one sector", () => {
    // Read on data.education.gouv.fr on 01/11/2026: 9 835 rows for the 974, 77 collèges, modified on 09/10/2026.
    expect(CARTE.maj).toBe("2026-10-09");
    expect([CARTE.troncons, CARTE.colleges, Object.keys(CARTE.communes).length]).toEqual([9835, 77, 24]);
    expect(Object.keys(CARTE.communes).sort()).toEqual(Object.values(INSEE).sort());
    const uais = new Set(ecoles.LIST.filter((e) => e.type === "college").map((e) => e.uai));
    let rows = 0;
    for (const [insee, path] of Object.entries(CARTE.communes)) {
      // The name changes with the content: Cloudflare serves it as immutable (public/_headers).
      expect(path).toMatch(new RegExp(`^/carte-scolaire/${insee}\\.[0-9a-f]{10}\\.json$`));
      const d: CarteCommune = JSON.parse(readFileSync(`public${path}`, "utf8"));
      expect(d.maj).toBe(CARTE.maj);
      for (const c of d.colleges) expect(uais.has(c.uai)).toBe(true);
      for (const v of d.v) expect(v[5]).toBeLessThan(d.colleges.length);
      expect(CARTE.uniques.includes(insee)).toBe(d.u != null && !d.v.length);
      rows += d.v.length + (d.u != null ? 1 : 0);
    }
    expect(rows).toBe(CARTE.troncons);
    expect(CARTE.uniques).toHaveLength(9);
    expect(readFileSync("public/_headers", "utf8")).toContain("/carte-scolaire/*\n  Cache-Control: public, max-age=31536000, immutable");
  });
});

describe("the collège of an address (trouve)", () => {
  it("finds the street and the stretch of its number, odd or even, abbreviations and accents as typed", () => {
    expect(college("Le Port", "12 allée Pablo Neruda")).toBe("Collège Edmond Albius");
    expect(college("Le Port", "13 ALLEE PABLO NERUDA")).toBe("Collège l'Oasis");
    expect(college("Le Port", "12 all. pablo néruda")).toBe("Collège Edmond Albius");
    expect(college("Le Port", "4 av de la Commune de Paris")).toBe("Collège Edmond Albius");
    expect(college("Le Port", "41, avenue Commune de Paris")).toBe("Collège Titan");
    expect(college("Saint-Paul", "150 boulevard du Front de Mer")).toBe("Collège de l'Étang Saint-Paul");
    expect(college("Saint-Paul", "12 chaussée royale")).toBe("Collège Antoine Soubou");
    expect(college("Saint-Denis", "3 allée des Opales")).toBe("Collège Bourbon");
    expect(college("Saint-Denis", "4 bis allée des Opales")).toBe("Collège Jules Reydellet");
  });

  it("takes a name cut short, and the street without its kind", () => {
    expect(college("Le Port", "12 allée Pablo Ner")).toBe("Collège Edmond Albius");
    expect(college("Le Port", "13 Pablo Neruda")).toBe("Collège l'Oasis");
  });

  it("without the number, gives a street's collèges by number", () => {
    const r = trouve(fichier("Le Port"), "allée Pablo Neruda", motsVoie);
    expect(r).toEqual({ k: "numeros", voie: ["ALLEE PABLO NERUDA", ""], num: false, hors: false, rows: [[1, 9999, 1, expect.any(Number)], [2, 9998, 2, expect.any(Number)]] });
  });

  it("asks which street when several places have one of that name with different collèges, then answers for the one picked", () => {
    const r = trouve(fichier("Saint-Paul"), "10 route Hubert Delisle", motsVoie);
    expect(r.k).toBe("choix");
    expect(r.k === "choix" && r.voies.map((v) => v[1]).sort()).toEqual(["", "BELLEMENE", "BOIS DE NEFLES ST PAUL", "LA SALINE"]);
    expect(college("Saint-Paul", "10 route Hubert Delisle", "ROUTE HUBERT DELISLE|LA SALINE")).toMatch(/^Collège /);
    // The place typed with the street picks it.
    expect(trouve(fichier("Saint-Paul"), "10 route Hubert Delisle la Saline", motsVoie).k).toBe("college");
  });

  it("gives the commune's only collège without an address, and says when nothing matches", () => {
    expect(college("Cilaos", "")).toMatch(/^Collège /);
    expect(trouve(fichier("Cilaos"), "", motsVoie).k).toBe("unique");
    expect(college("Le Port", "")).toBe("vide");
    expect(college("Le Port", "12 rue")).toBe("vide");
    expect(college("Le Port", "8 rue Qui N'Existe Pas")).toBe("inconnue");
  });
});

describe("the address typed is never kept nor sent", () => {
  const html = annuaireEcolesPage("https://rundata.re");
  const form = between(html, '<form id="cs"', "</form>");

  it("has a form with no action, no method, and fields without a name: nothing typed can go into an address", () => {
    expect(form).not.toMatch(/\saction=|\smethod=|\sname=/);
    expect(form).toContain('autocomplete="off"');
    expect(form.match(/<input[^>]*>/g)).toEqual([expect.stringContaining('autocomplete="off"')]);
  });

  it("loads only the commune's file, from its static path, and writes nothing: no URL, no storage, no beacon, no log", () => {
    // The script's one request: the file chosen in the list of communes, served by Cloudflare before the Worker.
    expect(COLLEGE_SCRIPT.match(/fetch\(/g)).toHaveLength(1);
    expect(COLLEGE_SCRIPT).toContain("const u=sel.value;if(!files[u])files[u]=fetch(u)");
    for (const word of ["location", "history", "Storage", "indexedDB", "cookie", "sendBeacon", "XMLHttpRequest", "WebSocket", "postMessage", "console", "navigator", "open("]) expect(COLLEGE_SCRIPT).not.toContain(word);
    const values = [...form.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    expect(values).toHaveLength(24);
    for (const v of values) {
      expect(v).toMatch(/^\/carte-scolaire\/\d{5}\.[0-9a-f]{10}\.json$/);
      expect(existsSync(`public${v}`)).toBe(true);
    }
    // The functions written into the script as they are.
    expect(COLLEGE_SCRIPT).toContain(`const motsVoie=${motsVoie},trouve=${trouve};`);
  });

  it("never sees the address on the server: the Worker has no route for the files, the page none for an address", async () => {
    const src = readFileSync("src/web/site.ts", "utf8") + readFileSync("src/app.ts", "utf8");
    expect(src).not.toContain('"/carte-scolaire');
    const res = await handle(new Request("https://rundata.re/ecoles?adresse=1"), new Cache());
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("adresse=1");
  });
});

describe("the page /ecoles", () => {
  it("has the 24 communes, the filters, a dot on the map and a row per establishment, in the menu's group « Vie pratique » only", async () => {
    const res = await handle(new Request("https://rundata.re/ecoles"), new Cache());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Écoles, collèges et lycées <span class=\"n974\">974</span></h1>");
    expect(html.match(/<a class="sp" href="#e-/g)).toHaveLength(ecoles.LIST.length);
    expect(html.match(/<li id="e-/g)).toHaveLength(ecoles.LIST.length);
    expect(html.match(/<li class="card tgt" id="c-/g)).toHaveLength(24);
    for (const v of ["c", "i", "u"]) expect(html).toContain(`<input type="checkbox" name="es" id="es-${v}" value="${v}">`);
    // In the menu's group « Vie pratique » (marketing's menu of 04/11), not in the quick bar.
    expect(between(html, '<nav class="quick"', "</nav>")).not.toContain('href="/ecoles"');
    expect(between(between(html, '<nav class="sheet"', "</nav>"), "Vie pratique", "</ul>")).toContain('href="/ecoles"');
    expect(html).toContain("le secteur est fixé par chaque mairie, et il n&#39;est pas publié en données ouvertes");
    // A collège that declares a canteen and an ULIS is found by both.
    const e = ecoles.LIST.find((x) => x.type === "college" && x.cantine && x.ulis && !x.internat)!;
    expect(html).toContain(`<li id="e-${e.uai}" data-t="college" data-s="cu">`);
  });

  it("is linked from /enfants and from each commune's schools", () => {
    expect(enfantsPage("https://rundata.re", null)).toContain('<a href="/ecoles#college">Quel collège pour votre adresse ? →</a>');
    const p = pageOf("saint-paul")!;
    expect(communePage("https://rundata.re", p, { place: null })).toContain('<a href="/ecoles#college">Le collège de secteur de votre adresse, et les écoles de toute l\'île →</a>');
  });
});

describe("the tables of /ecoles", () => {
  it("each have a name for a screen reader, the titles shown above them", () => {
    const html = annuaireEcolesPage("https://rundata.re");
    const tables = html.match(/<table[^>]*>/g) ?? [];
    expect(tables.length).toBeGreaterThan(100);
    expect(html.match(/<table[^>]*><caption class="sr">/g)).toHaveLength(tables.length);
    // A commune's collèges, a lycée, an establishment after the bac: each by its heading, the collèges with their commune.
    expect(html).toContain('<h4>Collèges</h4><div class="table-wrap defile"><table class="drought histo passe ipsva"><caption class="sr">Collèges, Saint-Paul</caption>');
    expect(html).toMatch(/<h5>([^<]+) <span class="note">IPS [^<]+<\/span><\/h5><div class="table-wrap defile"><table class="drought histo passe ipsva"><caption class="sr">\1<\/caption>/);
    expect(html).toMatch(/<h4>([^<]+)<\/h4><div class="table-wrap"><table class="drought histo passe psup"><caption class="sr">\1<\/caption>/);
  });
});
