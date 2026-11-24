/**
 * The sea's deep history, day by day: what the Candhis buoys of the Cerema measured since 1996 (the waves; daily mean
 * and highest significative height, highest wave, mean period) and the sea's surface temperature by satellite off the
 * four beaches of /mer since 2003 (NOAA Coral Reef Watch's CoralTemp, with its gap to NOAA's reference).
 *
 * In the D1 database `rundata-climat`, beside the weather's `jours` (scripts/mer.sql): `mer_points`, one row per
 * buoy or beach, and `mer_jour`, one row per source, point and year, its days as JSON. The years before were imported
 * once from a slow fill run on our side (one Candhis year a minute at most, 45 a day); the current year is rewritten
 * every morning by .github/workflows/mer.yml (scripts/build-mer.py --recent).
 *
 * CoralTemp starts on 01/01/2003 here, not in 1985: the license ERDDAP serves with dhw_5km (NC_GLOBAL license, read
 * 24/11/2026) keeps its OSTIA years, 1985 to 2002, for « pure academic research only, with no commercial or other
 * application » (ERDDAP gives the years, not the day: the whole of 2002 is left out).
 *
 * Until the tables are imported (a gesture of the user), every read answers an empty archive, never an error: the page
 * and the tool say « historique en cours d'import ».
 */
import { count } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import type { SourceInfo } from "../types.js";

export const SOURCE_CANDHIS: SourceInfo = {
  id: "candhis_archive",
  nom: "Archive des houlographes du réseau Candhis à La Réunion (houle mesurée, jour par jour depuis 1996)",
  organisme: "Cerema",
  licence: "Licence Ouverte 2.0",
  attribution: "Candhis (Cerema) et les partenaires de chaque campagne",
  url: "https://candhis.cerema.fr/",
  court: "Candhis",
};

export const SOURCE_CRW: SourceInfo = {
  id: "noaa_crw_coraltemp_archive",
  nom: "Température de surface de la mer par satellite, NOAA Coral Reef Watch CoralTemp (jour par jour depuis 2003)",
  organisme: "NOAA Coral Reef Watch",
  licence: "Domaine public (NOAA)",
  attribution: "NOAA Coral Reef Watch",
  url: "https://coralreefwatch.noaa.gov/product/5km/",
  court: "NOAA Coral Reef Watch",
};

/** The first day of the satellite's history here, and why (said on the page and in the tool). */
export const CRW_DEBUT = 2003;
export const CRW_POURQUOI =
  "Le satellite remonte ici à 2003\u00a0: avant, la série de NOAA s'appuie sur une analyse (OSTIA) réservée par sa licence à la recherche universitaire.";

export type Source = "candhis" | "crw";

/** What each source gives, day by day: the keys of `mer_jour.data`. */
export const CHAMPS = {
  candhis: ["hs_moy", "hs_max", "hmax", "per_moy", "n"],
  crw: ["sst", "ecart"],
} as const;
export type Champ = (typeof CHAMPS)[Source][number];

export interface PointMer {
  source: Source;
  point: string;
  nom: string;
  lat: number;
  lon: number;
  debut: number;
  fin: number;
  credit: string;
}

/** One year of a point: each field's value of each day (index = day of the year − 1, La Réunion), or null. */
export type Annee = Partial<Record<Champ, (number | null)[]>>;

export interface Archive {
  points: PointMer[];
  /** `${source}/${point}` → year → its days. */
  jours: Record<string, Record<number, Annee>>;
}

/** The part of a D1 database used here. */
export interface MerDb {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

let db: MerDb | undefined;

/** In the Worker: the database rundata-climat (the binding CLIMAT); none elsewhere. */
export function configure(d: MerDb | undefined) {
  db = d;
}
export const enabled = () => db !== undefined;

/** Not imported yet: the tables are missing. Read as an empty archive. */
const absente = (err: unknown) => /no such table/i.test(err instanceof Error ? err.message : String(err));

async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  if (!db) return [];
  count();
  try {
    return await db.all<T>(sql, ...params);
  } catch (err) {
    if (absente(err)) return [];
    throw err;
  }
}

export const cle = (p: { source: string; point: string }) => `${p.source}/${p.point}`;

/** Six hours: the archive changes once a day, after the morning's job. */
export const FRESH_SECONDS = 6 * 3600;

/**
 * Every point and every year: about 180 rows, some 2 to 3 MB of JSON. Never kept as it is: tools/mer-historique.ts
 * keeps what it computes from it (a few Ko a point).
 */
export async function lire(): Promise<Archive> {
  const [points, rows] = await Promise.all([
    all<PointMer>("SELECT source, point, nom, lat, lon, debut, fin, credit FROM mer_points"),
    all<{ source: Source; point: string; annee: number; data: string }>("SELECT source, point, annee, data FROM mer_jour"),
  ]);
  const jours: Archive["jours"] = {};
  for (const r of rows) (jours[cle(r)] ??= {})[r.annee] = JSON.parse(r.data) as Annee;
  return { points: points.filter((p) => p.source === "candhis" || p.source === "crw"), jours };
}

/** Index of a day in its year's arrays: « 2010-03-15 » → 73. */
export function indice(jour: string): number {
  const y = +jour.slice(0, 4);
  return Math.round((Date.UTC(y, +jour.slice(5, 7) - 1, +jour.slice(8, 10)) - Date.UTC(y, 0, 1)) / 86_400_000);
}

export const bissextile = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * One day of the year (« 03-15 ») in every year of every point, without reading the whole archive: the value of each
 * field that day, for the tool's `date`. 29 February only in leap years.
 */
export async function memeJour(cache: Cache, mmjj: string): Promise<Cached<{ source: Source; point: string; annee: number; valeurs: Partial<Record<Champ, number | null>> }[]>> {
  return cache.get(`mer:jour:${mmjj}`, FRESH_SECONDS, async () => {
    const fields = [...new Set(Object.values(CHAMPS).flat())].filter((c) => c !== "n");
    // The day's index in each year's arrays, by SQLite's own calendar.
    const at = (c: string) => `json_extract(data, '$.${c}[' || CAST(julianday(annee || '-' || ?) - julianday(annee || '-01-01') AS INTEGER) || ']') AS ${c}`;
    const rows = await all<Record<string, unknown> & { source: Source; point: string; annee: number }>(
      `SELECT source, point, annee, ${fields.map(at).join(", ")} FROM mer_jour`, ...fields.map(() => mmjj));
    return rows
      .filter((r) => mmjj !== "02-29" || bissextile(r.annee))
      .map((r) => ({
        source: r.source, point: r.point, annee: r.annee,
        valeurs: Object.fromEntries(fields.filter((c) => typeof r[c] === "number").map((c) => [c, r[c] as number])),
      }));
  });
}
