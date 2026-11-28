import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transit from "../src/providers/transit.js";
import { CHANGE_S, chosen, type End, endOf, journeys, type Journey, ROWS_MAX, ZONE_MAX } from "../src/tools/itineraire.js";
import { answer, askedOf, itinerairePage, journeyForm } from "../src/web/itineraire.js";
import { transports } from "../src/tools/transports.js";
import { bases } from "./contexte.js";
const donnerTransit = (d?: transit.TransitDb) => bases({ transit: d });

// Rows of the D1 database read by the searches below, from the networks' GTFS of 31/10/2026 (scripts/build-transit.py).
const rows = JSON.parse(readFileSync(new URL("./fixtures/transit/itineraire.json", import.meta.url), "utf8")) as Record<string, Record<string, { id: number }[]>>;
let reads = 0;
const fake: transit.TransitDb = {
  all: async <T>(sql: string, keys: unknown) => {
    reads++;
    const table = /FROM passes/.test(sql) ? "passes" : /FROM pattern_stops/.test(sql) ? "pattern_stops" : "patterns";
    return (JSON.parse(String(keys)) as [string, number][]).flatMap(([feed, id]) => rows[feed]?.[table]?.filter((r) => r.id === id).map((r) => ({ feed, ...r })) ?? []) as T[];
  },
};
beforeEach(() => {
  reads = 0;
  donnerTransit(fake);
});
afterEach(() => donnerTransit(undefined));

const hm = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
const said = (j: Journey) => `${hm(j.depart)} ${j.legs.map((l) => `${l.ligne} ${transit.stop(l.de).nom} ${hm(l.depart)}-${transit.stop(l.a).nom} ${hm(l.arrivee)}`).join(" / ")} ${hm(j.arrivee)}`;
// Saturday 31/10/2026, 14:00 in La Réunion.
const NOW = new Date("2026-10-31T10:00:00Z");

describe("the start and the end of a journey", () => {
  it("takes a commune alone for its main stops, at most 80", () => {
    const e = endOf("Petite-Île")!;
    expect(e).toMatchObject({ sorte: "commune", nom: "Petite-Île" });
    expect(e.stops.size).toBeLessThanOrEqual(ZONE_MAX);
    expect([...e.stops.keys()].map((id) => transit.stop(id).nom)).toContain("Croisée Petite-Île");
  });

  it("finds the airport's stops of both networks that serve it", () => {
    const e = endOf("aéroport Roland-Garros")!;
    expect(e.sorte).toBe("arret");
    expect(new Set([...e.stops.keys()].map((id) => transit.stop(id).reseau))).toEqual(new Set(["carjaune", "citalis"]));
  });

  it("takes a place for the stops around it, with the walk, when a stop's name has only some of its words", () => {
    const e = endOf("plage de l'Hermitage")!;
    expect(e.sorte).toBe("lieu");
    expect(Math.max(...e.stops.values())).toBeGreaterThan(0);
  });

  it("finds nothing for words that are neither a stop nor a place", () => {
    expect(endOf("xyzzy plugh")).toBeUndefined();
  });
});

describe("a commune asked: the bus left, or taken, in its centre (item of 24/11)", () => {
  it("ranks a commune's bus station first, then its stops by their distance to its centre", () => {
    const e = endOf("Saint-Pierre")!;
    const gare = [...e.centre!].filter(([, m]) => m === 0).map(([id]) => transit.stop(id).nom);
    expect(new Set(gare)).toEqual(new Set(["Gare de St-Pierre", "Gare de Saint-Pierre", "Gare Routière de St Pierre"]));
    // Cilaos has no bus station: Le Vieux Cep, by Cilaos Ville, before Mare Sèche, at the town's edge.
    const c = endOf("Cilaos")!.centre!;
    const at = (nom: string) => Math.min(...[...c].filter(([id]) => transit.stop(id).nom === nom).map(([, m]) => m));
    expect(at("Le Vieux Cep")).toBeLessThan(at("Mare Sèche"));
  });

  it("leaves the 60 at Le Vieux Cep, by Cilaos Ville, not six minutes earlier at Mare Sèche (Saint-Leu → Cilaos, 24/11)", async () => {
    const r = await journeys(endOf("Saint-Leu")!, endOf("Cilaos")!, 20261124, 7 * 3600);
    expect(r.trajets.length).toBeGreaterThan(0);
    for (const j of r.trajets) {
      const last = j.legs.at(-1)!;
      expect(last.ligne).toBe("60");
      expect(transit.stop(last.a).nom).toBe("Le Vieux Cep");
    }
    expect(r.trajets.map(said)).toContain("08:31 O2 Mairie de St-Leu 08:31-Gare de St-Louis 09:05 / 60 Echangeur de Bel Air 09:16-Le Vieux Cep 10:32 10:32");
  });
});

describe("the journeys", () => {
  it("go from Petite-Île to the airport on Monday 2/11 before 18:00 with one change at Saint-Pierre (a Facebook group's question)", async () => {
    const r = await journeys(endOf("Petite-Île")!, endOf("aéroport Roland-Garros")!, 20261102, 18 * 3600, true);
    expect(r.trajets.length).toBeGreaterThan(0);
    expect(r.trajets.every((j) => j.arrivee <= 18 * 3600 && j.legs.length === 2)).toBe(true);
    expect(r.trajets.map(said)).toContain("12:15 S3 Croisée Petite-Île 12:15-Gare de St-Pierre 12:41 / T Gare de St-Pierre 13:00-Aéroport Roland Garros 15:16 15:16");
    // The change: the bus station's two bays, a walk under 400 m, with the time to change.
    const j = r.trajets.find((x) => x.legs[1].ligne === "T")!;
    expect(j.legs[1].depart - j.legs[0].arrivee).toBeGreaterThanOrEqual((j.marche_changement ?? 0) + CHANGE_S);
    expect(j.legs.every((l) => l.trajet?.startsWith("/bus/trajet/carjaune/"))).toBe(true);
  });

  it("read the database three times, under the cap", async () => {
    const r = await journeys(endOf("Petite-Île")!, endOf("aéroport Roland-Garros")!, 20261102, 18 * 3600, true);
    expect(r.lectures.requetes).toBe(3);
    expect(reads).toBe(3);
    expect(r.lectures.lignes).toBeLessThanOrEqual(ROWS_MAX);
  });

  it("go up to Mont-Vert-les-Hauts on a Sunday to arrive before 14:00 (the 12:30 bus, line 5)", async () => {
    const r = await journeys(endOf("Pôle d'échange Marché couvert, Saint-Pierre")!, endOf("Chemin des Bambous")!, 20261101, 14 * 3600, true);
    expect(r.trajets.map(said)).toContain("12:30 5 Pôle d'Échange Marché Couvert 12:30-Chemin des Bambous 13:01 13:01");
  });

  it("are none after the last bus of the day, never the next morning's bus as if it were that day's", async () => {
    const r = await journeys(endOf("Chemin des Bambous")!, endOf("Pôle d'échange Marché couvert, Saint-Pierre")!, 20261101, 15 * 3600 + 40 * 60, false);
    expect(r.trajets).toEqual([]);
    // The whole day was looked through, to 03:00 the next morning.
    expect(r.fenetre.a).toBe(27 * 3600);
  });
});

describe("keeping the journeys worth taking", () => {
  const j = (depart: number, arrivee: number, legs = 1) => ({ legs: Array.from({ length: legs }, (_, k) => ({ ligne: `L${k}`, depart: depart + k, arrivee })), marche_depart: 0, marche_arrivee: 0, depart, arrivee }) as Journey;
  it("drops one that leaves sooner and arrives later than another, or as soon with more changes", () => {
    const kept = chosen([j(100, 900), j(200, 800), j(200, 800, 2), j(300, 1000)], 0, 1000, false);
    expect(kept.map((x) => [x.depart, x.arrivee, x.legs.length])).toEqual([[200, 800, 1], [300, 1000, 1]]);
  });
  it("keeps the last 5 to leave and arrive before the time, the last first", () => {
    const kept = chosen(Array.from({ length: 8 }, (_, i) => j(i * 100, i * 100 + 50)), 0, 700, true);
    expect(kept.map((x) => x.depart)).toEqual([600, 500, 400, 300, 200]);
  });
});

describe("the page", () => {
  it("has a form that needs no script, filled with what was asked", () => {
    const f = journeyForm({ de: "Petite-Île", a: "aéroport", jour: "2026-11-02", heure: "18:00", arrivee: true });
    expect(f).toContain('method="get"');
    expect(f).toContain('value="Petite-Île"');
    expect(f).toMatch(/value="arrivee" checked/);
    expect(f).not.toContain("<script");
    // It sends to the results, and offers no day before today.
    expect(f).toContain('action="/bus/itineraire#trajets"');
    expect(journeyForm({}, "2026-10-31")).toContain('type="date" min="2026-10-31" value=""');
  });

  it("reads what the address asks, and nothing without a start and an end", () => {
    expect(askedOf(new URLSearchParams("de=Petite-%C3%8Ele&a=a%C3%A9roport&sens=arrivee&jour=2026-11-02&heure=18%3A00"))).toEqual({ de: "Petite-Île", a: "aéroport", jour: "2026-11-02", heure: "18:00", arrivee: true });
    expect(askedOf(new URLSearchParams("de=Petite-%C3%8Ele"))).toBeUndefined();
    // A day or a time that is not one: now.
    expect(askedOf(new URLSearchParams("de=a&a=b&jour=demain&heure=25%3A00"))).toMatchObject({ jour: "", heure: "" });
  });

  it("lists the journeys, says they are timetables, and that a commune stands for its main stops", async () => {
    const r = await answer({ de: "Petite-Île", a: "aéroport Roland-Garros", jour: "2026-11-02", heure: "18:00", arrivee: true }, NOW);
    expect(r.quand).toBe("lundi 2 novembre, pour arriver avant 18:00");
    const page = itinerairePage("https://rundata.re", r).replaceAll("&#39;", "'");
    expect(page).toContain("Résultats pour les principaux arrêts de Petite-Île : précisez l'arrêt pour un quartier.");
    expect(page).toContain("Horaires prévus par les réseaux, pas la position des bus en direct");
    expect(page).toContain("De Petite-Île (principaux arrêts) à l'arrêt Aéroport Roland-Garros, lundi 2 novembre, pour arriver avant 18:00.");
    // The page opens on the results; the tab says the journey understood.
    expect(page).toContain('<section id="trajets" tabindex="-1" aria-label="Trajets">');
    expect(page).toContain("<title>Petite-Île → Aéroport Roland-Garros en bus · 974</title>");
    // The bus to take first: the one leaving last.
    expect(page.indexOf("14:22 → 17:39")).toBeLessThan(page.indexOf("12:15 → 15:16"));
    expect(page).toContain("1 correspondance");
    // The stops' names in the steps as in our sentences; the line's direction as the network writes it.
    expect(page).toContain("descendre à Gare de Saint-Pierre</li>");
    expect(page).toContain("Changement : environ 1 min à pied jusqu'à Gare de Saint-Pierre.");
    expect(page).toContain("descendre à Aéroport Roland-Garros, Sainte-Marie</li>");
    expect(page).toContain("vers St-Pierre par le Grand Brûlé");
    // « vers Aéroport Roland Garros par les Plages »: a direction, the network's words.
    expect(page).toContain("vers Aéroport Roland Garros par les Plages");
    expect(page).not.toMatch(/(?:à|jusqu'à) Gare de St-Pierre|à Aéroport Roland Garros,|St-Pierre : <a/);
    expect(page).toContain('<meta name="robots" content="noindex">');
  });

  it("writes « des » and « d' » in a stop's name the way we write them, in the steps too", async () => {
    const r = await answer({ de: "Pôle d'échange Marché couvert, Saint-Pierre", a: "Chemin des Bambous", jour: "2026-11-01", heure: "14:00", arrivee: true }, NOW);
    const page = itinerairePage("https://rundata.re", r).replaceAll("&#39;", "'");
    expect(page).toContain("descendre à Chemin des Bambous");
    expect(page).toContain("Pôle d'Échange Marché Couvert");
    expect(page).not.toMatch(/Chemin Des|Pôle D'/);
  });

  it("says there is no more bus that day after the last one", async () => {
    const r = await answer({ de: "Chemin des Bambous", a: "Pôle d'échange Marché couvert, Saint-Pierre", jour: "2026-11-01", heure: "15:40", arrivee: false }, NOW);
    expect(itinerairePage("https://rundata.re", r).replaceAll("&#39;", "'")).toContain("Plus aucun trajet direct ni avec une seule correspondance ce jour-là après 15:40, d'après les horaires prévus.");
  });

  it("says which end it did not find", async () => {
    const r = await answer({ de: "xyzzy plugh", a: "aéroport", jour: "", heure: "", arrivee: false }, NOW);
    const page = itinerairePage("https://rundata.re", r, undefined, NOW);
    expect(page).toContain("Départ non trouvé : « xyzzy plugh ».");
    expect(page).toContain('<section id="trajets" tabindex="-1"');
    // Never the text typed in the title: it stays in the browser's history.
    expect(page).toContain("<title>Erreur : départ non trouvé · Trajet en bus · 974</title>");
    expect(reads).toBe(0);
    const both = await answer({ de: "xyzzy", a: "plugh", jour: "", heure: "", arrivee: false }, NOW);
    expect(itinerairePage("https://rundata.re", both, undefined, NOW)).toContain("<title>Erreur : départ et arrivée non trouvés · Trajet en bus · 974</title>");
    const end = await answer({ de: "aéroport", a: "xyzzy", jour: "", heure: "", arrivee: false }, NOW);
    expect(itinerairePage("https://rundata.re", end, undefined, NOW)).toContain("<title>Erreur : arrivée non trouvée · Trajet en bus · 974</title>");
  });

  it("does not search a day gone by, and keeps the form filled", async () => {
    const r = await answer({ de: "Petite-Île", a: "aéroport", jour: "2020-01-01", heure: "08:00", arrivee: false }, NOW);
    expect(r).toMatchObject({ passee: true });
    expect(reads).toBe(0);
    const page = itinerairePage("https://rundata.re", r, undefined, NOW).replaceAll("&#39;", "'");
    expect(page).toContain("Cette date est passée : choisissez aujourd'hui ou un jour à venir.");
    expect(page).toContain("<title>Erreur : date passée · Trajet en bus · 974</title>");
    expect(page).toContain('value="Petite-Île"');
    expect(page).toContain('type="date" min="2026-10-31" value="2020-01-01"');
  });

  it("says the time as HH:MM, and the year only for another year", async () => {
    const r = await answer({ de: "xyzzy", a: "aéroport", jour: "2027-01-01", heure: "08:00", arrivee: false }, NOW);
    expect(r.quand).toBe("vendredi 1er janvier 2027, à partir de 08:00");
    expect((await answer({ de: "xyzzy", a: "aéroport", jour: "2026-11-02", heure: "08:00", arrivee: false }, NOW)).quand).toBe("lundi 2 novembre, à partir de 08:00");
    expect((await answer({ de: "xyzzy", a: "aéroport", jour: "", heure: "", arrivee: false }, NOW)).quand).toBe("aujourd'hui, à partir de 14:00");
  });

  it("says the hours looked through as HH:MM", () => {
    const de: End = { nom: "Église Petite-Île", sorte: "arret", stops: new Map() };
    const a: End = { nom: "Aéroport Roland Garros", sorte: "arret", stops: new Map() };
    const r = { asked: { de: "x", a: "y", jour: "", heure: "", arrivee: false }, quand: "aujourd'hui, à partir de 08:00", heure: "08:00", de, a, search: { trajets: [], lectures: { requetes: 0, lignes: 0 }, fenetre: { de: 8 * 3600, a: 11 * 3600 } } };
    expect(itinerairePage("https://rundata.re", r, undefined, NOW)).toContain("entre 08:00 et 11:00.");
  });

  it("says in one line when both ends are communes", () => {
    const town = (nom: string): End => ({ nom, sorte: "commune", commune: nom, stops: new Map() });
    const r = (de: End, a: End) => ({ asked: { de: "x", a: "y", jour: "", heure: "", arrivee: false }, quand: "aujourd'hui, à partir de 08:00", heure: "08:00", de, a, search: { trajets: [], lectures: { requetes: 0, lignes: 0 }, fenetre: { de: 0, a: 86400 } } });
    const notes = (p: string) => p.replaceAll("&#39;", "'").match(/<p class="note">Résultats pour[^<]*<\/p>/g);
    expect(notes(itinerairePage("https://rundata.re", r(town("Saint-Denis"), town("Saint-Denis")), undefined, NOW))).toEqual([
      `<p class="note">Résultats pour les principaux arrêts de Saint-Denis, au départ comme à l'arrivée : précisez l'arrêt pour un quartier.</p>`,
    ]);
    expect(notes(itinerairePage("https://rundata.re", r(town("Le Port"), town("Saint-Pierre")), undefined, NOW))).toEqual([
      `<p class="note">Résultats pour les principaux arrêts du Port et de Saint-Pierre : précisez l'arrêt pour un quartier.</p>`,
    ]);
    expect(itinerairePage("https://rundata.re", r(town("Le Port"), town("Saint-Pierre")), undefined, NOW)).toContain("<title>Le Port → Saint-Pierre en bus · 974</title>");
  });
});

describe("the transports tool, asked a trip", () => {
  const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
  // Monday 2/11/2026, 11:00 in La Réunion.
  const LUNDI = new Date("2026-11-02T07:00:00Z");

  it("gives the journeys themselves, from the timetables, with the page that searches others", async () => {
    const r = body(await transports("Petite-Île vers aéroport Roland-Garros", undefined, LUNDI));
    expect(r.resume).toBe(
      `Trajets en bus de Petite-Île (principaux arrêts) à l'arrêt Aéroport Roland-Garros, aujourd'hui, à partir de 11:00, d'après les horaires prévus par les réseaux : ${r.trajets.length} trouvé${r.trajets.length > 1 ? "s" : ""}, le premier part à ${r.trajets[0].depart} et arrive à ${r.trajets[0].arrivee}.`,
    );
    expect(r.trajets.length).toBeGreaterThan(0);
    expect(r.trajets.length).toBeLessThanOrEqual(5);
    const j = r.trajets.find((x: { depart: string }) => x.depart === "12:15");
    expect(j).toEqual({
      depart: "12:15",
      arrivee: "15:16",
      duree: "3 h 01",
      correspondances: 1,
      etapes: [
        expect.stringMatching(/^12:15 Croisée Petite-Île : ligne S3 \(Car Jaune\) vers /),
        "12:41 descendre à Gare de Saint-Pierre",
        "Changement : environ 1 min à pied jusqu'à Gare de Saint-Pierre",
        expect.stringMatching(/^13:00 Gare de Saint-Pierre : ligne T \(Car Jaune\) vers /),
        "15:16 descendre à Aéroport Roland-Garros, Sainte-Marie",
      ],
    });
    expect(r.page).toBe("https://rundata.re/bus/itineraire?de=Petite-%C3%8Ele&a=a%C3%A9roport%20Roland-Garros");
    expect(r.horaires).toMatch(/^théoriques/);
    expect(r).not.toHaveProperty("trajet_en_bus");
    expect(r).not.toHaveProperty("departs");
    // One search: the passes at both ends, then the trips and their stops.
    expect(reads).toBeLessThanOrEqual(5);
  });

  it("says when no bus is left that day, then the departures at the start", async () => {
    const tard = new Date("2026-11-01T11:40:00Z");
    const r = body(await transports("Chemin des Bambous vers Pôle d'échange Marché couvert, Saint-Pierre", undefined, tard));
    expect(Object.keys(r)[0]).toBe("trajet_en_bus");
    expect(r.trajet_en_bus).toContain("Plus aucun trajet direct ni avec une seule correspondance ce jour-là après 15:40, d'après les horaires prévus.");
    expect(r.trajet_en_bus).toContain("https://rundata.re/bus/itineraire?de=Chemin%20des%20Bambous&a=");
    // Maybe with two changes: the departures at its start.
    expect(r).not.toHaveProperty("trajets");
    expect(r).toHaveProperty("departs");
  });

  it("an end it does not find: the departures at the start, after the page and what it did not find", async () => {
    const r = body(await transports("aéroport vers xyzzy plugh", undefined, LUNDI));
    expect(Object.keys(r)[0]).toBe("trajet_en_bus");
    expect(r.trajet_en_bus).toBe(
      "Arrivée non trouvée : « xyzzy plugh ». La page Trajet en bus de rundata.re cherche un trajet sur les horaires de tous les réseaux de l'île : https://rundata.re/bus/itineraire?de=a%C3%A9roport&a=xyzzy%20plugh. Donner ce lien à l'utilisateur.",
    );
    expect(r).toHaveProperty("departs");
  });

  it("reads « de A à B » as a trip when both ends are found, else as a stop and its commune", async () => {
    const r = body(await transports("de Petite-Île à l'aéroport Roland-Garros", undefined, LUNDI));
    expect(r.trajets.length).toBeGreaterThan(0);
    expect(r.page).toBe("https://rundata.re/bus/itineraire?de=Petite-%C3%8Ele&a=l'a%C3%A9roport%20Roland-Garros");
    const stop = body(await transports("de Croisée à xyzzy", undefined, LUNDI));
    expect(stop).not.toHaveProperty("trajets");
    expect(stop).not.toHaveProperty("trajet_en_bus");
  });
});
