/**
 * The trails' page (/sentiers): the ONF's trails open or closed, its notices, and the fire risk of the massifs.
 * Moved out of domains.ts as it was; the helpers common to every domain's page stay there.
 */
import type { Cached } from "../cache.js";
import { type Alerte, type SentiersAnswer } from "./data.js";
import { esc, islandMap, type Marker } from "./map.js";
import { type Cle, legende } from "./carte-legende.js";
import { anchorId, ask, DESCRIPTION_MAX, FOLD_ROWS, folded, icon, layout, leAt } from "./pages.js";
import { faqPage, texteStable, type Faq } from "./texte-stable.js";
import * as onf from "../providers/sentiers.js";
import * as fire from "../tools/feux.js";
import * as feux from "../providers/feux.js";
import { closedTrails, connectorCta, describe, etatOnf, hikeCrumbBar, hikeCrumbs, loading, onfCarte, onfDay, onfDot, onfRead, sectorLinks, sourcesNote, warnings, webPage } from "./domains.js";

/**
 * The hot spots seen by satellite, on the island's map: a brown-red triangle (charter of the maps), its shape saying
 * what it is, neither the orange of the cyclone alert nor the red of « fermé ».
 */
export const fireMarkers = (f: feux.Feux | undefined, now: Date): Marker[] =>
  (f?.detections ?? []).map((d, i) => ({ lon: d.lon, lat: d.lat, label: "", name: `${fire.listLine(d, now)} (${feux.LABEL})`, round: true, triangle: true, color: FIRE_COLOR, quiet: true,
    place: "Point chaud vu par satellite", say: fire.listLine(d, now), href: `#${fireId(i)}` }));

const FIRE_COLOR = "#7c2d12";
const CLOSED_COLOR = "#e3262d";

/** The two marks of the maps of fires and trails, in their legend (marketing's words). */
export const CLE_FEU: Cle = { forme: "triangle", couleur: FIRE_COLOR, dit: "Point chaud détecté par satellite, pas forcément un feu." };
export const CLE_FERME: Cle = { forme: "rond", couleur: CLOSED_COLOR, texte: "×", dit: "Sentier fermé" };

/** « Carte de l'ONF du 20/10, relue le 04/11 à 14:05 », for the map of /sentiers and the fires'. */
export const onfMap = (d?: SentiersAnswer) => onfRead(d?.carte_mise_a_jour, d?.carte_lue);

/** A fire's line in the list of the page, where its marker leads: the list and the markers follow the same order. */
export const fireId = (i: number) => `f-${i + 1}`;

/** The closed trails on the map, each to its line among the closed trails (`page`: of /sentiers, from another page). */
export const closedMarkers = (s: SentiersAnswer | undefined, page = ""): Marker[] => {
  const listed = new Set((s?.fermes_par_commune ?? []).flatMap((c) => c.sentiers_fermes.map((t) => t.sentier)));
  return (s?.points ?? []).map((p) => ({ lon: p.lon, lat: p.lat, label: "×", name: `${p.nom}\u00a0: fermé`, round: true, color: CLOSED_COLOR, quiet: true,
    ...(listed.has(p.nom) ? { place: p.nom, say: "sentier fermé", href: `${page}#${anchorId("t", p.nom)}` } : {}) }));
};

/** The section of the fires seen by satellite (worded by marketing): the emergency numbers always, a quiet day said as such. */
export function firesSection(f: feux.Feux | undefined, now: Date): string {
  if (!f) return "";
  const list = f.detections.length
    ? `<ul class="rows eau">${f.detections.map((d, i) => `<li class="tgt" id="${fireId(i)}"><span>${esc(fire.listLine(d, now))} <small>${esc(d.commune)} · satellite ${esc(d.satellite)}</small></span> <span class="q-mauvaise">feu</span></li>`).join("")}</ul>`
    : `<p>${esc(fire.QUIET)}</p>`;
  return `<section aria-labelledby="h-feux">
  <div class="sec-h"><p class="eyebrow">NASA FIRMS</p><h2 id="h-feux">Feux de végétation vus par satellite</h2>
  <p>${esc(fire.INTRO)}</p>
  <p><b>${esc(fire.URGENCE)}</b></p></div>
  <div class="card">${list}</div>
  <p class="note"><a href="/feux">La carte des feux des dernières 24 h →</a></p>
</section>`;
}

/**
 * /sentiers's stable text (marketing, 14/11/2026): how many trails the ONF follows, how many have no known state, how
 * many full hikes; each sentence left out without its figure.
 */
const sentiersLire = (suivis?: number, sansEtat?: number, randonnees?: number) => `<p>La page liste, commune par commune, les sentiers que la carte de l'ONF donne fermés. Pour chacun, elle donne la cause quand l'ONF la publie (éboulement, passage effondré, arbres en travers, travaux) et la date de réouverture si elle est annoncée. Un sentier est fermé par arrêté (préfet ou maire) ou par décision de l'ONF : s'y engager est interdit et dangereux.</p>
<p>rundata.re relit la carte de l'ONF chaque heure. La date en haut de page est celle de sa dernière mise à jour par l'ONF, pas celle de la dernière lecture.${suivis ? ` L'ONF suit ${suivis} sentiers.` : ""}${sansEtat ? ` ${sansEtat} autres sentiers, gérés par une commune, le Département ou un propriétaire privé, n'ont pas d'état connu ici.` : ""}</p>
<p><b>Ce que la page réunit et qu'aucune source ne montre seule :</b></p>
<ul class="plain"><li>l'état donné par la carte de l'ONF ;</li>
<li>les avis de l'ONF qui la nuancent : certaines routes forestières sont fermées en semaine et ouvertes le week-end, et la page montre les deux ;</li>
<li>${randonnees ? `les traces GPS des sentiers et des ${randonnees} grands itinéraires` : "les traces GPS des sentiers et des grands itinéraires"}, avec leur dénivelé d'après l'IGN ;</li>
<li>la météo de chaque secteur.</li></ul>`;

const SENTIERS_FAQ: Faq[] = [
  { q: "Un sentier n'est pas dans la liste : est-il ouvert ?", a: "S'il est géré par l'ONF et absent de la liste, la carte de l'ONF le donne ouvert. S'il n'est pas géré par l'ONF, rundata.re ne connaît pas son état : renseignez-vous auprès de la commune ou du Parc national. Dans tous les cas, la météo du jour et le balisage sur place comptent aussi." },
  { q: "Je peux passer quand même, avec prudence ?", a: "Non. Un sentier fermé l'est pour un danger constaté, et y entrer est interdit." },
  { q: "Quand va-t-il rouvrir ?", a: "Quand l'ONF annonce une date ou une année, la page la donne, par exemple « Réouverture 2026 ». Sans annonce, la page n'en donne pas. « Pas de réouverture prévue à court terme » est la formule de l'ONF." },
  { q: "La trace GPS suffit-elle pour partir ?", a: "Non. Une trace ne remplace ni le balisage ni l'état du sentier. Vérifiez cette page le jour même : une fermeture peut tomber d'un jour à l'autre." },
];

export function sentiersPage(origin: string, data: Cached<SentiersAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/sentiers`;
  const closed = d ? closedTrails(d) : 0;

  const status = !d
    ? loading("L'état des sentiers")
    : `<div class="now"><span class="big">${closed}</span><p>sentier${closed > 1 ? "s" : ""} fermé${closed > 1 ? "s" : ""} sur <b>${d.suivis}</b> suivis par l'ONF` +
      `${d.carte_mise_a_jour ? `, d'après sa carte mise à jour le ${esc(d.carte_mise_a_jour.replace(" (ONF)", ""))}` : ""}.</p></div>`;

  const markers = [...closedMarkers(d), ...fireMarkers(d?.feux, now)];
  // A trail across two communes is listed under each: the map leads to the first.
  const named = new Set<string>();
  const rowId = (sentier: string) => (named.has(sentier) ? "" : (named.add(sentier), ` class="tgt" id="${anchorId("t", sentier)}"`));
  const fires = firesSection(d?.feux, now);
  const burning = !!d?.feux?.detections.length;

  // Each commune folded when the list is long (FOLD_ROWS): a cross on the map still leads to its trail (UNFOLD_SCRIPT).
  const foldTrails = !!d && d.fermes_par_commune.length > 1 && d.fermes_par_commune.reduce((n, c) => n + c.sentiers_fermes.length, 0) > FOLD_ROWS;
  const byCommune = d
    ? `<ul class="zones">${d.fermes_par_commune.map((c) =>
        `<li class="card">${folded(foldTrails,
          `<h3>${esc(c.commune)}${foldTrails ? "\u00a0" : " "}<span class="note">${foldTrails ? "· " : ""}${c.sentiers_fermes.length}\u00a0fermé${c.sentiers_fermes.length > 1 ? "s" : ""}</span></h3>`,
          `<ul class="rows eau">` +
        c.sentiers_fermes.map((t) => `<li${rowId(t.sentier)}><span>${t.page ? `<a href="${esc(t.page.replace(/^https:\/\/rundata\.re/, ""))}">${esc(t.sentier)}</a>` : esc(t.sentier)} <small>${onf.motifs(t, now).map(esc).join(" · ") || "fermé"}</small>` +
          (t.randonnees?.length ? `<small class="cuts">Coupe : ${t.randonnees.map((r) => `<a href="/randonnees/${esc(r.slug)}">${esc(r.nom)}</a>`).join(", ")}</small>` : "") + `</span>` +
          ` <span class="q-mauvaise">fermé</span></li>`).join("") + `</ul>`)}</li>`).join("")}</ul>`
    : `<p class="card">L'état des sentiers se charge : rechargez la page dans quelques secondes.</p>`;

  const roads = d?.routes_forestieres_fermees.length
    ? `<div class="card"><h3>Routes forestières interdites à la circulation</h3><ul class="rows eau">${d.routes_forestieres_fermees.map((r) =>
        `<li><span>${esc(r.route)} <small>${[r.cause, r.precision].filter(Boolean).map((x) => esc(x!)).join(" · ")}</small></span> <span class="q-mauvaise">interdite</span></li>`).join("")}</ul></div>`
    : "";

  const hikes = `<section aria-labelledby="h-traces">
  <div class="card cta"><h2 id="h-traces">Choisir une randonnée</h2>
  <p>Les ${d?.randonnees.length ?? ""} itinéraires complets (GR R1, R2, R3, sommets, boucles) et les sentiers de l'ONF, avec leur trace GPS, leur distance, leur dénivelé et leur état d'après la carte de l'ONF, sur une carte de l'île et filtrables : <a href="/randonnees">la page randonnée</a>.</p></div>
</section>`;

  // In the words people type (« onf sentiers fermés », « sentier fermé reunion »; marketing, 24/11/2026). « À jour » holds
  // by the day the description gives, the one the ONF dates its map of; none before the list is here, nor from a map
  // without a date. Never « ouvert »: a trail out of the list is not said open.
  const title = "Sentiers fermés ONF : la liste à jour · La Réunion (974)";
  const says = (carte: string) => `Sentier fermé ? La liste des sentiers fermés par l'ONF à La Réunion (974)${carte} : la commune, le sentier et la raison de chaque fermeture.`;
  const short = says("");
  const base = onfDay(d?.carte_mise_a_jour) ? describe(says(`, d'après sa carte du ${onfDay(d?.carte_mise_a_jour)}`), short) : short;
  // The fires, when there is room for them (marketing): else the description stays as it was.
  const withFires = `${base.replace(/\.$/, "")}, et les feux de végétation détectés par satellite.`;
  const description = d?.feux && withFires.length <= DESCRIPTION_MAX ? withFires : base;

  const band = `${hikeCrumbBar("Sentiers fermés")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">${onfDot(d?.carte_mise_a_jour, now)}Carte de l'ONF</p>
    <h1>Sentiers fermés par l'ONF <span class="n974">974</span></h1>
    ${status}
    <p class="hero-cta"><a class="btn sun" href="/randonnees">${icon("mountain")}Randonnées et traces GPS</a></p>
    ${ask(`Lo santyé Roche Plate lé ouvèr ? Gèt si ${url} é di amwin si mi pé désann Mafate.`,
      `Le sentier de Roche Plate est-il ouvert ? Lis ${url} et dis-moi si je peux descendre dans Mafate.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, listed: true, label: "Carte de La Réunion (974) : les sentiers de randonnée fermés" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([CLE_FERME, ...(burning ? [CLE_FEU] : [])], esc(`${onfMap(d)}.${burning ? ` Points chauds : données des satellites de la NASA${d?.feux?.lu ? `, lues ${leAt(d.feux.lu)}` : ""}.` : ""}`))}</figcaption></figure>
</div>`;

  const body = `${burning ? fires : ""}<section aria-labelledby="h-fermes">
  <div class="sec-h"><p class="eyebrow">Commune par commune</p><h2 id="h-fermes">Les sentiers fermés</h2>
  <p>Les sentiers gérés par l'ONF fermés par arrêté préfectoral ou par décision de l'ONF, avec la cause et, quand elle est connue, la date de réouverture. Les autres sentiers gérés par l'ONF sont ouverts sur sa carte${d?.sans_etat ? `\u00a0; les ${d.sans_etat} sentiers hors gestion ONF ou sans état n'ont pas d'état connu ici` : ""}.</p>
  <p>Par secteur, avec les itinéraires, les accès et la météo :</p>${sectorLinks()}</div>
  ${byCommune}
  ${roads}
  ${d ? warnings(d.a_savoir) : ""}
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>
${burning ? "" : fires}
${hikes}
${texteStable(sentiersLire(d?.suivis, d?.sans_etat, d?.randonnees.length), SENTIERS_FAQ)}
${connectorCta("sentiers_randonnee", "les sentiers de randonnée")}`;

  return layout(origin, { title, description, path: "/sentiers", hook: `Avant de partir : les sentiers fermés d'après ${onfCarte(d?.carte_mise_a_jour)}, et pourquoi.`, jsonld: [hikeCrumbs(origin, "Sentiers fermés", "/sentiers"), webPage(origin, "/sentiers", title, description, data), faqPage(SENTIERS_FAQ)], alerte, iaAside: true }, band, etatOnf(body));
}
