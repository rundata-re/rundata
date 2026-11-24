/**
 * The air page (/air): Atmo Réunion's index by commune, its sub-indices and the sensors. Moved out of domains.ts as it
 * was; the helpers common to every domain's page stay there.
 */
import type { Cached } from "../cache.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import { a as aLieu, nombre } from "../tools/format.js";
import { CAPTEURS_AVERTISSEMENT, CAPTEURS_EXPLICATION, type Measured } from "../tools/air.js";
import { type AirAnswer, type Alerte } from "./data.js";
import { esc, islandMap, type Marker } from "./map.js";
import { anchorId, ask, credits, empty, layout, type Live, leJour, readAt } from "./pages.js";
import * as airMesures from "../providers/air-mesures.js";
import * as capteurs from "../providers/capteurs.js";
import * as atmo from "../providers/atmo.js";
import { MAP_NAME, connectorCta, coupable, crumbBar, crumbs, describe, lienNom, loading, nomsCoupables, warnings, webPage } from "./domains.js";
// ---------------------------------------------------------------- air

const AQ_NAMES = ["", "bon", "moyen", "dégradé", "mauvais", "très mauvais", "extrêmement mauvais"];
export const aq = (n: number) => `<span class="aq aq${n >= 1 && n <= 6 ? n : 0}">${esc(AQ_NAMES[n] ?? "inconnu")}</span>`;
// A sub-index: its level, or, by the guide, « indisponible » (0) or « événement » (7) in words.
const subIndex = (n: number) => (n >= 1 && n <= 6 ? aq(n) : esc(atmo.level(n)));

// The map's pollutants, one at a time, worded for the site (29/10/2026), by their name in the measures (tools/air.ts, `measured`). PM10 first, shown
// by default: measured at 10 of the 15 stations across the island on 29/10/2026, the nitrogen dioxide (12) mostly
// by the roads.
const MAP_POLLUTANTS = [
  { id: "pm10", tab: "PM10", polluant: airMesures.POLLUTANTS.PM10 },
  { id: "pm25", tab: "PM2,5", polluant: airMesures.POLLUTANTS["PM2.5"] },
  { id: "o3", tab: "Ozone", polluant: airMesures.POLLUTANTS.O3 },
  { id: "no2", tab: "NO₂", polluant: airMesures.POLLUTANTS.NO2 },
];
const STATION_BY_NAME = new Map(Object.values(airMesures.STATIONS).map((s) => [s.nom, s]));
// The pills of the measures: neutral, never the index's colours, whose thresholds are for averages and a forecast.
const MEASURE_PILL = "#44555a";

/** The hour most of the values were measured: the legend's; a station measured at another says its own. */
const usualHour = (list: Measured[]) => {
  const n = new Map<string, number>();
  for (const v of list) n.set(v.heure, (n.get(v.heure) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** The measures of each pollutant of the map at Atmo Réunion's stations, as markers, with the hour most were measured at. */
function airLayers(d: AirAnswer | undefined) {
  const valeurs = d?.mesures_aux_stations?.valeurs ?? [];
  return MAP_POLLUTANTS.map((p) => {
    const list = valeurs.filter((v) => v.polluant === p.polluant && STATION_BY_NAME.has(v.station));
    const heure = usualHour(list);
    const markers: Marker[] = list.map((v) => {
      const st = STATION_BY_NAME.get(v.station)!;
      const value = `${nombre(v.valeur)} ${v.unite}${v.heure !== heure ? `, ${v.heure}` : ""}`;
      return { lon: st.lon, lat: st.lat, label: String(Math.round(v.valeur)), say: value, place: v.station, name: `${v.station} (${st.commune})\u00a0: ${value}`, color: MEASURE_PILL, quiet: true, href: `#${anchorId("st", v.station)}` };
    });
    return { ...p, heure, list, others: list.filter((v) => v.heure !== heure).length, markers };
  }).filter((l) => l.markers.length);
}
type AirLayer = ReturnType<typeof airLayers>[number];

/**
 * The top of /air when stations measured, before the forecast (a measure comes before a model): the first pollutant
 * of the map over the island, from its lowest to its highest station at the hour most measured, the highest named.
 */
function airMeasured(l: AirLayer, lu: string, now: Date): string {
  const at = l.list.filter((v) => v.heure === l.heure).sort((a, b) => a.valeur - b.valeur);
  const lo = at[0], hi = at[at.length - 1];
  const where = (v: Measured) => `${v.station}${v.commune ? ` (${v.commune})` : ""}`;
  const big = at.length > 1 && Math.round(lo.valeur) !== Math.round(hi.valeur)
    ? `${l.tab} : ${Math.round(lo.valeur)} à ${Math.round(hi.valeur)} µg/m³`
    : `${l.tab} : ${Math.round(hi.valeur)} µg/m³`;
  // Worded for the site (29/10/2026): the verb says it is a measure; the legend's name of the pollutant.
  const name = `${l.polluant[0].toUpperCase()}${l.polluant.slice(1)} ${l.polluant.startsWith("particules") ? "mesurées" : "mesuré"} ${l.heure}`;
  const lead = at.length > 1 ? `${name} à ${at.length} stations d'Atmo Réunion : le plus haut ${aLieu(where(hi))}.` : `${name} à la station ${where(hi)}.`;
  // With its day, as every reading.
  const when = leJour(lu);
  return `<div class="status"><p class="big">${esc(big)}</p><p class="lead">${esc(lead)}</p>` +
    `<p class="note">Mesure brute, non validée, publiée par le LCSQA. Lue par rundata.re ${esc(when)}.</p></div>`;
}

/**
 * The island's map of /air: the measures at Atmo Réunion's stations, at their place, one pollutant at a time (radio
 * buttons and CSS, without a script), each value in a neutral pill; without a measure, the index forecast in each
 * commune, as a dot at its centre. Never a commune filled.
 */
function airMap(d: AirAnswer | undefined, layers: AirLayer[]): string {
  if (layers.length) {
    const on = layers[0].id;
    const tabs = `<div class="tabs aqtabs" role="radiogroup" aria-label="Polluant affiché sur la carte">` +
      layers.map((l) => `<input type="radio" name="aqp" id="aqp-${l.id}"${l.id === on ? ' class="on" checked' : ""}><label for="aqp-${l.id}">${esc(l.tab)}</label>`).join("") + `</div>`;
    const legend = layers.map((l) => `<span class="lg lg-${l.id}${l.id === on ? " on" : ""}">${esc(`${l.polluant[0].toUpperCase()}${l.polluant.slice(1)}, en µg/m³ : mesure brute, non validée, ${l.heure}`)}` +
      `${l.others ? esc(`, ${l.others} station${l.others > 1 ? "s" : ""} à une autre heure (voir la liste)`) : ""}.</span>`).join("");
    return `<figure class="card mapcard airmap">${tabs}` +
      islandMap({ layers: layers.map((l) => ({ id: l.id, markers: l.markers, on: l.id === on })), peaks: true, apart: true, listed: true, label: "Carte de La Réunion (974) : les mesures aux stations d'Atmo Réunion, un polluant à la fois" }) +
      `<figcaption class="note">${legend}</figcaption></figure>`;
  }
  // No measure stored: the forecast, a dot at each commune's centre.
  const markers: Marker[] = (d?.communes ?? []).flatMap((c) => {
    const place = resolvePlace(c.commune)?.lieu;
    const name = MAP_NAME.get(normalize(c.commune)) ?? c.commune;
    return place && c.niveau >= 1 && c.niveau <= 6
      ? [{ lon: place.lon, lat: place.lat, label: String(c.niveau), say: `indice ${c.niveau} sur 6, ${AQ_NAMES[c.niveau]}`, place: name, name: `${name}\u00a0: indice ${c.niveau} sur 6, ${AQ_NAMES[c.niveau]}`, color: `var(--aq${c.niveau})`, round: true, quiet: true, href: `#${anchorId("c", name)}` }]
      : [];
  });
  return `<figure class="card mapcard">${islandMap({ markers, peaks: true, apart: true, listed: true, label: "Carte de La Réunion (974) : l'indice ATMO prévu dans chaque commune" })}` +
    `<figcaption class="note">Indice ATMO prévu pour aujourd'hui dans chaque commune, de 1 (bon) à 6 (extrêmement mauvais) : une prévision, pas une mesure.</figcaption></figure>`;
}

/** A pollutant with its article, after « surtout » (06/11/2026): « l'ozone », « les particules PM10 », « le dioxyde d'azote ». */
const withArticle = (p: string) => (p.startsWith("particules") ? `les ${p}` : /^[aeiouy]/i.test(p) ? `l'${p}` : `le ${p}`);

/**
 * The forecast under the measure at the top of /air (the validated words, choices of 06/11/2026): one line
 * always shown, « Air prévu aujourd'hui : moyen (prévision) » in the index's colour, or « de bon à moyen selon la
 * commune »; under it the index out of 6, the pollutant most often in cause in the communes at the highest level, when
 * Atmo Réunion diffused it and when rundata.re read it.
 */
function airForecastUnder(list: NonNullable<AirAnswer["communes"]>, worst: number, best: number, diffusion: string | undefined, lue: string): string {
  const counts = new Map<string, number>();
  for (const c of list) if (c.niveau === worst) for (const p of c.polluants) counts.set(p, (counts.get(p) ?? 0) + 1);
  const cause = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0]?.[0];
  const at = /le (\d{2}\/\d{2}) à (\d{2}:\d{2})/.exec(diffusion ?? "");
  const word = best !== worst ? `de ${aq(best)} à ${aq(worst)} selon la commune` : aq(worst);
  const index = esc(`Indice ${best !== worst ? `${best} à ${worst}` : worst} sur 6 (1 bon, 6 extrêmement mauvais)${cause ? `, surtout ${withArticle(cause)}` : ""}. ` +
    `Prévision d'Atmo Réunion${at ? `, diffusée le ${at[1]} à ${at[2]}` : ""}.`);
  return `<div class="status forecast"><p class="lead"><b>Air prévu aujourd'hui : ${word} (prévision)</b></p>` +
    `<p class="aqindex">${index} <span class="note">${esc(`Lue par rundata.re ${lue}.`)}</span></p></div>`;
}

export function airPage(origin: string, data: Cached<AirAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const list = [...(d?.communes ?? [])].sort((a, b) => b.niveau - a.niveau || a.commune.localeCompare(b.commune, "fr"));
  const worst = list[0]?.niveau;
  const best = list.length ? list[list.length - 1].niveau : undefined;
  const url = `${origin}/air`;

  // Measured at the stations: the measure first, the forecast under it, smaller and said a forecast.
  const layers = airLayers(d);
  const top = layers[0] && d?.mesures_aux_stations ? airMeasured(layers[0], d.mesures_aux_stations.lu_par_rundata, now) : "";
  const levels = worst != null ? `${AQ_NAMES[worst] ?? ""}${best != null && best !== worst ? ` à ${AQ_NAMES[best] ?? ""}` : ""}` : "";
  const forecastNote = d ? `${d.diffusion ? ` ${esc(d.diffusion)}` : ""} Lue par rundata.re ${readAt(data!.fetchedAt, now).a}.` : "";
  const status = !d
    ? loading("L'indice de la qualité de l'air")
    : top && worst != null
      ? `${top}${airForecastUnder(list, worst, best!, d.diffusion, readAt(data!.fetchedAt, now).a)}`
      : worst != null
        ? `<div class="status"><p class="big">${esc(levels)}</p>` +
          `<p class="lead">${esc(d.resume)}</p><p class="note" style="color:var(--on-night-muted)">Une prévision d'Atmo Réunion pour la journée, pas une mesure.${forecastNote}</p></div>`
        : `${top}<p class="lead">${esc(d.resume)}</p>`;

  // A card a level, its communes; today's are the map's targets, tomorrow's not (one anchor a commune).
  const levelCards = (l: NonNullable<AirAnswer["communes"]>, anchors: boolean) => [6, 5, 4, 3, 2, 1]
    .map((n) => ({ n, l: l.filter((c) => c.niveau === n).sort((a, b) => a.commune.localeCompare(b.commune, "fr")) }))
    .filter((x) => x.l.length)
    .map((x) => `<div class="card"><h3>${aq(x.n)} prévu dans ${x.l.length} commune${x.l.length > 1 ? "s" : ""}</h3><ul class="plain cols">` +
      x.l.map((c) => `<li${anchors ? ` class="tgt" id="${anchorId("c", MAP_NAME.get(normalize(c.commune)) ?? c.commune)}"` : ""}>${esc(c.commune)}${c.polluants.length ? ` <span class="note">(${esc(c.polluants.join(", "))})</span>` : ""}</li>`).join("") + `</ul></div>`)
    .join("");
  const byLevel = levelCards(list, true);

  // Tomorrow's forecast, when Atmo Réunion diffused it: as today's, a forecast with its diffusion, under it.
  const dm = d?.demain;
  const dmDay = dm ? `${dm.echeance.slice(8, 10)}/${dm.echeance.slice(5, 7)}` : "";
  const tomorrow = dm?.communes?.length
    ? `<section aria-labelledby="h-demain-air">
  <div class="sec-h"><p class="eyebrow">Demain</p><h2 id="h-demain-air">L'indice prévu demain, le ${dmDay}</h2>
  <p>${esc(dm.resume)} ${dm.diffusion ? `Pas une mesure : ${esc(dm.diffusion.charAt(0).toLowerCase() + dm.diffusion.slice(1))}` : "Une prévision d'Atmo Réunion, pas une mesure."} Lue par rundata.re ${readAt(data!.fetchedAt, now).a}.</p></div>
  <div class="levels">${levelCards(dm.communes, false)}</div>
</section>`
    : "";

  // Each pollutant's sub-index, commune by commune, folded: the list above already gives the one in cause.
  const pollutants = Object.values(atmo.POLLUTANTS);
  const subs = list.some((c) => c.sous_indices)
    ? `<details class="card"><summary>Sous-indice de chaque polluant, commune par commune</summary><div class="table-wrap"><table class="drought niveaux"><caption class="sr">Sous-indice de chaque polluant, commune par commune</caption>` +
      `<thead><tr><th scope="col">Commune</th>${pollutants.map((p) => `<th scope="col">${esc(p)}</th>`).join("")}</tr></thead><tbody>` +
      [...list].sort((a, b) => a.commune.localeCompare(b.commune, "fr")).map((c) => `<tr><th scope="row">${esc(c.commune)}</th>` +
        pollutants.map((p) => `<td data-label="${esc(p)}">${c.sous_indices?.[p] != null ? subIndex(c.sous_indices[p]) : "—"}</td>`).join("") + `</tr>`).join("") +
      `</tbody></table></div></details>`
    : "";

  // The measures at the stations, said apart from the forecast and never in a sentence with it: each value with its
  // hour, its station, the station's type and commune, and that it is raw and not validated.
  const m = d?.mesures_aux_stations;
  const byStation = new Map<string, Measured[]>();
  for (const v of m?.valeurs ?? []) {
    const k = `${v.station}${v.commune ? ` · ${v.commune}` : ""}`;
    byStation.set(k, [...(byStation.get(k) ?? []), v]);
  }
  const [luLe, luA] = m?.lu_par_rundata.split(" ") ?? [];
  const measures = m && byStation.size
    ? `<section aria-labelledby="h-mesures-air">
  <div class="sec-h"><p class="eyebrow">Mesures</p><h2 id="h-mesures-air">Mesuré aux stations d'Atmo Réunion</h2>
  <p>Les concentrations mesurées heure par heure aux stations, publiées par le LCSQA. Ce sont des mesures brutes, non validées, qu'Atmo Réunion peut corriger ensuite. Elles ne sont pas l'indice ATMO, qui est une prévision.</p></div>
  <div class="levels">${[...byStation].map(([station, list]) => `<div class="card tgt" id="${anchorId("st", list[0].station)}"><h3>${esc(station)}</h3><ul class="plain">` +
    list.map((v) => `<li><b>${esc(v.polluant)}</b> : ${esc(nombre(v.valeur))} ${esc(v.unite)} <span class="note">${esc(v.heure)}, station de type ${esc(v.type)}, mesure brute, non validée${v.retard ? `, ${esc(v.retard)}` : ""}</span></li>`).join("") +
    `</ul></div>`).join("")}</div>
  <p class="note">Lues par rundata.re le ${esc(luLe)} à ${esc(luA)}, dans les ${lienNom(m.source, "fichiers du LCSQA sur data.gouv.fr", ' rel="noopener"')} (Licence Ouverte Etalab 2.0).</p>
</section>`
    : "";

  // The sensors of private people, under the index and apart from it, worded for the site (29/10/2026): raw values by
  // commune, their network and the hour they measured, never a colour, a threshold, an identifier nor a place;
  // sensors.social's credit as it asked it (09/11/2026), in English, with a link to its site and one to its licence.
  const am = d?.capteurs_amateurs;
  const [amLe, amA] = am && "lu_par_rundata" in am ? am.lu_par_rundata.split(" ") : [];
  const pm = (name: string, v: number | undefined) => (v === undefined ? "" : ` · ${name} : ${esc(nombre(v))} µg/m³`);
  const amateurs = am
    ? `<section aria-labelledby="h-capteurs-air">
  <div class="sec-h"><p class="eyebrow">Capteurs de particuliers</p><h2 id="h-capteurs-air">Capteurs amateurs</h2>
  <p><b>${esc(CAPTEURS_AVERTISSEMENT)}</b> ${nomsCoupables(esc(CAPTEURS_EXPLICATION))}</p></div>
  <div class="card">${"lecture_ancienne" in am && am.lecture_ancienne ? `<p>${esc(am.lecture_ancienne)}</p>` : ""}${"valeurs" in am && am.valeurs
    ? `<ul class="plain">${am.valeurs.map((v) => `<li>${esc(v.commune)}${pm("PM2,5", v.pm2_5)}${pm("PM10", v.pm10)} · mesurées ${esc(v.mesurees)} <span class="note">${nomsCoupables(esc(v.reseau))}, non étalonné</span></li>`).join("")}</ul>`
    : "aucun" in am && am.aucun
      ? `<p>${nomsCoupables(esc(am.aucun))} <a href="#brancher">Brancher un capteur</a></p>`
      : am.echec ? `<p>${esc(am.echec)}</p>` : ""}${"lectures_impossibles" in am && am.lectures_impossibles ? am.lectures_impossibles.map((x) => `<p>${nomsCoupables(esc(x))}</p>`).join("") : ""}
  <p class="note">${amLe ? `Lu par rundata.re le ${esc(amLe)} à ${esc(amA)}, sur` : "Capteurs partagés sur"} ${lienNom(capteurs.CARTE, "Sensor.Community", ' rel="noopener"')} (<a href="${esc(capteurs.DBCL)}" rel="noopener">DbCL 1.0</a>) et ${lienNom(capteurs.SOCIAL_CARTE, "sensors.social", ' rel="noopener"')} (<span lang="en">Sensor data © ${lienNom(capteurs.SOCIAL_CARTE, "sensors.social", ' rel="noopener"')} contributors, <a href="${esc(capteurs.ODBL)}" rel="noopener">ODbL 1.0</a></span>).</p></div>
  <details class="card" id="brancher"><summary>Brancher son capteur</summary>
  <p>Un capteur de particules branché dehors et partagé sur Sensor.<wbr>Community ou sensors.<wbr>social apparaît dans le bloc ci-dessus, arrondi à sa commune.</p>
  <h3>airRohr (Sensor.<wbr>Community)</h3>
  <ul class="plain"><li>Une carte NodeMCU ESP8266</li><li>Un capteur de particules SDS011</li><li>Un capteur BME280 (température, humidité, pression)</li><li>Un abri en tube PVC</li></ul>
  <p><a href="${esc(capteurs.GUIDE)}" rel="noopener">Le guide officiel de l'airRohr</a></p>
  <p>Au moment d'inscrire le capteur, arrondissez vous-même sa position : rundata.re n'affiche que la commune, mais Sensor.<wbr>Community peut publier la position que vous saisissez.</p>
  <p class="note">Lu le 29/10/2026 à 10:53.</p>
  <h3>Altruist (sensors.<wbr>social)</h3>
  <p><a href="${esc(capteurs.SOCIAL_GUIDE)}" rel="noopener">Le guide officiel d'installation de l'Altruist</a></p>
  <p>Au moment de régler le capteur, arrondissez vous-même sa position : rundata.re n'affiche que la commune, mais sensors.<wbr>social publie les coordonnées que vous saisissez.</p>
  <p class="note">Lu le 09/11/2026 à 15:15.</p></details>
</section>`
    : "";

  const scale = `<ul class="scale">${[1, 2, 3, 4, 5, 6].map((n) => `<li>${aq(n)}<p>Indice ${n} sur 6.</p></li>`).join("")}</ul>`;

  const title = "Qualité de l'air aujourd'hui par commune · La Réunion (974)";
  // Dated by the day the index is forecast for, never by the hour of the reading nor of the view.
  const airShort = "Qualité de l'air à La Réunion (974) : l'indice ATMO d'Atmo Réunion dans chaque commune, avec le polluant en cause.";
  const description = d?.echeance && worst != null
    ? describe(`Qualité de l'air à La Réunion (974) le ${d.echeance.slice(8, 10)}/${d.echeance.slice(5, 7)}, indice ATMO prévu par Atmo Réunion : ${d.resume.replace(/^Qualité de l'air prévue aujourd'hui à La Réunion : /, "")}`, airShort)
    : airShort;

  const band = `${crumbBar("Qualité de l'air")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>${top ? "Mesuré aux stations" : "Prévision du jour"}</p>
    <h1>Qualité de l'air à La Réunion <span class="n974">974</span></h1>
    ${status}${tomorrow ? `<p class="note"><a href="#h-demain-air">Demain, le ${dmDay} : ${esc(dm!.resume.replace(/^Qualité de l'air prévue demain à La Réunion : /, "").replace(/\.$/, ""))} (prévision)</a></p>` : ""}
    ${ask(`Lèr lé bon La Rényon zordi ? Gèt si ${url} é di amwin pou mon komine.`,
      `L'air est-il bon aujourd'hui à La Réunion ? Lis ${url} et dis-moi la qualité de l'air dans ma commune.`)}
  </div>
  ${airMap(d, layers)}
</div>`;

  const body = `${measures}
<section aria-labelledby="h-communes-air">
  <div class="sec-h"><p class="eyebrow">Commune par commune</p><h2 id="h-communes-air">L'indice dans les 24 communes</h2>
  <p>L'indice ATMO prévu va de 1 (bon) à 6 (extrêmement mauvais). C'est le plus mauvais des sous-indices de cinq polluants : particules PM2,5 et PM10, ozone, dioxyde d'azote, dioxyde de soufre. Entre parenthèses, le polluant en cause.</p></div>
  ${d ? `<div class="levels">${byLevel}</div>${subs}${warnings(d.avertissements)}` : `<p class="card">L'indice se charge : rechargez la page dans quelques secondes.</p>`}
</section>
${tomorrow}
${amateurs}
<section aria-labelledby="h-source-air">
  <div class="sec-h"><p class="eyebrow">Provenance</p><h2 id="h-source-air">D'où vient l'indice</h2></div>
  <div class="card"><dl class="facts">
    <div><dt>Calculé par</dt><dd><a href="${esc(atmo.PROVENANCE.site)}" rel="noopener">Atmo Réunion</a>, observatoire agréé de la qualité de l'air</dd></div>
    <div><dt>Diffusé par</dt><dd>Atmo France, couche ouverte ${coupable("ind_atmo_2021")} (${lienNom(atmo.PROVENANCE.fiche, "sa fiche sur data.gouv.fr", ' rel="noopener"')})</dd></div>
    <div><dt>Licence</dt><dd><a href="${esc(atmo.PROVENANCE.licence_lien)}" rel="noopener">${esc(atmo.PROVENANCE.licence)}</a></dd></div>
  </dl>${d && data ? `<p class="note">${d.diffusion ? `${esc(d.diffusion)} ` : ""}Lue par rundata.re ${readAt(data.fetchedAt, now).a}.</p>` : ""}</div>
  <div class="card"><h3>Comment l'indice est calculé</h3><ul class="plain">${atmo.METHODE.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
  <p class="note">D'après le <a href="${esc(atmo.GUIDE)}" rel="noopener">guide de calcul de l'indice ATMO</a> d'Atmo France (version du 14/12/2020), en application de l'arrêté du 10 juillet 2020.</p></div>
  ${d ? `<p class="sources">Sources : ${credits(d.sources)}.</p>` : ""}
</section>
<section aria-labelledby="h-echelle-air">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-echelle-air">L'échelle de l'indice</h2></div>
  <div class="card">${scale}<p class="note">Pendant une éruption, le panache peut dégrader l'air dans le sud et l'ouest de l'île : suivez les consignes de l'ARS et de la préfecture.</p></div>
</section>
${connectorCta("qualite_air", "l'air de l'île")}`;

  return layout(origin, { title, description, path: "/air", jsonld: [crumbs(origin, "Qualité de l'air", "/air"), webPage(origin, "/air", title, description, data)], alerte }, band, body);
}

export function airLive(data: Cached<AirAnswer> | null, now = new Date()): Live | undefined {
  if (!data) return undefined;
  const list = data.value.communes ?? [];
  if (!list.length) return empty(`Indice ATMO du jour pas encore dans la lecture ${readAt(data.fetchedAt, now).de}.`);
  const worst = Math.max(...list.map((c) => c.niveau));
  const best = Math.min(...list.map((c) => c.niveau));
  const polluants = [...new Set(list.filter((c) => c.niveau === worst).flatMap((c) => c.polluants))];
  return {
    valeur: best === worst ? aq(worst) : `${aq(best)} à ${aq(worst)}`,
    detail: `indice ATMO prévu pour aujourd'hui dans les 24 communes${polluants.length ? ` (${esc(polluants.join(", "))})` : ""}`,
  };
}
