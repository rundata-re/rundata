import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { count, counted } from "../src/budget.js";
import { Cache, MemoryStore, type CacheEntry } from "../src/cache.js";
import * as airMesures from "../src/providers/air-mesures.js";
import * as capteurs from "../src/providers/capteurs.js";
import { parse as parseAtmo } from "../src/providers/atmo.js";
import { REGISTRY } from "../src/registre.js";
import { LICENCES, autorisee } from "../src/providers/autorisations.js";
import { CAPTEURS_AUCUN, CAPTEURS_AVERTISSEMENT, CAPTEURS_EXPLICATION, capteursAncienne, capteursEchec, measuredAt, qualiteAir } from "../src/tools/air.js";
import { airPage } from "../src/web/domains.js";
import { esc } from "../src/web/map.js";
import { SHARED } from "../src/web/partagees.js";

// Invented sensors: their identifiers are made up, their points are the centres of two communes of the gazetteer, and
// the others are off the island (Stuttgart) or indoors. None is a sensor of La Réunion.
const at = (id: number, lat: number, lon: number, ts: string, values: Record<string, string>, indoor = 0) => ({
  id: id * 10,
  timestamp: ts,
  sampling_rate: null,
  location: { id, latitude: String(lat), longitude: String(lon), altitude: "10.0", country: "FR", exact_location: 1, indoor },
  sensor: { id, pin: "1", sensor_type: { id: 14, name: "SDS011", manufacturer: "Nova Fitness" } },
  sensordatavalues: Object.entries(values).map(([value_type, value], i) => ({ id: id * 100 + i, value_type, value })),
});
const ANSWER = [
  at(900001, -20.87999, 55.44814, "2026-10-29 06:20:00", { P1: "20.4", P2: "12.1" }),
  at(900002, -20.93546, 55.29168, "2026-10-29 06:21:30", { P1: "8", P2: "" }),
  at(900003, 48.77, 9.17, "2026-10-29 06:20:00", { P1: "30", P2: "20" }),
  at(900004, -20.87999, 55.44814, "2026-10-29 06:20:00", { P1: "40", P2: "25" }, 1),
  at(900005, -20.87999, 55.44814, "2026-10-29 06:20:00", { temperature: "24.1", humidity: "70" }),
];
// 10:25 in La Réunion.
const NOW = new Date("2026-10-29T06:25:00Z");
const atmo = parseAtmo(JSON.parse(readFileSync(new URL("./fixtures/atmo_974.json", import.meta.url), "utf8")));
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
function cache() {
  const store = new MemoryStore();
  void store.put("atmo:974", { value: atmo, fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime());
}

afterEach(() => {
  capteurs.configure(undefined);
  airMesures.configure(undefined);
  vi.unstubAllGlobals();
});

describe("the sensors of private people (Sensor.Community)", () => {
  it("keeps the island's outdoor sensors with particles, each by its commune, its time in UTC", () => {
    expect(capteurs.parse(ANSWER)).toEqual([
      { cle: "900001", commune: "Saint-Denis", pm10: 20.4, pm2_5: 12.1, mesure_a: "2026-10-29T06:20:00Z" },
      { cle: "900002", commune: "Le Port", pm10: 8, mesure_a: "2026-10-29T06:21:30Z" },
    ]);
  });

  it("keeps each sensor's latest measure for 2 hours, and writes when they changed or an hour after", async () => {
    vi.stubGlobal("fetch", async () => Response.json(ANSWER));
    const written: capteurs.Copie[] = [];
    const write = async (c: capteurs.Stocke) => void written.push(c as capteurs.Copie);
    const { value, used } = await counted(10, () => capteurs.collect(null, write, NOW));
    expect(used).toBe(1);
    expect(value).toBe("2 lus sur Sensor.Community, 2 des 2 dernières heures, écrits");
    // The same sensors read again 15 minutes later: not written; an hour after the write, written again.
    expect(await capteurs.collect(written[0], write, new Date(NOW.getTime() + 15 * 60_000))).toMatch(/inchangés : non réécrits$/);
    expect(written).toHaveLength(1);
    await capteurs.collect(written[0], write, new Date(NOW.getTime() + 60 * 60_000));
    expect(written).toHaveLength(2);
    // None read for 2 hours and more: the sensors drop out, and the empty list is written.
    vi.stubGlobal("fetch", async () => Response.json([]));
    await capteurs.collect(written[1], write, new Date(NOW.getTime() + 2 * 3600_000 + 60_000));
    expect(written.at(-1)!.capteurs).toEqual([]);
  });

  it("never writes an empty list when the network does not answer: the copy kept, or else the failure and its time", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("The operation was aborted due to timeout");
    });
    const written: capteurs.Stocke[] = [];
    const write = async (s: capteurs.Stocke) => void written.push(s);
    // Nothing stored: the failure, written once, with its time.
    await expect(capteurs.collect(null, write, NOW)).rejects.toThrow(/timeout/);
    expect(written).toEqual([{ echec: NOW.toISOString(), source: "sensor.community", ecrit: NOW.toISOString() }]);
    const echec = written[0] as capteurs.Echec;
    // Failing again: not written again before 12 hours, then with its first time, before the store drops it.
    await expect(capteurs.collect(echec, write, new Date(NOW.getTime() + 15 * 60_000))).rejects.toThrow();
    expect(written).toHaveLength(1);
    await expect(capteurs.collect(echec, write, new Date(NOW.getTime() + 12 * 3600_000))).rejects.toThrow();
    expect(written.at(-1)).toEqual({ ...echec, ecrit: new Date(NOW.getTime() + 12 * 3600_000).toISOString() });
    // A copy stored: kept as it is, with its time.
    const copie = { lu: "2026-10-29T06:10:00Z", capteurs: capteurs.parse(ANSWER) };
    await expect(capteurs.collect(copie, write, NOW)).rejects.toThrow();
    expect(written).toHaveLength(2);
    // The network back: the sensors written over the failure.
    vi.stubGlobal("fetch", async () => Response.json(ANSWER));
    expect(await capteurs.collect(echec, write, NOW)).toBe("2 lus sur Sensor.Community, 2 des 2 dernières heures, écrits");
    expect(written.at(-1)).toMatchObject({ lu: NOW.toISOString(), capteurs: [{ commune: "Le Port" }, { commune: "Saint-Denis" }] });
  });

  it("says the failure and since when, on /air and in qualite_air, without logging it at each view", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    capteurs.configure(async () => ({ echec: "2026-10-29T04:56:00Z", source: "sensor.community", ecrit: "2026-10-29T04:56:00Z" }));
    const answer = body(await qualiteAir(cache(), undefined, NOW));
    const c = answer.capteurs_amateurs;
    expect(c.echec).toBe("Lecture des capteurs amateurs impossible depuis 08:56.");
    expect(c).not.toHaveProperty("aucun");
    expect(c).not.toHaveProperty("lu_par_rundata");
    expect(capteursEchec("2026-10-28T19:10:00Z", NOW)).toBe("Lecture des capteurs amateurs impossible depuis hier à 23:10.");
    expect(capteursEchec("2026-10-27T06:00:00Z", NOW)).toBe("Lecture des capteurs amateurs impossible depuis le 27/10 à 10:00.");
    const page = airPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain(`<p>${esc(c.echec)}</p>`);
    expect(page).not.toContain(esc(CAPTEURS_AUCUN));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("is read at 10, 25, 40 and 55 past (UTC), and registered", () => {
    const due = (min: number) => capteurs.refreshDue(new Date(Date.UTC(2026, 9, 29, 6, min)));
    expect([0, 10, 14, 15, 25, 40, 55, 59].map(due)).toEqual([false, true, true, false, true, true, true, true]);
    expect(REGISTRY.find((e) => e.id === "capteurs:air")).toMatchObject({ trigger: "planifiée", every: 15, offset: 10, run: { subrequests: 3, kvReads: 1, kvWrites: 1 } });
  });

  it("says when a sensor measured: today, or yesterday", () => {
    expect(measuredAt("2026-10-29T06:20:00Z", NOW)).toBe("à 10:20");
    expect(measuredAt("2026-10-28T19:10:00Z", new Date("2026-10-28T21:00:00Z"))).toBe("hier à 23:10");
  });

  it("gives them apart from the index, by commune, never an identifier nor a place, with the warning", async () => {
    // As the scheduled event stores them.
    const copie = { lu: "2026-10-29T06:10:00Z", capteurs: capteurs.merge([], capteurs.parse(ANSWER), NOW) };
    capteurs.configure(async () => copie);
    const r = body(await qualiteAir(cache(), undefined, NOW));
    const c = r.capteurs_amateurs;
    expect(c.avertissement).toBe(CAPTEURS_AVERTISSEMENT);
    expect(c.valeurs).toEqual([
      { commune: "Le Port", pm10: 8, unite: "µg/m³", mesurees: "à 10:21", reseau: "Sensor.Community" },
      { commune: "Saint-Denis", pm2_5: 12.1, pm10: 20.4, unite: "µg/m³", mesurees: "à 10:20", reseau: "Sensor.Community" },
    ]);
    expect(c.lu_par_rundata).toBe("29/10 10:10");
    expect(JSON.stringify(c)).not.toMatch(/9000\d\d|latitude|longitude|-20\.8/);
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(capteurs.SOURCE.nom);
    // Both networks credited in the answer, sensors.social with its credit as it asked it.
    expect(r.sources).toContainEqual({ source: capteurs.SOURCE_SOCIAL.nom, licence: "ODbL 1.0", attribution: "Sensor data © sensors.social contributors, ODbL 1.0" });
    // The index comes first, and its words never name a sensor.
    expect(Object.keys(r).indexOf("communes")).toBeLessThan(Object.keys(r).indexOf("capteurs_amateurs"));
    expect(`${r.resume} ${r.nature}`).not.toMatch(/capteur/i);
    // A place's answer carries them too.
    expect(body(await qualiteAir(cache(), "Saint-Denis", NOW)).capteurs_amateurs.valeurs).toHaveLength(2);
  });

  it("drops a sensor older than 2 hours, and says none in one sentence", async () => {
    capteurs.configure(async () => ({ lu: "2026-10-29T06:10:00Z", capteurs: [{ cle: "900001", commune: "Saint-Denis", pm10: 20, mesure_a: "2026-10-29T04:20:00Z" }] }));
    const c = body(await qualiteAir(cache(), undefined, NOW)).capteurs_amateurs;
    expect(c).not.toHaveProperty("valeurs");
    expect(c.aucun).toBe(CAPTEURS_AUCUN);
    // No value to take with care: the tool leaves the warning out (marketing), the networks' maps, guides and licences stay.
    expect(c).not.toHaveProperty("avertissement");
    expect(c).not.toHaveProperty("explication");
    expect(c.reseaux).toEqual([
      { nom: "Sensor.Community", carte: capteurs.CARTE, licence: "DbCL 1.0", lien_licence: capteurs.DBCL, brancher_un_capteur: capteurs.GUIDE },
      {
        nom: "sensors.social",
        carte: "https://sensors.social/",
        licence: "ODbL 1.0",
        lien_licence: "https://opendatacommons.org/licenses/odbl/1-0/",
        attribution: "Sensor data © sensors.social contributors, ODbL 1.0",
        brancher_un_capteur: "https://sensors.social/altruist-setup/",
      },
    ]);
    expect(body(await qualiteAir(cache(), "Saint-Denis", NOW)).capteurs_amateurs).not.toHaveProperty("avertissement");
    // /air keeps it above its block.
    const page = body(await qualiteAir(cache(), undefined, NOW, true));
    expect(page.capteurs_amateurs).toMatchObject({ avertissement: CAPTEURS_AVERTISSEMENT, explication: CAPTEURS_EXPLICATION, aucun: CAPTEURS_AUCUN });
    expect(airPage("https://rundata.re", { value: page, fetchedAt: NOW, stale: false }, NOW)).toContain(
      `<b>${esc(CAPTEURS_AVERTISSEMENT)}</b> ${esc(CAPTEURS_EXPLICATION).replace("Sensor.Community", "Sensor.<wbr>Community")}`,
    );
  });

  it("never says none on a copy not written lately: its values as last read and when, or no recent reading", async () => {
    // Last written at 06:10 in La Réunion, more than an hour and a half before 10:25: the network not read since.
    capteurs.configure(async () => ({ lu: "2026-10-29T02:10:00Z", capteurs: [{ cle: "900001", commune: "Saint-Denis", pm10: 20, mesure_a: "2026-10-29T02:05:00Z" }] }));
    const c = body(await qualiteAir(cache(), undefined, NOW)).capteurs_amateurs;
    expect(c.lecture_ancienne).toBe("Dernière lecture des capteurs à 06:10.");
    expect(c.valeurs).toEqual([{ commune: "Saint-Denis", pm10: 20, unite: "µg/m³", mesurees: "à 06:05", reseau: "Sensor.Community" }]);
    expect(c).not.toHaveProperty("aucun");
    expect(capteursAncienne("2026-10-28T19:10:00Z", NOW, true)).toBe("Dernière lecture des capteurs hier à 23:10.");
    // Its last reading found none: no recent reading, never « aucun ».
    capteurs.configure(async () => ({ lu: "2026-10-29T02:10:00Z", capteurs: [] }));
    const answer = body(await qualiteAir(cache(), undefined, NOW));
    expect(answer.capteurs_amateurs.lecture_ancienne).toBe("Pas de lecture récente des capteurs (dernière lecture à 06:10).");
    expect(answer.capteurs_amateurs).not.toHaveProperty("aucun");
    expect(answer.capteurs_amateurs).not.toHaveProperty("valeurs");
    const page = airPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, NOW);
    expect(page).toContain(`<p>${esc(answer.capteurs_amateurs.lecture_ancienne)}</p>`);
    expect(page).not.toContain(esc(CAPTEURS_AUCUN));
    // Written an hour and a quarter ago, as a read an hour after the last one: recent, said as usual.
    capteurs.configure(async () => ({ lu: "2026-10-29T05:10:00Z", capteurs: [] }));
    const recent = body(await qualiteAir(cache(), undefined, NOW)).capteurs_amateurs;
    expect(recent.aucun).toBe(CAPTEURS_AUCUN);
    expect(recent).not.toHaveProperty("lecture_ancienne");
  });

  it("has none where the store is not configured, nor while it has no copy", async () => {
    expect(body(await qualiteAir(cache(), undefined, NOW))).not.toHaveProperty("capteurs_amateurs");
    capteurs.configure(async () => null);
    expect(body(await qualiteAir(cache(), undefined, NOW))).not.toHaveProperty("capteurs_amateurs");
  });

  it("shows them on /air under the index, raw, without a colour, and the guide folded", async () => {
    capteurs.configure(async () => ({ lu: "2026-10-29T06:10:00Z", capteurs: capteurs.parse(ANSWER) }));
    // As buildAir reads it.
    const answer = body(await qualiteAir(cache(), undefined, NOW, true));
    const page = airPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, NOW);
    const start = page.indexOf('id="h-capteurs-air"');
    expect(start).toBeGreaterThan(page.indexOf('id="h-communes-air"'));
    const section = page.slice(start, page.indexOf("</section>", start));
    expect(section).toContain("<li>Saint-Denis · PM2,5 : 12,1 µg/m³ · PM10 : 20,4 µg/m³ · mesurées à 10:20 <span class=\"note\">Sensor.<wbr>Community, non étalonné</span></li>");
    expect(section).toContain(`<b>${CAPTEURS_AVERTISSEMENT}</b>`);
    expect(section).toContain('<details class="card" id="brancher"><summary>Brancher son capteur</summary>');
    expect(section).not.toMatch(/class="[^"]*\b(?:aq|lvl|level)-/);
    // The network's name may go to the next line after its « . », never in the middle of « Community » at 200 %: in the
    // page's text, its guide's title and its link, never in the tool's answer.
    expect(section).toContain("partagés sur Sensor.<wbr>Community");
    expect(section).toContain("<h3>airRohr (Sensor.<wbr>Community)</h3>");
    // On its link, its name whole in aria-label (lienNom): a <wbr> alone would make Chrome name it « Sensor. Community ».
    expect(section).toContain('rel="noopener" aria-label="Sensor.Community">Sensor.<wbr>Community</a>');
    expect(section.match(/<a\b[^>]*>(?:(?!<\/a>).)*<\/a>/gs)!.filter((x) => x.includes("<wbr>") && !x.includes('aria-label="'))).toEqual([]);
    expect(JSON.stringify(answer)).not.toContain("<wbr>");
    // Empty: one sentence and the link to the guide; the name may go to the next line there too, not in the tool's answer.
    capteurs.configure(async () => ({ lu: "2026-10-29T06:10:00Z", capteurs: [] }));
    const none = body(await qualiteAir(cache(), undefined, NOW, true));
    expect(airPage("https://rundata.re", { value: none, fetchedAt: NOW, stale: false }, NOW)).toContain(
      `<p>${esc(CAPTEURS_AUCUN).replace("Sensor.Community", "Sensor.<wbr>Community")} <a href="#brancher">Brancher un capteur</a></p>`,
    );
    expect(JSON.stringify(none)).not.toContain("<wbr>");
  });

  it("costs, from cold, what the budget's registry says: the index and the two copies read from KV", async () => {
    vi.stubGlobal("fetch", async () => new Response(readFileSync(new URL("./fixtures/atmo_974.json", import.meta.url))));
    // As worker.ts: one KV read each, counted.
    const mesure = { station: "FR38001", nom_fichier: "STATION", type: "fond", polluant: "O3", debut: "2026-10-29T07:00:00+04:00", fin: "2026-10-29T08:00:00+04:00", valeur: 30, unite: "µg-m3" };
    airMesures.configure(async () => (count(), { lu: "2026-10-29T05:40:00Z", derniere_heure: mesure.fin, mesures: [mesure] }));
    capteurs.configure(async () => (count(), { lu: "2026-10-29T06:10:00Z", capteurs: [] }));
    class EdgeLike extends MemoryStore {
      async get(key: string, since?: number) {
        count(1, "read");
        return super.get(key, since);
      }
      async put(key: string, entry: CacheEntry) {
        count(1, true);
        return super.put(key, entry);
      }
    }
    const { used } = await counted(50, () => qualiteAir(new Cache(new EdgeLike(), () => NOW.getTime()), undefined, NOW));
    expect(used).toBeLessThanOrEqual(SHARED.find((s) => s.key === "web:air")!.cold!);
    for (const id of ["qualite_air", "web:air"]) expect(REGISTRY.find((e) => e.id === id)!.run.kvReads, id).toBe(2);
    expect(REGISTRY.find((e) => e.id === "qualite_air")!.run.subrequests).toBe(used);
  });
});

// Invented sensors of sensors.social: identifiers made up, points at the centres of two communes of the gazetteer, one
// off the island (Stuttgart). None is a sensor of La Réunion.
const SS_ID = (n: number) => `0000feed${String(n).padStart(4, "0")}cafe`;
const ss = (n: number, lat: number, lng: number, ts: number) => ({ model: 2, geo: { lat, lng }, timestamp: ts, sensor_id: SS_ID(n), sensors: [] });
// 10:20 and 10:21 in La Réunion, in seconds.
const T = Date.parse("2026-10-29T06:20:00Z") / 1000;
const MARKERS = { result: [ss(1, -20.87999, 55.44814, T), ss(2, 48.77, 9.17, T), ss(3, -20.93546, 55.29168, T + 60), { ...ss(4, -20.87999, 55.44814, T), sensor_id: "../x" }] };
const points = (pm10: number, pm25: number, ts: number) => ({ data: { temperature: 30, humidity: 40, pm10, pm25, noisemax: 50 }, timestamp: ts });
const HISTORY: Record<string, unknown> = {
  [SS_ID(1)]: { result: [points(3, 2, T - 600), points(4.5, 2.5, T), { data: { temperature: 31 }, timestamp: T + 30 }] },
  [SS_ID(3)]: { result: [points(6, 3.25, T + 60)] },
};
/** Answers as the two networks would, and records each request's URL and User-Agent. */
function networks(seen: { url: string; ua: string | null }[], social: "ok" | "panne" = "ok") {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, ua: new Headers(init?.headers).get("User-Agent") });
    if (url.startsWith("https://data.sensor.community/")) return Response.json(ANSWER);
    if (social === "panne") throw new Error("The operation was aborted due to timeout");
    const path = new URL(url).pathname;
    if (path.includes("/markers/")) return Response.json(MARKERS);
    const id = path.split("/")[4];
    return Response.json(HISTORY[id] ?? { result: [] });
  };
}

describe("the sensors of private people on sensors.social (ODbL 1.0, its written yes of 09/11/2026)", () => {
  it("keeps the island's sensors of the last hour, each by its commune, the latest first, a safe identifier only", () => {
    expect(capteurs.socialMarkers(MARKERS.result)).toEqual([
      { id: SS_ID(3), commune: "Le Port" },
      { id: SS_ID(1), commune: "Saint-Denis" },
    ]);
    // More than SOCIAL_MAX (10 since 14/11/2026): the ones that sent last.
    expect(capteurs.SOCIAL_MAX).toBe(10);
    const many = Array.from({ length: 14 }, (_, i) => ss(10 + i, -20.87999, 55.44814, T + i));
    expect(capteurs.socialMarkers(many)).toHaveLength(capteurs.SOCIAL_MAX);
    expect(capteurs.socialMarkers(many)[0].id).toBe(SS_ID(23));
    expect(capteurs.socialMarkers(many).at(-1)!.id).toBe(SS_ID(14));
  });

  it("takes a sensor's latest measure of particles, its time in UTC, its key apart from Sensor.Community's", () => {
    expect(capteurs.socialLast({ id: SS_ID(1), commune: "Saint-Denis" }, (HISTORY[SS_ID(1)] as { result: [] }).result)).toEqual({
      cle: `ss:${SS_ID(1)}`,
      reseau: "sensors.social",
      commune: "Saint-Denis",
      pm10: 4.5,
      pm2_5: 2.5,
      mesure_a: "2026-10-29T06:20:00Z",
    });
    expect(capteurs.socialLast({ id: SS_ID(1), commune: "Saint-Denis" }, [{ data: { pm10: -1, pm25: "x" }, timestamp: T }])).toBeUndefined();
  });

  it("is read once an hour, at 10 past (UTC), with rundata.re's site and address in its User-Agent, and registered", async () => {
    const due = (min: number) => capteurs.socialDue(new Date(Date.UTC(2026, 9, 29, 6, min)));
    expect([0, 10, 14, 15, 25, 40, 55].map(due)).toEqual([false, true, true, false, false, false, false]);
    expect(REGISTRY.find((e) => e.id === "capteurs:social")).toMatchObject({ trigger: "planifiée", every: 60, offset: 10, run: { subrequests: 1 + capteurs.SOCIAL_MAX } });
    const seen: { url: string; ua: string | null }[] = [];
    vi.stubGlobal("fetch", networks(seen));
    const written: capteurs.Stocke[] = [];
    const { value, used } = await counted(20, () => capteurs.collect(null, async (s) => void written.push(s), NOW, true));
    expect(value).toBe("2 lus sur Sensor.Community, 2 sur sensors.social, 4 des 2 dernières heures, écrits");
    // Sensor.Community, then sensors.social's list of the last hour and its two sensors of the island.
    expect(used).toBe(4);
    const social = seen.filter((x) => x.url.startsWith("https://roseman.robonomics.network/"));
    expect(social.map((x) => x.url.replace(/\d{10}\/\d{10}$/, "…"))).toEqual([
      "https://roseman.robonomics.network/api/v2/sensor/markers/…",
      `https://roseman.robonomics.network/api/v2/sensor/${SS_ID(3)}/…`,
      `https://roseman.robonomics.network/api/v2/sensor/${SS_ID(1)}/…`,
    ]);
    expect(social[0].url).toMatch(new RegExp(`/${NOW.getTime() / 1000 - 3600}/${NOW.getTime() / 1000}$`));
    for (const x of social) expect(x.ua).toBe("rundata.re (https://rundata.re; contact@rundata.re)");
    expect((written[0] as capteurs.Copie).capteurs.filter((c) => c.reseau === "sensors.social").map((c) => c.commune)).toEqual(["Le Port", "Saint-Denis"]);
    // The other passes of the hour: Sensor.Community alone.
    seen.length = 0;
    await capteurs.collect(written[0], async (s) => void written.push(s), new Date(NOW.getTime() + 15 * 60_000));
    expect(seen.map((x) => new URL(x.url).host)).toEqual(["data.sensor.community"]);
  });

  it("is not read while it has not agreed", async () => {
    const was = LICENCES["capteurs:sensors_social"].etat;
    expect(was).toBe("accordee");
    expect(LICENCES["capteurs:sensors_social"]).toMatchObject({ licence: "ODbL 1.0", accordee_le: "2026-11-09" });
    LICENCES["capteurs:sensors_social"].etat = "demandee";
    try {
      expect(autorisee(capteurs.SOCIAL_AUTORISATION)).toBe(false);
      const seen: { url: string; ua: string | null }[] = [];
      vi.stubGlobal("fetch", networks(seen));
      await capteurs.collect(null, async () => {}, NOW, true);
      expect(seen.map((x) => new URL(x.url).host)).toEqual(["data.sensor.community"]);
    } finally {
      LICENCES["capteurs:sensors_social"].etat = was;
    }
  });

  it("says when it did not answer while Sensor.Community did, never that none measured", async () => {
    vi.stubGlobal("fetch", networks([], "panne"));
    const written: capteurs.Copie[] = [];
    expect(await capteurs.collect(null, async (s) => void written.push(s as capteurs.Copie), NOW, true)).toBe(
      "2 lus sur Sensor.Community, sensors.social sans réponse, 2 des 2 dernières heures, écrits",
    );
    expect(written[0].echecs).toEqual({ "sensors.social": NOW.toISOString() });
    // Back an hour later: its failure dropped.
    vi.stubGlobal("fetch", networks([]));
    await capteurs.collect(written[0], async (s) => void written.push(s as capteurs.Copie), new Date(NOW.getTime() + 3600_000), true);
    expect(written.at(-1)).not.toHaveProperty("echecs");
    // Said by the tool and on /air; no sensor at all: never « aucun ».
    capteurs.configure(async () => ({ lu: "2026-10-29T06:10:00Z", capteurs: [], echecs: { "sensors.social": "2026-10-29T05:10:00Z" } }));
    const answer = body(await qualiteAir(cache(), undefined, NOW, true));
    expect(answer.capteurs_amateurs.lectures_impossibles).toEqual(["Lecture de sensors.social impossible depuis 09:10."]);
    expect(answer.capteurs_amateurs).not.toHaveProperty("aucun");
    expect(airPage("https://rundata.re", { value: answer, fetchedAt: NOW, stale: false }, NOW)).toContain("<p>Lecture de sensors.social impossible depuis 09:10.</p>");
  });

  it("says each of its measures with its network and its credit, in the tool and on /air, never an identifier nor a place", async () => {
    vi.stubGlobal("fetch", networks([]));
    const written: capteurs.Copie[] = [];
    await capteurs.collect(null, async (s) => void written.push(s as capteurs.Copie), NOW, true);
    capteurs.configure(async () => written[0]);
    const r = body(await qualiteAir(cache(), undefined, NOW, true));
    expect(r.capteurs_amateurs.valeurs.filter((v: { reseau: string }) => v.reseau === "sensors.social")).toEqual([
      { commune: "Le Port", pm2_5: 3.25, pm10: 6, unite: "µg/m³", mesurees: "à 10:21", reseau: "sensors.social", attribution: "Sensor data © sensors.social contributors, ODbL 1.0" },
      { commune: "Saint-Denis", pm2_5: 2.5, pm10: 4.5, unite: "µg/m³", mesurees: "à 10:20", reseau: "sensors.social", attribution: "Sensor data © sensors.social contributors, ODbL 1.0" },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/0000feed|cafe|-20\.8|55\.4|"ss:/);
    const page = airPage("https://rundata.re", { value: r, fetchedAt: NOW, stale: false }, NOW);
    const start = page.indexOf('id="h-capteurs-air"');
    const section = page.slice(start, page.indexOf("</section>", start));
    expect(section).toContain('<li>Le Port · PM2,5 : 3,25 µg/m³ · PM10 : 6 µg/m³ · mesurées à 10:21 <span class="note">sensors.social, non étalonné</span></li>');
    // Its credit as it asked it, a link to its site and one to its licence; the name may go to the next line after its
    // « . » (lienNom), its text whole for a screen reader.
    expect(section).toContain(
      '<span lang="en">Sensor data © <a href="https://sensors.social/" rel="noopener" aria-label="sensors.social"><span class="adrweb">sensors.<wbr>social</span></a> contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener">ODbL 1.0</a></span>',
    );
    expect(section).toContain('<a href="https://sensors.social/altruist-setup/" rel="noopener">');
    expect(section).not.toMatch(/0000feed|-20\.8/);
  });
});
