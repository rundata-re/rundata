/**
 * Public services of La Réunion (town halls, prefecture, CAF, France Travail, tax offices, courts…) from the
 * Annuaire de l'administration of service-public.fr (DILA), an Opendatasoft API with no key. Full-text search over
 * the 974 entries, with opening hours, phone, address and position. The places of justice too, read by their kind of
 * service (`justice`).
 */
import type { Cache, Cached } from "../cache.js";
import { getJson } from "../http.js";
import type { SourceInfo } from "../types.js";

export const SOURCE: SourceInfo = {
  id: "annuaire_administration",
  nom: "Annuaire de l'administration (service-public.fr)",
  organisme: "Direction de l'information légale et administrative (DILA)",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "DILA, service-public.fr",
  url: "https://lannuaire.service-public.fr",
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
  };
}

/** Up to 20 offices matching `what`, in the API's relevance order: in one commune (INSEE code), or all La Réunion. */
export async function search(cache: Cache, what: string, insee?: string): Promise<Cached<Office[]>> {
  const q = what.replace(/["\\]/g, " ").trim().slice(0, 80);
  const scope = insee && /^974\d\d$/.test(insee) ? `code_insee_commune="${insee}"` : `startswith(code_insee_commune,"974")`;
  return cache.get(`annuaire:${insee ?? "974"}:${q.toLowerCase()}`, FRESH_SECONDS, async () => {
    const where = `${scope} and search("${q}")`;
    const url = `${URL}?where=${encodeURIComponent(where)}&limit=20&select=${FIELDS}`;
    return (await getJson<{ results: Row[] }>(SOURCE.id, url)).results.map(office);
  });
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

/** All the places of justice of La Réunion in one request (48 on 03/11/2026, the API gives up to 100), kept a day. */
export async function justice(cache: Cache): Promise<Cached<JusticePlace[]>> {
  return cache.get("annuaire:justice", FRESH_SECONDS, async () => {
    const kinds = Object.keys(JUSTICE_TYPES).map((t) => `pivot like "%\\"${t}\\"%"`).join(" or ");
    const url = `${URL}?where=${encodeURIComponent(`startswith(code_insee_commune,"974") and (${kinds})`)}&limit=100&select=${FIELDS},pivot`;
    return (await getJson<{ results: Row[] }>(SOURCE.id, url)).results.flatMap((r) => {
      const type = json<{ type_service_local: string }[]>(r.pivot, []).map((p) => p.type_service_local).find((t): t is JusticeType => t in JUSTICE_TYPES);
      return type ? [{ ...office(r), type }] : [];
    });
  });
}
