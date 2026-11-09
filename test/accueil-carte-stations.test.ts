import { describe, expect, it } from "vitest";
import { demos, homePage } from "../src/web/home.js";
import type { StationNow } from "../src/web/data.js";

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-09T16:20:00Z");
const station = (nom: string, source: string, temperature: number, lon: number, lat: number): StationNow => ({
  nom, source, lon, lat, altitude_m: 1000, time: "2026-11-09T16:10:00Z", stale: false, temperature,
});

describe("the temperatures of the home page", () => {
  // MétéoR-OI's Marla the coldest: its credit is on neither the map nor the sample exchange.
  const stations = [
    station("Plaine des Cafres", "meteofrance", 14.2, 55.57, -21.21),
    station("Gillot-Aéroport", "metar", 24.6, 55.52, -20.89),
    station("Marla", "meteor_oi", 13.4, 55.4, -21.1),
  ];
  const live = { meteo: { value: { stations, toutes: stations, mer: [], sources: [], indisponibles: [] }, fetchedAt: NOW, stale: false } };

  it("shows on its map Météo-France's stations and the airports', never MétéoR-OI's", () => {
    const home = homePage(ORIGIN, live, NOW);
    const map = home.slice(home.indexOf('<figure class="hero-map">'), home.indexOf("</figure>", home.indexOf('<figure class="hero-map">')));
    expect(map).toContain("Plaine des Cafres");
    expect(map).toContain("Gillot");
    expect(map).not.toContain("Marla");
    expect(map.match(/<a class="mk"/g)).toHaveLength(2);
  });

  it("answers its sample question at the coldest of Météo-France's stations and the airports', never at MétéoR-OI's", () => {
    const demo = demos(live, NOW)[0];
    expect(demo.call).toBe('meteo_actuelle(lieu: "Plaine des Cafres")');
    expect(demo.answer).toContain("par la station Météo-France Plaine des Cafres");
    expect(JSON.stringify(demos(live, NOW))).not.toContain("Marla");
  });
});
