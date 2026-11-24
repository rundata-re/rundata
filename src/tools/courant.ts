/**
 * The power cuts the mairies relay (providers/coupures-courant.ts), as the tool electricite, resume_du_jour and the
 * page /electricite say them: the facts and the link of each notice, in marketing's words; never « pas de coupure »,
 * since most communes publish nothing that can be read.
 */
import type { Cached } from "../cache.js";
import { localTime } from "../geo.js";
import * as cc from "../providers/coupures-courant.js";
import { a as at, credits, de } from "./format.js";
import { injoignable as siteSilent } from "./injoignable.js";
import { copieAncienne, VOIR_COURANT } from "./copie-ancienne.js";

export interface CourantAnswer {
  avis: cc.AvisCourant[];
  /** The mairies read at the last refresh, and those that did not answer. */
  lues: string[];
  indisponibles: string[];
  /**
   * A mairie that did not answer: when its notices were last read (« 25/10 19:50 », and `lu_le` in ISO), and those
   * notices while they are younger than GARDE_MS.
   */
  gardes?: { commune: string; lu_a: string; lu_le?: string }[];
  sources: ReturnType<typeof credits>;
}

/**
 * How long the notices of a mairie that does not answer are kept: under two hours, so that a notice changed or taken off
 * its site is so here within two hours (the copy is refreshed every 30 minutes while it does not answer), as the
 * mairie of Cilaos asked on 26/10/2026. Past it, only when they were read is said.
 */
export const GARDE_MS = 110 * 60_000;

/**
 * The copy shared by the tool and the pages (web/partagees.ts). A mairie that does not answer keeps its notices of the
 * copy before, said with the hour they were read, for GARDE_MS: one failed read does not make its notices vanish, nor
 * its commune read as one that publishes none.
 */
export async function courantCopy(before?: Cached<CourantAnswer>, now = new Date()): Promise<CourantAnswer> {
  const read = await cc.coupures();
  const was = before?.value;
  const since = (x: string) => was?.gardes?.find((g) => g.commune === x);
  const kept = read.indisponibles.filter((x) => followed(x) && (was?.avis.some((a) => a.commune === x) || !!since(x)));
  const gardes = kept.map((x) => ({ commune: x, lu_a: since(x)?.lu_a ?? localTime(before!.fetchedAt), lu_le: since(x)?.lu_le ?? before!.fetchedAt.toISOString() }));
  const young = new Set(gardes.filter((g) => now.getTime() - Date.parse(g.lu_le) < GARDE_MS).map((g) => g.commune));
  return {
    ...read,
    avis: [...read.avis, ...(was?.avis ?? []).filter((a) => young.has(a.commune))],
    gardes: gardes.length ? gardes : undefined,
    sources: credits([cc.SOURCE]),
  };
}

/** EDF's number for a breakdown (free), as https://reunion.edf.fr/particulier/contacter-edf-a-la-reunion gives it (24/10/2026). */
export const EDF_DEPANNAGE: string | undefined = "0800 333 974";
// A mairie whose last notice is older than this is not said to relay them « aujourd'hui ».
const LIVE_DAYS = 90;
// A cut said to be happening now is said so for this long after its notice.
const NOW_HOURS = 24;
const SLOTS_MAX = 4;
// A notice older than this, or of another year, is not shown with its details: only its date.
const RECENT_DAYS = 30;

const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });
const localDay = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
// The year only when it is not the current one: an old notice must not read as this year's.
const year = (day: string, now: Date) => (day.slice(0, 4) === localDay(now).slice(0, 4) ? "" : `/${day.slice(0, 4)}`);
/** « 2026-10-19 » → « lundi 19/10 », « mercredi 14/05/2025 ». */
const dayFr = (day: string, now: Date) => `${WEEKDAY.format(new Date(`${day}T12:00:00Z`))} ${day.slice(8, 10)}/${day.slice(5, 7)}${year(day, now)}`;
/** When a notice was published: « 14/10 », « 30/04/2025 ». */
const ddmm = (iso: string, now: Date) => {
  const day = localDay(new Date(iso));
  return `${day.slice(8, 10)}/${day.slice(5, 7)}${year(day, now)}`;
};
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}` : xs[0] ?? "");

/** « La mairie de Sainte-Marie », « la mairie du Port ». */
export const mairie = (commune: string) => `la mairie ${de(commune)}`;

/**
 * Whether a mairie's notices are read: not those of a mairie that has not agreed, even from a copy kept before
 * (providers/autorisations.ts).
 */
export const followed = (commune: string) => cc.MAIRIES.some((m) => m.commune === commune);

/** The communes whose mairie relayed a notice lately, for the honesty line. */
export function liveCommunes(c: CourantAnswer, now: Date): string[] {
  return [...c.lues, ...(c.gardes ?? []).map((g) => g.commune)].filter((commune) => followed(commune) && c.avis.some((a) => a.commune === commune && now.getTime() - Date.parse(a.publie) < LIVE_DAYS * 86400_000));
}

/**
 * Marketing's honesty line. EDF does publish its cuts for works on reunion.edf.fr, and its robots.txt lets the page be
 * read: its legal notice forbids taking the content (« EDF interdit expressément toute réutilisation, reproduction ou
 * extraction d'éléments de ces bases de données », read on 03/11/2026), so the line says that, never that EDF publishes
 * nothing readable. It names every mairie read, with or without a recent notice, the same whether its site
 * answered or not (that is said apart, `injoignable`).
 */
export function honesty(): string {
  const read = cc.MAIRIES.map((m) => m.commune);
  return `EDF publie ses coupures pour travaux sur son site, mais ses mentions légales interdisent d'en reprendre le contenu sans son accord (lues le 03/11/2026). ` +
    `rundata.re reprend celles que relaient les mairies sur leurs sites${read.length ? `\u00a0: aujourd'hui ${list(read)}, quand ${read.length > 1 ? "leurs" : "ses"} avis sont lisibles` : ""}.`;
}

/**
 * A mairie followed whose site did not answer at the last read (tools/injoignable.ts): with its notices kept, the hour
 * they were read; without, that its read failed. Never « publishes none ». `court` goes in a summary, `texte` in the
 * field `injoignable`.
 */
export function injoignable(c: CourantAnswer, commune: string, readAt: string, now: Date) {
  if (!followed(commune) || !c.indisponibles.includes(commune)) return undefined;
  const site = `${cc.LISIBLES.find((m) => m.commune === commune)!.site}/`;
  // Its notices no longer kept: when they were read, without « ce qui suit ».
  const said = siteSilent(`le site de ${mairie(commune)}`, c.gardes?.find((g) => g.commune === commune)?.lu_a, readAt, now, c.avis.some((a) => a.commune === commune));
  return { commune, ...said, site };
}

export const none = (commune: string) =>
  `rundata.re ${followed(commune) ? "n'a lu aucun avis" : "ne lit pas d'avis"} de coupure d'électricité pour ${commune}, et ne sait donc pas si une coupure y est prévue.`;
export const panne = () => (EDF_DEPANNAGE ? `Panne chez vous ? Le service dépannage d'EDF Réunion répond au ${EDF_DEPANNAGE} (numéro vert).` : undefined);

const ends = (s: cc.Creneau) => s.au ?? s.jour;
/** Whether a notice says something of today or later: a cut to come, or one happening now. */
export function ahead(a: cc.AvisCourant, now: Date): boolean {
  const today = localDay(now);
  if (a.nature === "en cours") return now.getTime() - Date.parse(a.publie) < NOW_HOURS * 3600_000;
  return a.creneaux.some((s) => ends(s) >= today);
}

/** The hours of a day, as written: « de 09:00 à 15:00 », only one of them (« à partir de 09:00 », « jusqu'à 15:00 »), or none. */
const hours = (s: Pick<cc.Creneau, "de" | "a">) =>
  s.de && s.a ? ` de ${s.de} à ${s.a}` : s.de ? ` à partir de ${s.de}` : s.a ? ` jusqu'à ${s.a}` : "";

/**
 * « secteur 650 chemin Balance », « secteurs Rue Médard, Rue des Jésuites »: the singular before one street or address,
 * the plural when the notice gives several, counted on its commas and « et » (marketing, 21/11/2026).
 */
const sectors = (list: string[]) => {
  // « Secteur Le Chrystel » as the notice writes it: the word said once, « secteur Le Chrystel » (marketing, 21/11/2026).
  const names = list.map((x) => x.replace(/^secteur\s+/iu, ""));
  // A place a house number starts is one place, its comma its own (« 65 Centre commercial, bâtiment B »): in a list the
  // comma separates the places, so its own becomes a space (marketing, 21/11/2026).
  const numbered = (x: string) => /^N?°?\s?\d/u.test(x);
  // « Chemin Balance, à proximité du terrain de football »: what follows the comma tells where the place is, no other
  // place (21/11/2026); alone it keeps its comma, in a list a space.
  // « entre le n° 12 et le n° 40 », « jusqu'au carrefour » too (marketing, 21/11/2026): their « et » no other place either.
  const WHERE = "(?:à proximité|à côté|près (?:de|du|des)|face (?:à|au|aux)|en face|devant|derrière|au niveau|aux abords|en bordure|le long|entre|vers|jusqu['’](?:à|au|aux)|après|avant)[\\s'’]";
  const own = (x: string) => (numbered(x) ? x.replace(/\s*,\s*/gu, " ") : x.replace(new RegExp(`\\s*,\\s*(?=${WHERE})`, "giu"), " "));
  const bare = (x: string) => (numbered(x) ? "" : x.replace(new RegExp(`\\s*,\\s*${WHERE}[^,]*`, "giu"), ""));
  const said = names.length > 1 ? names.map(own) : names;
  return `${names.length > 1 || names.some((x) => /,|\set\s/u.test(bare(x))) ? "secteurs" : "secteur"} ${said.join(", ")}`;
};

/**
 * « le lundi 19/10 de 09:00 à 15:00, secteurs Rue Médard, Rue des Jésuites ». `past`: its day is over, said right after
 * the hours, « (date passée) » (marketing, 20/11/2026): only the date is known to be past, never that the cut took place.
 */
function slotText(s: cc.Creneau, now: Date, past = false): string {
  const when = (s.au ? `du ${dayFr(s.jour, now)} au ${dayFr(s.au, now)}` : `le ${dayFr(s.jour, now)}${hours(s)}`) + (past ? " (date passée)" : "");
  // Other places the notice names, not read as streets: said so, the notice's link beside (marketing, 21/11/2026).
  const others = s.autres_lieux ? (s.secteurs.length ? " et d'autres lieux nommés dans l'avis" : ", aux lieux nommés dans l'avis") : "";
  return `${when}${s.secteurs.length ? `, ${sectors(s.secteurs)}` : ""}${others}`;
}

/** A notice of nothing to come, older than a month or of another year: said by its date only. */
const stale = (a: cc.AvisCourant, now: Date) =>
  !ahead(a, now) && (now.getTime() - Date.parse(a.publie) > RECENT_DAYS * 86400_000 || localDay(new Date(a.publie)).slice(0, 4) !== localDay(now).slice(0, 4));

/** « Dernier avis de coupure d'électricité publié par la mairie de Saint-André le 19/11 ». */
const headOf = (a: cc.AvisCourant, now: Date, first: boolean) =>
  `${first ? "Dernier avis" : "Avis"} de coupure d'électricité publié par ${mairie(a.commune)} le ${ddmm(a.publie, now)}`;

/** What one notice says, in marketing's words. `first`: the commune's latest notice, its « dernier avis ». */
export function sentence(a: cc.AvisCourant, now: Date, first = true): string {
  if (stale(a, now)) {
    return `Pas d'avis récent de ${mairie(a.commune)} : le dernier date du ${ddmm(a.publie, now)}. rundata.re ne sait pas si une coupure est prévue.`;
  }
  // A PDF letter of EDF: its day when its name gives it, never its hours nor its streets, which are in the letter only.
  if (a.pdf) {
    const day = a.creneaux[0]?.jour;
    return day
      ? `Coupure d'électricité annoncée par EDF ${at(a.commune)} le ${dayFr(day, now)} : heures et secteurs dans l'avis publié par la mairie`
      : `Avis de coupure d'EDF publié par ${mairie(a.commune)} le ${ddmm(a.publie, now)} : la date, les heures et les secteurs sont dans l'avis`;
  }
  const head = headOf(a, now, first);
  if (a.nature === "en cours") {
    const where = a.secteurs.length ? ` : ${sectors(a.secteurs)}` : "";
    return now.getTime() - Date.parse(a.publie) < NOW_HOURS * 3600_000
      ? `Coupure en cours selon ${mairie(a.commune)} (avis du ${ddmm(a.publie, now)})${where}.`
      : `${head} : coupure en cours ce jour-là${a.secteurs.length ? `, ${sectors(a.secteurs)}` : ""}.`;
  }
  if (!a.creneaux.length) return `${head} : « ${a.titre} ».`;
  const today = localDay(now);
  const coming = a.creneaux.filter((s) => ends(s) >= today);
  const shown = (coming.length ? coming : a.creneaux).slice(0, SLOTS_MAX);
  const more = (coming.length || a.creneaux.length) - shown.length;
  // Nothing to come: each day said past (audit of the AI tools, 20/11/2026: the 29/10 cut given as if to come).
  return `${head} : coupure programmée ${shown.map((x) => slotText(x, now, !coming.length)).join("\u00a0; ")}${more > 0 ? `\u00a0; et ${more} autre${more > 1 ? "s" : ""} dans l'avis` : ""}.`;
}

export interface CourantRow {
  texte: string;
  commune: string;
  /** With `publie_le`, `titre`, `creneaux` and `secteurs`: only for a notice of a cut today or later (`ahead`). */
  nature?: cc.AvisCourant["nature"];
  publie_le?: string;
  titre?: string;
  lien: string;
  creneaux?: cc.Creneau[];
  secteurs?: string[];
  /** The notice is EDF's letter as a PDF: `texte` ends where the link, an arrow, takes over. */
  pdf?: true;
}

/**
 * A notice as the tool says it. One with no cut today or later is its sentence and its link only, the day it was
 * published in the sentence: on 19/11/2026 the full entries of two past notices, Saint-André's of 04/09 and
 * Sainte-Marie's of 02/11, took `electricite` past its 5.5 KB (src/bin/check-sources.ts).
 */
const row = (a: cc.AvisCourant, now: Date, first: boolean): CourantRow =>
  ahead(a, now)
    ? {
        texte: sentence(a, now, first),
        commune: a.commune,
        nature: a.nature,
        publie_le: localTime(new Date(a.publie)),
        titre: a.titre,
        lien: a.lien,
        creneaux: a.creneaux.length ? a.creneaux : undefined,
        secteurs: a.secteurs.length ? a.secteurs : undefined,
        pdf: a.pdf && !stale(a, now) ? true : undefined,
      }
    : { texte: sentence(a, now, first), commune: a.commune, lien: a.lien, pdf: a.pdf && !stale(a, now) ? true : undefined };

/**
 * A notice of a cut today or later in the island's answer of the tool (no commune asked): its first range of hours, how
 * many others, its link; its streets in the notice, and in the answer for its commune (22/11/2026: four mairies' notices
 * took `electricite` to 6.3 KB, past its 5.5, Saint-André's three ranges and their streets 1.25 KB of it). A letter of
 * EDF in PDF and a cut under way keep their sentence, short already.
 */
function brief(a: cc.AvisCourant, now: Date, first: boolean): CourantRow {
  const full = row(a, now, first);
  const coming = a.creneaux.filter((x) => ends(x) >= localDay(now));
  const s = coming[0];
  const own = { commune: full.commune, nature: full.nature, lien: full.lien, ...(full.pdf ? { pdf: full.pdf } : {}) };
  if (a.pdf || a.nature === "en cours" || !s) return { texte: full.texte, ...own };
  const when = s.au ? `du ${dayFr(s.jour, now)} au ${dayFr(s.au, now)}` : `le ${dayFr(s.jour, now)}${s.de && s.a ? ` de ${s.de} à ${s.a}` : ""}`;
  const more = coming.length - 1;
  const others = more ? `, et ${more === 1 ? "1 autre plage" : `${more} autres plages`} dans l'avis` : "";
  const where = coming.some((x) => x.secteurs.length || x.autres_lieux) ? "\u00a0; secteurs dans l'avis" : "";
  return { texte: `${headOf(a, now, first)}\u00a0: coupure programmée ${when}${others}${where}.`, ...own };
}

/**
 * The mairies whose latest notice has nothing to come, in one sentence without their links, in the island's answer of
 * the tool, in marketing's words (22/11/2026: never « sans coupure », read as « no cut »): « Dernier avis sans date à
 * venir : Sainte-Marie (avis du 02/11), Cilaos (avis du 26/10). Une coupure peut y être prévue sans que rundata.re l'ait lue. »
 */
function nothingAhead(latest: cc.AvisCourant[], now: Date): string | undefined {
  if (!latest.length) return undefined;
  const said = latest.map((a) => `${a.commune} (avis du ${ddmm(a.publie, now)})`);
  return `Dernier avis sans date à venir\u00a0: ${said.join(", ")}. Une coupure peut y être prévue sans que rundata.re l'ait lue.`;
}

/** A commune's notices to say: those of today or later, else its latest one; none when its mairie relays none. */
export function rowsOf(c: CourantAnswer, commune: string, now: Date): CourantRow[] {
  const own = followed(commune) ? c.avis.filter((a) => a.commune === commune) : [];
  const coming = own.filter((a) => ahead(a, now));
  return (coming.length ? coming : own.slice(0, 1)).map((a, i) => row(a, now, i === 0 && a === own[0]));
}

/** A commune's notices of today or later only: what resume_du_jour says, nothing on the other days. */
export function aheadRows(c: CourantAnswer, commune: string, now: Date): CourantRow[] {
  const own = followed(commune) ? c.avis.filter((a) => a.commune === commune) : [];
  return own.filter((a) => ahead(a, now)).map((a) => row(a, now, a === own[0]));
}

/**
 * The next range of a notice of a cut today or later, for the commune's tile (web/commune.ts): « lundi 23/11 de 09:00 à
 * 12:30 », and how many others the notice gives after it; none for a notice that names no day.
 */
export function nextSlot(a: Pick<CourantRow, "creneaux">, now: Date): { quand: string; autres: number } | undefined {
  const coming = (a.creneaux ?? []).filter((s) => ends(s) >= localDay(now));
  const s = coming[0];
  if (!s) return undefined;
  // « aujourd'hui de 09:00 à 12:30 » during its day (marketing, 21/11/2026).
  const day = (d: string) => (d === localDay(now) ? "aujourd'hui" : dayFr(d, now));
  const quand = s.au ? `du ${day(s.jour)} au ${dayFr(s.au, now)}` : `${day(s.jour)}${s.de && s.a ? ` de ${s.de} à ${s.a}` : ""}`;
  return { quand, autres: coming.length - 1 };
}

/**
 * « coupure d'électricité programmée le lundi 26/10 de 09:00 à 15:00, secteurs Rue Médard, Rue des Jésuites », for the
 * summary's one line: every range of the next day of cut, each with its streets, in the words of the tool electricite
 * (slotText). Its first range only, without its street, left out Saint-André's second cut of the day, 10:00 to 14:00
 * ruelle Lacotte, that the page and the tool electricite gave (24/11/2026).
 */
export function shortOf(a: Pick<CourantRow, "nature" | "creneaux" | "pdf">, now: Date): string {
  if (a.nature === "en cours") return "coupure d'électricité en cours selon la mairie";
  const coming = (a.creneaux ?? []).filter((s) => ends(s) >= localDay(now));
  const next = coming[0];
  if (!next) return "coupure d'électricité annoncée par la mairie";
  if (a.pdf) return `coupure d'électricité annoncée par EDF le ${dayFr(next.jour, now)}, heures et secteurs dans l'avis de la mairie`;
  // The ranges of that day; a range of several days from it is the one said.
  const day = next.au ? [next] : coming.filter((s) => !s.au && s.jour === next.jour);
  return `coupure d'électricité programmée ${day.map((s) => slotText(s, now)).join("\u00a0; ")}`;
}

/**
 * What the tool electricite adds: the commune's notices, or, when no place is given, the latest of each mairie that
 * relayed one lately (those of the honesty line): a notice of last year says nothing of the island today.
 */
export function courantBlock(copy: Cached<CourantAnswer> | undefined, commune: string | undefined, now: Date, court = false) {
  if (!copy) return { indisponible: "Les avis de coupure relayés par les mairies n'ont pas encore été lus : réessayer plus tard." };
  const c = copy.value;
  // `court`: the tool's answer for the island (tools/electricite.ts); the page's copy keeps every field (its tile).
  const live = commune ? [] : liveCommunes(c, now);
  const own = (x: string) => c.avis.filter((a) => a.commune === x);
  const quiet = court ? live.filter((x) => !own(x).some((a) => ahead(a, now))) : [];
  const avis = commune
    ? rowsOf(c, commune, now)
    : court
      ? live.flatMap((x) => own(x).filter((a) => ahead(a, now)).map((a) => brief(a, now, a === own(x)[0])))
      : live.flatMap((x) => rowsOf(c, x, now));
  const latest = quiet.map((x) => own(x)[0]).sort((a, b) => Date.parse(b.publie) - Date.parse(a.publie));
  const silent = (commune ? [commune] : c.indisponibles).flatMap((x) => injoignable(c, x, localTime(copy.fetchedAt), now) ?? []);
  // The scheduled event has not read them for a while (tools/copie-ancienne.ts): said first in the tool's answer; the
  // page says it at each view, from `lu_le`.
  const ancienne = court ? copieAncienne("courant", copy.fetchedAt, now, "outil") : undefined;
  return {
    avertissement: ancienne && `${ancienne} ${commune ? `Voir le site de ${mairie(commune)}, qui relaie les avis d'EDF.` : VOIR_COURANT}`,
    avis,
    // Marketing's words (22/11/2026).
    sans_date_a_venir: court && !commune ? nothingAhead(latest, now) : undefined,
    detail: court && !commune ? "Plages, secteurs et lien de chaque avis\u00a0: appeler electricite avec la commune." : undefined,
    note: commune && !avis.length && !silent.length ? none(commune) : undefined,
    injoignable: silent.length ? silent : undefined,
    a_savoir: honesty(),
    depannage: panne(),
    lu_a: localTime(copy.fetchedAt),
    lu_le: copy.fetchedAt.toISOString(),
    indisponibles: c.indisponibles.filter(followed).length ? c.indisponibles.filter(followed) : undefined,
  };
}
