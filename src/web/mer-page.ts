/**
 * /mer, the sea around the island: the water's temperature at each beach, the swell measured and forecast, the tides,
 * the bathing water, the risk of coral bleaching and the whales' season. The page of each commune or famous place is in
 * lieu-page.ts, the layout shared by every page in pages.ts, the vigilance in vigilance-page.ts.
 */
import { courbesSection, satelliteSection } from "./mer-courbes.js";
import { leQuand } from "../tools/mer-courbes.js";
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
import { WEBCAMS_PLAGES } from "../tools/mer.js";
import { esc, islandMap, type Marker } from "./map.js";
import { legende } from "./carte-legende.js";
import { slugify } from "./places.js";
import { bathingBlock, ruleTop } from "./baignade.js";
import { coupable } from "./domains.js";
import { adressesCoupables, anchorId, chip, connector, credits, dayMonth, deg, DESCRIPTION_MAX, icon, ISLAND, jourDe, layout, leAt, leJour, lesJours, seaName, SITE, thin } from "./pages.js";

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
  // Grouped by day: « le 27/11 à 13:11 et 14:52, et le 28/11 à 02:04 », never the same day said twice.
  const days = new Map<string, string[]>();
  for (const h of passes) {
    const [day, time] = localTime(new Date(h)).split(" ");
    days.set(day, [...(days.get(day) ?? []), time]);
  }
  const groups = [...days].map(([day, times]) => `le ${day} à ${times.join(" et ")}`);
  const said = groups.length > 1 ? `${groups.slice(0, -1).join(", ")}${groups.some((g) => g.includes(" et ")) ? ", et " : " et "}${groups.at(-1)}` : groups[0];
  const parts = [
    ...(passes.length ? [`passage du satellite ${said}, un instant et pas la moyenne de la journée${means.length ? ` (${seen.length - means.length} plage${seen.length - means.length > 1 ? "s" : ""})` : ""}`] : []),
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
  // Not every beach of the west coast: their markers would sit on one another.
  const markers: Marker[] = seen.filter((b) => !CROWDED.has(b.nom)).map((b) => ({ lon: b.lon, lat: b.lat, label: `${Math.round(b.valeur!)}°`, say: `eau à ${Math.round(b.valeur!)} °C`, name: seaName(b.nom), color: chip(b.valeur!), round: true, href: `#${anchorId("p", b.nom)}` }));

  // The buoys first, while recent at the view: measured on the half hour, where the satellite's pass is of the night or
  // the day before (the user, 28/11/2026: the first two screens said only the satellite). Each line starts with its time.
  // The newest first, as the pill says « dernière mesure »: a line at 11:20 under a pill at 11:50 read as a mistake (28/11/2026).
  const buoys = (d?.bouees ?? []).filter((b) => now.getTime() - b.t <= candhis.MESURE_MAX_HOURS * 3600_000).sort((a, b) => b.t - a.t);
  const latest = buoys[0];
  const buoysTop = buoys.map((b) => {
    const [jour, h] = b.mesuree_a.split(" ");
    const what = [b.hauteur_significative && `houle de <b>${esc(thin(b.hauteur_significative))}</b>${b.venant ? ` ${esc(b.venant)}` : ""}`, b.vague_max && `vagues jusqu'à ${esc(thin(b.vague_max))}`, b.periode && `période ${esc(thin(b.periode))}`, b.temperature_eau && `mer à <b>${esc(thin(b.temperature_eau))}</b>`].filter(Boolean).join(", ");
    return `<div class="now"><p><b>Mesurée le ${esc(jour)} à ${esc(h)}</b> à la bouée de ${esc(b.bouee)}\u00a0: ${what || "pas de hauteur mesurée"}.</p></div>`;
  }).join("") +
    // A buoy silent for more than 6 hours says so, from its curves: it never goes away without a word.
    (d?.courbes?.bouees ?? []).filter((c) => !buoys.some((b) => b.bouee === c.nom)).map((c) => {
      const last = Math.max(...Object.values(c.chiffres).map((x) => (typeof x?.le === "number" ? x.le : 0)));
      return last ? `<div class="now"><p>Bouée de ${esc(c.nom)}\u00a0: <b>dernière mesure ${esc(leQuand(last))}</b>, plus rien depuis.</p></div>` : "";
    }).join("");
  const satelliteTop = warm && cool
    ? `<div class="now"><p>L'eau au large des plages, vue par satellite\u00a0: <b>${esc(thin(`${fourchette(fr(Math.round(cool.valeur! * 10) / 10), fr(Math.round(warm.valeur! * 10) / 10))} °C`))}</b>, plus chaude à ${esc(seaName(warm.nom))}, plus fraîche à ${esc(seaName(cool.nom))}. ${esc(seaMeasure(seen))}</p></div>`
    : "";
  const status = buoysTop
    ? `${buoysTop}<div class="now"><p>Source\u00a0: ${esc(candhis.SOURCE.attribution)} (${esc(candhis.SOURCE.licence)}), relevée toutes les 30 minutes.</p></div>`
    : warm && cool
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

  const waves = d?.plages.filter((b) => b.houle) ?? [];
  const top = waves.length ? waves.reduce((a, b) => (b.houle!.hauteur_m > a.houle!.hauteur_m ? b : a)) : undefined;
  const swell = waves.length
    ? `<section aria-labelledby="h-houle">
  <div class="sec-h"><p class="eyebrow">Prévision, pas une mesure</p><h2 id="h-houle">La houle prévue près de chaque plage</h2>
  <p>Hauteur, direction et période des vagues au large, pour les 3 heures en cours, puis la plus haute des 4 jours, d'après deux modèles de vagues : celui de Météo-France (MFWAM, maille d'environ 9 km), qui distingue la houle principale du reste de la mer, à l'ouest et au sud\u00a0; celui du Centre européen (ECMWF, maille de 9 km) au nord et à l'est, où le premier n'a pas de point près de la côte. Dans le lagon et derrière le récif, les vagues sont bien plus petites. Pour la sécurité : <a href="/vigilance">la vigilance vagues-submersion</a>, les drapeaux et les maîtres-nageurs.</p></div>
  <div class="card"><ul class="seas">${waves.map((b) => `<li><span>${esc(seaName(b.nom))}</span>` +
      ` <b>${esc(thin(`${fr(b.houle!.hauteur_m)} m`))}</b> <span>${esc(b.houle!.maintenant.replace(/^\S+ m /, ""))}, vers ${esc(b.houle!.heure)}</span>` +
      ` <span>jusqu'à ${esc(thin(b.houle!.max))} ${esc(b.houle!.max_jour)}</span>${b.houle!.modele ? ` <span>modèle ${esc(b.houle!.modele)}</span>` : ""}</li>`).join("")}</ul></div>
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

  // The tide at the top, after the buoys (the user, 28/11/2026, had not seen it so low on the page): what it does now at
  // each gauge, its time first, then the next high and low water, computed, and a link to the block.
  const tideTop = GAUGES.map((gauge) => {
    const g = (d?.maree ?? []).find((r) => r.maregraphe === computed.find((x) => x!.gauge === gauge)?.nom);
    const x = computed.find((c) => c!.gauge === gauge);
    const lu = g && "hauteur_m" in g && g.hauteur_m != null && !("avertissement" in g && g.avertissement)
      ? `<b>Marée mesurée le ${esc(g.heure_mesure!.replace(" ", " à "))}</b> au marégraphe ${esc(g.maregraphe)}\u00a0: ${g.tendance === "étale" ? "mer étale" : `marée ${esc(g.tendance!)}`}, ${esc(thin(`${fr(g.hauteur_m)} m`))}.`
      : "";
    const pm = x?.next.liste.find((e) => e.type === "pleine mer");
    const bm = x?.next.liste.find((e) => e.type === "basse mer");
    const prochaines = x && (pm || bm)
      ? `${lu ? "" : `Au marégraphe ${esc(x.nom)}, `}${lu ? "Prochaines" : "prochaines"} marées, un calcul, pas la prédiction du SHOM\u00a0: ${x.next.liste.filter((e) => e === pm || e === bm).map((e) => `${esc(e.type)} ${esc(e.heure)}`).join(", ")}.`
      : "";
    return lu || prochaines ? `<div class="now"><p>${[lu, prochaines].filter(Boolean).join(" ")}</p></div>` : "";
  }).join("");
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
<div class="wrap intro solo">
  <div class="pitch">
    <p class="pill">${latest ? `Dernière mesure des bouées · ${esc(latest.mesuree_a.replace(" ", " à "))}` : `Mesure satellite${day ? ` · ${esc(lesJours(seen.map((b) => b.jour!)).replace(/^(le|les|du) /, ""))}` : ""}`}</p>
    <h1>Mer à La Réunion\u00a0: température et houle <span class="n974">974</span></h1>
    ${status}
    ${tideTop ? `${tideTop}<div class="now"><p><a href="#h-maree">La marée en ce moment, et les prochaines →</a></p></div>` : ""}
    ${ruleTop(now)}
    ${buoysTop ? satelliteTop : ""}
  </div>
</div>`;
  // The beaches' map, once, in their block (the user, 28/11/2026: each subject in one block); it was the band's.
  const carte = `<figure class="card mapcard">${islandMap({ markers, apart: true, listed: true, label: "Carte de La Réunion (974) avec la température de la mer au large de chaque plage" })}
  ${day ? `<figcaption class="note">${legende([{ forme: "rond", couleur: chip(26), texte: "26°", dit: "température de l'eau au large de la plage" }], esc(seaMeasure(seen)))}</figcaption>` : ""}</figure>`;

  // The third card of « Ce que mesure le satellite »: where the swell is measured, from the buoys shown, and forecast.
  const nomsBouees = [...new Set([...buoys.map((b) => b.bouee), ...(d?.courbes?.bouees ?? []).map((b) => b.nom)])];
  const houleDite = nomsBouees.length
    ? `La houle est mesurée ${nomsBouees.length > 1 ? "aux bouées" : "à la bouée"} ${nomsBouees.map((n) => `de ${esc(n)}`).join(", ").replace(/, (de [^,]+)$/, " et $1")}, et prévue près des plages`
    : "La houle près des plages est une prévision";
  const body = `${courbesSection(d?.courbes, now)}
${tide}
${swell}
<section aria-labelledby="h-plages">
  <div class="sec-h"><p class="eyebrow">Par satellite</p><h2 id="h-plages">La mer au large de chaque plage</h2>
  <p>Du nord à l'ouest en passant par l'est et le sud : la dernière mesure satellite à moins de 12 km de chaque plage.</p></div>
  ${carte}
  <div class="card">${list}</div>
  ${satelliteSection(d?.courbes)}
  <p><a href="/mer/historique">Les années d'avant\u00a0: l'histoire de la mer, ses records et le même jour chaque année →</a></p>
  <p><a href="${esc(WEBCAMS_PLAGES.lien)}">${esc(WEBCAMS_PLAGES.texte)}</a> (sur le site de l'IRT).</p>
</section>
${bathingBlock(now, undefined, g)}${g.feuille}
<p class="lead"><a href="/peche">Pêche de loisir\u00a0: langouste, bichiques, capucin nain, ce qui est fermé aujourd'hui →</a></p>
${reef !== undefined ? reefSection(reef) : ""}
${whaleSection(now)}
<section aria-labelledby="h-lire-mer">
  <div class="sec-h"><p class="eyebrow">Bon à savoir</p><h2 id="h-lire-mer">Ce que mesure le satellite</h2></div>
  <div class="three">
    <div class="card">${icon("wave")}<h3>La surface, au large</h3><p>Le satellite mesure la toute première couche d'eau, en moyenne sur des carrés de 2 à 4 km. Le lagon et le bord de plage, peu profonds, sont souvent plus chauds en journée.</p></div>
    <div class="card">${icon("cloud")}<h3>Pas à travers les nuages</h3><p>Un ciel couvert cache la mer : la mesure retenue est alors celle d'un jour précédent, ou d'un carré un peu plus loin. La date et la distance sont toujours données.</p></div>
    <div class="card">${icon("gauge")}<h3>Un passage, pas la journée</h3><p>Le satellite passe au-dessus de l'île vers 01:40 et vers 14:00, et sa mesure paraît moins de 1 h 30 après : un instant, pas la moyenne de la journée. Les jours de nuages, c'est la moyenne d'un jour précédent, publiée au plus tôt le lendemain. ${houleDite} ; pour la vigilance vagues-submersion, voyez <a href="/vigilance">la vigilance</a>.</p></div>
  </div>
</section>
<section class="card cta" aria-labelledby="h-ia">
  <h2 id="h-ia">Demandez à votre IA : « la mer est à combien à Saint-Leu ? », « la houle demain à Saint-Pierre ? »</h2>
  <p>Avec le connecteur, votre assistant va chercher lui-même la mesure la plus proche de la plage, avec sa date, et la houle prévue, étiquetée comme une prévision (outil <code>${coupable("temperature_mer")}</code>). Gratuit, sans compte. <a href="/mcp#h-brancher">Comment le brancher</a>.</p>
  ${connector(origin, "mcp-url")}
</section>`;
  return layout(origin, { title, description, path: "/mer", jsonld, alerte }, band, g.ligne + body);
}
