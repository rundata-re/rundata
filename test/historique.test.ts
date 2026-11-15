import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { counted } from "../src/budget.js";
import { Cache } from "../src/cache.js";
import * as climat from "../src/providers/climat.js";
import { VEILLE, type Veille } from "../src/providers/meteofrance-stations.js";
import * as meteorOi from "../src/providers/meteor-oi.js";
import { LICENCES } from "../src/providers/autorisations.js";
import { historiqueMeteo, nothing, parseDate, period, TODAY } from "../src/tools/historique.js";

// Real rows of the archive (scripts/build-climat.py): eight stations, the years 2006, 2025 and 2026 up to 23 October.
const NOW = new Date("2026-10-24T08:00:00Z");
let db: DatabaseSync;

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./fixtures/historique/climat.sql", import.meta.url), "utf8"));
});
afterEach(() => climat.configure(undefined));

function plug() {
  let queries = 0;
  climat.configure({
    all: async <T>(sql: string, ...params: unknown[]) => {
      queries++;
      return db.prepare(sql).all(...(params as (string | number)[])) as T[];
    },
  });
  return () => queries;
}

const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("the period asked", () => {
  it("reads days, months and years, and ends yesterday", () => {
    expect(parseDate("01/10", false, "2026-10-23")).toBe("2026-10-01");
    expect(parseDate("01/12", false, "2026-10-23")).toBe("2025-12-01");
    expect(parseDate("2026-02", true, "2026-10-23")).toBe("2026-02-28");
    expect(parseDate("2006", false, "2026-10-23")).toBe("2006-01-01");
    expect(period(NOW, 14)).toEqual({ du: "2026-10-10", au: "2026-10-23" });
    expect(period(NOW, undefined, "2026-10")).toEqual({ du: "2026-10-01", au: "2026-10-23" });
    expect(period(NOW, undefined, "2026-10-24")).toHaveProperty("erreur");
    expect(period(NOW, undefined, "1950", "2000")).toHaveProperty("erreur");
  });
});

describe("historique_meteo", () => {
  it("says it is not there without the archive", async () => {
    const r = await historiqueMeteo(new Cache(), "Cilaos", {}, NOW);
    expect(r.isError).toBe(true);
  });

  it("takes rain, temperatures and sunshine from the best station for each, day by day", async () => {
    const queries = plug();
    const a = json(await historiqueMeteo(new Cache(), "Petite-Île", { jours: 14 }, NOW));
    expect(a.periode).toEqual({ du: "10/10/2026", au: "23/10/2026", jours: 14 });
    expect(a.stations.map((s: { station: string; mesure: string }) => [s.station, s.mesure])).toEqual([
      ["Saint-Pierre Pierrefonds (aéroport)", "pluie, températures et rafales"],
      ["Pont-Mathurin", "ensoleillement"],
      // 285 m below the place: the rain gauge above it too.
      ["Bras-Long", "pluie, à une autre altitude"],
    ]);
    expect(a.jours).toHaveLength(14);
    expect(a.jours[13]).toEqual({ date: "23/10/2026", pluie_mm: 0, tmin: 21.4, tmax: 28.6, soleil_h: 7.4, soleil_pct: 59, rafale_max_kmh: 44 });
    expect(a.pluie).toMatchObject({ total_mm: 1, jours_de_pluie: 1, normale_mm: 8 });
    expect(a.temperatures).toMatchObject({ maximales_moyenne: 28, maximales_normale: 27.6 });
    expect(a.ensoleillement).toMatchObject({ jours_gris: 2, jours_mesures: 14 });
    expect(a.resume).toMatch(/^Petite-Île, du 10\/10\/2026 au 23\/10\/2026 : 1 mm de pluie/);
    // Its records since 1999, the years after the stored ones included.
    expect(a.records.rafale_max_kmh).toEqual({ valeur: 180, date: "22/01/2002" });
    expect(a.records.par_mois[0].mois).toBe("octobre");
    expect(a.nature).toBe("mesure");
    expect(queries()).toBeLessThanOrEqual(4);
  });

  it("gives the rain also above the place when its rain gauge is more than 150 m below it, never instead of it", async () => {
    plug();
    // Petite-Île (306 m), from 1 to 23 October 2026: Pierrefonds, 285 m below, had 2 mm; Bras-Long, 204 m above, 12,7 mm.
    const a = json(await historiqueMeteo(new Cache(), "Petite-Île", { du: "01/10/2026", au: "23/10/2026" }, NOW));
    expect(a.stations[0]).toMatchObject({ station: "Saint-Pierre Pierrefonds (aéroport)", mesure: "pluie, températures et rafales", ecart_altitude_m: -285 });
    expect(a.pluie.total_mm).toBe(2);
    expect(a.pluie_autre_altitude).toMatchObject({ station: "Bras-Long", altitude_m: 510, distance_km: 16.8, ecart_altitude_m: 204, total_mm: 12.7, jours_mesures: 23 });
    expect(a.stations.map((s: { station: string; mesure: string }) => [s.station, s.mesure])).toContainEqual(["Bras-Long", "pluie, à une autre altitude"]);
    expect(a.resume).toContain("Saint-Pierre Pierrefonds (aéroport) est 285\u00a0m plus bas que Petite-Île\u00a0; plus haut, à Bras-Long (510\u00a0m, 16,8\u00a0km, direction NNO), 12,7\u00a0mm de pluie sur la même période.");
    // Within 150 m, one station as before.
    const c = json(await historiqueMeteo(new Cache(), "Cilaos", { du: "01/10/2026", au: "23/10/2026" }, NOW));
    expect(c.pluie_autre_altitude).toBeUndefined();
  });

  it("answers for one day, years back", async () => {
    plug();
    const a = json(await historiqueMeteo(new Cache(), "Sainte-Marie", { du: "24/10/2006" }, NOW));
    expect(a.jours).toEqual([{ date: "24/10/2006", pluie_mm: 0.6, tmin: 21.4, tmax: 27.3, soleil_h: 7.8, soleil_pct: 62, rafale_max_kmh: 40 }]);
    // Météo-France's day of rain, from 10 h to 10 h the next day, said: the hours of the day may show none of it.
    expect(a.resume).toMatch(/le 24\/10\/2006 : 0,6 mm de pluie à Saint-Denis Gillot \(aéroport\), du 24\/10 10\u00a0h au 25\/10 10\u00a0h\u00a0; minimale 21,4 °C, maximale 27,3 °C/);
  });

  it("goes month by month over a longer period, each against its normal", async () => {
    plug();
    const a = json(await historiqueMeteo(new Cache(), "Cilaos", { du: "2025-01", au: "2026-09" }, NOW));
    expect(a.jours).toBeUndefined();
    expect(a.mois).toHaveLength(21);
    expect(a.mois[0]).toMatchObject({ mois: "janvier 2025" });
    expect(a.mois[0].pluie_normale_mm).toBeGreaterThan(100);
  });

  it("tours the island's climates without a place, in one read", async () => {
    const queries = plug();
    const { value } = await counted(50, async () => json(await historiqueMeteo(new Cache(), undefined, {}, NOW)));
    expect(value.stations.map((s: { zone: string }) => s.zone)).toEqual([
      "nord (Saint-Denis)", "ouest (côte sous le vent)", "sud (Saint-Pierre)", "est (au vent)", "Hauts (Plaine des Cafres)", "cirque de Cilaos",
    ]);
    expect(value.stations[0].pluie).toMatchObject({ total_mm: 16.8, normale_mm: 43, rapport_a_la_normale: "39 %" });
    expect(value.resume).toMatch(/^La Réunion du 24\/09\/2026 au 23\/10\/2026/);
    expect(queries()).toBe(2);
  });
});

describe("historique_meteo, hour by hour", () => {
  // Real rows of the hourly archive (scripts/build-climat-h.py): Cilaos, Gillot and Plaine des Palmistes, October 2026 up to the 24th at 8 h.
  let hdb: DatabaseSync;
  beforeAll(() => {
    hdb = new DatabaseSync(":memory:");
    hdb.exec(readFileSync(new URL("./fixtures/historique/climat-h.sql", import.meta.url), "utf8"));
  });
  const both = () => {
    let queries = 0;
    const of = (d: DatabaseSync) => ({
      all: async <T>(sql: string, ...params: unknown[]) => {
        queries++;
        return d.prepare(sql).all(...(params as (string | number)[])) as T[];
      },
    });
    climat.configure(of(db), of(hdb));
    return () => queries;
  };

  it("says yesterday hour by hour: when the sun shone, the coldest and warmest hours, the strongest gust", async () => {
    both();
    const a = json(await historiqueMeteo(new Cache(), "Cilaos", { du: "2026-10-23" }, NOW));
    expect(a.resume).toContain("Heure par heure (station Cilaos) — 23/10 : pas de pluie\u00a0; soleil entre 8 h et 14 h\u00a0; 10,8 °C à 5 h, 25,8 °C à 12 h\u00a0; rafale max 27 km/h vers 13 h");
    expect(a.heure_par_heure.heures).toHaveLength(24);
    expect(a.heure_par_heure.heures[12]).toMatchObject({ heure: "23/10 12 h", temperature: 25.8, soleil_min: 56, vent_de: "SO" });
    expect(a.heure_par_heure.par_jour[0]).toMatchObject({ pluie_mm: 0, heures_ensoleillees: 6, tmax: { valeur: 25.8, heure: "12 h" } });
    expect(a.sources.map((x: { source: string }) => x.source).join()).toMatch(/horaires/);
  });

  it("sends today to meteo_actuelle when its first hours are asked, never « no station »", async () => {
    both();
    const a = json(await historiqueMeteo(new Cache(), "Saint-Pierre", { du: "2026-10-24" }, NOW));
    expect(a.resume).toContain(TODAY);
    expect(a.resume).not.toMatch(/Aucune station|lendemain/);
    expect(a.a_savoir[0]).toContain("Pour aujourd'hui depuis minuit (température la plus haute et la plus basse, pluie), voir meteo_actuelle");
  });

  it("names the rainy hours, each value being the hour that ends then", async () => {
    both();
    const a = json(await historiqueMeteo(new Cache(), "Plaine des Palmistes", { du: "2026-10-21" }, NOW));
    expect(a.resume).toContain("pluie entre 1 h et 2 h, entre 12 h et 15 h, entre 16 h et 18 h, entre 21 h et 22 h (4,4 mm, dont 1,8 mm en une heure, entre 14 h et 15 h)");
    expect(a.heure_par_heure.par_jour[0].heures_de_pluie).toContain("15 h : 1,8 mm");
  });

  it("gives last night, today up to the last hour published", async () => {
    both();
    const a = json(await historiqueMeteo(new Cache(), "Sainte-Marie", { du: "2026-10-24" }, NOW));
    expect(a.erreur).toBeUndefined();
    expect(a.heure_par_heure.stations[0].station).toBe("Saint-Denis Gillot (aéroport)");
    expect(a.heure_par_heure.heures.at(-1).heure).toBe("24/10 8 h");
    expect(a.resume).toContain("24/10 (jour incomplet, publié jusqu'à 8 h) : ");
    expect(a.heure_par_heure.jusqu_a).toBe("24/10/2026 8 h");
  });

  it("says a day cut short by the hours not published yet is incomplete, with its last hour, never as the whole day", async () => {
    both();
    // 25/10 at 1 h: yesterday's file stops at 8 h until the next one comes out.
    const night = new Date("2026-10-24T21:00:00Z");
    const a = json(await historiqueMeteo(new Cache(), "Sainte-Marie", { du: "2026-10-23", au: "2026-10-24", detail: "heure" }, night));
    expect(a.heure_par_heure.jusqu_a).toBe("24/10/2026 8 h");
    expect(a.heure_par_heure.heures.at(-1).heure).toBe("24/10 8 h");
    const [whole, cut] = a.heure_par_heure.par_jour;
    expect(whole.jour_incomplet).toBeUndefined();
    expect(cut).toMatchObject({ date: whole.date.replace("23", "24"), jusqu_a: "8 h" });
    expect(cut.jour_incomplet).toMatch(/^mesures publiées jusqu'à 8 h seulement : .*pas pour la journée entière$/);
    expect(a.resume).toContain("24/10 (jour incomplet, publié jusqu'à 8 h) : ");
    expect(a.resume).not.toMatch(/23 h\)|jusqu'à 23 h/);
  });

  it("says a day with no hour published yet is not published, with no figure for it", async () => {
    both();
    // 25/10 at 0 h 30, a period ending today: none of its hours is published yet.
    const night = new Date("2026-10-24T20:30:00Z");
    const a = json(await historiqueMeteo(new Cache(), "Sainte-Marie", { du: "2026-10-23", au: "2026-10-25", detail: "heure" }, night));
    const none = a.heure_par_heure.par_jour.at(-1);
    // Its date and why, nothing else: no total, no mean, no extreme.
    expect(none).toEqual({ date: "25/10/2026", jour_incomplet: "aucune heure de ce jour n'est encore publiée" });
    expect(a.resume).toContain("25/10 : pas encore publié");
    expect(a.resume).not.toMatch(/25\/10 : (?!pas encore publié)/);
    expect(a.heure_par_heure.jusqu_a).toBe("24/10/2026 8 h");
  });

  it("never calls a past day incomplete when its station falls silent early: a gap, not hours still to be published", async () => {
    both();
    // The same hours (none after 24/10 8 h) read days later.
    const later = json(await historiqueMeteo(new Cache(), "Sainte-Marie", { du: "2026-10-23", au: "2026-10-24", detail: "heure" }, new Date("2026-10-28T08:00:00Z")));
    expect(later.heure_par_heure.par_jour.map((d: { jour_incomplet?: string }) => d.jour_incomplet)).toEqual([undefined, undefined]);
    expect(later.resume).not.toContain("jour incomplet");
  });

  it("leaves the hours out over a longer period, or when asked by day", async () => {
    both();
    const long = json(await historiqueMeteo(new Cache(), "Cilaos", { jours: 14 }, NOW));
    expect(long.heure_par_heure).toBeUndefined();
    const forced = json(await historiqueMeteo(new Cache(), "Cilaos", { du: "2026-10-17", au: "2026-10-23", detail: "heure" }, NOW));
    expect(forced.heure_par_heure.heures).toHaveLength(7 * 24);
    const daily = json(await historiqueMeteo(new Cache(), "Cilaos", { du: "2026-10-23", detail: "jour" }, NOW));
    expect(daily.heure_par_heure).toBeUndefined();
  });

  it("stays within a few queries", async () => {
    const queries = both();
    await counted(50, async () => historiqueMeteo(new Cache(), "Cilaos", { du: "2026-10-22", au: "2026-10-23" }, NOW));
    // Daily: stations, years, records and the year after them; hourly: stations, months.
    expect(queries()).toBe(6);
  });
});

describe("station names", () => {
  it("are written as people write them", () => {
    expect(climat.stationName("97418110", "GILLOT-AEROPORT")).toBe("Saint-Denis Gillot (aéroport)");
    expect(climat.stationName("x", "PLAINE DES CAFRES")).toBe("Plaine des Cafres");
    expect(climat.stationName("x", "ST-LEU")).toBe("Saint-Leu");
    expect(climat.stationName("x", "ILET A VIDOT")).toBe("Ilet à Vidot");
  });
});

describe("nothing measured", () => {
  const now = new Date("2026-10-25T02:27:00+04:00");
  const LOADED = "Météo-France publie les mesures d'un jour le lendemain matin, et rundata.re les charge chaque jour vers midi (heure de La Réunion)";
  it("says that yesterday is not loaded yet, with the last day loaded, never that no station measured", () => {
    expect(nothing("Saint-Denis", { du: "2026-10-24", au: "2026-10-24" }, now, "2026-10-23")).toBe(
      `Les mesures du 24/10/2026 ne sont pas encore disponibles : ${LOADED}. Dernier jour disponible : 23/10/2026. Pour maintenant, meteo_actuelle.`,
    );
    expect(nothing("Saint-Denis", { du: "2026-10-22", au: "2026-10-24" }, now, "2026-10-22")).toMatch(/^Les mesures du 23\/10\/2026 au 24\/10\/2026 ne sont pas encore disponibles .* Dernier jour disponible : 22\/10\/2026\./);
    // Nothing read at all: no last day to give, and no « no station » either.
    expect(nothing("Saint-Denis", { du: "2026-10-24", au: "2026-10-24" }, now)).toBe(
      `Les mesures du 24/10/2026 ne sont peut-être pas encore disponibles : ${LOADED}. Réessayer plus tard\u00a0; pour maintenant, meteo_actuelle.`,
    );
  });
  it("sends today to meteo_actuelle, which has it since midnight, never « tomorrow » nor « no station »", async () => {
    expect(nothing("Saint-Pierre", { du: "2026-10-25", au: "2026-10-25" }, now, "2026-10-23")).toBe(TODAY);
    expect(TODAY).not.toMatch(/demain|lendemain/);
    expect(nothing("Saint-Pierre", { du: "2026-10-24", au: "2026-10-25" }, now, "2026-10-23")).toMatch(/Dernier jour disponible : 23\/10\/2026\. Pour maintenant, meteo_actuelle\. Aujourd'hui n'est pas dans cette archive/);
    // Without the hourly archive, today is outside the period: the same words.
    plug();
    expect(json(await historiqueMeteo(new Cache(), "Saint-Pierre", { du: "2026-10-25" }, now)).erreur).toBe(TODAY);
  });
  it("says that no station measured over an older or longer period, or when the days asked are loaded", () => {
    expect(nothing("Mafate", { du: "2026-10-01", au: "2026-10-20" }, now, "2026-10-24")).toBe("Aucune station ne mesurait à Mafate ou près de là sur cette période.");
    expect(nothing("Mafate", { du: "2026-09-25", au: "2026-10-24" }, now)).toMatch(/^Aucune station/);
    expect(nothing("Mafate", { du: "2026-10-24", au: "2026-10-24" }, now, "2026-10-24")).toMatch(/^Aucune station/);
  });
  it("answers « hier » before the day is loaded: the last day, no hint to donner_avis", async () => {
    const queries = plug();
    const a = json(await historiqueMeteo(new Cache(), "Saint-Denis", { du: "2026-10-24" }, now));
    expect(a.resume.trim()).toBe(`Les mesures du 24/10/2026 ne sont pas encore disponibles : ${LOADED}. Dernier jour disponible : 23/10/2026. Pour maintenant, meteo_actuelle.`);
    expect(a.signaler).toBeUndefined();
    // The last day comes from the rows already read: no query more.
    expect(queries()).toBe(2);
    // Three days up to yesterday: the two loaded, and the third said pending.
    const b = json(await historiqueMeteo(new Cache(), "Saint-Denis", { jours: 3 }, now));
    expect(b.jours.map((d: { date: string }) => d.date)).toEqual(["22/10/2026", "23/10/2026", "24/10/2026"]);
    expect(b.resume).toMatch(/ Les mesures du 24\/10\/2026 ne sont pas encore disponibles : .* Dernier jour disponible : 23\/10\/2026\.$/);
    // Today: never « hier » as the last day published, nor « tomorrow »: meteo_actuelle has it since midnight.
    expect(period(now, undefined, "2026-10-25")).toEqual({ erreur: TODAY });
    expect(period(now, undefined, "2026-10-27")).toEqual({ erreur: `Pas encore de mesure pour cette date : ${LOADED}. Pour aujourd'hui, voir meteo_actuelle.` });
  });

  // The day before as the scheduled event kept it at 00:20 (providers/meteofrance.ts keepVeille).
  const kept = async (stations: Veille["stations"], jour = "2026-10-24") => {
    const c = new Cache();
    await c.keep(VEILLE, { jour, complet: true, stations } satisfies Veille);
    return c;
  };

  it("gives yesterday 0 h to 24 h from the hourly readings until the day is loaded, as the hours added up", async () => {
    plug();
    const c = await kept({ "97418110": { rr: 3.2, tn: 21.4, tx: 27.9 }, "97416463": { rr: 0 } });
    const a = json(await historiqueMeteo(c, "Saint-Denis", { du: "2026-10-24" }, now));
    // Known since 00:20: never « not available yet » beside it, nor Météo-France's daily value.
    expect(a.resume.trim()).toBe(
      "Hier, 24/10/2026 de 0 h à 24 h (heure de La Réunion), cumul des mesures horaires de Météo-France, pas la valeur quotidienne officielle\u00a0: " +
        "pluie 3,2 mm, températures de 21,4 °C à 27,9 °C à Saint-Denis Gillot (aéroport).",
    );
    expect(a.hier_provisoire).toMatchObject({
      jour: "24/10/2026", periode: "0 h–24 h, heure de La Réunion", nature: "cumul des mesures horaires",
      pluie: { mm: 3.2, station: "Saint-Denis Gillot (aéroport)", altitude_m: 8 },
      temperatures: { min: 21.4, max: 27.9, station: "Saint-Denis Gillot (aéroport)" },
    });
    expect(a.hier_provisoire.a_savoir).toContain("pas la valeur quotidienne officielle de climatologie, qui compte la pluie de 10 h à 10 h le lendemain");
    expect(a.signaler).toBeUndefined();
    // Météo-France's own day, 10 h to 10 h, is said with it.
    expect(a.a_savoir).toContain("La pluie d'un jour est celle tombée de 10 h ce jour-là à 10 h le lendemain (heure de La Réunion), comme Météo-France la compte.");
    expect(a.sources.map((s: { source: string }) => s.source)).toContain("Stations Météo-France (mesures toutes les 6 minutes)");
  });

  it("takes the temperatures from the nearest station that has all their hours, when the rain's station has not", async () => {
    plug();
    const c = await kept({ "97418110": { rr: 0.4, tx: 28.1 }, "97418123": { rr: 0.6, tn: 21.9, tx: 28.4 } });
    const a = json(await historiqueMeteo(c, "Saint-Denis", { du: "2026-10-24" }, now));
    expect(a.resume).toMatch(/officielle\u00a0: pluie 0,4 mm à Saint-Denis Gillot \(aéroport\), températures de 21,9 °C à 28,4 °C à La Mare - CIRAD\.$/);
    expect(a.hier_provisoire.pluie.station).toBe("Saint-Denis Gillot (aéroport)");
    expect(a.hier_provisoire.temperatures).toMatchObject({ min: 21.9, max: 28.4, station: "La Mare - CIRAD" });
    // The rain alone when no station has every hour of both temperatures.
    const r = json(await historiqueMeteo(await kept({ "97418110": { rr: 0.4, tx: 28.1 } }), "Saint-Denis", { du: "2026-10-24" }, now));
    expect(r.resume).toMatch(/officielle\u00a0: pluie 0,4 mm à Saint-Denis Gillot \(aéroport\)\.$/);
    expect(r.hier_provisoire).not.toHaveProperty("temperatures");
  });

  it("gives yesterday at each station of the island's tour, until the day is loaded", async () => {
    plug();
    const c = await kept({ "97418110": { rr: 3.2, tn: 21.4, tx: 27.9 }, "97416463": { rr: 0, tn: 19.8, tx: 26.5 }, "97424410": { tn: 12.1, tx: 22 } });
    const a = json(await historiqueMeteo(c, undefined, { jours: 7 }, now));
    expect(a.resume).toContain(
      " Hier, 24/10/2026 de 0 h à 24 h, cumul des mesures horaires de Météo-France, pas la valeur quotidienne officielle\u00a0: " +
        "Saint-Denis Gillot (aéroport) 3,2 mm\u00a0; Saint-Pierre Pierrefonds (aéroport) 0 mm\u00a0; ",
    );
    expect(a.resume).not.toMatch(/pas encore disponibles/);
    expect(a.hier_provisoire.nature).toBe("cumul des mesures horaires");
    expect(a.hier_provisoire.stations[0]).toEqual({ zone: "nord (Saint-Denis)", station: "Saint-Denis Gillot (aéroport)", pluie_mm: 3.2, temperature_min: 21.4, temperature_max: 27.9 });
    expect(a.sources.map((s: { source: string }) => s.source)).toContain("Stations Météo-France (mesures toutes les 6 minutes)");
    // Not kept for that day: « not yet », as before.
    const none = json(await historiqueMeteo(await kept({ "97418110": { rr: 3.2 } }, "2026-10-23"), undefined, { jours: 7 }, now));
    expect(none.hier_provisoire).toBeUndefined();
    expect(none.resume).toMatch(/pas encore disponibles/);
  });

  it("gives no provisional day once yesterday is loaded, nor one kept for another day", async () => {
    plug();
    const loaded = json(await historiqueMeteo(await kept({ "97418110": { rr: 3.2 } }, "2026-10-23"), "Saint-Denis", { du: "2026-10-23" }, new Date("2026-10-24T08:00:00Z")));
    expect(loaded.hier_provisoire).toBeUndefined();
    const other = json(await historiqueMeteo(await kept({ "97418110": { rr: 3.2 } }, "2026-10-23"), "Saint-Denis", { du: "2026-10-24" }, now));
    expect(other.hier_provisoire).toBeUndefined();
    expect(other.resume).not.toMatch(/cumul des mesures horaires/);
  });
});

describe("MétéoR-OI's days", () => {
  const at = new Date("2026-11-19T08:00:00Z");
  // Marla's days as the pass of 23:53 kept them (providers/meteor-oi.ts ajouterJour).
  const withDays = async () => {
    const c = new Cache();
    let j = meteorOi.ajouterJour(undefined, "2026-11-16", { MDM1570: { pluie_mm: 4.2, tmin: 9.8, tmax: 19.4, jusqu_a: "23:50" } });
    j = meteorOi.ajouterJour(j, "2026-11-17", { MDM1570: { pluie_mm: 11.5, tmin: 10.1, tmax: 17.9, jusqu_a: "23:50" } });
    j = meteorOi.ajouterJour(j, "2026-11-18", { MDM1570: { pluie_mm: 0, tmin: 8.7, tmax: 20.3, jusqu_a: "23:53" } });
    await c.keep(meteorOi.JOURS_KEY, j);
    return c;
  };

  it("gives an amateur station's days last, never first, with the association's credit and link, from its first day kept", async () => {
    plug();
    const a = json(await historiqueMeteo(await withDays(), "Marla", { du: "2026-11-15", au: "2026-11-18", detail: "jour" }, at));
    // After Météo-France's sentence, never before it.
    expect(a.resume.startsWith("Les mesures du 15/11/2026 au 18/11/2026 ne sont pas encore disponibles")).toBe(true);
    expect(a.resume.endsWith(
      " Aussi, station amateur (MétéoR-OI), fiabilité non vérifiée, à Marla (1570\u00a0m, 0,5\u00a0km, direction NO)\u00a0: 15,7\u00a0mm de pluie, températures de 8,7\u00a0°C à 20,3\u00a0°C " +
        "du 16/11/2026 au 18/11/2026, de minuit à minuit (Données : MétéoR-OI, licence CC BY-NC 4.0, https://www.meteor-oi.re).",
    )).toBe(true);
    expect(Object.keys(a).at(-1)).toBe("station_amateur");
    expect(a.station_amateur).toEqual({
      station: "Marla", nature: "station amateur (MétéoR-OI), fiabilité non vérifiée", altitude_m: 1570, distance_km: 0.5, direction: "NO",
      du: "16/11/2026", au: "18/11/2026", jours: 3, jours_mesures: 3, pluie_mm: 15.7, temperature_min: 8.7, temperature_max: 20.3,
      a_savoir: "Jour compté de minuit à minuit (heure de La Réunion), comme l'association le compte, relevé à 23:53\u00a0: les 7 dernières minutes de chaque jour au moins y manquent. Jours gardés par rundata.re depuis le 16/11/2026.",
      credit: "Données : MétéoR-OI, licence CC BY-NC 4.0", lien: "https://www.meteor-oi.re", licence: "https://creativecommons.org/licenses/by-nc/4.0/deed.fr",
    });
    // Placed as the association's map places it: no coordinates.
    expect(JSON.stringify(a.station_amateur)).not.toMatch(/lat|lon/);
    expect(a.sources.map((x: { attribution: string }) => x.attribution)).toEqual(["Météo-France", "Données : MétéoR-OI, licence CC BY-NC 4.0"]);
  });

  it("reads nothing more for a period before its first day, and gives nothing once the agreement is withdrawn", async () => {
    plug();
    const c = await withDays();
    let reads = 0;
    const kept = c.kept.bind(c);
    c.kept = (async (key: string) => (key === meteorOi.JOURS_KEY && reads++, kept(key))) as typeof c.kept;
    expect(json(await historiqueMeteo(c, "Marla", { du: "2026-10-01", au: "2026-10-23", detail: "jour" }, at)).station_amateur).toBeUndefined();
    expect(reads).toBe(0);
    const l = LICENCES[meteorOi.AUTORISATION];
    const before = l.etat;
    l.etat = "retiree";
    try {
      expect(json(await historiqueMeteo(c, "Marla", { du: "2026-11-16", au: "2026-11-18", detail: "jour" }, at)).station_amateur).toBeUndefined();
      expect(reads).toBe(0);
    } finally {
      l.etat = before;
    }
  });

  it("never gives a station of « faible » pertinence, nor one that kept too few of the days asked", async () => {
    plug();
    // Saint-Denis: no MétéoR-OI station near enough.
    expect(json(await historiqueMeteo(await withDays(), "Saint-Denis", { du: "2026-11-16", au: "2026-11-18", detail: "jour" }, at)).station_amateur).toBeUndefined();
    const c = new Cache();
    await c.keep(meteorOi.JOURS_KEY, meteorOi.ajouterJour(undefined, "2026-11-16", { MDM1570: { pluie_mm: 4.2, jusqu_a: "23:50" } }));
    // One day kept of three asked since the first: under 60 %.
    const few = { ...(await c.kept<meteorOi.Jours>(meteorOi.JOURS_KEY))!.value, debut: "2026-11-10" };
    await c.keep(meteorOi.JOURS_KEY, few);
    expect(json(await historiqueMeteo(c, "Marla", { du: "2026-11-16", au: "2026-11-18", detail: "jour" }, at)).station_amateur).toBeUndefined();
  });
});

