import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as rt from "../src/providers/gtfsrt.js";
import * as transit from "../src/providers/transit.js";
import type { Fil, Info } from "../src/providers/actualites.js";
import { applyRealtime, busNews, departureRow, departures, findStops, realtimeFeeds, transports, withPositions } from "../src/tools/transports.js";

// 40 trips, 2 vehicles and the 3 alerts of the Car Jaune feed of 23/10/2026 at 20:55 (La Réunion).
const FEED = new Uint8Array(readFileSync(new URL("./fixtures/gtfs_rt_carjaune.pb", import.meta.url)));
const rows = JSON.parse(readFileSync(new URL("./fixtures/transit/rows.json", import.meta.url), "utf8")) as Record<
  string,
  { passes: { id: number }[]; patterns: { id: number }[] }
>;
const fake: transit.TransitDb = {
  all: async <T>(sql: string, keys: unknown) =>
    (JSON.parse(String(keys)) as [string, number][]).flatMap(([feed, id]) =>
      (/FROM passes/.test(sql) ? rows[feed]?.passes : rows[feed]?.patterns)?.filter((r) => r.id === id).map((r) => ({ feed, ...r })) ?? [],
    ) as T[],
};
// Friday 23/10/2026, 7h30 in La Réunion.
const NOW = new Date("2026-10-23T03:30:00Z");
const T0 = NOW.getTime() / 1000;
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cj = transit.NETWORKS.carjaune;
const gtfsStop = (stop: number) => cj.temps_reel!.arrets[stop - cj.first_stop];

beforeEach(() => {
  transit.configure(fake);
  // The other networks' feeds are down: no test reaches the network.
  vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
});
afterEach(() => {
  transit.configure(undefined);
  vi.unstubAllGlobals();
});

/** A cache already holding this feed for Car Jaune, as read a moment ago. */
function withFeed(feed: rt.Realtime) {
  const store = new MemoryStore();
  store.put("rt:carjaune", { value: feed, fetchedAt: NOW.getTime() });
  return new Cache(store, () => NOW.getTime(), false);
}

describe("GTFS-RT feed", () => {
  it("reads the trips' expected times, the skipped stops and the alerts", () => {
    const f = rt.decode(FEED);
    expect(new Date(f.at * 1000).toISOString()).toBe("2026-10-23T16:55:58.000Z");
    expect(Object.keys(f.trips)).toHaveLength(40);
    expect(f.trips["7-336134207"]["257"]).toBe(1792714536);
    expect(f.alerts.map((a) => a.titre)).toContain(`Arrêt "Barachois" non desservi et reporté`);
    const barachois = f.alerts.find((a) => a.titre.includes("Barachois"))!;
    expect(barachois.lignes).toEqual(["9", "35", "11", "36"]);
    expect(barachois.texte).toMatch(/le 25\/10\/2026 de 14h00 à 19h00/);
    expect(rt.active(barachois, barachois.periodes[0][0]! + 1)).toBe(true);
    expect(rt.active(barachois, barachois.periodes[0][1]! + 1)).toBe(false);
  });

  it("reads where the buses that send their position are, without their plate", () => {
    const f = rt.decode(FEED);
    expect(f.vehicles).toHaveLength(2);
    const [v] = f.vehicles!;
    expect(v).toMatchObject({ trip: "7-218169484", route: "13", stop: "514", status: 2, at: 1792774552 });
    expect(v.lat).toBeCloseTo(-20.88168, 4);
    expect(v.lon).toBeCloseTo(55.45491, 4);
    expect(JSON.stringify(f.vehicles)).not.toMatch(/DQ-032-PH/);
  });

  it("is fetched for the networks that have one, and left out once it stopped", async () => {
    vi.stubGlobal("fetch", async () => new Response(FEED));
    const at = new Date(rt.decode(FEED).at * 1000);
    const fresh = await realtimeFeeds(["carjaune", "citalis"], new Cache(new MemoryStore(), () => at.getTime(), false), at);
    expect([...fresh.keys()]).toEqual(["carjaune"]);
    const later = new Date(at.getTime() + (rt.MAX_AGE_SECONDS + 60) * 1000);
    expect((await realtimeFeeds(["carjaune"], new Cache(new MemoryStore(), () => later.getTime(), false), later)).size).toBe(0);
  });
});

describe("departures in real time", () => {
  it("take the announced time, a skipped stop and a cancelled trip, and come in the order the buses are expected", async () => {
    // Still to come: on a network with a feed, departures are also looked for an hour back.
    const list = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).filter((d) => d.reseau === "carjaune" && d.in >= 0).slice(0, 3);
    expect(list).toHaveLength(3);
    const [late, skipped, cancelled] = list;
    const feed: rt.Realtime = {
      at: T0 - 20,
      trips: {
        // 12 minutes late: now after the two others.
        [late.trip]: { [gtfsStop(late.stop)]: T0 + late.in + 12 * 60 },
        [skipped.trip]: { [gtfsStop(skipped.stop)]: rt.SKIPPED },
      },
      cancelled: [cancelled.trip],
      alerts: [],
    };
    const out = applyRealtime(list, new Map([["carjaune", feed]]), NOW);
    expect(out.map((d) => d.trip)).toEqual([skipped.trip, cancelled.trip, late.trip]);
    const row = departureRow(out[2]);
    expect(row.retard_min).toBe(12);
    expect(row.heure_annoncee).not.toBe(row.heure);
    expect(departureRow(out[0]).temps_reel).toBe("ne passe pas à cet arrêt");
    expect(out[1].supprime).toBe(true);
  });

  it("leave out a time far from the timetable: half an hour early, an hour late, or half an hour late with no bus seen", async () => {
    const list = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).filter((d) => d.reseau === "carjaune");
    // Due in an hour at least: 55 minutes early would still be to come.
    const d = list.find((x) => x.in >= 3600)!;
    const bus: rt.Vehicle = { trip: d.trip, lat: -21.274, lon: 55.505, at: T0 - 20 };
    const at = (late: number, vehicles: rt.Vehicle[]) => {
      const feeds = new Map([["carjaune", { at: T0 - 20, trips: { [d.trip]: { [gtfsStop(d.stop)]: T0 + d.in + late } }, cancelled: [], alerts: [], vehicles } as rt.Realtime]]);
      return withPositions(applyRealtime([d], feeds, NOW), feeds, NOW)[0];
    };
    // Car Jaune, 26/10/2026: a second bus given the next run's trip, its 11h32 announced at 10h37. Its bus is not this run's.
    const early = at(-55 * 60, [bus]);
    expect(departureRow(early)).not.toHaveProperty("heure_annoncee");
    expect(early.bus).toBeUndefined();
    const late = at(35 * 60, [bus]);
    expect(departureRow(late).retard_min).toBe(35);
    expect(late.bus).toBeDefined();
    expect(departureRow(at(35 * 60, []))).not.toHaveProperty("heure_annoncee");
    expect(departureRow(at(59 * 60, []))).not.toHaveProperty("heure_annoncee");
    const later = at(65 * 60, [bus]);
    expect(departureRow(later)).not.toHaveProperty("heure_annoncee");
    expect(later.bus).toBeUndefined();
  });

  it("keep a bus late beyond its time while it is still to come, and only then", async () => {
    // Alternéo LI2 at the Gare de Saint-Pierre, audit of 04/11/2026: due at 13:33, announced at 13:55, it was left out
    // before the feed was read. On a network with a feed, departures are looked for an hour back.
    const all = await departures(findStops("gare routière Saint-Pierre").groups, NOW);
    // Due 15 to 25 minutes ago: announced in 2 minutes, under the half hour believed with no bus seen.
    const d = all.find((x) => x.reseau === "carjaune" && x.in <= -15 * 60 && x.in >= -25 * 60)!;
    const gone = all.find((x) => x.reseau === "carjaune" && x.in < -60 && x !== d)!;
    expect(d && gone).toBeTruthy();
    const feeds = new Map([["carjaune", { at: T0 - 20, trips: { [d.trip]: { [gtfsStop(d.stop)]: T0 + 120 } }, cancelled: [], alerts: [] } as rt.Realtime]]);
    const out = applyRealtime(all.filter((x) => x === d || x === gone), feeds, NOW);
    expect(out.map((x) => x.trip)).toEqual([d.trip]);
    expect(departureRow(out[0]).retard_min).toBeGreaterThanOrEqual(20);
    // Without a feed, a departure gone by is not given.
    expect(applyRealtime([d, gone], new Map(), NOW)).toEqual([]);
  });

  it("do not believe a bus early at the first stop of its trip, where it waits", async () => {
    // Alternéo at the Gare du Tampon, audit of 04/11/2026: the waiting bus given the time of each read, « 16 min d'avance ».
    const list = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).filter((x) => x.reseau === "carjaune" && x.in >= 20 * 60);
    const first = list.find((x) => x.premier)!;
    const on = list.find((x) => !x.premier)!;
    const feeds = new Map([["carjaune", { at: T0 - 20, trips: { [first.trip]: { [gtfsStop(first.stop)]: T0 }, [on.trip]: { [gtfsStop(on.stop)]: T0 + on.in - 5 * 60 } }, cancelled: [], alerts: [] } as rt.Realtime]]);
    const out = applyRealtime([first, on], feeds, NOW);
    expect(departureRow(out.find((x) => x.trip === first.trip)!)).not.toHaveProperty("heure_annoncee");
    // Further along its way, a bus may well be early.
    expect(departureRow(out.find((x) => x.trip === on.trip)!).retard_min).toBe(-5);
  });

  it("say a bus within a minute of its timetable on time, never a minute early for 13 seconds", async () => {
    const [d] = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).filter((x) => x.reseau === "carjaune" && x.in >= 10 * 60);
    const at = (late: number) => {
      const feeds = new Map([["carjaune", { at: T0 - 20, trips: { [d.trip]: { [gtfsStop(d.stop)]: T0 + d.in + late } }, cancelled: [], alerts: [] } as rt.Realtime]]);
      return departureRow(applyRealtime([d], feeds, NOW)[0]);
    };
    for (const late of [-13, -59, 40]) {
      const row = at(late);
      expect(row.retard_min, String(late)).toBe(0);
      expect(row.heure_annoncee, String(late)).toBe(row.heure);
    }
    expect(at(-75).retard_min).toBeLessThan(0);
  });

  it("are given by the tool with the alerts about these lines, and say so", async () => {
    const list = (await departures(findStops("gare routière Saint-Pierre").groups, NOW)).filter((d) => d.reseau === "carjaune" && d.in >= 0);
    const d = list[0];
    const route = cj.temps_reel!.lignes[d.route - cj.first_route];
    const feed: rt.Realtime = {
      at: T0 - 20,
      trips: { [d.trip]: { [gtfsStop(d.stop)]: T0 + d.in + 5 * 60 } },
      cancelled: [],
      alerts: [
        { titre: "Déviation à Saint-Pierre", lignes: [route], arrets: [], periodes: [] },
        { titre: "Travaux ailleurs", lignes: ["autre"], arrets: [], periodes: [] },
        { titre: "Fini", lignes: [route], arrets: [], periodes: [[T0 - 7200, T0 - 3600]] },
      ],
    };
    const r = body(await transports("gare routière Saint-Pierre", undefined, NOW, withFeed(feed)));
    expect(r.resume).toMatch(/\(dans \d+ min, retard de 5 min annoncé en direct\)/);
    expect(r.resume).toMatch(/d'après les annonces en direct des réseaux et les horaires publiés\u00a0: /);
    expect(r.departs.find((x: { retard_min?: number }) => x.retard_min === 5)).toBeTruthy();
    expect(r.info_trafic.map((a: { titre: string }) => a.titre)).toEqual(["Déviation à Saint-Pierre"]);
    expect(r.horaires).toMatch(/^Car Jaune : heures annoncées en direct par le réseau \(flux de \d\d:\d\d\)/);
    expect(JSON.stringify(r.sources)).toMatch(/GTFS-RT/);
    // Early or on time: the participle agrees with the noun before it (marketing).
    // A bus due in 5 minutes at least: 2 minutes early is still to come.
    const e = list.find((x) => x.in >= 5 * 60)!;
    const at = async (late: number) => body(await transports("gare routière Saint-Pierre", undefined, NOW, withFeed({ ...feed, trips: { [e.trip]: { [gtfsStop(e.stop)]: T0 + e.in + late } } }))).resume;
    expect(await at(-2 * 60)).toMatch(/, avance de 2 min annoncée en direct\)/);
    expect(await at(0)).toMatch(/, à l'heure, annoncé en direct\)/);
  });

  it("without a feed, stay the timetables as published", async () => {
    const r = body(await transports("gare routière Saint-Pierre", undefined, NOW));
    expect(r.horaires).toMatch(/^théoriques/);
    expect(r.departs.every((x: { retard_min?: number }) => x.retard_min === undefined)).toBe(true);
  });
});

describe("the media's headlines about the buses", () => {
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
  const info = (titre: string, min: number, communes: string[] = [], resume?: string): Info => ({ titre, ...(resume ? { resume } : {}), media: "Freedom", lien: `https://www.freedom.fr/${min}`, publie: ago(min), heure: true, communes, lieux: [], sujets: [] });
  // Freedom, 04/11/2026 at 13:24: what the timetable of a network without a feed cannot say (audit of 04/11/2026).
  const fil = { infos: [
    info("Saint-André : des jets de projectiles sur les bus, deux départs suspendus", 60, ["Saint-André"], "Le réseau Estival suspend les deux dernières rotations de la ligne 43."),
    info("Estival : la ligne 12 déviée à cause de travaux", 30),
    info("Le festival du film de Saint-André a commencé", 20, ["Saint-André"]),
    info("Car Jaune : grève sur le réseau ce matin", 90),
    info("Estival : la ligne 43 ne roulait pas hier soir", 13 * 60),
  ], prefecture: [] } as unknown as Fil;

  it("are those of the networks and lines asked, or about the buses of the commune, of the last 12 hours", () => {
    expect(busNews(fil, ["estival"], ["43"], ["Saint-André"], NOW).map((x) => x.titre)).toEqual(["Saint-André : des jets de projectiles sur les bus, deux départs suspendus"]);
    expect(busNews(fil, ["carjaune"], ["S1"], [], NOW).map((x) => x.titre)).toEqual(["Car Jaune : grève sur le réseau ce matin"]);
    expect(busNews(fil, ["estival"], ["12"], [], NOW)[0]).toMatchObject({ titre: "Estival : la ligne 12 déviée à cause de travaux", media: "Freedom", heure: "aujourd'hui à 07:00", lien: "https://www.freedom.fr/30" });
    expect(busNews(undefined, ["estival"], ["43"], [], NOW)).toEqual([]);
  });

  it("are given by the tool after the departures, with their medium and time, read from the news copy only", async () => {
    const store = new MemoryStore();
    store.put("actualites:fil", { value: fil, fetchedAt: NOW.getTime() });
    const r = body(await transports("gare routière Saint-Pierre", undefined, NOW, new Cache(store, () => NOW.getTime(), false)));
    expect(r.resume).toMatch(/ Dans les médias\u00a0: «\u00a0Car Jaune : grève sur le réseau ce matin\u00a0» \(Freedom, aujourd'hui à 06:00\)\.$/);
    expect(r.dans_les_medias).toHaveLength(1);
    expect(JSON.stringify(r.sources)).toMatch(/médias|Médias/);
  });
});
