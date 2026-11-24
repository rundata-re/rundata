import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distanceKm } from "../src/geo.js";
import { resolvePlace } from "../src/places/resolve.js";

// The communes whose settlement node lay more than 500 m from their town hall, located at it (scripts/build-gazetteer.py
// TOWN_HALLS, checked on 24/11/2026 against OSM, the Base adresse nationale and the annuaire service-public).
const script = readFileSync(new URL("../scripts/build-gazetteer.py", import.meta.url), "utf8");
const halls = [...script.matchAll(/^\s+"([^"]+)": \{"lon": ([\d.]+), "lat": (-[\d.]+)\},$/gm)].map(([, nom, lon, lat]) => ({ nom, lon: Number(lon), lat: Number(lat) }));

describe("a commune's point: its town centre, not a node at its edge", () => {
  it("is its town hall for the five whose settlement node lay more than 500 m from it", () => {
    expect(halls.map((h) => h.nom)).toEqual(["Bras-Panon", "La Plaine-des-Palmistes", "Saint-Paul", "Salazie", "Saint-Louis"]);
    for (const h of halls) {
      const l = resolvePlace(h.nom)!.lieu;
      expect(l.type, h.nom).toBe("commune");
      expect(distanceKm(l.lon, l.lat, h.lon, h.lat) * 1000, h.nom).toBeLessThan(1);
    }
  });

  it("puts La Plaine-des-Palmistes at its town hall, 1.5 km west of where it was", () => {
    // Seen on 24/11/2026: the point lay 1.5 km east of the town hall, its nearest stops « Le Verger », « Cascade Biberon ».
    const l = resolvePlace("La Plaine-des-Palmistes")!.lieu;
    expect(distanceKm(l.lon, l.lat, 55.6258, -21.13506)).toBeLessThan(0.01);
    expect(l.altitude_m).toBe(1034);
  });
});
