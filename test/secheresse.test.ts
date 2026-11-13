import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { parse } from "../src/providers/vigieau.js";
import { heuresDites } from "../src/tools/format.js";
import { INSEE } from "../src/places/insee.js";
import * as arrete from "../src/providers/arrete-secheresse.js";
import { enVigueur, restrictionsEau } from "../src/tools/secheresse.js";
import { buildSecheresse } from "../src/web/data.js";
import { secheresseLive, secheressePage, wholeName } from "../src/web/domains.js";
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
    // VigiEau still serves the order of 09/10/2026: the levels are those of the order of 12/11/2026 (providers/arrete-secheresse.ts).
    expect(b.resume).toBe("Sécheresse à La Réunion (arrêté n°2026-2094/SG/SCOPP/BCPE du 12/11/2026, en vigueur depuis le 12/11/2026). Eau du robinet : crise à Saint-Joseph\u00a0; alerte renforcée dans 9 communes\u00a0; alerte dans 13 communes\u00a0; vigilance à Sainte-Rose.");
    expect(b.communes[0]).toEqual({
      commune: "Saint-Joseph", eau_du_robinet: "crise", rivieres_et_sources: "crise", nappes: "crise",
      vigieau_differe: [{ commune: "Saint-Joseph", ressource: "rivières et sources", arrete: "crise", vigieau: "alerte renforcée" }],
    });
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
    expect(page).toContain('<span class="mls">Eau du robinet, d&#39;après l&#39;arrêté préfectoral n°2026-2094/SG/SCOPP/BCPE, en vigueur depuis le\u00a012/11/2026.</span>');
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
    expect(b.resume).toBe("Restrictions d'eau à Saint-Joseph : crise pour l'eau du robinet\u00a0; crise pour les nappes souterraines, crise pour les rivières et sources, d'après l'arrêté n°2026-2094/SG/SCOPP/BCPE du 12/11/2026, en vigueur depuis le 12/11/2026.");
    const usages = b.restrictions_eau_du_robinet.map((r: { usage: string }) => r.usage);
    expect(usages).toContain("Arrosage des pelouses");
    expect(usages).not.toContain("Arrosage des golfs");
    expect(b.restrictions_eau_du_robinet.find((r: { usage: string }) => r.usage === "Arrosage des jardins potagers").restriction).toBe("Interdiction entre 6 h et 20 h");
    expect(b.arrete).toMatchObject({ numero: "n°2026-2094/SG/SCOPP/BCPE", signe_le: "12/11/2026", en_vigueur_depuis: "12/11/2026", lien: "https://www.reunion.gouv.fr/contenu/telechargement/54342/411078/file/" });
  });

  it("gives a farmer's rules when asked", async () => {
    const b = body(await restrictionsEau(cache(), "Saint-Joseph", "exploitation"));
    // The withdrawals go by the level of the resource drawn from, not through the tap water (article 3).
    expect(b.restrictions_eau_du_robinet.map((r: { usage: string }) => r.usage)).not.toContain("Prélèvement d’eau pour l’irrigation par aspersion des cultures (hors périmètres irrigués)");
    expect(b.restrictions_puits_forages_rivieres["rivières et sources"]).toContainEqual({ usage: "Prélèvement d’eau pour l’irrigation par aspersion des cultures (hors périmètres irrigués)", restriction: "Interdiction" });
  });

describe("the order of 12/11/2026 while VigiEau serves the one it replaced", () => {
  const served = (edit: (z: Record<string, any>) => void = () => {}) => {
    const zones = JSON.parse(raw);
    for (const z of zones) edit(z);
    return JSON.stringify(zones);
  };
  const withVigieau = (json: string) => vi.stubGlobal("fetch", async () => new Response(json, { headers: { "content-type": "application/json" } }));
  afterEach(() => vi.unstubAllGlobals());

  it("gives Saint-Joseph, Saint-Leu and Saint-Denis the order's levels, VigiEau's beside them where they differ", async () => {
    withVigieau(raw);
    const sj = body(await restrictionsEau(cache(), "Saint-Joseph"));
    expect(sj.niveaux).toEqual({ eau_du_robinet: "crise", rivieres_et_sources: "crise", nappes: "crise" });
    expect(sj.vigieau_differe).toEqual([{ commune: "Saint-Joseph", ressource: "rivières et sources", arrete: "crise", vigieau: "alerte renforcée" }]);
    const sl = body(await restrictionsEau(cache(), "Saint-Leu"));
    expect(sl.niveaux).toEqual({ eau_du_robinet: "alerte", rivieres_et_sources: "alerte", nappes: "vigilance" });
    expect(sl.vigieau_differe).toEqual([
      { commune: "Saint-Leu", ressource: "eau du robinet", arrete: "alerte", vigieau: "vigilance" },
      { commune: "Saint-Leu", ressource: "rivières et sources", arrete: "alerte", vigieau: "vigilance" },
    ]);
    const sd = body(await restrictionsEau(cache(), "Saint-Denis"));
    expect(sd.niveaux).toEqual({ eau_du_robinet: "alerte renforcée", rivieres_et_sources: "alerte renforcée", nappes: "alerte" });
    expect(sd.vigieau_differe).toBeUndefined();
  });

  it("says, dated, that VigiEau still shows the order of 10/10, before the levels", async () => {
    withVigieau(raw);
    const b = body(await restrictionsEau(cache(), undefined));
    expect(b.vigieau).toMatch(/^VigiEau affiche encore l'arrêté précédent, en vigueur depuis le 10\/10\/2026 \(VigiEau lu le \d\d\/\d\d \d\d:\d\d\)\. Les niveaux donnés ici sont ceux de l'arrêté n°2026-2094\/SG\/SCOPP\/BCPE du 12\/11\/2026, en vigueur depuis le 12\/11\/2026, qui le remplace\.$/);
    // Before the levels, so that an assistant says it first.
    expect(Object.keys(b).slice(0, 3)).toEqual(["arrete", "vigieau", "resume"]);
    expect(Object.keys(body(await restrictionsEau(cache(), "Saint-Leu"))).slice(0, 4)).toEqual(["lieu", "arrete", "vigieau", "resume"]);
    expect(b.sources.map((s: { source: string }) => s.source)).toEqual([arrete.SOURCE.nom, "Restrictions d'eau en cas de sécheresse (VigiEau, arrêtés préfectoraux)"]);
    const page = secheressePage("https://rundata.re", { value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false });
    expect(page).toContain('<a href="https://www.reunion.gouv.fr/contenu/telechargement/54342/411078/file/">arrêté préfectoral n°2026-2094/SG/SCOPP/BCPE du 12/11/2026</a>, en vigueur depuis le 12/11/2026.');
    expect(page).toContain("VigiEau affiche encore l&#39;arrêté précédent, en vigueur depuis le 10/10/2026");
    expect(page).toContain("VigiEau\u00a0: vigilance</small>");
  });

  it("drops the sentence once VigiEau serves the order, by its date or its file's number, never a date written in the code", async () => {
    for (const edit of [
      (z: Record<string, any>) => z.arrete && (z.arrete.dateDebutValidite = "2026-11-13T00:00:00.000Z"),
      (z: Record<string, any>) => z.arrete && (z.arrete.cheminFichier = "https://regleau.s3.gra.perf.cloud.ovh.net/arrete-restriction/1/a/Arr%C3%AAt%C3%A9%20n%C2%B02026-2094.pdf"),
    ]) {
      withVigieau(served(edit));
      const b = body(await restrictionsEau(cache(), undefined));
      expect(b.vigieau).toBeUndefined();
      expect(b.arrete.numero).toBe("n°2026-2094/SG/SCOPP/BCPE");
      // The same order on VigiEau: a level it gives otherwise is still said.
      expect(b.communes.find((c: { commune: string }) => c.commune === "Saint-Joseph").vigieau_differe).toHaveLength(1);
    }
  });

  it("leaves the table for VigiEau once it serves a later order", async () => {
    withVigieau(served((z) => z.arrete && (z.arrete.dateDebutValidite = "2026-12-05T00:00:00.000Z")));
    const b = body(await restrictionsEau(cache(), "Saint-Leu"));
    expect(b.niveaux).toEqual({ eau_du_robinet: "vigilance", rivieres_et_sources: "vigilance", nappes: "vigilance" });
    expect(b.vigieau).toBeUndefined();
    expect(b.vigieau_differe).toBeUndefined();
    expect(b.arrete).toMatch(/^https:\/\/regleau\./);
  });

  it("puts Saint-Joseph in crisis first, with the annex's rules for that level, as written", async () => {
    withVigieau(raw);
    const d = await buildSecheresse(cache());
    expect(d.communes[0].commune).toBe("Saint-Joseph");
    const page = secheressePage("https://rundata.re", { value: d, fetchedAt: new Date(), stale: false });
    const crise = page.indexOf('<span class="lvl" style="--c:#862e9c;color:#fff">crise</span> <span class="note">Saint-Joseph</span>');
    expect(crise).toBeGreaterThan(-1);
    expect(crise).toBeLessThan(page.indexOf('<span class="note">Cilaos'));
    const sj = body(await restrictionsEau(cache(), "Saint-Joseph"));
    const rule = (u: string) => sj.restrictions_eau_du_robinet.find((r: { usage: string }) => r.usage === u)?.restriction;
    expect(rule("Remplissage et maintien du niveau d’eau des plans d’eau de loisirs et piscines privées")).toBe("Interdiction");
    expect(rule("Lavage des véhicules en station de lavage")).toBe("Interdiction");
    expect(rule("Arrosage des jardins potagers")).toBe("Interdiction entre 6 h et 20 h");
    expect(rule("Lavage des bâtiments, façades, toitures, trottoirs, voiries et autres surfaces imperméabilisées (dont les cours)")).toBe("Interdiction\u00a0; Sauf si réalisé par une collectivité ou une entreprise de nettoyage professionnel avec impératif sanitaire ou sécuritaire");
    // Never a word of the press release of 13/11: no « renforcé » nor « allégé » said of a commune.
    expect(page).not.toMatch(/restrictions? (?:d’eau |d'eau )?(?:vont être )?(?:renforcées|allégées)|Annonce de la préfecture/);
  });

  it("writes the 24 communes of article 3, the tap water at the higher of its two levels", () => {
    expect(Object.keys(arrete.ARRETE.niveaux).sort()).toEqual(Object.values(INSEE).sort());
    expect(arrete.ANNEXE).toHaveLength(20);
    expect(arrete.usages("crise", true)).toHaveLength(14);
    expect(arrete.usages("crise", false)).toHaveLength(20);
    const zones = enVigueur([]).zones;
    expect(zones.filter((z) => z.ressource === "AEP" && z.niveau === "alerte_renforcee").map((z) => z.insee).sort()).toEqual(["97403", "97407", "97408", "97409", "97410", "97411", "97421", "97422", "97424"]);
  });
});

describe("the drought tile of the home page", () => {
  const tile = (levels: [string, string | null][]) =>
    secheresseLive({ value: { communes: levels.map(([commune, eau_du_robinet]) => ({ commune, eau_du_robinet })) } as any, fetchedAt: new Date(), stale: false })!;

  it("says the worst level and where it applies: one commune, several, a name in « Le » or « Les »", async () => {
    expect(tile([["Saint-Joseph", "crise"], ["Saint-Pierre", "alerte renforcée"], ["Cilaos", "alerte"]])).toEqual({ valeur: `crise ${wholeName("à Saint-Joseph")}`, detail: "3 communes sur 24 en alerte ou plus pour l'eau du robinet" });
    expect(tile([["Saint-Joseph", "crise"], ["Saint-Philippe", "crise"], ["Cilaos", "vigilance"]]).valeur).toBe("crise dans 2 communes");
    expect(tile([["Le Tampon", "alerte renforcée"], ["Cilaos", "alerte"]]).valeur).toBe("alerte renforcée au Tampon");
    expect(tile([["Les Avirons", "alerte"], ["Cilaos", "vigilance"]]).valeur).toBe("alerte aux Avirons");
    expect(tile([["Le Port", "crise"]]).valeur).toBe("crise au Port");
    // From the copy of the decree: Saint-Joseph alone in crisis.
    expect(secheresseLive({ value: await buildSecheresse(cache()), fetchedAt: new Date(), stale: false })!.valeur).toBe(`crise à <span class="nm">Saint-Joseph</span>`);
  });

  it("keeps its words when no commune is above vigilance, or there is no restriction", () => {
    expect(tile([["Cilaos", "vigilance"], ["Saint-Leu", "vigilance"]]).valeur).toBe("jusqu'à vigilance");
    expect(tile([["Cilaos", null]]).valeur).toBe("vigilance");
    expect(tile([])).toEqual({ valeur: "aucune restriction", detail: "d'après VigiEau" });
  });
});
});
