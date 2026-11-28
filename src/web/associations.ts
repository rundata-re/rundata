/**
 * /associations: the clubs' and associations' space (the spec of the clubs' space §1 to §8). First the
 * form to propose an event, for the 8 associations out of 10 without any tool; then the proof, counted from the
 * agendas' last copy, never written by hand; the tools a club may already use, one card each, saying whether
 * rundata.re reads it; the guide for those who want to do it properly; the rules; the text to pass on.
 * /clubs and /asso lead here.
 */
import type { Cache } from "../cache.js";
import { versBilletterie } from "../http.js";
import { AGENDAS, BUNDLE, BUNDLE_SYNC_SECONDS, copiePlanifiee, type Evenement, planifiees } from "../providers/agenda.js";
import { ID as CONNECTEURS_ID } from "../providers/agenda-connecteurs.js";
import { evenements as proposes, ID as PROPOSITIONS_ID } from "../providers/agenda-propositions.js";
import { lisible } from "../propositions.js";
import { inPeriod, periode, when } from "../tools/agenda.js";
import type { Alerte } from "./data.js";
import { adresseTexte } from "./adresse.js";
import * as connecteurs from "./connecteurs.js";
import { crumbBar, crumbs, lienNom, webPage } from "./domains.js";
import { ICS_PATH, JSON_PATH } from "./flux-associations.js";
import { brut, href, html, type Html } from "./html.js";
import { adressesCoupables, layout } from "./pages.js";
import { lienForm, PROPOSER_PATH, TURNSTILE_SCRIPT } from "./propositions.js";
import brand from "./brand.json" with { type: "json" };
import { KREOL } from "./publier-texte.js";
import { INSEE } from "../places/insee.js";
import * as rna from "../vie/associations.js";
import { slugify } from "./places.js";

export const PATH = "/associations";
/** The short addresses people type, sent here. */
export const ALIASES = ["/clubs", "/asso"];
const TITLE = "Clubs et associations\u00a0: vos événements · La Réunion (974)";
const META = "Matchs, kermesses, sorties, concerts\u00a0: vos dates sur rundata.re et dans les assistants IA, avec le nom de votre club. Gratuit, sans compte, en quelques clics.";
const H1 = "Espace clubs et associations";
const ESPRIT = "Vos matchs, vos kermesses, vos sorties et vos concerts s'affichent gratuitement sur rundata.re et dans les assistants IA qui l'utilisent (ChatGPT, Claude, Le Chat), avec le nom et le lien de votre club. Vous continuez à publier là où vous le faites déjà\u00a0: sans compte, sans publicité, et vos événements deviennent des données ouvertes, que tout le monde peut réutiliser en citant votre club.";
/** Under it, no figure: only the events. */
const CLUBS_MIN = 10;
const PROCHAINS = 3;
const RELAIS = "Votre club ou votre association organise des matchs, des fêtes, des sorties\u00a0? rundata.re les affiche gratuitement, sur son site et dans les assistants IA comme ChatGPT, avec le nom de votre club. Quelques clics suffisent, sans compte\u00a0: https://rundata.re/associations?ref=asso-relais";

/** What the proof shows: the clubs read, their events in the coming two weeks, the first few. */
export interface Preuve {
  clubs: number;
  evenements: number;
  prochains: { e: Evenement; quand: string }[];
}

/**
 * The proof, from the agendas' last copies (the questions' bundle, and the scheduled event's for the agendas it alone
 * reads, as the agenda tool does), the proposed events read from the table when no copy has them yet. A club is a name
 * that publishes: each organiser of a proposed event, each club of an agenda; an agenda of clubs read without any event
 * yet counts once.
 */
export async function preuve(cache: Pick<Cache, "bundle">, now: Date): Promise<Preuve> {
  const [bundle, planned] = await Promise.all([cache.bundle(BUNDLE, BUNDLE_SYNC_SECONDS), planifiees(cache)]);
  const names = new Set<string>();
  const all: Evenement[] = [];
  let empty = 0;
  for (const agenda of AGENDAS.filter((a) => a.club)) {
    const hit = agenda.planifie ? copiePlanifiee(planned, agenda)?.value : (bundle.peek(`agenda:${agenda.id}`)?.value as Evenement[] | undefined);
    const list = hit ?? (agenda.id === PROPOSITIONS_ID && lisible() ? await proposes(now) : undefined);
    if (!list) continue;
    // The agendas read from the database are no club of their own: empty, they count none.
    if (!list.length && agenda.id !== PROPOSITIONS_ID && agenda.id !== CONNECTEURS_ID) empty++;
    // The members' sessions (Sportsregions' « Jeu libre », trainings) are not shown to the public: not counted either.
    const open = list.filter((e) => !e.reserve_adherents);
    for (const e of open) names.add(e.publie_par.trim().toLowerCase());
    all.push(...open);
  }
  const p = periode(undefined, now);
  const coming = all
    .map((e) => ({ e, seances: inPeriod(e, p, now) }))
    .filter((x) => x.seances.length)
    .sort((x, y) => x.seances[0].debut.localeCompare(y.seances[0].debut));
  return { clubs: names.size + empty, evenements: coming.length, prochains: coming.slice(0, PROCHAINS).map((x) => ({ e: x.e, quand: when(x.seances[0]) })) };
}

/** « Déjà lu » or « Pas lu », as on /publier. */
const etat = (lu: boolean) => brut(lu ? `<span class="etat lu">Déjà lu</span>` : `<span class="etat non">Pas lu</span>`);

/** The tools a club may already use (§3); « Déjà lu » only for what an agenda here reads. */
const OUTILS: { nom: string; faire: string; temps: string; lu: boolean }[] = [
  {
    nom: "Google Agenda",
    faire: `<ol><li>Créez un agenda à part pour vos événements publics.</li><li>Rendez-le public, avec tous les détails.</li><li>Copiez l'«\u00a0Adresse publique au format iCal\u00a0» et <a href="#lien">envoyez-la à rundata.re</a>.</li></ol><p><a href="/publier#google-agenda">Le pas à pas, avec les erreurs à éviter</a></p>`,
    temps: "10 min, une fois",
    lu: true,
  },
  {
    nom: "Outlook, iPhone, Nextcloud",
    faire: `<p>Publiez un calendrier à part et <a href="#lien">envoyez son lien ICS à rundata.re</a>. <a href="/publier#outlook-nextcloud">Le pas à pas</a></p>`,
    temps: "10 min, une fois",
    lu: true,
  },
  {
    nom: "OpenAgenda",
    faire: `<p>Proposez vos événements à l'agenda de votre commune ou de votre office de tourisme, s'il accepte les contributions. Vos dates apparaissent là où le public les cherche déjà, et sur rundata.re. <a href="/publier#openagenda">Le pas à pas</a></p>`,
    temps: "5 min par événement",
    lu: true,
  },
  {
    nom: "Facebook ou Instagram",
    faire: `<p>rundata.re ne peut pas lire Facebook ni Instagram. Gardez-les pour votre public, et <a href="${PROPOSER_PATH}">proposez chaque événement avec le formulaire</a>, en collant le lien de votre événement Facebook\u00a0: 2 minutes.</p>`,
    temps: "2 min par événement",
    lu: false,
  },
  {
    nom: "HelloAsso",
    faire: `<p><a href="${PROPOSER_PATH}">Proposez l'événement avec le formulaire</a> et collez le lien de votre billetterie HelloAsso\u00a0: on renvoie vers elle pour s'inscrire ou payer.</p>`,
    temps: "2 min par événement",
    lu: false,
  },
  {
    // Sportsregions is not read while its terms forbid it without its accord (src/providers/autorisations.ts).
    nom: "AssoConnect, Sportsregions, Wix, e-monsite, Google Sites",
    faire: `<p><a href="${PROPOSER_PATH}">Proposez l'événement avec le formulaire</a> et collez le lien de votre page.</p>`,
    temps: "2 min par événement",
    lu: false,
  },
];

const REGLES = [
  "C'est gratuit à vie pour les associations à but non lucratif. Pas de compte à créer.",
  "Vos événements restent des données ouvertes (Licence Ouverte 2.0)\u00a0: tout le monde peut les réutiliser, en citant votre association.",
  "rundata.re ne reprend que les faits (titre, date, lieu, prix) et une phrase, avec votre nom et votre lien.",
  "Jamais de téléphone personnel, de nom d'enfant ni d'adresse de domicile\u00a0: seulement ce qui irait sur votre affiche.",
  "Un événement est annulé ou faux\u00a0? Écrivez à contact@rundata.re\u00a0: il est retiré dans la journée.",
];

/** The three steps of the form, for search engines (HowTo). */
function howTo(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Proposer un événement sur rundata.re",
    totalTime: "PT2M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "0" },
    step: [
      { "@type": "HowToStep", position: 1, name: "Remplir le formulaire", text: "Titre, date, heure, lieu, commune, organisateur, une phrase et le prix, sans compte.", url: `${origin}${PROPOSER_PATH}` },
      { "@type": "HowToStep", position: 2, name: "Confirmer par e-mail", text: "Cliquer sur le lien reçu par e-mail pour confirmer l'événement." },
      { "@type": "HowToStep", position: 3, name: "Relecture et publication", text: "L'événement est relu, en général sous 24 heures, puis il s'affiche sur rundata.re et dans les assistants IA, avec le nom de l'association." },
    ],
  };
}

function preuveSection(p: Preuve): Html {
  const count = p.clubs >= CLUBS_MIN
    ? html`<p>${p.clubs} clubs et associations lus par rundata.re\u00a0; ${p.evenements} de leurs événements dans les deux prochaines semaines.</p>`
    : "";
  // Dates over several days (« du mercredi 04/11 à 18:00 au samedi 07/11 à 23:00 ») go under the title on a phone
  // (.fin, as on /evenements): beside it, they left the title a column of 110 px, its words over the date.
  const list = p.prochains.length
    ? html`<ul class="rows eau">${p.prochains.map(({ e, quand }) => html`<li><span>${e.lien ? html`<a href="${href(versBilletterie(e.lien))}" rel="noopener">${e.titre}</a>` : e.titre} <small>${[e.commune, e.publie_par].filter(Boolean).join(" · ")}</small></span><span${quand.startsWith("du ") ? brut(' class="fin"') : ""}>${quand}</span></li>`)}</ul>`
    : html`<p>Les premiers événements de clubs et d'associations arrivent\u00a0: <a href="${PROPOSER_PATH}">proposez le vôtre</a>.</p>`;
  return html`<section aria-labelledby="h-preuve">
  <div class="sec-h"><p class="eyebrow">En direct</p><h2 id="h-preuve">Les prochains événements de clubs et d'associations</h2></div>
  ${count}
  <div class="card">${list}<p><a href="/evenements">Voir tous les événements</a></p></div>
  <p class="note">Sur chaque événement\u00a0: le nom de votre club ou de votre association, un lien vers votre page, et la date à laquelle rundata.re l'a lu ou à laquelle vous l'avez proposé.</p>
</section>`;
}

/** Per page of the directory's search. */
export const PAR_PAGE = 20;
const COMMUNES = Object.keys(INSEE).sort((a, b) => a.localeCompare(b, "fr"));

/** The search in the RNA below the space, as asked by the page's address: ?commune=<slug>&mot=<words>&page=<n>. */
export interface Annuaire {
  maj: string;
  commune?: string;
  mot: string;
  page: number;
  /** Undefined when nothing is asked yet: the form only. */
  trouve?: { liste: rna.Association[]; total: number };
}

/** The search the address asks, read from the table; undefined when the table cannot be read or holds nothing yet. */
export async function annuaire(url: URL): Promise<Annuaire | undefined> {
  if (!rna.lisible()) return undefined;
  try {
    const imp = await rna.importe();
    if (!imp) return undefined;
    const slug = url.searchParams.get("commune") ?? "";
    const commune = COMMUNES.find((c) => slugify(c) === slug);
    const mot = (url.searchParams.get("mot") ?? "").slice(0, 80).trim();
    const page = Math.min(Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1), 500);
    const asked = !!commune || !!rna.requete(mot);
    const trouve = asked ? await rna.chercher({ insee: commune && INSEE[commune], mots: mot, limit: PAR_PAGE, offset: (page - 1) * PAR_PAGE }) : undefined;
    return { maj: imp.maj, commune, mot, page, trouve };
  } catch (err) {
    // The space's page never fails for its directory: shown without it.
    console.error("associations (RNA) non lues :", err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

const SOURCE_RNA = (maj: string) => `Répertoire national des associations, ministère de l'Intérieur, fichier du ${rna.dateDite(maj)} (Licence Ouverte 2.0).`;

/** An association: its title (its site's link when it has one), its commune and year, its object cut, the rest on a click. */
function fiche(a: rna.Association): Html {
  const { debut, suite } = rna.court(a.objet);
  const titre = a.site ? html`<a href="${href(a.site)}" rel="noopener nofollow">${a.titre}</a>` : a.titre;
  const meta = [rna.communeOf(a.insee), a.creee ? `créée en ${a.creee.slice(0, 4)}` : undefined].filter(Boolean).join(" · ");
  const objet = !a.objet
    ? ""
    : suite
      ? html`<details class="pli"><summary>${debut} <span class="aide">la suite</span></summary><p>${a.objet}</p></details>`
      : html`<p>${a.objet}</p>`;
  return html`<li><h3>${titre}</h3><p class="aide">${meta}</p>${objet}</li>`;
}

/** The address of another page of the same search. */
const pageDe = (v: Annuaire, n: number) => {
  const q = new URLSearchParams();
  if (v.commune) q.set("commune", slugify(v.commune));
  if (v.mot) q.set("mot", v.mot);
  if (n > 1) q.set("page", String(n));
  return `${PATH}?${q}#annuaire`;
};

/** The directory's section: the form, then what it found, the source and where an association corrects its entry. */
export function annuaireSection(v: Annuaire): string {
  const options = COMMUNES.map((c) => html`<option value="${slugify(c)}"${c === v.commune ? " selected" : ""}>${c}</option>`);
  const form = html`<form class="card fo" method="get" action="${PATH}#annuaire" role="search">
    <label>Commune <select name="commune"><option value="">toute l'île</option>${options}</select></label>
    <label>Mot <input type="search" name="mot" value="${v.mot}" maxlength="80" placeholder="surf, quartier, parents d'élèves…"></label>
    <p><button type="submit" class="btn">Chercher</button></p>
  </form>`;
  let found: Html | "" = "";
  if (v.trouve) {
    const { liste, total } = v.trouve;
    const where = v.commune ? ` à ${v.commune}` : " à La Réunion";
    const said = rna.requete(v.mot) ? ` pour «\u00a0${v.mot}\u00a0»` : "";
    const pages = Math.ceil(total / PAR_PAGE);
    const nav = pages > 1
      ? html`<p class="note">${v.page > 1 ? html`<a href="${href(pageDe(v, v.page - 1))}">Page précédente</a> · ` : ""}page ${v.page} sur ${pages}${v.page < pages ? html` · <a href="${href(pageDe(v, v.page + 1))}">Page suivante</a>` : ""}</p>`
      : "";
    found = total
      ? html`<p><strong>${total.toLocaleString("fr-FR")} association${total > 1 ? "s" : ""} déclarée${total > 1 ? "s" : ""}${where}${said}</strong></p>
  <ul class="card asso-liste">${liste.map(fiche)}</ul>${nav}`
      : html`<p>Aucune association déclarée${where}${said}. Essayez un mot plus court ou plus général, ou toute l'île.</p>`;
  }
  return html`<section id="annuaire" aria-labelledby="h-annuaire">
  <div class="sec-h"><p class="eyebrow">Annuaire</p><h2 id="h-annuaire">Les associations déclarées à La Réunion</h2>
  <p>Cherchez une association par commune et par mot\u00a0: son nom, son objet, son année de création et son site, tels que le répertoire national les publie. Aucune adresse n'est donnée.</p></div>
  ${form}
  ${found}
  <p class="note">Source\u00a0: ${SOURCE_RNA(v.maj)} Une association dissoute sans l'avoir déclaré peut y figurer encore. rundata.re ne corrige rien\u00a0: une association corrige sa fiche auprès du greffe des associations, ${brut(lienNom(rna.CORRIGER, "démarche sur service-public.fr", ' rel="noopener"'))}.</p>
</section>`.texte;
}

export function associationsPage(origin: string, p: Preuve, alerte?: Alerte, rep?: Annuaire): string {
  const band = html`${brut(crumbBar("Clubs et associations"))}
<div class="wrap intro solo"><div class="pitch">
  <p class="pill">Gratuit, sans compte</p>
  <h1>${H1}</h1>
  <p class="lead">${ESPRIT}</p>
  <p class="slogan" lang="${brand.slogan_lang}">${KREOL}</p>
</div></div>`;
  const cards = OUTILS.map((o, i) => html`${i ? brut("\n  ") : ""}<li class="card outil"><h3>${o.nom}</h3>
    <p class="aide">Ce qu'il faut faire</p>${brut(o.faire)}
    <p class="aide">Temps\u00a0: ${o.temps} · rundata.re\u00a0: ${etat(o.lu)}</p></li>`);
  const body = html`<section class="card proposer" aria-labelledby="h-proposer">
  <h2 id="h-proposer">Proposer un événement, en 2\u00a0minutes</h2>
  <p>Un match, une kermesse, une sortie, un concert\u00a0? Remplissez le formulaire, avec ou sans page Facebook, sans compte. Il est relu, puis il s'affiche sur rundata.re et dans les assistants IA, avec le nom de votre association.</p>
  <p><a class="btn sun" href="${PROPOSER_PATH}">Proposer un événement</a></p>
</section>
${connecteurs.enLigne() ? brut(connecteurs.carte()) : ""}
${preuveSection(p)}
<section aria-labelledby="h-outils">
  <div class="sec-h"><h2 id="h-outils">Votre club utilise déjà un agenda\u00a0?</h2><p>Pour ne plus rien saisir deux fois\u00a0: ce qu'il faut faire, selon l'outil.</p></div>
  <ul class="outils">
  ${cards}
  </ul>
</section>
${brut(lienForm(PATH))}
<section aria-labelledby="h-propre">
  <div class="sec-h"><h2 id="h-propre">Vous voulez faire propre\u00a0?</h2>
  <p>Le guide complet montre comment publier vos événements en flux ouvert, lisible par rundata.re et par tous\u00a0: Google Agenda, OpenAgenda, WordPress, tableur, data.gouv.fr. <a href="/publier">Lire le guide</a></p></div>
</section>
<section aria-labelledby="h-regles">
  <div class="sec-h"><h2 id="h-regles">Les règles</h2></div>
  <ul class="card">${REGLES.map((r) => html`<li>${brut(adresseTexte(r))}</li>`)}</ul>
  <p class="note">Les événements proposés, en données ouvertes\u00a0: <a href="${ICS_PATH}">agenda ICS</a> · <a href="${JSON_PATH}">JSON</a> (Licence Ouverte 2.0).</p>
</section>
<section aria-labelledby="h-relais">
  <div class="sec-h"><h2 id="h-relais">Faites passer</h2><p>Le texte à transmettre aux autres clubs et associations\u00a0:</p></div>
  <div class="card fo"><p id="relais">${brut(adressesCoupables(RELAIS, true))}</p>
  <p><button type="button" data-copy="relais">Copier le texte</button> <a class="sh wa" href="${href(`https://wa.me/?text=${encodeURIComponent(RELAIS)}`)}" target="_blank" rel="noopener">Partager sur WhatsApp</a></p></div>
</section>
${rep ? brut(annuaireSection(rep)) : ""}
<p>Une question\u00a0? ${brut(lienNom("mailto:contact@rundata.re", "contact@rundata.re"))}</p>
${brut(TURNSTILE_SCRIPT)}`;
  // A search's own address is not a page to index: the space's is.
  const asked = !!rep && (!!rep.commune || !!rep.mot || rep.page > 1);
  return layout(origin, { title: TITLE, description: META, path: PATH, jsonld: [crumbs(origin, "Clubs et associations", PATH), webPage(origin, PATH, TITLE, META, null), howTo(origin)], alerte, sansPartage: true, ...(asked ? { noindex: true } : {}) }, band.texte, body.texte);
}
