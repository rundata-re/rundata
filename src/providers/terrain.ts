/**
 * What official registers say about a point of La Réunion, all without a key:
 * - address search: Géoplateforme geocoder (Base adresse nationale), IGN;
 * - cadastral parcel and zone of the local urban plan (PLU): API Carto, IGN (cadastre, Géoportail de l'urbanisme);
 * - ground altitude: IGN RGE ALTI;
 * - property sales around: DVF open data, Cerema API (published as "preprod", no availability promise); on the street
 *   asked, the commune's yearly files of DVF géolocalisées (Etalab), which keep the street's code;
 * - risk prevention plans (PPR) at the point: public-utility easements of the Géoportail de l'urbanisme, through API Carto;
 * - natural disaster decrees of the commune and landslides recorded around: Géorisques API v1 (BRGM).
 */
import type { Cache, Cached } from "../cache.js";
import { distanceKm } from "../geo.js";
import { getJson, getText } from "../http.js";
import { UpstreamError, type SourceInfo } from "../types.js";
import { ALTIMETRIE } from "./ign.js";

export const SOURCES: Record<"ban" | "cadastre" | "gpu" | "alti" | "dvf" | "dvfVoie" | "ppr" | "georisques", SourceInfo> = {
  ban: { id: "ban_geocodage", nom: "Base adresse nationale (géocodage de la Géoplateforme)", organisme: "IGN, Etalab", licence: "Licence Ouverte Etalab 2.0", attribution: "BAN, IGN", url: "https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage" },
  cadastre: { id: "cadastre_apicarto", nom: "Plan cadastral (API Carto)", organisme: "DGFiP, IGN", licence: "Licence Ouverte Etalab 2.0", attribution: "DGFiP, IGN", url: "https://apicarto.ign.fr/api/doc/cadastre" },
  gpu: { id: "gpu_zone_urba", nom: "Zonage des plans locaux d'urbanisme (Géoportail de l'urbanisme)", organisme: "Communes, IGN", licence: "Licence Ouverte Etalab 2.0", attribution: "Géoportail de l'urbanisme", url: "https://www.geoportail-urbanisme.gouv.fr" },
  alti: ALTIMETRIE,
  ppr: { id: "gpu_ppr", nom: "Plans de prévention des risques (servitudes du Géoportail de l'urbanisme)", organisme: "DEAL Réunion, IGN", licence: "Licence Ouverte Etalab 2.0", attribution: "DEAL Réunion, Géoportail de l'urbanisme", url: "https://www.geoportail-urbanisme.gouv.fr" },
  georisques: { id: "georisques", nom: "Géorisques : arrêtés de catastrophe naturelle, mouvements de terrain recensés (BDMvt)", organisme: "Ministère de la Transition écologique, BRGM", licence: "Licence Ouverte Etalab 2.0", attribution: "Géorisques, BRGM", url: "https://www.georisques.gouv.fr" },
  dvf: { id: "dvf_cerema", nom: "Demandes de valeurs foncières (DVF open data, Cerema)", organisme: "DGFiP, Cerema", licence: "Licence Ouverte Etalab 2.0", attribution: "DGFiP, Cerema (DVF open data)", url: "https://apidf-preprod.cerema.fr" },
  dvfVoie: { id: "dvf_etalab", nom: "Demandes de valeurs foncières géolocalisées (DVF, Etalab)", organisme: "DGFiP, Etalab", licence: "Licence Ouverte Etalab 2.0", attribution: "DGFiP, Etalab (DVF géolocalisées)", url: "https://files.data.gouv.fr/geo-dvf/" },
};

const DAY = 24 * 3600;
const point = (lon: number, lat: number) => encodeURIComponent(JSON.stringify({ type: "Point", coordinates: [lon, lat] }));
// What is read at the point (its parcel, its zone of the PLU, its risk prevention plans, its altitude) is kept to
// about a metre (5 decimals): a parcel in town can be a few metres wide, and rounding further would give the
// neighbour's. What is read around it (the sales, the landslides) does not depend on the metre: its centre is snapped
// to about 10 m (4 decimals), so that points a few metres apart share it, and the parcel and the commune do not change.
const key = (lon: number, lat: number) => `${lon.toFixed(5)},${lat.toFixed(5)}`;
const AROUND_DECIMALS = 4;
const snap = (v: number) => Math.round(v * 10 ** AROUND_DECIMALS) / 10 ** AROUND_DECIMALS;
// The farthest a snapped centre lies from the point, in metres (half the diagonal of a cell of 4 decimals), rounded up.
export const SNAP_M = 8;

export interface Address {
  label: string;
  lon: number;
  lat: number;
  score: number;
  type: string;
  insee: string;
  /** The street's name, for a street or a house number: what was asked is checked against it. */
  street?: string;
  /** The address base's id: « 97416_1281 » for a street, « 97416_1281_00012 » for a number on it. */
  id?: string;
}

/**
 * The street's code in the land registry (FANTOIR), from the address base's id: « 1281 » for « 97416_1281 » or
 * « 97416_1281_00012 ». None for a street the address base names on its own (« 97415_xutypl »): DVF does not know it.
 */
export function codeVoie(id: string | undefined): string | undefined {
  const m = /^974\d\d_([0-9A-Z]\d{3})(?:_|$)/i.exec(id ?? "");
  return m?.[1].toUpperCase();
}

/** The best address match in La Réunion (postcodes 974xx), or null. */
// With the commune named in the question, only that commune's answers: otherwise the base may put the same street name of
// another commune first.
export async function geocode(cache: Cache, q: string, insee?: string): Promise<Cached<Address | null>> {
  const text = q.trim().slice(0, 200);
  return cache.get(`ban:${insee ? `${insee}:` : ""}${text.toLowerCase()}`, DAY, async () => {
    const r = await getJson<{ features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number> }[] }>(
      SOURCES.ban.id,
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(`${text} La Réunion`)}&limit=5${insee ? `&citycode=${insee}` : ""}`,
    );
    const f = r.features.find((x) => String(x.properties.postcode ?? "").startsWith("974"));
    if (!f) return null;
    const p = f.properties;
    return {
      label: String(p.label), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], score: Number(p.score), type: String(p.type), insee: String(p.citycode),
      ...(p.street ? { street: String(p.street) } : {}),
      ...(p.id ? { id: String(p.id) } : {}),
    };
  });
}

// DVF writes a street's name the land registry's way, shortened: « CHE DES CANNAS », « RUE DU GEN DE GAULLE (ST G) ».
const ABREGES: Record<string, string> = {
  GEN: "GENERAL", GAL: "GENERAL", ST: "SAINT", STE: "SAINTE", AV: "AVENUE", AVE: "AVENUE", BD: "BOULEVARD", BLD: "BOULEVARD",
  CHE: "CHEMIN", CHEM: "CHEMIN", CH: "CHEMIN", IMP: "IMPASSE", ALL: "ALLEE", RTE: "ROUTE", LOT: "LOTISSEMENT", RES: "RESIDENCE",
  PL: "PLACE", SQ: "SQUARE", PROM: "PROMENADE", DR: "DOCTEUR", MAL: "MARECHAL", PDT: "PRESIDENT", PROF: "PROFESSEUR",
  CDT: "COMMANDANT", CNE: "CAPITAINE", LT: "LIEUTENANT", COL: "COLONEL", MGR: "MONSEIGNEUR", HAM: "HAMEAU", SENT: "SENTIER",
  SEN: "SENTIER", QUA: "QUARTIER", QUAR: "QUARTIER", CTRE: "CENTRE", R: "RUE", ZA: "ZONE ARTISANALE", ZI: "ZONE INDUSTRIELLE",
  RN: "ROUTE NATIONALE", RD: "ROUTE DEPARTEMENTALE", VC: "VOIE COMMUNALE", PTE: "PETITE", GDE: "GRANDE", GD: "GRAND", PT: "PETIT",
};

/**
 * A street's name as the address base and DVF can be compared on: without the quarter in brackets, the accents, the case,
 * the land registry's short words nor the spaces. « Chemin Champdemerle » and « CHE CHAMP DE MERLE » give the same.
 */
export function nomVoie(nom: string): string {
  const words = nom.replace(/\([^)]*\)/g, " ").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/);
  return words.filter(Boolean).map((w) => ABREGES[w] ?? w).join("");
}

/**
 * How many streets of the commune the address base names like `nom` (see nomVoie): one, or a street of the same name
 * elsewhere in the commune (« Chemin Boyer » at Bois de Nèfles and at Tan Rouge), whose sales DVF cannot tell apart.
 */
export async function homonymes(cache: Cache, nom: string, insee: string): Promise<Cached<number>> {
  const text = nom.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const n = nomVoie(nom);
  return cache.get(`ban-homonymes:${insee}:${n}`, 7 * DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | number> }[] }>(
      SOURCES.ban.id,
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(text)}&citycode=${insee}&type=street&limit=10`,
    );
    return new Set(r.features.filter((x) => nomVoie(String(x.properties.name ?? "")) === n).map((x) => String(x.properties.id ?? x.properties.name))).size;
  });
}

/**
 * Whether the address base gives the land registry code `code` of commune `insee` to a street of its own: then DVF's
 * street of that code is that one, not a street the address base names on its own whose name DVF also writes (« CHE DES
 * CANNAS », code 0280 of Le Tampon, is « Chemin Communal des Canas » there, not « Chemin des Cannas »). Answered 404
 * « La voie n'existe pas » for a code no street has.
 */
export async function codePris(cache: Cache, insee: string, code: string): Promise<Cached<boolean>> {
  return cache.get(`ban-code:${insee}_${code}`, 7 * DAY, async () => {
    try {
      await getJson<unknown>(SOURCES.ban.id, `https://plateforme.adresse.data.gouv.fr/lookup/${insee}_${encodeURIComponent(code)}`);
      return true;
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) return false;
      throw err;
    }
  });
}

/** Up to five streets of a commune whose names come close to `q`, best first, without the postcode: « Rue Juliette Dodu ». */
export async function streets(cache: Cache, q: string, insee: string): Promise<Cached<string[]>> {
  const text = q.trim().slice(0, 200);
  return cache.get(`ban-voies:${insee}:${text.toLowerCase()}`, DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | number> }[] }>(
      SOURCES.ban.id,
      `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(text)}&citycode=${insee}&type=street&limit=5`,
    );
    return [...new Set(r.features.filter((x) => String(x.properties.postcode ?? "").startsWith("974")).map((x) => String(x.properties.name)))];
  });
}

export interface Parcel {
  idu: string;
  section: string;
  numero: string;
  commune: string;
  contenance_m2: number;
}

export async function parcel(cache: Cache, lon: number, lat: number): Promise<Cached<Parcel | null>> {
  return cache.get(`cadastre:${key(lon, lat)}`, DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | number> }[] }>(
      SOURCES.cadastre.id, `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${point(lon, lat)}`, 25_000);
    const p = r.features[0]?.properties;
    return p ? { idu: String(p.idu), section: String(p.section), numero: String(p.numero), commune: String(p.nom_com), contenance_m2: Number(p.contenance) } : null;
  });
}

export interface Zone {
  libelle: string;
  libelong: string;
  typezone: string;
  date: string;
  document: string;
}

// API Carto's Géoportail de l'urbanisme answers in 1 to 2 s, or gives up by itself after about 11 s with a 500 (26/10):
// waiting longer only held the fiche, up to the 25 s of a read that never came back, for neither the zone nor the plans.
const GPU_MS = 12_000;

export async function zone(cache: Cache, lon: number, lat: number): Promise<Cached<Zone | null>> {
  return cache.get(`gpu:${key(lon, lat)}`, DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | null> }[] }>(
      SOURCES.gpu.id, `https://apicarto.ign.fr/api/gpu/zone-urba?geom=${point(lon, lat)}`, GPU_MS);
    const p = r.features[0]?.properties;
    return p ? { libelle: p.libelle ?? "", libelong: p.libelong ?? "", typezone: p.typezone ?? "", date: p.datvalid ?? "", document: p.partition ?? "" } : null;
  });
}

export async function altitude(cache: Cache, lon: number, lat: number): Promise<Cached<number | null>> {
  return cache.get(`alti:${key(lon, lat)}`, 30 * DAY, async () => {
    const r = await getJson<{ elevations: number[] }>(
      SOURCES.alti.id,
      `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&zonly=true`,
    );
    const z = r.elevations[0];
    return z != null && z > -100 ? Math.round(z) : null;
  });
}

export interface Sale {
  annee: number;
  type: string;
  code: string;
  valeur: number;
  surface_bati: number;
  surface_terrain: number;
  lots: number;
  /** DVF's nature: « Vente », « Echange »… */
  nature: string;
}

/** Sales within about `halfSideM` metres since `fromYear`, without geometry nor parcel ids (aggregated by the tool). */
export async function sales(cache: Cache, lon: number, lat: number, fromYear: number, halfSideM = 300): Promise<Cached<Sale[]>> {
  // About 600 m × 600 m around the point (tools/terrain.ts): moved 8 m at most by the snapping.
  [lon, lat] = [snap(lon), snap(lat)];
  const dLat = halfSideM / 111_320;
  const dLon = halfSideM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(5)).join(",");
  // v2: with the nature of each sale (an older entry has none).
  return cache.get(`dvf:v2:${bbox}:${fromYear}`, 7 * DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | number> }[] }>(
      SOURCES.dvf.id,
      `https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/?in_bbox=${bbox}&anneemut_min=${fromYear}&page_size=500`,
      25_000,
    );
    return r.features
      .map(({ properties: p }) => ({
        annee: Number(p.anneemut),
        type: String(p.libtypbien),
        code: String(p.codtypbien),
        valeur: Number(p.valeurfonc),
        surface_bati: Number(p.sbati),
        surface_terrain: Number(p.sterr),
        lots: Number(p.nblocmut),
        nature: String(p.libnatmut),
      }))
      .filter((s) => s.valeur > 0 && String(s.code) !== "undefined");
  });
}

export interface StreetSale {
  annee: number;
  /** « maison » or « appartement » sold alone (with its outbuildings), « terrain » without a building, else « autre ». */
  type: "maison" | "appartement" | "terrain" | "autre";
  valeur: number;
  surface_bati: number;
  surface_terrain: number;
  /** Sold off plan, as a new home (DVF's nature « Vente en l'état futur d'achèvement »). */
  vefa: boolean;
}

/** The yearly files of DVF géolocalisées, one per commune; the years that have one. */
const GEO_DVF = (year: number, insee: string) => `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/974/${insee}.csv`;
// Not sales, though DVF records them.
export const NOT_SALES = new Set(["Echange", "Expropriation"]);
/** DVF's nature of a sale off plan, a new home: counted apart (tools/terrain.ts). A new home sold once built is a « Vente ». */
export const VEFA = "Vente en l'état futur d'achèvement";

/** One line of a CSV file of geo-dvf, its quoted fields included. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * The sales of one year file on the street `voie` (its FANTOIR code), each sale once with all its lines, those on other
 * streets included (a house on this street sold with a field elsewhere is one sale, at one price). DVF may record one
 * sale twice: two of the same value on exactly the same parcels and lots count once.
 */
export function streetSales(csv: string, voie: string): StreetSale[] {
  const lines = csv.split("\n");
  const head = cells(lines[0] ?? "");
  const col = (name: string) => head.indexOf(name);
  const [ID, DATE, NATURE, VALEUR, CODE_VOIE, PARCELLE, LOT, TYPE, SBATI, CULTURE, STERR] = ["id_mutation", "date_mutation", "nature_mutation", "valeur_fonciere", "adresse_code_voie", "id_parcelle", "lot1_numero", "code_type_local", "surface_reelle_bati", "code_nature_culture", "surface_terrain"].map(col);
  if ([ID, CODE_VOIE, VALEUR].some((i) => i < 0)) return [];
  // The street's code is a field of its own: a quick look first, then the field checked.
  const ids = new Set<string>();
  for (const line of lines.slice(1)) if (line.includes(`,${voie},`)) {
    const c = cells(line);
    if (c[CODE_VOIE] === voie) ids.add(c[ID]);
  }
  const rows = new Map<string, string[][]>();
  for (const line of lines.slice(1)) {
    const id = line.slice(0, line.indexOf(","));
    if (ids.has(id)) rows.set(id, [...(rows.get(id) ?? []), cells(line)]);
  }
  const seen = new Set<string>();
  return [...rows.values()].flatMap((r) => {
    const first = r[0];
    const valeur = Number(first[VALEUR]);
    if (NOT_SALES.has(first[NATURE]) || !(valeur > 0)) return [];
    const same = `${valeur}|${[...new Set(r.map((c) => `${c[PARCELLE]}:${c[LOT]}`))].sort().join(",")}`;
    if (seen.has(same)) return [];
    seen.add(same);
    // A building is on as many lines as its parcel has kinds of land, and a kind of land on as many as the parcel has
    // buildings: each counted once, per parcel, lot, kind and surface, and per parcel and kind of land.
    const locals = new Map<string, { type: string; bati: number }>();
    const land = new Map<string, number>();
    for (const c of r) {
      if (c[TYPE]) locals.set([c[PARCELLE], c[LOT], c[TYPE], c[SBATI]].join("|"), { type: c[TYPE], bati: Number(c[SBATI]) || 0 });
      if (c[CULTURE]) land.set(`${c[PARCELLE]}|${c[CULTURE]}`, Number(c[STERR]) || 0);
    }
    const of = (code: string) => [...locals.values()].filter((l) => l.type === code);
    const [maisons, apparts, locaux] = [of("1"), of("2"), of("4")];
    const type: StreetSale["type"] = !locals.size ? "terrain" : maisons.length === 1 && !apparts.length && !locaux.length ? "maison" : apparts.length === 1 && !maisons.length && !locaux.length ? "appartement" : "autre";
    return [{
      annee: Number(first[DATE].slice(0, 4)),
      type,
      valeur,
      surface_bati: type === "maison" ? maisons[0].bati : type === "appartement" ? apparts[0].bati : 0,
      surface_terrain: [...land.values()].reduce((a, b) => a + b, 0),
      vefa: first[NATURE] === VEFA,
    }];
  });
}

/**
 * The street codes DVF gives the street named `nom` (compared by nomVoie) in these year files of one commune. One code is
 * the street; none or several, its sales cannot be told for sure.
 */
export function codesByName(csvs: string[], nom: string): Set<string> {
  const want = nomVoie(nom);
  const codes = new Set<string>();
  for (const csv of csvs) {
    const lines = csv.split("\n");
    const head = cells(lines[0] ?? "");
    const [NOM, CODE] = [head.indexOf("adresse_nom_voie"), head.indexOf("adresse_code_voie")];
    if (NOM < 0 || CODE < 0) continue;
    // A file has a few hundred street names for thousands of lines: each name normalized once. Only the two fields are
    // cut out of a line without quotes (DVF's lines have none), the name's field and the code's after it.
    const seen = new Map<string, boolean>();
    const field = (line: string, n: number) => {
      let start = 0;
      for (let i = 0; i < n; i++) start = line.indexOf(",", start) + 1;
      if (!start) return "";
      const end = line.indexOf(",", start);
      return end < 0 ? line.slice(start) : line.slice(start, end);
    };
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const quoted = line.includes('"') ? cells(line) : undefined;
      const name = quoted ? quoted[NOM] : field(line, NOM);
      if (!name) continue;
      let same = seen.get(name);
      if (same === undefined) seen.set(name, (same = nomVoie(name) === want));
      if (!same) continue;
      const code = quoted ? quoted[CODE] : field(line, CODE);
      if (code) codes.add(code);
    }
  }
  return codes;
}

/**
 * The sales on the street of commune `insee`, from `fromYear` to `toYear`: one file per year. The street is its FANTOIR
 * code, or, for a street the address base names on its own, its name, then read only when DVF gives that name one code
 * in all the years read; else null, its sales not read. A year without a file yet (404) is left out; `annees` says which
 * were read; `code`, the street's code, found or given.
 */
export async function salesOnStreet(cache: Cache, insee: string, voie: { code: string } | { nom: string }, fromYear: number, toYear: number): Promise<Cached<{ ventes: StreetSale[]; annees: number[]; code: string } | null>> {
  // v3: each sale says whether it is off plan (an older entry does not).
  const which = "code" in voie ? voie.code : `nom:${nomVoie(voie.nom)}`;
  return cache.get(`dvf-voie:v3:${insee}:${which}:${fromYear}-${toYear}`, 7 * DAY, async () => {
    const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);
    const files = await Promise.all(years.map((y) => getText(SOURCES.dvfVoie.id, GEO_DVF(y, insee), 25_000).catch((err) => {
      if (err instanceof UpstreamError && err.status === 404) return undefined;
      throw err;
    })));
    const read = files.filter((f): f is string => f !== undefined);
    let code: string;
    if ("code" in voie) code = voie.code;
    else {
      const codes = codesByName(read, voie.nom);
      if (codes.size !== 1) return null;
      [code] = codes;
    }
    return {
      ventes: read.flatMap((f) => streetSales(f, code)),
      annees: years.filter((_, i) => files[i] !== undefined),
      code,
    };
  });
}

/** What a plan's file name says it covers, e.g. PM1_PPR_i_mvt_SAINT_DENIS_gen2_ass. */
const PPR_RISKS: Record<string, string> = {
  i: "inondation",
  mvt: "mouvements de terrain",
  l: "recul du trait de côte et submersion marine",
  alea_cotier: "aléa côtier",
};

export interface Plan {
  /** « naturels » (PM1) or « technologiques » (PM3). */
  famille: "naturels" | "technologiques";
  risques: string[];
  /** The servitude's own name, for a technological plan (the site it is about). */
  nom: string;
  /** The point lies in the plan's regulated zones (red or blue), not only in its perimeter. */
  zone_reglementee: boolean;
  /** Latest approval date found in the plan's files, as YYYY-MM-DD. */
  approuve_le?: string;
  document: string;
}

/** Latest valid date among the act files « …_20121017_act.pdf|… » (some carry impossible ones, such as 20221929). */
export function latestAct(fichier: string): string | undefined {
  const dates = [...fichier.matchAll(/_(\d{4})(\d{2})(\d{2})_act/g)]
    .map(([, y, m, d]) => ({ y: +y, m: +m, d: +d }))
    .filter(({ m, d }) => m >= 1 && m <= 12 && d >= 1 && d <= 31)
    .map(({ y, m, d }) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
    .sort();
  return dates.at(-1);
}

export function planOf(p: Record<string, string | null>): Plan | null {
  const type = (p.suptype ?? "").toLowerCase();
  if (type !== "pm1" && type !== "pm3") return null;
  const name = p.nomass ?? "";
  const m = /^PM1_PPR_(.+?)_[A-Z][A-Z_]*_gen\d/.exec(name.replace(/_MVT_/, "_mvt_"));
  const risques = type === "pm1" && m ? Object.entries(PPR_RISKS).filter(([k]) => new RegExp(`(^|_)${k}(_|$)`).test(m[1])).map(([, v]) => v) : [];
  return {
    famille: type === "pm1" ? "naturels" : "technologiques",
    risques,
    nom: type === "pm3" ? name.replace(/^PM3_\d+_/, "").replace(/_gen.*$/, "").replace(/_/g, " ") : name,
    zone_reglementee: /zonages? r[ée]glementaires?/i.test(p.typeass ?? ""),
    approuve_le: latestAct(p.fichier ?? ""),
    document: p.gpu_doc_id ? `https://www.geoportail-urbanisme.gouv.fr/document/by-id/${p.gpu_doc_id}` : "https://www.geoportail-urbanisme.gouv.fr",
  };
}

/** Risk prevention plans whose regulated area holds the point (natural PM1, technological PM3), one per plan. */
export async function plans(cache: Cache, lon: number, lat: number): Promise<Cached<Plan[]>> {
  return cache.get(`ppr:${key(lon, lat)}`, 7 * DAY, async () => {
    const r = await getJson<{ features: { properties: Record<string, string | null> }[] }>(
      SOURCES.ppr.id, `https://apicarto.ign.fr/api/gpu/assiette-sup-s?geom=${point(lon, lat)}`, GPU_MS);
    const seen = new Set<string>();
    return r.features.flatMap(({ properties }) => {
      const plan = planOf(properties);
      if (!plan || seen.has(plan.nom)) return [];
      seen.add(plan.nom);
      return [plan];
    });
  });
}

export interface Catnat {
  risques: string[];
  debut: string;
  fin: string;
  arrete: string;
}

const iso = (d: string) => d.split("/").reverse().join("-");

/**
 * Géorisques restricts its API by country since its attacks of September 2026, and about one call in two from a
 * Worker fails (HTTP 520 or a reset); the next one usually goes through. Answers are then cached for days.
 */
async function georisques<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getJson<T>(SOURCES.georisques.id, url, 15_000);
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
}

/** Natural disaster decrees (CatNat) of a commune, one per event, newest first. */
export async function catnat(cache: Cache, insee: string): Promise<Cached<Catnat[]>> {
  return cache.get(`catnat:${insee}`, 7 * DAY, async () => {
    const r = await georisques<{ data: Record<string, string>[] }>(`https://www.georisques.gouv.fr/api/v1/gaspar/catnat?code_insee=${insee}&page_size=200`);
    const events = new Map<string, Catnat>();
    for (const d of r.data) {
      const id = `${d.code_national_catnat}:${d.date_debut_evt}`;
      const e = events.get(id) ?? { risques: [], debut: iso(d.date_debut_evt), fin: iso(d.date_fin_evt), arrete: iso(d.date_publication_arrete) };
      if (!e.risques.includes(d.libelle_risque_jo)) e.risques.push(d.libelle_risque_jo);
      events.set(id, e);
    }
    return [...events.values()].sort((a, b) => b.debut.localeCompare(a.debut));
  });
}

export interface Landslide {
  type: string;
  date?: string;
  lon: number;
  lat: number;
  fiabilite: string;
}

/** Landslides, rockfalls and the like recorded within `radiusM` (BDMvt). */
export async function landslides(cache: Cache, lon: number, lat: number, radiusM = 500): Promise<Cached<Landslide[]>> {
  // Asked around the snapped centre, SNAP_M farther, then kept within `radiusM` of the point itself: the same as asked
  // around the point.
  const [cLon, cLat] = [snap(lon), snap(lat)];
  const wide = radiusM + SNAP_M;
  const got = await cache.get(`mvt:${key(cLon, cLat)}:${wide}`, 7 * DAY, async () => {
    const r = await georisques<{ data: Record<string, string | number | null>[] }>(`https://www.georisques.gouv.fr/api/v1/mvt?latlon=${cLon},${cLat}&rayon=${wide}&page_size=100`);
    return r.data.map((d) => ({
      type: String(d.type),
      date: d.date_debut ? String(d.date_debut) : undefined,
      lon: Number(d.longitude),
      lat: Number(d.latitude),
      fiabilite: String(d.fiabilite ?? ""),
    }));
  });
  return { ...got, value: got.value.filter((x) => distanceKm(lon, lat, x.lon, x.lat) * 1000 <= radiusM) };
}

/**
 * Communes where the radon potential is category 2 (low, but geology may ease its way up); all others are category 1.
 * Every commune of La Réunion is in seismic zone 2 (low). Both from Géorisques, checked on 23/10/2026.
 */
export const RADON_2 = new Set(["97410", "97421", "97424"]);
