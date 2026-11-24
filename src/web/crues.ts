/**
 * The floods' page (/crues): the rivers' levels at Vigicrues' stations, their trends, and the fords. Moved out of
 * domains.ts as it was; the helpers common to every domain's page stay there.
 */
import type { Cached } from "../cache.js";
import { normalize } from "../places/resolve.js";
import { fr } from "../tools/format.js";
import { type Alerte, type CruesAnswer, type CruesStation } from "./data.js";
import { localTime } from "../geo.js";
import { esc, fenetre, islandMap, type Marker } from "./map.js";
import { legende } from "./carte-legende.js";
import { anchorId, ask, icon, layout, type Live, lue, leJour, duJour, readAt, vg } from "./pages.js";
import * as vigicrues from "../providers/vigicrues.js";
import { INFOTRAFIC, connectorCta, crumbBar, crumbs, describe, lienNom, loading, webPage } from "./domains.js";
// ---------------------------------------------------------------- crues

// Vigicrues Réunion's colours, the worst first; « indisponible » last.
const FLOOD_ORDER = ["rouge", "orange", "jaune", "vert", "indisponible"];
const FLOOD_COLOR: Record<string, string> = { rouge: "#f03e3e", orange: "#ff922b", jaune: "#ffd43b", vert: "#69db7c" };
// The map's markers: what the gauge measured, never the vigilance's colours (orange would read as one); the shape says
// it as much as the colour. A rise in the night's colour, bigger and edged in white, with its arrow: its shape makes it the mark to see first, as
// red would read as Vigicrues' own red vigilance. Stable or falling: a value with no judgement, muted in the dark theme
// (--gauge-calme) so that the rise stands out. No recent measure: a grey ring, the map showing through.
const GAUGE_COLOR = { hausse: "#14202b", calme: "var(--gauge-calme)", muette: "#868e96" };
const GAUGE_RANK = { muette: 0, calme: 1, hausse: 2 };
const floodBadge = (c: string) => `<span class="lvl" style="--c:${FLOOD_COLOR[c] ?? "#868e96"}">${esc(c)}</span>`;
const metres = (v: number) => `${fr(Math.round(v * 100) / 100)} m`;
const flow = (v: number) => `${fr(Math.round(v * 100) / 100)} m³/s`;
const measuredHm = (s: CruesStation) => s.heure_mesure?.split(" ")[1] ?? "";
/** Measured within the last half hour: only these are said rising or not. */
const upToDate = (s: CruesStation) => s.hauteur_m != null && !s.avertissement;
/** No level, and a warning: Vigicrues answered for it with none in our window (vigicrues.ts `NONE_PUBLISHED`), not late. */
const unpublished = (s: CruesStation) => s.hauteur_m == null && !!s.avertissement;
const dayAt = (d: Date) => localTime(d).replace(" ", " à ");
/** A river's name to match the vigilance's to the gauges': « rivière des Galets » → « galets ». */
const riverCore = (r: string) => normalize(r).replace(/^(grande |petite )?(riviere|ravine|bras|etang) (de la |des |du |de |d )?/, "");

/** A marker of the map as the legend shows it: filled, with its sign, or a ring. */
/** « , la plus récente à 02:45 » (« le 30/10 à 02:45 » another day), from the stations' times (« 31/10 02:45 »). */
function latestGauge(d: CruesAnswer | undefined): string {
  const key = (t: string) => t.replace(/^(\d\d)\/(\d\d)/, "$2$1");
  const last = (d?.stations ?? []).filter(upToDate).map((s) => s.heure_mesure).filter((t): t is string => !!t).sort((a, b) => key(a).localeCompare(key(b))).pop();
  if (!last) return "";
  const [day, time] = last.split(" ");
  return ` : mesure la plus récente le ${day} à ${time}`;
}


/** The vigilance in the page's status, from Vigicrues Réunion; `readAt`: our read, when it could not be read. */
function floodVigilance(v: CruesAnswer["vigilance_crues"], read: string): string {
  if (!v) return `<p class="lead">Vigilance crues absente de la lecture de rundata.re ${esc(read)} : voir ${lienNom(vigicrues.SOURCE.url, "vigicrues-reunion.re ↗")}.</p>`;
  if (!v.active) {
    return `<p class="lead">Pas de vigilance crues en cours d'après Vigicrues Réunion : toutes les rivières suivies sont au vert.</p>` +
      (v.aucun_bulletin_depuis ? `<p class="note">Dernier bulletin le ${esc(v.aucun_bulletin_depuis)} : Vigicrues Réunion n'en publie qu'en vigilance jaune ou plus.</p>` : "");
  }
  const raised = ["rouge", "orange", "jaune"].map((c) => ({ c, rivers: v.rivieres.filter((r) => r.couleur === c).map((r) => r.nom) })).filter((x) => x.rivers.length);
  const said = raised.map((x) => `${x.c} pour ${x.rivers.join(", ")}`);
  const head = said.length ? `<b>Vigilance crues ${esc(said[0])}</b>${said.slice(1).map((x) => `, ${esc(x)}`).join("")}` : "<b>Vigilance crues</b>";
  return `<p class="lead">${head}, d'après Vigicrues Réunion (bulletin n° ${v.bulletin ?? ""} du ${v.date ? esc(dayAt(new Date(v.date))) : ""}).</p>` +
    (v.observations ? `<p class="note">Ce que dit le bulletin : « ${esc(v.observations)} »</p>` : "") +
    (v.anticipation ? `<p class="note">À venir : « ${esc(v.anticipation)} »</p>` : "");
}

/** The gauges in the page's status: only those measured lately are said rising or not; the others counted apart. */
function floodLevels(stations: CruesStation[], read: string): string {
  const fresh = stations.filter(upToDate);
  if (!fresh.length) return `<p class="lead">Aucune des ${stations.length} stations n'a de mesure de moins de 30 minutes dans la lecture ${esc(read)} : rundata.re ne sait pas pour l'instant si les rivières montent.</p>`;
  // Apart: the gauges Vigicrues publishes nothing for, then the late ones.
  const none = stations.filter(unpublished);
  const others = stations.filter((s) => !upToDate(s) && !unpublished(s));
  const end = (none.length ? ` ${esc(vigicrues.NONE_PUBLISHED[0].toUpperCase() + vigicrues.NONE_PUBLISHED.slice(1))} : ${none.map((s) => esc(s.station)).join(", ")}.` : "") +
    (others.length > 1 ? ` ${none.length ? `${others.length} autres stations` : `Les ${others.length} autres`} n'ont pas de mesure récente.` : others.length ? ` Une station n'a pas de mesure récente : ${esc(others[0].station)}.` : "");
  // The newest measure, with its day (« du 05/11 à 04:50 »).
  const newest = [...fresh].sort((x, y) => measuredHm(x).localeCompare(measuredHm(y))).at(-1);
  const at = newest?.heure_mesure ? duJour(newest.heure_mesure) : "";
  const rising = fresh.filter((s) => s.tendance_30_min === "en hausse");
  if (rising.length) return `<p class="lead">En hausse sur la dernière demi-heure (mesures ${at}) : ${rising.map((s) => `${esc(s.station)} (${esc(s.riviere)}, ${esc(s.commune)}), ${metres(s.hauteur_m!)}`).join(" ; ")}.${end}</p>`;
  if (fresh.length === 1) return `<p class="lead">Mesure ${at} : la seule station à jour n'est pas en hausse sur la dernière demi-heure.${end}</p>`;
  return `<p class="lead">Mesures ${at} : aucune des ${fresh.length} stations à jour n'est en hausse sur la dernière demi-heure.${end}</p>`;
}

/** What a gauge measured, as its line says it (text, not HTML); without a level, null. */
const gaugeValue = (s: CruesStation): string | null =>
  s.hauteur_m == null
    ? null
    : s.avertissement
      ? `${metres(s.hauteur_m)} ${leJour(s.heure_mesure ?? "")} · pas de mesure plus récente`
      : [`${metres(s.hauteur_m)}, ${s.tendance_30_min ?? ""}`, ...(s.debit_m3s != null ? [flow(s.debit_m3s)] : []), `mesurée ${leJour(s.heure_mesure ?? "")}`].join(" · ");

/** A gauge's line in its river's group: up to date, late, or without a level in our read. */
function gaugeRow(s: CruesStation, read: string): string {
  const said = gaugeValue(s);
  const value = said == null ? (unpublished(s) ? esc(s.avertissement!) : `Pas de mesure dans la lecture ${esc(read)}.`) : esc(said);
  const floods = [...(s.crues_de_reference ?? [])].sort((a, b) => b.hauteur_m - a.hauteur_m);
  const marks = floods.length
    ? `<details><summary>Crues de référence</summary><ul class="plain">${floods.map((c) => `<li>${[metres(c.hauteur_m), ...(c.debit_m3s != null ? [flow(c.debit_m3s)] : []), esc(c.nom)].join(" · ")}</li>`).join("")}</ul></details>`
    : "";
  return `<li class="tgt" id="${anchorId("s", s.station)}"><span>${esc(s.station)} · ${esc(s.commune)} <small>${value}</small>${marks}</span> <span></span></li>`;
}

// The fords: the préfecture's instruction in heavy rain, word for word with its communiqué, then the
// announcements that name a ford, each with its source and its time; their state is on infotrafic.re, of which only the
// link is given.
const FORD_RULE = "https://www.reunion.gouv.fr/Actualites/Communiques-de-presse/Vigilance-orange-fortes-pluies-orages-a-partir-de-12h";

/** The headlines on the fords as the page shows them, and when the news was read; absent when it was not. */
export interface Fords {
  annonces: { titre: string; lien: string; source: string; heure: string }[];
  lue: Date;
}

function fordsSection(f: Fords | undefined, now: Date): string {
  const rule = `<p>Consigne de la préfecture en vigilance fortes pluies : «\u00a0Je ne tente jamais de franchir, à pied ou en voiture, les ravines et les rivières en crue, ou qui peuvent l'être soudainement, ainsi que les radiers submergés\u00a0». <a href="${FORD_RULE}" rel="noopener">Communiqué du 02/04/2026 ↗</a></p>`;
  const said = !f
    ? ""
    : f.annonces.length
      ? `<ul class="plain">${f.annonces.map((a) => `<li>${esc(a.heure)} · ${esc(a.source)} : <a href="${esc(a.lien)}" rel="noopener"${fenetre(a.lien)}>${esc(a.titre)} ↗</a></li>`).join("")}</ul>`
      : `<p>Aucune annonce de la préfecture ni des médias sur un radier dans la lecture de rundata.re ${readAt(f.lue, now).de}. Cela ne dit pas qu'ils sont ouverts : l'état officiel est sur infotrafic.re.</p>`;
  return `<section aria-labelledby="h-radiers">
  <div class="sec-h"><p class="eyebrow">Par fortes pluies</p><h2 id="h-radiers">Les radiers</h2>
  <p>L'état officiel des routes et des radiers est sur la carte d'infotrafic.re, le site de la Région, qui ne s'affiche que chez elle. Ici, les annonces de la préfecture et des médias qui parlent d'un radier, avec leur heure.</p></div>
  <div class="card">${icon("car")}${rule}${said}<p class="hero-cta"><a class="btn sun" href="${INFOTRAFIC}">${icon("car")}Carte officielle ↗</a></p></div>
</section>`;
}

export function cruesPage(origin: string, data: Cached<CruesAnswer> | null, now = new Date(), alerte?: Alerte, fords?: Fords): string {
  const d = data?.value;
  const url = `${origin}/crues`;
  const read = data ? readAt(data.fetchedAt, now).de : "";
  const v = d?.vigilance_crues;

  const status = !d ? loading("La vigilance crues") : floodVigilance(v, read) + floodLevels(d.stations, read);
  const advice = `<p class="note">Pluies fortes ou crue : ne jamais traverser un radier submergé ni une ravine en eau, à pied ou en voiture. Vigilance pluies de Météo-France : <a href="/vigilance">la vigilance zone par zone</a>.</p>`;

  // The rivers under vigilance, the worst first; Vigicrues Réunion's order within a colour.
  const rivers = [...(v?.rivieres ?? [])].sort((a, b) => FLOOD_ORDER.indexOf(a.couleur) - FLOOD_ORDER.indexOf(b.couleur));
  const riverLi = (r: { nom: string; couleur: string; precedente: string }) =>
    `<li><span>${esc(r.nom)}${r.couleur !== r.precedente ? `<small>(${esc(r.precedente)} au bulletin précédent)</small>` : ""}</span> <span>${floodBadge(r.couleur)}</span></li>`;
  const allGreen = rivers.length > 0 && rivers.every((r) => r.couleur === "vert");
  const riverList = !rivers.length
    ? ""
    : allGreen
      ? `<details class="card"><summary>Les ${rivers.length} rivières suivies, toutes au vert d'après Vigicrues Réunion</summary><ul class="rows eau">${rivers.map(riverLi).join("")}</ul></details>`
      : `<div class="card"><ul class="rows eau">${rivers.map(riverLi).join("")}</ul></div>`;

  // A group's colour, only when every river of the vigilance with that name agrees (the grande and the petite rivière
  // Saint-Jean have one gauge between them) and it is not green.
  const colourOf = (riviere: string) => {
    const same = [...new Set(rivers.filter((r) => riverCore(r.nom) === riverCore(riviere)).map((r) => r.couleur))];
    return same.length === 1 && same[0] !== "vert" ? same[0] : undefined;
  };
  // By river, in the order of the gauges (round the island).
  const groups = d ? [...new Set(d.stations.map((s) => s.riviere))].map((riviere) => ({ riviere, stations: d.stations.filter((s) => s.riviere === riviere) })) : [];
  const gauges = d
    ? `<ul class="zones">${groups.map((g) => {
        const c = colourOf(g.riviere);
        return `<li class="card"><h3>${esc(g.riviere)}${c ? ` ${floodBadge(c)}` : ""}</h3><ul class="rows eau">${g.stations.map((s) => gaugeRow(s, read)).join("")}</ul></li>`;
      }).join("")}</ul>`
    : "";

  const place = new Map(vigicrues.STATIONS.map((s) => [s.nom, s]));
  // The rising ones drawn last, over their neighbours.
  const markers: Marker[] = (d?.stations ?? []).map((s) => ({ s, kind: !upToDate(s) ? "muette" as const : s.tendance_30_min === "en hausse" ? "hausse" as const : "calme" as const }))
    .sort((a, b) => GAUGE_RANK[a.kind] - GAUGE_RANK[b.kind]).flatMap(({ s, kind }) => {
    const at = place.get(s.station);
    if (!at) return [];
    const line = gaugeValue(s) ?? (unpublished(s) ? vigicrues.NONE_PUBLISHED : `pas de mesure dans la lecture ${read}`);
    const where = `${s.station} · ${s.commune}`;
    return [{ lon: at.lon, lat: at.lat, label: kind === "hausse" ? "↑" : "", name: `${where}\u00a0: ${line}`, round: true, hollow: kind === "muette", big: kind === "hausse", color: GAUGE_COLOR[kind], quiet: true,
      place: where, say: line, href: `#${anchorId("s", s.station)}` }];
  });

  // Its source named, which is what people search (« vigicrue reunion »; wording validated on 24/11/2026), in the title, the
  // description and the page's first line (pages.ts HOOKS): always « d'après Vigicrues », never first nor in the h1,
  // where the page would read as the official service's.
  const title = "Crues en direct à La Réunion, d'après Vigicrues · 974";
  const short = "Les crues à La Réunion (974) d'après Vigicrues Réunion : la vigilance rivière par rivière, la hauteur et le débit mesurés aux stations de la DEAL.";
  const vigilanceSaid = !v ? undefined : !v.active ? "Pas de vigilance crues en cours d'après Vigicrues Réunion : toutes les rivières suivies sont au vert." : undefined;
  const description = vigilanceSaid ? describe(`${vigilanceSaid} ${short}`, short) : short;

  const band = `${crumbBar("Crues")}
<div class="wrap intro">
  <div class="pitch">
    <p class="pill"><span class="dot"></span>Vigicrues Réunion</p>
    <h1>Crues des rivières <span class="n974">974</span></h1>
    ${status}
    ${advice}
    ${ask(`Larivyèr i mont Sin-Bénoi ? Gèt si ${url} é di amwin.`,
      `La rivière monte-t-elle à Saint-Benoît ? Lis ${url} et dis-moi si l'eau monte.`)}
  </div>
  <figure class="card mapcard">${islandMap({ markers, listed: true, label: "Carte de La Réunion (974) : les stations de mesure des rivières de la DEAL" })}
  <figcaption class="note" style="color:var(--on-night-muted)">${legende([
    { forme: "rond", couleur: GAUGE_COLOR.hausse, texte: "↑", dit: "en hausse", grand: true },
    { forme: "rond", couleur: GAUGE_COLOR.calme, dit: "stable ou en baisse" },
    { forme: "anneau", couleur: GAUGE_COLOR.muette, dit: "sans mesure récente" },
  ], esc(`© VIGICRUES, stations de la DEAL${latestGauge(d)}.`))}</figcaption></figure>
</div>`;

  const sources = d && data
    ? `<p class="note">Lu le ${esc(dayAt(data.fetchedAt))}. Le site officiel : ${lienNom(vigicrues.SOURCE.url, "vigicrues-reunion.re ↗")}.</p><p class="sources">Sources : ${esc(vigicrues.SOURCE.nom)}, ${esc(vigicrues.SOURCE.attribution)} (${esc(vigicrues.SOURCE.licence)}).</p>`
    : "";

  const body = `<section aria-labelledby="h-vigilance-crues">
  <div class="sec-h"><p class="eyebrow">Rivière par rivière</p><h2 id="h-vigilance-crues">La vigilance crues</h2>
  <p>Vigicrues Réunion, service de la DEAL, donne une couleur à chaque rivière suivie : vert, jaune, orange ou rouge. Il ne publie de bulletin qu'en vigilance jaune ou plus.</p></div>
  ${riverList}
</section>
<section aria-labelledby="h-stations-crues">
  <div class="sec-h"><p class="eyebrow">Station par station</p><h2 id="h-stations-crues">Hauteur et débit mesurés</h2>
  <p>La hauteur est lue à l'échelle de chaque station. C'est un repère propre à la station, pas la profondeur, et une valeur négative est normale. Le débit dit combien d'eau passe, en m³/s. Mesures de la DEAL Réunion, toutes les 5 minutes.</p></div>
  ${gauges}
  ${sources}
</section>
${fordsSection(fords, now)}
${connectorCta("crues_rivieres", "les rivières de l'île")}`;

  return layout(origin, { title, description, path: "/crues", jsonld: [crumbs(origin, "Crues", "/crues"), webPage(origin, "/crues", title, description, data)], alerte, vert: !!v && !v.active }, band, body);
}

/** The rivers under a flood vigilance yellow or above, the worst first. */
export const floodRaised = (d: CruesAnswer | undefined) =>
  d?.vigilance_crues?.active ? [...d.vigilance_crues.rivieres].filter((r) => FLOOD_VG[r.couleur] >= 2).sort((a, b) => FLOOD_VG[b.couleur] - FLOOD_VG[a.couleur]) : [];
// Vigicrues Réunion's colours on Météo-France's scale, for the tile's colour chip (pages.ts, `vg`).
const FLOOD_VG: Record<string, number> = { vert: 1, jaune: 2, orange: 3, rouge: 4 };

/** The home page's tile: the vigilance's colour, then what it covers or what the gauges measured lately. */
export function cruesLive(data: Cached<CruesAnswer> | null, now: Date): Live | undefined {
  const d = data?.value;
  if (!d) return undefined;
  const raised = floodRaised(d);
  if (raised.length) return lue({ valeur: vg(FLOOD_VG[raised[0].couleur]), detail: esc(`${raised.slice(0, 2).map((r) => r.nom).join(", ")}${raised.length > 2 ? "…" : ""}`) }, data!, now);
  const fresh = d.stations.filter(upToDate);
  const rising = fresh.filter((s) => s.tendance_30_min === "en hausse");
  const levels = !fresh.length
    ? "Aucune station n'a de mesure récente"
    : rising.length
      ? `En hausse : ${rising.slice(0, 2).map((s) => s.station).join(", ")}${rising.length > 2 ? "…" : ""}`
      : `Aucune des ${fresh.length} stations à jour en hausse`;
  return lue({ valeur: d.vigilance_crues ? vg(1) : "Vigilance non lue", detail: esc(levels) }, data!, now);
}
