/**
 * The sport page (/sport): the island's matches, results and agendas, by sport. Moved out of domains.ts as it was; the
 * helpers common to every domain's page stay there.
 */
import { enLigne } from "./associations-drapeau.js";
import { adresseTexte } from "./adresse.js";
import { ACCUEILS } from "../providers/agenda.js";
import type { Cached } from "../cache.js";
import { enumeration } from "../tools/format.js";
import { type Alerte, type SportAnswer } from "./data.js";
import { esc } from "./map.js";
import { reprise } from "./ouvrir-donnees.js";
import { ask, FOLD_ROWS, folded, layout, type Live } from "./pages.js";
import { mentionSports, noteLa1ere } from "../tools/non-repris.js";
import { MOIS, clubsBox, clubsLink, connectorCta, crumbBar, crumbs, loading, silentText, sourcesNote, webPage } from "./domains.js";
// ---------------------------------------------------------------- sport

const SPORT_LISTED = 8;
const SPORT_ORDER = ["handball", "volley-ball", "beach-volley", "voile", "golf", "sport auto", "canoë-kayak", "triathlon"];
// The sports in the sentence of the count, as the page always named them.
const SPORT_SAID: Record<string, string> = { "volley-ball": "volley", "sport auto": "sport automobile", "canoë-kayak": "canoë-kayak et va'a" };
// Each sport's heading: the canoë-kayak with the va'a, half of it on the island (words of 05/11/2026).
const SPORT_HEADING: Record<string, string> = { "sport auto": "Sport automobile", "canoë-kayak": "Canoë-kayak et va'a" };
const sportName = (s: string) => SPORT_HEADING[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
// A next event's sport in its line: as the answer names it, the canoë-kayak with the va'a.
const sportOf = (s: string) => (s === "canoë-kayak" ? SPORT_SAID[s] : s);

/**
 * « vendredi 30/10 à 20:30 » → « ven. 30/10, 20:30 » ; « du samedi 24/10 au dimanche 25/10 » → « 24/10 → 25/10 », the
 * league's note kept after it ; « vendredi 06/11 et samedi 07/11 » → « 06/11 et 07/11 ».
 */
const shortWhen = (q: string) =>
  q.startsWith("du ") ? q.replace(/^du \S+ (\S+) au \S+ (\S+)( \(.+\))?$/, "$1 → $2$3")
  : / et \S+ \d/.test(q) ? q.replace(/^\S+ (\S+) et \S+ (\S+)$/, "$1 et $2")
  : q.replace(/^(\S{3})\S* /, "$1. ").replace(" à ", ", ");

function sportRow(r: SportAnswer["resultats"] extends (infer T)[] | undefined ? T : never, withScore: boolean): string {
  // A date the volley league gives otherwise, said under the match (« La Ligue … annonce ce match le … »).
  const small = [r.competition, withScore ? shortWhen(r.quand) : "", r.lieu, r.detail && !withScore ? r.detail : "", withScore ? "" : r.autre_date].filter(Boolean).map((x) => esc(x!)).join(" · ");
  const right = withScore
    ? `<span class="score">${esc(r.score ?? "")}</span>`
    : r.etat === "annulée" || r.etat === "reportée" ? `<span class="q-mauvaise">${esc(r.etat)}</span>` : `<span class="q-none">${esc(shortWhen(r.quand))}</span>`;
  // A match links nowhere of its own: its championship's page is linked once, under the standings.
  const name = r.lien && !r.competition ? `<a href="${esc(r.lien)}" rel="noopener">${esc(r.epreuve)}</a>` : esc(r.epreuve);
  return `<li><span>${name} <small>${small}${withScore && r.detail ? ` · ${esc(r.detail)}` : ""}</small></span>${right}</li>`;
}

/** The link to a championship's page, inside it when it is folded (validated words). */
/** The federation's page of a championship; its name for screen readers, as several are one under the other. */
const federation = (competition: string) => `Le classement sur le site de la fédération<span class="sr"> : ${esc(competition)}</span> ↗`;

/** The rows by sport, each sport folded when `fold` and the list is long (FOLD_ROWS): the results, not what is to come. */
function bySport(rows: NonNullable<SportAnswer["a_venir"]>, withScore: boolean, fold = false): string {
  const groups = SPORT_ORDER.map((sp) => ({ sp, list: rows.filter((r) => r.sport === sp) })).filter((g) => g.list.length);
  const folds = fold && groups.length > 1 && rows.length > FOLD_ROWS;
  return `<ul class="zones">${groups.map((g) =>
    `<li class="card">${folded(folds,
      `<h3>${esc(sportName(g.sp))}${folds ? "\u00a0" : " "}<span class="note">${folds ? "· " : ""}${g.list.length}\u00a0${withScore ? "résultat" : "rendez-vous"}${withScore && g.list.length > 1 ? "s" : ""}</span></h3>`,
      `<ul class="rows eau">${g.list.slice(0, SPORT_LISTED).map((r) => sportRow(r, withScore)).join("")}` +
      (g.list.length > SPORT_LISTED ? `<li><span class="note">et ${g.list.length - SPORT_LISTED} autres : demandez-les à votre IA.</span> <span></span></li>` : "") +
      `</ul>`)}</li>`).join("")}</ul>`;
}

export function sportPage(origin: string, data: Cached<SportAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/sport`;
  const upcoming = (d?.a_venir ?? []).filter((r) => r.etat !== "annulée");
  const soon = upcoming.slice(0, 7);
  const listedRows = d?.a_venir?.length ?? 0;
  const total = d?.a_venir_en_tout ?? listedRows;
  const there = new Set(d?.sports_a_venir ?? (d?.a_venir ?? []).map((r) => r.sport));
  const said = [...SPORT_ORDER.filter((s) => there.has(s)), ...[...there].filter((s) => !SPORT_ORDER.includes(s))].map((s) => SPORT_SAID[s] ?? s);

  const status = !d
    ? loading("Le calendrier du sport")
    // As sport counts them: all of them, cancelled ones included, with the sports there are (26/10/2026: 39 here for 77,
    // the triathlon left out and the motor sport said without any).
    : `<div class="now"><span class="big">${total}</span><p>rendez-vous officiels dans les quinze prochains jours${said.length ? `\u00a0: ${enumeration(said)}` : ""}` +
      `${listedRows < total ? `\u00a0; les ${listedRows} premiers ci-dessous` : ""}.</p></div>`;

  const next = soon.length
    ? `<figure class="card mapcard"><h2 style="color:var(--on-night)">Les prochains rendez-vous</h2><ul class="plain">${soon.map((r) =>
        `<li><b>${esc(r.quand)}</b> : ${esc(r.epreuve)} <span class="note" style="color:var(--on-night-muted)">(${esc(r.competition ? `${sportOf(r.sport)}, ${r.competition}` : sportOf(r.sport))})</span></li>`).join("")}</ul></figure>`
    : "";

  // Each championship folded when they are long (FOLD_ROWS). Its name then leaves the line, which opens it: the
  // federation's page is the first line inside.
  const foldTables = !!d && d.classements.length > 1 && d.classements.reduce((n, c) => n + c.lignes.length, 0) > FOLD_ROWS;
  const standings = d?.classements.length
    ? `<ul class="zones">${d.classements.map((c) => {
        const site = `<a href="${esc(c.lien)}" rel="noopener">${foldTables ? federation(c.competition) : esc(c.competition)}</a>`;
        const head = foldTables
          ? `<h3>${esc(c.competition)}${c.lignes.length ? `\u00a0<span class="note">· ${c.lignes.length}\u00a0équipe${c.lignes.length > 1 ? "s" : ""}</span>` : ""}</h3>`
          : `<h3>${site}</h3>`;
        return `<li class="card">${folded(foldTables, head, (foldTables ? `<p class="note">${site}</p>` : "") +
          `${c.muet ? `<p class="note">${silentText(c.muet)}</p>` : ""}${c.lignes.length ? `<ul class="rows eau">${c.lignes.map((l) =>
          `<li><span>${l.place}. ${esc(l.equipe)} <small>${l.joues} match${l.joues > 1 ? "s" : ""} joué${l.joues > 1 ? "s" : ""}</small></span> <span class="score">${l.points} pts</span></li>`).join("")}</ul>` : ""}`)}</li>`;
      }).join("")}</ul>`
    : "";

  const raid = d?.grand_raid
    ? `<section aria-labelledby="h-raid">
  <div class="sec-h"><p class="eyebrow">${esc(d.grand_raid.dates)}</p><h2 id="h-raid">${esc(d.grand_raid.edition)}</h2>
  <p>Les cinq courses, leurs partants, arrivants et abandons, et les podiums publiés par l'organisateur. Pendant la course, le connecteur donne qui est en tête et combien sont encore en course.</p></div>
  <ul class="zones">${d.grand_raid.courses.map((c) =>
    `<li class="card"><h3>${esc(c.course)} <span class="note">${esc(c.statut)}</span></h3><p class="note">Départ ${esc(c.depart)}${c.partants ? ` · ${c.partants} partants` : ""}${c.arrives ? `, ${c.arrives} arrivés` : ""}${c.abandons ? `, ${c.abandons} abandons` : ""}${c.en_course ? `, ${c.en_course} en course` : ""}</p>` +
    (c.podium ? `<ul class="plain">${c.podium.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "") +
    (c.podium_femmes ? `<p class="note">Femmes : ${c.podium_femmes.map((p) => esc(p)).join(" ; ")}</p>` : "") + `</li>`).join("")}</ul>
  <p class="note"><a href="${esc(d.grand_raid.lien)}" rel="noopener">Tous les classements sur Livetrail</a></p>
</section>`
    : "";


  const title = "Sport : matchs, résultats, Grand Raid · La Réunion (974)";
  const description = "Sport à La Réunion (974) : matchs à venir et résultats du handball et du volley régionaux, classements, rallyes et podiums du Grand Raid.";

  const band = `${crumbBar("Sport")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Calendriers et résultats officiels</p>
    <h1>Sport <span class="n974">974</span></h1>
    ${status}
    ${enLigne() ? `<p class="clubs-top"><a href="/associations/proposer?ref=sport-entete">Votre club organise un événement\u00a0? Proposez-le →</a></p>` : ""}
    ${ask(`Kosa néna konm match sé wikenn la ? Gèt si ${url} é di amwin.`,
      `Quels matchs et quelles compétitions ce week-end à La Réunion ? Lis ${url} et dis-le-moi.`)}
  </div>
  ${next}
</div>`;

  const body = `${clubsBox()}
<section aria-labelledby="h-venir">
  <div class="sec-h"><p class="eyebrow">Quinze prochains jours</p><h2 id="h-venir">À venir</h2>
  <p>Les matchs des championnats régionaux de handball (D1) et de volley (R1) et le calendrier de la Ligue du sport automobile. Heures de La Réunion.</p></div>
  ${d ? (d.a_venir?.length ? bySport(d.a_venir, false) : `<p class="card">Aucun rendez-vous trouvé dans les quinze prochains jours.</p>`) : `<p class="card">Le calendrier se charge : rechargez la page dans quelques secondes.</p>`}
  ${clubsLink()}
</section>
${d?.programmes_communes?.length ? `<section aria-labelledby="h-prog">
  <div class="sec-h"><p class="eyebrow">Publiés par les mairies</p><h2 id="h-prog">Programmes sportifs des communes</h2>
  ${d.programmes_communes?.length ? `<p>${esc(d.programmes_a_savoir ?? "")}</p>` : ""}</div>
  ${d.programmes_communes?.length ? `<ul class="zones"><li class="card"><ul class="rows eau">${d.programmes_communes.map((p) =>
    `<li><span><a href="${esc(p.lien)}" rel="noopener"${ACCUEILS.has(p.lien) ? ' target="_blank"' : ""}>${esc(p.titre)}</a> <small>${[p.commune && esc(p.commune), adresseTexte(`Source\u00a0: ${p.source}`)].filter(Boolean).join(" · ")}</small></span> <span class="q-none">${esc(shortWhen(p.dates))}</span></li>`).join("")}</ul></li></ul>` : ""}
</section>` : ""}
${d?.resultats?.length ? `<section aria-labelledby="h-res">
  <div class="sec-h"><p class="eyebrow">Sept derniers jours</p><h2 id="h-res">Derniers résultats</h2>
  ${d.resultats_en_tout ? `<p>${d.resultats_en_tout} résultats${d.periode ? ` depuis le ${esc(d.periode.du)}` : ""}\u00a0: les ${d.resultats.length} plus récents ci-dessous.</p>` : ""}</div>
  ${bySport(d.resultats, true, true)}
</section>` : ""}
${standings ? `<section aria-labelledby="h-class">
  <div class="sec-h"><p class="eyebrow">Championnats régionaux</p><h2 id="h-class">Classements</h2></div>
  ${standings}
</section>` : ""}
${raid}
<section aria-labelledby="h-src">
  <div class="sec-h"><h2 id="h-src">Ce qui n'est pas couvert</h2><p>${d ? esc(d.non_couvert) : ""}</p></div>
  ${d && data ? sourcesNote(d.sources, data) : ""}
  <p class="note">${noteLa1ere("sport")}</p>
  ${mentionSports(undefined, true).map((x) => `<p class="note np">${esc(x)}${reprise(x)}</p>`).join("")}
</section>
${connectorCta("sport", "le sport")}`;

  return layout(origin, { title, description, path: "/sport", jsonld: [crumbs(origin, "Sport", "/sport"), webPage(origin, "/sport", title, description, data)], alerte }, band, body);
}

/**
 * The name a source gives the next event, on the home page's tile (words validated on 06/11/2026): without a
 * leading « Saison 2026-2027 » in that exact form, nor a closing date (« 06-07 novembre ») whose days and month are all
 * in its « quand ». Nothing else of the source's name is rewritten.
 */
export function libelleProchain(epreuve: string, quand: string): string {
  const s = epreuve.replace(/^Saison \d{4}-\d{4} /, "");
  const m = new RegExp(`\\s(\\d{1,2})(?:-(\\d{1,2}))? (${MOIS.join("|")})$`, "u").exec(s);
  if (!m) return s;
  const mm = String(MOIS.indexOf(m[3]) + 1).padStart(2, "0");
  const days = [m[1], m[2]].filter((d): d is string => !!d).map((d) => `${d.padStart(2, "0")}/${mm}`);
  return days.every((d) => quand.includes(d)) ? s.slice(0, m.index) : s;
}

export function sportLive(data: Cached<SportAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  // The page's count: all of them, not only those listed, cancelled ones included (06/11/2026: « 40 » here for 68).
  // The whole detail shown (entier), the next event's sport and day included (06/11/2026).
  const total = d.a_venir_en_tout ?? d.a_venir?.length ?? 0;
  const first = (d.a_venir ?? []).find((r) => r.etat !== "annulée");
  return { valeur: `${total} rendez-vous`, detail: first ? `officiels d'ici quinze jours ; prochain : ${esc(libelleProchain(first.epreuve, first.quand))}${first.sport ? ` (${esc(first.sport)})` : ""}, ${esc(first.quand)}` : "officiels d'ici quinze jours", entier: true };
}
