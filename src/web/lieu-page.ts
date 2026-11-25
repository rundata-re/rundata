/**
 * The weather page of each commune or famous place (/meteo/<lieu>): the last measure near it, the forecast, the sea on
 * the coast, the UV index, the month's landmarks. The layout shared by every page is in pages.ts.
 */
import { MONTHS } from "../tools/historique.js";
import { porte } from "./aller.js";
import { HAUTS_MIN_M, softened } from "../tools/nuages.js";
import { horizonDe } from "../providers/calendrier.js";
import { NUIT_NOTE, nuitOf } from "../tools/calendrier.js";
import type { Cached } from "../cache.js";
import { ageMinutes, daysApart, localTime, versant } from "../geo.js";
import { a, communeDite, de, enGrand, fourchette, fr } from "../tools/format.js";
import { SOURCE as uvMesureSource, SOURCE_OZONE as uvMesureOzone } from "../providers/uv-mesure.js";
import type { Alerte, Credit, DepuisMinuit, PlaceData, RandonneesAnswer, StationAnswer } from "./data.js";
import { credit, joursDuJour } from "./data.js";
import { enChiffres } from "./en-chiffres.js";
import * as climat from "../providers/climat.js";
import { SOURCE as ONF_SOURCE } from "../providers/sentiers.js";
import * as traces from "../providers/traces.js";
import { cardReason } from "../providers/ensemble.js";
import { CITATION as TIDE_CITATION, LABEL as TIDE_LABEL } from "../maree/calcul.js";
import { farFrom, nextText, tidesNear } from "../tools/maree.js";
import { hikesAround } from "./liens.js";
import { esc, islandMap } from "./map.js";
import { ENCLOS, volcanBanner } from "./volcan-alerte.js";
import { stationOf, stationPath } from "./station.js";
import { coastal, type PlacePage } from "./places.js";
import { bathingBlock } from "./baignade.js";
import { REGLE_COURTE } from "../eau/requin.js";
import * as meteorOi from "../providers/meteor-oi.js";
import { OLD_MINUTES, reseauAmateur, stationKind } from "../tools/meteo.js";
import { enTete } from "../tools/representativeness.js";
import { CONFIANCE_ANCRE } from "./meteo-page.js";
import { adressesCoupables, ask, chip, connector, credits, dayMonth, fit, ISLAND, jourDit, layout, leAt, leJour, METEOR_CREDIT, metres, since, SITE, thin } from "./pages.js";

// What a search engine shows of a title: the tab's title takes the first of its forms that fits.
const TITLE_MAX = 60;

const KIND: Record<string, string> = {
  commune: "commune",
  localite: "village",
  quartier: "quartier",
  plage: "plage",
  sommet: "sommet",
  point_de_vue: "point de vue",
  bassin: "bassin",
  port: "port",
};

const LABELS: Record<string, string> = {
  humidite: "Humidité",
  vent_moyen: "Vent moyen",
  vent_direction: "Vent venant du",
  rafales: "Rafales",
  pluie_6min: "Pluie (6 dernières min)",
  pluie_1h: "Pluie (dernière heure)",
  ciel: "Ciel",
  temps_present: "Temps",
  visibilite: "Visibilité",
};

// Distance and altitude under a station's name, never its « pertinence » (bonne, moyenne, faible), a word of the tools'
// answers that says nothing to a visitor; a station far off or on another side keeps its warning below (avertissements).
function stationCard(s: StationAnswer): string {
  const m = s.mesures;
  const main = m.temperature ?? m.vent_moyen;
  const rows = Object.entries(m)
    .filter(([k]) => k !== "temperature" && k !== "point_de_rosee" && k !== "pression_mer")
    .map(([k, v]) => `<li>${esc(LABELS[k] ?? k.replace(/_/g, " "))} : ${esc(thin(v.replace(/ \(d'où vient le vent\)| en (6 min|1 h)$/g, "")))}</li>`)
    .join("");
  const t = parseFloat((m.temperature ?? "").replace(",", "."));
  const meta = [
    // What the station is, as the tools say it; an amateur one's is in its card's title.
    s.amateur ? undefined : stationKind(s.source),
    communeDite(s, ""),
    s.distance_km != null ? `à ${fr(s.distance_km)} km${s.direction ? ` (${s.direction})` : ""}` : undefined,
    `${s.altitude_m.toLocaleString("fr-FR")} m d'altitude`,
  ].filter(Boolean).join(" · ");
  return `<div class="card stcard"><h3>${esc(s.station)}</h3><p class="note">${esc(thin(meta))}</p>` +
    (main ? `<p><span class="t" style="background:${Number.isFinite(t) ? chip(t) : "#44555a"}">${esc(thin(main))}</span></p>` : "") +
    (rows ? `<ul>${rows}</ul>` : "") +
    `<p class="note">Mesuré ${esc(leJour(s.heure_mesure))}, heure de La Réunion.</p>` +
    (s.avertissements.length ? `<p class="note">⚠ ${esc(s.avertissements.join(" "))}</p>` : "") +
    `</div>`;
}

/**
 * The nearest amateur station, when the answer gives one after the others (tools/meteo.ts): folded, its reliability
 * said not checked in its title (wording validated on 10/11/2026), its credit under its measures.
 */
function amateurCard(s: StationAnswer): string {
  const at = s.distance_km != null ? `, à ${fr(s.distance_km)}\u00a0km` : "";
  const credit = s.source === meteorOi.SOURCE.id ? METEOR_CREDIT : esc(s.credit ?? "");
  return `<details class="pli amdet"><summary><h3>${esc(`Station amateur la plus proche${at} (${reseauAmateur(s.source) ?? ""})\u00a0: fiabilité non vérifiée`)}</h3></summary>` +
    `${stationCard(s)}<p class="cr">${credit}</p></details>`;
}

/** The max and min since midnight at a Météo-France station, under the measures of now. */
export function sinceMidnightCard(j: DepuisMinuit): string {
  const row = (label: string, x: DepuisMinuit["maximum"]) =>
    `<li><span>${label}</span> <span class="v"><span class="t" style="background:${chip(x.valeur)}">${esc(thin(`${fr(x.valeur)} ${x.unite}`))}</span> <span class="q">${esc(thin(x.quand))}</span></span></li>`;
  return `<div class="card stcard minuit"><h3>Depuis minuit ${esc(a(j.station))}</h3>` +
    `<p class="note">${esc(thin(`à ${fr(j.distance_km)} km · ${j.periode}`))}</p>` +
    `<ul>${row("Au plus", j.maximum)}${row("Au moins", j.minimum)}</ul>` +
    `<p class="note">Relevés heure par heure de Météo-France : le plus haut et le plus bas de chaque heure, puis les mesures toutes les 6 minutes de l'heure en cours.</p>` +
    (j.avertissements.length ? `<p class="note">⚠ ${esc(j.avertissements.join(" "))}</p>` : "") +
    `</div>`;
}

/**
 * « Repères : station …, à … km » (wording validated on 14/11/2026, its records' sentence 19/11/2026): this month's normals and records
 * at the station of the copy (tools/historique.ts, reperesMois), none written by hand. Left out without them, and when
 * the copy was built in another month than the view's. Without a record, the records' line; without a first year, its
 * last sentence.
 */
export function reperesBlock(r: PlaceData["reperes"], now: Date): string {
  if (!r || r.mois !== +localTime(now).slice(3, 5) - 1) return "";
  const mois = MONTHS[r.mois];
  const deg = (n: number) => `${fr(n)}\u00a0°C`;
  const records = [
    r.chaleur && `Record de chaleur en ${mois}\u00a0: ${deg(r.chaleur.valeur)} (${r.chaleur.annee}).`,
    r.pluie && `Record de pluie en un jour en ${mois}\u00a0: ${fr(r.pluie.valeur)}\u00a0mm (${r.pluie.annee}).`,
  ].filter(Boolean);
  if (records.length && r.depuis) records.push(`Relevés depuis ${r.depuis}.`);
  const lien = stationOf(r.poste) ? `<p><a href="${stationPath(r.poste)}">Tout l'historique de la station →</a></p>` : "";
  return `<section id="reperes" aria-labelledby="h-reperes"><h2 id="h-reperes">Repères\u00a0: station ${esc(r.station)}, à ${fr(r.distance_km)}\u00a0km</h2>
<div class="card"><p>En ${mois}, la normale est de ${deg(r.normale.tx)} pour la maximale et ${deg(r.normale.tn)} pour la minimale, avec ${fr(r.normale.rr)}\u00a0mm de pluie sur le mois (normales ${esc(r.periode)} de Météo-France).</p>
${records.length ? `<p>${records.join(" ")}</p>` : ""}${lien}</div></section>`;
}

export function placePage(origin: string, p: PlacePage, data: Cached<PlaceData> | null, now = new Date(), alerte?: Alerte, hikes?: Cached<RandonneesAnswer> | null): string {
  const g = porte(alerte);
  const place = p.place;
  const d = data?.value;
  // The answer's first two are never at the same spot (meteo.ts, sameSpot); an amateur station apart, folded.
  const stations = (d?.meteo?.stations ?? []).filter((s) => !s.amateur).slice(0, 2);
  const complement = d?.meteo?.stations.find((s) => s.amateur);
  const first = enTete(d?.meteo?.stations);
  const kind = p.precision ?? KIND[place.type] ?? place.type;
  const where = place.nom !== p.nom ? ` Les mesures et la prévision sont données pour ${esc(place.nom)}.` : "";
  const alt = place.altitude_m != null ? `, à ${place.altitude_m.toLocaleString("fr-FR")} m d'altitude` : "";
  const commune = place.commune && place.commune !== p.nom ? ` (commune ${esc(de(place.commune))})` : "";
  const v = versant(place.lon, place.lat);
  const title = [`Météo ${p.nom} en direct et prévisions · La Réunion (974)`, `Météo ${p.nom} en direct · La Réunion (974)`]
    .find((t) => t.length <= TITLE_MAX) ?? `Météo ${p.nom} en direct · 974`;
  const description = fit(
    first
      ? `Météo ${a(p.nom)} (La Réunion, 974) en direct : ${first.mesures.temperature} mesurés ${a(first.station)} ` +
        `${leJour(first.heure_mesure)}.`
      : `Météo ${a(p.nom)} (La Réunion, 974) en direct : température, pluie et vent mesurés par la station la plus proche.`,
    first ? ` Pluie, vent${coastal(p) ? ", mer" : ""} et prévision.` : ` ${coastal(p) ? "Mer et prévision" : "Prévision"} des prochains jours.`,
  );

  // The figure's measure older than OLD_MINUTES at this view, not at the copy's build (a copy given at once to a visitor
  // after a quiet hour, kept up to a day; a source that does not answer): a neutral note above it, as /electricite's.
  // Its day and time, no « il y a » that a copy kept by a search engine would make false an hour later.
  const figureAt = first && data ? new Date(data.fetchedAt.getTime() - first.age_min * 60_000) : undefined;
  const perimee = figureAt && ageMinutes(figureAt, now) > OLD_MINUTES
    ? `<p class="note">${esc(`Dernière mesure lue à la station ${first!.station} : ${leJour(first!.heure_mesure)}. Ce n'est pas le temps qu'il fait maintenant.`)}</p>`
    : "";
  const headline = first
    ? `${perimee}<div class="now"><span class="big">${enGrand(esc(thin(first.mesures.temperature!)))}</span>` +
      `<p>mesurés <b>${esc(leJour(first.heure_mesure))}</b> par la station <b>${esc(first.station)}</b>${communeDite(first, place.commune || p.nom) ? ` ${esc(a(communeDite(first, place.commune || p.nom)!))}` : ""} ` +
      `(${esc(stationKind(first.source))}, ${metres(first.altitude_m)} d'altitude${first.distance_km != null ? `, à ${fr(first.distance_km)} km` : ""}).</p></div>`
    : "";

  // Only from a copy made today: after midnight, yesterday's would pass for today's.
  const jour = data && daysApart(data.fetchedAt, now) === 0 ? d?.meteo?.temperature_depuis_minuit : undefined;
  const measured = !data
    ? `<p class="card">Les mesures se chargent : rechargez la page dans quelques secondes.</p>`
    : stations.length
      ? `<div class="two">${stations.map(stationCard).join("")}</div>` + (complement ? amateurCard(complement) : "") + (jour ? sinceMidnightCard(jour) : "") +
        `<p class="note">Mis à jour ${leAt(data.fetchedAt)} (${since(data.fetchedAt, now)}).</p>`
      : `<p class="card">Aucune mesure disponible pour le moment.</p>`;

  // In the Hauts, the coming morning's cloud sea, high on the page: « dégagé au Maïdo demain matin ? ». Said less firmly
  // while the nearest station measures the air saturated now.
  const near = stations.find((s) => s.mesures.humidite);
  const wet = near && data ? { nom: near.station, humidite: parseInt(near.mesures.humidite!, 10), mesure: new Date(data.fetchedAt.getTime() - near.age_min * 60_000) } : undefined;
  const mn = d?.prevision?.mer_de_nuages && softened(d.prevision.mer_de_nuages, now, wet);
  // The volcano's page during an alert: the Enclos below the viewpoint is forbidden, whatever the sky.
  const enclos = p.slug === "piton-de-la-fournaise" && volcanBanner() ? ` ${ENCLOS}` : "";
  const cloudSea = mn
    ? `<section id="mer-de-nuages" class="card" aria-labelledby="h-nuages"><h3 id="h-nuages">${esc(mn.titre)}</h3><p>${esc(mn.ligne + enclos)}</p>` +
      `<p class="note">${esc(mn.prevision.charAt(0).toUpperCase() + mn.prevision.slice(1))}. ${esc(mn.mise_en_garde)}</p></section>`
    : "";

  // In the Hauts, the sky of the night: the forecast's, from the copy, only while it speaks of the night of the view (the
  // evening of before 6 h is yesterday's), and the dark night and the Moon computed at the view. Without the forecast,
  // no card: the computed lines alone would not say whether the stars will show. Its title says the evening's day: a
  // copy kept by a search engine would give « ce soir » for another evening (06/11/2026).
  const evening = (t: Date) => new Date(t.getTime() - 2 * 3600_000).toISOString().slice(0, 10);
  const cn = d?.prevision?.ciel_de_nuit;
  const nightCard = cn && data && (place.altitude_m ?? 0) >= HAUTS_MIN_M && evening(data.fetchedAt) === evening(now)
    ? (() => {
        const n = nuitOf(evening(now), place.lon, place.lat, horizonDe(place));
        const h = new Date(now.getTime() + 4 * 3600_000).getUTCHours();
        return `<section id="ciel-cette-nuit" class="card" aria-labelledby="h-ciel"><h3 id="h-ciel">${h >= 21 || h < 6 ? "Ciel cette nuit" : "Ciel ce soir et cette nuit"}, ${jourDit(new Date(now.getTime() - 6 * 3600_000))}</h3>` +
          `<p>${esc(cn.ligne)}</p><p>${esc(n.nuit_noire)}</p><p>${esc(n.lune)}</p>` +
          `<p class="note">Ciel\u00a0: ${esc(cn.prevision)}. ${esc(cn.mise_en_garde)} ${esc(NUIT_NOTE)}</p></section>`;
      })()
    : "";

  // The next tides at the nearest gauge, computed at the view: no request, whatever the copy's age.
  const tides = coastal(p) ? tidesNear(p.place.lon, p.place.lat, now) : undefined;
  // Away from the gauges, no times: they are not the place's.
  const away = coastal(p) && !tides ? farFrom(p.place.lon, p.place.lat, p.place.commune) : undefined;
  const tideLine = tides
    ? `<p>Marée ${esc(a(tides.nom))}, ${esc(TIDE_LABEL)}, à environ ${tides.minutes} min près : ${esc(thin(nextText(tides.next)))}.</p>`
    : away
      ? `<p>Marée : pas d'heures calculées ici, la marée y arrive à une autre heure qu'au Port et à Sainte-Marie, les deux marégraphes lus par rundata.re. ` +
        `<a href="${esc(away.lien)}">${away.port ? `Horaires officiels du SHOM pour ${esc(away.port)}` : "Horaires officiels sur le site du SHOM"}</a></p>`
      : "";
  const sea = coastal(p) && d?.mer
    ? `<section aria-labelledby="h-mer"><h2 id="h-mer">Température de la mer ${esc(a(p.nom))}</h2>` +
      `<div class="card">${d.mer.mesure ? `<ul class="seas"><li><span>Au large, le ${esc(dayMonth(d.mer.mesure.jour_mesure))}</span> <b>${esc(thin(d.mer.mesure.temperature_eau))}</b></li></ul>` : ""}` +
      // The swimming rule of the tool's résumé said once, in the « Baignade et requins » block below.
      `<p>${esc(thin(d.mer.resume.replace(` ${REGLE_COURTE}`, "")))}</p>${tideLine}<p class="note">Température : mesure satellite au large, du jour indiqué (une mesure paraît au plus tôt le lendemain), ` +
      `pas celle du lagon ni du bord.${d.mer.houle_mesuree ? ` Houle mesurée : la bouée ${esc(d.mer.houle_mesuree.bouee)} du Cerema, au large, à l'heure dite.` : ""}${d.mer.etat_de_la_mer ? " Vagues : prévision d'un modèle, au large, pas une mesure." : ""}${tides ? ` Marée : calculée d'après les mesures des marégraphes, hauteurs à environ 5 cm près, <a href="/mer">détail sur la page mer</a>.` : ""}</p></div></section>`
    : "";

  const f = d?.prevision && { ...d.prevision, jours: joursDuJour(d.prevision.jours, data!.fetchedAt, now) };
  // Why a day is not sure, in plain sight and short (a phone shows no title, a card is half its width). A sure day
  // says nothing more.
  const whyNot = (why?: string) => {
    const short = why && cardReason(why);
    return short ? `<p class="why">${esc(short)}</p>` : "";
  };
  // What the confidence says is said once, on /meteo (« Comment lire cette page »): here, a line and its link
  // (wording validated on 14/11/2026: the same 90 words on every place page).
  const confidenceNote = f?.jours?.some((j) => j.confiance);
  const range = (lo?: string, hi?: string) => (lo && hi ? fourchette(lo.replace(/ °C$/, "°"), hi.replace(/ °C$/, "°"), " / ") : "—");
  const forecast = f?.jours?.length
    ? `<section aria-labelledby="h-prev"><div class="hb"><h2 id="h-prev">Prévision météo ${esc(p.nom)}</h2><span class="badge">Prévision, pas une mesure</span></div>` +
      `<ul class="days">` +
      f.jours.map((j) => `<li class="card day"><h3>${esc(j.jour)}</h3>${j.periode ? `<p>${esc(j.periode)}</p>` : ""}<p class="range">${esc(range(j.temperature_min, j.temperature_max))}</p>` +
        `<p>${esc(j.ciel_en_journee ?? "—")}</p><p>Pluie : ${esc(thin(j.pluie ?? "—"))}</p><p>Rafales : ${esc(thin(j.rafales_max ?? "—"))}</p>` +
        (j.indice_uv_max ? `<p>UV : ${esc(j.indice_uv_max)}</p>` : "") +
        (j.confiance ? `<p>Confiance : <b>${esc(j.confiance)}</b></p>` + whyNot(j.confiance_pourquoi) : "") + `</li>`).join("") +
      `</ul>` +
      (confidenceNote ? `<p class="note">Plus l'échéance est lointaine, moins la prévision est sûre\u00a0: <a href="/meteo#${CONFIANCE_ANCRE}">comment rundata.re l'indique →</a></p>` : "") +
      `<p class="note">${esc(f.modele ? `Modèle ${f.modele.nom}, maille de ${fr(f.modele.maille_km)} km${f.modele.run_du_modele ? `, calcul du ${f.modele.run_du_modele.replace(" ", " à ")}` : ""}. ` : "")}` +
      `Un modèle ne voit pas tous les microclimats de l'île. Cyclone, fortes pluies : seule compte la vigilance de <a href="https://meteofrance.re/fr">Météo-France La Réunion</a>.</p></section>`
    : "";

  // The page's sources, said once at its end (sourcesLast), the sources of one licence together (credits): the
  // measures', the sea's and the forecast's were each written under their block, with the same licences, the same on
  // every place's page, and the footer then carried the credits of the whole site. Each block shown names its own: the
  // month's normals and records, the hikes' traces, and the ONF for the state of each hike, said only with the
  // hikers' copy. The tide's citation, in the SHOM's words, last.
  const reperes = reperesBlock(d?.reperes, now);
  const around = hikesAround(p, hikes);
  const said: Credit[] = [
    ...(stations.length ? d!.meteo!.sources : []),
    ...(sea ? d!.mer!.sources : []),
    ...(forecast ? f!.sources : []),
    ...(reperes ? [credit(climat.SOURCE)] : []),
    ...(around.includes('<ul class="rows eau">') ? [credit(traces.SOURCES.osm), credit(traces.SOURCES.ign), ...(hikes ? [credit(ONF_SOURCE)] : [])] : []),
  ];
  const cite = sea && tides ? adressesCoupables(TIDE_CITATION) : "";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Météo", item: `${origin}/meteo` },
        { "@type": "ListItem", position: 3, name: `Météo ${p.nom}`, item: `${origin}/meteo/${p.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      inLanguage: "fr-FR",
      url: `${origin}/meteo/${p.slug}`,
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
      about: {
        "@type": "Place",
        name: `${p.nom} (La Réunion, 974)`,
        geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lon, ...(place.altitude_m != null ? { elevation: place.altitude_m } : {}) },
        containedInPlace: ISLAND,
      },
    },
  ];

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li><a href="/meteo">Météo</a></li><li aria-current="page">${esc(p.nom)}</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Météo en direct</p>
    <h1>Météo ${esc(a(p.nom))} <span class="n974">974</span></h1>
    ${headline}
    ${ask(`I fé koman lo tan ${p.nom} astèr ? Gèt la mézir an dirèk si ${origin}/meteo/${p.slug} é di amwin lèr la mézir é la stasion.`,
      `Quel temps fait-il en ce moment ${a(p.nom)} ? Lis la mesure en direct sur ${origin}/meteo/${p.slug} et donne-moi l'heure de la mesure et la station.`)}
    <p class="lead">${esc(p.nom)}, ${esc(kind)}${commune}${alt}, ${esc(v.replace(/ \(.*\)$/, ""))} de l'île${v.includes("(") ? ` (${esc(v.replace(/^.*\(|\)$/g, ""))})` : ""}.${where}</p>
    ${p.commune ? `<p class="or"><a href="/communes/${p.slug}">${esc(p.nom)} en direct : vigilance, air, bus, mairie →</a></p>` : ""}
  </div>
  <figure class="card mapcard">${islandMap({ highlight: p.commune ? p.nom : place.commune, pin: { lon: place.lon, lat: place.lat, name: p.nom }, label: `Carte de La Réunion (974) situant ${p.nom}` })}</figure>
</div>`;

  // The UV index MEASURED at Moufia, near it: the tool's words (prevision_meteo), never the forecast's card. « mesuré » in
  // small letters on the page, its label « Mesure » saying it, as for the waves measured (wording validated on 23/11/2026).
  const uvm = d?.prevision?.indice_uv_mesure;
  const uvMeasured = uvm
    ? `<section aria-labelledby="h-uv"><div class="hb"><h2 id="h-uv">L'indice UV mesuré au Moufia</h2><span class="badge m">Mesure</span></div>` +
      `<div class="card"><p>${esc(uvm.resume.replace("UV MESURÉ", "UV mesuré"))}</p><p class="note">${esc(uvm.incertitude)} Source\u00a0: ${esc(uvm.citation).replace(esc(uvm.lien), `<a href="${esc(uvm.lien)}" rel="noopener">${esc(uvm.lien)}</a>`)}` +
      `${uvm.citation.includes(uvMesureSource.licence) ? "" : ` Licence ${esc(uvMesureSource.licence)}.`} Ozone\u00a0: ${esc(uvMesureOzone.attribution)}.</p></div></section>`
    : "";

  // « Dernière mesure », never « en ce moment » above the values: a copy kept by a search engine says it still, beside
  // the measure of another evening, which an AI gave as the weather of now (06/11/2026). Each card says its day and time.
  const body = `${data ? enChiffres(d?.chiffres, p.nom, p.slug) : ""}
<section aria-labelledby="h-now">
  <div class="hb"><h2 id="h-now">Dernière mesure près ${esc(de(p.nom))}</h2><span class="badge m">Mesure</span></div>
  ${measured}
</section>
${uvMeasured}
${cloudSea}
${nightCard}
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Votre IA, branchée sur la météo ${esc(de(p.nom))}</h2>
  <p>Branchez le connecteur une fois sur ChatGPT, Claude ou Le Chat : à chaque « il pleut ${esc(a(p.nom))} ? », il ira chercher lui-même la mesure, avec son heure et sa source. Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>
${sea}
${coastal(p) ? bathingBlock(now, { nom: p.nom, lon: p.place.lon, lat: p.place.lat, commune: p.commune ? p.nom : undefined }, g) + g.feuille : ""}
${forecast}
${reperes}
${around}
<p class="or"><a href="/meteo#communes">Météo ailleurs à La Réunion →</a></p>${said.length || cite ? `
<p class="sources">Sources : ${[credits(said), cite].filter(Boolean).join(" ; ")}.</p>` : ""}`;
  return layout(origin, { title, description, path: `/meteo/${p.slug}`, jsonld, alerte, iaAside: true }, band, g.ligne + body);
}
