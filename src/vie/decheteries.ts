/**
 * The déchèteries whose skips are said now: the Territoire de l'Ouest's (src/vie/decheteries.json,
 * scripts/build-decheteries.py; providers/tco.ts) and, since 26/11/2026, the CASUD's (CASUD_SITES below;
 * providers/casud.ts). The others, from the ADEME's directory (src/vie/decheteries-ademe.json,
 * scripts/build-decheteries-ademe.py): where they are, without their hours, which their intercommunalité's site gives.
 */
import type { Cache, Cached } from "../cache.js";
import { distanceKm, localTime } from "../geo.js";
import * as casud from "../providers/casud.js";
import * as tco from "../providers/tco.js";
import { why, type SourceInfo } from "../types.js";
import ademe from "./decheteries-ademe.json" with { type: "json" };
import data from "./decheteries.json" with { type: "json" };

export interface Site {
  nom: string;
  adresse: string;
  commune: string;
  lon: number;
  lat: number;
  lien: string;
  /** Whose: the TCO's or the CASUD's. */
  par: "tco" | "casud";
  /** Its hours, when its intercommunality gives them with its state (the CASUD); the TCO's are on each site's page. */
  horaires?: string;
}

// Hours with no agreement to make (« Ouverte » or « fermé » would take the site's gender): « Horaires\u00a0: … » on the page.
const MON_SAT = "du lundi au samedi de 8\u00a0h à 12\u00a0h et de 14\u00a0h à 17\u00a0h, sauf les jours fériés";
/**
 * The CASUD's sites, as its page gave them on 26/11/2026 (tri-casud.re/meteo-des-dechets): the id of their block, the
 * point of its map, their address and hours. The 23e km and Bois Court are at La Plaine des Cafres, in Le Tampon.
 */
export const CASUD_SITES: Site[] = [
  { id: "decheterie-de-terrain-fleury", nom: "Déchèterie de Terrain Fleury", adresse: "18 rue de la République", lat: -21.281028, lon: 55.527433, horaires: MON_SAT },
  { id: "decheterie-de-trois-mares", nom: "Déchèterie de Trois-Mares", adresse: "53 rue Montaigne", lat: -21.263096, lon: 55.496754, horaires: MON_SAT },
  { id: "decheterie-du-23eme-km", nom: "Déchèterie du 23e km", adresse: "120 rue Roland Hoarau, La Plaine des Cafres", lat: -21.216188, lon: 55.549565, horaires: MON_SAT },
  { id: "pava-bois-court", nom: "Point d'apport de Bois Court", adresse: "rue du Bois de Source, La Plaine des Cafres", lat: -21.196872, lon: 55.536056, horaires: "du lundi au samedi de 8\u00a0h à 17\u00a0h, sauf les jours fériés" },
  { id: "decheterie-des-gregues", nom: "Déchèterie des Grègues", adresse: "rue de la Station de Transit", lat: -21.380696, lon: 55.602884, horaires: MON_SAT, commune: "Saint-Joseph" },
].map(({ id, commune, ...s }) => ({ ...s, commune: commune ?? "Le Tampon", lien: `${casud.SOURCE.url}#${id}`, par: "casud" as const }));

/** The sites whose skips are said now: the TCO's, then the CASUD's. */
export const SITES: Site[] = [...(data.sites as Omit<Site, "par">[]).map((s) => ({ ...s, par: "tco" as const })), ...CASUD_SITES];
export const TCO_COMMUNES = [...new Set(SITES.filter((s) => s.par === "tco").map((s) => s.commune))];
/** The communes whose sites' skips are said now. */
export const LIVE_COMMUNES = [...new Set(SITES.map((s) => s.commune))];

// An update older than this, or of another day, is not said to be the state now.
const STALE_HOURS = 6;

/** The intercommunalité of each commune outside the TCO, and its site: its page of the déchèteries when one is known. */
const EPCI: { nom: string; site: string; communes: string[] }[] = [
  { nom: "la CINOR", site: "https://www.cinor.re/que-faire-de-mes-objets-et-dechets/", communes: ["Saint-Denis", "Sainte-Marie", "Sainte-Suzanne"] },
  { nom: "la CIREST", site: "https://www.cirest.fr/", communes: ["Saint-André", "Bras-Panon", "Saint-Benoît", "La Plaine-des-Palmistes", "Sainte-Rose", "Salazie"] },
  { nom: "la CIVIS", site: "https://www.civis.re/", communes: ["Saint-Pierre", "Saint-Louis", "Petite-Île", "L'Étang-Salé", "Les Avirons", "Cilaos"] },
  { nom: "la CASUD", site: "https://www.casud.re/au-quotidien/preserver-lenvironnement/je-depose-en-decheterie", communes: ["Le Tampon", "Entre-Deux", "Saint-Joseph", "Saint-Philippe"] },
];
export const epciOf = (commune: string) => EPCI.find((e) => e.communes.includes(commune));

export const ADEME: SourceInfo = {
  id: "ademe_decheteries",
  nom: "Annuaire des déchèteries de l'ADEME (SINOE)",
  organisme: "ADEME",
  licence: "Licence Ouverte Etalab",
  attribution: "ADEME, SINOE",
  url: "https://data.ademe.fr/datasets/sinoe-(r)-annuaire-des-decheteries-dma",
};
/** The directory's survey the list is of, and the day the ADEME last updated it (« 2026-11-01 »). */
export const SURVEY: number = ademe.enquete;
export const UPDATED: string = ademe.mis_a_jour;
const dayMonthYear = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
/** « selon l'annuaire des déchèteries de l'ADEME (enquête 2026, mis à jour le 01/11/2026) » */
export const FROM_ADEME = `selon l'annuaire des déchèteries de l'ADEME (enquête ${SURVEY}, mis à jour le ${dayMonthYear(UPDATED)})`;

/** A déchèterie outside the TCO, and the intercommunalité whose site gives its hours. */
export interface Elsewhere extends Omit<Site, "lien" | "par" | "horaires"> {
  epci: { nom: string; site: string };
}
export const ELSEWHERE: Elsewhere[] = ademe.sites.filter((s) => !LIVE_COMMUNES.includes(s.commune)).map((s) => {
  const { nom, site } = epciOf(s.commune)!;
  return { ...s, epci: { nom, site } };
});
export const ELSEWHERE_COMMUNES = [...new Set(ELSEWHERE.map((s) => s.commune))];
/** What is said of the hours of a site outside the TCO: none are taken, from the directory or from anywhere else. */
export const hoursOf = (s: Elsewhere) => `horaires\u00a0: voir le site de ${s.epci.nom}`;

/** The sites of a commune outside the TCO, nearest first, then the nearest others while there are fewer than `max`. */
export function elsewhereNear(commune: string, lon: number, lat: number, max = 3) {
  const all = ELSEWHERE.map((s) => ({ ...s, km: distanceKm(lon, lat, s.lon, s.lat) })).sort((a, b) => a.km - b.km);
  const own = all.filter((s) => s.commune === commune);
  return [...own, ...all.filter((s) => s.commune !== commune)].slice(0, Math.max(max, own.length));
}

export interface SiteNow extends Site {
  /** « 24/10 17:00 », when the staff last filled it in. */
  mis_a_jour?: string;
  /** Whether that is recent enough to be the state now. */
  a_jour: boolean;
  accepte: string[];
  refuse: string[];
}

/** Each site with what its skips take, as recent as the staff's last update allows (`etats`: the TCO's and the CASUD's). */
export function sitesNow(etats: tco.Etat[] | undefined, now: Date): SiteNow[] {
  const byLink = new Map((etats ?? []).map((e) => [e.lien, e]));
  const day = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  return SITES.map((s) => {
    const e = byLink.get(s.lien);
    const at = e?.maj ? new Date(e.maj) : undefined;
    const fresh = !!at && now.getTime() - at.getTime() <= STALE_HOURS * 3600_000 && day(at) === day(now);
    const kinds = Object.entries(e?.accepte ?? {});
    return {
      ...s,
      mis_a_jour: at ? localTime(at) : undefined,
      a_jour: fresh,
      // The TCO's kinds by their key, the CASUD's already in words.
      accepte: kinds.filter(([, ok]) => ok).map(([k]) => tco.WASTES[k] ?? k),
      refuse: kinds.filter(([, ok]) => !ok).map(([k]) => tco.WASTES[k] ?? k),
    };
  });
}

/** The kind of waste a question names (« déchets verts », « frigo »), as the dataset calls it. */
export function wasteAsked(text: string): string | undefined {
  const t = text.toLowerCase();
  const words: [RegExp, string][] = [
    [/vert|jardin|branch|palme|tonte|v[ée]g[ée]ta/, "dechets_verts"],
    [/encombrant/, "encombrants"],
    [/gravat|d[ée]blai|b[ée]ton|parpaing/, "deblais_gravats"],
    [/placo|pl[âa]tre/, "placo"],
    [/m[ée]ta(l|ux)|ferraille/, "metaux"],
    [/meuble|mobilier|matelas|canap/, "mobilier"],
    [/frigo|r[ée]frig|cong[ée]la/, "refrigerateurs_congelateurs"],
    [/[ée]lectrom[ée]nager|machine [àa] laver|lave/, "gros_electromenager"],
    [/[ée]cran|t[ée]l[ée]|ordinateur/, "ecrans"],
    [/carton|papier/, "papiers_cartons"],
    [/verre/, "verres"],
    [/textile|v[êe]tement|chaussure/, "textiles_chaussures"],
    [/batterie/, "batteries"],
    [/\bpile/, "piles"],
    [/friture|huile de cuisine|huile alimentaire/, "huiles_friture"],
    [/huile/, "huiles"],
    [/n[ée]on/, "neons"],
  ];
  return words.find(([re]) => re.test(t))?.[1];
}

/**
 * The words a site's skips use for the kind asked: the TCO's, and the CASUD's where it sorts otherwise (cardboard apart
 * from newspapers, one skip for all household appliances, frying oil apart).
 */
const CASUD_ALIKE: Record<string, string[]> = {
  papiers_cartons: ["cartons", "journaux et revues"],
  journaux_revues: ["journaux et revues"],
  gros_electromenager: ["électroménager"],
  refrigerateurs_congelateurs: ["électroménager"],
  petits_appareils_menagers: ["électroménager"],
  mobilier: ["mobilier (Ecomaison)"],
  neons: ["ampoules et néons"],
  lampes: ["ampoules et néons"],
  textiles_chaussures: ["textiles"],
  huiles_friture: ["huiles de friture"],
};
export const labelsOf = (kind: string): string[] => [...(tco.WASTES[kind] ? [tco.WASTES[kind]] : []), ...(CASUD_ALIKE[kind] ?? [])];
/** « huiles de friture » for the CASUD's own kinds, which the TCO has not. */
export const labelOf = (kind: string): string => labelsOf(kind)[0] ?? kind;

/** Whether a site's intercommunality did not answer (`absents` of the copy): its state is unknown, not old. */
export const unread = (s: Pick<Site, "par">, absents?: readonly string[]) => !!absents?.includes(s.par);

/** What each intercommunality's staff last said of its skips, each read on its own: one that fails leaves the other. */
export async function meteo(cache: Cache): Promise<{ etats: tco.Etat[]; tco: Cached<tco.Etat[]> | null; casud: Cached<tco.Etat[]> | null }> {
  const read = (p: { SOURCE: SourceInfo; meteo: (c: Cache) => Promise<Cached<tco.Etat[]>> }) =>
    p.meteo(cache).catch((err) => (console.error(`source ${p.SOURCE.id} indisponible:`, why(err)), null));
  const [t, c] = await Promise.all([read(tco), read(casud)]);
  return { etats: [...(t?.value ?? []), ...(c?.value ?? [])], tco: t, casud: c };
}

export function nearest(lon: number, lat: number, sites: SiteNow[], max = 3) {
  return sites.map((s) => ({ ...s, km: distanceKm(lon, lat, s.lon, s.lat) })).sort((a, b) => a.km - b.km).slice(0, max);
}
