import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as climat from "../src/providers/climat.js";
import { recordsReference } from "../src/tools/historique.js";
import type { HistoriqueAnswer, HomeData, StationNow } from "../src/web/data.js";
import { recordsSection } from "../src/web/pages.js";

// Real rows of the archive (scripts/build-climat.py), records stored up to 2025, days of 2026 up to 23 October.
const NOW = new Date("2026-10-24T08:00:00Z");
let db: DatabaseSync;
beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./fixtures/historique/climat.sql", import.meta.url), "utf8"));
});
afterEach(() => climat.configure(undefined));

function plug() {
  let queries = 0;
  climat.configure({ all: async <T>(sql: string, ...params: unknown[]) => (queries++, db.prepare(sql).all(...(params as (string | number)[])) as T[]) });
  return () => queries;
}

describe("the records of the stations of reference", () => {
  it("reads them from the archive, one station per climate, in two queries after the stations", async () => {
    const cache = new Cache(new MemoryStore());
    const queries = plug();
    await climat.postes(cache);
    const before = queries();
    const r = await recordsReference(cache, NOW);
    expect(queries() - before).toBe(2);
    expect(r.map((x) => x.zone)).toEqual(["nord (Saint-Denis)", "ouest (côte sous le vent)", "sud (Saint-Pierre)", "est (au vent)", "Hauts (Plaine des Cafres)", "cirque de Cilaos"]);
    const nord = r[0];
    expect(nord.depuis).toBe(1953);
    // The stored record, dated, unless a day of 2026 beat it.
    expect(nord.temperature_max).toEqual({ valeur: 35.2, date: "28/01/1993" });
    expect(nord.rafale_max_kmh).toEqual({ valeur: Math.round(62 * 3.6), date: "28/02/1962" });
    expect(r[4].temperature_min).toEqual({ valeur: -1.7, date: "18/08/1988" });
  });

  it("is nothing without the archive", async () => {
    expect(await recordsReference(new Cache(new MemoryStore()), NOW)).toEqual([]);
  });

  it("writes each record with its date, leaves out what is missing, and the block without any", () => {
    const h = {
      periode: { du: "2026-09-24", au: "2026-10-23", jours: 30 },
      records_reference: [
        { zone: "nord (Saint-Denis)", poste: "97418110", station: "Saint-Denis Gillot", depuis: 1953, temperature_max: { valeur: 35.2, date: "28/01/1993" }, rafale_max_kmh: { valeur: 223, date: "28/02/1962" } },
        { zone: "est (au vent)", poste: "97410238", station: "Saint-Benoît", depuis: 1952 },
      ],
    } as unknown as HistoriqueAnswer;
    const s = recordsSection(h);
    expect(s).toContain('<h2 id="h-records">Les records des stations de référence</h2>');
    expect(s).toContain("ses records depuis le début de ses mesures quotidiennes publiées par Météo-France, jusqu'au 23/10/2026. Un jour sans mesure n'est pas compté.");
    // Never a parenthesis inside another.
    expect(s).not.toMatch(/\([^()]*\(/);
    expect(s).toMatch(/<li><b>Saint-Denis Gillot<\/b> — nord \(Saint-Denis\), mesures depuis 1953 : le plus chaud, <b>35,2[\s ]°C<\/b> le 28\/01\/1993 ; la plus forte rafale, <b>223[\s ]km\/h<\/b> le 28\/02\/1962\.<\/li>/);
    expect(s).not.toContain("Saint-Benoît");
    expect(s).not.toContain("plus frais");
    expect(recordsSection({ ...h, records_reference: [] })).toBe("");
    expect(recordsSection(undefined)).toBe("");
  });

  it("shows them on /meteo from /historique's copy, never building it there", async () => {
    const cache = new Cache(new MemoryStore());
    const get = () => handle(new Request("https://rundata.re/meteo", { headers: { accept: "text/html" } }), cache).then((r) => r.text());
    expect(await get()).not.toContain('id="h-records"');
    await cache.get("web:historique", 3600, async () => ({
      resume: "",
      periode: { du: "2026-09-24", au: "2026-10-23", jours: 30 },
      stations: [],
      records_reference: [{ zone: "cirque de Cilaos", poste: "97424410", station: "Cilaos", depuis: 1952, temperature_min: { valeur: 0.1, date: "06/08/1982" } }],
    }));
    const html = await get();
    expect(html).toContain('id="h-records"');
    // Right after the data, before « Comment lire cette page ».
    expect(html.indexOf('id="h-records"')).toBeLessThan(html.indexOf('id="h-lire"'));
    expect(html).toContain("le plus frais, <b>0,1");
    // One « h-lire » only: « Comment lire ces données » has its own id on the page without stations.
    expect(html.match(/id="h-lire"/g)).toHaveLength(1);
    expect(html).toContain('<section aria-labelledby="h-notes">');
    // And on the page with stations, the one people see nearly always: the block after them, before the stable text.
    const st = { nom: "Saint-Denis-Gillot", source: "meteofrance", lon: 55.52, lat: -20.89, altitude_m: 10, time: new Date(Date.now() - 6 * 60_000).toISOString(), stale: false, temperature: 25 } as StationNow;
    // A fresh cache, both copies in it before the page is asked (the one above tried to build /meteo's and failed).
    const plein = new Cache(new MemoryStore());
    await plein.get("web:meteo", 3600, async (): Promise<HomeData> => ({ stations: [st], toutes: [st], sources: [], indisponibles: [], mer: [] }));
    await plein.get("web:historique", 3600, async () => (await cache.peek<unknown>("web:historique"))!.value);
    const avec = await handle(new Request("https://rundata.re/meteo", { headers: { accept: "text/html" } }), plein).then((r) => r.text());
    expect(avec).toContain('<section id="stations" aria-labelledby="h-stations">');
    expect(avec.indexOf('id="h-stations"')).toBeLessThan(avec.indexOf('id="h-records"'));
    expect(avec.indexOf('id="h-records"')).toBeLessThan(avec.indexOf('id="h-lire"'));
    expect(avec.match(/id="h-lire"/g)).toHaveLength(1);
  });
});
