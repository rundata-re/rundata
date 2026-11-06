import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { autour, averse, CUMULS_LOADER, cumulsScript, cumulsScriptPath, cumulsSection, deStation, phrases, pluvio, somme } from "../src/web/pluie-cumuls.js";
import { site } from "../src/web/site.js";

const H = 3_600_000;
const M5 = 300_000;
/** Images of 5 minutes ending at t0 + 5 min, …, their starts and ends. */
const spans = (t0: number, n: number) => ({ de: Array.from({ length: n }, (_, i) => t0 + i * M5), a: Array.from({ length: n }, (_, i) => t0 + (i + 1) * M5) });

describe("the shower around a place", () => {
  it("starts after the last hour without rain, and ends with the last wet image", () => {
    const { de, a } = spans(0, 40);
    // Wet at 0-2, dry 3-14 (an hour), wet 15-20 with 30 minutes dry inside, dry after.
    const wet = Array.from({ length: 40 }, (_, i) => i <= 2 || (i >= 15 && i <= 20) || (i >= 27 && i <= 29));
    for (let i = 21; i <= 26; i++) wet[i] = false;
    expect(averse(wet, de, a)).toEqual({ de: 15 * M5, fin: 30 * M5 });
  });

  it("is longer than the images when no hour of them is dry, and is none without rain", () => {
    const { de, a } = spans(0, 30);
    const wet = Array.from({ length: 30 }, (_, i) => i % 6 !== 0);
    expect(averse(wet, de, a)).toEqual({ de: null, fin: 30 * M5 });
    expect(averse(Array(30).fill(false), de, a)).toBeNull();
  });

  it("does not count a gap in the images as dry", () => {
    const { de, a } = spans(0, 20);
    const wet: (boolean | null)[] = Array(20).fill(false);
    wet[19] = true;
    for (let i = 5; i < 18; i++) wet[i] = null;
    // 13 images missing, then 5 dry: less than an hour known to be dry, before the data's start.
    expect(averse(wet, de, a)).toEqual({ de: null, fin: 20 * M5 });
  });
});

describe("the rain fallen", () => {
  it("adds up the lame d'eau of the images ending in the length, and counts the minutes no image with mm covers", () => {
    const mm = (v: number[]) => Float32Array.from(v);
    const ims: [number, number, Float32Array | null][] = [
      [0, M5, mm([1, 0, NaN])],
      [M5, 2 * M5, null],
      [2 * M5, 3 * M5, mm([0.5, 2, NaN])],
      [3 * M5, 4 * M5, mm([0.25, NaN, NaN])],
    ];
    const [out, miss] = somme(ims, 3, 0, 4 * M5);
    expect([...out.slice(0, 2)]).toEqual([1.75, 2]);
    expect(out[2]).toBeNaN();
    expect(miss).toBe(5);
    // From the second image on: the first is left out.
    expect(somme(ims, 3, M5, 4 * M5)[0][0]).toBe(0.75);
  });

  it("takes from the rain gauge the whole hours of the length only, none when one is not measured", () => {
    const fin = 10 * H;
    const rr = [1, 2, 3, 4];
    expect(pluvio(rr, fin, 7.5 * H, fin)).toEqual([7, 8 * H, 10 * H]);
    expect(pluvio(rr, fin, 9.5 * H, fin)).toBeNull();
    expect(pluvio([1, null, 3, 4], fin, 6 * H, fin)).toEqual([null, 6 * H, 10 * H]);
  });

  it("looks for the shower within a disc of cells, cut by the grid's edge", () => {
    expect(autour(5, 5, 20, 20, 1)).toEqual([85, 104, 105, 106, 125]);
    expect(autour(0, 0, 20, 20, 1)).toEqual([0, 1, 20]);
  });
});

describe("/meteo's « Pluie tombée »", () => {
  it("is a title in the page, hidden until its script, asked near it, writes the map and the Météo-France stations", () => {
    const html = cumulsSection();
    expect(html).toContain(`data-cumuls="${cumulsScriptPath()}" hidden`);
    expect(html).not.toContain("<option");
    expect(html.length).toBeLessThan(1000);
    const js = cumulsScript();
    // The map and the places are written into the script as a string whose < > & / are escaped.
    expect(js.match(/\\u003coption /g)!.length).toBe(meteofrance.stations().length);
    expect(js).toContain("\\u003eLe Tévelave\\u003c\\u002foption\\u003e");
    expect(js).not.toMatch(/<\/|\u2028|\u2029/);
    // Both scripts are valid JavaScript.
    expect(() => new Script(js)).not.toThrow();
    expect(() => new Script(CUMULS_LOADER)).not.toThrow();
  });

  it("serves its script at its address, kept a year", async () => {
    const res = await site(new Request(`https://rundata.re${cumulsScriptPath()}`), new Cache(new MemoryStore()), () => {});
    expect(res!.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res!.text()).toBe(cumulsScript());
  });
});

describe("the block's lines, the measure first", () => {
  const mm = (v: number) => `${v.toLocaleString("fr-FR")} mm`;
  const span = (a: number, b: number) => `de ${a / H}:00 à ${b / H}:00`;
  const words = (p: (string | [string, string])[]) => p.map((x) => (typeof x === "string" ? x : x[0])).join("");

  it("says the rain gauge's whole hours in bold, the radar's estimate below, without the gap sentence when they agree", () => {
    const [gras, petit] = phrases("Cilaos", "de Cilaos", 3.2, " sur les 3 dernières heures", [3, 9 * H, 12 * H], 3.1, NaN, "", mm, span);
    expect(gras).toBe("Cilaos : 3 mm mesurés au pluviomètre de 9:00 à 12:00.");
    expect(petit).toEqual([" Le radar de Météo-France estime 3,2 mm au même endroit sur les 3 dernières heures : une estimation, pas une mesure."]);
  });

  it("adds the gap sentence, with the two official links, from 5 mm and twice the other on the same hours, a zero counting", () => {
    const [, petit] = phrases("Cilaos", "de Cilaos", 1, " sur la dernière heure", [0, 11 * H, 12 * H], 6, NaN, " Il manque 15 min d'images.", mm, span);
    expect(words(petit)).toBe(" Le radar de Météo-France estime 1 mm au même endroit sur la dernière heure : une estimation, pas une mesure. Il manque 15 min d'images." +
      " Sur les mêmes heures, le pluviomètre a mesuré 0 mm et le radar estime 6 mm. Le pluviomètre mesure en un point ; le radar estime d'en haut, par carrés d'environ 550 m." +
      " Un chiffre bas ne veut pas dire qu'il n'a pas plu fort tout près : avant de traverser une ravine ou un radier, voyez la vigilance et le niveau des rivières.");
    expect(petit.filter((x) => typeof x !== "string")).toEqual([["vigilance", "/vigilance"], ["niveau des rivières", "/crues"]]);
    // Below 5 mm, or less than twice, or the radar not seeing those hours: no gap sentence.
    for (const [x, yp] of [[0, 4.9], [5, 9], [8, NaN]]) expect(phrases("Cilaos", "de Cilaos", 1, "", [x, 0, H], yp, NaN, "", mm, span)[1]).toHaveLength(1);
    expect(phrases("Cilaos", "de Cilaos", 1, "", [10, 0, H], 5, NaN, "", mm, span)[1]).toHaveLength(6);
  });

  it("puts the radar in bold, with « estimés », when the gauge has no whole hour, misses one, or 1 mm fell since its last", () => {
    expect(phrases("Le Port", "du Port", 2.4, " depuis le début de l'averse, aujourd'hui à 14:05", null, NaN, NaN, "", mm, span)).toEqual([
      "Le Port : 2,4 mm estimés par le radar depuis le début de l'averse, aujourd'hui à 14:05.",
      [" Une estimation, pas une mesure. Le pluviomètre du Port donne la pluie heure par heure : pas encore d'heure entière sur cette durée."],
    ]);
    expect(phrases("Le Port", "du Port", 2.4, "", [null, 9 * H, 12 * H], NaN, NaN, "", mm, span)[1]).toEqual([" Une estimation, pas une mesure. Le pluviomètre du Port n'a pas mesuré toutes les heures de cette durée."]);
    const recent = phrases("Le Port", "du Port", 4, " sur les 3 dernières heures", [0.5, 9 * H, 11 * H], 0.4, 1, "", mm, span);
    expect(recent).toEqual([
      "Le Port : 4 mm estimés par le radar sur les 3 dernières heures.",
      [" Une estimation, pas une mesure. Le pluviomètre du Port a mesuré 0,5 mm de 9:00 à 11:00 ; pas encore d'heure entière depuis."],
    ]);
    // Less than 1 mm since: still the measure first.
    expect(phrases("Le Port", "du Port", 4, "", [0.5, 9 * H, 11 * H], 0.4, 0.9, "", mm, span)[0]).toBe("Le Port : 0,5 mm mesurés au pluviomètre de 9:00 à 11:00.");
  });

  it("says when the radar has no estimate at the place, in either case", () => {
    expect(phrases("Cilaos", "de Cilaos", NaN, " sur la dernière heure", [2, 11 * H, 12 * H], NaN, NaN, "", mm, span)[1]).toEqual([" Le radar de Météo-France n'a pas d'estimation au même endroit sur la dernière heure."]);
    expect(phrases("Cilaos", "de Cilaos", NaN, " sur la dernière heure", null, NaN, NaN, " Pas de pluie vue.", mm, span)).toEqual([
      "Cilaos : pas d'estimation du radar sur la dernière heure.",
      [" Le pluviomètre de Cilaos donne la pluie heure par heure : pas encore d'heure entière sur cette durée. Pas de pluie vue."],
    ]);
  });

  it("names the rain gauge with its article, elided before a vowel", () => {
    expect(["Le Port", "Les Avirons - CIRAD", "Aurère", "Îlet à Cordes", "Étang Saint-Leu - CIRAD", "Cilaos", "La Nouvelle"].map(deStation))
      .toEqual(["du Port", "des Avirons - CIRAD", "d'Aurère", "d'Îlet à Cordes", "d'Étang Saint-Leu - CIRAD", "de Cilaos", "de La Nouvelle"]);
    // In the menu of the page's script, escaped as its other attributes (inScript).
    expect(cumulsScript()).toContain(`data-de=\\"d\\u0026#39;Aurère\\"`);
  });

  it("is written into the page's script as it is", () => {
    expect(cumulsScript()).toContain(`phrases=${phrases}`);
  });
});
