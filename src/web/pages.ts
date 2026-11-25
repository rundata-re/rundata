/**
 * The layout shared by every page (menu of the categories, footer) and the helpers the pages share. The weather of the
 * whole island (/meteo) is in meteo-page.ts, of each commune or famous place in lieu-page.ts, the sea (/mer) in
 * mer-page.ts, the vigilance (/vigilance) in vigilance-page.ts, the legal pages in legal-page.ts, the home page in
 * home.ts, the other categories in domains.ts. Rendered on the server, live values included, so that search engines
 * and link previews see them. The only scripts copy the connector address and filter the list of places; the rest is
 * HTML and CSS.
 *
 * The weather is one category among others, but the one people search for: « météo réunion 974 », « météo cilaos
 * 974 ». « 974 » sorts La Réunion from meetings, so the tab's title carries it, « La Réunion (974) » when it fits in
 * 60 characters; the headings stay as people say them.
 */
import { sansBalises } from "./texte-stable.js";
import { enLigne } from "./associations-drapeau.js";
import type { Cached } from "../cache.js";
import { ageMinutes, ageText, localTime } from "../geo.js";
import { toutesLesSources, VERSION } from "../server.js";
import { compte } from "../producteurs.js";
import { a, fourchette, fr } from "../tools/format.js";
import * as mf from "../providers/vigilance.js";
import { cyclone, cycloneHead, cycloneLevel, cycloneOn, feminine, islandGreen, NONE_ISSUED_SAID, raised } from "../tools/vigilance.js";
import type { Alerte, Credit, HomeData, StationNow } from "./data.js";
import { vigilanceLue } from "./data.js";
import { hasZones, ZONES_SCRIPT } from "./defilement.js";
import brand from "./brand.json" with { type: "json" };
import og from "./og.json" with { type: "json" };
import * as traces from "../providers/traces.js";
import icons from "./icons.json" with { type: "json" };
import rubriques from "./og-rubriques.json" with { type: "json" };
import { byUse, FIRST, type Urgent, urgentKeys, WITH_PAGE } from "./categories.js";
import { COMMUNES, CYCLONE, type Entree, GROUPES } from "./menu.js";
import { FLAG_INNER } from "./flag.js";
import { logo } from "./logo.js";
import { esc, mapCredit, NOMS_SCRIPT, ownIds, RELIEF_SCRIPT } from "./map.js";
import { typo } from "./typo.js";
import { mentionLinks } from "../mentions.js";
import { withSigles } from "./sigles.js";
import { bannerHtml, volcanBanner } from "./volcan-alerte.js";
import { avisForm } from "./avis.js";
import { aide, SIGNAL_SCRIPT } from "./signaux.js";
import { fond, motif, MOTIF_CREDIT, MOTIF_PAGES } from "./fonds.js";
import { POINTS_SCRIPT } from "./carte-points.js";
import { communeOf, rainPill, windPill } from "./meteo-carte.js";
import { stationOf, stationPath } from "./station.js";
import { INSTALL, OFFLINE_PATH, OFFLINE_SCRIPT, PWA_SCRIPT } from "./pwa.js";
import { FONT_PATH, STOPS, STYLE_PATH } from "./style.js";
import { PAGES, type PlacePage, PRINCIPAL, slugify } from "./places.js";
import { adresseTexte } from "./adresse.js";
import { lienNom, nomsCoupables } from "./domains.js";
import * as meteorOi from "../providers/meteor-oi.js";
import { PASSES } from "../historique/cyclones-passes.js";
import { ditAmateur, reseauAmateur } from "../tools/meteo.js";
import { script } from "./scripts-declares.js";

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
export const jourDe = (at: string | Date) => localTime(new Date(at)).split(" ")[0];
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

/**
 * `?ref=site` on the links to the accounts, for the network's own statistics: rundata.re never sees it (src/metrics.ts
 * counts the visits that come to the site). Not on GitHub, nor on Facebook, where `ref` is a parameter of Facebook's
 * own: on 25/11/2026 a reader said that on some older Android phones the link with `?ref=site` did not open the Page.
 */
const SANS_REF = new Set(["GitHub", "Facebook"]);
const fromSite = (s: Social) => (SANS_REF.has(s.nom) ? s.url : `${s.url}${s.url.includes("?") ? "&" : "?"}ref=site`);

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
    return `<a href="${esc(fromSite(s))}" rel="noopener" aria-label="rundata.re sur ${esc(s.nom)}">${logo}${logoOnly ? "" : esc(s.nom)}</a>`;
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
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"&&menu.open){menu.open=false;menu.querySelector("summary").focus()}});
menu.querySelectorAll('a[href^="#"]').forEach((a)=>a.addEventListener("click",()=>{menu.open=false}))}
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
    `<a href="${esc(fromSite(s))}" rel="noopener"${/^\p{L}$/u.test(label) ? ` aria-label="rundata.re sur ${esc(label)}"` : ""}>${esc(label)}</a>`;
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
function header(path: string, origin: string, u: Urgent, avis = true): string {
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
      ${avis ? `<p><a class="sheet-app sheet-avis" href="#avis">Donner un avis →</a></p>\n      ` : ""}${link(COMMUNES, "kcomm k-communes")}
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
${head.en ? header(head.path, origin, urgent(head), !head.shell && !head.sansAvis).replace("<header ", '<header lang="fr" ') : header(head.path, origin, urgent(head), !head.shell && !head.sansAvis)}
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
/** The vigilance's land zones, by Météo-France's ids (the line of the banner, the cards of /vigilance). */
export const LAND = ["VIGI974-11", "VIGI974-12", "VIGI974-13", "VIGI974-14", "VIGI974-15"];

/** The phases of the cyclone alert, shown on /cyclones with the prefecture's word (domains.ts). */
export const CYCLONE_SCALE = `<ul class="scale">
  <li><span class="vg vgpre">pré-alerte</span></li>
  <li><span class="vg vg3">orange</span></li>
  <li><span class="vg vg4">rouge</span></li>
  <li><span class="vg vg5">violette</span></li>
  <li><span class="vg vg0">sauvegarde</span></li>
</ul><p>${officielHtml(mf.OFFICIEL_CYCLONE)}</p>`;
