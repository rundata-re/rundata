import { describe, expect, it } from "vitest";
import type { HomeData, SeaData, StationNow } from "../src/web/data.js";
import { meteoLive, meteoPage, seaPage } from "../src/web/pages.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-06T17:00:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
const big = (page: string) => page.match(/<span class="big[^"]*">(.*?)<\/span>/)?.[1];

const st = (nom: string, temperature: number): StationNow =>
  ({ nom, source: "meteofrance", lon: 55.5, lat: -21, altitude_m: 10, time: "2026-11-06T16:54:00Z", stale: false, temperature }) as StationNow;
const island = (...t: number[]): HomeData => {
  const all = t.map((x, i) => st(`Station ${i}`, x));
  return { stations: all, toutes: all, sources: [], indisponibles: [], mer: [] };
};
const beach = (nom: string, lon: number, lat: number, valeur: number) => ({ nom, commune: "Saint-Paul", lon, lat, valeur, jour: "2026-11-05", distance_km: 3 });
const sea = (a: number, b: number) =>
  cached({ plages: [beach("Plage de Boucan-Canot", 55.22, -21.03, a), beach("Plage de la Saline les Bains", 55.24, -21.1, b)], sources: [] } as unknown as SeaData);

describe("the big figures at the head of a page", () => {
  it("take a plain no-break space before their unit, the narrow one being invisible in their bold", () => {
    expect(big(meteoPage(O, cached(island(21.2, 30.8)), NOW))).toBe("21 à 31 °C");
    expect(big(seaPage(O, sea(24.5, 25), NOW))).toBe("24,5 à 25 °C");
  });

  it("say a range once when its two ends read the same", () => {
    expect(meteoLive(cached(island(25.8, 26.2)), NOW)!.valeur).toBe("26 °C");
    expect(big(meteoPage(O, cached(island(25.8, 26.2)), NOW))).toBe("26 °C");
    const page = seaPage(O, sea(25, 25), NOW);
    expect(big(page)).toBe("25 °C");
    expect(page).toMatch(/l(&#39;|')eau à[ \u00a0]25[ \u00a0\u202f]°C, mesurée par satellite/);
    expect(page).not.toMatch(/eau de[ \u00a0]25/);
  });
});
