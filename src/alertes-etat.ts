/**
 * The alerts a push to the phones would follow, read from the copies the site already keeps: Météo-France's vigilance
 * (its zones, and the island's cyclone alert) and /volcan's copy (the ORSEC level). For now nothing is sent: the
 * scheduled event writes one log line a run when something would go, so that how often a push would go, and how many
 * would be false, is read in the Worker's logs over weeks before any phone rings.
 *
 * What would be sent, in one message a run however many changes:
 * - vigilance: a zone and phenomenon whose highest colour of the bulletin reaches orange, or rises above what was
 *   already said in its episode (orange → red). Never one that falls: the pages say it. An episode ends 12 h after its
 *   last bulletin at orange or above; until then, a fall back to yellow and a rise to orange again say nothing;
 * - cyclone: each change of the step in force, both ways, and its lifting (« on peut ressortir »);
 * - volcano: each change of level from Alerte 1, up or down, the return to Vigilance (« fin de l'alerte ») and the
 *   start of an eruption; Vigilance and Vigilance renforcée are not said alone. The level is read in texts (a release
 *   may quote an old one, a reading of an image may be wrong): a change goes only once seen in two copies in a row.
 *
 * What never counts: a copy that is the last good one of a failed source (`stale`) or one served late (`tardive`),
 * a bulletin not newer than the last one taken, the same /volcan copy twice, a level not read (`niveau_inconnu`). Each
 * keeps its part's state as it was, so a source that fails then comes back says nothing again. The first run of a
 * part only writes its state.
 *
 * Its cost: no read of a source (the copies are those the event just kept), one KV read a run and one KV write only
 * when the state changes.
 */
import type { Cached } from "./cache.js";
import * as mf from "./providers/vigilance.js";
import { cycloneNow, cycloneOn, highest } from "./tools/vigilance.js";
import type { VolcanAnswer } from "./web/data.js";

export const ETAT_KEY = "push:etat";
/** Orange: below it, no push (yellow would come too often). */
const SEUIL = 3;
/** An episode of vigilance ends this long after its last bulletin at orange or above. */
export const FIN_EPISODE_MS = 12 * 3_600_000;
/** The calm levels of the ORSEC volcano plan, said as one: no push between them. */
const CALME = "Vigilance";

export interface EtatAlertes {
  /** « zone|phénomène » → the highest colour already said in its episode, and the last bulletin at orange or above. */
  vigilance?: Record<string, { c: number; vu: string }>;
  /** The bulletin last taken (`emise`): an older or the same one is not read again. */
  emise?: string;
  /** The cyclone step in force (2 pré-alerte … 6 phase de sauvegarde), -1 for none. */
  cyclone?: number;
  /** The volcano as last said: the ORSEC level (Vigilance for both calm ones), and whether an eruption is under way. */
  volcan?: Volcan;
  /** A change of the volcano seen in one copy, waiting for the next one to say it again. */
  volcanAttente?: Volcan;
  /** When the /volcan copy last taken was built, ISO: the same copy is not counted twice. */
  volcanLu?: string;
}

interface Volcan {
  niveau: string;
  eruption: boolean;
}

/** A copy that may be read: a fresh one, not the last good copy of a failed source nor one served late. */
const frais = <T>(c: Cached<T> | null | undefined): T | undefined => (c && !c.stale && !c.tardive ? c.value : undefined);

const zoneDe = (zone: string) => (mf.ZONES[zone] ?? zone).split(" :")[0];

/** Vigilance and Vigilance renforcée are said as one; the alert levels as the prefecture names them. */
const niveauDit = (n: string) => (n.startsWith(CALME) ? CALME : n);

/** One run's changes on the state before it: the new state, and what a push would say, in the log's words. */
export function suivre(avant: EtatAlertes | undefined, vigilance: Cached<mf.Vigilance> | null | undefined, volcan: Cached<VolcanAnswer> | null | undefined, now: Date): { etat: EtatAlertes; dits: string[] } {
  const etat: EtatAlertes = structuredClone(avant ?? {});
  const dits: string[] = [];

  const v = frais(vigilance);
  if (v && (!etat.emise || v.emise > etat.emise)) {
    const premier = etat.emise === undefined;
    const t = Date.parse(v.emise);
    const vus: Record<string, { c: number; vu: string }> = {};
    // An episode still open keeps its highest colour said, even when this bulletin no longer has it.
    for (const [cle, e] of Object.entries(etat.vigilance ?? {})) if (t - Date.parse(e.vu) < FIN_EPISODE_MS) vus[cle] = e;
    for (const [zone, byPhenomenon] of Object.entries(v.zones)) {
      if (zone === mf.ISLAND) continue;
      for (const [id, periods] of Object.entries(byPhenomenon)) {
        const c = highest(periods);
        if (Number(id) === mf.CYCLONE || c < SEUIL) continue;
        const cle = `${zone}|${id}`;
        const deja = vus[cle]?.c ?? 0;
        if (c > deja && !premier) dits.push(`vigilance ${mf.colour(c)} ${(mf.PHENOMENA[Number(id)] ?? `phénomène ${id}`).toLowerCase()}, ${zoneDe(zone)}`);
        vus[cle] = { c: Math.max(c, deja), vu: v.emise };
      }
    }
    etat.vigilance = vus;
    const periods = v.zones[mf.ISLAND]?.[mf.CYCLONE];
    const cyclone = periods && cycloneOn(periods, now) ? cycloneNow(periods, now) : -1;
    if (!premier && etat.cyclone !== undefined && cyclone !== etat.cyclone) {
      dits.push(cyclone < 2 ? "alerte cyclonique levée" : `alerte cyclonique ${mf.cycloneName(cyclone)}`);
    }
    etat.cyclone = cyclone;
    etat.emise = v.emise;
  }

  const vo = frais(volcan);
  const lu = volcan?.fetchedAt.toISOString();
  const e = vo?.etat;
  if (e?.niveau_orsec && !e.niveau_inconnu && lu && (!etat.volcanLu || lu > etat.volcanLu)) {
    etat.volcanLu = lu;
    const vu: Volcan = { niveau: niveauDit(e.niveau_orsec), eruption: e.eruption_en_cours === true };
    const dit = etat.volcan;
    if (!dit) etat.volcan = vu;
    else if (vu.niveau === dit.niveau && vu.eruption === dit.eruption) delete etat.volcanAttente;
    else if (etat.volcanAttente?.niveau === vu.niveau && etat.volcanAttente.eruption === vu.eruption) {
      // Seen in two copies in a row: said.
      if (vu.eruption && !dit.eruption) dits.push(`volcan : éruption en cours (${vu.niveau})`);
      else if (vu.niveau !== dit.niveau) dits.push(vu.niveau === CALME ? `volcan : fin de l'alerte (${CALME})` : `volcan : ${vu.niveau} (était ${dit.niveau})`);
      etat.volcan = vu;
      delete etat.volcanAttente;
    } else etat.volcanAttente = vu;
  }
  return { etat, dits };
}

interface Kv {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

/** The state kept by the code before 24/11 (a colour by key, the level as a word): read as a first run of each part. */
function lire(x: unknown): EtatAlertes | undefined {
  if (!x || typeof x !== "object") return undefined;
  const e = x as Record<string, unknown>;
  return typeof e.volcan === "string" || (e.vigilance && Object.values(e.vigilance).some((c) => typeof c === "number")) ? undefined : (e as EtatAlertes);
}

/** One run: the state from the copies, one log line when a push would go, and the state written when it changed. */
export async function detecter(kv: Kv, vigilance: Cached<mf.Vigilance> | null | undefined, volcan: Cached<VolcanAnswer> | null | undefined, now: Date, log: (ligne: string) => void = console.log): Promise<string[]> {
  const avant = lire(await kv.get(ETAT_KEY, "json"));
  const { etat, dits } = suivre(avant, vigilance, volcan, now);
  // One line a run, as one message would go: the count of lines is the count of pushes.
  if (dits.length) log(`alertes push (à blanc, rien n'est envoyé) : ${dits.join(" ; ")}`);
  if (JSON.stringify(etat) !== JSON.stringify(avant ?? {})) await kv.put(ETAT_KEY, JSON.stringify(etat));
  return dits;
}
