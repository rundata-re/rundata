/**
 * One page per category of the connector besides the weather: the volcano, the air, the electricity, the calendar and
 * the buses. Each shows what the tool of the same name answers right now, so that people, search engines and the
 * assistants reading a page see it, and points to the connector for the rest. Each also says it in a few words for
 * its tile on the home page.
 */
import * as transit from "../providers/transit.js";
import { LINE_NETWORKS, LINE_PATH, linePages } from "./ligne.js";
import { enLigne } from "./associations-drapeau.js";
import { TITRE } from "../tools/volcan-acces.js";
import { adresseCoupable, adresseTexte } from "./adresse.js";
import { cable } from "./commune-texte.js";
import { sectorsSaid } from "../providers/avis-eau.js";
import * as onf from "../providers/sentiers.js";
import { ENCLOS, volcanBanner } from "./volcan-alerte.js";
import type { Cached } from "../cache.js";
import { normalize } from "../places/resolve.js";
import * as traces from "../providers/traces.js";
import { SUJETS } from "../providers/actualites.js";
import { nextSlot, type CourantRow } from "../tools/courant.js";
import { MAIRIES } from "../providers/coupures-courant.js";
import { PERIMEE_MIN, perimeeTexte } from "../tools/electricite.js";
import { copieAncienne, copieAncienneCourte, VOIR_COURANT, VOIR_EAU } from "../tools/copie-ancienne.js";
import { casse } from "../tools/casse.js";
import { a, de, delai, enumeration, fr, heure, heuresDites, nombre } from "../tools/format.js";
import { climb, relief } from "../tools/sentiers.js";
import { COMMUNES as BIKE_COMMUNES } from "../tools/velos.js";
import { lienJeux } from "./transport-donnees.js";
import { OUVERT_ONF, ROAD_NEAR_M, type ActualitesAnswer, type AgendaAnswer, type Alerte, type BorneStation, type BornesAnswer, type BusData, type GareNow, type CoupuresAnswer, lusLe, type DaeAnswer, type EauAnswer, type ElectriciteAnswer, type Enclos, type HikeCard, type RandonneesAnswer, type SecheresseAnswer, type SentiersAnswer, type TraceAnswer, type TrailItem, type VeloStation, type VelosAnswer } from "./data.js";
import { ageMinutes, localTime } from "../geo.js";
import { agendasNonLus, mediasNonLus } from "../tools/injoignable.js";
import { FAST_KW, RECHARGEPEI } from "../tools/bornes.js";
import { AFTER_CUT, ARS_COUPURE, muetPour, NE_PAS_BOIRE, periodeCoupure } from "../tools/coupures.js";
import { SECTEURS as SECTEURS_RANDO, secteurNamed, type Secteur } from "../traces/secteurs.js";
import island from "../places/island.json" with { type: "json" };
import { esc, fenetre, hikesMap, islandMap, laterMap, type Marker, profile, traceMap, type ZoneLink } from "./map.js";
import { type Cle, COUNT_COLOR, legende, ROND } from "./carte-legende.js";
import { arretsAutour } from "./arrets-autour.js";
import { anneeSection, filieresSection, installationsLegend, installationsList, installationsMap, installationsReplay, productionChart } from "./electricite-carte.js";
import { cloudSeaLink, type Summit, weatherForTrace } from "./liens.js";
import { LINE as BAIGNADE_LINE } from "./baignade.js";
import { T as FERRY } from "../tools/ferries.js";
import { BUILT as DAE_BUILT, DAES } from "../providers/dae.js";
import { SANS_FORMATION as DAE_SANS_FORMATION, SE_FORMER as DAE_SE_FORMER } from "../tools/dae.js";
import DAE_LIST from "../dae/liste.json" with { type: "json" };
import { adressesCoupables, anchorId, ask, credits, dayMonth, DESCRIPTION_MAX, empty, FOLD_ROWS, folded, icon, ISLAND, layout, type Live, leAt, duAt, leJour, readAt, SITE } from "./pages.js";
import { pageOf, slugify } from "./places.js";
import { cycloneWater, distributeursLus } from "./eau-cyclone.js";
import { lues } from "../eau/distributeurs.js";
import { faqPage, texteStable, type Faq } from "./texte-stable.js";
import { noteBaignade, saisonSansPrelevement, sansPrelevement, tapNote } from "../tools/eau.js";
import { bathRead, keptBath, keptTap, silentBath, silentTap, tapRead, tooOld } from "../eau/ile.js";
import { aller, MOTS as ALLER_MOTS, permis, porte, type Porte, retire, SHEET as ALLER } from "./aller.js";
import { noteLa1ere } from "../tools/non-repris.js";
import { journeyForm, nowAsked } from "./itineraire.js";
import { script } from "./scripts-declares.js";

const FOURNAISE = { lon: 55.7083, lat: -21.2444, name: "Piton de la Fournaise" };
// What a search engine shows of a title.
const TITLE_MAX = 60;

/** `full` when it fits in what search engines show, else `short`. */
const describe = (full: string, short: string) => (full.length <= DESCRIPTION_MAX ? full : short);

// The descriptions with the figures of a copy, worded by marketing (24/11/2026) to fit in DESCRIPTION_MAX with the
// largest realistic figures (test/descriptions-longueur.test.ts): too long, a page would always say its short one.
export const velosDescription = (total: number) =>
  `Altervélo, vélos électriques en libre-service (974) : ${total} vélos libres en ce moment, et les places par station à Saint-Pierre, Saint-Louis et L'Étang-Salé.`;
export const eauDescription = (good: number, total: number) =>
  `Qualité de l'eau à La Réunion (974) : ${good} plages et bassins sur ${total} en bonne qualité au dernier prélèvement de l'ARS, et l'eau du robinet des 24 communes.`;
export const randonneesDescription = (routes: number, suivis: number, fermes: number) =>
  `Randonnée à La Réunion (974) : ${routes} itinéraires (GR R1, R2, R3, Piton des Neiges…), ${suivis} sentiers ONF avec trace GPX, dénivelé et état du jour : ${fermes} fermés.`;
/** `at`: « le 24/11 à 05:07 ». */
export const electriciteDescription = (at: string, mw: number, pct: number) =>
  `Électricité à La Réunion (974) ${at} : ${fr(Math.round(mw))} MW produits, dont ${fr(Math.round(pct))} % renouvelable. Filière par filière, et les heures où le réseau est chargé.`;
/** `when`: « état du 24/11 à 05:07 », or the time of the copy. */
export const bornesDescription = (when: string, libres: number, total: number) =>
  `Bornes de recharge à La Réunion (974), ${when} : ${libres} points libres sur ${total}, la recharge rapide et chaque station, commune par commune.`;
/** A trail's description while its copy is not read: its whole name, the words after it giving way to a long one. */
export const traceShort = (nom: string) =>
  [`${nom} (La Réunion, 974) : trace GPS à télécharger (GPX), longueur, dénivelé, profil et état du sentier d'après l'ONF.`,
    `${nom} (La Réunion, 974) : trace GPS (GPX), longueur, dénivelé, profil et état d'après l'ONF.`,
    `${nom} (974) : trace GPS (GPX), longueur, dénivelé, profil et état d'après l'ONF.`]
    .find((d) => d.length <= DESCRIPTION_MAX) ?? `${nom} (974) : trace GPS (GPX), longueur, dénivelé et état d'après l'ONF.`;

/** `parent`: the page between the home page and this one (« Clubs et associations » above its form). */
function crumbs(origin: string, name: string, path: string, parent?: { name: string; path: string }) {
  const trail = [{ name: SITE, path: "/" }, ...(parent ? [parent] : []), { name, path }];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: `${origin}${t.path}` })),
  };
}

function webPage(origin: string, path: string, title: string, description: string, data: Cached<unknown> | null) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    inLanguage: "fr-FR",
    url: `${origin}${path}`,
    ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
    about: ISLAND,
  };
}

const crumbBar = (label: string, parent?: { name: string; path: string }) =>
  `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li>${parent ? `<li><a href="${esc(parent.path)}">${esc(parent.name)}</a></li>` : ""}<li aria-current="page">${esc(label)}</li></ol></nav></div>`;

/** What to say while the data of a page is not there yet. */
const loading = (what: string) => `<p class="lead">${esc(what)} se charge : rechargez la page dans quelques secondes.</p>`;

const sourcesNote = (list: { source: string; licence: string; attribution: string }[], data: Cached<unknown>) =>
  `<p class="note">Mis à jour ${leAt(data.fetchedAt)}.</p><p class="sources">Sources : ${credits(list)}.</p>`;

/**
 * The agendas of the scheduled event not read lately (tools/agenda.ts, `non_lus`: « Ville de Saint-Leu : dernière
 * lecture le … »), as one line of the card « À savoir ».
 */
export const sansLecture = (nonLus: string[] | undefined): string[] =>
  nonLus?.length ? [`Agendas sans lecture récente : ${nonLus.map((x) => x.replace(/ : (?!.* : )/, ", ")).join("\u00a0; ")}. Leurs événements peuvent manquer ici.`] : [];

/**
 * What a list of events may lack, one formula for /evenements, its weekend and its concerts (marketing): the agendas
 * not read this time, silent or left to the next visit, then those of the scheduled event not read lately.
 */
export const agendaNotes = (data: Cached<AgendaAnswer> | null | undefined, now: Date): string[] => [
  ...(data?.value.indisponible?.length ? [agendasNonLus(data.value.indisponible, data.value.remises, localTime(data.fetchedAt), now)] : []),
  ...sansLecture(data?.value.non_lus),
];

const warnings = (list: string[]) =>
  list.length ? `<div class="card warn">${icon("alert")}<h3>À savoir</h3><ul class="plain">${list.map((w) => `<li>${adresseTexte(w)}</li>`).join("")}</ul></div>` : "";

/**
 * The notices of cuts the scheduled event has not read again for a while (tools/copie-ancienne.ts), said before the
 * rest: `voir`, the « Voir … » of the page, its links given (HTML). The card has no title: its sign sits beside the
 * sentence (« enligne », pages.ts), not alone on a line above it as over a title.
 */
export const copieBandeau = (texte: string | undefined, voir = "") =>
  texte ? `<div class="card warn enligne">${icon("alert")}<p>${esc(texte)}${voir ? ` ${voir}` : ""}</p></div>` : "";

/**
 * A tool's name or a layer's code, escaped, that may be cut after each « . » and « _ » on a narrow screen
 * (annuaire_services_ / publics, ind_atmo_ / 2021) rather than in the middle of a word, by overflow-wrap:anywhere
 * (pages.ts): its « _ » through soulignesCoupables(), in a span without hyphenation, as every identifier joined by
 * « _ ». <wbr> holds no character, so a copy of the text is the text. Never in a link: Chrome names it with a space for
 * each <wbr> (« data. gouv. fr »). A declaration, not a const: pages.ts and home.ts call it while the modules load.
 */
export function coupable(s: string): string {
  return soulignesCoupables(esc(s)).replaceAll(".", ".<wbr>");
}

/**
 * A name with a « . » or a capital inside (Sensor.Community, OpenAgenda), in escaped HTML: Chrome's French hyphenation
 * never cuts it after its « . » and finds no place in « OpenAgenda », so that on a narrow line the name is cut where the
 * room ends (« Sensor.Comm|unity », « OpenAgend|a » at 200 %). The rule of
 * coupable(): a <wbr> after the « . » and before the inner capital, in the text between the tags only. On a link's text
 * only through lienNom() (Chrome names a link with a space for each <wbr>), and never in an attribute or a tool's answer.
 * A declaration, not a const: lienNom() calls it while the modules load (eau-cyclone.ts builds its note then).
 */
export function nomsCoupables(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((x, i) => (i % 2 ? x : x.replaceAll(/(\p{Ll}\.?)(?=\p{Lu}\p{Ll})/gu, "$1<wbr>")))
    .join("");
}

/**
 * An identifier from a source, its parts joined by « _ » (« 2026_PORT_05 », « DGFIP4_Trésorerie », « date_debut »), in
 * escaped HTML: Chrome and Safari see one word in it and, past its line, cut it between two letters (« 2026_POR|T_05 »,
 * « date_d|ebut » at 160 px, Safari's page zoom at 200 % on a 320 px screen). A <wbr> after each « _ » between two
 * letters or digits, the one place where it may go to the next line, and no hyphen in it (.ident, pages.ts). In the text
 * between the tags only, never in an attribute; on a link's text through lienNom() (Chrome names a link with a space for
 * each <wbr>). A word split from its spaces, so that no pattern runs over the whole text. A declaration, as
 * nomsCoupables(): lienNom() calls it while the modules load.
 */
export function soulignesCoupables(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((x, i) => (i % 2 ? x : x.split(/([\s\u00a0]+)/).map((w, j) => (j % 2 || !/[\p{L}\p{N}]_[\p{L}\p{N}]/u.test(w) ? w
      : `<span class="ident">${w.replaceAll(/(?<=[\p{L}\p{N}])_(?=[\p{L}\p{N}])/gu, "_<wbr>")}</span>`)).join("")))
    .join("");
}

/**
 * A link whose text holds such a name (« le site de Sensor.Community ») or an address (« sa fiche sur data.gouv.fr »,
 * « monenfant.fr », « contact@rundata.re »): the name may go to the next line where nomsCoupables() puts its <wbr>, the
 * address after each of its « . » and « @ », rather than one or two letters before its end (« data.gou|v.fr »,
 * « monenfant.f|r » at 320 px). The link keeps its whole text as its name in aria-label, as lienAdresse() does (a <wbr>
 * would make Chrome name it « Sensor. Community », « data. gouv. fr »). The name is the visible text, so it holds it.
 * A text with neither is written as it is, without aria-label. `attrs`: more attributes, each with its leading space.
 */
export function lienNom(href: string, text: string, attrs = ""): string {
  const coupe = soulignesCoupables(nomsCoupables(adresseCoupable(text)));
  return `<a href="${esc(href)}"${attrs}${coupe === esc(text) ? "" : ` aria-label="${esc(text)}"`}>${coupe}</a>`;
}

/** The connector, at the end of every domain page, the tool's name coupable(). */
const connectorCta = (tool: string, what: string) => `<section aria-labelledby="h-ia">
  <div class="card cta"><h2 id="h-ia">Votre IA, branchée sur ${esc(what)}</h2>
  <p>Avec le connecteur, votre assistant lit lui-même ces données (outil <code>${coupable(tool)}</code>), et toutes les autres de l'île : sorties, randos, météo, routes, volcan, air, électricité, bus, services publics, terrain. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p></div>
</section>`;

/**
 * The note under the water notices (/coupures-eau, /coupures-eau/x): the tool's, with a link to /eau in place of the
 * name of the tool for the tap water.
 */
/** /coupures-eau's stable text (marketing, 14/11/2026): `lus`, how many distributors' notices are read. */
const COUPURES_LIRE = (lus: number) => `<p>En haut, les avis en cours ou à venir, du plus récent au plus ancien. Chaque avis porte le nom du distributeur, la commune, l'heure de publication et le lien vers l'avis complet. On en distingue deux sortes :</p>
<ul class="plain"><li>les <b>coupures et travaux</b> : l'eau est interrompue, avec l'heure de retour annoncée par le distributeur ;</li>
<li>l'<b>eau à ne pas boire</b> : l'eau coule, mais le distributeur demande de ne pas la boire, souvent après de fortes pluies ou un incident à l'usine de traitement.</li></ul>
<p>Les avis de ${lus} distributeurs sont relus au moins toutes les 30 minutes. Chaque avis est repris tel qu'il est publié, avec un court extrait. Seul l'avis complet, sur le site du distributeur, fait foi. Quand un avis n'est publié qu'en image ou en PDF, rundata.re ne peut pas le lire : la page donne alors seulement son lien.</p>
<p><b>Ce que la page réunit et qu'aucun distributeur ne montre seul :</b></p>
<ul class="plain"><li>les avis de tous les distributeurs lus, sur une seule page, alors que chacun ne publie que pour ses communes ;</li>
<li>pour chaque commune : le niveau de sécheresse fixé par le préfet, le résultat des analyses de l'eau du robinet de l'ARS et les consignes du dispositif ORSEC après un cyclone.</li></ul>`;

const COUPURES_FAQ: Faq[] = [
  { q: "Aucun avis pour ma commune : l'eau n'est donc pas coupée ?", a: "Pas forcément. « Aucun avis en cours » veut dire que le site du distributeur a été lu et qu'il n'annonce rien. Une coupure qu'il n'a pas publiée, ou une fuite chez vous, n'apparaît pas ici. Si votre commune est dans la liste « Avis non lus par rundata.re », adressez-vous à la mairie ou au distributeur." },
  // No figure of our own here (how long, how many minutes): the distributor's notice says what to do.
  { q: "L'eau revient : je peux la boire tout de suite ?", a: "Suivez les consignes de l'avis du distributeur, jusqu'à son avis suivant." },
  { q: "Quelle différence avec les restrictions de sécheresse ?", a: `Une coupure ou un avis « ne pas boire » vient du distributeur et concerne un secteur précis. Les restrictions de sécheresse viennent d'un arrêté du préfet : elles limitent certains usages, comme l'arrosage ou le lavage des voitures, dans toute la commune. Elles sont détaillées sur <a href="/secheresse">la page Sécheresse</a>.` },
  { q: "Qui distribue l'eau chez moi ?", a: "La page de chaque commune nomme son distributeur, d'après le contrôle sanitaire de l'ARS. C'est lui qu'il faut appeler pour une fuite ou une coupure." },
];

/**
 * The coverage line of /coupures-eau without its list of communes, which the page writes once, at its foot
 * (cycloneWater(), « Avis lus : … ») : the number of communes, and a link to that list.
 */
export function couvertureCourte(couverture: string): string {
  const read = lues();
  const list = enumeration(read);
  if (!couverture.includes(list)) return esc(couverture);
  const [before, after] = couverture.split(list);
  return `${esc(before)}<a href="#communes-lues">${read.length} communes</a>${esc(after)}`;
}

/** The ARS's advice after a cut, in full: on /coupures-eau always (the target of afterCutShort's link), on a commune's page
 * while a notice is in progress there. */
export const afterCutNote = `<p class="note" id="ars-coupure">${esc(AFTER_CUT)} Source\u00a0: <a href="${esc(ARS_COUPURE)}" rel="noopener">le dépliant «\u00a0Coupure d'eau\u00a0» de l'ARS La Réunion</a>. La conformité de l'eau du robinet, d'après les analyses de l'ARS : voir <a href="/eau">la qualité de l'eau</a>.</p>`;

/**
 * A commune's page with no notice in progress: the ARS's advice in one sentence, and the full advice and the cyclone
 * one (ORSEC) on the island's page. Worded by marketing (20/11): 24 pages carried the same 183 words.
 */
export const afterCutShort = `<p class="note">Après une coupure, l'eau qui revient au robinet peut être impropre à la consommation pendant plusieurs heures, d'après l'ARS La Réunion\u00a0: ne la buvez pas et ne cuisinez pas avec. Quand un avis dit de ne pas boire l'eau, suivez ses consignes. <a href="/coupures-eau#ars-coupure">Les consignes de l'ARS, et celles d'après un cyclone →</a></p>`;

/**
 * The connector on the water's pages (/coupures-eau, /coupures-eau/x, /eau): a question to ask, without the tool's name
 * (marketing, 06/11/2026).
 */
export const connectorAsk = (what: string, commune: string) => `<section aria-labelledby="h-ia">
  <div class="card cta"><h2 id="h-ia">Votre IA, branchée sur ${esc(what)}</h2>
  <p>Demandez aussi à votre IA, avec le <a href="/mcp">connecteur rundata.re</a>\u00a0: «\u00a0L'eau du robinet est-elle bonne ${esc(a(commune))}\u00a0?\u00a0»</p></div>
</section>`;

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" });

// The Enclos as the official texts say it (marketing): the prefecture's release in its title's own words, « 20/10 » its
// day, or closed by the level of an alert whose title says nothing of it; in vigilance from a release, the plan's rule.
// Never pitonlive's (25/10/2026).
const dd = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
/**
 * The short form, on the home page's tile and the card of /trafic, never « ouvert » (marketing): forbidden by the
 * release, its words, the plan's rule in vigilance, or to check.
 */
const enclosShort = (x: Enclos | undefined): { valeur: string; source: string } =>
  x?.communique?.mots && !/ferm|interdi/i.test(x.communique.mots)
    ? { valeur: `« ${x.communique.mots} »`, source: `préfecture, ${dd(x.communique.jour)}` }
    : x?.communique
      ? { valeur: "Interdit", source: `préfecture, ${dd(x.communique.jour)}` }
      : x?.ovpf
        ? { valeur: "Interdit", source: `plan ORSEC en ${x.ovpf.niveau.toLowerCase()}, niveau publié par l'OVPF` }
        : x?.vigilance
          ? { valeur: "Sentiers balisés seulement", source: "plan ORSEC, en vigilance" }
          : { valeur: "À vérifier", source: "reunion.gouv.fr" };

// The map's commune names (« L'Étang-Salé ») by their spelling in the ATMO index (« L'Etang-Salé »).
const MAP_NAME = new Map(island.paths.map((p: { nom: string }) => [normalize(p.nom), p.nom]));
// ---------------------------------------------------------------- électricité

/** A site that did not answer (tools/injoignable.ts), « son site » linked to it. */
export const silentText = (s: { texte: string; site: string }) => esc(s.texte).replace(/voir son site\.$/, `voir <a href="${esc(s.site)}" rel="noopener">son site</a>.`);
export const silentItem = (s: { texte: string; site: string }) => `<li><span class="note">${silentText(s)}</span></li>`;

/**
 * One notice of power cut, its link after it. A PDF letter's sentence ends on its link (marketing's words): « l'avis
 * publié par la mairie (PDF) → », « dans l'avis (PDF) → », a target tall enough for a finger.
 */
export function courantItem(x: Pick<CourantRow, "texte" | "lien" | "nature" | "pdf">): string {
  const li = x.nature === "en cours" ? '<li class="warn">' : "<li>";
  const end = x.pdf ? /(l'avis publié par la mairie|dans l'avis)$/.exec(x.texte) : null;
  if (!end) return `${li}${esc(x.texte)} <a href="${esc(x.lien)}" rel="noopener">l'avis →</a></li>`;
  return `${li}${esc(x.texte.slice(0, end.index))}<a class="tap" href="${esc(x.lien)}" rel="noopener">${esc(end[1])} (PDF) →</a></li>`;
}

/** EDF's words that a resident does not know, said once on /electricite (marketing, UX review of 04/11/2026). */
const FILIERES_DITES: Record<string, string> = {
  bioliquide: "bioliquide (combustible d'origine végétale)",
  "turbines à combustion": "turbines à combustion (centrales de pointe, démarrées quand la demande monte)",
};
/** « optimal (le réseau électrique a de la marge) »; EDF's other states keep its words. */
export const signalDit = (signal: string) => (signal.toLowerCase() === "optimal" ? "optimal (le réseau électrique a de la marge)" : signal.toLowerCase());

/** « le 06/11 de 14 h à 15 h », the hour of EDF's signal from « 06/11 14:00 », « minuit » never « 0 h »; a copy without
 * it, « cette heure ». */
export const signalHeure = (de?: string) => {
  const m = de && /^(\d\d\/\d\d) (\d\d):00$/.exec(de);
  const h = (n: number) => (n % 24 === 0 ? "minuit" : `${n}\u00a0h`);
  return m ? `le ${m[1]} de ${h(+m[2])} à ${h(+m[2] + 1)}` : "cette heure";
};

export function electricitePage(origin: string, data: Cached<ElectriciteAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const p = d?.production;
  const m = d?.meteo_electricite;
  const url = `${origin}/electricite`;

  // The line's time and its age at this view, not at the copy's build: a copy kept while EDF does not answer grows old
  // too. Past PERIMEE_MIN, the tool's sentence above the figure, a neutral note (red is for the alerts), and the pill no
  // longer says « en direct », nor its live dot.
  const mesure = p?.heure_mesure.replace(" heure de La Réunion", "");
  const age = p ? ageMinutes(new Date(data!.fetchedAt.getTime() - p.age_min * 60_000), now) : 0;
  const stale = !!p && age > PERIMEE_MIN;
  const perimee = stale ? `<p class="note">${esc(perimeeTexte(mesure!, age))}</p>` : "";
  // Its time with its day, never « en ce moment »: a copy kept by a search engine said it beside yesterday's value
  // (05/11/2026).
  const status = !d
    ? loading("La production d'électricité")
    : p
      ? `${perimee}<div class="now"><span class="big">${fr(Math.round(p.renouvelable_pct))} %</span><p>de l'électricité de l'île venait de sources <b>renouvelables</b> ${esc(leJour(mesure!))}, sur <b>${esc(fr(Math.round(p.total_mw)))} MW</b> produits.</p></div>` +
        (m?.maintenant ? `<p class="lead">Signal d'EDF pour ${esc(signalHeure(m.maintenant.de))} : <b>${esc(signalDit(m.maintenant.signal))}</b>${m.mis_a_jour ? ` (annoncé par EDF le ${esc(m.mis_a_jour.replace(" ", " à "))})` : ""}.</p>` : "")
      : `<p class="lead">${esc(d.resume)}</p>`;

  const bars = p
    ? `<ul class="bars">${p.parts.map((x) => `<li><span>${esc(FILIERES_DITES[x.filiere] ?? x.filiere)}</span> <b>${esc(fr(x.part_pct))} %</b><i class="${x.renouvelable ? "ren" : ""}" style="width:${Math.max(1, x.part_pct)}%"></i></li>`).join("")}</ul>` +
      `<p class="note">En vert, les filières renouvelables. ${esc(p.statut[0].toUpperCase() + p.statut.slice(1))}.</p>`
    : "";

  const tension = m
    ? `<div class="card">${icon("bolt")}<h3>Quand éviter les gros usages</h3>` +
      (m.periodes_de_tension.length
        ? `<ul class="plain">${m.periodes_de_tension.map((t) => `<li><b>${esc(t.quand)}</b> : ${esc(t.signal)}${t.recharge_conseillee_pct != null ? ` (recharge d'un véhicule à ${t.recharge_conseillee_pct} %)` : ""}</li>`).join("")}</ul>`
        : `<p>Pas de période de tension prévue${m.jusqu_au ? ` d'ici le ${esc(m.jusqu_au)}` : ""}.</p>`) +
      `<p class="note">${esc(m.explication)}</p></div>`
    : "";

  // The cuts the mairies relay, in marketing's words (tools/courant.ts); never « pas de coupure ».
  const c = d?.coupures_annoncees;
  const cuts = c
    ? `<section id="coupures" aria-labelledby="h-coupures">
  <div class="sec-h"><h2 id="h-coupures">Coupures d'électricité annoncées par les mairies</h2>
  ${c.a_savoir ? `<p>${esc(c.a_savoir)}</p>` : ""}${c.depannage ? `<p><b>${esc(c.depannage)}</b></p>` : ""}</div>
  ${c.lu_le ? copieBandeau(copieAncienne("courant", new Date(c.lu_le), now, "page"), esc(VOIR_COURANT)) : ""}
  ${(c.injoignable ?? []).map((s) => `<p class="note">${silentText(s)}</p>`).join("")}
  ${c.avis?.length
    ? `<div class="card"><ul class="plain">${c.avis.map(courantItem).join("")}</ul></div>`
    : c.injoignable?.length ? "" : `<p class="card">${esc(c.indisponible ?? "Aucun avis relayé par les mairies suivies.")}</p>`}
</section>`
    : "";

  const title = "Électricité en direct : part renouvelable · La Réunion (974)";
  const description = p
    ? describe(electriciteDescription(leJour(p.heure_mesure), p.total_mw, p.renouvelable_pct),
        `Électricité à La Réunion (974) : ${fr(Math.round(p.renouvelable_pct))} % renouvelable en ce moment. Filière par filière, et les heures où le réseau est chargé.`)
    : "Électricité à La Réunion (974) en direct : d'où vient le courant, la part renouvelable et les heures où le réseau est chargé.";

  const band = `${crumbBar("Électricité")}
<div class="wrap intro">
  <div class="pitch">
    ${stale ? `<p class="pill">Dernière mesure lue chez EDF</p>` : `<p class="pill"><span class="dot"></span>Production en direct</p>`}
    <h1>Électricité <span class="n974">974</span></h1>
    ${status}
    ${ask(`Kouran la koupé dann mon kartié ? Gèt si ${url} é di amwin, é d'ousa i sort lo kouran astèr.`,
      `D'où vient l'électricité de La Réunion en ce moment ? Lis ${url} et dis-moi la part renouvelable.`)}
  </div>
  ${p ? `<figure class="card mapcard"><h2 style="color:var(--on-night)">Filière par filière</h2>${bars}</figure>` : ""}
</div>`;

  // The 24 hours (the page's copy, journee) and the map of the power installed (electricite-carte.ts), its replay on them.
  const journee = d?.journee
    ? `<section aria-labelledby="h-journee">
  <div class="sec-h"><p class="eyebrow">La journée</p><h2 id="h-journee">La production des dernières 24\u00a0h</h2></div>
  ${productionChart(d.journee)}
</section>`
    : "";
  const centrales = `<section aria-labelledby="h-centrales">
  <div class="sec-h"><p class="eyebrow">Les centrales</p><h2 id="h-centrales">Ce qui peut produire, commune par commune</h2></div>
  <figure class="card mapcard ipc"><div class="ipm">${laterMap(installationsMap())}</div><figcaption class="note">${d?.journee ? installationsReplay(d.journee) : ""}${installationsLegend()}${folded(true, `<h3>Le détail par commune</h3>`, installationsList())}</figcaption></figure>
</section>`;

  const body = `${journee}
${centrales}
${filieresSection(d?.journee)}
${d?.journee ? anneeSection() : ""}
<section aria-labelledby="h-reseau">
  <div class="sec-h"><p class="eyebrow">Le réseau</p><h2 id="h-reseau">Une île qui produit toute son électricité</h2>
  <p>La Réunion n'est reliée à aucun autre réseau : chaque kilowatt consommé est produit sur l'île, au moment même. Le soir, quand tout le monde rentre, le réseau est le plus chargé.</p></div>
  ${d ? `<div class="two">${tension}${warnings(d.avertissements)}</div>${data ? sourcesNote(d.sources, data) : ""}` : `<p class="card">Les données d'EDF se chargent : rechargez la page dans quelques secondes.</p>`}
</section>
${cuts}
${connectorCta("electricite", "l'électricité de l'île")}`;

  return layout(origin, { title, description, path: "/electricite", jsonld: [crumbs(origin, "Électricité", "/electricite"), webPage(origin, "/electricite", title, description, data)], alerte }, band, body);
}

export function electriciteLive(data: Cached<ElectriciteAnswer> | null, now = new Date()): Live | undefined {
  if (!data) return undefined;
  const p = data.value.production;
  if (!p) return empty(`Production d'EDF absente de la lecture ${readAt(data.fetchedAt, now).de}.`);
  const signal = data!.value.meteo_electricite?.maintenant?.signal;
  // EDF's terms: its name and the dataset's update beside the signal, an announcement for this hour.
  const jeu = data!.value.meteo_electricite?.mis_a_jour;
  return {
    valeur: `${fr(Math.round(p.renouvelable_pct))}\u202f% renouvelable`,
    detail: `${esc(fr(Math.round(p.total_mw)))} MW produits ${esc(leJour(p.heure_mesure))}${signal ? ` · signal EDF ${esc(signal.toLowerCase())}${jeu ? ` (annoncé le ${esc(jeu.replace(" ", " à "))})` : ""}` : ""}`,
    // Never cut before the date EDF's terms ask for (three lines at 390 px are not enough for it).
    ...(signal && jeu && { entier: true }),
  };
}

/**
 * The commune's Électricité tile: a cut its mairie announces today or later first, its day and hours, the notice's link
 * under it; the island's renewable share after, smaller (marketing, 21/11/2026). None announced: the island's tile, never
 * « pas de coupure ».
 */
export function electriciteCommune(data: Cached<ElectriciteAnswer> | null, commune: string, now = new Date()): { live?: Live; more?: string; foot?: string } {
  const island = electriciteLive(data, now);
  const cut = data?.value.coupures_annoncees?.avis?.find((x) => x.commune === commune && x.nature);
  if (!cut) return { live: island };
  const next = nextSlot(cut, now);
  const others = next?.autres ? `, et ${next.autres === 1 ? "1 autre plage" : `${next.autres} autres plages`} dans l'avis` : "";
  // A cut the mairie says under way: « d'après la mairie, avis du 21/11 à 08:53 » (marketing, 21/11/2026).
  const published = cut.publie_le ? `, avis du ${cut.publie_le.replace(" ", " à ")}` : "";
  const when = next && cut.nature !== "en cours" ? `${next.quand}, d'après la mairie${cut.pdf ? ", heures et secteurs dans l'avis" : others}` : `d'après la mairie${published}`;
  // « 82,2 % renouvelable sur l'île, le 20/11 à 17:10 »: the hour of EDF's figure, its day when not today's.
  const p = data!.value.production;
  const at = p?.heure_mesure.replace(" heure de La Réunion", "");
  const today = localTime(now).split(" ")[0];
  const share = p && at
    ? `<p class="td all note">${esc(`${fr(p.renouvelable_pct)}\u202f% renouvelable sur l'île, ${at.startsWith(`${today} `) ? `à ${at.slice(today.length + 1)}` : leJour(at)}`)}</p>`
    : "";
  // The notices not read again for a while: said under the cut in the short form of the tile, the mairie's site linked
  // above the tile's own link (.dessus), so that a touch opens it (marketing, 23/11/2026).
  const lu = data!.value.coupures_annoncees?.lu_le;
  const ancienne = lu ? copieAncienneCourte("courant", new Date(lu), now) : undefined;
  const site = MAIRIES.find((m) => m.commune === commune)?.site;
  const old = ancienne
    ? `<p class="td all note">${esc(ancienne)} À vérifier sur ${site ? `<a class="dessus" href="${esc(site)}" rel="noopener">le site de la mairie</a>` : "le site de la mairie"}.</p>`
    : "";
  return {
    // The notice's word, « programmée »; « en cours » only when the mairie's notice says so, never from the hour.
    live: { valeur: cut.nature === "en cours" ? "Coupure en cours" : "Coupure programmée", detail: esc(when), entier: true },
    ...(share || old ? { more: old + share } : {}),
    foot: `<a href="${esc(cut.lien)}" rel="noopener">L'avis de la mairie${cut.pdf ? " (PDF)" : ""} →</a>`,
  };
}

// ---------------------------------------------------------------- bus

/** A time in a list of departures, with its minutes everywhere: « demain 5\u00a0h » → « demain 05:00 », beside « demain 05:15 ». */
export const listClock = (heure: string) => heure.replace(/\b(\d{1,2})[\u00a0 ]h$/, (_, h: string) => `${h.padStart(2, "0")}:00`);

export const waitText = (min: number, heure: string) =>
  heure.startsWith("demain") ? heure : min < 1 ? "maintenant" : min < 90 ? delai(min) : `à ${heure}`;

type Row = BusData["gares"][number]["departs"][number];

const LOCAL_MS = 4 * 3600_000;
const DAY_MS = 86_400_000;

/**
 * A copy's time (« 04:30 », « 5\u00a0h », or « demain 04:30 » when the copy was built before midnight) as said at the
 * view, in the brand's form: « demain » only when it falls on the day after this one at La Réunion. The clock is taken
 * on the day that puts it closest to `near`, the moment of the departure or of the copy. A copy written before the
 * brand's form (« 4h30 ») reads the same.
 */
export function saidNow(said: string, near: number, now: Date): string {
  const t = /^(?:demain )?(\d{1,2})(?::(\d\d)|[\u00a0 ]?h ?(\d\d)?)$/.exec(said);
  if (!t) return said;
  const [h, m] = [Number(t[1]), Number(t[2] ?? t[3] ?? 0)];
  const clock = heure(h * 60 + m);
  const local = near + LOCAL_MS;
  let at = local - (((local % DAY_MS) + DAY_MS) % DAY_MS) + (h * 60 + m) * 60_000;
  if (at - local > DAY_MS / 2) at -= DAY_MS;
  else if (local - at > DAY_MS / 2) at += DAY_MS;
  return Math.floor(at / DAY_MS) > Math.floor((now.getTime() + LOCAL_MS) / DAY_MS) ? `demain ${clock}` : clock;
}

/** « à 04:30 », « demain à 04:30 ». */
export const atDay = (heure: string) => (heure.startsWith("demain ") ? `demain à ${heure.slice("demain ".length)}` : `à ${heure}`);

/** The departures of a copy still to come: their wait counted again from now, their time (the announced one first) said as of now. */
export function stillToCome(list: Row[], fetchedAt: Date, now: Date): { x: Row; at: number; min: number; heure: string }[] {
  return list
    .map((x) => {
      const at = fetchedAt.getTime() + x.dans_min * 60_000;
      return { x, at, min: Math.round((at - now.getTime()) / 60_000), heure: saidNow(x.heure_annoncee ?? x.heure, at, now) };
    })
    .filter(({ min }) => min >= 0);
}

/**
 * Whether a copy of /bus, `ageMs` old, has outrun what it knows of a station (`complet_min`): a list emptied by time is
 * then not « no bus ». A copy of 19:45 seen at 01:37 (31/10/2026) said « Pas de départ prévu » at four stations, their
 * 3 hours long gone, while two that had looked 20 hours ahead gave the morning's. Such a copy is refreshed before it
 * is shown (web/site.ts); one served all the same says it is loading, as does a commune's bus tile (web/commune.ts).
 * A copy without the field (built before it) is taken as knowing.
 */
export const busOutran = (g: Pick<GareNow, "complet_min">, ageMs: number) => g.complet_min != null && ageMs >= g.complet_min * 60_000;

/** What the real-time feed says of a departure, HTML: « +5 min », « à l'heure », « 1 min d'avance », « ne passe pas à cet arrêt ». */
export function liveText(x: Row): string {
  if (x.temps_reel) return ` <b class="rt">${esc(x.temps_reel)}</b>`;
  if (x.retard_min === undefined) return "";
  const m = x.retard_min;
  return ` <b class="rt" title="Heure annoncée en direct par le réseau">${m === 0 ? "à l'heure" : m > 0 ? `+${fr(m)} min` : `${fr(-m)} min d'avance`}</b>`;
}

/**
 * One departure as a row: line, direction, wait (from the real-time feed when there is one). Its hour (`heure`, « 16:12 »)
 * read after the direction by screen readers: the links of a station's list often go the same way (« vers St-Denis »).
 */
/**
 * A line's name as a screen reader says it: a line of one letter (« T ») is read « T majuscule » on its own, so it is
 * said « ligne T »; « E2 » or « 32 » read as they are.
 */
export const ligneDite = (ligne: string) => (/^\p{L}$/u.test(ligne) ? `<span class="sr">ligne </span>${esc(ligne)}` : esc(ligne));

export const departureLi = (x: Row, wait: string, heure?: string) =>
  `<li><b>${ligneDite(x.ligne)}</b> <span>${x.trajet ? `<a href="${esc(x.trajet)}">vers ${esc(casse(x.direction))}${heure && /^\d\d:\d\d$/.test(heure) ? `<span class="sr">, départ à ${heure}</span>` : ""}</a>` : `vers ${esc(casse(x.direction))}`} <span class="note">(${esc(x.reseau)})</span></span> <span class="note">${esc(wait)}${liveText(x)}</span></li>`;

export const STOP_PATH = "/bus/arret";

/** The search for a stop (/bus/arret?q=): a form, which needs no script. */
export const stopSearch = (q = "") =>
  `<form class="card filter" role="search" action="${STOP_PATH}" method="get"><label class="q">Arrêt de bus <input name="q" type="search" placeholder="Mairie, Le Tampon" autocomplete="off" required value="${esc(q)}"></label><button class="btn sun" type="submit">Chercher</button></form>`;

/** The traffic alerts of the networks with a real-time feed. */
export const alertList = (list: { reseau: string; lignes?: string[]; titre: string; detail?: string }[]) =>
  `<ul class="plain">${list.map((a) => `<li><b>${esc(a.reseau)}${a.lignes ? `, ligne ${esc(a.lignes.join(", "))}` : ""}</b> : ${esc(a.titre)}${a.detail && a.detail !== a.titre ? `<p class="note">${esc(a.detail)}</p>` : ""}</li>`).join("")}</ul>`;

export const HORAIRES_CHARGENT = "Les horaires se chargent\u00a0: rechargez la page dans quelques secondes.";
/**
 * The mark of a block waiting for its refresh in a page that has its data: a station's departures past what its copy
 * knows (`busOutran`). Its « se chargent » does not make the whole page « loading » for a robot (robots.ts
 * `enChargement`): on 19/11/2026 at 17:33, Google's URL inspection got a 503 for /bus, its copy 70 minutes old served,
 * one station's list run out; 24 of the 127 robots' 503 of 17 to 19/11 were that.
 */
export const ATTENTE = "<span data-attente>";
/** `html` marked as a block waiting for its refresh (`ATTENTE`); `html` holds no span. */
export const enAttente = (html: string) => `${ATTENTE}${html}</span>`;
/** The station's departures past what the copy knows, marked (`ATTENTE`). */
export const HORAIRES_EN_ATTENTE = enAttente(HORAIRES_CHARGENT);

/**
 * /bus's stable text (marketing, 14/11/2026): `reseaux` and `lignes` from the timetables, the sentence that says them
 * left out without them. The networks one by one are in the band's list.
 */
// The station of Saint-Pierre in the example: Car Jaune and Alternéo at « Gare de Saint-Pierre », CarSud at « Gare
// Routière de St Pierre », in the networks' GTFS (test/texte-stable.test.ts checks it).
const busLire = (reseaux?: number, lignes?: number) =>
  (reseaux && lignes ? `<p>La page réunit ${reseaux} réseaux de bus et le téléphérique Papang, soit ${fr(lignes)} lignes. ` : "<p>") +
  `Elle part toujours d'un lieu : une gare routière, un arrêt ou un trajet. Pour chaque départ, elle donne la ligne, la direction, le réseau et l'heure.</p>
<ul class="plain"><li>Quand le réseau publie ses retards en direct, l'heure en tient compte : rundata.re les relit chaque minute.</li>
<li>Sinon, c'est l'horaire théorique publié par le réseau, sans les retards ni les déviations.</li>
<li>L'info trafic (arrêts non desservis, déviations, travaux) est reprise telle que les réseaux la publient.</li></ul>
<p><b>Qui dessert quoi :</b></p>
<ul class="plain"><li>Le Car Jaune, réseau de la Région, relie les communes entre elles, tout autour de l'île.</li>
<li>Les autres réseaux circulent dans les communes de leur intercommunalité.</li></ul>
<p><b>Ce que la page réunit et qu'aucun réseau ne montre seul :</b> les départs de tous les réseaux dans une même gare. À la gare de Saint-Pierre, par exemple, on voit ensemble le Car Jaune, Alternéo et CarSud. On peut aussi préparer un trajet qui passe d'un réseau à l'autre. Chaque réseau, lui, n'affiche que ses propres lignes.</p>`;

/** /bus's questions, the boat to Mauritius as the page has said it since 24/10 (tools/ferries.ts). */
const busFaq = (): Faq[] => [
  { q: "Les heures affichées tiennent-elles compte des retards ?", a: "Oui, quand le réseau publie ses retards en direct. Sinon, l'heure affichée est l'horaire théorique du réseau : un bus peut passer plus tôt ou plus tard." },
  { q: "Quel bus prendre pour aller d'une commune à une autre ?", a: "Entre deux communes éloignées, c'est en général le Car Jaune. Dans votre commune, c'est le réseau de votre intercommunalité. Le formulaire « Préparer un trajet » cherche dans tous les réseaux à la fois." },
  { q: "Comment trouver mon arrêt ?", a: "Tapez son nom dans la recherche d'arrêt. Chaque arrêt a sa page, avec les lignes qui y passent et les prochains départs." },
  { q: FERRY.h3, a: esc(FERRY.page), note: esc(FERRY.verifie), id: "h-bateau" },
];

/**
 * The lines that have their page (web/ligne.ts), network by network: each with its long name, leading to its stops and
 * its day's departures (24/11/2026).
 */
export function linesList(): string {
  const all = [...linePages().values()];
  return `<section aria-labelledby="h-lignes"><div class="sec-h"><h2 id="h-lignes">Les lignes</h2>
  <p>Les arrêts de chaque ligne dans l'ordre, dans chaque sens, et ses départs du jour.</p></div>
  ${LINE_NETWORKS.map((net) => {
    const mine = all.filter((p) => p.reseau === net);
    return `<details class="card lignes"><summary><h3>${esc(transit.NETWORKS[net]?.nom ?? net)}</h3> <span class="note">${mine.length} lignes</span></summary>` +
      `<ul class="rows cols lieux">${mine.map((p) => `<li><a href="${LINE_PATH}/${esc(p.slug)}">Ligne ${esc(p.ligne)}</a>${p.nom ? `<small>${esc(p.nom)}</small>` : ""}</li>`).join("")}</ul></details>`;
  }).join("")}
</section>`;
}

export function busPage(origin: string, data: Cached<BusData> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/bus`;
  const lines = d?.reseaux.reduce((n, r) => n + r.lignes, 0) ?? 0;
  // The bus networks served, without the cable car the sentence names after them (« 7 réseaux de bus et le téléphérique »
  // counted it among them before, 24/11/2026).
  const bus = d?.reseaux.filter((r) => !cable(r.nom)).length ?? 0;

  const status = !d
    ? `<p class="lead">${HORAIRES_CHARGENT}</p>`
    : `<div class="now"><span class="big">${bus}</span><p>réseaux de bus et le téléphérique de Saint-Denis : <b>${esc(fr(lines))} lignes</b>, de Car Jaune qui fait le tour de l'île aux bus de chaque commune.</p></div>`;

  const networks = d
    ? `<ul class="plain">${d.reseaux.map((r) => `<li><b>${esc(r.nom)}</b> : ${esc(fr(r.lignes))} ligne${r.lignes > 1 ? "s" : ""} <span class="note">· ${esc(r.exploitant)}</span></li>`).join("")}</ul>`
    : "";

  const gares = d?.gares.length
    ? `<ul class="zones">${d.gares.map((g) => {
        const left = stillToCome(g.departs, data!.fetchedAt, now);
        return `<li class="card"><h3>Gare ${esc(de(g.commune))}</h3>` +
        `<p class="note">${g.arrets.map((a) => `${esc(a.reseau)} : ${a.page ? `<a href="${STOP_PATH}/${esc(a.page)}">${esc(a.nom)}</a>` : esc(a.nom)}`).join(" · ")}</p>` +
        (left.length
          ? `<ul class="rows departs">${left.map(({ x, min, heure }) => departureLi(x, waitText(min, listClock(heure)), listClock(heure))).join("")}</ul>`
          : busOutran(g, now.getTime() - data!.fetchedAt.getTime())
            ? `<p>${HORAIRES_EN_ATTENTE}</p>`
            : `<p>Pas de départ prévu dans les prochaines heures.</p>`) +
        `</li>`;
      }).join("")}</ul>` +
      `<p class="note">${d!.temps_reel?.length ? `${esc(d!.temps_reel.map((t) => t.reseau).join(", "))} : heures annoncées en direct par le réseau quand le bus y figure (données du réseau lues ${esc(leJour(d!.temps_reel[0].heure))}). ` : ""}` +
      `Sinon, horaires théoriques publiés par chaque réseau, sans les retards ni les déviations. Mis à jour ${leAt(data!.fetchedAt)}.</p>`
    : `<p class="card">Les prochains départs à n'importe quel arrêt de l'île sont donnés par le connecteur : demandez à votre assistant « le prochain bus à la gare de Saint-Pierre ? ».</p>`;

  const title = "Horaires bus, prochains départs en gare · La Réunion (974)";
  const description = "Bus à La Réunion (974) : prochains départs dans les gares routières, d'après les horaires de Car Jaune, Citalis, Kar'Ouest, Alternéo, CarSud et Estival.";

  const band = `${crumbBar("Bus")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Horaires du jour</p>
    <h1>Bus et cars <span class="n974">974</span></h1>
    ${status}
    ${stopSearch()}
    ${arretsAutour()}
    ${ask(`Kansa i pas lo prochin bis la gar Sin-Pyèr ? Gèt si ${url} é di amwin.`,
      `Quand passe le prochain bus à la gare routière de Saint-Pierre ? Lis ${url} et dis-le-moi.`)}
  </div>
  ${d ? `<figure class="card mapcard"><h2 style="color:var(--on-night)">Les réseaux</h2>${networks}</figure>` : ""}
</div>`;

  const body = `<section aria-labelledby="h-trajet"><div class="sec-h"><h2 id="h-trajet">Préparer un trajet</h2>
  <p>D'un arrêt, d'une commune ou d'un lieu à un autre, tous réseaux confondus, d'après les horaires prévus.</p></div>
  ${journeyForm({}, nowAsked(now).jour)}</section>
<section aria-labelledby="h-gares">
  <div class="sec-h"><p class="eyebrow">En ce moment</p><h2 id="h-gares">Prochains départs dans les gares routières</h2>
  <p>Toutes les lignes qui partent de chaque gare, tous réseaux confondus, au plus trois départs par ligne et par direction.</p></div>
  ${gares}
  ${d ? `<p class="sources">Sources : ${credits(d.sources)}.</p>` : ""}
  ${lienJeux()}
</section>
${d?.alertes?.length ? `<section aria-labelledby="h-trafic"><h2 id="h-trafic">Info trafic</h2><div class="card">${alertList(d.alertes)}<p class="note">Publié par les réseaux dans leur flux en direct, repris tel quel.</p></div></section>` : ""}
${linesList()}
${texteStable(busLire(d ? bus : undefined, d ? lines : undefined), busFaq())}
${connectorCta("transports", "les bus de l'île")}`;

  return layout(origin, { title, description, path: "/bus", jsonld: [crumbs(origin, "Bus", "/bus"), webPage(origin, "/bus", title, description, data), faqPage(busFaq())], alerte, iaAside: true }, band, body);
}

export function busLive(data: Cached<BusData> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const g = d.gares.find((x) => stillToCome(x.departs, data!.fetchedAt, now).length);
  // A copy past what it knows of a station says nothing rather than « no bus ».
  if (!g && d.gares.some((x) => busOutran(x, now.getTime() - data!.fetchedAt.getTime()))) return undefined;
  // The words of the commune pages' bus tile in the same case.
  if (!g) return { valeur: "Pas de départ", detail: "aux gares dans les prochaines heures, d'après les horaires publiés" };
  const { x, heure } = stillToCome(g.departs, data!.fetchedAt, now)[0];
  return {
    // A time rather than « dans 3 min »: the page may be a few minutes old.
    valeur: esc(heure),
    detail: `prochain départ de la gare ${esc(de(g.commune))} : ligne ${esc(x.ligne)} vers ${esc(casse(x.direction))} (${esc(x.reseau)})`,
  };
}

// ---------------------------------------------------------------- vélos

/** « 4 vélos · 6 places », « fermée ». */
export function bikeStock(s: VeloStation): string {
  if (s.etat === "fermée" || s.etat === "location impossible en ce moment") return esc(s.etat);
  const parts = [`<b>${s.velos_electriques}</b>\u00a0vélo${s.velos_electriques > 1 ? "s" : ""}`];
  if (s.trottinettes) parts.push(`<b>${s.trottinettes}</b>\u00a0trottinette${s.trottinettes > 1 ? "s" : ""}`);
  if (s.places_libres != null && !s.etat) parts.push(`${s.places_libres}\u00a0place${s.places_libres > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** A station, and « Y aller » below its name when its copy kept its position (no address: the sheet copies the coordinates). */
export const bikeRow = (s: VeloStation, g: Porte = porte()) => {
  const go = g.aller({ nom: s.nom, lat: s.lat ?? NaN, lon: s.lon ?? NaN });
  return `<li><span>${esc(s.nom)}${go ? `<span class="ya">${go}</span>` : ""}</span> <span>${bikeStock(s)}</span></li>`;
};

export function velosPage(origin: string, data: Cached<VelosAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const g = porte(alerte);
  const d = data?.value;
  const url = `${origin}/velos`;
  const total = d?.communes?.reduce((n, c) => n + c.velos_disponibles, 0) ?? 0;

  const status = !d
    ? loading("L'état des stations")
    : `<div class="now"><span class="big">${total}</span><p>vélo${total > 1 ? "s" : ""} à assistance électrique disponible${total > 1 ? "s" : ""} ${esc(leAt(data!.fetchedAt))} dans les <b>${d.stations.length}\u00a0stations</b> Altervélo de ${esc(BIKE_COMMUNES.join(", ").replace(/, ([^,]+)$/, " et $1"))}.</p></div>`;

  // The communes served in a yellow that stands out from the others' land in both themes (--zone-on: the highlight's
  // brown, in the dark theme, hardly did, marketing's review).
  const fills = Object.fromEntries(BIKE_COMMUNES.map((c) => [c, "var(--zone-on)"]));
  // Each commune served leads to its stations below; the others have their bubble only.
  const links: Record<string, ZoneLink> = d
    ? Object.fromEntries(island.paths.map((p: { nom: string }): [string, ZoneLink] => {
        if (!BIKE_COMMUNES.includes(p.nom)) return [p.nom, { say: "pas de station Altervélo" }];
        const n = d.communes?.find((x) => x.commune === p.nom)?.velos_disponibles ?? 0;
        return [p.nom, { href: `#${anchorId("c", p.nom)}`, say: `${n}\u00a0vélo${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}` }];
      }))
    : {};
  // One marker per commune served, where its stations are, as on /bornes: how many bikes can be taken there.
  const markers = (d?.communes ?? []).flatMap((c) => {
    const at = d!.stations.filter((s) => s.commune === c.commune && s.lon != null && s.lat != null);
    if (!at.length) return [];
    const n = c.velos_disponibles, said = `${n} vélo${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}`;
    return [{ lon: at.reduce((x, s) => x + s.lon!, 0) / at.length, lat: at.reduce((x, s) => x + s.lat!, 0) / at.length, label: String(n),
      name: `${c.commune} : ${said}`, round: true, color: n ? ROND.vert : ROND.gris, quiet: true, place: c.commune, say: said, href: `#${anchorId("c", c.commune)}` }];
  });
  const byCommune = d
    ? `<ul class="zones">${BIKE_COMMUNES.map((c) => {
        const mine = d.stations.filter((s) => s.commune === c).sort((a, b) => b.velos_electriques + (b.trottinettes ?? 0) - (a.velos_electriques + (a.trottinettes ?? 0)) || a.nom.localeCompare(b.nom, "fr"));
        const n = d.communes?.find((x) => x.commune === c)?.velos_disponibles ?? 0;
        return `<li class="card tgt" id="${anchorId("c", c)}"><h3>${esc(c)} <span class="note">${n}\u00a0vélo${n > 1 ? "s" : ""}, ${mine.length}\u00a0station${mine.length > 1 ? "s" : ""}</span></h3>` +
          `<ul class="rows bikes">${mine.map((s) => bikeRow(s, g)).join("")}</ul></li>`;
      }).join("")}</ul>` +
      `<p class="note">${esc(d.donnees)}</p>`
    : `<p class="card">L'état des stations se charge : rechargez la page dans quelques secondes.</p>`;

  const title = "Vélos Altervélo libres en direct · La Réunion (974)";
  const description = d
    ? describe(velosDescription(total),
        "Vélos électriques Altervélo en libre-service (974) : vélos et places libres de chaque station, en direct.")
    : "Vélos électriques Altervélo en libre-service (974) : vélos et places libres de chaque station, en direct.";

  const band = `${crumbBar("Vélos")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>En direct</p>
    <h1>Vélos en libre-service <span class="n974">974</span></h1>
    ${status}
    ${ask(`Néna in vélo Altervélo i rès dan la stasion IUT ? Gèt si ${url} é di amwin.`,
      `Reste-t-il des vélos Altervélo à la station IUT de Saint-Pierre ? Lis ${url} et dis-le-moi.`)}
  </div>
  <figure class="card mapcard">${islandMap({ fills, links, markers, apart: true, listed: true, label: "Carte de La Réunion (974) : les communes où circulent les vélos Altervélo, et leurs vélos disponibles" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([
    { forme: "aplat", couleur: "var(--zone-on)", dit: "commune desservie par Altervélo" },
    ...(markers.length ? [
      { forme: "rond" as const, couleur: ROND.vert, texte: "3", dit: "vélos disponibles dans la commune" },
      { forme: "rond" as const, couleur: ROND.gris, texte: "0", dit: "aucun vélo disponible" },
    ] : []),
  ],
    d && data ? esc(`Vélos disponibles d'après les stations, relevé ${readAt(data.fetchedAt, now).de}.`) : undefined)}</figcaption></figure>
</div>`;

  const body = `<section aria-labelledby="h-stations">
  <div class="sec-h"><p class="eyebrow">Station par station</p><h2 id="h-stations">Vélos et places libres</h2>
  <p>${d ? adressesCoupables(d.service, true) : "Altervélo : vélos à assistance électrique en libre-service de la CIVIS."}</p></div>
  ${byCommune}
  ${d && data ? sourcesNote(d.sources, data) : ""}
  ${lienJeux()}
</section>
${connectorCta("velos_libre_service", "les vélos du Sud")}${d ? g.feuille : ""}`;

  return layout(origin, { title, description, path: "/velos", jsonld: [crumbs(origin, "Vélos", "/velos"), webPage(origin, "/velos", title, description, data)], alerte }, band, g.ligne + body);
}

export function velosLive(data: Cached<VelosAnswer> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  if (!d.communes) return empty(`Disponibilités Altervélo absentes de la lecture ${readAt(data!.fetchedAt, now).de}.`);
  const total = d.communes.reduce((n, c) => n + c.velos_disponibles, 0);
  const best = [...d.stations].sort((a, b) => b.velos_electriques - a.velos_electriques)[0];
  return {
    valeur: `${total} vélo${total > 1 ? "s" : ""}`,
    detail: `disponibles dans ${d.stations.length} stations Altervélo${best?.velos_electriques ? `, dont ${best.velos_electriques} ${esc(a(best.nom))} (${esc(best.commune)})` : ""}`,
  };
}

// ---------------------------------------------------------------- bornes de recharge

/** A station in a list: where it is, its power and plugs, « Y aller », how many points are free. */
/** `ancre`: the row of its commune's list, the one /carte's bubble leads to (`s-<id>`); not the fast stations' list, which repeats it. */
export function borneRow(s: BorneStation, g: Porte = porte(), ancre = false): string {
  const free = s.libres ? `<b>${s.libres}</b> libre${s.libres > 1 ? "s" : ""} sur ${s.total}` : `aucun libre sur ${s.total}`;
  return `<li${ancre && s.id ? ` id="s-${esc(s.id)}" class="tgt"` : ""}><span>${esc(s.station)} <small>${fr(s.puissance_max_kw)} kW · ${esc(s.prises.join(", "))}${s.horaires && s.horaires !== "24 h/24, 7 j/7" ? ` · ${esc(s.horaires)}` : ""}</small>` +
    `${g.aller({ nom: s.station, lat: s.lat, lon: s.lon, adresse: s.adresse })}</span>` +
    ` <span class="${s.libres ? "free" : "busy"}">${free}</span></li>`;
}

export function bornesPage(origin: string, data: Cached<BornesAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const g = porte(alerte);
  const d = data?.value;
  const url = `${origin}/bornes`;
  const libres = d?.stations.reduce((n, s) => n + s.libres, 0) ?? 0;
  const total = d?.stations.reduce((n, s) => n + s.total, 0) ?? 0;

  // The count is dated by the operators' state (its latest change in the national file), not by our reading: the file
  // is filled by batches and may be an hour behind (state up to 01:29, read at 02:41, on 20/11/2026). Without that
  // time, by the reading, said as such.
  const etat = d?.etat_jusqu_a;
  const quand = etat ? `d'après l'état des opérateurs ${duAt(etat)}` : data ? `lu ${leAt(data.fetchedAt)}` : "";
  const status = !d
    ? loading("L'état des bornes")
    : `<div class="now"><span class="big">${libres}</span><p>point${libres > 1 ? "s" : ""} de charge libre${libres > 1 ? "s" : ""} ${esc(quand)}, sur <b>${total}</b> dans les ${d.stations.length} stations publiques de l'île.</p></div>`;

  // One marker per commune, where its stations are: how many points are free there.
  const markers = (d?.communes ?? []).map((c) => {
    const mine = d!.stations.filter((s) => s.commune === c.commune);
    const lon = mine.reduce((n, s) => n + s.lon, 0) / mine.length;
    const lat = mine.reduce((n, s) => n + s.lat, 0) / mine.length;
    const free = mine.reduce((n, s) => n + s.libres, 0);
    return { lon, lat, label: String(free), name: `${c.commune}\u00a0: ${free} libre${free > 1 ? "s" : ""} sur ${c.points}`, round: true, color: free ? ROND.vert : ROND.gris, quiet: true,
      place: c.commune, say: `${free} point${free > 1 ? "s" : ""} de charge libre${free > 1 ? "s" : ""} sur ${c.points}`, href: `#${anchorId("c", c.commune)}` };
  });

  const fast = d ? d.stations.filter((s) => s.puissance_max_kw >= FAST_KW).sort((a, b) => b.libres - a.libres || b.puissance_max_kw - a.puissance_max_kw) : [];
  const foldBornes = !!d && d.stations.length > FOLD_ROWS && d.communes.length > 1;
  const byCommune = d
    ? `<ul class="zones">${d.communes.map((c) => {
        const mine = d.stations.filter((s) => s.commune === c.commune).sort((a, b) => b.libres - a.libres || b.puissance_max_kw - a.puissance_max_kw);
        const free = mine.reduce((n, s) => n + s.libres, 0);
        return `<li class="card tgt" id="${anchorId("c", c.commune)}">${folded(foldBornes,
          `<h3>${esc(c.commune)}${foldBornes ? "\u00a0" : " "}<span class="note">${foldBornes ? "· " : ""}${free}\u00a0libre${free > 1 ? "s" : ""} sur\u00a0${c.points}, ${c.stations}\u00a0station${c.stations > 1 ? "s" : ""}</span></h3>`,
          `<ul class="rows bornes">${mine.map((s) => borneRow(s, g, true)).join("")}</ul>`)}</li>`;
      }).join("")}</ul>` +
      `<p class="note">${esc(d.donnees)}${d.avertissement ? ` ${esc(d.avertissement)}` : ""}</p>`
    : `<p class="card">L'état des bornes se charge : rechargez la page dans quelques secondes.</p>`;

  const title = "Bornes de recharge libres en direct · La Réunion (974)";
  const short = "Bornes de recharge pour voiture électrique à La Réunion (974) : points libres, occupés ou hors service, en direct, station par station.";
  const description = d
    ? describe(bornesDescription(etat ? `état ${duAt(etat)}` : leAt(data!.fetchedAt), libres, total), short)
    : short;

  const band = `${crumbBar("Bornes de recharge")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>En direct</p>
    <h1>Bornes de recharge à La Réunion <span class="n974">974</span></h1>
    ${status}
    ${ask(`Ousa mi pé roshar mon loto élèktrik vitman koté Sin-Pyèr ? Gèt si ${url} é di amwin.`,
      `Où recharger rapidement ma voiture électrique à Saint-Pierre ? Lis ${url} et dis-le-moi.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, apart: true, listed: true, label: "Carte de La Réunion (974) : les points de charge libres, commune par commune" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([
    { forme: "rond", couleur: ROND.vert, texte: "3", dit: "points de charge libres dans la commune" },
    { forme: "rond", couleur: ROND.gris, texte: "0", dit: "aucun libre" },
  ], data ? adressesCoupables(`D'après les opérateurs de recharge (transport.data.gouv.fr)${d?.etat_jusqu_a ? `, état jusqu'${leAt(new Date(d.etat_jusqu_a)).replace(/^le /, "au ")}` : ""}, lu ${leAt(data.fetchedAt)}.`, true) : undefined)}</figcaption></figure>
</div>`;

  // An outside resource, not a source of this page (tools/bornes.ts).
  const voirAussi = `<p class="card note">On aime\u00a0: <a href="${esc(RECHARGEPEI.lien)}" rel="noopener">RechargePei</a>, une appli utile pour trouver une borne de recharge à La Réunion.</p>`;

  const body = `${voirAussi}
<section aria-labelledby="h-rapide">
  <div class="sec-h"><p class="eyebrow">${fr(FAST_KW)} kW et plus</p><h2 id="h-rapide">Recharge rapide</h2>
  <p>Les stations où l'on recharge en une demi-heure à une heure, avec une prise Combo CCS ou CHAdeMO.</p></div>
  ${d ? `<div class="card"><ul class="rows bornes">${fast.map((s) => borneRow({ ...s, station: `${s.station}${s.station.endsWith(s.commune) ? "" : ` (${s.commune})`}` }, g)).join("")}</ul></div>` : ""}
</section>
<section aria-labelledby="h-stations">
  <div class="sec-h"><p class="eyebrow">Station par station</p><h2 id="h-stations">Commune par commune</h2>
  <p>${d ? esc(d.recharge) : "Les bornes publiques de l'île et l'état de chacun de leurs points."}</p></div>
  ${byCommune}
  ${d && data ? sourcesNote(d.sources, data) : ""}
  ${lienJeux()}
</section>
${connectorCta("bornes_recharge", "les bornes de recharge")}${d ? g.feuille : ""}`;

  return layout(origin, { title, description, path: "/bornes", jsonld: [crumbs(origin, "Bornes de recharge", "/bornes"), webPage(origin, "/bornes", title, description, data)], alerte }, band, g.ligne + body);
}

export function bornesLive(data: Cached<BornesAnswer> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  if (!d.stations.length) return empty(`État des bornes absent de la lecture ${readAt(data!.fetchedAt, now).de}.`);
  const libres = d.stations.reduce((n, s) => n + s.libres, 0);
  const fast = d.stations.filter((s) => s.puissance_max_kw >= FAST_KW && s.libres > 0).length;
  return {
    valeur: `${libres} point${libres > 1 ? "s" : ""} libre${libres > 1 ? "s" : ""}`,
    // With the time of the operators' state, as on /bornes.
    detail: `sur ${d.stations.reduce((n, s) => n + s.total, 0)}, dans ${d.stations.length} stations${d.etat_jusqu_a ? `, état ${duAt(d.etat_jusqu_a)}` : ""} ; recharge rapide libre dans ${fast} station${fast > 1 ? "s" : ""}`,
  };
}

// ---------------------------------------------------------------- qualité de l'eau

const WATER_COLOR: Record<string, string> = { bonne: ROND.vert, moyenne: ROND.orange, mauvaise: "#e3262d" };
const WATER_MARK: Record<string, string> = { bonne: "✓", moyenne: "~", mauvaise: "!" };
const dayFr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function siteLine(s: EauAnswer["baignades"][number], g: Porte): string {
  const last = s.derniers_prelevements[0];
  const q = s.qualite_dernier_prelevement;
  // The ARS's classification, as qualite_eau gives it (« Excellent (saison 2026) »); none for a site not classified.
  const classe = s.classement ? /^(.+) \(saison (\d{4})\)$/.exec(s.classement) : null;
  return `<li class="tgt" id="${anchorId("b", s.site)}"><span>${esc(s.site)} <small>dernier prélèvement le ${esc(s.dernier_prelevement)}` +
    (last ? ` · ${esc(last.enterocoques_100ml)} entérocoques et ${esc(last.e_coli_100ml)} E. coli pour 100 mL` : "") +
    (s.mauvais_sur_12_mois ? ` · ${s.mauvais_sur_12_mois} mauvais résultat${s.mauvais_sur_12_mois > 1 ? "s" : ""} sur 12 mois` : "") +
    (classe ? ` · classée ${esc(classe[1])} par l'ARS (saison ${classe[2]})` : "") + `</small>${g.aller({ nom: s.site, lat: s.lat, lon: s.lon }, "baignade")}</span>` +
    ` <span class="q-${q ?? "none"}">${q ? esc(q) : "pas de résultat"}</span></li>`;
}

/**
 * A distributor's « ne pas boire » notice in force, on its commune's line of /eau, in coupures_eau's words, with its
 * link (23/11/2026: Dionéo's for one sector of Saint-Denis was on /coupures-eau only).
 */
function dryLine(dry: { dit: string; lien?: string }, commune: string): string {
  return `<p><b>${esc(dry.dit)}</b>${dry.lien ? ` <a href="${esc(dry.lien)}" rel="noopener">L'avis complet<span class="sr"> : ${esc(commune)}</span> →</a>` : ""}</p>`;
}

function tapCard(c: EauAnswer["communes"][number], dry?: { dit: string; lien?: string }): string {
  const head = `<h3>${esc(c.commune)} <span class="note">${c.reseaux} réseau${c.reseaux > 1 ? "x" : ""}, ${c.analyses_6_mois} analyse${c.analyses_6_mois > 1 ? "s" : ""} en 6 mois</span></h3>` +
    (dry ? dryLine(dry, c.commune) : "");
  const warn = dry ? " warn" : "";
  if (!c.a_surveiller.length) {
    return `<li class="card${warn}">${head}<p>${c.analyses_6_mois ? "Toutes les analyses conformes" : "Pas d'analyse publiée"}${c.derniere_analyse ? ` (dernière le ${esc(dayFr(c.derniere_analyse))})` : ""}.</p></li>`;
  }
  return `<li class="card${warn}">${head}<ul class="rows eau">${c.a_surveiller.map((r) =>
    `<li><span>Réseau ${esc(r.reseau)} <small>${r.quartiers ? `${esc(r.quartiers)} · ` : ""}${(r.non_conformites ?? []).map((n) => `${esc(n.date)}${n.depassements ? ` : ${esc(n.depassements.join(", "))}` : ""}`).join(" ; ")}</small></span>` +
    ` <span class="q-mauvaise">${r.non_conformes_6_mois} non conforme${r.non_conformes_6_mois > 1 ? "s" : ""}</span></li>`).join("")}</ul></li>`;
}

/**
 * « du 15 au 22/09 », « du 28/08 au 22/09 », « du 22/09 »: the days of the samples a page shows, from two ISO days. No
 * green dot goes with it: an analysis is weeks old, never a reading of the day (marketing, 04/11/2026).
 */
export function duAu(from: string, to: string): string {
  if (from === to) return `du ${dayMonth(from)}`;
  return `du ${from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(8, 10)) : dayMonth(from)} au ${dayMonth(to)}`;
}

export function eauPage(origin: string, data: Cached<EauAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const g = porte(alerte);
  const d = data?.value;
  const url = `${origin}/eau`;
  // A half read more than 7 days ago is not shown: its source is said silent since then (eau/ile.ts KEPT_MAX_MS).
  const bathOld = !!d && tooOld(bathRead(d), now);
  const tapOld = !!d && tooOld(tapRead(d), now);
  const bains = d && !bathOld ? d.baignades : [];
  const good = bains.filter((s) => s.qualite_dernier_prelevement === "bonne").length;
  const notGood = bains.filter((s) => s.qualite_dernier_prelevement && s.qualite_dernier_prelevement !== "bonne");
  const samples = bains.map((s) => s.dernier_prelevement.split("/").reverse().join("-")).sort();
  const firstSample = samples[0];
  const lastSample = samples.at(-1);
  const tapBad = d && !tapOld ? d.communes.filter((c) => c.non_conformes_6_mois) : [];
  const gap = sansPrelevement(lastSample, now);
  // Nothing of the season, a month after it began: said first, with its dates (tools/eau.ts saisonSansPrelevement).
  const saison = saisonSansPrelevement(bains.map((s) => s.dernier_prelevement), now);

  const status = !d
    ? loading("La qualité de l'eau")
    : bathOld
    ? `<p>${esc(silentBath(bathRead(d)))}</p>`
    : (saison ? `<p><b>${esc(saison)}</b></p>` : "") +
      `<div class="now"><span class="big">${good}</span><p>plage${good > 1 ? "s" : ""} et bassin${good > 1 ? "s" : ""} sur <b>${d.baignades.length}</b> contrôlés par l'ARS en bonne qualité au dernier prélèvement${saison ? " de la saison passée" : ""}` +
      `${lastSample ? ` (${esc(dayFr(lastSample))})` : ""}${notGood.length ? ` ; à surveiller : ${esc(notGood.map((s) => s.site).join(", "))}` : ""}.</p></div>` +
      // No sample published for weeks (04/11/2026: none since 22/09): said under the count, never left to the dates alone;
      // the season's sentence above says it already.
      (gap && !saison ? `<p class="note">${esc(gap)}</p>` : "");

  const rank = (q?: string) => ["bonne", "moyenne", "mauvaise"].indexOf(q ?? "");
  // The worse last, drawn over the good ones next to them.
  const markers = [...bains].sort((a, b) => rank(a.qualite_dernier_prelevement) - rank(b.qualite_dernier_prelevement)).map((s) => {
    const q = s.qualite_dernier_prelevement ?? "";
    // Every name in the bubble only: written on the map, the sites to watch were cut by its frame.
    return { lon: s.lon, lat: s.lat, label: WATER_MARK[q] ?? "?", name: q ? `${s.site}\u00a0: ${q}` : s.site, round: true, color: WATER_COLOR[q] ?? ROND.gris, quiet: true,
      place: s.site, say: q ? `qualité ${q} au dernier prélèvement` : "pas de résultat", href: `#${anchorId("b", s.site)}` };
  });

  // The beaches whose round, on the map, would cover another's point or most of a line (apart()): listed under it.
  const outside: Marker[] = [];
  const offMap = (list: Marker[]) => list.length
    ? `<p class="note hors" style="color:var(--on-night-muted)">Pas sur la carte, faute de place autour : ${list.map((m) => `<a href="${esc(m.href!)}">${esc(m.place ?? m.name)}</a> (${esc(m.say ?? m.label)})`).join(", ")}.</p>`
    : "";

  const sites = bathOld
    ? `<p class="card">${esc(silentBath(bathRead(d!)))}</p>`
    : d
    ? `<ul class="zones">${[...new Set(bains.map((s) => s.commune))].sort((a, b) => a.localeCompare(b, "fr")).map((c) => {
        const mine = bains.filter((s) => s.commune === c);
        return `<li class="card"><h3>${esc(c)}</h3><ul class="rows eau">${mine.map((s) => siteLine(s, g)).join("")}</ul></li>`;
      }).join("")}</ul>`
    : `<p class="card">La qualité de l'eau se charge : rechargez la page dans quelques secondes.</p>`;

  const title = "Qualité de l'eau : baignade et robinet · La Réunion (974)";
  const short = "Qualité de l'eau à La Réunion (974) : les plages et bassins contrôlés par l'ARS et l'eau du robinet de chaque commune, réseau par réseau.";
  const description = d && !bathOld
    ? describe(eauDescription(good, bains.length), short)
    : short;

  const band = `${crumbBar("Qualité de l'eau")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">Analyses de l'ARS${firstSample && lastSample ? ` · ${esc(duAu(firstSample, lastSample))}` : ""}</p>
    <h1>Qualité de l'eau à La Réunion <span class="n974">974</span></h1>
    ${status}
    ${ask(`Dlo lé bon pou bengn La Rényon ? Gèt si ${url} é di amwin pou la plaj l'Ermitaz é pou dlo robinè Sin-Pyèr.`,
      `L'eau est-elle bonne pour se baigner à La Réunion ? Lis ${url} et dis-moi pour la plage de l'Hermitage et l'eau du robinet à Saint-Pierre.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, apart: true, outside, listed: true, label: "Carte de La Réunion (974) : la qualité de l'eau au dernier prélèvement de chaque plage et bassin contrôlé" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende(["bonne", "moyenne", "mauvaise"].map((q): Cle => ({ forme: "rond", couleur: WATER_COLOR[q], texte: WATER_MARK[q], dit: q })),
    firstSample && lastSample ? esc(`Qualité au dernier prélèvement de l'ARS, ${firstSample === lastSample ? `le ${dayFr(lastSample)}` : `du ${dayFr(firstSample).slice(0, 5)} au ${dayFr(lastSample)}`}.`) : undefined)}</figcaption>${offMap(outside)}</figure>
</div>`;

  const body = `<section aria-labelledby="h-baignade">
  <div class="sec-h"><p class="eyebrow">Plages et bassins</p><h2 id="h-baignade">L'eau de baignade</h2>
  <p>${esc(EAU_TEXT.baignade)}</p></div>
  ${sites}
  ${d && !bathOld ? `<p class="note">${esc(noteBaignade(!!gap))}</p>` : ""}
  ${d?.baignades_lu && !bathOld ? `<p class="note">${esc(keptBath(bathRead(d)))}</p>` : ""}
  <p class="note">${BAIGNADE_LINE}</p>
</section>
<section aria-labelledby="h-robinet">
  <div class="sec-h"><p class="eyebrow">Commune par commune</p><h2 id="h-robinet">L'eau du robinet</h2>
  <p>${d && !tapOld ? `${tapBad.length ? `Des analyses non conformes en 6 mois dans ${tapBad.length} commune${tapBad.length > 1 ? "s" : ""} sur ${d.communes.length}, sur un ou deux réseaux chacune.` : "Toutes les analyses des 6 derniers mois sont conformes."} ` : ""}${esc(EAU_TEXT.robinet)}</p></div>
  ${tapOld ? `<p class="card">${esc(silentTap(tapRead(d!)))}</p>${Object.entries(d!.ne_pas_boire ?? {}).length ? `<ul class="zones">${Object.entries(d!.ne_pas_boire!).map(([c, n]) => `<li class="card warn"><h3>${esc(c)}</h3>${dryLine(n, c)}</li>`).join("")}</ul>` : ""}<p class="note"><a href="/coupures-eau">Les avis en cours →</a></p>` : ""}
  ${d && !tapOld ? `<ul class="zones">${d.communes.map((c) => tapCard(c, d.ne_pas_boire?.[c.commune])).join("")}</ul><p class="note">${esc(tapNote("page"))}<br><a href="/coupures-eau">Les avis en cours →</a></p>${data ? `<p class="note">${d.communes_lu ? esc(keptTap(tapRead(d))) : `Analyses rassemblées ${esc(leAt(d.lu))}.`}</p><p class="sources">Sources : ${esc(d.sources.map((x) => x.attribution).join(" ; "))}.</p>` : ""}` : ""}
</section>
${connectorAsk("la qualité de l'eau", "Saint-Denis")}${bains.length ? g.feuille : ""}`;

  return layout(origin, { title, description, path: "/eau", jsonld: [crumbs(origin, "Qualité de l'eau", "/eau"), webPage(origin, "/eau", title, description, data)], alerte }, band, g.ligne + body);
}

const EAU_TEXT = {
  baignade: "Les 26 plages et bassins où l'ARS contrôle l'eau, avec le résultat de leur dernier prélèvement : bonne, moyenne ou mauvaise selon les germes trouvés (entérocoques intestinaux et E. coli).",
  robinet: "Chaque commune a plusieurs réseaux d'eau, du centre-ville aux écarts des Hauts : la qualité dépend du réseau qui dessert le quartier. Les réseaux ci-dessous ont eu au moins une analyse non conforme.",
};

export function eauLive(data: Cached<EauAnswer> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  if (!d.baignades.length) return empty(`Résultats de l'ARS absents de la lecture ${readAt(data!.fetchedAt, now).de}.`);
  const good = d.baignades.filter((s) => s.qualite_dernier_prelevement === "bonne").length;
  return {
    valeur: `${good} site${good > 1 ? "s" : ""} sur ${d.baignades.length}`,
    detail: "plages et bassins en bonne qualité au dernier prélèvement de l'ARS ; l'eau du robinet commune par commune",
  };
}

// ---------------------------------------------------------------- sentiers de randonnée

const kmFr = (n: number) => String(n).replace(".", ",");
// With its unit: « 2\u202f450\u00a0m ».
const meters = (n: number) => `${nombre(n)}\u00a0m`;
/** The hook of /randonnees and its sectors, with the map's date. */
export const randoHook = (miseAJour: string | undefined) => `Choisir une rando ouverte d'après ${onfCarte(miseAJour)}, avec sa trace GPS et son dénivelé.`;
/** The hook of a hike no trail of the ONF is on (marketing). */
export const NOT_ON_ONF = "Ce sentier n'est pas sur la carte de l'ONF : rundata.re n'a pas son état d'ouverture.";
/** « 20/10 »: the day the ONF edited its map, from the tool's « 20/10/2026 (ONF) » or the ISO time the copies keep (data.ts). */
export function onfDay(miseAJour: string | undefined): string {
  if (!miseAJour) return "";
  if (/^\d\d\/\d\d\//.test(miseAJour)) return miseAJour.slice(0, 5);
  const t = Date.parse(miseAJour);
  return Number.isFinite(t) ? new Date(t + 4 * 3600_000).toISOString().slice(5, 10).split("-").reverse().join("/") : "";
}

/** « la carte de l'ONF du 27/10 », the one formula of the trails' state (marketing, UX review of 04/11/2026): never « aujourd'hui » nor « ce matin ». */
export const onfCarte = (miseAJour: string | undefined) => `la carte de l'ONF${onfDay(miseAJour) ? ` du ${onfDay(miseAJour)}` : ""}`;

/** « Carte de l'ONF du 27/10, relue le 04/11 à 14:05 »: the map's date and when rundata.re read it. */
export function onfRead(miseAJour: string | undefined, lue: string | undefined): string {
  const at = lue && Number.isFinite(Date.parse(lue)) ? localTime(new Date(lue)).split(" ") : undefined;
  return `Carte de l'ONF${onfDay(miseAJour) ? ` du ${onfDay(miseAJour)}` : ""}${at ? `, relue le ${at[0]} à ${at[1]}` : ""}`;
}

/** « État ONF · carte du 27/10 »: the pill of the hikes' pages. */
/** The day of the ONF's map, « 2026-10-27 », from « 27/10/2026 (ONF) » or an ISO time; "" when it is not given. */
function onfIsoDay(miseAJour: string | undefined): string {
  const m = miseAJour?.match(/^(\d\d)\/(\d\d)\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const t = Date.parse(miseAJour ?? "");
  return Number.isFinite(t) ? new Date(t + 4 * 3600_000).toISOString().slice(0, 10) : "";
}

/**
 * The pill's green dot, read « en direct »: only for an ONF map of today, the rule of the pills (#739); a map of
 * 27/10 on 05/11 is said by its date alone.
 */
export const onfDot = (miseAJour: string | undefined, now: Date) =>
  onfIsoDay(miseAJour) && onfIsoDay(miseAJour) === new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10) ? `<span class="dot"></span>` : "";

export const onfPill = (miseAJour: string | undefined) => (onfDay(miseAJour) ? `État ONF · carte du ${onfDay(miseAJour)}` : "Traces GPS · carte de l'ONF");

/**
 * The source under a map of trails (charte § 3 F), on its own line after the legend: the ONF's map, its date and when
 * it was read, then OpenStreetMap when the map draws its hikes.
 */
export function traceSource(miseAJour: string | undefined, osm: boolean, lue?: string): string {
  return `<span class="mls">${onfRead(miseAJour, lue)}${osm ? "\u00a0; itinéraires d'OpenStreetMap" : ""}.</span>`;
}

/**
 * The trails closed, by name, as sentiers_randonnee counts them: the ONF's map cuts some in several pieces, each a point
 * on the map (26/10/2026: 62 points, 56 trails).
 */
export const closedTrails = (d: SentiersAnswer) => new Set(d.points.map((p) => p.nom)).size;

const INFOTRAFIC = "https://www.infotrafic.re/";
// ---------------------------------------------------------------- randonnée: the hikers' page

/** Breadcrumbs under the hikers' page: rundata.re › Randonnée › `name`. */
function hikeCrumbs(origin: string, name: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Randonnée", item: `${origin}/randonnees` },
      { "@type": "ListItem", position: 3, name, item: `${origin}${path}` },
    ],
  };
}
const hikeCrumbBar = (label: string) =>
  `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/randonnees">Randonnée</a></li><li aria-current="page">${esc(label)}</li></ol></nav></div>`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const why_ = (x: { cause?: string; precision?: string }, now: Date) => onf.motifs(x, now).map(esc).join(" · ");

/**
 * A trail's name that leads to two pages in the same body: the hike's (/randonnees/<x>: map, profile, GPX) keeps the
 * name alone, the ONF trail's (/sentiers/<x>) adds « , état ONF » (validated words), so that the two links read apart.
 */
export function etatOnf(body: string): string {
  const hikes = new Set([...body.matchAll(/<a href="\/randonnees\/[a-z0-9-]+">([^<]+)<\/a>/g)].map((m) => m[1]));
  return body.replace(/(<a href="\/sentiers\/[a-z0-9-]+">)([^<]+)<\/a>/g, (all, a: string, nom: string) => (hikes.has(nom) ? `${a}${nom}, état ONF</a>` : all));
}

/** A closed ONF trail, linked to its page, with why and until when. */
const closedLi = (x: { sentier: string; slug?: string; page?: string; cause?: string; precision?: string }, now: Date) => {
  const href = x.page ?? (x.slug ? `/sentiers/${x.slug}` : undefined);
  return `<li>${href ? `<a href="${esc(href)}">${esc(x.sentier)}</a>` : esc(x.sentier)}${why_(x, now) ? ` : ${why_(x, now)}` : ""}</li>`;
};

/** What the filter reads on a hike or a trail. */
// The filter's dénivelé is the bigger of the two (climb): a trail drawn downhill is not a flat one. `data-b` only on a
// loop: on the few hundred lines of /randonnees, a « 0 » on each would weigh more than its map's zoom.
const dataOf = (x: { k: string; km: number; dplus?: number; dmoins?: number; boucle: boolean }, etat: "o" | "f" | "i") =>
  `data-k="${x.k}" data-km="${x.km}" data-dp="${climb(x) ?? ""}" data-e="${etat}"${x.boucle ? ' data-b="1"' : ""}`;
/** « +412 m », and the descent beside it when the trace goes down more than it climbs: « +0 m · −1 131 m ». */
const upDown = (x: { dplus: number; dmoins?: number }) => `+${meters(x.dplus)}${(x.dmoins ?? 0) > x.dplus ? ` · −${meters(x.dmoins!)}` : ""}`;

function hikeCard(h: HikeCard, now: Date): string {
  const etat = h.fermes.length ? "f" : h.onf > h.inconnus.length ? "o" : "i";
  const state = h.fermes.length
    ? `<div class="shut"><p><b>${icon("alert")}${plural(h.fermes.length, "tronçon fermé", "tronçons fermés")}</b></p><ul>${h.fermes.map((f) => closedLi(f, now)).join("")}</ul></div>`
    : etat === "o"
      ? `<p class="okay">Tronçons suivis par l'ONF ouverts</p>`
      : `<p class="note">État non suivi par l'ONF : se renseigner avant de partir.</p>`;
  // Never counted as open: said apart.
  const unknown = etat !== "i" && h.inconnus.length ? `<p class="note">${plural(h.inconnus.length, "tronçon hors gestion ONF", "tronçons hors gestion ONF")} : état non connu.</p>` : "";
  // A notice on one of them (« Fermé le 02/06/26 »): said, whatever the rest.
  const noted = h.avis?.length ? `<p class="note"><b>${h.avis.map((x) => esc(x)).join("\u00a0; ")}.</b></p>` : "";
  const facts = [`${kmFr(h.km)} km`, upDown(h), h.alt_max != null ? `jusqu'à ${meters(h.alt_max)}` : "", h.boucle ? "boucle" : "", h.secteur].filter(Boolean).join(" · ");
  return `<li class="card hike${h.fermes.length ? " closed" : ""}" ${dataOf(h, etat)}>
<h3><a href="/randonnees/${esc(h.slug)}">${esc(h.nom)}</a></h3><p class="note">${esc(facts)}</p>${state}${unknown}${noted}
<p class="links"><a href="/randonnees/${esc(h.slug)}">Carte et profil<span class="sr"> : ${esc(h.nom)}</span></a><a href="/randonnees/${esc(h.slug)}.gpx" download>GPX<span class="sr"> de ${esc(h.nom)}</span></a></p></li>`;
}

function trailLi(t: TrailItem, now: Date): string {
  const e = t.etat === "fermé" ? "f" : t.etat === "ouvert" ? "o" : "i";
  const cls = e === "f" ? "q-mauvaise" : e === "o" ? "q-bonne" : "q-none";
  const label = e === "f" ? (t.partiel ? "fermé en partie" : "fermé") : e === "o" ? "ouvert" : "état inconnu";
  const small = [`${t.commune ? `${esc(t.commune)} · ` : ""}${kmFr(t.km)} km${t.dplus != null ? ` · ${upDown({ dplus: t.dplus, dmoins: t.dmoins })}` : ""}${t.boucle ? " · boucle" : ""}`, why_(t, now)].filter(Boolean).join(" · ");
  const on = t.randonnees.length ? `<small>Sur : ${t.randonnees.map((r) => `<a href="/randonnees/${esc(r.slug)}">${esc(r.nom)}</a>`).join(", ")}</small>` : "";
  return `<li ${dataOf(t, e)}><span>${t.slug ? `<a href="/sentiers/${esc(t.slug)}">${esc(t.nom)}</a>` : esc(t.nom)} <small>${small}</small>${on}</span> <span class="${cls}">${label}</span></li>`;
}

// The filter: shown once the script runs; without it, everything is listed.
const FILTER = `<form id="rf" class="card filter" hidden role="search" aria-label="Filtrer les randonnées et les sentiers">
<label class="q">Chercher <input name="q" type="search" placeholder="Mafate, Piton des Neiges, GR R2…" autocomplete="off"></label>
<label>Distance <select name="km"><option value="0-1e9">toutes</option><option value="0-5">moins de 5 km</option><option value="5-10">5 à 10 km</option><option value="10-20">10 à 20 km</option><option value="20-1e9">plus de 20 km</option></select></label>
<label>Dénivelé <select name="dp"><option value="0-1e9">tous</option><option value="0-300">moins de 300 m</option><option value="300-800">300 à 800 m</option><option value="800-1500">800 à 1 500 m</option><option value="1500-1e9">plus de 1 500 m</option></select></label>
<label>Parcours <select name="bo"><option value="">tous</option><option value="1">en boucle</option><option value="0">aller simple</option></select></label>
<label class="chk"><input name="ouv" type="checkbox"> Ouverts seulement</label>
<p class="note" id="rf-n" aria-live="polite"></p></form>`;

const FILTER_SCRIPT = `(()=>{const f=document.getElementById("rf");if(!f)return;f.hidden=false;
const items=[...document.querySelectorAll("li[data-k]")],lines={},row={};
const norm=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
for(const e of items){row[e.dataset.k]=e;e.dataset.q=norm(e.textContent)+" "+norm(e.closest("details")?.querySelector("summary")?.textContent||"")}
document.querySelectorAll("#hmap [data-k]").forEach((p)=>(lines[p.dataset.k]??=[]).push(p));
document.getElementById("hmap").addEventListener("click",(ev)=>{const k=ev.target.dataset?.k,a=k&&row[k]?.querySelector("a");if(a)location.href=a.href});
const range=(v)=>v.split("-").map(Number);
const run=()=>{const q=norm(f.q.value).split(" ").filter(Boolean),[a,b]=range(f.km.value),[c,d]=range(f.dp.value),dpAll=f.dp.value==="0-1e9",open=f.ouv.checked,bo=f.bo.value;
const active=q.length||f.km.value!=="0-1e9"||!dpAll||open||bo!=="";let nr=0,ns=0;
for(const e of items){const x=e.dataset,km=+x.km,dp=x.dp===""?NaN:+x.dp;
const ok=q.every((t)=>x.q.includes(t))&&km>=a&&km<b&&(dpAll||(dp>=c&&dp<d))&&(!open||x.e==="o")&&(bo===""||(x.b||"0")===bo);
e.hidden=!ok;for(const p of lines[x.k]||[])p.style.display=ok?"":"none";if(ok)x.k[0]==="r"?nr++:ns++}
document.querySelectorAll("details.sect").forEach((s)=>{const n=s.querySelectorAll("li[data-k]:not([hidden])").length;s.hidden=!n;s.querySelector(".cnt").textContent=n;if(active)s.open=n>0&&n<=40});
document.getElementById("rf-n").textContent=active?nr+" itinéraire"+(nr>1?"s":"")+" et "+ns+" sentier"+(ns>1?"s":"")+" correspondent.":"";};
f.addEventListener("input",run);f.addEventListener("submit",(e)=>e.preventDefault());})();`;

export function randonneesPage(origin: string, data: Cached<RandonneesAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/randonnees`;
  const nRoutes = d?.randonnees.length ?? 0;
  const cut = d?.randonnees.filter((h) => h.fermes.length) ?? [];

  const status = !d
    ? loading("La carte des randonnées")
    : `<div class="now"><span class="big">${nRoutes}</span><p>itinéraires et <b>${d.suivis}</b> sentiers de l'ONF avec leur trace GPS, leur distance et leur dénivelé. ` +
      `D'après ${onfCarte(d.carte_mise_a_jour)}, <b>${plural(d.fermes, "sentier fermé", "sentiers fermés")}</b>${cut.length ? `, sur ${plural(cut.length, "itinéraire")}` : ""}.</p></div>`;

  const map = d
    ? `<figure class="card mapcard">${hikesMap(d.lignes, "Carte de La Réunion (974) : les itinéraires de randonnée et les sentiers de l'ONF, ouverts ou fermés")}
  <figcaption class="note legend"><span><i class="sw rte"></i>itinéraire avec trace</span> <span><i class="sw ouvert"></i>sentier ouvert</span> <span><i class="sw ferme"></i>fermé</span> <span><i class="sw inconnu"></i>hors gestion ONF</span>${traceSource(d.carte_mise_a_jour, true, d.carte_lue)}</figcaption></figure>`
    : "";

  const band = `${crumbBar("Randonnée")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">${onfDot(d?.carte_mise_a_jour, now)}${esc(onfPill(d?.carte_mise_a_jour))}</p>
    <h1>Randonnée à La Réunion <span class="n974">974</span></h1>
    ${status}
    <p class="hero-cta"><a class="btn sun" href="#itineraires">${icon("mountain")}Choisir une rando</a><a class="btn glass" href="/sentiers">${icon("alert")}Sentiers fermés${d ? ` (${d.fermes})` : ""}</a></p>
    ${ask(`Mi rod inn rando 10 km dan Silaos, lé ouvèr ? Gèt si ${url} é di amwin.`,
      `Je cherche une randonnée d'environ 10 km à Cilaos, ouverte en ce moment : lis ${url} et propose-m'en une avec sa trace GPS.`)}
  </div>
  ${map}
</div>`;

  const closures = cut.length
    ? `<div class="card warn alarm">${icon("alert")}<h3>${plural(cut.length, "itinéraire coupé", "itinéraires coupés")} par une fermeture</h3>
  <ul class="plain">${cut.map((h) => `<li><a href="/randonnees/${esc(h.slug)}">${esc(h.nom)}</a> : ${h.fermes.map((f) => (f.slug ? `<a href="/sentiers/${esc(f.slug)}">${esc(f.sentier)}</a>` : esc(f.sentier)) + (onf.raison(f, now) ? ` (${esc(onf.raison(f, now)!)})` : "")).join(", ")}</li>`).join("")}</ul>
  <p class="note">Un sentier fermé est interdit, même avec la trace : prendre une variante ouverte ou choisir une autre randonnée. <a href="/sentiers">Tous les sentiers fermés</a>.</p></div>`
    : "";

  const routes = d
    ? `<section aria-labelledby="h-itineraires" id="itineraires">
  <div class="sec-h"><p class="eyebrow">GPX à télécharger</p><h2 id="h-itineraires">Les itinéraires avec trace GPS</h2>
  <p>Les randonnées complètes relevées par les contributeurs d'OpenStreetMap : GR R1, R2, R3, sommets, boucles. Distance et dénivelé d'après les altitudes de l'IGN ; l'état vient de la carte de l'ONF, sentier par sentier.</p></div>
  <p class="note">Par secteur :</p>
  ${sectorLinks()}
  ${FILTER}
  ${closures}
  <ul class="zones hikes">${d.randonnees.map((h) => hikeCard(h, now)).join("")}</ul>
</section>`
    : `<p class="card">Les randonnées se chargent : rechargez la page dans quelques secondes.</p>`;

  const trails = d
    ? `<section aria-labelledby="h-secteurs">
  <div class="sec-h"><p class="eyebrow">Secteur par secteur</p><h2 id="h-secteurs">Les ${d.suivis} sentiers de l'ONF</h2>
  <p>Chaque sentier a sa page avec sa carte, son profil et sa trace GPS. Un sentier est rangé dans le secteur où passe la plus grande partie de son tracé.</p></div>
  ${d.secteurs.map((z) => {
    const shut = z.sentiers.filter((t) => t.etat === "fermé").length;
    return `<details class="card sect"><summary><h3>${esc(z.secteur)}</h3><span class="note"><span class="cnt">${z.sentiers.length}</span> sentiers${shut ? ` · <b class="q-mauvaise">${shut} fermé${shut > 1 ? "s" : ""}</b>` : ""} · ${esc(z.communes.join(", "))}</span></summary>
  <ul class="rows eau">${z.sentiers.map((t) => trailLi(t, now)).join("")}</ul>${secteurNamed(z.secteur) ? `<p class="note"><a href="/randonnees/${secteurNamed(z.secteur)!.slug}">Randonnée ${esc(secteurNamed(z.secteur)!.dans)} : itinéraires, accès et météo →</a></p>` : ""}</details>`;
  }).join("\n  ")}
</section>`
    : "";

  const safety = `<section aria-labelledby="h-partir">
  <div class="sec-h"><h2 id="h-partir">Avant de partir</h2></div>
  <div class="card warn">${icon("alert")}<ul class="plain">
    <li><b>Un sentier fermé est interdit.</b> Il l'est par arrêté préfectoral ou par l'ONF (éboulement, passage effondré, travaux) : s'y engager est dangereux et verbalisable, même avec une trace GPS. <a href="/sentiers">La liste du jour</a>.</li>
    <li><b>La météo d'abord.</b> Regarder la <a href="/vigilance">vigilance de Météo-France</a> et la <a href="/meteo">prévision</a> la veille et le matin. Par fortes pluies ou orages, ne pas partir : les ravines montent en quelques minutes et la préfecture ferme d'autres sentiers.</li>
    <li><b>Partir tôt.</b> Les nuages montent dans les Hauts en fin de matinée et il pleut souvent l'après-midi ; la nuit tombe entre 17:45 et 19:00 selon la saison (<a href="/calendrier">lever et coucher du soleil</a>).</li>
    <li><b>De l'eau, assez.</b> Au moins deux litres par personne, davantage en été et sur les longues montées. Ne pas boire l'eau des ravines sans la traiter.</li>
    <li><b>Hors gestion ONF</b> veut dire état non connu, pas ouvert : se renseigner auprès de la commune ou du Parc national.</li>
    <li>Dire à quelqu'un où l'on va et quand on rentre : le téléphone ne passe pas partout dans les cirques. Au volcan, voir aussi <a href="/volcan">l'état du Piton de la Fournaise</a>. Urgence : 112.</li>
  </ul></div>
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>`;

  const title = "Randonnée : traces GPS, sentiers ouverts · La Réunion (974)";
  const short = "Randonnée à La Réunion (974) : itinéraires et sentiers de l'ONF avec trace GPS (GPX), distance, dénivelé et état du jour.";
  const description = d
    ? describe(randonneesDescription(nRoutes, d.suivis, d.fermes), short)
    : short;
  const list = d
    ? [{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Itinéraires de randonnée avec trace GPS à La Réunion",
        itemListElement: d.randonnees.map((h, i) => ({ "@type": "ListItem", position: i + 1, name: h.nom, url: `${origin}/randonnees/${h.slug}` })),
      }]
    : [];

  const body = `${hautsBlock(d?.hauts)}${routes}
${trails}
${safety}
${connectorCta("sentiers_randonnee", "la randonnée")}
${script(FILTER_SCRIPT)}`;
  return layout(origin, { title, description, path: "/randonnees", hook: randoHook(d?.carte_mise_a_jour), jsonld: [crumbs(origin, "Randonnée", "/randonnees"), webPage(origin, "/randonnees", title, description, data), ...list], alerte }, band, etatOnf(body));
}

/** Where the cloud sea will be in the coming morning, for each summit and village of the Hauts (tools/nuages.ts). */
function hautsBlock(hauts: RandonneesAnswer["hauts"]): string {
  if (!hauts?.length) return "";
  const when = hauts[0].titre.replace(/^Mer de nuages /, "");
  const line = (h: NonNullable<RandonneesAnswer["hauts"]>[number]) => {
    const name = h.slug ? `<a href="/meteo/${h.slug}#mer-de-nuages">${esc(h.nom)}</a>` : esc(h.nom);
    // During a volcano alert, the viewpoint over the Enclos says it is forbidden: « dégagé » must not call anyone down.
    // And always where the texts say what is open there: /volcan#monter.
    const enclos = h.enclos ? `${volcanBanner() ? ` ${esc(ENCLOS)}` : ""} <a href="/volcan#monter">${esc(TITRE)} →</a>` : "";
    return `<li>${name}${esc(h.resume.slice(h.nom.length))}${enclos}</li>`;
  };
  return `<section id="mer-de-nuages" aria-labelledby="h-hauts"><div class="sec-h"><h2 id="h-hauts">Les Hauts ${esc(when)} : au-dessus ou dans les nuages ?</h2>
  <p>Où sera la mer de nuages entre 6\u00a0h et midi, pour chaque sommet et village des Hauts. Prévision du modèle AROME de Météo-France, pas une mesure : regardez aussi le ciel et la station la plus proche avant de partir.</p></div>
  <div class="card"><ul class="plain">${hauts.map(line).join("")}</ul><p class="note">${esc(cap(hauts[0].prevision))}. ${esc(hauts[0].mise_en_garde)}</p></div></section>
`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The fires seen by satellite in the 24 hours before the copy was built, from the hikes' copy (its `feux`): none said as
 * « aucun point chaud détecté » with the hour of the read, never « aucun feu » (marketing, 04/11/2026).
 */
export function feuxLive(data: Cached<SentiersAnswer> | null): Live | undefined {
  const f = data?.value.feux;
  if (!f) return undefined;
  const n = f.detections.length;
  const lu = f.lu ? `, lu ${leAt(f.lu)}` : "";
  return n
    ? { valeur: `${n} point${n > 1 ? "s" : ""} chaud${n > 1 ? "s" : ""}`, detail: `ces dernières 24\u00a0h, par satellite (NASA FIRMS)${lu} · faux positifs possibles` }
    : { valeur: "aucun point chaud détecté", detail: `ces dernières 24\u00a0h, par satellite (NASA FIRMS)${lu}` };
}

export function randonneesLive(data: Cached<SentiersAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const n = closedTrails(d);
  return { valeur: `${n} sentier${n > 1 ? "s" : ""} fermé${n > 1 ? "s" : ""}`, detail: `sur ${d.suivis} suivis par l'ONF ; traces GPS, distance et dénivelé de ${d.randonnees.length} randonnées et de chaque sentier` };
}

/**
 * The sectors of the hikes as links, the page's own marked: on /randonnees, /sentiers and each sector's page. Each says
 * « Randonnée au Volcan » to screen readers, its name inside: told from « Volcan » (/volcan) or « Cilaos » (its weather).
 */
export function sectorLinks(current?: string): string {
  return `<nav class="parts" aria-label="Randonnée par secteur">${SECTEURS_RANDO.map((s) =>
    `<a href="/randonnees/${s.slug}"${s.slug === current ? ` aria-current="page"` : ""} aria-label="${esc(`Randonnée ${s.dans}`)}">${esc(s.nom)}</a>`).join("")}</nav>`;
}

/** The trail of a page under a sector: rundata.re › Randonnée › Sector (› name), as links and for search engines. */
export function sectorTrail(origin: string, s: Secteur, leaf?: { name: string; path: string }) {
  const items: [string, string][] = [[SITE, "/"], ["Randonnée", "/randonnees"], [s.nom, `/randonnees/${s.slug}`], ...(leaf ? [[leaf.name, leaf.path] as [string, string]] : [])];
  const bar = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol>${items.map(([n, p], i) =>
    i < items.length - 1 ? `<li><a href="${p}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`).join("")}</ol></nav></div>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([n, p], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${p}` })),
  };
  return { bar, jsonld };
}

// What the sectors' pages (randonnees.ts) share with the hikers' page.
export { closedLi, hikeCard, plural, trailLi };

// ---------------------------------------------------------------- a trail's or a hike's page, with its GPS trace

/**
 * The legend under a trace, drawn as on the hikes' map and in its words: the states the trace shows, a hike in its own
 * colour, then its start.
 */
function traceLegend(kind: "sentier" | "randonnee", etats: string[]): string {
  const marks: [string, string][] = kind === "sentier"
    ? ([["ouvert", "sentier ouvert"], ["ferme", "fermé"], ["inconnu", "hors gestion ONF"]] as [string, string][]).filter(([e]) => etats.includes(e))
    : [["rte", "itinéraire avec trace"], ...(etats.includes("ferme") ? [["ferme", "fermé"] as [string, string]] : [])];
  return [...marks, ["st", "départ"]].map(([c, t]) => `<span><i class="sw ${c}"></i>${t}</span>`).join(" ");
}

/**
 * « sentier ONF » or « itinéraire » for a name that has both pages (9 on 04/11/2026: Sentier Bayonne, Sentier Scout…),
 * else nothing: the two traces differ, and two titles alike in one group would contradict each other.
 */
export function twinOf(kind: "sentier" | "randonnee", nom: string): string | undefined {
  // The same name, whatever its capitals: « Sentier de l'École Normale » (ONF), « Sentier de l'École normale » (OpenStreetMap).
  const low = nom.toLocaleLowerCase("fr");
  const same = (x: string) => x.toLocaleLowerCase("fr") === low;
  const both = Object.keys(traces.SENTIERS).some(same) && traces.RANDONNEES.some((r) => same(r.nom));
  return both ? (kind === "sentier" ? "sentier ONF" : "itinéraire") : undefined;
}

/**
 * What a closed (or partly closed) trail's preview opens with, short enough to leave room for its name: « Fermé »,
 * « En partie fermé », the ONF's weekend notice, the notice of a trail outside its management, or the closed sections of a
 * hike. `undefined` for a trail the ONF says open or whose state is not known: those keep their name first.
 */
export function stateHead(d: TraceAnswer, now = new Date()): string | undefined {
  if (d.genre === "randonnee") {
    if (d.fermes.length) return `${plural(d.fermes.length, "tronçon fermé", "tronçons fermés")} sur cet itinéraire`;
    // A section outside the ONF's management that its map still marks (Sentier Bayonne): quoted, as routeRow says it.
    const noted = d.troncons.find((t) => t.etat !== "ouvert" && t.etat !== "fermé" && (t.cause || t.precision));
    if (!noted) return undefined;
    // The section named as the hike: its title names it already, the notice keeps the room.
    const where = noted.sentier === d.nom ? "Hors gestion ONF\u00a0;" : `${noted.sentier} (hors gestion ONF),`;
    return `${where} sur la carte de l'ONF\u00a0: “${noted.cause ?? noted.precision}”`;
  }
  const shut = d.troncons.filter((t) => t.etat === "fermé");
  const open = d.troncons.some((t) => t.etat === "ouvert");
  if (shut.length) {
    const weekend = onf.nuance(shut[0], now);
    const fin = onf.finWeekEnd(shut[0], now);
    // Past its last day, the notice opens it no more: the map's state, never « ouvert » on a weekend it does not cover.
    if (!weekend || fin?.passe) return open ? "En partie fermé" : fin ? "Fermé sur la carte de l'ONF" : "Fermé";
    return fin ? `Fermé sur la carte de l'ONF\u00a0; avis\u00a0: ouvert le week-end jusqu'au ${fin.dit}` : weekend.split("\u00a0: «")[0];
  }
  if (open) return undefined;
  const x = d.troncons.find((t) => t.cause || t.precision);
  const notice = x?.cause ?? x?.precision;
  return notice ? `Hors gestion ONF\u00a0; sur la carte de l'ONF\u00a0: “${notice}”` : undefined;
}

/** A sentence's end, once: a state the ONF ends with a full stop (« …de la Rivière de l'Est. ») gets no second one. */
const stop = (s: string) => ([".", "!", "?", "…"].some((c) => s.endsWith(c)) ? s : `${s}.`);

/**
 * A trail's preview (og:description). A closed one says so before anything else, in full when it fits, else its short state,
 * and never offers the GPX: a link to a dangerous trail arrives in a group without an invitation to take its trace. The
 * others: name, figures, state, as before.
 */
export function traceDescription(d: TraceAnswer, nom: string, where: string, short: string, now = new Date()): string {
  const figures = `${kmFr(d.km)} km${relief(d) ? `, ${relief(d)}` : ""}`;
  const head = stateHead(d, now);
  if (!head) {
    return describe(`${nom} (${where}) : ${figures}. ${stop(d.etat)} Trace GPS à télécharger (GPX) et profil.`,
      describe(`${nom} (La Réunion) : ${figures}. ${stop(d.etat)} Trace GPS à télécharger (GPX) et profil.`, short));
  }
  // A weekend notice past its last day: its words (« ouvert le samedi et le dimanche ») stay out of the preview.
  const over = d.genre === "sentier" && d.troncons.some((t) => t.etat === "fermé" && onf.finWeekEnd(t, now)?.passe);
  const said = over ? [head] : [d.etat, head];
  // Last for each, the state alone: the page's title names the trail.
  const tries = said.map(stop).flatMap((s) => [`${s} ${nom} (${where}) : ${figures}.`, `${s} ${nom} (La Réunion) : ${figures}.`, `${s} ${nom} (La Réunion).`, s]);
  const fit = tries.find((t) => t.length <= DESCRIPTION_MAX);
  if (fit) return fit;
  // A state longer than a preview: cut between two words, « … » after a word, never after a full stop.
  let cut = head.slice(0, DESCRIPTION_MAX - 1).replace(/\s+\S*$/, "");
  while (/[\s.,;:]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** `summit`: the summit the trace reaches, when the page its link leads to tells the morning's cloud sea (site.ts). */
export function tracePage(origin: string, kind: "sentier" | "randonnee", slug: string, nom: string, data: Cached<TraceAnswer> | null, now = new Date(), alerte?: Alerte, summit?: Summit): string {
  const d = data?.value;
  const path = `/${kind === "sentier" ? "sentiers" : "randonnees"}/${slug}`;
  const gpx = `${path}.gpx`;
  const what = kind === "sentier" ? "sentier de l'ONF" : "itinéraire OpenStreetMap";

  const facts = d
    ? `<dl class="facts"><div><dt>${d.boucle ? "En boucle" : "Longueur"}</dt><dd>${kmFr(d.km)} km</dd></div>` +
      (d.dplus != null ? `<div><dt>Dénivelé positif</dt><dd>${meters(d.dplus)}</dd></div><div><dt>Dénivelé négatif</dt><dd>${meters(d.dmoins ?? 0)}</dd></div>` : "") +
      (d.alt_max != null ? `<div><dt>Altitudes</dt><dd>${nombre(d.alt_min ?? 0)} – ${meters(d.alt_max)}</dd></div>` : "") + `</dl>`
    : loading("La trace");

  const etat = d?.etat === OUVERT_ONF ? `Ouvert d'après ${onfCarte(d.carte_mise_a_jour)}` : d?.etat;
  // Off the ONF's map of the day: its sentence, the main trail of a deviation and the official map linked.
  const hc = d?.hors_carte;
  const horsCarte = hc
    ? `<p>${esc(hc.texte)
      .replace(hc.principal ? `déviation du ${esc(hc.principal.sentier)}` : "\u0000", hc.principal ? `déviation du <a href="${esc(hc.principal.page.replace(/^https:\/\/rundata\.re/, ""))}">${esc(hc.principal.sentier)}</a>` : "")
      .replace(`carte officielle de l${esc("'")}ONF`, `<a href="${esc(hc.carte_officielle)}" rel="noopener">carte officielle de l${esc("'")}ONF</a>`)}</p>`
    : "";
  const state = d ? `<p class="lead">${d.ferme || hc ? "<b>" : ""}${esc(etat!)}${d.ferme || hc ? "</b>" : ""}</p>${horsCarte}` : "";
  // A hike crossing a closed trail says so before anything else: above the map and the download.
  const alarm = d?.fermes.length
    ? `<div class="alarm-band" role="alert">${icon("alert")}<div><p><b>Attention : ${plural(d.fermes.length, "tronçon fermé", "tronçons fermés")} sur cet itinéraire.</b> S'y engager est interdit, même avec la trace : prendre une variante ouverte ou renoncer.</p>
  <ul>${d.fermes.map((f) => closedLi(f, now)).join("")}</ul></div></div>`
    : "";
  const unknown = d?.inconnus.length
    ? `<p class="note soft">${plural(d.inconnus.length, "tronçon", "tronçons")} hors gestion ONF, état non connu (ni ouvert ni fermé ici) : ${d.inconnus.map((x) => (x.page ? `<a href="${esc(x.page)}">${esc(x.sentier)}</a>` : esc(x.sentier))).join(", ")}. Se renseigner auprès de la commune ou du Parc national.</p>`
    : "";
  const partOf = d?.randonnees.length
    ? `<p class="part-of">Fait partie de : ${d.randonnees.map((r) => `<a href="/randonnees/${esc(r.slug)}">${esc(r.nom)}</a>`).join(", ")}</p>`
    : "";
  // « Y aller » to a hike's start, beside the download, only when its copy kept the start (data.ts buildRoute). A forest
  // road closed by the start is said as the ONF's fact, dated, in grey: the trail itself is not closed (marketing's words).
  // A cyclone alert that closes the trails (aller.ts permis) says so in the button's place, before the road.
  const alerted = kind === "randonnee" && !permis(alerte, "randonnee");
  const go = d?.depart && !alerted ? aller({ nom: `départ du ${nom}`, lat: d.depart.lat, lon: d.depart.lon }) : "";
  const download = `<p class="hero-cta"><a class="btn sun" href="${esc(gpx)}" download>${icon("pin")}Télécharger le GPX</a>${go}</p>`;
  const shut = d?.routes_fermees;
  const road = shut
    ? `<p class="note">${shut.routes.length > 1 ? "Routes forestières interdites" : "Route forestière interdite"} à la circulation à ${ROAD_NEAR_M}\u00a0m ou moins du départ\u00a0: ` +
      `${shut.routes.map((x) => esc(x.route) + (x.cause ? ` (${esc(x.cause)})` : "")).join("\u00a0; ")}, selon l'ONF, lu le ${esc(shut.lu)}.</p>`
    : "";

  const map = d?.lignes.length
    ? `<figure class="card mapcard">${traceMap({ lines: d.lignes, label: `Carte : la trace de ${nom}` })}
  <figcaption class="note legend" style="color:var(--on-night-muted)">${traceLegend(kind, d.lignes.map((l) => l.etat))}${traceSource(d.carte_mise_a_jour, kind === "randonnee", d.carte_lue)}</figcaption></figure>`
    : "";

  const profileBlock = d?.profil.length
    ? `<section aria-labelledby="h-profil"><div class="sec-h"><p class="eyebrow">Altitudes IGN</p><h2 id="h-profil">Profil</h2></div>
  <figure class="card">${profile(d.profil, `Profil en altitude de ${nom}`)}</figure></section>`
    : "";

  const rows = d?.troncons.length
    ? `<ul class="rows eau">${d.troncons.map((t) => {
        const cls = t.etat === "fermé" ? "q-mauvaise" : t.etat === "ouvert" ? "q-bonne" : "q-none";
        const name = t.sentier ? (t.page ? `<a href="${esc(t.page)}">${esc(t.sentier)}</a>` : esc(t.sentier)) : esc(nom);
        return `<li><span>${name} <small>${(t.etat === "fermé" ? onf.motifs(t, now) : [t.cause, t.precision].filter((x): x is string => !!x)).map(esc).join(" · ")}</small></span> <span class="${cls}">${esc(t.etat)}</span></li>`;
      }).join("")}</ul>`
    : "";
  const stateBlock = rows
    ? `<section aria-labelledby="h-etat"><div class="sec-h"><p class="eyebrow">Carte de l'ONF</p><h2 id="h-etat">${kind === "sentier" ? "État du sentier" : "Les sentiers de l'ONF sur le parcours"}</h2>
  <p>${kind === "sentier" ? "L'état publié par l'ONF, tronçon par tronçon." : "Les sentiers gérés par l'ONF que suit cet itinéraire, avec leur état du moment : un tronçon fermé l'est par arrêté préfectoral ou décision de l'ONF."}</p></div>
  <div class="card">${rows}</div></section>`
    : "";

  const others = d?.randonnees.length
    ? `<p class="note">${d.ferme ? "Ce sentier fermé coupe" : "Ce sentier fait partie de"} : ${d.randonnees.map((r) => `<a href="/randonnees/${esc(r.slug)}">${esc(r.nom)}</a>`).join(", ")}.</p>`
    : "";

  // The sector the most of it lies in (computed with the traces); a route across several names them.
  const route = kind === "randonnee" ? traces.randonnee(slug) : undefined;
  const sector = secteurNamed(kind === "sentier" ? traces.sentier(slug)?.secteur : route?.secteur);
  const named = sector && !normalize(nom).includes(normalize(sector.nom)) ? ` (${sector.nom})` : "";
  // A name that is both an ONF trail and a hike (Sentier Bayonne): two pages, two traces, two sets of figures. Their titles
  // say which is which, and the twin keeps that word before the sector.
  const twin = twinOf(kind, nom);
  const which = twin ? `${nom} (${twin}${sector ? `, ${sector.nom}` : ""})` : `${nom}${named}`;
  const bare = twin ? `${nom} (${twin})` : nom;
  // Within the 60 characters a search engine shows: the sector, then « La Réunion (974) », then « trace GPX », give way
  // to a long name.
  const title = [`${which} : trace GPX · La Réunion (974)`, `${which} · La Réunion (974)`, `${bare} : trace GPX · La Réunion (974)`,
    `${bare} · La Réunion (974)`, `${bare} : trace GPX · 974`]
    .find((t) => t.length <= TITLE_MAX) ?? `${bare} · 974`;
  const short = traceShort(nom);
  const where = sector ? `${sector.nom}, La Réunion` : "La Réunion";
  const description = d ? traceDescription(d, nom, where, short, now) : short;
  const trail = sector ? sectorTrail(origin, sector, { name: nom, path }) : { bar: hikeCrumbBar(nom), jsonld: hikeCrumbs(origin, nom, path) };
  const jsonld = [trail.jsonld, webPage(origin, path, title, description, data)];

  // Where it is, in one sentence: « Sentier de l'ONF à Mafate, sur le GR R2 et le GR R3. », the routes linked.
  const on = (d?.randonnees ?? []).map((r) => `${/^[GP]R\b/.test(r.nom) ? "le " : ""}<a href="/randonnees/${esc(r.slug)}">${esc(r.nom)}</a>`);
  const crossed = (route?.secteurs ?? []).map((n) => secteurNamed(n)).filter((x): x is NonNullable<typeof x> => !!x);
  const lead = kind === "sentier"
    ? sector ? `Sentier de l'ONF ${esc(sector.dans)}${on.length ? `, sur ${on.length > 1 ? `${on.slice(0, -1).join(", ")} et ${on.at(-1)}` : on[0]}` : ""}.` : ""
    : sector ? `Itinéraire de randonnée ${esc(sector.dans)}.` : crossed.length > 1 ? `Itinéraire de randonnée qui passe ${crossed.slice(0, -1).map((x) => esc(x.dans)).join(", ")} et ${esc(crossed.at(-1)!.dans)}.` : "";
  const leadHtml = lead ? `<p class="lead part-of">${lead}${sector ? ` <a href="/randonnees/${sector.slug}">Randonnée ${esc(sector.dans)} →</a>` : ""}</p>` : "";
  // A trail of the volcano: what the official texts say of going up, place by place (/volcan).
  const monter = sector?.slug === "volcan" ? `<p class="note"><a href="/volcan#monter">Puis-je monter au volcan ? Ce que disent les textes officiels, lieu par lieu →</a></p>` : "";

  const band = `${trail.bar}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Trace GPS · ${esc(what)}</p>
    <h1>${esc(nom)}</h1>
    ${leadHtml}${monter}
    ${alarm || state}
    ${kind === "sentier" && sector ? "" : partOf}
    ${facts}
    ${download}${alerted ? retire(alerte) : ""}${road}
    ${unknown}
  </div>
  ${map}
</div>`;

  const body = `${profileBlock}
${stateBlock}
<section aria-labelledby="h-savoir">
  <div class="sec-h"><h2 id="h-savoir">Avant de partir</h2>
  <p>La trace GPX s'ouvre dans les applications de randonnée et les montres GPS. ${kind === "sentier" ? "C'est le sentier tel que l'ONF le trace sur sa carte, à pleine résolution." : "C'est l'itinéraire complet tel que les contributeurs d'OpenStreetMap l'ont relevé ; il peut emprunter des sentiers fermés : voir leur état ci-dessus."} Altitudes, dénivelés et profil : modèle de terrain de l'IGN (RGE ALTI).</p>
  ${others}
  ${weatherForTrace((d?.lignes ?? []).flatMap((l) => l.points))}
  ${cloudSeaLink(summit)}</div>
  ${warnings([
    "Un sentier fermé l'est par arrêté préfectoral ou décision de l'ONF : s'y engager est interdit et dangereux, même avec une trace.",
    "Vérifier la vigilance météo avant de partir : par fortes pluies, les ravines montent vite et la préfecture ferme d'autres sentiers.",
    "Une trace ne remplace ni le balisage ni une carte. Urgence en montagne : 112.",
  ])}
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>
${connectorCta("sentiers_randonnee", "les sentiers de randonnée")}`;

  // A hike that follows no trail of the ONF has no state here: its hook says so, instead of « l'état du sentier ».
  const hook = !d ? undefined : kind === "randonnee" && !d.troncons.length ? NOT_ON_ONF : `La trace à télécharger et l'état du sentier d'après ${onfCarte(d.carte_mise_a_jour)}, avant de partir.`;
  return layout(origin, { title, description, path, hook, jsonld, alerte }, band, go ? etatOnf(body) + ALLER : etatOnf(body));
}

// ---------------------------------------------------------------- sécheresse

const DROUGHT_COLOR: Record<string, string> = { vigilance: "#ffd43b", alerte: "#ff922b", "alerte renforcée": "#f03e3e", crise: "#862e9c" };
const DROUGHT_ORDER = ["crise", "alerte renforcée", "alerte", "vigilance"];
/**
 * The text of a pill where the sheet's dark ink is not readable on the official colour, which never changes (marketing,
 * 04/11/2026): white on the purple of « crise » (7.28:1, the dark ink gave 2.27), black on the red of « alerte renforcée »
 * (5.46:1, the dark ink gave 4.30).
 */
const DROUGHT_INK: Record<string, string> = { "alerte renforcée": "#000", crise: "#fff" };
const droughtBadge = (n?: string) =>
  n ? `<span class="lvl" style="--c:${DROUGHT_COLOR[n] ?? "#868e96"}${DROUGHT_INK[n] ? `;color:${DROUGHT_INK[n]}` : ""}">${esc(n)}</span>` : `<span class="note">aucune</span>`;

/**
 * « Ce qui est interdit » on /secheresse: a row per use of the tap water limited for a private person, a column per level
 * some commune has today, from the least to the most severe, with its communes. Each cell is the order's words for that
 * use at that level, its hours as the kit writes them; a use the order says nothing of at a level leaves its cell empty.
 * The levels are said once, in « Comment lire cette page »; the order's number and date once, at the top of the page.
 */
function droughtUses(interdits: SecheresseAnswer["interdits"]): string {
  const cols = [...interdits].filter((x) => DROUGHT_ORDER.includes(x.niveau)).sort((x, y) => DROUGHT_ORDER.indexOf(y.niveau) - DROUGHT_ORDER.indexOf(x.niveau));
  const uses = [...new Set(cols.flatMap((x) => x.restrictions.map((r) => r.usage)))];
  if (!cols.length || !uses.length) return "";
  const head = cols.map((x) => `<th scope="col">${droughtBadge(x.niveau)} <small class="note" style="display:block;font-weight:400">${esc(x.communes.join(", "))}</small></th>`).join("");
  const rows = uses.map((u) => `<tr><th scope="row">${esc(u)}</th>${cols.map((x) => {
    const said = x.restrictions.find((r) => r.usage === u)?.restriction;
    return said ? `<td data-label="${esc(x.niveau)}">${esc(heuresDites(said))}</td>` : "<td></td>";
  }).join("")}</tr>`).join("");
  return `<div class="card table-wrap"><table class="drought niveaux usages"><caption class="sr">Ce qui est interdit, par niveau</caption><thead><tr><th scope="col">Usage</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Under a level of the order, VigiEau's where it gives another: « VigiEau : alerte ». */
const vigieauSays = (c: SecheresseAnswer["communes"][number], ressource: string) => {
  const e = c.vigieau_differe?.find((x) => x.ressource === ressource);
  return e ? `<small class="note" style="display:block">VigiEau\u00a0: ${esc(e.vigieau)}</small>` : "";
};

/** /secheresse's stable text (marketing, 14/11/2026). */
const SECHERESSE_LIRE = `<p>Quand la pluie manque, le préfet prend un arrêté qui limite certains usages de l'eau. La page reprend l'arrêté du préfet en vigueur, commune par commune.</p>
<p><b>Quatre niveaux, du plus léger au plus strict :</b></p>
<ul class="plain"><li><b>vigilance</b> : économiser l'eau ;</li>
<li><b>alerte</b> et <b>alerte renforcée</b> : des usages sont limités ou interdits ;</li>
<li><b>crise</b> : seuls les usages prioritaires restent permis (santé, salubrité, sécurité).</li></ul>
<p>Chaque commune a un niveau pour trois ressources :</p>
<ul class="plain"><li><b>l'eau du robinet</b>, celle qui compte pour un particulier branché au réseau ;</li>
<li><b>les rivières et les sources</b> ;</li>
<li><b>les nappes</b>.</li></ul>
<p>Les deux dernières concernent ceux qui prélèvent directement dans le milieu : forage, captage, pompage.</p>
<p>Le tableau « Ce qui est interdit » donne, niveau par niveau, les usages limités pour un particulier : arrosage, lavage des voitures, piscine, fontaines, avec les heures permises quand l'arrêté en donne. Les agriculteurs, les entreprises et les collectivités ont leurs propres règles dans l'arrêté.</p>
<p><b>Ce que la page réunit :</b></p>
<ul class="plain"><li>le niveau de chaque commune pour les trois ressources, dans un seul tableau ;</li>
<li>les usages permis ou interdits, traduits en cas concrets.</li></ul>
<p>Pour comprendre pourquoi : <a href="/historique">la page Historique</a> compare la pluie récente à la normale, et <a href="/coupures-eau">la page Coupures d'eau</a> donne les avis des distributeurs.</p>`;

const SECHERESSE_FAQ: Faq[] = [
  { q: "Qui décide des restrictions ?", a: "Le préfet de La Réunion, par arrêté, sur la base des niveaux des rivières et des nappes. La date de l'arrêté en vigueur est en haut de page." },
  { q: "Je peux arroser mon jardin ?", a: "Cela dépend du niveau de votre commune pour l'eau du robinet. Pour chaque niveau, le tableau « Ce qui est interdit » dit si l'arrosage est permis, interdit, ou permis à certaines heures." },
  { q: "Jusqu'à quand durent les restrictions ?", a: "Jusqu'à ce qu'un nouvel arrêté les change ou les lève. Il n'y a pas de date de fin fixée à l'avance." },
  { q: "Quelle différence avec une coupure d'eau ?", a: "Une restriction limite des usages dans toute la commune. Une coupure, annoncée par le distributeur, interrompt l'eau dans un secteur." },
];

export function secheressePage(origin: string, data: Cached<SecheresseAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/secheresse`;
  const hit = d?.communes.filter((c) => c.eau_du_robinet && c.eau_du_robinet !== "vigilance") ?? [];

  const fills: Record<string, string> = {};
  // Each commune leads to its row of the table.
  const links: Record<string, ZoneLink> = {};
  for (const c of d?.communes ?? []) {
    const nm = MAP_NAME.get(normalize(c.commune));
    if (nm && c.eau_du_robinet) fills[nm] = DROUGHT_COLOR[c.eau_du_robinet] ?? "";
    if (nm) links[nm] = { href: `#${anchorId("c", nm)}`, say: `eau du robinet\u00a0: ${c.eau_du_robinet ?? "aucune restriction"}` };
  }

  // A newer order than the levels shown, out in the recueil and not taken into account yet: said first.
  const recent = d?.arrete_plus_recent
    ? `<p class="note" style="color:var(--on-night-muted)"><b>${esc(d.arrete_plus_recent.texte)}</b> <a href="${esc(d.arrete_plus_recent.lien)}">Lire l'arrêté (PDF)</a></p>`
    : "";
  const status = recent + (!d
    ? loading("Les restrictions d'eau")
    : d.communes.length
      ? `<div class="now"><span class="big">${hit.length}</span><p>commune${hit.length > 1 ? "s" : ""} sur 24 en alerte ou plus pour l'eau du robinet${d.arrete
          ? `, d'après l'<a href="${esc(d.arrete.lien)}">arrêté préfectoral ${esc(d.arrete.numero)} du ${esc(d.arrete.signe_le ?? "")}</a>, en vigueur depuis le ${esc(d.arrete.en_vigueur_depuis ?? "")}`
          : d.arrete_du ? `, d'après l'arrêté préfectoral en vigueur depuis le ${esc(d.arrete_du)}` : ""}.</p></div>` +
        (d.vigieau ? `<p class="note" style="color:var(--on-night-muted)">${esc(d.vigieau)}</p>` : "")
      : `<p class="lead">${esc(d.resume)}</p>`);

  const table = d?.communes.length
    ? `<div class="card table-wrap"><table class="drought"><caption class="sr">Les niveaux de restriction</caption><thead><tr><th>Commune</th><th>Eau du robinet</th><th>Rivières et sources</th><th>Nappes</th></tr></thead><tbody>${d.communes.map((c) =>
        `<tr><th scope="row" class="tgt" id="${anchorId("c", MAP_NAME.get(normalize(c.commune)) ?? c.commune)}">${esc(c.commune)}</th><td>${droughtBadge(c.eau_du_robinet)}${vigieauSays(c, "eau du robinet")}</td><td>${droughtBadge(c.rivieres_et_sources)}${vigieauSays(c, "rivières et sources")}</td><td>${droughtBadge(c.nappes)}${vigieauSays(c, "nappes souterraines")}</td></tr>`).join("")}</tbody></table></div>`
    : "";

  const rules = droughtUses(d?.interdits ?? []);

  const title = "Sécheresse, restrictions d'eau · La Réunion (974)";
  const short = "Restrictions d'eau à La Réunion (974) : le niveau de sécheresse par commune et ce qui est interdit (arrosage, lavage, piscine), d'après l'arrêté du préfet.";
  const description = d ? describe(`${d.resume}`, short) : short;

  const band = `${crumbBar("Sécheresse")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Arrêté en vigueur</p>
    <h1>Sécheresse <span class="n974">974</span></h1>
    ${status}
    ${ask(`Mi gingn arouz mon zardin Sin-Zozèf ? Gèt si ${url} é di amwin sak lé défandi.`,
      `Ai-je le droit d'arroser mon jardin à Saint-Joseph ? Lis ${url} et dis-moi ce qui est interdit.`)}
  </div>
  <figure class="card mapcard">${islandMap({ fills, links, listed: true, label: "Carte de La Réunion (974) colorée par le niveau de restriction de l'eau du robinet de chaque commune" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende(["vigilance", "alerte", "alerte renforcée", "crise"].map((n): Cle => ({ forme: "aplat", couleur: DROUGHT_COLOR[n], dit: n })))}</figcaption></figure>
</div>`;

  const body = `<section aria-labelledby="h-communes-eau">
  <div class="sec-h"><p class="eyebrow">Commune par commune</p><h2 id="h-communes-eau">Les niveaux de restriction</h2>
</div>
  ${table || (d ? "" : `<p class="card">Les restrictions se chargent : rechargez la page dans quelques secondes.</p>`)}
</section>
${rules ? `<section aria-labelledby="h-interdits">
  <div class="sec-h"><p class="eyebrow">Pour un particulier</p><h2 id="h-interdits">Ce qui est interdit</h2>
  <p>Les usages de l'eau du robinet limités à chaque niveau. Les agriculteurs, entreprises et collectivités ont leurs propres règles : demandez à votre IA avec le connecteur.</p></div>
  ${rules}
  ${d ? `<p class="note">${esc(d.a_savoir)}</p>` : ""}
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>` : ""}
${texteStable(SECHERESSE_LIRE, SECHERESSE_FAQ)}
${connectorCta("restrictions_eau", "les restrictions d'eau")}`;

  return layout(origin, { title, description, path: "/secheresse", jsonld: [crumbs(origin, "Sécheresse", "/secheresse"), webPage(origin, "/secheresse", title, description, data), faqPage(SECHERESSE_FAQ)], alerte, iaAside: true }, band, body);
}

export function secheresseLive(data: Cached<SecheresseAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  if (!d.communes.length) return { valeur: "aucune restriction", detail: "d'après VigiEau" };
  const worst = DROUGHT_ORDER.find((n) => d.communes.some((c) => c.eau_du_robinet === n));
  const hit = d.communes.filter((c) => c.eau_du_robinet && c.eau_du_robinet !== "vigilance").length;
  // Above vigilance, the worst level and where, as /secheresse says it: « crise à Saint-Joseph », « alerte renforcée dans
  // 5 communes » (worded by the user, 26/10). The tile's value is HTML: « Saint-Joseph » on one line where it fits (wholeName).
  const at = d.communes.filter((c) => c.eau_du_robinet === worst).map((c) => c.commune);
  const valeur = !worst ? "vigilance" : worst === "vigilance" ? `jusqu'à ${worst}` : at.length === 1 ? `${worst} ${wholeName(a(at[0]))}` : `${worst} dans ${at.length} communes`;
  return { valeur, detail: `${hit} commune${hit > 1 ? "s" : ""} sur 24 en alerte ou plus pour l'eau du robinet` };
}

// ---------------------------------------------------------------- coupures d'eau

/**
 * Escaped text whose hyphenated names (« Saint-Joseph ») stay on one line where it is wide enough, and break at their
 * hyphen only on a line narrower than the name (.nm, a box no wider than its line): a tile's figure, three tiles a row at
 * 768 px with the text at 200 %, where « Saint-Joseph » kept whole went 27 px past the tile's edge, cut off.
 */
export function wholeName(text: string): string {
  return esc(text).replace(/[\p{Lu}][\p{L}'’]*(?:-[\p{L}'’]+)+/gu, (w) => `<span class="nm">${w}</span>`);
}

/**
 * Escaped text whose hyphenated names (« Saint-Leu », « L'Étang-Salé ») do not break at the hyphen, unless the name is
 * longer than its line (.nb, a box no wider than its line): « La Plaine-des-Palmistes » kept whole in a notice's title, with
 * the text at 200 % on a 390 px phone, made the page 413 px wide.
 */
export function nobreak(text: string): string {
  return esc(text).replace(/[\p{Lu}][\p{L}'’]*(?:-[\p{L}'’]+)+/gu, (w) => `<span class="nb">${w}</span>`);
}

/**
 * « publié le 04/11/2026 à 11:15 », or for a notice dated after its reading, La Créole's dated by the day of its cut,
 * « coupure du 05/11/2026 »: « avis daté du » read as the day it was published (24/11/2026).
 */
const dateOfNotice = (n: CoupuresAnswer["avis"][number]) => (n.publie_le ? `publié le ${esc(n.publie_le)}` : `coupure du ${esc(n.date_de_l_avis ?? "")}`);

export function noticeCard(n: CoupuresAnswer["avis"][number]): string {
  // An image or a PDF: nothing is read from it, the link only.
  if (n.forme) return `<li class="card"><h3>${nobreak(n.communes.join(", "))} <span class="note">${nobreak(n.distributeur)}, ${dateOfNotice(n)}</span></h3>` +
    `<p>${n.lien ? `<a href="${esc(n.lien)}" rel="noopener">${esc(n.titre)} →</a>` : esc(n.titre)}</p></li>`;
  // Only the start written (La Créole): said as a start, not as the hour of the cut; only the end: « Jusqu'au … ».
  const span = n.coupure ? periodeCoupure(n.coupure) : "";
  const cut = n.coupure && span ? `<p><b>${esc(n.coupure.de && n.coupure.a ? span : span.charAt(0).toUpperCase() + span.slice(1))}</b>${n.coupure.etat ? ` <span class="note">(${esc(n.coupure.etat)})</span>` : ""}</p>` : "";
  return `<li class="card${n.ne_pas_boire ? " warn" : ""}"><h3>${n.ne_pas_boire ? "Ne pas boire l'eau · " : ""}${nobreak(n.communes.join(", "))} <span class="note">${nobreak(n.distributeur)}, ${dateOfNotice(n)}</span></h3>` +
    `<p>${esc(n.titre)}</p>${n.precision ? `<p class="note">${esc(n.precision)}</p>` : ""}${cut}${n.secteurs_complets ? `<p class="note">Secteurs : ${esc(sectorsSaid(n.secteurs))}</p>` : n.lieu ? `<p class="note">Lieu : ${esc(n.lieu)}</p>` : ""}` +
    `<p class="note">${nobreak(n.texte)}${n.lien ? ` <a href="${esc(n.lien)}" rel="noopener">${n.extrait_coupe && !n.secteurs_complets ? "Les secteurs concernés dans l'avis complet" : "L'avis complet"}<span class="sr"> : ${esc(n.communes.join(", "))}</span> →</a>` : ""}</p></li>`;
}

/**
 * The head of a page of notices (/coupures-eau, /coupures-eau/<commune>): the notices of cuts or works counted apart
 * from those saying not to drink the water, so that a notice about the water's quality is never read as a cut. `where`:
 * « à Salazie » on a commune's page; `dry`: the communes not to drink the water of, on the island's. `lus`: when the
 * notices were read, « le 06/11 à 14:15 », so that a copy of the page kept by a search engine never says them current;
 * `muet`: a feed did not answer, the sites read then said those that answered.
 */
export function noticesHead(avis: { ne_pas_boire?: boolean }[], where = "", dry: string[] = [], lus = "", muet = false): string {
  const bad = avis.filter((n) => n.ne_pas_boire).length;
  const cuts = avis.length - bad;
  const sectors = `dans les secteurs ${bad > 1 ? "des avis" : "de l'avis"}${dry.length ? ` (${esc(dry.join(", "))})` : ""}`;
  const at = where ? ` ${esc(where)}` : "";
  const read = lus ? `, ${(cuts || bad) === 1 ? "lu" : "lus"} ${esc(lus)}` : "";
  const text = !bad
    ? `avis de coupure ou de travaux en cours, récents ou à venir${at}${!cuts && lus ? `, sur les sites des distributeurs ${muet ? "qui ont répondu" : "lus"} ${esc(lus)}` : read}.`
    : !cuts
      ? `avis en cours${at}${read} : <b>eau à ne pas boire</b> ${sectors}.`
      : `avis de coupure ou de travaux, et ${bad} avis d'<b>eau à ne pas boire</b>${lus ? `, lus ${esc(lus)},` : ""} ${sectors}.`;
  return `<div class="now"><span class="big">${cuts || bad}</span><p>${text}</p></div>`;
}

/** The colours of the communes followed on the map of /coupures-eau, drawn the same in its legend. */
// A commune read with nothing announced and one not read, in two colours far apart (06/11/2026): a pale blue, a grey.
// A followed commune whose feed did not answer at the last read: a darker grey, never the blue of « aucun avis ».
const WATER_CUT = { dry: "#f03e3e", avis: "#4dabf7", calme: "#a5d8ff", nonLu: "#adb5bd", muet: "#868e96" };
const CALME = "Aucun avis en cours (site lu)";
const SANS_REPONSE_LUE = "Site sans réponse à la dernière lecture";
const SITE_NON_LU = "Site pas lu\u00a0: voir la mairie ou le distributeur";
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

export function coupuresPage(origin: string, data: Cached<CoupuresAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/coupures-eau`;
  const dry = d?.ne_pas_boire ?? [];

  const fills: Record<string, string> = {};
  const links: Record<string, ZoneLink> = {};
  const mute = new Set<string>();
  for (const c of d?.communes_suivies ?? []) {
    const nm = MAP_NAME.get(normalize(c));
    if (!nm) continue;
    const [fill, say] = dry.includes(c) ? [WATER_CUT.dry, NE_PAS_BOIRE()]
      : d!.avis.some((n) => n.communes.includes(c)) ? [WATER_CUT.avis, "avis en cours"]
      // Its feed silent, nothing kept: not known, never « aucun avis » (rule 3 ter).
      : muetPour(d!.injoignable, c) ? (mute.add(c), [WATER_CUT.muet, lower(SANS_REPONSE_LUE)])
      : [WATER_CUT.calme, lower(CALME)];
    fills[nm] = fill;
    // Each followed commune leads to its own page of notices.
    const p = pageOf(slugify(nm));
    if (p) links[nm] = { href: `/coupures-eau/${p.slug}`, say };
  }
  // The communes whose notices are not read: said as the legend says, and their page, which tells where to ask.
  if (d) for (const p of island.paths as { nom: string }[]) {
    const page = pageOf(slugify(p.nom));
    links[p.nom] ??= { href: page ? `/coupures-eau/${page.slug}` : undefined, say: lower(SITE_NON_LU) };
    fills[p.nom] ??= WATER_CUT.nonLu;
  }

  // A feed that did not answer: its notices kept were read before, so no hour of reading over them; and said under the
  // head, each with its hours, as on a commune's page (never « aucun avis » for a site that did not answer).
  const silent = d?.injoignable ?? [];
  const status = !d
    ? loading("Les avis des distributeurs")
    : copieBandeau(copieAncienne("eau", new Date(lusLe(data!)), now, "page"), esc(VOIR_EAU)) +
      noticesHead(d.avis, "", dry, silent.length && d.avis.length ? "" : leAt(lusLe(data!)), silent.length > 0) +
      silent.map((f) => `<p class="note">${silentText(f)}</p>`).join("");

  const list = d
    ? d.avis.length
      ? `<ul class="zones">${[...d.avis].sort((x, y) => Number(!!y.ne_pas_boire) - Number(!!x.ne_pas_boire)).map(noticeCard).join("")}</ul>`
      // « Pas d'avis », never « aucun avis », which reads as « no cut » (marketing, 22/11/2026), as the tool says it.
      : `<p class="card">Pas d'avis de coupure récent ou à venir ${silent.length ? "sur les sites des distributeurs qui ont répondu" : "sur les sites lus"}. Une coupure peut être annoncée ailleurs, par la mairie par exemple.</p>`
    : `<p class="card">Les avis se chargent : rechargez la page dans quelques secondes.</p>`;

  // Up the page in the cyclone season, at its foot the rest of the year.
  const cyclone = cycloneWater(now);
  const title = "Coupure d'eau : avis des distributeurs · La Réunion (974)";
  const short = "Coupures d'eau à La Réunion (974) : les avis de Dionéo, runéo, La Créole, la CIREST, CISE Réunion et des Eaux de La Possession, heures et rues concernées.";
  const description = d ? describe(`${d.resume} Coupures d'eau à La Réunion (974) : heures, rues concernées et avis « ne pas boire l'eau ».`, short) : short;

  const band = `${crumbBar("Coupures d'eau")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Avis des distributeurs</p>
    <h1>Coupures d'eau <span class="n974">974</span></h1>
    ${status}
    ${ask(`Dolo la koupé Sin-Dni ? Kansa i rovien ? Gèt si ${url} é di amwin.`,
      `Y a-t-il une coupure d'eau à Saint-Denis ? Lis ${url} et dis-moi quand l'eau revient.`)}
  </div>
  <figure class="card mapcard">${islandMap({ fills, links, label: "Carte de La Réunion (974) : les communes dont les avis de coupure d'eau sont suivis" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([
    { forme: "aplat", couleur: WATER_CUT.dry, dit: "eau à ne pas boire" },
    { forme: "aplat", couleur: WATER_CUT.avis, dit: "avis en cours" },
    { forme: "aplat", couleur: WATER_CUT.calme, dit: CALME },
    ...(mute.size ? [{ forme: "aplat" as const, couleur: WATER_CUT.muet, dit: SANS_REPONSE_LUE }] : []),
    { forme: "aplat", couleur: WATER_CUT.nonLu, dit: SITE_NON_LU },
  ], d && data ? esc(`Avis des distributeurs, lus ${readAt(new Date(lusLe(data)), now).a}.`) : undefined)}</figcaption></figure>
</div>`;

  const body = `<section aria-labelledby="h-coupures-eau">
  <div class="sec-h"><p class="eyebrow">Récents ou à venir</p><h2 id="h-coupures-eau">Les avis</h2>
  <p>${d ? couvertureCourte(d.couverture) : ""}</p></div>
  ${list}
  ${d ? afterCutNote : ""}
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>
${cyclone.lead ? cyclone.html : ""}
${texteStable(COUPURES_LIRE(distributeursLus()), COUPURES_FAQ)}
${connectorAsk("les coupures d'eau", "Saint-Denis")}
${cyclone.lead ? "" : cyclone.html}`;

  return layout(origin, { title, description, path: "/coupures-eau", jsonld: [crumbs(origin, "Coupures d'eau", "/coupures-eau"), webPage(origin, "/coupures-eau", title, description, data), faqPage(COUPURES_FAQ)], alerte, iaAside: true }, band, body);
}

// What the communes' water pages (coupures.ts) share with the island's.
export { droughtBadge, tapCard };

export function coupuresLive(data: Cached<CoupuresAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const dry = d.ne_pas_boire ?? [];
  // The notices of cuts or works only: one saying not to drink the water is not a cut.
  const cuts = d.avis.filter((n) => !n.ne_pas_boire).length;
  return {
    valeur: dry.length ? `ne pas boire : ${esc(dry.join(", "))}` : `${d.avis.length} avis`,
    detail: dry.length ? (cuts ? `${cuts} avis de coupure ou de travaux récents ou à venir` : `${d.avis.length} avis en cours`) : "de coupure ou de travaux récents ou à venir",
  };
}

// ---------------------------------------------------------------- défibrillateurs

/**
 * The home page's tile: the bundled list, nothing to fetch. Not how many are reachable at any hour: alone on a tile, the
 * figure would read as an island poorly equipped; the page says it commune by commune (marketing).
 */
export function daeLive(): Live {
  const communes = new Set(DAES.map((d) => d.commune)).size;
  // The number and the word never apart, the word never cut (marketing, 04/11/2026).
  return { valeur: `${nombre(DAES.length)}\u00a0<span class="nw">défibrillateurs</span>`, detail: `dans les ${communes} communes, avec leur accès · Géo'DAE du ${esc(dayMonth(DAE_BUILT))}`, entier: true };
}

/**
 * The four accesses in short, by reach (tools/dae.ts): the same words in the list by commune and in « Autour de moi ».
 * Reserved, with whom to ask: in an emergency, the staff can bring it (marketing).
 */
export const ACCES = ["dehors, 24 h/24", "24 h/24", "horaires du lieu", "accès réservé · demander à l'accueil"];
const shortAccess = (a: string) => ACCES[a.includes("toute heure") ? 0 : a.includes("24 h") ? 1 : a.includes("accès libre") || a.includes("extérieur") ? 2 : 3];

/**
 * « Autour de moi »: the position asked of the phone, and the nearest devices worked out there, from the compact list
 * (public/dae/, scripts/build-dae.py) loaded on the click. The position never leaves the phone: the only request is
 * the list's, the same for everyone; the island's map is drawn on the page; the walking route link carries the device
 * alone, never a starting point, and the maps app takes the position itself. Plans on an iPhone (always there, opened
 * by its own address), Google Maps elsewhere (its address for every device opens the app on Android). The link is the
 * site's « Y aller » button on foot (aller.ts): its sheet offers the other apps, Waze left out.
 */
export const AUTOUR_SCRIPT = `{const box=document.getElementById("autour"),btn=document.getElementById("autour-btn"),msg=document.getElementById("autour-msg"),res=document.getElementById("autour-res"),ul=document.getElementById("autour-list");
if(box&&btn&&msg&&res&&ul){box.hidden=false;
const LIST=${JSON.stringify(DAE_LIST.path)},ACCES=${JSON.stringify(ACCES)},BOX=${JSON.stringify(island.bbox)},W=${island.w},H=${island.h},N=10;
const T={nogeo:"Votre navigateur ne donne pas la position. Cherchez votre commune plus bas.",refus:"Position non autorisée. Cherchez votre commune plus bas.",perdue:"Position introuvable. Réessayez, ou cherchez votre commune plus bas.",liste:"La liste n'a pas pu se charger. Réessayez, ou cherchez votre commune plus bas.",route:${JSON.stringify(ALLER_MOTS.bouton)},label:${JSON.stringify(ALLER_MOTS.titre)}};
const e=(s)=>String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const say=(t)=>{msg.textContent=t;msg.hidden=!t};
const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const route=(la,lo)=>ios?"https://maps.apple.com/?daddr="+la+","+lo+"&dirflg=w":"https://www.google.com/maps/dir/?api=1&destination="+la+","+lo+"&travelmode=walking";
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
const far=(k)=>k<1?Math.max(10,Math.round(k*100)*10)+" m":(Math.round(k*10)/10).toFixed(1).replace(".",",")+" km";
const xy=(la,lo)=>[(lo-BOX[0])/(BOX[2]-BOX[0])*W,(BOX[3]-la)/(BOX[3]-BOX[1])*H];
let list=null;
const show=(la,lo)=>{const near=list.d.map((d)=>({d,k:km(la,lo,d[0],d[1])})).sort((a,b)=>a.k-b.k).slice(0,N);
ul.innerHTML=near.map(({d,k},i)=>"<li><span><b>"+(i+1)+".</b> "+e(d[2])+"<small>"+[far(k),[d[4],list.communes[d[5]]].filter(Boolean).join(", "),d[6],d[8],d[7]].filter(Boolean).map(e).join(" · ")+"</small><a class=\\"aller\\" href=\\""+e(route(d[0],d[1]))+"\\" rel=\\"noopener\\" data-go=\\""+d[0]+","+d[1]+"\\""+(d[4]?" data-a=\\""+e([d[4],list.communes[d[5]]].filter(Boolean).join(", "))+"\\"":"")+" data-m=\\"pied\\" aria-label=\\""+e(T.label+d[2])+"\\">"+e(T.route)+"</a></span> <span class=\\""+(d[3]<2?"q-bonne":"q-none")+"\\">"+e(ACCES[d[3]])+"</span></li>").join("");
res.hidden=false;const svg=document.querySelector(".mapcard svg");if(!svg)return;
const old=svg.querySelector("#autour-g");if(old)old.remove();
const pts=near.map(({d})=>xy(d[0],d[1])),me=xy(la,lo),all=[...pts,me],xs=all.map((p)=>p[0]),ys=all.map((p)=>p[1]);
let w=Math.max(W/12,(Math.max(...xs)-Math.min(...xs))*1.4),h=Math.max(H/12,(Math.max(...ys)-Math.min(...ys))*1.4);if(w/h>W/H)h=w*H/W;else w=h*W/H;
const cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2,r=w/90;
svg.setAttribute("viewBox",(cx-w/2)+" "+(cy-h/2)+" "+w+" "+h);svg.classList.add("autour-on");
svg.insertAdjacentHTML("beforeend","<g id=\\"autour-g\\">"+pts.map((p)=>"<circle class=\\"nr\\" cx=\\""+p[0]+"\\" cy=\\""+p[1]+"\\" r=\\""+r+"\\"/>").join("")+"<circle class=\\"me\\" cx=\\""+me[0]+"\\" cy=\\""+me[1]+"\\" r=\\""+r*1.4+"\\"/></g>")};
btn.addEventListener("click",()=>{say("");if(!navigator.geolocation){say(T.nogeo);return}btn.disabled=true;
navigator.geolocation.getCurrentPosition((p)=>(list?Promise.resolve(list):fetch(LIST).then((r)=>{if(!r.ok)throw new Error(String(r.status));return r.json()})).then((l)=>{list=l;show(p.coords.latitude,p.coords.longitude)}).catch(()=>say(T.liste)).finally(()=>{btn.disabled=false}),
(err)=>{say(err.code===1?T.refus:T.perdue);btn.disabled=false},{enableHighAccuracy:true,timeout:15000,maximumAge:60000})})}}`;

export function daePage(origin: string, data: Cached<DaeAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const markers = (d?.communes ?? []).map((c) => ({ lon: c.lon, lat: c.lat, label: String(c.nombre), name: `${c.commune}\u00a0: ${c.nombre} défibrillateurs`, round: true, color: COUNT_COLOR, quiet: true,
    place: c.commune, say: `${c.nombre} défibrillateur${c.nombre > 1 ? "s" : ""}`, href: `#${anchorId("c", c.commune)}` }));

  // The first screen in the order of a rescue (marketing's words, 06/11/2026): the call, the button, the map, then the count.
  // No « Domann out IA » here: in an emergency, every second counts (06/11/2026).
  const consigne = `<p class="lead"><b>Arrêt cardiaque : appelez le <a href="tel:15">15</a> ou le <a href="tel:112">112</a>, massez, et envoyez quelqu'un chercher un défibrillateur.</b> ${esc(DAE_SANS_FORMATION)}</p>`;
  const compte = d
    ? `<p class="dae-compte">${esc(`${nombre(d.total)} défibrillateurs déclarés à La Réunion.`)}</p>`
    : "";

  const foldDae = !!d && d.communes.reduce((n, c) => n + c.liste.length, 0) > FOLD_ROWS && d.communes.length > 1;
  const list = d
    ? `<ul class="zones">${d.communes.map((c) =>
        `<li class="card tgt" id="${anchorId("c", c.commune)}">${folded(foldDae,
          `<h3>${esc(c.commune)}${foldDae ? "\u00a0" : " "}<span class="note">${foldDae ? "· " : ""}${c.nombre}\u00a0défibrillateur${c.nombre > 1 ? "s" : ""}${c.toute_heure ? `, dont ${c.toute_heure}\u00a0accessible${c.toute_heure > 1 ? "s" : ""} à toute heure` : ""}</span></h3>`,
          `<ul class="rows eau dae">` +
        c.liste.map((x) => `<li><span>${soulignesCoupables(esc(x.lieu))} <small>${[x.adresse, x.emplacement, x.etage].filter(Boolean).map((v) => esc(v!)).join(" · ")}</small>` +
          // The normal route, not on foot as « Autour de moi »: a device of the commune may be kilometres away.
          `${aller({ nom: x.lieu, lat: x.lat ?? NaN, lon: x.lon ?? NaN, adresse: x.adresse })}</span>` +
          ` <span class="${x.acces.includes("toute heure") || x.acces.includes("24 h") ? "q-bonne" : "q-none"}">${esc(shortAccess(x.acces))}</span></li>`).join("") +
        (c.nombre > c.liste.length ? `<li><span class="note">et ${c.nombre - c.liste.length} autres : demandez le plus proche à votre IA.</span> <span></span></li>` : "") +
        `</ul>`)}</li>`).join("")}</ul>`
    : "";

  const title = "Défibrillateurs : où trouver un DAE · La Réunion (974)";
  // The count of the bundled base, by the hundred below (« plus de 1 200 » for 1 277).
  const description = `Défibrillateurs (DAE) à La Réunion (974) : plus de ${fr(Math.floor(DAES.length / 100) * 100)} appareils dans les 24 communes, d'après Géo'DAE, et le plus proche d'un lieu avec votre IA.`;

  const band = `${crumbBar("Défibrillateurs")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">Base nationale Géo'DAE</p>
    <h1>Défibrillateurs <span class="n974">974</span></h1>
    ${consigne}
    ${d ? "" : loading("La liste des défibrillateurs")}
    <div class="autour" id="autour" hidden><button type="button" class="btn sun" id="autour-btn">Défibrillateurs autour de moi</button>
    <p class="note">Votre position ne quitte pas votre appareil.</p><p class="note" id="autour-msg" role="status" hidden></p>
    <div id="autour-res" hidden><h3>Les 10 plus proches, à vol d'oiseau</h3><ul class="rows eau dae" id="autour-list"></ul></div></div>
  </div>
  <figure class="card mapcard">${islandMap({ markers, apart: true, listed: true, label: "Carte de La Réunion (974) : le nombre de défibrillateurs par commune" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([{ forme: "rond", couleur: COUNT_COLOR, texte: "52", dit: "défibrillateurs de la commune" }], esc(`Liste nationale Géo'DAE, lue le ${dayMonth(DAE_BUILT)}.`))}</figcaption></figure>
  <div class="dae-sous">${compte}</div>
</div>`;

  const body = `<section aria-labelledby="h-dae">
  <div class="sec-h"><p class="eyebrow">Commune par commune</p><h2 id="h-dae">Où sont les défibrillateurs</h2>
  <p>Ceux qu'on peut atteindre à toute heure d'abord (à l'extérieur ou ouverts 24 h/24), puis ceux en accès libre aux heures d'ouverture du lieu. La liste est déclarée par les exploitants : un appareil peut avoir été déplacé.</p></div>
  ${list}
  <p>${esc(DAE_SE_FORMER.texte.split(" : ")[0])} : <a href="${esc(DAE_SE_FORMER.lien)}">${esc(DAE_SE_FORMER.texte.split(" : ")[1])}</a>.</p>
  <p class="note">Source : Géo'DAE, base nationale des défibrillateurs (ministère chargé de la santé), Licence Ouverte 2.0.</p>
</section>
${connectorCta("defibrillateurs", "les défibrillateurs")}
${script(AUTOUR_SCRIPT)}${ALLER}`;

  return layout(origin, { title, description, path: "/defibrillateurs", jsonld: [crumbs(origin, "Défibrillateurs", "/defibrillateurs"), webPage(origin, "/defibrillateurs", title, description, data)], alerte }, band, body);
}


const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** A text escaped, each day with its month kept on one line (marketing), « Mardi <span class="jm">10 novembre</span> »,
 *  « depuis le <span class="jm">1er novembre</span> 2026 » (a day's title, /carburants, /trafic): .jm is nowrap in the
 *  style sheet, but on a small screen with the text enlarged (under 19.9 em), where « 10 novembre » can be wider than
 *  the line: there the month goes to the next line whole rather than being cut at a letter. The one rule for the pages'
 *  dates: never a no-break space between the day and its month, which would stop the month's hyphenation. */
function jourMois(texte: string): string {
  return esc(texte).replaceAll(new RegExp(`(?<![\\p{L}\\d,.])(\\d{1,2}|1er) (${MOIS.join("|")})(?!\\p{L})`, "gu"), '<span class="jm">$1 $2</span>');
}

/** At the top of /sport, once the clubs' space is out: the form first, then what /associations explains next. */
const clubsBox = () =>
  enLigne()
    ? `<aside class="card clubs" aria-labelledby="h-clubs">
  <h2 id="h-clubs">Votre club ou votre association organise un match, un tournoi, une course\u00a0?</h2>
  <p>Proposez-le en 2\u00a0minutes, sans compte\u00a0: après relecture, il s'affiche avec le nom de votre club.</p>
  <p class="clubs-go"><a class="btn sun" href="/associations/proposer?ref=sport">Proposer un événement</a> <a href="/associations?ref=sport">Votre club a déjà un agenda en ligne\u00a0?</a></p>
</aside>`
    : "";

/** Under the lists of events and of matches, once the clubs' space is out (web/associations.ts). */
export const clubsLink = () =>
  enLigne() ? `<p><a href="/associations?ref=site">Votre club ou votre association n'y est pas\u00a0? Faites connaître vos événements</a></p>` : "";

// What the pages built from a part of a domain's data (evenements.ts) share with the domain's own page.
export { clubsBox, connectorCta, crumbBar, crumbs, dayOf, dd, describe, enclosShort, FOURNAISE, hikeCrumbBar, hikeCrumbs, INFOTRAFIC, jourMois, loading, MAP_NAME, MOIS, sourcesNote, warnings, webPage };

// ---------------------------------------------------------------- actualités

type NewsRow = ActualitesAnswer["infos"][number];
/** « 11:33 » today, « hier à 18:20 », « jeudi 22/10 à 09:11 ». */
// With its day even today (« le 05/11 à 04:49 »), and the day alone for a source that gives no time (« le 04/11 »): a
// relative « hier à 22:05 » misleads on a page copied or read the next day.
const newsTime = (r: Pick<NewsRow, "publie" | "il_y_a">) => (r.il_y_a ? leAt(r.publie) : `le ${localTime(new Date(r.publie)).split(" ")[0]}`);

function newsRow(r: NewsRow): string {
  const small = [r.media + (r.aussi?.length ? ` (aussi ${r.aussi.map((x) => x.media).join(", ")})` : ""), r.communes?.join(", ")].filter(Boolean).map((x) => esc(x!)).join(" · ");
  return `<li data-k="${esc(r.lien)}" data-c="${esc((r.communes ?? []).join("|"))}" data-s="${esc((r.sujets ?? []).join("|"))}"><span><a href="${esc(r.lien)}" rel="noopener"${fenetre(r.lien)}>${esc(r.titre)}</a>` +
    `${r.resume ? `<small>${esc(r.resume)}</small>` : ""} <small>${small}<span class="nt">${small ? " · " : ""}${esc(newsTime(r))}</span></small></span> <span class="q-none">${esc(newsTime(r))}</span></li>`;
}

const NEWS_FILTER = `<form id="nf" class="card filter" hidden role="search" aria-label="Filtrer les informations">
<label class="q">Chercher <input name="q" type="search" placeholder="barrage, Saint-Pierre, route du littoral…" autocomplete="off"></label>
<label>Commune <select name="c"><option value="">toutes</option>COMMUNES</select></label>
<label>Sujet <select name="s"><option value="">tous</option>${SUJETS.map((x) => `<option value="${x.id}">${esc(x.nom)}</option>`).join("")}</select></label>
<p class="note" id="nf-n" aria-live="polite"></p></form>`;

const NEWS_SCRIPT = `(()=>{const f=document.getElementById("nf");if(!f)return;f.hidden=false;
const items=[...document.querySelectorAll("#news li[data-k]")];
const norm=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
for(const e of items)e.dataset.q=norm(e.textContent);
const run=()=>{const q=norm(f.q.value).split(" ").filter(Boolean),c=f.c.value,s=f.s.value;let n=0;
for(const e of items){const x=e.dataset,ok=q.every((t)=>x.q.includes(t))&&(!c||x.c.split("|").includes(c))&&(!s||x.s.split("|").includes(s));e.hidden=!ok;if(ok)n++}
document.getElementById("nf-n").textContent=q.length||c||s?n+" information"+(n>1?"s":"")+" sur "+items.length+".":"";};
f.addEventListener("input",run);f.addEventListener("submit",(e)=>e.preventDefault());})();`;

export function actualitesPage(origin: string, data: Cached<ActualitesAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/actualites`;
  const communes = [...new Set((d?.infos ?? []).flatMap((r) => r.communes ?? []))].sort((x, y) => x.localeCompare(y, "fr"));

  const status = !d
    ? loading("L'actualité")
    // All of them, as actualites counts them; the list keeps the newest (26/10/2026: 40 here, 103 in the tool).
    : `<div class="now"><span class="big">${d.total ?? d.infos.length}</span><p>informations des médias de l'île depuis 24 h` +
      `${(d.total ?? 0) > d.infos.length ? `\u00a0; les ${d.infos.length} plus récentes ci-dessous` : ""}` +
      `${d.en_direct.length ? ` ; <b>${esc(d.en_direct[0].media)} suit la journée en direct</b> (dernière entrée ${esc(newsTime(d.en_direct[0]))})` : ""}.</p></div>`;

  const top = d ? (d.en_direct.length ? d.en_direct : d.infos).slice(0, 6) : [];
  const side = d
    ? `<figure class="card mapcard"><h2 style="color:var(--on-night)">${d.en_direct.length ? "En direct" : "À la une"}</h2><ul class="plain">${top.map((r) =>
        `<li><b style="color:var(--on-night)">${esc(newsTime(r))}</b> <a href="${esc(r.lien)}" rel="noopener"${fenetre(r.lien)} style="color:var(--on-night)">${esc(r.titre)}</a>` +
        `<span class="note" style="color:var(--on-night-muted)"> · ${esc(r.media)}${r.communes?.length ? ` · ${esc(r.communes.join(", "))}` : ""}</span></li>`).join("")}</ul></figure>`
    : "";

  const list = d
    ? d.infos.length
      ? `${NEWS_FILTER.replace("COMMUNES", communes.map((c) => `<option>${esc(c)}</option>`).join(""))}<ul class="rows eau news" id="news">${d.infos.map(newsRow).join("")}</ul>`
      : d.indisponible.length ? "" : `<p class="card">Aucune information des médias lus depuis 24 h.</p>`
    : `<p class="card">L'actualité se charge : rechargez la page dans quelques secondes.</p>`;

  const live = d?.en_direct.length
    ? `<section aria-labelledby="h-direct">
  <div class="sec-h"><p class="eyebrow">Heure par heure</p><h2 id="h-direct">Le direct ${/^[aeiouyéèêiî]/i.test(d.en_direct[0].media) ? "d'" : "de "}${esc(d.en_direct[0].media)}</h2>
  <p>Les entrées du direct, la plus récente en haut, avec leur première phrase et ce qu'elles disent des communes. Le texte complet est sur le site du média.</p></div>
  <ul class="rows eau news">${d.en_direct.map((r) => `<li><span><a href="${esc(r.lien)}" rel="noopener"${fenetre(r.lien)}>${esc(r.titre)}</a>${r.resume ? `<small>${esc(r.resume)}</small>` : ""}` +
    `${r.communes?.length ? `<small>${esc(r.communes.join(", "))}</small>` : ""} <small class="nt">${esc(newsTime(r))}</small></span> <span class="q-none">${esc(newsTime(r))}</span></li>`).join("")}</ul>
</section>`
    : "";

  const pref = d?.prefecture.length
    ? `<section aria-labelledby="h-pref">
  <div class="sec-h"><p class="eyebrow">Officiel</p><h2 id="h-pref">Communiqués de la préfecture</h2><p>Mesures de sécurité, interdictions, routes, eau : les consignes officielles priment.</p></div>
  ${d.prefecture_injoignable ? `<p class="note">${silentText(d.prefecture_injoignable)}</p>` : ""}
  <ul class="rows eau news">${d.prefecture.map((r) => `<li><span><a href="${esc(r.lien)}" rel="noopener">${esc(r.titre)}</a> <small class="nt">${esc(newsTime(r))}</small></span> <span class="q-none">${esc(newsTime(r))}</span></li>`).join("")}</ul>
</section>`
    : "";

  const title = "Actualités en direct, par commune · La Réunion (974)";
  const short = "Ce qui se passe à La Réunion (974) en ce moment : titres et directs des médias, communiqués de la préfecture, commune par commune, toutes les 5 minutes.";
  const description = d && d.infos[0] ? describe(`À La Réunion, ${newsTime(d.infos[0])} : ${d.infos[0].titre}. Les titres des médias de l'île et leurs directs, commune par commune.`, short) : short;

  const band = `${crumbBar("Actualités")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Les médias de l'île, relus toutes les 5 minutes</p>
    <h1>Actualités <span class="n974">974</span></h1>
    ${status}
    ${ask(`Kosa i spas Sin-Pyèr astèr ? Néna baraz ? Gèt si ${url} é di amwin.`,
      `Que se passe-t-il à Saint-Pierre en ce moment, y a-t-il des blocages ? Lis ${url} et dis-le-moi.`)}
  </div>
  ${side}
</div>`;

  const body = `${live}
<section aria-labelledby="h-news">
  <div class="sec-h"><p class="eyebrow">Les dernières 24 heures</p><h2 id="h-news">Toutes les informations</h2>
  <p>Le titre de chaque article, sa première phrase quand le média la donne, son média, les communes qu'il nomme et son heure (heure de La Réunion), ou son jour seulement quand le média ne donne pas l'heure. Une même information publiée par plusieurs médias n'est listée qu'une fois.</p></div>
  ${list}
  ${d?.indisponible.length ? warnings([mediasNonLus(d.indisponible, localTime(data!.fetchedAt), now)]) : ""}
</section>
${pref}
<section aria-labelledby="h-couv">
  <div class="sec-h"><h2 id="h-couv">Ce qui est couvert</h2><p>${d ? esc(d.couverture) : ""}</p><p>${d ? esc(d.a_savoir) : ""}</p></div>
  ${d && data ? sourcesNote(d.sources, data) : ""}
  <p class="note">${noteLa1ere("actualites")}</p>
</section>
${connectorCta("actualites", "l'actualité de l'île")}
${script(NEWS_SCRIPT)}`;

  return layout(origin, { title, description, path: "/actualites", jsonld: [crumbs(origin, "Actualités", "/actualites"), webPage(origin, "/actualites", title, description, data)], alerte, iaAside: true }, band, body);
}

export function actualitesLive(data: Cached<ActualitesAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  // « mobilisation en cours » above the news of that mobilisation only, never above the first news of the day, which
  // can be anything else (a man killed on the road under « mobilisation en cours », 04/11/2026).
  const first = d.mobilisation ?? d.en_direct[0] ?? d.infos[0];
  return {
    valeur: d.mobilisation ? "mobilisation en cours" : `${d.infos.length} informations`,
    detail: first ? `${esc(newsTime(first))}, ${esc(first.media)} : ${esc(first.titre)}` : "depuis 24 h",
  };
}
