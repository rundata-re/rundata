/**
 * The prefecture's releases as a machine of the project reads them (scripts/prefecture.ts, every 15 minutes), stored in
 * the Worker's KV: the prefecture's site cuts the connection of Cloudflare's Workers (HTTP 520 to nearly every read from
 * 13:14 to 16:06 on 28/10/2026), while it answers that machine. In the Worker, the news (providers/actualites.ts), the
 * subjects of the releases (providers/prefecture.ts) and the pages of the volcano's releases (providers/volcan.ts) read
 * these copies, never the site. Elsewhere (a local server, the tests), nothing is configured and they read the site.
 */
import type { Info } from "./actualites.js";
import type { Page } from "./volcan.js";

/** Written by scripts/prefecture.ts, read by worker.ts. */
export const KV_KEY = "prefecture:communiques:collecte";
/** Kept in the store this long after the collector's last write: the readers say how old it is, and stop at 48 h (actualites). */
export const KV_TTL_SECONDS = 7 * 86_400;

export interface Copie {
  /** The latest releases, newest first. */
  liste: Info[];
  /** The cyclone's section, linked by the menu, did not answer: its releases are missing from `liste`. */
  rubrique_non_lue?: true;
  /**
   * The record of the volcano's alerts (RELEVE_KV_KEY) as the collector read it before this run, carried here so that
   * the Worker reads it with the list, without a read of its own.
   */
  releve?: ReleveEntree[];
  /** When the collector read the site (ISO, UTC). */
  lu_le: string;
}

/**
 * The collector writes every 15 minutes: a copy older than two of its runs and a margin was not renewed, and is said
 * with its time as the copy of a site that did not answer since.
 */
export const SILENT_MS = 40 * 60_000;

/**
 * The page of a release the volcano's phase is read from (providers/volcan.ts `doubtful`, then the release in force),
 * as the collector read it, under `pageKey` of its link: volcan.ts PageKept, its page always there.
 */
export interface PageCopie {
  page: Page;
  /** When the collector read the page (ms). */
  lu: number;
}

export const pageKey = (lien: string) => `prefecture:communique:collecte:${lien}`;
/**
 * A release's page is read again by the collector once its copy is this old, not at each of its runs: a page seldom
 * changes once published (« Mis à jour le »), and the site bans bursts.
 */
export const PAGE_AGAIN_MS = 24 * 3600_000;

let reader: (() => Promise<Copie | null>) | undefined;
let pageReader: ((lien: string) => Promise<PageCopie | null>) | undefined;

/** In the Worker: read the copies from the KV store, where scripts/prefecture.ts writes them, and the site never. */
export function configure(read: (() => Promise<Copie | null>) | undefined, readPage?: (lien: string) => Promise<PageCopie | null>) {
  reader = read;
  pageReader = read && readPage;
}

/** Whether the copy is what is read (the Worker), rather than the site. */
export const configured = () => reader !== undefined;

/** The stored copy; null when the store has none or nothing is configured. */
export async function copie(): Promise<Copie | null> {
  return reader ? reader() : null;
}

/** The stored copy of a release's page; null when the store has none or nothing is configured. */
export async function page(lien: string): Promise<PageCopie | null> {
  return pageReader ? pageReader(lien) : null;
}

/**
 * The releases about the volcano that declare a phase of its ORSEC plan, as the collector reads them in the list
 * (scripts/prefecture.ts), kept so that the alerts after the list written by hand (tools/volcan-historique.ts) are told
 * without anyone adding them: the list of the site keeps its latest 20 releases only. Only ever added to: an entry is
 * never removed nor written again, even if its page changes later. No expiry. Only the collector reads this key: it
 * copies the record into the list's copy (`Copie.releve`), which the Worker reads.
 */
export const RELEVE_KV_KEY = "volcan:alertes:releve";

/** A release kept: its list's words, as written. */
export interface ReleveEntree {
  /** The day of the release, La Réunion's, « 2026-10-24 ». */
  jour: string;
  /** Its title in the list, as written: the words quoted. */
  titre: string;
  lien: string;
  /** The phase its title declares (providers/volcan.ts `declared`): « Alerte 1 », « Vigilance »… */
  niveau: string;
  /** When the collector added it (ISO, UTC). */
  releve_le: string;
}

export interface Releve {
  entrees: ReleveEntree[];
  /** When the collector read the list it last added from (ISO, UTC). */
  lu_le: string;
}

/**
 * The record with the releases not yet in it, by their link: never an entry removed nor rewritten (the one kept wins,
 * even when the list now says otherwise). `added`: the entries new to it.
 */
export function ajouter(entrees: ReleveEntree[], found: Omit<ReleveEntree, "releve_le">[], now: Date): { entrees: ReleveEntree[]; added: ReleveEntree[] } {
  const known = new Set(entrees.map((e) => e.lien));
  const added: ReleveEntree[] = [];
  for (const f of found) {
    if (known.has(f.lien)) continue;
    known.add(f.lien);
    added.push({ jour: f.jour, titre: f.titre, lien: f.lien, niveau: f.niveau, releve_le: now.toISOString() });
  }
  return { entrees: [...entrees, ...added], added };
}
