import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import gazetteer from "../src/places/gazetteer.js";
import { communeDuContour } from "../src/places/contours.js";
import { INSEE } from "../src/places/insee.js";
import { communeAt, placeAt } from "../src/places/resolve.js";

/**
 * The commune of a point from the communes' outlines (places/contours.ts, built by scripts/build-contours.py), no longer
 * from the nearest place of the gazetteer alone: that gave another commune to 6 % of the island and 9 % of the hikes'
 * points; the outlines simplified to 20 m, to 0.2 % and 0.5 % (24/11/2026).
 */
const FICHIER = "src/places/communes-contours.json";
const fichier = JSON.parse(readFileSync(FICHIER, "utf8")) as { tolerance_m: number; source: string; communes: { code: string; nom: string }[] };

describe("the commune of a point, from its outline", () => {
  it("has the 24 communes, simplified to 20 m, light enough for the Worker", () => {
    expect(fichier.communes.map((c) => c.code).sort()).toEqual(Object.values(INSEE).sort());
    expect(fichier.tolerance_m).toBe(20);
    expect(fichier.source).toContain("geo.api.gouv.fr (Licence Ouverte 2.0)");
    // About 20 Ko gzipped at 20 m (scripts/build-contours.py): a rebuild at another tolerance or without its encoding shows here.
    expect(gzipSync(readFileSync(FICHIER)).length).toBeLessThan(25_000);
  });

  it("gives each commune's own centre to it", () => {
    for (const p of gazetteer.places.filter((x) => x.type === "commune")) expect(communeDuContour(p.lon, p.lat), p.nom).toBe(p.nom);
  });

  it("gives a trail in a cirque to its commune, where the nearest place is in the next one", () => {
    // Points of the hikes more than 300 m from any border of the full outline, which the nearest place gave to a neighbour.
    for (const [lon, lat, proche, commune] of [
      [55.49251, -21.1133, "Salazie", "Cilaos"], // the GR R2 near the Caverne Dufour, on Cilaos's side
      [55.36994, -20.90331, "Saint-Denis", "La Possession"], // the chemin Crémont, above La Grande Chaloupe
      [55.59922, -21.31055, "Petite-Île", "Saint-Joseph"], // the boucle des Margosiers, by the Bras de Galets
    ] as const) {
      expect(placeAt(lon, lat).commune).toBe(proche);
      expect(communeDuContour(lon, lat)).toBe(commune);
      expect(communeAt(lon, lat)).toBe(commune);
    }
  });

  it("gives nothing at sea, where communeAt says the nearest place's commune, as before", () => {
    // Off Saint-Gilles, a kilometre out.
    expect(communeDuContour(55.205, -21.05)).toBeUndefined();
    expect(communeAt(55.205, -21.05)).toBe(placeAt(55.205, -21.05).commune);
    expect(communeDuContour(Number.NaN, -21)).toBeUndefined();
  });

  it("costs a few microseconds a point, its boxes first", () => {
    // Points spread over the island's box (a third at sea), the same at each run.
    let s = 42;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pts = Array.from({ length: 20_000 }, () => [55.21 + rnd() * 0.63, -21.39 + rnd() * 0.52] as const);
    communeDuContour(55.45, -21.1); // decoded at the first call
    const t0 = performance.now();
    let n = 0;
    for (const [lon, lat] of pts) if (communeDuContour(lon, lat)) n++;
    const us = ((performance.now() - t0) * 1000) / pts.length;
    console.log(`contours : ${us.toFixed(1)} µs par point, ${n} sur ${pts.length} dans un contour`);
    expect(n).toBeGreaterThan(pts.length / 2);
    // Measured about 3 µs here (24/11/2026); the bound leaves room for a slow machine, not for a scan of every outline.
    expect(us).toBeLessThan(200);
  });

  it("is read the same by the build scripts (build-contours.py contours() and commune_at)", () => {
    const code = [
      "import importlib.util, sys",
      "spec = importlib.util.spec_from_file_location('c', 'scripts/build-contours.py')",
      "c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)",
      "cs = c.contours()",
      "print(len(cs), c.commune_at((55.49251, -21.1133), cs), c.commune_at((55.205, -21.05), cs))",
    ].join("\n");
    const r = spawnSync("python3", ["-I", "-c", code], { encoding: "utf8" });
    if (r.error) throw r.error;
    expect(r.stderr).toBe("");
    expect(r.stdout.trim()).toBe(`24 ${INSEE.Cilaos} None`);
  });
});
