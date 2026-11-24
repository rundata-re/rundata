/**
 * The bulletins of Météo-France's vigilance above green, kept to replay a real episode in the tests: the API gives
 * only the latest (vigilance.ts), the official map keeps its PDF 30 days (vigilance-carte.ts), and before 24/11/2026
 * the only bulletin in the repository was a green one (test/fixtures/vigilance_om.zip).
 *
 * The scheduled event's read (every 5 min) hands each zip here. A bulletin with a colour above green in any zone, or a
 * cyclone alert announced, in force or in its phase de sauvegarde, is kept once, under its time of issue, as
 * Météo-France gave it (about 300 KB), with an index of those kept. A green bulletin costs nothing: no read, no write.
 *
 * KV, while an episode lasts: one read of the index per event (288 a day at most, none once this isolate has kept the
 * bulletin), and two writes per new bulletin (the zip and the index): a few to a dozen a day.
 */
import { count } from "../budget.js";
import { why } from "../types.js";
import type { Vigilance } from "./vigilance.js";
import type { Store } from "./vigilance-carte.js";

const INDEX = "vigilance:episodes";
export const episodeKey = (emise: string) => `vigilance:episode:${emise}`;
/** Kept past the next season: a year and a month. */
export const TTL_SECONDS = 400 * 86_400;

export interface Index {
  bulletins: { emise: string; taille: number; garde: number }[];
}

let store: Store | undefined;
/** The last bulletin this isolate kept or found kept: the index is not read again for it. */
let last: string | undefined;

export function configure(kv?: Store): void {
  store = kv;
  last = undefined;
}

/** Whether a bulletin is part of an episode: any colour above green, or a cyclone alert at any step. */
export function episode(v: Vigilance): boolean {
  // The cyclone alert's steps are 2 to 6 once read (vigilance.ts), the phase de sauvegarde included.
  return Object.values(v.zones).some((byPhenomenon) => Object.values(byPhenomenon).some((periods) => periods.some((p) => p.couleur >= 2)));
}

/** Keeps the zip of a bulletin of an episode, once. Never throws. */
export async function garder(zip: ArrayBuffer, v: Vigilance, now = Date.now()): Promise<void> {
  if (!store || !episode(v) || last === v.emise) return;
  try {
    count(1, "read");
    const index = ((await store.json(INDEX)) as Index | null) ?? { bulletins: [] };
    if (!index.bulletins.some((b) => b.emise === v.emise)) {
      count(1, true);
      await store.put(episodeKey(v.emise), zip, TTL_SECONDS);
      index.bulletins.push({ emise: v.emise, taille: zip.byteLength, garde: now });
      // Only the bulletins still kept: the index never outgrows them.
      const oldest = now - TTL_SECONDS * 1000;
      index.bulletins = index.bulletins.filter((b) => b.garde > oldest);
      count(1, true);
      await store.put(INDEX, JSON.stringify(index), TTL_SECONDS);
      console.log(`vigilance : bulletin émis le ${v.emise} gardé pour le rejeu (${zip.byteLength} octets, ${index.bulletins.length} gardés)`);
    }
    last = v.emise;
  } catch (err) {
    console.error("vigilance : bulletin non gardé pour le rejeu", why(err));
  }
}
