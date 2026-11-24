/**
 * Public services of La Réunion (town halls, prefecture, CAF, France Travail, tax offices, courts…) from the
 * Annuaire de l'administration of service-public.fr (DILA), an Opendatasoft API with no key. Full-text search over
 * the 974 entries, with opening hours, phone, address and position. The places of justice too, read by their kind of
 * service (`justice`).
 */
import type { Cache, Cached } from "../cache.js";
import { distanceKm } from "../geo.js";
import { getJson, postFile } from "../http.js";
import { INSEE } from "../places/insee.js";
import hotels from "../places/mairies-osm.json" with { type: "json" };
import type { SourceInfo } from "../types.js";
import { SOURCES as TERRAIN } from "./terrain.js";

export const SOURCE: SourceInfo = {
  id: "annuaire_administration",
  nom: "Annuaire de l'administration (service-public.fr)",
  organisme: "Direction de l'information légale et administrative (DILA)",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "DILA, service-public.fr",
  url: "https://lannuaire.service-public.gouv.fr/",
};

const URL = "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records";
const FRESH_SECONDS = 24 * 3600;
const FIELDS = "nom,code_insee_commune,adresse,plage_ouverture,telephone,adresse_courriel,site_internet,url_service_public,commentaire_plage_ouverture";

export interface Office {
  nom: string;
  insee: string;
  adresse: string;
  lon: number | null;
  lat: number | null;
  /** Opening hours as given: day ranges with up to two time ranges each. */
  horaires: { de: string; a: string; plages: [string, string][]; note?: string }[];
  note_horaires?: string;
  telephone?: string;
  courriel?: string;
  site?: string;
  fiche: string;
  /** Its kinds of service (`type_service_local`, « cpam » for the CGSS's offices); missing on a copy read before. */
  types?: string[];
  /**
   * When `lon` and `lat` are not the directory's (placed()): the directory's position, kept here, how far it lay from the
   * one given, and where the one given comes from: OpenStreetMap's town hall (`osm`), the Base adresse nationale (`ban`).
   * `ecart_m` is null, and `lon` and `lat` too, for a position out at sea the address base could not place. Its address
   * stays the directory's.
   */
  position_annuaire?: { lon: number; lat: number; ecart_m: number | null; source: "osm" | "ban" };
}

const json = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== "string" || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

type Row = Record<string, unknown>;

/** « 0(262)961000 », as the courts write it, → « 02 62 96 10 00 »; any other number as given. */
const phone = (n: string | undefined) => n?.replace(/^0\((\d{3})\)(\d{6})$/, (_, a: string, b: string) => `0${a}${b}`.replace(/(\d\d)(?=\d)/g, "$1 "));

export function office(r: Row): Office {
  const addrs = json<Record<string, string>[]>(r.adresse, []);
  const a = addrs.find((x) => x.type_adresse === "Adresse") ?? addrs[0] ?? {};
  const hours = json<Record<string, string>[]>(r.plage_ouverture, []);
  // "08:00:00" → "08:00", kept comparable as text by the open-now check.
  const hm = (t: string) => t.slice(0, 5);
  return {
    nom: String(r.nom),
    insee: String(r.code_insee_commune ?? ""),
    adresse: [a.numero_voie, a.complement1, `${a.code_postal ?? ""} ${a.nom_commune ?? ""}`.trim()].filter(Boolean).join(", "),
    lon: a.longitude ? Number(a.longitude) : null,
    lat: a.latitude ? Number(a.latitude) : null,
    horaires: hours.map((h) => ({
      de: h.nom_jour_debut.toLowerCase(),
      a: h.nom_jour_fin.toLowerCase(),
      // « 00:00 » to « 00:00 » is no span: the courts' bureau d'aide aux victimes writes it with only a note (its permanences).
      plages: ([[h.valeur_heure_debut_1, h.valeur_heure_fin_1], [h.valeur_heure_debut_2, h.valeur_heure_fin_2]] as [string, string][])
        .filter(([d, f]) => d && f && hm(d) !== hm(f))
        .map(([d, f]) => [hm(d), hm(f)] as [string, string]),
      note: h.commentaire || undefined,
    })),
    note_horaires: (r.commentaire_plage_ouverture as string) || undefined,
    telephone: phone(json<{ valeur: string }[]>(r.telephone, [])[0]?.valeur),
    courriel: (r.adresse_courriel as string) || undefined,
    site: json<{ valeur: string }[]>(r.site_internet, [])[0]?.valeur,
    fiche: String(r.url_service_public ?? ""),
    ...(r.pivot !== undefined ? { types: json<{ type_service_local: string }[]>(r.pivot, []).map((p) => p.type_service_local) } : {}),
  };
}

/**
 * Past this, the directory's position of an office is taken for wrong when the Base adresse nationale finds its address
 * to the house number: 80 of the 439 offices of La Réunion with a position lay more than 300 m from their address on
 * 24/11/2026, the town hall of Les Trois-Bassins 3.8 km away, down by the sea.
 */
export const ECART_MAX_M = 300;
/** A match of the house number itself (not the street's middle) and this sure, to stand in for the directory's position. */
const BAN_TYPE = "housenumber";
const BAN_SCORE = 0.8;

/** The address as the Base adresse nationale reads it best: number and street, postcode, commune (no « BP », no building). */
function banText(r: Row): string | undefined {
  const addrs = json<Record<string, string>[]>(r.adresse, []);
  const a = addrs.find((x) => x.type_adresse === "Adresse") ?? addrs[0];
  if (!a?.numero_voie) return undefined;
  return [a.numero_voie, a.code_postal, a.nom_commune].filter(Boolean).join(" ");
}

export const GEOCODAGE_CSV = "https://data.geopf.fr/geocodage/search/csv";

/**
 * Each commune's town hall in OpenStreetMap, built and dated by `scripts/verifier-positions.py --ecrire` (Overpass,
 * amenity=townhall, the annexes left out). A town hall's point in the directory was up to 3.8 km away from it on
 * 24/11/2026 (Les Trois-Bassins), and from its address too, where the address base put it within 50 m of OSM's.
 */
export const OSM_MAIRIES: SourceInfo = {
  id: "osm_mairies",
  nom: `Hôtels de ville cartographiés dans OpenStreetMap (liste du ${hotels.construit.split("-").reverse().join("/")})`,
  organisme: "Les contributeurs d'OpenStreetMap",
  licence: "ODbL 1.0",
  attribution: "© les contributeurs d'OpenStreetMap",
  url: "https://www.openstreetmap.org/",
};
/** OSM's town hall stands in for the directory's when the address base, whatever it matched, lies this near it. */
const ACCORD_M = 100;
const COMMUNE_OF = Object.fromEntries(Object.entries(INSEE).map(([nom, code]) => [code, nom]));
const hotelOf = (insee: string) => (hotels.mairies as Record<string, { lon: number; lat: number; osm: string }>)[COMMUNE_OF[insee]];

/** Inside La Réunion: a directory's position out of it is at sea (the CGSS's office of Saint-Paul, 110 km off, 24/11/2026). */
const surIle = (lon: number, lat: number) => lat >= -21.4 && lat <= -20.86 && lon >= 55.2 && lon <= 55.84;
const metres = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.round(distanceKm(a.lon, a.lat, b.lon, b.lat) * 1000);

/**
 * Where the position given comes from, when it is not the directory's: « Position d'après la Base adresse nationale :
 * celle de l'annuaire est à 3,8 km de l'adresse. » (words checked with the site's style guide, 24/11/2026), on the page and in
 * the tool alike.
 */
export function positionNote(o: Office): string | undefined {
  const p = o.position_annuaire;
  if (!p || p.ecart_m == null) return undefined;
  const loin = p.ecart_m >= 1000 ? `${String(Math.round(p.ecart_m / 100) / 10).replace(".", ",")} km` : `${Math.round(p.ecart_m / 10) * 10} m`;
  return `Position d'après ${p.source === "osm" ? "OpenStreetMap" : "la Base adresse nationale"}\u00a0: celle de l'annuaire est à ${loin} de l'adresse.`;
}

/** The sources of the offices' positions, beside the directory: the address base, OSM's town halls, as used. */
export const positionSources = (offices: Office[]): SourceInfo[] => [
  ...(offices.some((o) => o.position_annuaire?.source === "ban") ? [TERRAIN.ban] : []),
  ...(offices.some((o) => o.position_annuaire?.source === "osm") ? [OSM_MAIRIES] : []),
];

/** A CSV field quoted, its quotes doubled. */
const champ = (v: string) => `"${v.replaceAll('"', '""')}"`;

/** The rows of a CSV (« , », fields maybe quoted, quotes doubled inside), the header first. */
export function lignesCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let f = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') quoted = false;
      else f += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(f), (f = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f), out.push(row), (row = []), (f = "");
    } else f += c;
  }
  if (f || row.length) row.push(f), out.push(row);
  return out;
}

/**
 * The offices of these rows, each at its address, the position given in this order (the link « y aller », the
 * distances):
 *  - a town hall more than ECART_MAX_M from its commune's town hall in OpenStreetMap, where the address base places its
 *    address within ACCORD_M of OSM's: OSM's (La Possession, Saint-Paul: the street only found, but there). Saint-André,
 *    where OSM and the address base lie 1.9 km apart (24/11/2026), keeps the directory's;
 *  - an office more than ECART_MAX_M from its address found by the Base adresse nationale to the house number (score
 *    BAN_SCORE or more): the latter's. The CHU's offices, « rue de l'Hôpital » in Saint-Paul by their address and in the
 *    South by their position, the street only found, keep the directory's: which one is right is not known;
 *  - a directory's position out of the island: the address base's whatever it matched, else none.
 * All the addresses in one request (the Géoplateforme's geocoding of a CSV), whatever their number: one subrequest more
 * for a search, kept with it a day. A geocoding that fails or finds less keeps the directory's position, but one at sea.
 */
export async function placed(rows: Row[]): Promise<Office[]> {
  const offices = rows.map(office);
  const asked = offices.flatMap((o, i) => {
    const text = banText(rows[i]);
    return o.lon != null && o.lat != null && text && /^974\d\d$/.test(o.insee) ? [{ i, text, insee: o.insee }] : [];
  });
  const ban = new Map<number, { type: string; score: number; lon: number; lat: number }>();
  if (asked.length) {
    try {
      const form = new FormData();
      form.append("data", new Blob([["q,citycode", ...asked.map((a) => `${champ(a.text)},${a.insee}`)].join("\n")], { type: "text/csv" }), "adresses.csv");
      form.append("columns", "q");
      form.append("citycode", "citycode");
      for (const c of ["result_type", "result_score", "longitude", "latitude"]) form.append("result_columns", c);
      const found = lignesCsv(await postFile(TERRAIN.ban.id, GEOCODAGE_CSV, form));
      // Its columns by name (the first may come with a byte-order mark, in capitals), its rows in the order asked.
      const head = (found[0] ?? []).map((h) => h.replace(/^\uFEFF/, "").toLowerCase());
      const [type, score, lon, lat] = ["result_type", "result_score", "longitude", "latitude"].map((name) => head.indexOf(name));
      if (![type, score, lon, lat].some((k) => k < 0) && found.length - 1 === asked.length) {
        asked.forEach((a, k) => {
          const r = found[k + 1];
          const at = { type: r[type], score: Number(r[score]), lon: Number(r[lon]), lat: Number(r[lat]) };
          if (r[lon] && r[lat] && Number.isFinite(at.lon) && Number.isFinite(at.lat)) ban.set(a.i, at);
        });
      }
    } catch (err) {
      console.error("géocodage des adresses de l'annuaire indisponible :", err instanceof Error ? err.message : err);
    }
  }
  return offices.map((o, i) => {
    if (o.lon == null || o.lat == null) return o;
    const here = { lon: o.lon, lat: o.lat };
    const b = ban.get(i);
    const hotel = isTownHall(o) ? hotelOf(o.insee) : undefined;
    if (hotel && b && metres(here, hotel) > ECART_MAX_M && metres(b, hotel) <= ACCORD_M) {
      return { ...o, lon: hotel.lon, lat: hotel.lat, position_annuaire: { ...here, ecart_m: metres(here, hotel), source: "osm" as const } };
    }
    if (b && b.type === BAN_TYPE && b.score >= BAN_SCORE && metres(here, b) > ECART_MAX_M) {
      return { ...o, lon: b.lon, lat: b.lat, position_annuaire: { ...here, ecart_m: metres(here, b), source: "ban" as const } };
    }
    if (!surIle(o.lon, o.lat)) {
      return b
        ? { ...o, lon: b.lon, lat: b.lat, position_annuaire: { ...here, ecart_m: metres(here, b), source: "ban" as const } }
        : { ...o, lon: null, lat: null, position_annuaire: { ...here, ecart_m: null, source: "ban" as const } };
    }
    return o;
  });
}

/** Up to 20 offices matching `what`, in the API's relevance order: in one commune (INSEE code), or all La Réunion. */
export async function search(cache: Cache, what: string, insee?: string): Promise<Cached<Office[]>> {
  const q = what.replace(/["\\]/g, " ").trim().slice(0, 80);
  const scope = insee && /^974\d\d$/.test(insee) ? `code_insee_commune="${insee}"` : `startswith(code_insee_commune,"974")`;
  return cache.get(`annuaire:${insee ?? "974"}:${q.toLowerCase()}`, FRESH_SECONDS, async () => {
    const where = `${scope} and search("${q}")`;
    const url = `${URL}?where=${encodeURIComponent(where)}&limit=20&select=${FIELDS},pivot`;
    return placed((await getJson<{ results: Row[] }>(SOURCE.id, url)).results);
  });
}

/** A commune's town hall itself: the directory names it « Mairie - <commune> », beside the CCAS or the police municipale. */
export const isTownHall = (o: Office) => /^Mairie - /.test(o.nom);

/** A commune's town hall (INSEE code), from the search for « mairie », or none. */
export async function townHall(cache: Cache, insee: string): Promise<Office | undefined> {
  return (await search(cache, "mairie", insee)).value.find(isTownHall);
}

/**
 * The places of justice, by the annuaire's kind of service (`type_service_local` in `pivot`): the points-justice and the
 * conseil départemental de l'accès au droit, the courts, the help to victims (the courts' bureaux and the associations).
 */
export const JUSTICE_TYPES = {
  point_justice: "acces",
  cdad: "acces",
  tgi: "tribunal",
  ti: "tribunal",
  te: "tribunal",
  prudhommes: "tribunal",
  cour_appel: "tribunal",
  ta: "tribunal",
  bav: "victimes",
  aav: "victimes",
} as const;

export type JusticeType = keyof typeof JUSTICE_TYPES;
export type JusticePlace = Office & { type: JusticeType };

/** A point-justice inside a prison or a hospital (EPSMR): for the people there, left out of the answers and the pages. */
export const RESERVED = /d[ée]tention|p[ée]nitentiaire|maison d.arr[eê]t|\bEPSMR\b/i;

/** All the places of justice of La Réunion in one request (48 on 03/11/2026, the API gives up to 100), kept a day. */
export async function justice(cache: Cache): Promise<Cached<JusticePlace[]>> {
  return cache.get("annuaire:justice", FRESH_SECONDS, async () => {
    const kinds = Object.keys(JUSTICE_TYPES).map((t) => `pivot like "%\\"${t}\\"%"`).join(" or ");
    const url = `${URL}?where=${encodeURIComponent(`startswith(code_insee_commune,"974") and (${kinds})`)}&limit=100&select=${FIELDS},pivot`;
    const rows = (await getJson<{ results: Row[] }>(SOURCE.id, url)).results.flatMap((r) => {
      const type = json<{ type_service_local: string }[]>(r.pivot, []).map((p) => p.type_service_local).find((t): t is JusticeType => t in JUSTICE_TYPES);
      return type ? [{ r, type }] : [];
    });
    const offices = await placed(rows.map((x) => x.r));
    return offices.map((o, i) => ({ ...o, type: rows[i].type }));
  });
}
