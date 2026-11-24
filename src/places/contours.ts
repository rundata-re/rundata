/**
 * The commune whose outline holds a point: the 24 outlines of geo.api.gouv.fr (Licence Ouverte 2.0), simplified to
 * 20 m with each border once for both its communes (scripts/build-contours.py), 7 000 points, 20 Ko gzipped. The nearest
 * place of the gazetteer, which communeAt gave alone before, gave another commune to 6 % of the island and 9 % of the
 * hikes' points (in the cirques and the Hauts, where places are few); these outlines, to 0.2 % and 0.5 % (24/11/2026).
 *
 * Each commune's box first, then even-odd over the rings of its polygons (holes too), as the build scripts' inside().
 * Decoded once, at the first call.
 */
import data from "./communes-contours.json" with { type: "json" };
import { INSEE } from "./insee.js";

/** A polygon's rings, each as its coordinates one after another: lon, lat, lon, lat… */
type Polygone = Float64Array[];
type Commune = { nom: string; ouest: number; sud: number; est: number; nord: number; polygones: Polygone[] };

/** The gazetteer's spelling of each commune, by its INSEE code: the one the pages and the tools say. */
const NOM = new Map(Object.entries(INSEE).map(([nom, code]) => [code, nom]));

let communes: Commune[] | undefined;

/** A polyline of Google's encoding (5 decimals, latitude first), as lon, lat, lon, lat… */
function anneau(s: string): Float64Array {
  const out: number[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let shift = 0;
    let v = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      v |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return v & 1 ? ~(v >> 1) : v >> 1;
  };
  while (i < s.length) {
    lat += next();
    lon += next();
    out.push(lon / 1e5, lat / 1e5);
  }
  return Float64Array.from(out);
}

function lues(): Commune[] {
  return (communes ??= data.communes.map((c) => {
    const nom = NOM.get(c.code);
    if (!nom) throw new Error(`contours : code INSEE inconnu ${c.code}`);
    const [ouest, sud, est, nord] = c.bbox;
    return { nom, ouest, sud, est, nord, polygones: c.polygones.map((p) => p.map(anneau)) };
  }));
}

/** Whether (x, y) is inside the polygon: an odd number of its rings' edges crossed on the way to the east. */
function dans(x: number, y: number, p: Polygone): boolean {
  let n = 0;
  for (const r of p) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < r[i] + ((y - yi) * (r[j] - r[i])) / (yj - yi)) n++;
    }
  }
  return (n & 1) === 1;
}

/** The commune whose outline holds the point; undefined off every outline (at sea, and on the shore at its edge). */
export function communeDuContour(lon: number, lat: number): string | undefined {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  for (const c of lues()) {
    if (lon < c.ouest || lon > c.est || lat < c.sud || lat > c.nord) continue;
    if (c.polygones.some((p) => dans(lon, lat, p))) return c.nom;
  }
  return undefined;
}
