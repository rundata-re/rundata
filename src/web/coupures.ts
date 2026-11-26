/**
 * The water of one commune (/coupures-eau/<commune>): its distributor's notices of cuts, or that there are none at the
 * time of the copy, who distributes its water, its drought level and its tap water. And the same in a few words for the
 * commune's own page. Cut from the copies of /coupures-eau, /secheresse and /eau: nothing more is fetched.
 */
import type { Cached } from "../cache.js";
import { CIREST, distributeur, GUIDES_AVIS, LIENS, MAIRIES_AUSSI, nomDit, MAIRIE_SAINT_LEU, MAIRIE_SAINTE_MARIE, phrasePartage, SITES_DISTRIBUTEURS, SOURCE as DISTRIBUTEURS } from "../eau/distributeurs.js";
import { ACCUEILS } from "../providers/agenda.js";
import { CREOLE } from "../providers/avis-eau.js";
import { compteAvis, muetPour, NE_PAS_BOIRE } from "../tools/coupures.js";
import { copieAncienne, VOIR_EAU } from "../tools/copie-ancienne.js";
import { de, deNom } from "../articles.js";
import { faqPage, type Faq } from "./texte-stable.js";
import { a } from "../tools/format.js";
import { type Alerte, type CoupuresAnswer, type DernierAvis, type EauAnswer, lusLe, type SecheresseAnswer } from "./data.js";
import { cycloneWater } from "./eau-cyclone.js";
import { copieBandeau, afterCutNote, afterCutShort, connectorAsk, describe, droughtBadge, loading, nobreak, noticeCard, noticesHead, silentText, sourcesNote, tapCard, webPage } from "./domains.js";
import { islandMap } from "./map.js";
import { ask, cityLd, icon, layout, type Live, SITE, leAt } from "./pages.js";
import { PAGES, type PlacePage } from "./places.js";
import * as ARRETES from "../providers/arretes-travaux.js";
import type { BlocArretes } from "../providers/arretes-travaux.js";
import { brut, echappe, href as lienSur, html, type Html } from "./html.js";

const TITLE_MAX = 60;
const COMMUNES = PAGES.filter((p) => p.commune);

/** The copies a commune's water is cut from, each null when there is none yet. */
export interface WaterCopies {
  coupures: Cached<CoupuresAnswer> | null;
  secheresse?: Cached<SecheresseAnswer> | null;
  eau?: Cached<EauAnswer> | null;
}

/** What the copies say of one commune. */
export function waterOf(commune: string, w: WaterCopies) {
  const avis = w.coupures?.value.avis.filter((n) => n.communes.includes(commune)) ?? [];
  return {
    avis: [...avis].sort((x, y) => Number(!!y.ne_pas_boire) - Number(!!x.ne_pas_boire)),
    dry: !!w.coupures?.value.ne_pas_boire?.includes(commune) || avis.some((n) => n.ne_pas_boire),
    distributeur: distributeur(commune),
    // Its distributor's feed did not answer at the last read: never « pas de coupure annoncée » (tools/injoignable.ts).
    muet: distributeur(commune)?.avis ? muetPour(w.coupures?.value.injoignable, commune, avis.length) : undefined,
    secheresse: w.secheresse?.value.communes.find((c) => c.commune === commune),
    robinet: w.eau?.value.communes.find((c) => c.commune === commune),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
/** « des Eaux de La Possession », « de la CIREST », « d'un distributeur » : who published the notices, after « avis ». */
const ofBy = (by: string) =>
  by.startsWith("Eaux de La Possession") ? `des ${by}` : by.startsWith("CIREST") ? `de la ${by}` : by === "le distributeur" ? "du distributeur" : deNom(by);

/** « 05/11/2026 à 15:09 », Réunion time; the day only for a source that gives no time (La Créole). */
function publieLe(n: DernierAvis): string {
  const local = new Date(Date.parse(n.publie) + 4 * 3600_000).toISOString();
  const day = local.slice(0, 10).split("-").reverse().join("/");
  return n.jour ? day : `${day} à ${local.slice(11, 16)}`;
}

/**
 * The commune's latest notices, past ones too, as their feeds still list them, without those shown above: each its
 * day, its publisher and its link. Never « terminé »: only what the notice says, behind its link.
 */
export function derniersAvis(commune: string, w: WaterCopies, shown: { titre: string; publie_le?: string }[]): string {
  const list = (w.coupures?.value.derniers_avis?.[commune] ?? []).filter((n) => !shown.some((x) => x.titre === n.titre));
  if (!list.length) return "";
  const oldest = Date.parse(w.coupures?.value.plus_ancien_avis?.[commune] ?? "");
  const day = Number.isFinite(oldest) ? new Date(oldest + 4 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/") : "";
  const scope = html`<p class="note">Ce sont les avis que les flux des distributeurs listent encore, pas un historique complet${day ? ` : le plus ancien date du ${day}` : ""}.</p>`;
  return html`<h3>Derniers avis publiés ${a(commune)}</h3>
  <ul class="plain">${list.map((n) => html`<li>${n.lien ? html`<a href="${lienSur(n.lien)}" rel="noopener">${n.titre}</a>` : n.titre} <span class="note">publié le ${publieLe(n)} par ${n.distributeur}</span></li>`)}</ul>
  ${scope}`.texte;
}

/**
 * The networks of the commune's tap water, the districts the ARS gives for each, and its last sample: its day and the
 * ARS's conclusion, quoted, never « potable » nor « conforme » said by us; a day long past said as it is.
 */
export function reseauxCommune(commune: string, c: EauAnswer["communes"][number]): string {
  const rows = c.reseaux_detail;
  if (!rows?.length) return "";
  const dist = distributeur(commune);
  const by = dist && !dist.partage ? html`, géré${rows.length > 1 ? "s" : ""} par ${dist.nom}` : "";
  // « Au Tampon », « Aux Avirons », « À Saint-Paul »: no verb to agree with the commune's name.
  const at = a(commune);
  return html`<p>${at.charAt(0).toUpperCase() + at.slice(1)}, l'eau du robinet passe par ${rows.length} réseau${rows.length > 1 ? "x" : ""} de distribution${by}, d'après l'ARS :</p>
  <ul class="rows eau">${rows.map((r) => html`<li><span>Réseau ${r.reseau}${r.quartiers.length ? html` <small>${r.quartiers.join(" ; ")}</small>` : ""}</span>${html` <span class="note">${r.derniere_analyse ? html`Dernier prélèvement le ${r.derniere_analyse.split("-").reverse().join("/")}${r.conclusion ? html`. Conclusion de l'ARS : « ${r.conclusion.trim()} »` : ""}` : html`Pas d'analyse publiée depuis 6 mois`}</span></li>`}`)}</ul>`.texte;
}

/**
 * « Sécheresse : alerte depuis l'arrêté n°… du 12/11/2026. Ce qui est interdit : page Sécheresse. » The level of the
 * commune's tap water from the prefecture's order, never VigiEau alone: "" without the order or without a level.
 */
export function secheresseLigne(c: SecheresseAnswer["communes"][number] | undefined, arrete: SecheresseAnswer["arrete"]): string {
  if (!c?.eau_du_robinet || !arrete?.signe_le) return "";
  const n = arrete.numero.startsWith("n°") ? arrete.numero : `n°${arrete.numero}`;
  return html`<p>Sécheresse\u00a0: ${c.eau_du_robinet} depuis l'arrêté ${n} du ${arrete.signe_le}. Ce qui est interdit\u00a0: <a href="/secheresse">page Sécheresse</a>.</p>`.texte;
}

/**
 * The two questions of the commune's water, each only with its data: who distributes it, from the ARS, and
 * its last sample with the ARS's conclusion, quoted. No number nor address of a distributor: the site has none.
 */
export function eauFaq(commune: string, c: EauAnswer["communes"][number] | undefined): Faq[] {
  const faq: Faq[] = [];
  const dist = distributeur(commune);
  const qui = dist?.partage ? dist.partage.par.map((d) => d.nom).join(" et ") : dist?.nom;
  if (qui) faq.push({ q: `Qui distribue l'eau ${a(commune)}\u00a0?`, a: html`${qui.charAt(0).toUpperCase() + qui.slice(1)}, d'après l'ARS.`.texte });
  const last = [...(c?.reseaux_detail ?? [])].filter((r) => r.derniere_analyse).sort((x, y) => y.derniere_analyse!.localeCompare(x.derniere_analyse!))[0];
  if (last) {
    const conclusion = last.conclusion?.trim();
    faq.push({
      q: `Quand l'eau ${de(commune)} a-t-elle été analysée pour la dernière fois\u00a0?`,
      a: html`Le ${last.derniere_analyse!.split("-").reverse().join("/")}, sur le réseau ${last.reseau}.${conclusion ? html` Conclusion de l'ARS\u00a0: «\u00a0${conclusion}\u00a0».` : ""} Les résultats complets sont sur le site du ministère de la Santé.`.texte,
    });
  }
  return faq;
}

/** The commune's page's tile: a cut or not, its drought level, its tap water. */
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function waterLive(p: PlacePage, w: WaterCopies): Live | undefined {
  if (!w.coupures) return undefined;
  const x = waterOf(p.nom, w);
  const cuts = compteAvis(x.avis).coupures;
  const valeur = x.dry ? upper(NE_PAS_BOIRE()) : cuts ? plural(cuts, "avis de coupure", "avis de coupure") : x.avis.length ? plural(x.avis.length, "avis sur l'eau", "avis sur l'eau") : x.muet ? "Site sans réponse" : x.distributeur?.avis ? "Pas de coupure annoncée" : "Site pas lu";
  const detail = [
    // When its notices were read, unless its site did not answer: that says its own hour.
    x.muet ? html`${x.muet.court}` : x.distributeur?.avis || x.avis.length ? html`avis lus ${leAt(lusLe(w.coupures))}` : "",
    x.distributeur ? (x.distributeur.partage ? html`distributeurs ${x.distributeur.partage.par.map((d) => d.nom).join(" et ")}` : html`distributeur ${x.distributeur.nom}`) : "",
    x.secheresse ? html`sécheresse : ${x.secheresse.eau_du_robinet ?? "aucune restriction"}` : "",
    x.robinet ? (x.robinet.non_conformes_6_mois ? html`robinet : ${plural(x.robinet.non_conformes_6_mois, "analyse non conforme", "analyses non conformes")} en 6 mois` : x.robinet.analyses_6_mois ? "robinet : analyses conformes" : "") : "",
  ].filter(Boolean).join(" · ");
  return { valeur, detail: detail || "coupures, sécheresse et eau du robinet" };
}

/** Whether the notices of a commune's distributor are read. */
export const avisLus = (commune: string) => !!distributeur(commune)?.avis;

/**
 * Whether a commune's page of water cuts goes to the search engines and the sitemap (web/site.ts): its notices read, or
 * a text of its own on where they are published (GUIDES_AVIS). Without either, it has nothing of its own to show (only
 * where to look), and stays out of them until a source is read.
 */
export const indexable = (commune: string) => avisLus(commune) || !!GUIDES_AVIS[commune];

/**
 * Sainte-Suzanne's orders allowing runéo's works (providers/arretes-travaux.ts), under the notices: never counted as one,
 * worded for the site (20/11/2026). Nothing for another commune, nor before the site was ever read.
 */
export function arretesSection(commune: string, b: BlocArretes | undefined): string {
  if (commune !== ARRETES.COMMUNE || !b) return "";
  const items = b.arretes?.length
    ? html`<ul class="zones">${b.arretes.map((x) => html`<li class="card"><p>Arrêté ${x.arrete} : ${x.lieu}, du ${x.du} au ${x.au}. <a href="${lienSur(x.lien)}" rel="noopener">L'arrêté →</a></p></li>`)}</ul>`
    : html`<p class="card">${b.aucun ?? ""}</p>`;
  return html`<section aria-labelledby="h-arretes">
  <div class="sec-h"><h2 id="h-arretes">${ARRETES.TITRE}</h2></div>
  <p>${ARRETES.PHRASE}</p>
  ${items}
  ${b.arretes?.length ? html`<p class="note">D'après <a href="${lienSur(b.lien)}" rel="noopener">le site de la ville de Sainte-Suzanne</a>, lu le ${b.lu_le}.</p>` : ""}
</section>`.texte;
}

export function coupuresCommunePage(origin: string, p: PlacePage, w: WaterCopies, now = new Date(), alerte?: Alerte): string {
  const d = w.coupures?.value;
  const path = `/coupures-eau/${p.slug}`;
  const url = `${origin}${path}`;
  const x = waterOf(p.nom, w);
  const dist = x.distributeur;
  const at = w.coupures ? leAt(lusLe(w.coupures)) : "";
  const by = [...new Set(x.avis.map((n) => n.distributeur))].join(", ") || dist?.nom || "le distributeur";
  const where = a(p.nom);
  // Who publishes the notices read (the CIREST, a mairie), else the distributor; a mairie only linked to (LIENS).
  const publisher = dist?.par ?? dist?.nom;
  const lien = LIENS[p.nom];
  // A mairie that also posts the notices of a distributor read elsewhere (Les Trois-Bassins, La Créole's).
  const aussi = MAIRIES_AUSSI[p.nom];
  // A home page only (ACCUEILS, none since 20/11/2026): opened in a new window.
  const lienA = lien ? html` <a href="${lien.site}" rel="noopener"${ACCUEILS.has(lien.site) ? brut(' target="_blank"') : ""}>${brut(nobreak(lien.libelle))} →</a>` : "";

  // Its feed silent: what was read before, said with its hour, the site linked; or that its read failed.
  const silent = x.muet ? html`<p class="note">${brut(silentText(x.muet))}</p>` : "";
  // The site of a distributor whose notices are not read, linked only (CISE Réunion at Les Avirons).
  const siteDist = dist && !dist.avis ? SITES_DISTRIBUTEURS[dist.nom] : undefined;
  // Where its notices are published, in words of its own (GUIDES_AVIS): the lead, the distributor's card and the list.
  const guide = dist && !dist.avis ? GUIDES_AVIS[p.nom] : undefined;
  // Its mairie's site read, which has posted nothing of late, and where its distributor publishes its own (Les Avirons):
  // said after « Pas d'avis », in place of « ailleurs ».
  const guideLu = dist?.avis ? GUIDES_AVIS[p.nom] : undefined;
  // « Pas d'avis » with when its site was read, and that a cut may be told elsewhere (wording validated on 22/11/2026), as the tool
  // coupures_eau says it: never « aucun avis », which reads as « no cut ». The mairie is not that elsewhere when the
  // notices read are its own (Cilaos, Sainte-Marie…).
  const ailleurs = /^(?:la )?(?:ville|commune|mairie)\b/i.test(publisher ?? "") ? "Une coupure peut être annoncée ailleurs." : "Une coupure peut être annoncée ailleurs, par la mairie par exemple.";
  // The same sentence opens the page and its description (meta, og, twitter, JSON-LD), so that neither says it otherwise.
  // Given `echappe` for the page, which escapes only the names and the hour.
  // A publisher that names the commune already (« la ville du Tampon », « la ville de Trois-Bassins ») is not followed by
  // « au Tampon » (24/11/2026): the commune is looked for without its article.
  const named = (who: string) => who.includes(p.nom.replace(/^(?:Les?|La) |^L'/, ""));
  const noNotice = (e = (t: string) => t) => `Pas d'avis de coupure récent ou à venir publié par ${e(publisher!)}${named(publisher!) ? "" : ` ${e(where)}`}, lu ${e(at)}.`;
  // Not read again for a while (tools/copie-ancienne.ts): said first, the publisher's site and the mairie's linked when
  // known (wording validated on 23/11/2026); the mairie alone when the notices read are its own.
  const ancienne = w.coupures && (dist?.avis || x.avis.length) ? copieAncienne("eau", new Date(lusLe(w.coupures)), now, "page") : undefined;
  const siteDe = (nom: string, href?: string): Html => (href ? html`<a href="${href}" rel="noopener">${nom}</a>` : html`${nom}`);
  const pubSite = dist?.avis ? dist.site : siteDist ?? undefined;
  // « de <a>La Créole</a> », the article out of the link (validated wording: « Voir le site de runéo ou de la mairie »).
  const deLien = (nom: string, href?: string) => {
    const [, pre, reste] = /^(d'|du |des |de (?:la |l')?)(.*)$/.exec(deNom(nom)) ?? ["", "", deNom(nom)];
    return html`${pre}${siteDe(reste, href)}`;
  };
  const sienne = /^(?:la )?(?:ville|commune|mairie)\b/i.test(publisher ?? "");
  const mairieDe = `la mairie ${de(p.nom)}`;
  const voir = !publisher
    ? html`${VOIR_EAU}`
    : sienne
      ? html`Voir le site de ${siteDe(mairieDe, lien?.site)}.`
      : html`Voir le site ${deLien(publisher, pubSite)} ou de ${siteDe(mairieDe, lien?.site)}.`;
  const bandeau = brut(copieBandeau(ancienne, voir.texte));
  // The guides' words (GUIDES_AVIS), the notices' head and the loading line: HTML the site writes itself.
  const status = !d
    ? brut(loading("Les avis des distributeurs"))
    : html`${bandeau}${x.muet && !x.avis.length
      ? html`<p class="lead">${x.muet.texte}</p>`
      : x.avis.length
      ? brut(noticesHead(x.avis, where, [], x.muet ? "" : at))
      : dist?.avis
        // Validated wording: who publishes the notices read, without the commune when that name already says it.
        ? html`<p class="lead">${brut(noNotice(echappe))} ${brut(guideLu?.bandeau ?? ailleurs)}</p>`
        : guide
        ? html`<p class="lead">${brut(guide.bandeau)}</p>`
        : siteDist
        ? html`<p class="lead">Les avis de coupure de ${nomDit(dist!)} ne sont pas lus par rundata.re\u00a0: voir <a href="${siteDist}" rel="noopener">son site</a>, rubrique «\u00a0L'eau dans ma commune\u00a0», ou la mairie.${lienA}</p>`
        : html`<p class="lead">Les avis de coupure ${dist ? html`de ${nomDit(dist)}` : "du distributeur"} ne sont pas lus par rundata.re : voir ses avis aux abonnés ou la mairie.${lienA}</p>`}`;

  const list = !d
    ? html`<p class="card">Les avis se chargent : rechargez la page dans quelques secondes.</p>`
    : x.avis.length
      ? html`${silent}<ul class="zones">${brut(x.avis.map(noticeCard).join(""))}</ul>`
      : x.muet ? ""
      : html`<p class="card">${dist?.avis ? html`Pas d'avis de coupure récent ou à venir, ni d'avis «\u00a0ne pas boire l'eau\u00a0», lu ${at}.` : guide?.texte != null ? brut(guide.texte) : html`rundata.re ne lit pas les avis de coupure ${de(p.nom)}\u00a0: ils sont sur le site de la mairie ou du distributeur.${lienA}`}</p>`;

  const unreadShare = dist?.partage?.par.filter((x) => !x.site).map((x) => x.nom) ?? [];
  const distBlock = html`<div class="card">${brut(icon("drop"))}<h3>Le distributeur</h3>${dist
      ? html`${dist.partage ? html`<p>${phrasePartage(p.nom, dist.partage)}</p>` : html`<p><b>${dist.nom}</b> distribue l'eau ${where}, d'après le contrôle sanitaire de l'ARS.</p>`}${dist.avis
          ? dist.site === CIREST.site
            ? html`<p>Les avis de la commune, publiés par la CIREST, sont relus au moins toutes les 30 minutes : <a href="${dist.site}" rel="noopener">les avis de la CIREST</a>.</p>`
            : dist.site === MAIRIE_SAINTE_MARIE
            ? html`<p>rundata.re lit, au moins toutes les 30 minutes, les communiqués de CISE Réunion publiés sur <a href="${dist.site}" rel="noopener">le site de la ville de Sainte-Marie</a> : ils s'affichent en haut de cette page. Un communiqué publié en image ou en PDF n'est pas lu : la page donne seulement son lien.</p>`
            : dist.site === MAIRIE_SAINT_LEU
            ? html`<p>rundata.re lit, au moins toutes les 30 minutes, les avis de coupure publiés sur <a href="${dist.site}" rel="noopener">le site de la commune de Saint-Leu</a> : ils s'affichent en haut de cette page, avec un court extrait et le lien vers l'avis complet. Un avis publié en image n'est pas lu : la page donne seulement son lien.</p>`
            : dist.site === CREOLE.url
            ? html`<p>rundata.re lit, au moins toutes les 30 minutes, les avis de <a href="${dist.site}" rel="noopener">la page « flash infos » de La Créole</a>${aussi ? html` et ceux que publie <a href="${aussi.site}" rel="noopener">le site de ${aussi.par}</a>` : ""} : ils s'affichent en haut de cette page.</p>`
            : dist.par
            // A mairie that posts its distributor's notices (Saint-Philippe, Petite-Île, Cilaos).
            ? html`<p>rundata.re lit, au moins toutes les 30 minutes, les avis de coupure publiés sur <a href="${dist.site!}" rel="noopener">le site de ${dist.par}</a> : ils s'affichent en haut de cette page, avec le lien vers chaque avis.</p>`
            : html`<p>${dist.partage ? html`Les avis de ${dist.nom}` : "Ses avis"} sont relus au moins toutes les 30 minutes : <a href="${dist.site!}" rel="noopener">le site de ${dist.nom}</a>.</p>`
          : guide
          ? html`<p>${brut(guide.distributeur)}</p>`
          : siteDist
          ? html`<p>Ses avis de coupure ne sont pas lus par rundata.re\u00a0: voir <a href="${siteDist}" rel="noopener">le site de ${dist.nom}</a>, qui donne la qualité de l'eau et les travaux en cours de chaque commune (rubrique «\u00a0L'eau dans ma commune\u00a0»), ou la mairie.${lienA}</p>`
          : html`<p>Ses avis de coupure ne sont pas lus par rundata.re : ils sont sur ses avis aux abonnés et auprès de la mairie.${lienA}</p>`}`
      : html`<p>Le distributeur de la commune n'est pas connu ici : voir la mairie.${lienA}</p>`}${
    // A shared commune: the distributors whose notices are not read, the mairie's site linked (L'Étang-Salé).
    dist?.partage && unreadShare.length ? html`<p>Les avis de ${unreadShare.join(" et ")} ne sont pas lus par rundata.re.${lienA}</p>` : ""}<p class="note">Son numéro d'urgence (fuite, coupure non annoncée) est sur la facture d'eau. <a href="/communes/${p.slug}">${p.nom} en direct : la mairie, ses horaires et son téléphone →</a></p></div>`;

  // droughtBadge(): the level's badge, HTML the site writes itself.
  const drought = x.secheresse
    ? html`<div class="card">${brut(icon("sun"))}<h3>Sécheresse</h3><p>Eau du robinet : ${brut(droughtBadge(x.secheresse.eau_du_robinet))}${x.secheresse.rivieres_et_sources ? html` · rivières et sources : ${brut(droughtBadge(x.secheresse.rivieres_et_sources))}` : ""}${x.secheresse.nappes ? html` · nappes : ${brut(droughtBadge(x.secheresse.nappes))}` : ""}</p><p class="note"><a href="/secheresse">L'arrêté sécheresse, commune par commune →</a></p></div>`
    : html`<div class="card">${brut(icon("sun"))}<h3>Sécheresse</h3><p><a href="/secheresse">Les restrictions d'eau de l'arrêté en vigueur, commune par commune →</a></p></div>`;

  // The portrait of the commune's water, at the top: its networks and its last
  // samples from the ARS, its drought level from the order. Each part left out without its data: without Hub'Eau, the
  // drought line alone; without either, a link.
  const sec = secheresseLigne(x.secheresse, w.secheresse?.value.arrete);
  const tap = x.robinet || sec
    ? html`<section aria-labelledby="h-robinet"><div class="sec-h"><p class="eyebrow">Contrôle sanitaire de l'ARS</p><h2 id="h-robinet">L'eau du robinet ${where}</h2></div>
  ${x.robinet ? html`${brut(reseauxCommune(p.nom, x.robinet))}
  <ul class="zones">${brut(tapCard(x.robinet))}</ul>` : ""}${brut(sec)}<p class="note"><a href="/eau">L'eau du robinet de chaque commune, et la baignade →</a></p></section>`
    : html`<p class="note"><a href="/eau">La qualité de l'eau du robinet, commune par commune →</a></p>`;
  const faq = eauFaq(p.nom, x.robinet);

  const others = html`<section aria-labelledby="h-autres"><div class="sec-h"><h2 id="h-autres">Les autres communes</h2></div>
  <p>${COMMUNES.filter((c) => c.slug !== p.slug).map((c, i) => html`${i ? " · " : ""}<a href="/coupures-eau/${c.slug}">${c.nom}</a>`)}</p>
  <p class="note"><a href="/coupures-eau">Tous les avis de l'île</a>, sur une carte.</p></section>`;

  // A commune whose notices are not read, its distributor's site linked (L'Entre-Deux): the page is named by what it holds, not by notices it does not show (24/11/2026: it was
  // titled « Coupure d'eau » and said « rundata.re ne les reprend pas encore »). « Coupures » stays
  // in the title, with who publishes them; the description, the h1 and the hook say the rest. A commune whose notices
  // are read, one of two distributors' included (L'Étang-Salé), keeps its words.
  // Ordinary spaces, as every title of the site: the page's typography puts the no-break ones in its text and its description.
  const nonLus = dist && !dist.avis && (guide || siteDist) ? dist.nom : undefined;
  const title = nonLus
    ? [`Eau ${where} : coupures chez ${nonLus}, eau du robinet`, `Eau ${where} : coupures chez ${nonLus} · 974`].find((t) => t.length <= TITLE_MAX) ?? `Eau ${where} (974) : avis de coupure et robinet`
    : [`Coupure d'eau ${p.nom} · La Réunion (974)`].find((t) => t.length <= TITLE_MAX) ?? `Coupure d'eau ${p.nom} · 974`;
  // Too long (a long name), without its last words: those of the hook.
  const ici = `${p.nom} (974) : les avis de coupure sont publiés par ${nonLus}, avec le lien vers sa page. Ici : l'eau du robinet analysée par l'ARS`;
  const short = nonLus
    ? describe(`${ici}, le distributeur et le niveau de sécheresse.`, `${ici} et la sécheresse.`)
    : `Coupures d'eau ${where} (974) : avis du distributeur, restrictions sécheresse et qualité de l'eau du robinet.`;
  // The link the hook announces is the lead's, under it: not while the notices load, nor over a notice read elsewhere.
  const hook = nonLus
    ? `Les avis de coupure ${de(p.nom)} sont publiés par ${nonLus}${d && !x.avis.length && !x.muet ? " : le lien est juste en dessous" : ""}. Ici, l'eau du robinet analysée par l'ARS et la sécheresse.`
    : undefined;
  const description = !d
    ? short
    : x.avis.length && x.muet
      // Its feed silent: the notices kept were read before this copy, and the page says when; here no hour, and only the
      // water not to drink, which is never dropped (cut first: the site that did not answer).
      ? x.dry
        ? describe(`${p.nom} (974) : eau à ne pas boire dans les secteurs du dernier avis lu ; le site ${x.muet.de} n'a pas répondu à la dernière lecture de rundata.re.`,
            `${p.nom} (974) : eau à ne pas boire dans les secteurs du dernier avis lu.`)
        : short
    : x.avis.length
      // Dated always: too long with a distributor's long name, without « avec les rues… », never without its date.
      // The water not to drink never left out for the length: then said alone, with its sectors.
      ? ((dated: string) => describe(`${dated}, avec les rues, les heures et les consignes.`, describe(`${dated}.`, x.dry ? `${p.nom} (974) : ${NE_PAS_BOIRE()}.` : short)))(
          `${p.nom} (974) : ${x.dry ? `${NE_PAS_BOIRE()} ; ` : ""}${plural(x.avis.length, "avis", "avis")} ${ofBy(by)} en cours ou à venir, ${x.avis.length > 1 ? "lus" : "lu"} ${at}`)
      : dist?.avis && !x.muet
        // Too long, only « Sécheresse… » goes: the hour of reading always stays.
        ? describe(`${noNotice()} Sécheresse, eau du robinet et contact du distributeur.`, noNotice())
        : short;
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [[SITE, "/"], ["Coupures d'eau", "/coupures-eau"], [p.nom, path]].map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${u}` })),
  };

  const band = html`<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/coupures-eau">Coupures d'eau</a></li><li aria-current="page">${p.nom}</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Avis des distributeurs</p>
    <h1>${nonLus ? html`L'eau` : html`Coupures d'eau`} ${where} <span class="n974">974</span></h1>
    ${status}
    ${brut(ask(`Dolo la koupé ${p.nom} ? Kansa i rovien ? Gèt si ${url} é di amwin.`,
      `Y a-t-il une coupure d'eau ${where} ? Lis ${url} et dis-moi quand l'eau revient.`))}
  </div>
  <figure class="card mapcard nophone">${brut(islandMap({ highlight: p.nom, label: `Carte de La Réunion (974) situant ${p.nom}` }))}</figure>
</div>`;

  // Up the page in the cyclone season, at its foot the rest of the year.
  // With no notice in progress in the commune, the ARS's advice in one sentence and no cyclone section: both are in full on
  // /coupures-eau, where the sentence links. While a notice is in progress, or the notices are loading, both stay here.
  const calm = !!d && !x.avis.length;
  const cyclone = calm ? { html: "", lead: false } : cycloneWater(now, p.nom);
  const notices = html`<section aria-labelledby="h-coupures-eau">
  <div class="sec-h"><p class="eyebrow">Récents ou à venir</p><h2 id="h-coupures-eau">Les avis ${where}</h2></div>
  ${list}
  ${brut(derniersAvis(p.nom, w, x.avis))}
  ${d ? brut(calm ? afterCutShort : afterCutNote) : ""}
</section>`;
  // A notice in progress or to come: the notices first, as the page says (« ils s'affichent en haut de cette page »);
  // at 390 px, two notices of Saint-Paul came 3 664 px down, under its 13 networks (24/11/2026).
  // None: the portrait of the water at the top.
  // The cyclone's section, the FAQ's answers (eauFaq), the sources and the connector: HTML the site writes itself.
  const body = html`${x.avis.length ? html`${notices}\n${tap}` : html`${tap}\n${notices}`}
${brut(arretesSection(p.nom, d?.arretes_sainte_suzanne))}
${brut(cyclone.lead ? cyclone.html : "")}
<section aria-labelledby="h-qui"><div class="sec-h"><h2 id="h-qui">Qui distribue l'eau, et les restrictions</h2></div>
  <div class="two">${distBlock}${drought}</div>
</section>
${faq.length ? html`<section aria-labelledby="h-faq">
  <div class="sec-h"><h2 id="h-faq">Questions fréquentes</h2></div>
  <div class="card faq">${faq.map((f) => html`<h3>${f.q}</h3><p>${brut(f.a)}</p>`)}</div>
</section>` : ""}
${others}
${brut(cyclone.lead ? "" : cyclone.html)}
${d && w.coupures ? brut(sourcesNote([...d.sources, ...(p.nom === ARRETES.COMMUNE && d.arretes_sainte_suzanne ? [{ source: ARRETES.SOURCE.nom, licence: ARRETES.SOURCE.licence, attribution: ARRETES.SOURCE.attribution }] : []), { source: DISTRIBUTEURS, licence: "Licence Ouverte Etalab 2.0", attribution: "ARS La Réunion" }], w.coupures)) : ""}
${brut(connectorAsk("les coupures d'eau", p.nom))}`;

  return layout(origin, { title, description, path, jsonld: [trail, webPage(origin, path, title, description, w.coupures, cityLd(p)), ...(faq.length ? [faqPage(faq)] : [])], alerte, iaAside: true, ...(hook ? { hook } : {}), ...(indexable(p.nom) ? {} : { noindex: true }) }, band.texte, body.texte);
}
