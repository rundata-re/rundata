import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as ecoles from "../src/vie/ecoles.js";

const data = JSON.parse(readFileSync("src/vie/ecoles.json", "utf8")) as {
  corrections?: { uai: string; champ: string; annuaire: string; corrige: string; verifie: string; source: string }[];
};
const site = (uai: string) => ecoles.LIST.find((e) => e.uai === uai)?.web;

describe("the schools' sites the directory has not caught up with (local corrections, scripts/build-ecoles.py)", () => {
  // Each new address read on 24/11/2026; the directory's export of 23/11 still gave the old one.
  it("gives each moved, renamed or https site its current address", () => {
    expect(site("9741546M")).toBe("https://colleges-st-michel-monnet.re/"); // Alexandre-Monnet: its own site is gone
    expect(site("9740072K")).toBe("https://colleges-st-michel-monnet.re/"); // Saint-Michel
    expect(site("9740471U")).toBe("https://etab.ac-reunion.fr/lyc-jean-claude-fruteau/"); // formerly Amiral-Bouvet
    expect(site("9740054R")).toBe("https://lislet-geoffroy.re/");
    expect(site("9741098A")).toBe("https://ecolemaritime.re/");
    for (const uai of ["9741630D", "9740835P", "9741255W"]) expect(site(uai)).toBe("https://lasalle.stcharles.fr/");
    expect(site("9741233X")).toBe("https://lycee-mandela.fr/");
    expect(site("9741088P")).toBe("https://www.martherobin.re/");
  });

  it("keeps the directory's value beside each correction, dated, with its source", () => {
    const c = data.corrections ?? [];
    expect(c.length).toBe(10);
    expect(c.find((x) => x.uai === "9741546M")).toMatchObject({ champ: "web", annuaire: "http://college-alexandre-monnet.ac-reunion.fr/", verifie: "2026-11-24" });
    for (const x of c) {
      expect(site(x.uai)).toBe(x.corrige);
      expect(x.source.length).toBeGreaterThan(10);
    }
  });

  it("leaves on plain http only the sites that have no https", () => {
    // The two Cluny lycées' site answers no TLS on 443 (read on 24/11/2026).
    expect(ecoles.LIST.filter((e) => e.web?.startsWith("http:")).map((e) => e.uai).sort()).toEqual(["9740679V", "9741060J"]);
  });
});
