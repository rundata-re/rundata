import { describe, expect, it } from "vitest";
import { uvWarnings } from "../src/tools/prevision.js";
import { ecartsCourts } from "../src/tools/format.js";
import { communePage } from "../src/web/commune.js";
import type { HomeData, PlaceData, StationAnswer, StationNow } from "../src/web/data.js";
import { lesJours, meteoLive, meteoPage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

// The audit of the data of 04/11/2026: the weather, the forecast and the sea.
const NOW = new Date("2026-11-04T09:59:00Z"); // 13:59 in La Réunion
const copy = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });

describe("the UV advice", () => {
  it("gives the hours of La Réunion, around its solar noon, and no hours to the WHO", () => {
    const w = uvWarnings(copy([]))[0];
    expect(w).toContain("de 10 h à 14 h environ à La Réunion");
    expect(w).toContain("l'OMS, qui ne fixe pas d'heures");
    expect(w).not.toMatch(/11 h|15 h/);
  });
});

describe("a station that speaks less well for a commune", () => {
  // Salazie at 13:59: Bellevue Bras-Panon, on the windward side, the only temperature near; meteo_actuelle warns of it.
  const bellevue: StationAnswer = {
    station: "Bellevue Bras-Panon", commune: "Bras-Panon", source: "meteofrance", altitude_m: 480, heure_mesure: "04/11 13:48", age_min: 11,
    mesures: { temperature: "25 °C" }, distance_km: 8.5, direction: "E", pertinence: "moyenne",
    avertissements: ["La station est sur le versant est (au vent), Salazie sur le versant centre (cirques, plaines) : nuages, pluie et vent peuvent y être très différents."],
  };

  it("is said in a few words, never for a station « bonne »", () => {
    expect(ecartsCourts(bellevue)).toEqual(["autre versant : est"]);
    expect(ecartsCourts({ pertinence: "moyenne", avertissements: ["La station est 249 m plus haut que Le Tampon : la température y est généralement différente."] }))
      .toEqual(["249 m plus haut"]);
    expect(ecartsCourts({ pertinence: "moyenne", avertissements: ["La station est sur le versant centre (cirques, plaines), X sur le versant sud : …"] }))
      .toEqual(["autre versant : cirques et plaines"]);
    expect(ecartsCourts({ ...bellevue, pertinence: "bonne" })).toEqual([]);
  });

  it("on the commune's page, in the weather tile and the headline, as the tools say it", () => {
    const html = communePage("https://rundata.re", pageOf("salazie")!, { place: copy({ meteo: { resume: "", stations: [bellevue], sources: [] } } as unknown as PlaceData) }, NOW);
    // The spaces as the page sets them (typoPage): any of them between a figure and its unit, before a colon.
    expect(html).toMatch(/station Bellevue Bras-Panon \(480\sm, à 8,5\skm, autre versant\s: est\), mesuré à 13:48/);
    expect(html).toMatch(/par la station <b>Bellevue Bras-Panon<\/b>, à 8,5\skm, autre versant\s: est\./);
  });
});

describe("the island's range of temperatures", () => {
  const st = (nom: string, temperature: number, altitude_m: number): StationNow =>
    ({ nom, source: "meteofrance", lon: 55.5, lat: -21, altitude_m, time: "2026-11-04T09:54:00Z", stale: false, temperature });
  // The tour of the island, and every station: Bois-Rouge's 30,7 °C was in the list, not in the range.
  const home: HomeData = {
    stations: [st("Piton Maïdo", 13.8, 2150), st("Saint-Denis Gillot (aéroport)", 29.9, 8)],
    toutes: [st("Piton Maïdo", 13.8, 2150), st("Saint-Denis Gillot (aéroport)", 29.9, 8), st("Bois-Rouge", 30.7, 5)],
    mer: [], sources: [], indisponibles: [],
  };

  it("is that of every station, as the list and the map of the same page", () => {
    expect(meteoLive(copy(home), NOW)!.detail).toContain("Bois-Rouge");
    expect(meteoPage("https://rundata.re", copy(home), NOW)).toMatch(/de <b>Piton Maïdo<\/b> \(2 150 m\) à <b>Bois-Rouge<\/b>/);
    // A copy made before every station was kept: the tour's.
    expect(meteoLive(copy({ ...home, toutes: undefined }), NOW)!.detail).toContain("Gillot");
  });
});

describe("the days of the satellite readings", () => {
  it("says each, not the newest alone", () => {
    expect(lesJours(["2026-11-03", "2026-11-03"])).toBe("le 03/11");
    expect(lesJours(["2026-11-03", "2026-11-02", "2026-11-03"])).toBe("les 02 et 03/11");
    expect(lesJours(["2026-10-31", "2026-11-01"])).toBe("les 31/10 et 01/11");
    expect(lesJours(["2026-10-31", "2026-11-01", "2026-11-02"])).toBe("du 31/10 au 02/11");
  });
});
