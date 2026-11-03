import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as traces from "../src/providers/traces.js";
import { sentiersRandonnee } from "../src/tools/sentiers.js";
import * as canyons from "../src/vie/canyons.js";
import { cartePage } from "../src/web/carte.js";
import { canyonsCouche } from "../src/web/couches.js";

// The ONF's map of the trails on 24/10/2026, as test/sentiers.test.ts reads it.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/onf/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-24T04:00:00Z");
// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll(" ", " ");
const body = (r: { content: { text: string }[] }) => JSON.parse(flat(r.content[0].text));
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());
const byName = (nom: string) => canyons.CANYONS.find((c) => c.nom === nom)!;
const canyon = (lieu?: string) => sentiersRandonnee(cache(), lieu, NOW, undefined, false, true).then(body);

describe("the canyons of the Parc national (vie/canyons.ts)", () => {
  it("are the 214 of its inventory, each with its line, its length and the ONF trails it runs along", () => {
    expect(canyons.CANYONS).toHaveLength(214);
    expect(new Set(canyons.CANYONS.map((c) => c.id)).size).toBe(214);
    for (const c of canyons.CANYONS) {
      expect(canyons.points(c).length, c.nom).toBeGreaterThan(1);
      expect(c.km, c.nom).toBeGreaterThan(0);
      for (const nom of c.sentiers_onf) expect(traces.SENTIERS[nom], nom).toBeDefined();
    }
    expect(canyons.CANYONS.filter((c) => c.sentiers_onf.length)).toHaveLength(25);
    expect(canyons.SOURCE).toMatchObject({ organisme: "Parc national de La Réunion", licence: "Licence Ouverte (Etalab)", url: "https://data.regionreunion.com/explore/assets/bdcanyons-lareunion/" });
  });

  it("say a ban as the inventory gives it, never as a fact of today, and never a canyon allowed", () => {
    expect(canyons.CANYONS.filter((c) => c.interdit)).toHaveLength(29);
    expect(canyons.signalement(byName("La Rouille"))).toBe("Signalé interdit dans l'inventaire du Parc national (sans date) : arrêté préfectoral de 1997 (chutes de pierres sous la route d'Îlet à Cordes).");
    // Marked forbidden in its observations only, which are never published (data-run, 03/11).
    expect(byName("Bras des Étangs les Hauts").interdit).toBe("arrêté de protection de biotope");
    expect(canyons.signalement(byName("Pseudotak"))).toBe("Soumis à autorisation d'après l'inventaire.");
    expect(canyons.signalement(byName("Bras Rouge amont"))).toBeUndefined();
    const all = JSON.stringify(canyons.CANYONS) + JSON.stringify(canyons);
    // Its abbreviations said in full, never the adjective of its title, and a name after people said as its ravine.
    for (const word of ["APB", "DAF", "pratiqu", "Partie Interdite", "ouvert", "praticable"]) expect(all, word).not.toContain(word);
    for (const nom of ["Bras Sec (Salazie)", "Grande Ravine amont", "Grande Ravine aval", "Ravine Blanche amont (Saint-Denis)", "Ravine Blanche aval (Saint-Denis)", "Grand Bras Sec (Sainte-Marie)", "Grand Bras 1 (Saint-Denis)", "Grand Bras 2 (Saint-Denis)"]) expect(byName(nom), nom).toBeDefined();
    expect(byName("Trois Roches (partie signalée interdite)").interdit).toBe("arrêté préfectoral de 1997 (chutes de pierres)");
  });
});

describe("sentiers_randonnee for canyoning", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("/5/query") ? "sentiers.json" : url.includes("/4/query") ? "routes.json" : "couche.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says first an ONF trail closed along one, then the bans of the inventory, then the safety", async () => {
    const b = await canyon("Cilaos");
    const r: string = b.resume;
    expect(r.startsWith("ATTENTION : Benjoin aval longe 2 sentiers fermés par l'ONF : Sentier de la Plate Forme (Fermé cause éboulis de grande ampleur), Sentier de la Roche Pendue (Eboulements et arbres en travers). Un sentier fermé est interdit : ne pas s'y engager. ")).toBe(true);
    const at = (s: string) => r.indexOf(s);
    expect(at("Signalés interdits dans l'inventaire du Parc national (sans date) : Benjoin aval, arrêté préfectoral de 1997 (chutes de pierres) ;")).toBeGreaterThan(0);
    expect(at("L'inventaire ne dit pas si un canyon est autorisé : une interdiction a pu être levée, ou décidée depuis.")).toBeGreaterThan(at("Signalés interdits"));
    expect(at("Jamais de canyon par temps de pluie ou de vigilance : l'eau monte vite. Avant de partir : la vigilance (vigilance_meteo) et les rivières (crues_rivieres).")).toBeGreaterThan(at("L'inventaire ne dit pas"));
    expect(r.endsWith("Dans le cirque de Cilaos : 45 canyons recensés par le Parc national, inventaire sans date, dont 10 signalés interdits et 1 qui longe un sentier fermé par l'ONF.")).toBe(true);
    // Said once only.
    expect(r.split("L'inventaire ne dit pas").length).toBe(2);
    expect(b.canyons.canyons).toHaveLength(45);
    expect(b.canyons.canyons.find((c: { canyon: string }) => c.canyon === "Benjoin aval")).toMatchObject({ commune: "Cilaos", longueur_km: 5.1, signalement: "Signalé interdit dans l'inventaire du Parc national (sans date) : arrêté préfectoral de 1997 (chutes de pierres)." });
    expect(b.sources.map((s: { source: string }) => s.source)).toEqual(["Inventaire des canyons de La Réunion", "Sentiers et routes forestières ouverts ou fermés (ONF La Réunion)"]);
    expect(JSON.stringify(b)).not.toMatch(/praticable|pratiqu/);
  });

  it("gives over the island the count by commune, around a place the nearest, and a place it does not know", async () => {
    const salazie = await canyon("Salazie");
    expect(salazie.resume).toContain("Soumis à autorisation d'après l'inventaire : Pseudotak.");
    expect(salazie.resume.endsWith("Dans le cirque de Salazie : 17 canyons recensés par le Parc national, inventaire sans date, dont 4 signalés interdits.")).toBe(true);
    const all = await canyon();
    expect(all.canyons.nombre).toBe(214);
    expect(all.canyons.canyons).toBeUndefined();
    expect(all.canyons.par_commune.reduce((n: number, x: { canyons: number }) => n + x.canyons, 0)).toBe(214);
    expect(all.resume).toContain("29 canyons signalés interdits dans l'inventaire du Parc national (sans date) : chacun se dit avec un lieu.");
    const maido = await canyon("Maïdo");
    expect(maido.canyons.zone).toBe("À moins de 10 km de Maïdo");
    expect(maido.canyons.canyons[0].distance_km).toBeLessThanOrEqual(maido.canyons.canyons[1].distance_km);
    expect((await canyon("Zzyzx")).erreur).toBe("Lieu introuvable à La Réunion : « Zzyzx ».");
  });
});

describe("the canyons on /carte", () => {
  it("are a layer of lines, those the inventory bans in red, each leading to the first ONF trail it runs along", () => {
    const j = canyonsCouche(canyons.CANYONS, canyons.LU_LE);
    expect(j.objets).toHaveLength(214);
    expect(j.objets.filter((o) => o.infos?.alerte)).toHaveLength(29);
    expect(j.objets.find((o) => o.nom === "Benjoin aval")).toMatchObject({ commune: "Cilaos", lien: "/sentiers/sentier-de-la-plate-forme", infos: { type: "5,1 km", alerte: true } });
    expect(j.objets.find((o) => o.nom === "Bras Rouge amont")!.lien).toBeUndefined();
  });

  it("say in their panel the bans, the safety and the pages to read before going", () => {
    const html = flat(cartePage("https://rundata.re"));
    expect(html).toContain("En rouge : signalé interdit dans l'inventaire. L'inventaire ne dit pas si un canyon est autorisé : une interdiction a pu être levée, ou décidée depuis. Jamais de canyon par temps de pluie ou de vigilance : l'eau monte vite.");
    expect(html).toMatch(/data-c="canyons"[^]*?<a href="\/sentiers">[^<]*<\/a><a href="\/vigilance">La vigilance<\/a><a href="\/crues">Les rivières<\/a>/);
  });
});
