/**
 * The orders by which the town of Sainte-Suzanne allows runéo's works on its water network, as the town lists them on
 * its site (rule 3 bis, 20/11/2026: a commune's public information, read slowly under an honest name). An order allows a
 * work site: it is never a notice of a water cut, and nothing here is ever counted or said as one (tools/coupures.ts
 * gives them in a block of their own, `arretes_travaux_ville`). Only those in force or to come: number, place, dates, link.
 */
import type { Cache, Cached } from "../cache.js";
import { getText, sharedSite, UA_RUNDATA } from "../http.js";
import type { SourceInfo } from "../types.js";
import { strip } from "./avis-eau.js";

export const SOURCE: SourceInfo = {
  id: "arretes_sainte_suzanne",
  nom: "Arrêtés de travaux de la ville de Sainte-Suzanne (chantiers de runéo)",
  organisme: "Ville de Sainte-Suzanne",
  licence: "Information publique des communes, reprise avec sa source et son lien",
  attribution: "Ville de Sainte-Suzanne",
  url: "https://ville-saintesuzanne.re/type-de-document/arretes-de-travaux/",
};

export const COMMUNE = "Sainte-Suzanne";
const FRESH_SECONDS = 30 * 60;
const KEY = "arretes-travaux:sainte-suzanne";

/** One order as the town titles it: « AM n° 596 – RUNEO – Travaux au 11 chemin Mont Rose du 23.11.2026 au 26.02.2027 ». */
export interface ArreteTravaux {
  /** As published: « 596 ». */
  numero: string;
  /** The place, word for word: « 11 chemin Mont Rose ». */
  lieu: string;
  /** Its first and last days, YYYY-MM-DD. */
  du: string;
  au: string;
  lien: string;
}

const TITLE = /^AM\s+n°\s*(\d+)\s*[–—-]\s*RUN[EÉ]O\s*[–—-]\s*Travaux\s+(?:aux?\s+)?(.+?)\s+du\s+(\d\d)\.(\d\d)\.(\d{4})\s+au\s+(\d\d)\.(\d\d)\.(\d{4})\s*$/i;
const LINK = /<h2 class="dg-cpt-title">\s*<a href="(https:\/\/ville-saintesuzanne\.re\/[^"]+)">([\s\S]*?)<\/a>/g;

/** The orders of runéo's works on the list page, each number once (the town posts some twice), as listed. */
export function parseArretes(html: string): ArreteTravaux[] {
  const out: ArreteTravaux[] = [];
  for (const m of html.matchAll(LINK)) {
    const t = TITLE.exec(strip(m[2]).replace(/\s+/g, " ").trim());
    if (!t || out.some((a) => a.numero === t[1])) continue;
    out.push({ numero: t[1], lieu: t[2], du: `${t[5]}-${t[4]}-${t[3]}`, au: `${t[8]}-${t[7]}-${t[6]}`, lien: m[1] });
  }
  return out;
}

/** The day in La Réunion, YYYY-MM-DD. */
const dayOf = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

/** Those in force or to come on `now`'s day: their last day not past. */
export const enCours = (list: ArreteTravaux[], now: Date) => list.filter((a) => a.au >= dayOf(now));

sharedSite(SOURCE.id, SOURCE.url);

/**
 * The list page, read at most every 30 minutes, one request, by the scheduled event (web:coupures): the pages serve its
 * copy, however old, and read the town's site only when there is none (cache.ts `islandRead`). Read by each data
 * center's own pages before 21/11/2026; the town's site is read for its power cuts too (http.ts `sharedSite`).
 */
export function arretes(cache: Cache): Promise<Cached<ArreteTravaux[]>> {
  return cache.islandRead(KEY, FRESH_SECONDS, async () => parseArretes(await getText(SOURCE.id, SOURCE.url, 12_000, { "User-Agent": UA_RUNDATA })));
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
/** « lundi 23/11/2026 » from « 2026-11-23 ». */
export function jourDit(d: string): string {
  const [y, m, j] = d.split("-").map(Number);
  return `${JOURS[new Date(Date.UTC(y, m - 1, j)).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** « vendredi 20/11 à 10:54 », Réunion time: when the town's site was read. */
export function luLe(at: Date): string {
  const r = new Date(at.getTime() + 4 * 3600_000).toISOString();
  return `${JOURS[new Date(r.slice(0, 10)).getUTCDay()]} ${r.slice(8, 10)}/${r.slice(5, 7)} à ${r.slice(11, 16)}`;
}

// Worded by marketing (20/11/2026).
export const TITRE = "Chantiers de runéo autorisés par la ville";
export const PHRASE =
  "La ville de Sainte-Suzanne publie les arrêtés qui autorisent les chantiers de runéo : voici ceux en cours ou à venir, avec leur lieu, leurs dates et leur lien. Ce sont des autorisations de chantier, pas des avis de coupure d'eau ; les avis de runéo sont plus haut sur cette page.";
export const NOTE = "Autorisations de chantier publiées par la ville de Sainte-Suzanne, pas des avis de coupure : ne jamais en déduire une coupure ni son absence.";
export const aucun = (at: Date) => `Pas d'arrêté de chantier de runéo en cours ou à venir sur le site de la ville, lu le ${luLe(at)}.`;

/**
 * The block of the answer and of the copy: the orders in force or to come, or the sentence for none, with the time the
 * site was read. Undefined when the site was never read (its read failed with nothing kept): nothing said then.
 */
export interface BlocArretes {
  note: string;
  /** Those in force or to come, their days said (« lundi 23/11/2026 »); absent when there is none. */
  arretes?: { arrete: string; lieu: string; du: string; au: string; etat: "en cours" | "à venir"; lien: string }[];
  /** The sentence for none, with the time of the read. */
  aucun?: string;
  /** When the town's site was read: « vendredi 20/11 à 10:54 ». */
  lu_le: string;
  lien: string;
}

export async function bloc(cache: Cache, now: Date): Promise<BlocArretes | undefined> {
  let c: Cached<ArreteTravaux[]>;
  try {
    c = await arretes(cache);
  } catch (err) {
    console.error(`source ${SOURCE.id} indisponible:`, err instanceof Error ? err.message : err);
    return undefined;
  }
  const list = enCours(c.value, now);
  const at = c.fetchedAt;
  return {
    note: NOTE,
    ...(list.length
      ? { arretes: list.map((a) => ({ arrete: `n° ${a.numero}`, lieu: a.lieu, du: jourDit(a.du), au: jourDit(a.au), etat: a.du > dayOf(now) ? ("à venir" as const) : ("en cours" as const), lien: a.lien })) }
      : { aucun: aucun(at) }),
    lu_le: luLe(at),
    lien: SOURCE.url,
  };
}
