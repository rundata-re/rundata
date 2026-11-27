/**
 * The mobile coverage DECLARED at a point, by operator: the same layers as the map of /antennes (src/vie/couverture.json,
 * the Arcep's « Mon Réseau Mobile », Licence Ouverte 2.0, built by scripts/build-couverture.py), read here for
 * fiche_terrain. Each layer is where an operator declares NO coverage, in the island map's units (src/places/island.json,
 * about 67 m), simplified to 0.7 unit and drawn with fill-rule evenodd: a point inside an odd number of rings has no
 * coverage declared. Never a measure: declared by the operators, checked by sampling by the Arcep.
 *
 * The layers leave out a strip of 100 m along the coast (the Arcep's coastline and the communes' differ), where a point
 * is in no layer and would read as covered: a point that is not on land in every direction at COTE_M is said « not
 * computed ». No request at serve time.
 */
import data from "./couverture.json" with { type: "json" };
import island from "../places/island.json" with { type: "json" };
import { communeDuContour } from "../places/contours.js";
import type { SourceInfo } from "../types.js";

export const SOURCE_COUVERTURE: SourceInfo = {
  id: "arcep_couvertures_theoriques",
  nom: "Mon Réseau Mobile, cartes de couverture théorique",
  organisme: "Arcep",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Arcep, Mon Réseau Mobile",
  url: "https://www.data.gouv.fr/datasets/mon-reseau-mobile",
};

/** The Arcep's operators, as the site names them (web/couverture.ts: Telco OI sells as Free, SRR as SFR Réunion). */
export const OPERATEURS = [["OF", "Orange"], ["SRR", "SFR Réunion"], ["TELC", "Free"], ["ZEOP", "Zeop"]] as const;
export const TECHNOS = ["4g", "voix"] as const;

/** The coastal strip left out (100 m) and the map's rounding and simplification (about 50 m). */
export const COTE_M = 150;

const [an, t] = data.trimestre.split("_T");
export const TRIMESTRE = `${t === "1" ? "1er" : `${t}e`} trimestre ${an}`;
export const SITUATION_AU = `${data.date.slice(8, 10)}/${data.date.slice(5, 7)}/${data.date.slice(0, 4)}`;

const [LON0, LAT0, LON1, LAT1] = island.bbox;
const vers = (lon: number, lat: number) => [((lon - LON0) / (LON1 - LON0)) * island.w, ((LAT1 - lat) / (LAT1 - LAT0)) * island.h];

/** A layer's rings, each as x, y, x, y… in map units. « M x y » is absolute, « l dx dy … » relative, « z » closes. */
function anneaux(d: string): Float64Array[] {
  const out: Float64Array[] = [];
  for (const part of d.split("M").filter(Boolean)) {
    const n = part.replace(/[lz]/g, " ").trim().split(/[\s,]+/).map(Number);
    const pts: number[] = [n[0], n[1]];
    for (let i = 2; i + 1 < n.length; i += 2) pts.push(pts[pts.length - 2] + n[i], pts[pts.length - 1] + n[i + 1]);
    out.push(Float64Array.from(pts));
  }
  return out;
}

// Each layer decoded at its first use only: the eight of the operators for an address, « aucun » for the tests.
const couches = new Map<string, Float64Array[]>();
const couche = (k: string) => {
  let c = couches.get(k);
  if (!c) couches.set(k, (c = anneaux((data.couches as Record<string, string>)[k] ?? "")));
  return c;
};

/** Even-odd: whether (x, y) is inside an odd number of the rings. */
function dans(x: number, y: number, rings: Float64Array[]): boolean {
  let n = 0;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < r[i] + ((y - yi) * (r[j] - r[i])) / (yj - yi)) n++;
    }
  }
  return (n & 1) === 1;
}

/** Whether the layer `cle` (« OF-4g ») declares no coverage at the point. */
export function sansCouverture(cle: string, lon: number, lat: number): boolean {
  const [x, y] = vers(lon, lat);
  return dans(x, y, couche(cle));
}

/** Whether every point COTE_M around is on land: else the point is in the coastal strip the layers leave out. */
export function loinDuLittoral(lon: number, lat: number): boolean {
  const dLat = COTE_M / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (!communeDuContour(lon + dLon * Math.cos(a), lat + dLat * Math.sin(a))) return false;
  }
  return communeDuContour(lon, lat) !== undefined;
}

/** For each operator, whether it declares coverage at the point, for 4G internet and for calls; null on the coast. */
export function couvertureAu(lon: number, lat: number): { operateur: string; internet_4g: boolean; appels: boolean }[] | null {
  if (!loinDuLittoral(lon, lat)) return null;
  return OPERATEURS.map(([k, nom]) => ({ operateur: nom, internet_4g: !sansCouverture(`${k}-4g`, lon, lat), appels: !sansCouverture(`${k}-voix`, lon, lat) }));
}
