/**
 * The water of the whole island at once, for the /eau page: every bathing site the ARS checks and the tap water of each
 * commune. That is some 75 requests (two pages per site, four per commune), more than a Worker may make for one
 * page: in the Worker it is read from the KV store under `eau:ile`, where .github/workflows/eau.yml writes it
 * (scripts/eau-ile.ts). The Node server, given no reader, gathers it itself.
 */
import type { Cache, Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { INSEE } from "../places/insee.js";
import * as baignades from "../providers/baignades.js";
import * as potable from "../providers/eaupotable.js";
import { networkRow, siteRow } from "../tools/eau.js";
import { UpstreamError, why } from "../types.js";

export interface Ile {
  /** ISO time of the gathering. */
  lu: string;
  /**
   * ISO time the bathing sites were read, when it is not `lu`: the ARS's site did not answer the gathering, and the
   * previous copy's sites are kept with their own time (`keep`). Absent when they were read with the rest.
   */
  baignades_lu?: string;
  /** The same for the tap water, when Hub'Eau did not answer the gathering. */
  communes_lu?: string;
  baignades: (Omit<ReturnType<typeof siteRow>, "prelevements_en_retard"> & { lon: number; lat: number })[];
  communes: {
    commune: string;
    reseaux: number;
    analyses_6_mois: number;
    non_conformes_6_mois: number;
    derniere_analyse?: string;
    /** The networks with a sample off the limits in 6 months. */
    a_surveiller: ReturnType<typeof networkRow>[];
    /**
     * Every network, with the districts the ARS gives for it and its last sample in 6 months: its day (ISO) and the
     * ARS's conclusion as written. Absent from a copy gathered before 14/11/2026.
     */
    reseaux_detail?: Reseau[];
  }[];
}

/** One network of a commune, as the ARS's sanitary control gives it (Hub'Eau). */
export interface Reseau {
  reseau: string;
  quartiers: string[];
  /** The day of its last sample in 6 months (« 2026-11-03 »), none without one. */
  derniere_analyse?: string;
  /** The ARS's conclusion on that sample, as written (« Eau d'alimentation conforme aux exigences de qualité… »). */
  conclusion?: string;
}

const FRESH_SECONDS = 3600;
/** The key .github/workflows/eau.yml writes the island's copy under, and the Worker reads it from (worker.ts). */
export const KV_KEY = "eau:ile";

/** The first failure of a source in a gathering: what it was, the HTTP status if there was one, and how long it took. */
export interface Echec {
  source: string;
  /** The site's or the commune's name. */
  lieu: string;
  /** « TimeoutError », « UpstreamError »… */
  type: string;
  erreur: string;
  statut?: number;
  ms: number;
}

const echec = (source: string, lieu: string, err: unknown, ms: number): Echec => ({
  source,
  lieu,
  type: err instanceof Error ? err.name === "Error" ? err.constructor.name : err.name : typeof err,
  erreur: why(err).split("\n")[0].replace(`${source}: `, ""),
  ...(err instanceof UpstreamError && err.status ? { statut: err.status } : {}),
  ms: Math.round(ms),
});

/** Two bathing sites at a time, two pages each: four requests at most to the ARS's site, which a burst of 52 could stall. */
const SITES_AT_ONCE = 2;
/**
 * The first sites that all get no answer (no HTTP status, or a 5xx): the ARS's site is not answering, and the rest is not read (each site that hangs takes
 * 20 s, both tries: 26 of them two at a time would not leave the workflow time for its new try).
 */
export const GIVE_UP_AFTER = 4;

/**
 * Everything, read from the sources; a site or a commune that fails is left out rather than failing the rest. The first
 * failure of each source goes to `failed`, for the workflow's log (scripts/eau-ile.ts).
 */
export async function gather(cache: Cache, now = new Date(), failed?: (e: Echec) => void): Promise<Ile> {
  const said = new Set<string>();
  const fail = (source: string, lieu: string, err: unknown, start: number) => {
    if (said.has(source)) return;
    said.add(source);
    failed?.(echec(source, lieu, err, performance.now() - start));
  };
  const sites = [];
  // Sites the ARS's site gave no answer for (no HTTP status, or a 5xx): a 404 is an answer.
  let unanswered = 0;
  for (let i = 0; i < baignades.SITES.length; i += SITES_AT_ONCE) {
    sites.push(...await Promise.all(baignades.SITES.slice(i, i + SITES_AT_ONCE).map(async (s) => {
      const start = performance.now();
      try {
        const r = await baignades.results(cache, s, now);
        // Not the gap since the last sample: a sentence of the day, said by the page when it shows (eauPage).
        const { prelevements_en_retard: _gap, ...row } = siteRow(r.value, now);
        return { ...row, lon: s.lon, lat: s.lat };
      } catch (err) {
        fail(baignades.SOURCE.id, s.nom, err, start);
        if (!(err instanceof UpstreamError && err.status && err.status < 500)) unanswered++;
        return null;
      }
    })));
    if (sites.length >= GIVE_UP_AFTER && unanswered === sites.length) {
      failed?.({ ...echec(baignades.SOURCE.id, "", new Error("abandon"), 0), type: "abandon", erreur: `les ${sites.length} premiers sites n'ont pas répondu, les ${baignades.SITES.length - sites.length} autres ne sont pas lus` });
      break;
    }
  }
  const communes = [];
  // A few communes at a time: Hub'Eau is a shared public service.
  const names = Object.keys(INSEE);
  for (let i = 0; i < names.length; i += 4) {
    communes.push(...await Promise.all(names.slice(i, i + 4).map(async (commune) => {
      const start = performance.now();
      try {
        const { value } = await potable.commune(cache, INSEE[commune], now);
        const rows = value.reseaux.map((r) => networkRow(r, value.prelevements));
        const last = value.prelevements[0];
        return {
          commune,
          reseaux: rows.length,
          analyses_6_mois: value.prelevements.length,
          non_conformes_6_mois: value.prelevements.filter((p) => !p.conforme).length,
          derniere_analyse: last ? last.date.slice(0, 10) : undefined,
          a_surveiller: rows.filter((r) => r.non_conformes_6_mois).sort((a, b) => b.non_conformes_6_mois - a.non_conformes_6_mois),
          reseaux_detail: value.reseaux.map((r): Reseau => {
            // The samples are the latest first (potable.commune).
            const s = value.prelevements.find((x) => x.reseaux.includes(r.code));
            return { reseau: r.nom, quartiers: r.quartiers, ...(s ? { derniere_analyse: s.date.slice(0, 10), ...(s.conclusion ? { conclusion: s.conclusion } : {}) } : {}) };
          }),
        };
      } catch (err) {
        fail(potable.SOURCE.id, commune, err, start);
        return null;
      }
    })));
  }
  return {
    lu: now.toISOString(),
    baignades: sites.filter((s) => s !== null),
    communes: communes.filter((c) => c !== null).sort((a, b) => a.commune.localeCompare(b.commune, "fr")),
  };
}

/** Why a gathering is too thin to replace the copy (most sites or communes did not answer), or nothing when it is not. */
export function thin(ile: Ile): string | undefined {
  if (ile.baignades.length < baignades.SITES.length / 2) return `seulement ${ile.baignades.length} sites de baignade sur ${baignades.SITES.length}`;
  if (ile.communes.length < Object.keys(INSEE).length / 2) return `seulement ${ile.communes.length} communes sur ${Object.keys(INSEE).length}`;
  return undefined;
}

/** When the bathing sites and the tap water were read, each (ISO): `lu`, unless one was kept from an earlier copy. */
export const bathRead = (ile: Ile) => ile.baignades_lu ?? ile.lu;
export const tapRead = (ile: Ile) => ile.communes_lu ?? ile.lu;
/** The oldest of the two: the copy's freshness. */
export const oldestRead = (ile: Ile) => (bathRead(ile) < tapRead(ile) ? bathRead(ile) : tapRead(ile));

/**
 * How long a half is shown after it was read (23/11/2026): 7 days. Each run that keeps a half writes it again, with a new
 * time to live in the store, so without this a silent source would keep its old results for ever. Past it, the half is
 * not shown and its source is said silent since that read (silentBath, silentTap), on /eau and by qualite_eau.
 */
export const KEPT_MAX_MS = 7 * 86_400_000;
export const tooOld = (read: string, now: Date) => now.getTime() - Date.parse(read) > KEPT_MAX_MS;
/** The day of a read, JJ/MM, heure de La Réunion (UTC+4 all year). */
const readDay = (read: string) => {
  const t = new Date(Date.parse(read) + 4 * 3600_000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)}`;
};
/** Said instead of a half read more than 7 days ago: the day is that of the last read that answered (text of 23/11/2026). */
export const silentBath = (read: string) =>
  `Le site de l'ARS ne répond plus depuis le ${readDay(read)}\u00a0: voir les résultats des plages et bassins sur le site de l'ARS, ou l'affichage sur place.`;
export const silentTap = (read: string) => `Hub'Eau ne répond plus depuis le ${readDay(read)}\u00a0: voir le site de l'ARS.`;

/** « le 22/11 à 18:20 »: the time of a read, heure de La Réunion, as /eau says it (web/pages.ts leAt). */
const readAt = (read: string) => {
  const [day, hour] = localTime(new Date(read)).split(" ");
  return `le ${day} à ${hour}`;
};
/**
 * A half kept from an earlier copy, its source silent at the last read (keep): said with the time it was read, never as
 * today's, and what may have been published since (texts of 23/11/2026). The same words on /eau and by qualite_eau.
 */
export const keptBath = (read: string) =>
  `Le site de l'ARS n'a pas répondu à la dernière lecture\u00a0: résultats des plages et bassins lus ${readAt(read)}. Un résultat publié depuis peut ne pas y figurer\u00a0: voir le site de l'ARS.`;
export const keptTap = (read: string) =>
  `Hub'Eau, le service national qui publie les analyses de l'ARS, n'a pas répondu à la dernière lecture\u00a0: analyses de l'eau du robinet lues ${readAt(read)}. Un avis publié depuis peut ne pas y figurer\u00a0: voir le site de l'ARS ou de la mairie.`;

/**
 * What the workflow writes (scripts/eau-ile.ts), from a gathering and the copy already stored (`before`, null without
 * one). A source that does not answer is neither gone nor empty (22-23/11/2026: the ARS's site silent five runs in a row,
 * each run failed, the tap water read from Hub'Eau not written either): its half of the earlier copy is kept, with the
 * time it was read, and the other half is written. Nothing to write (`ile` undefined) when neither half was read and a
 * copy is stored: that copy stays as it is. `warnings` says each half kept or left thin; `fail` when nothing was read
 * and no copy is stored, the only case where the workflow fails.
 */
export function keep(fresh: Ile, before: Ile | null): { ile?: Ile; warnings: string[]; fail?: string } {
  const bathThin = fresh.baignades.length < baignades.SITES.length / 2;
  const tapThin = fresh.communes.length < Object.keys(INSEE).length / 2;
  if (!bathThin && !tapThin) return { ile: fresh, warnings: [] };
  const why = thin(fresh)!;
  if (bathThin && tapThin) {
    return before
      ? { warnings: [`${why} : la copie du ${bathRead(before)} (baignade) et du ${tapRead(before)} (robinet) est gardée telle quelle`] }
      : { warnings: [], fail: `${why}, et aucune copie gardée` };
  }
  if (!before) return { ile: fresh, warnings: [`${why} : écrit tel quel, aucune copie gardée`] };
  if (bathThin) {
    return {
      ile: { ...fresh, baignades: before.baignades, baignades_lu: bathRead(before) },
      warnings: [`seulement ${fresh.baignades.length} sites de baignade sur ${baignades.SITES.length} : ceux de la copie du ${bathRead(before)} sont gardés, l'eau du robinet est écrite`],
    };
  }
  return {
    ile: { ...fresh, communes: before.communes, communes_lu: tapRead(before) },
    warnings: [`seulement ${fresh.communes.length} communes sur ${Object.keys(INSEE).length} : celles de la copie du ${tapRead(before)} sont gardées, la baignade est écrite`],
  };
}

/**
 * A copy read back from the store (wrangler's output, or nothing): null when it is not one. From the first « { » to the
 * last « } », whatever a tool may print around the value.
 */
export function parseCopy(text: string | undefined): Ile | null {
  const t = text ?? "";
  try {
    const v = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    return v && typeof v.lu === "string" && Array.isArray(v.baignades) && Array.isArray(v.communes) ? (v as Ile) : null;
  } catch {
    return null;
  }
}

/**
 * The pause before the one new try of a thin gathering: the ARS's site now and then stalls a few minutes, at any hour.
 * Longer than the minute the cache remembers a failure (cache.ts FAILURE_BACKOFF_SECONDS), or the new try would ask nothing.
 */
export const RETRY_MS = 3 * 60_000;

/**
 * For the workflow (scripts/eau-ile.ts): a gathering, and one more after `waitMs` when it is too thin. The same cache
 * keeps what answered the first time, so the new try reads only what failed. Each try's first failures go to `log`.
 */
export async function gatherForCopy(cache: Cache, opts: { waitMs?: number; log?: (line: string) => void; now?: () => Date } = {}): Promise<Ile> {
  const { waitMs = RETRY_MS, log = console.error, now = () => new Date() } = opts;
  const say = (e: Echec) => log(e.type === "abandon" ? `${e.source} : ${e.erreur}`
    : `${e.source} : première erreur (${e.lieu}) : ${e.type}${e.statut ? ` ${e.statut}` : ""}, ${e.erreur}, après ${e.ms} ms`);
  const first = await gather(cache, now(), say);
  const why = thin(first);
  if (!why) return first;
  log(`${why} : nouvel essai dans ${Math.round(waitMs / 1000)} s`);
  await new Promise((r) => setTimeout(r, waitMs));
  return gather(cache, now(), say);
}

let reader: (() => Promise<Ile | null>) | undefined;

/** In the Worker: read the island's copy from the KV store, where the workflow writes it. */
export function configure(read: (() => Promise<Ile | null>) | undefined) {
  reader = read;
}

/**
 * The island's copy where it is stored (the Worker's KV store), for a tool whose own reading of a source failed: never
 * gathered for it (75 requests), and null when there is none.
 */
export async function storedCopy(cache: Cache, now = new Date()): Promise<Ile | null> {
  if (!reader) return null;
  try {
    return (await ile(cache, now)).value;
  } catch {
    return null;
  }
}

export async function ile(cache: Cache, now = new Date()): Promise<Cached<Ile>> {
  return cache.getCopy(KV_KEY, FRESH_SECONDS, async () => {
    if (reader) {
      const v = await reader();
      if (!v?.baignades) throw new Error("qualité de l'eau absente du stockage");
      return v;
    }
    return gather(cache, now);
  }, oldestRead);
}
