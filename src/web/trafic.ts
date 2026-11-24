/**
 * The traffic's page (/trafic): the roads closed or slowed, the works, and the accidents' series. Moved out of
 * domains.ts as it was; the helpers common to every domain's page stay there.
 */
import { TITRE } from "../tools/volcan-acces.js";
import { adresseCoupable } from "./adresse.js";
import type { Cached } from "../cache.js";
import { casse } from "../tools/casse.js";
import { de, nombre } from "../tools/format.js";
import { LATE_MIN, type Alerte, type TraficAnswer } from "./data.js";
import { fuelSay, keep } from "../tools/carburants.js";
import { esc, fenetre, islandMap, type Marker } from "./map.js";
import { COUNT_COLOR, legende } from "./carte-legende.js";
import { ask, icon, layout, type Live, leJour } from "./pages.js";
import { script } from "./scripts-declares.js";
import * as littoral from "../tools/littoral.js";
import * as accidents from "../routes/accidents.js";
import * as radars from "../routes/radars.js";
import { INFOTRAFIC, alertList, atDay, connectorCta, crumbBar, crumbs, dayOf, describe, enclosShort, jourMois, lienNom, loading, saidNow, sourcesNote, webPage } from "./domains.js";
// ---------------------------------------------------------------- circulation

const WAZE_EMBED = "https://embed.waze.com/fr/iframe";
/** The views of the live map: the island, then the axes where the traffic jams are. */
const WAZE_VIEWS = [
  { nom: "Toute l'île", lat: -21.115, lon: 55.536, zoom: 10 },
  { nom: "Nord · Saint-Denis", lat: -20.895, lon: 55.475, zoom: 13 },
  { nom: "Ouest · route du Littoral", lat: -20.915, lon: 55.39, zoom: 13 },
  { nom: "Sud · Saint-Pierre", lat: -21.325, lon: 55.475, zoom: 13 },
  { nom: "Est · Saint-André, Saint-Benoît", lat: -20.985, lon: 55.66, zoom: 12 },
];
const wazeLink = (v: (typeof WAZE_VIEWS)[number]) => `https://www.waze.com/ul?ll=${v.lat},${v.lon}&zoom=${v.zoom}`;

// The live map is Waze's page: loaded on a click only, as it brings Google's cookies and the site promises none.
const WAZE_SCRIPT = `(()=>{const box=document.getElementById("wz-box"),go=document.getElementById("wz-go"),open=document.getElementById("wz-open");if(!box||!go)return;
let cur=document.querySelector(".wz-views a[aria-current]");const src=(a)=>"${WAZE_EMBED}?zoom="+a.dataset.z+"&lat="+a.dataset.lat+"&lon="+a.dataset.lon;
const frame=()=>box.querySelector("iframe");
go.addEventListener("click",()=>{const f=document.createElement("iframe");f.title="Carte Waze en direct : "+cur.textContent;f.src=src(cur);f.allowFullscreen=true;f.referrerPolicy="strict-origin-when-cross-origin";box.replaceChildren(f);box.classList.add("on")});
document.querySelectorAll(".wz-views a").forEach((a)=>a.addEventListener("click",(e)=>{e.preventDefault();cur.removeAttribute("aria-current");a.setAttribute("aria-current","true");cur=a;open.href=a.href;if(frame())frame().src=src(a)}));})();`;

export function traficPage(origin: string, data: Cached<TraficAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/trafic`;
  const first = WAZE_VIEWS[0];

  const views = `<nav class="wz-views" aria-label="Vues de la carte Waze">${WAZE_VIEWS.map((v, i) =>
    `<a href="${esc(wazeLink(v))}" data-lat="${v.lat}" data-lon="${v.lon}" data-z="${v.zoom}"${i ? "" : ' aria-current="true"'}>${esc(v.nom)}</a>`).join("")}</nav>`;
  const waze = `<figure class="card mapcard wz">
  <div id="wz-box" class="wz-box">${islandMap({ label: "Carte de La Réunion : la carte Waze en direct s'affiche ici à la demande", peaks: true })}
  <div class="wz-cover"><button type="button" id="wz-go" class="btn sun">${icon("map")}Afficher la carte Waze en direct</button></div></div>
  <figcaption class="note">La carte de Waze, chargée seulement si vous le demandez : Google et Waze y déposent des cookies, rundata.re aucun. ${views}
  <a id="wz-open" class="wz-open" href="${esc(wazeLink(first))}">Ouvrir dans Waze ↗</a></figcaption></figure>`;

  const band = `${crumbBar("Circulation")}
<div class="wrap intro solo">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Bouchons, accidents, travaux : ${adresseCoupable("info\u00ADtrafic.re")}</p>
    <h1>Circulation à La Réunion <span class="n974">974</span></h1>
    <p class="lead">Les bouchons, accidents et travaux en direct sont sur la carte officielle d'${lienNom(INFOTRAFIC, "infotrafic.re")}, le site de la Région, qui ne s'affiche que chez elle. Plus bas, la carte de Waze les montre aussi. rundata.re n'a pas la mesure des bouchons : la Région ne la rend pas réutilisable pour l'instant.</p>
    <p class="lead">La route du Littoral est basculée ou fermée ? L'état officiel est sur ${lienNom(INFOTRAFIC, "infotrafic.re")}.</p>
    <p class="hero-cta"><a class="btn sun" href="${INFOTRAFIC}">${icon("car")}Carte officielle ↗</a></p>
    ${ask(`Néna in rout koupé oubien travo zordi\u00a0? Gèt si ${url} é di amwin.`, `Y a-t-il des routes coupées ou des travaux à La Réunion d'après les médias\u00a0? Lis ${url} et résume-moi.`)}
  </div>
</div>`;

  // The route du Littoral as the media announce it, never as a measure: the card stays when none did, for those who look for it.
  const lit = d?.littoral;
  const linked = (s: string) => esc(s).replace("infotrafic.re", `${lienNom(INFOTRAFIC, "infotrafic.re")}`);
  const said = (a: littoral.Annonce) =>
    `<b>${esc(littoral.etatText(a))}</b>, selon ${esc(a.media)}, <a href="${esc(a.lien)}" rel="noopener"${fenetre(a.lien)}>${littoral.linkWord(a)}</a> publié ${esc(littoral.publieText(a, now))}.`;
  const littoralBody = lit
    ? lit.annonces.length > 1
      ? `<p>${linked(littoral.DISAGREE)}</p><ul class="plain">${lit.annonces.map((a) => `<li>${said(a)}</li>`).join("")}</ul>`
      : `<p>${esc(littoral.agePrefix(lit))}${said(lit.annonces[0])}</p>`
    : lit === null
      ? `<p>${linked(littoral.NONE)}</p>`
      : "";
  const littoralCard = `<section aria-labelledby="route-du-littoral">
  <div class="sec-h"><h2 id="route-du-littoral">Route du Littoral : ce qu'en disent les médias</h2></div>
  <div class="card">${icon("car")}${littoralBody}${lit === null ? "" : `<p class="note">${linked(lit ? littoral.A_SAVOIR : "L'état officiel, en direct, est sur infotrafic.re.")}</p>`}</div>
</section>`;

  const official = `<section aria-labelledby="h-officiel">
  <div class="sec-h"><p class="eyebrow">Source officielle</p><h2 id="h-officiel">L'état des routes, par la Région</h2></div>
  <a class="card link-card" href="${INFOTRAFIC}"><h3 aria-label="infotrafic.re ↗">${icon("car")}${adresseCoupable("info\u00ADtrafic.re ↗")}</h3>
  <p>Le Centre régional de gestion du trafic (CRGT) de la Région Réunion y publie l'état des routes nationales : vitesses entre les panneaux à messages variables, accidents, travaux, routes fermées, radiers, basculement de la route du Littoral, et ses caméras. C'est la référence ; rundata.re n'en reprend rien.</p></a>
</section>`;

  const vigilance = `<div class="card">${icon("alert")}<h3>Vigilance météo</h3>
  ${alerte ? `<p><span class="vg ${alerte.neutre ? "vgpre" : `vg${alerte.couleur}`}">${esc(alerte.texte)}</span></p><p>Par fortes pluies, des routes et des radiers ferment : la préfecture et la Région l'annoncent.</p>` : "<p>Pas de vigilance au-dessus du vert signalée en ce moment.</p>"}
  <p><a href="/vigilance">La vigilance zone par zone</a> · <a href="/meteo">la météo</a> · <a href="/crues">les rivières</a></p></div>`;

  const b = d?.bus;
  const busCard = !d
    ? `<div class="card">${loading("Les retards des bus")}</div>`
    : !b
      ? `<div class="card">${icon("bus")}<h3>Retards des bus</h3><p class="note">Le flux en direct des bus ne répond pas pour le moment.</p></div>`
      : `<div class="card">${icon("bus")}<h3>Retards des bus au départ des gares</h3>
  <p class="note">Retards des bus, pas une mesure des bouchons : un car en retard l'est souvent depuis sa course précédente.</p>
  ${b.retards.length
    ? `<ul class="rows eau">${b.retards.slice(0, 12).map((r) => `<li><span>${esc(r.reseau)} ${esc(r.ligne)} vers ${esc(casse(r.direction))} <small>gare ${esc(de(r.gare))}, départ prévu ${esc(atDay(saidNow(r.heure, data!.fetchedAt.getTime(), now)))}</small></span> <span class="score">${r.retard_min} min</span></li>`).join("")}</ul>`
    : `<p>${b.suivis ? `Aucun des ${b.suivis} départs suivis en direct n'a plus de ${LATE_MIN} min de retard.` : "Pas de départ suivi en direct en ce moment."}</p>`}
  ${b.alertes.length ? `<h4>Déviations et avis des réseaux</h4>${alertList(b.alertes)}` : ""}
  ${b.temps_reel.length ? `<p class="note">Flux en direct : ${b.temps_reel.map((t) => `${esc(t.reseau)} ${esc(leJour(t.heure))}`).join(", ")}. <a href="/bus">Les prochains départs</a>.</p>` : `<p class="note"><a href="/bus">Les prochains départs</a>.</p>`}</div>`;

  const rf = d?.routes_forestieres;
  const roadsCard = !d
    ? ""
    : !rf
      ? `<div class="card">${icon("mountain")}<h3>Routes forestières</h3><p class="note">La carte de l'ONF ne répond pas pour le moment.</p></div>`
      : `<div class="card">${icon("mountain")}<h3>Routes forestières (ONF)</h3>
  <ul class="rows eau">${[...rf.principales, ...rf.interdites.filter((x) => !rf.principales.some((p) => p.route === x.route)).map((x) => ({ ...x, circulation: "Circulation interdite" }))].map((r) => {
    const shut = /interdit/i.test(r.circulation);
    // Open only when the ONF says so: a road without a state on its map (« inconnue ») is not called open.
    const open = !shut && /^Circulation autorisée/i.test(r.circulation);
    const hours = /de \d+ ?h à \d+ ?h/i.exec(r.circulation)?.[0];
    const small = [r.cause, r.precision].filter(Boolean).map((x) => esc(x!)).join(" · ") || (hours ? `circulation ${esc(hours)}${r.circulation.includes(";") ? " sur une partie" : ""}` : "");
    const etat = shut ? `<span class="q-mauvaise">interdite</span>` : open ? `<span class="q-bonne">ouverte</span>` : `<span class="note">état non publié par l'ONF</span>`;
    return `<li><span>${esc(r.route)}${small ? `<small>${small}</small>` : ""}</span>${etat}</li>`;
  }).join("")}</ul>
  <p class="note">Les routes du volcan, du Maïdo et de Bébour-Bélouve, et toutes celles que l'ONF interdit à la circulation${rf.mise_a_jour ? `, d'après sa carte mise à jour le ${esc(dayOf(rf.mise_a_jour))}` : ""}. <a href="/sentiers">Sentiers fermés</a>.</p></div>`;

  // The Enclos in its short form, never « ouvert » (marketing); the trails, place by place, on /volcan.
  const enclosNow = d?.enclos && enclosShort(d.enclos);
  const enclos = enclosNow
    ? `<div class="card">${icon("volcano")}<h3>Volcan : accès à l'Enclos</h3><p><b>${esc(enclosNow.valeur)}</b> (${esc(enclosNow.source)}). <a href="/volcan#monter">${esc(TITRE)} →</a></p></div>`
    : "";

  // What the media report on the roads and the blockades in the last hours, their headlines linked: first, as on a day of blockades it matters most.
  const medias = d?.medias?.length
    ? `<div class="card">${icon("book")}<h3>Signalé par les médias</h3><ul class="plain">${d.medias.map((m) => `<li><a href="${esc(m.lien)}" rel="noopener"${fenetre(m.lien)}>${esc(m.titre)}</a> <span class="note">${esc(m.source)}${m.heure ? `, ${esc(m.heure)}` : ""}</span></li>`).join("")}</ul>
  <p class="note">Routes, barrages et manifestations dans les titres des six dernières heures, et les communiqués du jour de la préfecture : lire l'article pour le détail. <a href="/actualites">Toutes les actualités</a>.</p></div>`
    : "";

  // Before the 1st, the new order announced and the month in force below, as on /carburants.
  const s = d?.carburants && fuelSay(d.carburants, now);
  const fuel = s && (s.annonce || s.lignes)
    ? `<div class="card">${icon("car")}<h3>Prix des carburants</h3>` +
      (s.annonce ? `<p>${jourMois(keep(s.annonce))}.</p>${s.jusquau ? `<p>${jourMois(keep(s.jusquau))}.</p>` : ""}` : `<p>${jourMois(keep(`${s.depuis}, fixés par le préfet : ${s.lignes}`))}.</p>`) +
      `<p class="note">Les mêmes dans toute l'île. <a href="/carburants">Tous les prix du mois →</a></p></div>`
    : "";
  // The fixed speed cameras, from the ministry's yearly list bundled with the site: where they stand, never the mobile checks.
  const cameras = radars.byCommune();
  const radarsLead = `${radars.RADARS.length} radars fixes à La Réunion, d'après la liste publiée par le ministère de l'Intérieur (fichier du ${radars.fichierDu()}).`;
  // Each camera at its place, its speed limit inside, its commune in the tooltip: the map says no more than the list.
  // A limit is neither good nor bad: the night's colour, which the dark theme's ink would turn into white on white.
  const radarMarkers: Marker[] = radars.radars().map((r) => ({ lon: r.lon, lat: r.lat, label: r.vma_kmh != null ? String(r.vma_kmh) : "",
    name: r.vma_kmh != null ? `${r.commune}, ${r.vma_kmh}\u00a0km/h` : r.commune, color: COUNT_COLOR, quiet: true }));
  const radarsCard = `<div class="card" id="radars">${icon("car")}<h3>Radars fixes</h3>
  <p>${radarsLead}</p>
  <figure class="mapcard">${islandMap({ markers: radarMarkers, label: radarsLead, apart: true })}
  <figcaption class="note">${legende([{ forme: "pastille", couleur: COUNT_COLOR, texte: "90", dit: "Radar fixe : vitesse limitée en km/h" }])}</figcaption></figure>
  <ul class="rows eau">${cameras.map((c) => `<li><span>${esc(c.commune)} <small>${esc(radars.vitesses(c.radars).join(", "))}</small></span> <span class="score">${c.radars.length}</span></li>`).join("")}</ul>
  <details><summary>Où ils sont</summary><ul class="plain">${cameras.flatMap((c) => c.radars.map((r) => `<li>${esc(c.commune)}${r.vma_kmh != null ? `, ${r.vma_kmh}\u00a0km/h` : ""} : <a href="${esc(radars.carte(r))}" rel="noopener">la carte ↗</a></li>`)).join("")}</ul></details>
  <p class="note">${esc(radars.RESERVE())}</p></div>`;
  const ours = `<section aria-labelledby="h-nous">
  <div class="sec-h"><p class="eyebrow">Données ouvertes, en direct</p><h2 id="h-nous">Ce que rundata.re lit</h2>
  <p>Pas les bouchons : autour d'eux. La vigilance, les retards et déviations des bus, les routes forestières, le volcan, et ce que les médias signalent sur les routes.</p></div>
  <div class="two">${medias}${vigilance}${busCard}${roadsCard}${enclos}${fuel}${radarsCard}</div>
  ${d && data && d.sources.length ? sourcesNote(d.sources, data) : ""}
</section>`;

  const why = `<section aria-labelledby="h-pourquoi"><div class="card warn">${icon("alert")}<h3 id="h-pourquoi">Pourquoi pas les bouchons ici</h3>
  <p>rundata.re n'a pas la mesure des bouchons : la Région ne la rend pas réutilisable pour l'instant, et aucune autre source ouverte ne mesure le trafic à La Réunion. Waze et Google ne permettent pas de reprendre leurs données. D'où la carte de Waze, chargée à votre demande, et le lien vers infotrafic.re.</p></div></section>`;

  const crash = accidentsSection();

  const title = "Circulation, trafic : routes, bus, médias · La Réunion (974)";
  const short = "Circulation à La Réunion (974) : carte officielle des bouchons, accidents et travaux sur infotrafic.re, retards des bus et routes forestières fermées.";
  // An announcement of the last hours leads the description; otherwise, what the page has.
  const fresh = lit && lit.annonces.length === 1 && lit.age_h < littoral.RECENT_HOURS ? lit.annonces[0] : undefined;
  const announced = fresh &&
    `Route du Littoral : ${littoral.etatShort(fresh)} selon ${fresh.media} (${littoral.publieText(fresh, now).replace(/^aujourd'hui à /, "")}). Bouchons à La Réunion (974) : carte officielle sur infotrafic.re.`;
  const description = announced
    ? describe(announced, describe(announced.replace(" (974)", ""), short))
    : "Circulation à La Réunion (974) : carte officielle des bouchons sur infotrafic.re, route du Littoral selon les médias, retards des bus.";
  const body = `${littoralCard}
${official}
${waze}
${ours}
${why}
${crash}
${connectorCta("transports", "les bus en direct")}
${script(WAZE_SCRIPT)}`;
  return layout(origin, { title, description, path: "/trafic", jsonld: [crumbs(origin, "Circulation", "/trafic"), webPage(origin, "/trafic", title, description, data)], alerte }, band, body);
}

/** The road kinds as said on /trafic, in the national file's order. */
const ROUTE_KINDS = [["nationales", "Routes nationales"], ["departementales", "Routes départementales"], ["communales", "Voies communales"], ["autres", "Parkings et autres voies"]] as const;

/**
 * The year's road accidents with casualties (routes/accidents.ts): the island's, by kind of road and commune by
 * commune, in alphabetical order. Never a rank, a rate per inhabitant nor a colour: counts as the national file has them.
 */
export function accidentsSection(): string {
  const i = accidents.ILE;
  const y = accidents.ANNEE;
  const row = (name: string, b: accidents.Bilan, blesses = true) =>
    `<tr><th scope="row">${esc(name)}</th><td>${nombre(b.accidents)}</td><td>${nombre(b.tues)}</td>${blesses ? `<td>${nombre(b.blesses)}</td>` : ""}</tr>`;
  const head = (first: string, blesses = true) => `<thead><tr><th scope="col">${first}</th><th scope="col">Accidents</th><th scope="col">Tués</th>${blesses ? `<th scope="col">Blessés</th>` : ""}</tr></thead>`;
  return `<section id="accidents" aria-labelledby="h-accidents">
  <div class="sec-h"><p class="eyebrow">Fichier national, ${y}</p><h2 id="h-accidents">Les accidents de la route en ${y}</h2></div>
  <div class="card"><p>Un accident corporel est un accident de la route qui fait au moins une victime. En ${y}, les forces de l'ordre en ont relevé ${nombre(i.accidents)} à La Réunion : ${accidents.tues(i.tues)}, ${nombre(i.hospitalises)} blessés hospitalisés et ${nombre(i.legers)} blessés légers.</p>
  <p>Selon l'ONISR, un tué est décédé sur le coup ou dans les 30 jours qui suivent l'accident ; un blessé hospitalisé est resté plus de 24 heures à l'hôpital ; un blessé léger a été soigné sans y rester plus de 24 heures. L'ONISR prévient que le chiffre des blessés hospitalisés n'est plus labellisé par la statistique publique depuis 2019.</p></div>
  <div class="card table-wrap"><table class="drought histo passe"><caption class="sr">Accidents en ${y}, par route</caption>${head("Route", false)}<tbody>${ROUTE_KINDS.map(([k, name]) => row(name, accidents.ROUTES[k], false)).join("")}</tbody></table></div>
  <div class="card table-wrap"><table class="drought histo passe"><caption class="sr">Accidents en ${y}, par commune</caption>${head("Commune")}<tbody>${accidents.communes().map(([nom, b]) => row(nom, b)).join("")}</tbody></table>
  <p class="note">Relevés par les forces de l'ordre ; seuls les tués se comparent d'une commune à l'autre.</p></div>
  <p class="note">Ministère de l'Intérieur, ONISR, fichier national des accidents corporels (BAAC), Licence Ouverte : année ${y}, publiée le ${accidents.jour(accidents.PUBLIE_LE)}.</p>
  ${accidentsSerie()}
</section>`;
}

/**
 * The last five years: the island's, then the killed of each commune, year by year and together. Never a trend, an
 * arrow nor a colour. Both tables scroll by themselves at 390 px, their first column kept in view.
 */
function accidentsSerie(): string {
  const years = accidents.ANNEES;
  const from = years[0];
  const to = years[years.length - 1];
  const ile = accidents.serieIle();
  const sum = (k: keyof accidents.Annee) => ile.reduce((n, [, a]) => n + a[k], 0);
  const cells = (a: accidents.Annee) => `<td>${nombre(a.accidents)}</td><td>${nombre(a.tues)}</td><td>${nombre(a.hospitalises)}</td><td>${nombre(a.legers)}</td>`;
  const islandRows = ile.map(([year, a]) => `<tr><th scope="row">${year}</th>${cells(a)}</tr>`).join("");
  const total = { accidents: sum("accidents"), tues: sum("tues"), hospitalises: sum("hospitalises"), legers: sum("legers") };
  const communeRows = accidents.tuesParCommune()
    .map(([nom, t]) => `<tr><th scope="row">${esc(nom)}</th>${t.map((n) => `<td>${n}</td>`).join("")}<td>${t.reduce((x, n) => x + n, 0)}</td></tr>`).join("");
  const [du, au] = accidents.MIS_EN_LIGNE;
  return `<div class="sec-h"><h3 id="h-accidents-serie">De ${from} à ${to}</h3></div>
  <div class="card"><p>Les mêmes comptes sur cinq ans, d'après le fichier de chaque année, dans sa version lue le ${accidents.jour(accidents.LU_LE)}. L'ONISR corrige ces fichiers après leur publication : une année peut encore changer de quelques unités.</p></div>
  <div class="card table-wrap defile"><table class="drought histo passe colle"><caption class="sr">De ${from} à ${to}, par année</caption><thead><tr><th scope="col">Année</th><th scope="col">Accidents</th><th scope="col">Tués</th><th scope="col">Blessés<br>hospitalisés</th><th scope="col">Blessés<br>légers</th></tr></thead>
  <tbody>${islandRows}</tbody><tfoot><tr><th scope="row">5 ans</th>${cells(total)}</tr></tfoot></table></div>
  <div class="card table-wrap defile"><table class="drought histo passe colle"><caption class="sr">De ${from} à ${to}, tués par commune</caption><thead><tr><th scope="col">Commune</th>${years.map((year) => `<th scope="col">${year}</th>`).join("")}<th scope="col">5 ans</th></tr></thead>
  <tbody>${communeRows}</tbody></table>
  <p class="note">Tués à 30 jours, relevés par les forces de l'ordre.</p></div>
  <p class="note">Ministère de l'Intérieur, ONISR, fichiers des accidents corporels de ${from} à ${to} (BAAC), Licence Ouverte : mis en ligne du ${accidents.jour(du)} au ${accidents.jour(au)}.</p>`;
}

export function traficLive(data: Cached<TraficAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const n = d.routes_forestieres?.interdites.length ?? 0;
  // Said in full on a phone: the number of forest roads closed is at its end.
  return { valeur: "Carte officielle", detail: `bouchons, accidents et travaux : infotrafic.re ; ${n} route${n > 1 ? "s" : ""} forestière${n > 1 ? "s" : ""} fermée${n > 1 ? "s" : ""}`, entier: true };
}
