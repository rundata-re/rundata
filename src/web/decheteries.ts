/**
 * The déchèteries of the West (/decheteries): for each one of the TCO, the skips that still take waste and those that
 * are full, as the staff last said, a block per commune with its anchor. Cut from the copy web:dechets, read
 * against the time: an update of more than 6 hours is said to be checked on the spot. Then the other communes' sites,
 * from the ADEME's directory, with the site of their intercommunalité for their hours.
 */
import { porte, type Porte } from "./aller.js";
import type { Cached } from "../cache.js";
import { slugify } from "./places.js";
import * as dech from "../vie/decheteries.js";
import type { Alerte, DechetsAnswer } from "./data.js";
import { connectorCta, crumbBar, crumbs, loading, sourcesNote, webPage } from "./domains.js";
import { esc } from "./map.js";
import { DESCRIPTION_MAX, icon, layout, leJour } from "./pages.js";

// The texts of the page, worded by marketing.
export const TITLE = "Déchèteries : adresses, bennes en direct dans l'Ouest · 974";
const H1 = "Les déchèteries de l'île, et les bennes en direct dans l'Ouest";
const LEAD = "Pour chaque déchèterie du TCO, les bennes qui acceptent encore vos déchets et celles qui sont pleines, d'après les agents sur place (mise à jour toutes les 2 heures environ). Ouvertes 7 jours sur 7.";
const CHECK = "Mise à jour il y a plus de 6 h : à vérifier sur place.";

export const anchorOf = (commune: string) => slugify(commune);

/** « Déchèteries de La Réunion (974) à 17:00 : … », the time of the West's latest update while it is recent. */
export function descriptionOf(sites: dech.SiteNow[]): string {
  // The newest update by its time, said with its day (« le 05/11 à 05:07 »).
  const fresh = sites.filter((s) => s.a_jour && s.mis_a_jour).map((s) => s.mis_a_jour!).sort((x, y) => (x.split(" ")[1] ?? "").localeCompare(y.split(" ")[1] ?? ""));
  const at = fresh.length ? ` ${leJour(fresh[fresh.length - 1])}` : "";
  const text = (at: string) => `Déchèteries de La Réunion (974)${at} : où déposer déchets verts, encombrants, gravats, dans toute l'île ; bennes pleines en direct dans l'Ouest (TCO).`;
  return text(at).length <= DESCRIPTION_MAX ? text(at) : text("");
}

function siteCard(s: dech.SiteNow, g: Porte): string {
  const state = s.a_jour
    ? `<p class="note">Mis à jour ${esc(leJour(s.mis_a_jour!))} par les agents.</p>` +
      (s.refuse.length ? `<p><b>Benne pleine :</b> ${esc(s.refuse.join(", "))}.</p>` : `<p><b>Toutes les bennes acceptent.</b></p>`) +
      (s.accepte.length ? `<p><b>Accepté :</b> ${esc(s.accepte.join(", "))}.</p>` : "")
    : `<p class="note">${esc(CHECK)}${s.mis_a_jour ? ` Dernière mise à jour : ${esc(s.mis_a_jour)}.` : ""}</p>`;
  const go = g.aller({ nom: s.nom, lat: s.lat, lon: s.lon, adresse: s.adresse ? `${s.adresse}, ${s.commune}` : undefined, ou: s.commune });
  return `<div class="card">${icon("pin")}<h3><a href="${esc(s.lien)}" rel="noopener">${esc(s.nom)}</a></h3>${s.adresse ? `<p>${esc(s.adresse)}</p>` : ""}${go ? `<p>${go}</p>` : ""}${state}</div>`;
}

function elsewhereCard(s: dech.Elsewhere, g: Porte): string {
  const go = g.aller({ nom: s.nom, lat: s.lat, lon: s.lon, adresse: s.adresse ? `${s.adresse}, ${s.commune}` : undefined, ou: s.commune });
  const hours = dech.hoursOf(s).replace(s.epci.nom, `<a href="${esc(s.epci.site)}" rel="noopener">${esc(s.epci.nom)}</a>`);
  return `<div class="card">${icon("pin")}<h3>${esc(s.nom)}</h3>${s.adresse ? `<p>${esc(s.adresse)}</p>` : ""}${go ? `<p>${go}</p>` : ""}<p class="note">${hours.charAt(0).toUpperCase()}${hours.slice(1)}.</p></div>`;
}

/**
 * A commune's sites, folded under its name, its number of sites and, in the West, its full skips: the 43 cards made
 * 20 000 px on a phone. The full skips counted from what the cards say (a site updated recently enough), and said only
 * when there is one: no « aucune » deduced. A link to the commune opens it (UNFOLD_SCRIPT), a search in the page too.
 */
function communeBlock(c: string, cards: string[], pleines = 0): string {
  const count = `${cards.length}\u00a0déchèterie${cards.length > 1 ? "s" : ""}`;
  const full = pleines ? ` · ${pleines}\u00a0benne${pleines > 1 ? "s" : ""} pleine${pleines > 1 ? "s" : ""}` : "";
  return `<section id="${anchorOf(c)}" aria-labelledby="h-${anchorOf(c)}">
  <details class="pli"><summary><h2 id="h-${anchorOf(c)}">${esc(c)} <small>· ${count}${full}</small></h2></summary>
  <div class="two">${cards.join("")}</div></details>
</section>`;
}

export function decheteriesPage(origin: string, data: Cached<DechetsAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const g = porte(alerte);
  const path = "/decheteries";
  const sites = dech.sitesNow(data?.value.etats, now);
  const description = descriptionOf(data ? sites : []);
  const band = `${crumbBar("Déchèteries")}
<div class="wrap intro"><div class="pitch">
  <p class="pill">${data && sites.some((s) => s.a_jour) ? `<span class="dot"></span>` : ""}État des bennes · déchèteries du TCO</p>
  <h1>${esc(H1)} <span class="n974">974</span></h1>
  <p class="lead">${esc(LEAD)}</p>
  ${data ? "" : loading("L'état des bennes")}
</div></div>`;
  const blocks = dech.TCO_COMMUNES.map((c) => {
    const here = sites.filter((s) => s.commune === c);
    return communeBlock(c, here.map((s) => siteCard(s, g)), data ? here.reduce((n, s) => n + (s.a_jour ? s.refuse.length : 0), 0) : 0);
  }).join("\n");
  const elsewhere = `<section aria-labelledby="h-ailleurs">
  <div class="sec-h"><h2 id="h-ailleurs">Les autres communes</h2></div>
  <p class="note">${esc(`Déchèteries ${dech.FROM_ADEME}. Seul le TCO publie l'état des bennes en direct.`)}</p>
</section>
<div class="plis">
${dech.ELSEWHERE_COMMUNES.map((c) => communeBlock(c, dech.ELSEWHERE.filter((s) => s.commune === c).map((s) => elsewhereCard(s, g)))).join("\n")}
</div>`;
  const others = `<section><p><a href="/collecte">Les jours de collecte de votre rue →</a></p>
  ${data ? sourcesNote(data.value.sources, data) : ""}</section>`;
  const body = `<div class="plis">
${blocks}
</div>
${elsewhere}
${others}
${connectorCta("annuaire_services_publics", "les déchèteries")}${g.feuille}`;
  return layout(origin, { title: TITLE, description, path, jsonld: [crumbs(origin, "Déchèteries", path), webPage(origin, path, TITLE, description, data)], alerte }, band, g.ligne + body);
}
