/**
 * The formations eligible to the CPF at La Réunion, from the Caisse des Dépôts' catalogue « Moncompteformation -
 * L'offre de formation » (opendata.caissedesdepots.fr, with the DGEFP, Licence Ouverte 2.0, refreshed every week): the
 * certifying formations (RS or RNCP) a training body certified Qualiopi has opened sessions for on Mon Compte Formation.
 * The Worker's scheduled event reads La Réunion's lines once a day (`collect`, worker.ts), those with an open session,
 * and writes them to the KV store, where the tool emploi and the page /emploi read them (`formations`), never the API.
 *
 * What the catalogue does not say, and so is never said: the commune of the sessions (it stops at the département),
 * their days, the formations at a distance (they have no département: none is La Réunion's), what is left to pay by the
 * holder. A duration of 0 hours is a duration not given. The fees are the body's own, over durations, contents and
 * means that differ: never sorted, never « moins cher ». The body's own texts (objectives, contents, strengths) are not
 * taken. The name of a body whose SIREN is not in src/vie/cpf-organismes.json (legal persons only,
 * scripts/build-cpf-organismes.py) is not kept: a sole trader's is a person's.
 */
import type { Cache, Cached } from "../cache.js";
import { getJson, getText } from "../http.js";
import type { SourceInfo } from "../types.js";
import siren from "../vie/cpf-organismes.json" with { type: "json" };

export const SOURCE: SourceInfo = {
  id: "cdc_moncompteformation",
  nom: "Mon Compte Formation, l'offre de formation (formations éligibles au CPF)",
  organisme: "Caisse des Dépôts et DGEFP",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Caisse des Dépôts, Mon Compte Formation",
  url: "https://www.data.gouv.fr/datasets/62673976b11acf20def11a3b/",
};

/** Where the holder reads each formation's sheet, its days and what is left to pay. */
export const SITE = "https://www.moncompteformation.gouv.fr/";

/** Written by the scheduled event (`collect`), read by worker.ts. */
export const KV_KEY = "cpf:formations";
/** Kept this long after the last write: a copy says its day, however old. */
export const KV_TTL_SECONDS = 30 * 86_400;

const API = "https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation";
const WHERE = 'code_departement="974" and nb_session_active>0';
/** The fields kept: never the body's texts nor its SIRET. */
const FIELDS = [
  "intitule_formation", "intitule_certification", "type_referentiel", "libelle_niveau_sortie_formation", "libelle_nsf_1",
  "libelle_code_formacode_principal", "nom_of", "siret", "nb_session_active", "nombre_heures_total_min",
  "nombre_heures_total_max", "frais_ttc_tot_min", "frais_ttc_tot_max", "date_extract",
];
export const COUNT_URL = `${API}/records?${new URLSearchParams({ select: "count(*) as n", where: WHERE, limit: "1" })}`;
export const EXPORT_URL = `${API}/exports/json?${new URLSearchParams({ select: FIELDS.join(","), where: WHERE })}`;

/** The SIREN whose body's name may be shown. */
const NOMMABLES = new Set<string>(siren);

export interface Formation {
  /** As the body writes it, capitals included. */
  intitule: string;
  /** The certification's title, as France Compétences registers it. */
  certification: string;
  referentiel: "RS" | "RNCP";
  /** « CAP, BEP... (NIVEAU 3) »; none for a RS. */
  niveau?: string;
  /** The first NSF field, as published, its spelling corrected (THEMES_NSF): « Transports, manutention, magasinage ». */
  theme?: string;
  /** The main Formacode: « Chariot automoteur ». */
  formacode?: string;
  /** Only for a body whose SIREN is in the list (NOMMABLES). */
  organisme?: string;
  /** TTC, €, over the formation's actions. */
  frais_min: number;
  frais_max: number;
  /** Hours; absent when the catalogue gives 0, a duration not given. */
  heures_min?: number;
  heures_max?: number;
  sessions: number;
}

export interface Copie {
  /** When the catalogue was last read (ISO, UTC). */
  lu: string;
  /** The catalogue's own day of extraction, « 2026-11-03 ». */
  extrait_le?: string;
  /** By title. */
  formations: Formation[];
  /** When the catalogue first failed to answer since `lu`; absent while it answers. */
  echec?: string;
}

interface Row {
  intitule_formation?: string | null;
  intitule_certification?: string | null;
  type_referentiel?: string | null;
  libelle_niveau_sortie_formation?: string | null;
  libelle_nsf_1?: string | null;
  libelle_code_formacode_principal?: string | null;
  nom_of?: string | null;
  siret?: string | null;
  nb_session_active?: number | null;
  nombre_heures_total_min?: number | null;
  nombre_heures_total_max?: number | null;
  frais_ttc_tot_min?: number | null;
  frais_ttc_tot_max?: number | null;
  date_extract?: string | null;
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

/**
 * The first NSF themes the catalogue publishes misspelled (all of them, over the whole catalogue, on 03/11/2026), spelled
 * as the Insee's « Nomenclature des groupes de Spécialités de Formation (NSF : niveau 100) » spells the same group
 * (https://www.insee.fr/fr/statistiques/fichier/5351753/BFE_NSF_niveau_100.pdf, decree 94-522 of 21 June 1994): the
 * catalogue's wording is kept, only its misspelled words are corrected. One departure from the Insee's spelling: a capital
 * takes its accent, as everywhere on the site (« Électricité », « Énergie »), where the nomenclature leaves it out. A
 * theme not here is shown as published.
 */
export const THEMES_NSF: Record<string, string> = {
  "Spécialites plurivalentes de l'agronomie et de l'agriculture": "Spécialités plurivalentes de l'agronomie et de l'agriculture", // 210
  "Forets, espaces naturels, faune sauvage, pêche": "Forêts, espaces naturels, faune sauvage, pêche", // 213
  "Spécialites pluritechnologiques matériaux souples": "Spécialités pluritechnologiques matériaux souples", // 240
  "Spécialites pluritechnologiques mécanique-electricite": "Spécialités pluritechnologiques mécanique-électricité", // 250
  "Energie, génie climatique": "Énergie, génie climatique", // 227
  "Electricite, électronique": "Électricité, électronique", // 255
  "Spécialites plurivalentes des services": "Spécialités plurivalentes des services", // 300
  "Comptabilite, gestion": "Comptabilité, gestion", // 314
  "Spécialites plurivalentes de la communication et de l'information": "Spécialités plurivalentes de la communication et de l'information", // 320
  "Spécialites plurivalentes des services aux personnes": "Spécialités plurivalentes des services aux personnes", // 330
  "Accueil, hotellerie, tourisme": "Accueil, hôtellerie, tourisme", // 334
  "Animation sportive, culturelle et de Loisirs": "Animation sportive, culturelle et de loisirs", // 335
  "Coiffure, esthétique et autres spécialites de services aux personnes": "Coiffure, esthétique et autres spécialités de services aux personnes", // 336
  "Spécialites plurivalentes des services a la collectivité": "Spécialités plurivalentes des services à la collectivité", // 340
  "Sécurite des biens et des personnes, police, surveillance": "Sécurité des biens et des personnes, police, surveillance", // 344
  "Développement des capacités individuelles d organisation": "Développement des capacités individuelles d'organisation", // 414
  "Developpement des capacités d orientation,d insertion ou de réinsertion sociales et professionnelles": "Développement des capacités d'orientation, d'insertion ou de réinsertion sociales et professionnelles", // 415
};

/** One line of the catalogue, or none without a title, a fee or an open session. */
export function formation(r: Row): Formation | undefined {
  const intitule = clean(r.intitule_formation);
  const certification = clean(r.intitule_certification);
  const referentiel = r.type_referentiel === "RS" || r.type_referentiel === "RNCP" ? r.type_referentiel : undefined;
  if (!intitule || !certification || !referentiel || typeof r.frais_ttc_tot_min !== "number" || typeof r.frais_ttc_tot_max !== "number" || !r.nb_session_active) return undefined;
  const niveau = clean(r.libelle_niveau_sortie_formation);
  const published = clean(r.libelle_nsf_1);
  const theme = published && (THEMES_NSF[published] ?? published);
  const formacode = clean(r.libelle_code_formacode_principal);
  const organisme = r.siret && NOMMABLES.has(r.siret.slice(0, 9)) ? clean(r.nom_of) : undefined;
  const hMax = r.nombre_heures_total_max ?? 0;
  return {
    intitule,
    certification,
    referentiel,
    ...(niveau ? { niveau } : {}),
    ...(theme ? { theme } : {}),
    ...(formacode ? { formacode } : {}),
    ...(organisme ? { organisme } : {}),
    frais_min: r.frais_ttc_tot_min,
    frais_max: r.frais_ttc_tot_max,
    ...(hMax > 0 ? { heures_min: r.nombre_heures_total_min || hMax, heures_max: hMax } : {}),
    sessions: r.nb_session_active,
  };
}

/** By title, then certification: the order of the tool, which never sorts by fee, duration or body. */
export const order = (a: Formation, b: Formation) => a.intitule.localeCompare(b.intitule, "fr") || a.certification.localeCompare(b.certification, "fr");

/**
 * Once a day, at 15 past the hour from 12:15 to 18:15 UTC (16:15 to 22:15 in La Réunion), until the catalogue of the
 * day is read: the Caisse des Dépôts processed it at 11:39 UTC on 03/11/2026. Once it is read, each later pass reads
 * the copy only.
 */
export const FIRST_HOUR = 12;
export const LAST_HOUR = 18;
export const REFRESH_OFFSET = 15;
export const refreshDue = (now: Date) =>
  now.getUTCHours() >= FIRST_HOUR && now.getUTCHours() <= LAST_HOUR && now.getUTCMinutes() >= REFRESH_OFFSET && now.getUTCMinutes() < REFRESH_OFFSET + 5;

/**
 * The scheduled event's read: how many lines the catalogue has for La Réunion, then those lines, compared, unless the
 * copy is of the day already (UTC). Fewer lines than counted, none, or no answer: nothing replaces the copy before,
 * which stays with when the catalogue first failed (written once), and the read fails.
 */
export async function collect(before: Copie | null, write: (copie: Copie) => Promise<void>, now = new Date()): Promise<string> {
  const d = now.toISOString().slice(0, 10);
  if (before && !before.echec && before.lu.slice(0, 10) === d) return `catalogue du ${d} déjà lu : ${before.formations.length} formations`;
  let rows: Row[];
  try {
    const total = (await getJson<{ results?: { n?: number }[] }>(SOURCE.id, COUNT_URL, 20_000)).results?.[0]?.n;
    rows = JSON.parse(await getText(SOURCE.id, EXPORT_URL, 30_000)) as Row[];
    if (!Array.isArray(rows) || !rows.length) throw new Error("catalogue sans formation pour La Réunion");
    if (rows.length !== total) throw new Error(`${rows.length} lignes reçues sur ${total ?? "?"} comptées`);
  } catch (err) {
    if (before && !before.echec) await write({ ...before, echec: now.toISOString() });
    throw err;
  }
  const formations = rows.flatMap((r) => formation(r) ?? []).sort(order);
  const extrait = rows.find((r) => r.date_extract)?.date_extract;
  await write({ lu: now.toISOString(), ...(extrait ? { extrait_le: extrait } : {}), formations });
  return `catalogue du ${extrait ?? "?"} : ${rows.length} lignes, ${formations.length} formations gardées, ${formations.filter((f) => f.organisme).length} avec le nom de l'organisme, écrites`;
}

let reader: (() => Promise<Copie | null>) | undefined;

/** In the Worker: read the formations from the KV store, where the scheduled event writes them, and the API never. */
export function configure(read: (() => Promise<Copie | null>) | undefined) {
  reader = read;
}

/** Whether the formations can be read here (the Worker); elsewhere (a local server, the tests) they are not given. */
export const configured = () => !!reader;

const FRESH_SECONDS = 60 * 60;

/**
 * The stored copy, its time the scheduled event's last read; null where nothing is configured or stored, or the store
 * does not answer.
 */
export async function formations(cache: Cache): Promise<Cached<Copie> | null> {
  if (!reader) return null;
  const read = reader;
  try {
    const c = await cache.getCopy("cpf:formations", FRESH_SECONDS, async () => {
      const v = await read();
      if (!v) throw new Error("formations CPF absentes du stockage");
      return v;
    }, (v) => v.lu, SOURCE.id);
    return { ...c, fetchedAt: new Date(c.value.lu) };
  } catch {
    return null;
  }
}
