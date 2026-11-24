/**
 * The collectors of the scheduled event that keep one copy in KV, all of the same shape: when it is their time, read the
 * copy (one counted read), collect from it, write the new copy back under the same key with its TTL (one counted
 * write), and say one log line. worker.ts runs each in a budget of its own once the event's reads are done; a new one
 * is a row here, never a copy of the block.
 */
import { count, readsSaid } from "./budget.js";
import * as airMesures from "./providers/air-mesures.js";
import * as candhis from "./providers/candhis.js";
import * as capteurs from "./providers/capteurs.js";
import * as cpf from "./providers/cpf.js";
import * as emploi from "./providers/emploi.js";
import * as ffck from "./providers/ffck.js";
import * as marchesPublics from "./providers/marches-publics.js";
import * as sitesHs from "./providers/sites-hs.js";

/** The part of the KV namespace binding a pass uses. */
export interface Kv {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Collecteur<T = unknown> {
  /** The start of its log lines, which the dashboards read: never reworded. */
  nom: string;
  /** Whether it runs in the event of `now`. */
  due(now: Date): boolean;
  /** Its copy's key in KV, and how long the copy is kept. */
  cle: string;
  ttl: number;
  /** One pass: the copy before (null the first time), how to write the new one; what the log line says. */
  collect(avant: T | null, ecrire: (copie: T) => Promise<void>, now: Date): Promise<string>;
}

const collecteur = <T>(c: Collecteur<T>) => c as unknown as Collecteur;

export const COLLECTEURS: Collecteur[] = [
  // Every 30 minutes, at 10 and 40 past the hour: the Candhis buoys' last half hour, one request per type of buoy.
  // Nothing without the key.
  collecteur<candhis.Etat>({ nom: "bouées Candhis", due: (now) => candhis.configured() && candhis.refreshDue(now), cle: candhis.KEY, ttl: candhis.TTL_SECONDS, collect: candhis.refresh }),
  // Every 30 minutes, at 25 and 55 past the hour: one page of the FFCK's calendar at most, a season's list once a day or
  // the page of an event of the island.
  collecteur<ffck.Etat>({ nom: "calendrier FFCK", due: ffck.refreshDue, cle: ffck.KEY, ttl: ffck.TTL_SECONDS, collect: ffck.refresh }),
  // Every hour, at 45 past: the measures at Atmo Réunion's stations, La Réunion's lines of the LCSQA's national file
  // (up to 12.5 Mo, read line by line), kept when the latest hour changed.
  collecteur<airMesures.Copie>({ nom: "mesures de l'air", due: airMesures.refreshDue, cle: airMesures.KV_KEY, ttl: airMesures.KV_TTL_SECONDS, collect: airMesures.collect }),
  // Every 15 minutes, at 10, 25, 40 and 55 past: the sensors of private people on Sensor.Community over the island, one
  // request, and at 10 past those of sensors.social besides, its list and one request per sensor of the island.
  collecteur<capteurs.Stocke>({ nom: "capteurs amateurs", due: capteurs.refreshDue, cle: capteurs.KV_KEY, ttl: capteurs.KV_TTL_SECONDS, collect: (avant, ecrire, now) => capteurs.collect(avant, ecrire, now, capteurs.socialDue(now)) }),
  // Every event: one page of an offer of the public sector at La Réunion, the newest not read yet or else each in turn,
  // for its employer and closing date, and every hour at 25 past the feed besides; kept when they changed.
  collecteur<emploi.Copie>({ nom: "offres d'emploi", due: () => true, cle: emploi.KV_KEY, ttl: emploi.KV_TTL_SECONDS, collect: (avant, ecrire, now) => emploi.collect(avant, ecrire, now) }),
  // Every hour at half past, from 14:30 to 23:30 in La Réunion, until the file of the day is read: the mobile sites out
  // of service at La Réunion, its lines of the Arcep's national file (0.5 to 2.2 Mo).
  collecteur<sitesHs.Copie>({ nom: "sites mobiles hors service", due: sitesHs.refreshDue, cle: sitesHs.KV_KEY, ttl: sitesHs.KV_TTL_SECONDS, collect: sitesHs.collect }),
  // Every hour at 15 past, from 12:15 to 18:15 UTC, until the catalogue of the day is read: the formations eligible to
  // the CPF with an open session at La Réunion (Caisse des Dépôts, about 780 Ko).
  collecteur<cpf.Copie>({ nom: "formations CPF", due: cpf.refreshDue, cle: cpf.KV_KEY, ttl: cpf.KV_TTL_SECONDS, collect: cpf.collect }),
  // Every hour, at 35 past: the public procurement notices open at La Réunion (BOAMP), the full text of the new ones
  // only, kept when they changed.
  collecteur<marchesPublics.Copie>({ nom: "marchés publics", due: marchesPublics.refreshDue, cle: marchesPublics.KV_KEY, ttl: marchesPublics.KV_TTL_SECONDS, collect: marchesPublics.collect }),
];

/** One pass of a collector: its copy read, collected from, written back. Run inside `counted`, which counts both. */
export async function passage(c: Collecteur, kv: Kv, now: Date): Promise<string> {
  count();
  const avant = await kv.get(c.cle, "json");
  return c.collect(avant, async (copie) => {
    count(1, true);
    await kv.put(c.cle, JSON.stringify(copie), { expirationTtl: c.ttl });
  }, now);
}

/** Its log line once the pass is done. */
export const dit = (c: Collecteur, r: { value: string; used: number; reads: Map<string, number> }) =>
  `${c.nom} : ${r.value}, sous-requêtes : ${r.used}${readsSaid(r.reads)}`;
