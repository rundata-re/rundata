/**
 * The markets of the agenda's days and the sport of the weekend, on /evenements and /evenements/ce-week-end: the
 * markets come from vie/marches.ts (OpenStreetMap and the town halls' pages), not from the agendas, and are not
 * counted among the events; the matches are on /sport, linked to, not copied. Nothing is fetched: no subrequest.
 */
import { marchesDuJour } from "../vie/marches.js";
import { esc } from "./map.js";


/** The words under the markets' title: where their days come from, and what can still cancel them. */
export const MARCHES_NOTE = "Les marchés forains reviennent chaque semaine. Leur jour et leurs heures sont ceux que donne leur source, avec la date où elle a été lue : un jour férié, la météo ou la mairie peuvent les changer. Ils ne sont pas comptés parmi les événements.";

/**
 * The section of the markets held on `days` (« 2026-11-21 »), a card a day; nothing when none is held on any of them.
 * `heading`: a day's title, as HTML (« Samedi <span class="jm">21 novembre</span> », as the events' days); `id`: its
 * title's id, for the link from the weekend's summary.
 */
export function marchesSection(days: string[], heading: (day: string) => string, id = "h-marches"): string {
  const held = days.map((day) => ({ day, ms: marchesDuJour(day) })).filter((x) => x.ms.length);
  if (!held.length) return "";
  const cards = held.map(({ day, ms }) =>
    `<li class="card"><h3>${heading(day)} <span class="note">${ms.length} marché${ms.length > 1 ? "s" : ""}</span></h3><ul class="rows eau">${ms.map((m) =>
      `<li><span><a href="${esc(m.lien)}" rel="noopener">${esc(m.nom)}</a><small>${[m.commune, m.adresse, `d'après ${m.d_apres}`].filter(Boolean).map((x) => esc(x!)).join(" · ")}</small></span><span class="q-none">${esc(m.horaires)}</span></li>`).join("")}</ul></li>`).join("");
  return `<section aria-labelledby="${id}">
  <div class="sec-h"><h2 id="${id}">Marchés forains</h2><p>${esc(MARCHES_NOTE)}</p></div>
  <ul class="zones">${cards}</ul>
</section>`;
}

/** How many markets are held on `days`, for the weekend's summary. */
export const marchesCount = (days: string[]) => days.reduce((n, day) => n + marchesDuJour(day).length, 0);

/** The weekend's sport: a link to /sport, where the clubs' matches and the communes' sports programmes are. */
export const SPORT_LIEN = `<p class="card">Sport ce week-end : les matchs des clubs et leurs résultats sont sur <a href="/sport">la page Sport →</a></p>`;
