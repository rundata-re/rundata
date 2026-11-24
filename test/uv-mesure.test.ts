import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { resolvePlace } from "../src/places/resolve.js";
import * as openmeteo from "../src/providers/openmeteo.js";
import * as uvm from "../src/providers/uv-mesure.js";
import { previsionMeteo } from "../src/tools/prevision.js";
import { createServer } from "../src/server.js";
import { placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import type { PlaceData } from "../src/web/data.js";

// The UV index measured at Moufia, from ENERGY-Lab's radiometer (SolarDB), under its agreement of 23/11/2026.
const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const NOW = new Date("2026-11-23T08:20:00Z"); // 12:20 in La Réunion
const SECRET = "jeton-de-test-0123";

/** SolarDB's minutes, `mv` each, the last at `fin`. */
const minutes = (fin: Date, n: number, mv: number) => {
  const dates = Array.from({ length: n }, (_, i) => new Date(fin.getTime() - (n - 1 - i) * 60_000).toISOString().replace(".000Z", "Z"));
  return { code: 200, message: "Success", data: { urmoufia: { UIO_pz04_Avg: { dates, values: dates.map(() => mv) } } } };
};
const OMI = [
  "20261118T104512123Z   9818.448   2026  322   38712  118880  20  -21.05   55.70   30.2   44.1   279.50   3.1  1013.25  643.29  0.10  20.1",
  "20261119T111705918Z   9819.470207  2026  323      40625  118895    20  -21.19   54.59   93.5    44.40   273.69      3.21   1013.25    643.29      0.545     36.2",
  "20261119T094000000Z   9819.400000  2026  323      35000  118894    20  -20.95   55.45   12.0    40.00   276.40      3.21   1013.25    643.29      0.100     20.0",
].join("\n");

function sources(opts: { login?: number; data?: object; omi?: string | number } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(u), headers });
    const url = String(u);
    if (url.includes("/api/v1/login")) {
      return opts.login ? new Response("", { status: opts.login }) : new Response("{}", { headers: { "set-cookie": "solardb=SESSION42; Path=/; Max-Age=43200" } });
    }
    if (url.includes("/api/v1/data/json/urmoufia/UIO_pz04_Avg")) return new Response(JSON.stringify(opts.data ?? minutes(new Date("2026-11-23T08:17:00Z"), 18, 1250)));
    if (new URL(url).hostname === "avdc.gsfc.nasa.gov") return typeof opts.omi === "number" ? new Response("", { status: opts.omi }) : new Response(opts.omi ?? OMI, { status: 206 });
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}

afterEach(() => {
  uvm.configure(undefined);
  vi.unstubAllGlobals();
});

describe("the index from the radiometer's voltage", () => {
  it("is the certificate's, ozone and angle corrected: the values of the trial's script (uvi.py), to 0.01", () => {
    for (const [mv, t, o3, b] of [
      [1256, "2026-11-05T08:00:00Z", 280.81, 13.0748],
      [343, "2026-11-05T04:00:00Z", 280.81, 2.6244],
      [957, "2026-11-05T06:00:00Z", 250, 9.7969],
      [800, "2026-06-21T08:00:00Z", 253.7, 7.3387],
    ] as const) expect(uvm.indice(mv, new Date(t), o3)).toBeCloseTo(b, 2);
    expect(uvm.sza(new Date("2026-11-05T08:00:00Z"))).toBeCloseTo(5.2007, 2);
    expect(uvm.fn(40, 300)).toBe(1);
    expect(uvm.indice(-0.3, NOW, 280)).toBe(0);
  });

  it("takes the last overpass's column nearest the island, and the mean of the last 10 minutes, 8 of them at least", () => {
    expect(uvm.parseOzone(OMI)).toEqual({ jour: "2026-11-19", du: 276.4 });
    expect(uvm.parseOzone("Datetime MJD2000\nrien")).toBeUndefined();
    const m = uvm.dernieres10(minutes(new Date("2026-11-23T08:17:00Z"), 18, 1000))!;
    expect(m).toEqual({ t: Date.parse("2026-11-23T08:17:00Z"), mv: 1000 });
    expect(uvm.dernieres10(minutes(new Date("2026-11-23T08:17:00Z"), 7, 1000))).toBeUndefined();
  });

  it("reads every 10 minutes while the sun is up at Moufia, never at night", () => {
    expect(uvm.refreshDue(new Date("2026-11-23T08:02:00Z"))).toBe(true);
    expect(uvm.refreshDue(new Date("2026-11-23T08:07:00Z"))).toBe(false);
    expect(uvm.refreshDue(new Date("2026-11-23T18:02:00Z"))).toBe(false);
  });
});

describe("the scheduled read", () => {
  it("asks nothing, keeps nothing, without the token", async () => {
    const calls = sources();
    const write = vi.fn();
    expect(await uvm.refresh(null, write, NOW)).toBe("sans jeton");
    expect(calls).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it("logs in, reads the last 20 minutes with the session, the ozone's 4 last kB once a day, and keeps the index and the day's highest", async () => {
    uvm.configure(SECRET);
    const calls = sources();
    let kept: uvm.Etat | undefined;
    const said = await uvm.refresh(null, async (e) => void (kept = e), NOW);
    expect(said).toMatch(/^indice 13\.\d à 08:17 UTC, ozone 276.4 DU \(2026-11-19\)$/);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/pub/data/satellite/Aura/OMI/V03/L2OVP/OMTO3/aura_omi_l2ovp_omto3_col4_v8.5_la.reunion_436.txt", "/api/v1/login", "/api/v1/data/json/urmoufia/UIO_pz04_Avg"]);
    expect(calls[0].headers.Range).toBe("bytes=-4000");
    expect(calls[2].headers.Cookie).toBe("solardb=SESSION42");
    expect(new URL(calls[2].url).searchParams.get("start")).toBe("-20m");
    expect(kept!.mesure).toEqual({ t: Date.parse("2026-11-23T08:17:00Z"), uv: kept!.max!.uv });
    expect(kept!.max!.jour).toBe("2026-11-23");
    // Ten minutes later: OMI not asked again, a lower index leaves the day's highest.
    const later = sources({ data: minutes(new Date("2026-11-23T08:27:00Z"), 18, 900) });
    await uvm.refresh(kept!, async (e) => void (kept = e), new Date("2026-11-23T08:30:00Z"));
    expect(later.some((c) => c.url.includes("avdc"))).toBe(false);
    expect(kept!.mesure!.uv).toBeLessThan(kept!.max!.uv);
  });

  it("uses the month's mean when OMI does not answer", async () => {
    uvm.configure(SECRET);
    sources({ omi: 503 });
    expect(await uvm.refresh(null, async () => {}, NOW)).toContain("ozone 283.2 DU (moyenne du mois)");
  });

  it("keeps a failure with its time, and never the token in what it keeps or throws", async () => {
    uvm.configure(SECRET);
    sources({ login: 401 });
    let kept: uvm.Etat | undefined;
    const err = await uvm.refresh(null, async (e) => void (kept = e), NOW).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(kept!.echec!.at).toBe(NOW.getTime());
    expect(JSON.stringify(kept)).not.toContain(SECRET);
    expect(String((err as Error).message)).not.toContain(SECRET);
  });
});

describe("what a page and an answer say", () => {
  const etat = (e: Partial<uvm.Etat>): uvm.Etat => ({ essai: NOW.getTime(), lu: NOW.getTime(), ...e });
  const at = (iso: string) => Date.parse(iso);

  it("the measurement of now with its time, station and distance, the day's highest, the error possible and ENERGY-Lab's citation", () => {
    const b = uvm.bloc(etat({ mesure: { t: at("2026-11-23T08:17:00Z"), uv: 12.6 }, max: { t: at("2026-11-23T07:57:00Z"), uv: 13.4, jour: "2026-11-23" } }), 3.6, NOW)!;
    expect(b.resume).toBe("Indice UV MESURÉ au Moufia (Saint-Denis), à 4 km : 13 (extrême) à 12:17, moyenne des 10 minutes précédentes. Le plus haut aujourd'hui : 13 (extrême) à 11:57.");
    expect(b).toMatchObject({ nature: "mesure", indice: "13 (extrême)", mesure_a: "12:17", distance_km: 3.6 });
    expect(b.incertitude).toContain("Erreur possible\u00a0: jusqu'à 15\u00a0% (estimation provisoire)");
    expect(b.incertitude).toContain("certificat d'étalonnage de 2022, le dernier connu");
    expect(b.incertitude).toContain("C'est une mesure, pas la prévision CAMS.");
    // The data set's title and DOI not given yet: left out, never invented nor shown empty.
    expect(b.citation).toBe("ENERGY-Lab, Université de La Réunion, SolarDB (https://solardb.univ-reunion.fr/), licence CC BY 4.0.");
    expect(b.citation).not.toMatch(/\[|\]|DOI|undefined/);
    Object.assign(uvm.JEU_DE_DONNEES, { titre: "Titre du jeu", doi: "10.1234/x" });
    try {
      expect(uvm.bloc(etat({ mesure: { t: at("2026-11-23T08:17:00Z"), uv: 12.6 } }), 3.6, NOW)!.citation).toBe("ENERGY-Lab. (2026). Titre du jeu [Data set]. https://doi.org/10.1234/x.");
    } finally {
      Object.assign(uvm.JEU_DE_DONNEES, { titre: undefined, doi: undefined });
    }
  });

  it("a failed read with its time; the day's highest once the measurement is old; nothing at night before the day's first", () => {
    const old = etat({ lu: at("2026-11-23T06:00:00Z"), mesure: { t: at("2026-11-23T05:57:00Z"), uv: 6 }, max: { t: at("2026-11-23T05:57:00Z"), uv: 6, jour: "2026-11-23" }, echec: { at: at("2026-11-23T08:12:00Z"), message: "HTTP 503" } });
    const b = uvm.bloc(old, 2, NOW)!;
    expect(b.indice).toBeUndefined();
    expect(b.resume).toBe("Indice UV MESURÉ au Moufia (Saint-Denis), à 2 km : pas de mesure depuis 09:57. Le plus haut aujourd'hui : 6 (élevé) à 09:57. La lecture de SolarDB a échoué à 12:12.");
    expect(b.lecture_en_echec_a).toBe("12:12");
    const yesterday = etat({ mesure: { t: at("2026-11-22T14:00:00Z"), uv: 0.2 }, max: { t: at("2026-11-22T08:00:00Z"), uv: 13, jour: "2026-11-22" } });
    expect(uvm.bloc(yesterday, 2, new Date("2026-11-23T01:30:00Z"))).toBeUndefined();
    expect(uvm.bloc(null, 2, NOW)).toBeUndefined();
  });
});

describe("prevision_meteo and the place's page", () => {
  const state: uvm.Etat = { essai: NOW.getTime(), lu: NOW.getTime(), mesure: { t: Date.parse("2026-11-23T08:17:00Z"), uv: 12.6 }, max: { t: Date.parse("2026-11-23T08:17:00Z"), uv: 12.6, jour: "2026-11-23" } };
  async function cache() {
    const store = new MemoryStore();
    const at = NOW.getTime();
    for (const p of ["Saint-Denis", "Cilaos"]) await store.put(openmeteo.cacheKey(resolvePlace(p)!.lieu), { value: fixture("openmeteo_cilaos.json"), fetchedAt: at });
    await store.put("openmeteo:meta", { value: fixture("openmeteo_meta.json"), fetchedAt: at });
    return new Cache(store, () => at);
  }
  beforeEach(() =>
    vi.stubGlobal("fetch", async () => {
      throw new Error("no network in tests");
    }),
  );

  it("say the same measurement near Moufia, with its source, and nothing of it farther away", async () => {
    uvm.configure(SECRET, async () => state);
    const sd = body(await previsionMeteo(await cache(), "Saint-Denis", undefined, NOW));
    expect(sd.indice_uv_mesure.resume).toMatch(/^Indice UV MESURÉ au Moufia \(Saint-Denis\), à \d+ km : 13 \(extrême\) à 12:17/);
    expect(sd.resume).toContain(sd.indice_uv_mesure.resume);
    // The error possible said once, in the block, never copied into the warnings (the answer's size).
    expect(sd.indice_uv_mesure.incertitude).toBe(uvm.INCERTITUDE);
    expect(sd.avertissements.join(" ")).not.toContain(uvm.INCERTITUDE);
    expect(sd.sources.map((s: { source: string }) => s.source)).toContain(uvm.SOURCE.nom);
    const html = placePage("https://rundata.re", pageOf("saint-denis")!, { value: { prevision: sd } as PlaceData, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain(`<h2 id="h-uv">L'indice UV mesuré au Moufia</h2><span class="badge m">Mesure</span>`);
    // « mesuré » in small letters on the page, its label saying it is a measurement; else the tool's words.
    expect(html).toContain(sd.indice_uv_mesure.resume.replace("UV MESURÉ", "UV mesuré").replaceAll("'", "&#39;"));
    expect(html).not.toContain("UV MESURÉ");
    expect(html).toContain('<a href="https://solardb.univ-reunion.fr/" rel="noopener">');
    const far = body(await previsionMeteo(await cache(), "Cilaos", undefined, NOW));
    expect(far.indice_uv_mesure).toBeUndefined();
    expect(JSON.stringify(far)).not.toContain("MESURÉ au Moufia");
  });

  it("name the measurement in prevision_meteo's description only once the token is set", () => {
    const description = () => (createServer(new Cache(new MemoryStore())) as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools.prevision_meteo.description ?? "";
    expect(description()).not.toContain("MESURÉ au Moufia");
    uvm.configure(SECRET, async () => state);
    expect(description()).toContain("donne aussi l'indice UV MESURÉ au Moufia (bloc indice_uv_mesure), avec son heure et son erreur possible");
    expect(description()).toMatch(/le dire comme une mesure, distincte de la prévision\./);
  });

  it("stay silent without the token: no block, no source, no error said", async () => {
    uvm.configure(undefined, async () => state);
    const sd = body(await previsionMeteo(await cache(), "Saint-Denis", undefined, NOW));
    expect(sd.indice_uv_mesure).toBeUndefined();
    expect(JSON.stringify(sd)).not.toMatch(/Moufia|SolarDB|ENERGY-Lab/);
    const html = placePage("https://rundata.re", pageOf("saint-denis")!, { value: { prevision: sd } as PlaceData, fetchedAt: NOW, stale: false }, NOW);
    expect(html).not.toMatch(/h-uv|SolarDB|ENERGY-Lab/);
  });
});
