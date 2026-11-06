import { describe, expect, it } from "vitest";
import { DAES } from "../src/providers/dae.js";
import { access, aPied, defibrillateurs, loin, nomDae } from "../src/tools/dae.js";
import { buildDae } from "../src/web/data.js";
import { daePage } from "../src/web/domains.js";
import { deadAnchors, doubleIds, mapLinks } from "./cartes.js";

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("défibrillateurs", () => {
  it("bundles the island's devices, each in one of the 24 communes", () => {
    expect(DAES.length).toBeGreaterThan(1000);
    expect(new Set(DAES.map((d) => d.commune)).size).toBe(24);
    expect(DAES.every((d) => !/\s-\s[A-Z0-9]*\d{5,}/.test(d.nom))).toBe(true);
  });

  it("leads from each commune's marker to its card", async () => {
    const page = daePage("https://rundata.re", { value: await buildDae(), fetchedAt: new Date(), stale: false });
    expect(mapLinks(page)).toHaveLength(24);
    expect(mapLinks(page).find((l) => l.href === "#c-cilaos")?.label).toMatch(/^Cilaos : \d+ défibrillateurs, voir le détail$/);
    expect(deadAnchors(page)).toEqual([]);
    expect(doubleIds(page)).toEqual([]);
    // The island's total under the map, as the home page writes it, « 1\u202f271 », never « 1271 ».
    expect(DAES.length).toBeGreaterThan(999);
    expect(page).toContain(`<p class="dae-compte">${String(DAES.length).replace(/(\d)(?=(\d{3})+$)/g, "$1\u202f")} défibrillateurs déclarés`);
  });

  it("writes a name in capitals as people read it, its sigles, codes and places kept", () => {
    expect(nomDae("FEAR - SAINT PAUL")).toBe("FEAR - Saint-Paul");
    expect(nomDae("FRED PA-1")).toBe("Fred PA-1");
    expect(nomDae("DAE-CASINO DE ST GILLES")).toBe("DAE-Casino de St Gilles");
    expect(nomDae("DAE CRR SUD MUZIK")).toBe("DAE CRR Sud Muzik");
    expect(nomDae("LECLERC - BRAS PANON")).toBe("Leclerc - Bras-Panon");
    // The medico-social sigles, and the companies' forms.
    expect(nomDae("DAE SAMSAH AUSTRAL")).toBe("DAE SAMSAH Austral");
    expect(nomDae("CSAPA SAINT PAUL")).toBe("CSAPA Saint-Paul");
    expect(nomDae("SELARL MAYER TANAPIN")).toBe("SELARL Mayer Tanapin");
    // An article after a full word starts a name.
    expect(nomDae("SUEZ AGENCE LES CUVES")).toBe("Suez Agence Les Cuves");
    expect(nomDae("ECOLE MONTESSORI LES VACOAS")).toBe("École Montessori Les Vacoas");
    expect(nomDae("SAS LE FOUQUET")).toBe("SAS Le Fouquet");
    // And after « - »: it starts a part of the name.
    expect(nomDae("STATION SERVICE - LES SABLES")).toBe("Station Service - Les Sables");
    expect(nomDae("LECLERC - LE PORTAIL ST LEU")).toBe("Leclerc - Le Portail St Leu");
    // One word: a sigle or a brand, as written.
    expect(nomDae("INSPE")).toBe("INSPE");
    // Written with lowercase letters by its operator: as written.
    expect(nomDae("OLA Energy Moulin Joli")).toBe("OLA Energy Moulin Joli");
    expect(nomDae("CEVA LA REUNION Cambaie")).toBe("CEVA LA REUNION Cambaie");
  });

  it("says a distance from 1 km in kilometres and a walk from an hour in hours", () => {
    expect([loin(0.64), loin(0.995), loin(1.19), loin(6.36)]).toEqual(["640\u00a0m", "1\u00a0km", "1,2\u00a0km", "6,4\u00a0km"]);
    expect([aPied(59), aPied(60), aPied(103), aPied(125)]).toEqual(["59\u00a0min", "1\u00a0h", "1\u00a0h\u00a043", "2\u00a0h\u00a005"]);
    // Far from any device: its distance and its walk so, its name as people read it.
    const r = body(defibrillateurs("Piton des Neiges"));
    expect(r.resume).toMatch(/à \d+,\d\u00a0km, environ \d\u00a0h(\u00a0\d\d)? à pied/);
    expect(r.resume).not.toMatch(/\d{4} m|\d{3} min/);
    expect(r.defibrillateurs.every((d: { lieu: string }) => /\p{Ll}/u.test(d.lieu))).toBe(true);
  });

  it("says how a device can be reached", () => {
    expect(access({ nom: "", adresse: "", commune: "", lon: 0, lat: 0, exterieur: true, acces_libre: true, horaires: "24 h/24, 7 j/7" })).toBe("à l'extérieur, accessible à toute heure");
    // Outside without Géo'DAE's « 24/7 »: maybe at the reception of a site that closes (Hibiscus, La Saline-les-Bains).
    expect(access({ nom: "", adresse: "", commune: "", lon: 0, lat: 0, exterieur: true, acces_libre: true })).toBe("à l'extérieur, horaires d'accès non déclarés");
    const hibiscus = DAES.find((d) => d.nom.includes("Hibiscus"))!;
    expect([hibiscus.exterieur, hibiscus.horaires]).toEqual([true, undefined]);
    expect(access(hibiscus)).not.toMatch(/toute heure|24 h/);
    expect(access({ nom: "", adresse: "", commune: "", lon: 0, lat: 0, exterieur: false, acces_libre: false, horaires: "24 h/24, 7 j/7" })).toBe("accessible 24 h/24");
    expect(access({ nom: "", adresse: "", commune: "", lon: 0, lat: 0, exterieur: false, acces_libre: true })).toBe("en accès libre aux heures d'ouverture du lieu");
  });

  it("gives the nearest ones, nearest first, after the emergency numbers", () => {
    const b = body(defibrillateurs("Cilaos"));
    expect(b.resume).toMatch(/^Arrêt cardiaque : appeler le 15 ou le 112\. Défibrillateur le plus proche \(Cilaos\) : /);
    const d = b.defibrillateurs.map((x: { distance_m: number }) => x.distance_m);
    expect(d).toEqual([...d].sort((x, y) => x - y));
    expect(b.defibrillateurs[0].carte).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    expect(b.urgence).toMatch(/massage cardiaque/);
  });
});
