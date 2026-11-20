import { describe, expect, it } from "vitest";
import type { PlaceData, StationAnswer } from "../src/web/data.js";
import { placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { natureStation, stationKind } from "../src/tools/meteo.js";

// Each measure says what made it, official or amateur, on the place's page as in meteo_actuelle (the user,
// marketing's words of 20/11/2026).
const NOW = new Date("2026-11-20T08:20:00Z"); // 12:20 in La Réunion
const copy = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
const leport: StationAnswer = {
  station: "Le Port", commune: "Le Port", source: "meteofrance", altitude_m: 9, heure_mesure: "20/11 12:12", age_min: 8,
  mesures: { temperature: "30,1 °C", vent_moyen: "18 km/h" }, distance_km: 1.2, direction: "N", pertinence: "bonne", avertissements: [],
};
const cambaie = { ...leport, station: "Cambaie", source: "meteor_oi", altitude_m: 12, amateur: true, distance_km: 3 } as StationAnswer;

describe("what made each measure", () => {
  it("is said in words, the amateur network named", () => {
    expect(stationKind("meteofrance")).toBe("station officielle de Météo-France");
    expect(stationKind("metar")).toBe("station d'aéroport");
    expect(stationKind("ffvl")).toBe("balise de vent de la FFVL");
    expect(stationKind("meteor_oi")).toBe("station amateur MétéoR-OI, fiabilité non vérifiée");
    expect(natureStation("meteofrance")).toBe("mesure de station officielle de Météo-France");
    expect(natureStation("metar")).toBe("mesure de station d'aéroport (observation METAR)");
    expect(natureStation("ffvl")).toBe("mesure de balise de vent de la FFVL");
    expect(natureStation("meteor_oi")).toBe("mesure de station amateur MétéoR-OI, fiabilité non vérifiée");
  });

  it("on the place's page, in its headline and its station's card", () => {
    const data = copy({ meteo: { resume: "", stations: [leport, cambaie], sources: [] } } as unknown as PlaceData);
    const html = placePage("https://rundata.re", pageOf("le-port")!, data, NOW);
    expect(html).toMatch(/par la station <b>Le Port<\/b>.{0,80}\(station officielle de Météo-France, 9\sm d'altitude, à 1,2\skm\)/);
    expect(html).toMatch(/<div class="card stcard"><h3>Le Port<\/h3><p class="note">station officielle de Météo-France · /);
    expect(html).toContain("fiabilité non vérifiée");
  });
});
