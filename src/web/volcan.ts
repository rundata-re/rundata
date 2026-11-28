/**
 * The volcano's page (/volcan): the Piton de la Fournaise's alert, the OVPF's bulletins, the earthquakes and the Enclos'
 * access. Moved out of domains.ts as it was; the helpers common to every domain's page stay there.
 */
import { lienAlertes } from "./alertes-drapeau.js";
import { OVPF, OVPF_FACEBOOK, PREFECTURE } from "../providers/volcan.js";
import { BULLETIN_QUOTIDIEN, CAMERAS_OVPF, depthText, enImages, enImagesApres, IMAGE_APRES, IMAGE_LUE_APRES, givenAt, JOURS_SUIVANTS, type Jour, jusquALecture, LOCALISES, LOCALISES_LIEN, LU_DANS_L_IMAGE, NIVEAU_ILLISIBLE, NON_ANNONCEE, NON_LU, ORSEC_BAN, ovpfNiveau, pitonLines, VIGILANCE_ENCLOS } from "../tools/volcan.js";
import { type Ligne, NIVEAUX, TITRE, VERSION } from "../tools/volcan-acces.js";
import { PATH as SANS_REPONSE } from "./sans-reponse.js";
import { SOMMET } from "../providers/seismes.js";
import { ANNONCERONT, alerteVolcan, BLUESKY_SEUL, ENCLOS, followOvpf, levelSaid, mediaSection, releaseCard, tileLive, type VolcanAlerte, volcanH1, volcanLead, volcanMeta, volcanTitle } from "./volcan-alerte.js";
import type { Cached } from "../cache.js";
import { fr } from "../tools/format.js";
import { type ActualitesAnswer, type Alerte, type Enclos, type VolcanAnswer } from "./data.js";
import { localTime } from "../geo.js";
import { islandMap } from "./map.js";
import { brut, echappe, href, html, type Html } from "./html.js";
import { adressesCoupables, ask, empty, icon, layout, type Live, leAt, readAt } from "./pages.js";
import * as historique from "../tools/volcan-historique.js";
import { FOURNAISE, connectorCta, crumbBar, crumbs, dd, enclosShort, lienNom, loading, sourcesNote, warnings, webPage } from "./domains.js";
// ---------------------------------------------------------------- volcan

const md = (m: number | null) => (m == null ? "—" : fr(Math.round(m * 10) / 10));
const releaseLink = (c: NonNullable<Enclos["communique"]>) => html`<a href="${href(c.lien)}">communiqué de la préfecture du ${dd(c.jour)}</a>`;
// The release's words in bold and its day linked, « Accès à l'Enclos : <b>« fermeture »</b> selon le <a>communiqué de la
// préfecture du 23/10</a> »; or its level, the ban the plan's: « Alerte 2-1 selon le <a>…</a> : accès à l'Enclos
// <b>interdit</b> à ce niveau (dispositif ORSEC Volcan) ».
const releaseSaid = (c: NonNullable<Enclos["communique"]>, du = releaseLink(c)) =>
  c.mots
    ? html`Accès à l'Enclos : <b>${`« ${c.mots} »`}</b> selon le ${du}`
    : html`${c.niveau!} selon le ${du} : ${brut(ORSEC_BAN.replace("interdit", "<b>interdit</b>"))}`;
const enclosSaid = (x: Enclos): Html =>
  x.communique?.mots
    ? html`Enclos : <b>${`« ${x.communique.mots} »`}</b> selon le ${releaseLink(x.communique)}.`
    : x.communique
      ? html`${releaseSaid(x.communique)}.`
      : x.ovpf
        ? html`${x.ovpf.niveau} selon l'OVPF : ${brut(ORSEC_BAN.replace("interdit", "<b>interdit</b>"))}.`
        : x.vigilance
          ? html`${VIGILANCE_ENCLOS}`
          : html`Accès à l'Enclos : à vérifier sur ${brut(GOUV)}, avant de partir.`;
// The card's title.
const ENCLOS_TITRE = "Accès à l'Enclos";
const OVPF_LINK = `<a href="${OVPF.url}">${OVPF.url.replace("https://", "")}</a>`;
// A text of ours with the OVPF's link, or a post's, in it: escaped, then the link put back as a link.
const linked = (t: string, url: string, a: string) => brut(echappe(t).replace(echappe(url), a));

// The OVPF's Facebook page, which rundata.re does not read: a link only, no embed.
const FACEBOOK_LINE = html`<p class="lead">L'OVPF publie aussi sur Facebook, que rundata.re ne lit pas : <a href="${href(OVPF_FACEBOOK)}">suivre sa page officielle ↗</a></p>`;
/** After « …est en images, qui ne sont pas lues : »: the post on Bluesky, and the OVPF's Facebook page, where the same post may not be. */
export const imageLinks = (lien: string) => html`<a href="${href(lien)}">la voir sur Bluesky ↗</a>, ou suivre <a href="${href(OVPF_FACEBOOK)}">l'OVPF sur Facebook ↗</a>`.texte;

// Where the prefecture publishes each phase of the ORSEC volcano plan.
const GOUV = `${lienNom(PREFECTURE.url, "reunion.gouv.fr")}`;

/**
 * Escaped text whose « , » never starts a line: Chrome and Safari cut a word with its comma between the two when the word
 * fits its line and the comma does not (« …de la Fournaise » then « , 1 km » on /volcan at 160 px, Safari's page zoom at
 * 200 % on a 320 px screen). Each « , » followed by a space goes in a .virg (style.ts), where it takes no room: it hangs past
 * the end of the line, in the card's padding, and the space after it is widened by as much, so that the words around it
 * stay where they were. In the text between the tags only; the text read and copied is the same.
 */
export function virgulesTenues(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((x, i) => (i % 2 ? x : x.replaceAll(", ", '<span class="virg">, </span>')))
    .join("");
}

/** `news`: the news copy, read during an alert only, for what the media say of it. */
export function volcanPage(origin: string, data: Cached<VolcanAnswer> | null, now = new Date(), alerte?: Alerte, news?: ActualitesAnswer): string {
  const d = data?.value;
  const a = alerteVolcan(d);
  const e = d?.etat;
  // « … dans les textes que nous avons lus jusqu'au 06/11 à 14:27. »: a copy of the page never says it of another day.
  const nonAnnoncee = data ? NON_ANNONCEE.replace(/\.$/, ` jusqu'au ${leAt(data.fetchedAt).replace(/^le /, "")}.`) : NON_ANNONCEE;
  // « indisponible » when the OVPF's catalogue did not answer (tools/volcan.ts).
  const q = typeof d?.seismes === "object" ? d.seismes : undefined;
  // The catalogue silent: the counts are of its last copy, said with the time of that read.
  const jusqua = q?.lus_jusqu_au ? `, ${jusquALecture(q.lus_jusqu_au)}` : "";
  const url = `${origin}/volcan`;
  // Under an alert, the OVPF's newest post in images, newer than the release: said once, with its time, at the top;
  // IMAGE_APRES is then not said.
  const p0 = Array.isArray(d?.publications_ovpf) ? d.publications_ovpf[0] : undefined;
  const folded = !!a && !a.eruption && !a.arret && !!e && !!e.image_ovpf_plus_recente && !!p0?.lien;
  // Its text read in the first image: said so, the text open on its card (providers/ovpf-ocr.ts).
  const lu = !!p0?.texte_lu_dans_l_image;
  const apres = lu ? IMAGE_LUE_APRES : IMAGE_APRES;
  // pitonlive.com, after the official source, as its own; the OVPF's level, newer than the release.
  const piton = e?.pitonlive_non_officiel
    ? pitonLines(e.pitonlive_non_officiel, !!e.niveau_inconnu, OVPF.url).map((x) => html`<p class="lead">${linked(x, OVPF.url, OVPF_LINK)}</p>`)
    : "";
  const ovpf = e?.niveau_ovpf
    ? html`<p class="lead">${linked(ovpfNiveau(e.niveau_orsec, givenAt(e.niveau_ovpf.date), e.niveau_ovpf.lien), e.niveau_ovpf.lien, html`<a href="${href(e.niveau_ovpf.lien)}">lien</a>`.texte)}</p>`
    : "";
  // The IPGP's site silent, with the list of the silent sites: at the top out of an alert, with the
  // official texts during one, where it says what may be missing.
  const silent = d?.injoignable ? html`<p class="note">${d.injoignable} <a href="${SANS_REPONSE}">Voir les sites sans réponse</a>.</p>` : "";
  const m = d?.puis_je_monter;

  // During an alert, five lines at most under the heading, each fact once: no eruption announced (whose words), the
  // Enclos with the way to the detail, whose the level is, the OVPF's newest post in images, the OVPF's accounts
  // (wording validated on 26/10/2026). The level's words are in the heading, the decree in « Les niveaux du dispositif ».
  const [jour, heure] = (p0?.date.split(" ") ?? []) as [string, string];
  const top = (a: VolcanAlerte) =>
    html`<p class="lead"><b>${!a.eruption && !a.arret ? nonAnnoncee : volcanLead(a)}</b></p><p class="lead"><b>${ENCLOS}</b>${m ? html` <a href="#monter">Routes et sentiers, lieu par lieu ↓</a>` : ""}</p>${a.niveau ? html`<p class="note">${levelSaid(a)}</p>` : ""}${ovpf}${piton}${folded
      ? html`<p class="note">${lu
        ? html`${enImages(jour, heure)} : <a href="#ovpf">son texte, lu automatiquement, plus bas ↓</a>`
        : html`${enImagesApres(jour, heure)} : <a href="${href(p0!.lien!)}">la voir sur Bluesky ↗</a>`}</p>`
      : e?.image_ovpf_plus_recente ? html`<p class="lead">${apres}</p>` : ""}<p class="note">${brut(followOvpf())}</p>`;

  const status = !d
    ? brut(loading("L'état du volcan"))
    : html`<div class="status">${e && a
      ? top(a)
      : e
      ? html`${e.niveau_inconnu
          // No official level read nor kept: why, then pitonlive as a last resort.
          ? html`<p class="lead">${nonAnnoncee} ${brut(echappe(NIVEAU_ILLISIBLE).replace("reunion.gouv.fr", GOUV))}</p>`
          : html`<p class="lead">${nonAnnoncee} Niveau du dispositif ORSEC volcan : <b>${e.niveau_orsec}</b>.${e.niveau_definition ? html` <span class="note">${e.niveau_definition}</span>` : ""}${!e.eruption_en_cours && e.derniere_eruption ? html` Dernière éruption : <b>${historique.derniereEruptionDates(e.derniere_eruption)}</b>, selon l'<a href="${href(e.derniere_eruption.lien)}" rel="noopener">OVPF</a>.` : ""}</p>`}${
        // Under the level: the OVPF's Facebook page, high on the page too.
        FACEBOOK_LINE}${silent}${ovpf}${piton}<p class="lead">${enclosSaid(e.acces_enclos ?? {})}</p>${e.image_ovpf_plus_recente ? html`<p class="lead">${apres}</p>` : ""}`
      : html`<p class="lead">${d.resume}</p>`}${q && !a ? html`<p class="lead">Séismes localisés par l'OVPF sous le volcan${jusqua} : <b>${q.sous_le_volcan["7_jours"]}</b> en 7 jours, <b>${q.sous_le_volcan["30_jours"]}</b> en 30 jours.</p>` : ""}</div>`;

  // Out of an alert, the Enclos as the texts say it, on its card; during one, in « Puis-je monter au volcan ? », whose
  // card takes id="enclos" (/trafic sends its readers there for the trails).
  const enclos = !a && e
    ? html`<div class="card" id="enclos">${brut(icon("mountain"))}<h3>${ENCLOS_TITRE}</h3><p>${enclosSaid(e.acces_enclos ?? {})}</p>${
      // The trails the ONF says open, place by place, are in « Puis-je monter au volcan ? ».
      e.acces_enclos?.vigilance ? html`<p class="note"><a href="#monter">${TITRE} →</a></p>` : ""}</div>`
    : "";

  const ABOVE_SEA = "Profondeur comptée depuis le niveau de la mer ; « − » : au-dessus, sous le sommet (vers 2,6 km d'altitude).";
  // During an alert, five at most, one line each at 390 px: « 24/10 16:55 · magnitude 1,2 · sommet, 0 km », the
  // section saying « sous le volcan » already.
  // « sommet, 0,1 km » kept whole, the line breaking before it, never inside; a longer place breaks as words.
  const where = (s: NonNullable<typeof q>["derniers"][number]) => {
    // Counted from the sea level (note under the list): above it under the summit, « −1,2 km ».
    const at = `${s.lieu === SOMMET ? "sommet" : s.lieu}, ${s.profondeur_km < 0 ? "−" : ""}${fr(Math.abs(s.profondeur_km))} km`;
    return at.length <= PLACE_WHOLE ? at.replace(/ /g, " ") : at;
  };
  const quakeRow = (s: NonNullable<typeof q>["derniers"][number]) =>
    a
      ? html`<li>${s.heure.replace(" heure de La Réunion", "")} · magnitude <b>${md(s.magnitude)}</b> · ${where(s)}</li>`
      : html`<li><b>${md(s.magnitude)}</b> <span>${brut(virgulesTenues(echappe(`${s.lieu}, ${depthText(s.profondeur_km)}`)))}</span> <span class="note">${s.heure.replace(" heure de La Réunion", "")}</span></li>`;
  const quakes = q
    ? html`<div class="card">${brut(icon("gauge"))}<h3>Séismes localisés par l'OVPF</h3>${quakeDays(q.par_jour_sous_le_volcan, e?.image_ovpf_plus_recente && !folded && !a ? apres : undefined)}${a
        ? html`<p class="facts"><span>Sous le volcan${jusqua} : <b>${q.sous_le_volcan["7_jours"]}</b> en 7 jours, <b>${q.sous_le_volcan["30_jours"]}</b> en 30 jours, magnitude max ${md(q.sous_le_volcan.magnitude_max_30j)}</span> <span>Ailleurs sur l'île : <b>${q.ailleurs_sur_l_ile["30_jours"]}</b> en 30 jours, magnitude max ${md(q.ailleurs_sur_l_ile.magnitude_max_30j)}</span></p>`
        : html`<p class="facts"><span>Sous le volcan${jusqua} : <b>${q.sous_le_volcan["30_jours"]}</b> en 30 jours, magnitude max ${md(q.sous_le_volcan.magnitude_max_30j)}</span> <span>Ailleurs sur l'île : <b>${q.ailleurs_sur_l_ile["30_jours"]}</b>, magnitude max ${md(q.ailleurs_sur_l_ile.magnitude_max_30j)}</span></p>`}${
      q.derniers.length ? html`<ul class="rows${a ? " seismes" : ""}">${q.derniers.slice(0, a ? 5 : undefined).map(quakeRow)}</ul>` : ""}${
      // The short rows give a depth above the sea level as « −1,2 km »: said once under them.
      a && q.derniers.slice(0, 5).some((s) => s.profondeur_km < 0) ? html`<p class="note">${ABOVE_SEA}</p>` : ""}${
      // LOCALISES once, under the day counts.
      ""}<p class="note">${q.copie ? html`${q.copie} ` : ""}${q.note.replace(` ${LOCALISES}`, "")}</p></div>`
    : "";

  // The alerts before this one, from the releases (tools/volcan-historique.ts): the same list whatever the copy says.
  const moment = (m: historique.Moment): Html =>
    // Non-breaking spaces inside the quotes and before the colon: a lone « at the end of a line at 390 px.
    html`<li><b>${historique.date(m.jour)}</b>, ${m.quoi} : « ${m.dit} » <a href="${href(m.communique.copie)}">${historique.label(m.communique)} →</a></li>`;
  const episodes = (list: historique.Episode[]) =>
    html`<ul class="posts">${list.map((x) => html`<li class="card"><p class="note">Début</p><ul class="plain">${x.debut.map(moment)}</ul><p class="note">Fin</p><ul class="plain">${moment(x.fin)}</ul>${x.puis ? then(x.puis) : ""}</li>`)}</ul>`;
  // « Le même jour, nouvelle alerte 2-2 : « … » (communiqué du 19/02/2019 →). Sa fin n'est pas… ».
  const then = (m: historique.Moment) =>
    html`<p>${historique.PUIS} ${m.quoi} : « ${m.dit} » (<a href="${href(m.communique.copie)}">${historique.label(m.communique)} →</a>). ${historique.SANS_FIN}</p>`;
  // Before the plan of 2021, folded: as many cards again at 390 px, under the levels of the plan then.
  // A release of the prefecture newer than the list's last day, said under its title.
  const alertes = historique.liste(d?.releve);
  const depuisListe = historique.depuis(e?.communique_prefecture, alertes);
  const before = html`<section id="alertes-precedentes" aria-labelledby="h-alertes"><div class="sec-h"><h2 id="h-alertes">${historique.TITRE}</h2><p>${historique.CHAPEAU}</p>${depuisListe ? html`<p class="note">${depuisListe}</p>` : ""}</div>
  ${episodes(alertes.filter((e) => !historique.avant2021(e)))}
  <details><summary>${historique.avantTitre(alertes.filter(historique.avant2021).length)}</summary><p class="note">${historique.AVANT_2021}</p>${episodes(alertes.filter(historique.avant2021))}</details>
  <p class="note">${historique.note(alertes)}</p></section>
`;

  // The text read in a post's first image, folded under what it is (draft); open on the first card during an
  // alert, which the top of the page leads to.
  const readText = (t: string, open: boolean) => html`<details${open ? " open" : ""}><summary>${LU_DANS_L_IMAGE}</summary>${t.split("\n\n").map((x) => html`<p>${x}</p>`)}</details>`;
  const list = Array.isArray(d?.publications_ovpf) ? d.publications_ovpf.slice(0, a ? 3 : 4) : [];
  const cards = list.length
    ? html`<ul class="posts" id="ovpf">${list.map((p, i) => html`<li class="card"><p class="note">${p.date}</p><p>${brut(adressesCoupables(p.texte))}</p>${p.texte_lu_dans_l_image ? readText(p.texte_lu_dans_l_image, !!a && i === 0) : ""}${p.lien ? html`<p><a href="${href(p.lien)}">${p.image ? "Voir les images sur Bluesky" : "Lire le message"} →</a></p>` : ""}</li>`)}</ul>`
    : "";
  // During an alert, the official texts in one section: the prefecture's release, then the OVPF's posts.
  const official = a
    ? html`<section id="annonces" aria-labelledby="h-officiel"><div class="sec-h"><h2 id="h-officiel">Les annonces officielles</h2><p>${!a.eruption && !a.arret ? `${ANNONCERONT} ${BLUESKY_SEUL}` : BLUESKY_SEUL}</p></div>${silent}${brut(releaseCard(a))}${cards}</section>`
    : cards
    ? html`<section aria-labelledby="h-ovpf"><div class="sec-h"><p class="eyebrow">L'observatoire</p><h2 id="h-ovpf">Ce que publie l'OVPF</h2>
  <p>Les derniers messages de l'Observatoire volcanologique du Piton de la Fournaise (IPGP), repris tels quels.</p></div>
  ${cards}</section>`
    : "";

  // In vigilance from the prefecture's release, said with « pas d'éruption annoncée »; no official level, the state of
  // the volcano, the reason right under it.
  const vigilance = !a && !!e && !e.niveau_inconnu && e.niveau_orsec === "Vigilance";
  const heading = a ? volcanH1(a) : vigilance ? "Piton de la Fournaise : vigilance, pas d'éruption annoncée" : e?.niveau_inconnu ? "Piton de la Fournaise : état du volcan" : undefined;
  // A state in the title says the day it was read (volcanTitle); « état du volcan » and the default say none. Vigilance
  // keeps within the 60 characters a search engine shows: « pas d'éruption annoncée » is in the h1, right under it.
  const read = data?.fetchedAt ?? now;
  const title = a
    ? volcanTitle(a, read)
    : vigilance ? `Piton de la Fournaise au ${localTime(read).slice(0, 5)} : vigilance · 974` : heading ? `${heading} · 974` : "Piton de la Fournaise en direct : éruption, séismes · 974";
  // Out of an alert, timeless: search engines keep it for days, a state in it would go stale.
  const description = a
    ? volcanMeta(a)
    : "Piton de la Fournaise en direct : niveau d'alerte d'après la préfecture, publications de l'OVPF, accès à l'Enclos, séismes localisés sous le volcan.";

  const question = brut(ask(`Volkan la pété ? Gèt si ${url} é di amwin si lanklo lé ouvèr.`,
    `Le Piton de la Fournaise est-il en éruption ? Lis ${url} et dis-moi aussi si l'Enclos est ouvert.`));
  // During an alert, the question to an assistant goes to the foot of the page, and the island's map leaves phones: it
  // shows where the volcano is, which everyone knows.
  const band = html`${brut(crumbBar("Volcan"))}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Volcan en direct</p>
    <h1>${heading ? heading : html`Piton de la Fournaise <span class="n974">974</span>`}</h1>
    ${status}
    ${brut(lienAlertes())}
    ${a ? "" : question}
  </div>
  <figure class="card mapcard nophone">${brut(islandMap({ pin: FOURNAISE, label: "Carte de La Réunion (974) avec le Piton de la Fournaise" }))}</figure>
</div>`;

  // « Puis-je monter au volcan ? », first: the official texts place by place, and the levels of the plan.
  // A non-breaking space before our colons, never inside a quote: no « : » alone at the start of a line.
  const colons = (s: string) => s.split(/(«[^»]*»)/).map((x, i) => (i % 2 ? x : x.replace(/ :/g, " :"))).join("");
  const line = (l: Ligne) =>
    html`<li>${brut(colons(echappe(l.texte)))}${l.source ? html` (${l.lien ? html`<a href="${href(l.lien)}">${l.source} →</a>` : l.source}).` : l.lien ? html` (<a href="${href(l.lien)}">la source →</a>).` : ""}</li>`;
  const monter = m
    ? html`<section id="monter" aria-labelledby="h-monter"><div class="sec-h"><h2 id="h-monter">${m.titre}</h2><p>${m.chapeau}</p></div>
  <div class="card"${a ? brut(` id="enclos"`) : ""}>${m.avant ? html`<p><b>${m.avant}</b></p>` : ""}<ul class="plain">${m.lignes.map(line)}</ul><p class="note">${m.pied}</p>
  <details><summary>Les niveaux du dispositif</summary><ul class="plain">${NIVEAUX.map((n) => html`<li><b>${n.niveau}</b> : « ${n.libelle} »</li>`)}</ul><p class="note"><small>${VERSION}</small></p></details></div></section>
`
    : "";

  // One question a block, in the order they come: may I go up, what the official texts say, what is measured, what the
  // media say, what came before (wording validated on 26/10/2026). « À savoir » stays in the tool: during an alert, the foot of
  // « Puis-je monter au volcan ? » says it.
  const measured = html`<section id="seismes" aria-labelledby="h-volcan">
  <div class="sec-h"><p class="eyebrow">En ce moment</p><h2 id="h-volcan">${a ? "Séismes sous le volcan" : html`L'Enclos et les séismes`}</h2></div>
  ${d ? html`${a ? quakes : html`<div class="two">${enclos}${quakes}</div>`}${a ? "" : brut(warnings(d.avertissements))}${data ? brut(sourcesNote(d.sources, data)) : ""}` : html`<p class="card">Les données du volcan se chargent : rechargez la page dans quelques secondes.</p>`}
  <p><a href="${href(CAMERAS_OVPF.lien)}">${CAMERAS_OVPF.texte}</a> (sur le site de l'observatoire).</p>
</section>
`;
  const body = html`${monter}${official}${measured}${a ? brut(mediaSection(news)) : ""}${before}${a ? html`<section aria-label="Demandez à votre IA"><div class="card">${question}</div></section>` : ""}
${brut(connectorCta("volcan_seismes", "le volcan"))}`;

  // Its heading and the official blocks say all the banner would: no banner here.
  return layout(origin, { title, description, path: "/volcan", jsonld: [crumbs(origin, "Volcan", "/volcan"), webPage(origin, "/volcan", title, description, data)], alerte, volcan: !!a, iaAside: true }, band.texte, body.texte);
}

// A place of an earthquake row this long or shorter never breaks inside: about a third of a line at 390 px.
const PLACE_WHOLE = 20;
// Below this many a day, the bars keep their scale: one event must not fill the chart (no scale that
// magnifies a small number, the axis at 0).
const DAYS_SCALE_MIN = 10;

/**
 * The events located under the summit per day, as bars from 0, today marked « en cours »; each
 * bar says its day and count to screen readers, and the line under it today's, yesterday's and the highest. The
 * catalogue silent: the day of its last read « jusqu'à » that time, the days after it hatched, « non lu », no bar.
 */
function quakeDays(days: Jour[] | undefined, imageAfter: string | undefined): Html | "" {
  if (!days?.length) return "";
  const dd = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
  const read = days.filter((j) => !("non_lu" in j)) as Exclude<Jour, { non_lu: true }>[];
  const scale = Math.max(DAYS_SCALE_MIN, ...read.map((j) => j.nombre));
  const bars = days.map((j) => "non_lu" in j
    ? html`<li class="nolu" aria-label="${dd(j.jour)} : ${brut(NON_LU)}"></li>`
    : html`<li${j.en_cours ? brut(` class="now"`) : ""} aria-label="${dd(j.jour)}${j.en_cours ? " (en cours)" : j.jusqu_a ? html` (jusqu'à ${String(j.jusqu_a)})` : ""} : ${j.nombre}"><i style="height:${Math.round((j.nombre / scale) * 100)}%"></i></li>`);
  const today = days.at(-1)!;
  const last = read.at(-1);
  const top = read.reduce<typeof last>((a, j) => (!a || j.nombre > a.nombre ? j : a), undefined);
  // The day before today, counted whole: only when today is.
  const yesterday = "en_cours" in today ? read.at(-2) : undefined;
  // « Le plus en un jour »: not to be read as a total over the 30 days.
  const facts = html`${"en_cours" in today
    ? html`Aujourd'hui (en cours) : <b>${today.nombre}</b>${yesterday ? html`, hier : <b>${yesterday.nombre}</b>` : ""}.`
    : html`${last?.jusqu_a ? html`Le ${dd(last.jour)} jusqu'à ${brut(String(last.jusqu_a))} : <b>${last.nombre}</b>. ` : ""}${brut(JOURS_SUIVANTS)}`}${
    top?.nombre ? html` Le plus en un jour sur ${"en_cours" in today ? "" : "ces "}30 jours : <b>${top.nombre}</b>, le ${dd(top.jour)}.` : ""}`;
  const end = html`${dd(today.jour)}${"en_cours" in today ? " (en cours)" : "non_lu" in today ? html` (${brut(NON_LU)})` : ""}`;
  return html`<figure class="qdays"><figcaption>Sous le volcan, par jour (heure de La Réunion)</figcaption><ol>${bars}</ol><p class="axis"><span>${dd(days[0].jour)}</span> <span>${end}</span></p></figure><p>${facts}</p><p class="note">${LOCALISES_LIEN[0]} <a href="${BULLETIN_QUOTIDIEN}">bulletin quotidien</a> ${LOCALISES_LIEN[1]}</p>${imageAfter ? html`<p class="note">${imageAfter}</p>` : ""}`;
}

export function volcanLive(data: Cached<VolcanAnswer> | null, now = new Date()): Live | undefined {
  if (!data) return undefined;
  const e = data.value.etat;
  // Nothing on an eruption either way: the page says what the texts read say.
  if (!e) return empty(`Textes de l'OVPF et de la préfecture lus ${readAt(data.fetchedAt, now).a} : état du volcan à lire sur la page.`);
  const a = alerteVolcan(data!.value);
  if (a) return tileLive(a);
  const q = typeof data!.value.seismes === "object" ? data!.value.seismes : undefined;
  const enclos = enclosShort(e.acces_enclos);
  // What the texts read say, never « no eruption » on our word, nor pitonlive's.
  const lus = `OVPF et préfecture, textes lus ${leAt(data!.fetchedAt)}`;
  return {
    valeur: "Pas d'éruption annoncée",
    detail: [
      echappe(lus),
      echappe(`Enclos : ${enclos.valeur} (${enclos.source})`),
      q ? `${q.sous_le_volcan["7_jours"]} séisme${q.sous_le_volcan["7_jours"] > 1 ? "s" : ""} localisé${q.sous_le_volcan["7_jours"] > 1 ? "s" : ""} par l'OVPF sous le volcan en 7 jours${q.lus_jusqu_au ? `, ${jusquALecture(q.lus_jusqu_au)}` : ""}` : undefined,
    ].filter(Boolean).join(" · "),
    // In the hero, where the detail is not shown; on a line of its own, never cut with the value.
    source: echappe(lus),
  };
}
