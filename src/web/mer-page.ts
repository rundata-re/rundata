/**
 * /mer, the sea around the island: the water's temperature at each beach, the swell measured and forecast, the tides,
 * the bathing water, the risk of coral bleaching and the whales' season. The page of each commune or famous place, the
 * vigilance and the layout shared by every page are in pages.ts.
 */
import { courbesSection } from "./mer-courbes.js";
import { porte } from "./aller.js";
import { resolvePlace } from "../places/resolve.js";
import type { Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { a, enGrand, fourchette, fr } from "../tools/format.js";
import * as candhis from "../providers/candhis.js";
import type { Alerte, SeaData } from "./data.js";
import { GAUGES } from "../providers/maregraphes.js";
import * as coraux from "../providers/coraux.js";
import * as cetaces from "../tools/cetaces.js";
import { CITATION as TIDE_CITATION, LABEL as TIDE_LABEL } from "../maree/calcul.js";
import { NEAR_KM, shomPort, tidesAt } from "../tools/maree.js";
import { esc, islandMap, type Marker } from "./map.js";
import { legende } from "./carte-legende.js";
import { slugify } from "./places.js";
import { bathingBlock, ruleTop } from "./baignade.js";
import { coupable } from "./domains.js";
import { adressesCoupables, anchorId, ask, chip, connector, credits, dayMonth, deg, DESCRIPTION_MAX, icon, ISLAND, jourDe, layout, leAt, leJour, lesJours, seaName, SITE, thin } from "./pages.js";

const CROWDED = new Set(["Plage de la Saline les Bains", "Plage de Saint-Paul"]);

/**
 * The risk of coral bleaching at the three points of NOAA's grid, in the validated words: the level in words with a scale
 * of 0 to 7 in night blue (the level's cell full), never NOAA's yellow, orange and red, and what the level is (the
 * highest of the last 7 days, or of the days the source has). A point without a level had none on any of those days, so it
 * says so of « ces jours », never of one day.
 */
export function reefSection(c: Cached<coraux.Coraux> | null): string {
  const head = `<div class="sec-h"><p class="eyebrow">Indice satellite, selon NOAA</p><h2 id="h-coraux">${esc(coraux.TITRE)}</h2>`;
  if (!c) return `<section aria-labelledby="h-coraux">${head}<p>La grille de NOAA Coral Reef Watch n'a pas pu être lue pour le moment.</p></div></section>`;
  const points = c.value.points.map((p) => `<li><span class="lieu">${esc(p.nom.charAt(0).toUpperCase() + p.nom.slice(1))}</span> ` +
    (p.niveau != null
      ? `<b>${esc(coraux.NIVEAUX[p.niveau])}</b> <span>selon NOAA</span> ` +
        `<span class="echelle" role="img" aria-label="niveau ${p.niveau} sur une échelle de 0 à 7">${coraux.NIVEAUX.map((_, i) => i).map((i) => `<i${i === p.niveau ? ' class="on"' : ""}></i>`).join("")}</span>`
      : "<b>—</b> <span>pas de niveau sur ces jours</span>") +
    (p.dhw != null ? `<span>Chaleur accumulée sur 12 semaines\u00a0: ${esc(coraux.chaleur(p.dhw))}</span>` : "") +
    (p.sst != null ? `<span>Mer à ${esc(thin(deg(p.sst)))}, par satellite</span>` : "") +
    `</li>`).join("");
  return `<section aria-labelledby="h-coraux">${head}
  <p>${esc(coraux.nature(c.value.jour))} ${esc(coraux.PAS_OBSERVATION)}</p></div>
  <div class="card"><ul class="reefs">${points}</ul>
  <p class="note">Niveau\u00a0: ${esc(coraux.niveauSur(c.value.jours))}.</p>
  <p class="note">${esc(coraux.AIDE_CHALEUR)}</p>
  <p class="note">${esc(coraux.CASE)}${c.stale ? " Dernière valeur gardée\u00a0: le serveur de NOAA ne répond pas pour le moment." : ""}</p>
  <p class="sources">Source\u00a0: ${esc(coraux.CREDIT)}.</p></div>
</section>`;
}

/**
 * The rules of approach of whales and dolphins, from the decrees in the code (tools/cetaces.ts), in the validated words:
 * the day's state (the humpback whales' period of rules or not), then the twelve rules with their articles. Computed
 * at each view, nothing read.
 */
export function whaleSection(now: Date): string {
  const rows = cetaces.REGLES.map((r) => `<tr><td data-label="Règle">${esc(r.regle)}</td><td data-label="Texte">${esc(r.article.charAt(0).toUpperCase() + r.article.slice(1))}</td></tr>`).join("");
  const links = cetaces.LIENS.map((l) => `<a href="${esc(l.pdf)}">${esc(l.texte)}</a> (<a href="${esc(l.page)}">sa page</a>)`).join("\u00a0; ");
  return `<section aria-labelledby="h-cetaces">
  <div class="sec-h"><p class="eyebrow">${esc(cetaces.T.surtitre)}</p><h2 id="h-cetaces">${esc(cetaces.T.titre)}</h2>
  <p>${esc(cetaces.etatDuJour(now))} ${esc(cetaces.T.presence)}</p></div>
  <div class="card"><table class="drought niveaux"><caption class="sr">${esc(cetaces.T.titre)}</caption><thead><tr><th scope="col">Règle</th><th scope="col">Texte</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note">${esc(cetaces.T.foi)} ${links}.</p>
  <p class="sources">Source\u00a0: ${esc(cetaces.T.source)}.</p></div>
</section>`;
}

/**
 * What the beaches' figures are, under the map: the satellite's pass, an instant, said as the tool temperature_mer says
 * it (« un instant, pas la moyenne de la journée »), or the day's mean; both when the beaches have some of each. The
 * caption said « moyenne de chaque jour » over passes (20/11/2026).
 */
export function seaMeasure(seen: { jour?: string; heure?: string }[]): string {
  const passes = [...new Set(seen.filter((b) => b.heure).map((b) => b.heure!))].sort();
  const means = seen.filter((b) => !b.heure);
  const when = (iso: string) => localTime(new Date(iso)).replace(" ", " à ");
  const parts = [
    ...(passes.length ? [`passage du satellite ${passes.map((h) => `le ${when(h)}`).join(" et ")}, un instant et pas la moyenne de la journée${means.length ? ` (${seen.length - means.length} plage${seen.length - means.length > 1 ? "s" : ""})` : ""}`] : []),
    ...(means.length ? [`${new Set(means.map((b) => b.jour)).size > 1 ? `moyenne de chaque jour, ${lesJours(means.map((b) => b.jour!))}` : `moyenne du ${dayMonth(means[0].jour!)}`}${passes.length ? ` (${means.length} plage${means.length > 1 ? "s" : ""})` : ""}`] : []),
  ];
  return `Mesure par satellite (NOAA CoastWatch et NASA), ${parts.join("\u00a0; ")}.`;
}

export function seaPage(origin: string, data: Cached<SeaData> | null, now = new Date(), alerte?: Alerte, reef?: Cached<coraux.Coraux> | null): string {
  const g = porte(alerte);
  const d = data?.value;
  const seen = d?.plages.filter((b) => b.valeur != null) ?? [];
  const day = seen.map((b) => b.jour!).sort().pop();
  const warm = seen.length ? seen.reduce((a, b) => (b.valeur! > a.valeur! ? b : a)) : undefined;
  const cool = seen.length ? seen.reduce((a, b) => (b.valeur! < a.valeur! ? b : a)) : undefined;
  const url = `${origin}/mer`;
  // Not every beach of the west coast: their markers would sit on one another.
  const markers: Marker[] = seen.filter((b) => !CROWDED.has(b.nom)).map((b) => ({ lon: b.lon, lat: b.lat, label: `${Math.round(b.valeur!)}°`, say: `eau à ${Math.round(b.valeur!)} °C`, name: seaName(b.nom), color: chip(b.valeur!), round: true, href: `#${anchorId("p", b.nom)}` }));

  const status = warm && cool
    ? `<div class="now"><span class="big span">${enGrand(esc(thin(`${fourchette(fr(Math.round(cool.valeur! * 10) / 10), fr(Math.round(warm.valeur! * 10) / 10))} °C`)))}</span>` +
      `<p>Température de surface de la mer autour de l'île, mesurée par satellite <b>${esc(lesJours(seen.map((b) => b.jour!)))}</b>. ` +
      `Plus chaude à <b>${esc(seaName(warm.nom))}</b>, plus fraîche à <b>${esc(seaName(cool.nom))}</b>.</p></div>`
    : `<p class="lead">Les mesures satellite se chargent : rechargez la page dans quelques secondes.</p>`;

  const list = d
    ? `<ul class="seas">${d.plages.map((b) => `<li class="tgt" id="${anchorId("p", b.nom)}"><span>${esc(seaName(b.nom))}</span>` +
        (b.valeur != null
          ? `<b>${esc(thin(deg(b.valeur)))}</b> <span>le ${esc(dayMonth(b.jour!))}${b.heure ? ` à ${esc(localTime(new Date(b.heure)).split(" ")[1])}` : ""}, à ${esc(fr(b.distance_km!))} km</span>`
          : `<b>—</b> <span>pas de mesure (nuages)</span>`) +
        // « Y aller » to a beach, not to the centre of a town listed for its coast (Saint-Denis, Le Port…).
        `<a href="/meteo/${slugify(b.commune)}">Météo ${esc(b.commune)} →</a>${resolvePlace(b.nom)?.lieu.type === "commune" ? "" : g.aller({ nom: seaName(b.nom), lat: b.lat, lon: b.lon }, "baignade")}</li>`).join("")}</ul>` +
      `<p class="note">Mis à jour ${leAt(data!.fetchedAt)}.</p><p class="sources">Sources : ${credits(d.sources)}.</p>`
    : `<p class="card">Les mesures satellite se chargent : rechargez la page dans quelques secondes.</p>`;

  // The buoys' measurements, while recent at the view (providers/candhis.ts): a measurement, never mixed with the forecast.
  // Its producer said under it, in a note: a « sources » paragraph is moved to the page's end (sourcesLast).
  const buoys = (d?.bouees ?? []).filter((b) => now.getTime() - b.t <= candhis.MESURE_MAX_HOURS * 3600_000);
  const measuredSwell = buoys.length
    ? `<section aria-labelledby="h-houle-mesuree">
  <div class="sec-h"><p class="eyebrow">Mesure, pas une prévision</p><h2 id="h-houle-mesuree">La houle mesurée au large</h2>
  <p>La dernière demi-heure mesurée par ${buoys.length > 1 ? "les bouées" : "la bouée"} du réseau Candhis du Cerema : la hauteur significative (celle du tiers des plus hautes vagues), la vague la plus haute, la période, la direction d'où viennent les vagues et la température de la mer à la bouée. Au large, avant le récif : dans le lagon, les vagues sont bien plus petites.</p></div>
  <div class="card"><ul class="seas">${buoys.map((b) => {
      const [jour, h] = b.mesuree_a.split(" ");
      const what = [b.venant, b.periode && `période ${b.periode}`, b.vague_max && `vagues jusqu'à ${b.vague_max}`].filter(Boolean).join(", ");
      return `<li><span>${esc(b.bouee)}</span> <b>${b.hauteur_significative ? esc(thin(b.hauteur_significative)) : "—"}</b> <span>${esc(thin(what))}</span>` +
        ` <span>mesurée le ${esc(jour)} à ${esc(h)}${b.temperature_eau ? `, mer à ${esc(thin(b.temperature_eau))}` : ""}</span></li>`;
    }).join("")}</ul>
  <p class="note">Source\u00a0: ${esc(candhis.SOURCE.attribution)} (${esc(candhis.SOURCE.licence)}).</p></div>
</section>`
    : "";

  const waves = d?.plages.filter((b) => b.houle) ?? [];
  const top = waves.length ? waves.reduce((a, b) => (b.houle!.hauteur_m > a.houle!.hauteur_m ? b : a)) : undefined;
  const swell = waves.length
    ? `<section aria-labelledby="h-houle">
  <div class="sec-h"><p class="eyebrow">Prévision, pas une mesure</p><h2 id="h-houle">La houle prévue près de chaque plage</h2>
  <p>Hauteur, direction et période des vagues au large, pour les 3 heures en cours, puis la plus haute des 4 jours, d'après deux modèles de vagues : celui de Météo-France (MFWAM, maille d'environ 9 km), qui distingue la houle principale du reste de la mer, à l'ouest et au sud\u00a0; celui du Centre européen (ECMWF, maille de 9 km) au nord et à l'est, où le premier n'a pas de point près de la côte. Dans le lagon et derrière le récif, les vagues sont bien plus petites. Pour la sécurité : <a href="/vigilance">la vigilance vagues-submersion</a>, les drapeaux et les maîtres-nageurs.</p></div>
  <div class="card"><ul class="seas">${waves.map((b) => `<li><span>${esc(seaName(b.nom))}</span>` +
      ` <b>${esc(thin(`${fr(b.houle!.hauteur_m)} m`))}</b> <span>${esc(b.houle!.maintenant.replace(/^\S+ m /, ""))}, vers ${esc(b.houle!.heure)}</span>` +
      ` <span>jusqu'à ${esc(thin(b.houle!.max))} ${esc(b.houle!.max_jour)}</span></li>`).join("")}</ul></div>
</section>`
    : "";

  // The next tides: computed at the view, from the constants of the package, whatever the copy's age.
  const computed = GAUGES.map((g) => tidesAt(g, now, d?.maree ?? [], data?.fetchedAt)).filter((x) => !!x);
  const coming = computed.length
    ? `<h3>Les prochaines marées : un calcul, pas la prédiction du SHOM</h3>
  <ul class="seas">${computed.map((x) => `<li><span>${esc(x.nom)}</span> ` +
      x.next.liste.map((e, i) => (i === 0 ? `<b>${esc(e.type)} ${esc(e.heure)}</b> <span>${esc(thin(`${fr(e.hauteur_m)} m`))}${"note" in e ? ", marée faible : heure plus incertaine" : ""}</span>` : ` <span>${esc(e.type)} ${esc(e.heure)} (${esc(thin(`${fr(e.hauteur_m)} m`))}${"note" in e ? ", marée faible : heure plus incertaine" : ""})</span>`)).join("") +
      `</li>`).join("")}</ul>
  <p class="note">${esc(TIDE_LABEL.replace(/^c/, "C"))} : analyse harmonique de plusieurs années de mesures de ces deux marégraphes ; heures à environ ${computed.map((x) => `${x.minutes} min près ${a(x.gauge.commune)}`).join(", ")}, hauteurs à environ 5 cm près ; pas de coefficient. La marée est faible à La Réunion (20 à 80 cm) : utile pour le lagon, la pêche à pied ou la mise à l'eau, pas pour la navigation. ${adressesCoupables(TIDE_CITATION)}</p>
  <p class="note">Ces heures valent près des deux marégraphes, à ${NEAR_KM} km au plus. Plus loin sur la côte, la marée arrive à une autre heure : horaires officiels du SHOM pour ${["Saint-Leu", "Saint-Pierre"].map((c) => `<a href="${esc(shomPort(c)!)}">${c}</a>`).join(" et ")}.</p>`
    : "";
  const tide = d?.maree?.length || coming
    ? `<section aria-labelledby="h-maree">
  <div class="sec-h"><p class="eyebrow">Mesurée chaque minute, puis calculée</p><h2 id="h-maree">La marée en ce moment</h2>
  <p>Hauteur d'eau au-dessus du zéro des cartes marines, aux deux marégraphes du SHOM. Les dernières pleine et basse mer sont mesurées ; les prochaines, plus bas, sont calculées par rundata.</p></div>
  <ul class="seas">${(d?.maree ?? []).map((g) => `<li><span>${esc(g.maregraphe)}</span> ` +
      ("hauteur_m" in g && g.hauteur_m != null
        ? `<b>${esc(thin(`${fr(g.hauteur_m)} m`))}</b> <span>${g.tendance === "étale" ? "mer étale" : `marée ${esc(g.tendance!)}`}, mesurée ${esc(leJour(g.heure_mesure!))}</span>` +
          g.derniers_extremes!.slice().reverse().map((e) => ` <span>${esc(e.type)} vers ${esc(e.heure)} (${esc(fr(e.hauteur_m))} m)</span>`).join("") +
          ("avertissement" in g && g.avertissement ? ` <span>pas de mesure depuis ${esc(g.age_texte!.replace(/^il y a /, ""))}</span>` : "")
        : `<b>—</b> <span>marégraphe muet pour le moment</span>`) +
      `</li>`).join("")}</ul>
  ${coming}
</section>`
    : "";

  const title = "Mer : houle, température de l'eau, marée · La Réunion (974)";
  // The swell forecast from the copy's day: its day counts more than its height, which goes first when the description
  // does not fit; undated, as before, only when even that does not fit.
  const seaSays = (du: string, max = true) => `La mer à La Réunion (974) plage par plage : l'eau ${deg(cool!.valeur!) === deg(warm!.valeur!) ? `à ${deg(warm!.valeur!)}` : `de ${deg(cool!.valeur!)} à ${deg(warm!.valeur!)}`}, mesurée par satellite ${lesJours(seen.map((b) => b.jour!))}${top ? `, et la houle prévue${du}${max ? `, jusqu'à ${top.houle!.max}` : ""}` : ""}.`;
  const description = warm && cool
    ? [seaSays(` à partir du ${jourDe(data!.fetchedAt)}`), seaSays(` à partir du ${jourDe(data!.fetchedAt)}`, false), seaSays("")].find((x) => x.length <= DESCRIPTION_MAX) ?? seaSays("")
    : "La mer à La Réunion (974), plage par plage : la température mesurée par satellite, la houle prévue. Saint-Gilles, Saint-Leu, Saint-Pierre…";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Mer", item: `${origin}/mer` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Température de surface de la mer autour de La Réunion (974)",
      description: "Température de surface de la mer mesurée par satellite au large de chaque plage de La Réunion : au dernier passage du satellite, sinon en moyenne d'une journée, publiée au plus tôt le lendemain.",
      url: `${origin}/mer`,
      isAccessibleForFree: true,
      inLanguage: "fr-FR",
      license: "https://www.usa.gov/government-works",
      creator: [
        { "@type": "Organization", name: "NOAA CoastWatch", url: "https://coastwatch.noaa.gov/" },
        { "@type": "Organization", name: "NASA", url: "https://www.nasa.gov/" },
      ],
      spatialCoverage: ISLAND,
      variableMeasured: ["température de surface de la mer"],
      measurementTechnique: "radiomètres satellitaires (ACSPO L3S, MODIS Aqua)",
      ...(data ? { dateModified: data.fetchedAt.toISOString() } : {}),
    },
  ];

  const band = `<div class="wrap"><nav class="crumbs" aria-label="Fil d'Ariane"><ol><li><a href="/">${SITE}</a></li><li aria-current="page">Mer</li></ol></nav></div>
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">Mesure satellite${day ? ` · ${esc(lesJours(seen.map((b) => b.jour!)).replace(/^(le|les|du) /, ""))}` : ""}</p>
    <h1>Mer à La Réunion\u00a0: température et houle <span class="n974">974</span></h1>
    ${status}
    ${ruleTop(now)}
    ${ask(`Dolo la mèr lé sho ? Gèt si ${url} é di amwin pou chak plaj.`,
      `Quelle est la température de l'eau à La Réunion ? Lis ${url} et donne-moi la température plage par plage, avec la date de la mesure.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, apart: true, listed: true, label: "Carte de La Réunion (974) avec la température de la mer au large de chaque plage" })}
  ${day ? `<figcaption class="note" style="color:var(--on-night-muted)">${legende([{ forme: "rond", couleur: chip(26), texte: "26°", dit: "température de l'eau au large de la plage" }], esc(seaMeasure(seen)))}</figcaption>` : ""}</figure>
</div>`;

  const body = `${courbesSection(d?.courbes, now)}
<section aria-labelledby="h-plages">
  <div class="sec-h"><p class="eyebrow">Plage par plage</p><h2 id="h-plages">La mer au large de chaque plage</h2>
  <p>Du nord à l'ouest en passant par l'est et le sud : la dernière mesure satellite à moins de 12 km de chaque plage.</p></div>
  <div class="card">${list}</div>
</section>
${reef !== undefined ? reefSection(reef) : ""}
${whaleSection(now)}
${measuredSwell}${swell}
${tide}
${bathingBlock(now, undefined, g)}${g.feuille}
<p class="lead"><a href="/peche">Pêche de loisir\u00a0: langouste, bichiques, capucin nain, ce qui est fermé aujourd'hui →</a></p>
<section aria-labelledby="h-lire-mer">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-lire-mer">Ce que mesure le satellite</h2></div>
  <div class="three">
    <div class="card">${icon("wave")}<h3>La surface, au large</h3><p>Le satellite mesure la toute première couche d'eau, en moyenne sur des carrés de 2 à 4 km. Le lagon et le bord de plage, peu profonds, sont souvent plus chauds en journée.</p></div>
    <div class="card">${icon("cloud")}<h3>Pas à travers les nuages</h3><p>Un ciel couvert cache la mer : la mesure retenue est alors celle d'un jour précédent, ou d'un carré un peu plus loin. La date et la distance sont toujours données.</p></div>
    <div class="card">${icon("gauge")}<h3>Au mieux, la mesure d'hier</h3><p>Une mesure par satellite paraît au plus tôt le lendemain du jour mesuré : celle d'aujourd'hui n'existe pas encore. La houle, elle, est une prévision ; pour la vigilance vagues-submersion, voyez <a href="/vigilance">la vigilance</a>.</p></div>
  </div>
</section>
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Demandez à votre IA : « la mer est à combien à Saint-Leu ? », « la houle demain à Saint-Pierre ? »</h2>
  <p>Avec le connecteur, votre assistant va chercher lui-même la mesure la plus proche de la plage, avec sa date, et la houle prévue, étiquetée comme une prévision (outil <code>${coupable("temperature_mer")}</code>). Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>`;
  return layout(origin, { title, description, path: "/mer", jsonld, alerte }, band, g.ligne + body);
}
