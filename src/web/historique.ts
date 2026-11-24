/**
 * The past weather's page (/meteo/historique): the measures of the stations, their records and their graphs. Moved out
 * of domains.ts as it was; the helpers common to every domain's page stay there.
 */
import type { Cached } from "../cache.js";
import { a, fr, nombre } from "../tools/format.js";
import { TODAY } from "../tools/historique.js";
import { type Alerte, type HistoriqueAnswer, type HourlyAnswer } from "./data.js";
import { GRAPHES_SCRIPT, graphes } from "./historique-graphes.js";
import { esc, islandMap } from "./map.js";
import { COUNT_COLOR, legende } from "./carte-legende.js";
import { anchorId, ask, empty, layout, type Live, readAt } from "./pages.js";
import { script } from "./scripts-declares.js";
import { connectorCta, crumbBar, crumbs, describe, loading, soulignesCoupables, sourcesNote, webPage } from "./domains.js";
// ---------------------------------------------------------------- historique météo

const pct = (x?: string) => (x ? Number.parseInt(x, 10) : undefined);
/**
 * The classes of the rain against its normal, one set for the header's count, the map and the table's bars: under
 * 80 % is « nettement moins », as the header counts, and over 125 % (80 %'s inverse) « nettement plus ».
 */
const RAIN_LOW = 80;
const RAIN_HIGH = 125;
const RAIN_CLASSES = [
  { couleur: "#ff922b", texte: "40\u00a0%", dit: `moins de ${RAIN_LOW}\u00a0%\u00a0: nettement moins que la normale` },
  { couleur: "#69db7c", texte: "100\u00a0%", dit: `de ${RAIN_LOW} à ${RAIN_HIGH}\u00a0%\u00a0: proche de la normale` },
  { couleur: "#4dabf7", texte: "160\u00a0%", dit: `plus de ${RAIN_HIGH}\u00a0%\u00a0: nettement plus que la normale` },
];
const rainClass = (x: number) => RAIN_CLASSES[x < RAIN_LOW ? 0 : x > RAIN_HIGH ? 2 : 1];
/** A bar of the rain against the normal: 100 % is the normal; its colour is the class of the station's ratio. */
function rainBar(total: number, normal?: number, ratio?: number): string {
  if (normal == null || normal <= 0) return `<b>${fr(total)}\u00a0mm</b>`;
  const x = ratio ?? Math.round((100 * total) / normal);
  const w = Math.min(x / 100, 2) * 50;
  return `<b>${fr(total)}\u00a0mm</b> <small class="note">normale ${normal}\u00a0mm</small> <span class="ratio" role="img" aria-label="${x} % de la normale"><i style="width:${w}%;background:${rainClass(x).couleur}"></i><s></s></span>`;
}
const vsNormal = (v?: number, n?: number, unit = "\u00a0°C") =>
  v == null ? "—" : `<b>${fr(v)}${unit}</b>${n != null ? `<small class="note">normale ${fr(n)}${unit}</small>` : ""}`;

/** A small count in letters, as « six stations »; the figure past ten. */
const enLettres = (n: number) => ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"][n] ?? String(n);

/**
 * The big words of /historique: how many of the stations with a normal had clearly less rain than it, « 3 stations sur
 * 6 », « 1 station sur 6 », « Aucune des 6 stations »; the lead says the rest, its verb agreeing.
 */
export function heroHistorique(below: number, withNormal: number): string {
  if (!below) return withNormal > 1 ? `Aucune des ${withNormal} stations` : "Aucune station";
  return `${below} station${below > 1 ? "s" : ""} sur ${withNormal}`;
}

export function historiquePage(origin: string, data: Cached<HistoriqueAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const url = `${origin}/historique`;
  const rows = d?.stations ?? [];
  const below = rows.filter((r) => (pct(r.pluie?.rapport_a_la_normale) ?? 100) < RAIN_LOW).length;
  const withNormal = rows.filter((r) => r.pluie?.rapport_a_la_normale).length;

  const markers = rows.flatMap((r) => {
    const x = pct(r.pluie?.rapport_a_la_normale);
    // The station's name in the bubble only (quiet), as on the other maps of measures: written under a point by the
    // coast, « Pointe des Trois-Bassins » ran past the map's left edge at 1280.
    return x == null ? [] : [{ lon: r.lon, lat: r.lat, label: `${x}\u00a0%`, name: r.station, color: rainClass(x).couleur, ink: COUNT_COLOR, quiet: true,
      say: `${x}\u00a0% de la pluie normale en 30\u00a0jours`, href: `#${anchorId("s", r.station)}` }];
  });

  // The 30 days, without their year: the pill already says up to which day.
  const span = d ? `du ${d.periode.du.slice(0, 5)} au ${d.periode.au.slice(0, 5)}` : "";
  const measured = `Pluie, températures et soleil mesurés par Météo-France à ${enLettres(rows.length)} station${rows.length > 1 ? "s" : ""} de référence, ${span}, comparés à la normale 1991-2020.`;
  const status = !d
    ? loading("L'historique des mesures")
    : withNormal
      ? `<div class="status"><p class="big">${esc(heroHistorique(below, withNormal))}</p><p class="lead">${esc(`${below === 0 ? "n'a" : below === 1 ? "a" : "ont"} reçu nettement moins de pluie que la normale ${span} (moins de ${RAIN_LOW} % de leur moyenne 1991-2020).`)}</p></div>`
      : `<p class="lead">${esc(measured)}</p>`;

  const table = rows.length
    ? `<div class="card table-wrap"><table class="drought histo"><caption class="sr">Les 30 derniers jours</caption><thead><tr><th>Station</th><th>Pluie, 30 jours</th><th>Maximales</th><th>Minimales</th><th>Soleil</th></tr></thead><tbody>${rows.map((r) => {
        const e = r.ensoleillement;
        return `<tr><th scope="row" class="tgt" id="${anchorId("s", r.station)}">${esc(r.station)} <small class="note">${esc(r.zone)}, ${nombre(r.altitude_m)}\u00a0m</small></th>` +
          `<td>${r.pluie ? rainBar(r.pluie.total_mm, r.pluie.normale_mm, pct(r.pluie.rapport_a_la_normale)) : "—"}</td>` +
          `<td>${vsNormal(r.temperatures?.maximales_moyenne, r.temperatures?.maximales_normale)}</td>` +
          `<td>${vsNormal(r.temperatures?.minimales_moyenne, r.temperatures?.minimales_normale)}</td>` +
          `<td>${e?.jours_mesures ? `${vsNormal(e.heures_par_jour, e.normale_heures_par_jour, "\u00a0h/j")} <small class="note">${e.jours_gris} jour${e.jours_gris > 1 ? "s" : ""} gris</small>` : "—"}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : "";

  const charts = d ? graphes(d) : "";
  const title = "Historique météo : relevés depuis 1900 · La Réunion (974)";
  const short = "Le temps qu'il a fait à La Réunion (974) : pluie, températures et soleil mesurés par Météo-France jour par jour depuis 1900, comparés à la normale.";
  const description = d ? describe(`${d.resume}`, short) : short;

  const band = `${crumbBar("Historique météo")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill">Mesures jusqu'${d ? `au ${esc(d.periode.au.slice(0, 5))}` : "à hier"}</p>
    <h1>Historique météo <span class="n974">974</span></h1>
    ${status}
    ${ask(`La pli i tonb Sin-Bénoi ? Lé normal ? Gèt si ${url} é di amwin konbien la tonbé sé dernié zour.`,
      `Il a plu combien ces derniers jours à Saint-Benoît, et c'est normal ? Lis ${url} et dis-le-moi.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, listed: true, label: "Carte de La Réunion (974) : la pluie des 30 derniers jours à six stations, en pourcentage de la normale" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende(RAIN_CLASSES.map((c) => ({ forme: "pastille", encre: COUNT_COLOR, ...c })), esc(`Pluie mesurée par Météo-France${d ? ` du ${d.periode.du.slice(0, 5)} au ${d.periode.au.slice(0, 5)}` : " ces 30 derniers jours"}, en % de la normale 1991-2020.`))}</figcaption></figure>
</div>`;

  const body = `<section aria-labelledby="h-trente">
  <div class="sec-h"><p class="eyebrow">Six climats, six stations</p><h2 id="h-trente">Les 30 derniers jours</h2>
  ${d ? `<p>${esc(measured)}</p>` : ""}</div>
  ${table}
</section>
${charts ? `${charts}${script(GRAPHES_SCRIPT)}` : ""}
${d?.heures ? hourlySection(d.heures) : ""}
<section aria-labelledby="h-archive">
  <div class="sec-h"><p class="eyebrow">Toute l'archive</p><h2 id="h-archive">N'importe quel jour depuis 1900</h2>
  <p>Avec le connecteur, votre IA lit les mesures quotidiennes de chacune des 249 stations Météo-France que l'île a connues, de la première année de chacune jusqu'à hier : « il a plu combien en janvier 2018 à Cilaos ? », « il faisait combien le jour de mes 20 ans au Tampon ? », « record de chaleur à Saint-Denis ? », « il fait plus chaud qu'avant ? ». Les normales sont les moyennes 1991-2020 de chaque station.</p></div>
  ${d ? `<ul class="plain note">${d.a_savoir.map((x) => `<li>${pageNote(x)}</li>`).join("")}</ul>` : ""}
  ${d && data ? sourcesNote(d.sources, data) : ""}
</section>
${connectorCta("historique_meteo", "l'historique météo")}`;

  return layout(origin, { title, description, path: "/historique", jsonld: [crumbs(origin, "Historique météo", "/historique"), webPage(origin, "/historique", title, description, data)], alerte }, band, body);
}

const METEO_LINK = "\u0000meteo\u0000";

/**
 * A note of the tool as the page says it: the tool's words for an assistant (meteo_actuelle, prevision_meteo,
 * hier_provisoire, detail « heure ») become the page Météo and plain words (24/11/2026: shown to the visitors as is).
 */
export function pageNote(note: string): string {
  const text = note
    .replace(/voir meteo_actuelle\u00a0; pour les jours à venir, prevision_meteo\./, `et pour les jours à venir, voir ${METEO_LINK}.`)
    .replace(/ dans hier_provisoire\u00a0:/, " à titre provisoire\u00a0:")
    .replace(/, et jusqu'à \d+ jours avec detail « heure »/, "");
  return soulignesCoupables(esc(text)).replace(METEO_LINK, `<a href="/meteo">la page Météo</a>`);
}

/**
 * The tool's summary as the page says it: without its « Heure par heure (stations…) — », which the eyebrow and the note
 * say (a station's name in brackets, « Gillot (aéroport) », within), and with today sent to /meteo, not to the tool's
 * meteo_actuelle written for an assistant (24/11/2026: shown to the visitors as is).
 */
export function hourlyLead(resume: string): string {
  const text = resume.replace(/^.*?Heure par heure \((?:[^()]|\([^()]*\))*\) — /, "");
  const today = text.includes(TODAY);
  return soulignesCoupables(esc(text.replace(` ${TODAY}`, "").replace(TODAY, "").trim())) +
    (today ? ` Aujourd'hui n'est pas encore dans cette archive\u00a0: la température la plus haute et la plus basse, et la pluie depuis minuit, sont sur <a href="/meteo">la page Météo</a>.` : "");
}

/** Yesterday and last night at Saint-Denis, hour by hour: one row per hour, newest first. */
function hourlySection(h: HourlyAnswer): string {
  const rows = [...h.heure_par_heure.heures].reverse();
  const used = h.heure_par_heure.stations.map((x) => `${x.station} (${x.mesure.replace(/^heure par heure : /, "")})`).join(" ; ");
  const cell = (v: number | undefined, unit = "") => (v == null ? "—" : `${fr(v)}${unit}`);
  return `<section aria-labelledby="h-heures">
  <div class="sec-h"><p class="eyebrow">Heure par heure</p><h2 id="h-heures">Hier et cette nuit à Saint-Denis</h2>
  <p>${hourlyLead(h.resume)}</p></div>
  <details class="card table-wrap"><summary>Les ${rows.length} dernières heures publiées</summary>
  <table class="drought histo hours"><caption class="sr">Les ${rows.length} dernières heures publiées</caption><thead><tr><th>Heure</th><th>Pluie</th><th>Température</th><th>Vent</th><th>Rafale</th><th>Soleil</th></tr></thead><tbody>${rows.map((r) =>
    `<tr><th scope="row">${esc(r.heure)}</th><td>${cell(r.pluie_mm, " mm")}</td><td>${cell(r.temperature, " °C")}</td><td>${r.vent_kmh == null ? "—" : `${r.vent_kmh} km/h${r.vent_de ? ` ${esc(r.vent_de)}` : ""}`}</td><td>${cell(r.rafale_kmh, " km/h")}</td><td>${r.soleil_min == null ? "—" : `${r.soleil_min} min`}</td></tr>`).join("")}</tbody></table></details>
  <p class="note">Stations Météo-France : ${esc(used)}. Avec le connecteur, votre IA lit ces heures pour n'importe quelle station depuis 2000 : « à quelle heure a-t-il plu hier à Cilaos ? », « rafale max cette nuit à Saint-Pierre ? ».</p>
</section>`;
}

export function historiqueLive(data: Cached<HistoriqueAnswer> | null, now = new Date()): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const r = d.stations.find((x) => x.pluie?.rapport_a_la_normale);
  if (!r?.pluie) return empty(`Rapport à la normale pas encore calculé pour les 30 derniers jours (lecture ${readAt(data!.fetchedAt, now).de}).`);
  return { valeur: `${r.pluie.rapport_a_la_normale} de la normale`, detail: `pluie des 30 derniers jours ${esc(a(r.station))} (${fr(r.pluie.total_mm)} mm)` };
}
