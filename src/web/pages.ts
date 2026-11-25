/**
 * The layout shared by every page (menu of the categories, footer), and the pages of the weather and its neighbours:
 * the weather of each commune or famous place, the vigilance, the sea. The weather of the whole island (/meteo) is in
 * meteo-page.ts, the home page in home.ts, the other categories in domains.ts. Rendered on the server, live values included, so that search
 * engines and link previews see them. The only scripts copy the connector address and filter the list of places; the
 * rest is HTML and CSS.
 *
 * The weather is one category among others, but the one people search for: « météo réunion 974 », « météo cilaos
 * 974 ». « 974 » sorts La Réunion from meetings, so the tab's title carries it, « La Réunion (974) » when it fits in
 * 60 characters; the headings stay as people say them.
 */
import { courbesSection } from "./mer-courbes.js";
import { sansBalises } from "./texte-stable.js";
import { MONTHS } from "../tools/historique.js";
import { porte } from "./aller.js";
import { resolvePlace } from "../places/resolve.js";
import { enLigne } from "./associations-drapeau.js";
import { enLigne as connecteursEnLigne } from "./connecteurs-drapeau.js";
import { enLigne as alertesEnLigne } from "./alertes-drapeau.js";
import { HAUTS_MIN_M, softened } from "../tools/nuages.js";
import { horizonDe } from "../providers/calendrier.js";
import { NUIT_NOTE, nuitOf } from "../tools/calendrier.js";
import type { Cached } from "../cache.js";
import { ageMinutes, ageText, daysApart, localTime, versant } from "../geo.js";
import { toutesLesSources, VERSION } from "../server.js";
import { compte } from "../producteurs.js";
import { a, communeDite, de, enGrand, fourchette, fr } from "../tools/format.js";
import * as candhis from "../providers/candhis.js";
import { SOURCE as uvMesureSource, SOURCE_OZONE as uvMesureOzone } from "../providers/uv-mesure.js";
import * as mf from "../providers/vigilance.js";
import { carteHero, carteHtml } from "./vigilance-carte.js";
import { current, cyclone, cycloneHead, cycloneLevel, cycloneOn, feminine, islandGreen, NONE_ISSUED, NONE_ISSUED_SAID, raised, spans } from "../tools/vigilance.js";
import type { Alerte, Credit, DepuisMinuit, HomeData, PlaceData, RandonneesAnswer, SeaData, StationAnswer, StationNow } from "./data.js";
import { credit, joursDuJour, vigilanceLue } from "./data.js";
import { enChiffres } from "./en-chiffres.js";
import { hasZones, ZONES_SCRIPT } from "./defilement.js";
import brand from "./brand.json" with { type: "json" };
import og from "./og.json" with { type: "json" };
import * as climat from "../providers/climat.js";
import { SOURCE as ONF_SOURCE } from "../providers/sentiers.js";
import * as traces from "../providers/traces.js";
import { GAUGES } from "../providers/maregraphes.js";
import * as coraux from "../providers/coraux.js";
import * as cetaces from "../tools/cetaces.js";
import { cardReason } from "../providers/ensemble.js";
import { CITATION as TIDE_CITATION, LABEL as TIDE_LABEL } from "../maree/calcul.js";
import { farFrom, NEAR_KM, nextText, shomPort, tidesAt, tidesNear } from "../tools/maree.js";
import icons from "./icons.json" with { type: "json" };
import { hikesAround } from "./liens.js";
import rubriques from "./og-rubriques.json" with { type: "json" };
import { byUse, FIRST, type Urgent, urgentKeys, WITH_PAGE } from "./categories.js";
import { COMMUNES, CYCLONE, type Entree, GROUPES } from "./menu.js";
import { FLAG_INNER } from "./flag.js";
import { logo } from "./logo.js";
import { esc, islandMap, mapCredit, type Marker, NOMS_SCRIPT, ownIds, RELIEF_SCRIPT } from "./map.js";
import { legende } from "./carte-legende.js";
import { typo } from "./typo.js";
import { mentionLinks } from "../mentions.js";
import { withSigles } from "./sigles.js";
import { bannerHtml, ENCLOS, volcanBanner } from "./volcan-alerte.js";
import { avisForm } from "./avis.js";
import { aide, SIGNAL_SCRIPT } from "./signaux.js";
import { fond, motif, MOTIF_CREDIT, MOTIF_PAGES } from "./fonds.js";
import { POINTS_SCRIPT } from "./carte-points.js";
import { communeOf, rainPill, windPill } from "./meteo-carte.js";
import { stationOf, stationPath } from "./station.js";
import { INSTALL, OFFLINE_PATH, OFFLINE_SCRIPT, PWA_SCRIPT } from "./pwa.js";
import { FONT_PATH, STOPS, STYLE_PATH } from "./style.js";
import { coastal, PAGES, type PlacePage, PRINCIPAL, slugify } from "./places.js";
import { bathingBlock, ruleTop } from "./baignade.js";
import { REGLE_COURTE } from "../eau/requin.js";
import { adresseTexte } from "./adresse.js";
import { coupable, crumbBar, crumbs, lienNom, nomsCoupables } from "./domains.js";
import * as meteorOi from "../providers/meteor-oi.js";
import { PASSES } from "../historique/cyclones-passes.js";
import { OLD_MINUTES, ditAmateur, reseauAmateur, stationKind } from "../tools/meteo.js";
import { enTete } from "../tools/representativeness.js";
import { script } from "./scripts-declares.js";

// What a search engine shows of a title: the tab's title takes the first of its forms that fits.
const TITLE_MAX = 60;

export const SITE = "rundata.re";
// The tagline, in Réunion Creole (« l'île en direct »); also on the og:image (scripts/build-og.py).
export const SLOGAN = `<p class="slogan" lang="${brand.slogan_lang}">${esc(brand.slogan)}</p>`;

export function chip(t: number): string {
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
  const [[t0, c0], [t1, c1]] = [STOPS[i], STOPS[i + 1]];
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return `#${c0.map((c, j) => Math.round(c + (c1[j] - c) * k).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A list of more rows than this is folded by category (<details>), each opened with a tap, a link to one of its rows or
 * a filter that keeps some (the page's script, `unfold`); a shorter one, or a category alone, stays open.
 */
export const FOLD_ROWS = 8;
/**
 * A category of such a list: its line (`head`, an <h3> with its count), folded over its rows, or `open` and folding
 * with a tap; as it was when not `fold`.
 */
export const folded = (fold: boolean, head: string, body: string, open = false) =>
  (fold ? `<details${open ? " open" : ""}><summary>${head}</summary>${body}</details>` : head + body);
export const hm = (iso: string | Date) => localTime(new Date(iso)).split(" ")[1];

/** « le 05/11 à 05:02 » from « 05/11 05:02 »; a time alone (« 05:02 ») said « à 05:02 ». */
const dit = (word: "le" | "du", dayTime: string) => {
  const [day, time] = dayTime.split(" ");
  return time ? `${word} ${day} à ${time}` : `à ${day}`;
};

/**
 * The time of a measure or of a reading, with its day even today: « le 05/11 à 05:02 ». A page copied by a search
 * engine, or read the next day, then never gives yesterday's measure for today's (05/11/2026: « 15,9 °C à 20:48 »
 * taken for the evening's by an assistant). `duAt`: after « de », « du 05/11 à 05:02 ».
 */
export const leAt = (at: string | Date) => dit("le", localTime(new Date(at)));
export const duAt = (at: string | Date) => dit("du", localTime(new Date(at)));
/** The same from the tools' « 05/11 05:02 » (`heure_mesure`). */
export const leJour = (dayTime: string) => dit("le", dayTime);
export const duJour = (dayTime: string) => dit("du", dayTime);
/** The day of a time, « 05/11 ». */
const jourDe = (at: string | Date) => localTime(new Date(at)).split(" ")[0];
/** Two times of measures, with their day: « le 05/11 à 14:00 », « le 05/11 de 13:48 à 14:00 », « du 04/11 à 23:58 au 05/11 à 00:04 ». */
export const leDeA = (first: string | Date, last: string | Date) =>
  jourDe(first) !== jourDe(last) ? `${duAt(first)} au ${jourDe(last)} à ${hm(last)}`
    : hm(first) === hm(last) ? leAt(last) : `le ${jourDe(last)} de ${hm(first)} à ${hm(last)}`;

/** When a copy was read, said after « de » or « à », with its day: « du 25/10 à 03:12 », « le 25/10 à 03:12 ». */
export function readAt(at: Date, _now?: Date): { de: string; a: string } {
  return { de: duAt(at), a: leAt(at) };
}

/**
 * « il y a 5 min », kept true in a copy of the page served minutes after it was built: the script of the layout
 * counts it again from the time of the data, in the browser.
 */
export const since = (iso: string | Date, now: Date) =>
  `<span data-age="${new Date(iso).toISOString()}">${ageText(ageMinutes(new Date(iso), now))}</span>`;

export const DATAGOUV_REUSE = "https://www.data.gouv.fr/reuses/rundata-re-la-reunion-974-en-direct-pour-vous-et-votre-assistant-ia";
// Where else rundata.re lives, linked from every footer and named in the home page's structured data.
export const GITHUB = "https://github.com/rundata-re/rundata";
export const GLAMA = "https://glama.ai/mcp/servers/rundata-re/rundata";
export const LOBEHUB = "https://lobehub.com/mcp/rundata-re-rundata";

/** An account of rundata.re: its name, its address, its logo drawn in the text colour. */
export interface Social {
  nom: string;
  /** Empty while the account is not confirmed: the entry then shows nowhere. */
  url: string;
  svg: string;
}

// rundata.re's accounts, linked from the bar of every page (the menu on phones), from the home page's hero, from every
// footer, from the line above the feedback form and from /presse, and named
// in the home page's structured data (sameAs), in this order. Another network: one more entry, its logo a 24×24 SVG.
export const SOCIAL: Social[] = [
  {
    nom: "Facebook",
    url: "https://www.facebook.com/rundata.re",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8z"/></svg>`,
  },
  {
    nom: "Instagram",
    url: "https://www.instagram.com/rundata.re/",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  },
  // Threads' mark from Simple Icons (CC0 1.0).
  {
    nom: "Threads",
    url: "https://www.threads.com/@rundata.re",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/></svg>`,
  },
  // TikTok's mark from Simple Icons (CC0 1.0).
  {
    nom: "TikTok",
    url: "https://www.tiktok.com/@rundatare",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  },
  // YouTube's and X's marks from Simple Icons (CC0 1.0).
  {
    nom: "YouTube",
    url: "https://www.youtube.com/@rundatare",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  },
  {
    nom: "X",
    url: "https://x.com/rundata_re",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>`,
  },
  {
    nom: "WhatsApp",
    url: "https://www.whatsapp.com/channel/0029VbEDFav5Ui2agqGyG63Q",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.3a8.5 8.5 0 1 1 3.1 3.1Z"/><path d="M8.7 7.6c.3-.3.8-.3 1 .1l.9 1.5c.2.3.1.7-.1.9l-.5.5c.5 1.1 1.3 1.9 2.4 2.4l.5-.5c.2-.2.6-.3.9-.1l1.5.9c.4.2.4.7.1 1l-.6.6c-.6.6-1.4.7-2.1.4a8.6 8.6 0 0 1-4.5-4.5c-.3-.7-.2-1.5.4-2.1Z" fill="currentColor" stroke="none"/></svg>`,
  },
  // The code, last: GitHub's mark (Primer Octicons, mark-github-24).
  {
    nom: "GitHub",
    url: GITHUB,
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"/></svg>`,
  },
];

/** Accounts linked everywhere but in the bar of wide screens, where only the networks to follow fit. */
export const BAR_LEFT_OUT = ["WhatsApp", "GitHub"];

/** The accounts that have an address. */
export const followed = (list = SOCIAL) => list.filter((s) => s.url);

/** Visits from the site's own links are counted apart (src/metrics.ts); not on GitHub, which brings none back to count. */
const fromSite = (url: string) => (url === GITHUB ? url : `${url}${url.includes("?") ? "&" : "?"}ref=site`);

/**
 * Each account's logo is written once per page, as a <symbol> at the top of the bar (`accountSymbols`), and every link
 * to it, in the bar, the menu and the footer, draws it with <use>: three copies of six logos weighed 11.8 KB of each
 * page. The symbol keeps the logo's own fill or stroke; currentColor is the colour of the link that draws it.
 */
const symbolId = (s: Social) => `c-${s.nom.toLowerCase()}`;
const ownLogo = (s: Social) => SOCIAL.includes(s) && !!s.url;

/** The logos of the accounts that have an address, each a <symbol>, in an <svg> that takes no room. */
export function accountSymbols(): string {
  const symbols = followed().map((s) => {
    const [, attrs, body] = s.svg.match(/^<svg ([^>]*)>([^]*)<\/svg>$/)!;
    const kept = attrs.replace(/\s*(?:viewBox|aria-hidden)="[^"]*"/g, "").trim();
    return `<symbol id="${symbolId(s)}" viewBox="0 0 24 24"${kept ? ` ${kept}` : ""}>${body}</symbol>`;
  });
  return symbols.length ? `<svg hidden aria-hidden="true">${symbols.join("")}</svg>` : "";
}

/** Each account as a link, its logo and its name; the logo alone in the bar, where its label names it. */
const accountLinks = (list = SOCIAL, logoOnly = false) =>
  followed(list).map((s) => {
    const logo = ownLogo(s) ? `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${symbolId(s)}"/></svg>` : s.svg;
    return `<a href="${esc(fromSite(s.url))}" rel="noopener" aria-label="rundata.re sur ${esc(s.nom)}">${logo}${logoOnly ? "" : esc(s.nom)}</a>`;
  });

/** The links two by two, each group kept on one line, the last one by three when they are odd: never one left alone. */
const paired = (links: string[]) => {
  const groups: string[][] = [];
  for (let k = 0; k < links.length; k += 2) groups.push(links.slice(k, k + 2));
  if (groups.length > 1 && groups.at(-1)!.length === 1) groups.at(-2)!.push(...groups.pop()!);
  return groups.map((g) => `<span class="pair">${g.join("")}</span>`).join("");
};

/**
 * « Suivre rundata.re » and each account, with its logo and its name; nothing when none has an address. The accounts
 * go together, under the words when they do not fit beside them (a phone), rather than one left alone on a line. The
 * words are one span, so the flex gap of .social never splits them (« Suivre   rundata.re   : »).
 */
export function follow(list = SOCIAL, cls = "social"): string {
  const links = accountLinks(list);
  return links.length ? `<p class="${cls}"><span class="suivre">Suivre rundata.re :</span> <span>${paired(links)}</span></p>` : "";
}

// Search engines cut (and Bing flags) a meta description over 160 characters.
export const DESCRIPTION_MAX = 160;
export const fit = (base: string, tail: string) => ((base + tail).length <= DESCRIPTION_MAX ? base + tail : base);
export const deg = (t: number) => `${fr(Math.round(t * 10) / 10)} °C`;
// The unit alone, not the start of a word (« basse mer », « 15 min »).
export const thin = (s: string) => s.replace(/ (°C|km\/h|mm|m|%)(?!\p{L})/gu, "\u202f$1");
export const metres = (m: number) => thin(`${m.toLocaleString("fr-FR")} m`);

// Line icons, 24×24, drawn in the text colour.
const ICON: Record<string, string> = {
  thermo: `<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v8"/>`,
  cloud: `<path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.5 12a3.5 3.5 0 0 1-3 7Z"/><path d="M9 22l1-2M13 22l1-2"/>`,
  // A flame, for the fires seen by satellite: not the vigilance's triangle (04/11/2026).
  // A fuel pump, for the prices at the pump in the menu: not the floods' gauge (04/11/2026).
  fuel: `<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>`,
  flame: `<path d="M12 3c.5 3.5 4.5 5.5 4.5 10a4.5 4.5 0 0 1-9 0c0-2.3 1.2-3.6 2.2-4.6.3 1.6 1.1 2.6 2.3 3 0-2.8-.6-5.5 0-8.4Z"/>`,
  wave: `<path d="M2 10c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 19.5"/>`,
  mountain: `<path d="m2 20 7-12 4 6 3-4 6 10Z"/>`,
  gauge: `<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 13 4-4"/>`,
  alert: `<path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18h.01"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`,
  volcano: `<path d="m3 20 6-10h6l6 10Z"/><path d="M10 6c0-2 1-3 2-3s2 1 2 3"/>`,
  bolt: `<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>`,
  air: `<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>`,
  building: `<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>`,
  scale: `<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 2 14a3 3 0 0 0 6 0Z"/><path d="m19 7-3 7a3 3 0 0 0 6 0Z"/>`,
  landmark: `<path d="M3 21h18M4 10h16M12 3l8 7H4Z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  map: `<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3Z"/><path d="M9 4v13M15 7v13"/>`,
  car: `<path d="M3 13l2.2-5.5A2 2 0 0 1 7.1 6h9.8a2 2 0 0 1 1.9 1.5L21 13v4H3Z"/><path d="M3 13h18"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>`,
  bus: `<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><path d="M8 14.5h.01M16 14.5h.01"/>`,
  grid: `<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  spark: `<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/><path d="M19 15c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>`,
  pin: `<path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>`,
  bike: `<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 9h6l3.5 8M9 9l3 8h-6.5M15 9l-1-3h-2.5"/>`,
  plug: `<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>`,
  moon: `<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  heart: `<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>`,
  history: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/>`,
  drop: `<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>`,
  cyclone: `<path d="M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0"/><path d="M14.5 12c0-4 3-7 7-7.5M9.5 12c0 4-3 7-7 7.5M12 9.5C8 9.5 5 6.5 4.5 2.5M12 14.5c4 0 7 3 7.5 7"/>`,
  trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4"/>`,
  news: `<path d="M4 5h13v14H6a2 2 0 0 1-2-2Z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h4"/>`,
  kids: `<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M7 11h10M9 21l3-6 3 6"/>`,
  people: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4a6 6 0 0 1 3 5.6"/>`,
  key: `<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>`,
  wifi: `<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>`,
  antenna: `<circle cx="12" cy="9" r="1.5"/><path d="M8.5 5.5a5 5 0 0 0 0 7M15.5 5.5a5 5 0 0 1 0 7M5.5 2.5a9 9 0 0 0 0 13M18.5 2.5a9 9 0 0 1 0 13M12 10.5 8 21M12 10.5l4 10.5M9.5 17h5"/>`,
  briefcase: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>`,
  fish: `<path d="M6 12c2.5-3.5 5.5-5.5 9-5.5s5.5 2.5 7 5.5c-1.5 3-3.5 5.5-7 5.5S8.5 15.5 6 12Z"/><path d="M6 12 2 8.5v7Z"/><circle cx="17.5" cy="11" r=".9"/>`,
  doc: `<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 15h6M9 18h4"/>`,
  music: `<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>`,
};
export const icon = (name: string) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

interface Head {
  title: string;
  description: string;
  path: string;
  jsonld: object[];
  /** Météo-France's vigilance above green, on every page. */
  alerte?: Alerte;
  /** Kept out of the search engines: a page whose data is not served yet (/feux without its key). */
  noindex?: boolean;
  /** A page written in English (/en): the page in lang="en", the site's menu, banners and footer, still in French, in lang="fr". */
  en?: boolean;
  /** The page's RSS feed (a commune's alerts): announced in the head, linked in the footer. */
  rss?: { href: string; title: string; link: string; hint: string };
  /** The offline page, kept on phones until the service worker changes: no banner of the moment, nothing to send. */
  shell?: boolean;
  /** A page that is a form itself (/associations/proposer): no feedback form below, where an event could be typed by mistake. */
  sansAvis?: boolean;
  /** Nothing to share nor follow below (the secret link of a proposed event: its author would think they share it). */
  sansPartage?: boolean;
  /** The sharing below without the install block: /application, whose steps are the page itself. */
  sansInstallation?: boolean;
  /** The page's referrer policy, besides the header: « no-referrer » where the address holds a secret. */
  referrer?: string;
  /** The page shows the volcano's alert itself (the home page's card, /volcan's heading): no volcano banner above it. */
  volcan?: boolean;
  /** The band shows the contour lines beside its text from 1200 px, like the pages of MOTIF_PAGES (web/fonds.ts): the page of an address that does not exist. */
  motif?: boolean;
  /** /vigilance, /cyclones and /crues: their own data says all is green, the only time their picture is shown (fonds.ts). */
  vert?: boolean;
  /** The page's own hook, in place of its category's: a station's page, which says since when it measures. */
  hook?: string;
  /** The page's own text, under its title and before its hook (HTML): a commune's page that has one (communes-textes.ts). */
  texte?: string;
  /**
   * The two blocks about the assistants (the question « Domann out IA » and « Votre IA, branchée sur… ») out of <main>,
   * in one <aside> after it; <main> keeps one line at its foot with the page's own question (iaAside()). The head pages
   * whose own text must outweigh the template's (/coupures-eau, /bus, /sentiers, /meteo, /carburants, /secheresse, the
   * communes), then since 14/11/2026 those of a place or a commune (/meteo/x, /aujourdhui/x, /coupures-eau/x) and
   * /volcan, /cyclones, /evenements, /actualites, where it was the same text on each page. A question a page writes in its
   * own text stays there (the volcano during an alert); the home page's is its own card, not this block.
   */
  iaAside?: boolean;
  /** The picture of another section in link previews (scripts/build-og.py's key): a past cyclone, a station that no
   * longer measures, show the history's, not the « en direct » of their section's. */
  image?: string;
}

/**
 * An alert on one line, for a phone (below 600 px), two in a rare case: the whole line leads to the page that details
 * it. Never cut with « … », which could cut whose the alert is or « Enclos interdit ». The banner's sentence
 * stays on wider screens, and on the page the line would lead to. `after`: said after it, free to break (the time of a
 * vigilance kept).
 */
export function ligne(href: string, picto: string, text: string, after?: string): string {
  // The last part (the zones, « Enclos interdit ») kept whole: on two lines, the line breaks before its « · ».
  const i = text.lastIndexOf(" · ");
  const said = i < 0 ? esc(text) : `${esc(text.slice(0, i))} <span class="nw">· ${esc(text.slice(i + 3))}</span>`;
  return `<a class="ligne" href="${href}">${picto ? `<span aria-hidden="true">${picto}</span>` : ""}<span class="txt">${said}${after ? ` · ${esc(after)}` : ""}</span><span aria-hidden="true">→</span></a>`;
}

// The words of the line, the validated ones: the phenomena by a short name, two at most; the zones named while one or two,
// counted beyond, « toute l'île » or « toutes les côtes » when all are.
const SHORT: Record<string, string> = { "Fortes pluies / orages": "pluies-orages", "Vents forts": "vents forts", "Vagues - submersion": "vagues-submersion" };
const COASTS = Object.values(mf.ZONES).filter((z) => z.startsWith("Zone côtière")).length;
function zonesSaid(zones: string[]): string {
  const coast = zones.filter((z) => z.startsWith("Zone côtière"));
  const land = zones.filter((z) => !coast.includes(z)).map((z) => z.split(" :")[0]);
  const parts = [
    land.length === LAND.length ? "toute l'île" : land.length > 2 ? `${land.length} zones` : land.join(", "),
    coast.length === COASTS ? "toutes les côtes" : coast.length ? `${coast.length} ${coast.length > 1 ? "zones côtières" : "zone côtière"}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

// The cyclone alert is the prefect's, which Météo-France publishes: the line says whose it is.
function vigilanceLigne(a: Alerte): string {
  const c = a.court;
  if ("cyclone" in c) return c.prevue ? "Alerte cyclonique prévue par le préfet" : `${cycloneHead(c.cyclone)} du préfet`;
  return `Météo-France : vigilance ${feminine(c.couleur)} ${c.phenomenes.slice(0, 2).map((p) => SHORT[p] ?? p.toLowerCase()).join(", ")} · ${zonesSaid(c.zones)}`;
}

function banner(a: Alerte | undefined, path: string): string {
  if (!a) return "";
  const more = path === "/vigilance" ? "" : ` <a href="/vigilance">Voir la vigilance zone par zone →</a>`;
  const schools = a.ecoles && path !== "/ecoles-cyclone" ? ` <a href="/ecoles-cyclone">Écoles fermées →</a>` : "";
  // After « Voir la vigilance zone par zone → », where Météo-France says it: the cyclone's page for the cyclone alert.
  const official = ` ${officielHtml("cyclone" in a.court ? mf.OFFICIEL_CYCLONE : mf.OFFICIEL_VIGILANCE)}`;
  const short = path === "/vigilance" ? "" : ligne("/vigilance", "⚠", vigilanceLigne(a), a.lue) + (a.ecoles && path !== "/ecoles-cyclone" ? ligne("/ecoles-cyclone", "", "Écoles et crèches fermées") : "");
  return `<div class="alerte vg ${a.neutre ? "vgpre" : `vg${a.couleur}`}"${short ? " data-court" : ""} role="status">${short}<div class="wrap"><span>⚠ ${esc(a.texte)}${a.lue ? ` · ${esc(a.lue)}` : ""}</span>${schools}${more}${official}</div></div>`;
}

/**
 * A tab taken up again, kept in the browser's memory or hidden for hours: its clock says now, its measures « il y a
 * 3 h ». When the newest measure of the page is more than 15 min old, the page is asked again; at most once per 15 min
 * for a page, since a source that does not answer keeps the measures old.
 */
export const RELOAD_SCRIPT = `const again=()=>{const a=[...document.querySelectorAll("[data-age]")].map((e)=>Date.parse(e.dataset.age)).filter((t)=>t>0);
const n=Date.now();if(!a.length||n-Math.max(...a)<9e5)return;const k="recharge:"+location.pathname;let last=0;try{last=Number(sessionStorage.getItem(k))||0}catch{}
if(n-last<9e5)return;try{sessionStorage.setItem(k,String(n))}catch{}location.reload()};
addEventListener("pageshow",(e)=>{if(e.persisted)again()});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")again()});`;

/**
 * On a phone (coarse pointer), a tap on a link of copies() also copies its text, and the line after its paragraph
 * says whether it was. After the `?maj=` of the links (SCRIPT), so that the question copied has it.
 */
export const COPIE_SCRIPT = `const copieOn=(root)=>root.querySelectorAll("a[data-copie]").forEach((a)=>a.addEventListener("click",()=>{if(!matchMedia("(pointer:coarse)").matches)return;
const s=a.parentElement.nextElementSibling,say=(k)=>{s.textContent=a.dataset[k];s.hidden=false};
try{navigator.clipboard.writeText(a.dataset.copie||new URL(a.href).searchParams.get("q")).then(()=>say("ok"),()=>say("non"))}catch{say("non")}}));copieOn(document);`;

/**
 * A folded category (`folded`) opened by a link to it or to one of its rows: the browsers that open it themselves
 * (Chrome, Safari 26 at least) are not all, nor a link to the card that holds it, a commune's on a map.
 */
export const UNFOLD_SCRIPT = `(()=>{const unfold=()=>{const t=location.hash&&document.getElementById(location.hash.slice(1));const d=t&&(t.closest("details")||t.querySelector(":scope>details"));if(d)d.open=true};unfold();addEventListener("hashchange",unfold)})();`;

/**
 * « Aller au contenu »: the focus to the first thing read in the main landmark, the vigilance's or the volcano's band as
 * shown (its short line on a phone, its text on a computer), else the title. Never to <main> itself (no tabindex): TalkBack
 * reads a landmark that takes the focus as one block, then again element by element (24/11/2026, TalkBack 14.2). Without
 * the script, the link still moves the reading point to the landmark.
 */
export const EVITE_SCRIPT = `const evite=document.querySelector(".evite");if(evite)evite.addEventListener("click",(e)=>{
const t=[...document.querySelectorAll("#contenu .alerte .ligne,#contenu .alerte .wrap>span,#contenu h1")].find((x)=>x.getClientRects().length);if(!t)return;
e.preventDefault();if(!t.matches("a[href]")){t.setAttribute("tabindex","-1");t.setAttribute("data-cible","")}t.focus()});`;

const SCRIPT = `${EVITE_SCRIPT}
const menu=document.querySelector("details.menu");if(menu){document.addEventListener("click",(e)=>{if(menu.open&&!menu.contains(e.target))menu.open=false});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}})}
${UNFOLD_SCRIPT}
document.querySelectorAll("[data-copy]").forEach((b)=>b.addEventListener("click",async()=>{const t=document.getElementById(b.dataset.copy);
const o=b.textContent;if(b.dataset.signal&&location.pathname==="/mcp")sig("c");try{await navigator.clipboard.writeText(t.textContent);b.textContent="Copié ✓";setTimeout(()=>b.textContent=o,2500)}catch{getSelection().selectAllChildren(t)}}));
const f=document.getElementById("filtre");if(f){const n=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
f.addEventListener("input",()=>{const q=n(f.value.trim());let any=false;document.querySelectorAll(".places li").forEach((li)=>{const ok=n(li.textContent+" "+(li.dataset.aussi||"")).includes(q);li.hidden=!ok;any||=ok});
document.querySelectorAll(".places h3").forEach((h)=>{h.hidden=![...h.nextElementSibling.children].some((li)=>!li.hidden)});const rq=document.getElementById("rien-q");if(rq)rq.textContent=f.value.trim();document.getElementById("rien").hidden=any})}
const askl=(l,bind)=>{document.querySelectorAll("[data-askl]").forEach((b)=>b.setAttribute("aria-pressed",b.dataset.askl===l));
document.querySelectorAll(".askbox>template[data-tl]").forEach((t)=>{if(t.dataset.tl!==l)return;const d=t.content.firstElementChild.cloneNode(true);t.replaceWith(d);if(bind){majOn(d);copieOn(d)}});
document.querySelectorAll(".askbox>[data-l]").forEach((d)=>{d.hidden=d.dataset.l!==l})};
try{const l=localStorage.getItem("askl");if(l)askl(l)}catch{}
document.querySelectorAll("[data-askl]").forEach((b)=>b.addEventListener("click",()=>{askl(b.dataset.askl,true);try{localStorage.setItem("askl",b.dataset.askl)}catch{}}));
const majOn=(root)=>root.querySelectorAll("a[data-maj]").forEach((a)=>{const h=a.getAttribute("href"),u=a.dataset.maj;const set=()=>{const t=new Date(Date.now()+144e5);
a.href=h.replace(encodeURIComponent(u),encodeURIComponent(u+"?maj="+t.getUTCHours()+"h"+String(t.getUTCMinutes()).padStart(2,"0")))};["click","auxclick","contextmenu"].forEach((e)=>a.addEventListener(e,set))});majOn(document);
${COPIE_SCRIPT}
${POINTS_SCRIPT}
${NOMS_SCRIPT}
${RELIEF_SCRIPT}
const hhmm=(t)=>{const d=new Date(t+144e5);return String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")};
const tick=()=>{const n=Date.now();document.querySelectorAll("[data-clock]").forEach((e)=>{e.textContent=hhmm(n)});
document.querySelectorAll("[data-age]").forEach((e)=>{const m=Math.max(0,Math.round((n-Date.parse(e.dataset.age))/6e4));
e.textContent="il y a "+(m<90?m+" min":m<2880?Math.round(m/60)+" h":Math.round(m/1440)+" jours")})};
document.querySelectorAll("[data-js]").forEach((e)=>{e.hidden=false});document.querySelectorAll("[data-nojs]").forEach((e)=>{e.hidden=true});
tick();setInterval(tick,3e4);
const mt=document.querySelector("[data-mtip]");if(mt){const box=mt.parentElement;let on=null,touch=false,t=0;
const put=(a)=>{clearTimeout(t);if(on)on.classList.remove("on");on=a;a.classList.add("on");
const L=box.querySelector("[name=wxl]:checked"),k=L?L.id.slice(4):"";mt.querySelector(".mt-p").textContent=a.dataset.tp;mt.querySelector(".mt-v").textContent=a.dataset["tv"+k]||a.dataset.tv;mt.querySelector(".mt-d").textContent=a.dataset["td"+k]||a.dataset.td;mt.href=a.getAttribute("href");
mt.hidden=false;const f=box.getBoundingClientRect(),r=([...a.querySelectorAll(".sh")].find((e)=>e.getBoundingClientRect().width)||a).getBoundingClientRect(),w=mt.offsetWidth,h=mt.offsetHeight;
const c0=a.dataset.cote,c1=(c0==="r"&&r.right-f.left+w+18>f.width)||(c0==="l"&&r.left-f.left-w-18<0)||(c0==="t"&&r.top-f.top-h-12<0)?"b":c0,c=c1==="b"&&r.bottom-f.top+h+12>f.height?"t":c1,side=c==="l"||c==="r",cx=r.left+r.width/2-f.left,x=Math.min(Math.max(cx-w/2,6),f.width-w-6),up=c?c==="t":r.top-f.top-h-12>=0;
mt.classList.toggle("bas",!up&&!side);mt.classList.toggle("cote",side);mt.style.left=(side?(c==="l"?r.left-f.left-w-12:r.right-f.left+12):x)+"px";
mt.style.top=(side?r.top+r.height/2-f.top-h/2:up?r.top-f.top-h-12:r.bottom-f.top+12)+"px";
mt.style.setProperty("--ax",Math.min(Math.max(cx-x,16),w-16)+"px");requestAnimationFrame(()=>mt.classList.add("vu"))};
const off=()=>{clearTimeout(t);if(on)on.classList.remove("on");on=null;mt.classList.remove("vu");mt.hidden=true};
const later=()=>{clearTimeout(t);t=setTimeout(off,160)};
box.querySelectorAll("a.mk[data-tp]").forEach((a)=>{a.addEventListener("pointerdown",(e)=>{touch=e.pointerType!=="mouse"});
a.addEventListener("pointerenter",(e)=>{if(e.pointerType==="mouse"&&!a.classList.contains("lb"))put(a)});a.addEventListener("pointerleave",(e)=>{if(e.pointerType==="mouse")later()});
a.addEventListener("focus",()=>{if(!touch)put(a)});a.addEventListener("blur",later);
a.addEventListener("click",(e)=>{if(touch&&on!==a){e.preventDefault();put(a)}touch=false})});
box.querySelectorAll("[name=wxl]").forEach((i)=>i.addEventListener("change",off));mt.addEventListener("pointerenter",()=>clearTimeout(t));mt.addEventListener("pointerleave",(e)=>{if(e.pointerType==="mouse")later()});
document.addEventListener("click",(e)=>{if(on&&!e.target.closest("a.mk,[data-mtip]"))off()});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"&&on)off()});addEventListener("resize",()=>{if(on)put(on)})}
${RELOAD_SCRIPT}
${PWA_SCRIPT}
${SIGNAL_SCRIPT}`;

/** Whether a page belongs to a category: /meteo/cilaos is in the weather. */
const inCategory = (path: string, category: string) => path === category || path.startsWith(`${category}/`);

/**
 * One sentence under each page's title that says what it is good for before its data (« Avant de partir : les
 * sentiers fermés d'après la carte de l'ONF, et pourquoi. »): the page's own, else its category's, the longest match first.
 */
const HOOKS: [string, string][] = [
  ["/", "Les sorties, les randos, le temps et les routes de l'île en ce moment, pour vous et votre IA."],
  ["/meteo", "Le temps qu'il fait vraiment, mesuré par la station la plus proche, et la prévision à part."],
  ["/vigilance", "Avant de sortir : la vigilance officielle de Météo-France, zone par zone."],
  ["/crues", "Fortes pluies ? La vigilance crues et la hauteur des rivières en ce moment, station par station, d'après Vigicrues Réunion."],
  ["/mer/historique", "Plus chaude que d'habitude ? La mer de chaque jour face à ses années passées."],
  ["/mer", "Avant la plage : la température de l'eau au large de chaque plage."],
  ["/volcan", "Éruption ou pas, Enclos ouvert ou fermé : l'état du volcan avant de monter."],
  ["/bus", "Votre prochain bus, à l'heure annoncée par le réseau, sans appli à installer."],
  ["/trafic", "Avant de prendre la route : la carte officielle des bouchons et des travaux, et ce que signalent les médias."],
  ["/actualites", "Ce qui se passe sur l'île en ce moment, commune par commune."],
  ["/air", "Sport dehors ou pas : la qualité de l'air dans votre commune aujourd'hui."],
  ["/electricite", "Quand recharger la voiture ou lancer la machine : l'électricité de l'île en ce moment."],
  ["/calendrier", "Pour prévoir la semaine : les prochaines vacances scolaires et les jours fériés."],
  ["/velos", "Un vélo à prendre ou une place pour le rendre, avant de vous déplacer."],
  ["/bornes", "Une borne libre près de vous, avant de faire le détour."],
  ["/eau", "Baignade ou robinet : la dernière analyse de l'ARS près de chez vous."],
  ["/randonnees", "Choisir une rando ouverte d'après la carte de l'ONF, avec sa trace GPS et son dénivelé."],
  ["/sentiers", "Avant de partir : les sentiers fermés d'après la carte de l'ONF, et pourquoi."],
  ["/secheresse", "Arrosage, lavage, piscine : ce qui est interdit dans votre commune en ce moment."],
  ["/coupures-eau", "Coupure d'eau ou eau à ne pas boire : les avis en cours des distributeurs."],
  ["/sport", "Les matchs du week-end et les derniers résultats de l'île."],
  ["/evenements", "Ce week-end : concerts, fêtes et marchés, commune par commune."],
  ["/cyclones", "Un cyclone dans l'océan Indien ? Son stade selon le CMRS de Météo-France, et le lien vers son site officiel."],
  ["/historique", "Normal pour la saison ? Le temps qu'il a fait, comparé à la normale."],
  ["/communes", "Les 24 communes de l'île : pour chacune, sa fiche et sa journée."],
];
// A trail's or a hike's own page: one trace, not the list of the day's closures.
const TRACE_HOOK = "La trace à télécharger et l'état du sentier d'après la carte de l'ONF, avant de partir.";
// A past cyclone's page: measures, not the tracking of the moment.
const PASSE_HOOK = "Ce que les stations de Météo-France ont mesuré pendant son passage.";

export function hook(path: string): string | undefined {
  const trace = /^\/(sentiers|randonnees)\/([a-z0-9-]+)$/.exec(path);
  if (trace && (trace[1] === "sentiers" ? traces.sentier(trace[2]) : traces.randonnee(trace[2]))) return TRACE_HOOK;
  if (PASSES.some((p) => path === `/cyclones/${p.slug}`)) return PASSE_HOOK;
  return HOOKS.filter(([p]) => (p === "/" ? path === "/" : inCategory(path, p))).sort((x, y) => y[0].length - x[0].length)[0]?.[1];
}

/**
 * Above the feedback form: send the page on WhatsApp, the island's first channel with Facebook (a plain link, no
 * script of theirs; `?ref=wa` counts the visits it brings, src/metrics.ts), follow rundata.re's accounts, and put the
 * site on the home screen (web/pwa.ts). The accounts say what each brings: a useful fact every morning, the weekend's
 * outings on Friday on the WhatsApp channel, named « chaîne WhatsApp » so as not to read as the share link.
 */
function share(origin: string, head: Head): string {
  const text = `${head.title.replace(/ · (?:La Réunion \(974\)|974)$/, "")} : ${origin}${head.path}?ref=wa`;
  // A name of one letter (X) is read « X majuscule »: the link says whose account it is, in words.
  const link = (s: Social, label = s.nom) =>
    `<a href="${esc(fromSite(s.url))}" rel="noopener"${/^\p{L}$/u.test(label) ? ` aria-label="rundata.re sur ${esc(label)}"` : ""}>${esc(label)}</a>`;
  // The two promises first, Facebook's fact every morning and the WhatsApp channel's outings on Friday; then the
  // other networks, a plain list of where rundata.re is, with no rhythm promised (wording validated on 22/11/2026): « Suivez
  // rundata.re : une info utile chaque matin sur Facebook, les sorties du week-end le vendredi sur notre chaîne
  // WhatsApp. Aussi sur Instagram, Threads, TikTok, YouTube et X. » A network added later goes before « et X ».
  // The code is not an account to follow for news: GitHub stays out of this sentence.
  const has = (nom: string) => followed().find((s) => s.nom === nom);
  const facebook = has("Facebook"), channel = has("WhatsApp");
  const promises = [
    facebook && `une info utile chaque matin sur ${link(facebook)}`,
    channel && `les sorties du week-end le vendredi sur sa ${link(channel, "chaîne WhatsApp")}`,
  ].filter((x): x is string => !!x);
  const others = followed().filter((s) => !["Facebook", "WhatsApp", "GitHub"].includes(s.nom)).map((s) => link(s));
  const list = others.length > 1 ? `${others.slice(0, -1).join(", ")} et ${others.at(-1)}` : others[0];
  const sentence = promises.length
    ? `Suivez rundata.re\u00a0: ${promises.join(", ")}.${list ? ` Aussi sur ${list}.` : ""}`
    : list ? `Suivez rundata.re sur ${list}.` : "";
  return `<aside class="share wrap" aria-label="Partager et suivre"><div class="card">
  <a class="sh wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Partager sur WhatsApp ${EXTERNAL}</a>
  ${sentence ? `<p>${sentence}</p>` : ""}
</div>
${head.sansInstallation ? "" : INSTALL}
</aside>`;
}

/** The hook goes right under the page's title; not on /volcan during an alert, whose heading and lines say it. */
/**
 * The count of /chiffres (« sources publiques lues », from compte()), in the footer since the home page's top was made
 * lighter (04/11/2026): from the code alone, counted once per isolate.
 */
let lues: number | undefined;
const sourcesLues = () => (lues ??= compte(toutesLesSources()).sources);

const withHook = (band: string, path: string, volcan?: boolean, own?: string, texte?: string) => {
  const h = volcan && path === "/volcan" ? undefined : own ?? hook(path);
  const under = `${texte ? `\n    ${texte}` : ""}${h ? `\n    <p class="hook">${esc(h)}</p>` : ""}`;
  return under ? band.replace("</h1>", `</h1>${under}`) : band;
};

// The menu: every category with a page, the clubs' space after the sport (once it is out), then the communes; the first
// few also sit in the bar on wide screens. The map of every layer right after the first few, in the menu only.
const MENU = [
  ...WITH_PAGE.flatMap((c) => [{ key: c.key, nom: c.nom, path: c.path, icon: c.icon },
    ...(c.key === "sport" ? [{ key: "associations", nom: "Associations", path: "/associations?ref=menu", icon: "people" }] : [])]),
  { key: "carte", nom: "Carte", path: "/carte", icon: "map" },
  { key: "communes", nom: "Communes", path: "/communes", icon: "pin" },
];

/**
 * The bar on every page: the brand, the main categories on wide screens, the assistant button and the menu of
 * everything. The vigilance and the volcano lead the bar while in force and leave it when quiet; the sea and the buses
 * are in the menu only. The traffic joins the bar once it has data of its own (a measure of the jams, not the media).
 * Five or six links in the bar: their names without their icons, and the accounts in the menu below 75rem, so that the
 * bar never scrolls.
 */
function header(path: string, origin: string, u: Urgent): string {
  // Without the ?ref= a link may carry: the clubs' space is still the page shown.
  const current = (p: string) => (inCategory(path, p.split("?")[0]) ? ' aria-current="page"' : "");
  const menu = byUse(MENU.filter((m) => m.key !== "associations" || enLigne()), u);
  const quick = [...urgentKeys(u), ...FIRST, "communes"].map((k) => menu.find((m) => m.key === k)!)
    .map((m) => `<a class="k-${m.key}" href="${m.path}"${current(m.path)}>${icon(m.icon)}${esc(m.nom)}</a>`).join("");
  // The menu in five groups, « Communes » above them (menu.ts); the cyclone's three pages under « Sécurité ».
  const link = (m: Entree, cls = `k-${m.key}`) => `<a class="${cls}" href="${m.path}"${current(m.path)}><span class="kb">${icon(m.icon)}</span> <span class="gn">${esc(m.nom)}</span></a>`;
  const groups = GROUPES.map((g) => {
    const list = g.entrees.filter((m) => m.key !== "associations" || enLigne());
    const cyc = g.nom === "Sécurité" ? `\n      <p class="cyc">Cyclone\u00a0: ${CYCLONE.map((c) => `<a href="${c.path}"${current(c.path)}>${esc(c.nom)}</a>`).join(" · ")}</p>` : "";
    return `<p class="sheet-h">${esc(g.nom)}</p>\n      <ul class="grid groupe">${list.map((m) => `<li>${link(m)}</li>`).join("")}</ul>${cyc}`;
  }).join("\n      ");
  // The accounts in the bar on wide screens; on a phone, in the menu, so that the bar keeps to the brand and two buttons.
  // In the bar, the networks to follow only: the WhatsApp channel and the code are in the menu and the footer (eight
  // logos no longer fit beside the categories, 22/11/2026).
  const top = accountLinks(SOCIAL.filter((s) => !BAR_LEFT_OUT.includes(s.nom)), true);
  const sheet = accountLinks();
  return `${accountSymbols()}<header class="top"><div class="wrap bar">
  <a class="brand" href="/">${logo()}<span>rundata<span class="tld">.re</span></span></a>
  <nav class="quick" aria-label="Principales catégories">${quick}</nav>
  ${top.length ? `<nav class="follow-top" aria-label="Suivre rundata.re">${top.join("")}</nav>` : ""}
  <a class="cta-ia" href="/mcp" aria-label="Brancher mon IA"${current("/mcp")}>${icon("spark")}<span class="ia-l">Brancher mon IA</span><span class="ia-c">Mon IA</span></a>
  <details class="menu"><summary aria-label="Menu\u00a0: toutes les rubriques"><span class="g">${icon("grid")}</span><span class="x">${icon("close")}</span><span class="m" aria-hidden="true">Menu</span></summary>
    <nav class="sheet" aria-label="Catégories"><div class="wrap">
      ${link(COMMUNES, "kcomm k-communes")}
      ${groups}
      ${sheet.length ? `<p class="sheet-h">Suivre rundata.re</p>\n      <p class="social sheet-follow">${paired(sheet)}</p>` : ""}
      <p class="sheet-h">Le connecteur pour votre IA</p>
      ${connector(origin, "mcp-url-menu")}
      <p class="sheet-h">Sur votre téléphone</p>
      <p><a class="sheet-app" href="/application">Mettre rundata.re sur l'écran d'accueil →</a></p>
    </div></nav>
  </details>
</div></header>`;
}

// Pages outside a section that show the picture of the nearest one, rather than the site's: the cyclone alert's, the
// sea's, a commune's day. /aujourdhui itself, the island's day, keeps the site's.
const NEAREST: [string, string][] = [
  ["/alerte-cyclone", "cyclones"], ["/ecoles-cyclone", "cyclones"], ["/kit-cyclone", "cyclones"],
  ["/baignade", "mer"], ["/peche", "mer"],
];
const pictureOf = (key: string) => rubriques.find((x) => x.png.startsWith(`/og/${key}.`));

/** The picture of the page's section in link previews (scripts/build-og.py, served from public/og/), else the site's. */
function ogImage(origin: string, path: string, key?: string): { src: string; alt: string } {
  const near = NEAREST.find(([p]) => inCategory(path, p))?.[1] ?? (path.startsWith("/aujourdhui/") ? "communes" : undefined);
  const want = key ?? near;
  const r = (want && pictureOf(want)) || rubriques.find((x) => x.pages.some((p) => inCategory(path, p)));
  return r ? { src: `${origin}${r.png}`, alt: r.alt } : { src: `${origin}/og.png?v=${og.v}`, alt: og.alt };
}

/** What the page's banners say is in force, or its own alert block: the offline page, kept for days, says nothing. */
const urgent = (head: Head): Urgent => (head.shell ? {} : { vigilance: !!head.alerte, volcan: !!head.volcan || !!volcanBanner() });

const SOURCES = '<p class="sources">';

/**
 * The page's « Sources : » paragraphs taken out of its body, to be said last, in small, just above the footer: the
 * producers and their licences in full, as the licences ask, without taking a phone's screen before the links (the
 * user, 28/10/2026). They hold no paragraph of their own.
 */
export function sourcesLast(body: string): [string, string[]] {
  const sources: string[] = [];
  let main = "";
  let from = 0;
  for (let at = body.indexOf(SOURCES); at >= 0; at = body.indexOf(SOURCES, from)) {
    const end = body.indexOf("</p>", at) + "</p>".length;
    main += body.slice(from, at);
    sources.push(body.slice(at, end));
    from = end;
  }
  return [main + body.slice(from), sources];
}

/** The JSON-LD's « description » values, at every depth, as the metas' (a raw text: typo() only turns spaces into no-break ones). */
const frenchDescriptions = (key: string, value: unknown) => (key === "description" && typeof value === "string" ? typo(value) : value);

/** Where the element that starts at `from` ends, its own closing tag included; -1 when it is not closed. */
const elementEnd = (html: string, from: number, tag: string) => {
  const isOpen = (i: number) => html.startsWith(`<${tag}`, i) && (html[i + tag.length + 1] === " " || html[i + tag.length + 1] === ">");
  const close = `</${tag}>`;
  let depth = 0;
  for (let i = from; i < html.length; ) {
    const c = html.indexOf(close, i);
    if (c < 0) return -1;
    let o = html.indexOf(`<${tag}`, i);
    while (o >= 0 && o < c && !isOpen(o)) o = html.indexOf(`<${tag}`, o + 1);
    if (o >= 0 && o < c) {
      depth++;
      i = o + tag.length + 1;
    } else {
      depth--;
      i = c + close.length;
      if (depth === 0) return i;
    }
  }
  return -1;
};

/** The first element of `html` at its top level: [start, end, tag], or undefined. */
const firstElement = (html: string): [number, number, string] | undefined => {
  const start = html.indexOf("<");
  if (start < 0) return undefined;
  let n = start + 1;
  while (n < html.length && /[a-z0-9]/.test(html[n])) n++;
  const tag = html.slice(start + 1, n);
  const end = tag ? elementEnd(html, start, tag) : -1;
  return end > 0 ? [start, end, tag] : undefined;
};

const ASKBOX = '<div class="askbox">';

/**
 * The question to an assistant (ask(), « Domann out IA ») written in a page's band comes after the page's first block
 * of data, on every page, by this one rule: after the band when the band shows a map or a figure on a phone too (a
 * figure that is not « nophone »), else after the first block of the main text. Above the data, it took some 300 px of
 * the first screen and delayed the answer one came for (UX review, 04/11/2026). The question is in the band of the
 * pages that write it, so that each page keeps writing it once, where it is read: in the page's text, unchanged. A
 * question already in the main text stays where its page put it (the volcano during an alert, the home page).
 */
export function askAfterData(band: string, main: string): [string, string] {
  const at = band.indexOf(ASKBOX);
  if (at < 0) return [band, main];
  const end = elementEnd(band, at, "div");
  if (end < 0) return [band, main];
  const box = band.slice(at, end);
  // The line it sat on, so that the band keeps no empty one.
  const lineStart = band.lastIndexOf("\n", at) + 1;
  const cut = band.slice(lineStart, at).trim() === "" && (band[end] === "\n" || end === band.length) ? [lineStart, end + 1] : [at, end];
  const rest = band.slice(0, cut[0]) + band.slice(cut[1]);
  const figure = rest.split("<figure").slice(1).some((f) => {
    const cls = f.startsWith(' class="') ? f.slice(8, f.indexOf('"', 8)).split(" ") : [];
    return (f[0] === " " || f[0] === ">") && !cls.includes("nophone");
  });
  // A block of data marked to come before it (« <Lieu> en chiffres », web/en-chiffres.ts): the question after that block.
  const mark = main.indexOf(" data-avant-ia>");
  const from = mark >= 0 ? main.lastIndexOf("<section", mark) : -1;
  const after = from >= 0 ? elementEnd(main, from, "section") : -1;
  if (figure && after > 0) return [rest, `${main.slice(0, after)}\n${box}${main.slice(after)}`];
  if (figure) return [rest, `${box}\n${main}`];
  const first = firstElement(main);
  if (!first) return [rest, `${main}\n${box}`];
  return [rest, `${main.slice(0, first[1])}\n${box}${main.slice(first[1])}`];
}

/**
 * For a page with `iaAside`: the band and the text without the question to an assistant (ASKBOX) and without the
 * section « Votre IA, branchée sur… » (aria-labelledby="h-ia"), the text ending with one line that asks the page's own
 * question (the first sentence of the question in French) and leads to them, and the <aside> that holds them both.
 */
export function iaAside(band: string, main: string): [string, string, string] {
  let box = "";
  const at = band.indexOf(ASKBOX);
  const end = at < 0 ? -1 : elementEnd(band, at, "div");
  if (end > 0) {
    box = band.slice(at, end);
    const lineStart = band.lastIndexOf("\n", at) + 1;
    const cut = band.slice(lineStart, at).trim() === "" && band[end] === "\n" ? [lineStart, end + 1] : [at, end];
    band = band.slice(0, cut[0]) + band.slice(cut[1]);
  }
  let cta = "";
  const s = main.search(/<section\b[^>]*aria-labelledby="h-ia"/);
  const e = s < 0 ? -1 : elementEnd(main, s, "section");
  if (e > 0) {
    cta = main.slice(s, e);
    main = (main.slice(0, s) + main.slice(e)).replace(/\n{3,}/g, "\n\n");
  }
  if (!box && !cta) return [band, main, ""];
  // The question in French, as its box writes it (« Y a-t-il une coupure d'eau à Saint-Denis ? Lis … »): its first sentence.
  // Without its tags nor any < or > left, since it goes back into HTML (sansBalises()); its entities stay as they are.
  const m = /<div data-l="fr"[^>]*>[\s\S]*?<p class="askq">« ([\s\S]*?) »<\/p>/.exec(box)?.[1];
  const fr = m === undefined ? undefined : sansBalises(m);
  const question = fr ? /^[^?]*\?/.exec(fr)?.[0] : undefined;
  const line = `<p class="ia-ligne">${question ? `Demandez à votre IA : « ${question} »` : "Demandez à votre IA"} <a href="#ia" aria-label="Demandez à votre IA : brancher rundata.re">→</a></p>`;
  return [band, `${main}\n${line}`, `<aside class="wrap ia" id="ia" aria-label="Votre IA">\n${box}\n${cta}\n</aside>`];
}

export function layout(origin: string, head: Head, written: string, body: string): string {
  // A page that names its own sources has, in its footer, only the link to them all; the others keep the site's.
  const [text0, sources] = sourcesLast(body);
  // The question to an assistant after the first block of data (askAfterData()), before the acronyms and ids below; or,
  // on a head page, both blocks about the assistants after <main> (iaAside()).
  const [band, main, aside] = head.iaAside ? iaAside(written, text0) : [...askAfterData(written, text0), ""];
  const map = sources.length ? mapCredit(band + main) : undefined;
  if (map) sources.push(map);
  // The IGN's background a visitor picks on a zoomed map (web/map.ts, FONDS), named by its script in the footer's credit.
  const choix = !map && main.includes('class="tabs fonds"') ? '<span class="fd-c"></span>' : "";
  const url = `${origin}${head.path}`;
  // The descriptions in French typography like the page's text, with the no-break space itself, never « &nbsp; »: their
  // length is unchanged. Not the titles, nor the JSON-LD's other values (wording validated on 25/10).
  const d = typo(esc(head.description));
  const image = ogImage(origin, head.path, head.image);
  // Each acronym spelled out at its first occurrence, from the title's band to the end of the main text (web/sigles.ts).
  // Each map with its own ids, when a page has two (ownIds()).
  const [top, text] = ownIds(withSigles([withHook(band, head.path, head.volcan, head.hook, head.texte), mentionLinks(main)]));
  // The contour lines of the decor (web/fonds.ts), in the footer of every page from 1200 px and in the band of a few.
  const decor = !head.shell && motif(head.alerte, !!urgent(head).volcan);
  // On a page in English, what the site keeps in French around it, said so to a reader of the page aloud; not the skip
  // link, in English like the page (WCAG 3.1.2).
  const fr = head.en ? ' lang="fr"' : "";
  // The page in English (web/en.ts) is linked from the footer of every other page, in one word (wording
  // validated on 24/11/2026): no page led to it.
  return `<!doctype html>
<html lang="${head.en ? "en" : "fr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(head.title)}</title>
<meta name="description" content="${d}">
${head.noindex ? `<meta name="robots" content="noindex">\n` : ""}${head.referrer ? `<meta name="referrer" content="${esc(head.referrer)}">\n` : ""}<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${icons["192"]}" type="image/png" sizes="192x192">
<link rel="manifest" href="/manifest.webmanifest">
${head.rss ? `<link rel="alternate" type="application/rss+xml" title="${esc(head.rss.title)}" href="${esc(head.rss.href)}">\n` : ""}<link rel="apple-touch-icon" href="${icons["180"]}">
<meta name="apple-mobile-web-app-title" content="rundata.re">
<link rel="preload" href="${FONT_PATH}" as="font" type="font/woff2" crossorigin>
<meta name="theme-color" content="#0b1f36">
<meta property="og:type" content="website">
<meta property="og:locale" content="${head.en ? "en_GB" : "fr_FR"}">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(head.title)}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image.src)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(image.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(head.title)}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${esc(image.src)}">
<meta name="twitter:image:alt" content="${esc(image.alt)}">
${head.jsonld.length ? `<script type="application/ld+json">${JSON.stringify(head.jsonld.length === 1 ? head.jsonld[0] : head.jsonld, frenchDescriptions).replace(/</g, "\\u003c")}</script>\n` : ""}<link rel="stylesheet" href="${STYLE_PATH}">
</head>
<body>
<a class="evite" href="#contenu">${head.en ? "Skip to content" : "Aller au contenu"}</a>
${head.en ? header(head.path, origin, urgent(head)).replace("<header ", '<header lang="fr" ') : header(head.path, origin, urgent(head))}
<main id="contenu">
${head.shell ? "" : `${head.en ? '<div lang="fr" style="display:contents">' : ""}${banner(head.alerte, head.path)}
${head.volcan ? "" : bannerHtml(volcanBanner(), head.path)}${head.en ? "</div>" : ""}`}
<div class="band${decor && (head.motif || MOTIF_PAGES.has(head.path)) ? " motif" : ""}">${head.shell || head.noindex ? "" : fond(head.path, head.alerte, !!urgent(head).volcan, head.vert)}${top}</div>
<div class="wrap corps">
${text}
</div>
</main>
${aside ? `${aside}\n` : ""}${head.shell ? "" : `${head.en ? '<div lang="fr" style="display:contents">' : ""}${head.sansPartage ? "" : share(origin, head)}
${head.sansAvis ? "" : `${aide()}
${avisForm(head.path)}`}${head.en ? "</div>" : ""}`}
${sources.length ? `<div class="wrap fin-sources" role="region" aria-label="Sources">${sources.join("\n")}</div>\n` : ""}<footer class="foot${decor ? " motif" : ""}"${fr}><div class="wrap">
  <div>
    <a class="brand" href="/">${logo()}<span>rundata.re</span></a>
    ${SLOGAN}
    <p>La Réunion 974 en direct, pour vous et votre assistant IA.</p>
    ${head.rss ? `<p><a href="${esc(head.rss.href)}" title="${esc(head.rss.hint)}">${esc(head.rss.link)}</a></p>` : ""}
    <p>rundata.re, version <a href="/nouveautes">${VERSION}</a> · <a href="${GITHUB}">code libre (MIT)</a> · <a href="/valeurs">valeurs</a> · <a href="/chiffres">${sourcesLues()} sources publiques</a> · <a href="/application">sur votre écran d'accueil</a> · <a href="/ouvrir-ses-donnees">ouvrir ses données</a> · <a href="/sites-sans-reponse">sites sans réponse</a> · aucun cookie, statistiques de visite anonymes · <a href="/confidentialite">confidentialité</a> · <a href="/conditions">conditions et mentions légales</a> · <a href="/a-propos">qui fait rundata.re ?</a> · <a href="/chiffres">rundata.re en chiffres</a> · <a href="/presse">presse</a> · <a href="/nouveautes">nouveautés</a> · <a href="/publier">publier vos données</a>${head.en ? "" : ` · <a href="/en" lang="en" hreflang="en">English</a>`} · ${adresseTexte("contact@rundata.re")}</p>
    <p>Référencé sur ${lienNom(DATAGOUV_REUSE, "data.gouv.fr")}, la plateforme des données publiques françaises, et sur <a href="${GLAMA}">Glama</a>, l'annuaire des serveurs MCP.</p>
    ${follow()}
  </div>
  <div>
    ${sources.length ? `<p><a href="/chiffres">Toutes les sources →</a></p>${decor ? `
    <p>${MOTIF_CREDIT}</p>` : ""}` : `<h3>Sources</h3>
    <p>Mesures : stations Météo-France de La Réunion (Licence Ouverte Etalab 2.0), aéroports Roland-Garros et Pierrefonds (METAR), balises de vent de la FFVL (Licence Ouverte 2.0), température de la mer par satellite NOAA CoastWatch et NASA MODIS (domaine public). Prévisions : AROME outre-mer de Météo-France (Licence Ouverte), modèle IFS et ensemble ENS de l'ECMWF, ${lienNom("https://open-meteo.com/", "Weather data by Open-Meteo.com")} (CC BY 4.0). Vigilance et radar : Météo-France. Cyclones : CMRS de La Réunion (Météo-France), via GDACS ; côtes Natural Earth (domaine public). Historique : données climatologiques quotidiennes de Météo-France depuis 1900. Volcan : préfecture de La Réunion, OVPF-IPGP (CC BY 4.0), et en dernier recours ${lienNom("https://pitonlive.com", "pitonlive.com")} (site non officiel). Électricité : EDF SEI. Air : Atmo Réunion (ODbL). Services publics : ${adresseTexte("service-public.fr")}. Bus : horaires publiés par les réseaux sur ${adresseTexte("transport.data.gouv.fr")}. Vélos : Altervélo (CIVIS, Ecovélo). Terrain et risques : IGN, DGFiP, Géoportail de l'urbanisme, DEAL Réunion, Géorisques (BRGM), DVF du Cerema. Toutes sous Licence Ouverte sauf mention. Randonnée : ONF La Réunion ; itinéraires et traces © contributeurs OpenStreetMap (ODbL). Lieux : © contributeurs OpenStreetMap (ODbL), IGN, ${adresseTexte("geo.api.gouv.fr")}. Relief, photographies aériennes, routes et noms des cartes : IGN, RGE ALTI, couche Photographies aériennes de la Géoplateforme, BD ORTHO et BD TOPO${choix}.${decor ? ` ${MOTIF_CREDIT}` : ""} Police des titres : Bricolage Grotesque (SIL OFL).</p>`}
    <p>Ces données sont fournies telles quelles, sans garantie. Pour un cyclone ou de fortes pluies, seules comptent la vigilance de <a href="https://meteofrance.re/fr">Météo-France La Réunion</a> et les consignes de la préfecture.</p>
    <p><a href="/publier">Votre organisation publie un agenda ou des données ? Le guide pour les publier en flux ouvert →</a></p>
  </div>
</div></footer>
${script(SCRIPT + (hasZones(text) ? `\n${ZONES_SCRIPT}` : ""))}
</body>
</html>`;
}

/**
 * A page's sources, each with its licence. A producer's name may go to the next line after its « . » or before its inner
 * capital (« Sensor.<wbr>Community », nomsCoupables), an address after each « / » or « . », a bare domain
 * after each « . » (« geo.api.gouv.fr », adressesCoupables with its second argument).
 */
export function credits(list: Credit[]): string {
  const seen = new Set<string>();
  // The sources under the same licence, word for word, said together, the licence once, in the order of the first of
  // each: « A, B (Licence Ouverte Etalab 2.0) ; C (ODbL) ». A licence that holds a source's own terms (a written
  // agreement, « titres et lien seulement ») is grouped only with the sources whose licence is that same text: those
  // terms name their producer, so they are the same terms for each source said before them. A different text (another
  // producer, another agreement's date) is never merged into it.
  const groups = new Map<string, string[]>();
  const said: string[] = [];
  for (const c of list.filter((c) => !seen.has(c.source) && seen.add(c.source))) {
    if (c.source === meteorOi.SOURCE.nom) {
      said.push(METEOR_CREDIT);
      continue;
    }
    const names = groups.get(c.licence);
    const name = nomsCoupables(adressesCoupables(c.source, true));
    if (names) names.push(name);
    else {
      const group = [name];
      groups.set(c.licence, group);
      said.push(c.licence);
    }
  }
  return said.map((x) => (x === METEOR_CREDIT ? x : `${groups.get(x)!.join(", ")} (${adressesCoupables(x, true)})`)).join(" ; ");
}

/**
 * MétéoR-OI's credit, word for word as the association asked (« Données : MétéoR-OI, licence CC BY-NC 4.0 »), with a
 * link to its site: in a page's sources wherever one of its measures is shown, and beside each of them.
 */
// Written out, not by lienNom: built when the module loads, before domains.ts (an import cycle); neither text holds an
// address to break.
export const METEOR_CREDIT = `Données : <a href="${meteorOi.SITE}" rel="noopener">MétéoR-OI</a>, licence <a href="${meteorOi.CC_BY_NC}" rel="noopener">CC BY-NC 4.0</a>`;
const meteorNote = (s: StationNow) => (s.source === meteorOi.SOURCE.id ? `<p class="cr">${METEOR_CREDIT}</p>` : "");

function age(iso: string, now: Date): string {
  return `${leAt(iso)}, ${since(iso, now)}`;
}

export function windText(s: StationNow): string | undefined {
  if (s.vent == null) return undefined;
  const dir = s.direction != null ? `${compassFr(s.direction)} ` : "";
  return `vent ${dir}${s.vent} km/h${s.rafales != null ? `, rafales ${s.rafales} km/h` : ""}`;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const compassFr = (d: number) => POINTS[Math.round(d / 22.5) % 16];

function rainText(s: StationNow): string | undefined {
  if (s.pluie_6min != null && s.pluie_6min > 0) return `il pleut : ${fr(s.pluie_6min)} mm en 6 min`;
  if (s.pluie_1h != null && s.pluie_1h > 0) return `${fr(s.pluie_1h)} mm de pluie dans l'heure`;
  if (s.pluie_1h === 0) return "pas de pluie depuis 1 h";
  return undefined;
}

export const shortName = (n: string) =>
  n.replace(/ \(aéroport\)$/, "").replace(/^Saint-Denis Gillot$/, "Gillot").replace(/^Gros Piton Sainte-Rose$/, "Sainte-Rose");
// « Plage de la Saline les Bains » → « La Saline les Bains »: a name in a tile or a sentence starts with a capital.
export const seaName = (n: string) => n.replace(/^Plage (de |du )?/, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase());
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
/** The day of a time, with its name, « vendredi 06/11 »: a copy of the page never says « aujourd'hui » or « ce soir » of another day. */
export const jourDit = (at: Date) => {
  const l = new Date(at.getTime() + 4 * 3600_000);
  return `${JOURS[l.getUTCDay()]} ${String(l.getUTCDate()).padStart(2, "0")}/${String(l.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const dayMonth = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("/");

/**
 * The days of satellite readings shown together, after « par satellite »: « le 03/11 », « les 02 et 03/11 », « du 31/10
 * au 02/11 ». The newest alone said « le 03/11 » over a list with two beaches of 02/11.
 */
export function lesJours(days: string[]): string {
  const d = [...new Set(days)].sort();
  if (d.length <= 1) return `le ${dayMonth(d[0] ?? "")}`;
  const [first, last] = [d[0], d[d.length - 1]];
  if (d.length > 2) return `du ${dayMonth(first)} au ${dayMonth(last)}`;
  return first.slice(0, 7) === last.slice(0, 7) ? `les ${first.slice(8, 10)} et ${dayMonth(last)}` : `les ${dayMonth(first)} et ${dayMonth(last)}`;
}

/** The row of a station on /meteo, where its marker on the maps leads. */
export const stationId = (nom: string) => `st-${slugify(nom)}`;
/** The row or card of a place on a page, where the map's marker or commune leads: « c-saint-pierre ». */
export const anchorId = (prefix: string, nom: string) => `${prefix}-${slugify(nom)}`;

export function stationItem(s: StationNow, now: Date): string {
  const t = s.temperature != null
    ? `<span class="t" style="background:${chip(s.temperature)}">${thin(deg(s.temperature))}</span>`
    : `<span class="t na">${s.vent != null ? thin(`${s.vent} km/h`) : "—"}</span>`;
  const details = [s.humidite != null ? `humidité ${s.humidite} %` : undefined, windText(s), rainText(s)].filter(Boolean).join(" · ");
  const old = ageMinutes(new Date(s.time), now) > 90 ? " (mesure ancienne)" : "";
  return `<li class="st tgt" id="${stationId(s.nom)}">${t}<h4>${esc(s.nom)} <small>${metres(s.altitude_m)}</small></h4>` +
    `<p>${esc(thin(details || "température seulement"))} · <span class="when">mesuré ${age(s.time, now)}${old}</span></p>${meteorNote(s)}</li>`;
}

export const EXTERNAL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

// The two languages of the question, with their flags: Lo Mahavéli for Réunion Creole (no emoji shows it everywhere).
const FLAG_RCF = `<svg viewBox="0 0 60 40" aria-hidden="true">${FLAG_INNER}</svg>`;
const FLAG_FR = `<svg viewBox="0 0 3 2" aria-hidden="true"><path fill="#002654" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#ce1126" d="M2 0h1v2H2z"/></svg>`;

/**
 * Escaped text whose addresses written out (https://rundata.re/coupures-eau, www.ipgp.fr/…, dx.doi.org/10.17183/REFMAR)
 * get a <wbr> after each run of « / » and each « . » inside them (coupeAdresse): with the text at 200 %, a line
 * ends there rather than one or two letters before the end of a word, which overflow-wrap:anywhere does only when a piece
 * is longer than its line.
 * <wbr> holds no character, so a copy of the text is the text. Never in a link: Chrome names it with a space for each
 * <wbr> (coupable, domains.ts). `domaines`: a bare domain in the rest of the text (« geo.api.gouv.fr » in a page's
 * sources) goes through adresseTexte(), its <wbr> counting only under 19.9 rem, in a span WebKit never hyphenates; and the
 * <wbr> after « https:// » and after each « . » of a full address count only there too, so that at 390 px a sentence
 * newly cut here keeps its lines (« sur https:// » or « sur https://altervelo. » never ends one).
 */
export function adressesCoupables(text: string, domaines = false): string {
  return text
    .split(/((?:https?:\/\/|www\.)[^\s«»"<>]+)/)
    .map((x, i) => (i % 2 ? coupeAdresse(x, domaines ? '<wbr class="adr">' : "<wbr>") : domaines ? adresseTexte(x) : esc(x)))
    .join("");
}

/**
 * An address (or an e-mail address), escaped, with a <wbr> after each run of « / », « . » or « @ » inside it, in a
 * <span class="adrweb"> that WebKit never hyphenates (the CSS of style.ts). `point`: the <wbr> after « https:// » and after
 * each « . », <wbr class="adr"> in a text newly cut by adressesCoupables(…, true), which counts only under 19.9 rem; the
 * other addresses keep their lines as before. It goes after the « . », never before: a <wbr> between a letter and its
 * « . » breaks their kerning, even hidden in WebKit, and the line grows.
 */
function coupeAdresse(address: string, point = "<wbr>"): string {
  const parts = address.split(/(?<=[/.@])(?=[^/.@])/);
  const apres = (p: string) => (/^https?:\/\/$/.test(p) || p.endsWith(".") ? point : "<wbr>");
  return `<span class="adrweb">${parts.map((p, i) => esc(p) + (i < parts.length - 1 ? apres(p) : "")).join("")}</span>`;
}

/**
 * A link whose words are its address (rundata.re/actualites, data.regionreunion.com, contact@rundata.re), cut after a
 * « / », a « . » or a « @ » rather than one or two letters before the end, with the text at 150 or 200 %. Its <wbr> would
 * make Chrome name the link with a space for each (« rundata. re/ actualites »): its name is the address, in aria-label.
 * `attrs`: more attributes, each with its leading space.
 */
export function lienAdresse(href: string, text: string, attrs = ""): string {
  return `<a href="${esc(href)}"${attrs} aria-label="${esc(text)}">${coupeAdresse(text)}</a>`;
}

/**
 * « Domann out IA » (Réunion Creole: « demande à ton IA »): buttons that open ChatGPT or Claude in a new tab with the
 * question already typed, asking it to read the page. The way in for people on a free plan, or who will not add a
 * connector. A switch picks Creole (the default) or French, which the assistants answer more surely; the choice
 * holds for every box and is remembered.
 * On the click, the page's address in the question gets the time (`?maj=12h47`, Réunion time; the pages ignore it):
 * the assistants keep their own copy of a page they have read, and a new address makes them read it again rather
 * than answer from a copy taken minutes or hours earlier. Added by the script, not in the HTML, so that search
 * engines do not follow the copies; without the script, the plain address.
 * The links' parameters are not documented by either service.
 * On a phone, ChatGPT's app leaves the question out (Android) or does not open (iPhone: chatgpt.com has no universal
 * link), and no documented scheme types it: the tap also copies the question, and a line says so (copies).
 * `kreol` empty: the French question alone.
 */
export function ask(kreol: string, francais: string): string {
  const a = (href: string, name: string, page?: string) =>
    `<a href="${href}" target="_blank" rel="nofollow noopener"${page ? ` data-maj="${esc(page)}"` : ""}` +
    `${name === "ChatGPT" ? copies("", "Question copiée : collez-la dans ChatGPT si elle n'y est pas.", "Si la question n'est pas dans ChatGPT, recopiez-la ci-dessous.") : ""}>${name} ${EXTERNAL}</a>`;
  // The language not shown in a <template> (its words are not the page's text for the search engines), copied into the
  // page by the script when chosen (SCRIPT, askl).
  const block = (l: string, title: string, question: string, hidden: boolean) => {
    const q = encodeURIComponent(question);
    const page = /https?:\/\/\S+/.exec(question)?.[0];
    const div = `<div data-l="${l}" lang="${l}"><p class="askt">${title}</p>` +
      `<p class="ask">${a(`https://chatgpt.com/?hints=search&amp;q=${q}`, "ChatGPT", page)}${a(`https://claude.ai/new?q=${q}`, "Claude", page)}</p>${COPIED}` +
      `<p class="askq">« ${adressesCoupables(question)} »</p></div>`;
    return hidden ? `<template data-tl="${l}">${div}</template>` : div;
  };
  // French only (kreol empty): the question in French, no switch, and its block without data-l, which the script would
  // hide for a visitor who chose Creole on another page. A page whose Creole question has not had the user's yes yet
  // (/terrain, 20/11/2026).
  const note = `<p class="askn">Rien à installer : la question est déjà écrite. ChatGPT marche même sans compte ; Claude demande de se connecter (compte gratuit).</p></div>`;
  if (!kreol) return `<div class="askbox">${block("fr", "Demandez à votre IA", francais, false).replace(' data-l="fr"', "")}${note}`;
  const b = (l: string, flag: string, name: string, on: boolean) =>
    `<button type="button" data-askl="${l}" aria-pressed="${on}">${flag}${name}</button>`;
  return `<div class="askbox"><div class="lang" role="group" aria-label="Langue de la question">` +
    `${b(brand.slogan_lang, FLAG_RCF, "Kréol", true)}${b("fr", FLAG_FR, "Français", false)}</div>` +
    block(brand.slogan_lang, "Domann out IA", kreol, false) + block("fr", "Demandez à votre IA", francais, true) + note;
}

/**
 * A link that, tapped on a phone, also copies `text` (empty: its `q` parameter, as the script last wrote it) and says
 * so in the line that follows its paragraph (COPIED): `ok` once copied, `non` when the browser refuses. On a computer,
 * nothing more than the link.
 */
export const copies = (text: string, ok: string, non: string) =>
  ` data-copie="${esc(text)}" data-ok="${esc(ok)}" data-non="${esc(non)}"`;
// In French, as the words of the site around it, even under a question in Creole.
export const COPIED = `<p class="copie" role="status" lang="fr" hidden></p>`;

/** The connector's address with its copy button; `id` keeps several on one page apart. */
export function connector(origin: string, id: string): string {
  // Cut after a « / » or a « . » when it does not fit, never inside « mcp » (31/10/2026: « https://rundata.re/m | cp »)
  // nor inside « rundata » (« https://run | data.re/ » with the text at 200 %).
  return `<div class="connect"><code id="${id}">${adressesCoupables(`${origin}/mcp`)}</code><button type="button" data-copy="${id}" data-signal aria-label="Copier l'adresse du connecteur">Copier</button></div>`;
}

// A measure from a copy kept after a failed read counts as any other, at its time: the ones older than 3 hours are left
// out before (tools/meteo.ts COPY_MAX_MINUTES).
export const withTemp = (data: Cached<HomeData> | null) => data?.value.stations.filter((x) => x.temperature != null && !x.amateur) ?? [];
/**
 * Every station's temperature, for the island's range (« 14 à 30 °C… de Piton Maïdo à Gillot »): the tour's alone left
 * out Bois-Rouge at 30,7 °C, given in the list of the same page. The tour's on a copy made before every station was kept.
 * The official networks' only: an amateur station's reliability is not checked (the user, 10/11/2026).
 */
export const withTempAll = (data: Cached<HomeData> | null) => (data?.value.toutes ?? data?.value.stations)?.filter((x) => x.temperature != null && !x.amateur) ?? [];
export const coldest = (l: StationNow[]) => l.reduce((a, b) => (b.temperature! < a.temperature! ? b : a));
export const warmest = (l: StationNow[]) => l.reduce((a, b) => (b.temperature! > a.temperature! ? b : a));

/**
 * Every station of the official networks, filtered by commune and sorted by the page's script; without it, by altitude.
 * Under them, folded, the amateur stations, each said so (the validated words, 10/11/2026).
 */
export function stationsList(every: StationNow[], now: Date): string {
  const all = every.filter((s) => !s.amateur);
  const am = every.filter((s) => s.amateur);
  const row = (s: StationNow) => {
    const c = communeOf(s, every) ?? "";
    const t = s.temperature != null ? `<span class="t" style="background:${chip(s.temperature)}">${thin(deg(s.temperature))}</span>` : `<span class="t na">—</span>`;
    const pills = windPill(s) + rainPill(s);
    const old = ageMinutes(new Date(s.time), now) > 90 ? " (ancienne)" : "";
    // Its day said to a screen reader and to a page read as text, even today's: a copy kept by a search engine gave
    // « 11,9 °C à 20 h 30 » for the evening of another day (06/11/2026). Seen, the time alone: « 06/11 · 14:06 »
    // pushes it under the temperature on 9 cards of 12 at 390 px. The day seen too when it is not today's.
    const [day, time] = localTime(new Date(s.time)).split(" ");
    const when = day === localTime(now).split(" ")[0] ? `<span class="sr">mesurée le ${day} à\u00a0</span>${time}` : `<span class="sr">mesurée le\u00a0</span>${day} <span class="sr">à\u00a0</span>${time}`;
    return `<li class="st tgt" id="${stationId(s.nom)}" data-c="${esc(c)}" data-z="${s.altitude_m}" data-t="${s.temperature ?? ""}" data-n="${esc(s.nom)}">` +
      `<p class="th">${t}<span class="when">${when}${old}</span></p><h3>${s.source === "meteofrance" && s.id && stationOf(s.id) ? `<a href="${stationPath(s.id)}">${esc(s.nom)}</a>` : esc(s.nom)}</h3><p class="ou">${esc(c)} · ${metres(s.altitude_m)}</p>` +
      `${pills ? `<p class="pls">${pills}</p>` : ""}${s.amateur ? `<p class="cr">${esc(ditAmateur(s.source) ?? "")}</p>` : ""}${meteorNote(s)}</li>`;
  };
  const rows = [...all].sort((a, b) => a.altitude_m - b.altitude_m).map(row).join("");
  const communes = [...new Set(all.map((s) => communeOf(s, all)).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));
  const tools = `<div class="sttools" data-js hidden><label>Commune <select id="stc"><option value="">Toutes</option>${communes.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>` +
    `<div class="sttri"><span id="sttri">Trier par</span> <span class="tabs" role="group" aria-labelledby="sttri"><button type="button" data-s="z" aria-pressed="true">Altitude</button><button type="button" data-s="t" aria-pressed="false">Température</button><button type="button" data-s="n" aria-pressed="false">Nom</button></span></div></div>`;
  const more = all.length > 12 ? `<p data-js hidden><button type="button" class="stmore" id="stm" aria-controls="stl" aria-expanded="false">Voir les ${all.length} stations</button></p>` : "";
  const net = [...new Set(am.map((s) => reseauAmateur(s.source)))].join(", ");
  const amateurs = am.length
    ? `<details class="pli amdet" id="sta"><summary><h3>${esc(am.length > 1 ? `Les ${am.length} stations amateur de ${net}\u00a0: fiabilité non vérifiée` : `La station amateur de ${net}\u00a0: fiabilité non vérifiée`)}</h3></summary>` +
      `<ul class="stations">${[...am].sort((a, b) => a.altitude_m - b.altitude_m).map(row).join("")}</ul></details>`
    : "";
  return `${tools}<ul class="stations${more ? " plie" : ""}" id="stl">${rows}</ul>${more}${amateurs}`;
}

/**
 * Every place page as a chip, with a filter box (the script at the end of the page). With `hubs`, the communes lead
 * to their page of every category rather than their weather.
 */
export function placeLinks(except?: string, hubs = false): string {
  // A place sent to another's page (places.ts `PRINCIPAL`) has no chip of its own: L'Hermitage led to Saint-Gilles-les-Bains,
  // the next chip (the site's watch, 21/11/2026). Its name stays on the principal's chip for the filter (`data-aussi`).
  const aussi = (p: PlacePage) => PAGES.filter((o) => PRINCIPAL[o.slug] === p.slug).map((o) => o.nom).join(" ");
  const li = (p: PlacePage) =>
    `<li${aussi(p) ? ` data-aussi="${esc(aussi(p))}"` : ""}><a href="/${hubs && p.commune ? "communes" : "meteo"}/${p.slug}">${esc(p.nom)}</a></li>`;
  const others = PAGES.filter((p) => p.slug !== except && !PRINCIPAL[p.slug]);
  // The weather's field (wording validated on 06/11/2026): its label above it, what was typed in the answer when no page has it.
  const field = hubs
    ? `<label class="search">${icon("search")}<span class="sr">Chercher une commune ou un lieu</span>` +
      `<input id="filtre" type="search" placeholder="Saint-Leu, Cilaos, le volcan…" autocomplete="off"></label>`
    : `<label class="champ-m" for="filtre">Météo d'un lieu\u00a0: commune, quartier, sommet</label>` +
      `<span class="search">${icon("search")}<input id="filtre" type="search" placeholder="Ex.\u00a0: Cilaos, le Maïdo" autocomplete="off"></span>`;
  // When no chip has the name (06/11/2026): the communes, outside `.places` so that the filter leaves them shown;
  // the script only shows `#rien` and writes what was typed in `#rien-q`.
  const communes = `<ul class="chips">${others.filter((p) => p.commune).map(li).join("")}</ul>`;
  const none = hubs
    ? `<p class="note">Pas de page pour «\u00a0<span id="rien-q"></span>\u00a0». Choisissez la commune du lieu\u00a0:</p>${communes}` +
      `<p class="note">Pour un lieu-dit, votre assistant connaît plus de 2\u00a0000 lieux de l'île\u00a0: <a href="/mcp">brancher mon IA →</a></p>`
    : `<p class="note">Pas de page météo pour «\u00a0<span id="rien-q"></span>\u00a0». Choisissez la commune du lieu\u00a0: sa page donne la mesure de la station la plus pertinente et la prévision.</p>${communes}` +
      `<p class="note"><a href="/meteo#stations">Toutes les stations de mesure, commune par commune\u00a0: sur la page Météo →</a></p>`;
  return field +
    `<div class="places"><h3>${except ? "Les communes" : "Les 24 communes"}</h3><ul class="chips">${others.filter((p) => p.commune).map(li).join("")}</ul>` +
    `<h3>Cirques, volcan, plages</h3><ul class="chips">${others.filter((p) => !p.commune).map(li).join("")}</ul></div>` +
    `<div class="rien" id="rien" hidden>${none}</div>`;
}

// Its own id, h-notes: h-lire is « Comment lire cette page » of texteStable(), on the same page.

export const ISLAND = {
  "@type": "Place",
  name: "La Réunion (974)",
  geo: { "@type": "GeoShape", box: "-21.41 55.19 -20.85 55.86" },
  containedInPlace: { "@type": "Country", name: "France" },
};

/**
 * A commune as what a page is about (JSON-LD `about`), with its place's own coordinates: the pages of one commune (its
 * water cuts, its waste collection, its places for children), as its own page and its weather's say it. The island for
 * the pages of the whole island (ISLAND).
 */
export const cityLd = (p: { nom: string; place: { lat: number; lon: number } }) => ({
  "@type": "City",
  name: `${p.nom} (La Réunion, 974)`,
  geo: { "@type": "GeoCoordinates", latitude: p.place.lat, longitude: p.place.lon },
  containedInPlace: ISLAND,
});

/**
 * The page itself in its structured data (JSON-LD WebPage): its title, its description and its address, as the page
 * gives them, the day its copy was read when it shows one, and what it is about. Nothing the page does not show.
 */
export const webPageLd = (origin: string, path: string, title: string, description: string, modified?: Date, about: object = ISLAND) => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: title,
  description,
  inLanguage: "fr-FR",
  url: `${origin}${path}`,
  ...(modified ? { dateModified: modified.toISOString() } : {}),
  about,
});

/** What a page shows about a category in a few words, for the tiles of the home page. */
export interface Live {
  /** The figure or the state, HTML. */
  valeur: string;
  /** Where, when, from whom, HTML. */
  detail: string;
  /** Whose word the value is, said under it where the value is shown without its detail (the home page's hero). */
  source?: string;
  /** The detail in full, plain text, when the tile shows it shortened (its `title`). */
  title?: string;
  /**
   * A copy read with nothing to show: its detail alone, one line saying what was read and when, in place of a figure;
   * not among the figures under the home page's title. Said in full, never cut: its hour is at its end.
   */
  vide?: boolean;
  /** The detail said in full on a phone, where the others are cut after three lines: its source and date at its end. */
  entier?: boolean;
}

/** A tile's line for a copy read with nothing to show (`vide`), in plain text. */
export const empty = (line: string): Live => ({ valeur: "", detail: esc(line), vide: true });

const range = (lo: number, hi: number) => thin(`${fourchette(fr(Math.round(lo)), fr(Math.round(hi)))} °C`);

export function meteoLive(data: Cached<HomeData> | null, now = new Date()): Live | undefined {
  const l = withTempAll(data);
  if (!data) return undefined;
  if (!l.length) return empty(`Aucune température dans la lecture des stations ${readAt(data.fetchedAt, now).de}.`);
  const lo = coldest(l);
  const hi = warmest(l);
  // The times of the two values said, in the order of time, not the latest of every station (Gillot's 29,9 °C of 13:48
  // said « à 14:05 », 04/11/2026).
  const [t1, t2] = [lo.time, hi.time].sort();
  const when = hm(t1) === hm(t2) ? leAt(t2) : jourDe(t1) === jourDe(t2) ? `${leAt(t1)} et ${hm(t2)}` : `${leAt(t1)} et ${leAt(t2)}`;
  return {
    valeur: range(lo.temperature!, hi.temperature!),
    detail: `${esc(shortName(lo.nom))} (${metres(lo.altitude_m)}) ${esc(a(shortName(hi.nom)))}, mesuré ${when}`,
  };
}

export function merLive(data: Cached<HomeData> | null, now = new Date()): Live | undefined {
  if (!data) return undefined;
  const mer = data.value.mer ?? [];
  if (!mer.length) return empty(`Pas de mesure satellite de la mer dans la lecture ${readAt(data.fetchedAt, now).de}.`);
  const v = mer.map((m) => m.valeur);
  return {
    valeur: Math.round(Math.min(...v)) === Math.round(Math.max(...v)) ? thin(deg(Math.round(v[0]))) : range(Math.min(...v), Math.max(...v)),
    detail: `au large des plages, par satellite ${esc(lesJours(mer.map((m) => m.jour)))}`,
  };
}

export function vigilanceLive(data: Cached<mf.Vigilance> | null, now: Date): Live | undefined {
  const v = data?.value;
  if (!v) return undefined;
  const cyc = v.zones[mf.ISLAND]?.[mf.CYCLONE] ?? [];
  if (cycloneOn(cyc, now)) {
    const c = Math.max(2, cycloneLevel(cyc, now));
    return officielLive(lue({ valeur: `<span class="vg ${cycloneVg(c)}">Cyclone : ${esc(mf.cycloneName(c))}</span>`, detail: esc(cyclone(v, now)) }, data!, now), mf.OFFICIEL_CYCLONE);
  }
  const r = raised(v);
  if (!r.length) {
    // Green only when Météo-France issued it for the whole island, never in place of a bulletin without it.
    const l = islandGreen(v, now)
      ? { valeur: vg(1), detail: "Pas d'alerte cyclonique ni de vigilance particulière" }
      : { valeur: esc(NONE_ISSUED_SAID), detail: esc(cyclone(v, now).replace(/\.$/, "")) };
    return officielLive(lue(l, data!, now), mf.OFFICIEL_VIGILANCE);
  }
  return officielLive(lue({
    valeur: vg(r[0].max),
    detail: esc(r.slice(0, 2).map((x) => `${x.phenomene.toLowerCase()} (${x.zone.split(" :")[0]})`).join(", ") + (r.length > 2 ? "…" : "")),
  }, data!, now), mf.OFFICIEL_VIGILANCE);
}

/** A vigilance tile's line, then the link to Météo-France's own site, never cut. */
export function officielLive(l: Live, href: string): Live {
  return { ...l, detail: `${l.detail}. ${officielHtml(href)}`, entier: true };
}

/** A vigilance tile's line, with when it was read once more than 15 min ago (`vigilanceLue`), said in full at its end. */
export function lue(l: Live, data: Cached<unknown>, now: Date): Live {
  const when = vigilanceLue(data.fetchedAt, now);
  return when ? { ...l, detail: `${l.detail} · ${esc(when)}`, entier: true } : l;
}

/** The island's weather: every station, from the coast to the summits, the sea, and a page per commune or place. */
/**
 * The block « Records » of /meteo: the records of each station of reference of /historique (one per climate), since
 * the first daily measurement Météo-France published for it, from its copy (recordsReference()), never written by hand. A record
 * missing is left out, a station without any too, and the block without any station.
 */

const KIND: Record<string, string> = {
  commune: "commune",
  localite: "village",
  quartier: "quartier",
  plage: "plage",
  sommet: "sommet",
  point_de_vue: "point de vue",
  bassin: "bassin",
  port: "port",
};

const LABELS: Record<string, string> = {
  humidite: "Humidité",
  vent_moyen: "Vent moyen",
  vent_direction: "Vent venant du",
  rafales: "Rafales",
  pluie_6min: "Pluie (6 dernières min)",
  pluie_1h: "Pluie (dernière heure)",
  ciel: "Ciel",
  temps_present: "Temps",
  visibilite: "Visibilité",
};

// Distance and altitude under a station's name, never its « pertinence » (bonne, moyenne, faible), a word of the tools'
// answers that says nothing to a visitor; a station far off or on another side keeps its warning below (avertissements).
function stationCard(s: StationAnswer): string {
  const m = s.mesures;
  const main = m.temperature ?? m.vent_moyen;
  const rows = Object.entries(m)
    .filter(([k]) => k !== "temperature" && k !== "point_de_rosee" && k !== "pression_mer")
    .map(([k, v]) => `<li>${esc(LABELS[k] ?? k.replace(/_/g, " "))} : ${esc(thin(v.replace(/ \(d'où vient le vent\)| en (6 min|1 h)$/g, "")))}</li>`)
    .join("");
  const t = parseFloat((m.temperature ?? "").replace(",", "."));
  const meta = [
    // What the station is, as the tools say it; an amateur one's is in its card's title.
    s.amateur ? undefined : stationKind(s.source),
    communeDite(s, ""),
    s.distance_km != null ? `à ${fr(s.distance_km)} km${s.direction ? ` (${s.direction})` : ""}` : undefined,
    `${s.altitude_m.toLocaleString("fr-FR")} m d'altitude`,
  ].filter(Boolean).join(" · ");
  return `<div class="card stcard"><h3>${esc(s.station)}</h3><p class="note">${esc(thin(meta))}</p>` +
    (main ? `<p><span class="t" style="background:${Number.isFinite(t) ? chip(t) : "#44555a"}">${esc(thin(main))}</span></p>` : "") +
    (rows ? `<ul>${rows}</ul>` : "") +
    `<p class="note">Mesuré ${esc(leJour(s.heure_mesure))}, heure de La Réunion.</p>` +
    (s.avertissements.length ? `<p class="note">⚠ ${esc(s.avertissements.join(" "))}</p>` : "") +
    `</div>`;
}

/**
 * The nearest amateur station, when the answer gives one after the others (tools/meteo.ts): folded, its reliability
 * said not checked in its title (wording validated on 10/11/2026), its credit under its measures.
 */
function amateurCard(s: StationAnswer): string {
  const at = s.distance_km != null ? `, à ${fr(s.distance_km)}\u00a0km` : "";
  const credit = s.source === meteorOi.SOURCE.id ? METEOR_CREDIT : esc(s.credit ?? "");
  return `<details class="pli amdet"><summary><h3>${esc(`Station amateur la plus proche${at} (${reseauAmateur(s.source) ?? ""})\u00a0: fiabilité non vérifiée`)}</h3></summary>` +
    `${stationCard(s)}<p class="cr">${credit}</p></details>`;
}

/** The max and min since midnight at a Météo-France station, under the measures of now. */
export function sinceMidnightCard(j: DepuisMinuit): string {
  const row = (label: string, x: DepuisMinuit["maximum"]) =>
    `<li><span>${label}</span> <span class="v"><span class="t" style="background:${chip(x.valeur)}">${esc(thin(`${fr(x.valeur)} ${x.unite}`))}</span> <span class="q">${esc(thin(x.quand))}</span></span></li>`;
  return `<div class="card stcard minuit"><h3>Depuis minuit ${esc(a(j.station))}</h3>` +
    `<p class="note">${esc(thin(`à ${fr(j.distance_km)} km · ${j.periode}`))}</p>` +
    `<ul>${row("Au plus", j.maximum)}${row("Au moins", j.minimum)}</ul>` +
    `<p class="note">Relevés heure par heure de Météo-France : le plus haut et le plus bas de chaque heure, puis les mesures toutes les 6 minutes de l'heure en cours.</p>` +
    (j.avertissements.length ? `<p class="note">⚠ ${esc(j.avertissements.join(" "))}</p>` : "") +
    `</div>`;
}

/** The id of what the confidence says on /meteo, where each place page's forecast links. */
export const CONFIANCE_ANCRE = "confiance";

/**
 * « Repères : station …, à … km » (wording validated on 14/11/2026, its records' sentence 19/11/2026): this month's normals and records
 * at the station of the copy (tools/historique.ts, reperesMois), none written by hand. Left out without them, and when
 * the copy was built in another month than the view's. Without a record, the records' line; without a first year, its
 * last sentence.
 */
export function reperesBlock(r: PlaceData["reperes"], now: Date): string {
  if (!r || r.mois !== +localTime(now).slice(3, 5) - 1) return "";
  const mois = MONTHS[r.mois];
  const deg = (n: number) => `${fr(n)}\u00a0°C`;
  const records = [
    r.chaleur && `Record de chaleur en ${mois}\u00a0: ${deg(r.chaleur.valeur)} (${r.chaleur.annee}).`,
    r.pluie && `Record de pluie en un jour en ${mois}\u00a0: ${fr(r.pluie.valeur)}\u00a0mm (${r.pluie.annee}).`,
  ].filter(Boolean);
  if (records.length && r.depuis) records.push(`Relevés depuis ${r.depuis}.`);
  const lien = stationOf(r.poste) ? `<p><a href="${stationPath(r.poste)}">Tout l'historique de la station →</a></p>` : "";
  return `<section id="reperes" aria-labelledby="h-reperes"><h2 id="h-reperes">Repères\u00a0: station ${esc(r.station)}, à ${fr(r.distance_km)}\u00a0km</h2>
<div class="card"><p>En ${mois}, la normale est de ${deg(r.normale.tx)} pour la maximale et ${deg(r.normale.tn)} pour la minimale, avec ${fr(r.normale.rr)}\u00a0mm de pluie sur le mois (normales ${esc(r.periode)} de Météo-France).</p>
${records.length ? `<p>${records.join(" ")}</p>` : ""}${lien}</div></section>`;
}

export function placePage(origin: string, p: PlacePage, data: Cached<PlaceData> | null, now = new Date(), alerte?: Alerte, hikes?: Cached<RandonneesAnswer> | null): string {
  const g = porte(alerte);
  const place = p.place;
  const d = data?.value;
  // The answer's first two are never at the same spot (meteo.ts, sameSpot); an amateur station apart, folded.
  const stations = (d?.meteo?.stations ?? []).filter((s) => !s.amateur).slice(0, 2);
  const complement = d?.meteo?.stations.find((s) => s.amateur);
  const first = enTete(d?.meteo?.stations);
  const kind = p.precision ?? KIND[place.type] ?? place.type;
  const where = place.nom !== p.nom ? ` Les mesures et la prévision sont données pour ${esc(place.nom)}.` : "";
  const alt = place.altitude_m != null ? `, à ${place.altitude_m.toLocaleString("fr-FR")} m d'altitude` : "";
  const commune = place.commune && place.commune !== p.nom ? ` (commune ${esc(de(place.commune))})` : "";
  const v = versant(place.lon, place.lat);
  const title = [`Météo ${p.nom} en direct et prévisions · La Réunion (974)`, `Météo ${p.nom} en direct · La Réunion (974)`]
    .find((t) => t.length <= TITLE_MAX) ?? `Météo ${p.nom} en direct · 974`;
  const description = fit(
    first
      ? `Météo ${a(p.nom)} (La Réunion, 974) en direct : ${first.mesures.temperature} mesurés ${a(first.station)} ` +
        `${leJour(first.heure_mesure)}.`
      : `Météo ${a(p.nom)} (La Réunion, 974) en direct : température, pluie et vent mesurés par la station la plus proche.`,
    first ? ` Pluie, vent${coastal(p) ? ", mer" : ""} et prévision.` : ` ${coastal(p) ? "Mer et prévision" : "Prévision"} des prochains jours.`,
  );

  // The figure's measure older than OLD_MINUTES at this view, not at the copy's build (a copy given at once to a visitor
  // after a quiet hour, kept up to a day; a source that does not answer): a neutral note above it, as /electricite's.
  // Its day and time, no « il y a » that a copy kept by a search engine would make false an hour later.
  const figureAt = first && data ? new Date(data.fetchedAt.getTime() - first.age_min * 60_000) : undefined;
  const perimee = figureAt && ageMinutes(figureAt, now) > OLD_MINUTES
    ? `<p class="note">${esc(`Dernière mesure lue à la station ${first!.station} : ${leJour(first!.heure_mesure)}. Ce n'est pas le temps qu'il fait maintenant.`)}</p>`
    : "";
  const headline = first
    ? `${perimee}<div class="now"><span class="big">${enGrand(esc(thin(first.mesures.temperature!)))}</span>` +
      `<p>mesurés <b>${esc(leJour(first.heure_mesure))}</b> par la station <b>${esc(first.station)}</b>${communeDite(first, place.commune || p.nom) ? ` ${esc(a(communeDite(first, place.commune || p.nom)!))}` : ""} ` +
      `(${esc(stationKind(first.source))}, ${metres(first.altitude_m)} d'altitude${first.distance_km != null ? `, à ${fr(first.distance_km)} km` : ""}).</p></div>`
    : "";

  // Only from a copy made today: after midnight, yesterday's would pass for today's.
  const jour = data && daysApart(data.fetchedAt, now) === 0 ? d?.meteo?.temperature_depuis_minuit : undefined;
  const measured = !data
    ? `<p class="card">Les mesures se chargent : rechargez la page dans quelques secondes.</p>`
    : stations.length
      ? `<div class="two">${stations.map(stationCard).join("")}</div>` + (complement ? amateurCard(complement) : "") + (jour ? sinceMidnightCard(jour) : "") +
        `<p class="note">Mis à jour ${leAt(data.fetchedAt)} (${since(data.fetchedAt, now)}).</p>`
      : `<p class="card">Aucune mesure disponible pour le moment.</p>`;

  // In the Hauts, the coming morning's cloud sea, high on the page: « dégagé au Maïdo demain matin ? ». Said less firmly
  // while the nearest station measures the air saturated now.
  const near = stations.find((s) => s.mesures.humidite);
  const wet = near && data ? { nom: near.station, humidite: parseInt(near.mesures.humidite!, 10), mesure: new Date(data.fetchedAt.getTime() - near.age_min * 60_000) } : undefined;
  const mn = d?.prevision?.mer_de_nuages && softened(d.prevision.mer_de_nuages, now, wet);
  // The volcano's page during an alert: the Enclos below the viewpoint is forbidden, whatever the sky.
  const enclos = p.slug === "piton-de-la-fournaise" && volcanBanner() ? ` ${ENCLOS}` : "";
  const cloudSea = mn
    ? `<section id="mer-de-nuages" class="card" aria-labelledby="h-nuages"><h3 id="h-nuages">${esc(mn.titre)}</h3><p>${esc(mn.ligne + enclos)}</p>` +
      `<p class="note">${esc(mn.prevision.charAt(0).toUpperCase() + mn.prevision.slice(1))}. ${esc(mn.mise_en_garde)}</p></section>`
    : "";

  // In the Hauts, the sky of the night: the forecast's, from the copy, only while it speaks of the night of the view (the
  // evening of before 6 h is yesterday's), and the dark night and the Moon computed at the view. Without the forecast,
  // no card: the computed lines alone would not say whether the stars will show. Its title says the evening's day: a
  // copy kept by a search engine would give « ce soir » for another evening (06/11/2026).
  const evening = (t: Date) => new Date(t.getTime() - 2 * 3600_000).toISOString().slice(0, 10);
  const cn = d?.prevision?.ciel_de_nuit;
  const nightCard = cn && data && (place.altitude_m ?? 0) >= HAUTS_MIN_M && evening(data.fetchedAt) === evening(now)
    ? (() => {
        const n = nuitOf(evening(now), place.lon, place.lat, horizonDe(place));
        const h = new Date(now.getTime() + 4 * 3600_000).getUTCHours();
        return `<section id="ciel-cette-nuit" class="card" aria-labelledby="h-ciel"><h3 id="h-ciel">${h >= 21 || h < 6 ? "Ciel cette nuit" : "Ciel ce soir et cette nuit"}, ${jourDit(new Date(now.getTime() - 6 * 3600_000))}</h3>` +
          `<p>${esc(cn.ligne)}</p><p>${esc(n.nuit_noire)}</p><p>${esc(n.lune)}</p>` +
          `<p class="note">Ciel\u00a0: ${esc(cn.prevision)}. ${esc(cn.mise_en_garde)} ${esc(NUIT_NOTE)}</p></section>`;
      })()
    : "";

  // The next tides at the nearest gauge, computed at the view: no request, whatever the copy's age.
  const tides = coastal(p) ? tidesNear(p.place.lon, p.place.lat, now) : undefined;
  // Away from the gauges, no times: they are not the place's.
  const away = coastal(p) && !tides ? farFrom(p.place.lon, p.place.lat, p.place.commune) : undefined;
  const tideLine = tides
    ? `<p>Marée ${esc(a(tides.nom))}, ${esc(TIDE_LABEL)}, à environ ${tides.minutes} min près : ${esc(thin(nextText(tides.next)))}.</p>`
    : away
      ? `<p>Marée : pas d'heures calculées ici, la marée y arrive à une autre heure qu'au Port et à Sainte-Marie, les deux marégraphes lus par rundata.re. ` +
        `<a href="${esc(away.lien)}">${away.port ? `Horaires officiels du SHOM pour ${esc(away.port)}` : "Horaires officiels sur le site du SHOM"}</a></p>`
      : "";
  const sea = coastal(p) && d?.mer
    ? `<section aria-labelledby="h-mer"><h2 id="h-mer">Température de la mer ${esc(a(p.nom))}</h2>` +
      `<div class="card">${d.mer.mesure ? `<ul class="seas"><li><span>Au large, le ${esc(dayMonth(d.mer.mesure.jour_mesure))}</span> <b>${esc(thin(d.mer.mesure.temperature_eau))}</b></li></ul>` : ""}` +
      // The swimming rule of the tool's résumé said once, in the « Baignade et requins » block below.
      `<p>${esc(thin(d.mer.resume.replace(` ${REGLE_COURTE}`, "")))}</p>${tideLine}<p class="note">Température : mesure satellite au large, du jour indiqué (une mesure paraît au plus tôt le lendemain), ` +
      `pas celle du lagon ni du bord.${d.mer.houle_mesuree ? ` Houle mesurée : la bouée ${esc(d.mer.houle_mesuree.bouee)} du Cerema, au large, à l'heure dite.` : ""}${d.mer.etat_de_la_mer ? " Vagues : prévision d'un modèle, au large, pas une mesure." : ""}${tides ? ` Marée : calculée d'après les mesures des marégraphes, hauteurs à environ 5 cm près, <a href="/mer">détail sur la page mer</a>.` : ""}</p></div></section>`
    : "";

  const f = d?.prevision && { ...d.prevision, jours: joursDuJour(d.prevision.jours, data!.fetchedAt, now) };
  // Why a day is not sure, in plain sight and short (a phone shows no title, a card is half its width). A sure day
  // says nothing more.
  const whyNot = (why?: string) => {
    const short = why && cardReason(why);
    return short ? `<p class="why">${esc(short)}</p>` : "";
  };
  // What the confidence says is said once, on /meteo (« Comment lire cette page »): here, a line and its link
  // (wording validated on 14/11/2026: the same 90 words on every place page).
  const confidenceNote = f?.jours?.some((j) => j.confiance);
  const range = (lo?: string, hi?: string) => (lo && hi ? fourchette(lo.replace(/ °C$/, "°"), hi.replace(/ °C$/, "°"), " / ") : "—");
  const forecast = f?.jours?.length
    ? `<section aria-labelledby="h-prev"><div class="hb"><h2 id="h-prev">Prévision météo ${esc(p.nom)}</h2><span class="badge">Prévision, pas une mesure</span></div>` +
      `<ul class="days">` +
      f.jours.map((j) => `<li class="card day"><h3>${esc(j.jour)}</h3>${j.periode ? `<p>${esc(j.periode)}</p>` : ""}<p class="range">${esc(range(j.temperature_min, j.temperature_max))}</p>` +
        `<p>${esc(j.ciel_en_journee ?? "—")}</p><p>Pluie : ${esc(thin(j.pluie ?? "—"))}</p><p>Rafales : ${esc(thin(j.rafales_max ?? "—"))}</p>` +
        (j.indice_uv_max ? `<p>UV : ${esc(j.indice_uv_max)}</p>` : "") +
        (j.confiance ? `<p>Confiance : <b>${esc(j.confiance)}</b></p>` + whyNot(j.confiance_pourquoi) : "") + `</li>`).join("") +
      `</ul>` +
      (confidenceNote ? `<p class="note">Plus l'échéance est lointaine, moins la prévision est sûre\u00a0: <a href="/meteo#${CONFIANCE_ANCRE}">comment rundata.re l'indique →</a></p>` : "") +
      `<p class="note">${esc(f.modele ? `Modèle ${f.modele.nom}, maille de ${fr(f.modele.maille_km)} km${f.modele.run_du_modele ? `, calcul du ${f.modele.run_du_modele.replace(" ", " à ")}` : ""}. ` : "")}` +
      `Un modèle ne voit pas tous les microclimats de l'île. Cyclone, fortes pluies : seule compte la vigilance de <a href="https://meteofrance.re/fr">Météo-France La Réunion</a>.</p></section>`
    : "";

  // The page's sources, said once at its end (sourcesLast), the sources of one licence together (credits): the
  // measures', the sea's and the forecast's were each written under their block, with the same licences, the same on
  // every place's page, and the footer then carried the credits of the whole site. Each block shown names its own: the
  // month's normals and records, the hikes' traces, and the ONF for the state of each hike, said only with the
  // hikers' copy. The tide's citation, in the SHOM's words, last.
  const reperes = reperesBlock(d?.reperes, now);
  const around = hikesAround(p, hikes);
  const said: Credit[] = [
    ...(stations.length ? d!.meteo!.sources : []),
    ...(sea ? d!.mer!.sources : []),
    ...(forecast ? f!.sources : []),
    ...(reperes ? [credit(climat.SOURCE)] : []),
    ...(around.includes('<ul class="rows eau">') ? [credit(traces.SOURCES.osm), credit(traces.SOURCES.ign), ...(hikes ? [credit(ONF_SOURCE)] : [])] : []),
  ];
  const cite = sea && tides ? adressesCoupables(TIDE_CITATION) : "";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Météo", item: `${origin}/meteo` },
        { "@type": "ListItem", position: 3, name: `Météo ${p.nom}`, item: `${origin}/meteo/${p.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      inLanguage: "fr-FR",
      url: `${origin}/meteo/${p.slug}`,
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
      about: {
        "@type": "Place",
        name: `${p.nom} (La Réunion, 974)`,
        geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lon, ...(place.altitude_m != null ? { elevation: place.altitude_m } : {}) },
        containedInPlace: ISLAND,
      },
    },
  ];

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/meteo">Météo</a></li><li aria-current="page">${esc(p.nom)}</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Météo en direct</p>
    <h1>Météo ${esc(a(p.nom))} <span class="n974">974</span></h1>
    ${headline}
    ${ask(`I fé koman lo tan ${p.nom} astèr ? Gèt la mézir an dirèk si ${origin}/meteo/${p.slug} é di amwin lèr la mézir é la stasion.`,
      `Quel temps fait-il en ce moment ${a(p.nom)} ? Lis la mesure en direct sur ${origin}/meteo/${p.slug} et donne-moi l'heure de la mesure et la station.`)}
    <p class="lead">${esc(p.nom)}, ${esc(kind)}${commune}${alt}, ${esc(v.replace(/ \(.*\)$/, ""))} de l'île${v.includes("(") ? ` (${esc(v.replace(/^.*\(|\)$/g, ""))})` : ""}.${where}</p>
    ${p.commune ? `<p class="or"><a href="/communes/${p.slug}">${esc(p.nom)} en direct : vigilance, air, bus, mairie →</a></p>` : ""}
  </div>
  <figure class="card mapcard">${islandMap({ highlight: p.commune ? p.nom : place.commune, pin: { lon: place.lon, lat: place.lat, name: p.nom }, label: `Carte de La Réunion (974) situant ${p.nom}` })}</figure>
</div>`;

  // The UV index MEASURED at Moufia, near it: the tool's words (prevision_meteo), never the forecast's card. « mesuré » in
  // small letters on the page, its label « Mesure » saying it, as for the waves measured (wording validated on 23/11/2026).
  const uvm = d?.prevision?.indice_uv_mesure;
  const uvMeasured = uvm
    ? `<section aria-labelledby="h-uv"><div class="hb"><h2 id="h-uv">L'indice UV mesuré au Moufia</h2><span class="badge m">Mesure</span></div>` +
      `<div class="card"><p>${esc(uvm.resume.replace("UV MESURÉ", "UV mesuré"))}</p><p class="note">${esc(uvm.incertitude)} Source\u00a0: ${esc(uvm.citation).replace(esc(uvm.lien), `<a href="${esc(uvm.lien)}" rel="noopener">${esc(uvm.lien)}</a>`)}` +
      `${uvm.citation.includes(uvMesureSource.licence) ? "" : ` Licence ${esc(uvMesureSource.licence)}.`} Ozone\u00a0: ${esc(uvMesureOzone.attribution)}.</p></div></section>`
    : "";

  // « Dernière mesure », never « en ce moment » above the values: a copy kept by a search engine says it still, beside
  // the measure of another evening, which an AI gave as the weather of now (06/11/2026). Each card says its day and time.
  const body = `${data ? enChiffres(d?.chiffres, p.nom, p.slug) : ""}
<section aria-labelledby="h-now">
  <div class="hb"><h2 id="h-now">Dernière mesure près ${esc(de(p.nom))}</h2><span class="badge m">Mesure</span></div>
  ${measured}
</section>
${uvMeasured}
${cloudSea}
${nightCard}
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Votre IA, branchée sur la météo ${esc(de(p.nom))}</h2>
  <p>Branchez le connecteur une fois sur ChatGPT, Claude ou Le Chat : à chaque « il pleut ${esc(a(p.nom))} ? », il ira chercher lui-même la mesure, avec son heure et sa source. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>
${sea}
${coastal(p) ? bathingBlock(now, { nom: p.nom, lon: p.place.lon, lat: p.place.lat, commune: p.commune ? p.nom : undefined }, g) + g.feuille : ""}
${forecast}
${reperes}
${around}
<p class="or"><a href="/meteo#communes">Météo ailleurs à La Réunion →</a></p>${said.length || cite ? `
<p class="sources">Sources : ${[credits(said), cite].filter(Boolean).join(" ; ")}.</p>` : ""}`;
  return layout(origin, { title, description, path: `/meteo/${p.slug}`, jsonld, alerte, iaAside: true }, band, g.ligne + body);
}

export function notFoundPage(origin: string, path: string, alerte?: Alerte): string {
  return layout(origin, {
    title: `Page introuvable · ${SITE}`,
    description: "La Réunion (974) en direct\u00a0: sorties, randos, météo, routes, vigilance, volcan, air, électricité, calendrier.",
    path,
    jsonld: [],
    motif: true,
    alerte,
  }, `<div class="wrap intro"><div class="pitch"><h1>Page introuvable</h1><p class="lead">Cette adresse n'existe pas sur rundata.re. Repartez de <a href="/">l'accueil</a>, des <a href="/evenements">sorties</a>, des <a href="/randonnees">randos</a> ou de <a href="/communes">votre commune</a>, ou découvrez <a href="/a-propos">qui fait rundata.re</a>.</p></div></div>`,
  `<section aria-labelledby="h-cat"><h2 id="h-cat">Les catégories</h2><ul class="chips">${WITH_PAGE.map((c) => `<li><a href="${c.path}">${esc(c.nom)}</a></li>`).join("")}</ul></section>
<section aria-labelledby="h-communes"><h2 id="h-communes">Météo par commune et par lieu</h2>${placeLinks()}</section>`);
}

/** What a phone shows for a page it never opened, without network (web/pwa.ts): the pages it kept, with their date. */
export function offlinePage(origin: string): string {
  return layout(origin, {
    title: `Hors ligne · ${SITE}`,
    description: "Pas de réseau : les pages de rundata.re gardées sur ce téléphone.",
    path: OFFLINE_PATH,
    jsonld: [],
    noindex: true,
    shell: true,
  }, `<div class="wrap intro"><div class="pitch"><h1>Pas de réseau</h1><p class="lead">Cette page n'a pas encore été ouverte sur ce téléphone, il n'en existe pas de copie. Réessayez quand le réseau revient.</p><p><button type="button" class="again" id="again">Réessayer</button></p></div></div>`,
  `<section aria-labelledby="h-gardees"><h2 id="h-gardees">Pages gardées sur ce téléphone</h2><ul class="gardees" id="gardees"></ul><p id="rien-garde" hidden>Aucune page gardée pour l'instant : celles que vous ouvrez avec du réseau le seront.</p></section>
${script(OFFLINE_SCRIPT)}`);
}

/**
 * The class of a cyclone alert's badge: no colour for the pré-alerte, whose box is white in the plan's table (DSO
 * p. 9) and whose yellow the prefecture dropped.
 */
export const cycloneVg = (c: number) => (c === 2 ? "vgpre" : `vg${c >= 1 && c <= 5 ? c : 0}`);
/** The link to Météo-France's own site, in its words (providers/vigilance.ts). */
export const officielHtml = (href: string) => `<a href="${href}" rel="noopener">${esc(mf.OFFICIEL)}</a>`;
/** A colour of Météo-France, in its colour; `word` to say it otherwise (« verte »). */
export const vg = (c: number, word = mf.colour(c)) => `<span class="vg vg${c >= 1 && c <= 5 ? c : 0}">${esc(word)}</span>`;
const zoneShort = (zone: string) => (mf.ZONES[zone] ?? zone).split(" :")[0];
/** The card of a land zone on /vigilance: « z-sud-est ». */
const zoneId = (zone: string) => `z-${slugify(zoneShort(zone))}`;
const LAND = ["VIGI974-11", "VIGI974-12", "VIGI974-13", "VIGI974-14", "VIGI974-15"];
const LAND_PHENOMENA = [12, 1];
const COAST = 9;

// The colours of the vigilance and the phases of the cyclone alert, by their names only: what each one means is
// Météo-France's to say, on its own site.
const SCALE = `<ul class="scale">${[1, 2, 3, 4].map((c) => `<li>${vg(c)}</li>`).join("")}</ul><p>${officielHtml(mf.OFFICIEL_VIGILANCE)}</p>`;

/** The phases of the cyclone alert, shown on /cyclones with the prefecture's word (domains.ts). */
export const CYCLONE_SCALE = `<ul class="scale">
  <li><span class="vg vgpre">pré-alerte</span></li>
  <li><span class="vg vg3">orange</span></li>
  <li><span class="vg vg4">rouge</span></li>
  <li><span class="vg vg5">violette</span></li>
  <li><span class="vg vg0">sauvegarde</span></li>
</ul><p>${officielHtml(mf.OFFICIEL_CYCLONE)}</p>`;

export function vigilancePage(origin: string, data: Cached<mf.Vigilance> | null, now = new Date(), alerte?: Alerte): string {
  const v = data?.value;
  const emise = v ? localTime(new Date(v.emise)) : undefined;
  const cyc = v?.zones[mf.ISLAND]?.[mf.CYCLONE] ?? [];
  const cycNow = current(cyc, now);
  const r = v ? raised(v) : [];

  let status: string;
  if (!v) {
    status = `<p class="lead">La vigilance de Météo-France n'a pas pu être lue à l'instant. Consultez ${lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr")} ou rechargez la page.</p><p class="lead">${officielHtml(mf.OFFICIEL_VIGILANCE)}</p>`;
  } else {
    // The page of Météo-France's phenomena (rain, storms, wind, waves): the vigilance is its one strong state, in
    // Météo-France's colour, its details in badges under it. The cyclone keeps one line, its state and /cyclones; in an
    // alert, from the pre-alert on, it comes first, in its colour, the vigilance after it, smaller, with the two pages
    // of the alert as buttons. Then the bulletin's time, and the link to Météo-France's site (its agreement).
    const alert = cycloneOn(cyc, now);
    const cyclones = `<a href="/cyclones">Cyclones dans le bassin, alerte du préfet →</a>`;
    const head = alert
      ? `<p class="big vh${cycNow >= 2 ? ` vab ${cycloneVg(cycNow)}` : ""}">${cycNow >= 2 ? esc(cycloneHead(cycNow)) : "Alerte cyclonique prévue"}</p><p class="lead">${esc(cyclone(v, now))}</p><p class="cyc">${cyclones}</p>`
      : "";
    const badge = (c: number) => vg(c, `Vigilance ${feminine(mf.colour(c))}`);
    const green = islandGreen(v, now);
    const top = r.length ? Math.max(...r.map((x) => x.max)) : green ? 1 : 0;
    const state = `<p class="big vh${alert ? " vh2" : ""}${top ? ` vab vg${top}` : ""}">${top ? `Vigilance ${esc(feminine(mf.colour(top)))}` : esc(NONE_ISSUED_SAID)}</p>`;
    const rest = r.length
      ? `<p class="vstate">Vigilances au-dessus du vert : ${r.map((x) => `<span class="vi">${badge(x.max)} ${esc(x.phenomene.toLowerCase())} (${esc(x.zone.split(" :")[0])})</span>`).join(" ")}</p>`
      : green
        ? `<p class="vstate">Aucune vigilance particulière à La Réunion dans les 24 heures du bulletin.</p>`
        : "";
    status = `<div class="status vig">${head}${state}${rest}${alert ? "" : `<p class="cyc">Pas d'alerte cyclonique · ${cyclones}</p>`}` +
      `<p class="note when">Bulletin de Météo-France émis le ${esc(emise!.replace(" ", " à "))} (heure de La Réunion), lu ${leAt(data!.fetchedAt)}${data!.stale ? " : Météo-France ne répond pas, c'est le dernier bulletin connu" : ""}.</p>` +
      `<p class="off"><b>${officielHtml(mf.OFFICIEL_VIGILANCE)}</b></p>` +
      (alert ? `<ul class="chips"><li><a href="/ecoles-cyclone">Cyclone : les écoles sont-elles fermées ? →</a></li><li><a href="/alerte-cyclone">Alerte cyclonique : ce qui ferme, ce qui continue →</a></li></ul>` : "") + `</div>`;
  }

  const zones = v
    ? `<ul class="zones">${LAND.map((zone) => {
        const items = LAND_PHENOMENA.map((id) => {
          const periods = v.zones[zone]?.[id] ?? [];
          const c = current(periods, now);
          const later = spans(periods);
          return `<li><b>${esc(mf.PHENOMENA[id])}</b> : ${c >= 1 ? vg(c) : NONE_ISSUED}` +
            (later.length ? `<p>${esc(later.join(", "))}</p>` : "") + `</li>`;
        }).join("");
        return `<li class="card tgt" id="${zoneId(zone)}"><h3>${esc(zoneShort(zone))}</h3><p class="note">${esc((mf.ZONES[zone] ?? "").split(" : ")[1] ?? "")}</p><ul>${items}</ul></li>`;
      }).join("")}</ul>`
    : "";

  const coast = v ? r.filter((x) => x.phenomene === mf.PHENOMENA[COAST]) : [];
  const littoral = v
    ? `<div class="card"><h3>Littoral : vagues-submersion</h3>` +
      (coast.length
        ? `<ul>${coast.map((c) => `<li>${vg(c.max)} ${esc(c.zone)}${c.periodes.length ? ` : ${esc(c.periodes.join(", "))}` : ""}</li>`).join("")}</ul>`
        : `<p>Pas de vigilance vagues-submersion sur les côtes de l'île.</p>`) +
      `<p class="note">Houle et marée : la température de l'eau plage par plage est sur <a href="/mer">la page mer</a>.</p></div>`
    : "";

  const suivi = v?.suivi.length
    ? `<section aria-labelledby="h-suivi"><h2 id="h-suivi">Ce que dit Météo-France</h2><div class="card suivi">` +
      // A title of two phenomena (« Fortes pluies/Orages ») may go to the next line after its « / », never inside « Orages ».
      v.suivi.map((t) => `<div><h3>${esc(t.titre).replaceAll("/", "/<wbr>")}</h3>${t.zone ? `<p class="zone-suivi">Zone ${esc(t.zone)}</p>` : ""}<p>${esc(t.texte)}</p></div>`).join("") +
      `<p class="note">Texte de Météo-France, repris tel quel. Source : ${esc(mf.SOURCE.nom)} (${esc(mf.SOURCE.licence)}).</p></div></section>`
    : "";

  const title = "Vigilance météo à La Réunion (974) en direct";
  const description = v
    ? `Vigilance Météo-France à La Réunion (974) : ${cyclone(v, now)} ${r.length ? `Au-dessus du vert : ${r.map((x) => `${x.couleur_max} ${x.phenomene.toLowerCase()} (${x.zone.split(" :")[0]})`).join(", ")}.` : "Tout est vert."} Bulletin du ${emise}.`
    : "Vigilance Météo-France à La Réunion (974) en direct : fortes pluies, orages, vents forts, vagues-submersion, zone par zone.";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Vigilance météo", item: `${origin}/vigilance` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      inLanguage: "fr-FR",
      url: `${origin}/vigilance`,
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
      about: ISLAND,
      isBasedOn: mf.SOURCE.url,
    },
  ];

  // Météo-France's map beside the text on a wide screen; on a phone, in the page below (vigilance-carte.ts).
  const hero = carteHero(v?.carte);
  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li aria-current="page">Vigilance</li></ol></nav></div>
<div class="wrap intro${hero ? " vhero" : " solo"}">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Vigilance Météo-France en direct</p>
    <h1>Vigilance météo <span class="n974">974</span></h1>
    ${status}
  </div>
  ${hero}
</div>`;

  const body = `<section aria-labelledby="h-zones">
  <div class="sec-h"><p class="eyebrow">Zone par zone</p><h2 id="h-zones">Vigilance dans les 5 zones de l'île</h2>
  <p>La vigilance telle que Météo-France la publie, zone par zone et phénomène par phénomène : 5 zones terrestres et 8 zones côtières. Pour chacune, la couleur en cours, puis ce qui est prévu dans les 24 heures du bulletin.</p></div>
  ${zones || `<p class="card">Pas de bulletin à afficher pour le moment : voir ${lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr")}.</p>`}
  ${littoral}
  ${carteHtml(v?.carte, now)}
  <p><a href="/crues">La vigilance crues, rivière par rivière →</a></p>
</section>
${suivi}
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Votre IA, branchée sur la vigilance</h2>
  <p>Avec le connecteur, votre assistant lit lui-même la vigilance de Météo-France (outil <code>${coupable("vigilance_meteo")}</code>), et la signale d'office quand vous lui demandez la météo d'un lieu. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>
<section aria-labelledby="h-couleurs">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-couleurs">Comprendre les couleurs</h2></div>
  <div class="card"><h3>Vigilance météo (fortes pluies, orages, vent, vagues)</h3>${SCALE}</div>
  <p class="note">Cette page reprend telle quelle la vigilance publiée par Météo-France (API DPVigilance, Licence Ouverte), lue toutes les 5 minutes. En cas de doute, seuls font foi ${lienNom(mf.SOURCE.url, "vigilance.meteofrance.fr")}, ${lienNom("https://meteofrance.re/fr", "meteofrance.re")} et la préfecture.</p>
</section>`;
  return layout(origin, { title, description, path: "/vigilance", jsonld, alerte, vert: !!v && !alerte && islandGreen(v, now) }, band, body);
}

const CROWDED = new Set(["Plage de la Saline les Bains", "Plage de Saint-Paul"]);

/**
 * The risk of coral bleaching at the three points of NOAA's grid, in the validated words: the level in words with a scale
 * of 0 to 7 in night blue (the level's cell full), never NOAA's yellow, orange and red, and what the level is (the
 * highest of the last 7 days, or of the days the source has). A point without a level had none on any of those days, so it
 * says so of « ces jours », never of one day.
 */
export function reefSection(c: Cached<coraux.Coraux> | null): string {
  const head = `<div class="sec-h"><p class="eyebrow">Indice satellite, selon NOAA</p><h2 id="h-coraux">${esc(coraux.TITRE)}</h2>`;
  if (!c) return `<section aria-labelledby="h-coraux">${head}<p>La grille de NOAA Coral Reef Watch n'a pas pu être lue pour le moment.</p></div></section>`;
  const points = c.value.points.map((p) => `<li><span class="lieu">${esc(p.nom.charAt(0).toUpperCase() + p.nom.slice(1))}</span> ` +
    (p.niveau != null
      ? `<b>${esc(coraux.NIVEAUX[p.niveau])}</b> <span>selon NOAA</span> ` +
        `<span class="echelle" role="img" aria-label="niveau ${p.niveau} sur une échelle de 0 à 7">${coraux.NIVEAUX.map((_, i) => i).map((i) => `<i${i === p.niveau ? ' class="on"' : ""}></i>`).join("")}</span>`
      : "<b>—</b> <span>pas de niveau sur ces jours</span>") +
    (p.dhw != null ? `<span>Chaleur accumulée sur 12 semaines\u00a0: ${esc(coraux.chaleur(p.dhw))}</span>` : "") +
    (p.sst != null ? `<span>Mer à ${esc(thin(deg(p.sst)))}, par satellite</span>` : "") +
    `</li>`).join("");
  return `<section aria-labelledby="h-coraux">${head}
  <p>${esc(coraux.nature(c.value.jour))} ${esc(coraux.PAS_OBSERVATION)}</p></div>
  <div class="card"><ul class="reefs">${points}</ul>
  <p class="note">Niveau\u00a0: ${esc(coraux.niveauSur(c.value.jours))}.</p>
  <p class="note">${esc(coraux.AIDE_CHALEUR)}</p>
  <p class="note">${esc(coraux.CASE)}${c.stale ? " Dernière valeur gardée\u00a0: le serveur de NOAA ne répond pas pour le moment." : ""}</p>
  <p class="sources">Source\u00a0: ${esc(coraux.CREDIT)}.</p></div>
</section>`;
}

/**
 * The rules of approach of whales and dolphins, from the decrees in the code (tools/cetaces.ts), in the validated words:
 * the day's state (the humpback whales' period of rules or not), then the twelve rules with their articles. Computed
 * at each view, nothing read.
 */
export function whaleSection(now: Date): string {
  const rows = cetaces.REGLES.map((r) => `<tr><td data-label="Règle">${esc(r.regle)}</td><td data-label="Texte">${esc(r.article.charAt(0).toUpperCase() + r.article.slice(1))}</td></tr>`).join("");
  const links = cetaces.LIENS.map((l) => `<a href="${esc(l.pdf)}">${esc(l.texte)}</a> (<a href="${esc(l.page)}">sa page</a>)`).join("\u00a0; ");
  return `<section aria-labelledby="h-cetaces">
  <div class="sec-h"><p class="eyebrow">${esc(cetaces.T.surtitre)}</p><h2 id="h-cetaces">${esc(cetaces.T.titre)}</h2>
  <p>${esc(cetaces.etatDuJour(now))} ${esc(cetaces.T.presence)}</p></div>
  <div class="card"><table class="drought niveaux"><caption class="sr">${esc(cetaces.T.titre)}</caption><thead><tr><th scope="col">Règle</th><th scope="col">Texte</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note">${esc(cetaces.T.foi)} ${links}.</p>
  <p class="sources">Source\u00a0: ${esc(cetaces.T.source)}.</p></div>
</section>`;
}

/**
 * What the beaches' figures are, under the map: the satellite's pass, an instant, said as the tool temperature_mer says
 * it (« un instant, pas la moyenne de la journée »), or the day's mean; both when the beaches have some of each. The
 * caption said « moyenne de chaque jour » over passes (20/11/2026).
 */
export function seaMeasure(seen: { jour?: string; heure?: string }[]): string {
  const passes = [...new Set(seen.filter((b) => b.heure).map((b) => b.heure!))].sort();
  const means = seen.filter((b) => !b.heure);
  const when = (iso: string) => localTime(new Date(iso)).replace(" ", " à ");
  const parts = [
    ...(passes.length ? [`passage du satellite ${passes.map((h) => `le ${when(h)}`).join(" et ")}, un instant et pas la moyenne de la journée${means.length ? ` (${seen.length - means.length} plage${seen.length - means.length > 1 ? "s" : ""})` : ""}`] : []),
    ...(means.length ? [`${new Set(means.map((b) => b.jour)).size > 1 ? `moyenne de chaque jour, ${lesJours(means.map((b) => b.jour!))}` : `moyenne du ${dayMonth(means[0].jour!)}`}${passes.length ? ` (${means.length} plage${means.length > 1 ? "s" : ""})` : ""}`] : []),
  ];
  return `Mesure par satellite (NOAA CoastWatch et NASA), ${parts.join("\u00a0; ")}.`;
}

export function seaPage(origin: string, data: Cached<SeaData> | null, now = new Date(), alerte?: Alerte, reef?: Cached<coraux.Coraux> | null): string {
  const g = porte(alerte);
  const d = data?.value;
  const seen = d?.plages.filter((b) => b.valeur != null) ?? [];
  const day = seen.map((b) => b.jour!).sort().pop();
  const warm = seen.length ? seen.reduce((a, b) => (b.valeur! > a.valeur! ? b : a)) : undefined;
  const cool = seen.length ? seen.reduce((a, b) => (b.valeur! < a.valeur! ? b : a)) : undefined;
  const url = `${origin}/mer`;
  // Not every beach of the west coast: their markers would sit on one another.
  const markers: Marker[] = seen.filter((b) => !CROWDED.has(b.nom)).map((b) => ({ lon: b.lon, lat: b.lat, label: `${Math.round(b.valeur!)}°`, say: `eau à ${Math.round(b.valeur!)} °C`, name: seaName(b.nom), color: chip(b.valeur!), round: true, href: `#${anchorId("p", b.nom)}` }));

  const status = warm && cool
    ? `<div class="now"><span class="big span">${enGrand(esc(thin(`${fourchette(fr(Math.round(cool.valeur! * 10) / 10), fr(Math.round(warm.valeur! * 10) / 10))} °C`)))}</span>` +
      `<p>Température de surface de la mer autour de l'île, mesurée par satellite <b>${esc(lesJours(seen.map((b) => b.jour!)))}</b>. ` +
      `Plus chaude à <b>${esc(seaName(warm.nom))}</b>, plus fraîche à <b>${esc(seaName(cool.nom))}</b>.</p></div>`
    : `<p class="lead">Les mesures satellite se chargent : rechargez la page dans quelques secondes.</p>`;

  const list = d
    ? `<ul class="seas">${d.plages.map((b) => `<li class="tgt" id="${anchorId("p", b.nom)}"><span>${esc(seaName(b.nom))}</span>` +
        (b.valeur != null
          ? `<b>${esc(thin(deg(b.valeur)))}</b> <span>le ${esc(dayMonth(b.jour!))}${b.heure ? ` à ${esc(localTime(new Date(b.heure)).split(" ")[1])}` : ""}, à ${esc(fr(b.distance_km!))} km</span>`
          : `<b>—</b> <span>pas de mesure (nuages)</span>`) +
        // « Y aller » to a beach, not to the centre of a town listed for its coast (Saint-Denis, Le Port…).
        `<a href="/meteo/${slugify(b.commune)}">Météo ${esc(b.commune)} →</a>${resolvePlace(b.nom)?.lieu.type === "commune" ? "" : g.aller({ nom: seaName(b.nom), lat: b.lat, lon: b.lon }, "baignade")}</li>`).join("")}</ul>` +
      `<p class="note">Mis à jour ${leAt(data!.fetchedAt)}.</p><p class="sources">Sources : ${credits(d.sources)}.</p>`
    : `<p class="card">Les mesures satellite se chargent : rechargez la page dans quelques secondes.</p>`;

  // The buoys' measurements, while recent at the view (providers/candhis.ts): a measurement, never mixed with the forecast.
  // Its producer said under it, in a note: a « sources » paragraph is moved to the page's end (sourcesLast).
  const buoys = (d?.bouees ?? []).filter((b) => now.getTime() - b.t <= candhis.MESURE_MAX_HOURS * 3600_000);
  const measuredSwell = buoys.length
    ? `<section aria-labelledby="h-houle-mesuree">
  <div class="sec-h"><p class="eyebrow">Mesure, pas une prévision</p><h2 id="h-houle-mesuree">La houle mesurée au large</h2>
  <p>La dernière demi-heure mesurée par ${buoys.length > 1 ? "les bouées" : "la bouée"} du réseau Candhis du Cerema : la hauteur significative (celle du tiers des plus hautes vagues), la vague la plus haute, la période, la direction d'où viennent les vagues et la température de la mer à la bouée. Au large, avant le récif : dans le lagon, les vagues sont bien plus petites.</p></div>
  <div class="card"><ul class="seas">${buoys.map((b) => {
      const [jour, h] = b.mesuree_a.split(" ");
      const what = [b.venant, b.periode && `période ${b.periode}`, b.vague_max && `vagues jusqu'à ${b.vague_max}`].filter(Boolean).join(", ");
      return `<li><span>${esc(b.bouee)}</span> <b>${b.hauteur_significative ? esc(thin(b.hauteur_significative)) : "—"}</b> <span>${esc(thin(what))}</span>` +
        ` <span>mesurée le ${esc(jour)} à ${esc(h)}${b.temperature_eau ? `, mer à ${esc(thin(b.temperature_eau))}` : ""}</span></li>`;
    }).join("")}</ul>
  <p class="note">Source\u00a0: ${esc(candhis.SOURCE.attribution)} (${esc(candhis.SOURCE.licence)}).</p></div>
</section>`
    : "";

  const waves = d?.plages.filter((b) => b.houle) ?? [];
  const top = waves.length ? waves.reduce((a, b) => (b.houle!.hauteur_m > a.houle!.hauteur_m ? b : a)) : undefined;
  const swell = waves.length
    ? `<section aria-labelledby="h-houle">
  <div class="sec-h"><p class="eyebrow">Prévision, pas une mesure</p><h2 id="h-houle">La houle prévue près de chaque plage</h2>
  <p>Hauteur, direction et période des vagues au large, pour les 3 heures en cours, puis la plus haute des 4 jours, d'après deux modèles de vagues : celui de Météo-France (MFWAM, maille d'environ 9 km), qui distingue la houle principale du reste de la mer, à l'ouest et au sud\u00a0; celui du Centre européen (ECMWF, maille de 9 km) au nord et à l'est, où le premier n'a pas de point près de la côte. Dans le lagon et derrière le récif, les vagues sont bien plus petites. Pour la sécurité : <a href="/vigilance">la vigilance vagues-submersion</a>, les drapeaux et les maîtres-nageurs.</p></div>
  <div class="card"><ul class="seas">${waves.map((b) => `<li><span>${esc(seaName(b.nom))}</span>` +
      ` <b>${esc(thin(`${fr(b.houle!.hauteur_m)} m`))}</b> <span>${esc(b.houle!.maintenant.replace(/^\S+ m /, ""))}, vers ${esc(b.houle!.heure)}</span>` +
      ` <span>jusqu'à ${esc(thin(b.houle!.max))} ${esc(b.houle!.max_jour)}</span></li>`).join("")}</ul></div>
</section>`
    : "";

  // The next tides: computed at the view, from the constants of the package, whatever the copy's age.
  const computed = GAUGES.map((g) => tidesAt(g, now, d?.maree ?? [], data?.fetchedAt)).filter((x) => !!x);
  const coming = computed.length
    ? `<h3>Les prochaines marées : un calcul, pas la prédiction du SHOM</h3>
  <ul class="seas">${computed.map((x) => `<li><span>${esc(x.nom)}</span> ` +
      x.next.liste.map((e, i) => (i === 0 ? `<b>${esc(e.type)} ${esc(e.heure)}</b> <span>${esc(thin(`${fr(e.hauteur_m)} m`))}${"note" in e ? ", marée faible : heure plus incertaine" : ""}</span>` : ` <span>${esc(e.type)} ${esc(e.heure)} (${esc(thin(`${fr(e.hauteur_m)} m`))}${"note" in e ? ", marée faible : heure plus incertaine" : ""})</span>`)).join("") +
      `</li>`).join("")}</ul>
  <p class="note">${esc(TIDE_LABEL.replace(/^c/, "C"))} : analyse harmonique de plusieurs années de mesures de ces deux marégraphes ; heures à environ ${computed.map((x) => `${x.minutes} min près ${a(x.gauge.commune)}`).join(", ")}, hauteurs à environ 5 cm près ; pas de coefficient. La marée est faible à La Réunion (20 à 80 cm) : utile pour le lagon, la pêche à pied ou la mise à l'eau, pas pour la navigation. ${adressesCoupables(TIDE_CITATION)}</p>
  <p class="note">Ces heures valent près des deux marégraphes, à ${NEAR_KM} km au plus. Plus loin sur la côte, la marée arrive à une autre heure : horaires officiels du SHOM pour ${["Saint-Leu", "Saint-Pierre"].map((c) => `<a href="${esc(shomPort(c)!)}">${c}</a>`).join(" et ")}.</p>`
    : "";
  const tide = d?.maree?.length || coming
    ? `<section aria-labelledby="h-maree">
  <div class="sec-h"><p class="eyebrow">Mesurée chaque minute, puis calculée</p><h2 id="h-maree">La marée en ce moment</h2>
  <p>Hauteur d'eau au-dessus du zéro des cartes marines, aux deux marégraphes du SHOM. Les dernières pleine et basse mer sont mesurées ; les prochaines, plus bas, sont calculées par rundata.</p></div>
  <ul class="seas">${(d?.maree ?? []).map((g) => `<li><span>${esc(g.maregraphe)}</span> ` +
      ("hauteur_m" in g && g.hauteur_m != null
        ? `<b>${esc(thin(`${fr(g.hauteur_m)} m`))}</b> <span>${g.tendance === "étale" ? "mer étale" : `marée ${esc(g.tendance!)}`}, mesurée ${esc(leJour(g.heure_mesure!))}</span>` +
          g.derniers_extremes!.slice().reverse().map((e) => ` <span>${esc(e.type)} vers ${esc(e.heure)} (${esc(fr(e.hauteur_m))} m)</span>`).join("") +
          ("avertissement" in g && g.avertissement ? ` <span>pas de mesure depuis ${esc(g.age_texte!.replace(/^il y a /, ""))}</span>` : "")
        : `<b>—</b> <span>marégraphe muet pour le moment</span>`) +
      `</li>`).join("")}</ul>
  ${coming}
</section>`
    : "";

  const title = "Mer : houle, température de l'eau, marée · La Réunion (974)";
  // The swell forecast from the copy's day: its day counts more than its height, which goes first when the description
  // does not fit; undated, as before, only when even that does not fit.
  const seaSays = (du: string, max = true) => `La mer à La Réunion (974) plage par plage : l'eau ${deg(cool!.valeur!) === deg(warm!.valeur!) ? `à ${deg(warm!.valeur!)}` : `de ${deg(cool!.valeur!)} à ${deg(warm!.valeur!)}`}, mesurée par satellite ${lesJours(seen.map((b) => b.jour!))}${top ? `, et la houle prévue${du}${max ? `, jusqu'à ${top.houle!.max}` : ""}` : ""}.`;
  const description = warm && cool
    ? [seaSays(` à partir du ${jourDe(data!.fetchedAt)}`), seaSays(` à partir du ${jourDe(data!.fetchedAt)}`, false), seaSays("")].find((x) => x.length <= DESCRIPTION_MAX) ?? seaSays("")
    : "La mer à La Réunion (974), plage par plage : la température mesurée par satellite, la houle prévue. Saint-Gilles, Saint-Leu, Saint-Pierre…";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Mer", item: `${origin}/mer` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Température de surface de la mer autour de La Réunion (974)",
      description: "Température de surface de la mer mesurée par satellite au large de chaque plage de La Réunion : au dernier passage du satellite, sinon en moyenne d'une journée, publiée au plus tôt le lendemain.",
      url: `${origin}/mer`,
      isAccessibleForFree: true,
      inLanguage: "fr-FR",
      license: "https://www.usa.gov/government-works",
      creator: [
        { "@type": "Organization", name: "NOAA CoastWatch", url: "https://coastwatch.noaa.gov/" },
        { "@type": "Organization", name: "NASA", url: "https://www.nasa.gov/" },
      ],
      spatialCoverage: ISLAND,
      variableMeasured: ["température de surface de la mer"],
      measurementTechnique: "radiomètres satellitaires (ACSPO L3S, MODIS Aqua)",
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
    },
  ];

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li aria-current="page">Mer</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">Mesure satellite${day ? ` · ${esc(lesJours(seen.map((b) => b.jour!)).replace(/^(le|les|du) /, ""))}` : ""}</p>
    <h1>Mer à La Réunion\u00a0: température et houle <span class="n974">974</span></h1>
    ${status}
    ${ruleTop(now)}
    ${ask(`Dolo la mèr lé sho ? Gèt si ${url} é di amwin pou chak plaj.`,
      `Quelle est la température de l'eau à La Réunion ? Lis ${url} et donne-moi la température plage par plage, avec la date de la mesure.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, apart: true, listed: true, label: "Carte de La Réunion (974) avec la température de la mer au large de chaque plage" })}
  ${day ? `<figcaption class="note" style="color:var(--on-night-muted)">${legende([{ forme: "rond", couleur: chip(26), texte: "26°", dit: "température de l'eau au large de la plage" }], esc(seaMeasure(seen)))}</figcaption>` : ""}</figure>
</div>`;

  const body = `${courbesSection(d?.courbes, now)}
<section aria-labelledby="h-plages">
  <div class="sec-h"><p class="eyebrow">Plage par plage</p><h2 id="h-plages">La mer au large de chaque plage</h2>
  <p>Du nord à l'ouest en passant par l'est et le sud : la dernière mesure satellite à moins de 12 km de chaque plage.</p></div>
  <div class="card">${list}</div>
</section>
${reef !== undefined ? reefSection(reef) : ""}
${whaleSection(now)}
${measuredSwell}${swell}
${tide}
${bathingBlock(now, undefined, g)}${g.feuille}
<p class="lead"><a href="/peche">Pêche de loisir\u00a0: langouste, bichiques, capucin nain, ce qui est fermé aujourd'hui →</a></p>
<section aria-labelledby="h-lire-mer">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-lire-mer">Ce que mesure le satellite</h2></div>
  <div class="three">
    <div class="card">${icon("wave")}<h3>La surface, au large</h3><p>Le satellite mesure la toute première couche d'eau, en moyenne sur des carrés de 2 à 4 km. Le lagon et le bord de plage, peu profonds, sont souvent plus chauds en journée.</p></div>
    <div class="card">${icon("cloud")}<h3>Pas à travers les nuages</h3><p>Un ciel couvert cache la mer : la mesure retenue est alors celle d'un jour précédent, ou d'un carré un peu plus loin. La date et la distance sont toujours données.</p></div>
    <div class="card">${icon("gauge")}<h3>Au mieux, la mesure d'hier</h3><p>Une mesure par satellite paraît au plus tôt le lendemain du jour mesuré : celle d'aujourd'hui n'existe pas encore. La houle, elle, est une prévision ; pour la vigilance vagues-submersion, voyez <a href="/vigilance">la vigilance</a>.</p></div>
  </div>
</section>
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Demandez à votre IA : « la mer est à combien à Saint-Leu ? », « la houle demain à Saint-Pierre ? »</h2>
  <p>Avec le connecteur, votre assistant va chercher lui-même la mesure la plus proche de la plage, avec sa date, et la houle prévue, étiquetée comme une prévision (outil <code>${coupable("temperature_mer")}</code>). Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>`;
  return layout(origin, { title, description, path: "/mer", jsonld, alerte }, band, g.ligne + body);
}

const PROSE = `max-width:44rem;display:grid;gap:1rem`;

/** The privacy policy and the terms (with the legal notice): what is kept, what is promised. */
export function legalPage(origin: string, kind: "confidentialite" | "conditions", alerte?: Alerte): string {
  const privacy = kind === "confidentialite";
  const title = privacy ? "Confidentialité" : "Conditions d'utilisation et mentions légales";
  const body = privacy
    ? `<section style="${PROSE}">
  <h2>En bref</h2>
  <p>${enLigne() ? `Pour consulter le site ou l'utiliser depuis un assistant IA, rundata.re ne demande ni compte, ni nom, ni adresse électronique. Seuls les ${connecteursEnLigne() ? "trois" : "deux"} formulaires des clubs et associations demandent une adresse électronique (voir <a href="#associations-donnees">«\u00a0Ce que les clubs et associations envoient\u00a0»</a>${connecteursEnLigne() ? ` et <a href="#plateformes-donnees">«\u00a0Les associations reliées à une plateforme\u00a0»</a>` : ""}).` : "rundata.re ne demande ni compte, ni nom, ni adresse électronique."}${alertesEnLigne() ? ` Si vous choisissez de recevoir les alertes sur votre téléphone, le site garde l'adresse de notification que donne votre navigateur, tant que vous restez abonné (voir <a href="#alertes">«\u00a0Les alertes sur votre téléphone\u00a0»</a>).` : ""} Le site ne pose aucun cookie et ne contient aucun traceur publicitaire. Dans votre navigateur, sans cookie, le site garde la date de votre première et de votre dernière visite, pour savoir s'il sert d'un jour à l'autre\u00a0; il n'en envoie qu'une catégorie (voir <a href="#retours">«\u00a0Les retours\u00a0»</a>).${enLigne() ? ` La vérification anti-robot des ${connecteursEnLigne() ? "trois" : "deux"} formulaires des clubs et associations y garde aussi une donnée (voir <a href="#abus">«\u00a0Contre les abus\u00a0»</a>).` : ""} Une mesure de Cloudflare, sans cookie, compte aussi les pages vues et leur vitesse d'affichage (voir <a href="#mesure-cloudflare">«\u00a0La mesure de Cloudflare\u00a0»</a>). Rien n'est vendu ni partagé à des fins commerciales.</p>
  <h2>Ce que le site compte</h2>
  <p>Pour savoir quelles pages et quels outils servent, et les améliorer, chaque page vue et chaque message reçu par le connecteur ajoutent une ligne anonyme aux statistiques : la page et sa rubrique, ou l'outil appelé avec le nom des paramètres donnés (pas leur valeur) ; le lieu demandé quand c'en est un, tel que le site l'a compris (une commune, une plage…), ou le texte demandé, coupé à 60 caractères, quand il ne l'a pas compris, pour apprendre à le comprendre ; le nom et la version de l'application de l'assistant (par exemple « claude-ai ») ; si la réponse a réussi, son temps et sa taille ; le pays déduit par Cloudflare, la langue du navigateur, si la page est ouverte depuis l'application installée sur l'écran d'accueil, le site d'où vient le visiteur et son type (une personne, un assistant, ou le nom du robot d'un assistant ou d'un moteur de recherche).</p>
  <p>Chaque lecture d'un flux RSS de commune ajoute aussi une ligne, à part : le flux, le nom de l'application qui le lit (Feedly, Inoreader…) et le nombre d'abonnés qu'elle annonce, sans rien sur les abonnés eux-mêmes.</p>
  <p>Ni adresse IP, ni identifiant, ni cookie. Des coordonnées ne sont jamais gardées, seulement leur commune.</p>
  <p>Depuis le 24 octobre 2026, un texte non compris qui ressemble à une adresse (un numéro suivi d'une rue, d'un chemin, d'une impasse, d'un lotissement…) n'est plus gardé tel qu'écrit, ni dans les statistiques ni dans le journal : seulement le mot « adresse ». Un nom de rue sans numéro peut encore être gardé, coupé à 60 caractères, comme tout lieu non compris. Une adresse postale donnée à l'outil <code>${coupable("fiche_terrain")}</code> n'est jamais enregistrée, pas plus que les autres paramètres (un arrêt de bus, un sujet…).</p>
  <p id="appli">L'appli rundata.re pour téléphone lit les mêmes outils que le connecteur. Depuis le 22 novembre 2026, pour ses demandes, les statistiques ne gardent ni le lieu demandé, ni sa commune, ni le pays\u00a0: seulement «\u00a0appli\u00a0» ou «\u00a0widget\u00a0» et la version de l'appli. Notre copie d'un an des journaux techniques ne garde pas non plus le pays ni le réseau\u00a0; seuls les journaux que Cloudflare garde quelques jours les contiennent, comme pour toute visite. Pour ne pas refaire le même travail pour chaque téléphone, la réponse à une même question est gardée 5 minutes dans le cache de Cloudflare, sans rien qui dise qui l'a demandée.</p>
  <p>La page envoie aussi, sans identifiant, le temps qu'elle a mis à s'afficher sur votre appareil\u00a0; sur la page du connecteur, le fait que son adresse a été copiée\u00a0; quand vous suivez un lien depuis l'agenda des événements, le nom du site où il mène (par exemple le site d'une salle) et la page d'où vous partez, sans l'adresse complète du lien\u00a0; et votre réponse au bouton «\u00a0Cette page vous a aidé\u00a0?\u00a0» (la page, et oui ou non).</p>
  <p>Ces statistiques sont gardées par Cloudflare (Workers Analytics Engine) trois mois au plus.</p>
  <p id="mesure-cloudflare">La mesure de Cloudflare. Chaque page charge aussi un petit script de Cloudflare Web Analytics, l'outil de mesure de notre hébergeur. À chaque page vue, il envoie à Cloudflare l'adresse de la page, le site d'où vous venez et des mesures de vitesse\u00a0: le temps qu'a mis la page à s'afficher, sa stabilité et sa réactivité sur votre appareil. Cloudflare y associe le pays, le navigateur, le système et le type d'appareil (ordinateur, téléphone, tablette). Ce script ne pose aucun cookie et ne garde rien dans votre navigateur. Comme pour toute page, Cloudflare reçoit votre adresse IP\u00a0; selon sa documentation, il ne s'en sert pas, ni d'aucune autre donnée, pour suivre les visiteurs dans le temps ou d'un site à l'autre. Cloudflare garde chaque mesure 7 jours, puis un échantillon d'environ un dixième, que nous pouvons consulter pendant six mois. Ces mesures nous servent à voir quelles pages sont lues et lesquelles s'affichent lentement, pour améliorer le site.</p>
  <p>Installation et lecture hors ligne : elles n'utilisent aucun cookie. Pour afficher les pages sans réseau, le site garde sur votre téléphone une copie des pages que vous ouvrez (le cache du navigateur, géré par un « service worker »). Votre choix «\u00a0Plus tard\u00a0» est gardé de la même façon, comme la langue choisie, kréol ou français, pour la question toute prête à poser à votre IA. Ces données restent sur le téléphone et ne sont envoyées à personne. Elles s'effacent depuis les réglages du navigateur (données du site rundata.re).</p>
  <p>Les visites de l'équipe. Pour que les statistiques ne comptent pas ceux qui font le site, leurs appareils portent un repère, gardé dans le navigateur de la même façon (sans cookie). Leurs pages vues sont notées « interne » et laissées hors des chiffres. Rien ne change pour les autres visiteurs.</p>
  <p id="retours">Les retours. Pour savoir si le site sert d'un jour à l'autre, votre navigateur garde deux dates\u00a0: celle de votre première visite et celle de votre dernière, le jour seulement, sans l'heure. Ce n'est pas un cookie, mais le stockage local du navigateur, sur votre appareil. À chaque visite, la page n'envoie aux statistiques qu'une catégorie, jamais les dates\u00a0: première visite, le même jour, le lendemain, dans la semaine, ou plus tard. Ce repère ne sert qu'à cette mesure\u00a0: aucun autre site ne le lit, et il n'est recoupé avec rien. Passé 13 mois après votre première visite, il est effacé dès votre visite suivante, avant tout envoi\u00a0; il n'est jamais prolongé. Sans nouvelle visite, il reste sur votre appareil, sans être lu ni envoyé. Vous pouvez l'effacer à tout moment depuis les réglages du navigateur (données du site rundata.re). Selon les règles de la CNIL, une telle mesure d'audience ne demande pas de consentement («\u00a0Cookies\u00a0: solutions pour les outils de mesure d'audience\u00a0», ${lienNom("https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience", "cnil.fr")}).</p>
  <p id="fonds-ign">Si vous choisissez le fond Plan IGN ou Photo aérienne, votre navigateur charge ces images chez l'IGN (${adresseTexte("data.geopf.fr")}), qui reçoit alors votre adresse IP.</p>
${alertesEnLigne() ? `<h2 id="alertes">Les alertes sur votre téléphone</h2>
  <p>Les alertes se reçoivent sans compte, sans nom et sans adresse électronique. Quand vous appuyez sur «\u00a0Recevoir les alertes sur ce téléphone\u00a0», votre navigateur crée une adresse de notification auprès de son service de notifications (Google pour Chrome et Android, Apple pour l'iPhone, Mozilla pour Firefox, Microsoft pour Edge) et la donne à rundata.re.</p>
  <p>Nous gardons seulement cette adresse et les deux clés que votre navigateur fournit pour chiffrer les messages qui lui sont destinés. Rien d'autre\u00a0: ni nom, ni adresse électronique, ni commune, ni date, ni adresse IP. La demande d'abonnement passe par le site, comme toute page, et apparaît donc dans les journaux techniques (voir «\u00a0Journaux techniques\u00a0»).</p>
  <p>Chaque alerte part chiffrée, texte compris. Le service de notifications l'achemine sans pouvoir la lire. Il sait seulement qu'un message part vers cette adresse, à quelle heure et avec quel degré d'urgence. L'adresse ne sert qu'à vous envoyer les alertes, et n'est transmise à personne d'autre que ce service.</p>
  <p>Elle est effacée\u00a0:</p>
  <ul>
    <li>dès que vous appuyez sur «\u00a0Ne plus recevoir\u00a0»\u00a0;</li>
    <li>quand le service de notifications nous répond que l'adresse n'existe plus. C'est le cas, par exemple, quand vous retirez l'autorisation des notifications dans les réglages du navigateur, ou quand vous désinstallez le site.</li>
  </ul>
` : ""}  <h2>Journaux techniques</h2>
  <p>Comme tout hébergeur, Cloudflare garde quelques jours les journaux du service (adresse demandée, erreurs, durée). Pour chaque message du connecteur, ils reprennent les éléments des statistiques ci-dessus, sans rien de plus. Une copie sans aucune adresse IP est conservée un an au plus, pour comprendre les pannes. Votre conversation n'y figure jamais.</p>
  <h2 id="avis-donnees">Les avis que vous laissez</h2>
  <p>Le formulaire en bas de chaque page et l'outil <code>${coupable("donner_avis")}</code> du connecteur (que votre assistant appelle quand vous signalez une donnée qui manque ou une erreur, ou avec votre accord) enregistrent : la date, le type d'avis, le message, l'outil et le lieu concernés, le besoin résumé en quelques mots (jamais le texte de la conversation), la page du formulaire, et le nom de l'assistant quand il se présente (Claude, ChatGPT…). Ils servent à corriger et à compléter les données, et à rien d'autre. Ni compte, ni adresse IP : pour refuser les envois en masse, une empreinte chiffrée de l'adresse, qui change chaque jour et ne permet pas de la retrouver, est gardée un jour puis effacée. Les numéros de téléphone et adresses électroniques écrits dans un message sont retirés avant l'enregistrement. Les avis sont conservés 12 mois, chez Cloudflare (base D1), puis effacés automatiquement. Ils ne sont ni publiés ni partagés. Pour qu'un avis soit effacé plus tôt, écrire à <b>${adresseTexte("contact@rundata.re")}</b> en le citant.</p>
${enLigne() ? `<h2 id="associations-donnees">Ce que les clubs et associations envoient</h2>
  <p><b>Formulaire «\u00a0Proposer un événement\u00a0».</b> Nous recueillons l'adresse e-mail de l'organisateur pour confirmer l'événement, le modérer et permettre de le modifier ou de l'annuler. Elle n'est pas publiée, sauf si l'organisateur coche «\u00a0Utiliser mon adresse e-mail comme contact public\u00a0»\u00a0: elle apparaît alors avec l'événement, sur rundata.re, dans les réponses des assistants IA et dans le flux ouvert des événements, et d'autres peuvent l'avoir copiée entre-temps. Il en va de même pour le contact public saisi dans le formulaire. L'adresse et le contact public sont effacés 30 jours après la dernière date de l'événement, avec une correction qui attendrait encore la relecture. Une proposition non confirmée est effacée sous 48 heures, et un événement l'est un an après sa dernière date.</p>
  <p><b>Formulaire «\u00a0Nous donner votre lien\u00a0».</b> Le lien, le nom de l'organisation, sa commune et le contact facultatif (jamais publié) sont effacés 12 mois après l'envoi.</p>
  <p id="abus"><b>Contre les abus</b>, pour les ${connecteursEnLigne() ? "trois" : "deux"} formulaires, une empreinte de la connexion est gardée un jour, puis effacée. L'adresse IP elle-même n'est pas gardée. La vérification anti-robot (Cloudflare Turnstile) voit l'adresse au moment de l'envoi, sans que nous la gardions. Dès qu'elle s'affiche sur la page d'un de ces formulaires, cette vérification garde aussi dans votre navigateur une donnée de Cloudflare, nommée «\u00a0cf.turnstile.u\u00a0». C'est du stockage local du navigateur, pas un cookie. Elle appartient à la vérification anti-robot, dont Cloudflare ne publie pas le rôle exact. Le site ne la lit pas. Elle n'a pas de date d'effacement\u00a0: elle s'efface depuis les réglages du navigateur (données du site rundata.re).</p>
  ` : ""}${connecteursEnLigne() ? `<h2 id="plateformes-donnees">Les associations reliées à une plateforme (HelloAsso)</h2>
  <p>Une association qui relie son compte HelloAsso colle ses deux clés HelloAsso et une adresse e-mail. Ses clés servent une seule fois, au moment de l'envoi, à obtenir un jeton d'accès\u00a0: elles ne sont jamais gardées. Nous gardons ce jeton chiffré, le nom de l'association, sa commune et l'adresse e-mail, qui n'est jamais publiée. Avec ce jeton, rundata.re lit seulement les événements publics de l'association\u00a0: le titre, les dates, le lieu, le prix, le lien et le début de la description. Il ne lit jamais ses commandes, paiements, dons, participants ni adhérents, même si le jeton le permet. Le jeton et l'adresse sont effacés dès que l'association retire l'accès (lien reçu par e-mail, ou demande à ${adresseTexte("contact@rundata.re")}), quand HelloAsso refuse le jeton, quand la connexion expire après 30 jours sans lecture réussie, et après 48 heures si la connexion n'a jamais été confirmée. Au retrait, ses événements sont effacés aussi. Ces événements entrent dans nos données ouvertes (agenda ICS et JSON, Licence Ouverte 2.0) seulement si l'association l'a choisi en reliant son compte\u00a0; HelloAsso l'a accepté par écrit le <span class="jm">29 octobre</span> 2026.</p>
  <p>HelloAsso nous a conseillé de passer par les clés API de chaque association\u00a0: c'est aujourd'hui la seule façon de lire les événements d'une association qui le souhaite. Ces clés donnent accès à tout le compte de l'association\u00a0; rundata.re n'en lit que les événements publics (titre, dates, lieu, prix, lien), jamais les commandes, les paiements ni les participants. L'association peut couper l'accès à tout moment en supprimant ses clés API dans l'onglet «\u00a0Intégrations et API\u00a0» de son espace HelloAsso.</p>
  ` : ""}  <h2>Quand votre assistant pose une question</h2>
  <p>Votre assistant (ChatGPT, Claude, Le Chat…) n'envoie au connecteur que les paramètres de l'outil, par exemple « Saint-Paul » ou une adresse, jamais votre conversation. Pour répondre, rundata.re transmet ce paramètre aux services publics qui détiennent la donnée : par exemple, une adresse est envoyée au géocodeur de l'IGN, puis le point trouvé au cadastre, au Géoportail de l'urbanisme, à Géorisques et à l'API DVF du Cerema. Ce que fait votre assistant de la conversation relève de sa propre politique de confidentialité.</p>
  <h2>Vos droits</h2>
  <p>${enLigne() ? `Pour qui consulte le site, aucune donnée ne permet de l'identifier\u00a0: il n'y a rien à consulter ni à effacer à son nom (sauf ce qu'il aurait écrit lui-même dans un avis). ${alertesEnLigne() ? `L'adresse de notification d'un téléphone abonné aux alertes ne dit pas qui vous êtes\u00a0: nous ne pouvons donc pas la retrouver à partir d'une demande. Vous l'effacez vous-même en appuyant sur «\u00a0Ne plus recevoir\u00a0», ou en retirant l'autorisation des notifications dans les réglages du navigateur. ` : ""}Si vous avez proposé un événement ou donné un lien, vous pouvez le corriger, l'annuler ou le retirer avec le lien reçu par e-mail. Pour consulter ou faire effacer ce que nous gardons, écrivez à <b>${adresseTexte("contact@rundata.re")}</b>\u00a0: nous répondons sous un mois.` : `Aucune donnée ne permet de vous identifier, il n'y a donc rien à consulter ni à effacer à votre nom (sauf ce que vous auriez écrit vous-même dans un avis). ${alertesEnLigne() ? `L'adresse de notification d'un téléphone abonné aux alertes ne dit pas qui vous êtes\u00a0: nous ne pouvons donc pas la retrouver à partir d'une demande. Vous l'effacez vous-même en appuyant sur «\u00a0Ne plus recevoir\u00a0», ou en retirant l'autorisation des notifications dans les réglages du navigateur. ` : ""}Pour toute question\u00a0: <b>${adresseTexte("contact@rundata.re")}</b>.`} Vous pouvez aussi saisir la <a href="https://www.cnil.fr/fr/plaintes">CNIL</a>.</p>
  <p style="color:var(--muted)">Mise à jour\u00a0: 30 octobre 2026.</p>
</section>`
    : `<section style="${PROSE}">
  <h2>Le service</h2>
  <p>rundata.re est un service gratuit\u00a0: un site et un connecteur MCP (<code>${adressesCoupables(`${origin}/mcp`)}</code>) qui réunissent les données publiques de La Réunion pour les personnes et leurs assistants IA. Il n'y a ni compte ni abonnement. Son code est libre, sous licence MIT, sur <a href="${GITHUB}">GitHub</a>.</p>
  <h2>Pas un service officiel, pas de garantie</h2>
  <p>Les données viennent d'organismes publics et de projets ouverts, cités dans chaque réponse. Elles sont données telles quelles, sans garantie d'exactitude, de fraîcheur ni de disponibilité. Pour un cyclone, de fortes pluies, une crue ou une éruption, seules comptent la vigilance de <a href="https://meteofrance.re/fr">Météo-France La Réunion</a> et les consignes de la préfecture. La fiche d'une adresse n'a aucune valeur juridique : le cadastre est un document fiscal, et l'état des risques obligatoire pour une vente ou une location reste à établir.</p>
  <h2>Usage raisonnable</h2>
  <p>Le service est fait pour répondre à des questions. Ne l'interrogez pas en masse de façon automatique : il peut limiter ou bloquer un usage qui gêne les autres ou les services publics qu'il interroge.</p>
  <h2 id="reutiliser">Réutiliser les données</h2>
  <p>Chaque donnée garde la licence de sa source : Licence Ouverte Etalab 2.0 pour la plupart, ODbL pour OpenStreetMap, CC BY 4.0 pour Open-Meteo et les séismes de l'IPGP. L'outil <code>${coupable("sources_donnees")}</code> les liste avec l'attribution à citer.</p>
${enLigne() ? `<p id="evenements-proposes"><b>Événements proposés par les clubs et associations.</b> L'association qui propose un événement en est responsable\u00a0: elle garantit qu'il est ouvert au public, exact, et qu'elle a le droit de le publier. rundata.re relit chaque proposition avant de l'afficher. Il peut refuser ou retirer un événement, en donnant le motif à l'organisateur\u00a0: notamment un événement privé, une adresse de domicile, des données personnelles, de la politique électorale, une collecte d'argent sans organisme identifié ou de la publicité commerciale. Un événement faux ou qui pose problème peut être signalé à ${adresseTexte("contact@rundata.re")}\u00a0; nous le retirons, en général dans la journée. La mention «\u00a0Proposé par l'organisateur\u00a0» signale que l'événement n'a pas été vérifié par rundata.re. Les événements publiés sont sous Licence Ouverte 2.0.</p>
  ` : ""}  <h2 id="mentions-legales">Mentions légales</h2>
  <p>rundata.re est édité à titre non professionnel par un particulier qui, comme le permet l'article 1-1, II de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, a choisi de préserver son anonymat. Ses éléments d'identification ont été communiqués à l'hébergeur. Contact : <b>${adresseTexte("contact@rundata.re")}</b>. Hébergeur : Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis (${adresseTexte("cloudflare.com")}). Nom de domaine enregistré auprès de l'AFNIC (.re).</p>
  <p style="color:var(--muted)">Mise à jour\u00a0: 25 octobre 2026.</p>
</section>`;
  const description = privacy
    ? "Ce que rundata.re garde, et ce qu'il ne garde pas : aucun compte, aucun cookie, des statistiques anonymes."
    : "Conditions d'utilisation de rundata.re, service gratuit de données publiques de La Réunion, et mentions légales.";
  return layout(origin, {
    title: `${title} · rundata.re`,
    description,
    path: `/${kind}`,
    jsonld: [crumbs(origin, title, `/${kind}`), webPageLd(origin, `/${kind}`, `${title} · rundata.re`, description)],
    alerte,
  }, `${crumbBar(title)}
<div class="wrap intro"><div class="pitch"><h1>${title}</h1></div></div>`, body);
}
