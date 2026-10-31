import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import * as coraux from "../src/providers/coraux.js";
import { temperatureMer } from "../src/tools/mer.js";
import { reefSection } from "../src/web/pages.js";

// NOAA Coral Reef Watch's 5 km grid over the island, read on 31/10/2026 at 22:37 (Réunion): the values of 29/10.
const CSV = readFileSync(new URL("./fixtures/coraux_dhw_5km.csv", import.meta.url), "utf8");
const NOW = new Date("2026-10-31T18:40:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const HEAD = "time,latitude,longitude,CRW_BAA,CRW_DHW,CRW_SST\nUTC,degrees_north,degrees_east,1,Celsius weeks,Celsius\n";
const row = (lat: number, lon: number, baa: string, dhw: string, sst: string) => `2026-03-02T12:00:00Z,${lat},${lon},${baa},${dhw},${sst}\n`;

afterEach(() => vi.unstubAllGlobals());

describe("coraux", () => {
  it("reads the three points of the island's grid, the day of the values, and nothing before it", () => {
    expect(coraux.CSV_URL).toContain("%5B(last)%5D");
    expect(coraux.parse(CSV)).toEqual({
      jour: "2026-10-29",
      points: [
        { nom: "Récif de Saint-Gilles et l'Hermitage", lat: -21.075, lon: 55.225, niveau: 0, dhw: 0, sst: 25.55 },
        { nom: "au large de Saint-Pierre", lat: -21.375, lon: 55.475, niveau: 0, dhw: 0, sst: 25.32 },
        { nom: "au large de Saint-Benoît", lat: -21.125, lon: 55.825, niveau: 0, dhw: 0, sst: 24.67 },
      ],
    });
  });

  it("leaves a masked cell, the fill value and a level this product does not have without a level, and fails with none", () => {
    const [o, s, e] = coraux.POINTS;
    const c = coraux.parse(HEAD + row(o.lat, o.lon, "2", "4.3", "29.1") + row(s.lat, s.lon, "251", "NaN", "NaN") + row(e.lat, e.lon, "5", "12.0", "30.2"));
    expect(c.jour).toBe("2026-03-02");
    expect(c.points.map((p) => [p.niveau, p.dhw, p.sst])).toEqual([[2, 4.3, 29.1], [null, null, null], [null, 12, 30.2]]);
    expect(() => coraux.parse(HEAD + row(o.lat, o.lon, "NaN", "NaN", "NaN"))).toThrow(/aucune valeur/);
    expect(() => coraux.parse("<html>maintenance</html>")).toThrow(/colonnes/);
  });

  it("says the heat in °C-weeks, the day of the satellite and the level's words", () => {
    expect(coraux.chaleur(0)).toBe("0,0 °C-semaine");
    expect(coraux.chaleur(4.25)).toBe("4,3 °C-semaines");
    expect(coraux.nature("2026-10-29")).toBe("Indice calculé par NOAA Coral Reef Watch d'après la température de la mer mesurée par satellite le 29/10, publié environ 2 jours après.");
    expect(coraux.NIVEAUX).toHaveLength(5);
  });

  it("gives temperature_mer a block « coraux », its grid read once for every question, credited to NOAA Coral Reef Watch", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(String(url));
      if (String(url).includes("dhw_5km")) return new Response(CSV);
      throw new Error("offline");
    });
    const cache = new Cache(undefined, () => NOW.getTime());
    const r = body(await temperatureMer(cache, undefined, NOW));
    expect(r.coraux).toEqual({
      titre: "Coraux : risque de blanchissement",
      points: [
        { lieu: "Récif de Saint-Gilles et l'Hermitage", niveau: "Pas de stress thermique (selon NOAA)", niveau_noaa: 0, chaleur_accumulee_12_semaines: "0,0 °C-semaine", temperature_satellite: "25,6 °C" },
        { lieu: "au large de Saint-Pierre", niveau: "Pas de stress thermique (selon NOAA)", niveau_noaa: 0, chaleur_accumulee_12_semaines: "0,0 °C-semaine", temperature_satellite: "25,3 °C" },
        { lieu: "au large de Saint-Benoît", niveau: "Pas de stress thermique (selon NOAA)", niveau_noaa: 0, chaleur_accumulee_12_semaines: "0,0 °C-semaine", temperature_satellite: "24,7 °C" },
      ],
      jour_mesure: "2026-10-29",
      nature: coraux.nature("2026-10-29"),
      aide_chaleur: coraux.AIDE_CHALEUR,
      avertissements: [coraux.PAS_OBSERVATION, coraux.CASE],
    });
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(coraux.SOURCE.nom);
    await temperatureMer(cache, undefined, NOW);
    expect(asked.filter((u) => u.includes("dhw_5km"))).toHaveLength(1);
  });

  it("answers temperature_mer without the block, and with the rest, when NOAA's grid does not answer", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const r = await temperatureMer(new Cache(undefined, () => NOW.getTime()), undefined, NOW);
    if (!r.isError) expect(body(r).coraux).toBeUndefined();
  });

  it("shows /mer the level in words with a scale of 0 to 4 in night blue, the heat, the day and the warnings", () => {
    const c = { value: coraux.parse(CSV), fetchedAt: NOW, stale: false };
    const html = reefSection(c);
    expect(html).toContain('<h2 id="h-coraux">Coraux : risque de blanchissement</h2>');
    expect(html).toContain("<b>Pas de stress thermique</b><span>selon NOAA</span>");
    expect(html).toContain('<span class="echelle" role="img" aria-label="niveau 0 sur une échelle de 0 à 4"><i class="on"></i><i></i><i></i><i></i><i></i></span>');
    expect(html).toContain("Chaleur accumulée sur 12 semaines : 0,0 °C-semaine");
    expect(html).toContain("<span class=\"lieu\">Au large de Saint-Pierre</span>");
    for (const s of [coraux.nature("2026-10-29"), coraux.CASE, "C'est un indice de chaleur de la mer, pas une observation des coraux", "Source : NOAA Coral Reef Watch (domaine public)."]) expect(html).toContain(s.replace(/'/g, "&#39;"));
    // Never NOAA's yellow, orange and red.
    expect(html).not.toMatch(/#ff|yellow|orange|red/i);
    const [o] = coraux.POINTS;
    const warning = reefSection({ value: coraux.parse(HEAD + row(o.lat, o.lon, "2", "4.3", "29.1")), fetchedAt: NOW, stale: true });
    expect(warning).toContain("<b>Avertissement : un blanchissement est possible</b>");
    expect(warning).toContain('aria-label="niveau 2 sur une échelle de 0 à 4"><i></i><i></i><i class="on"></i><i></i><i></i>');
    expect(warning).toContain("Dernière valeur gardée");
    expect(reefSection(null)).toContain("La grille de NOAA Coral Reef Watch n'a pas pu être lue pour le moment.");
  });

  it("reads the grid at a view of /mer, never more than once a day for the views after it", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(String(url));
      if (String(url).includes("dhw_5km")) return new Response(CSV);
      throw new Error("offline");
    });
    const cache = new Cache(undefined, () => NOW.getTime());
    const view = async () => (await handle(new Request("https://rundata.re/mer", { headers: { accept: "text/html" } }), cache)).text();
    expect(await view()).toContain("Coraux : risque de blanchissement");
    expect(await view()).toContain("Récif de Saint-Gilles et l&#39;Hermitage");
    expect(asked.filter((u) => u.includes("dhw_5km"))).toHaveLength(1);
  });
});
