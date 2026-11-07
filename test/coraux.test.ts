import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import * as coraux from "../src/providers/coraux.js";
import { temperatureMer } from "../src/tools/mer.js";
import { reefSection } from "../src/web/pages.js";

// NOAA Coral Reef Watch's 5 km grid over the island, 7 days without a gap (05/04 to 11/04/2025, read on 07/11/2026): a
// heat wave, the DHW over 15 °C-weeks at the three points, but a HotSpot under 1 °C all week at Saint-Gilles.
const CSV = readFileSync(new URL("./fixtures/coraux_dhw_5km_7j.csv", import.meta.url), "utf8");
// The answer of `last-6:last` on 07/11/2026: 28 and 29/10, then 01/11 to 05/11, the mirror without 30 and 31/10.
const TROU = readFileSync(new URL("./fixtures/coraux_dhw_5km_trou.csv", import.meta.url), "utf8");
const NOW = new Date("2025-04-13T18:40:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const HEAD = "time,latitude,longitude,CRW_HOTSPOT,CRW_DHW,CRW_SST\nUTC,degrees_north,degrees_east,Celsius,Celsius weeks,Celsius\n";
const row = (day: string, lat: number, lon: number, hot: string, dhw: string, sst: string) => `${day}T12:00:00Z,${lat},${lon},${hot},${dhw},${sst}\n`;
const SEPT = "maximum des 7 derniers jours, selon NOAA Coral Reef Watch (estimation par satellite, pas une observation sur le récif)";

afterEach(() => vi.unstubAllGlobals());

describe("coraux", () => {
  it("asks the last 10 days present of the HotSpot, the DHW and the temperature, never one day's alert of the old scale", () => {
    expect(coraux.CSV_URL).toContain("CRW_HOTSPOT%5Blast-9:last%5D");
    expect(coraux.CSV_URL).toContain("CRW_DHW%5Blast-9:last%5D");
    expect(coraux.CSV_URL).not.toContain("CRW_BAA");
  });

  it("gives each day NOAA's level of 0 to 7 from its HotSpot and DHW (methodology of December 2023)", () => {
    const cases: [number, number, number][] = [[0, 30, 0], [-0.4, 0, 0], [0.99, 25, 1], [1, 0, 2], [1, 3.99, 2], [1, 4, 3], [2, 8, 4], [1, 12, 5], [1.5, 16, 6], [1, 19.9, 6], [1, 20, 7], [3, 40, 7]];
    for (const [hot, dhw, level] of cases) expect(coraux.niveauDuJour(hot, dhw), `${hot}, ${dhw}`).toBe(level);
    expect(coraux.niveauDuJour(null, 5)).toBeNull();
    expect(coraux.niveauDuJour(1.2, null)).toBeNull();
  });

  it("takes the highest level of the 7 days at each point, the heat and the temperature of the last day", () => {
    expect(coraux.parse(CSV)).toEqual({
      jour: "2025-04-11",
      jours: 7,
      points: [
        // DHW alone is not enough: without a HotSpot of 1 °C in the week, NOAA stays at « Veille ».
        { nom: "Récif de Saint-Gilles et l'Hermitage", lat: -21.075, lon: 55.225, niveau: 1, dhw: 15.34, sst: 28.64 },
        { nom: "au large de Saint-Pierre", lat: -21.375, lon: 55.475, niveau: 6, dhw: 16.98, sst: 28.580000000000002 },
        { nom: "au large de Saint-Benoît", lat: -21.125, lon: 55.825, niveau: 5, dhw: 15.42, sst: 28.5 },
      ],
    });
  });

  it("keeps only the days within 7 of the last one, and counts those the source has", () => {
    const c = coraux.parse(TROU);
    expect(c.jour).toBe("2026-11-05");
    // 28 and 29/10 are left out (more than 6 days before 05/11), 30 and 31/10 missing at the source: 5 days.
    expect(c.jours).toBe(5);
    expect(c.points.map((p) => p.niveau)).toEqual([0, 0, 0]);
    expect(coraux.niveauSur(c.jours)).toBe("maximum des 5 jours disponibles sur les 7 derniers (jours manquants chez la source), selon NOAA Coral Reef Watch (estimation par satellite, pas une observation sur le récif)");
    expect(coraux.niveauSur(7)).toBe(SEPT);
    // An older day's level counts as long as it is within the 7 days, whatever the rows' order.
    const [o] = coraux.POINTS;
    const old = coraux.parse(HEAD + row("2026-03-08", o.lat, o.lon, "0.2", "4.1", "29.0") + row("2026-03-02", o.lat, o.lon, "1.3", "8.2", "29.9") + row("2026-03-01", o.lat, o.lon, "2", "21", "30"));
    expect(old.jour).toBe("2026-03-08");
    expect(old.points[0]).toMatchObject({ niveau: 4, dhw: 4.1, sst: 29 });
    expect(old.jours).toBe(2);
  });

  it("leaves a masked cell without a level, ignores a day without a value, and fails with none", () => {
    const [o, s, e] = coraux.POINTS;
    const c = coraux.parse(HEAD + row("2026-03-01", o.lat, o.lon, "1.4", "4.3", "29.1") + row("2026-03-02", o.lat, o.lon, "NaN", "NaN", "NaN") + row("2026-03-02", s.lat, s.lon, "NaN", "NaN", "NaN") + row("2026-03-02", e.lat, e.lon, "0.5", "12.0", "30.2"));
    expect(c.jour).toBe("2026-03-02");
    expect(c.points.map((p) => [p.niveau, p.dhw, p.sst])).toEqual([[3, null, null], [null, null, null], [1, 12, 30.2]]);
    expect(() => coraux.parse(HEAD + row("2026-03-02", o.lat, o.lon, "NaN", "NaN", "NaN"))).toThrow(/aucune valeur/);
    expect(() => coraux.parse("<html>maintenance</html>")).toThrow(/colonnes/);
    expect(() => coraux.parse(HEAD)).toThrow(/pas de date/);
  });

  it("says the heat in °C-weeks, the day of the satellite and the level's words, from 0 to 7", () => {
    expect(coraux.chaleur(0)).toBe("0,0 °C-semaine");
    expect(coraux.chaleur(4.25)).toBe("4,3 °C-semaines");
    expect(coraux.nature("2026-10-29")).toBe("Indice calculé par NOAA Coral Reef Watch d'après la température de la mer mesurée par satellite le 29/10, publié environ 2 jours après.");
    expect(coraux.NIVEAUX).toHaveLength(8);
    expect(coraux.NIVEAUX[1]).toBe("Veille");
    expect(coraux.NIVEAUX[7]).toBe("Alerte niveau 5 : risque de mortalité presque complète (plus de 80 % des coraux)");
    expect(coraux.AIDE_CHALEUR).toContain("Selon NOAA, si la mer dépasse encore ce seuil : à partir de 4 °C-semaines, risque de blanchissement de tout le récif ;");
    expect(coraux.AIDE_CHALEUR).toMatch(/à partir de 20, risque de mortalité presque complète \(plus de 80 % des coraux\)\.$/);
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
        { lieu: "Récif de Saint-Gilles et l'Hermitage", niveau: "Veille (selon NOAA)", niveau_noaa: 1, chaleur_accumulee_12_semaines: "15,3 °C-semaines", temperature_satellite: "28,6 °C" },
        { lieu: "au large de Saint-Pierre", niveau: `${coraux.NIVEAUX[6]} (selon NOAA)`, niveau_noaa: 6, chaleur_accumulee_12_semaines: "17,0 °C-semaines", temperature_satellite: "28,6 °C" },
        { lieu: "au large de Saint-Benoît", niveau: `${coraux.NIVEAUX[5]} (selon NOAA)`, niveau_noaa: 5, chaleur_accumulee_12_semaines: "15,4 °C-semaines", temperature_satellite: "28,5 °C" },
      ],
      niveau_sur: SEPT,
      jour_mesure: "2025-04-11",
      nature: coraux.nature("2025-04-11"),
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

  it("shows /mer the level in words with a scale of 0 to 7 in night blue, what the level is, the heat, the day and the warnings", () => {
    const c = { value: coraux.parse(CSV), fetchedAt: NOW, stale: false };
    const html = reefSection(c);
    expect(html).toContain('<h2 id="h-coraux">Coraux : risque de blanchissement</h2>');
    expect(html).toContain("<b>Veille</b><span>selon NOAA</span>");
    expect(html).toContain('<span class="echelle" role="img" aria-label="niveau 1 sur une échelle de 0 à 7"><i></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i><i></i></span>');
    expect(html).toContain(`<b>${coraux.NIVEAUX[6].replace(/'/g, "&#39;")}</b>`);
    expect(html).toContain('aria-label="niveau 6 sur une échelle de 0 à 7"><i></i><i></i><i></i><i></i><i></i><i></i><i class="on"></i><i></i>');
    expect(html).toContain(`<p class="note">Niveau : ${SEPT}.</p>`);
    expect(html).toContain("Chaleur accumulée sur 12 semaines : 15,3 °C-semaines");
    expect(html).toContain("<span class=\"lieu\">Au large de Saint-Pierre</span>");
    for (const s of [coraux.nature("2025-04-11"), coraux.CASE, coraux.AIDE_CHALEUR, "C'est un indice de chaleur de la mer, pas une observation des coraux", "Source : NOAA Coral Reef Watch (domaine public)."]) expect(html).toContain(s.replace(/'/g, "&#39;"));
    // Never NOAA's yellow, orange and red.
    expect(html).not.toMatch(/#ff|yellow|orange|red/i);
    const trou = reefSection({ value: coraux.parse(TROU), fetchedAt: NOW, stale: true });
    expect(trou).toContain("<b>Pas de stress thermique</b>");
    expect(trou).toContain("Niveau : maximum des 5 jours disponibles sur les 7 derniers (jours manquants chez la source), selon NOAA");
    expect(trou).toContain("Dernière valeur gardée");
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
