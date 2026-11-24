/**
 * The copies of the 24 communes' pages built again just after midnight, by the scheduled event, from 00:00 to
 * MINUIT_FIN_MINUTES in La Réunion: web:lieu:<commune> (/communes/<commune>, /aujourdhui/<commune>, resume_du_jour)
 * and web:commune:<commune> (/communes/<commune>), the island's copies in KV that every data center reads.
 *
 * Why: a copy made before midnight is refused to every view, search engines included (web/data.ts `snapshot`): what it
 * says of the day (« aujourd'hui », the agenda, the forecast's first day, the departures) would be the day before's. The
 * first view of each commune after midnight built its page from nothing, 85 to 117 subrequests before the answer. From 22
 * to 24/11/2026, 24 of the 74 views of those pages by search engines past 1 s were between 00:00 and 06:00 (Loki).
 *
 * How much: at most MINUIT_PAR_PASSAGE communes an event, eight events of the 5-minute cron in the window, so all 24 by
 * about 00:30 with room for a late or a failed event; a commune whose two copies are already of the day (a view built
 * them) is passed over. Its own budget (MINUIT_BUDGET); an event that has no more left for the next copy stops there,
 * without an error, and the next event goes on from it. Cost (first views after midnight, 21 to 24/11/2026, Loki):
 * about 87 subrequests and 300 ms of CPU a commune from cold, so some 7 s of CPU and 48 KV writes a night.
 */
import { costOf, left, measured } from "../budget.js";
import type { Cache } from "../cache.js";
import { sinceMidnight } from "../geo.js";
import { COMMUNES } from "./commune.js";
import { buildCommune, buildPlace, FRESH_SECONDS } from "./data.js";
import type { PlacePage } from "./places.js";

/** The window, minutes after midnight in La Réunion. */
export const MINUIT_FIN_MINUTES = 40;
/** The communes built again in one event at most. */
export const MINUIT_PAR_PASSAGE = 4;
/** The subrequests of that work in one event: MINUIT_PAR_PASSAGE communes from cold, about 90 each, and the reads of KV. */
export const MINUIT_BUDGET = 400;
/** A copy's cost when this isolate has not built it yet: a commune's two from cold, 87 in the middle, 117 at most. */
const COUT_INCONNU = 60;
/** How long the read of a copy in KV is waited for. */
const KV_WAIT_MS = 2000;

export interface Minuit {
  /** The copies built. */
  faites: string[];
  /** The communes whose copies were already of the day. */
  deja: string[];
  /** Why the event stopped before the end, when it did: the next one goes on. */
  arret?: string;
}

/** Whether `now` is in the window after midnight. */
export const minuitDu = (now: Date) => sinceMidnight(now) < MINUIT_FIN_MINUTES * 60;

/** The two copies of a commune, and how each is built. */
const copies = (cache: Cache, p: PlacePage, now: Date): { key: string; build: () => Promise<unknown> }[] => [
  { key: `web:lieu:${p.slug}`, build: () => buildPlace(cache, p, now) },
  { key: `web:commune:${p.slug}`, build: () => buildCommune(cache, p, now) },
];

/** One event's pass: the communes whose copies are from before midnight, MINUIT_PAR_PASSAGE at most, as budget allows. */
export async function minuit(cache: Cache, now = new Date(), communes: readonly PlacePage[] = COMMUNES): Promise<Minuit> {
  const out: Minuit = { faites: [], deja: [] };
  if (!minuitDu(now)) return out;
  const midnight = now.getTime() - sinceMidnight(now) * 1000;
  let n = 0;
  for (const p of communes) {
    if (n >= MINUIT_PAR_PASSAGE) {
      out.arret = `${MINUIT_PAR_PASSAGE} communes par passage`;
      break;
    }
    let built = false;
    let tried = false;
    for (const { key, build } of copies(cache, p, now)) {
      const seen = await cache.peek(key, midnight, KV_WAIT_MS, KV_WAIT_MS, midnight).catch(() => undefined);
      if (seen && seen.fetchedAt.getTime() >= midnight && !seen.outdated) continue;
      // No more budget for it: the next event goes on from here.
      if (left() < (costOf(key) ?? COUT_INCONNU)) {
        out.arret = `budget : ${left()} sous-requêtes restantes pour ${key}`;
        return out;
      }
      tried = true;
      try {
        await cache.getFrom(key, undefined, FRESH_SECONDS, () => measured(key, build), FRESH_SECONDS);
        out.faites.push(key);
        built = true;
      } catch (err) {
        console.error(`copie de minuit impossible : ${key}`, err instanceof Error ? err.message : String(err));
      }
    }
    if (built) n++;
    else if (!tried) out.deja.push(p.slug);
  }
  return out;
}

/** The event's log line, after « copies de minuit : » (worker.ts). */
export const minuitSaid = (m: Minuit, used: number) =>
  `${m.faites.length ? m.faites.join(", ") : "aucune"}${m.deja.length ? ` ; déjà du jour : ${m.deja.length}` : ""}${m.arret ? ` ; arrêt : ${m.arret}` : ""}, sous-requêtes : ${used}`;
