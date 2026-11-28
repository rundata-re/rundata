import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { MAX_BYTES } from "../src/bin/check-sources.js";
import * as candhis from "../src/providers/candhis.js";
import { coastwatch, parseAscii } from "./sst.js";
import { BOUEE_MAX_KM, COVERAGE, coverage, SATELLITES, TOUR, temperatureMer } from "../src/tools/mer.js";
import { buildSea } from "../src/web/data.js";
import { seaPage } from "../src/web/mer-page.js";

// The sea of test/mer-taille.test.ts (waves of Open-Meteo, ACSPO's grid, corals), and what the scheduled event keeps of
// the Candhis buoys: 97410 Saint-Pierre (large) as getCampListeTR gave it on 23/11/2026 at 05:20 UTC, moved to 40
// minutes before NOW; 97409 Sainte-Marie with the place getCampInfos would give it, the point made up.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const NOW = new Date("2026-10-22T06:00:00Z");
const KEY = "00000000-1111-2222-3333-444444444444";
const AT = NOW.getTime() - 40 * 60_000;
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

const mesure = (code: string, t = AT): candhis.Mesure => ({
  code, t, hauteur: 1.1, hauteur_selon: "H1/3", hmax: 1.9, periode: 7.1, periode_selon: "TH1/3", periode_pic: null, direction: 179, etalement: 29, temperature: 26.8,
});
const KEPT: candhis.Etat = { essai: AT, lu: AT, mesures: { "97410": mesure("97410") }, types: { lu: AT, actives: { "97410": 2 } } };

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    fetched.push(u);
    if (u.includes("marine-api.open-meteo")) return new Response(fixture(u.includes("meteofrance_wave") ? "openmeteo_houle_mf.json" : "openmeteo_houle.json"));
    if (u.includes("dhw_5km")) return new Response(fixture("coraux_dhw_5km_7j.csv"));
    const pub = coastwatch(u, init);
    if (pub) return pub;
    return new Response("", { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  candhis.configure(undefined);
});

async function withSea() {
  const store = new MemoryStore();
  await store.put(SATELLITES, { value: [{ source: "acspo", jours: [parseAscii(String(fixture("acspo.ascii")), "2026-10-21")], lu: NOW.getTime() }], fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime());
}

describe("the waves measured by the Candhis buoys", () => {
  it("are not said anywhere without the key: the answers, the coverage and /mer as before, and the API never asked", async () => {
    // KV holds a state, but the Worker has no key: configure(undefined) leaves the reader unused.
    candhis.configure(undefined, async () => KEPT);
    const cache = await withSea();
    for (const lieu of [undefined, "Plage de Saint-Pierre"]) {
      const b = body(await temperatureMer(cache, lieu, NOW));
      expect(b.houle_mesuree, lieu).toBeUndefined();
      expect(b.resume, lieu).not.toContain("MESURÉE à la bouée");
      expect(b.couverture, lieu).toBe(COVERAGE);
      expect(JSON.stringify(b.sources), lieu).not.toContain("Candhis");
    }
    expect(coverage()).toBe(COVERAGE);
    expect(COVERAGE).toContain("Aucune bouée de l'île ne publie de mesure de houle en ce moment");
    const sea = await buildSea(cache, NOW);
    expect(sea.bouees).toBeUndefined();
    const page = seaPage("https://rundata.re", { value: sea, fetchedAt: NOW }, NOW);
    expect(page).not.toContain("h-houle-mesuree");
    expect(page).toContain("La houle prévue près de chaque plage");
    expect(fetched.some((u) => u.includes("candhis"))).toBe(false);
  });

  it("are said with their buoy, their hour in La Réunion and, near a place, their distance; as a measurement, beside the forecast", async () => {
    candhis.configure(KEY, async () => KEPT);
    const cache = await withSea();
    const ile = body(await temperatureMer(cache, undefined, NOW));
    expect(ile.houle_mesuree).toEqual([{
      nature: "mesure", bouee: "Saint-Pierre (large)", reseau: "Candhis (Cerema)", mesuree_a: "22/10 09:20",
      hauteur_significative: "1,1 m", hauteur_selon: "H1/3", vague_max: "1,9 m", periode: "7 s", periode_selon: "TH1/3",
      venant: "du sud", direction_deg: 179, temperature_eau: "26,8 °C",
    }]);
    expect(ile.resume).toContain("Houle MESURÉE à la bouée Saint-Pierre (large) du Cerema, le 22/10 à 09:20 : 1,1 m du sud, période 7 s, vagues jusqu'à 1,9 m.");
    expect(ile.resume).toMatch(/Vagues PRÉVUES maintenant \(.*pas une mesure\)/);
    expect(ile.couverture).toBe(coverage());
    expect(ile.couverture).toContain("Houle MESURÉE : les bouées du réseau Candhis du Cerema qui publient");
    expect(ile.couverture).toContain("(au large de Sainte-Marie et de Saint-Pierre depuis novembre 2026)");
    expect(ile.sources.map((s: { source: string }) => s.source)).toContain(candhis.SOURCE.nom);
    // The beach of Saint-Pierre: the buoy at 2,6 km, in its résumé after the water and before the forecast.
    const sp = body(await temperatureMer(cache, "Plage de Saint-Pierre", NOW));
    expect(sp.houle_mesuree).toMatchObject({ bouee: "Saint-Pierre (large)", distance_km: expect.any(Number), mesuree_a: "22/10 09:20" });
    expect(sp.houle_mesuree.distance_km).toBeLessThan(5);
    expect(sp.resume).toMatch(/mesurée par satellite.*Houle MESURÉE à la bouée Saint-Pierre \(large\) du Cerema, à [\d,]+ km, le 22\/10 à 09:20.*Vagues PRÉVUES/);
    expect(sp.sources.map((s: { source: string }) => s.source)).toContain(candhis.SOURCE.nom);
    // Saint-Gilles, about 40 km away: not its sea.
    const sg = body(await temperatureMer(cache, "Saint-Gilles", NOW));
    expect(sg.houle_mesuree).toBeUndefined();
    expect(JSON.stringify(sg.sources)).not.toContain("Candhis");
    expect(BOUEE_MAX_KM).toBe(25);
    // No request to the API from an answer: only what the scheduled event keeps.
    expect(fetched.some((u) => u.includes("candhis"))).toBe(false);
  });

  it("keep the answers under the ceiling of the daily check of the sources", async () => {
    candhis.configure(KEY, async () => KEPT);
    const cache = await withSea();
    const max = MAX_BYTES["temperature_mer (Saint-Gilles)"] - 1_500;
    for (const lieu of ["Saint-Gilles", ...TOUR]) {
      const bytes = new TextEncoder().encode((await temperatureMer(cache, lieu, NOW)).content[0].text).length;
      expect(bytes, lieu).toBeLessThanOrEqual(max);
    }
  });

  it("leave out a measurement past 6 hours and a buoy with no place, and take Sainte-Marie's place once it is read", async () => {
    // Sainte-Marie's place is in the list since 28/11/2026: taken out here, as for a buoy that starts measuring.
    const sm = candhis.BOUEES.find((b) => b.code === "97409")!;
    const { lat, lon } = sm;
    delete sm.lat;
    delete sm.lon;
    onTestFinished(() => Object.assign(sm, { lat, lon }));
    const old = { ...KEPT, mesures: { "97410": mesure("97410", NOW.getTime() - 6 * 3600_000 - 60_000), "97409": mesure("97409") } };
    expect(candhis.releves(old, NOW)).toEqual([]);
    const placed = { ...old, positions: { "97409": { lat: -20.85, lon: 55.56 } } };
    expect(candhis.releves(placed, NOW).map((r) => [r.code, r.nom, r.lat, r.lon])).toEqual([["97409", "Sainte-Marie", -20.85, 55.56]]);
    candhis.configure(KEY, async () => placed);
    const ile = body(await temperatureMer(await withSea(), undefined, NOW));
    expect(ile.houle_mesuree.map((b: { bouee: string }) => b.bouee)).toEqual(["Sainte-Marie"]);
  });

  it("end the curves on the measurement said at the top, though the series was completed before it", async () => {
    candhis.configure(KEY, async () => KEPT);
    // The series as the scheduled event last kept it: up to the measurement before, 30 minutes earlier.
    const before: candhis.Point = [AT - 30 * 60_000, 1.3, 2.2, 7, 180, 26.7];
    candhis.configureSerie(async () => ({ essai: AT, bouees: { "97410": { hauteur_selon: "H1/3", periode_selon: "TH1/3", points: [before] } } }));
    onTestFinished(() => candhis.configureSerie(undefined));
    const sea = await buildSea(await withSea(), NOW);
    const b = sea.courbes!.bouees[0];
    expect(b.chiffres.hauteur).toMatchObject({ derniere: 1.1, le: AT });
    expect(b.chiffres.temperature).toMatchObject({ derniere: 26.8, le: AT });
    expect(sea.bouees![0]).toMatchObject({ t: AT });
  });

  it("show at the top of /mer while recent at the view, the time first, the buoy named, with their source, before the satellite", async () => {
    candhis.configure(KEY, async () => KEPT);
    const sea = await buildSea(await withSea(), NOW);
    expect(sea.bouees).toMatchObject([{ bouee: "Saint-Pierre (large)", t: AT, mesuree_a: "22/10 09:20" }]);
    expect(sea.sources.map((s) => s.source)).toContain(candhis.SOURCE.nom);
    const copy = { value: sea, fetchedAt: NOW };
    const page = seaPage("https://rundata.re", copy, NOW);
    const band = page.slice(page.indexOf("<h1>"), page.indexOf('class="wrap intro solo"') > 0 ? page.indexOf("</div>\n</div>", page.indexOf("<h1>")) : undefined);
    expect(page).toContain('<p class="pill">Dernière mesure des bouées · 22/10 à 09:20</p>');
    expect(band).toContain("<b>Mesurée le 22/10 à 09:20</b> à la bouée de Saint-Pierre (large)\u00a0: houle de <b>1,1\u202fm</b>");
    expect(band).toMatch(/Source\u00a0: Cerema \/ Candhis \(Licence Ouverte Etalab 2\.0\), relevée toutes les 30 minutes\./);
    // The buoy before the satellite, and the old block of the measured swell gone: one subject, one block.
    if (band.includes("vue par satellite")) expect(band.indexOf("à la bouée de")).toBeLessThan(band.indexOf("vue par satellite"));
    expect(page).not.toContain("h-houle-mesuree");
    // The same copy viewed 6 hours later: the measurement is no longer the sea of now.
    const later = seaPage("https://rundata.re", copy, new Date(AT + 6 * 3600_000 + 60_000));
    expect(later).not.toContain("Mesurée le 22/10 à 09:20");
    expect(later).not.toContain("Mesure des bouées ·");
  });
});
