import type { Cache, Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import { type Fil, type Info, LUS, SOURCES as ACTU } from "../providers/actualites.js";
import { httpUrl, versBilletterie } from "../http.js";
import { type Agenda, AGENDAS, type Evenement, LIGUE_VOLLEY, type MatchLigue, LISIBLES, type nonServie, type programmesSportifs, reserve, SPORTSREGIONS, sportDesAgendas } from "../providers/agenda.js";
import { autorisee, nonAutorisee } from "../providers/autorisations.js";
import * as ffck from "../providers/ffck.js";
import * as src from "../providers/sport.js";
import * as avis from "../providers/sport-avis.js";
import { type Club, clubOf, clubsNamed, type ClubSport, zoneOf } from "../sport/clubs.js";
import { type SourceInfo, why } from "../types.js";
import { a, credits, de, enumeration, notFound, placeBlock, text } from "./format.js";
import { deNom } from "../articles.js";
import { mentionLa1ere, mentionSports } from "./non-repris.js";
import { injoignable } from "./injoignable.js";
import { rienTrouve } from "../vide.js";

export type Sport = "grand_raid" | "handball" | "volley" | "beach_volley" | "basket" | "voile" | "golf" | "sport_auto" | "canoe_kayak" | "football";
export type Quand = "aujourd_hui" | "demain" | "samedi" | "dimanche" | "ce_week_end" | "a_venir" | "resultats";

export const SPORTS: Sport[] = ["grand_raid", "handball", "volley", "beach_volley", "basket", "voile", "golf", "sport_auto", "canoe_kayak", "football"];
export const QUANDS: Quand[] = ["aujourd_hui", "demain", "samedi", "dimanche", "ce_week_end", "a_venir", "resultats"];
const NAMES: Record<Sport, string> = {
  grand_raid: "Grand Raid",
  handball: "handball",
  volley: "volley-ball",
  beach_volley: "beach-volley",
  basket: "basket-ball",
  voile: "voile",
  golf: "golf",
  sport_auto: "sport automobile",
  canoe_kayak: "canoë-kayak et va'a",
  football: "football",
};
// The sports read from a federation's site, by the key of src/providers/autorisations.ts.
const FEDERATION: Partial<Record<Sport, string>> = { voile: "ffvoile", golf: "ffgolf", canoe_kayak: "ffck" };
// Sports with no official source read.
const NEWS_ONLY: Partial<Record<Sport, string>> = {
  football: "Les résultats officiels du football (FFF, Ligue réunionnaise) ne sont pas lisibles par ce service.",
  basket: "Le calendrier et les résultats officiels du basket (FFBB) ne sont pas encore lus par ce service.",
};

/**
 * Football's headlines in the island's news, until the league's results can be read: those of Le Quotidien and Imaz
 * Press, from the copy `actualites` keeps (its last three days), never read again for this. Their headline, time,
 * medium and link only: the article is on the medium's site.
 */
const FOOT_MEDIAS = LUS.filter((m) => m.media === "Le Quotidien" || m.media === "Imaz Press");
const FOOT = /(?<![a-z])(?<!baby )(?:foot|football\w*|futsal|ballon rond)(?![a-z])/;
const FOOT_MAX = 15;
/** « du Quotidien et d'Imaz Press ». */
const FOOT_DE = enumeration(FOOT_MEDIAS.map((m) => (m.media.startsWith("Le ") ? de(m.media) : deNom(m.media))));
const TITRES_FOOT: SourceInfo = {
  ...ACTU.medias,
  nom: `Titres football de la presse de La Réunion : ${enumeration(FOOT_MEDIAS.map((m) => m.media))}`,
  attribution: FOOT_MEDIAS.map((m) => m.credit).join(", "),
};

/** The football headlines of `infos`, newest first: the medium's own, never another's title under its name. */
export function titresFootball(infos: Info[] | undefined, max = FOOT_MAX): { titre: string; media: string; publie: string; lien: string }[] {
  const medias = new Set<string>(FOOT_MEDIAS.map((m) => m.media));
  return (infos ?? [])
    .filter((i) => medias.has(i.media) && FOOT.test(normalize(`${i.titre} ${i.resume ?? ""}`)))
    .sort((x, y) => y.publie.localeCompare(x.publie))
    .slice(0, max)
    .map((i) => {
      const local = localClock(new Date(i.publie));
      return { titre: i.titre, media: i.media, publie: quand(i.heure ? local : local.slice(0, 10)), lien: i.lien };
    });
}

const AHEAD_DAYS = 14;
const BACK_DAYS = 7;
// For one sport, back to its last round: the regional championships often pause for three weeks.
const BACK_DAYS_ONE = 30;
const UPCOMING_MAX = 40;
// The tool's answer: 20 (40 were 13,6 KB of a 28 KB answer, 5/11/2026), the cancelled or postponed ones past them kept.
// The page /sport keeps UPCOMING_MAX.
export const UPCOMING_OUTIL = 20;
const RESULTS_MAX = 30;
// The tool's answer: the 15 most recent (30 were 10,6 KB of a 22 KB answer, 5/11/2026), with how many there are.
// The page /sport keeps RESULTS_MAX.
export const RESULTS_OUTIL = 15;
// Without a sport asked: 10 of each (20 and 15 were 12,8 KB of a 17 KB answer, 5/11/2026), with how many there are.
export const UPCOMING_TOUS = 10;
export const RESULTS_TOUS = 10;
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const localDay = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const localClock = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** « 2026-10-30T20:30 » → « vendredi 30/10 à 20:30 » ; « 2026-10-31 » → « samedi 31/10 » ; with `annee`, « samedi 31/10/2026 ». */
export function quand(local: string, annee = false): string {
  const d = local.slice(0, 10);
  return `${DAYS[weekday(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}${annee ? `/${d.slice(0, 4)}` : ""}${local.length > 10 ? ` à ${local.slice(11, 16)}` : ""}`;
}
/** « du vendredi 30/10 au dimanche 01/11 » ; both years when they differ: « du samedi 23/05/2026 au samedi 22/05/2027 ». */
export function duAu(debut: string, fin: string, at: (local: string, annee: boolean) => string = quand): string {
  const annee = debut.slice(0, 4) !== fin.slice(0, 4);
  return `du ${at(debut, annee)} au ${at(fin, annee)}`;
}
const span = (e: { debut: string; fin: string }) => (e.debut === e.fin ? quand(e.debut) : duAu(e.debut, e.fin));
/**
 * A tournament of the volley league (marketing, 06/11/2026): the days of its matches as its title gives them, two days
 * running as « vendredi 06/11 et samedi 07/11 »; the span the league posted it over said as the league's.
 */
const spanLigue = (e: { debut: string; fin: string; dates?: "titre" | "ligue" }) =>
  e.dates === "titre" && e.fin === addDays(e.debut, 1) ? `${quand(e.debut)} et ${quand(e.fin)}`
  : e.dates === "ligue" && e.fin !== e.debut ? `${span(e)} (dates données par la Ligue)`
  : span(e);

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * The days a title gives, « 06-07 novembre », « 6 et 7 novembre », « 7 novembre », within the span `debut`–`fin`
 * (YYYY-MM-DD) the event was posted over; else undefined.
 */
export function joursDuTitre(titre: string, debut: string, fin: string): { debut: string; fin: string } | undefined {
  const m = new RegExp(`\\b(\\d{1,2})(?:\\s*(?:-|–|au|et)\\s*(\\d{1,2}))?\\s+(${MOIS.join("|")})\\b`, "i").exec(titre);
  // « 30 décembre au 2 janvier »: two months, not read.
  if (!m || /^\s*(?:-|–|au|et)\s*\d/.test(titre.slice(m.index + m[0].length))) return undefined;
  const month = MOIS.indexOf(m[3].toLowerCase()) + 1;
  const day = (d: string) => {
    for (const y of new Set([debut.slice(0, 4), fin.slice(0, 4)])) {
      const iso = `${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (iso >= debut && iso <= fin) return iso;
    }
    return undefined;
  };
  const a = day(m[1]);
  const b = day(m[2] ?? m[1]);
  return a && b && a <= b ? { debut: a, fin: b } : undefined;
}

/** The days a question means: this weekend is Friday to Sunday, the coming one from Monday on; « samedi » is the next one, today included. */
export function window(q: Quand | undefined, now: Date, back = BACK_DAYS): { du: string; au: string } {
  const today = localDay(now);
  const wd = weekday(today);
  if (q === "aujourd_hui") return { du: today, au: today };
  if (q === "demain") return { du: addDays(today, 1), au: addDays(today, 1) };
  if (q === "samedi" || q === "dimanche") {
    const day = addDays(today, ((q === "samedi" ? 6 : 0) - wd + 7) % 7);
    return { du: day, au: day };
  }
  if (q === "ce_week_end") {
    const friday = wd === 0 ? addDays(today, -2) : wd === 6 ? addDays(today, -1) : addDays(today, 5 - wd);
    return { du: wd === 0 || wd === 6 ? today : friday, au: addDays(friday, 2) };
  }
  if (q === "resultats") return { du: addDays(today, -back), au: today };
  if (q === "a_venir") return { du: today, au: addDays(today, AHEAD_DAYS) };
  return { du: addDays(today, -back), au: addDays(today, AHEAD_DAYS) };
}

export interface Item {
  sport: string;
  competition?: string;
  quand: string;
  /** For sorting: local, « 2026-10-30T20:30 ». */
  date: string;
  fin?: string;
  epreuve: string;
  /** The clubs in full, when the federation gives acronyms: « Volley-Ball de Saint-Pierre – Tampon Gecko Volley (2A) ». */
  equipes?: string;
  score?: string;
  detail?: string;
  lieu?: string;
  /** Where it is played: the commune of the club at home, or of the event. */
  commune?: string;
  /** A club of the place asked that plays away: « club du Tampon en déplacement ». */
  deplacement?: string;
  /** « annulée », « reportée » (a match), as its league or the news says; « annulée », « résultats publiés » (an event). */
  etat?: string;
  /** Who says it is called off, and its words. */
  selon?: string;
  lien_avis?: string;
  /** The volley league's calendar gives this match another day or hour than the FFVB (`dateLigue`): said, to check with the club. */
  autre_date?: string;
  lien?: string;
  /** « réservé aux adhérents de <club> »: a club's session, told only to who says they are a member. */
  acces?: string;
  site_du_club?: string;
}

/** For filtering, never shown: the communes and clubs of both teams. */
interface Row extends Item {
  communes: (string | undefined)[];
  clubs: (Club | undefined)[];
}

const CLUB_SPORTS: Partial<Record<src.Championnat["sport"], ClubSport>> = { volley: "volley", handball: "handball" };
const title = (s: string) =>
  s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (x) => x.toUpperCase()).replace(/(\d) Ème\b/g, "$1e").replace(/ (De|Du|Des|D')(?=[\s\p{L}])/gu, (x) => x.toLowerCase());

/** « VBSP 2 » → « Volley-Ball de Saint-Pierre (2) ». */
function full(team: string, club: Club | undefined): string {
  if (!club?.sigle) return team;
  const rest = normalize(team).slice(normalize(club.sigle).length).trim().toUpperCase();
  return rest ? `${club.nom} (${rest})` : club.nom;
}

const team = (t: string) => normalize(t).replace(/\s+/g, " ").trim();

/**
 * The same match, not played yet, at another day or hour in the volley league's calendar: same pool, same teams
 * (04/11/2026: TGV – VBC SD, R1 féminine, Saturday 07/11 at 16:00 for the FFVB, Friday 06/11 at 20:30 for the league).
 */
export function dateLigue(m: Pick<src.Match, "date" | "domicile" | "exterieur" | "poule" | "score">, ligue: MatchLigue[]): MatchLigue | undefined {
  if (m.score || !m.poule) return undefined;
  const same = ligue.find((l) => l.poule === m.poule && team(l.domicile) === team(m.domicile) && team(l.exterieur) === team(m.exterieur));
  return same && same.date !== m.date ? same : undefined;
}

function matchRow(c: src.Championnat, m: src.Match, calledOff: avis.Avis[], ligue: MatchLigue[] = []): Row {
  const cs = CLUB_SPORTS[c.sport]!;
  const other = c.sport === "volley" ? dateLigue(m, ligue) : undefined;
  const home = clubOf(cs, m.domicile);
  const away = clubOf(cs, m.exterieur);
  const salle = m.salle ? title(m.salle) : undefined;
  const off = avis.avisOf(calledOff, cs, m);
  return {
    sport: NAMES[c.sport],
    competition: c.nom,
    quand: quand(m.date),
    date: m.date,
    epreuve: `${m.domicile} – ${m.exterieur}`,
    equipes: home?.sigle || away?.sigle ? `${full(m.domicile, home)} – ${full(m.exterieur, away)}` : undefined,
    score: m.score,
    detail: m.detail,
    lieu: salle && home ? `${salle}, ${home.commune}` : salle,
    commune: home?.commune,
    etat: off ? (off.statut === "annulé" ? "annulée" : "reportée") : undefined,
    selon: off ? `${off.source}${off.reporte_au ? `, reporté au ${quand(off.reporte_au)}` : off.a_rejouer ? ", à rejouer à une date à fixer" : ""}` : undefined,
    lien_avis: off?.lien,
    autre_date: other ? `La Ligue réunionnaise de volley-ball annonce ce match le ${quand(other.date)} : vérifier auprès du club.` : undefined,
    lien: c.lien,
    communes: [home?.commune, away?.commune],
    clubs: [home, away],
  };
}

/** An event; one on the sand called off by a notice of the league says so, as a match does (avis.avisBeach). */
function eventRow(e: src.Epreuve, calledOff: avis.Avis[] = []): Row {
  const off = e.sport === "beach-volley" && !e.etat ? avis.avisBeach(calledOff, e) : undefined;
  return {
    sport: e.sport,
    quand: spanLigue(e),
    date: e.debut,
    fin: e.fin,
    epreuve: e.nom,
    detail: e.detail,
    lieu: e.lieu,
    commune: e.commune,
    etat: off ? (off.statut === "annulé" ? "annulée" : "reportée") : e.etat,
    selon: off?.source,
    lien_avis: off?.lien,
    lien: versBilletterie(e.lien),
    communes: [e.commune],
    clubs: [],
  };
}

/** The sports of the tool a club's event on Sportsregions may be of (its JSON-LD `sport`). */
const SPORT_DU_CLUB: [RegExp, Sport][] = [[/^golf/i, "golf"], [/^volley/i, "volley"], [/^hand/i, "handball"], [/^voile/i, "voile"], [/^(?:sport )?auto/i, "sport_auto"]];
const sportDuClub = (s: string | undefined) => (s ? SPORT_DU_CLUB.find(([re]) => re.test(s))?.[1] : undefined);
// Sportsregions gives the event's place only when the club gave one; else the club's address, not said as its place.
const LIEU_CLUB = "non précisé (voir la page de l'événement)";

/**
 * An event a club publishes on Sportsregions: who organises it, and its place when the club gave one. Else in a commune
 * only when its title names it (the club's address is not where it is played).
 */
const clubRow = (e: Evenement): Row[] =>
  e.seances.slice(0, 1).map((s) => ({
    sport: e.organisateur?.sport?.toLowerCase() ?? "sport",
    quand: span({ debut: s.debut, fin: s.fin ?? s.debut }),
    date: s.debut,
    fin: s.fin,
    epreuve: e.titre,
    detail: e.description,
    lieu: e.lieu ?? LIEU_CLUB,
    commune: e.commune,
    etat: e.statut === "annulé" ? "annulée" : e.statut === "reporté" ? "reportée" : undefined,
    lien: versBilletterie(e.lien),
    acces: e.reserve_adherents ? reserve(e) : undefined,
    site_du_club: e.reserve_adherents ? httpUrl(e.organisateur?.site) : undefined,
    communes: [e.commune],
    clubs: [],
  }));

const ZONE_DE: Record<string, string> = { Nord: "du Nord", Sud: "du Sud", Est: "de l'Est", Ouest: "de l'Ouest" };

/** « St Leu », « ST PIERRE » as the communes are named. */
const words = (s: string) => ` ${normalize(s).replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte")} `;
const mentions = (item: Item, commune: string) => words(`${item.epreuve} ${item.lieu ?? ""}`).includes(words(commune));

/** What `lieu` asks: a part of the island, a club, or a place (its commune). */
type Where =
  | { kind: "communes"; label: string; communes: string[]; zone?: string; res?: ReturnType<typeof resolvePlace> }
  | { kind: "clubs"; label: string; clubs: Club[]; sport?: ClubSport };

function where(lieu: string, sport: Sport | undefined): Where | null {
  const zone = zoneOf(lieu);
  if (zone) return { kind: "communes", label: ` dans le ${zone.nom}`, communes: zone.communes, zone: zone.nom };
  const sports = sport === "volley" || sport === "handball" ? [sport] : (["volley", "handball"] as ClubSport[]);
  const named = clubsNamed(lieu, sports);
  const clubs = named.map((c) => c.club);
  if (clubs.length) {
    const one = named.every((c) => c.sport === named[0].sport) ? named[0].sport : undefined;
    return { kind: "clubs", label: ` ${clubs.map((c) => (c.sigle ? `du ${c.sigle} (${c.nom})` : `de ${c.nom}`)).join(" et ")}`, clubs, sport: one };
  }
  const res = resolvePlace(lieu);
  if (!res?.lieu.commune) return null;
  return { kind: "communes", label: ` ${a(res.lieu.commune)}`, communes: [res.lieu.commune], res };
}

/** Keeps what is played in the place asked, and the matches of its clubs elsewhere (marked). */
function keep(w: Where, r: Row): Row | undefined {
  if (w.kind === "clubs") return r.clubs.some((c) => c && w.clubs.includes(c)) ? r : undefined;
  if (r.commune && w.communes.includes(r.commune)) return r;
  const ours = r.communes.find((c) => c && w.communes.includes(c));
  if (ours) return { ...r, deplacement: `club ${de(ours)} en déplacement${r.commune ? ` ${a(r.commune)}` : ""}` };
  if (!r.commune && w.communes.some((c) => mentions(r, c))) return r;
  return undefined;
}

type Got<T> = { value?: Cached<T>; source: SourceInfo };

async function attempt<T>(source: SourceInfo, load: () => Promise<Cached<T>>): Promise<Got<T>> {
  try {
    return { value: await load(), source };
  } catch (err) {
    console.error(`source ${source.id} indisponible:`, why(err));
    return { source };
  }
}

export interface SportData {
  grandRaid?: Got<src.GrandRaid>;
  championnats: Got<src.Championnat[]>[];
  epreuves: Got<src.Epreuve[]>[];
  /** The clubs' events (Sportsregions), as the scheduled event last read them, of the sport asked. */
  clubs?: Got<Evenement[]>;
  /** The league's notices (volley). */
  avis?: Got<avis.Avis[]>;
  /** The news as last read for `actualites`, not read again for this. */
  presse?: Cached<Fil>;
  /** The communes' sports programmes, in the agendas as last read for `evenements`. */
  programmes?: Awaited<ReturnType<typeof programmesSportifs>>;
  /** The tournaments and the clubs' events wanted whose copy is not served, with why (src.nonServie). */
  nonLus: string[];
  /** The FFCK's rows that may be on the island whose page is still to be read: their events are not known yet. */
  ffckALire?: number;
  /** The matches of the volley league's calendar, to set beside the FFVB's (dateLigue). */
  matchsLigue?: MatchLigue[];
}

/** What `sport` needs, read in parallel; a source that fails is left out and named. */
export async function gather(cache: Cache, sport: Sport | undefined, now: Date, adherent = false): Promise<SportData> {
  // A federation's site not read until it agrees (src/providers/autorisations.ts): nor is its sport here.
  const want = (s: Sport) => (!sport || sport === s) && autorisee(`sport:${FEDERATION[s] ?? s}`);
  const clubsWanted = clubsDe(sport);
  // The volley league's calendar: its events on the sand are the beach volley's (« beach »), the others the volley's.
  const league = want("volley") || want("beach_volley");
  const agendasWanted = league || clubsWanted;
  const [grandRaid, handball, volley, voile, golfs, auto, canoe, notices, presse, agendas] = await Promise.all([
    want("grand_raid") ? attempt(src.SOURCES.livetrail, () => src.grandRaid(cache, now)) : undefined,
    want("handball") ? attempt(src.SOURCES.ffhb, () => src.championnats(cache, "handball")) : undefined,
    want("volley") ? attempt(src.SOURCES.ffvb, () => src.championnats(cache, "volley")) : undefined,
    want("voile") ? attempt(src.SOURCES.ffvoile, () => src.regates(cache, now)) : undefined,
    want("golf") ? attempt(src.SOURCES.ffgolf, () => src.golf(cache, now)) : undefined,
    want("sport_auto") ? attempt(src.SOURCES.lsar, () => src.sportAuto(cache)) : undefined,
    want("canoe_kayak") ? attempt(ffck.SOURCE, () => ffck.epreuves(cache, now)) : undefined,
    league ? attempt(avis.SOURCE, () => avis.avisLigue(cache, now)) : undefined,
    want("volley") || want("handball") || sport === "football" ? cache.peek<Fil>("actualites:fil").catch(() => undefined) : undefined,
    // The communes' programmes, of every sport, only when none is asked; the volley league's tournaments; the clubs'
    // events.
    agendasWanted
      ? sportDesAgendas(cache, !sport).catch((err) => (console.error("programmes sportifs : copie des agendas illisible", why(err)), undefined))
      : undefined,
  ]);
  const ligue = league ? agendas?.tournois : undefined;
  const ofSport = agendas?.clubs?.value.filter((e) => (!sport || sportDuClub(e.organisateur?.sport) === sport) && (adherent || !e.reserve_adherents));
  return {
    grandRaid,
    championnats: [handball, volley].filter((x): x is Got<src.Championnat[]> => !!x),
    // The matches of the league's calendar, to set beside the FFVB's (dateLigue).
    matchsLigue: league ? (agendas?.tournois?.value ?? []).flatMap((e) => e.matchs ?? []) : [],
    epreuves: [
      voile,
      golfs,
      auto,
      canoe,
      ligue ? { source: src.SOURCES.lrvb_tournois, value: { ...ligue, value: ligue.value.filter((e) => want(surSable(e) ? "beach_volley" : "volley")).flatMap(tournoi) } } : undefined,
    ].filter((x): x is Got<src.Epreuve[]> => !!x),
    clubs: ofSport?.length ? { source: src.SOURCES.sportsregions, value: { ...agendas!.clubs!, value: ofSport } } : undefined,
    avis: notices,
    presse,
    programmes: agendas?.programmes,
    // The FFCK's rows that may be on the island whose page is still to be read (providers/ffck.ts `aLire`).
    ffckALire: (canoe?.value as { a_lire?: number } | undefined)?.a_lire ?? 0,
    nonLus: [
      league ? nonLu(LIGUE_VOLLEY, agendas?.nonServies.tournois) : undefined,
      clubsWanted && autorisee(`agenda:${SPORTSREGIONS.id}`) ? nonLu(SPORTSREGIONS, agendas?.nonServies.clubs) : undefined,
    ].filter((x): x is string => !!x),
  };
}

/** Whether the clubs' events (Sportsregions) are of the answer: for every sport, or one of a club's. */
const clubsDe = (sport: Sport | undefined) => !sport || SPORT_DU_CLUB.some(([, s]) => s === sport);

/** A copy of the scheduled event not served, said with why (« Clubs sportifs (Sportsregions) : … »), never left out. */
function nonLu(agenda: Agenda, r: ReturnType<typeof nonServie>): string | undefined {
  return r && `${agenda.nom} : ${derniereLecture(r)}`;
}

/** Why a copy of the scheduled event is not served (src.nonServie), in words: shared with `evenements`. */
export function derniereLecture(r: NonNullable<ReturnType<typeof nonServie>>): string {
  // « le 22/10 à 10:00 », the form of every read on the pages: no weekday.
  const le = (local: string) => `le ${local.slice(8, 10)}/${local.slice(5, 7)}${local.length > 10 ? ` à ${local.slice(11, 16)}` : ""}`;
  if ("depuis" in r) return `dernière lecture ${le(r.depuis)}`;
  return r.essai ? `dernière lecture sans succès (${le(r.essai)})` : "première lecture dans quelques minutes";
}

/**
 * On the sand: the league files it under « beach » (lrvb.re's calendar). Not its « OUTDOOR » events alone: the Green
 * 3X3 is played on grass, and the King does not say where.
 */
export const surSable = (e: Pick<Evenement, "categories">) => e.categories.some((c) => /^beach$/i.test(c.trim()));

/** A tournament of the volley league, as `evenements` read it: its place as the league gives it, or « à venir ». */
function tournoi(e: Evenement): src.Epreuve[] {
  return e.seances.slice(0, 1).map((s) => {
    const posted = { debut: s.debut.slice(0, 10), fin: (s.fin ?? s.debut).slice(0, 10) };
    const titre = joursDuTitre(e.titre, posted.debut, posted.fin);
    return {
    sport: surSable(e) ? ("beach-volley" as const) : ("volley-ball" as const),
    nom: e.titre,
    ...(titre ?? posted),
    dates: titre ? ("titre" as const) : ("ligue" as const),
    lieu: e.lieu,
    commune: e.commune,
    detail: "Ligue réunionnaise de volley-ball",
    etat: e.statut === "annulé" ? ("annulée" as const) : e.statut === "reporté" ? ("reportée" as const) : undefined,
    lien: versBilletterie(e.lien),
    };
  });
}

/** The Grand Raid is told around its dates (a week before to a fortnight after), or when asked. */
function grandRaidNow(g: src.GrandRaid, now: Date): boolean {
  const today = localDay(now);
  return today >= addDays(g.debut, -7) && today <= addDays(g.fin, 14);
}

/** A row of an answer, as the tool gives it. */
export type SportRow = Omit<Item, "date" | "fin">;

/** A competition's link, given once for the matches that share it (liensCommuns). */
export interface LienCompetition {
  sport: string;
  competition: string;
  lien: string;
}

/**
 * The links that several matches of one competition share (a pool's calendar), given once in `liens`, the matches
 * without theirs: a match's link is the one of its sport and competition there. A competition whose matches link to
 * different pages keeps each match's link, and so does a match without a competition.
 */
export function liensCommuns(lists: SportRow[][]): { liens: LienCompetition[]; lists: SportRow[][] } {
  const key = (r: SportRow) => (r.competition && r.lien ? JSON.stringify([r.sport, r.competition]) : undefined);
  const seen = new Map<string, { liens: Set<string>; n: number; row: SportRow }>();
  for (const r of lists.flat()) {
    const k = key(r);
    if (!k) continue;
    const e = seen.get(k) ?? { liens: new Set<string>(), n: 0, row: r };
    e.liens.add(r.lien!);
    e.n++;
    seen.set(k, e);
  }
  const shared = new Map([...seen].filter(([, e]) => e.liens.size === 1 && e.n > 1));
  return {
    liens: [...shared.values()].map(({ row }) => ({ sport: row.sport, competition: row.competition!, lien: row.lien! })),
    lists: lists.map((l) => l.map((r) => (shared.has(key(r) ?? "") ? (({ lien: _, ...rest }) => rest)(r) : r))),
  };
}

export function grandRaidRow(g: src.GrandRaid) {
  return {
    edition: g.edition,
    dates: g.debut === g.fin ? quand(g.debut) : duAu(g.debut, g.fin),
    courses: g.courses.map((c) => ({
      course: `${c.nom} (${c.distance_km} km, ${c.denivele_m} m D+)`,
      depart: `${quand(c.depart)}, ${c.lieu_depart}`,
      statut: c.statut,
      partants: c.partants,
      arrives: c.arrives,
      abandons: c.abandons,
      en_course: c.en_course,
      podium: c.podium.length ? c.podium.map((r) => `${r.rang}. ${r.nom}${r.pays ? ` (${r.pays})` : ""} ${r.temps}`) : undefined,
      podium_femmes: c.podium_femmes.length ? c.podium_femmes.map((r) => `${r.rang}. ${r.nom}${r.pays ? ` (${r.pays})` : ""} ${r.temps}`) : undefined,
    })),
    lien: g.lien,
  };
}

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Said instead of the sports programmes of the communes whose site is not read until they agree (marketing), for the
 * whole island or the communes asked: undefined when there is none.
 */
export function mentionProgrammes(communes?: string[]): string | undefined {
  const theirs = LISIBLES.filter((x) => x.programmes && x.commune && !AGENDAS.includes(x) && (!communes || communes.includes(x.commune))).map((x) => x.commune!).sort((x, y) => x.localeCompare(y, "fr"));
  const au = (c: string) => nonAutorisee("agenda", c);
  const waiting = theirs.filter((c) => au(c)?.etat !== "refusee");
  const lines: string[] = [];
  if (waiting.length) {
    const days = new Set(waiting.map((c) => (au(c)?.etat === "demandee" ? au(c)!.demandee_le ?? "" : undefined)));
    const day = days.size === 1 ? [...days][0] : undefined;
    const one = waiting.length === 1;
    lines.push((one
      ? `Les mentions légales du site de la commune ${de(waiting[0])} interdisent d'en reprendre le contenu sans son accord : rundata.re n'affiche donc pas le programme sportif qu'elle y publie.`
      : `Les programmes sportifs ${enumeration(waiting.map(de))} ne sont pas repris : les mentions légales des sites de ces communes l'interdisent sans leur accord.`) +
      (day !== undefined ? ` Nous ${one ? "lui" : "leur"} avons demandé cet accord${day ? ` le ${dayMonth(day)}` : ""} et attendons ${one ? "sa" : "leur"} réponse.` : ""));
  }
  for (const c of theirs.filter((x) => !waiting.includes(x))) {
    const no = au(c)?.refusee_le;
    lines.push(`La commune ${de(c)} a refusé${no ? `, le ${dayMonth(no)},` : ""} que rundata.re reprenne le contenu de son site : le programme sportif qu'elle y publie ne s'affiche donc pas ici.`);
  }
  return lines.join(" ") || undefined;
}

const PROGRAMMES =
  "Programme sportif de la commune : le document publié par la mairie avec les compétitions de ses clubs. rundata.re ne lit pas ce document, il en donne seulement le lien : " +
  "les matchs, les heures et les lieux sont dans le document.";

const BEACH_CALENDAR =
  "Le calendrier du beach-volley est celui de la Ligue réunionnaise de volley-ball (ses épreuves « beach »). Ses résultats sont dans ses articles, pas dans un tableau que rundata.re lit.";

const COMMON = {
  non_couvert:
    "Football (Régionale 1 et coupes), basket, rugby, tennis et courses à pied : pas de source ouverte lisible en direct. Les heures sont celles de La Réunion.",
};
const CALLED_OFF =
  "Annulations et reports : les pages de résultats des fédérations ne les montrent pas\u00a0; ils viennent des avis de la Ligue réunionnaise de volley-ball (lrvb.re) " +
  "et de l'actualité locale, cités avec leur lien. Un jour de grève, de blocage ou d'alerte météo, vérifier auprès du club.";

/** When each source was read, and the last result it holds. */
function freshness(got: { value?: Cached<unknown>; source: SourceInfo }[]) {
  return got.flatMap((g) => {
    if (!g.value) return [];
    const champs = Array.isArray(g.value.value) && (g.value.value as { matchs?: src.Match[] }[]).every((c) => Array.isArray(c?.matchs))
      ? (g.value.value as src.Championnat[])
      : undefined;
    const last = champs?.flatMap((c) => c.matchs.filter((m) => m.score && m.date).map((m) => m.date)).sort().at(-1);
    return [{
      source: g.source.nom,
      lu: quand(localClock(g.value.fetchedAt)) + (g.value.stale ? " (dernière copie : la source ne répond pas)" : ""),
      dernier_resultat: last ? quand(last) : undefined,
    }];
  });
}

/** `adherent`: the user says they are a club's member: its sessions for the members are told too, said so. */
/**
 * The answer of the tool `sport`, and of the page /sport (max and maxResults: how many are listed; partages: the links
 * that matches share given once, liensCommuns, for the tool without a sport asked).
 */
export async function sportTool(cache: Cache, sport?: Sport, lieu?: string, q?: Quand, now = new Date(), adherent = false, max = UPCOMING_MAX, maxResults = RESULTS_MAX, partages = false) {
  let w: Where | null = null;
  if (lieu?.trim()) {
    w = where(lieu, sport);
    if (!w) return notFound(lieu);
    // A club is of one sport: only its sources are read.
    if (w.kind === "clubs" && w.sport) sport ??= w.sport;
  }
  const data = await gather(cache, sport, now, adherent);
  const got = ([data.grandRaid, ...data.championnats, ...data.epreuves, data.clubs, data.avis] as (Got<unknown> | undefined)[]).filter((x): x is Got<unknown> => !!x);
  const failed = got.filter((g) => !g.value).map((g) => g.source.nom);
  // Football and basket have no source read: their answer says so, not that the sources do not answer.
  if (got.length && got.every((g) => !g.value)) {
    return { ...text({ erreur: "Les sources du sport ne répondent pas pour le moment.", indisponible: failed }), isError: true };
  }

  const today = localDay(now);
  const asked = window(q, now, sport ? BACK_DAYS_ONE : BACK_DAYS);
  // Beach volley's only source, the league's calendar, is read from today on and publishes no results: its period starts today.
  const { du, au } = sport === "beach_volley" && asked.du < today ? { ...asked, du: today } : asked;
  const press = avis.avisPresse(data.presse?.value.infos, now);
  const calledOff = [...(data.avis?.value?.value ?? []), ...press.avis];
  const rows: Row[] = [
    ...data.championnats.flatMap((g) => (g.value?.value ?? []).flatMap((c) => c.matchs.filter((m) => m.date).map((m) => matchRow(c, m, calledOff, data.matchsLigue ?? [])))),
    ...data.epreuves.flatMap((g) => (g.value?.value ?? []).map((e) => eventRow(e, calledOff))),
    ...(data.clubs?.value?.value ?? []).flatMap(clubRow),
  ].flatMap((r) => {
    const k = w ? keep(w, r) : r;
    return k ? [k] : [];
  });

  const inWindow = (i: Item) => i.date.slice(0, 10) <= au && (i.fin ?? i.date).slice(0, 10) >= du;
  const aheadAll = q === "resultats" ? [] : rows
    .filter((i) => inWindow(i) && !i.score && (i.fin ?? i.date).slice(0, 10) >= today)
    .sort((x, y) => x.date.localeCompare(y.date));
  const isOff = (i: Item) => i.etat === "annulée" || i.etat === "reportée";
  const upcoming = [...aheadAll.slice(0, max), ...aheadAll.slice(max).filter(isOff)];
  const offLater = upcoming.length - Math.min(aheadAll.length, max);
  // Beach volley has a few events a year: with none in the period, its next one, and the league's calendar.
  const beach = sport === "beach_volley";
  const nextBeach = beach && !aheadAll.length && q !== "resultats"
    ? rows.filter((i) => i.date.slice(0, 10) > au && i.etat !== "annulée").sort((x, y) => x.date.localeCompare(y.date))[0]
    : undefined;
  const resultsAll = q === "a_venir" ? [] : rows
    .filter((i) => inWindow(i) && (i.score || (i.etat === "résultats publiés" && (i.fin ?? i.date) < today)))
    .sort((x, y) => y.date.localeCompare(x.date));
  const results = resultsAll.slice(0, maxResults);
  const strip = ({ date: _d, fin: _f, communes: _c, clubs: _k, ...i }: Row): SportRow => i;

  // The news that says competitions are called off on a day shown, without saying which: check with the club.
  const matchDays = new Set(upcoming.filter((i) => i.competition && !i.etat).map((i) => i.date.slice(0, 10)));
  const seen = new Set<string>();
  const check = press.alertes
    .filter((x) => matchDays.has(x.jour) && !seen.has(x.lien + x.jour) && seen.add(x.lien + x.jour))
    .map((x) => ({
      jour: quand(x.jour),
      titre: x.titre,
      selon: `${x.media}, ${quand(localClock(new Date(x.publie)))}`,
      lien: x.lien,
      conseil: "Des compétitions de ce jour sont annoncées reportées ou annulées, sans dire lesquelles : vérifier auprès du club.",
    }));

  const standings = sport === "handball" || sport === "volley"
    ? data.championnats.flatMap((g) => (g.value?.value ?? []).map((c) => ({ competition: `${NAMES[c.sport]}, ${c.nom}`, classement: c.classement.map((r) => `${r.place}. ${r.equipe} ${r.points} pts (${r.joues} j)`), lien: c.lien })))
    : undefined;

  // The programmes of the communes asked, or of the whole island; never those of a club, nor past ones.
  const programmes = q === "resultats" || (w && w.kind !== "communes") ? [] : (data.programmes ?? [])
    .flatMap(({ e, agenda, fetchedAt }) => {
      const s = e.seances.find((x) => x.debut.slice(0, 10) <= au && (x.fin ?? x.debut).slice(0, 10) >= (du > today ? du : today));
      const commune = e.commune ?? agenda.commune;
      if (!s || (w?.kind === "communes" && !w.communes.includes(commune ?? ""))) return [];
      return [{
        type: "programme sportif de la commune",
        commune,
        titre: e.titre,
        dates: s.fin && s.fin !== s.debut ? duAu(s.debut, s.fin) : quand(s.debut),
        lien: e.lien,
        /** « site de la commune de Saint-Benoît, lu le samedi 24/10 à 07:00 », as on the events. */
        source: agenda.site_commune ? `${agenda.site_commune}, lu le ${quand(localClock(fetchedAt))}` : e.publie_par,
        publie_par: e.publie_par,
        lu_le: quand(localClock(fetchedAt)),
        date: s.debut,
        agenda,
      }];
    })
    .sort((x, y) => x.date.localeCompare(y.date) || (x.commune ?? "").localeCompare(y.commune ?? "", "fr"));

  const gr = data.grandRaid?.value?.value;
  const showRaid = gr && (sport === "grand_raid" || (!sport && !w && grandRaidNow(gr, now)));
  // The FFCK's events whose page is still to be read: not « none found » while they are (one page a pass).
  const ffckALire = data.ffckALire ?? 0;
  // No match, event, result or programme: a club playing away, or a sport given by the news alone, is an answer.
  if (!ffckALire && !aheadAll.length && !results.length && !programmes.length && !showRaid && !nextBeach && sport !== "grand_raid" && !(sport && NEWS_ONLY[sport])) rienTrouve("sport");

  // Football: the news' headlines, the copy `actualites` last kept; said when there is none.
  const foot = sport === "football" ? titresFootball(data.presse?.value.infos) : undefined;
  const footText = !foot ? "" : !data.presse
    ? " Les titres de la presse ne sont pas disponibles pour le moment."
    : foot.length
      ? ` ${foot.length} titre${foot.length > 1 ? "s" : ""} football ${FOOT_DE} depuis trois jours (voir titres_football)\u00a0: le titre, l'heure et le lien seulement, l'article est sur le site du média.`
      : ` Aucun titre football ${FOOT_DE} depuis trois jours.`;

  const what = sport ? NAMES[sport] : "sport";
  const place = w ? w.label : " à La Réunion";
  const ahead = q === "aujourd_hui" || q === "demain" || q === "samedi" || q === "dimanche"
    ? quand(au)
    : q === "ce_week_end" ? `ce week-end (${du === au ? quand(au) : duAu(du, au)})` : `d'ici le ${quand(au)}`;
  // All of them, not only the UPCOMING_MAX listed: the number the page gives too (26/10/2026: « 40 » said for 77).
  const away = aheadAll.filter((i) => i.deplacement).length;
  const here = aheadAll.length - away;
  const off = upcoming.filter((i) => i.competition && (i.etat === "annulée" || i.etat === "reportée"));
  const offBy = [...new Set(off.map((i) => i.selon!.split(",")[0]))].join(", ");
  const upcomingText = [
    (here ? `${here} rendez-vous de ${what}${place} ${ahead}` : ffckALire && sport === "canoe_kayak" ? `Rendez-vous de ${what}${place} ${ahead}\u00a0: lecture en cours` : `Aucun rendez-vous de ${what} trouvé${place} ${ahead}`) +
      (aheadAll.length > upcoming.length
        ? ` (les ${max} premiers ci-dessous${offLater ? `, et ${offLater} annulé${offLater > 1 ? "s" : ""} ou reporté${offLater > 1 ? "s" : ""} plus loin` : ""})`
        : ""),
    away ? `${away} match${away > 1 ? "s" : ""} de club${away > 1 ? "s" : ""}${w?.kind === "communes" ? ` ${w.zone ? ZONE_DE[w.zone] : de(w.communes[0])}` : ""} à l'extérieur` : "",
    !off.length ? "" : off.length === upcoming.length && off.length > 1
      ? `tous annulés ou reportés d'après ${offBy}`
      : `${off.length} annulé${off.length > 1 ? "s" : ""} ou reporté${off.length > 1 ? "s" : ""} d'après ${offBy}`,
    check.length ? "des reports sont annoncés dans l'actualité : vérifier auprès du club" : "",
    ffckALire
      ? `${ffckALire} épreuve${ffckALire > 1 ? "s" : ""} du calendrier de la FFCK dont le lieu peut être à La Réunion ${ffckALire > 1 ? "restent à lire, une par demi-heure" : "reste à lire, dans la demi-heure"}`
      : "",
  ].filter(Boolean).join("\u00a0; ");
  // A competition whose page did not answer: what was read before, said with its hour, or that its read failed.
  const silent = data.championnats.flatMap((g) => (g.value?.value ?? []).filter((c) => c.muet).map((c) => ({
    competition: `${NAMES[c.sport]}, ${c.nom}`,
    ...injoignable(`le site de la ${g.source.organisme}`, c.lu_a, localTime(g.value!.fetchedAt), now),
    site: c.lien,
  })));
  // The sport of a federation not read (golf, voile): its answer is the mention (tools/non-repris.ts).
  const federation = sport && FEDERATION[sport] && !autorisee(`sport:${FEDERATION[sport]}`) ? mentionSports([sport], false).join(" ") : undefined;
  const resume = federation
    ? federation
    : sport && NEWS_ONLY[sport]
    ? NEWS_ONLY[sport] + footText
    : sport === "grand_raid"
      ? gr ? `${gr.edition} : ${gr.courses.map((c) => `${c.nom} ${c.statut}${c.podium[0] ? `, vainqueur ${c.podium[0].nom} en ${c.podium[0].temps}` : ""}`).join("\u00a0; ")}.` : "Le suivi du Grand Raid ne répond pas pour le moment."
      : [
          q === "resultats" ? "" : upcomingText,
          // All of them, not only the ones listed (5/11/2026: « 30 » said for more).
          results.length
            ? `${resultsAll.length} résultat${resultsAll.length > 1 ? "s" : ""} depuis le ${quand(du)}` +
              (resultsAll.length > results.length ? ` (les ${results.length} plus récents ci-dessous)` : "")
            : q === "resultats" ? `Aucun résultat de ${what}${place} depuis le ${quand(du)}` : "",
          programmes.length ? `${programmes.length} programme${programmes.length > 1 ? "s" : ""} sportif${programmes.length > 1 ? "s" : ""} de commune (${programmes.map((p) => p.commune).join(", ")}), en lien seulement` : "",
          nextBeach ? `Prochain rendez-vous de beach-volley : ${nextBeach.epreuve}, ${nextBeach.quand}` : "",
          ...silent.map((x) => `Championnat de ${x.competition.replace(", ", " ")} : ${x.court} (voir injoignable)`),
        ].filter(Boolean).join(". ") + ".";

  // The notices behind the matches called off, once each.
  const cited = calledOff
    .filter((n) => upcoming.some((i) => i.lien_avis === n.lien && n.jours.includes(i.date.slice(0, 10))))
    .filter((n, k, l) => l.findIndex((o) => o.lien === n.lien && o.extrait === n.extrait) === k)
    .map((n) => ({
      selon: n.source,
      jours: n.jours.map((d) => quand(d)),
      extrait: n.extrait,
      a_rejouer: n.reporte_au ? quand(n.reporte_au) : n.a_rejouer ? "à une date à fixer" : undefined,
      lien: n.lien,
    }));

  const used = [...new Set([...got.filter((g) => g.value).map((g) => g.source), ...programmes.map((p) => p.agenda.source), ...(foot?.length ? [TITRES_FOOT] : [])])];
  const matches = !sport || sport === "volley" || sport === "handball";
  const shared = partages ? liensCommuns([upcoming.map(strip), results.map(strip)]) : undefined;
  const [aVenir, resultats] = shared ? shared.lists : [upcoming.map(strip), results.map(strip)];
  return text({
    lieu: w?.kind === "communes" && w.res && lieu ? placeBlock(lieu, w.res) : w && lieu ? { demande: lieu, trouve: w.label.trim(), communes: w.kind === "communes" ? w.communes : undefined } : undefined,
    resume,
    periode: sport === "grand_raid" || federation || (sport && NEWS_ONLY[sport]) ? undefined : { du: quand(du), au: quand(au) },
    a_venir: aVenir.length ? aVenir : undefined,
    // When it lists only the first: how many there are, the page's count.
    a_venir_en_tout: aheadAll.length > upcoming.length ? aheadAll.length : undefined,
    // And their sports, those beyond the first too: the ones the page names.
    sports_a_venir: aheadAll.length > upcoming.length ? [...new Set(aheadAll.map((i) => i.sport))] : undefined,
    prochain: nextBeach ? strip(nextBeach) : undefined,
    resultats: resultats.length ? resultats : undefined,
    resultats_en_tout: resultsAll.length > results.length ? resultsAll.length : undefined,
    // The link of the matches above that have none: the one of their sport and competition.
    liens_competitions: shared?.liens.length ? shared.liens : undefined,
    avis: cited.length ? cited : undefined,
    a_verifier: check.length ? check : undefined,
    titres_football: foot?.length ? foot : undefined,
    titres_football_lus: foot?.length ? quand(localClock(data.presse!.fetchedAt)) : undefined,
    programmes_communes: programmes.length ? programmes.map(({ date: _d, agenda: _a, ...p }) => p) : undefined,
    programmes_a_savoir: programmes.length ? PROGRAMMES : undefined,
    // Réunion La 1ère's sport news, not read (tools/non-repris.ts), for the whole island or the sports it covered; the
    // programmes of the communes whose site is not read until they agree, where programmes are given.
    non_repris: [
      (sport && NEWS_ONLY[sport]) || (!sport && !w) ? mentionLa1ere("sport") : undefined,
      sport || q === "resultats" || (w && w.kind !== "communes") ? undefined : mentionProgrammes(w?.kind === "communes" ? w.communes : undefined),
      // The federations and the clubs' calendar not read until they agree, of the sport asked or all of them.
      ...mentionSports(federation ? [] : sport ? [sport] : undefined, clubsDe(sport)),
    ].filter(Boolean).join(" ") || undefined,
    classements: standings,
    grand_raid: showRaid ? grandRaidRow(gr) : undefined,
    mise_a_jour: freshness(got),
    injoignable: silent.length ? silent.map(({ competition, texte, site }) => ({ competition, texte, site })) : undefined,
    indisponible: failed.length ? failed : undefined,
    non_lus: data.nonLus.length ? data.nonLus : undefined,
    a_savoir: w
      ? "Matchs retenus : ceux qui se jouent dans le lieu demandé (commune du club qui reçoit) et ceux de ses clubs à l'extérieur (champ « deplacement »). Les clubs sont reconnus par leur sigle (VBSP = Volley-Ball de Saint-Pierre, TGV = Tampon Gecko Volley)."
      : undefined,
    annulations: matches ? CALLED_OFF : undefined,
    calendrier: beach ? { texte: BEACH_CALENDAR, lien: src.SOURCES.lrvb_tournois.url } : undefined,
    ...COMMON,
    sources: credits(used),
  });
}
