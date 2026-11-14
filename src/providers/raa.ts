/**
 * The acts of the prefecture's « recueil des actes administratifs » (reunion.gouv.fr) that name a place of the island,
 * as a machine of the project reads them (scripts/raa.ts, every hour) and writes them to the Worker's KV store: the
 * prefecture's site cuts the connection of Cloudflare's Workers (prefecture-copie.ts). Their titles only, as the
 * prefecture publishes them, with their service, their recueil and their PDF, which is what is in force; a title that
 * may name a person was left out by the collector (scripts/raa-lire.ts) and is not in the store. In the Worker, the news
 * of a place (tools/actualites.ts) reads them; elsewhere nothing is configured and they are not given.
 */
import type { Cache, Cached } from "../cache.js";
import { normalize } from "../places/resolve.js";
import type { SourceInfo } from "../types.js";

export const SOURCE = {
  id: "prefecture_raa",
  nom: "Recueil des actes administratifs de la préfecture de La Réunion",
  organisme: "Préfecture de La Réunion",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Préfecture de La Réunion",
  url: "https://www.reunion.gouv.fr/Publications/Publications-administratives-et-legales/Recueil-des-actes-administratifs",
} satisfies SourceInfo;

/** Written by scripts/raa.ts, read by worker.ts. */
export const KV_KEY = "prefecture:raa:collecte";
/**
 * Kept this long after the collector's last write, which is only when something changed: a week without a recueil
 * (holidays) must not empty the store. What is given is the last DAYS' anyway.
 */
export const KV_TTL_SECONDS = 30 * 86_400;
/** The recueils read and the acts given: those of the last 15 days. */
export const DAYS = 15;

export interface Recueil {
  /** « Spécial n° 222 du 03 novembre 2026 », « OCTOBRE ». */
  titre: string;
  numero?: number;
  /** Its day (YYYY-MM-DD): its title's, else its publication's. */
  date: string;
  /** Its page. */
  lien: string;
}

export interface Acte {
  /** As published (the PDF's name). */
  titre: string;
  service?: string;
  /** The day of its group in the recueil (YYYY-MM-DD). */
  date?: string;
  recueil: Pick<Recueil, "numero" | "date" | "lien">;
  pdf: string;
  /** What its title names, by the gazetteer's names (providers/actualites.ts `placesIn`). */
  communes: string[];
  lieux: string[];
}

/**
 * The newest drought order (« arrêté sécheresse », « usages de l'eau ») the collector has seen in a recueil, its title
 * as published: only to say that it exists and is not taken into account yet (tools/secheresse.ts), never its levels.
 * Kept from run to run, past DAYS: the levels are written by hand (providers/arrete-secheresse.ts), maybe later.
 */
export interface ArreteSecheresse {
  titre: string;
  /** « 2026-2094 », when the title gives it. */
  numero?: string;
  /** Signed, from the title (« du 12 novembre 2026 »), YYYY-MM-DD. */
  signe_le: string;
  recueil: Pick<Recueil, "titre" | "numero" | "date" | "lien">;
  pdf: string;
}

export interface Copie {
  /** The acts of the recueils read, of the last DAYS, that name a place: newest recueil first. */
  actes: Acte[];
  /** The recueils read (their page), newest first, with the number of their acts read and kept. */
  recueils: (Recueil & { actes: number; gardes: number })[];
  /**
   * The day of the oldest recueil read with none unread after it, when the recueils read do not cover the last DAYS:
   * recueils left to read (the site silent for hours), or more recueils in those days than page 1 of the list holds.
   * What is said absent is said of the recueils since that day.
   */
  lus_depuis?: string;
  /** The newest drought order seen, whatever the place it names (ArreteSecheresse). */
  secheresse?: ArreteSecheresse;
  /** When the collector wrote it (ISO, UTC): a run that changes nothing does not write. */
  lu_le: string;
}

let reader: (() => Promise<Copie | null>) | undefined;

/** In the Worker: read the copy from the KV store, where scripts/raa.ts writes it. */
export function configure(read: (() => Promise<Copie | null>) | undefined) {
  reader = read;
}

/**
 * How long a copy read from the store is served before it is read again: the collector writes at most once an hour, and
 * a recueil is read the hour after it is published at best.
 */
const FRESH_SECONDS = 15 * 60;

/** The stored copy, read only when the news of a place is asked; null where nothing is configured or stored. */
export async function copie(cache: Cache): Promise<Cached<Copie> | null> {
  if (!reader) return null;
  const read = reader;
  try {
    return await cache.getCopy("raa:copie", FRESH_SECONDS, async () => {
      const v = await read();
      if (!v) throw new Error("recueil des actes administratifs absent du stockage");
      return v;
    }, (v) => v.lu_le, SOURCE.id);
  } catch {
    return null;
  }
}

/**
 * The acts of the last DAYS that name `commune`, or `place` (normalized, as tools/actualites.ts looks for it), newest
 * recueil first.
 */
export function actesDe(c: Copie, commune: string | undefined, place: string | undefined, now: Date): Acte[] {
  const since = new Date(now.getTime() + 4 * 3600_000 - DAYS * 86_400_000).toISOString().slice(0, 10);
  return c.actes.filter((a) => a.recueil.date >= since && ((!!commune && a.communes.includes(commune)) ||
    (!!place && ` ${normalize(`${a.lieux.join(" ")} ${a.titre}`)} `.includes(` ${place} `))));
}
