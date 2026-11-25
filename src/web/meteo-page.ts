/**
 * /meteo, the weather of the whole island: what every station measured last, on the map and in the list, the sea off
 * the coast, the links to each place's forecast, the records of the stations of reference, and how to read it all. The
 * page of each commune or famous place is in lieu-page.ts, the sea in mer-page.ts, the vigilance in vigilance-page.ts.
 */
import { faqPage, texteStable, type Faq } from "./texte-stable.js";
import chaud from "../historique/plus-chaud.json" with { type: "json" };
import { STATIONS_REFERENCE } from "../tools/historique.js";
import { STATIONS_974 } from "../providers/meteofrance-stations.js";
import { RELECTURE_MIN as METEOFRANCE_RELECTURE_MIN } from "../providers/meteofrance.js";
import { CUMULS_LOADER, cumulsSection } from "./pluie-cumuls.js";
import type { Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { a, enGrand, fr } from "../tools/format.js";
import type { Alerte, HistoriqueAnswer, HomeData } from "./data.js";
import { confianceExplication } from "../tools/prevision.js";
import { esc, islandMap, type Marker } from "./map.js";
import { pleinEcran } from "./plein-ecran.js";
import { ALTITUDES_CREDIT, METEO_SCRIPT, RADAR_CREDIT, stationsMap } from "./meteo-carte.js";
import { coupable } from "./domains.js";
import { script } from "./scripts-declares.js";
import { ask, chip, coldest, connector, credits, deg, fit, icon, ISLAND, layout, leAt, lesJours, meteoLive, metres, placeLinks, seaName, shortName, SITE, stationId, stationItem, stationsList, thin, warmest, withTempAll } from "./pages.js";

/** The map and every station, from the coast to the summits. */
function weatherLive(data: Cached<HomeData> | null, now: Date): string {
  if (!data) {
    return `<p class="card">Les mesures se chargent : rechargez la page dans quelques secondes. Les stations Météo-France publient toutes les 6 minutes.</p>`;
  }
  const d = data.value;
  const sorted = [...d.stations].sort((a, b) => a.altitude_m - b.altitude_m);
  const latest = d.stations.reduce((m, s) => (s.time > m ? s.time : m), "");
  const markers: Marker[] = d.stations.map((s) =>
    s.temperature != null
      ? { lon: s.lon, lat: s.lat, label: `${Math.round(s.temperature)}°`, say: `${Math.round(s.temperature)} °C`, name: shortName(s.nom), color: chip(s.temperature), round: true, href: `#${stationId(s.nom)}` }
      : { lon: s.lon, lat: s.lat - 0.022, label: `${s.vent ?? "—"} km/h`, say: s.vent != null ? `vent ${s.vent} km/h` : "pas de mesure", name: s.nom.split(" ").pop()!, color: "#44555a", href: `#${stationId(s.nom)}` },
  );
  return `<div class="live"><figure class="card mapcard">` +
    islandMap({ markers, peaks: true, listed: true, label: `Carte de La Réunion (974) avec les températures mesurées ${leAt(latest || data.fetchedAt.toISOString())}` }) +
    `<figcaption class="legend">8 °C<i></i>33 °C · températures mesurées sous abri</figcaption></figure>` +
    `<div class="card"><h3>Station par station</h3><ul class="stations">${sorted.map((s) => stationItem(s, now)).join("")}</ul>` +
    `${d.indisponibles.length ? `<p class="note">Momentanément indisponible : ${esc(d.indisponibles.join(", "))}.</p>` : ""}</div></div><p class="sources">Sources : ${credits(d.sources)}.</p>`;
}

/** The id of what the confidence says on /meteo, where each place page's forecast links. */
export const CONFIANCE_ANCRE = "confiance";

const WEATHER_NOTES = `<section aria-labelledby="h-notes">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-notes">Comment lire ces données</h2></div>
  <div class="three">
    <div class="card">${icon("gauge")}<h3>Une mesure n'est pas une prévision</h3><p>Ce qui est affiché comme mesuré vient d'un capteur, avec son heure. Les prévisions viennent de modèles (AROME de Météo-France, puis le modèle européen) et portent toujours l'étiquette <span class="badge">Prévision</span>.</p></div>
    <div class="card">${icon("mountain")}<h3>Une île, cent microclimats</h3><p>La Réunion passe de 0 à 3 000 m en 20 km, du versant au vent (Saint-Benoît, Sainte-Rose) au versant sous le vent (Saint-Paul, Saint-Leu). Chaque réponse dit quelle station a mesuré, à quelle distance et à quelle altitude.</p></div>
    <div class="card warn">${icon("alert")}<h3>Cyclone, fortes pluies : la vigilance officielle d'abord</h3><p>Pour une alerte cyclonique ou une vigilance fortes pluies, orages ou houle, référez-vous à <a href="https://meteofrance.re/fr">Météo-France La Réunion</a> et à la préfecture. La vigilance en cours, zone par zone : <a href="/vigilance">page vigilance</a>.</p></div>
  </div>
</section>`;

/**
 * The block « Records » of /meteo: the records of each station of reference of /historique (one per climate), since
 * the first daily measurement Météo-France published for it, from its copy (recordsReference()), never written by hand. A record
 * missing is left out, a station without any too, and the block without any station.
 */
export function recordsSection(h: HistoriqueAnswer | undefined): string {
  // A box per record: its words, its figure big, its date small (the cards of a station's page, station.ts).
  const box = (cls: string, label: string, x: { valeur: number; date: string } | undefined, v: (n: number) => string) =>
    x ? `<li class="${cls}"><span>${label}</span> <b>${thin(v(x.valeur))}</b> <small>le ${esc(x.date)}</small></li>` : "";
  const items = (h?.records_reference ?? []).flatMap((r) => {
    const boxes =
      box("chaud", "Le plus chaud", r.temperature_max, deg) +
      box("frais", "Le plus frais", r.temperature_min, deg) +
      box("pluie", "La plus forte pluie en un jour", r.pluie_en_un_jour_mm, (n) => `${fr(Math.round(n * 10) / 10)} mm`) +
      box("rafale", "La plus forte rafale", r.rafale_max_kmh, (n) => `${fr(n)} km/h`);
    if (!boxes) return [];
    // Its climate and the year of its first measure on a line of their own, under its name: never a parenthesis in another.
    const zone = `${r.zone.charAt(0).toUpperCase()}${r.zone.slice(1)}`;
    return [`<li class="card"><h3>${esc(r.station)}</h3><p>${esc(zone)} · <span>mesures depuis ${r.depuis}</span></p><ul>${boxes}</ul></li>`];
  });
  if (!items.length || !h) return "";
  return `<section id="records" aria-labelledby="h-records">
  <div class="sec-h"><p class="eyebrow">Historique</p><h2 id="h-records">Les records des stations de référence</h2>
  <p>Une station par climat de l'île, comme sur <a href="/historique">la page Historique</a> : ses records depuis le début de ses mesures quotidiennes publiées par Météo-France, jusqu'au ${esc(h.periode.au)}. Un jour sans mesure n'est pas compté.</p></div>
  <ul class="records">${items.join("")}</ul>
</section>`;
}

/**
 * /meteo's stable text (wording validated on 14/11/2026). The stations of reference and the first year of Gillot's series from
 * the data of /historique. The record of each station of reference is in the block « Records » just above it
 * (recordsSection()).
 */
const meteoLire = () => `<p>Tout ce qui est sur cette page est <b>mesuré</b>. La prévision est à part, sur la page de chaque commune, et elle est toujours présentée comme une prévision.</p>
<p>Chaque chiffre est la dernière mesure d'une station, avec son heure. Les mesures viennent de plusieurs réseaux :</p>
<ul class="plain"><li><b>Les stations de Météo-France</b> publient une mesure toutes les 6 minutes, et rundata.re les relit toutes les ${METEOFRANCE_RELECTURE_MIN} minutes.</li>
<li><b>Les deux aéroports</b> publient leurs observations toutes les 30 minutes.</li>
<li><b>Des balises de vent</b> complètent le réseau, dont celles des clubs de parapente (FFVL).</li>
<li><b>Les stations amateur du réseau MétéoR-OI</b>, en option, ajoutent des points de mesure dans les hauts et les quartiers. Leur fiabilité n'est pas vérifiée comme celle des stations officielles : elles sont dessinées avec un contour en pointillé.</li></ul>
<p>Les stations vont de la côte à plus de ${fr(Math.floor(Math.max(...STATIONS_974.map((s) => s[4])) / 100) * 100)}\u00a0m d'altitude. Entre deux stations, la carte <b>estime</b> la température d'après l'altitude, et la pluie d'après le radar de Météo-France. Ce sont des estimations, pas des mesures.</p>
<p><b>Ce que la page réunit et qu'aucune source ne montre seule :</b></p>
<ul class="plain"><li>les stations officielles, celles des aéroports, les balises et les stations amateur, sur une même carte et à la même heure ;</li>
<li>la possibilité de rejouer les 6 dernières heures, les 24 dernières heures ou les 7 derniers jours.</li></ul>
<p id="${CONFIANCE_ANCRE}"><b>La confiance des prévisions, pour chaque commune et chaque lieu\u00a0:</b> ${esc(confianceExplication())}</p>
<p><b>L'historique et les records :</b> voir <a href="/historique">la page Historique</a>.</p>
<ul class="plain"><li>Elle compare les 30 derniers jours à la normale 1991-2020, à ${STATIONS_REFERENCE} stations de référence.</li>
<li>Elle donne la température de chaque année depuis ${(chaud.annees as [number, number][])[0][0]} ${a(chaud.station.replace(/ \(aéroport\)$/, ""))}.</li>
<li>Avec le connecteur, votre assistant IA lit aussi les mesures quotidiennes des stations que Météo-France a eues sur l'île, records compris.</li></ul>`;

/** The FAQ's answer on the rose zones (wording validated on 16/11/2026), its figures those of the map (meteo-carte.ts, PLUVIO_*). */
const ZONES_ROSES = "Les zones roses estiment la pluie de l'heure affichée autour des pluviomètres de Météo-France, et des stations amateur quand la case «\u00a0Stations amateur\u00a0» est cochée. " +
  "Chaque pluviomètre compte jusqu'à 5\u00a0km, et seulement là où l'altitude est à moins de 500\u00a0m de la sienne\u00a0: la pluie de la côte ne monte pas sur le volcan. " +
  "En chaque point, la pluie est la moyenne des pluviomètres proches, chacun compté d'autant plus qu'il est près\u00a0: un pluviomètre sec compte aussi, et tire la zone vers zéro. " +
  "Rien n'est dessiné sur la mer. Le ton dit la force de la pluie, aux seuils de la légende\u00a0: 0,2\u00a0mm, 2\u00a0mm, 8\u00a0mm et 20\u00a0mm dans l'heure. " +
  "Quand la case «\u00a0Radar\u00a0» est cochée, le radar est dessiné devant\u00a0: là où il voit de la pluie, c'est son bleu qui s'affiche. " +
  "C'est pourquoi les zones ne sont pas des ronds\u00a0: le relief les coupe, la mer et le radar les cachent, un voisin sec les rogne, et deux zones proches se rejoignent. " +
  "Les pluviomètres de Météo-France donnent la pluie de l'heure pile. Celle d'une station amateur peut être décalée de 10\u00a0minutes au plus\u00a0: sa pluie de 06:08 à 07:08, par exemple, compte pour 6\u00a0h–7\u00a0h. " +
  "C'est une estimation, qui peut se tromper\u00a0: une averse peut tomber entre deux pluviomètres sans qu'aucun la mesure, la pluie change d'une ravine à l'autre, et un pluviomètre peut tomber en panne. " +
  "La pluie n'est mesurée qu'au pluviomètre ou à la station, et seulement à cet endroit.";
const METEO_FAQ: Faq[] = [
  { q: "Pourquoi la température diffère-t-elle de celle de mon appli ?", a: "Une appli donne souvent une prévision ou une estimation pour votre position. Ici, c'est la mesure d'une station, sous abri, à une heure donnée. Choisissez la station la plus proche et à la même altitude que vous : à La Réunion, quelques centaines de mètres de dénivelé changent beaucoup la température." },
  { q: "Les stations amateur sont-elles fiables ?", a: "Leur fiabilité n'est pas vérifiée par Météo-France. Elles sont donc en option (la case « Stations amateur »), et chacune est marquée. Elles aident à voir ce qui se passe entre les stations officielles." },
  { q: "Il a peu plu ces derniers temps : est-ce normal pour la saison ?", a: `<a href="/historique">La page Historique</a> compare la pluie des 30 derniers jours à la normale 1991-2020 de chaque station de référence.` },
  // How the rose zones of the rain are worked out, and that they can be wrong (the user, 16/11/2026: « une section plus
  // bas dans la page qui explique le modèle de calcul et qu'il peut comporter des erreurs »; the validated words). Their
  // legend leads here: its id is meteo-carte.ts's PLUVIO_ANCRE, written out (read here while that module loads, it would
  // not be there yet; test/meteo-carte.test.ts checks they are the same).
  { q: "Comment sont calculées les zones roses de la pluie\u00a0?", id: "h-zones-roses", a: ZONES_ROSES },
  { q: "Quel temps fera-t-il demain ?", a: `C'est une prévision : voyez la page de votre commune, qui la donne sur 7 jours, à part des mesures. Pour une vigilance, seul le site de Météo-France fait foi.` },
];

export function meteoPage(origin: string, data: Cached<HomeData> | null, now = new Date(), alerte?: Alerte, historique?: HistoriqueAnswer): string {
  const l = withTempAll(data);
  const all = data?.value.toutes ?? [];
  // The page's figure, not a tile's line for a copy with no temperature (`vide`).
  const live = l.length ? meteoLive(data) : undefined;
  const url = `${origin}/meteo`;
  const latest = l.reduce((m, s) => (s.time > m ? s.time : m), "");

  const status = live
    ? `<div class="now"><span class="big span">${enGrand(live.valeur)}</span><p>mesurés sous abri par les stations de l'île, de <b>${esc(shortName(coldest(l).nom))}</b> (${metres(coldest(l).altitude_m)}) à <b>${esc(shortName(warmest(l).nom))}</b>. Dernière mesure <b>${leAt(latest!)}</b>.</p></div>`
    : `<p class="lead">Les mesures se chargent : rechargez la page dans quelques secondes. Les stations Météo-France publient toutes les 6 minutes.</p>`;

  // Its own title in the night band only (a copy made before every station was kept): in the section « La mer au
  // large », its h2 says it, and the light of the night band was white on the white card.
  const sea = (titled: boolean) => data?.value.mer.length
    ? `<figure class="card mapcard">${titled ? `<h3 style="color:var(--on-night)">La mer au large</h3>` : ""}<ul class="bars">` +
      data.value.mer.map((m) => `<li><span>${esc(seaName(m.nom))}</span> <b>${thin(deg(m.valeur))}</b></li>`).join("") +
      `</ul><p class="note">Par satellite, ${esc(lesJours(data.value.mer.map((m) => m.jour)))}. <a href="/mer">Toutes les plages →</a></p></figure>`
    : "";

  const title = "Météo en direct : stations et prévisions · La Réunion (974)";
  const description = live
    ? fit(`Météo à La Réunion (974) en direct : de ${thin(deg(coldest(l).temperature!))} ${a(shortName(coldest(l).nom))} à ${thin(deg(warmest(l).temperature!))} ${a(shortName(warmest(l).nom))}, mesurés ${leAt(latest!)}.`,
        " Pluie, vent, mer et prévisions par commune.")
    : "Météo à La Réunion (974) en direct : température, pluie et vent mesurés par les stations de l'île, mer et prévisions par commune.";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Météo", item: `${origin}/meteo` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Mesures météo en direct à La Réunion (974)",
      description:
        "Température, humidité, vent et pluie mesurés par les stations de La Réunion toutes les 6 minutes, et température " +
        "de surface de la mer par satellite, réunis et datés, accessibles par un serveur MCP pour assistants IA.",
      url: `${origin}/meteo`,
      isAccessibleForFree: true,
      inLanguage: "fr-FR",
      keywords: ["météo", "La Réunion", "974", "en direct", "stations météo", "température de la mer", "pluie", "vent"],
      spatialCoverage: ISLAND,
      variableMeasured: ["température de l'air", "humidité", "vent moyen", "rafales", "pluie", "température de la mer"],
      measurementTechnique: "stations météorologiques au sol, radiomètres satellitaires",
      // The stations' licence; the satellites' data is in the public domain (page /mer).
      license: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
      creator: [
        { "@type": "Organization", name: "Météo-France", url: "https://meteofrance.re/fr" },
        { "@type": "Organization", name: "NOAA", url: "https://www.noaa.gov/" },
      ],
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
    },
  ];

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li aria-current="page">Météo</li></ol></nav></div>
<div class="wrap intro haut">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Mesures en direct</p>
    <h1>Météo à La Réunion <span class="n974">974</span></h1>
    ${status}
    ${ask(`I fé koman lo tan La Rényon astèr ? Gèt bann mézir an dirèk si ${url} é di amwin lèr la mézir.`,
      `Quel temps fait-il en ce moment à La Réunion ? Lis les mesures en direct sur ${url} et donne-moi l'heure des mesures.`)}
  </div>
  ${all.length ? `<div class="wxbox">${stationsMap(all)}</div>${pleinEcran({ boite: ".wxbox", carte: ".wxmap", barre: ".wxbar", panneau: [], legende: ".wxmap>figcaption" })}` : sea(true)}
</div>`;

  const body = all.length ? `<section id="stations" aria-labelledby="h-stations">
  <div class="sec-h"><p class="eyebrow">En direct</p><h2 id="h-stations">Les ${all.filter((s) => !s.amateur).length} stations, de la côte aux sommets</h2>
  <p>La dernière mesure de chaque station, avec son heure ; sans autre date, c'est le ${localTime(now).split(" ")[0]}. Les stations de Météo-France publient toutes les 6 minutes.</p></div>
  ${stationsList(all, now)}
  <p class="sources">Sources : ${credits([...data!.value.sources, ALTITUDES_CREDIT, RADAR_CREDIT])}.</p>
</section>${script(METEO_SCRIPT)}
${cumulsSection()}${script(CUMULS_LOADER)}
${sea(false) ? `<section id="mer" aria-labelledby="h-mer"><div class="sec-h"><p class="eyebrow">La mer</p><h2 id="h-mer">La mer au large</h2></div>${sea(false)}</section>` : ""}
<section id="communes" aria-labelledby="h-communes">
  <div class="sec-h"><p class="eyebrow">Prévisions</p><h2 id="h-communes">Prévision par commune et par lieu</h2>
  <p>Pour chaque commune, les cirques, le volcan et les plages : la mesure de la station qui représente le mieux le lieu (proche, à une altitude voisine, du même versant) et la prévision sur 7 jours, aujourd'hui compris (une <b>prévision</b> de modèle, pas une mesure).</p></div>
  ${placeLinks()}
</section>` : `<section id="en-ce-moment" aria-labelledby="h-live">
  <div class="sec-h"><p class="eyebrow">En direct</p><h2 id="h-live">De la côte aux sommets</h2>
  <p>Les températures, la pluie et le vent mesurés par les stations de l'île, de Saint-Denis au Maïdo, de Cilaos à Saint-Pierre. Toutes les 6 minutes, datés et sourcés.</p></div>
  ${weatherLive(data, now)}
</section>
<section id="communes" aria-labelledby="h-communes">
  <div class="sec-h"><p class="eyebrow">Partout sur l'île</p><h2 id="h-communes">Météo par commune et par lieu</h2>
  <p>La station la plus pertinente, la température de la mer sur la côte et la prévision des prochains jours, pour chaque commune, les cirques, le volcan et les plages.</p></div>
  ${placeLinks()}
</section>
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Votre IA, branchée sur la météo de l'île</h2>
  <p>Avec le connecteur, votre assistant va chercher lui-même la mesure de la station la plus pertinente (outils <code>${coupable("meteo_actuelle")}</code> et <code>${coupable("prevision_meteo")}</code>), avec son heure et sa source. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>`;
  // After the data, on both pages, with stations or without: the block « Records », then « Comment lire cette page » and
  // the questions, which the FAQPage below says.
  return layout(origin, { title, description, path: "/meteo", jsonld: [...jsonld, faqPage(METEO_FAQ)], alerte, iaAside: true }, band, `${body}
${recordsSection(historique)}
${texteStable(meteoLire(), METEO_FAQ)}${all.length ? "" : `\n${WEATHER_NOTES}`}`);
}