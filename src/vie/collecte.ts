/**
 * The days the bins are collected street by street, in the Territoire de l'Ouest (src/vie/collecte.json, built by
 * scripts/build-collecte.py from the TCO's open data), in the East (src/vie/collecte-cirest.json, built by
 * scripts/build-collecte-cirest.py from the CIREST's site, read like a commune's: one request a minute, its source said)
 * in the North (src/vie/collecte-cinor.json, scripts/build-collecte-cinor.py, the CINOR's site read the same way) and in the
 * CASUD's four communes of the South (src/vie/collecte-casud.json, scripts/build-collecte-casud.py, the same way). Each street has a calendar; each calendar the days of each
 * collection. The rhythm said is read from the coming days themselves, so a holiday or a day made up for it, as the
 * calendar gives them, comes before the rule: nothing is assumed that the calendar does not show.
 */
import { normalize } from "../places/resolve.js";
import type { SourceInfo } from "../types.js";
import data from "./collecte.json" with { type: "json" };
import est from "./collecte-cirest.json" with { type: "json" };
import nord from "./collecte-cinor.json" with { type: "json" };
import sud from "./collecte-casud.json" with { type: "json" };

const DAY_MS = 86400_000;

export const SOURCE: SourceInfo = {
  id: "tco_collecte",
  nom: "Calendriers de collecte des déchets du Territoire de l'Ouest",
  organisme: "Territoire de l'Ouest (TCO)",
  licence: "Licence Ouverte Etalab",
  attribution: "Territoire de l'Ouest (TCO)",
  url: "https://data.tco.re/explore/assets/calendriers-de-collectes-du-territoire-de-louest-gru/",
};

/** The CIREST's calendars: its page « Collecte des déchets », a zone for each street and a PDF for each zone. */
export const SOURCE_CIREST: SourceInfo = {
  id: "cirest_collecte",
  nom: "Calendriers de collecte des déchets de la CIREST",
  organisme: "CIREST (Communauté intercommunale Réunion Est)",
  licence: "Information publique de l'intercommunalité, reprise avec sa source et son lien",
  attribution: "CIREST",
  url: "https://www.cirest.fr/collecte-des-dechets/",
};

/** The CINOR's calendars: its page « Calendrier de collecte », a zone for each street and a PDF for each zone. */
export const SOURCE_CINOR: SourceInfo = {
  id: "cinor_collecte",
  nom: "Calendriers de collecte des déchets de la CINOR",
  organisme: "CINOR (Communauté intercommunale du Nord de La Réunion)",
  licence: "Information publique de l'intercommunalité, reprise avec sa source et son lien",
  attribution: "CINOR",
  url: "https://www.cinor.re/calendrier-de-collecte/",
};

/** The CASUD's calendars: its search « Calendrier de collectes », a sector for each street and a PDF for each sector. */
export const SOURCE_CASUD: SourceInfo = {
  id: "casud_collecte",
  nom: "Calendriers de collecte des déchets de la CASUD",
  organisme: "CASUD (Communauté d'agglomération du Sud)",
  licence: "Information publique de l'intercommunalité, reprise avec sa source et son lien",
  attribution: "CASUD",
  url: "https://www.casud.re/au-quotidien/preserver-lenvironnement/collecte-et-traitement-des-dechets",
};

/** Who collects, as the sentences say it (« du TCO », « de la CIREST »), with where to ask. */
export interface Epci {
  id: "tco" | "cirest" | "cinor" | "casud";
  /** « le TCO », « la CIREST ». */
  nom: string;
  /** « du TCO », « de la CIREST ». */
  du: string;
  contact: string;
  source: SourceInfo;
  /** Its calendars' date: put online (TCO), or read (CIREST, CINOR, CASUD, whose pages give none), YYYY-MM-DD. */
  date: string;
}
export const TCO: Epci = { id: "tco", nom: "le TCO", du: "du TCO", contact: "https://www.tco.re/contact", source: SOURCE, date: data.mis_a_jour };
export const CIREST: Epci = { id: "cirest", nom: "la CIREST", du: "de la CIREST", contact: "https://www.cirest.fr/collecte-des-dechets/", source: SOURCE_CIREST, date: est.mis_a_jour };
export const CINOR: Epci = { id: "cinor", nom: "la CINOR", du: "de la CINOR", contact: "https://www.cinor.re/calendrier-de-collecte/", source: SOURCE_CINOR, date: nord.mis_a_jour };
export const CASUD: Epci = { id: "casud", nom: "la CASUD", du: "de la CASUD", contact: SOURCE_CASUD.url, source: SOURCE_CASUD, date: sud.mis_a_jour };
export const EPCIS = [TCO, CIREST, CINOR, CASUD];
/** All four, as the sentences of the whole island say them (/collecte, a street asked without its commune). */
export const TOUS: Pick<Epci, "du"> = { du: "du TCO, de la CIREST, de la CINOR et de la CASUD" };
/** Who collects in a commune whose calendars are read, else all four. */
export const epciDe = (commune?: string): Pick<Epci, "du"> => {
  const s = commune ? STREETS.find((x) => x.commune === commune) : undefined;
  return s ? epciOf(s) : TOUS;
};

export type Kind = "OM" | "BIO" | "CS" | "DV" | "EN";
interface Calendar {
  code: string;
  epci: Epci["id"];
  pdf: string;
  OM?: number[];
  /** The biowaste's brown bin (the CINOR, at Saint-Denis): the same days as the grey one. */
  BIO?: number[];
  CS?: number[];
  DV?: number[];
  EN?: number[];
  /** The holidays the calendar marks, days without collection unless made up on another day. */
  F?: number[];
}

export const CALENDARS: Calendar[] = [
  ...(data.calendriers as Omit<Calendar, "epci">[]).map((c) => ({ ...c, epci: "tco" as const })),
  ...(est.calendriers as Omit<Calendar, "epci">[]).map((c) => ({ ...c, epci: "cirest" as const })),
  ...(nord.calendriers as Omit<Calendar, "epci">[]).map((c) => ({ ...c, epci: "cinor" as const })),
  ...(sud.calendriers as Omit<Calendar, "epci">[]).map((c) => ({ ...c, epci: "casud" as const })),
];
// All four publish the same year's calendars (test/collecte.test.ts checks it).
export const YEAR = data.annee;
export const UPDATED = data.mis_a_jour;
/** The day the CIREST's calendars were read. */
export const UPDATED_CIREST = est.mis_a_jour;
/** The day the CINOR's calendars were read. */
export const UPDATED_CINOR = nord.mis_a_jour;
/** The day the CASUD's calendars were read. */
export const UPDATED_CASUD = sud.mis_a_jour;
export interface Street {
  nom: string;
  commune: string;
  /** Its calendar in CALENDARS; -1 for a street the TCO lists without one (code « NC »). */
  calendrier: number;
  epci: Epci["id"];
}
export const STREETS: Street[] = [
  ...(data.voies as [string, string, number][]).map(([nom, commune, calendrier]) => ({ nom, commune, calendrier, epci: "tco" as const })),
  ...(est.voies as [string, string, number][]).map(([nom, commune, calendrier]) => ({ nom, commune, calendrier: calendrier + data.calendriers.length, epci: "cirest" as const })),
  ...(nord.voies as [string, string, number][]).map(([nom, commune, calendrier]) => ({ nom, commune, calendrier: calendrier + data.calendriers.length + est.calendriers.length, epci: "cinor" as const })),
  ...(sud.voies as [string, string, number][]).map(([nom, commune, calendrier]) => ({ nom, commune, calendrier: calendrier + data.calendriers.length + est.calendriers.length + nord.calendriers.length, epci: "casud" as const })),
];
export const epciOf = (x: { epci: Epci["id"] }) => ({ tco: TCO, cirest: CIREST, cinor: CINOR, casud: CASUD })[x.epci];
export const COMMUNES = ["Saint-Paul", "La Possession", "Saint-Leu", "Le Port", "Les Trois-Bassins", "Saint-André", "Bras-Panon", "Saint-Benoît", "Salazie", "La Plaine-des-Palmistes", "Saint-Denis", "Sainte-Marie", "Sainte-Suzanne", "Le Tampon", "Saint-Joseph", "Saint-Philippe", "Entre-Deux"].filter((c) => STREETS.some((s) => s.commune === c));
/** « saint-paul », « trois-bassins »: the page of a commune. */
export const communeSlug = (c: string) => normalize(c.replace(/^Les /, "")).replace(/ /g, "-");

/**
 * The other communes, by the intercommunality that collects their waste (geo.api.gouv.fr, EPCI of each commune, read on
 * 04/11/2026), with its home page (200 that day, no deep link). Their calendars are not read; Sainte-Rose's, of the
 * CIREST, are not on its site (24/11/2026: its streets known to the form, given no zone).
 */
export const AILLEURS: { nom: string; site: string; communes: string[] }[] = [
  { nom: "la CIREST", site: "https://www.cirest.fr/collecte-des-dechets/", communes: ["Sainte-Rose"] },
  { nom: "la CIVIS", site: "https://www.civis.re/", communes: ["Saint-Pierre", "Saint-Louis", "L'Étang-Salé", "Petite-Île", "Cilaos", "Les Avirons"] },
];
// The validated words (04/11/2026), for a commune outside the TCO: never a street to spell again.
export const ailleurs = (commune: string, epci: { nom: string }) =>
  commune === "Sainte-Rose"
    ? `Sainte-Rose : le calendrier de collecte de ses rues n'est pas publié en ligne. rundata.re reprend ceux des autres communes de l'Est, ceux du TCO, ceux de la CINOR et ceux de la CASUD. Voir le site de la CIREST.`
    : `${commune} : la collecte des déchets y est assurée par ${epci.nom}, dont les calendriers ne sont pas repris ici. rundata.re reprend ceux du TCO (Le Port, La Possession, Saint-Paul, Trois-Bassins, Saint-Leu), de la CIREST (Saint-André, Bras-Panon, Saint-Benoît, Salazie, La Plaine-des-Palmistes), de la CINOR (Saint-Denis, Sainte-Marie, Sainte-Suzanne) et de la CASUD (Le Tampon, Saint-Joseph, Saint-Philippe, L'Entre-Deux). Voir le site de ${epci.nom}.`;

// The validated words, said by the tool and the pages.
export const NOT_FOUND = "Rue non trouvée dans les calendriers du TCO, de la CIREST, de la CINOR et de la CASUD. Vérifiez l'orthographe, ou essayez le nom du quartier.";
// A street the TCO lists without a calendar: nothing is inferred, its contact page is the link of the arrow.
export const NO_CALENDAR = `les calendriers ${YEAR} du TCO ne donnent pas de jour de collecte pour cette voie, et rundata.re ne sait pas si elle est collectée au porte-à-porte. Renseignez-vous auprès du TCO →`;
// The same above the list of such streets on a page.
export const NO_CALENDAR_LIST = `Les calendriers ${YEAR} du TCO ne donnent pas de jour de collecte pour ces voies, et rundata.re ne sait pas si elles sont collectées au porte-à-porte. Renseignez-vous auprès du TCO →`;
export const TCO_CONTACT = "https://www.tco.re/contact";
/** Past the calendars' year, nothing of it is applied to the next. */
export const notYet = (e: Pick<Epci, "du"> = TCO) => `Les calendriers ${YEAR + 1} ${e.du} ne sont pas encore publiés : rundata.re ne peut pas encore donner les jours de collecte.`;
/**
 * Near the year's end, above the days still given: they hold until the 31st of December. notYet() there read as if no
 * day were given, above the days (24/11/2026). The validated words, whole in the tool's answer too.
 */
export const untilYearEnd = (e: Pick<Epci, "du"> = TCO) => `Jours de collecte valables jusqu'au 31 décembre ${YEAR} : les calendriers ${YEAR + 1} ${e.du} ne sont pas encore publiés.`;
const YEAR_DAYS = (Date.UTC(YEAR + 1, 0, 1) - Date.UTC(YEAR, 0, 1)) / DAY_MS;
/** Whether `today` is past the calendars' year. */
export const pastYear = (today: number) => today > YEAR_DAYS;
/** Whether the coming eight weeks, read for the rhythm, reach past the calendars' year. */
export const nearYearEnd = (today: number) => today + 56 > YEAR_DAYS;
const jj = (d: string) => d.split("-").reverse().join("/");
export const honesty = () =>
  `Seulement les communes de l'Ouest (TCO), de l'Est (CIREST, sauf Sainte-Rose), du Nord (CINOR) et de la CASUD dans le Sud pour l'instant. Calendriers ${YEAR} publiés par le TCO (data.tco.re), mis à jour le ${jj(UPDATED)}, par la CIREST (cirest.fr), lus le ${jj(UPDATED_CIREST)}, par la CINOR (cinor.re), lus le ${jj(UPDATED_CINOR)}, et par la CASUD (casud.re), lus le ${jj(UPDATED_CASUD)}. En cas d'alerte cyclonique, la collecte peut être suspendue : suivez les annonces du TCO, de la CIREST, de la CINOR et de la CASUD.`;

// In the validated order.
const KINDS: [Kind, string][] = [["OM", "ordures ménagères"], ["BIO", "biodéchets (bac marron)"], ["CS", "tri"], ["DV", "déchets verts"], ["EN", "encombrants"]];
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const NTH = ["1er", "2e", "3e", "4e", "5e"];

/** Day numbers of the calendar's year, 1 for 1 January, as the JSON keeps them. */
const dateOf = (n: number) => new Date(Date.UTC(YEAR, 0, n));
const dayOf = (d: Date) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(YEAR, 0, 1)) / DAY_MS) + 1;
/** Today at La Réunion, as a day number of the calendar's year. */
export const todayOf = (now: Date) => dayOf(new Date(now.getTime() + 4 * 3600_000));
const wd = (n: number) => dateOf(n).getUTCDay();
/** « 4/11 ». */
const dm = (n: number) => `${dateOf(n).getUTCDate()}/${dateOf(n).getUTCMonth() + 1}`;
/** « jeudi 12/11 ». */
const dayFr = (n: number) => `${WEEKDAYS[wd(n)]} ${dm(n)}`;
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}` : xs[0] ?? "");

/** The weekdays a collection keeps week after week in the coming eight weeks (a holiday's shift aside). */
function weekly(days: number[], today: number): number[] | undefined {
  const soon = days.filter((n) => n >= today && n < today + 56);
  if (soon.length < 7) return undefined;
  const weeks = (w: number) => new Set(soon.filter((n) => wd(n) === w).map((n) => Math.floor((n - today) / 7))).size;
  const kept = [0, 1, 2, 3, 4, 5, 6].filter((w) => weeks(w) >= 6);
  return kept.length && soon.length <= kept.length * 8 + 1 ? kept.sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)) : undefined;
}

/**
 * The weekday a collection keeps every other week in the coming eight weeks: the days 12 to 16 apart, all but one on
 * that weekday (a holiday moves one by a day or two).
 */
function fortnightly(days: number[], today: number): number | undefined {
  const soon = days.filter((n) => n >= today && n < today + 56);
  if (soon.length < 3 || !soon.slice(1).every((n, i) => Math.abs(n - soon[i] - 14) <= 2)) return undefined;
  const w = wd(soon.find((n, i) => wd(n) === wd(soon[(i + 1) % soon.length])) ?? soon[0]);
  return soon.filter((n) => wd(n) !== w).length <= 1 ? w : undefined;
}

/**
 * What a collection's coming days say: its rhythm when it keeps one, else its next days. Undefined without any.
 * `feries`, the calendar's holidays: a next day off the rhythm's weekday with no holiday in its week (one moves the days
 * after it) is not moved by one, but the last of another rhythm, said apart (« le mardi 24/11, puis le lundi, une
 * semaine sur deux »).
 */
export function rhythm(days: number[] | undefined, today: number, feries?: number[]): string | undefined {
  const next = (days ?? []).filter((n) => n >= today);
  if (!next.length) return undefined;
  const w = weekly(next, today);
  if (w) return list(w.map((x) => `le ${WEEKDAYS[x]}`));
  // Every other week, the same weekday: said with the next one, for the week it falls in.
  const f = fortnightly(next, today);
  const first = next[0] === today ? "aujourd'hui" : undefined;
  if (f !== undefined && feries && wd(next[0]) !== f && !first && !feries.some((h) => h >= next[0] - 6 && h <= next[0] + 2)) {
    return `le ${dayFr(next[0])}, puis le ${WEEKDAYS[f]}, une semaine sur deux`;
  }
  if (f !== undefined) return `le ${WEEKDAYS[f]}, une semaine sur deux (prochain : ${first ?? (wd(next[0]) === f ? dm(next[0]) : dayFr(next[0]))})`;
  // The same weekday of the month, four months on.
  const months = next.filter((n) => n < today + 122);
  const nth = (n: number) => Math.floor((dateOf(n).getUTCDate() - 1) / 7);
  if (months.length >= 3 && months.every((n) => wd(n) === wd(months[0]) && nth(n) === nth(months[0])) && new Set(months.map((n) => dateOf(n).getUTCMonth())).size === months.length) {
    return `le ${NTH[nth(months[0])]} ${WEEKDAYS[wd(months[0])]} du mois (prochain : ${first ?? dm(months[0])})`;
  }
  const shown = next.slice(0, 3);
  // « les lundis 7/12, 21/12 », but « le lundi 7/12 » for one day.
  return shown.length > 1 && shown.every((n) => wd(n) === wd(shown[0]))
    ? `les ${WEEKDAYS[wd(shown[0])]}s ${shown.map(dm).join(", ")}${next.length > 3 ? "…" : ""}`
    : `${list(shown.map((n) => `le ${dayFr(n)}`))}${next.length > 3 ? "…" : ""}`;
}

/**
 * « ordures ménagères le lundi et le jeudi ; tri le mercredi, une semaine sur deux (prochain : 4/11) ; … ». Past the
 * calendars' year, undefined: nothing of a year is said of the next (notYet()).
 */
export function rhythmOf(c: Calendar, today: number): string | undefined {
  if (pastYear(today)) return undefined;
  return rhythmParts(c, today).map((p) => p.texte).join("\u00a0; ");
}

/** Each collection's part of rhythmOf, in the validated order: « tri le lundi, une semaine sur deux (prochain : 16/11) ». */
export function rhythmParts(c: Calendar, today: number): { kind: Kind; texte: string }[] {
  return KINDS.flatMap(([k, name]) => {
    const r = rhythm(c[k], today, c.F ?? []);
    return r ? [{ kind: k, texte: `${name} ${r}` }] : [];
  });
}

const ahead = (days: number[] | undefined, today: number) => (days ?? []).filter((n) => n >= today);

/** Whether two calendars collect on the same days from today to the end of their year, every collection and holiday alike. */
export function sameDays(a: Calendar, b: Calendar, today: number): boolean {
  return ([...KINDS.map(([k]) => k), "F"] as const).every((k) => ahead(a[k], today).join() === ahead(b[k], today).join());
}

/**
 * The first collection from today where a calendar's days part from another's, said with its own day of it: for
 * calendars that their rhythms say alike, but that part later in the year (« déchets verts le jeudi 14/1 »). Undefined
 * when it has no day of that collection left, or when only holidays part them.
 */
export function firstApart(c: Calendar, others: Calendar[], today: number): string | undefined {
  let first: { day: number; kind: Kind; name: string } | undefined;
  for (const [k, name] of KINDS) {
    const mine = new Set(ahead(c[k], today));
    for (const o of others) {
      const theirs = new Set(ahead(o[k], today));
      const apart = [...mine].filter((n) => !theirs.has(n)).concat([...theirs].filter((n) => !mine.has(n)));
      const day = Math.min(...apart);
      if (apart.length && (!first || day < first.day)) first = { day, kind: k, name };
    }
  }
  if (!first) return undefined;
  const { day, kind, name } = first;
  const own = ahead(c[kind], day)[0];
  return own === undefined ? undefined : `${name} le ${dayFr(own)}`;
}

/**
 * The holidays of the next two weeks that fall on a usual day of collection, and the day the calendar makes it up
 * when it does (a day of the same collection within the week, outside its usual weekdays).
 */
export function holidays(c: Calendar, today: number): { jour: number; reportee?: number }[] {
  return (c.F ?? [])
    .filter((h) => h >= today && h < today + 14)
    .flatMap((h) => {
      let hit = false;
      let made: number | undefined;
      for (const [k] of KINDS) {
        const days = c[k] ?? [];
        if (days.includes(h)) continue;
        // Its usual weekdays around the holiday: every week, or every other week when the holiday falls in its week.
        const w = weekly(days, h - 28);
        const f = w ? undefined : fortnightly(days, h - 28);
        const usual = w ?? (f !== undefined && (days.includes(h - 14) || days.includes(h + 14)) ? [f] : []);
        if (!usual.includes(wd(h))) continue;
        hit = true;
        made ??= days.find((n) => n > h && n <= h + 6 && !usual.includes(wd(n)));
      }
      return hit ? [{ jour: h, reportee: made }] : [];
    });
}

/** The validated holiday sentence, or its fallback when the calendar shows no day made up. */
export function holidayLine(x: { jour: number; reportee?: number }, e: Epci = TCO): string {
  return x.reportee
    ? `Jour férié le ${dm(x.jour)} : collecte reportée au ${dayFr(x.reportee)}, selon le calendrier ${e.du}.`
    : `Jour férié : vérifiez le calendrier ${e.du} (PDF) →`;
}

/** « Rue Labourdonnais, Saint-Paul : ordures ménagères le lundi et le jeudi ; … ». */
export function streetLine(s: Street, today: number): string {
  const cal = CALENDARS[s.calendrier];
  const head = `${streetName(s)}, ${s.commune} : `;
  if (!cal) return head + NO_CALENDAR;
  const r = rhythmOf(cal, today);
  const e = epciOf(s);
  if (r === undefined) return notYet(e);
  return `${head}${r}.${nearYearEnd(today) ? ` ${untilYearEnd(e)}` : ""}`;
}

/**
 * Its name as said. The bracket at the end of a TCO or CIREST name says the commune, the district or the stretch
 * (« (Trois Bassins) », « (de la Rn3 au Rond-Point) »): left out. Those of the CINOR and the CASUD are a part of the
 * name (« Chemin Safer (Grand Coude) », « Impasse Morel (Jean) »): their builders have already put a stretch after
 * « , » (27/11/2026).
 */
export const streetName = (s: Street) => {
  const nom = s.epci === "cinor" || s.epci === "casud" ? tidy(s.nom) : s.nom;
  return !balanced(nom) ? nom.replace(/\s*\(.*$/, "") : s.epci === "tco" || s.epci === "cirest" || badBracket(nom) ? nom.replace(/\s*\([^)]*\)$/, "") : nom;
};

// The kinds of way a name starts with, and the road numbers: written twice by mistake (« Chemin Chemin Guevara »,
// « N2002 N2002 »), where « Rue Ylang Ylang », « Allée Monsieur Lou Lou » are names.
const TWICE = /^(Allée|Avenue|Boulevard|Chemin|Impasse|Lotissement|Résidence|Route|Rue|Ruelle|[A-Z]{1,2}\d+)\s+\1\b/;
// The short forms and acronyms the CINOR writes, each one seen in its lists, written out (27/11/2026).
const WRITTEN: [RegExp, string][] = [
  [/\bShlmr\b/g, "SHLMR"], [/\bSidr\b/g, "SIDR"], [/\bSodiac\b/g, "SODIAC"], [/\bZac\b/g, "ZAC"], [/\(Z\.a\.\)/g, "(ZA)"],
  [/^Lot\.? /, "Lotissement "], [/\bLot\.? (?=\p{Lu})/gu, "lotissement "], [/\bImm /g, "immeuble "], [/\bch\.commins\b/g, "chemin Commins"],
  [/\(Rle /g, "(ruelle "], [/\(R (?=\p{Lu})/gu, "(rue "], [/\(Bande de Roulement /g, "(bande de roulement "],
];
/**
 * A name of the CINOR or the CASUD as it should read: a word written twice, the short forms and acronyms, a space
 * before « , » or between two numbers (« 25b , », « n° 2 -2b »), the number of an impasse put after its name
 * (« Impasse (1) des Pruniers » → « Impasse des Pruniers (1) »), a bracket left open inside another closed
 * (« (avenue Mahatma Gandhi (Marine) » → « (avenue Mahatma Gandhi, Marine) »).
 */
export function tidy(nom: string): string {
  let n = nom.replace(TWICE, "$1");
  for (const [re, w] of WRITTEN) n = n.replace(re, w);
  n = n.replace(/\s+,/g, ",").replace(/(\d\w*) -(?=\d)/g, "$1-");
  n = n.replace(/^(\p{L}+) \((\d+)\) (.+)$/u, "$1 $3 ($2)");
  if (!balanced(n)) n = n.replace(/\(([^()]*) \(([^()]*)\)$/, "($1, $2)");
  return n;
}

const balanced = (nom: string) => (nom.match(/\(/g) ?? []).length === (nom.match(/\)/g) ?? []).length;

// French words start with a vowel, one consonant or one of these pairs; « Rle », « Shlmr » are short forms.
const ONSETS = new Set(["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gn", "gr", "ph", "pl", "pr", "ps", "sc", "sp", "st", "th", "tr", "vr"]);
const VOWEL = /[aeiouyàâäéèêëîïôöùûü]/i;
/**
 * A bracket at the end of a name the CINOR wrote short or broken (« (P.cailloux) », « (Z.a.) », « (Shlmr) »,
 * « (Rle Turpin) », « N2002 N2002 (avenue Mahatma Gandhi (Marine) »): left out until those names are written again,
 * where « (Grand Coude) », « (secteur B) » stay (27/11/2026).
 */
export function badBracket(nom: string): boolean {
  const m = nom.match(/\(([^()]*)\)$/);
  if (!m) return false;
  if (!balanced(nom)) return true;
  if (m[1].includes(".")) return true;
  // An acronym (« SHLMR », written out by tidy) is not a short form.
  return m[1].split(/[\s'-]+/).some((w) => /^\p{L}{2,}$/u.test(w) && !/^\p{Lu}+$/u.test(w) && (!VOWEL.test(w) || (!VOWEL.test(w[0]) && !VOWEL.test(w[1]) && !ONSETS.has(w.slice(0, 2).toLowerCase()))));
}

// « r. » for « rue », and the other short forms people type.
const SHORT: [RegExp, string][] = [[/\br\b\.?/g, "rue"], [/\bch\b\.?/g, "chemin"], [/\bav\b\.?/g, "avenue"], [/\bbd\b\.?/g, "boulevard"], [/\bimp\b\.?/g, "impasse"], [/\bst\b/g, "saint"], [/\bste\b/g, "sainte"]];
// « œ » as typed on a phone, « oe » (« Chemin Œillets », « Allée Sœurs »): NFD keeps the ligature whole.
const key = (s: string) => SHORT.reduce((t, [re, w]) => t.replace(re, w), normalize(s.replace(/\([^)]*\)/g, " ").replace(/œ/gi, "oe")));

const holds = (k: string, words: string[]) => words.every((w) => k.split(" ").includes(w) || (w.length > 3 && k.includes(w)));

/**
 * The streets whose name holds every word asked, in a commune when one is given: the exact name first, then the
 * streets whose own name (before « , ») holds them. « Rue Hubert Delisle » before « Rue Jules Bertaut, de la rue des
 * Flamboyants à la rue Hubert Delisle », a stretch the CASUD names by the streets at its ends.
 */
export function findStreets(asked: string, commune?: string): Street[] {
  const q = key(asked);
  if (q.length < 3) return [];
  const words = q.split(" ").filter(Boolean);
  const pool = commune ? STREETS.filter((s) => s.commune === commune) : STREETS;
  // A name's bracket of the CINOR or the CASUD is a part of it (streetName): its words found too (« Chemin Safer Grand
  // Coude »); the TCO's and the CIREST's still set aside.
  // Found by its name as said (tidy) and as the CINOR wrote it (« Lot Duparc »).
  const said = (s: Street) => (s.epci === "tco" || s.epci === "cirest" ? s.nom : tidy(s.nom).replace(/[()]/g, " "));
  const raw = (s: Street) => (s.epci === "tco" || s.epci === "cirest" ? s.nom : s.nom.replace(/[()]/g, " "));
  const head = (s: Street) => key(said(s).split(", ")[0]);
  const rank = (s: Street) => (key(said(s)) === q || key(raw(s)) === q ? 2 : holds(head(s), words) ? 1 : 0);
  return pool.filter((s) => holds(key(said(s)), words) || holds(key(raw(s)), words)).sort((x, y) => rank(y) - rank(x) || x.nom.length - y.nom.length);
}
