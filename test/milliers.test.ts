import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fr } from "../src/tools/format.js";

// Marketing's kit (« Nombres »): the thousands separated from 4 digits by a narrow no-break space (U+202F); « Heures »:
// « 8\u00a0h–18\u00a0h », or « 09:15–18:45 » when one of a place's hours has minutes, an en dash without spaces.
describe("the thousands and the hours as the kit writes them", () => {
  it("separate the thousands in fr(), from 4 digits", () => {
    expect(fr(999)).toBe("999");
    expect(fr(24.6)).toBe("24,6");
    expect(fr(2300)).toBe("2\u202f300");
    expect(fr(10200)).toBe("10\u202f200");
    expect(fr(1234567.25)).toBe("1\u202f234\u202f567,25");
    expect(fr(-1500.5)).toBe("-1\u202f500,5");
    expect(fr(-12)).toBe("-12");
  });

  it("write a charging station's hours the kit's way", () => {
    const stations: { horaires: string }[] = JSON.parse(readFileSync(new URL("../src/irve/stations.json", import.meta.url), "utf8")).stations;
    const hours = stations.map((s) => s.horaires).filter(Boolean);
    expect(hours.length).toBeGreaterThan(100);
    // No « 9 h 15 », no spaced dash, no plain space before « h ».
    expect(hours.filter((h) => /\d h|\d\u00a0h \d|\s–|–\s/.test(h))).toEqual([]);
    // One way of writing per station: with its minutes everywhere or nowhere.
    expect(hours.filter((h) => /\d:\d\d/.test(h) && /\d\u00a0h\b(?!\/)/.test(h))).toEqual([]);
    expect(hours).toContain("du lundi au samedi 09:15–18:45");
    expect(hours).toContain("tous les jours 8\u00a0h–18\u00a0h");
  });
});
