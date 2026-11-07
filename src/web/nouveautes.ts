/**
 * What rundata.re can do that it could not before (/nouveautes), day by day: the same list as the repository's
 * CHANGELOG.md and sources_donnees (src/nouveautes.ts). Nothing is fetched.
 */
import { NOUVEAUTES, parJour } from "../nouveautes.js";
import { connectorCta, crumbBar, jourMois, webPage } from "./domains.js";
import { esc } from "./map.js";
import { FOLD_ROWS, folded, GITHUB, layout, SITE } from "./pages.js";

export const TITLE = "Nouveautés de rundata.re, La Réunion en direct";
export const DESCRIPTION = "Les dernières données et pages ajoutées à rundata.re, La Réunion (974) en direct : météo, mer, sentiers, bus, sorties. Mis à jour à chaque nouveauté.";

/** A text escaped, each number with its word (« 24 dernières », « 30 jours ») in a .jm, as jourMois does for a day and its
 *  month: one line on a wide screen, but on a small screen with the text enlarged, where the pair can be wider than the
 *  line, the word goes to the next line whole: after a no-break space Chrome never hyphenates it, and cut it at a letter
 *  (« 24 commune/s », « 30 jou/rs » at 200 %). A unit (« 24 h ») stays bound. */
export const chiffreMot = (texte: string): string =>
  esc(texte).replace(/(?<![\p{L}\d,.])(\d+(?:[,.]\d+)*)\u00a0(\p{L}{3,})/gu, '<span class="jm">$1 $2</span>');

export function nouveautesPage(origin: string): string {
  const path = "/nouveautes";
  const days = parJour();
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [[SITE, "/"], ["Nouveautés", path]].map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${u}` })),
  };
  const page = { ...webPage(origin, path, TITLE, DESCRIPTION, null), ...(NOUVEAUTES.length ? { dateModified: new Date(NOUVEAUTES[0].date).toISOString() } : {}) };

  const band = `${crumbBar("Nouveautés")}
<div class="wrap intro"><div class="pitch">
  <h1>Les nouveautés de rundata.re</h1>
  <p class="lead">Ce qui arrive sur le site et dans votre IA, jour après jour. Une idée, une donnée qui manque ? Dites-le-nous en bas de page.</p>
</div></div>`;
  // The last day open, the days before folded in their card when the list is long (FOLD_ROWS), the day still its title.
  // The day's number with its month, on one line but on a small screen with the text enlarged (jourMois, as on /evenements).
  const fold = days.length > 1 && NOUVEAUTES.length > FOLD_ROWS;
  // A list's column as wide as its card (.nouv): an address (« rundata.re/associations. ») is a word, and the implicit
  // track took its width, so with the text at 150 % the page scrolled sideways (356 px on a 320 px screen). Under 12.5 rem
  // every .plain already has this column.
  const list = (d: (typeof days)[number]) => `<ul class="plain nouv">${d.textes.map((t) => `<li>${chiffreMot(t)}</li>`).join("")}</ul>`;
  const body = days.map((d, i) => `<section aria-labelledby="h-${d.jour}">
  ${fold && i > 0
    ? `<div class="card">${folded(true, `<h2 id="h-${d.jour}"><time datetime="${d.jour}">${jourMois(d.titre)}</time>\u00a0<span class="note">· ${d.textes.length}\u00a0nouveauté${d.textes.length > 1 ? "s" : ""}</span></h2>`, list(d))}</div>`
    : `<div class="sec-h"><h2 id="h-${d.jour}"><time datetime="${d.jour}">${jourMois(d.titre)}</time></h2></div>
  <div class="card">${list(d)}</div>`}
</section>`).join("\n") + `
<p class="note">La même liste est dans le dépôt du code : <a href="${GITHUB}/blob/main/CHANGELOG.md">CHANGELOG.md</a>.</p>
${connectorCta("sources_donnees", "toutes ces données")}`;
  return layout(origin, { title: TITLE, description: DESCRIPTION, path, jsonld: [trail, page] }, band, body);
}
