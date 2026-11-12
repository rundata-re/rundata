/**
 * The home page's map drawn once for every isolate (web/accueil-carte.ts): the places and tracks of its two layouts take
 * about 450 ms of CPU, and the drawings an isolate keeps in memory (#1049) served few visits. With a few dozen visits an
 * hour spread over data centers and isolates, almost every one found its isolate cold (12/11/2026, 08:00-09:00 UTC:
 * cpu_ms median 457, p90 951, 6 visits out of 28 under 40 ms).
 *
 * The drawings are kept in KV under a key made from what they depend on (`cleCarte`: each layout's labels' sizes, the
 * places, the temperatures' discs) and the code's version. A visit whose isolate has none reads them there, one read;
 * when KV has none either, the visit draws them, as before, and writes them for the others after its response, one
 * write. A key is drawn once for the whole site, then read: the drawings change only when a label's size or a place
 * does.
 *
 * Not in the scheduled event: the copies that the map reads of the bikes, the trails, the agenda and the weather are
 * each data center's own (web/partagees.ts keeps only the others in KV), and the event runs in a data center that a
 * visit may never have reached; its drawings would be those of other copies.
 */
import { left } from "../budget.js";
import type { Cache } from "../cache.js";
import { why } from "../types.js";
import { cleCarte, dessinsCarte, reprendreCarte, type HomeLive } from "./accueil-carte.js";
import type { Background } from "./data.js";

/** How long KV keeps a page's drawings: a key no visit asks for again goes by itself. */
export const DESSINS_KEEP_SECONDS = 2 * 24 * 3600;

/** The KV key of the drawings of `cle`, for the code of `version`: a deploy that draws otherwise reads none of the old. */
async function kvKey(cle: string, version: string | undefined): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${version ?? ""}\n${cle}`));
  return `accueil:dessins:${[...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Before the home page is written: its map's drawings in this isolate, read from KV when it has none, else drawn here
 * and written to KV after the response. Nothing to do when the isolate has them (0 subrequest), one read when KV has
 * them, one read and one write when it has not. Never fails the page: the page draws what is missing.
 */
export async function dessinsAccueil(cache: Cache, h: HomeLive, now: Date, background: Background): Promise<"ici" | "lus" | "dessines" | "aucun"> {
  try {
    const c = cleCarte(h, now);
    if (!c) return "aucun";
    if (c.ici) return "ici";
    const key = await kvKey(c.cle, cache.version);
    if (left() > 0) {
      const kept = await cache.kept<unknown>(key);
      if (kept && reprendreCarte(kept.value, c.cle)) return "lus";
    }
    const d = dessinsCarte(h, now);
    if (d && left() > 0) background(cache.keep(key, d, DESSINS_KEEP_SECONDS).catch((err) => console.error("carte de l'accueil : dessins non écrits", why(err))));
    return "dessines";
  } catch (err) {
    console.error("carte de l'accueil : dessins non lus", why(err));
    return "aucun";
  }
}
