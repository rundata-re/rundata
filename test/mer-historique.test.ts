import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { Cache } from "../src/cache.js";
import * as mh from "../src/providers/mer-historique.js";
import { EN_COURS, historiqueBlock, resume, resumer } from "../src/tools/mer-historique.js";
import { merHistoriquePage } from "../src/web/mer-historique.js";
import { histoireMer } from "../src/tools/mer.js";
import { bases } from "./contexte.js";
const donnerMer = (d?: mh.MerDb) => bases({ climat: d });

const NOW = new Date("2026-11-24T06:20:00Z"); // 10:20 in La Réunion
const SCHEMA = readFileSync(new URL("../scripts/mer.sql", import.meta.url), "utf8");

/** A year of `n` days where day i is f(i), or null. */
const an = (y: number, f: (i: number) => number | null) => Array.from({ length: (y % 4 === 0 ? 366 : 365) }, (_, i) => f(i));

function base(withTables = true) {
  const db = new DatabaseSync(":memory:");
  if (withTables) {
    db.exec(SCHEMA);
    const ins = db.prepare("INSERT INTO mer_jour VALUES (?, ?, ?, ?)");
    // The satellite off Saint-Gilles: 2003 to 2025 full, 2026 up to 22/11. 25 °C, warmer each year by a tenth; 24/11
    // (index 327 in a common year, 328 in a leap one) a degree warmer; 2019's 15/03 at 29.9 °C, the record.
    for (let y = 2003; y <= 2026; y++) {
      const last = y === 2026 ? 325 : 400;
      const sst = an(y, (i) => (i > last ? null : Math.round((25 + (y - 2003) / 10 + (i === mh.indice(`${y}-11-24`) ? 1 : 0)) * 100) / 100));
      if (y === 2019) sst[73] = 29.9;
      ins.run("crw", "saint-gilles", y, JSON.stringify({ sst, ecart: sst.map((v) => (v == null ? null : 0.5)) }));
    }
    // A buoy of two years, 1997 and 1998, its highest wave on 27/02/1998.
    for (const y of [1997, 1998]) {
      const hs = an(y, (i) => (i < 300 ? 1 : null));
      const hmax = hs.map((v) => (v == null ? null : 2));
      if (y === 1998) hmax[57] = 9.5;
      ins.run("candhis", "97403", y, JSON.stringify({ hs_moy: hs, hs_max: hs.map((v) => (v == null ? null : 1.5)), hmax, per_moy: hs.map(() => 8), n: hs.map(() => 48) }));
    }
    const pt = db.prepare("INSERT INTO mer_points VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    pt.run("crw", "saint-gilles", "Saint-Gilles", -21.075, 55.225, 2003, 2026, "sst,ecart", "NOAA Coral Reef Watch, CoralTemp (domaine public)");
    pt.run("candhis", "97403", "Rivière des Galets", -20.94572, 55.27732, 1997, 1998, "hs_moy,hs_max,hmax,per_moy,n", "Candhis (Cerema), campagne 97403, avec Grand Port Maritime de La Réunion");
  }
  return { all: async <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as (string | number)[])) as T[] };
}

afterEach(() => donnerMer(undefined));

describe("the sea's history (providers/mer-historique.ts, tools/mer-historique.ts)", () => {
  it("answers an empty archive, never an error, while the tables are not imported", async () => {
    donnerMer(base(false));
    const r = (await resume(new Cache(undefined, () => NOW.getTime()), NOW)).value;
    expect(r.importe).toBe(false);
    expect(historiqueBlock(r, undefined, 25)).toEqual({ etat: EN_COURS, page: "https://rundata.re/mer/historique" });
    const html = merHistoriquePage("https://rundata.re", { value: r, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain("Historique en cours d'import");
    expect(html).toContain('href="/mer#h-courbes"');
  });

  it("sums a point up: years, records with their day, the mean named by its full years, the same day each year", async () => {
    donnerMer(base());
    const r = resumer(await mh.lire(), "2026-11-24");
    const sg = r.points.find((p) => p.point === "saint-gilles")!;
    expect([sg.du, sg.au, sg.annees]).toEqual([2003, 2026, 24]);
    // The current year is not full: the mean is of 2003-2025, never called a normal.
    expect(sg.moyenne.nom).toBe("moyenne 2003-2025");
    expect(JSON.stringify(r)).not.toMatch(/normale/i);
    expect(sg.records[0]).toMatchObject({ nom: "mer la plus chaude", valeur: 29.9, le: "2019-03-15" });
    // 24/11 of 2003 to 2025 (2026 has no value yet that day), newest first; their mean over the full years.
    expect(sg.ce_jour_la.valeurs.map((x) => x.annee)).toEqual(Array.from({ length: 23 }, (_, i) => 2025 - i));
    expect(sg.ce_jour_la.valeurs[0].valeur).toBe(28.2);
    expect(sg.ce_jour_la.moyenne).toBeCloseTo(27.1, 5);
    expect(sg.annee_en_cours?.annee).toBe(2026);
    const b = r.points.find((p) => p.point === "97403")!;
    expect(b.moyenne.nom).toBe("moyenne des années mesurées");
    expect(b.records.find((x) => x.nom === "vague la plus haute")).toMatchObject({ valeur: 9.5, le: "1998-02-27", dit: "9,5\u00a0m le 27/02/1998" });
  });

  it("gives temperature_mer a past day: that day, the same day the other years, the records, from 2003 for the satellite", async () => {
    donnerMer(base());
    const cache = new Cache(undefined, () => NOW.getTime());
    const r = (await resume(cache, NOW)).value;
    const valeurs = (await mh.memeJour(cache, "03-15")).value;
    const h = historiqueBlock(r, { lon: 55.27, lat: -21.0 }, 25, { jour: "2019-03-15", valeurs }) as Record<string, any>;
    expect(h.satellite[0]).toMatchObject({ au_large_de: "Saint-Gilles", jour_demande: { date: "15/03/2019", valeur: "29,9\u00a0°C" }, records: { "mer la plus chaude": "29,9\u00a0°C le 15/03/2019" } });
    expect(h.satellite[0].meme_jour_les_autres_annees[0]).toBe("2026 : 27,3\u00a0°C");
    expect(h.satellite_depuis).toMatch(/2003/);
    expect(h.satellite_depuis).not.toMatch(/1985/);
    // The buoy measured in 1997 and 1998 only: said, not a value made up.
    expect(h.bouees[0]).toMatchObject({ bouee: "Rivière des Galets", jour_demande: { valeur: "pas de mesure ce jour-là (mesures de 1997 à 1998)" } });
    // 29 February: only the leap years.
    const f29 = (await mh.memeJour(cache, "02-29")).value.filter((x) => x.point === "saint-gilles").map((x) => x.annee);
    expect(f29).toEqual([2004, 2008, 2012, 2016, 2020, 2024]);
  });

  it("asks for a past day in the tool, and refuses today or a date it does not understand", async () => {
    donnerMer(base());
    const ask = async (date: string) => (await histoireMer(new Cache(undefined, () => NOW.getTime()), NOW, undefined, { date })) as Record<string, any>;
    expect((await ask("demain")).erreur).toMatch(/Date non comprise/);
    expect((await ask("2006")).erreur).toMatch(/Date non comprise/);
    expect((await ask("2026-11-24")).erreur).toMatch(/aujourd'hui/);
    expect((await ask("15/03/2019")).satellite[0].jour_demande).toEqual({ date: "15/03/2019", valeur: "29,9\u00a0°C" });
    expect(await histoireMer(new Cache(), NOW, undefined, {})).toBeUndefined();
  });

  it("draws the page: the satellite's section from 2003, its records and the buoys' with their own years", async () => {
    donnerMer(base());
    const r = resumer(await mh.lire(), "2026-11-24");
    const html = merHistoriquePage("https://rundata.re", { value: r, fetchedAt: NOW, stale: false }, NOW);
    expect(html).toContain("La température de la mer depuis 2003");
    expect(html).toContain("moyenne 2003-2025");
    expect(html).toContain("29,9\u00a0°C le 15/03/2019");
    expect(html).toContain("Rivière des Galets");
    expect(html).not.toMatch(/normale(?! climatique)/);
    expect(html).not.toContain("1985");
  });
});
