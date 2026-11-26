/**
 * An event's own page, /evenements/<titre>-<fiche>: cut from the events page's copy (web:agenda), nothing read for it.
 * `fiche`, 8 hexadecimal digits, comes from who publishes the event and its id there (tools/agenda.ts `ficheDe`): the
 * page keeps its address when the title or the date changes, and an address with an older title is sent on (301).
 *
 * At its top, after its place, who publishes it, its name the link to its page there (the source cited, the visits the
 * halls that agreed expect). Below, around the event first, what the site already knows (its commune's day, the forecast of its day when the commune's
 * weather copy is there, the commune's other outings that day), then its text, quoted with who published it. Only an
 * event with a text of its own (its description: OpenAgenda, the halls that agreed, the associations) is indexed; those
 * whose source gives the facts only are served in noindex and stay out of the sitemap.
 *
 * Over, the events are kept 30 days in a small register (FICHES, written by buildAgenda at most once an hour): the
 * page says it took place, in noindex, then is gone (410), its key remembered a year more, as is the page of an event
 * no agenda announces any more. An event over whose page was indexed sends its address to its commune's day instead
 * (301), all that year (fiches.ts `suivie`).
 */
import type { Cached } from "../cache.js";
import { a } from "../articles.js";
import { COMMUNES } from "./commune.js";
import type { AgendaAnswer, Alerte, PlaceData } from "./data.js";
import { webPage } from "./domains.js";
import { agendaEvents } from "./agenda.js";
import { type Fiche, fichePath } from "./fiches.js";
import { layout, SITE } from "./pages.js";
import { annonceManque } from "../tools/agenda.js";
import { dayLabel } from "../tools/prevision.js";

import type { Row } from "./fiches.js";
import { brut, echappe, href, html, type Html } from "./html.js";

export { type Entree, type Fiche, FICHES, ficheIssue, fichePath, ficheOf, ficheUrls, registre, type Row } from "./fiches.js";

/** « Annoncé par… », at the head of a sentence. */
const upper = (s: string) => s.charAt(0).toLocaleUpperCase("fr") + s.slice(1);

const communeOf = (nom?: string) => (nom ? COMMUNES.find((p) => p.nom === nom) : undefined);
const jj = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function crumbs(origin: string, titre: string, path: string) {
  const items: [string, string][] = [[SITE, "/"], ["Événements", "/evenements"], [titre, path]];
  return {
    bar: html`<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol>${items.map(([n, p], i) =>
      i < items.length - 1 ? html`<li><a href="${p}">${n}</a></li>` : html`<li aria-current="page">${n}</li>`)}</ol></nav></div>`,
    jsonld: { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([n, p], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${p}` })) },
  };
}

/** The forecast of the event's day at its commune, said as a forecast, from the commune's weather copy as it is. */
function prevision(r: Row, meteo: PlaceData | undefined): Html | "" {
  const jour = meteo?.prevision?.jours?.find((j) => j.jour === dayLabel(r.date.slice(0, 10)));
  if (!jour) return "";
  const temp = jour.temperature_min && jour.temperature_max ? `${jour.temperature_min} à ${jour.temperature_max}` : undefined;
  // The rain said once: « pluie (10,4 mm) » under a rainy sky, never « pluie, …, pluie : 10,4 mm de pluie ».
  const mm = jour.pluie?.match(/^(\S+ mm) de pluie(.*)$/);
  const ciel = jour.ciel_en_journee;
  const parts = (ciel && mm && /pluie|averse/i.test(ciel) ? [`${ciel} (${mm[1]}${mm[2]})`, temp] : [ciel, temp, jour.pluie]).filter(Boolean);
  return parts.length ? html`<li><b>Prévision météo</b> pour ${jour.jour} ${a(r.commune!)} : ${parts.join(", ")}. C'est une prévision, pas une mesure.</li>` : "";
}

/** Where the event is, as its row says it: its place, then its commune when the place does not name it. */
const ou = (r: Pick<Row, "lieu" | "commune">) => `${r.lieu ? `, ${r.lieu}` : ""}${r.commune && !r.lieu?.includes(r.commune) ? `, ${r.commune}` : ""}`;

/**
 * The page's meta description, 155 characters at most, cut after a whole word: its day (and hour), its place, then its text. The day comes
 * first so that each date of a series (a workshop every Saturday, the same text each time) has its own: Google takes
 * pages with the same description for near duplicates.
 */
export function ficheDescription(r: Pick<Row, "titre" | "quand" | "lieu" | "commune" | "publie_par" | "description">): string {
  const texte = r.description?.trim().replace(/\s+/g, " ");
  const quand = r.quand ? `${r.quand[0].toUpperCase()}${r.quand.slice(1)}` : "";
  const d = texte ? `${quand}${ou(r)} : ${texte}` : `${r.titre} : ${r.quand}${ou(r)}, d'après ${r.publie_par}.`;
  // Longer: cut after a whole word, with an ellipsis.
  return d.length <= 155 ? d : `${d.slice(0, 154).replace(/\s+\S*$/, "")}…`;
}

/**
 * What the source does not give, said rather than left blank: an event without its hour (a day alone) or without its
 * place, with who announced it, linked to its page when there is one, where the rest may be.
 */
function manque(r: Row): Html | "" {
  // The source's name without an article: « Mairie de Saint-Pierre », « Weezevent » take none.
  const qui = r.lien ? html`<a href="${href(r.lien)}" rel="noopener">${r.publie_par}</a>` : html`${r.publie_par}`;
  // The sentence is the site's own words around `qui`, already HTML.
  const dit = annonceManque(r.date, r.lieu, qui.texte);
  return dit ? html`<p class="note" data-sortie>${brut(dit)}</p>` : "";
}

/** The page of an event to come (or on), from the copy of /evenements. */
export function fichePage(origin: string, r: Row, data: Cached<AgendaAnswer>, meteo: PlaceData | undefined, alerte?: Alerte): string {
  const path = fichePath(r);
  const c = communeOf(r.commune);
  const texte = r.description?.trim();
  const day = r.date.slice(0, 10);
  const title = `${r.titre}${r.commune ? `, ${r.commune}` : ""} (${jj(day)})`;
  const description = ficheDescription(r);
  const { bar, jsonld } = crumbs(origin, r.titre, path);
  const autres = (data.value.evenements ?? []).filter((x) => x.fiche !== r.fiche && x.commune && x.commune === r.commune && x.date.slice(0, 10) === day).slice(0, 6);
  const badge = r.statut ? html`<span class="badge${r.statut === "complet" ? " m" : ""}">${r.statut}</span> ` : "";
  // Cancelled or postponed: the new day and who said it, as the list and the tool say them (20/11/2026: the page
  // had the badge alone).
  const off = r.statut && r.statut !== "complet" && (r.reporte_au || r.statut_d_apres)
    ? html`\n  <p class="note" data-sortie>${`${r.statut[0]}${r.statut.slice(1).toLowerCase()}`}${r.reporte_au ? html` au ${r.reporte_au}` : ""}${r.statut_d_apres ? html` d'après <a href="${href(r.statut_d_apres.lien)}" rel="noopener">${r.statut_d_apres.media}</a>` : ""}.</p>`
    : "";
  const autour = [
    c ? html`<li><b>${c.nom}</b> : <a href="/aujourdhui/${c.slug}">la journée ${a(c.nom)}</a></li>` : "",
    prevision(r, meteo),
    autres.length ? html`<li><b>Le même jour ${a(r.commune!)}</b> :<ul>${autres.map((x) => html`<li>${x.fiche ? html`<a href="${fichePath(x)}">${x.titre}</a>` : x.titre}${x.quand ? html` <small>${x.quand}</small>` : ""}</li>`)}</ul></li>` : "",
  ].filter(Boolean);
  const source = r.source ? html`<p class="note">Source : ${r.source}</p>` : "";
  const book = r.billetterie && r.billetterie !== r.lien ? html` · <a href="${href(r.billetterie)}" rel="noopener">billets</a>` : "";
  const band = html`${bar}
<div class="wrap intro solo"><div class="pitch">
  <h1>${badge}${r.titre}</h1>${off}${r.annonce ? html`\n  <p class="note" data-sortie>${r.lien ? html`<a href="${href(r.lien)}" rel="noopener">${upper(r.annonce)}</a>` : upper(r.annonce)}.</p>` : ""}
  <p class="lead" data-sortie>${r.quand}${r.autres_dates?.length ? html`, aussi ${r.autres_dates.join(", ")}` : ""}${r.lieu ? html`<br>${r.lieu}` : ""}${r.commune && !r.lieu?.includes(r.commune) ? html`, ${r.commune}` : ""}${r.lien ? html` · <a href="${href(r.lien)}" rel="noopener">${r.publie_par}</a>` : ""}</p>
  ${manque(r)}
  ${r.prix ? html`<p>${r.prix}</p>` : ""}
</div></div>`;
  // data-sortie: a link followed to another site (its source, its tickets) is counted by the « sortie » signal (web/signal.ts).
  const body = html`<section style="max-width:44rem;display:grid;gap:1rem" data-sortie>
  ${autour.length ? html`<h2 id="autour">Autour de l'événement</h2>\n  <ul>${autour}</ul>` : ""}
  <h2 id="annonce">L'annonce</h2>
  ${texte ? html`<blockquote><p>${brut(echappe(texte).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>"))}</p></blockquote>\n  <p>D'après ${r.lien ? html`<a href="${href(r.lien)}" rel="noopener">${r.publie_par}</a>` : r.publie_par}${book}.</p>`
    : html`<p>${r.lien ? html`Le détail est sur <a href="${href(r.lien)}" rel="noopener">la page de ${r.publie_par}</a>` : html`Annoncé par ${r.publie_par}`}${book}.</p>`}
  ${source}
  <p><a href="/evenements">Tous les événements des deux semaines à venir →</a></p>
</section>`;
  const events = agendaEvents([r]).map((e) => ({ "@context": "https://schema.org", ...e, url: `${origin}${path}` }));
  return layout(origin, { title, description, path, noindex: !texte, jsonld: [jsonld, webPage(origin, path, title, description, data), ...events], alerte }, band.texte, body.texte);
}

/** The page of an event over, kept 30 days in noindex: when it took place, and the next ones of its commune. */
export function fichePassee(origin: string, x: Fiche, alerte?: Alerte): string {
  const path = fichePath(x);
  const c = communeOf(x.commune);
  const title = `${x.titre}${x.commune ? `, ${x.commune}` : ""} (${jj(x.date)})`;
  const quand = x.fin && x.fin !== x.date.slice(0, 10) ? `du ${dayLabel(x.date.slice(0, 10))} au ${dayLabel(x.fin)}` : `le ${dayLabel(x.date.slice(0, 10))}`;
  const description = `${x.titre} a eu lieu ${quand}${x.commune ? ` ${a(x.commune)}` : ""}.`;
  const { bar, jsonld } = crumbs(origin, x.titre, path);
  const band = html`${bar}
<div class="wrap intro solo"><div class="pitch">
  <h1>${x.titre}</h1>
  <p class="lead">Cet événement a eu lieu ${quand}${x.lieu ? html`, ${x.lieu}` : ""}${x.commune && !x.lieu?.includes(x.commune) ? html`, ${x.commune}` : ""}.</p>
</div></div>`;
  const body = html`<section style="max-width:44rem;display:grid;gap:1rem">
  ${c ? html`<p><a href="/aujourdhui/${c.slug}">Les prochaines sorties ${a(c.nom)} →</a></p>` : ""}
  <p><a href="/evenements">Tous les événements des deux semaines à venir →</a></p>
  ${x.lien ? html`<p class="note" data-sortie>Annoncé par <a href="${href(x.lien)}" rel="noopener">${x.publie_par}</a>.</p>` : html`<p class="note">Annoncé par ${x.publie_par}.</p>`}
</section>`;
  return layout(origin, { title, description, path, noindex: true, jsonld: [jsonld], alerte }, band.texte, body.texte);
}

/** Gone (410): over for more than 30 days, or no longer announced by any agenda read. */
export function ficheTerminee(origin: string, path: string, alerte?: Alerte): string {
  const title = "Événement terminé";
  const description = "Cet événement est terminé, ou n'est plus annoncé dans les agendas lus.";
  const { bar } = crumbs(origin, title, path);
  const band = html`${bar}
<div class="wrap intro solo"><div class="pitch">
  <h1>Événement terminé</h1>
  <p class="lead">Cet événement est terminé, ou n'est plus annoncé dans les agendas lus par rundata.re.</p>
</div></div>`;
  const body = `<section style="max-width:44rem"><p><a href="/evenements">Les événements des deux semaines à venir →</a></p></section>`;
  return layout(origin, { title, description, path, noindex: true, jsonld: [], alerte }, band.texte, body);
}

/** The copy of /evenements not there yet (a data center's first view): come back, with the events page's words. */
export function ficheAttente(origin: string, path: string, alerte?: Alerte): string {
  const { bar } = crumbs(origin, "Événement", path);
  const band = html`${bar}
<div class="wrap intro solo"><div class="pitch">
  <h1>Événement</h1>
  <p class="lead">L'agenda se charge : rechargez la page dans quelques secondes.</p>
</div></div>`;
  return layout(origin, { title: "Événement", description: "L'agenda se charge.", path, noindex: true, jsonld: [], alerte }, band.texte, "");
}
