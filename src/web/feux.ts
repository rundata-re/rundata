/**
 * /feux: the vegetation fires seen by satellite in the last 24 hours (providers/feux.ts) on the island's map and in a
 * list, with the closed trails (the last copy of /sentiers) and the vigilance: what someone looks for when a fire breaks
 * out above Saint-Paul. Worded by marketing. Without FIRMS's key the page says the detection is not active yet, is kept
 * out of the search engines and the sitemap, and nothing links to it.
 */
import type { Cached } from "../cache.js";
import * as feux from "../providers/feux.js";
import * as mf from "../providers/vigilance.js";
import { listLine, muets, QUIET, URGENCE, when } from "../tools/feux.js";
import { credits as creditOf, de } from "../tools/format.js";
import { cyclone, islandGreen, NONE_ISSUED_SAID, raised } from "../tools/vigilance.js";
import type { Alerte, SentiersAnswer } from "./data.js";
import { CLE_FERME, CLE_FEU, closedMarkers, closedTrails, connectorCta, crumbBar, crumbs, fireId, fireMarkers, onfMap, sourcesNote, webPage } from "./domains.js";
import { legende } from "./carte-legende.js";
import { esc, islandMap } from "./map.js";
import { ask, credits, DESCRIPTION_MAX, layout, officielHtml, leAt } from "./pages.js";

export const FEUX_PATH = "/feux";

/** What the page is made of: `fires` null when FIRMS has no key or does not answer. */
export interface FeuxLive {
  fires: (feux.Feux & { fetchedAt: Date }) | null;
  sentiers?: Cached<SentiersAnswer> | null;
  vigilance?: Cached<mf.Vigilance> | null;
}

const TITLE = "Feux de forêt Réunion : détections satellite 24 h · 974";
const H1 = "Feux de végétation à La Réunion, vus par satellite";
const LEAD = "Les points chauds repérés par les satellites VIIRS de la NASA ces dernières 24 h, sur une carte et en liste, avec les sentiers fermés et la vigilance du jour. Détection satellite, faux positifs possibles : toit chaud, site industriel, brûlage autorisé.";
// A preview stays in the message it was sent in: each state says its day and time, never « ces dernières 24 h » alone.
const QUIET_META = (at: Date) => `Aucun feu détecté par satellite à La Réunion (974) dans les 24 h avant ${leAt(at)}. Les nuages peuvent en masquer. Un feu ? 18 ou 112.`;
// When the satellites could not be read: nothing said of the fires, never « 0 ».
const BLIND_META = "Feux de végétation à La Réunion (974) vus par satellite : la carte des dernières 24 h, les sentiers fermés et la vigilance du jour. Un feu ? 18 ou 112.";
const OFF = "La détection des feux par satellite n'est pas encore active sur rundata.re.";
const DOWN = "Le service de la NASA ne répond pas pour le moment : rechargez la page dans quelques minutes.";
// The first screen (marketing, 06/11/2026): a satellite sees hot spots, not fires; « aucun point chaud » always with
// « détecté par satellite » and the time it was read, never « pas de feu ».
const PILL = "Satellites de la NASA · 24 h";
const SEES = "Un satellite voit des points chauds (feu, brûlage, toit très chaud), pas forcément des feux. Les nuages et les heures entre deux passages peuvent en cacher.";
const CROIX = "Croix : sentiers fermés par l'ONF, pas des feux.";

/**
 * The hero, as the satellites see the 24 hours before their data was read: in big the count of the hot spots, or
 * « Aucun point chaud » cut from the preview's sentence; then the rest of the sentence, with its day and time.
 */
export function heroFeux(fires: feux.Feux & { fetchedAt: Date }): { big: string; then: string } {
  const n = fires.detections.length;
  const before = `par satellite dans les 24 h avant ${leAt(fires.fetchedAt)}.`;
  if (!n) return { big: "Aucun point chaud", then: `détecté ${before}` };
  return { big: String(n), then: `${n === 1 ? "point chaud détecté" : "points chauds détectés"} ${before}` };
}

/** The description: the count and the newest, without its place when that makes it too long. */
export function feuxDescription(fires: (feux.Feux & { fetchedAt?: Date }) | null, now: Date): string {
  if (!fires) return BLIND_META;
  const n = fires.detections.length;
  if (!n) return QUIET_META(fires.fetchedAt ?? now);
  const last = fires.detections[0];
  const at = when(last.t, now);
  const make = (where: string) =>
    n === 1
      ? `1 feu vu par satellite en 24 h à La Réunion (974), ${at}${where}. Faux positifs possibles. Un feu ? 18 ou 112.`
      : `${n} feux vus par satellite en 24 h à La Réunion (974), le dernier vu ${at}${where}. Faux positifs possibles. Un feu ? 18 ou 112.`;
  const full = make(` près ${de(last.lieu)}`);
  return full.length <= DESCRIPTION_MAX ? full : make("");
}

function firesList(fires: feux.Feux | null, now: Date): string {
  if (!feux.enabled()) return `<p>${esc(OFF)}</p>`;
  if (!fires) return `<p>${esc(DOWN)}</p>`;
  if (!fires.detections.length) return `<p>${esc(QUIET)}</p>`;
  return `<ul class="rows eau">${fires.detections.map((d, i) => `<li class="tgt" id="${fireId(i)}"><span>${esc(listLine(d, now))}<small>${esc(d.commune)} · satellite ${esc(d.satellite)}</small></span><span class="q-mauvaise">feu</span></li>`).join("")}</ul>`;
}

function trails(s: Cached<SentiersAnswer> | null | undefined): string {
  const d = s?.value;
  if (!d) return `<p>L'état des sentiers se charge : <a href="/sentiers">voir les sentiers fermés</a>.</p>`;
  const closed = closedTrails(d);
  return `<p><b>${closed}</b> sentier${closed > 1 ? "s" : ""} fermé${closed > 1 ? "s" : ""} sur ${d.suivis} suivis par l'ONF${d.carte_mise_a_jour ? `, d'après sa carte mise à jour le ${esc(d.carte_mise_a_jour.replace(" (ONF)", ""))}` : ""}.</p>` +
    (d.fermes_par_commune.length ? `<ul class="chips">${d.fermes_par_commune.map((c) => `<li>${esc(c.commune)} (${c.sentiers_fermes.length})</li>`).join("")}</ul>` : "");
}

function vigilance(v: Cached<mf.Vigilance> | null | undefined, now: Date): string {
  if (!v) return `<p><a href="/vigilance">La vigilance de Météo-France</a> se charge.</p>`;
  const r = raised(v.value);
  const c = cyclone(v.value, now);
  const up = r.length ? `<ul class="plain">${r.map((x) => `<li>${esc(`${x.couleur_max} ${x.phenomene.toLowerCase()} : ${x.zone.split(" :")[0]}`)}</li>`).join("")}</ul>` : islandGreen(v.value, now) ? `<p>Pas de vigilance particulière à La Réunion (tout est vert).</p>` : `<p>${NONE_ISSUED_SAID}.</p>`;
  return `${c.startsWith("Pas d'") ? "" : `<p><b>${esc(c)}</b></p>`}${up}<p>${officielHtml(mf.OFFICIEL_VIGILANCE)}</p><p class="note"><a href="/vigilance">La vigilance zone par zone →</a></p>`;
}

/** The map's line of sources: the satellites read and when, a quiet day said as such, then the ONF's map. */
function firesLine(l: FeuxLive): string {
  const trails = l.sentiers ? ` Sentiers : ${onfMap(l.sentiers.value).replace(/^C/, "c")}.` : "";
  if (!feux.enabled() || !l.fires) return trails.trim();
  return (l.fires.detections.length
    ? `Points chauds : données des satellites de la NASA, lues ${leAt(l.fires.fetchedAt)}.`
    : `Aucun point chaud détecté par satellite (données des satellites de la NASA, lues ${leAt(l.fires.fetchedAt)}).`) + trails;
}

/** The hero, as on /cyclones, then what a satellite sees; without the satellites' data, the page's lead as before. */
function heroLines(l: FeuxLive, on: boolean): string {
  if (!on || !l.fires) return `<p class="lead">${esc(LEAD)}</p>`;
  const { big, then } = heroFeux(l.fires);
  const hero = l.fires.detections.length
    ? `<div class="now"><span class="big">${esc(big)}</span><p>${esc(then)}</p></div>`
    : `<div class="status"><p class="big">${esc(big)}</p><p class="lead">${esc(then)}</p></div>`;
  return `${hero}
    <p>${esc(SEES)}</p>`;
}

export function feuxPage(origin: string, l: FeuxLive, now = new Date(), alerte?: Alerte): string {
  const on = feux.enabled();
  const description = on ? feuxDescription(l.fires, now) : BLIND_META;
  const markers = [
    ...closedMarkers(l.sentiers?.value, "/sentiers"),
    ...fireMarkers(l.fires ?? undefined, now),
  ];

  const band = `${crumbBar("Feux")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>${esc(PILL)}</p>
    <h1>${esc(H1)} <span class="n974">974</span></h1>
    ${heroLines(l, on)}
    <p class="lead"><b>${esc(URGENCE)}</b></p>
    ${ask("Na difé dann bwa ? Maïdo i brul ? Gèt si https://rundata.re/feux é di amwin ousa lé, é si néna santyé fèrmé.",
      "Y a-t-il un feu de forêt à La Réunion en ce moment ? Lis https://rundata.re/feux et dis-moi où le satellite en a vu, à quelle heure, et quels sentiers sont fermés.")}
    <p class="note"><a href="/sentiers">Tous les sentiers fermés, commune par commune →</a></p>
  </div>
  <figure class="card mapcard">${islandMap({ markers, listed: true, label: "Carte de La Réunion (974) : les feux détectés par satellite et les sentiers fermés" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([...(l.fires?.detections.length ? [CLE_FEU] : []), CLE_FERME], esc(`${CROIX} ${firesLine(l)}`.trim()))}</figcaption></figure>
</div>`;

  const body = `<section aria-labelledby="h-feux">
  <h2 id="h-feux">Les feux des dernières 24 h</h2>
  <div class="card">${firesList(l.fires, now)}</div>
  ${l.fires ? `<p class="note">Satellites lus : ${esc(l.fires.satellites.join(", "))}, ${leAt(l.fires.fetchedAt)}.${muets(l.fires) ? ` ${esc(muets(l.fires)!)}` : ""}</p><p class="sources">Sources : ${credits(creditOf([feux.SOURCE]))}.</p>` : ""}
</section>
<section aria-labelledby="h-sentiers">
  <h2 id="h-sentiers">Les sentiers fermés par l'ONF</h2>
  <div class="card">${trails(l.sentiers)}</div>
  ${l.sentiers ? sourcesNote(l.sentiers.value.sources, l.sentiers) : ""}
</section>
<section aria-labelledby="h-vigilance">
  <h2 id="h-vigilance">La vigilance Météo-France</h2>
  <div class="card">${vigilance(l.vigilance, now)}</div>
</section>
${connectorCta("sentiers_randonnee", "les feux")}`;

  return layout(origin, { title: TITLE, description, path: FEUX_PATH, jsonld: [crumbs(origin, "Feux", FEUX_PATH), webPage(origin, FEUX_PATH, TITLE, description, l.sentiers ?? null)], alerte, noindex: !on }, band, body);
}
