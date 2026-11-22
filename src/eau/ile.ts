/**
 * The water of the whole island at once, for the /eau page: every bathing site the ARS checks and the tap water of each
 * commune. That is some 75 requests (two pages per site, four per commune), more than a Worker may make for one
 * page: in the Worker it is read from the KV store under `eau:ile`, where .github/workflows/eau.yml writes it
 * (scripts/eau-ile.ts). The Node server, given no reader, gathers it itself.
 */
import type { Cache, Cached } from "../cache.js";
import { INSEE } from "../places/insee.js";
import * as baignades from "../providers/baignades.js";
import * as potable from "../providers/eaupotable.js";
import { networkRow, siteRow } from "../tools/eau.js";
import { UpstreamError, why } from "../types.js";

export interface Ile {
  /** ISO time of the gathering. */
  lu: string;
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
  return cache.getCopy("eau:ile", FRESH_SECONDS, async () => {
    if (reader) {
      const v = await reader();
      if (!v?.baignades) throw new Error("qualité de l'eau absente du stockage");
      return v;
    }
    return gather(cache, now);
  }, (v) => v.lu);
}
