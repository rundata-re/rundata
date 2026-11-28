import { isScheduled, later, left, perInvocation } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import { type Lecture, noteLecture, withLectures } from "../lectures.js";
import { holidays } from "../feries.js";
import { inReunion, localTime } from "../geo.js";
import { httpUrl, patiently, places, siteAskedAgo, siteSpacing, spacedSite, versBilletterie, whenPlaced } from "../http.js";
import { INSEE } from "../places/insee.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import type { Fil } from "../providers/actualites.js";
import * as src from "../providers/agenda.js";
import { names, THEMES, W } from "../providers/agenda-mots.js";
import { withNews } from "../providers/agenda-presse.js";
import { evenements as relies, ID as CONNECTEURS_ID } from "../providers/agenda-connecteurs.js";
import { evenements as proposes, ID as PROPOSITIONS_ID } from "../providers/agenda-propositions.js";
import { SOURCE as SALLES_SOURCE, titleKey } from "../providers/salles.js";
import { type SourceInfo, UpstreamError, why } from "../types.js";
import { mesure } from "../web/mesure.js";
import { annonceAppel, appelAuPublic } from "./appel.js";
import { casse } from "./casse.js";
import { a, credits, de, enumeration, notFound, placeBlock, text } from "./format.js";
import { type Injoignable, injoignable } from "./injoignable.js";
import { mentionReunionFr, mentionSalles, mentionSports, RESUME_REUNION_FR } from "./non-repris.js";
import { quand as dayText, derniereLecture, duAu } from "./sport.js";
import { rienTrouve } from "../vide.js";
import { MARKET } from "./marches.js";
import { marchesDuJour } from "../vie/marches.js";

// The markets held each week are in the directory, not in an agenda (04/11/2026: « marché » at Saint-Paul, none found).
export const MARCHES_REGULIERS = "Les marchés forains et couverts réguliers, avec leurs jours et horaires, sont dans annuaire_services_publics (quoi = «\u00a0marché\u00a0»).";

export const AHEAD_DAYS = 14;
const SOON_DAYS = 30;
const LISTED = 40;
// The tool's answer: 25 events (40 were 22 KB of a 30 KB answer, 5/11/2026); the cancelled or postponed ones are all
// named in its summary all the same. The pages keep LISTED.
export const LISTED_OUTIL = 25;
const NEXT_MAX = 4;
const ELSEWHERE_MAX = 6;
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const localDay = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
/** Days an occurrence spans: 0 for a single day. */
const spanDays = (s: { debut: string; fin?: string }) => (Date.parse(`${(s.fin ?? s.debut).slice(0, 10)}T00:00:00Z`) - Date.parse(`${s.debut.slice(0, 10)}T00:00:00Z`)) / 86400_000;
// Longer than this, an occurrence is a season (« ateliers en octobre », an exhibition), told after the dated events.
const LONG_DAYS = 7;

export interface Periode {
  du: string;
  au: string;
  /** Only what runs in the evening (« ce soir », « samedi soir »). */
  soir: boolean;
  /** « ce week-end », « demain » : how the answer says it. */
  nom: string;
  /** The question's `quand` was not understood, so the default period is given. */
  incompris?: boolean;
  /** From when its first day counts, a weekend's Friday: « 17:00 ». */
  vendredi?: string;
}

export interface Weekend {
  /** The days, from Friday (or the holiday before it) to Sunday (or the holiday after it), local. */
  du: string;
  au: string;
  /** From when the Friday counts: 17:00, or the whole day when it is a holiday. */
  vendredi?: string;
  /** The holidays among those days. */
  feries: Map<string, string>;
}

/**
 * The weekend people mean: Friday from 17:00 to Sunday night, the coming one from Monday on. A holiday on the Friday
 * or the Monday next to it belongs to it (the 1st of November on a Sunday already does). The tool and the page
 * /evenements/ce-week-end both count it so.
 */
export function weekend(now: Date): Weekend {
  const today = localDay(now);
  const year = Number(today.slice(0, 4));
  const off = new Map([...holidays(year - 1), ...holidays(year), ...holidays(year + 1)]);
  const wd = weekday(today);
  // A holiday Monday is still the weekend that ends with it.
  const friday = wd === 1 && off.has(today) ? addDays(today, -3) : addDays(today, wd === 0 ? -2 : wd === 6 ? -1 : 5 - wd);
  const monday = addDays(friday, 3);
  const du = friday, au = off.has(monday) ? monday : addDays(friday, 2);
  const feries = new Map([...off].filter(([d]) => d >= du && d <= au));
  return { du, au, vendredi: off.has(friday) ? undefined : "17:00", feries };
}

/**
 * The days a question means. This weekend is `weekend()`'s, Friday from 17:00 to Sunday with the holidays next to it,
 * from today when it has begun; a weekday is the next one, today included; a date is « 2026-10-31 », « 31/10 » or
 * « 31/10/2026 ». Without `quand`, the next two weeks.
 */
export function periode(q: string | undefined, now: Date): Periode {
  const today = localDay(now);
  const t = normalize(q ?? "").replace(/_/g, " ");
  const soir = /\bsoir|nuit|tonight|evening/.test(t);
  const span = (du: string, au: string, nom: string): Periode => ({ du, au, soir, nom });
  if (!t) return span(today, addDays(today, AHEAD_DAYS), "dans les deux semaines qui viennent");
  if (/aujourd|ce soir|cette nuit|today|tonight/.test(t)) return span(today, today, soir ? "ce soir" : "aujourd'hui");
  if (/apres demain/.test(t)) return span(addDays(today, 2), addDays(today, 2), soir ? "après-demain soir" : "après-demain");
  if (/demain|tomorrow/.test(t)) return span(addDays(today, 1), addDays(today, 1), soir ? "demain soir" : "demain");
  if (/week ?end/.test(t)) {
    const wd = weekday(today);
    // « le week-end prochain » said from Friday on is the following one; earlier in the week, the coming one.
    const next = /prochain|suivant|next/.test(t) && (wd === 5 || wd === 6 || wd === 0);
    const w = weekend(next ? new Date(now.getTime() + 7 * 86400_000) : now);
    const du = [w.du, today].sort()[1];
    return { ...span(du, w.au, next ? "le week-end prochain" : "ce week-end"), vendredi: du === w.du ? w.vendredi : undefined };
  }
  if (/semaine prochaine|next week/.test(t)) {
    const monday = addDays(today, ((8 - weekday(today)) % 7) || 7);
    return span(monday, addDays(monday, 6), "la semaine prochaine");
  }
  if (/semaine|week/.test(t)) return span(today, addDays(today, (7 - weekday(today)) % 7), "cette semaine");
  if (/mois|month|a venir|prochainement|bientot|upcoming/.test(t)) return span(today, addDays(today, SOON_DAYS), "dans les trente jours qui viennent");
  const wd = DAYS.findIndex((d) => t.includes(d));
  if (wd >= 0) {
    const day = addDays(today, (wd - weekday(today) + 7) % 7);
    return span(day, day, `${dayText(day)}${soir ? " soir" : ""}`);
  }
  const iso = /(20\d\d)-(\d\d)-(\d\d)/.exec(q ?? "");
  const dm = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d\d))?\b/.exec(q ?? "");
  if (iso || dm) {
    let day = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${dm![3] ?? today.slice(0, 4)}-${dm![2].padStart(2, "0")}-${dm![1].padStart(2, "0")}`;
    if (!iso && !dm![3] && day < today) day = `${Number(day.slice(0, 4)) + 1}${day.slice(4)}`;
    if (!Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return span(day, day, `${dayText(day)}${soir ? " soir" : ""}`);
  }
  return { ...span(today, addDays(today, AHEAD_DAYS), "dans les deux semaines qui viennent"), incompris: true };
}

/**
 * « samedi 24/10 de 14:00 à 18:00 », « du vendredi 23/10 au dimanche 25/10 », « mercredi 28/10 » ; both years when the
 * period runs over two: « du samedi 23/05/2026 au samedi 22/05/2027 ».
 */
export function when(s: src.Seance): string {
  const time = (x: string) => x.slice(11, 16);
  const end = s.fin;
  if (!end) return s.debut.length > 10 ? `${dayText(s.debut.slice(0, 10))} à ${time(s.debut)}` : dayText(s.debut);
  if (end.slice(0, 10) === s.debut.slice(0, 10)) {
    return s.debut.length > 10 ? `${dayText(s.debut.slice(0, 10))} de ${time(s.debut)} à ${time(end)}` : dayText(s.debut);
  }
  return duAu(s.debut, end, (x, annee) => (x.length > 10 ? `${dayText(x.slice(0, 10), annee)} à ${time(x)}` : dayText(x, annee)));
}

// A workshop, a meeting or a talk is not a show, whatever it is about (« Atelier théâtre », « PROJET TRAIN : Atelier »).
const SHOWS = new Set(["concert", "théâtre", "danse", "humour", "cirque", "conte", "magie", "marionnettes", "soirée"]);

const STOP = new Set(["des", "les", "une", "pour", "avec", "quoi", "faire", "sortir", "evenement", "evenements", "sortie", "sorties", "agenda"]);

/** How `quoi` is understood: themes, or else words that must all be in the event. */
// The venue's name is left out of the genre: a concert at the « Théâtre Luc Donat » is not a play.
/**
 * The source's categories, unless it ticked a whole list: « Culture, Education, Enquête, Santé, Sport » made the
 * Dipavali of Les Trois-Bassins a sport (audit of 04/11/2026). Its title and text say then what it is.
 */
const CATEGORIES_MAX = 3;
const categoriesOf = (e: src.Evenement) => (e.categories.length > CATEGORIES_MAX ? [] : e.categories);
const about = (e: src.Evenement) => `${e.titre} ${categoriesOf(e).join(" ")} ${e.description ?? ""}`.toLowerCase();
const body = (e: src.Evenement) => `${about(e)} ${e.lieu ?? ""}`.toLowerCase();
// What the title and the source's own category say comes first: « Concert » at Bisik is a concert even if the text
// mentions a dance contest.
const head = (e: src.Evenement) => `${e.titre} ${categoriesOf(e).join(" ")}`.toLowerCase();

const kindsOf = (text: string) => THEMES.filter((t) => names(t, text)).map((t) => t.genre);
/** The genres of its title, categories and first sentence, and those the rest of its text named (`themes`), in THEMES' order. */
const aboutKinds = (e: src.Evenement) => {
  const found = new Set([...kindsOf(about(e)), ...(e.themes ?? [])]);
  return THEMES.map((t) => t.genre).filter((g) => found.has(g));
};
/** Without the shows' genres when the title or the source's category say workshop, meeting, talk or market. */
// A market too, but for a show its title or category names (« Concert au marché de Noël »): 20/11/2026, the
// Christmas market of Le Port's galleries answered « concert » from its page's text.
const unlessWorkshop = (e: src.Evenement, list: string[]) => {
  const own = kindsOf(head(e));
  if (own.includes("atelier")) return list.filter((g) => !SHOWS.has(g));
  return own.includes("marché") ? list.filter((g) => !SHOWS.has(g) || own.includes(g)) : list;
};

/** The genres of an event, for the page's filter: from its title and categories, else its description. */
export function genres(e: src.Evenement): string[] {
  const own = kindsOf(head(e));
  return unlessWorkshop(e, own.length ? own : aboutKinds(e).slice(0, 2));
}

/** Every genre an event may answer to, its description included. */
const kinds = (e: src.Evenement) => new Set(unlessWorkshop(e, aboutKinds(e)));

export function matcher(quoi: string | undefined): { nom?: string; test: (e: src.Evenement) => boolean } | null {
  const q = normalize(quoi ?? "");
  if (!q) return null;
  // « spectacle » asks every kind of show; a precise word (« théâtre », « danse ») only its own.
  const themes = THEMES.filter((t) => t.demande.test(q) && (!/spectacle/.test(q) || t.demande.source.includes("spectacle")));
  const show = /spectacle/.test(q);
  const asked = new Set(themes.map((t) => t.genre));
  if (themes.length) {
    return {
      nom: show && themes.length > 1 ? "spectacles" : themes.map((t) => t.nom).join(", "),
      test: (e) => {
        const k = kinds(e);
        return [...k].some((g) => asked.has(g)) || (show && !k.has("atelier") && W("spectacles?").test(about(e)));
      },
    };
  }
  const words = q.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  if (!words.length) return null;
  return { nom: `« ${quoi!.trim()} »`, test: (e) => words.every((w) => normalize(body(e)).includes(w)) };
}

// `nonServie`: an agenda of the scheduled event whose copy is not served, and why (src.nonServie).
type Got = {
  agenda: src.Agenda;
  value?: Cached<src.Evenement[]>;
  nonServie?: ReturnType<typeof src.nonServie>;
  /** Its copy served, but its readings failed since (src.echecDepuis). */
  echec?: ReturnType<typeof src.echecDepuis>;
  /** Not read this time for want of subrequests: left to the next question, not silent. */
  remise?: true;
};

// An answer does not wait longer for the slowest of the agendas: one still loading is answered from its last copy, or
// left out and named, and stored once it lands, after the response.
const DEADLINE_MS = 5_000;
// An agenda with a copy kept is waited for only that long: past it, its copy is served, with the time it was read, and
// its reading lands after the response, for the next view. One slow site (Le Séchoir, reunion.fr) made each cold view
// wait the whole DEADLINE_MS, 6 to 7 s. An agenda without a copy is still waited for up to DEADLINE_MS, unless its last
// reading failed (`echec`): a site that keeps failing made each cold view wait for its failure, 2.6 s on /enfants.
// In the scheduled event, which nobody waits for, both count from when the agenda's first fetch gets its place
// (http.ts): the agendas queued behind five slow ones were cut there at 5 s without having been asked. There, an agenda
// without a copy is not cut at all, its reading's own delay bounds it: its copy is kept in the data center where the
// event runs, not where the views are, and Le Séchoir, cut at 5 s at every hourly reading of 26/10, never had one
// there, so the count of the events (chiffres.ts) went without it.
const GRACE_MS = 1_000;
// In the scheduled event, which nobody waits for, each fetch of an agenda is given that long whatever its own delay
// (http.ts, `patiently`): having the data matters more than the time. A slow site holds one of the five places that
// long at most; the others wait for their turn without being cut, their delay counting from their place.
const PATIENT_MS = 30_000;
// There too, a reading cut by its delay or by a server's error (5xx) is tried once more, but none past that long after
// the agendas began: the event must end before the next one, 5 minutes on (2 to 3 minutes at worst, ten sites down).
const RETRY_WINDOW_MS = 120_000;
// The scheduled event's own agendas (`refreshPlanned`), read one after the other, each fetch given PATIENT_MS: none begun
// past that long after the first, so that the last ends 3 minutes after it at worst (L'Étang-Salé: its list, then its
// pages at once, 30 s each), before the next event; the others are left for it (`reportes`), each said in the log.
const PLANNED_WINDOW_MS = 120_000;
// The subrequests not to be spent on the agendas: what follows them (the news's copy, the bundle's write, the page's
// copy) and one more, within the invocation's budget (budget.ts); for a question, that one is the read of the scheduled
// event's copies in KV, once a minute. An agenda past them is answered from its last copy, or named, and read by a
// later question.
const KEEP_LEFT = 4;

// How long what an agenda keeps beside its copy stays in the bundle once no longer read: twice the week a page of
// L'Étang-Salé's agenda is kept (src.ETANG_SALE_PAGE_SECONDS).
const ANNEXE_MS = 2 * src.ETANG_SALE_PAGE_SECONDS * 1000;

// How often the scheduled event reads its agendas again, unless an agenda says otherwise (`relecture`).
const PLANNED_FRESH_SECONDS = 3600;

// The hour in which an agenda with a `decalage` is read again.
const PLANNED_WINDOW_SECONDS = 3600;

/**
 * Whether a planned agenda whose copy (or last failure) is `ageMs` old is read again now: once it is as old as its
 * `relecture`; with a `decalage`, only within its hour, and only if the copy is older than that hour's start.
 */
export function plannedDue(agenda: src.Agenda, ageMs: number, now: Date): boolean {
  const every = agenda.relecture ?? PLANNED_FRESH_SECONDS;
  if (agenda.decalage == null) return ageMs >= every * 1000;
  const into = (((now.getTime() - agenda.decalage * 1000) % (every * 1000)) + every * 1000) % (every * 1000);
  return into < PLANNED_WINDOW_SECONDS * 1000 && ageMs > into;
}

/** How long a planned agenda whose copy is `ageMs` old has been due, ms (negative before). */
export function dueSince(agenda: src.Agenda, ageMs: number, now: Date): number {
  const every = (agenda.relecture ?? PLANNED_FRESH_SECONDS) * 1000;
  if (agenda.decalage == null) return ageMs - every;
  return (((now.getTime() - agenda.decalage * 1000) % every) + every) % every;
}

// A planned agenda whose site this event asked less than a minute before (its water, its power cuts, another of its
// agendas: http.ts `sharedSite`) is read at the next event rather than wait for its turn, once: due for longer than
// this, an event has gone by since it was, and it is read in this one after its turn (http.ts waits for it).
const REPORT_MS = 4 * 60_000;

// When a planned agenda last failed (or found nothing where its copy had events), kept in the bundle beside its copy:
// it is not tried again before its next reading is due, rather than at each scheduled event, for a subrequest and up
// to TIMEOUT_MS each time (Saint-Joseph's site does not answer Cloudflare's addresses). In the bundle, not in memory:
// the scheduled events seldom run twice in the same isolate. An agenda read by the questions has the same mark in
// theirs, set on the first failure only and dropped by the first reading that lands.
const echec = src.echecPlanifie;

/** An agenda this invocation has no subrequests left for, and of which no copy is kept. */
class Postponed extends Error {}

/** A reading cut by its delay, or a server's error (5xx): worth one more try. A refusal (4xx), a page misread, are not. */
function retryable(err: unknown): boolean {
  if (err instanceof UpstreamError && err.status) return err.status >= 500;
  // Cut while waiting for the headers (an UpstreamError without status), or while reading the body (the bare error).
  return err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(err.message));
}

/** Every agenda, read in parallel, once per invocation; one that fails, is too slow or is left for later is named. */
export function gather(cache: Cache, now: Date, deadlineMs = DEADLINE_MS, graceMs = GRACE_MS): Promise<Got[]> {
  return perInvocation("agenda:gather", () => read(cache, now, deadlineMs, graceMs));
}

async function read(cache: Cache, now: Date, deadlineMs: number, graceMs: number): Promise<Got[]> {
  const started = Date.now();
  const bundle = await cache.bundle(src.BUNDLE, src.BUNDLE_SYNC_SECONDS);
  const key = (a: src.Agenda) => `agenda:${a.id}`;
  const last = (k: string): Cached<src.Evenement[]> | undefined => {
    const e = bundle.peek(k);
    return e && { value: e.value as src.Evenement[], fetchedAt: new Date(e.fetchedAt), stale: true };
  };
  let allowed = left() - KEEP_LEFT;
  // Once the agendas' share is set: this read is KEEP_LEFT's one more.
  const planifiees = await src.planifiees(cache);
  // The subrequests go first to the agendas without a copy, then to the oldest. Those of the scheduled event are never
  // read here (not this invocation's to read): their copy while young enough, else nothing, and why said with the answer
  // (`nonServie`). Their copies are in KV (src.PLANIFIES), written by the scheduled event only.
  const age = (a: src.Agenda) => bundle.peek(key(a))?.ageMs ?? Infinity;
  const order = src.AGENDAS.filter((a) => !a.planifie).sort((x, y) => age(y) - age(x));
  const planned = src.AGENDAS.filter((a) => a.planifie).map((agenda): Got => ({ agenda, value: src.copiePlanifiee(planifiees, agenda), nonServie: src.nonServie(planifiees, agenda), echec: src.echecDepuis(planifiees, agenda) }));
  // The keys each agenda reads, so that one more try forgets the failures remembered under them (cache.ts).
  const keys = new Map<src.Agenda, Set<string>>();
  const store = (a: src.Agenda): src.AgendaStore => ({
    get: <T>(k: string, freshSeconds: number, load: () => Promise<T>) => {
      keys.set(a, (keys.get(a) ?? new Set()).add(k));
      const hit = bundle.peek(k);
      if (hit && hit.ageMs < freshSeconds * 1000) return bundle.get(k, freshSeconds, load);
      if ((a.requetes ?? 1) <= allowed) {
        allowed -= a.requetes ?? 1;
        return bundle.get(k, freshSeconds, load);
      }
      const old = last(k);
      return old ? Promise.resolve(old as Cached<T>) : Promise.reject(new Postponed(`${a.nom} : plus assez de sous-requêtes`));
    },
  });
  const pending: Promise<unknown>[] = [];
  // A failure written once, not at each view; a reading that lands drops it (with its own write, already due).
  const failed = (a: src.Agenda) => {
    if (!bundle.has(echec(a))) bundle.set(echec(a), true);
  };
  const landed = (a: src.Agenda) => bundle.drop((k) => k !== echec(a));
  const fromPlace = isScheduled();
  const m = mesure();
  const agendasFrom = Date.now();
  m.avant = agendasFrom - started;
  // The scheduled event's reading: patient, and tried once more if it is cut or the server fails; each try in the logs.
  const patient = (agenda: src.Agenda) => {
    const load = () => patiently(PATIENT_MS, () => agenda.load(store(agenda), now));
    return load().catch((err) => {
      if (!retryable(err) || Date.now() - agendasFrom > RETRY_WINDOW_MS) throw err;
      for (const k of keys.get(agenda) ?? []) cache.forget(`${src.BUNDLE}|${k}`);
      return load().then(
        (got) => (console.log(`source ${agenda.source.id} (${agenda.id}) : nouvelle tentative après échec (${why(err)}), lue`), got),
        (again) => {
          console.error(`source ${agenda.source.id} (${agenda.id}) : nouvelle tentative après échec (${why(err)}), encore en échec (${why(again)})`);
          throw again;
        },
      );
    });
  };
  const got = await Promise.all(order.map(async (agenda): Promise<Got> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let start = () => {};
    const placed = new Promise<void>((resolve) => (start = resolve));
    const loading = fromPlace ? whenPlaced(() => patient(agenda), start) : agenda.load(store(agenda), now);
    if (!fromPlace) start();
    const kept = last(key(agenda));
    const wait = kept || bundle.has(echec(agenda)) ? Math.min(graceMs, deadlineMs) : deadlineMs;
    const late = fromPlace && !kept
      ? new Promise<"late">(() => {})
      : new Promise<"late">((resolve) => void placed.then(() => done || (timer = setTimeout(() => resolve("late"), wait))));
    try {
      const got = await Promise.race([loading, late]);
      if (got !== "late") {
        landed(agenda);
        return { agenda, value: got };
      }
      // Still stored once it lands: the next question has it.
      pending.push(loading.then(() => landed(agenda), (err) => {
        failed(agenda);
        console.error(`source ${agenda.source.id} (${agenda.id}) indisponible:`, why(err));
      }));
      const old = last(key(agenda));
      // Its last copy served, as planned, while the reading goes on: a line of the log, not an error, which would drown
      // the agendas that failed (six error lines in ten on 06/11/2026). Without a copy, nothing of it is shown: an error.
      if (old) console.log(`source ${agenda.source.id} (${agenda.id}) trop lente : dernière copie`);
      else console.error(`source ${agenda.source.id} (${agenda.id}) trop lente`);
      return { agenda, value: old };
    } catch (err) {
      if (err instanceof Postponed) {
        console.error(`source ${agenda.source.id} (${agenda.id}) remise à plus tard : plus assez de sous-requêtes`);
        return { agenda, remise: true };
      }
      failed(agenda);
      console.error(`source ${agenda.source.id} (${agenda.id}) indisponible:`, why(err));
      return { agenda };
    } finally {
      done = true;
      clearTimeout(timer);
    }
  }));
  m.agendas = Date.now() - agendasFrom;
  m.enCours = pending.length;
  m.places = places();
  // An agenda no longer read here is not kept (nor the scheduled event's copies, once kept in this bundle). What an
  // agenda keeps beside its copy (`agenda:<id>|…`, L'Étang-Salé's event pages) is kept while younger than ANNEXE_MS.
  const annexe = (a: src.Agenda, k: string) => k.startsWith(`${key(a)}|`) && (bundle.peek(k)?.ageMs ?? Infinity) < ANNEXE_MS;
  bundle.drop((k) => src.AGENDAS.some((a) => !a.planifie && (key(a) === k || echec(a) === k || annexe(a, k))));
  const save = () => bundle.save().catch((err) => console.error("agendas : copie impossible", why(err)));
  if (pending.length) later(Promise.allSettled(pending).then(save));
  else await save();
  // As their sites' terms ask (the scheduled event's copies are already, by src.copiePlanifiee).
  const served = got.map((g) => (g.value ? { ...g, value: { ...g.value, value: src.servis(g.agenda, g.value.value) } } : g));
  return src.AGENDAS.map((a) => [...served, ...planned].find((g) => g.agenda === a)!);
}

/**
 * The scheduled event's last part: the agendas read only there (`planifie`) whose copy is an hour old (or as old as
 * their `relecture`, within the hour their `decalage` says: `plannedDue`), each only if what is left pays for its reading and the bundle's write; the bundle (in KV,
 * src.PLANIFIES) written once, and only if one was read or failed. A reading that fails, or that finds nothing where the
 * copy had events, keeps the copy and its time, and is not tried again before the agenda's next reading is due, in
 * whatever isolate the next scheduled events run.
 */
export async function refreshPlanned(cache: Cache, now = new Date()): Promise<{ lus: string[]; gardes: string[]; reportes: string[]; trop_vieilles: string[] }> {
  // `trop_vieilles`: not read again this time, and their copy, older than their `garde`, no longer served.
  const out = { lus: [] as string[], gardes: [] as string[], reportes: [] as string[], trop_vieilles: [] as string[] };
  const planned = src.AGENDAS.filter((a) => a.planifie);
  // The bundle's read (unless this invocation has it already), one agenda's reading, the write.
  if (!planned.length || left() - KEEP_LEFT < 3) {
    out.reportes = planned.map((a) => a.id);
    return out;
  }
  const bundle = await src.planifiees(cache);
  // `set`: what a reading gives besides its events, kept in the bundle (Saint-Joseph's water notices, src.news `aussi`).
  const direct: src.AgendaStore = { get: async (_k, _s, load) => ({ value: await load(), fetchedAt: now, stale: false }), set: (k, v) => bundle.set(k, v) };
  const from = Date.now();
  for (const agenda of planned) {
    const old = bundle.peek(`agenda:${agenda.id}`);
    if (old && !plannedDue(agenda, old.ageMs, now)) continue;
    const failed = bundle.peek(echec(agenda));
    if (failed && !plannedDue(agenda, failed.ageMs, now)) continue;
    if (left() - KEEP_LEFT - 1 < (agenda.requetes ?? 1)) {
      out.reportes.push(agenda.id);
      continue;
    }
    const ago = siteAskedAgo(agenda.source.url);
    if (old && !failed && ago != null && ago < siteSpacing.ms && spacedSite(agenda.source.url) && dueSince(agenda, old.ageMs, now) < REPORT_MS) {
      console.log(`source ${agenda.source.id} (${agenda.id}) reporté : son site lu il y a ${Math.max(0, Math.round(ago / 1000))} s dans cet événement`);
      out.reportes.push(agenda.id);
      continue;
    }
    if (Date.now() - from > PLANNED_WINDOW_MS) {
      console.log(`source ${agenda.source.id} (${agenda.id}) reporté : lectures planifiées commencées il y a plus de ${PLANNED_WINDOW_MS / 1000} s`);
      out.reportes.push(agenda.id);
      continue;
    }
    try {
      // As long as a slow site takes (Le Séchoir), within PLANNED_WINDOW_MS for the next ones.
      const { value } = await patiently(PATIENT_MS, () => agenda.load(direct, now));
      if (!value.length && !agenda.videLu && (old?.value as src.Evenement[] | undefined)?.length) {
        console.error(`source ${agenda.source.id} (${agenda.id}) : aucun événement, la copie est gardée`);
        out.gardes.push(agenda.id);
        bundle.set(echec(agenda), src.ECHEC_VIDE);
        continue;
      }
      bundle.set(`agenda:${agenda.id}`, value);
      out.lus.push(agenda.id);
      bundle.drop((k) => k !== echec(agenda));
    } catch (err) {
      console.error(`source ${agenda.source.id} (${agenda.id}) indisponible, la copie est gardée:`, why(err));
      out.gardes.push(agenda.id);
      bundle.set(echec(agenda), true);
    }
  }
  for (const agenda of planned) {
    const old = bundle.peek(`agenda:${agenda.id}`);
    if (!out.lus.includes(agenda.id) && old && old.ageMs > src.gardeMs(agenda)) {
      console.error(`source ${agenda.source.id} (${agenda.id}) : copie trop vieille (${Math.round(old.ageMs / 3600_000)} h), plus servie`);
      out.trop_vieilles.push(agenda.id);
    }
  }
  if (out.lus.length || out.gardes.length) await bundle.save();
  return out;
}

/**
 * After its author called off, postponed or changed the public contact of an event they proposed: the copy of the
 * proposed events written again at once, so that the answers say it now rather than within the quarter of an hour.
 * The bundle's read, the table's, the write.
 */
export async function rafraichirPropositions(cache: Cache, now = new Date()): Promise<void> {
  const bundle = await cache.bundle(src.BUNDLE, src.BUNDLE_SYNC_SECONDS);
  bundle.set(`agenda:${PROPOSITIONS_ID}`, await proposes(now));
  await bundle.save();
}

/**
 * After a link to a platform was withdrawn or expired (connecteurs/): the copy of its events written again at once, so
 * that they leave the answers now rather than within the quarter of an hour. The bundle's read, the table's, the write.
 */
export async function rafraichirConnecteurs(cache: Cache, now = new Date()): Promise<void> {
  const bundle = await cache.bundle(src.BUNDLE, src.BUNDLE_SYNC_SECONDS);
  bundle.set(`agenda:${CONNECTEURS_ID}`, await relies(now));
  await bundle.save();
}

/** The agendas read from the database, not from a site: there may be nothing in them, which is no failure. */
const DE_LA_BASE = new Set([PROPOSITIONS_ID, CONNECTEURS_ID]);

/**
 * The same event published twice (by the CINOR and the tourist office, a mairie and the tourist office of the East, a hall and the town)
 * is told once: same first words of the title (« CÉDRIC "ANALYSE" & SES INVITÉS », « Cédric « Analyse » et ses
 * invités ») on the same day, in the same commune when both say it. A commune has one night market an evening: two
 * titles that say « marché de nuit » there on the same day are one (« Nout' Marché de Nuit à Bras-Panon » of the town,
 * « Marché de nuit spécial Dipavali 2026 » of the tourist office, both on 10/11/2026: audit of 04/11/2026).
 */
export function unique(list: src.Evenement[]): src.Evenement[] {
  const out: src.Evenement[] = [];
  const seen = new Map<string, src.Evenement>();
  const day = (e: src.Evenement) => e.seances[0]?.debut.slice(0, 10);
  const nightMarket = (e: src.Evenement) => (e.commune && /\bmarches? (?:de nuit|nocturnes?)\b/.test(normalize(e.titre)) ? `marché de nuit|${e.commune}|${day(e)}` : undefined);
  const key = (e: src.Evenement) => `${titleKey(e.titre)}|${day(e)}`;
  const timed = (e: src.Evenement) => e.seances.some((s) => s.debut.length > 10);
  const better = (x: src.Evenement, y: src.Evenement) => Number(timed(x)) - Number(timed(y)) || Number(!!x.lieu) - Number(!!y.lieu);
  for (const e of list) {
    const same = seen.get(e.id) ?? seen.get(key(e)) ?? (nightMarket(e) ? seen.get(nightMarket(e)!) : undefined);
    if (same && same.commune && e.commune && same.commune !== e.commune && same.id !== e.id) {
      out.push(e);
      seen.set(e.id, e);
      continue;
    }
    if (same && better(e, same) <= 0) {
      // Kept: the better copy, with what the other one knows of its state.
      if (e.statut && !same.statut) out[out.indexOf(same)] = { ...same, statut: e.statut };
      continue;
    }
    if (same) out[out.indexOf(same)] = { ...e, statut: e.statut ?? same.statut };
    else out.push(e);
    for (const k of [e.id, key(e), nightMarket(e), ...(same ? [same.id, key(same), nightMarket(same)] : [])]) if (k) seen.set(k, out.find((x) => x.id === e.id) ?? e);
  }
  return out;
}

/** The occurrences of an event in the period, not over yet. */
export function inPeriod(e: src.Evenement, p: Periode, now: Date): src.Seance[] {
  const here = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
  return e.seances.filter((s) => {
    const end = s.fin ?? s.debut;
    if (s.debut.slice(0, 10) > p.au || end.slice(0, 10) < p.du) return false;
    if (end.length > 10 ? end < here : end < here.slice(0, 10)) return false;
    // A weekend's Friday daytime is not the weekend yet: a market at 08:00, a talk until 16:00.
    if (p.vendredi && s.debut.length > 10 && s.debut.slice(0, 10) === p.du && end.slice(0, 10) === p.du && end.slice(11, 16) < p.vendredi) return false;
    // In the evening: what starts from 17:00 or ends after 19:00; a day without hours, or a fête of a few days, may be.
    if (p.soir && spanDays(s) > LONG_DAYS) return false;
    if (p.soir && s.debut.length > 10 && end.slice(0, 10) === s.debut.slice(0, 10)) return s.debut.slice(11) >= "17:00" || end.slice(11) >= "19:00";
    return true;
  }).sort((x, y) => x.debut.localeCompare(y.debut));
}

/**
 * The order of the answer: the dated events by their first occurrence, the seasons after them. Over a few days (a
 * weekend, a day), what begins in them first: a match since Wednesday is not the weekend's first outing.
 */
export function order(p: Periode) {
  const short = spanDays({ debut: p.du, fin: p.au }) <= 3;
  const begun = (s: src.Seance) => Number(short && s.debut.slice(0, 10) < p.du);
  return (x: { e: { titre: string }; seances: src.Seance[] }, y: { e: { titre: string }; seances: src.Seance[] }) =>
    Number(spanDays(x.seances[0]) > LONG_DAYS) - Number(spanDays(y.seances[0]) > LONG_DAYS) || begun(x.seances[0]) - begun(y.seances[0]) ||
    x.seances[0].debut.localeCompare(y.seances[0].debut) || x.e.titre.localeCompare(y.e.titre, "fr");
}

/** Its last good reading, and that the platform did not answer since, when so (the validated words). */
const luVia = (v: NonNullable<src.Evenement["via"]>) => (v.sans_reponse ? `lu sur ${v.plateforme} le ${dayText(v.lu)}, pas de réponse depuis` : `lu le ${dayText(v.lu)}`);

/**
 * Whether an event's `source` says what its agenda's terms or agreement ask to show with each of its events (Le Port's
 * « © www.ville-port.re », the Département's mention, the name of a hall that agreed, the site of a commune whose
 * agreement asks it with each event): kept in the tool's answer then.
 * Otherwise it says what publie_par and lu_le say, and the tool leaves it out (the pages keep it).
 */
const mentionDue = (e: src.Evenement) => !!e.credit || !!e.mention || !!e.site_commune?.includes("©");

/** `place`: for the pages, which place it on the map; `outil`: the tool's answer, without its picture and its source when not due. */
/** The dates of a row: what `occurrences` reads back, for the rows and for the tool's days alike. */
function dates(seances: src.Seance[]) {
  const [first, ...others] = seances;
  return {
    quand: when(first),
    /** Local, « 2026-10-24T14:00 » or « 2026-10-24 ». */
    date: first.debut,
    autres_dates: others.length ? others.slice(0, NEXT_MAX).map(when).concat(others.length > NEXT_MAX ? [`et ${others.length - NEXT_MAX} autres`] : []) : undefined,
  };
}

/**
 * What an announcement leaves out, said the same on the event's page and in the tool (words for the site, 20/11/2026):
 * « L'annonce ne donne pas l'heure ; le détail est peut-être sur sa source : X. », or « pas d'adresse », or « ni l'heure
 * ni l'adresse ». « l'adresse », not « le lieu »: an announcement may name its hall in its text without the field
 * (« à la médiathèque… »). `qui` is the source's name, without an article (the page gives it as a link). Undefined when
 * both are given.
 */
export function annonceManque(date: string, lieu: string | undefined, qui: string): string | undefined {
  const heure = date.length <= 10, adresse = !lieu?.trim();
  const dit = heure && adresse ? "ni l'heure ni l'adresse" : heure ? "pas l'heure" : adresse ? "pas d'adresse" : undefined;
  return dit && `L'annonce ne donne ${dit}\u00a0; le détail est peut-être sur sa source\u00a0: ${qui}.`;
}

export function eventRow(e: src.Evenement, seances: src.Seance[], place = false, outil = false) {
  return {
    /** All in capitals in its agenda, in the case of a sentence (casse.ts). */
    titre: casse(e.titre),
    ...dates(seances),
    lieu: e.lieu,
    commune: e.commune,
    prix: e.prix,
    categories: e.categories.length ? e.categories : undefined,
    genres: genres(e),
    statut: e.statut === "annulé" ? "ANNULÉ" : e.statut === "reporté" ? "REPORTÉ" : e.statut === "complet" ? "complet" : undefined,
    /** « annoncé par la Ville de Saint-André dans un appel à exposants », when the post calls stallholders (tools/appel.ts); its link is `lien`. */
    annonce: e.appel ? annonceAppel(e.publie_par, e.appel) : undefined,
    /** « d'après Imaz Press » when the news says it and the organiser's page does not yet. */
    statut_d_apres: e.selon ? { media: e.selon.media, lien: e.selon.lien } : undefined,
    /** A club's session for its members, told only to who says they are one. */
    acces: e.reserve_adherents ? src.reserve(e) : undefined,
    site_du_club: e.reserve_adherents ? httpUrl(e.organisateur?.site) : undefined,
    reporte_au: e.reporte_au ? dayText(e.reporte_au) : undefined,
    billetterie: versBilletterie(httpUrl(e.billetterie)),
    description: e.description,
    /** The children's ages the organiser gives, in its words: « dès 10 ans ». */
    age: e.age,
    /** Absent when the source gives no http(s) link. */
    lien: versBilletterie(httpUrl(e.lien)),
    publie_par: e.publie_par,
    /** « L'annonce ne donne pas d'adresse ; le détail est peut-être sur sa source : X. », as the event's page says it. */
    manque: outil ? annonceManque(seances[0].debut, e.lieu, e.publie_par) : undefined,
    /** When rundata.re read the agenda this comes from; not for an event its organiser proposed, never read elsewhere. */
    lu_le: e.lu_le && !e.propose && !e.via ? dayText(e.lu_le) : undefined,
    /**
     * « site de la commune du Tampon, lu le samedi 24/10 à 08:00 », when it comes from a commune's site; « Théâtre Luc
     * Donat (site lu le mardi 27/10 à 10:30) », when its agreement asks to name it; « l'association X, via
     * HelloAsso, lu le … », when read on the platform an association linked.
     */
    source: outil && !mentionDue(e)
      ? undefined
      : e.via
        ? `l'association ${e.publie_par}, via ${e.via.plateforme}, ${luVia(e.via)}`
        : !e.lu_le ? undefined : e.site_commune ? `${e.site_commune}, lu le ${dayText(e.lu_le)}` : e.credit ? `${e.credit} (site lu le ${dayText(e.lu_le)})` : undefined,
    /** The platform an association linked, and its last reading: for the page's « via HelloAsso » and its logo. */
    via: e.via ? { plateforme: e.via.plateforme, lu: luVia(e.via) } : undefined,
    /** Proposed by its organiser on rundata.re: said so, with the day, never « checked ». */
    propose: e.propose ? `Proposé par l'organisateur sur rundata.re le ${e.propose.le.split("-").reverse().join("/")}` : undefined,
    /** The contact its author chose to show, only then. */
    contact: e.propose?.contact,
    /** Who organises it, as the site's agenda names them. */
    organise_par: e.organise_par,
    /** OpenAgenda's picture under the Licence Ouverte, for the search engines (JSON-LD of the pages): not in the tool's answer. */
    image: outil ? undefined : e.image,
    /** Where it is, when its source gives it: for the pages' « Y aller » only (`place`), never in the tool's answer. */
    position: place && e.lat != null && e.lon != null && inReunion(e.lon, e.lat) ? { lat: e.lat, lon: e.lon } : undefined,
    /** Its page on rundata.re (/evenements/<titre>-<fiche>, web/fiche-evenement.ts): for the pages, not in the tool's answer. */
    fiche: outil ? undefined : ficheDe(e),
  };
}
export type EventRow = ReturnType<typeof eventRow>;

/**
 * An event's key on rundata.re, 8 hexadecimal digits: from who publishes it and its id there, never its title nor its
 * date, so that its page keeps its address when either changes (web/fiche-evenement.ts).
 */
export function ficheDe(e: Pick<src.Evenement, "publie_par" | "id">): string {
  const s = `${e.publie_par}|${e.id}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

interface Occurrence {
  du: string;
  au: string;
  /** « 19:30 » when the source gives it. */
  debut?: string;
  fin?: string;
  /** As the agenda writes it: « samedi 24/10 de 14:00 à 18:00 ». */
  quand: string;
}

/**
 * The dates of a row as the agenda writes them (tools/agenda.ts `when`): its first one, and the others it lists.
 * « samedi 24/10 à 19:30 », « samedi 24/10 de 14:00 à 18:00 », « du vendredi 23/10 à 19:00 au dimanche 25/10 ».
 */
export function occurrences(r: Pick<EventRow, "date" | "quand" | "autres_dates">): Occurrence[] {
  const year = Number(r.date.slice(0, 4));
  const first = r.date.slice(5, 10);
  // A period over two years says them (when): « du samedi 23/05/2026 au samedi 22/05/2027 ».
  const day = (dd: string, mm: string, yyyy?: string) => `${yyyy ?? year + (`${mm}-${dd}` < first ? 1 : 0)}-${mm}-${dd}`;
  const DAY = String.raw`\S+ (\d\d)\/(\d\d)(?:\/(20\d\d))?`;
  const read = (q: string): Occurrence | undefined => {
    let m = new RegExp(`^du ${DAY}(?: à (\\d\\d:\\d\\d))? au ${DAY}(?: à (\\d\\d:\\d\\d))?$`).exec(q);
    if (m) return { du: day(m[1], m[2], m[3]), debut: m[4], au: day(m[5], m[6], m[7]), fin: m[8], quand: q };
    m = new RegExp(`^${DAY}(?: à (\\d\\d:\\d\\d)| de (\\d\\d:\\d\\d) à (\\d\\d:\\d\\d))?$`).exec(q);
    if (m) return { du: day(m[1], m[2], m[3]), au: day(m[1], m[2], m[3]), debut: m[4] ?? m[5], fin: m[6], quand: q };
    return undefined;
  };
  return [r.quand, ...(r.autres_dates ?? [])].map(read).filter((o): o is Occurrence => !!o);
}

/** An occurrence of more than a week (an exhibition, a season): told apart from the events of each of its days. */
export const longRun = (o: Pick<Occurrence, "du" | "au">) => spanDays({ debut: o.du, fin: o.au }) > LONG_DAYS;

export interface Jour<R> {
  /** Local, « 2026-11-21 ». */
  jour: string;
  /** The occurrences on that day, an event of a few days on each of them; by hour, those of several days after. */
  evenements: { r: R; o: Occurrence }[];
  /** The events of more than a week going on that day, once each: « aussi en cours ». */
  aussi: R[];
}

/** How many events a day has, each once even when it has two occurrences that day. */
export const nombreDuJour = (j: { evenements: { r: unknown }[] }) => new Set(j.evenements.map((x) => x.r)).size;

/**
 * The days from `du` to `au`, each with what goes on that day: an event of several days counts on each of them, not
 * only on its first (Réunion Graffiti on the Saturday and on the Sunday, 20/11/2026); those of more than a week (an
 * exhibition of a month) are kept apart, so as not to drown the day. `vendredi`: a weekend's Friday, and from when it
 * counts: what is over before (a market at 08:00) is not the weekend yet. The tool (`par_jour`) and the pages count so.
 */
export function parJour<R extends Pick<EventRow, "date" | "quand" | "autres_dates">>(rows: R[], du: string, au: string, vendredi?: { jour: string; heure: string }): Jour<R>[] {
  const days = new Map<string, Jour<R>>();
  for (let d = du; d <= au; d = addDays(d, 1)) days.set(d, { jour: d, evenements: [], aussi: [] });
  for (const r of rows) {
    const os = occurrences(r);
    const all = os.length ? os : [{ du: r.date.slice(0, 10), au: r.date.slice(0, 10), debut: r.date.slice(11, 16) || undefined, quand: r.quand }];
    for (const o of all) {
      for (let d = o.du < du ? du : o.du; d <= o.au && d <= au; d = addDays(d, 1)) {
        if (vendredi && d === vendredi.jour && o.du === d && o.au === d && o.debut && (o.fin ?? o.debut) < vendredi.heure) continue;
        const j = days.get(d)!;
        if (!longRun(o)) j.evenements.push({ r, o });
        else if (!j.aussi.includes(r)) j.aussi.push(r);
      }
    }
  }
  const hour = (x: { o: Occurrence }, d: string) => (x.o.du === d ? x.o.debut ?? "" : "");
  for (const j of days.values()) {
    j.evenements.sort((x, y) => Number(x.o.du !== x.o.au) - Number(y.o.du !== y.o.au) || hour(x, j.jour).localeCompare(hour(y, j.jour)));
  }
  return [...days.values()];
}

/** « Mairie de Saint-Paul » → « le site de la Mairie de Saint-Paul », « Le Séchoir » → « le site du Séchoir ». */
export function siteOf(nom: string): string {
  if (/^(Ville|Mairie|Commune)\b/.test(nom)) return `le site de la ${nom}`;
  const de = nom.replace(/^Le /, "du ").replace(/^La /, "de la ").replace(/^Les /, "des ");
  return `le site ${de !== nom ? de : /^[AEIOUYÉÈÊÀÂ]/iu.test(nom) ? `de l'${nom}` : `de ${nom}`}`;
}

/**
 * The agendas of a commune that did not answer, in the validated words (tools/injoignable.ts): its tile, its day's page
 * and resume_du_jour then never say « rien d'annoncé » alone, nor count the other sources' events as the whole of it.
 * Those read at the question (`indisponible`, at `readAt`), and those of the scheduled event whose last try failed
 * (`nonLus`, the copy's `non_lus`: « Ville de Saint-Denis : dernière lecture sans succès (le 20/11 à 05:40) »), at the
 * hour of that try. One read that went well and is now too old is not a failure: left to `non_lus` and /evenements.
 * `lien`: its site, `at`: the read that failed (« 20/11 05:40 »).
 */
export function silentOf(indisponible: string[] | undefined, commune: string, readAt: string, now: Date, nonLus?: string[]): (Injoignable & { site: string; lien: string; at: string })[] {
  const out: (Injoignable & { site: string; lien: string; at: string })[] = [];
  for (const a of src.AGENDAS.filter((x) => x.commune === commune)) {
    const tried = nonLus?.map((x) => x.startsWith(`${a.nom} : `) && / sans succès \(le (\d\d\/\d\d) à (\d\d:\d\d)\)$/.exec(x)).find(Boolean);
    const at = indisponible?.includes(a.nom) ? readAt : tried ? `${tried[1]} ${tried[2]}` : undefined;
    if (at) out.push({ site: siteOf(a.nom), lien: a.source.url, at, ...injoignable(siteOf(a.nom), undefined, at, now) });
  }
  return out;
}

// The agendas listed but not read (suspended, or a site not read), and the sources only they are credited with.
const NON_LUS = src.LISIBLES.filter((x) => !src.AGENDAS.includes(x));
const THEIRS_ONLY = new Set(NON_LUS.map((x) => x.source).filter((s) => !src.AGENDAS.some((x) => x.source === s)).map((s) => s.nom));
// reunion.fr's agenda, no longer read (tools/non-repris.ts): its events and its credit, in a copy built before.
const RETIRE = { publie_par: "reunion.fr", source: "Agenda de reunion.fr, site officiel du tourisme de La Réunion" };
THEIRS_ONLY.add(RETIRE.source);

// The clubs' events are published by each club, on its own site of Sportsregions: told by their link.
const clubsNonLus = NON_LUS.includes(src.SPORTSREGIONS);
const hostOf = (lien: string | undefined) => {
  try {
    return lien ? new URL(lien).hostname : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether an event of a copy may be served: not one read on a site not read until its commune agrees, however old the
 * copy (one built before, by another revision, can still be served while it is rebuilt: tools/resume.ts, readCopies).
 */
export const repris = (r: Pick<EventRow, "source" | "publie_par" | "lien">) =>
  r.publie_par !== RETIRE.publie_par && !NON_LUS.some((x) => r.publie_par === x.nom || (!!x.site_commune && !!r.source?.startsWith(`${x.site_commune}, `)) ||
    // A suspended agenda whose events carry its credit rather than its name (the OTI Est's « … — Droits réservés »).
    (src.SUSPENDUS.has(x.id) && r.publie_par === x.source.attribution)) &&
  !(clubsNonLus && hostOf(r.lien)?.endsWith(".sportsregions.fr"));

/** The credits of a copy, as they read now: none of a source not read, the mairies' agendas and the halls named as now (SOURCES). */
export function sourcesServies<T extends { source: string }>(cs: T[] | undefined): (T | ReturnType<typeof credits>[number])[] | undefined {
  return cs?.filter((c) => !THEIRS_ONLY.has(c.source)).map((c) =>
    c.source.startsWith("Agendas des mairies") ? credits([src.SOURCES.mairies])[0] : c.source.startsWith("Programmes des salles") ? credits([SALLES_SOURCE])[0] : c);
}

// Told from the agendas read: a source taken out of AGENDAS leaves this text too.
const halls = src.AGENDAS.filter((x) => x.source === SALLES_SOURCE);
/** « du Séchoir », « de la Cité des Arts », « de Léspas ». */
const ofHall = (nom: string) => nom.replace(/^Le /, "du ").replace(/^La /, "de la ").replace(/^Les /, "des ").replace(/^(?!du |de la |des )/, /^[AEIOUYÉÈÊÀÂ]/iu.test(nom) ? "de l'" : "de ");
// The names whose article their own words do not give: a body known by its initials, a hall, the clubs (wording validated on 26/10).
const OF_AGENDA: Record<string, string> = {
  CINOR: "de la CINOR",
  "Ligue réunionnaise de volley-ball": "de la Ligue réunionnaise de volley-ball",
  "Clubs sportifs (Sportsregions)": "des clubs sportifs (Sportsregions)",
  "TÉAT Champ Fleuri et Plein Air": "du TÉAT Champ Fleuri et Plein Air",
  "Cité des Arts": "de la Cité des Arts",
  Kabardock: "du Kabardock",
  "Théâtre Luc Donat": "du Théâtre Luc Donat",
  CDNOI: "du CDNOI",
};
/** After « l'agenda »: « de la mairie de Saint-Paul », « de la Ville du Port », « du Séchoir », « de l'Office de tourisme de l'Est ». */
export const ofAgenda = (nom: string) => OF_AGENDA[nom] ?? (/^Mairie /.test(nom) ? `de la m${nom.slice(1)}` : /^Ville /.test(nom) ? `de la ${nom}` : ofHall(nom));
/** What a commune read only through its mairie's news has besides: its halls' programmes. */
function besides(commune: string): string {
  const its = halls.filter((h) => h.commune === commune).map((h) => ofHall(h.nom));
  return its.length ? `\u00a0; s'y ajoutent ${its.length > 1 ? "les programmes" : "le programme"} ${enumeration(its)}` : "";
}
const towns = src.AGENDAS.filter((x) => x.source !== SALLES_SOURCE && !DE_LA_BASE.has(x.id) && !x.partiel);
const partial = src.AGENDAS.filter((x) => x.partiel);
const without = Object.keys(INSEE).filter((c) => !src.COVERED.includes(c));
/** The halls whose programme is read, for the tool's description: « le programme du Séchoir ». */
export const PROGRAMMES_SALLES = `${halls.length > 1 ? "les programmes" : "le programme"} ${enumeration(halls.map((h) => ofAgenda(h.nom)))}`;
/** The communes whose mairie's agenda is read, for the tool's description. */
export const MAIRIES_LUES = towns.filter((x) => x.commune && !x.couvre).map((x) => x.commune).join(", ");
export const COUVERTURE =
  `Agendas lus : ${towns.map((x) => (x.couvre ? `${x.nom} (${x.couvre.join(", ")})` : x.nom)).join(", ")}. ` +
  // One hall: « Programme du Séchoir ».
  (halls.length > 1 ? `Programmes des salles : ${halls.map((x) => x.nom).join(", ")}. ` : halls.length ? `Programme ${ofAgenda(halls[0].nom)}. ` : "") +
  (partial.length ? `Actualités des mairies, pour les seuls événements qu'elles annoncent avec leur date (pas un agenda complet) : ${[...new Set(partial.map((x) => x.commune))].join(", ")}. ` : "") +
  `Sans agenda lu : ${without.join(", ")}` +
  `${Object.entries(src.SANS_AGENDA).filter(([c]) => without.includes(c)).map(([, why]) => `\u00a0; ${why}`).join("")}. ` +
  [...mentionSalles(), ...mentionSports([], true)].map((x) => `${x} `).join("") +
  "Aussi : les événements que les clubs et associations proposent sur rundata.re (https://rundata.re/associations), relus avant publication. " +
  "Pas encore lus : les bars et les clubs, les billetteries privées. Un événement absent ici peut quand même avoir lieu (voir le site ou la " +
  "page Facebook de la salle ou de la mairie). Chaque événement dit qui le publie, renvoie à sa page et dit quand rundata.re l'a lu.";
/** The agendas and halls' programmes read, and the communes whose mairie's news is read for its events (COUVERTURE_OUTIL). */
export const AGENDAS_LUS = towns.length + halls.length;
export const MAIRIES_ACTUALITES = new Set(partial.map((x) => x.commune)).size;
/**
 * The tool's coverage, lighter than COUVERTURE (2 KB in every answer, 5/11/2026): the numbers, the page that lists them,
 * and its last sentences word for word. The sites not taken stay in the answer's non_repris.
 */
export const COUVERTURE_OUTIL =
  `${AGENDAS_LUS} agendas et programmes de salles lus, et les actualités de ${MAIRIES_ACTUALITES} mairies : la liste, les communes sans agenda lu et les sites non repris sur https://rundata.re/evenements#h-couv. ` +
  "Pas encore lus : les bars et les clubs, les billetteries privées. Un événement absent ici peut quand même avoir lieu (voir le site ou la " +
  "page Facebook de la salle ou de la mairie). Chaque événement dit qui le publie, renvoie à sa page et dit quand rundata.re l'a lu.";
/** The cinemas' showtimes are on their own sites, not here. */
export const CINEMAS = [
  { nom: "Ciné Cambaie (Saint-Paul), Ciné Grand Sud (Saint-Pierre), Ciné Lacaze (Saint-Denis), Le Plaza (Saint-Louis)", lien: "https://cine-reunion.com/" },
  { nom: "Cinepalmes (Sainte-Marie)", lien: "https://iccreunion.com/" },
  { nom: "Moulin à Café (Saint-Pierre, Ravine des Cabris)", lien: "https://www.saintpierre.re/culture/arts-visuels-et-cinema/cinema-moulin-cafe" },
];
/**
 * The agendas of the scheduled event whose copy is not served (src.nonServie), or served while its readings fail
 * (src.echecDepuis), of the commune asked (`propre`) and of the whole island, each once, with why: never left out
 * silently, nor said to publish nothing.
 */
/**
 * A copy still served whose readings failed since, in words: « lue le 26/11 à 22:00, sans succès depuis (dernier essai le
 * 28/11 à 06:30) ». Not « dernière lecture sans succès (le …) », which says a site silent on its commune's tile
 * (`silentOf`): its events are still there.
 */
export function echecLu(r: NonNullable<ReturnType<typeof src.echecDepuis>>): string {
  const le = (local: string) => `le ${local.slice(8, 10)}/${local.slice(5, 7)} à ${local.slice(11, 16)}`;
  return `lue ${le(r.lu)}, sans succès depuis (dernier essai ${le(r.essai)})`;
}
function nonLus(got: Got[], commune: string | undefined): { nom: string; etat: string; propre: boolean }[] {
  const named = new Map<string, { nom: string; etat: string; propre: boolean }>();
  for (const g of got) {
    if ((!g.nonServie && !g.echec) || named.has(g.agenda.nom)) continue;
    const propre = !!commune && (g.agenda.commune === commune || !!g.agenda.couvre?.includes(commune));
    if (commune && !propre && (g.agenda.commune || g.agenda.couvre)) continue;
    named.set(g.agenda.nom, { nom: g.agenda.nom, etat: g.nonServie ? derniereLecture(g.nonServie) : echecLu(g.echec!), propre });
  }
  return [...named.values()];
}

const A_SAVOIR = "Heures de La Réunion. Les dates et les prix sont ceux publiés par l'organisateur : vérifier sur la page de l'événement avant de se déplacer (annulation, météo, places). Un événement annulé ou reporté reste dans la liste avec son statut\u00a0; « complet » : plus de places en vente. Les matchs des clubs et les programmes sportifs des communes : l'outil sport.";

/** What the tool's `par_jour` counts, for the assistant that reads it. */
const PAR_JOUR = "Un événement de plusieurs jours compte pour chacun de ses jours. aussi_en_cours\u00a0: les événements de plus d'une semaine (expositions, saisons) en cours ce jour-là, comptés à part.";

/** `listed`: how many events at most (the page lists them all). */
/** `adherent`: the user says they are a club's member: its sessions for the members are told too, said so. */
export async function agenda(cache: Cache, lieu?: string, quand?: string, quoi?: string, now = new Date(), listed = LISTED, adherent = false, place = false) {
  let res: ReturnType<typeof resolvePlace> = null;
  if (lieu?.trim()) {
    res = resolvePlace(lieu);
    if (!res) return notFound(lieu);
  }
  const commune = res?.lieu.commune;
  // Each agenda served dates the answer by its own read, as /evenements says it (oldestRead): not the copy that brings
  // the scheduled ones together, written later (23/11/2026: « lue à 02:43 » over the Département's events read at 22:00
  // the day before, which the page said). Without any agenda served, the reads as they were.
  const { value: got, lectures: brought } = await withLectures(() => gather(cache, now));
  const served = got.filter((g) => g.value?.value.length);
  for (const l of served.length ? served.map((g) => agendaRead(g)) : brought) noteLecture(l);
  // The news already read (the page /actualites, the tool actualites), for the cancellations it reports: never fetched
  // for this, read once per invocation (the page asks twice), and after the agendas, so as not to take one's subrequest.
  const news = await perInvocation("agenda:actualites", async () => {
    const t = Date.now();
    const fil = await cache.peek<Fil>("actualites:fil").catch(() => undefined);
    mesure().actualites = Date.now() - t;
    return fil;
  });
  const failed = got.filter((g) => !g.value && !g.agenda.planifie).map((g) => g.agenda.nom);
  const unread = nonLus(got, res?.lieu.commune);
  const muettes = mairiesMuettes(got, now);
  const muette = commune ? muettes.find((x) => x.commune === commune) : undefined;
  const sansEvenement = (commune ? (muette ? [muette] : []) : muettes).map((x) => x.phrase);
  // The proposed events alone are not an agenda that answers: there may be none.
  if (got.every((g) => !g.value || (DE_LA_BASE.has(g.agenda.id) && !g.value.value.length))) {
    return { ...text({ erreur: "Les agendas ne répondent pas pour le moment.", indisponible: failed }), isError: true };
  }

  const p = periode(quand, now);
  const what = matcher(quoi);
  // The communes' sports programmes go to the sport tool (src.programmesSportifs).
  const all = withNews(unique(got.flatMap((g) => g.value ? g.value.value.filter((e) => !src.programmeSportif(e) && (adherent || !e.reserve_adherents)).map((e) => ({ ...e, lu_le: src.toLocal(g.value!.fetchedAt.toISOString()), site_commune: g.agenda.site_commune, credit: g.agenda.credit, mention: g.agenda.mention, source_agenda: g.agenda.source })).flatMap((e) => appelAuPublic(e) ?? []) : [])), news?.value.infos, now)
    .map((e) => ({ e, seances: inPeriod(e, p, now) }))
    .filter((x) => x.seances.length && (!what || what.test(x.e)))
    .sort(order(p));
  const mine = commune ? all.filter((x) => x.e.commune === commune) : all;

  const periodText = p.du === p.au ? p.nom : `${p.nom} (du ${dayText(p.du)} au ${dayText(p.au)})`;
  const where = commune ? a(commune) : "à La Réunion";
  const kind = what?.nom ? ` (${what.nom})` : "";
  const n = mine.length;
  const market = !!quoi && MARKET.test(quoi);
  if (!n) rienTrouve("evenements");
  const covered = !commune || src.COVERED.includes(commune);
  // A commune read only through its mairie's news: said, so that a short list is not taken for its whole agenda.
  // The TCO's agenda, a few events a month over its five communes, is no commune's agenda: Saint-Leu, read through its
  // news, still says so.
  const partly = commune ? partial.find((x) => x.commune === commune && !towns.some((y) => y.id !== src.TCO.id && (y.couvre ?? [y.commune]).includes(commune))) : undefined;
  const off = mine.filter((x) => x.e.statut === "annulé" || x.e.statut === "reporté");
  // reunion.fr's agenda, not read (tools/non-repris.ts): said for the whole island and for the big fêtes and festivals.
  const irt = !commune || !!what?.nom?.includes("fêtes et festivals");
  // The halls not read (tools/non-repris.ts), the commune's or the island's.
  const nonRepris = [...mentionSalles(commune), irt ? mentionReunionFr() : undefined].filter(Boolean).join(" ") || undefined;
  // Each part without its own final point (MARCHES_REGULIERS is a sentence): one point, at the end.
  const resume = [
    n ? `${n} événement${n > 1 ? "s" : ""}${kind} ${where} ${periodText}` : `Aucun événement${kind} trouvé ${where} ${periodText}`,
    off.length ? `ATTENTION : ${off.map((x) => `« ${casse(x.e.titre)} » ${x.e.statut}${x.e.reporte_au ? ` au ${dayText(x.e.reporte_au)}` : ""}${x.e.selon ? ` (d'après ${x.e.selon.media})` : ""}`).slice(0, 4).join(", ")}` : "",
    commune && !covered ? src.SANS_AGENDA[commune] ?? `ni la mairie ${de(commune)} ni une salle de la commune ne publient d'agenda lisible` : "",
    irt ? RESUME_REUNION_FR : "",
    partly ? `${commune} : ${partly.partiel}${besides(commune!)}` : "",
    // Its own site read, none announced: said with the hour of the read, so that « aucun » is not taken for a commune
    // not read (Saint-Louis, 17/11/2026). Not with a genre asked: the site may announce another kind.
    // Nothing to come at all, every site of its mairie read: said so, dated, rather than for the period only.
    commune && !n && !what ? muette?.phrase ?? rienAnnonce(sitesLus(got, commune)) : "",
    commune && !n && all.length ? `${all.length} ailleurs sur l'île` : "",
    !n && market ? MARCHES_REGULIERS : "",
    // Said in the summary, not only in `indisponible`: a partial list must not be read as the whole of it.
    failed.length ? `${failed.length} agenda${failed.length > 1 ? "s" : ""} non lu${failed.length > 1 ? "s" : ""} cette fois : ${failed.join(", ")} (liste peut-être incomplète, à redemander dans une minute)` : "",
    // The commune's own agendas, where silence would read as « nothing »; the island's are in `non_lus`.
    unread.some((x) => x.propre) ? `sans lecture récente : ${unread.filter((x) => x.propre).map((x) => `${x.nom}, ${x.etat}`).join("\u00a0; ")} (voir non_lus)` : "",
  ].filter(Boolean).map((x) => x.replace(/\.$/, "")).join("\u00a0; ") + ".";

  const used = [...new Set(got.filter((g) => g.value && (!DE_LA_BASE.has(g.agenda.id) || g.value.value.length)).map((g) => g.agenda.source))] as SourceInfo[];
  // Day by day, as the pages count (parJour): for the tool, over a period of several days.
  const jours = !place && p.du !== p.au ? parJour(mine.map((x) => dates(x.seances)), p.du, p.au, p.vendredi ? { jour: p.du, heure: p.vendredi } : undefined) : undefined;
  const listedEvents = n ? mine.slice(0, listed) : [];
  const elsewhere = commune && !n && all.length ? all.slice(0, ELSEWHERE_MAX) : [];
  // The tool credits the agendas of the events it shows (every agenda read when it shows none: what « none » rests on).
  const shownFrom = new Set([...listedEvents, ...elsewhere].map((x) => x.e.source_agenda).filter(Boolean));
  // The commune's own agendas read are credited even when they gave nothing: what « aucun événement à Saint-André »
  // rests on (21/11/2026: the Ville de Saint-André missing from the sources, its feed read).
  const own = new Set(commune ? got.filter((g) => g.value && g.agenda.commune === commune).map((g) => g.agenda.source) : []);
  const credited = place || !shownFrom.size ? used : used.filter((s) => shownFrom.has(s) || own.has(s));
  return text({
    lieu: res && lieu ? placeBlock(lieu, res) : undefined,
    resume,
    periode: { du: dayText(p.du), au: dayText(p.au), soir: p.soir || undefined },
    nombre: n,
    par_jour: jours && n ? {
      a_savoir: PAR_JOUR,
      jours: jours.map((j) => ({ jour: `${dayText(j.jour)}${p.vendredi && j.jour === p.du ? ` dès ${p.vendredi}` : ""}`, nombre: nombreDuJour(j), aussi_en_cours: j.aussi.length || undefined })),
    } : undefined,
    quand_non_compris: p.incompris ? `« ${quand} » n'a pas été compris : les deux semaines qui viennent sont données. Dire « aujourd_hui », « ce_soir », « demain », « ce_week_end », « cette_semaine », un jour (« samedi ») ou une date (« 2026-10-31 »).` : undefined,
    evenements: n ? listedEvents.map((x) => eventRow(x.e, x.seances, place, !place)) : undefined,
    autres: n > listed ? `${n - listed} autres événements : préciser le lieu, le jour ou le genre (quoi).` : undefined,
    ailleurs_sur_l_ile: elsewhere.length ? elsewhere.map((x) => eventRow(x.e, x.seances, false, !place)) : undefined,
    marches_reguliers: market ? MARCHES_REGULIERS : undefined,
    // The markets held on the period's days, apart from the events and not counted among them (vie/marches.ts).
    marches_forains: place ? undefined : marchesDesJours(p, commune, !quoi || market, now),
    sport_ce_week_end: !place && /week.?end/i.test(quand ?? "") ? SPORT_CE_WEEK_END : undefined,
    cinemas: what?.nom?.includes("cinéma") || /cin[ée]|film/i.test(quoi ?? "") ? { seances: "Les séances des cinémas sont sur leurs sites :", salles: CINEMAS } : undefined,
    indisponible: failed.length ? failed : undefined,
    // Those of `indisponible` left to the next question for want of subrequests; the others did not answer.
    remises: failed.length && got.some((g) => g.remise) ? got.filter((g) => g.remise).map((g) => g.agenda.nom) : undefined,
    non_lus: unread.length ? unread.map((x) => `${x.nom} : ${x.etat}`) : undefined,
    // Where a commune's site is not read until it agrees: to be said with the answer.
    non_repris: nonRepris,
    // The mairies read that announce nothing to come (mairiesMuettes): the commune's, or the island's.
    mairies_sans_evenement: sansEvenement.length ? sansEvenement : undefined,
    couverture: place ? `${COUVERTURE}${muettes.length ? ` ${((s) => s[0].toUpperCase() + s.slice(1))(muettes.map((x) => x.phrase).join("\u00a0; "))}.` : ""}` : COUVERTURE_OUTIL,
    a_savoir: A_SAVOIR,
    sources: credits(credited),
    // For the pages only (`place`): when the oldest of the agendas served was read, the time /evenements says, as the
    // tool's fraicheur does, not the time its copy was built (04/11/2026: « lus à 14:05 » for agendas read at 13:09).
    lus_le: place ? oldestRead(got) : undefined,
    // For the pages only: each commune's own sites read, for its tile when they announce nothing (web/liens.ts).
    sites_lus: place ? Object.fromEntries([...new Set(got.map((g) => g.agenda.commune).filter((c): c is string => !!c))].map((c) => [c, sitesLus(got, c)]).filter(([, v]) => v.length)) : undefined,
  });
}

export const SPORT_CE_WEEK_END = "Les matchs des clubs ce week-end, et leurs résultats : l'outil sport, quand = « ce_week_end ».";
/** The days of a period whose markets are given, at most: a day, the weekend, not two weeks. */
export const MARCHES_JOURS_MAX = 4;

/**
 * The markets held on each day of a short period (MARCHES_JOURS_MAX), in the commune asked or on the whole island: their
 * day and hours as their source gives them, with that source and the day it was read. None in the evening (they are
 * held in the morning or the day), none when the question asks for another kind of event (`asked` false).
 */
export function marchesDesJours(p: Periode, commune: string | undefined, asked: boolean, now?: Date) {
  if (!asked || p.soir) return undefined;
  const days: string[] = [];
  for (let d = p.du; d <= p.au && days.length <= MARCHES_JOURS_MAX; d = addDays(d, 1)) if (!(d === p.du && p.vendredi)) days.push(d);
  if (!days.length || days.length > MARCHES_JOURS_MAX) return undefined;
  const out = days.map((d) => ({ jour: dayText(d), marches: marchesDuJour(d, commune, now).map(({ nom, commune, horaires, termine, adresse, d_apres, lien }) => ({ nom, commune, horaires, termine, adresse, d_apres, lien })) }))
    .filter((x) => x.marches.length);
  return out.length
    ? { note: "Marchés forains réguliers, à leur jour habituel d'après leur source (datée) : un jour férié, la météo ou la mairie peuvent les changer. Ils ne sont pas comptés dans nombre.", jours: out }
    : undefined;
}

/** A commune's own sites read (its mairie's agenda or news, `site_commune`), each at its oldest read, the oldest first. */
export function sitesLus(got: Got[], commune: string): { site: string; lu_le: string }[] {
  const by = new Map<string, number>();
  for (const g of got) {
    if (!g.value || g.agenda.commune !== commune || !g.agenda.site_commune) continue;
    // « site de la commune du Port », without the copyright its pages show with it.
    const site = g.agenda.site_commune.replace(/\s*\(.*\)$/, "");
    by.set(site, Math.min(by.get(site) ?? Infinity, g.value.fetchedAt.getTime()));
  }
  return [...by].sort((x, y) => x[1] - y[1]).map(([site, t]) => ({ site, lu_le: new Date(t).toISOString() }));
}

/** « le 23/11 à 06:56 », from ISO. */
export const luLe = (iso: string) => {
  const [d, h] = localTime(new Date(iso)).split(" ");
  return `le ${d} à ${h}`;
};

/** « le site de la commune de Saint-Louis, lu le 23/11 à 06:56, n'en annonce aucun » (wording validated on 23/11/2026); "" without one. */
export function rienAnnonce(sites: { site: string; lu_le: string }[]): string {
  if (!sites.length) return "";
  return `${sites.map((x) => `le ${x.site}, lu ${luLe(x.lu_le)},`).join(" et ")} n'en annonce${sites.length > 1 ? "nt" : ""} aucun`;
}

/**
 * The mairies whose own sites were all read and announce no event to come, whatever the period asked: « la mairie de
 * Sainte-Marie n'annonce aucun événement en ce moment (dernière lecture le 24/11 à 08:30) », the same sentence in the
 * tool and on /evenements (rule 3 sexies), with the oldest of those reads. Told from the reads only, never from a list:
 * a site that failed, whose copy is no longer served or left to the next question keeps its own message (rule 3 ter),
 * and the sentence goes by itself as soon as the mairie announces an event. A commune none of whose sites is read has none.
 */
export function mairiesMuettes(got: Got[], now: Date): { commune: string; phrase: string }[] {
  const here = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
  const by = new Map<string, Got[]>();
  for (const g of got) if (g.agenda.commune && g.agenda.site_commune) by.set(g.agenda.commune, [...(by.get(g.agenda.commune) ?? []), g]);
  const out: { commune: string; phrase: string }[] = [];
  for (const [commune, gs] of by) {
    if (gs.some((g) => !g.value || g.nonServie || g.echec || g.remise)) continue;
    const toCome = gs.some((g) => g.value!.value.some((e) => e.seances.some((s) => {
      const end = s.fin ?? s.debut;
      return end.length > 10 ? end >= here : end >= here.slice(0, 10);
    })));
    if (toCome) continue;
    const at = new Date(Math.min(...gs.map((g) => g.value!.fetchedAt.getTime()))).toISOString();
    out.push({ commune, phrase: `la mairie ${de(commune)} n'annonce aucun événement en ce moment (dernière lecture ${luLe(at)})` });
  }
  return out.sort((x, y) => x.commune.localeCompare(y.commune, "fr"));
}

/** An agenda served, as a read of the answer: its own time, never left out as reference data (`lentes`). */
const agendaRead = (g: Got): Lecture => ({ key: `agenda:${g.agenda.id}`, fetchedAt: g.value!.fetchedAt.getTime(), stale: false, freshSeconds: 3600, from: g.agenda.source.id });

/** The oldest reading of the agendas whose events are served, ISO; none when none is. */
function oldestRead(got: Got[]): string | undefined {
  const at = got.filter((g) => g.value?.value.length).map((g) => g.value!.fetchedAt.getTime());
  return at.length ? new Date(Math.min(...at)).toISOString() : undefined;
}
