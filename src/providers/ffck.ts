/**
 * Canoe-kayak and va'a: the events of La Réunion in the national calendar of the FFCK (Fédération française de canoë
 * kayak et sports de pagaie), app.ffck.org. Its legal notice (ffck.org/mentionslegales/, read on 05/11/2026) has no
 * clause on reuse, and app.ffck.org no robots.txt.
 *
 * The site is read one page at a time, a page every half hour at most, by the Worker's scheduled event only: the list
 * of a season once a day (one page for all France, about 650 events, 284 Ko on 05/11/2026), then the page of each event
 * of the island, one per run. An event is said of the island only by the postcode of its page (974xx): many communes
 * and quarters of the island share their name with a town of France (Saint-Pierre, Le Port, Sainte-Rose, Montauban…),
 * whose events are left out once their page is read. The list's place only chooses which pages to read.
 *
 * What is kept of a page: its kind, dates, address, position and organising club with its website. The names, e-mails
 * and phone numbers of the people it gives are never read.
 */
import type { Cache, Cached } from "../cache.js";
import { getText } from "../http.js";
import { communeAdresse, communeExacte } from "../places/codes-postaux.js";
import { type SourceInfo, UpstreamError } from "../types.js";
import { decodeText, textOf } from "./avis-eau.js";
import type { Epreuve } from "./sport.js";

export const SOURCE: SourceInfo = {
  id: "ffck",
  nom: "Canoë-kayak et va'a : calendrier de la Fédération française de canoë-kayak (FFCK)",
  organisme: "Fédération française de canoë kayak et sports de pagaie",
  licence: "Mentions légales sans clause de reprise (lues le 05/11/2026) : les dates, lieux et clubs des épreuves, repris à titre d'information",
  attribution: "FFCK, calendrier fédéral",
  url: "http://app.ffck.org/web/calendrier/calendrier.php",
};

const BASE = "http://app.ffck.org/web/calendrier/";
const listUrl = (saison: number) => `${BASE}ajax_calendrier_load.php?type_evenement=&mois=&saison=${saison}`;
export const ficheUrl = (codex: string) => `${BASE}evenement_detail.php?codex=${encodeURIComponent(codex)}`;

/** Where the scheduled event keeps what it read, and how long: past 30 days without a write, nothing is shown. */
export const KEY = "ffck:etat";
export const TTL_SECONDS = 30 * 86_400;
/** The scheduled event reads one page every 30 minutes at most, at 25 and 55 past the hour (UTC), when one is due. */
export const REFRESH_EVERY = 30;
export const REFRESH_OFFSET = 25;
/** A season's list is read again after this. */
const LIST_HOURS = 23;
// Each data center reads its copy of the state again after this.
const READ_SECONDS = 15 * 60;
const TIMEOUT_MS = 20_000;
const HOUR = 3_600_000;

/** A row of a season's list. */
export interface Ligne {
  codex: string;
  type: string;
  nom: string;
  /** YYYY-MM-DD. */
  debut: string;
  fin: string;
  /** The place as the list gives it: « STE SUZANNE ». */
  lieu: string;
}

/** What an event's page gives, the people left out. */
export interface Fiche {
  caracteristiques?: string;
  adresse?: string;
  /** The postcode of its address: the event is the island's only when it is 974xx. */
  cp?: string;
  /** The commune of the island its postcode and town give; none out of the island. */
  commune?: string;
  lon?: number;
  lat?: number;
  organisateur?: string;
  site?: string;
}

export interface Etat {
  /** Epoch ms of the last read of each season's list. */
  listes: Record<string, number>;
  /** The rows of the lists whose place names a place of the island: the events whose page is read. */
  candidates: Ligne[];
  /** The pages read, by codex, with the row they were read for (read again when it changes) and when. */
  fiches: Record<string, Fiche & { ligne: string; lue: number }>;
  /** Epoch ms of the last read that worked, and of the last one tried. */
  lu?: number;
  essai: number;
  echec?: { at: number; status?: number; message: string };
}

// The tags dropped character by character, then the entities in one pass that never makes a « < » or « > » again.
const text = (html: string) => decodeText(textOf(html)).replace(/\s+/g, " ").trim();
/** « 14/11/2026 » → « 2026-11-14 ». */
const isoDay = (d: string) => {
  const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

/**
 * The events of a season's list: each `<tr>` with its codex, kind, name, dates and place. An event held over several
 * days may have a row a day under the same codex: they make one event, from its earliest start to its latest end. A row
 * of that codex that names another event or place is left out, and said in the logs.
 */
export function parseListe(html: string): Ligne[] {
  const out: Ligne[] = [];
  const seen = new Map<string, Ligne>();
  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const codex = /data-codex="([^"]+)"/.exec(row)?.[1];
    if (!codex) continue;
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    if (cells.length < 6) continue;
    const [, type, nom, debut, fin, lieu] = cells;
    const d = isoDay(debut);
    if (!d) continue;
    const ligne = { codex, type, nom, debut: d, fin: isoDay(fin) || d, lieu };
    const first = seen.get(codex);
    if (!first) {
      seen.set(codex, ligne);
      out.push(ligne);
    } else if (first.type !== type || first.nom !== nom || first.lieu !== lieu) {
      console.log(`FFCK : ${codex} a une autre ligne qui diffère de la première (${nom}, ${lieu}) : la première gardée`);
    } else {
      if (ligne.debut < first.debut) first.debut = ligne.debut;
      if (ligne.fin > first.fin) first.fin = ligne.fin;
    }
  }
  return out;
}

/** « STE SUZANNE » → « SAINTE SUZANNE », as the gazetteer reads it. */
const expanded = (lieu: string) => lieu.replace(/^STE\b\.?/i, "SAINTE").replace(/^ST\b\.?/i, "SAINT");

/**
 * The rows worth reading the page of: a sport's event (the federation's meetings, « Réunion - … », left out), not over
 * before `today`, at a place whose name is one of the island's. That name proves nothing: the page's postcode does.
 */
export function candidates(rows: Ligne[], today: string): Ligne[] {
  return rows.filter((r) => !/^R[ée]union\b/i.test(r.type) && r.fin >= today && !!communeExacte(expanded(r.lieu)));
}

// The labels of an event's page that are read; any other row (the people, their e-mail and phone) is never looked at.
const LABELS: Record<string, "caracteristiques" | "adresse" | "gps" | "organisateur" | "site"> = {
  "Caractéristiques": "caracteristiques",
  Lieu: "adresse",
  "Coordonnées GPS": "gps",
  Organisateur: "organisateur",
  "Site web": "site",
};

/** What an event's page says of it: its kind, address and postcode, position, club and website. */
export function parseFiche(html: string): Fiche {
  const f: Fiche = {};
  for (const [, label, value] of html.matchAll(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)) {
    const k = LABELS[label.trim()];
    if (!k) continue;
    const v = text(value);
    if (!v) continue;
    if (k === "gps") {
      const m = /long\s*:\s*(-?\d+(?:\.\d+)?)\s*-\s*lat\s*:\s*(-?\d+(?:\.\d+)?)/.exec(v);
      if (m) [f.lon, f.lat] = [Number(m[1]), Number(m[2])];
    } else if (k === "site") {
      if (/^https?:\/\/\S+$/.test(v)) f.site = v;
    } else f[k] = v;
  }
  // « 2 RUE DU STADE - 97441 STE SUZANNE »: the postcode and the town after it.
  const m = f.adresse ? /\b(\d{5})\s+([^\d]+)$/.exec(f.adresse) : null;
  if (m) {
    f.cp = m[1];
    const commune = communeAdresse(m[1], expanded(m[2].trim()));
    if (commune) f.commune = commune;
  }
  return f;
}

/** A row as its page was read for: its page is read again when the list changes it. */
const signature = (r: Ligne) => [r.nom, r.type, r.debut, r.fin, r.lieu].join("|");
const seasonsOf = (now: Date) => {
  const y = now.getUTCFullYear();
  // From October, the next season's events are in its own list.
  return now.getUTCMonth() >= 9 ? [y, y + 1] : [y];
};

/** Whether the scheduled event at `now` (every 5 minutes) is one of those that may read a page. */
export const refreshDue = (now: Date) => (((now.getUTCMinutes() - REFRESH_OFFSET) % REFRESH_EVERY) + REFRESH_EVERY) % REFRESH_EVERY < 5;

/**
 * In the Worker's scheduled event: one page at most. A season's list when it is a day old, else the page of the first
 * event of the island not read yet (or whose row changed). What is read is merged into `before` and handed to `write`;
 * nothing is written when nothing was due. Returns what was done, for the logs; throws after writing when the read
 * failed.
 */
export async function refresh(before: Etat | null, write: (etat: Etat) => Promise<void>, now = new Date()): Promise<string> {
  const t = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const etat: Etat = { listes: { ...before?.listes }, candidates: [...(before?.candidates ?? [])], fiches: { ...before?.fiches }, essai: t, ...(before?.lu ? { lu: before.lu } : {}) };
  const saison = seasonsOf(now).find((s) => !(t - (etat.listes[s] ?? 0) < LIST_HOURS * HOUR));
  const pending = etat.candidates
    .filter((r) => r.fin >= today && etat.fiches[r.codex]?.ligne !== signature(r))
    .sort((a, b) => a.debut.localeCompare(b.debut))[0];
  if (saison == null && !pending) return "rien à lire";
  try {
    let done: string;
    if (saison != null) {
      const rows = parseListe(await getText(SOURCE.id, listUrl(saison), TIMEOUT_MS));
      etat.listes[saison] = t;
      // The rows of the other seasons kept; this season's replaced by what its list says now.
      const others = etat.candidates.filter((r) => !r.debut.startsWith(`${saison}-`));
      etat.candidates = [...others, ...candidates(rows, today).filter((r) => r.debut.startsWith(`${saison}-`))];
      done = `saison ${saison} : ${rows.length} épreuves, ${etat.candidates.length} à La Réunion ou d'un lieu du même nom`;
    } else {
      const fiche = parseFiche(await getText(SOURCE.id, ficheUrl(pending!.codex), TIMEOUT_MS));
      etat.fiches[pending!.codex] = { ...fiche, ligne: signature(pending!), lue: t };
      done = `fiche ${pending!.codex} : ${fiche.commune ?? `hors de l'île (${fiche.cp ?? "sans code postal"})`}`;
    }
    // The pages of the events no longer listed, or over, are forgotten.
    const listed = new Set(etat.candidates.filter((r) => r.fin >= today).map((r) => r.codex));
    for (const codex of Object.keys(etat.fiches)) if (!listed.has(codex)) delete etat.fiches[codex];
    etat.candidates = etat.candidates.filter((r) => r.fin >= today);
    etat.lu = t;
    await write(etat);
    return done;
  } catch (err) {
    etat.echec = { at: t, ...(err instanceof UpstreamError && err.status ? { status: err.status } : {}), message: err instanceof Error ? err.message : String(err) };
    await write(etat);
    throw err;
  }
}

/** « Compétition officielle - Ocean Racing / Va'a - International » → « Ocean Racing / Va'a, international ». */
export function detailOf(caracteristiques: string | undefined, type: string): string | undefined {
  const parts = (caracteristiques ?? type).split(" - ").map((s) => s.trim()).filter(Boolean);
  const [, ...rest] = parts;
  const out = rest.map((s, i) => (i ? s.charAt(0).toLowerCase() + s.slice(1) : s)).join(", ");
  return out || undefined;
}

/** The events of the island the state holds: only those whose page was read with a postcode of the island. */
export function epreuvesDe(etat: Etat): Epreuve[] {
  return etat.candidates
    .flatMap((r) => {
      const f = etat.fiches[r.codex];
      if (!f || f.ligne !== signature(r) || !f.cp?.startsWith("974") || !f.commune) return [];
      const detail = [detailOf(f.caracteristiques, r.type), f.organisateur ? `organisée par ${f.organisateur}` : ""].filter(Boolean).join(", ");
      return [{ sport: "canoë-kayak" as const, nom: r.nom, debut: r.debut, fin: r.fin, lieu: f.adresse, commune: f.commune, ...(detail && { detail }), lien: ficheUrl(r.codex) }];
    })
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.nom.localeCompare(b.nom));
}

let reader: (() => Promise<Etat | null>) | undefined;

/** In the Worker: read the state from the KV store, where the scheduled event writes it. */
export function configure(read: (() => Promise<Etat | null>) | undefined) {
  reader = read;
}

/** The island's events, from the state the scheduled event keeps, dated by its last read: none outside the Worker. */
export async function epreuves(cache: Cache): Promise<Cached<Epreuve[]>> {
  const got = await cache.get(KEY, READ_SECONDS, async () => {
    const v = reader ? await reader() : null;
    if (!v?.candidates || !v.lu) throw new UpstreamError(SOURCE.id, "calendrier de la FFCK absent du stockage");
    return v;
  });
  return { ...got, value: epreuvesDe(got.value), fetchedAt: new Date(got.value.lu!) };
}
