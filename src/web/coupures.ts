/**
 * The water of one commune (/coupures-eau/<commune>): its distributor's notices of cuts, or that there are none at the
 * time of the copy, who distributes its water, its drought level and its tap water. And the same in a few words for the
 * commune's own page. Cut from the copies of /coupures-eau, /secheresse and /eau: nothing more is fetched.
 */
import type { Cached } from "../cache.js";
import { CIREST, distributeur, LIENS, nomDit, MAIRIE_SAINT_LEU, MAIRIE_SAINTE_MARIE, phrasePartage, SITES_DISTRIBUTEURS, SOURCE as DISTRIBUTEURS } from "../eau/distributeurs.js";
import { ACCUEILS } from "../providers/agenda.js";
import { CREOLE } from "../providers/avis-eau.js";
import { compteAvis, muetPour } from "../tools/coupures.js";
import { de, deNom } from "../articles.js";
import { a } from "../tools/format.js";
import type { Alerte, CoupuresAnswer, DernierAvis, EauAnswer, SecheresseAnswer } from "./data.js";
import { cycloneWater } from "./eau-cyclone.js";
import { afterCutNote, connectorAsk, describe, droughtBadge, loading, nobreak, noticeCard, noticesHead, silentText, sourcesNote, tapCard, webPage } from "./domains.js";
import { esc, islandMap } from "./map.js";
import { ask, icon, layout, type Live, SITE, leAt } from "./pages.js";
import { PAGES, type PlacePage } from "./places.js";

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
    muet: distributeur(commune)?.avis ? muetPour(w.coupures?.value.injoignable, commune) : undefined,
    secheresse: w.secheresse?.value.communes.find((c) => c.commune === commune),
    interdits: w.secheresse?.value.interdits.find((x) => x.communes.includes(commune)),
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
 * day, its publisher and its link. Never « terminé »: only what the notice says, behind its link (marketing).
 */
export function derniersAvis(commune: string, w: WaterCopies, shown: { titre: string; publie_le?: string }[]): string {
  const list = (w.coupures?.value.derniers_avis?.[commune] ?? []).filter((n) => !shown.some((x) => x.titre === n.titre));
  if (!list.length) return "";
  const oldest = Date.parse(w.coupures?.value.plus_ancien_avis?.[commune] ?? "");
  const day = Number.isFinite(oldest) ? new Date(oldest + 4 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/") : "";
  const scope = `<p class="note">Ce sont les avis que les flux des distributeurs listent encore, pas un historique complet${day ? ` : le plus ancien date du ${day}` : ""}.</p>`;
  return `<h3>Derniers avis publiés ${esc(a(commune))}</h3>
  <ul class="plain">${list.map((n) => `<li>${n.lien ? `<a href="${esc(n.lien)}" rel="noopener">${esc(n.titre)}</a>` : esc(n.titre)} <span class="note">publié le ${esc(publieLe(n))} par ${esc(n.distributeur)}</span></li>`).join("")}</ul>
  ${scope}`;
}

/**
 * The networks of the commune's tap water, the districts the ARS gives for each, and its last sample: its day and the
 * ARS's conclusion, quoted, never « potable » nor « conforme » said by us (marketing); a day long past said as it is.
 */
export function reseauxCommune(commune: string, c: EauAnswer["communes"][number]): string {
  const rows = c.reseaux_detail;
  if (!rows?.length) return "";
  const dist = distributeur(commune);
  const by = dist && !dist.partage ? `, géré${rows.length > 1 ? "s" : ""} par ${esc(dist.nom)}` : "";
  // « Au Tampon », « Aux Avirons », « À Saint-Paul »: no verb to agree with the commune's name.
  const at = a(commune);
  return `<p>${esc(at.charAt(0).toUpperCase() + at.slice(1))}, l'eau du robinet passe par ${rows.length} réseau${rows.length > 1 ? "x" : ""} de distribution${by}, d'après l'ARS :</p>
  <ul class="rows eau">${rows.map((r) => `<li><span>Réseau ${esc(r.reseau)}${r.quartiers.length ? `<small>${esc(r.quartiers.join(" ; "))}</small>` : ""}</span>` +
    `<span class="note">${r.derniere_analyse ? `Dernier prélèvement le ${esc(r.derniere_analyse.split("-").reverse().join("/"))}${r.conclusion ? `. Conclusion de l'ARS : « ${esc(r.conclusion.trim())} »` : ""}` : "Pas d'analyse publiée depuis 6 mois"}</span></li>`).join("")}</ul>`;
}

/** The commune's page's tile: a cut or not, its drought level, its tap water. */
export function waterLive(p: PlacePage, w: WaterCopies): Live | undefined {
  if (!w.coupures) return undefined;
  const x = waterOf(p.nom, w);
  const cuts = compteAvis(x.avis).coupures;
  const valeur = x.dry ? "Eau à ne pas boire" : cuts ? plural(cuts, "avis de coupure", "avis de coupure") : x.avis.length ? plural(x.avis.length, "avis sur l'eau", "avis sur l'eau") : x.muet ? "Site sans réponse" : x.distributeur?.avis ? "Pas de coupure annoncée" : "Site pas lu";
  const detail = [
    // When its notices were read, unless its site did not answer: that says its own hour.
    x.muet ? esc(x.muet.court) : x.distributeur?.avis || x.avis.length ? `avis lus ${esc(leAt(w.coupures.fetchedAt))}` : "",
    x.distributeur ? (x.distributeur.partage ? `distributeurs ${esc(x.distributeur.partage.par.map((d) => d.nom).join(" et "))}` : `distributeur ${esc(x.distributeur.nom)}`) : "",
    x.secheresse ? `sécheresse : ${esc(x.secheresse.eau_du_robinet ?? "aucune restriction")}` : "",
    x.robinet ? (x.robinet.non_conformes_6_mois ? `robinet : ${plural(x.robinet.non_conformes_6_mois, "analyse non conforme", "analyses non conformes")} en 6 mois` : x.robinet.analyses_6_mois ? "robinet : analyses conformes" : "") : "",
  ].filter(Boolean).join(" · ");
  return { valeur, detail: detail || "coupures, sécheresse et eau du robinet" };
}

/**
 * Whether the notices of a commune's distributor are read: without them, its page has nothing of its own to show (only
 * where to look), and stays out of the search engines and the sitemap until a source is read (web/site.ts).
 */
export const avisLus = (commune: string) => !!distributeur(commune)?.avis;

export function coupuresCommunePage(origin: string, p: PlacePage, w: WaterCopies, now = new Date(), alerte?: Alerte): string {
  const d = w.coupures?.value;
  const path = `/coupures-eau/${p.slug}`;
  const url = `${origin}${path}`;
  const x = waterOf(p.nom, w);
  const dist = x.distributeur;
  const at = w.coupures ? leAt(w.coupures.fetchedAt) : "";
  const by = [...new Set(x.avis.map((n) => n.distributeur))].join(", ") || dist?.nom || "le distributeur";
  const where = a(p.nom);
  // Who publishes the notices read (the CIREST, a mairie), else the distributor; a mairie only linked to (LIENS).
  const publisher = dist?.par ?? dist?.nom;
  const lien = LIENS[p.nom];
  // A home page only (ACCUEILS): opened in a new window, as that site's terms ask.
  const lienA = lien ? ` <a href="${esc(lien.site)}" rel="noopener"${ACCUEILS.has(lien.site) ? ' target="_blank"' : ""}>${nobreak(lien.libelle)} →</a>` : "";

  // Its feed silent: what was read before, said with its hour, the site linked; or that its read failed.
  const silent = x.muet ? `<p class="note">${silentText(x.muet)}</p>` : "";
  // The site of a distributor whose notices are not read, linked only (CISE Réunion at Les Avirons).
  const siteDist = dist && !dist.avis ? SITES_DISTRIBUTEURS[dist.nom] : undefined;
  const status = !d
    ? loading("Les avis des distributeurs")
    : x.muet && !x.avis.length
      ? `<p class="lead">${esc(x.muet.texte)}</p>`
      : x.avis.length
      ? noticesHead(x.avis, where, [], x.muet ? "" : at)
      : dist?.avis
        // Worded with marketing: who publishes the notices read, without the commune when that name already says it.
        ? `<p class="lead">Aucun avis de coupure publié par ${esc(publisher!)}${publisher!.includes(p.nom) ? "" : ` ${esc(where)}`} ${esc(at)}.</p>`
        : siteDist
        ? `<p class="lead">Les avis de coupure de ${esc(nomDit(dist!))} ne sont pas lus par rundata.re\u00a0: voir <a href="${esc(siteDist)}" rel="noopener">son site</a>, rubrique «\u00a0L'eau dans ma commune\u00a0», ou la mairie.${lienA}</p>`
        : `<p class="lead">Les avis de coupure ${dist ? `de ${esc(nomDit(dist))}` : "du distributeur"} ne sont pas lus par rundata.re : voir ses avis aux abonnés ou la mairie.${lienA}</p>`;

  const list = !d
    ? `<p class="card">Les avis se chargent : rechargez la page dans quelques secondes.</p>`
    : x.avis.length
      ? `${silent}<ul class="zones">${x.avis.map(noticeCard).join("")}</ul>`
      : x.muet ? ""
      : `<p class="card">${dist?.avis ? `Aucun avis publié ${esc(at)}, ni coupure en cours ou à venir, ni avis « ne pas boire l'eau ».` : `Nous ne lisons pas les avis de coupure ${esc(de(p.nom))}\u00a0: ils sont sur le site de la mairie ou du distributeur.${lienA}`}</p>`;

  const unreadShare = dist?.partage?.par.filter((x) => !x.site).map((x) => x.nom) ?? [];
  const distBlock = `<div class="card">${icon("drop")}<h3>Le distributeur</h3>` +
    (dist
      ? (dist.partage ? `<p>${esc(phrasePartage(p.nom, dist.partage))}</p>` : `<p><b>${esc(dist.nom)}</b> distribue l'eau ${esc(where)}, d'après le contrôle sanitaire de l'ARS.</p>`) +
        (dist.avis
          ? dist.site === CIREST.site
            ? `<p>Les avis de la commune, publiés par la CIREST, sont relus au moins toutes les 30 minutes : <a href="${esc(dist.site)}" rel="noopener">les avis de la CIREST</a>.</p>`
            : dist.site === MAIRIE_SAINTE_MARIE
            ? `<p>Nous lisons, au moins toutes les 30 minutes, les communiqués de CISE Réunion publiés sur <a href="${esc(dist.site)}" rel="noopener">le site de la ville de Sainte-Marie</a> : ils s'affichent en haut de cette page. Un communiqué publié en image ou en PDF n'est pas lu : nous donnons seulement son lien.</p>`
            : dist.site === MAIRIE_SAINT_LEU
            ? `<p>Nous lisons, au moins toutes les 30 minutes, les avis de coupure publiés sur <a href="${esc(dist.site)}" rel="noopener">le site de la commune de Saint-Leu</a> : ils s'affichent en haut de cette page, avec un court extrait et le lien vers l'avis complet. Un avis publié en image n'est pas lu : nous donnons seulement son lien.</p>`
            : dist.site === CREOLE.url
            ? `<p>Nous lisons, au moins toutes les 30 minutes, les avis de <a href="${esc(dist.site)}" rel="noopener">la page « flash infos » de La Créole</a> : ils s'affichent en haut de cette page.</p>`
            : `<p>${dist.partage ? `Les avis de ${esc(dist.nom)}` : "Ses avis"} sont relus au moins toutes les 30 minutes : <a href="${esc(dist.site!)}" rel="noopener">le site de ${esc(dist.nom)}</a>.</p>`
          : siteDist
          ? `<p>Ses avis de coupure ne sont pas lus par rundata.re\u00a0: voir <a href="${esc(siteDist)}" rel="noopener">le site de ${esc(dist.nom)}</a>, qui donne la qualité de l'eau et les travaux en cours de chaque commune (rubrique «\u00a0L'eau dans ma commune\u00a0»), ou la mairie.${lienA}</p>`
          : `<p>Ses avis de coupure ne sont pas lus par rundata.re : ils sont sur ses avis aux abonnés et auprès de la mairie.${lienA}</p>`)
      : `<p>Le distributeur de la commune n'est pas connu ici : voir la mairie.${lienA}</p>`) +
    // A shared commune: the distributors whose notices are not read, the mairie's site linked (L'Étang-Salé).
    (dist?.partage && unreadShare.length ? `<p>Les avis de ${esc(unreadShare.join(" et "))} ne sont pas lus par rundata.re.${lienA}</p>` : "") +
    `<p class="note">Son numéro d'urgence (fuite, coupure non annoncée) est sur la facture d'eau. <a href="/communes/${p.slug}">${esc(p.nom)} en direct : la mairie, ses horaires et son téléphone →</a></p></div>`;

  const drought = x.secheresse
    ? `<div class="card">${icon("sun")}<h3>Sécheresse</h3><p>Eau du robinet : ${droughtBadge(x.secheresse.eau_du_robinet)}${x.secheresse.rivieres_et_sources ? ` · rivières et sources : ${droughtBadge(x.secheresse.rivieres_et_sources)}` : ""}${x.secheresse.nappes ? ` · nappes : ${droughtBadge(x.secheresse.nappes)}` : ""}</p>` +
      (x.interdits?.restrictions.length ? `<ul class="plain">${x.interdits.restrictions.slice(0, 6).map((r) => `<li>${esc(r.usage)} : ${esc(r.restriction)}</li>`).join("")}</ul>` : `<p>Pas d'interdiction pour un particulier : économiser l'eau.</p>`) +
      `<p class="note"><a href="/secheresse">L'arrêté sécheresse, commune par commune →</a></p></div>`
    : `<div class="card">${icon("sun")}<h3>Sécheresse</h3><p><a href="/secheresse">Les restrictions d'eau de l'arrêté en vigueur, commune par commune →</a></p></div>`;

  const tap = x.robinet
    ? `<section aria-labelledby="h-robinet"><div class="sec-h"><p class="eyebrow">Contrôle sanitaire de l'ARS</p><h2 id="h-robinet">L'eau du robinet ${esc(where)}</h2></div>
  ${reseauxCommune(p.nom, x.robinet)}
  <ul class="zones">${tapCard(x.robinet)}</ul><p class="note"><a href="/eau">L'eau du robinet de chaque commune, et la baignade →</a></p></section>`
    : `<p class="note"><a href="/eau">La qualité de l'eau du robinet, commune par commune →</a></p>`;

  const others = `<section aria-labelledby="h-autres"><div class="sec-h"><h2 id="h-autres">Les autres communes</h2></div>
  <p>${COMMUNES.filter((c) => c.slug !== p.slug).map((c) => `<a href="/coupures-eau/${c.slug}">${esc(c.nom)}</a>`).join(" · ")}</p>
  <p class="note"><a href="/coupures-eau">Tous les avis de l'île</a>, sur une carte.</p></section>`;

  const title = [`Coupure d'eau ${p.nom} · La Réunion (974)`].find((t) => t.length <= TITLE_MAX) ?? `Coupure d'eau ${p.nom} · 974`;
  const short = `Coupures d'eau ${where} (974) : avis du distributeur, restrictions sécheresse et qualité de l'eau du robinet.`;
  const description = !d
    ? short
    : x.avis.length && x.muet
      // Its feed silent: the notices kept were read before this copy, and the page says when; here no hour, and only the
      // water not to drink, which is never dropped (cut first: the site that did not answer).
      ? x.dry
        ? describe(`${p.nom} (974) : eau à ne pas boire selon le dernier avis lu ; le site ${x.muet.de} n'a pas répondu à notre dernière lecture.`,
            `${p.nom} (974) : eau à ne pas boire selon le dernier avis lu.`)
        : short
    : x.avis.length
      // Dated always: too long with a distributor's long name, without « avec les rues… », never without its date.
      ? ((dated: string) => describe(`${dated}, avec les rues, les heures et les consignes.`, describe(`${dated}.`, short)))(
          `${p.nom} (974) : ${x.dry ? "eau à ne pas boire ; " : ""}${plural(x.avis.length, "avis", "avis")} ${ofBy(by)} en cours ou à venir, ${x.avis.length > 1 ? "lus" : "lu"} ${at}`)
      : dist?.avis && !x.muet
        ? describe(`Aucune coupure d'eau annoncée par ${publisher}${publisher!.includes(p.nom) ? "" : ` ${where}`} (974) ${at}. Sécheresse, eau du robinet et contact du distributeur.`, short)
        : short;
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [[SITE, "/"], ["Coupures d'eau", "/coupures-eau"], [p.nom, path]].map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: `${origin}${u}` })),
  };

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/coupures-eau">Coupures d'eau</a></li><li aria-current="page">${esc(p.nom)}</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Avis des distributeurs</p>
    <h1>Coupures d'eau ${esc(where)} <span class="n974">974</span></h1>
    ${status}
    ${ask(`Dolo la koupé ${p.nom} ? Kansa i rovien ? Gèt si ${url} é di amwin.`,
      `Y a-t-il une coupure d'eau ${where} ? Lis ${url} et dis-moi quand l'eau revient.`)}
  </div>
  <figure class="card mapcard nophone">${islandMap({ highlight: p.nom, label: `Carte de La Réunion (974) situant ${p.nom}` })}</figure>
</div>`;

  // Up the page in the cyclone season, at its foot the rest of the year.
  const cyclone = cycloneWater(now, p.nom);
  const body = `<section aria-labelledby="h-coupures-eau">
  <div class="sec-h"><p class="eyebrow">Récents ou à venir</p><h2 id="h-coupures-eau">Les avis ${esc(where)}</h2></div>
  ${list}
  ${derniersAvis(p.nom, w, x.avis)}
  ${d ? afterCutNote : ""}
</section>
${tap}
${cyclone.lead ? cyclone.html : ""}
<section aria-labelledby="h-qui"><div class="sec-h"><h2 id="h-qui">Qui distribue l'eau, et les restrictions</h2></div>
  <div class="two">${distBlock}${drought}</div>
</section>
${others}
${cyclone.lead ? "" : cyclone.html}
${d && w.coupures ? sourcesNote([...d.sources, { source: DISTRIBUTEURS, licence: "Licence Ouverte Etalab 2.0", attribution: "ARS La Réunion" }], w.coupures) : ""}
${connectorAsk("les coupures d'eau", p.nom)}`;

  return layout(origin, { title, description, path, jsonld: [trail, webPage(origin, path, title, description, w.coupures)], alerte, iaAside: true, ...(avisLus(p.nom) ? {} : { noindex: true }) }, band, body);
}
