import { describe, expect, it } from "vitest";
import type { Avis } from "../src/providers/marches-publics.js";
import { communePage } from "../src/web/commune.js";
import { type MarchesAnswer, marchesPage, ouvertsA } from "../src/web/marches-publics.js";
import { pageOf } from "../src/web/places.js";

// /marches-publics?commune=<slug>: the link to one commune's notices, and the commune's page that gives it (22/11/2026).
const O = "https://rundata.re";
const NOW = new Date("2026-11-23T10:05:00Z");
const avis = (id: string, x: Partial<Avis>): Avis => ({ id, objet: `Objet ${id}`, acheteur: "CINOR", types: ["travaux"], parution: "2026-11-20", limite: "2026-12-15", lien: `https://www.boamp.fr/pages/avis/?q=idweb:${id}`, ...x });
const LISTE = [avis("1", { commune: "Saint-Paul" }), avis("2", { communeAcheteur: "Saint-Paul" }), avis("3", { commune: "L'Étang-Salé" }), avis("4", {})];
const copie = (l: Avis[]) => ({ value: { nombre: l.length, avis: l, sources: [], lu: NOW.toISOString() } as MarchesAnswer, fetchedAt: NOW, stale: false });

/** The page's script, run on a DOM made of what it reads, at `search`; what the address became, what is shown. */
function open(search: string) {
  const html = marchesPage(O, copie(LISTE), NOW);
  const script = /<script>(\(\(\)=>\{const f=document\.getElementById\("of"\)[\s\S]*?)<\/script>/.exec(html)![1]!;
  const communes = JSON.parse(/data-communes="([^"]+)"/.exec(html)![1]!.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  const options = [{ value: "", dataset: {} as Record<string, string> }, ...[...html.matchAll(/<option data-s="([^"]+)">([^<]+)<\/option>/g)].map((m) => ({ value: m[2]!.replace(/&#39;/g, "'"), dataset: { s: m[1]! } }))];
  const handlers: ((e: { target: unknown }) => void)[] = [];
  const c = { value: "", options, get selectedOptions() { return options.filter((o) => o.value === c.value); } };
  const f = { hidden: true, dataset: { communes: JSON.stringify(communes) }, q: { value: "" }, c, addEventListener: (k: string, h: (e: { target: unknown }) => void) => k === "input" && handlers.push(h) };
  // The items as the page writes them: their commune is the page's own data-c, never rebuilt here.
  const items = [...html.matchAll(/<li data-c="([^"]*)">[\s\S]*?(Objet \d+)/g)].map((m) => ({ hidden: false, dataset: { c: m[1]!.replace(/&#39;/g, "'") } as Record<string, string>, textContent: m[2]! }));
  expect(items).toHaveLength(LISTE.length);
  const b = { textContent: "" };
  const zero = { hidden: true, querySelector: () => b };
  const list = { hidden: false };
  const count = { textContent: "" };
  const document = {
    getElementById: (id: string) => ({ of: f, marches: list, "of-0": zero, "of-n": count })[id],
    querySelectorAll: (s: string) => (s === "#marches li" ? items : []),
  };
  const location = { pathname: "/marches-publics", search, hash: "" };
  const history = { replaceState: (_: unknown, __: string, u: string) => { const [p, q] = u.split("?"); location.pathname = p!; location.search = q ? `?${q}` : ""; } };
  new Function("document", "location", "history", script)(document, location, history);
  const choose = (v: string) => { c.value = v; for (const h of handlers) h({ target: c }); };
  return { f, c, items, zero, b, list, count, location, choose };
}

describe("/marches-publics?commune=<slug>", () => {
  it("chooses the commune of the slug at the opening, its count said, the other parameters kept", () => {
    const v = open("?commune=saint-paul&ref=fbg-marches-saint-paul-2311");
    expect(v.c.value).toBe("Saint-Paul");
    expect(v.items.map((i) => i.hidden)).toEqual([false, false, true, true]);
    expect(v.count.textContent).toBe("2 avis sur 4.");
    expect([v.zero.hidden, v.list.hidden]).toEqual([true, false]);
    // A slug with an apostrophe and an accent.
    expect(open("?commune=l-etang-sale").c.value).toBe("L'Étang-Salé");
  });

  it("writes another commune in the address, and none for « toutes », the other parameters kept", () => {
    const v = open("?commune=saint-paul&ref=x");
    v.choose("L'Étang-Salé");
    expect(v.location.search).toBe("?commune=l-etang-sale&ref=x");
    v.choose("");
    expect(v.location.search).toBe("?ref=x");
  });

  it("says a commune without a notice, and leaves the page as it is for a slug that is no commune's", () => {
    const v = open("?commune=cilaos");
    expect([v.zero.hidden, v.list.hidden, v.b.textContent]).toEqual([false, true, "Cilaos"]);
    expect(v.c.value).toBe("");
    const u = open("?commune=saint-pol");
    expect([u.zero.hidden, u.list.hidden, u.c.value, u.count.textContent]).toEqual([true, false, "", ""]);
    expect(u.items.every((i) => !i.hidden)).toBe(true);
  });

  it("is one page, its canonical without the parameter, the sentence of a commune without a notice in it", () => {
    const html = marchesPage(O, copie(LISTE), NOW);
    expect(html).toContain('<link rel="canonical" href="https://rundata.re/marches-publics">');
    expect(html).toContain("Aucun avis de marché ouvert pour <b></b> dans la dernière lecture du BOAMP, le 23/11 à 14:05. Les avis sont rangés selon le lieu des travaux, ou à défaut la commune de l'acheteur. <a href=\"/marches-publics\">Voir les avis de toute l'île →</a>");
    expect(html).not.toContain("HEURE_LUE");
  });
});

describe("a commune's page and its open notices (web/commune.ts)", () => {
  const page = (slug: string, l: Avis[] | null) => communePage(O, pageOf(slug)!, { place: null, commune: null, marches: l ? copie(l) : null }, NOW);

  it("counts the notices of the commune, its work's or its buyer's", () => {
    expect([ouvertsA(LISTE, "saint-paul"), ouvertsA(LISTE, "l-etang-sale"), ouvertsA(LISTE, "cilaos")]).toEqual([2, 1, 0]);
  });

  it("gives their number and the link to the list on the commune, and nothing without one", () => {
    const p = page("saint-paul", LISTE);
    expect(p).toContain("/marches-publics?commune=saint-paul");
    expect(p).toContain("2 avis");
    expect(p).toContain("ouverts aux réponses à Saint-Paul, d'après le BOAMP lu le 23/11 à 14:05");
    expect(page("l-etang-sale", LISTE)).toContain("ouvert aux réponses à L&#39;Étang-Salé, d'après le BOAMP");
    expect(page("cilaos", LISTE)).not.toContain("/marches-publics?commune=");
    expect(page("saint-paul", null)).not.toContain("/marches-publics?commune=");
  });

});
