/**
 * /chiffres, « rundata.re en chiffres »: what rundata.re reads, counted (chiffres.ts), in marketing's words validated by
 * the user on 25/10/2026. Each figure leads to its page; a count not made yet is left out, never shown as 0, and one
 * kept from an earlier copy says its hour.
 */
import type { Chiffres, Inventaire } from "../chiffres.js";
import { PATH } from "../chiffres.js";
import type { Alerte } from "./data.js";
import { crumbBar, crumbs, webPage } from "./domains.js";
import { esc } from "./map.js";
import { layout } from "./pages.js";
import { PATH as SANS_REPONSE } from "./sans-reponse.js";

export { PATH };
const H1 = "rundata.re en chiffres";
// Without « · rundata.re »: the name is already its first word, and the preview names the site (og:site_name).
const TITLE = "rundata.re en chiffres\u00a0: sources, producteurs, licences";
const CHAPEAU = "Ce que rundata.re lit pour vous, compté en direct\u00a0: les sources publiques, leurs producteurs et leurs licences, ce qui est couvert sur l'île et ce qui manque encore. Chaque chiffre mène à sa page.";

const n = (x: number) => x.toLocaleString("fr-FR").replace(/\s/g, "\u00a0");

/** A count made from the copy, with its hour when it is older than the copy's own (kept when its source did not answer). */
type Dated = { nombre: number; compte_le: string } | undefined;
const kept = (c: Chiffres, d: Dated, mots = "") => (d && d.compte_le !== c.compte_le && !mots.includes(d.compte_le) ? ` <small>(compté le ${esc(d.compte_le)})</small>` : "");

/** One figure of a list: its number, its words, its page. */
const item = (valeur: number, mots: string, page: string, after = "") =>
  `<li class="card"><a class="fig" href="${esc(page)}">${n(valeur)}</a><span>${mots}${after}</span></li>`;

/** « (Licence Ouverte, ODbL, DbCL, CC BY, domaine public) », from the open families present. */
const parenthese = (familles: string[]) => familles.join(", ");

/**
 * « Toutes les sources »: each source counted, by domain, an anchor for each, one line each (chiffres.ts, `inventaire`).
 * The table of « Par domaine », one cell under another on a phone. Each domain folded under its title: the 25 tables
 * made 28 000 px on a phone. A link to a domain opens it (UNFOLD_SCRIPT), a search in the page too.
 */
function toutesLesSources(inv: Inventaire, nonNommees = 0): string {
  const groupes = inv.map((d) => {
    const lecture = d.la_plus_lue
      ? `<p>Relue le plus souvent, ${esc(d.cadence!)}\u00a0: ${esc(d.la_plus_lue)}.</p>`
      : d.cadence === "à chaque version du site" ? "<p>Mises à jour avec le site.</p>" : d.cadence ? `<p>Relues ${esc(d.cadence)}.</p>` : "";
    return `<details class="pli"><summary><h3 id="sources-${esc(d.categorie)}">${esc(d.domaine)} <small>· ${d.sources.length > 1 ? `${n(d.sources.length)} sources` : "1 source"}</small></h3></summary>
  ${lecture}<div class="card table-wrap"><table class="drought niveaux"><caption class="sr">${esc(d.domaine)}</caption><thead><tr><th scope="col">Source</th><th scope="col">Producteur</th><th scope="col">Licence ou conditions</th></tr></thead><tbody>${d.sources.map((s) =>
    `<tr><th scope="row"><a href="${esc(s.url)}" rel="noopener">${esc(s.nom)}</a></th><td data-label="Producteur">${s.producteurs.length ? esc(s.producteurs.join(", ")) : "—"}</td><td data-label="Licence ou conditions">${esc(s.licence)}</td></tr>`).join("")}</tbody></table></div></details>`;
  });
  return `<h2 id="sources">Toutes les sources</h2>
  <p>Chaque source lue, par domaine\u00a0: son producteur, et sa licence ou les conditions de reprise de son site.</p>
  <p>${inv.map((d) => `<a href="#sources-${esc(d.categorie)}">${esc(d.domaine)}</a>\u00a0(${n(d.sources.length)})`).join(" · ")}</p>
  ${nonNommees ? `<p>Plus ${nonNommees > 1 ? `${n(nonNommees)} sites non officiels, comptés` : "1 site non officiel, compté"} dans les sources sans être nommé${nonNommees > 1 ? "s" : ""} ici.</p>` : ""}
  <div class="plis">
  ${groupes.join("\n  ")}
  </div>`;
}

export function chiffresPage(origin: string, c: Chiffres, inv: Inventaire, alerte?: Alerte): string {
  const band = `${crumbBar(H1)}
<div class="wrap intro solo"><div class="pitch">
  <h1>${H1}</h1>
  <p class="lead">${CHAPEAU}</p>
</div></div>`;

  const essentiel = `<h2 id="essentiel">L'essentiel</h2>
  <ul class="figs">${[
    item(c.sources, "sources publiques lues", "#sources"),
    item(c.producteurs, "producteurs", "#par-domaine"),
    item(c.communes, "communes, une page du jour pour chacune", "/communes"),
    item(c.outils, "outils pour votre assistant IA", "/mcp"),
  ].join("")}</ul>`;

  const domaines = `<h2 id="par-domaine">Par domaine</h2>
  <div class="card table-wrap"><table class="drought niveaux"><caption class="sr">Par domaine</caption><thead><tr><th scope="col">Domaine</th><th scope="col">Sources</th><th scope="col">Producteurs</th><th scope="col">Lecture</th></tr></thead><tbody>${c.par_domaine.map((d) =>
    `<tr><th scope="row">${d.page ? `<a href="${esc(d.page)}">${esc(d.domaine)}</a>` : esc(d.domaine)}</th><td data-label="Sources">${n(d.sources)}${d.deja_comptees_plus_haut ? ` <small>dont ${n(d.deja_comptees_plus_haut)} déjà comptée${d.deja_comptees_plus_haut > 1 ? "s" : ""} plus haut</small>` : ""}</td><td data-label="Producteurs">${d.producteurs.length ? esc(d.producteurs.join(", ")) : "—"}</td>${d.cadence ? `<td data-label="Lecture">${esc(d.cadence)}</td>` : "<td></td>"}</tr>`).join("")}</tbody></table></div>`;

  const t = c.terrain;
  const terrain = [
    t.stations_meteo && item(t.stations_meteo.nombre, "stations météo lues", "/meteo", kept(c, t.stations_meteo)),
    item(t.maregraphes, "marégraphes", "/mer"),
    item(t.defibrillateurs, "défibrillateurs", "/defibrillateurs"),
    item(t.points_de_recharge, "points de recharge pour voiture électrique", "/bornes", `<small>dans ${n(t.stations_de_recharge)} stations</small>`),
    t.stations_de_velos && item(t.stations_de_velos.nombre, "stations de vélos", "/velos", kept(c, t.stations_de_velos)),
    "lignes_de_bus" in t && t.lignes_de_bus !== undefined && item(t.lignes_de_bus, "lignes de bus", "/bus", `<small>${n(t.reseaux_de_bus!)} réseaux</small>`),
    t.sentiers_onf && item(t.sentiers_onf.nombre, "sentiers suivis par l'ONF", "/sentiers", `<small>dont ${n(t.sentiers_onf.fermes)} fermés d'après la carte de l'ONF</small>${kept(c, t.sentiers_onf)}`),
    item(t.randonnees_gps, "itinéraires de randonnée avec leur trace GPS", "/randonnees"),
  ].filter(Boolean);

  const m = c.en_ce_moment;
  const ev: (Dated & { incomplet?: string }) | undefined = m.evenements_deux_semaines;
  const moment = [
    // Counted without one or two agendas that did not answer, named, or the last whole count with its hour (chiffres.ts, SANS_MAX).
    ev && item(ev.nombre, `événements dans les deux semaines qui viennent${ev.incomplet ? `, ${esc(ev.incomplet)}.` : ""}`, "/evenements", kept(c, ev, ev.incomplet)),
    m.avis_coupure_eau && item(m.avis_coupure_eau.nombre, "avis de coupure d'eau en cours ou à venir", "/coupures-eau", kept(c, m.avis_coupure_eau)),
    m.avis_coupure_electricite && item(m.avis_coupure_electricite.nombre, "avis de coupure d'électricité en cours ou à venir", "/electricite#coupures", kept(c, m.avis_coupure_electricite)),
  ].filter(Boolean);

  const licences = `<h2 id="licences">Les licences</h2>
  <p>${n(c.sous_licence_ouverte)} des ${n(c.sources)} sources sont publiées sous une licence ouverte (${esc(parenthese(c.licences_ouvertes))}). Pour les autres, rundata.re ne reprend que des faits (une valeur, un état, un titre et son heure), avec le lien de la source\u00a0; pour les médias, le titre et parfois la première phrase. Certaines sont reprises avec l'accord écrit de leur producteur, ou en attendant sa réponse\u00a0: leur ligne le dit dans la liste des sources.</p>
  <ul>${Object.entries(c.licences).map(([nom, nombre]) => `<li>${esc(nom.charAt(0).toUpperCase() + nom.slice(1))}\u00a0: ${n(nombre)}</li>`).join("")}</ul>`;

  const s = c.manque.sites_sans_reponse;
  const silence = !s ? "" : s.nombre
    ? `<p>${n(s.nombre)} ${s.nombre > 1 ? "sites publics ne répondent pas" : "site public ne répond pas"} en ce moment\u00a0: <a href="${SANS_REPONSE}">voir les sites sans réponse</a>.${kept(c, s)}</p>`
    : s.derniere_reverification ? `<p><a href="${SANS_REPONSE}">Aucun site public sans réponse</a> à la revérification du ${esc(s.derniere_reverification.slice(0, 5))}.</p>` : "";

  const body = `<section style="max-width:52rem;display:grid;gap:1rem">
  ${essentiel}
  ${domaines}
  ${terrain.length ? `<h2 id="terrain">Sur le terrain</h2>\n  <ul class="figs">${terrain.join("")}</ul>` : ""}
  ${moment.length ? `<h2 id="en-ce-moment">En ce moment</h2>\n  <ul class="figs">${moment.join("")}</ul>` : ""}
  ${licences}
  ${toutesLesSources(inv, c.non_nommees)}
  ${silence ? `<h2 id="manque">Ce qui manque</h2>\n  ${silence}` : ""}
  <h2 id="depuis">Depuis le début</h2>
  <p>Né en octobre 2026\u00a0: <a href="/nouveautes">${n(c.nouveautes)} nouveautés publiées</a>.</p>
  <p>Compté le ${esc(c.compte_le)}, à partir des sources que lit rundata.re. Une source manque\u00a0? Dites-le avec le formulaire en bas de page.</p>
</section>`;
  return layout(origin, { title: TITLE, description: CHAPEAU, path: PATH, jsonld: [crumbs(origin, H1, PATH), webPage(origin, PATH, TITLE, CHAPEAU, null)], alerte }, band, body);
}
