/**
 * The events' pages, their light part (web/fiche-evenement.ts renders them): the address of an event's page, its key
 * read back from one, its last day, and the register of the events seen, written by buildAgenda (web/data.ts). Kept
 * apart so that data.ts and domains.ts import it without the pages' modules.
 */
import type { AgendaAnswer } from "./data.js";
import { slugify } from "./places.js";

export type Row = NonNullable<AgendaAnswer["evenements"]>[number];

/** The end of an event's day, local, from the words of its row (« de 19:30 à 22:00 », « du … au dimanche 15/11 »). */
export function agendaEnd(r: Pick<Row, "date" | "quand">): string | undefined {
  // A day without an hour: it ends that day (« samedi 24/10 »); an hour without its end says no end.
  if (/^\d{4}-\d\d-\d\d$/.test(r.date) && !r.quand.startsWith("du ")) return r.date;
  const span = /de \d\d:\d\d à (\d\d:\d\d)$/.exec(r.quand);
  if (span && r.date.length > 10) return `${r.date.slice(0, 10)}T${span[1]}`;
  const until = /^du .* au \S+ (\d\d)\/(\d\d)(?: à (\d\d:\d\d))?$/.exec(r.quand);
  if (!until) return undefined;
  const [, dd, mm, time] = until;
  const y = Number(r.date.slice(0, 4)) + (`${mm}-${dd}` < r.date.slice(5, 10) ? 1 : 0);
  return `${y}-${mm}-${dd}${time && r.date.length > 10 ? `T${time}` : ""}`;
}

/** The register's key in the durable store, its one writer buildAgenda (web/data.ts). */
export const FICHES = "evenements:fiches";
/** How long an event over keeps its page (marketing, 20/11/2026). */
export const PASSE_JOURS = 30;
/** How long its key is remembered after that, its address answering 410 rather than 404. */
export const PARTI_JOURS = 365;
/** The register is written at most once an hour, whatever the number of builds (one a data center). */
export const FICHES_EVERY_MS = 3600_000;

/** What the register keeps of an event: enough for the page of an event over, and the day it last changed. */
export interface Fiche {
  f: string;
  titre: string;
  /** Its first day, local « 2026-11-21 » or « 2026-11-21T19:30 », and its last when it says one. */
  date: string;
  fin?: string;
  quand: string;
  lieu?: string;
  commune?: string;
  lien?: string;
  publie_par: string;
  /** It has a text of its own: indexed while to come. */
  texte: boolean;
  /** The day (local) its row last changed, the sitemap's <lastmod>; `sig` tells the change. */
  modifie: string;
  sig: string;
}

/** What is left of an event over for more than PASSE_JOURS: its key and its last day, for its address to say gone (410). */
export interface Partie {
  f: string;
  fin: string;
  parti: true;
}

/** An entry of the register: an event with its page, or the key of one gone. */
export type Entree = Fiche | Partie;

/** An event the register still has a page for. */
export const vivante = (x: Entree): x is Fiche => !("parti" in x);

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
};

/** The page's address: its title in a slug, cut at a word under 70 characters, then its key. */
export function fichePath(r: { titre: string; fiche?: string; f?: string }): string {
  const f = r.fiche ?? r.f!;
  let slug = slugify(r.titre);
  if (slug.length > 70) slug = slug.slice(0, 71).replace(/-[^-]*$/, "");
  return `/evenements/${slug ? `${slug}-` : ""}${f}`;
}

/** The key in an address of an event's page, or undefined: /evenements/<slug>-<8 hex>. */
export function ficheOf(path: string): string | undefined {
  return /^\/evenements\/(?:[a-z0-9-]+-)?([0-9a-f]{8})\/?$/.exec(path)?.[1];
}

/** The last day of an event, local: its end when its row says one, else its first day. */
export const dernierJour = (r: { date: string; quand: string }) => (agendaEnd(r) ?? r.date).slice(0, 10);

/** Days between two local days « 2026-11-21 ». */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

/**
 * The register after a build: each event of the copy, its `modifie` kept while its row does not change (what is read
 * again each hour, the time of the reading, is left out); the events no longer listed kept until PASSE_JOURS after
 * their last day, then their key alone until PARTI_JOURS more.
 */
export function registre(prev: Entree[] | undefined, rows: Row[], today: string): Entree[] {
  const before = new Map((prev ?? []).filter(vivante).map((x) => [x.f, x]));
  const out = new Map<string, Entree>();
  for (const r of rows) {
    if (!r.fiche || out.has(r.fiche)) continue;
    const sig = hash(JSON.stringify([r.titre, r.date, r.quand, r.lieu, r.commune, r.prix, r.statut, r.description, r.lien, r.billetterie, r.autres_dates]));
    const old = before.get(r.fiche);
    const fin = dernierJour(r);
    out.set(r.fiche, {
      f: r.fiche, titre: r.titre, date: r.date, ...(fin !== r.date.slice(0, 10) ? { fin } : {}), quand: r.quand,
      ...(r.lieu ? { lieu: r.lieu } : {}), ...(r.commune ? { commune: r.commune } : {}), ...(r.lien ? { lien: r.lien } : {}),
      publie_par: r.publie_par, texte: !!r.description?.trim(), modifie: old?.sig === sig ? old.modifie : today, sig,
    });
  }
  for (const x of prev ?? []) {
    if (out.has(x.f)) continue;
    const fin = vivante(x) ? (x.fin ?? x.date.slice(0, 10)) : x.fin;
    const age = daysBetween(fin, today);
    if (age <= PASSE_JOURS && vivante(x)) out.set(x.f, x);
    else if (age <= PASSE_JOURS + PARTI_JOURS) out.set(x.f, { f: x.f, fin, parti: true });
  }
  return [...out.values()];
}

/** What an event's address answers, from the copy of /evenements (none yet: undefined) and the register. */
export type Issue =
  | { page: Row }
  | { vers: string }
  | { passee: Fiche }
  | { statut: 404 | 410 | 503 };

/**
 * An event's address, `fiche` its key: its page while the copy lists it; then, from the register, the page saying it
 * took place for PASSE_JOURS, gone (410) for PARTI_JOURS after; gone also for an event to come no agenda announces any
 * more. An address with another title is sent on to the page's own (301). Without the copy, an event the register
 * does not say over cannot be told: come back (503), never « over » for one that may be on. A key never seen: 404.
 */
export function ficheIssue(path: string, fiche: string, rows: Row[] | undefined, kept: Entree[] | undefined, today: string): Issue {
  const bare = path.replace(/\/$/, "");
  const r = rows?.find((x) => x.fiche === fiche);
  if (r) return bare === fichePath(r) ? { page: r } : { vers: fichePath(r) };
  const x = kept?.find((y) => y.f === fiche);
  if (x && !vivante(x)) return { statut: 410 };
  if (x && (x.fin ?? x.date.slice(0, 10)) < today) return bare === fichePath(x) ? { passee: x } : { vers: fichePath(x) };
  if (!rows) return { statut: 503 };
  return { statut: x ? 410 : 404 };
}

/**
 * The sitemap's events: to come and with a text of their own, with the day their row last changed. With the copy of
 * /evenements (`rows`), only those it lists: an event to come no agenda announces any more answers 410 (ficheIssue),
 * and stays out as well.
 */
export function ficheUrls(fiches: Entree[] | undefined, today: string, rows?: Pick<Row, "fiche">[]): [string, string][] {
  const listed = rows && new Set(rows.map((r) => r.fiche));
  return (fiches ?? []).filter(vivante)
    .filter((x) => x.texte && (x.fin ?? x.date.slice(0, 10)) >= today && (!listed || listed.has(x.f)))
    .map((x) => [fichePath(x), x.modifie]);
}

