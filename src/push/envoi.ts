/**
 * The alerts sent to the phones by the scheduled event, once they are open (web/alertes-drapeau.ts): the changes that
 * alertes-etat.ts finds in a run, as one message, to every subscription (push/abonnements.ts).
 *
 * - Once each. A change is sent only by the event whose INSERT OR IGNORE of its key into alertes_envoyees succeeds
 *   (scripts/alertes.sql). Two scheduled events may overlap, and KV takes up to 60 s to reach every data center, so
 *   the state in KV cannot decide: D1, which has one primary, does. Rows older than a year are deleted.
 * - By batches. ENVOI_MAX subscriptions an event, in their order, in a budget of its own (ENVOI_BUDGET), from the
 *   cursor kept in alertes_en_cours; the next batch goes 5 minutes later. The cursor moves on before the batch is sent,
 *   and only if no other event moved it first: two events never send the same batch.
 * - A change found while a message is still going out joins it, and the message starts again from the first
 *   subscription: those already reached get the earlier changes again with the new one, the others get them all in one.
 * - Past TTL_S (6 h) a message not finished is dropped: the push services would drop it too.
 * - The KV key alertes:pause (any value, set by the team) stops every send without a deploy. The changes found
 *   meanwhile stay in the log line of alertes-etat.ts; they are not sent later.
 * - A 404 or 410 of a push service says the subscription is gone: its row is deleted, a hundred at a time.
 *
 * The words are the changes' own (alertes-etat.ts) with their source, a title and the page a tap opens; they are agreed
 * with the page's before the flag opens.
 */
import type { Changement } from "../alertes-etat.js";
import * as abonnements from "./abonnements.js";

/** Subscriptions sent to in one event: about 5 s of CPU (2.5 ms a push) and as many subrequests. */
export const ENVOI_MAX = 2_000;
/**
 * The event's budget for the sends (worker.ts `counted(ENVOI_BUDGET, …)`): ENVOI_MAX pushes, the deletions of the gone
 * subscriptions (ENVOI_MAX / PAR_DELETE at most), a few D1 reads and writes and the pause's KV read, and the tenth of
 * a budget kept for the cache (budget.ts), which the D1 calls cannot use.
 */
export const ENVOI_BUDGET = 2_300;
/** Set by the team (any value), the sends stop: `npx wrangler kv key put alertes:pause 1 --binding STORE --remote`. */
export const PAUSE_KEY = "alertes:pause";
/** A Worker waits for at most six connections' headers at once; more would only queue. */
const CONNEXIONS = 6;
/** Addresses deleted in one statement: under D1's 100 bound parameters. */
const PAR_DELETE = 100;
const AN_MS = 365 * 86_400_000;

/** Who says it, after each change: the message never says more than its source. */
const SOURCE: Record<Changement["sujet"], string> = { vigilance: "Météo-France", cyclone: "Météo-France", volcan: "préfecture" };
const PAGE: Record<Changement["sujet"], string> = { vigilance: "/vigilance", cyclone: "/alerte-cyclone", volcan: "/volcan" };
/** The page a tap opens: the cyclone's first, then the volcano's, then the vigilance's. */
const ORDRE: Changement["sujet"][] = ["cyclone", "volcan", "vigilance"];

/** A change as kept in alertes_en_cours: its key is in alertes_envoyees already. */
export type Retenu = Pick<Changement, "sujet" | "texte" | "urgent">;

/** French spacing: a no-break space before « : ; ? ! » (the service worker shows the text as it comes). */
const typo = (t: string) => t.replace(/ ([:;?!])/g, " $1");
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** One message for the changes: a line each with its source, and the page of the first by ORDRE. */
export function message(changements: Retenu[]): { m: abonnements.Message; urgent: boolean } {
  const premier = [...changements].sort((a, b) => ORDRE.indexOf(a.sujet) - ORDRE.indexOf(b.sujet))[0];
  return {
    m: {
      titre: typo(changements.length === 1 ? "rundata.re : alerte" : `rundata.re : ${changements.length} alertes`),
      corps: typo(changements.map((c) => `${majuscule(c.texte)} (${SOURCE[c.sujet]})`).join("\n")),
      lien: `https://rundata.re${PAGE[premier.sujet]}`,
    },
    urgent: changements.some((c) => c.urgent),
  };
}

/** What an event did: the changes it took, the batch's issues, whether subscriptions are left for the next event. */
export interface Bilan {
  nouveaux: number;
  envoye: number;
  efface: number;
  echec: number;
  reste: boolean;
  /** A message past TTL_S, dropped unfinished. */
  abandonne?: boolean;
}

interface EnCours {
  changements: string;
  depuis: string;
  apres: string;
}

/**
 * One event's sends: the run's changes taken (once each) into the message going out, then its next batch. Undefined
 * when there was nothing to do, so that the log says nothing then.
 */
export async function passage(changements: Changement[], kv: { get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null> }, now: Date, max = ENVOI_MAX): Promise<Bilan | undefined> {
  const db = abonnements.d1();
  if (!db) return undefined;
  // Any value, read as bytes: never a parse that fails.
  if ((await kv.get(PAUSE_KEY, "arrayBuffer")) !== null) return undefined;
  const bilan: Bilan = { nouveaux: 0, envoye: 0, efface: 0, echec: 0, reste: false };
  const lire = async () => (await db.all<EnCours>("SELECT changements, depuis, apres FROM alertes_en_cours WHERE id = 1"))[0];
  const nouveaux: Retenu[] = [];
  for (const c of changements) {
    if (await db.run("INSERT OR IGNORE INTO alertes_envoyees (cle, envoyee) VALUES (?, ?)", c.cle, now.toISOString())) nouveaux.push({ sujet: c.sujet, texte: c.texte, urgent: c.urgent });
  }
  if (nouveaux.length) {
    bilan.nouveaux = nouveaux.length;
    await db.run("DELETE FROM alertes_envoyees WHERE envoyee < ?", new Date(now.getTime() - AN_MS).toISOString());
    const avant = await lire();
    const encore = avant && now.getTime() - Date.parse(avant.depuis) <= abonnements.TTL_S * 1000 ? (JSON.parse(avant.changements) as Retenu[]) : [];
    await db.run(
      "INSERT INTO alertes_en_cours (id, changements, depuis, apres) VALUES (1, ?, ?, '') ON CONFLICT(id) DO UPDATE SET changements = excluded.changements, depuis = excluded.depuis, apres = ''",
      JSON.stringify([...encore, ...nouveaux]),
      now.toISOString(),
    );
  }
  const r = await lire();
  if (!r) return bilan.nouveaux ? bilan : undefined;
  if (now.getTime() - Date.parse(r.depuis) > abonnements.TTL_S * 1000) {
    await db.run("DELETE FROM alertes_en_cours WHERE id = 1 AND depuis = ?", r.depuis);
    return { ...bilan, abandonne: true };
  }
  const lot = await db.all<abonnements.Abonnement>("SELECT endpoint, p256dh, auth FROM abonnements WHERE endpoint > ? ORDER BY endpoint LIMIT ?", r.apres, max);
  bilan.reste = lot.length === max;
  // The batch taken before it is sent, only if the row is still as read: another event that took it first wins.
  const pris = bilan.reste
    ? await db.run("UPDATE alertes_en_cours SET apres = ? WHERE id = 1 AND depuis = ? AND apres = ?", lot[lot.length - 1].endpoint, r.depuis, r.apres)
    : await db.run("DELETE FROM alertes_en_cours WHERE id = 1 AND depuis = ? AND apres = ?", r.depuis, r.apres);
  if (!pris) return bilan.nouveaux ? { ...bilan, reste: false } : undefined;
  const { m, urgent } = message(JSON.parse(r.changements) as Retenu[]);
  const jwts = new Map<string, Promise<string>>();
  const partis: string[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONNEXIONS, lot.length) }, async () => {
      while (i < lot.length) bilan[await abonnements.envoyer(lot[i++], m, urgent, jwts, now.getTime(), (e) => partis.push(e))]++;
    }),
  );
  for (let j = 0; j < partis.length; j += PAR_DELETE) {
    const part = partis.slice(j, j + PAR_DELETE);
    await db.run(`DELETE FROM abonnements WHERE endpoint IN (${part.map(() => "?").join(", ")})`, ...part);
  }
  return bilan;
}
