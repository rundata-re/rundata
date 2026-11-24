/**
 * The calendar's page (/calendrier): school holidays, public holidays, the sun's hours. Moved out of domains.ts as
 * it was; the helpers common to every domain's page stay there.
 */
import type { Cached } from "../cache.js";
import { resolvePlace } from "../places/resolve.js";
import { horizonDe } from "../providers/calendrier.js";
import { ferieDit, longDate, moonOf, ordinaux, UNPUBLISHED } from "../tools/calendrier.js";
import { a } from "../tools/format.js";
import { type Alerte, type CalendrierAnswer } from "./data.js";
import { daysApart, localTime } from "../geo.js";
import { esc } from "./map.js";
import { ask, empty, icon, layout, type Live } from "./pages.js";
import { connectorCta, crumbBar, crumbs, describe, loading, sourcesNote, webPage } from "./domains.js";
// ---------------------------------------------------------------- calendrier

/**
 * The public holidays of a copy counted again from today: the copy, made every six hours, may be from the day before
 * (« Toussaint dans 6 j » the day after). A day reached is today's holiday; one past is left out.
 */
export function feriesDuJour(data: Cached<CalendrierAnswer> | null, now: Date): CalendrierAnswer["jours_feries"] {
  const f = data?.value.jours_feries;
  const late = f ? daysApart(data!.fetchedAt, now) : 0;
  if (!f || late <= 0) return f;
  const counted = f.prochains.map((x) => ({ ...x, dans_jours: x.dans_jours - late })).filter((x) => x.dans_jours >= 0);
  return { ...f, aujourd_hui: counted.find((x) => x.dans_jours === 0)?.nom ?? null, prochains: counted.filter((x) => x.dans_jours > 0) };
}

export function calendrierPage(origin: string, data: Cached<CalendrierAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const v = d?.vacances_scolaires;
  const f = feriesDuJour(data, now);
  const next = f?.prochains[0];
  const url = `${origin}/calendrier`;
  const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" });

  const status = !d
    ? loading("Le calendrier")
    : `<div class="status"><p class="big">${esc(today)}</p>` +
      (f?.aujourd_hui ? `<p class="lead">Aujourd'hui est férié : <b>${esc(f.aujourd_hui)}</b>.</p>` : "") +
      (v?.en_cours ? `<p class="lead">Vacances scolaires en cours, reprise des cours le <b>${esc(v.en_cours.reprise_des_cours)}</b>.</p>` : "") +
      (next ? `<p class="lead">Prochain jour férié : ${ferieDit(next.nom, next.date) === next.date ? `<b>${esc(next.date)}</b>` : `<b>${esc(next.nom)}</b>, ${esc(next.date)}`} (dans ${next.dans_jours} jour${next.dans_jours > 1 ? "s" : ""}).</p>` : "") +
      (d.soleil ? `<p class="lead">À ${esc(d.soleil.lieu)}, lever du soleil à <b>${esc(d.soleil.lever)}</b>, coucher à <b>${esc(d.soleil.coucher)}</b>.</p>` : "") +
      `</div>`;

  const holidays = f
    ? `<div class="card">${icon("calendar")}<h3>Jours fériés</h3><ul class="plain">${f.prochains.map((h) => `<li>${ferieDit(h.nom, h.date) === h.date ? `<b>${esc(h.date)}</b>` : `<b>${esc(h.nom)}</b> : ${esc(h.date)}`} <span class="note">(dans ${h.dans_jours} j)</span></li>`).join("")}</ul><p class="note">${esc(f.note)}</p></div>`
    : "";
  const school = v
    ? `<div class="card">${icon("book")}<h3>Vacances scolaires</h3><ul class="plain">` +
      [...(v.en_cours ? [{ ...v.en_cours, now: true }] : []), ...v.a_venir.map((x) => ({ ...x, now: false }))]
        .map((x) => `<li><b>${esc(x.nom)}</b>${x.now ? " (en cours)" : ""} : du ${esc(x.debut)}, ${x.reprise_des_cours === UNPUBLISHED ? "date de reprise pas encore publiée" : `reprise le ${esc(x.reprise_des_cours)}`}</li>`).join("") +
      `</ul><p class="note">${esc(v.note)}</p></div>`
    : "";
  const sun = d?.soleil
    ? `<div class="card">${icon("mountain")}<h3>Soleil ${esc(a(d.soleil.lieu))}</h3><p>Lever ${esc(d.soleil.lever)}, coucher ${esc(d.soleil.coucher)} : ${esc(d.soleil.duree_du_jour)} de jour.</p><p class="note">${esc(d.soleil.note)}</p></div>`
    : "";

  // The Moon where the sun is said, computed at each view (a pure calculation, no source): its phase and how much is lit
  // stay those of the hour of the view, whatever the age of the copy.
  const moonAt = resolvePlace(d?.soleil?.lieu ?? "Saint-Denis")?.lieu;
  const lune = moonAt && moonOf(new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10), now, moonAt.lon, moonAt.lat, horizonDe(moonAt)).champs;
  const upper = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  // Rising and setting in the order they come in the day; a day without one says so after the other.
  const moonTimes = lune
    ? [{ t: lune.lever, texte: `lever à ${lune.lever}` }, { t: lune.coucher, texte: `coucher à ${lune.coucher}` }]
        .sort((x, y) => (/^\d/.test(y.t) ? (/^\d/.test(x.t) ? x.t.localeCompare(y.t) : 1) : -1))
        .map((x) => (/^\d/.test(x.t) ? x.texte : x.t))
    : [];
  const moon = lune
    ? `<div class="card">${icon("moon")}<h3>Lune ${esc(a(moonAt!.nom))}</h3><p>${esc(upper(lune.phase))}, éclairée à ${lune.eclairee_pct}\u00a0%.</p>` +
      `<p>${esc(upper(moonTimes.join(", ")))}.</p>` +
      (lune.prochaines_phases.length ? `<ul class="plain">${lune.prochaines_phases.map((x) => `<li><b>${esc(upper(x.phase))}</b> : ${esc(x.date)} à ${esc(x.heure)}</li>`).join("")}</ul>` : "") +
      `<p class="note">${esc(lune.note)}</p></div>`
    : "";

  // The school year people look up: from July, the one that starts in August.
  const [y, m] = new Date(now.getTime() + 4 * 3600_000).toISOString().split("-").map(Number);
  const year = m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  const title = `Vacances scolaires Réunion ${year}, jours fériés · 974`;
  // The next break: its first day and its last (the day before classes resume).
  const day = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  const coming = d?.annees_scolaires?.flatMap((a) => a.vacances).find((b) => b.reprise && b.reprise > day);
  const short = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).replace(/^1 /, "1er ");
  const lastDay = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const span = coming ? `${coming.debut <= day ? "vacances en cours" : "prochaines vacances"} du ${short(coming.debut)} au ${short(lastDay(coming.reprise!))}` : "";
  const description = coming
    ? describe(`Vacances scolaires ${year} à La Réunion (974), calendrier austral : ${span}. Jours fériés dont le 20 décembre.`,
        `Vacances scolaires ${year} à La Réunion (974) : ${span}. Jours fériés dont le 20 décembre.`)
    : next
      ? describe(`Vacances scolaires ${year} à La Réunion (974), calendrier austral ; prochain jour férié ${ferieDit(next.nom, next.date) === next.date ? `le ${next.date}` : `${next.nom} (${next.date})`}. Le 20 décembre, lever et coucher du soleil.`,
          `Vacances scolaires ${year} à La Réunion (974), jours fériés dont le 20 décembre, lever et coucher du soleil.`)
      : `Vacances scolaires ${year} à La Réunion (974), calendrier austral : jours fériés dont le 20 décembre, lever et coucher du soleil.`;

  // Every break of the school year, and of the next once the rectorat has published it.
  const years = (d?.annees_scolaires ?? []).map((a, i) => `<section aria-labelledby="h-vac-${i}">
  <div class="sec-h">${i ? "" : `<p class="eyebrow">Calendrier austral</p>`}<h2 id="h-vac-${i}">Vacances scolaires ${esc(a.annee)} (académie de La Réunion)</h2></div>
  <div class="card table-wrap"><table class="drought"><caption class="sr">Vacances scolaires ${esc(a.annee)} (académie de La Réunion)</caption><thead><tr><th>Vacances</th><th>Début</th><th>Reprise des cours</th></tr></thead><tbody>${a.vacances.map((b) => {
    const now_ = b.debut <= day && !!b.reprise && day < b.reprise;
    const past = !!b.reprise && b.reprise <= day;
    return `<tr${past ? ` class="past"` : ""}><th scope="row">${esc(ordinaux(b.nom).replace(/^\p{L}/u, (c) => c.toUpperCase()))}${now_ ? ` <span class="badge m">en cours</span>` : ""}</th><td>${esc(longDate(b.debut))}</td><td>${b.reprise ? esc(longDate(b.reprise)) : "pas encore publiée"}</td></tr>`;
  }).join("")}</tbody></table></div>
  ${i ? "" : `<p class="note">Dates de l'académie de La Réunion, publiées par le ministère de l'Éducation nationale.</p>`}
</section>`).join("\n");

  const band = `${crumbBar("Calendrier")}
<div class="wrap intro solo">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Aujourd'hui à La Réunion</p>
    <h1>Vacances scolaires et jours fériés à La Réunion</h1>
    ${status}
    ${ask(`Kansa lé lo prochin vakans lékol é lo prochin zour férié La Rényon ? Gèt si ${url} é di amwin.`,
      `Quand sont les prochaines vacances scolaires et le prochain jour férié à La Réunion ? Lis ${url} et dis-le-moi.`)}
  </div>
</div>`;

  const body = `${years}
<section aria-labelledby="h-cal">
  <div class="sec-h"><p class="eyebrow">L'année à La Réunion</p><h2 id="h-cal">Vacances, jours fériés, soleil</h2>
  <p>L'académie de La Réunion suit un calendrier austral : les grandes vacances tombent en décembre et janvier, pendant l'été de l'hémisphère sud.</p></div>
  ${d ? `<div class="three">${school}${holidays}<div class="pile">${sun}${moon}</div></div>${data ? sourcesNote(d.sources, data) : ""}` : `<p class="card">Le calendrier se charge : rechargez la page dans quelques secondes.</p>`}
</section>
${connectorCta("calendrier", "le calendrier de l'île")}`;

  return layout(origin, { title, description, path: "/calendrier", jsonld: [crumbs(origin, "Calendrier", "/calendrier"), webPage(origin, "/calendrier", title, description, data)], alerte }, band, body);
}

export function calendrierLive(data: Cached<CalendrierAnswer> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const v = d.vacances_scolaires?.en_cours;
  const f = feriesDuJour(data, now);
  const next = f?.prochains[0];
  const valeur = f?.aujourd_hui ? `Férié : ${esc(f.aujourd_hui)}` : v ? "Vacances scolaires" : next ? `${esc(next.nom)} dans ${next.dans_jours} j` : undefined;
  // The date is enough here: the year's list runs out at its end, before the next one is loaded.
  if (!valeur) return empty(`Ni vacances en cours ni jour férié à venir dans le calendrier lu le ${localTime(data!.fetchedAt).split(" ")[0]}.`);
  return {
    valeur,
    detail: [
      v ? `reprise le ${esc(v.reprise_des_cours)}` : undefined,
      (f?.aujourd_hui || v) && next ? `${esc(next.nom)} dans ${next.dans_jours} j` : undefined,
      d.soleil ? `soleil ${esc(d.soleil.lever)}–${esc(d.soleil.coucher)}` : undefined,
    ].filter(Boolean).join(" · "),
  };
}
