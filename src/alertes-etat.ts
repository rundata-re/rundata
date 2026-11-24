/**
 * The alerts a push to the phones would follow (interne plan of 24/11/2026), read from the copies the site already
 * keeps: Météo-France's vigilance (its zones, and the island's cyclone alert) and /volcan's copy (the ORSEC level). For
 * now nothing is sent: the scheduled event writes one log line at each change, so that how often a push would go is
 * measured over the cyclone season (in the Worker's logs) before anyone is notified.
 *
 * What counts as a change: a zone and phenomenon whose highest colour of the bulletin rises to orange or red (never
 * one that falls), a cyclone step in force that starts, changes or is lifted, a volcano level that changes. A part not
 * read this time (no copy, the prefecture's phase not read) keeps its last state and says nothing. The first run only
 * writes the state.
 *
 * Its cost: no read of a source (the copies are those of the event), one KV read a run and one KV write only when the
 * state changes.
 */
import * as mf from "./providers/vigilance.js";
import { cycloneNow, cycloneOn, highest } from "./tools/vigilance.js";
import type { VolcanAnswer } from "./web/data.js";

export const ETAT_KEY = "push:etat";
/** Orange: below it, no push (yellow would come too often). */
const SEUIL = 3;

export interface EtatAlertes {
  /** « zone|phénomène » → the highest colour of the bulletin, orange or above only. */
  vigilance?: Record<string, number>;
  /** The cyclone step in force (2 pré-alerte … 6 phase de sauvegarde), -1 for none. */
  cyclone?: number;
  /** The ORSEC level as the prefecture names it (« Alerte 1 »). */
  volcan?: string;
}

export function etatDe(v: mf.Vigilance | undefined, volcan: VolcanAnswer | undefined, now: Date): EtatAlertes {
  const etat: EtatAlertes = {};
  if (v) {
    etat.vigilance = {};
    for (const [zone, byPhenomenon] of Object.entries(v.zones)) {
      if (zone === mf.ISLAND) continue;
      for (const [id, periods] of Object.entries(byPhenomenon)) {
        const max = highest(periods);
        if (Number(id) !== mf.CYCLONE && max >= SEUIL) etat.vigilance[`${zone}|${id}`] = max;
      }
    }
    const periods = v.zones[mf.ISLAND]?.[mf.CYCLONE];
    etat.cyclone = periods && cycloneOn(periods, now) ? cycloneNow(periods, now) : -1;
  }
  if (volcan?.etat?.niveau_orsec && !volcan.etat.niveau_inconnu) etat.volcan = volcan.etat.niveau_orsec;
  return etat;
}

const zoneDe = (zone: string) => (mf.ZONES[zone] ?? zone).split(" :")[0];

/** What a push would say has changed, in the log's words; nothing on the first run. */
export function changements(avant: EtatAlertes | undefined, apres: EtatAlertes): string[] {
  if (!avant) return [];
  const out: string[] = [];
  if (apres.vigilance && avant.vigilance) {
    for (const [cle, c] of Object.entries(apres.vigilance)) {
      if (c <= (avant.vigilance[cle] ?? 0)) continue;
      const [zone, id] = cle.split("|");
      out.push(`vigilance ${mf.colour(c)} ${(mf.PHENOMENA[Number(id)] ?? `phénomène ${id}`).toLowerCase()}, ${zoneDe(zone)}`);
    }
  }
  if (apres.cyclone !== undefined && avant.cyclone !== undefined && apres.cyclone !== avant.cyclone) {
    out.push(apres.cyclone < 2 ? "alerte cyclonique levée" : `alerte cyclonique ${mf.cycloneName(apres.cyclone)}`);
  }
  if (apres.volcan && avant.volcan && apres.volcan !== avant.volcan) out.push(`volcan : ${apres.volcan} (était ${avant.volcan})`);
  return out;
}

interface Kv {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

/** One run: the state from the copies, a log line by change, and the state written when it changed. */
export async function detecter(kv: Kv, v: mf.Vigilance | undefined, volcan: VolcanAnswer | undefined, now: Date, log: (ligne: string) => void = console.log): Promise<string[]> {
  const avant = ((await kv.get(ETAT_KEY, "json")) ?? undefined) as EtatAlertes | undefined;
  const lu = etatDe(v, volcan, now);
  // A part not read keeps its last state.
  const apres: EtatAlertes = { ...avant, ...lu };
  const dits = changements(avant, lu);
  for (const d of dits) log(`alertes push (essai, rien n'est envoyé) : ${d}`);
  if (JSON.stringify(apres) !== JSON.stringify(avant)) await kv.put(ETAT_KEY, JSON.stringify(apres));
  return dits;
}
