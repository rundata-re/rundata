/**
 * The déchèteries of the Territoire de l'Ouest (src/vie/decheteries.json, scripts/build-decheteries.py) and what
 * their skips take now (providers/tco.ts). Only the TCO publishes this. The others, outside the TCO, from the ADEME's
 * directory (src/vie/decheteries-ademe.json, scripts/build-decheteries-ademe.py): where they are, without their hours,
 * which their intercommunalité's site gives.
 */
import { distanceKm, localTime } from "../geo.js";
import * as tco from "../providers/tco.js";
import type { SourceInfo } from "../types.js";
import ademe from "./decheteries-ademe.json" with { type: "json" };
import data from "./decheteries.json" with { type: "json" };

export interface Site {
  nom: string;
  adresse: string;
  commune: string;
  lon: number;
  lat: number;
  lien: string;
}

export const SITES = data.sites as Site[];
export const TCO_COMMUNES = [...new Set(SITES.map((s) => s.commune))];

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
export interface Elsewhere extends Omit<Site, "lien"> {
  epci: { nom: string; site: string };
}
export const ELSEWHERE: Elsewhere[] = ademe.sites.map((s) => {
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

/** Each site with what its skips take, as recent as the staff's last update allows. */
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
      accepte: kinds.filter(([, ok]) => ok).map(([k]) => tco.WASTES[k]),
      refuse: kinds.filter(([, ok]) => !ok).map(([k]) => tco.WASTES[k]),
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
    [/huile/, "huiles"],
    [/n[ée]on/, "neons"],
  ];
  return words.find(([re]) => re.test(t))?.[1];
}

export function nearest(lon: number, lat: number, sites: SiteNow[], max = 3) {
  return sites.map((s) => ({ ...s, km: distanceKm(lon, lat, s.lon, s.lat) })).sort((a, b) => a.km - b.km).slice(0, max);
}
