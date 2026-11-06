import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { parse } from "../src/providers/vigieau.js";
import { heuresDites } from "../src/tools/format.js";
import { restrictionsEau } from "../src/tools/secheresse.js";
import { buildSecheresse } from "../src/web/data.js";
import { nobreak, secheresseLive, secheressePage } from "../src/web/domains.js";
import { deadAnchors, doubleIds, mapLinks, tabStops } from "./cartes.js";

// VigiEau on 24/10/2026: the drought order of 10/10/2026, Saint-Joseph in crisis.
const raw = readFileSync(new URL("./fixtures/vigieau/zones_974.json", import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore());

describe("restrictions d'eau", () => {
  beforeEach(() => vi.stubGlobal("fetch", async () => new Response(raw, { headers: { "content-type": "application/json" } })));
  afterEach(() => vi.unstubAllGlobals());

  it("reads three zones per commune, by its INSEE code", () => {
    const zones = parse(JSON.parse(raw));
    expect(zones).toHaveLength(72);
    expect(zones.find((z) => z.insee === "97412" && z.ressource === "AEP")).toMatchObject({ niveau: "crise", depuis: "2026-10-10" });
    expect(zones.every((z) => z.usages.every((u) => !/[​-‍]/.test(u.nom)))).toBe(true);
  });

  it("sums up the island", async () => {
    const b = body(await restrictionsEau(cache(), undefined));
    expect(b.resume).toBe("Sécheresse à La Réunion (arrêté en vigueur depuis le 10/10/2026). Eau du robinet : crise à Saint-Joseph\u00a0; alerte renforcée dans 5 communes\u00a0; alerte dans 14 communes\u00a0; vigilance aux Trois-Bassins, à Saint-Leu, à Saint-Louis et à Sainte-Rose.");
    expect(b.communes[0]).toEqual({ commune: "Saint-Joseph", eau_du_robinet: "crise", rivieres_et_sources: "alerte renforcée", nappes: "crise" });
    expect(b.communes).toHaveLength(24);
  });

  it("leads from each commune of the map to its row of the table", async () => {
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    expect(mapLinks(page)).toHaveLength(24);
    expect(tabStops(page)).toBe(0);
    expect(mapLinks(page).find((l) => l.href === "#c-saint-joseph")?.label).toBe("Saint-Joseph : eau du robinet\u00a0: crise, voir le détail");
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
  });

  it("writes VigiEau's hours as the kit does: « de 18 h à 8 h », never « de 18h à 8h »", async () => {
    expect(raw).toContain("arrosés de 18h à 8h");
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    expect(page).toMatch(/arrosés de 18\u00a0h à\s8\u00a0h</);
    expect((page.match(/<small>[^<]*<\/small>/g) ?? []).filter((x) => /\dh\b|\dh\d/.test(x))).toEqual([]);
    expect(heuresDites("entre 7h30 et 19h00, 24h/24, 8 heures")).toBe("entre 07:30 et 19\u00a0h, 24h/24, 8 heures");
  });

  it("keeps the word after an hour: « entre 6 h et 20 h », never « 6 het 20 h »", async () => {
    expect(heuresDites("Interdiction entre 6h et 20h")).toBe("Interdiction entre 6\u00a0h et 20\u00a0h");
    expect(heuresDites("Interdiction entre 6 h et 20 h")).toBe("Interdiction entre 6\u00a0h et 20\u00a0h");
    expect(heuresDites("à partir de 6h30")).toBe("à partir de 06:30");
    expect(heuresDites("avant 20 h")).toBe("avant 20\u00a0h");
    expect(heuresDites("de 8h-12h")).toBe("de 8\u00a0h-12\u00a0h");
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    expect(page).toMatch(/Arrosage des jardins potagers<small>Interdiction entre 6\u00a0h et 20\u00a0h<\/small>/);
    expect(page).not.toMatch(/\d\u00a0h(?:et|à|de)\b/);
  });

  it("says the scale in lines above the table, each level with its pill, the order's date left to the map's legend; the tool's scale unchanged", async () => {
    const b = body(await restrictionsEau(cache(), undefined));
    expect(b.echelle).toBe("Du moins au plus sévère : vigilance (économiser l'eau), alerte, alerte renforcée, crise (seuls les usages prioritaires : santé, salubrité, sécurité).");
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    const head = page.slice(page.indexOf('id="h-communes-eau"'), page.indexOf("<table"));
    expect(head).toContain('<ul class="plain"><li><span class="lvl" style="--c:#ffd43b">vigilance</span> économiser l&#39;eau</li><li><span class="lvl" style="--c:#ff922b">alerte</span></li><li><span class="lvl" style="--c:#f03e3e;color:#000">alerte renforcée</span></li><li><span class="lvl" style="--c:#862e9c;color:#fff">crise</span> seuls les usages prioritaires : santé, salubrité, sécurité</li></ul>');
    expect(head).not.toContain("D'après l'arrêté");
    // The count per level stays in the hero, the map, the table and « Ce qui est interdit », not in a sentence here.
    expect(head).not.toContain("Du moins au plus sévère");
    expect(head).not.toContain("alerte dans 14 communes");
  });

  it("draws its legend as the charter of the maps wants: each colour as a square then its word, never a coloured word, then the order's date", async () => {
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    expect(page).toContain('<span><svg viewBox="-37 -37 74 74" aria-hidden="true"><rect x="-30" y="-30" width="60" height="60" rx="8" style="fill:#862e9c"/></svg>crise</span>');
    expect(page).toContain('<span class="mls">Eau du robinet, d&#39;après l&#39;arrêté préfectoral en vigueur depuis le\u00a010/10/2026.</span>');
    expect(page).not.toContain('<span style="color:');
  });

  it("writes each level's pill in a text readable on its official colour, at least 4.5:1, the colour unchanged", async () => {
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    // White on the purple of « crise » (7.28:1), black on the red of « alerte renforcée » (5.46:1); the sheet's dark ink elsewhere.
    expect(page).toContain('<span class="lvl" style="--c:#862e9c;color:#fff">crise</span>');
    expect(page).toContain('<span class="lvl" style="--c:#f03e3e;color:#000">alerte renforcée</span>');
    expect(page).toContain('<span class="lvl" style="--c:#ff922b">alerte</span>');
  });

  it("says what a private person may not do in a commune", async () => {
    const b = body(await restrictionsEau(cache(), "Saint-Joseph"));
    expect(b.resume).toBe("Restrictions d'eau à Saint-Joseph : crise pour l'eau du robinet\u00a0; crise pour les nappes souterraines, alerte renforcée pour les rivières et sources.");
    const usages = b.restrictions_eau_du_robinet.map((r: { usage: string }) => r.usage);
    expect(usages).toContain("Arrosage des pelouses");
    expect(usages).not.toContain("Arrosage des golfs");
    expect(b.restrictions_eau_du_robinet.find((r: { usage: string }) => r.usage === "Arrosage des jardins potagers").restriction).toBe("Interdiction entre 6 h et 20 h");
    expect(b.arrete).toMatch(/^https:\/\/regleau\..*\.pdf$/);
  });

  it("gives a farmer's rules when asked", async () => {
    const b = body(await restrictionsEau(cache(), "Saint-Joseph", "exploitation"));
    expect(b.restrictions_eau_du_robinet.map((r: { usage: string }) => r.usage)).toContain("Prélèvement d’eau pour l’irrigation par aspersion des cultures (hors périmètres irrigués)");
  });

describe("the drought tile of the home page", () => {
  const tile = (levels: [string, string | null][]) =>
    secheresseLive({ value: { communes: levels.map(([commune, eau_du_robinet]) => ({ commune, eau_du_robinet })) } as any, fetchedAt: new Date(), stale: false })!;

  it("says the worst level and where it applies: one commune, several, a name in « Le » or « Les »", async () => {
    expect(tile([["Saint-Joseph", "crise"], ["Saint-Pierre", "alerte renforcée"], ["Cilaos", "alerte"]])).toEqual({ valeur: `crise ${nobreak("à Saint-Joseph")}`, detail: "3 communes sur 24 en alerte ou plus pour l'eau du robinet" });
    expect(tile([["Saint-Joseph", "crise"], ["Saint-Philippe", "crise"], ["Cilaos", "vigilance"]]).valeur).toBe("crise dans 2 communes");
    expect(tile([["Le Tampon", "alerte renforcée"], ["Cilaos", "alerte"]]).valeur).toBe("alerte renforcée au Tampon");
    expect(tile([["Les Avirons", "alerte"], ["Cilaos", "vigilance"]]).valeur).toBe("alerte aux Avirons");
    expect(tile([["Le Port", "crise"]]).valeur).toBe("crise au Port");
    // From the copy of the decree: Saint-Joseph alone in crisis.
    expect(secheresseLive({ value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false })!.valeur).toBe(`crise à <span style="white-space:nowrap">Saint-Joseph</span>`);
  });

  it("keeps its words when no commune is above vigilance, or there is no restriction", () => {
    expect(tile([["Cilaos", "vigilance"], ["Saint-Leu", "vigilance"]]).valeur).toBe("jusqu'à vigilance");
    expect(tile([["Cilaos", null]]).valeur).toBe("vigilance");
    expect(tile([])).toEqual({ valeur: "aucune restriction", detail: "d'après VigiEau" });
  });
});
});
