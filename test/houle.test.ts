import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_BUDGET, count, counted, left } from "../src/budget.js";
import { Cache, MemoryStore, TieredStore, type CacheEntry } from "../src/cache.js";
import { coastwatch, parseAscii } from "./sst.js";
import * as houle from "../src/providers/houle.js";
import * as uv from "../src/providers/uv.js";
import { SATELLITES, temperatureMer } from "../src/tools/mer.js";
import { previsionMeteo } from "../src/tools/prevision.js";

// Recorded from Open-Meteo for 22 to 25/10/2026: the ECMWF wave model at the beaches of the page /mer, and the CAMS
// UV index over the island's six cells. Météo-France's MFWAM at the same beaches, recorded on 08/11/2026 for 08 to
// 11/11, its times moved to 22 to 25/10 to go with the ECMWF's.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const json = (f: string) => JSON.parse(String(fixture(f)));
const NOW = new Date("2026-10-22T06:00:00Z"); // Thursday, 10:00 in Réunion
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

function overLimit() {
  if (left() < 0) throw new Error("Too many subrequests by single Worker invocation");
}

/** The data center's cache: each read or write is a subrequest, noted by key. */
class EdgeLike extends MemoryStore {
  ops: string[] = [];
  async get(key: string) {
    count();
    overLimit();
    this.ops.push(key);
    return super.get(key);
  }
  async put(key: string, entry: CacheEntry) {
    count();
    overLimit();
    this.ops.push(key);
    return super.put(key, entry);
  }
}

const isolate = (edge = new EdgeLike()) => new Cache(new TieredStore(new MemoryStore(), edge), () => NOW.getTime(), false);

/** An isolate whose data center holds the satellites' grids the scheduled event shared: temperature_mer reads them there. */
async function withSea() {
  const edge = new EdgeLike();
  const satellites = [{ source: "acspo", jours: [parseAscii(String(fixture("acspo.ascii")), "2026-10-21")], lu: NOW.getTime() }];
  await edge.put(SATELLITES, { value: satellites, fetchedAt: NOW.getTime() });
  return isolate(edge);
}

let fetched: string[];
let down: RegExp | null;

function upstream(url: string, init?: RequestInit): Response {
  if (down?.test(url)) throw new Error("source down");
  if (url.includes("marine-api.open-meteo")) return new Response(fixture(url.includes("meteofrance_wave") ? "openmeteo_houle_mf.json" : "openmeteo_houle.json"));
  if (url.includes("air-quality-api.open-meteo")) return new Response(fixture("cams_uv.json"));
  const pub = coastwatch(url, init);
  if (pub) return pub;
  if (url.includes("erdMH1sstd1day")) return new Response(fixture("modis.csv"));
  if (url.includes("open-meteo.com/data")) return new Response(fixture("openmeteo_meta.json"));
  if (url.includes("open-meteo")) return new Response(fixture("openmeteo_cilaos.json"));
  throw new Error(`unexpected ${url}`);
}

beforeEach(() => {
  fetched = [];
  down = null;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    overLimit();
    fetched.push(String(url));
    return upstream(String(url), init);
  });
});

afterEach(() => vi.unstubAllGlobals());

const marine = () => fetched.filter((u) => u.includes("marine-api")).length;
const cams = () => fetched.filter((u) => u.includes("air-quality-api")).length;

describe("houle.parse", () => {
  it("keeps one step every 3 hours from local midnight, for every point of the coast", () => {
    const w = houle.parse(json("openmeteo_houle.json"));
    expect(w.points).toHaveLength(14);
    expect(new Date(w.debut).toISOString()).toBe("2026-10-21T20:00:00.000Z"); // 22/10 0h in Réunion
    expect(w.points[0].hauteur).toHaveLength(32);
    expect(houle.stepTime(w, 1).toISOString()).toBe("2026-10-21T23:00:00.000Z");
    for (const p of w.points) expect(p.hauteur.every((h) => h != null && h > 0 && h < 10)).toBe(true);
  });

  it("reads MFWAM's mean period and its main swell, WAM's peak period and no swell", () => {
    const mf = houle.parse(json("openmeteo_houle_mf.json"), "mfwam");
    const leu = mf.points[8]; // Saint-Leu
    expect(leu.modele).toBe("mfwam");
    expect([leu.hauteur[0], leu.periode[0], leu.houle![0]]).toEqual([1.3, 10, 1]); // 1,28 m, 10,1 s, 1,04 m at 0 h
    expect(leu.periode.every((t) => t != null)).toBe(true);
    const wam = houle.parse(json("openmeteo_houle.json"));
    expect(wam.points[8].modele).toBe("wam");
    expect(wam.points[8].houle).toBeUndefined();
    expect(wam.debut).toBe(mf.debut);
  });
});

describe("the waves in temperature_mer", () => {
  it("answer « la houle à Saint-Leu ? » with a forecast labelled as such, apart from the measured temperature", async () => {
    const r = body(await temperatureMer(await withSea(), "Saint-Leu", NOW));
    expect(r.resume).toContain("Vagues PRÉVUES près de Saint-Leu (modèle MFWAM de Météo-France, pas une mesure) : " +
      "1,2 m du sud, dont 1 m de houle principale, période moyenne 10 s vers 9\u00a0h\u00a0; jusqu'à 1,8 m dimanche 25/10.");
    const s = r.etat_de_la_mer;
    expect(s.nature).toBe("prevision");
    expect(s.modele).toEqual({ nom: "MFWAM de Météo-France", maille_km: 9, mise_a_jour: "toutes les 12 h" });
    expect(s.point_du_modele.distance_km).toBeLessThan(6);
    expect(s.maintenant).toEqual({ heures: "jeudi 22/10 9\u00a0h", hauteur: "1,2 m", houle_principale: "1 m", periode_moyenne: "10 s", venant: "du sud" });
    expect(s.jours[0]).toMatchObject({ houle_principale: expect.stringMatching(/ m$/), periode_moyenne: expect.stringMatching(/ s$/) });
    expect(s.jours[0].periode).toBeUndefined();
    expect(s.jours.map((d: { jour: string }) => d.jour)).toEqual(["jeudi 22/10", "vendredi 23/10", "samedi 24/10", "dimanche 25/10"]);
    expect(s.pas_de_3h).toHaveLength(8);
    expect(s.avertissements.join(" ")).toMatch(/PRÉVISION d'un modèle numérique de vagues, pas une mesure.*lagon/);
    expect(s.avertissements.join(" ")).toMatch(/vigilance vagues-submersion/);
    // Never mixed: the measurement stays the satellite's, the forecast has no temperature.
    expect(r.mesure.nature).toBe("mesure_satellite");
    expect(JSON.stringify(s)).not.toMatch(/temperature/);
    expect(r.sources.map((x: { source: string }) => x.source)).toContain(houle.SOURCE_MF.nom);
    expect(r.sources.map((x: { source: string }) => x.source)).not.toContain(houle.SOURCE.nom);
  });

  it("come from WAM where MFWAM has no cell near the coast, with WAM's peak period and no swell apart", async () => {
    const r = body(await temperatureMer(await withSea(), "Saint-Denis", NOW));
    expect(r.resume).toMatch(/Vagues PRÉVUES près de Saint-Denis \(modèle WAM du Centre européen \(ECMWF\), pas une mesure\) : \d+(,\d)? m (du |de l')[a-z-]+, période \d+ s vers 9\u00a0h/);
    expect(r.resume).not.toMatch(/houle principale|période moyenne/);
    const s = r.etat_de_la_mer;
    expect(s.modele.nom).toBe("WAM du Centre européen (ECMWF)");
    expect(s.point_du_modele.distance_km).toBeLessThan(10);
    expect(s.maintenant).toMatchObject({ periode: expect.stringMatching(/ s$/) });
    expect(s.maintenant.houle_principale).toBeUndefined();
    expect(r.sources.map((x: { source: string }) => x.source)).toContain(houle.SOURCE.nom);
    expect(r.sources.map((x: { source: string }) => x.source)).not.toContain(houle.SOURCE_MF.nom);
  });

  it("come from the other model when one is down, and from none away from its cells", async () => {
    down = /meteofrance_wave/;
    const r = body(await temperatureMer(await withSea(), "Saint-Leu", NOW));
    expect(r.resume).toMatch(/près de Saint-Leu \(modèle WAM du Centre européen \(ECMWF\), pas une mesure\) : \d+(,\d)? m [^,]+, période \d+ s/);
    down = /ecmwf_wam/;
    const c = await withSea();
    expect(body(await temperatureMer(c, "Saint-Leu", NOW)).etat_de_la_mer.modele.nom).toBe("MFWAM de Météo-France");
    // MFWAM's nearest cell is 16 km off Saint-Denis: no waves rather than another stretch of coast's.
    expect(body(await temperatureMer(c, "Saint-Denis", NOW)).resume).toMatch(/Pas de prévision de vagues à moins de 15 km de Saint-Denis/);
  });

  it("read a copy written before MFWAM came as WAM's", async () => {
    const old = houle.parse(json("openmeteo_houle.json"));
    for (const p of old.points) delete p.modele;
    const edge = new EdgeLike();
    await edge.put("houle:plages", { value: old, fetchedAt: NOW.getTime() });
    const r = body(await temperatureMer(isolate(edge), "Saint-Leu", NOW));
    expect(marine()).toBe(0);
    expect(r.etat_de_la_mer.modele.nom).toBe("WAM du Centre européen (ECMWF)");
  });

  it("are left out away from the coast, and said so", async () => {
    const r = body(await temperatureMer(isolate(), "Cilaos", NOW));
    expect(r.etat_de_la_mer).toBeUndefined();
    expect(r.resume).toMatch(/Pas de prévision de vagues à moins de 15 km de Cilaos/);
    expect(r.sources.map((x: { source: string }) => x.source)).not.toContain(houle.SOURCE.nom);
    expect(r.sources.map((x: { source: string }) => x.source)).not.toContain(houle.SOURCE_MF.nom);
  });

  it("still answer without the satellites' copy", async () => {
    const r = await temperatureMer(isolate(), "Saint-Leu", NOW);
    expect(r.isError).toBeUndefined();
    const b = body(r);
    expect(b.resume).toMatch(/^Température de l'eau : les sources satellite ne répondent pas/);
    expect(b.etat_de_la_mer.nature).toBe("prevision");
    expect(b.mesure).toBeUndefined();
  });

  it("go with each point of the tour of the island", async () => {
    const r = body(await temperatureMer(await withSea(), undefined, NOW));
    expect(r.points.every((p: { vagues_prevision?: string }) => /^\d+(,\d)? m /.test(p.vagues_prevision ?? ""))).toBe(true);
    expect(r.resume).toMatch(/Eau de mer, MESURÉE par satellite\u00a0: .* Vagues PRÉVUES maintenant \(modèles MFWAM de Météo-France et WAM du Centre européen \(ECMWF\), pas une mesure\) : Plage de Boucan-Canot \d/);
    expect(r.resume).toMatch(/Saint-Leu \d+(,\d)? m [^;]*houle principale[^;]*; .*Saint-Denis \d+(,\d)? m [^,;]+, période \d+ s/);
    expect(r.points.map((p: { vagues_modele?: string }) => p.vagues_modele)).toEqual([...Array(4).fill("MFWAM de Météo-France"), ...Array(2).fill("WAM du Centre européen (ECMWF)")]);
    expect(r.sources.map((x: { source: string }) => x.source)).toEqual(expect.arrayContaining([houle.SOURCE_MF.nom, houle.SOURCE.nom]));
  });

  it("cost one request per model for the whole coast cold, four subrequests with the cache, then one, then none", async () => {
    const edge = new EdgeLike();
    const cache = isolate(edge);
    const cold = await counted(PAGE_BUDGET, async () => {
      await temperatureMer(cache, "Saint-Leu", NOW);
      await temperatureMer(cache, "Saint-Denis", NOW);
      await temperatureMer(cache, undefined, NOW);
    });
    expect(cold.used).toBeLessThanOrEqual(PAGE_BUDGET);
    expect(marine()).toBe(2);
    expect(fetched.filter((u) => u.includes("marine-api")).map((u) => new URL(u).searchParams.get("models"))).toEqual(["ecmwf_wam", "meteofrance_wave"]);
    expect(edge.ops.filter((k) => k.startsWith("houle:"))).toEqual(["houle:plages", "houle:plages"]); // the miss, the write
    // Another isolate of the same data center: one read of the edge.
    edge.ops = [];
    await temperatureMer(isolate(edge), "Saint-Pierre", NOW);
    expect(marine()).toBe(2);
    expect(edge.ops.filter((k) => k.startsWith("houle:"))).toEqual(["houle:plages"]);
    // The same isolate: from memory.
    edge.ops = [];
    await temperatureMer(cache, "Le Port", NOW);
    expect(edge.ops.filter((k) => k.startsWith("houle:"))).toEqual([]);
  });
});

describe("the UV index in prevision_meteo", () => {
  it("gives each day's highest index on the WHO scale, labelled a forecast and credited apart", async () => {
    const r = body(await previsionMeteo(isolate(), "Saint-Leu", undefined, NOW));
    expect(r.jours.length).toBeGreaterThan(3);
    for (const d of r.jours.slice(0, 4)) expect(d.indice_uv_max).toMatch(/^\d+ \((faible|modéré|élevé|très élevé|extrême)\)$/);
    expect(r.resume).toMatch(/UV \d+ \(/);
    expect(r.avertissements.join(" ")).toMatch(/Indice UV : PRÉVISION du service européen Copernicus.*pas une mesure.*échelle de l'OMS/);
    expect(r.sources.map((x: { source: string }) => x.source)).toContain(uv.SOURCE.nom);
  });

  it("gives none for today's hours left when they start at the place's sunset or after: no UV said of the night", async () => {
    // 06/11/2026: « aujourd'hui : de 22 h à minuit, 25,1 °C, … UV 13 (extrême) ». Saint-Leu's sunset on 22/10: 18:2x.
    const at = async (utc: string) => body(await previsionMeteo(isolate(), "Saint-Leu", undefined, new Date(utc)));
    const evening = await at("2026-10-22T14:00:00Z"); // 18:00, before sunset: the day's still said
    expect(evening.jours[0]).toMatchObject({ periode: "de 18\u00a0h à minuit", indice_uv_max: expect.stringMatching(/^\d+ \(/) });
    expect(/aujourd'hui : de 18\u00a0h à minuit[^;]*/.exec(evening.resume)?.[0]).toMatch(/UV \d+ \(/);
    for (const utc of ["2026-10-22T15:00:00Z", "2026-10-22T18:30:00Z"]) { // 19:00 and 22:30
      const night = await at(utc);
      expect(night.jours[0].periode).toMatch(/^de (19|22)\u00a0h à minuit$/);
      expect(night.jours[0].indice_uv_max).toBeUndefined();
      const today = /aujourd'hui : de (19|22)\u00a0h à minuit[^;]*/.exec(night.resume)?.[0];
      expect(today).toBeDefined();
      expect(today).not.toMatch(/UV/);
      // The days after keep theirs.
      expect(night.jours[1].indice_uv_max).toMatch(/^\d+ \(/);
    }
  });

  it("is one request for the whole island, three subrequests cold", async () => {
    const edge = new EdgeLike();
    const cache = isolate(edge);
    await counted(PAGE_BUDGET, async () => {
      await previsionMeteo(cache, "Saint-Leu", undefined, NOW);
      await previsionMeteo(cache, undefined, undefined, NOW);
    });
    expect(cams()).toBe(1);
    expect(edge.ops.filter((k) => k.startsWith("uv:"))).toEqual(["uv:ile", "uv:ile"]);
  });

  it("is left out, not an error, when CAMS does not answer", async () => {
    down = /air-quality-api/;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = body(await previsionMeteo(isolate(), "Saint-Leu", undefined, NOW));
    expect(r.jours[0].indice_uv_max).toBeUndefined();
    expect(r.avertissements.join(" ")).not.toMatch(/Indice UV/);
    expect(r.sources.map((x: { source: string }) => x.source)).not.toContain(uv.SOURCE.nom);
  });

  it("picks the cell over the place, and reads the WHO scale", () => {
    const cells = uv.parse(json("cams_uv.json"));
    expect(cells).toHaveLength(6);
    expect(uv.at(cells, 55.28, -21.17)).toMatchObject({ lat: expect.closeTo(-21.3, 1), lon: expect.closeTo(55.1, 1) });
    expect([2, 3, 6, 8, 11].map(uv.level)).toEqual(["faible", "modéré", "élevé", "très élevé", "extrême"]);
  });
});
