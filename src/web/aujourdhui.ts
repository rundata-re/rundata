/**
 * The day of one commune (/aujourdhui/<commune>): what the tool resume_du_jour answers, as a page, from the same
 * summary (tools/resume.ts) cut from the same copies. Nothing more is fetched; a part without a recent copy links to
 * the page that has it.
 */
import type { Cached } from "../cache.js";
import * as mf from "../providers/vigilance.js";
import { ACCUEILS } from "../providers/agenda.js";
import type * as annuaire from "../providers/annuaire.js";
import { mentionCourte } from "../tools/agenda.js";
import { type Resume, UPDATING } from "../tools/resume.js";
import { MARCHES } from "../vie/marches.js";
import * as monuments from "../vie/monuments.js";
import { STATIONS_974 } from "../providers/meteofrance-stations.js";
import { INSEE } from "../places/insee.js";
import { porte, SHEET as ALLER } from "./aller.js";
import { type Alerte, credit, sansPeriode } from "./data.js";
import { connectorCta, courantItem, silentItem, silentText, webPage } from "./domains.js";
import { esc, fenetre, islandMap } from "./map.js";
import { reprise } from "./ouvrir-donnees.js";
import { a, communeDite, de, fourchette } from "../tools/format.js";
import { compteAvis } from "../tools/coupures.js";
import { ask, credits, icon, layout, officielHtml, SITE, thin, leJour } from "./pages.js";
import type { PlacePage } from "./places.js";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 152;

/** « à Saint-Paul », « au Port », « aux Avirons », « à l'Entre-Deux ». */
export const aCommune = a;
export const deCommune = de;

// The texts of the page, worded by marketing.
// Each of the commune's two pages says its role (UX review of 04/11/2026, words validated by data-run on 06/11): this
// one the day, /communes/<commune> the lasting record.
export const titleOf = (p: PlacePage) =>
  [`La journée ${aCommune(p.nom)} : eau, météo, sorties · 974`, `La journée ${aCommune(p.nom)} · 974`].find((t) => t.length <= TITLE_MAX)!;
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
 * The banner's colour for a level, the highest named (kit.md): red for red and violet, the kit's orange for orange (never
 * red, which would read as the red alert), the site's alert colour otherwise.
 */
export const levelClass = (s: string) => (/\b(rouge|violette?)\b/.test(s) ? ' class="rouge"' : /\borange\b/.test(s) ? ' class="orange"' : "");

/**
 * The top of /aujourdhui, what asks to act first (marketing, UX review of 04/11/2026): the water not to drink, the
 * vigilance above green with the zone of Météo-France, never the commune, the cyclone alert in its official words.
 * Nothing when there is nothing; orange and red in their own colours (levelClass).
 */
export function urgent(p: PlacePage, r: Resume): string {
  const items: string[] = [];
  const dry = r.coupures_eau?.avis.filter((n) => n.ne_pas_boire).length ?? 0;
  if (dry) {
    const s = dry > 1;
    items.push(`<li>Eau à ne pas boire\u00a0: ${dry} avis en cours ${esc(aCommune(p.nom))}, dans les secteurs nommés par ${s ? "les avis" : "l'avis"}. <a href="/coupures-eau/${p.slug}">Voir ${s ? "les avis" : "l'avis"}</a></li>`);
  }
  const v = r.vigilance;
  const level = v?.au_dessus_du_vert ? vigilanceLevel(v.maintenant) : "";
  if (level) items.push(`<li${levelClass(level)}>Vigilance ${esc(level)} (Météo-France). <a href="/vigilance">Voir les consignes</a></li>`);
  if (v?.alerte_cyclonique) items.push(`<li${levelClass(v.alerte_cyclonique)}>${esc(v.alerte_cyclonique.replace(/\.$/, ""))} (Météo-France). <a href="/vigilance">Voir les consignes</a></li>`);
  if (v?.ecoles) items.push(`<li><a href="/ecoles-cyclone">${esc(v.ecoles)}</a></li>`);
  return items.length ? `<ul class="urgence" aria-label="À savoir d'abord">${items.join("")}</ul>` : "";
}

/** The commune of a Météo-France station, from its number (its first five digits are the commune's INSEE code). */
export function stationCommune(nom: string): string | undefined {
  const id = STATIONS_974.find((s) => s[1] === nom)?.[0];
  return id ? Object.entries(INSEE).find(([, code]) => code === id.slice(0, 5))?.[0] : undefined;
}

/** Then a short line by subject, its label in bold, absent when its data is missing (marketing, 04/11/2026). */
export function dayLines(p: PlacePage, r: Resume): string {
  const line = (label: string, text: string) => `<li><b>${label}\u00a0:</b> ${text}</li>`;
  const m = r.meteo;
  const s = m?.mesure;
  const f = m?.prevision?.aujourd_hui;
  const where = s ? [stationCommune(s.station), s.distance_km != null ? `à ${String(s.distance_km).replace(".", ",")}\u00a0km` : ""].filter(Boolean).join(", ") : "";
  const measured = s?.mesures.temperature
    ? `${esc(thin(s.mesures.temperature))} mesurés ${esc(leJour(s.heure_mesure))} à la station ${esc(s.station)}${where ? ` (${esc(where)})` : ""}.`
    : "";
  const forecast = f?.temperature_min && f.temperature_max ? `Prévision ${esc(f.periode ?? "du jour")}\u00a0: ${esc(thin(fourchette(f.temperature_min, f.temperature_max)))}${f.ciel_en_journee ? `, ${esc(f.ciel_en_journee)}` : ""}.` : "";
  const v = r.vigilance;
  const level = v && !v.au_dessus_du_vert && !v.alerte_cyclonique ? vigilanceLevel(v.maintenant) : "";
  const ev = r.evenements_du_jour;
  const n = ev ? ev.liste.length + (ev.autres ?? 0) : 0;
  const lines = [
    measured || forecast ? line("Météo", [measured, forecast].filter(Boolean).join(" ")) : "",
    level ? line("Vigilance", `${esc(level)} (Météo-France).`) : "",
    ev ? line("Sorties", n ? `${plural(n, "événement")} aujourd'hui.` : "aucun événement trouvé aujourd'hui dans les agendas lus.") : "",
    r.carburants?.prix_maximum ? line("Carburants", `prix maximum du mois\u00a0: ${esc(r.carburants.prix_maximum)}.`) : "",
    line("Pharmacie de garde", `<a href="${esc(r.pharmacie_de_garde.site)}" rel="noopener">3237.fr</a>`),
  ].filter(Boolean);
  return `<ul class="jour">${lines.join("")}</ul>`;
}

/**
 * The commune's markets on /aujourdhui: those held today, those open all week apart (never « the market of the day »),
 * then those whose days no source gives, by name, with the town hall's page; never « no market ».
 * A town hall's market says its page and, when old, its date.
 */
function marketItems(mk: Markets | undefined, commune: string, aller: Aller): string[] {
  if (!mk) return [];
  // Its position from the bundled list, by its OpenStreetMap object: the summary does not give it. None for a market
  // only a town hall gives: no button then.
  const go = (x: { nom: string; adresse?: string; carte?: string }) => {
    const m = x.carte ? MARCHES().find((y) => y.osm === x.carte) : undefined;
    const button = m?.lat != null && m.lon != null ? aller({ nom: x.nom, lat: m.lat, lon: m.lon, adresse: x.adresse ? `${x.adresse}, ${commune}` : undefined }) : "";
    return button ? ` ${button}` : "";
  };
  const by = (x: { d_apres?: string }) => (x.d_apres ? `, d'après le ${x.d_apres}` : "");
  const name = (x: { nom: string; lien: string }) => `<a href="${esc(x.lien)}" rel="noopener"${fenetre(x.lien)}><b>${esc(x.nom)}</b></a>`;
  // « Jours et horaires des marchés : site de la mairie de Saint-Pierre → », its words outside the link but the site's.
  const [label, site] = mk.mairie ? mk.mairie.texte.split(" : ") : [];
  return [
    ...mk.liste.map((x) => `<li>Marché aujourd'hui : ${name(x)} <span class="note">${esc(x.horaires_aujourd_hui)}${x.adresse ? `, ${esc(x.adresse)}` : ""}${esc(by(x))}</span>${go(x)}</li>`),
    ...(mk.permanents ?? []).map((x) => `<li>Marché permanent : ${name(x)} <span class="note">${esc(x.horaires ?? "")}${x.horaires_aujourd_hui === "fermé aujourd'hui" ? ", fermé aujourd'hui" : ""}${x.adresse ? `, ${esc(x.adresse)}` : ""}${esc(by(x))}</span>${go(x)}</li>`),
    mk.jours_non_trouves ? `<li>${mk.liste.length || mk.permanents ? "Autres marchés" : "Marchés"} : ${mk.jours_non_trouves.map(name).join(", ")}, <span class="note">jours non trouvés</span></li>` : "",
    mk.mairie ? `<li>${esc(label)} : <a href="${esc(mk.mairie.site)}" rel="noopener"${fenetre(mk.mairie.site)}>${esc(site)} →</a></li>` : "",
  ];
}

export function descriptionOf(p: PlacePage, r: Resume): string {
  const m = r.meteo?.mesure;
  const t = m?.mesures.temperature;
  const events = r.evenements_du_jour ? r.evenements_du_jour.liste.length + (r.evenements_du_jour.autres ?? 0) : 0;
  // Only the notices that announce a cut: not one saying not to drink the water, nor a quality notice (compteAvis).
  const cuts = r.coupures_eau ? compteAvis(r.coupures_eau.avis).coupures : 0;
  const dry = r.coupures_eau?.avis.some((n) => n.ne_pas_boire);
  const figures = [
    dry ? "eau à ne pas boire" : "",
    t ? `${thin(t)} mesurés ${leJour(m!.heure_mesure)}` : "",
    events ? plural(events, "sortie") : "",
    cuts ? plural(cuts, "coupure d'eau", "coupures d'eau") : "",
  ].filter(Boolean);
  // Too long: the last figures left out first, the water not to drink kept as long as it fits.
  for (let n = figures.length; n > 0; n--) {
    const long = `Aujourd'hui ${aCommune(p.nom)} (974) : ${figures.slice(0, n).join(", ")}. Eau, vigilance, routes, sorties : la journée de la commune.`;
    if (long.length <= DESCRIPTION_MAX) return long;
  }
  return `La journée ${aCommune(p.nom)} (974) : eau, vigilance, météo, routes, sorties.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** « 29/10/2026 ». */
const jma = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * The commune's historic monuments (vie/monuments.ts), bundled: each name leads to its notice on POP, the ministry's
 * platform. Folded, but for a few: Saint-Denis has more than 60. A commune with none says so, after the base.
 */
export function monumentsCard(nom: string): string {
  const list = monuments.ofCommune(nom);
  const base = "la base Mérimée du ministère de la Culture";
  if (!list.length) return `<div class="card"><h3>Monuments historiques</h3><p>Aucun monument historique ${esc(aCommune(nom))} dans ${base}.</p></div>`;
  const item = (m: monuments.Monument) => {
    // A monument on two communes says the other one.
    const aussi = monuments.autres(m, nom);
    const note = [monuments.protege(m), m.adresse, aussi.length ? `aussi ${aussi.map(aCommune).join(", ")}` : ""].filter(Boolean).join(" · ");
    return `<li><a href="${esc(monuments.notice(m))}" rel="noopener"${fenetre(monuments.notice(m))}>${esc(m.nom)}</a> <span class="note">${esc(note)}</span></li>`;
  };
  return `<div class="card"><details${list.length <= 5 ? " open" : ""}><summary><h3>Monuments historiques</h3> <span class="note">${plural(list.length, "classé ou inscrit", "classés ou inscrits")}</span></summary>` +
    `<ul class="plain">${list.map(item).join("")}</ul><p class="note">D'après ${base}, liste du ${jma(monuments.FICHIER_DU)}\u00a0: chaque nom mène à sa notice.</p></details></div>`;
}

// `sr`: words after the title's link for screen readers only (« à Saint-Paul »), when the page links the same title elsewhere.
const card = (ic: string, title: string, body: string, href?: string, cls = "", sr = "") =>
  `<div class="card${cls}">${icon(ic)}<h3>${href ? `<a href="${href}">${esc(title)}${sr ? `<span class="sr"> ${esc(sr)}</span>` : ""}</a>` : esc(title)}</h3>${body}</div>`;
const li = (x: { titre: string; lien?: string; quand?: string; media?: string }) =>
  `<li>${x.lien ? `<a href="${esc(x.lien)}" rel="noopener"${fenetre(x.lien)}>${esc(x.titre)}</a>` : esc(x.titre)}${x.quand || x.media ? ` <span class="note">${esc([x.quand, x.media].filter(Boolean).join(" · "))}</span>` : ""}</li>`;

/**
 * `mairie`: the office as the commune's copy has it, for its position (« Y aller »), which the summary, also the tool's
 * answer, does not give.
 */
export function aujourdhuiPage(origin: string, p: PlacePage, r: Resume, at: Cached<unknown> | null, alerte?: Alerte, mairie?: annuaire.Office | null): string {
  const g = porte(alerte);
  const path = `/aujourdhui/${p.slug}`;
  const url = `${origin}${path}`;
  const m = r.meteo;
  const f = m?.prevision?.aujourd_hui;
  // The rain says itself (« 1,6 mm de pluie », « pas de pluie prévue »): no « pluie » before it. Today's hours (« de 15\u00a0h
  // à minuit ») are said once after the day, not again after the rain.
  const dayForecast = (j?: typeof f) => (j ? `${esc(j.jour)}${j.periode ? ` ${esc(j.periode)}` : ""} : ${j.temperature_min && j.temperature_max ? esc(thin(fourchette(j.temperature_min, j.temperature_max))) : ""}${j.ciel_en_journee ? `, ${esc(j.ciel_en_journee)}` : ""}${j.pluie ? `, ${esc(thin(sansPeriode(j.pluie, j.periode)))}` : ""}` : "");

  const weather = m
    ? card("thermo", `Météo ${p.nom}`,
        (m.mesure ? `<p><b>${esc(thin(m.mesure.mesures.temperature ?? ""))}</b> mesurés ${esc(leJour(m.mesure.heure_mesure))} par la station ${esc(m.mesure.station)}${communeDite(m.mesure, p.nom) ? ` ${esc(a(communeDite(m.mesure, p.nom)!))}` : ""} (${m.mesure.altitude_m.toLocaleString("fr-FR")} m${m.mesure.distance_km != null ? `, à ${String(m.mesure.distance_km).replace(".", ",")} km` : ""}).</p>` : "") +
        (f ? `<p>Prévision, pas une mesure : ${dayForecast(f)}${m.prevision?.demain ? ` ; ${dayForecast(m.prevision.demain)}` : ""}.</p>` : ""),
        `/meteo/${p.slug}`)
    : "";
  const v = r.vigilance;
  const vigil = v
    ? card("alert", "Vigilance", `<p>${esc(v.maintenant)}${v.vagues_submersion ? ` ${esc(v.vagues_submersion)}.` : ""}</p>${v.alerte_cyclonique ? `<p><b>${esc(v.alerte_cyclonique)}</b></p>` : ""}${v.ecoles ? `<p><a href="/ecoles-cyclone">${esc(v.ecoles)}</a></p>` : ""}<p>${officielHtml(v.alerte_cyclonique ? mf.OFFICIEL_CYCLONE : mf.OFFICIEL_VIGILANCE)}</p>`, "/vigilance", v.alerte_cyclonique || v.au_dessus_du_vert ? " warn" : "")
    : "";
  const small = [
    r.mer ? `<li>Mer : <b>${esc(thin(r.mer.temperature_eau))}</b> <span class="note">${esc(r.mer.mesure)}</span> · <a href="/mer">la mer →</a></li>` : "",
    r.air ? `<li>Air : <b>${esc(r.air.qualite)}</b> <span class="note">indice ATMO prévu ${r.air.indice_atmo}${r.air.polluants ? `, ${esc(r.air.polluants.join(", "))}` : ""}</span> · <a href="/air">l'air →</a></li>` : "",
    r.electricite ? `<li>Électricité : <b>${String(r.electricite.renouvelable_pct).replace(".", ",")} % renouvelable</b> <span class="note">à ${esc(r.electricite.heure)}</span> · <a href="/electricite">l'électricité →</a></li>` : "",
    r.calendrier?.jour_ferie ? `<li>Jour férié : <b>${esc(r.calendrier.jour_ferie)}</b></li>` : "",
    r.calendrier?.vacances_scolaires ? `<li>${esc(r.calendrier.vacances_scolaires)} en cours · <a href="/calendrier">le calendrier →</a></li>` : "",
    `<li>Soleil : lever ${esc(r.soleil.lever)}, coucher ${esc(r.soleil.coucher)}</li>`,
    r.mairie ? `<li>Mairie : <b>${r.mairie.jour_ferie ? "sans doute fermée, jour férié" : r.mairie.ouverte === null ? "horaires absents de l'annuaire" : r.mairie.ouverte ? "ouverte" : "fermée"}</b>${r.mairie.horaires_aujourd_hui ? ` <span class="note">${esc(r.mairie.horaires_aujourd_hui)}</span>` : ""}${r.mairie.telephone ? ` · ${esc(r.mairie.telephone.replace(/ /g, "\u00a0"))}` : ""}${mairie ? ` ${g.aller({ nom: mairie.nom, lat: mairie.lat ?? NaN, lon: mairie.lon ?? NaN, adresse: mairie.adresse }, "mairie")}` : ""}</li>` : "",
  ].filter(Boolean).join("");

  const c = r.circulation;
  const roads = card("car", "Routes et circulation",
    (c.infos_routes?.length ? `<ul class="plain">${c.infos_routes.map(li).join("")}</ul>` : c.infos_routes ? `<p>Aucune information des médias sur les routes ou des blocages ${esc(aCommune(p.nom))} ces dernières heures.</p>` : "") +
    (c.routes_ile?.length ? `<p class="note">Ailleurs sur l'île :</p><ul class="plain">${c.routes_ile.map((x) => li({ titre: x.titre, lien: x.lien, media: x.source, quand: x.heure })).join("")}</ul>` : "") +
    (c.bus?.length ? `<p class="note">Info trafic des bus : ${c.bus.map((x) => esc(`${x.reseau} : ${x.titre}`)).join(" ; ")}</p>` : "") +
    `<p class="note">rundata.re ne mesure pas les bouchons : <a href="${esc(c.carte_officielle)}" rel="noopener">la carte officielle sur infotrafic.re ↗</a>, et <a href="/trafic">la page circulation</a>.</p>`,
    "/trafic");

  const news = r.actualites
    ? card("news", `Actualités ${deCommune(p.nom)}`, r.actualites.length ? `<ul class="plain">${r.actualites.map(li).join("")}</ul>` : `<p>Rien de nouveau qui nomme ${esc(p.nom)} ces dernières heures dans les médias lus.</p>`, "/actualites")
    : "";
  const cuts = r.coupures_eau
    ? card("drop", "Coupures d'eau",
        (r.coupures_eau.injoignable ? `<p class="note">${silentText(r.coupures_eau.injoignable)}</p>` : "") +
        (r.coupures_eau.avis.length
          ? `<ul class="plain">${r.coupures_eau.avis.map((n) => `<li>${n.ne_pas_boire ? "<b>Eau à ne pas boire</b> · " : ""}${li({ titre: n.titre, lien: n.lien }).slice(4, -5)}${n.coupure ? ` <span class="note">${esc(n.coupure.a ? `${n.coupure.de} → ${n.coupure.a}` : `à partir du ${n.coupure.de}`)}${n.coupure.etat ? `, ${esc(n.coupure.etat)}` : ""}</span>` : ""}</li>`).join("")}</ul>`
          : r.coupures_eau.injoignable ? ""
          : `<p>${esc(r.coupures_eau.note ?? `Aucune coupure annoncée${r.coupures_eau.distributeur ? ` par ${r.coupures_eau.distributeur}` : ""}${r.coupures_eau.lus_le ? ` ${leJour(r.coupures_eau.lus_le)}` : ""}.`)}</p>`),
        `/coupures-eau/${p.slug}`, r.coupures_eau.avis.some((n) => n.ne_pas_boire) ? " warn" : "", aCommune(p.nom))
    : "";
  const ev = r.evenements_du_jour;
  const notRead = mentionCourte(p.nom);
  const events = ev
    ? card("music", "Sortir aujourd'hui",
        (ev.liste.length
          ? `<ul class="plain">${ev.liste.map((e) => `<li>${e.statut ? `<b>${esc(e.statut)}</b> · ` : ""}${e.lien && ACCUEILS.has(e.lien) ? `<a href="${esc(e.lien)}" rel="noopener" target="_blank">${esc(e.titre)}</a>` : li({ titre: e.titre, lien: e.lien }).slice(4, -5)} <span class="note">${esc([e.quand, e.lieu, e.prix, e.source && `Source\u00a0: ${e.source}`].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul>${ev.autres ? `<p class="note">Et ${plural(ev.autres, "autre")}.</p>` : ""}`
          : `<p>Rien d'annoncé aujourd'hui ${esc(aCommune(p.nom))} dans les agendas lus.</p>`) +
        // Its site not read until it agrees: said under them, in marketing's words.
        (notRead ? `<p class="note np">${esc(notRead.ligne)}${reprise(notRead.ligne)}</p>` : ""),
        "/evenements")
    : "";
  const d = r.decheteries;
  const dFresh = d?.sites.filter((x) => x.accepte) ?? [];
  const dGreen = dFresh.filter((x) => x.accepte!.includes("déchets verts")).length;
  // Its notices of power cuts not read until it agrees: said under the list, as the agenda's under the outings.
  const powerNotRead = r.coupures_electricite?.non_repris;
  const practical = [
    ...(r.coupures_electricite?.injoignable ? [silentItem(r.coupures_electricite.injoignable)] : []),
    ...(r.coupures_electricite?.avis ?? []).map(courantItem),
    ...marketItems(r.marches_du_jour, p.nom, g.aller),
    d
      ? `<li>Déchèteries : <b>${dFresh.length ? `déchets verts acceptés dans ${dGreen} sur ${dFresh.length}` : "état des bennes à vérifier sur place"}</b> <span class="note">d'après les agents du TCO</span> · <a href="${esc(d.page.replace(/^https:\/\/rundata\.re/, ""))}">les bennes →</a></li>`
      : "",
    r.carburants?.prix_maximum ? `<li>Carburants (prix maximum du mois) : <b>${esc(r.carburants.prix_maximum)}</b> · <a href="/carburants">les prix →</a></li>` : "",
    r.collecte_dechets ? `<li>Collecte des déchets : le jour de votre rue sur <a href="${esc(r.collecte_dechets.page.replace(/^https:\/\/rundata\.re/, ""))}">rundata.re${esc(r.collecte_dechets.page.replace(/^https:\/\/rundata\.re/, ""))}</a>.</li>` : "",
    `<li>Pharmacie de garde (nuits, dimanches, jours fériés) : <a href="${esc(r.pharmacie_de_garde.site)}" rel="noopener"><b>3237.fr</b></a>, ou le 32 37 (payant)</li>`,
  ].filter(Boolean).join("");
  // A part whose copy is being built again (tools/resume.ts, `UPDATING`) says so, as the other tiles.
  const link = (x: { partie: string; page: string }) => `<a href="${esc(x.page.replace(/^https:\/\/rundata\.re/, ""))}">${esc(x.partie)}</a>`;
  const updating = r.non_inclus?.filter((x) => x.raison === UPDATING) ?? [];
  const old = r.non_inclus?.filter((x) => x.raison !== UPDATING) ?? [];
  const missing =
    (old.length ? `<p class="note">Pas de copie récente pour : ${old.map(link).join(", ")}. Ces pages les donnent à jour.</p>` : "") +
    (updating.length ? `<p class="note">${updating.map(link).join(", ")}. Se met à jour : rechargez la page dans quelques minutes.</p>` : "");

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
  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/communes">Communes</a></li><li><a href="/communes/${p.slug}">${esc(p.nom)}</a></li><li aria-current="page">La journée</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>${esc(r.resume.split("\u00a0; ")[0])}</p>
    <h1>${esc(H1(p))}</h1>
    ${urgent(p, r)}
    <p class="hook">${esc(HOOK(p))}</p>
    ${dayLines(p, r)}
    ${ask(`Kosa i spas ${p.nom} jordi ? Gèt si ${url} é di amwin.`, `Que se passe-t-il ${aCommune(p.nom)} aujourd'hui ? Lis ${url} et résume-moi la journée.`)}
  </div>
  <figure class="card mapcard nophone">${islandMap({ highlight: p.nom, label: `Carte de La Réunion (974) situant ${p.nom}` })}</figure>
</div>`;
  const body = `<section aria-labelledby="h-temps"><div class="sec-h"><h2 id="h-temps">Le temps</h2></div>
  <div class="two">${weather}${vigil}</div>
  <div class="card"><ul class="plain">${small}</ul></div>
</section>
<section aria-labelledby="h-routes"><div class="sec-h"><h2 id="h-routes">Routes et nouvelles</h2></div>
  <div class="two">${roads}${news}</div>
</section>
${cuts || events ? `<section aria-labelledby="h-eau-sorties"><div class="sec-h"><h2 id="h-eau-sorties">L'eau et les sorties</h2></div>
  <div class="two">${cuts}${events}</div>
</section>` : ""}
<section aria-labelledby="h-pratique"><div class="sec-h"><h2 id="h-pratique">Vie pratique</h2></div>
  <div class="card"><ul class="plain">${practical}</ul>${powerNotRead ? `<p class="note np">${esc(powerNotRead)}${reprise(powerNotRead)}</p>` : ""}</div>
</section>
<section aria-labelledby="h-patrimoine"><div class="sec-h"><h2 id="h-patrimoine">Patrimoine</h2></div>
  ${monumentsCard(p.nom)}
</section>
<section>${missing}
  <p class="note"><a href="/communes/${p.slug}">${esc(FICHE(p))}</a></p>
  <p class="sources">Sources : ${credits([...r.sources, credit(monuments.SOURCE)])}.</p>
</section>
${connectorCta("resume_du_jour", `la journée ${deCommune(p.nom)}`)}`;
  return layout(origin, { title, description, path, jsonld: [trail, webPage(origin, path, title, description, at)], alerte }, band, g.ligne + (body.includes('class="aller"') ? body + ALLER : body));
}
