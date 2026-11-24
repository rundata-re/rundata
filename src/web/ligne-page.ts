/**
 * A bus line's page (/bus/ligne/<network>/<line>, 24/11/2026): its stops in order in each direction, each leading to its
 * page and its next departures, and the starts of its trips of the day, from the timetables its network publishes (GTFS,
 * Licence Ouverte), as the transports tool tells a line (tools/transports.ts `lineDay`). Built at each view, never kept,
 * as a stop's page; out of the sitemap, which keeps marketing's list (web/sitemap-gardees.ts).
 */
import * as transit from "../providers/transit.js";
import { lineDay } from "../tools/transports.js";
import { type Alerte, credit } from "./data.js";
import { crumbBar, crumbs, STOP_PATH } from "./domains.js";
import { LINE_PATH, type LinePage } from "./ligne.js";
import { esc } from "./map.js";
import { credits, layout } from "./pages.js";

type Day = Awaited<ReturnType<typeof lineDay>>;

/** « 05:10 », « 18:00 »: every time with its minutes, as the stop's page lists its departures. */
const hhmm = (s: number) => {
  const m = Math.floor((((s % 86400) + 86400) % 86400) / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dayName = (d: { ymd: number; weekday: number }) => `${WEEKDAYS[d.weekday]} ${d.ymd % 100 === 1 ? "1er" : d.ymd % 100} ${MONTHS[(Math.floor(d.ymd / 100) % 100) - 1]}`;

/** Noindex temporaire pendant la mesure de reprise Google (24/11 → 08/12/2026), à revoir à son bilan. */
export const LINE_NOINDEX = true;

/** « Ligne S1 Car Jaune ». */
export const lineTitle = (p: LinePage) => `Ligne ${p.ligne} ${transit.NETWORKS[p.reseau]?.nom ?? p.reseau}`;

/** A direction: its stops in order, the commune said where it changes, each stop leading to its page. */
function stopsList(list: transit.Stop[]): string {
  let commune = "";
  return `<ol class="rows lieux arrets-ligne">${list.map((s) => {
    const page = transit.pageOfStop(s.id);
    const name = page ? `<a href="${STOP_PATH}/${esc(page.slug)}">${esc(s.nom)}</a>` : esc(s.nom);
    const town = s.commune !== commune ? `<li class="commune-ligne">${esc(s.commune)}</li>` : "";
    commune = s.commune;
    return `${town}<li>${name}</li>`;
  }).join("")}</ol>`;
}

export function linePage(origin: string, p: LinePage, day: Day, now = new Date(), alerte?: Alerte): string {
  const net = transit.NETWORKS[p.reseau]?.nom ?? p.reseau;
  const path = `${LINE_PATH}/${p.slug}`;
  const title = `${lineTitle(p)} : arrêts et horaires · La Réunion (974)`;
  const description = `${lineTitle(p)}${p.nom ? ` (${p.nom})` : ""} : ses arrêts dans l'ordre, dans chaque sens, et ses départs du jour, d'après les horaires publiés par ${net}.`;
  const band = `${crumbBar(lineTitle(p), { name: "Bus", path: "/bus" })}
<div class="wrap intro">
  <div class="pitch">
    <h1>${esc(lineTitle(p))}</h1>
    ${p.nom ? `<p class="lead">${esc(p.nom)}</p>` : ""}
    <p>Ses arrêts dans l'ordre, dans chaque sens, et ses départs du jour. Chaque arrêt mène à ses prochains départs.</p>
  </div>
</div>`;

  const sens = "sens" in day && day.sens ? day.sens : [];
  const when = day.ahead ? `le ${dayName(day.d)}` : "aujourd'hui";
  const head = day.ahead === 14
    ? `<p>Aucun départ dans les deux semaines qui viennent, d'après les horaires publiés.</p>`
    : day.ahead
      ? `<p>Aucun départ aujourd'hui d'après les horaires publiés. Prochaine journée de service : ${esc(dayName(day.d))}.</p>`
      : "";
  const sections = sens.map(({ out, list, starts }, i) => {
    const t = [...new Set(starts)].sort((a, b) => a - b);
    const summary = t.length ? `${t.length} départ${t.length > 1 ? "s" : ""} ${when}, de ${hhmm(t[0])} à ${hhmm(t[t.length - 1])}` : `aucun départ ${when}`;
    const variants = (out.autres_parcours as string[] | undefined)?.length ? `<p class="note">Autres parcours ${when} : ${esc((out.autres_parcours as string[]).join(" ; "))}.</p>` : "";
    return `<section aria-labelledby="h-sens-${i}"><div class="card">
<h2 id="h-sens-${i}">${esc(String(out.direction))}</h2>
<p class="note">${list ? `${list.length} arrêts · ` : ""}${esc(summary)}</p>
${t.length ? `<h3>Départs du premier arrêt</h3><ul class="heures-ligne">${t.map((s) => `<li>${hhmm(s)}</li>`).join("")}</ul>` : ""}
${variants}
${list ? `<h3>Arrêts</h3>${stopsList(list)}` : `<p>La liste de ses arrêts n'est pas disponible pour le moment.</p>`}
</div></section>`;
  }).join("\n");

  const body = `${head ? `<section><div class="card">${head}</div></section>` : ""}
${sections}
<section><p class="note">Horaires théoriques publiés par ${esc(net)}, sans les retards ni les déviations. Les heures annoncées en direct, quand le réseau les publie, sont sur la page de chaque arrêt. Mis à jour ${esc(dayName({ ymd: day.today.ymd, weekday: day.today.weekday }))}.</p>
<p class="sources">Sources : ${credits([credit(transit.SOURCE)])}.</p>
<p><a href="/bus">Tous les bus de l'île →</a></p></section>`;

  return layout(origin, { title, description, path, ...(LINE_NOINDEX ? { noindex: true } : {}), jsonld: [crumbs(origin, lineTitle(p), path, { name: "Bus", path: "/bus" })], alerte }, band, body);
}
