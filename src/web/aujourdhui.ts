/**
 * The day of one commune (/aujourdhui/<commune>): what the tool resume_du_jour answers, as a page, from the same
 * summary (tools/resume.ts) cut from the same copies. Nothing more is fetched; a part without a recent copy links to
 * the page that has it.
 */
import { epciOf, horsCompte } from "../vie/decheteries.js";
import type { Cached } from "../cache.js";
import * as mf from "../providers/vigilance.js";
import { ACCUEILS } from "../providers/agenda.js";
import type * as annuaire from "../providers/annuaire.js";
import { MAIRIE_FERMEE, type Resume, UPDATING } from "../tools/resume.js";
import { MARCHES } from "../vie/marches.js";
import * as monuments from "../vie/monuments.js";
import { STATIONS_974 } from "../providers/meteofrance-stations.js";
import { INSEE } from "../places/insee.js";
import { notePosition, porte, SHEET as ALLER } from "./aller.js";
import { type Alerte, credit, sansPeriode } from "./data.js";
import { connectorCta, courantItem, lienNom, silentItem, silentText, webPage } from "./domains.js";
import { adresseTexte, cheminTexte, telephoneTexte } from "./adresse.js";
import { fenetre, islandMap } from "./map.js";
import { brut, href as lienSur, html, type Html } from "./html.js";
import { a, communeDite, de, fourchette } from "../tools/format.js";
import { compteAvis, NE_PAS_BOIRE, periodeCoupure } from "../tools/coupures.js";
import { ask, credits, icon, layout, officielHtml, SITE, thin, leJour } from "./pages.js";
import type { PlacePage } from "./places.js";

type SiteLu = { site: string; lu_le: string; a_jour: boolean };
const leA = (lu_le: string) => { const [d, h] = lu_le.split(" "); return `le ${d} à ${h}`; };
/** Its own site read with nothing today (tools/resume.ts): « , dont le site de la commune de Saint-André, lu le 24/10 à 08:00 »;
 *  read more than a day ago: « ; le site … n'a pas pu être relu depuis le 24/10 à 08:00 » (23/11/2026). `court` drops the
 *  commune's name, which the card says before it. */
function sitesDits(sites: SiteLu[] | undefined, commune: string, court = false) {
  const name = (x: SiteLu) => (court ? x.site.replace(` ${de(commune)}`, "") : x.site);
  const fresh = sites?.filter((x) => x.a_jour) ?? [];
  const old = sites?.filter((x) => !x.a_jour) ?? [];
  return {
    dont: fresh.length ? html`, dont ${fresh.map((x, i) => html`${i ? " et " : ""}le ${name(x)}, lu ${leA(x.lu_le)}`)}` : "",
    ancien: old.length ? html`${old.map((x, i) => html`${i ? " et " : ""}le ${name(x)} n'a pas pu être relu depuis ${leA(x.lu_le)}`)}` : "",
  };
}

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 152;

/** « à Saint-Paul », « au Port », « aux Avirons », « à l'Entre-Deux ». */
export const aCommune = a;
export const deCommune = de;

// The texts of the page, worded for the site.
// Each of the commune's two pages says its role (UX review of 04/11/2026, words validated on 06/11): this
// one the day, /communes/<commune> the lasting record.
export const titleOf = (p: PlacePage) =>
  [`La journée ${aCommune(p.nom)} : eau, météo, sorties · La Réunion (974)`, `La journée ${aCommune(p.nom)} · La Réunion (974)`]
    .find((t) => t.length <= TITLE_MAX) ?? `La journée ${aCommune(p.nom)} · 974`;
export const H1 = (p: PlacePage) => `La journée ${aCommune(p.nom)}`;
/** The link from the commune's page, saying what is here. */
export const LINK = (p: PlacePage) => `La journée ${aCommune(p.nom)} : eau, vigilance, météo, sorties →`;
/** The link to the commune's page, saying what is there. */
export const FICHE = (p: PlacePage) => `La fiche ${deCommune(p.nom)} : mairie, écoles, médecins, élections →`;
export const HOOK = (p: PlacePage) => `Aujourd'hui ${aCommune(p.nom)} : la mesure, la vigilance, l'eau, les routes, l'actu, les sorties et la vie pratique.`;

/**
 * « Aujourd'hui à Saint-Paul (974) : 24,5 °C mesurés le 05/11 à 15:10, 12 sorties, 1 coupure d'eau. Eau, vigilance… »,
 * each figure only when there is one, the last ones left out when too long; without any, « La journée à Saint-Paul
 * (974) : eau, vigilance… ».
 */

type Markets = NonNullable<Resume["marches_du_jour"]>;
type Aller = ReturnType<typeof porte>["aller"];

/** « verte pour l'Est », « jaune fortes pluies pour l'Est »: the zone's level as the summary words it, without the commune. */
function vigilanceLevel(maintenant: string): string {
  const head = "Vigilance météo : ";
  const end = maintenant.indexOf(" (Météo-France)");
  return maintenant.startsWith(head) && end > 0 ? maintenant.slice(head.length, end) : "";
}
/**
 * The banner's colour for a level, the highest named (the brand kit): red for red and violet, the kit's orange for orange (never
 * red, which would read as the red alert), the site's alert colour otherwise.
 */
export const levelClass = (s: string) => (/\b(rouge|violette?)\b/.test(s) ? ' class="rouge"' : /\borange\b/.test(s) ? ' class="orange"' : "");

/**
 * The top of /aujourdhui, what asks to act first (UX review of 04/11/2026): the water not to drink, the
 * vigilance above green with the zone of Météo-France, never the commune, the cyclone alert in its official words.
 * Nothing when there is nothing; orange and red in their own colours (levelClass).
 */
export function urgent(p: PlacePage, r: Resume): string {
  return urgence(p, r).texte;
}
function urgence(p: PlacePage, r: Resume): Html {
  const items: Html[] = [];
  const dry = r.coupures_eau?.avis.filter((n) => n.ne_pas_boire).length ?? 0;
  if (dry) {
    const s = dry > 1;
    items.push(html`<li>Eau à ne pas boire\u00a0: ${dry} avis en cours ${aCommune(p.nom)}, dans les secteurs nommés par ${s ? "les avis" : html`l'avis`}. <a href="/coupures-eau/${p.slug}">Voir ${s ? "les avis" : html`l'avis`}</a></li>`);
  }
  const v = r.vigilance;
  const level = v?.au_dessus_du_vert ? vigilanceLevel(v.maintenant) : "";
  if (level) items.push(html`<li${brut(levelClass(level))}>Vigilance ${level} (Météo-France). <a href="/vigilance">Voir les consignes</a></li>`);
  if (v?.alerte_cyclonique) items.push(html`<li${brut(levelClass(v.alerte_cyclonique))}>${v.alerte_cyclonique.replace(/\.$/, "")} (Météo-France). <a href="/vigilance">Voir les consignes</a></li>`);
  if (v?.ecoles) items.push(html`<li><a href="/ecoles-cyclone">${v.ecoles}</a></li>`);
  return items.length ? html`<ul class="urgence" aria-label="À savoir d'abord">${items}</ul>` : html``;
}

/** The commune of a Météo-France station, from its number (its first five digits are the commune's INSEE code). */
export function stationCommune(nom: string): string | undefined {
  const id = STATIONS_974.find((s) => s[1] === nom)?.[0];
  return id ? Object.entries(INSEE).find(([, code]) => code === id.slice(0, 5))?.[0] : undefined;
}

/** Then a short line by subject, its label in bold, absent when its data is missing (wording validated on 04/11/2026). */
export function dayLines(p: PlacePage, r: Resume): string {
  return lignesDuJour(p, r).texte;
}
function lignesDuJour(p: PlacePage, r: Resume): Html {
  const line = (label: string, text: Html) => html`<li><b>${label}\u00a0:</b> ${text}</li>`;
  const m = r.meteo;
  const s = m?.mesure;
  const f = m?.prevision?.aujourd_hui;
  const where = s ? [stationCommune(s.station), s.distance_km != null ? `à ${String(s.distance_km).replace(".", ",")}\u00a0km` : ""].filter(Boolean).join(", ") : "";
  const measured = s?.mesures.temperature
    ? html`${thin(s.mesures.temperature)} mesurés ${leJour(s.heure_mesure)} à la station ${s.station}${where ? html` (${where})` : ""}.`
    : "";
  const forecast = f?.temperature_min && f.temperature_max ? html`Prévision ${f.periode ?? "du jour"}\u00a0: ${thin(fourchette(f.temperature_min, f.temperature_max))}${f.ciel_en_journee ? html`, ${f.ciel_en_journee}` : ""}.` : "";
  const v = r.vigilance;
  const level = v && !v.au_dessus_du_vert && !v.alerte_cyclonique ? vigilanceLevel(v.maintenant) : "";
  const ev = r.evenements_du_jour;
  const n = ev ? ev.liste.length + (ev.autres ?? 0) : 0;
  const lus = sitesDits(ev?.sites_lus, p.nom);
  const lines = [
    measured || forecast ? line("Météo", html`${measured}${measured && forecast ? " " : ""}${forecast}`) : "",
    level ? line("Vigilance", html`${level} (Météo-France).`) : "",
    ev ? line("Sorties", html`${n ? html`${plural(n, "événement")} aujourd'hui` : html`aucun événement trouvé aujourd'hui dans les agendas lus${lus.dont}${lus.ancien ? html`\u00a0; ${lus.ancien}` : ""}`}${ev.injoignable ? html`, ${ev.injoignable.court}` : ""}.`) : "",
    r.carburants?.prix_maximum ? line("Carburants", html`prix maximum du mois\u00a0: ${r.carburants.prix_maximum}.`) : "",
    line("Pharmacie de garde", brut(lienNom(r.pharmacie_de_garde.site, "3237.fr", ' rel="noopener"'))),
  ];
  return html`<ul class="jour">${lines}</ul>`;
}

/**
 * The commune's markets on /aujourdhui: those held today, those open all week apart (never « the market of the day »),
 * then those whose days no source gives, by name, with the town hall's page; never « no market ».
 * A town hall's market says its page and, when old, its date.
 */
function marketItems(mk: Markets | undefined, commune: string, aller: Aller): Html[] {
  if (!mk) return [];
  // Its position from the bundled list, by its OpenStreetMap object: the summary does not give it. None for a market
  // only a town hall gives: no button then.
  const go = (x: { nom: string; adresse?: string; carte?: string }) => {
    const m = x.carte ? MARCHES().find((y) => y.osm === x.carte) : undefined;
    const button = m?.lat != null && m.lon != null ? aller({ nom: x.nom, lat: m.lat, lon: m.lon, adresse: x.adresse ? `${x.adresse}, ${commune}` : undefined }) : "";
    return brut(button ? ` ${button}` : "");
  };
  const by = (x: { d_apres?: string }) => (x.d_apres ? `, d'après le ${x.d_apres}` : "");
  const name = (x: { nom: string; lien: string }) => html`<a href="${lienSur(x.lien)}" rel="noopener"${brut(fenetre(x.lien))}><b>${x.nom}</b></a>`;
  // « Jours et horaires des marchés : site de la mairie de Saint-Pierre → », its words outside the link but the site's.
  const [label, site] = mk.mairie ? mk.mairie.texte.split(" : ") : [];
  return [
    ...mk.liste.map((x) => html`<li>Marché aujourd'hui : ${name(x)} <span class="note">${x.horaires_aujourd_hui}${x.adresse ? html`, ${x.adresse}` : ""}${by(x)}</span>${go(x)}</li>`),
    ...(mk.permanents ?? []).map((x) => html`<li>Marché permanent : ${name(x)} <span class="note">${x.horaires ?? ""}${x.horaires_aujourd_hui === "fermé aujourd'hui" ? html`, fermé aujourd'hui` : ""}${x.adresse ? html`, ${x.adresse}` : ""}${by(x)}</span>${go(x)}</li>`),
    // Held today by their source, without an hour: never « Marché aujourd'hui ».
    ...(mk.heures_non_trouvees ?? []).map((x) => html`<li>Marché sans heures : ${name(x)} <span class="note">${x.manque}${x.adresse ? html`, ${x.adresse}` : ""}</span>${go(x)}</li>`),
    // Those whose days no source gives, grouped by where they were looked for.
    ...[...new Set((mk.jours_non_trouves ?? []).map((x) => x.manque))].map((manque) => [manque, mk.jours_non_trouves!.filter((x) => x.manque === manque)] as const).map(([manque, xs], i) =>
      html`<li>${i || mk.liste.length || mk.permanents || mk.heures_non_trouvees ? "Autres marchés" : "Marchés"} : ${xs.map((x, j) => html`${j ? ", " : ""}${name(x)}`)}, <span class="note">${manque}</span></li>`),
    mk.mairie ? html`<li>${label} : <a href="${lienSur(mk.mairie.site)}" rel="noopener"${brut(fenetre(mk.mairie.site))}>${site} →</a></li>` : html``,
  ];
}

export function descriptionOf(p: PlacePage, r: Resume): string {
  const m = r.meteo?.mesure;
  const t = m?.mesures.temperature;
  const events = r.evenements_du_jour ? r.evenements_du_jour.liste.length + (r.evenements_du_jour.autres ?? 0) : 0;
  // Only the notices that announce a cut: not one saying not to drink the water, nor a quality notice (compteAvis).
  const cuts = r.coupures_eau ? compteAvis(r.coupures_eau.avis).coupures : 0;
  const dry = r.coupures_eau?.avis.filter((n) => n.ne_pas_boire).length ?? 0;
  const figures = [
    dry ? NE_PAS_BOIRE(dry) : "",
    t ? `${thin(t)} mesurés ${leJour(m!.heure_mesure)}` : "",
    events ? plural(events, "sortie") : "",
    cuts ? plural(cuts, "coupure d'eau", "coupures d'eau") : "",
  ].filter(Boolean);
  // Too long: the last figures left out first, the water not to drink kept as long as it fits.
  for (let n = figures.length; n > 0; n--) {
    const said = `Aujourd'hui ${aCommune(p.nom)} (974) : ${figures.slice(0, n).join(", ")}.`;
    const long = `${said} Eau, vigilance, routes, sorties : la journée de la commune.`;
    if (long.length <= DESCRIPTION_MAX) return long;
    // With the water not to drink, longer with its sectors: the closing words go before a figure.
    if (dry && said.length <= DESCRIPTION_MAX) return said;
  }
  // The water not to drink is never the figure left out: said alone, with its sectors.
  if (dry) return `Aujourd'hui ${aCommune(p.nom)} (974) : ${NE_PAS_BOIRE(dry)}.`;
  return `La journée ${aCommune(p.nom)} (974) : eau, vigilance, météo, routes, sorties.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/**
 * A link to a page of the site written as its address (« rundata.re/collecte/saint-paul »): it may go to the next line
 * after each « / » (cheminTexte()), and keeps its whole text as its name, as lienNom() does.
 */
const cheminLien = (path: string) => html`<a href="${lienSur(path)}" aria-label="${`rundata.re${path}`}">rundata.re${brut(cheminTexte(path))}</a>`;

/** « 29/10/2026 ». */
const jma = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The commune's historic monuments (vie/monuments.ts), bundled: each name leads to its notice on POP, the ministry's
 * platform. Folded, but for a few: Saint-Denis has more than 60. A commune with none says so, after the base.
 */
export function monumentsCard(nom: string): string {
  return carteMonuments(nom).texte;
}
function carteMonuments(nom: string): Html {
  const list = monuments.ofCommune(nom);
  const base = "la base Mérimée du ministère de la Culture";
  if (!list.length) return html`<div class="card"><h3>Monuments historiques</h3><p>Aucun monument historique ${aCommune(nom)} dans ${base}.</p></div>`;
  const item = (m: monuments.Monument) => {
    // A monument on two communes says the other one.
    const aussi = monuments.autres(m, nom);
    const note = [monuments.protege(m), m.adresse, aussi.length ? `aussi ${aussi.map(aCommune).join(", ")}` : ""].filter(Boolean).join(" · ");
    return html`<li><a href="${lienSur(monuments.notice(m))}" rel="noopener"${brut(fenetre(monuments.notice(m)))}>${m.nom}</a> <span class="note">${note}</span></li>`;
  };
  return html`<div class="card"><details${list.length <= 5 ? " open" : ""}><summary><h3>Monuments historiques</h3> <span class="note">${plural(list.length, "classé ou inscrit", "classés ou inscrits")}</span></summary><ul class="plain">${list.map(item)}</ul><p class="note">D'après ${base}, liste du ${jma(monuments.FICHIER_DU)}\u00a0: chaque nom mène à sa notice.</p></details></div>`;
}

// `sr`: words after the title's link for screen readers only (« à Saint-Paul »), when the page links the same title elsewhere.
const card = (ic: string, title: string, body: Html, href?: string, cls = "", sr = "") =>
  html`<div class="card${cls}">${brut(icon(ic))}<h3>${href ? html`<a href="${href}">${title}${sr ? html`<span class="sr"> ${sr}</span>` : ""}</a>` : title}</h3>${body}</div>`;
// The item's content, without its <li>: a cut notice and an event put their own words before it.
const entree = (x: { titre: string; lien?: string; quand?: string; media?: string }) =>
  html`${x.lien ? html`<a href="${lienSur(x.lien)}" rel="noopener"${brut(fenetre(x.lien))}>${x.titre}</a>` : x.titre}${x.quand || x.media ? html` <span class="note">${[x.quand, x.media].filter(Boolean).join(" · ")}</span>` : ""}`;
const li = (x: { titre: string; lien?: string; quand?: string; media?: string }) => html`<li>${entree(x)}</li>`;

/**
 * `mairie`: the office as the commune's copy has it, for its position (« Y aller »), which the summary, also the tool's
 * answer, does not give.
 */
/** « ouvre à 8\u00a0h (jusqu'à 16\u00a0h) » as « <b>ouvre à 8\u00a0h</b> <span class="note">(jusqu'à 16\u00a0h)</span> ». */
const mairieEtat = (etat: string) => {
  const [verbe, suite] = etat.split(/ (?=\()/);
  return html`<b>${verbe}</b>${suite ? html` <span class="note">${suite}</span>` : ""}`;
};

export function aujourdhuiPage(origin: string, p: PlacePage, r: Resume, at: Cached<unknown> | null, alerte?: Alerte, mairie?: annuaire.Office | null): string {
  const g = porte(alerte);
  const path = `/aujourdhui/${p.slug}`;
  const url = `${origin}${path}`;
  const m = r.meteo;
  const f = m?.prevision?.aujourd_hui;
  // The rain says itself (« 1,6 mm de pluie », « pas de pluie prévue »): no « pluie » before it. Today's hours (« de 15\u00a0h
  // à minuit ») are said once after the day, not again after the rain.
  const dayForecast = (j?: typeof f) => (j ? html`${j.jour}${j.periode ? html` ${j.periode}` : ""} : ${j.temperature_min && j.temperature_max ? thin(fourchette(j.temperature_min, j.temperature_max)) : ""}${j.ciel_en_journee ? html`, ${j.ciel_en_journee}` : ""}${j.pluie ? html`, ${thin(sansPeriode(j.pluie, j.periode))}` : ""}` : "");

  const weather = m
    ? card("thermo", `Météo ${p.nom}`,
        html`${m.mesure ? html`<p><b>${thin(m.mesure.mesures.temperature ?? "")}</b> mesurés ${leJour(m.mesure.heure_mesure)} par la station ${m.mesure.station}${communeDite(m.mesure, p.nom) ? html` ${a(communeDite(m.mesure, p.nom)!)}` : ""} (${m.mesure.altitude_m.toLocaleString("fr-FR")} m${m.mesure.distance_km != null ? html`, à ${String(m.mesure.distance_km).replace(".", ",")} km` : ""}).</p>` : ""}${f ? html`<p>Prévision, pas une mesure : ${dayForecast(f)}${m.prevision?.demain ? html` ; ${dayForecast(m.prevision.demain)}` : ""}.</p>` : ""}`,
        `/meteo/${p.slug}`)
    : "";
  const v = r.vigilance;
  const vigil = v
    ? card("alert", "Vigilance", html`<p>${v.maintenant}${v.vagues_submersion ? html` ${v.vagues_submersion}.` : ""}</p>${v.alerte_cyclonique ? html`<p><b>${v.alerte_cyclonique}</b></p>` : ""}${v.ecoles ? html`<p><a href="/ecoles-cyclone">${v.ecoles}</a></p>` : ""}<p>${brut(officielHtml(v.alerte_cyclonique ? mf.OFFICIEL_CYCLONE : mf.OFFICIEL_VIGILANCE))}</p>`, "/vigilance", v.alerte_cyclonique || v.au_dessus_du_vert ? " warn" : "")
    : "";
  const small = [
    // The buoy first when one measures near the commune, then the satellite (tools/resume.ts, sea).
    r.mer ? html`<li>Mer : <b>${thin(r.mer.temperature_eau)}</b> <span class="note">${r.mer.mesure}</span>${"satellite" in r.mer && r.mer.satellite ? html`, satellite : <b>${thin(r.mer.satellite.temperature_eau)}</b>` : ""} · <a href="/mer">la mer →</a></li>` : "",
    r.air ? html`<li>Air : <b>${r.air.qualite}</b> <span class="note">indice ATMO prévu ${r.air.indice_atmo}${r.air.polluants ? html`, ${r.air.polluants.join(", ")}` : ""}</span> · <a href="/air">l'air →</a></li>` : "",
    // A line past its hour: in electricite's words, never its value as the day's (audit of the AI tools, 23/11/2026).
    r.electricite?.avertissement ? html`<li>Électricité : <span class="note">${r.electricite.avertissement}</span> · <a href="/electricite">l'électricité →</a></li>`
    : r.electricite ? html`<li>Électricité : <b>${String(r.electricite.renouvelable_pct).replace(".", ",")} % renouvelable</b> <span class="note">à ${r.electricite.heure}</span> · <a href="/electricite">l'électricité →</a></li>` : "",
    r.calendrier?.jour_ferie ? html`<li>Jour férié : <b>${r.calendrier.jour_ferie}</b></li>` : "",
    r.calendrier?.vacances_scolaires ? html`<li>${r.calendrier.vacances_scolaires} en cours · <a href="/calendrier">le calendrier →</a></li>` : "",
    html`<li>Soleil : lever ${r.soleil.lever}, coucher ${r.soleil.coucher}</li>`,
    // Closed all day: said once, « fermée aujourd'hui », never « fermée » then its hours « fermée aujourd'hui ».
    // Closed at this hour on a day it opens: the tool's sentence, its verb in bold and its hours after it (24/11/2026).
    r.mairie?.etat ? html`<li>Mairie : ${mairieEtat(r.mairie.etat)}${r.mairie.telephone ? html` · ${brut(telephoneTexte(r.mairie.telephone))}` : ""}${mairie ? html` ${brut(g.aller({ nom: mairie.nom, lat: mairie.lat ?? NaN, lon: mairie.lon ?? NaN, adresse: mairie.adresse }, "mairie"))}${brut(notePosition(mairie))}` : ""}</li>`
    : r.mairie ? html`<li>Mairie : <b>${brut(r.mairie.jour_ferie ? "sans doute fermée, jour férié" : r.mairie.ouverte === null ? "horaires absents de l'annuaire" : r.mairie.horaires_aujourd_hui === MAIRIE_FERMEE ? MAIRIE_FERMEE : r.mairie.ouverte ? "ouverte" : "fermée")}</b>${r.mairie.horaires_aujourd_hui && r.mairie.horaires_aujourd_hui !== MAIRIE_FERMEE ? html` <span class="note">${r.mairie.horaires_aujourd_hui}</span>` : ""}${r.mairie.telephone ? html` · ${brut(telephoneTexte(r.mairie.telephone))}` : ""}${mairie ? html` ${brut(g.aller({ nom: mairie.nom, lat: mairie.lat ?? NaN, lon: mairie.lon ?? NaN, adresse: mairie.adresse }, "mairie"))}${brut(notePosition(mairie))}` : ""}</li>` : "",
  ];

  const c = r.circulation;
  const roads = card("car", "Routes et circulation",
    html`${c.infos_routes?.length ? html`<ul class="plain">${c.infos_routes.map(li)}</ul>` : c.infos_routes ? html`<p>Aucune information des médias sur les routes ou des blocages ${aCommune(p.nom)} ces dernières heures.</p>` : ""}${c.routes_ile?.length ? html`<p class="note">Ailleurs sur l'île :</p><ul class="plain">${c.routes_ile.map((x) => li({ titre: x.titre, lien: x.lien, media: x.source, quand: x.heure }))}</ul>` : ""}${c.bus?.length ? html`<p class="note">Info trafic des bus : ${c.bus.map((x, i) => html`${i ? " ; " : ""}${`${x.reseau} : ${x.titre}`}`)}</p>` : ""}<p class="note">rundata.re ne mesure pas les bouchons : ${brut(lienNom(c.carte_officielle, "la carte officielle sur infotrafic.re ↗", ' rel="noopener"'))}, et <a href="/trafic">la page circulation</a>.</p>`,
    "/trafic");

  const news = r.actualites
    ? card("news", `Actualités ${deCommune(p.nom)}`, r.actualites.length ? html`<ul class="plain">${r.actualites.map(li)}</ul>` : html`<p>Rien de nouveau qui nomme ${p.nom} ces dernières heures dans les médias lus.</p>`, "/actualites")
    : "";
  // No notice read: « pas d'avis », never « aucune coupure », with who publishes the notices read (the mairie, the
  // CIREST, else the distributor) and when, as on /coupures-eau/<commune> (wording validated on 22/11/2026). The mairie is not that
  // elsewhere when the notices read are its own.
  const noCut = (c: NonNullable<typeof r.coupures_eau>) => {
    const who = c.publie_par ?? c.distributeur;
    const ailleurs = /^(?:la )?(?:ville|commune|mairie)\b/i.test(who ?? "") ? "Une coupure peut être annoncée ailleurs." : "Une coupure peut être annoncée ailleurs, par la mairie par exemple.";
    return `Pas d'avis de coupure récent ou à venir${who ? ` publié par ${who}` : ""}${c.lus_le ? `, lu ${leJour(c.lus_le)}` : ""}. ${ailleurs}`;
  };
  const cuts = r.coupures_eau
    ? card("drop", "Coupures d'eau",
        html`${r.coupures_eau.injoignable ? html`<p class="note">${brut(silentText(r.coupures_eau.injoignable))}</p>` : ""}${r.coupures_eau.avis.length
          ? html`<ul class="plain">${r.coupures_eau.avis.map((n) => html`<li>${n.ne_pas_boire ? html`<b>Eau à ne pas boire</b> · ` : ""}${entree({ titre: n.titre, lien: n.lien })}${n.coupure && periodeCoupure(n.coupure) ? html` <span class="note">${periodeCoupure(n.coupure)}${n.coupure.etat ? html`, ${n.coupure.etat}` : ""}</span>` : ""}</li>`)}</ul>`
          : r.coupures_eau.injoignable ? ""
          : html`<p>${r.coupures_eau.note ?? noCut(r.coupures_eau)}${r.coupures_eau.site_distributeur && r.coupures_eau.distributeur ? html` ${brut(lienNom(r.coupures_eau.site_distributeur, `Le site de ${r.coupures_eau.distributeur} ↗`, ' rel="noopener"'))}` : ""}</p>`}${
        // Shared: who distributes which networks, and the mairie's site for the one whose notices are not read.
        r.coupures_eau.partage ? html`<p class="note">${r.coupures_eau.partage.texte}${r.coupures_eau.partage.mairie ? html` ${brut(lienNom(r.coupures_eau.partage.mairie.lien, `${r.coupures_eau.partage.mairie.libelle} ↗`, ' rel="noopener"'))}` : ""}</p>` : ""}`,
        `/coupures-eau/${p.slug}`, r.coupures_eau.avis.some((n) => n.ne_pas_boire) ? " warn" : "", aCommune(p.nom))
    : "";
  const ev = r.evenements_du_jour;
  const events = ev
    ? card("music", "Sortir aujourd'hui",
        html`${ev.liste.length
          ? html`<ul class="plain" data-sortie>${ev.liste.map((e) => html`<li>${e.statut ? html`<b>${e.statut}</b> · ` : ""}${e.lien && ACCUEILS.has(e.lien) ? html`<a href="${lienSur(e.lien)}" rel="noopener" target="_blank">${e.titre}</a>` : entree({ titre: e.titre, lien: e.lien })} <span class="note">${[...[e.quand, e.lieu, e.prix].filter(Boolean).map((x) => html`${x!}`), ...(e.source ? [brut(adresseTexte(`Source\u00a0: ${e.source}`))] : [])].map((x, i) => html`${i ? " · " : ""}${x}`)}</span></li>`)}</ul>${ev.autres ? html`<p class="note">Et ${plural(ev.autres, "autre")}.</p>` : ""}`
          : ((lus) => lus.ancien
            ? html`<p>Rien trouvé aujourd'hui ${aCommune(p.nom)} dans les agendas lus${lus.dont}. ${brut(String(lus.ancien).charAt(0).toUpperCase())}${brut(String(lus.ancien).slice(1))}\u00a0: à vérifier sur son agenda.</p>`
            : html`<p>Rien d'annoncé aujourd'hui ${aCommune(p.nom)} dans les agendas lus${lus.dont}.</p>`)(sitesDits(ev.sites_lus, p.nom, true))}${
        // Its own site that did not answer at our last read, with its hour (tools/injoignable.ts).
        ev.injoignable ? html`<p class="note">${brut(silentText(ev.injoignable))}</p>` : ""}`,
        "/evenements")
    : "";
  const d = r.decheteries;
  const dFresh = d?.sites.filter((x) => x.accepte) ?? [];
  const dGreen = dFresh.filter((x) => x.accepte!.includes("déchets verts")).length;
  const practical = [
    ...(r.coupures_electricite?.injoignable ? [brut(silentItem(r.coupures_electricite.injoignable))] : []),
    ...(r.coupures_electricite?.avis ?? []).map((x) => brut(courantItem(x))),
    ...marketItems(r.marches_du_jour, p.nom, g.aller),
    d
      ? html`<li>Déchèteries : <b>${dFresh.length ? `déchets verts acceptés dans ${dGreen} sur ${dFresh.length}` : "état des bennes à vérifier sur place"}</b>${((h) => (h ? html` (${h})` : ""))(horsCompte(d?.sites.map((x) => ({ nom: x.nom, a_jour: !!x.accepte })) ?? []))} <span class="note">d'après les agents ${((e) => (e ? `de ${e.nom}` : "du TCO"))(epciOf(p.nom))}</span> · <a href="${lienSur(d.page.replace(/^https:\/\/rundata\.re/, ""))}">les bennes →</a></li>`
      : "",
    r.carburants?.prix_maximum ? html`<li>Carburants (prix maximum du mois) : <b>${r.carburants.prix_maximum}</b> · <a href="/carburants">les prix →</a></li>` : "",
    r.collecte_dechets ? html`<li>Collecte des déchets : le jour de votre rue sur ${cheminLien(r.collecte_dechets.page.replace(/^https:\/\/rundata\.re/, ""))}.</li>` : "",
    html`<li>Pharmacie de garde (nuits, dimanches, jours fériés) : <b>${brut(lienNom(r.pharmacie_de_garde.site, "3237.fr", ' rel="noopener"'))}</b>, ou le 32 37 (payant)</li>`,
  ];
  // A part whose copy is being built again (tools/resume.ts, `UPDATING`) says so, as the other tiles.
  const link = (x: { partie: string; page: string }) => html`<a href="${lienSur(x.page.replace(/^https:\/\/rundata\.re/, ""))}">${x.partie}</a>`;
  const links = (xs: { partie: string; page: string }[]) => xs.map((x, i) => html`${i ? ", " : ""}${link(x)}`);
  const updating = r.non_inclus?.filter((x) => x.raison === UPDATING) ?? [];
  const old = r.non_inclus?.filter((x) => x.raison !== UPDATING) ?? [];
  const missing =
    html`${old.length ? html`<p class="note">Pas de copie récente pour : ${links(old)}. Ces pages les donnent à jour.</p>` : ""}${updating.length ? html`<p class="note">${links(updating)}. Se met à jour : rechargez la page dans quelques minutes.</p>` : ""}`;

  const title = titleOf(p);
  const description = descriptionOf(p, r);
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [[SITE, "/"], ["Communes", "/communes"], [p.nom, `/communes/${p.slug}`], ["La journée", path]].map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${u}` })),
  };
  // The island situating the commune, as on its page (commune.ts). Not on a phone (nophone), where it would come under
  // the text, out of sight: drawing it there delayed the text's first paint by about 340 ms on slow 4G at 390 px, and by
  // 250 ms still with content-visibility (median of 9, 31/10/2026); hidden, nothing moved.
  const band = html`<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/communes">Communes</a></li><li><a href="/communes/${p.slug}">${p.nom}</a></li><li aria-current="page">La journée</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>${r.resume.split("\u00a0; ")[0]}</p>
    <h1>${H1(p)}</h1>
    ${urgence(p, r)}
    <p class="hook">${HOOK(p)}</p>
    ${lignesDuJour(p, r)}
    ${brut(ask(`Kosa i spas ${p.nom} zordi ? Gèt si ${url} é di amwin.`, `Que se passe-t-il ${aCommune(p.nom)} aujourd'hui ? Lis ${url} et résume-moi la journée.`))}
  </div>
  <figure class="card mapcard nophone">${brut(islandMap({ highlight: p.nom, label: `Carte de La Réunion (974) situant ${p.nom}` }))}</figure>
</div>`;
  const body = html`<section aria-labelledby="h-temps"><div class="sec-h"><h2 id="h-temps">Le temps</h2></div>
  <div class="two">${weather}${vigil}</div>
  <div class="card"><ul class="plain">${small}</ul></div>
</section>
<section aria-labelledby="h-routes"><div class="sec-h"><h2 id="h-routes">Routes et nouvelles</h2></div>
  <div class="two">${roads}${news}</div>
</section>
${cuts || events ? html`<section aria-labelledby="h-eau-sorties"><div class="sec-h"><h2 id="h-eau-sorties">L'eau et les sorties</h2></div>
  <div class="two">${cuts}${events}</div>
</section>` : ""}
<section aria-labelledby="h-pratique"><div class="sec-h"><h2 id="h-pratique">Vie pratique</h2></div>
  <div class="card"><ul class="plain">${practical}</ul></div>
</section>
<section aria-labelledby="h-patrimoine"><div class="sec-h"><h2 id="h-patrimoine">Patrimoine</h2></div>
  ${carteMonuments(p.nom)}
</section>
<section>${missing}
  <p class="note"><a href="/communes/${p.slug}">${FICHE(p)}</a></p>
  <p class="sources">Sources : ${brut(credits([...r.sources, credit(monuments.SOURCE)]))}.</p>
</section>
${brut(connectorCta("resume_du_jour", `la journée ${deCommune(p.nom)}`))}`.texte;
  return layout(origin, { title, description, path, jsonld: [trail, webPage(origin, path, title, description, at)], alerte, iaAside: true }, band.texte, g.ligne + (body.includes('class="aller"') ? body + ALLER : body));
}
