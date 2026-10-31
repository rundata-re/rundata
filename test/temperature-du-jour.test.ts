import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as meteofrance from "../src/providers/meteofrance.js";
import type { Fit } from "../src/tools/representativeness.js";
import { hasExtremes, todayTemperatureBlock } from "../src/tools/temperature-du-jour.js";

// The hourly package of 25/10/2026, read at 12:57 Réunion time: its newest hour ends at 08:00Z, 12 h in Réunion.
const NOW = new Date("2026-10-25T08:57:00Z");
const HOURLY = meteofrance.parseHourly(readFileSync(new URL("./fixtures/meteofrance_horaire.csv", import.meta.url), "utf8"), NOW.getTime());
const near: Fit = { distance_km: 1.2, direction: "SO", ecart_altitude_m: -17, versant: "sud", pertinence: "bonne", avertissements: [], score: 1 };
const PIERREFONDS = { id: "97416463", nom: "Saint-Pierre Pierrefonds (aéroport)", fit: near };
type Slot = { time: string; rr: number | null; t?: number | null };
const block = (slots: Slot[] = [], hourly = HOURLY, now = NOW) => todayTemperatureBlock({ hourly, slots: () => slots }, PIERREFONDS, now);
/** The 6-minute measures after the newest hour, newest first, as meteofrance.recentRain gives them. */
const under = (ts: number[]) => ts.map((t, k) => ({ time: new Date(Date.parse("2026-10-25T08:54:00Z") - k * 6 * 60_000).toISOString().replace(".000Z", "Z"), rr: 0, t }));

describe("the temperature since midnight", () => {
  it("keeps the extremes within each hour (tn, tx), not the value at its end", () => {
    const m = HOURLY.mesures!["97416463"];
    // 09 h–10 h: 26,5 °C at its highest, though 25,5 °C at 10 h.
    expect([m.tx![2], m.t[2]]).toEqual([26.5, 25.5]);
    expect(block()).toMatchObject({
      periode: "de 00:00 à 12:00",
      maximum: { valeur: 26.5, quand: "entre 9 h et 10 h" },
      minimum: { valeur: 22.9, quand: "entre 0 h et 1 h" },
      avertissements: [],
    });
  });

  it("takes the hour under way from the 6-minute measures, to the minute", () => {
    const b = block(under(Array.from({ length: 9 }, (_, k) => (k === 2 ? 27.3 : 25))))!;
    expect(b.periode).toBe("de 00:00 à 12:54");
    expect(b.maximum).toEqual({ valeur: 27.3, unite: "°C", quand: "à 12:42" });
    expect(b.resume).toBe("Depuis minuit (de 00:00 à 12:54) à Saint-Pierre Pierrefonds (aéroport), à 1,2 km : 27,3 °C au plus (à 12:42), 22,9 °C au moins (entre 0 h et 1 h).");
  });

  it("leaves yesterday's hours out, and has only the 6-minute measures before 01:00", () => {
    // 00:30 in Réunion: the newest hour is yesterday's 23 h–24 h.
    const at = new Date("2026-10-24T20:30:00Z");
    const hourly = meteofrance.parseHourly(readFileSync(new URL("./fixtures/meteofrance_horaire.csv", import.meta.url), "utf8"), Date.parse("2026-10-24T20:15:00Z"));
    expect(hourly.end).toBe("2026-10-24T20:00:00Z");
    const slots = [{ time: "2026-10-24T20:30:00Z", rr: 0, t: 21.6 }, { time: "2026-10-24T20:24:00Z", rr: 0, t: 21.9 }];
    expect(block(slots, hourly, at)).toMatchObject({ periode: "de 00:00 à 00:30", maximum: { valeur: 21.9, quand: "à 00:24" }, minimum: { valeur: 21.6, quand: "à 00:30" } });
    expect(block([], hourly, at)).toBeUndefined();
  });

  it("says when measures are missing since midnight", () => {
    const tx = [...HOURLY.mesures!["97416463"].tx!];
    tx[2] = null;
    const hourly = { ...HOURLY, mesures: { ...HOURLY.mesures, "97416463": { ...HOURLY.mesures!["97416463"], tx } } };
    expect(block([], hourly)!.avertissements).toEqual(["Des mesures manquent depuis minuit : la température a pu monter plus haut ou descendre plus bas."]);
    // The 6-minute measures of the hour under way start late: the minutes between were not read.
    expect(block(under([25, 25]))!.avertissements).toHaveLength(1);
  });

  it("is left out with a copy of the package saved before tn and tx were kept", () => {
    const { tn: _n, tx: _x, ...old } = HOURLY.mesures!["97416463"];
    const hourly = { ...HOURLY, mesures: { "97416463": old } };
    expect(hasExtremes({ hourly, slots: () => [] }, "97416463")).toBe(false);
    expect(block([], hourly)).toBeUndefined();
  });
});
