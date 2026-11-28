/**
 * The TCO's « Communiqués & infos pratiques » (www.tco.re/feed, the intercommunality's own site, rule of the communes'
 * public data): about three a week, among them the collections put off (« Collectes de rattrapage des déchets : des
 * tournées reportées au samedi 7 novembre dans certains secteurs de La Possession et St Leu », 05/11/2026) and the
 * déchèteries closed. Only those are kept: a notice about the bins or a déchèterie that says a change (put off, caught
 * up, closed, disrupted). Of each, its title, its date, its link and the communes it names (its title's first; all five
 * when it names none),
 * shown until the last day it gives, else three days; a closure « à partir du » with no end, a month.
 *
 * The feed weighs about 60 KB: read at most every two hours, only when a page or a question asks.
 */
import type { Cache, Cached } from "../cache.js";
import { getText, httpUrl, UA_RUNDATA } from "../http.js";
import type { SourceInfo } from "../types.js";
import { placesIn, plain } from "./actualites.js";

export const SOURCE: SourceInfo = {
  id: "tco_communiques",
  nom: "Communiqués et infos pratiques du TCO",
  organisme: "Territoire de l'Ouest (TCO)",
  licence: "Information publique de l'intercommunalité, reprise avec sa source et son lien",
  attribution: "TCO (www.tco.re)",
  url: "https://www.tco.re/feed",
};

export const FRESH_SECONDS = 2 * 3600;
export const TCO_COMMUNES = ["Le Port", "La Possession", "Saint-Paul", "Les Trois-Bassins", "Saint-Leu"] as const;
const CATEGORY = "Communiqués & infos pratiques";
const BINS = /\b(collectes?|tournées?|bacs?|ramassages?|encombrants|déchets verts)\b/iu;
const DECHETERIE = /d[ée]ch[eè]t+erie/iu;
const CHANGE = /report|rattrap|ferm[ée]|fermeture|perturb|suspen|annul|décal|modifi|exceptionnel|(?:pas|non) assurée/iu;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAY_MS = 86_400_000;

export interface Communique {
  titre: string;
  lien: string;
  /** Its date, ISO. */
  publie: string;
  /** The end of the last day it is about (La Réunion's midnight), ISO. */
  jusqu_au: string;
  sujet: "collecte" | "decheterie";
  communes: string[];
}

/** La Réunion's midnight that ends a day (UTC+4). */
const endOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d + 1) - 4 * 3600_000);

/** The last day a notice is about: the latest « 7 novembre » of its text, in the year of its date (or the next one). */
function lastDay(text: string, published: Date): Date {
  const local = new Date(published.getTime() + 4 * 3600_000);
  let last = endOf(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let dated = false;
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:er)? (${MONTHS.join("|")})(?: (\\d{4}))?`, "giu"))) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    let year = m[3] ? Number(m[3]) : local.getUTCFullYear();
    if (!m[3] && month < local.getUTCMonth() - 6) year++;
    const day = endOf(year, month, Number(m[1]));
    // A day long past its date is a reminder of the past (« depuis le 3 novembre »), not when it ends.
    if (day.getTime() > published.getTime() - DAY_MS) dated = true;
    if (day > last) last = day;
  }
  const open = /à partir d|jusqu'à nouvel|nouvel avis/iu.test(text) && !/jusqu'au \d/iu.test(text);
  if (open) return new Date(Math.max(last.getTime(), published.getTime() + 30 * DAY_MS));
  return dated ? last : new Date(Math.max(last.getTime(), published.getTime() + 3 * DAY_MS));
}

const tag = (block: string, t: string) => {
  const open = block.indexOf(`<${t}>`);
  const close = block.indexOf(`</${t}>`, open);
  return open < 0 || close < 0 ? "" : block.slice(open + t.length + 2, close);
};

/** The notices of the feed that put off a collection or close a déchèterie. */
export function parse(xml: string): Communique[] {
  const out: Communique[] = [];
  for (const [, it] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const categories = [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map(([, c]) => plain(c));
    if (!categories.includes(CATEGORY)) continue;
    const titre = plain(tag(it, "title"));
    const text = `${titre} ${plain(tag(it, "content:encoded") || tag(it, "description"))}`;
    // Its title says what it is about; its text only when the title says neither: a collection put off whose text adds
    // « vous pouvez aussi déposer vos encombrants en déchèterie » stays a collection.
    const about = (t: string) => (DECHETERIE.test(t) ? "decheterie" : BINS.test(t) ? "collecte" : undefined);
    const sujet = about(titre) ?? about(text);
    if (!sujet || !CHANGE.test(text)) continue;
    const published = new Date(plain(tag(it, "pubDate")));
    if (Number.isNaN(published.getTime())) continue;
    // Its link, only the web's (http or https): a release without one is not kept, since the page sends to it.
    const lien = httpUrl(plain(tag(it, "link")));
    if (!lien) continue;
    // The communes of its title when it names some: its text names quarters (« Rivière des Galets » at La Possession)
    // that the gazetteer also puts in a neighbour.
    const ours = (t: string) => placesIn(t).communes.filter((c) => (TCO_COMMUNES as readonly string[]).includes(c));
    const named = ours(titre).length ? ours(titre) : ours(text);
    out.push({
      titre,
      lien,
      publie: published.toISOString(),
      jusqu_au: lastDay(text, published).toISOString(),
      sujet,
      communes: named.length ? named : [...TCO_COMMUNES],
    });
  }
  return out;
}

export function communiques(cache: Cache): Promise<Cached<Communique[]>> {
  return cache.get("tco:communiques", FRESH_SECONDS, async () => parse(await getText(SOURCE.id, SOURCE.url, 15_000, { "User-Agent": UA_RUNDATA })));
}

/** The notices still running at `now`, about `sujet`, for `commune` (any of the TCO's when none). */
export function running(list: readonly Communique[], now: Date, sujet: Communique["sujet"], commune?: string): Communique[] {
  return list.filter((c) => c.sujet === sujet && Date.parse(c.publie) <= now.getTime() && now.getTime() < Date.parse(c.jusqu_au) && (!commune || c.communes.includes(commune)));
}

/** « Communiqué du TCO du 05/11 : « Collectes de rattrapage… » », its date in La Réunion. */
export function line(c: Communique): string {
  const d = new Date(Date.parse(c.publie) + 4 * 3600_000);
  return `Communiqué du TCO du ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}\u00a0: «\u00a0${c.titre}\u00a0»`;
}
