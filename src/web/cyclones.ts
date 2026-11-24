/**
 * The cyclones' page (/cyclones): the systems of the basin, the CMRS's follow-up and the season. Moved out of
 * domains.ts as it was; the helpers common to every domain's page stay there.
 */
import { kitAvantOrange, RADIO, suiviPhrase } from "../tools/cyclones.js";
import type { Cached } from "../cache.js";
import { type Alerte, type CyclonesAnswer } from "./data.js";
import { carteHtml } from "./cmrs-carte.js";
import { ACCORD as ACCORD_TRACE } from "../providers/cmrs-trace.js";
import { avisLe, basinMap, TRACES, TRACES_SCRIPT, TRACES_SOURCES, ZONE_SOURCE } from "./cyclones-bassin.js";
import { esc } from "./map.js";
import { ask, CYCLONE_SCALE, layout, type Live, officielHtml } from "./pages.js";
import { PASSES } from "../historique/cyclones-passes.js";
import { script } from "./scripts-declares.js";
import * as mf from "../providers/vigilance.js";
import { connectorCta, crumbBar, crumbs, describe, loading, sourcesNote, webPage } from "./domains.js";
// ---------------------------------------------------------------- cyclones

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A system as the RSMC's last advisory names it: its stage and the advisory's time, nothing computed. */
function activeCard(r: NonNullable<CyclonesAnswer["systemes_actifs"]>[number]): string {
  return `<article class="card"><h3>${esc(capital(r.nom))}${r.stade ? ` <span class="note">${esc(r.stade)}</span>` : ""}</h3>` +
    `<p>Dernier avis du CMRS : ${esc(r.dernier_avis)}.</p>` +
    `<p class="note">Bulletins : ${esc(r.centre)}, <a href="${esc(r.rapport)}" rel="noopener">fiche GDACS</a>.</p></article>`;
}

function seasonTable(s: CyclonesAnswer["saison_en_cours"]): string {
  return s.systemes.length
    ? `<div class="card table-wrap"><table class="drought"><caption class="sr">${esc(`Saison ${s.nom}`)}</caption><thead><tr><th>Système</th><th>Dates</th></tr></thead><tbody>${s.systemes.map((x) =>
        `<tr><th scope="row"><a href="${esc(x.rapport)}" rel="noopener">${esc(capital(x.nom))}</a></th><td>${esc(x.du)} – ${esc(x.au)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="card">Aucun système pour le moment.</p>`;
}

/**
 * The basin's map, without any system of the season (cyclones-bassin.ts), and the line that says where the systems
 * are: none, with the past cyclones' tracks; or the RSMC's map above it, or Météo-France's site when that map is not
 * shown here, and then no past track: only, once Météo-France agrees, the path each system has already travelled
 * (providers/cmrs-trace.ts), never its forecast. Without a system, it is the hero's map, as on the other pages; with
 * one, it stays under the RSMC's map, which comes first. `active`: the systems active in GDACS, or else those the RSMC
 * follows (the path travelled is only given for the first).
 */
function basinFigure(d: CyclonesAnswer | undefined, active: number): string {
  const s = active > 1;
  const traces = !!d && !active;
  const parcours = active ? d?.parcours ?? [] : [];
  const past = TRACES.map((t, i) => `<li><a href="/cyclones/${t.slug}"><span class="nb">${i + 1}</span> ${esc(t.nom_annee)}</a></li>`).join("");
  const now = !d ? ""
    : !active ? `<p><b>Aucun système dans le bassin en ce moment.</b> En traits numérotés, les cyclones passés dont les stations de Météo-France ont mesuré le passage\u00a0:</p><ol class="trcs">${past}</ol>`
    : d.carte?.image ? `<p><b>${s ? "Des systèmes sont suivis" : "Un système est suivi"} par le CMRS\u00a0: <a href="#carte-cmrs">sa carte officielle est au-dessus</a>.</b></p>`
    : `<p><b>${s ? "Des systèmes sont suivis" : "Un système est suivi"} par le CMRS\u00a0:</b> ${officielHtml(mf.OFFICIEL_CYCLONE)}</p>`;
  // What the line and its dots are, and what they never are; a gap or a late start said by the advisories' numbers.
  const path = parcours.length
    ? `<p>En trait plein, le chemin déjà parcouru\u00a0: les positions ${s ? "de chaque système" : "du système"} aux avis du CMRS, la dernière plus grande, avec son nom. ` +
      parcours.map((p) => `<b>${esc(p.nom)}</b>\u00a0: ${esc(p.stade)}, position du ${avisLe(p.heure)} (heure de La Réunion) au dernier avis du CMRS. `).join("") +
      `Aucune prévision ici\u00a0: la trajectoire prévue est sur la carte officielle de Météo-France.` +
      // Each system's name first: no « de » or « d' » to choose before it; « il manque » the same for one or more.
      parcours.map((p) => {
        const start = p.premier > 1 ? `le chemin commence à l'avis n°\u00a0${p.premier}, le premier lu par rundata.re` : "";
        const gap = p.manquent ? `il manque ${p.manquent} avis entre le n°\u00a0${p.premier} et le n°\u00a0${p.dernier}, le trait y relie les deux positions voisines` : "";
        return start || gap ? ` ${esc(p.nom)}\u00a0: ${[start, gap].filter(Boolean).join("\u00a0; ")}.` : "";
      }).join("") + "</p>"
    : "";
  const { "meteo-france": mfTraces, ibtracs, consulte } = TRACES_SOURCES;
  const older = TRACES.filter((t) => t.source === "ibtracs").map((t) => t.nom_annee);
  const sources = traces
    ? `Traces : <a href="${mfTraces.lien}" rel="noopener">${mfTraces.nom}</a>, ${mfTraces.licence}, consultées le ${consulte.split("-").reverse().join("/")}.` +
      (older.length
        ? ` ${older.join(" et ")} ${older.length > 1 ? "sont plus anciennes" : "est plus ancienne"} que ces données, qui commencent en ${mfTraces.depuis} : ` +
          `${older.length > 1 ? "leurs traces viennent" : "sa trace vient"} des positions du CMRS reprises par <a href="${ibtracs.lien}" rel="noopener">${ibtracs.nom}</a>.`
        : "") +
      " Cette carte ne montre aucun système de la saison. "
    : parcours.length
    ? `Positions\u00a0: Météo-France, CMRS de La Réunion (bulletins WTIO31 FMEE), avec son accord écrit${ACCORD_TRACE ? ` du ${ACCORD_TRACE.split("-").reverse().join("/")}` : ""}, dernière position le ${avisLe(parcours[0].heure)} (heure de La Réunion). Cette carte ne montre aucune prévision. `
    : "Cette carte ne montre aucun système, ni sa position ni sa trajectoire. ";
  return `<figure class="card bassin${active ? "" : " mapcard"}">${basinMap(traces, parcours)}<figcaption>${now}${path}<details class="note"><summary>Sources</summary><p>En pointillé, la zone suivie par le CMRS de La Réunion (Météo-France), de l'équateur à 40°\u00a0S et des côtes de l'Afrique à 90°\u00a0E (<a href="${ZONE_SOURCE}" rel="noopener">CMRS, présentation à l'OMM, 2017</a>). ` +
    `${sources}Côtes\u00a0: Natural Earth (domaine public).</p></details></figcaption></figure>${traces ? `${script(TRACES_SCRIPT)}` : ""}`;
}

// The summary ends with Météo-France's address (tools/cyclones.ts), written out for the connector, which has no links: on
// the page, the same words link to it.
const OFFICIEL_CYCLONE_TEXTE = mf.officiel(mf.OFFICIEL_CYCLONE);
const resumeHtml = (resume: string) =>
  resume.endsWith(OFFICIEL_CYCLONE_TEXTE) ? esc(resume.slice(0, -OFFICIEL_CYCLONE_TEXTE.length)) + officielHtml(mf.OFFICIEL_CYCLONE) : esc(resume);

export function cyclonesPage(origin: string, data: Cached<CyclonesAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/cyclones`;
  const active = d?.systemes_actifs ?? [];
  const suivis = active.length ? [] : d?.suivi_cmrs ?? [];

  const status = !d
    ? loading("Le suivi des cyclones")
    : suivis.length
    ? `<div class="now"><span class="big">${suivis.length}</span><p>${esc(suiviPhrase(suivis, false))}</p></div>`
    : `<div class="now"><span class="big">${active.length}</span><p>système${active.length > 1 ? "s" : ""} tropica${active.length > 1 ? "ux" : "l"} actif${active.length > 1 ? "s" : ""} dans le sud-ouest de l'océan Indien.</p></div>`;
  // No track of ours: the official map is on Météo-France's site, and above the basin's map while a system is active.
  const official = `<p class="lead">Trajectoire et bulletins officiels : <a href="${mf.OFFICIEL_CYCLONE}" rel="noopener">consulter le site officiel de Météo-France</a>.</p>`;

  const title = "Cyclone en ce moment : trajectoire, alerte · 974";
  const short = "Cyclones autour de La Réunion (974) : systèmes actifs et leur stade selon le CMRS de Météo-France, alerte cyclonique, saisons passées, lien officiel.";
  const description = d ? describe(`${d.resume}`, short) : short;

  const band = `${crumbBar("Cyclones")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Bulletins du CMRS de La Réunion</p>
    <h1>Cyclones <span class="n974">974</span></h1>
    ${status}
    ${official}
    ${d?.alerte_cyclonique ? `<p class="lead"><b>${esc(d.alerte_cyclonique)}</b></p>` : ""}
    ${d && kitAvantOrange(d.ecoles) ? `<p class="lead"><a href="/kit-cyclone">Se préparer : le kit d'urgence du plan →</a></p>` : ""}
    ${ask(`Néna in siklone pa loin La Rényon ? Gèt si ${url} é di amwin sak Météo-France é la préfektir i di.`,
      `Y a-t-il un cyclone près de La Réunion ? Lis ${url} et dis-moi ce qu'en disent Météo-France et la préfecture.`)}
  </div>
  ${active.length || suivis.length ? "" : basinFigure(d, 0)}
</div>`;

  // In calm weather the section would only repeat the hero's « 0 système tropical actif »: it shows while a system is
  // active, or followed by the RSMC before GDACS lists it (its map, then the basin's without the past tracks).
  const shown = active.length + suivis.length;
  const body = `${d && !shown ? "" : `<section aria-labelledby="h-actifs">
  <div class="sec-h"><p class="eyebrow">En ce moment</p><h2 id="h-actifs">${suivis.length ? "Systèmes suivis" : "Systèmes actifs"}</h2>
  <p>${d ? resumeHtml(d.resume) : ""}</p></div>
  ${d ? active.map(activeCard).join("") : `<p class="card">Le suivi se charge : rechargez la page dans quelques secondes.</p>`}
  ${shown ? carteHtml(d?.carte, now) + basinFigure(d, shown) : ""}
</section>`}
<section aria-labelledby="h-alerte">
  <div class="sec-h"><p class="eyebrow">Préfecture de La Réunion</p><h2 id="h-alerte">Les phases de l'alerte cyclonique</h2>
  <p>${d ? esc(d.phases_alerte) : ""}</p></div>
  <div class="card"><ul class="plain">
    <li><a href="https://meteofrance.re/fr/cyclone" rel="noopener">Activité cyclonique et bulletins de Météo-France La Réunion</a></li>
    <li><a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Vigilance et alerte cyclonique en cours (Météo-France)</a></li>
    <li><a href="https://www.reunion.gouv.fr" rel="noopener">Consignes de la préfecture de La Réunion</a></li>
    <li><a href="${esc(origin)}/vigilance">La vigilance du moment sur rundata.re</a></li>
    <li><a href="/ecoles-cyclone">Cyclone : les écoles sont-elles fermées ?</a></li>
    <li><a href="/alerte-cyclone">Alerte cyclonique : ce qui ferme, ce qui continue</a></li>
  </ul></div>
  <div class="card"><h3>Alerte cyclonique</h3>${CYCLONE_SCALE}
  <p class="note">Les consignes officielles et les arrêtés sont ceux de la <a href="https://www.reunion.gouv.fr/">préfecture de La Réunion</a>. ${esc(RADIO)}</p></div>
</section>
${d ? `<section aria-labelledby="h-saison">
  <div class="sec-h"><p class="eyebrow">Juillet à juin</p><h2 id="h-saison">Saison ${esc(d.saison_en_cours.nom)}</h2><p>${esc(d.saison)}</p></div>
  ${seasonTable(d.saison_en_cours)}
</section>` : ""}
${d?.saison_precedente ? `<section aria-labelledby="h-saison-prec">
  <div class="sec-h"><p class="eyebrow">Saison passée</p><h2 id="h-saison-prec">Saison ${esc(d.saison_precedente.nom)}</h2></div>
  ${seasonTable(d.saison_precedente)}
</section>` : ""}
<section aria-labelledby="h-passes">
  <div class="sec-h"><p class="eyebrow">Mesures Météo-France</p><h2 id="h-passes">Cyclones passés</h2>
  <p>La pluie et les rafales mesurées station par station pendant leur passage, et les records de station.</p></div>
  <div class="card"><ul class="plain">${PASSES.map((p) => `<li><a href="/cyclones/${p.slug}">Cyclone ${esc(p.nom)}, ${esc(p.date)}</a></li>`).join("")}</ul></div>
</section>
${d ? `<section aria-labelledby="h-src"><div class="sec-h"><h2 id="h-src">D'où viennent ces données</h2><p>${esc(d.a_savoir)}</p></div>${data ? sourcesNote(d.sources, data) : ""}</section>` : ""}
${connectorCta("cyclones", "les cyclones")}`;

  return layout(origin, { title, description, path: "/cyclones", jsonld: [crumbs(origin, "Cyclones", "/cyclones"), webPage(origin, "/cyclones", title, description, data)], alerte, iaAside: true, vert: !!d && !alerte && !active.length }, band, body);
}

export function cyclonesLive(data: Cached<CyclonesAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const active = d.systemes_actifs ?? [];
  // In an alert, what the plan says of daily life is a click away.
  const plan = d.vie_quotidienne ? ` · <a href="/alerte-cyclone">Ce qui ferme, ce qui continue →</a>` : "";
  if (active.length) {
    const r = active[0];
    return { valeur: `${active.length} système${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""}`, detail: `${esc(capital(r.nom))}${r.stade ? `, ${esc(r.stade)}` : ""}${plan}` };
  }
  const suivis = d.suivi_cmrs ?? [];
  if (suivis.length) return { valeur: `${suivis.length} système${suivis.length > 1 ? "s" : ""} suivi${suivis.length > 1 ? "s" : ""}`, detail: `${esc(suivis[0].systeme)}, d'après le CMRS${plan}` };
  const last = d.saison_en_cours.systemes[0] ?? d.saison_precedente?.systemes[0];
  return { valeur: "aucun système actif", detail: `saison ${esc(d.saison_en_cours.nom)}${last ? ` ; dernier : ${esc(capital(last.nom))} (${esc(last.du)} – ${esc(last.au)})` : ""}` };
}
