/**
 * The radar's history, for the replay bar of /meteo's map (rejeu.ts). Météo-France serves only its latest radar image,
 * so the scheduled event keeps them: each run reads the image (the one the tools read) and, when it is new, adds its
 * grid to one KV key, its runs of characters compressed. The key holds 6 hours, one image every 5 minutes, and a second
 * one an image a quarter of an hour over 24 hours. A run that cannot read the radar, or reads an image older than
 * STALE_MS, writes down a gap, said on the map as such (« Pas d'image radar de 14:05 à 14:20. »), never as a dry sky.
 *
 * An image is lost once the next one is out, 5 minutes later: a run that did not get the one due (the radar answered
 * an error, the cache served an old copy, or the image was late at Météo-France) reads the radar again, RETRIES_MS
 * apart, until it gets it. In 38 hours from 29/10/2026 18:00, 10 runs of 461 missed it: 1 error, 7 copies kept,
 * 2 images late.
 *
 * Météo-France sometimes skips an image: it still serves the one before at the run, then the one after. The image due
 * was never its latest, and no read can get it back (its API serves the latest only): the run says « image due sautée
 * à la source » in its log line, which counts them, and the map says the gap. In 24 hours to 02/11/2026 23:00 (La
 * Réunion), 3 images of 288 were lost, all so, none to an error. Météo-France's package of the last three images
 * (DPPaquetRadar, 9 to 14 Mo for all its territories) could fill them, at a cost not worth these gaps. A run that read
 * the radar over LATE_MS after its start may have found the next image out as well: it says « perdue, radar lu trop
 * tard » instead (36 images of 287 on 06/11/2026, each run of a quarter of an hour waiting two minutes for Vigicrues,
 * which did not answer, before reading the radar: worker.ts no longer waits for it).
 */
import { count, unmeasured } from "../budget.js";
import type { Cache } from "../cache.js";
import { why } from "../types.js";
import { tokensIssued } from "../providers/mf-auth.js";
import * as radar from "../providers/radar.js";
import { grid, type RainGrid } from "./pluie-radar.js";
import * as semaine from "./radar-semaine.js";

export const KV_KEY = "radar:6h";
/** Gone from KV an hour after the last write: a scheduled event that stopped leaves no old images behind. */
export const KV_TTL_SECONDS = 7 * 3600;
export const KEEP_MS = 6 * 3600_000;
/** The images a quarter of an hour over 24 hours, in their own key. */
export const LONG_KV_KEY = "radar:24h";
export const LONG_KV_TTL_SECONDS = 25 * 3600;
export const LONG_MS = 24 * 3600_000;
const QUARTER_MS = 15 * 60_000;
/** An image older than this when read is not the sky of now: a gap, as /meteo's live layer says. */
export const STALE_MS = 45 * 60_000;
const STEP_MS = 5 * 60_000;
/**
 * The waits before reading the radar again, while the image due is missing: two more reads at most, within the 3
 * minutes after the run, before the next run 5 minutes after it.
 */
export const RETRIES_MS = [60_000, 60_000];
/**
 * A read this long after the run's start is late: the image that ends at T was out between T+0:48 and T+2:37 on
 * 06/11/2026, so the next one may have replaced the image due by then, the run's fault and not Météo-France's.
 */
export const LATE_MS = 2 * 60_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Image {
  /** End of the radar's 5 minutes, ISO UTC; of the hour, for an image of an hour (parHeure). */
  fin: string;
  /** For an image of an hour: its start. */
  de?: string;
  pannes: string[];
  /** RainGrid's `pluie` and `mal_vu`, each run of a character written as the character and its length in base 36. */
  pluie: string;
  mal_vu: string;
  /**
   * The lame d'eau of its 5 minutes in the cells with rain (pluie-radar.ts, decodeMm), for rain totals over hours;
   * only the images of 5 minutes, since 01/11/2026: the 6 hours and the days (radar-semaine.ts).
   */
  mm?: string;
}
/** No image from `de` to `a` (ISO UTC): the radar could not be read, or its image was too old. */
export interface Trou {
  trou: true;
  de: string;
  a: string;
}
export type Entree = Image | Trou;
export interface Historique {
  w: number;
  h: number;
  /** Oldest first. */
  entrees: Entree[];
}

export const isTrou = (e: Entree): e is Trou => "trou" in e;
const sansMm = (e: Entree): Entree => {
  if (isTrou(e) || e.mm == null) return e;
  const { mm: _, ...x } = e;
  return x;
};
/**
 * The latest image of the history as the live layer's grid (pluie-radar.ts), without its lame d'eau; null when it holds
 * none. Its 5 minutes are the radar's: they end at `fin`.
 */
export function derniere(h: Historique | null): RainGrid | null {
  const last = [...(h?.entrees ?? [])].reverse().find((e): e is Image => !isTrou(e));
  if (!h || !last) return null;
  return { debut: iso(Date.parse(last.fin) - STEP_MS), fin: last.fin, pannes: last.pannes, w: h.w, h: h.h, pluie: unrle(last.pluie), mal_vu: unrle(last.mal_vu) };
}

/** The history without the lame d'eau (`mm`): what the replay bar's files show. */
export const sansLame = (h: Historique): Historique => ({ ...h, entrees: h.entrees.map(sansMm) });
export const endOf = (e: Entree) => Date.parse(isTrou(e) ? e.a : e.fin);
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** « ......0000011 » → « .6,05,12, »: each run as its character and its length in base 36, then a comma. */
export function rle(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    out += s[i] + (j - i).toString(36) + ",";
    i = j;
  }
  return out;
}

export function unrle(s: string): string {
  let out = "";
  for (const run of s.split(",")) if (run) out += run[0].repeat(parseInt(run.slice(1), 36));
  return out;
}

/**
 * The history after one run of the scheduled event that read `lu` (a grid, or the error that kept it from reading
 * one) at `now`; undefined when nothing new is to be written (the same image again, or nothing kept to tell a gap
 * from). Entries over KEEP_MS old go when something is written; the page's answer leaves them out anyway.
 */
export function suivant(before: Historique | null, lu: RainGrid | Error, now: Date): Historique | undefined {
  const grid = lu instanceof Error ? undefined : lu;
  const fresh = grid && now.getTime() - Date.parse(grid.fin) <= STALE_MS ? grid : undefined;
  const same = !!before && (!grid || (before.w === grid.w && before.h === grid.h));
  const entrees = same ? before.entrees.filter((e) => endOf(e) > now.getTime() - KEEP_MS) : [];
  const last = entrees[entrees.length - 1];
  const lastImage = [...entrees].reverse().find((e): e is Image => !isTrou(e));
  const w = grid?.w ?? before?.w ?? 0;
  const h = grid?.h ?? before?.h ?? 0;
  if (fresh) {
    if (lastImage && Date.parse(fresh.fin) <= Date.parse(lastImage.fin)) return undefined;
    // The trailing gap ends where this image starts; an image missed since the last one kept is a gap too.
    if (last && isTrou(last)) {
      last.a = fresh.debut;
      if (last.a <= last.de) entrees.pop();
    } else if (last && Date.parse(last.fin) < Date.parse(fresh.debut)) entrees.push({ trou: true, de: last.fin, a: fresh.debut });
    entrees.push({ fin: fresh.fin, pannes: fresh.pannes, pluie: rle(fresh.pluie), mal_vu: rle(fresh.mal_vu), ...(fresh.mm != null ? { mm: fresh.mm } : {}) });
    return { w, h, entrees };
  }
  // No image of now: the gap runs from the last image kept to this run, rounded down to the radar's 5 minutes.
  if (!last) return undefined;
  const a = new Date(Math.floor(now.getTime() / STEP_MS) * STEP_MS).toISOString();
  if (isTrou(last)) {
    if (last.a >= a) return undefined;
    last.a = a;
  } else if (Date.parse(last.fin) < Date.parse(a)) entrees.push({ trou: true, de: last.fin, a });
  else return undefined;
  return { w, h, entrees };
}

/**
 * One run of the scheduled event: one read of KV, the radar's image (one subrequest when the data center's copy is
 * over 4 minutes old; in the Worker, one more for KV's token when the isolate holds none, and two more for a new token
 * written there when KV holds none either: providers/mf-auth.ts), one write of KV when the history changed. Without
 * the image due (the one that ended 5 minutes before the run's 5 minutes), up to two more reads of the radar, one
 * subrequest each, RETRIES_MS apart (`wait`). `clock`, the time of each read, to tell a read late (LATE_MS).
 */
export async function passage(store: Store, cache: Cache, now = new Date(), long?: Store, wait = sleep, week?: semaine.Stores, clock = Date.now): Promise<string> {
  const tokens = tokensIssued();
  count();
  const before = await store.get();
  const failed = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));
  let kept = false;
  // How long after the run's start the image kept was read.
  let late = clock() - now.getTime();
  let lu: RainGrid | Error = await radar.image(cache).then((img) => ((kept = img.stale), grid(img.value, true)), failed);
  // The image due ends at the start of the 5 minutes before the run's: at 13:10:20, the one of 13:00–13:05.
  const due = Math.floor(now.getTime() / STEP_MS) * STEP_MS - STEP_MS;
  const behind = (x: RainGrid | Error) => x instanceof Error || Date.parse(x.fin) < due;
  // The quarter that ends the 6 hours before this run, taken before `suivant` lengthens a gap of theirs in place.
  const lastQuarter = (h: Historique | null | undefined) => JSON.stringify(quarters(h?.entrees ?? []).at(-1) ?? null);
  const quarterBefore = lastQuarter(before);
  // Each image read goes into the history in turn: an image caught up shortens the gap the first read wrote.
  let next: Historique | undefined;
  const add = (x: RainGrid | Error, t: Date) => void (next = suivant(next ?? before, x, t) ?? next);
  add(lu, now);
  let waited = 0;
  let again = 0;
  for (const ms of RETRIES_MS) {
    if (!behind(lu)) break;
    await wait(ms);
    waited += ms;
    again++;
    const readAt = clock() - now.getTime();
    const read: RainGrid | Error = await radar.read().then((img) => grid(img, true), failed);
    // A newer image wins; an error only replaces an error, the latest one said.
    if (!(read instanceof Error) && (lu instanceof Error || Date.parse(read.fin) > Date.parse(lu.fin))) {
      [lu, kept, late] = [read, false, readAt];
      add(read, new Date(now.getTime() + waited));
    } else if (lu instanceof Error) lu = read;
  }
  const at = new Date(now.getTime() + waited);
  if (next) {
    count(1, true);
    await store.put(next);
  }
  // The 24 hours: read and written only when the quarters of the 6 hours end otherwise, about once a quarter of an hour.
  let longSaid = "";
  if (next && long) {
    if (quarterBefore !== lastQuarter(next)) {
      count();
      const day = auQuart(await long.get(), next, at);
      count(1, true);
      await long.put(day);
      longSaid = `, 24 h : ${day.entrees.length} entrées écrites`;
      // The hours just ended into the week, at most once an hour, outside the run's cost (radar-semaine.ts).
      if (week) longSaid += await unmeasured(() => semaine.ajouter(week, next!, day, at));
    }
  }
  const said = lu instanceof Error ? `illisible (${why(lu)})` : `${kept ? "copie gardée, " : ""}image finie à ${lu.fin}`;
  // An image after the one due, which neither this run nor one before it read: Météo-France skipped it, or the run read
  // the radar too late, once the next one was out.
  const lastBefore = [...(before?.entrees ?? [])].reverse().find((e): e is Image => !isTrou(e));
  const skipped = !(lu instanceof Error) && Date.parse(lu.fin) > due && !!lastBefore && Date.parse(lastBefore.fin) < due &&
    !(next ?? before)!.entrees.some((e) => !isTrou(e) && Date.parse(e.fin) === due);
  const dueSaid = behind(lu) ? "toujours absente"
    : skipped ? (late > LATE_MS ? `perdue, radar lu trop tard (+${Math.round(late / 1000)} s ; finie à ${iso(due)})` : `sautée à la source (finie à ${iso(due)})`)
    : "lue";
  const caught = again ? `, rattrapage : ${again} lecture${again > 1 ? "s" : ""} de plus, image due ${dueSaid}` : skipped ? `, image due ${dueSaid}` : "";
  return `${said}${caught}, ${next ? `${next.entrees.length} entrées écrites` : "rien à écrire"}${longSaid}, jetons Météo-France pris : ${tokensIssued() - tokens}`;
}

export interface Store {
  get(): Promise<Historique | null>;
  put(h: Historique): Promise<void>;
}

/**
 * The quarters of the hour within `entrees`: at each, the image of the quarter, or the next one within 5 minutes (its
 * own time kept, never moved to the quarter); else the gap of the 6 hours it falls in, as it is. A gap that ends at the
 * quarter is not in it: the next image's 5 minutes start there (an image missed at 17:30 left the 17:35 one out).
 */
export function quarters(entrees: Entree[]): Entree[] {
  if (!entrees.length) return [];
  const out: Entree[] = [];
  const first = Math.ceil(endOf(entrees[0]) / QUARTER_MS) * QUARTER_MS;
  const lastEnd = endOf(entrees[entrees.length - 1]);
  for (let q = first; q <= lastEnd; q += QUARTER_MS) {
    const e = entrees.find((x) => (isTrou(x) ? Date.parse(x.de) < q && q < Date.parse(x.a) : Date.parse(x.fin) >= q && Date.parse(x.fin) <= q + 5 * 60_000));
    if (e && e !== out[out.length - 1]) out.push(e);
  }
  return out;
}

/**
 * The 24 hours after a write of the 6 hours (`six`): what `before` held before the 6 hours start, then their quarters;
 * a gap where the two do not meet. Over LONG_MS old, gone.
 */
export function auQuart(before: Historique | null, six: Historique, now: Date): Historique {
  // An image a quarter of an hour is not the lame d'eau of the quarter: its 5 minutes' stays in the 6 hours and the days.
  const recent = quarters(six.entrees).map(sansMm);
  const r0 = recent[0];
  // Where the 6 hours' quarters start: the gap's start, or the image's quarter.
  const cut = !r0 ? now.getTime() : isTrou(r0) ? Date.parse(r0.de) : Date.parse(r0.fin);
  const same = before && before.w === six.w && before.h === six.h;
  const image = !!r0 && !isTrou(r0);
  const old = same ? before.entrees.filter((e) => (image ? endOf(e) < cut : endOf(e) <= cut) && endOf(e) > now.getTime() - LONG_MS) : [];
  const last = old[old.length - 1];
  const meet = image ? cut - QUARTER_MS : cut;
  const join: Entree[] = last && endOf(last) < meet ? [{ trou: true, de: iso(endOf(last)), a: iso(meet) }] : [];
  const merged = [...old, ...join, ...recent].reduce<Entree[]>((acc, e) => {
    const prev = acc[acc.length - 1];
    if (prev && isTrou(prev) && isTrou(e)) prev.a = e.a;
    else acc.push({ ...e });
    return acc;
  }, []);
  return { w: six.w, h: six.h, entrees: merged };
}

const HOUR_MS = 3_600_000;

/**
 * In each cell, the strongest rain of `images`, and where the radars saw badly on any of them; each image's cells read
 * once through `cells`, for the windows it is in.
 */
export function maxOf(images: Image[], n: number, cells: (x: Image) => [string, string]): Pick<Image, "pannes" | "pluie" | "mal_vu"> {
  const pluie = new Uint8Array(n).fill(46); // "."
  const mal = new Uint8Array(n).fill(48); // "0"
  for (const x of images) {
    const [p, m] = cells(x);
    for (let k = 0; k < n; k++) {
      const c = p.charCodeAt(k);
      if (c !== 46 && (pluie[k] === 46 || c > pluie[k])) pluie[k] = c;
      if (m.charCodeAt(k) === 49) mal[k] = 49;
    }
  }
  const text = (a: Uint8Array) => new TextDecoder().decode(a);
  return { pannes: [...new Set(images.flatMap((x) => x.pannes))], pluie: rle(text(pluie)), mal_vu: rle(text(mal)) };
}

/** Reads each image's cells once: `maxOf`'s `cells`. */
export function reader(): (x: Image) => [string, string] {
  const read = new Map<Image, [string, string]>();
  return (x) => read.get(x) ?? read.set(x, [unrle(x.pluie), unrle(x.mal_vu)]).get(x)!;
}

/**
 * The windows of `span` ending every `step` where the history has an image: in each cell the strongest rain of the
 * images of the window (maxOf); an image belongs to the windows of its step and of the next ones within `span`. Two
 * windows a step apart share all but a step, so the map changes a little at a time. More than `span` without an
 * image, a gap.
 */
export function fenetres(h: Historique, step: number, span: number): Historique {
  const steps = new Map<number, Image[]>();
  const gaps: Trou[] = [];
  for (const e of h.entrees) {
    if (isTrou(e)) gaps.push(e);
    else {
      const q = Math.floor(Date.parse(e.fin) / step) * step;
      steps.set(q, [...(steps.get(q) ?? []), e]);
    }
  }
  const out: Entree[] = [];
  const ends = [...steps.keys()].sort((a, b) => a - b);
  const gap = (de: number, a: number) => {
    const last = out[out.length - 1];
    if (last && isTrou(last)) last.a = iso(a);
    else out.push({ trou: true, de: iso(de), a: iso(a) });
  };
  const cells = reader();
  if (ends.length && gaps.some((g) => Date.parse(g.de) < ends[0] - span)) gap(Math.min(...gaps.map((g) => Date.parse(g.de))), ends[0] - span);
  ends.forEach((end, i) => {
    if (i && end - ends[i - 1] > span) gap(ends[i - 1], end - span);
    const window = ends.filter((q) => q > end - span && q <= end).flatMap((q) => steps.get(q)!);
    out.push({ fin: iso(end), de: iso(end - span), ...maxOf(window, h.w * h.h, cells) });
  });
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  const tail = gaps.filter((g) => Date.parse(g.a) > lastEnd);
  if (tail.length) gap(Math.max(lastEnd, Math.min(...tail.map((g) => Date.parse(g.de)))), Math.max(...tail.map((g) => Date.parse(g.a))));
  return { w: h.w, h: h.h, entrees: out };
}

/**
 * The 24 hours for the replay, an image every quarter of an hour, each the hour up to it (the user, 31/10/2026: 96
 * images in a play went by too fast, then 24 an hour apart were too few, « on ne voit pas ce qui se passe entre 2 »):
 * the windows of an hour a quarter of an hour apart (fenetres).
 */
export const parHeure = (h: Historique): Historique => fenetres(h, QUARTER_MS, HOUR_MS);
