/**
 * The map at the top of /meteo: every station that measured, one measure at a time (temperature, rain of the last
 * hour, wind), and under the temperatures a veil estimated between the stations with the altitude, drawn by the
 * page's script from a small grid of the island's altitudes (scripts/build-altitudes.py). Under the wind, particles
 * carried by a wind estimated between the anemometers, on a veil of its speed. The points are the measures; the veils
 * and the particles, estimates, say so in their legends.
 */
import { INSEE } from "../places/insee.js";
import { sun } from "../providers/calendrier.js";
import altitudes from "./altitudes.json" with { type: "json" };
import { fr } from "../tools/format.js";
import type { StationNow } from "./data.js";
import { apart, esc, H, islandMap, KM, project, W } from "./map.js";
import { CLASSES, PATH as PLUIE_RADAR } from "./pluie-radar.js";
import { chip, deg, hm, metres, shortName, stationId, STOPS, thin } from "./pages.js";
import { hash } from "./pwa.js";
import { DUREES, PATHS as REJEU_PATHS } from "./rejeu.js";

const COMMUNE_OF_INSEE = new Map(Object.entries(INSEE).map(([nom, code]) => [code, nom]));

/** The commune of a Météo-France station, from the INSEE code its id starts with. */
export const inseeCommune = (id: string) => COMMUNE_OF_INSEE.get(id.slice(0, 5));

/** The commune of a station: from its INSEE code for Météo-France, else the nearest Météo-France station's. */
export function communeOf(s: StationNow, all: StationNow[]): string | undefined {
  const own = (x: StationNow) => (x.source === "meteofrance" && x.id ? inseeCommune(x.id) : undefined);
  if (own(s)) return own(s);
  const near = all.filter((x) => own(x)).sort((a, b) => Math.hypot(a.lon - s.lon, a.lat - s.lat) - Math.hypot(b.lon - s.lon, b.lat - s.lat))[0];
  return near && own(near);
}

const by = (s: StationNow) =>
  s.source === "meteofrance" ? " par Météo-France" : s.source === "metar" ? " par l'aéroport (METAR)" : s.source === "pioupiou" ? ` par OpenWindMap (${s.nom.replace(/^Balise /, "balise de ")})` : s.source === "ffvl" ? ` par la FFVL (${s.nom.replace(/^B/, "b")})` : "";

// Where the wind comes from, in words: abbreviations read badly (« vent O » as « vent 0 »).
const FROM = ["du nord", "du nord-est", "d'est", "du sud-est", "du sud", "du sud-ouest", "d'ouest", "du nord-ouest"];

/** A tile's wind: an arrow where it goes, the speed; the whole said to a screen reader and on hover. */
export function windPill(s: StationNow): string {
  const said = ventText(s);
  if (!said) return "";
  const arrow = s.direction != null && s.vent ? `<svg class="ar" viewBox="0 0 16 16" style="transform:rotate(${(s.direction + 180) % 360}deg)"><path d="M8 14V3M4 7l4-4 4 4"/></svg>` : "";
  return `<span class="pl" title="${esc(said)}"><span aria-hidden="true">${arrow}${thin(`${s.vent} km/h`)}</span><span class="sr">${esc(said)}</span></span>`;
}

/** A tile's rain: of the last hour, else of the last 6 minutes; blue while it rains. */
export function rainPill(s: StationNow): string {
  const v = s.pluie_1h ?? s.pluie_6min;
  if (v == null) return "";
  const hour = s.pluie_1h != null;
  const said = thin(v > 0 ? `${fr(v)} mm de pluie ${hour ? "dans l'heure" : "en 6\u202fmin"}` : `pas de pluie mesurée ${hour ? "depuis 1\u202fh" : "en 6\u202fmin"}`);
  return `<span class="pl${v > 0 ? " wet" : ""}" title="${esc(said)}"><span aria-hidden="true"><svg class="dr" viewBox="0 0 16 16"><path d="M8 2C6 5 4 7.5 4 10a4 4 0 0 0 8 0c0-2.5-2-5-4-8z"/></svg>${thin(`${fr(v)} mm`)}</span><span class="sr">${esc(said)}</span></span>`;
}

/** « vent d'est 12 km/h, rafales 20 km/h ». */
export function ventText(s: StationNow): string | undefined {
  if (s.vent == null) return undefined;
  const from = s.direction != null ? `${FROM[Math.round(s.direction / 45) % 8]} ` : "";
  return thin(`vent ${from}${s.vent} km/h${s.rafales != null ? `, rafales ${s.rafales} km/h` : ""}`);
}

// Rain of the last hour: deeper blue as it rains harder, from these mm (the replay's script draws the same).
const RAIN_STEPS: [number, string][] = [[10, "#1b3f8f"], [4, "#2456b8"], [1, "#3a73d0"], [0, "#5b8fd8"]];
const RAIN_DRY = "#7d93a8";
function rainColor(mm: number): string {
  return RAIN_STEPS.find(([v]) => mm >= v)![1];
}

// The veil's colours by temperature, lighter than the dots' (chip()), from the same 8 to 33 °C.
const VEIL: [number, number[]][] = [[8, [42, 106, 154]], [17, [36, 140, 120]], [24, [214, 168, 40]], [28, [222, 112, 40]], [33, [200, 48, 28]]];
// The radar's rain, class 1 to 8 (web/pluie-radar.ts), in four blues going to violet, a step every two classes: darker
// as it rains harder in the light theme, lighter in the dark one, opaque, never red nor orange (the alerts'); a line
// around it in the drops' colour sets its lightest blue apart from the sea (researcher, 31/10/2026: four steps read
// alone, the drops 3.5:1 at least on each; the user, « délimiter plus franchement les zones de pluie, plus opaque »).
const RAIN_TIERS = { light: ["#abd8f3", "#7cb5f8", "#738be9", "#7561c5"], dark: ["#284972", "#405a9d", "#6469c3", "#8c79e0"] };
const RAIN_INK = { light: "#0b1a3a", dark: "#ffffff" };
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Each class's blue as [red, green, blue, opacity], light theme then dark; the drops' and the line's colour.
const RAIN_RGBA = (["light", "dark"] as const).map((t) => Array.from({ length: 8 }, (_, c) => [...rgbOf(RAIN_TIERS[t][c >> 1]), 1]));
const INK_RGB = [rgbOf(RAIN_INK.light), rgbOf(RAIN_INK.dark)];
/**
 * How the drops move, three proposals to choose from (the user, 31/10/2026): M1, falling down the screen, leaning with
 * the wind's east-west part; M2, seen from above, short strokes going where the wind goes; M3, M2 with a small splash
 * where some end. And whether they fall during a replay (researcher: two motions at once say little).
 */
type Motion = "M1" | "M2" | "M3";
const MOTION: Motion = "M2";
const REPLAY_DROPS = true;
// Where the rain starts, in its first class spread between the cells (0.5: half way to a dry one; lower keeps a lone
// light cell from shrinking away); how much its edges are rounded, in pixels of the radar's grid spread 4 times.
const RAIN_CUT = 0.4;
const RAIN_SOFT = 1;
// The wind's colours by speed, in km/h, after the usual wind maps: blue when calm, red in a storm.
const WIND: [number, number[]][] = [[0, [70, 104, 176]], [10, [46, 150, 172]], [20, [74, 170, 98]], [30, [222, 184, 62]], [45, [222, 112, 46]], [60, [178, 44, 72]]];
const STOPS_LO = VEIL[0][0];
const STOPS_HI = VEIL[VEIL.length - 1][0];
const HIT = 66;

/** The island's altitudes on a small grid (scripts/build-altitudes.py), a file of public/; its address changes with it. */
export const ALT_PATH = `/altitudes-${altitudes.v}.png`;
/** Under the stations' sources: the altitudes of the colours estimated between them. */
export const ALTITUDES_CREDIT = { source: "IGN, RGE ALTI, pour les altitudes des couleurs estimées", licence: "Licence Ouverte 2.0", attribution: "IGN, RGE ALTI" };
/** And the radar's rain of the rain layer (web/pluie-radar.ts). */
export const RADAR_CREDIT = { source: "Météo-France, lame d'eau radar, pour la pluie estimée", licence: "Licence Ouverte 2.0", attribution: "Météo-France" };

/** The middle of the island: a coast's side and its sea are told from it. */
const MIDDLE = { lon: 55.53, lat: -21.13 };
/** A coast's anemometer: this high at most. */
const COAST_M = 150;

/**
 * The land breeze: at night, the air cooled on the slopes flows down to the sea. Said when the coast's anemometers blow
 * towards the sea on two sides of the island at least (most of a side's): by day the trade wind blows seaward too, but
 * on the west coast only. A side is a quarter of the island seen from its middle (north, east, south, west); a coast's
 * sea, straight away from the middle; seaward, a wind that goes within 60° of it. The night, the latest measure's,
 * between sunset and sunrise.
 */
export function landBreeze(list: StationNow[]): boolean {
  const live = list.filter((s) => !s.stale);
  const latest = live.reduce((m, s) => (s.time > m ? s.time : m), "");
  if (!latest) return false;
  const t = Date.parse(latest);
  const { lever, coucher } = sun(new Date(t + 4 * 3600_000).toISOString().slice(0, 10), MIDDLE.lon, MIDDLE.lat);
  if (t >= lever.getTime() && t <= coucher.getTime()) return false;
  // Seaward and all the coast's winds, by side.
  const sides = [0, 1, 2, 3].map(() => [0, 0]);
  const k = Math.cos((MIDDLE.lat * Math.PI) / 180);
  for (const s of live) {
    if (s.altitude_m > COAST_M || !s.vent || s.direction == null) continue;
    const x = (s.lon - MIDDLE.lon) * k, y = s.lat - MIDDLE.lat, a = (s.direction * Math.PI) / 180;
    // The wind goes the other way from where it comes: (-sin, -cos) east and north.
    const sea = (-Math.sin(a) * x - Math.cos(a) * y) / Math.hypot(x, y) >= 0.5;
    const side = sides[Math.round((((Math.atan2(x, y) * 180) / Math.PI + 360) % 360) / 90) % 4];
    side[1]++;
    if (sea) side[0]++;
  }
  return sides.filter(([n, all]) => n * 2 > all).length >= 2;
}

// The stations whose value the map writes: the tour of the island; the others are dots, told on hover or tap.
const NAMED = new Set(["97418110", "97407520", "97415590", "97416463", "97417360", "97410238", "97419350", "97422440", "97424410", "97415566"]);

/**
 * A disc's radius for its figure (dot()), the figure always 30 units high: 34 up to 3 characters; beyond, wide enough
 * for 3 px of disc around the figure at 390 px inside its white edge (« 12,3 » is 74 units wide, « 104,5 » 95, measured
 * in WebKit; marketing's review n° 457). Without a figure, a small dot.
 */
export const discR = (label?: string) => (!label ? 17 : label.length <= 3 ? 34 : label.length === 4 ? 49 : 59);

/** A dot of one layer (`l`): a disc with its value, or a small one without, told by the bubble. */
function dot(l: string, x: number, y: number, fill: string, label: string | undefined, hollow = false): string {
  const r = discR(label);
  const shape = hollow
    ? `<circle class="sh l-${l}" cx="${x}" cy="${y}" r="${r - 3}" style="fill:#fff;stroke:${fill};stroke-width:5"/>`
    : `<circle class="sh l-${l}" cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
  return shape + (label ? `<text class="mv l-${l}" x="${x}" y="${y + 11}">${esc(label)}</text>` : "");
}

/** A wind pill's width, as windMark() draws it. */
const WIND_W = 96;

/** A wind measure on the map: an arrow where it goes and the speed in km/h, in a dark pill over the particles; at `at` when moved off its place. */
function windMark(x0: number, y0: number, s: StationNow, at?: [number, number]): string {
  const [x, y] = at ?? [x0, y0];
  const arrow = s.direction != null && s.vent
    ? `<path d="M0 10V-10M-7-3l7-7 7 7" transform="translate(${x - 22} ${y}) rotate(${(s.direction + 180) % 360})"/>`
    : `<circle cx="${x - 22}" cy="${y}" r="5"/>`;
  return `<g class="sh l-v wv"><rect x="${x - 46}" y="${y - 24}" width="96" height="48" rx="24"/>${arrow}<text x="${x + 18}" y="${y + 11}">${s.vent}</text></g>`;
}

/**
 * One link per station for every layer, each drawing its own dot (`l-t`, `l-p`, `l-v`, shown by the page's CSS) and
 * giving the bubble its value (`data-tvt`, `data-tvp`, `data-tvv`); a station without a measure of the layer shown is
 * hidden (`has-…`). Its name for a screen reader says every measure.
 */
function station(s: StationNow, named: boolean, rain: number | undefined, hour: boolean, windAt?: [number, number], rainAt?: [number, number]): string {
  const [x, y] = project(s.lon, s.lat);
  const [rx, ry] = rainAt ?? [x, y];
  const span = hour ? "1\u202fh" : "6\u202fmin";
  const v = {
    t: s.temperature != null ? thin(deg(s.temperature)) : undefined,
    p: rain == null ? undefined : rain > 0 ? thin(`${fr(rain)} mm en ${span}`) : thin(`pas de pluie mesurée en ${span}`),
    v: ventText(s),
  };
  const has = Object.entries(v).filter(([, x]) => x).map(([k]) => ` has-${k}`).join("");
  const place = `${shortName(s.nom)} · ${metres(s.altitude_m)}`;
  const said = `${place} : ${[v.t, v.p, v.v].filter(Boolean).join(", ")}, mesures de ${hm(s.time)}${by(s)}, voir le détail`;
  const shapes =
    (s.temperature != null ? dot("t", x, y, chip(s.temperature), named ? `${Math.round(s.temperature)}°` : undefined) : "") +
    (rain != null ? (rain > 0 ? dot("p", rx, ry, rainColor(rain), rainSaid(rain, named) ? rainFigure(rain) : undefined) : dot("p", x, y, RAIN_DRY, undefined, true)) : "") +
    (s.vent != null ? windMark(x, y, s, windAt) : "");
  const data = Object.entries(v).map(([k, x]) => (x ? ` data-tv${k}="${esc(x)}"` : "")).join("");
  return `<a class="mk${has}" href="#${stationId(s.nom)}" aria-label="${esc(said)}" data-tp="${esc(place)}" data-td="mesurée à\u00a0${hm(s.time)}${esc(by(s))}"${data}>` +
    `<circle class="hit" cx="${x}" cy="${y}" r="${named ? HIT : HIT / 2}" style="fill:transparent;stroke:none"/>${shapes}</a>`;
}

/** A rain disc with its figure (dot()): at a named station, or from 1 mm; the others are small dots, told by the bubble. */
const rainSaid = (rain: number, named: boolean) => named || rain >= 1;

/** A rain disc's figure: mm to a tenth. */
const rainFigure = (rain: number) => fr(Math.round(rain * 10) / 10);

/** For each mark moved off its place (apart()): a white line on a night edge, to the mark (under it), and a white dot on its place (marketing). */
function ties(list: StationNow[], placed: [number, number][]): string {
  return list.map((s, i) => {
    const [x0, y0] = project(s.lon, s.lat), [x, y] = placed[i];
    const line = (c: string) => `<line class="${c}" x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/>`;
    return Math.hypot(x - x0, y - y0) > 1 ? `${line("o")}${line("i")}<circle cx="${x0}" cy="${y0}" r="9"/>` : "";
  }).join("");
}

export function stationsMap(list: StationNow[], altPath = ALT_PATH): string {
  // The rain of the last hour; of the last 6 minutes where no station has the hour yet (a copy just after a restart).
  const hour = list.some((s) => s.pluie_1h != null);
  const mm = (s: StationNow) => (hour ? s.pluie_1h : s.pluie_6min);
  const t = list.filter((s) => s.temperature != null);
  const nRain = list.filter((s) => mm(s) != null).length;
  const latest = list.reduce((m, s) => (s.time > m ? s.time : m), "");
  const named = (s: StationNow) => NAMED.has(s.id ?? "");
  const w = list.filter((s) => s.vent != null);
  // No wind pill covers another (two beacons a few hundred metres apart): those that would are moved apart, each tied
  // to its place by a line and a dot, under every pill, as the home page's (map.ts, apart()); side by side rather than
  // one above the other, which would take the room of « Saint-Paul » on a phone.
  const placed = apart(w.map((s) => ({ lon: s.lon, lat: s.lat, label: "", name: s.nom })), w.map(() => WIND_W), 3);
  const windAt = new Map(w.map((s, i) => [s, placed[i]]));
  const windTies = ties(w, placed);
  // No rain disc with its figure covers another (four over each other in the middle of the island under the rain of
  // 31/10 at 10:23, marketing's review): moved apart and tied to their place the same way (#607's rounds). The small
  // dots stay on their place.
  const r = list.filter((s) => (mm(s) ?? 0) > 0 && rainSaid(mm(s)!, named(s)));
  // Each at its own size: a disc of 4 characters is wider.
  const across = r.map((s) => 2 * discR(rainFigure(mm(s)!)));
  // The small dots stay on their place, left free (a dot half under a disc reads as a smudge, and is hard to touch).
  // Their radius with the white edge: 17 and 2 (dot()).
  const dots = list.filter((s) => mm(s) != null && !r.includes(s)).map((s): [number, number, number] => [...project(s.lon, s.lat), 19]);
  const rainPlaced = apart(r.map((s) => ({ lon: s.lon, lat: s.lat, label: "", name: s.nom, round: true })), across, 1, across, dots);
  const rainAt = new Map(r.map((s, i) => [s, rainPlaced[i]]));
  const rainTies = ties(r, rainPlaced);
  // The named ones last, over the dots.
  const drawn = list.filter((s) => s.temperature != null || mm(s) != null || s.vent != null);
  // The replay's dots, its date, time and what they are (measured or estimated), on the sea at the bottom left, the
  // widest off the coast; shown only while it plays (REJEU_JS).
  const top = `<g class="sts">${windTies ? `<g class="l-v wt" aria-hidden="true">${windTies}</g>` : ""}${rainTies ? `<g class="l-p wt" aria-hidden="true">${rainTies}</g>` : ""}` +
    `${[...drawn].sort((a, b) => Number(named(a)) - Number(named(b))).map((s) => station(s, named(s), mm(s), hour, windAt.get(s), rainAt.get(s))).join("")}</g>` +
    `<g class="rj-st"></g><g class="rj-t" aria-hidden="true"><text class="rj-d" x="24" y="782"></text><text class="rj-h" x="24" y="846"></text><text class="rj-s" x="24" y="886"></text></g>`;
  // The veil's data: each station's place on the map, altitude and temperature; the script does the rest.
  const voile = JSON.stringify(t.map((s) => [...project(s.lon, s.lat), s.altitude_m, s.temperature]));
  // A canvas rather than an image: the site's policy lets no picture be made in the page (img-src 'self').
  // The wind's data: each anemometer's place and where its wind goes, in km/h along the map's x and y (y down).
  // A wind without its direction says nothing of where the air goes: left out (a calm is a measure, and stays).
  const wd = w.filter((s) => s.direction != null || s.vent === 0);
  const vent = JSON.stringify(wd.map((s) => {
    const a = ((s.direction ?? 0) * Math.PI) / 180, v = s.vent!;
    return [...project(s.lon, s.lat), Math.round(-Math.sin(a) * v * 10) / 10, Math.round(Math.cos(a) * v * 10) / 10];
  }));
  const fo = (l: string, canvas: string) => `<foreignObject class="l-${l}" width="${W}" height="${H}" clip-path="url(#isl-clip)">${canvas}</foreignObject>`;
  const overlay = fo("t", `<canvas class="voile" data-voile="${esc(voile)}" data-alt="${esc(altPath)}" width="1" height="1"></canvas>`) +
    (nRain ? fo("p", `<div class="vt"><canvas class="voile" data-pluie="${PLUIE_RADAR}" data-alt="${esc(altPath)}" width="1" height="1"></canvas><canvas class="flux" width="1" height="1"></canvas></div>`) : "") +
    (wd.length ? fo("v", `<div class="vt"><canvas class="voile" data-vent="${esc(vent)}" data-alt="${esc(altPath)}" width="1" height="1"></canvas><canvas class="flux" width="1" height="1"></canvas></div>`) : "");
  const n = (k: number, one: string, many: string) => `${k} ${k > 1 ? many : one}`;
  // A tab and a legend per measure that at least one station has; the first shown without a choice.
  const layers = [
    t.length && { id: "t", tab: "Température", legend: `<span class="lgs">${thin(deg(STOPS_LO))}<i class="vgrad"></i>${thin(deg(STOPS_HI))}</span>${n(t.length, "station", "stations")}, température mesurée sous abri, la plus récente à ${hm(latest)}. Entre les stations, les couleurs sont <b>estimées selon l'altitude</b> : ce n'est pas une mesure.` },
    nRain && { id: "p", tab: hour ? "Pluie 1 h" : "Pluie 6 min", legend: `${n(nRain, "pluviomètre", "pluviomètres")}, ${hour ? "pluie de la dernière heure en mm" : "pluie des 6 dernières minutes seulement, en mm"}, la plus récente à ${hm(latest)}${hour ? "" : " : l'heure complète n'est pas encore disponible"}. Point blanc : pas de pluie mesurée. <span data-radar hidden></span>` },
    w.length && { id: "v", tab: "Vent", legend: `<span class="lgs">0<i class="vgrad wgrad"></i>${thin("60 km/h")}</span>${n(w.length, "anémomètre", "anémomètres")}, vent moyen mesuré en km/h, le plus récent à ${hm(latest)}. La flèche montre où va le vent (un vent d'est vient de l'est).${landBreeze(list) ? " La nuit, l'air descend des pentes vers la mer (brise de terre)." : ""} Entre les stations, le mouvement et les couleurs sont <b>estimés</b> à partir des stations voisines : ce n'est pas une mesure.` },
  ].filter((l): l is { id: string; tab: string; legend: string } => !!l);
  const tabs = `<div class="tabs aqtabs" role="radiogroup" aria-label="Mesure affichée sur la carte">` +
    layers.map((l, i) => `<input type="radio" name="wxl" id="wxl-${l.id}"${i ? "" : ' class="on" checked'}><label for="wxl-${l.id}">${l.tab}</label>`).join("") + `</div>`;
  // Each legend, and the replay's in its place while it plays.
  const legend = layers.map((l, i) => `<span class="lg lg-${l.id}${i ? "" : " on"}"><span class="lg-now">${l.legend}</span><span class="rj-lg"></span></span>`).join("");
  const replay = layers.length ? replayBar(latest) : "";
  const bubble = `<a class="mtip" data-mtip hidden aria-hidden="true" tabindex="-1" href="#stations"><span class="mt-p"></span><b class="mt-v"></b><span class="mt-d"></span><span class="mt-go">Voir la station →</span></a>`;
  return `<figure class="card mapcard airmap wxmap">${tabs}` +
    islandMap({ under: overlay, top, peaks: true, label: `Carte de La Réunion (974) : les ${drawn.length} stations météo et leur dernière mesure, à ${hm(latest)}` }) +
    bubble + `<figcaption class="note">${legend}${replay}</figcaption></figure>`;
}

/** The replay bar's words (marketing): each length, and the button's full name for it. */
const REVOIR: Record<(typeof DUREES)[number], [string, string]> = {
  "6h": ["6\u00a0h", "Lire les 6\u00a0dernières heures"],
  "24h": ["24\u00a0h", "Lire les 24\u00a0dernières heures"],
  "7j": ["7\u00a0jours", "Lire les 7\u00a0derniers jours"],
};

/**
 * Under the map, the replay bar: a length to choose, a button to play and pause, the slider of the moment shown. Hidden
 * without a script; the page's own (METEO_SCRIPT) shows it, and asks REJEU_JS and the length's file on the first touch.
 * `fin`: the latest measure, where the bar ends.
 */
function replayBar(fin: string): string {
  const radios = DUREES.map((d) => `<input type="radio" name="rjd" id="rjd-${d}" value="${d}"><label for="rjd-${d}">${REVOIR[d][0]}</label>`).join("");
  return `<div class="rj" data-rejeu="${rejeuScriptPath()}" data-fin="${esc(fin)}" hidden><fieldset class="tabs"><legend>Revoir :</legend>${radios}</fieldset>` +
    `<button type="button" class="rj-b" aria-label="${REVOIR["6h"][1]}">▶ Lire</button>` +
    `<input type="range" min="0" max="1" step="any" value="1" aria-label="Moment affiché sur la carte" hidden><span class="rj-q" hidden></span>` +
    `<span class="rj-ko" hidden>L'historique n'a pas pu être chargé : la carte reste sur la dernière mesure. <button type="button">Réessayer</button></span>` +
    `<span class="sr" aria-live="polite"></span></div>`;
}

/**
 * The veil, computed in the browser: the altitude explains most of it, the stations the rest (inverse distance). For
 * the replay (RJ.t): the grid of any set of stations, drawn alone or mixed with another's.
 */
const VOILE_SCRIPT = `const vo=document.querySelector("[data-voile]");if(vo){const st=JSON.parse(vo.dataset.voile),im=new Image();im.onload=()=>{
const w=im.width,h=im.height,c=vo;c.width=w;c.height=h;const g=c2d(c);g.drawImage(im,0,0);const a=g.getImageData(0,0,w,h).data,S=${JSON.stringify(VEIL)};
const col=(t)=>{let i=0;while(i<S.length-2&&t>S[i+1][0])i++;const[[t0,c0],[t1,c1]]=[S[i],S[i+1]],f=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));return c0.map((v,j)=>v+(c1[j]-v)*f)};
// The temperature of each cell from a set of stations [x, y, altitude, °C]: the altitude's line through them, the rest by inverse distance.
const grid=(st)=>{const n=st.length;if(!n)return null;let sz=0,st2=0,sz2=0,szt=0;st.forEach(([,,z,t])=>{sz+=z;st2+=t;sz2+=z*z;szt+=z*t});let b=(n*szt-sz*st2)/(n*sz2-sz*sz);if(!(b<-.003&&b>-.01))b=-.0065;const k=(st2-b*sz)/n;
const p=st.map(([x,y,z,t])=>[x*w/${W},y*h/${H},t-(k+b*z)]),T=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,v=a[i*4];if(!v)continue;let sw=0,sr=0;
for(const[px,py,r]of p){const q=1/((px-x)**2+(py-y)**2+.5);sw+=q;sr+=q*r}T[i]=k+b*(v-1)*${altitudes.pas_m}+sr/sw}return T};
const o=g.createImageData(w,h),M=new Float32Array(w*h),paint=(T)=>{for(let i=0;i<w*h;i++){if(!a[i*4])continue;if(!T){o.data[i*4+3]=0;continue}const[R,G,B]=col(T[i]);o.data[i*4]=R;o.data[i*4+1]=G;o.data[i*4+2]=B;o.data[i*4+3]=215}g.putImageData(o,0,0)};
const now=grid(st);paint(now);RJ.t={live:st,now,grid,show:paint,mix:(A,B,f)=>{for(let i=0;i<w*h;i++)M[i]=A[i]+(B[i]-A[i])*f;paint(M)},back:()=>paint(now)}};im.src=vo.dataset.alt}`;

/** One frame of the animations and of the replay, in ms: 30 frames a second. */
const FRAME_MS = 1000 / 30;

/**
 * A frame every FRAME_MS (1000 / 30, written out: the page's scripts take this function as its text), for a rAF
 * callback at the time `t`, `last` the previous frame's time and `nx` the next's: null when it is too soon, else the
 * time gone by in frames, how far things move, and the next frame's time. A frame is drawn as soon as its time is
 * within 8 ms, so that a screen's 60 Hz, never quite even, gives every other frame of its own (a frame at 32 ms at
 * least drew one in four instead, 15 a second, 31/10/2026), and a frame late by more than one starts the count again.
 */
export const pace = (t: number, last: number, nx: number): [number, number] | null => {
  if (t < nx - 8) return null;
  return [last ? Math.min(t - last, 100) / (1000 / 30) : 1, t - nx > 1000 / 30 ? t + 1000 / 30 : nx + 1000 / 30];
};
/** The step of a script's rAF callback that has `pace`, `t`, `last` and `nx`: `k`, how far things move. */
const STEP = `const p=pace(t,last,nx);if(!p)return;const k=p[0];nx=p[1];last=t;`;

/**
 * What the wind and the rain share in the browser: a canvas animated 30 frames a second (STEP), only while its layer
 * is shown, the map on screen and the tab in front; drawn again when the map's width changes (a phone's address bar
 * that hides changes its height alone); one still picture for those who ask for less motion, or when nothing moves
 * (`o.moving()`). `o.ready()` says when its data has come; the function returned, called then, starts it; `o.again()`
 * draws it all again, for the replay's images.
 */
const ANIM = `const anim=(o)=>{const inp=document.getElementById(o.id);let run=false,seen=false,raf=0,last=0,nx=0,cw=0;
const pace=${pace},loop=(t)=>{raf=requestAnimationFrame(loop);${STEP}o.frame(k)};
const go=()=>{const on=inp&&inp.checked&&seen&&!document.hidden&&o.ready();if(on&&!run){run=true;last=nx=0;const r=o.fl.getBoundingClientRect();cw=Math.round(r.width);o.size(r);
if(o.moving&&!o.moving()||o.held&&o.held()||matchMedia("(prefers-reduced-motion: reduce)").matches){o.still();return}raf=requestAnimationFrame(loop)}else if(!on&&run){run=false;cancelAnimationFrame(raf)}};
new IntersectionObserver((e)=>{seen=e[0].isIntersecting;go()}).observe(o.fl.closest("figure"));document.addEventListener("visibilitychange",go);
document.querySelectorAll("[name=wxl]").forEach((i)=>i.addEventListener("change",go));addEventListener("resize",()=>{if(run&&Math.round(o.fl.getBoundingClientRect().width)!==cw){run=false;cancelAnimationFrame(raf);go()}});
o.again=()=>{if(run){run=false;cancelAnimationFrame(raf)}go()};return go};`;


/**
 * The wind, in the browser: the anemometers' winds spread on the altitudes' grid by inverse distance, coloured by speed
 * (the veil, drawn once), and particles carried by it, leaving a trail (the second canvas, one pixel a CSS pixel:
 * at the screen's full resolution the fading of the trails cost a slow phone three times as much). A number of
 * particles bound to the map's size; a picture of arrows for those who ask for less motion. For the replay (RJ.v): the
 * field of any set of anemometers, drawn alone or mixed with another's, cell by cell.
 */
const VENT_SCRIPT = `const ve=document.querySelector("[data-vent]");if(ve){const st=JSON.parse(ve.dataset.vent),fl=ve.nextElementSibling,im=new Image();
let w=0,h=0,U,V,M,land=[],ps=[],cw=0,ch=0,g;const S=${JSON.stringify(WIND)};
const col=(t)=>{let i=0;while(i<S.length-2&&t>S[i+1][0])i++;const[[t0,c0],[t1,c1]]=[S[i],S[i+1]],f=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));return c0.map((v,j)=>v+(c1[j]-v)*f)};
const at=(x,y)=>{const gx=Math.min(w-1.001,Math.max(0,x*w/${W}-.5)),gy=Math.min(h-1.001,Math.max(0,y*h/${H}-.5)),i=gx|0,j=gy|0,fx=gx-i,fy=gy-j,k=j*w+i;
const m=(A)=>(A[k]*(1-fx)+A[k+1]*fx)*(1-fy)+(A[k+w]*(1-fx)+A[k+w+1]*fx)*fy;return[m(U),m(V)]};
const on_=(x,y)=>M[(Math.min(h-1,y*h/${H}|0))*w+Math.min(w-1,x*w/${W}|0)];
const born=(p)=>{const c=land[(Math.random()*land.length)|0];p.x=(c%w+Math.random())*${W}/w;p.y=((c/w|0)+Math.random())*${H}/h;p.a=(Math.random()*80)|0};
const o={fl,id:"wxl-v",ready:()=>land.length,
size:(r)=>{cw=fl.width=Math.max(1,Math.round(r.width));ch=fl.height=Math.max(1,Math.round(r.height));g=c2d(fl);
const n=Math.min(900,Math.round(r.width*r.height/150));ps=[];for(let i=0;i<n;i++){const p={};born(p);ps.push(p)}},
still:()=>{g.clearRect(0,0,cw,ch);g.strokeStyle="rgba(255,255,255,.9)";g.lineWidth=1.5;g.lineCap="round";const e=22*w/cw;
for(let j=e/2;j<h;j+=e)for(let i=e/2;i<w;i+=e){if(!M[(j|0)*w+(i|0)])continue;const[u,v]=at(i*${W}/w,j*${H}/h),q=Math.hypot(u,v);if(q<.5)continue;
const X=i*cw/w,Y=j*ch/h,dx=u/q*8,dy=v/q*8,a=Math.atan2(dy,dx);g.beginPath();g.moveTo(X-dx,Y-dy);g.lineTo(X+dx,Y+dy);
g.lineTo(X+dx-5*Math.cos(a-.5),Y+dy-5*Math.sin(a-.5));g.moveTo(X+dx,Y+dy);g.lineTo(X+dx-5*Math.cos(a+.5),Y+dy-5*Math.sin(a+.5));g.stroke()}},
frame:(k)=>{const s=cw/${W};g.globalCompositeOperation="destination-in";g.fillStyle="rgba(0,0,0,.94)";g.fillRect(0,0,cw,ch);g.globalCompositeOperation="source-over";
g.strokeStyle="rgba(255,255,255,.9)";g.lineWidth=Math.max(1.2,cw/330);g.beginPath();
for(const p of ps){const[u,v]=at(p.x,p.y),x=p.x+u*.3*k,y=p.y+v*.3*k;if((p.a+=k)>100||x<0||y<0||x>=${W}||y>=${H}||!on_(x,y)){born(p);continue}g.moveTo(p.x*s,p.y*s);g.lineTo(x*s,y*s);p.x=x;p.y=y}g.stroke()}};const go=anim(o);
// The field of a set of anemometers [x, y, u, v]: the live ones, or those of a round hour of the replay.
let A,x;const field=(sx)=>{const p=sx.map(([X,Y,u,v])=>[X*w/${W},Y*h/${H},u,v]),u2=new Float32Array(w*h),v2=new Float32Array(w*h);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=j*w+i;let sw=0,su=0,sv=0;
for(const[px,py,u,v]of p){const q=1/((px-i)**2+(py-j)**2+.5);sw+=q;su+=q*u;sv+=q*v}if(sw){u2[k]=su/sw;v2[k]=sv/sw}}return[u2,v2]};
// The field drawn: the veil of its speed; the arrows again for those who ask for less motion, the particles following it alone.
const veil=()=>{const e=x.createImageData(w,h);for(const k of land){const[R,G,B]=col(Math.hypot(U[k],V[k]));e.data[k*4]=R;e.data[k*4+1]=G;e.data[k*4+2]=B;e.data[k*4+3]=200}x.putImageData(e,0,0);
if(g&&matchMedia("(prefers-reduced-motion: reduce)").matches)o.still()};
const set=(F)=>{if(F){U.set(F[0]);V.set(F[1])}else{U.fill(0);V.fill(0)}veil()};
im.onload=()=>{w=im.width;h=im.height;const c=ve;c.width=w;c.height=h;x=c2d(c);x.drawImage(im,0,0);A=x.getImageData(0,0,w,h).data;U=new Float32Array(w*h);V=new Float32Array(w*h);M=new Uint8Array(w*h);
for(let k=0;k<w*h;k++)if(A[k*4]){M[k]=1;land.push(k)}const now=field(st);set(now);
RJ.v={live:st,now,grid:field,show:set,mix:(F,G,f)=>{for(let k=0;k<w*h;k++){U[k]=F[0][k]+(G[0][k]-F[0][k])*f;V[k]=F[1][k]+(G[1][k]-F[1][k])*f}veil()},back:()=>set(now)};go()};im.src=ve.dataset.alt}`;

/** Where the radars saw badly on an image, cell by cell from 0 to 1 (`z`: nowhere). */
type Badly = Float32Array & { z: boolean };
/**
 * The veil between two images into `o`: with a trail, each of its images as much as it has left (the one drawn among
 * them), and the next once its time is the one shown, from half way through the fade (all of it on an image, `same`);
 * without one, the two faded. Null where nothing is seen badly. The rain's script takes it as its text.
 */
export const blend = (a: Badly, z: Badly, same: boolean, f: number, tr: [Badly, number][] | null, o: Float32Array) => {
  const fz = same ? 1 : Math.max(0, 2 * f - 1);
  let any = false;
  if (tr) {
    o.fill(0);
    if (!z.z && fz) {
      for (let k = 0; k < o.length; k++) o[k] = z[k] * fz;
      any = true;
    }
    for (const [b, w] of tr) {
      if (b.z) continue;
      any = true;
      for (let k = 0; k < o.length; k++) if (b[k] * w > o[k]) o[k] = b[k] * w;
    }
  } else {
    any = !a.z || !z.z;
    if (any) for (let k = 0; k < o.length; k++) o[k] = a[k] * (1 - f) + z[k] * f;
  }
  return any ? o : null;
};
/** The legend of a trail: how long, in minutes, the zones seen badly linger before the time shown. */
export const ago = (m: number) =>
  m === 60
    ? "au cours de l'heure précédente"
    : m % 60
      ? "au cours des " + m + "\u00a0minutes précédentes"
      : "au cours des " + m / 60 + "\u00a0heures précédentes";

/**
 * The radar's grid spread smoothly to the map's size (`s`, its red: the class times `step`) drawn in `o` in clear-cut
 * steps, one blue a class (`pal`, [red, green, blue, opacity]), with a line (`edge`) a pixel wide around the rain (from
 * `cut` of the first class), its outer side smoothed by how far each pixel is from there (the user, 31/10/2026,
 * « délimiter plus franchement les zones de pluie »). The page's script takes it as its text.
 */
export const bands = (s: Uint8ClampedArray, o: Uint8ClampedArray, w: number, h: number, pal: number[][], edge: number[], step: number, cut: number) => {
  for (let i = 0, y = 0, x = 0; i < w * h; i++, x++) {
    if (x === w) { x = 0; y++; }
    const v = s[i * 4];
    if (v < (step * cut) / 2) continue;
    const gx = (s[(x < w - 1 ? i + 1 : i) * 4] - s[(x > 0 ? i - 1 : i) * 4]) / 2;
    const gy = (s[(y < h - 1 ? i + w : i) * 4] - s[(y > 0 ? i - w : i) * 4]) / 2;
    // How far inside the rain, in pixels: below 0 outside, the line from 0 to 1, the blue past 2.
    const d = (v - step * cut) / Math.max(Math.hypot(gx, gy), 1e-3) + 0.5;
    if (d <= 0) continue;
    const f = pal[Math.max(1, Math.min(pal.length, Math.round(v / step))) - 1];
    const m = d < 1 ? 0 : Math.min(1, d - 1);
    for (let c = 0; c < 3; c++) o[i * 4 + c] = edge[c] + (f[c] - edge[c]) * m;
    o[i * 4 + 3] = (edge[3] + (f[3] - edge[3]) * m) * Math.min(1, d) * 255;
  }
  return o;
};
/**
 * The red of an image (RGBA, w by h) blurred in place, a box of 2r+1 pixels across and down, twice: the radar's cells
 * spread 4 times, then blurred, have round edges once cut (bands), never the corners of the cells. The page's script
 * takes it as its text.
 */
export const soften = (a: Uint8ClampedArray, w: number, h: number, r: number) => {
  const t = new Float32Array(w * h);
  for (let pass = 0; pass < 4; pass++) {
    const across = pass % 2 === 0, n = across ? w : h, m = across ? h : w;
    for (let j = 0; j < m; j++) {
      // The line's first cell and the step between two (no inner function: the page's copy of it would not run).
      const o = across ? j * w : j, st = across ? 1 : w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[(o + Math.max(0, Math.min(n - 1, i)) * st) * 4];
      for (let i = 0; i < n; i++) {
        t[o + i * st] = sum / (2 * r + 1);
        sum += a[(o + Math.min(n - 1, i + r + 1) * st) * 4] - a[(o + Math.max(0, i - r) * st) * 4];
      }
    }
    for (let k = 0; k < w * h; k++) a[k * 4] = t[k];
  }
  return a;
};
/**
 * The wind at (x, y) on the map, from the anemometers `ws` ([x, y, u, v], km/h, y down) less than `r` away, by inverse
 * distance; null with none so near: a drop there falls straight, no wind made up. The page's script takes it as its text.
 */
export const windAt = (x: number, y: number, ws: number[][], r: number): [number, number] | null => {
  let sw = 0, su = 0, sv = 0;
  for (const [X, Y, u, v] of ws) {
    const d2 = (X - x) ** 2 + (Y - y) ** 2;
    if (d2 > r * r) continue;
    const q = 1 / (d2 + 1);
    sw += q;
    su += q * u;
    sv += q * v;
  }
  return sw ? [su / sw, sv / sw] : null;
};
/**
 * The rain between the rain gauges, on the land's cells (`L`, w by h) by inverse distance from `pts` ([x, y, mm/h] in
 * cells), as the radar's classes (`cl`, their lower bounds): one digit a cell. The replay's script takes it as its text.
 */
export const gaugeField = (pts: number[][], L: ArrayLike<number>, w: number, h: number, cl: number[]): string => {
  let out = "";
  for (let k = 0; k < w * h; k++) {
    if (!L[k] || !pts.length) {
      out += "0";
      continue;
    }
    const x = k % w, y = (k / w) | 0;
    let sw = 0, sv = 0;
    for (const [px, py, v] of pts) {
      const q = 1 / ((px - x) ** 2 + (py - y) ** 2 + 0.5);
      sw += q;
      sv += q * v;
    }
    let c = 0;
    while (c < cl.length && sv / sw >= cl[c]) c++;
    out += c;
  }
  return out;
};
/** How near an anemometer must be for its wind to lean the drops, in the map's units: 15 km. */
const WIND_REACH = Math.round((15 / KM) * 10) / 10;
/**
 * The drops, to tune (researcher, 31/10/2026). By the radar's class, 1 to 8: how many a cell asks for 100 × 100 px of
 * the map (×1.4 a class), how long, how wide, in CSS pixels. They go `slow` px a second, up to `fast` with a wind of
 * `strong` km/h, never faster where it rains harder; each lives `life` s, faded in and out over `fade` s; `max` at most
 * on the map. M1 leans `lean` degrees a km/h of east-west wind, `tilt` at most; M2 and M3 go the wind's way, to one of
 * `ways` directions; under `calm` km/h, or with no anemometer near, straight down the screen. M3: a splash where `share`
 * of them end. A phone whose drops take over `budget` ms a frame (the median of 30) gets half of them, then none move.
 */
const DROPS = {
  density: [3, 4, 6, 8, 12, 16, 23, 32],
  length: [5, 5.5, 6, 6.7, 7.3, 8.1, 8.9, 9.7],
  width: [1, 1, 1, 1.25, 1.25, 1.5, 1.5, 1.75],
  slow: 30,
  fast: 60,
  strong: 50,
  life: [0.6, 1.2],
  fade: 0.15,
  max: 600,
  lean: 0.75,
  tilt: 30,
  ways: 16,
  calm: 2,
  splash: { share: 0.1, life: 0.33, radius: 4, alpha: 0.5 },
  budget: 30,
};

/**
 * The rain the radar sees, in the browser, asked for when the layer is first shown (web/pluie-radar.ts): its cells
 * washed in blue by class, drawn one pixel a cell then spread smoothly to the screen's size (the radar's cells made
 * steps on every edge), and where the radars see badly a light veil, with soft edges too, and fine hatches; and drops
 * falling in the wet cells, more and faster where it rains harder (the second canvas, cleared each frame), never so
 * many that they hide the blue: in a downpour, 26 drops a cell for 1 in the lightest made white stripes over it
 * (31/10/2026). Each drop comes and goes faded, and falls to its end: an image that changes moves none, those born
 * after it are born in its rain. The legend says the image's time, that the radar sees no rain, or that its image is
 * too old to say anything about now. For the replay (RJ.p): an image of the history, or two faded one into the other,
 * the drops born in each by its share of the fade; where the radars saw badly lingers a while, fading (the user,
 * 31/10/2026: a zone that moves rather than patches that jump), and the legend says how long.
 */
const pluieScript = (motion: Motion, rd: boolean) => `const pr=document.querySelector("[data-pluie]");if(pr){const fl=pr.nextElementSibling,say=document.querySelector("[data-radar]"),inp=document.getElementById("wxl-p");
let d=null,live=null,L=null,LW=0,LH=0,Lp=null,P=null,ds=[],cw=0,ch=0,g,asked=false,mx=null;const TI=${JSON.stringify([RAIN_TIERS.light, RAIN_TIERS.dark])},KA=${JSON.stringify(RAIN_RGBA)},INK=${JSON.stringify(INK_RGB)},DN=${JSON.stringify(DROPS.density)},DL=${JSON.stringify(DROPS.length)},DW=${JSON.stringify(DROPS.width)},SC=${JSON.stringify([`${fr(CLASSES[0])}\u202fmm/h`, `plus de ${CLASSES[CLASSES.length - 1]}\u202fmm/h`])},SM=${JSON.stringify([`${fr(CLASSES[0])}\u202fmm`, `plus de ${CLASSES[CLASSES.length - 1]}\u202fmm en 3\u00a0h`])},Wt=[0,...DN];
// The theme the map is drawn in; during a replay without drops (rd), none move.
const dark=()=>matchMedia("(prefers-color-scheme: dark)").matches,hush=()=>!${rd}&&!!RJ.on;

const BW="Hachures",BAD=" "+BW+"\u00a0: zones que le radar voit mal, où la pluie peut être manquée.",calm=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const when=(t)=>{const x=loc(t),n=loc(new Date().toISOString());return x.toISOString().slice(0,10)===n.toISOString().slice(0,10)?"de "+hm(t):"du "+p2(x.getUTCDate())+"/"+p2(x.getUTCMonth()+1)+" à "+hm(t)};
const radars=(l)=>{const of=(n)=>(n==="Colorado"?"du ":"de ")+n;return(l.length>1?"Radars ":"Radar ")+l.slice(0,-1).map(of).join(", ")+(l.length>1?" et ":"")+of(l[l.length-1])+" en défaut, selon Météo-France : de la pluie peut manquer sur la carte."};
// A grid's rainy cells of the island alone (the map shows nothing of the sea, where the radars also see), each weighed
// by its class, and whether the radars see badly somewhere on it; counted once.
const DI=new Map(),dist=(j)=>{let r=DI.get(j);if(r)return r;const cells=[],acc=[];let bad="";for(let k=0;k<j.w*j.h;k++){if(!L[k])continue;const c=+j.pluie[k];if(c>0){cells.push(k);acc.push((acc[acc.length-1]||0)+Wt[c])}if(j.mal_vu[k]==="1")bad=BAD}
r={j,cells,acc,bad,n:acc[acc.length-1]||0};DI.set(j,r);if(DI.size>8)DI.delete(DI.keys().next().value);return r};
// The wind the drops follow (windAt): the anemometers of now, or of the replay's hour (RJ.p.wind); each drop takes it
// where it is born, its way and its pace (DROPS), its size by its class.
const WV=document.querySelector("[data-vent]"),WL=WV?JSON.parse(WV.dataset.vent):[];let WS=WL,WT=WV?"live":null,SP=[];const wat=${windAt};
const aim=(p,c)=>{const w=wat(p.x*${W}/cw,p.y*${H}/ch,WS,${WIND_REACH}),q=w?Math.hypot(w[0],w[1]):0;p.w=DW[c-1];p.l=DL[c-1];
p.v=(${DROPS.slow}+${DROPS.fast - DROPS.slow}*Math.min(q,${DROPS.strong})/${DROPS.strong})/30;${motion === "M1"
    ? `const t=w?Math.min(${DROPS.tilt},Math.abs(w[0])*${DROPS.lean})*Math.PI/180:0;p.dx=w?Math.sign(w[0])*Math.sin(t):0;p.dy=Math.cos(t)`
    : `if(q>=${DROPS.calm}){const s=Math.PI*2/${DROPS.ways},a=Math.round(Math.atan2(w[1],w[0])/s)*s;p.dx=Math.cos(a);p.dy=Math.sin(a)}else{p.dx=0;p.dy=1}`}};
// Where a drop is born (P): in the image drawn, or in one of the two faded, as much as it shows.
const pick=(s)=>{const r=Math.random()*s.n;let a=0,b=s.acc.length-1;while(a<b){const m=(a+b)>>1;if(s.acc[m]<r)a=m+1;else b=m}return s.cells[a]};
const born=(p)=>{const[A,Z,f]=P,s=Z&&Z.n&&(!A.n||Math.random()<f)?Z:A;if(!s.n)return false;const k=pick(s),c=+s.j.pluie[k];p.x=(k%s.j.w+Math.random())*cw/s.j.w;p.y=((k/s.j.w|0)+Math.random())*ch/s.j.h;aim(p,c);p.a=0;p.m=(${DROPS.life[0]}+Math.random()*${DROPS.life[1] - DROPS.life[0]})*30;return true};
// So many drops a 100 × 100 px of each class's cells (DN), on a cell's share of the map, 600 at most; half of them on a
// phone too slow, none moving if still too slow (QF, FT).
let QF=1,FT=[];const want=()=>{if(!P)return 0;const[A,Z,f]=P,n=Z?A.n*(1-f)+Z.n*f:A.n;return n?Math.max(1,Math.min(${DROPS.max},Math.round(n*cw*ch/(A.j.w*A.j.h)/1e4*QF))):0};
const moving=()=>!hush()&&QF>0&&!!P&&(P[0].n>0||!!P[1]&&P[1].n>0);
// Each drop faded in and out over its first and last 0.15 s (in thirds), from where it goes back along its way, in the
// theme's colour; one stroke a width and a third.
const drops=()=>{if(hush())return;const c=INK[dark()?1:0].join(","),e=${DROPS.fade * 30},B=new Map();g.lineCap="round";for(const p of ds){const q=Math.min(3,Math.max(1,Math.ceil(3*Math.min(p.a+.01,p.m-p.a)/e))),key=q+" "+p.w;let b=B.get(key);if(!b)B.set(key,b=[q,p.w,[]]);b[2].push(p)}
for(const[q,w,l]of B.values()){g.lineWidth=w;g.strokeStyle="rgba("+c+","+(q*.9/3).toFixed(2)+")";g.beginPath();for(const p of l){g.moveTo(p.x,p.y);g.lineTo(p.x-p.dx*p.l,p.y-p.dy*p.l)}g.stroke()}${motion === "M3"
    ? `
g.lineWidth=1;for(let q=0;q<3;q++){g.strokeStyle="rgba("+c+","+(${DROPS.splash.alpha}*(1-q/3)).toFixed(2)+")";g.beginPath();for(const s of SP){if(Math.min(2,s.a*3/${DROPS.splash.life * 30}|0)!==q)continue;const r=1+s.a*${(DROPS.splash.radius - 1) / (DROPS.splash.life * 30)};g.moveTo(s.x+r,s.y);g.arc(s.x,s.y,r,0,7)}g.stroke()}`
    : ""}};
const smooth=(x)=>{x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high"};
// Where the radars see badly, on the radar's grid with one cell of margin: each cell's share of bad cells around it, a
// veil from 0 to 1 past half; counted once an image (z: nowhere).
const BG=new Map(),bad=(j)=>{let a=BG.get(j);if(a)return a;const w=j.w,h=j.h,W2=w+2,v=(i,k)=>i>=0&&k>=0&&i<w&&k<h&&j.mal_vu[k*w+i]==="1"?1:0;a=new Float32Array(W2*(h+2));a.z=!j.mal_vu.includes("1");
if(!a.z)for(let k=-1;k<=h;k++)for(let i=-1;i<=w;i++){let s=0;for(let q=-1;q<2;q++)for(let b=-1;b<2;b++)s+=v(i+q,k+b);a[(k+1)*W2+i+1]=Math.max(0,Math.min(1,(s/9-.3)/.4))}
BG.set(j,a);if(BG.size>16)BG.delete(BG.keys().next().value);return a};
// The veil and its hatches in the map's two tones at the map's size, drawn once; shown through a veil of the radar's
// grid spread smoothly, its edges soft.
let VC=null,WC=null,M=null;
const veil=()=>{if(VC&&VC.width===cw&&VC.height===ch)return VC;VC=document.createElement("canvas");VC.width=cw;VC.height=ch;const c=VC.getContext("2d");c.fillStyle="rgba(255,255,255,.3)";c.fillRect(0,0,cw,ch);
const t=document.createElement("canvas");t.width=t.height=12;const tg=t.getContext("2d");for(const[s,lw,o]of[["rgba(11,31,54,.62)",1.4,0],["rgba(255,255,255,.6)",1,6]]){tg.lineWidth=lw;tg.strokeStyle=s;tg.beginPath();for(const k of[-12,0,12]){tg.moveTo(k+o-1,13);tg.lineTo(k+o+13,-1)}tg.stroke()}
c.fillStyle=c.createPattern(t,"repeat");c.fillRect(0,0,cw,ch);return VC};
const badly=(x,a,w,h)=>{const W2=w+2,H2=h+2;if(!M)M=document.createElement("canvas");M.width=W2;M.height=H2;const mg=M.getContext("2d"),e=mg.createImageData(W2,H2);for(let i=0;i<a.length;i++){e.data[i*4]=e.data[i*4+1]=e.data[i*4+2]=255;e.data[i*4+3]=a[i]*255}mg.putImageData(e,0,0);
if(!WC||WC.width!==cw||WC.height!==ch){WC=document.createElement("canvas");WC.width=cw;WC.height=ch}const c=WC.getContext("2d");c.globalCompositeOperation="copy";c.drawImage(veil(),0,0);
c.globalCompositeOperation="destination-in";smooth(c);c.drawImage(M,-cw/w,-ch/h,W2*cw/w,H2*ch/h);c.globalCompositeOperation="source-over";x.drawImage(WC,0,0)};
// The veil between two images (blend), in one array kept.
let O=null;const blend=${blend},veils=(A,Z,f,tr)=>{const za=bad(Z);if(!O||O.length!==za.length)O=new Float32Array(za.length);
return blend(bad(A),za,A===Z,f,tr&&tr.map(([j,w])=>[bad(j),w]),O)};
// A grid's classes spread smoothly to the map's size, then drawn in clear-cut blues (bands).
const bands=${bands},soften=${soften};
const wash=(x,j)=>{const t=document.createElement("canvas");t.width=j.w*4;t.height=j.h*4;const tg=c2d(t),e=tg.createImageData(j.w,j.h);
for(let k=0;k<j.w*j.h;k++){e.data[k*4]=(+j.pluie[k]||0)*28;e.data[k*4+3]=255}tg.putImageData(e,0,0);smooth(tg);tg.drawImage(t,0,0,j.w,j.h,0,0,t.width,t.height);
const b=tg.getImageData(0,0,t.width,t.height);tg.putImageData(soften(b.data,t.width,t.height,${RAIN_SOFT})&&b,0,0);
const u=document.createElement("canvas");u.width=cw;u.height=ch;const ug=c2d(u);smooth(ug);ug.drawImage(t,0,0,cw,ch);
const o=x.createImageData(cw,ch);bands(ug.getImageData(0,0,cw,ch).data,o.data,cw,ch,KA[dark()?1:0],[...INK[dark()?1:0],1],28,${RAIN_CUT});x.putImageData(o,0,0)};
// Each image washed once on a canvas of its own; the layer's, the image drawn, or the two faded one into the other
// (added, each by its share: no dip half way).
// The rain gauges' estimate (pg) hatched over its blues: never read as the radar's.
const C=new Map(),cv=(j)=>{let c=C.get(j);if(c&&c.width===cw&&c.height===ch&&c.dk===dark())return c;c=document.createElement("canvas");c.width=cw;c.height=ch;c.dk=dark();const x=c.getContext("2d");wash(x,j);
if(j.pg){x.globalCompositeOperation="source-atop";x.strokeStyle="rgba("+INK[c.dk?1:0].join(",")+",.45)";x.lineWidth=1;x.beginPath();for(let k=-ch;k<cw;k+=6){x.moveTo(k,ch);x.lineTo(k+ch,0)}x.stroke();x.globalCompositeOperation="source-over"}C.set(j,c);if(C.size>4)C.delete(C.keys().next().value);return c};
const paint=()=>{const x=c2d(pr);x.clearRect(0,0,cw,ch);if(!mx){if(d){x.drawImage(cv(d),0,0);const a=bad(d);if(!a.z)badly(x,a,d.w,d.h)}return}
x.globalCompositeOperation="lighter";x.globalAlpha=1-mx[2];x.drawImage(cv(mx[0]),0,0);x.globalAlpha=mx[2];x.drawImage(cv(mx[1]),0,0);x.globalAlpha=1;x.globalCompositeOperation="source-over";
const a=veils(...mx);if(a)badly(x,a,mx[1].w,mx[1].h)};
const o={fl,id:"wxl-p",ready:()=>!!d,moving,
size:(r)=>{cw=fl.width=pr.width=Math.max(1,Math.round(r.width));ch=fl.height=pr.height=Math.max(1,Math.round(r.height));g=c2d(fl);paint();
ds=[];const n=want();for(let i=0;i<n;i++){const p={};if(!born(p))break;p.a=Math.random()*p.m;ds.push(p)}},
still:()=>{g.clearRect(0,0,cw,ch);drops()},held:()=>QF===0||stop,
// A drop at its end is born again, unless there are more than the rain wants; a tenth of those it lacks come each frame.
frame:(k)=>{const t0=performance.now();g.clearRect(0,0,cw,ch);if(hush())return;const n=want();${motion === "M3" ? `SP=SP.filter((s)=>(s.a+=k)<=${DROPS.splash.life * 30});` : ""}for(let i=ds.length-1;i>=0;i--){const p=ds[i];p.x+=p.dx*p.v*k;p.y+=p.dy*p.v*k;
if((p.a+=k)>p.m){${motion === "M3" ? `if(Math.random()<${DROPS.splash.share})SP.push({x:p.x,y:p.y,a:0});` : ""}if(ds.length>n||!born(p))ds.splice(i,1)}}
for(let a=Math.min(n-ds.length,Math.ceil(n/10));a>0;a--){const p={};if(!born(p))break;ds.push(p)}drops();
FT.push(performance.now()-t0);if(FT.length===30){FT.sort((a,b)=>a-b);if(FT[15]>${DROPS.budget}){QF=QF===1?.5:0;if(!QF)o.again()}FT=[]}}};const go=anim(o);
// A button that stops the drops and starts them again (WCAG 2.2.2), after the layer's legend; stopped, they stay drawn.
let stop=false;const gb=document.createElement("button"),gl=()=>{gb.textContent=stop?"▶ Animer les gouttes":"❚❚ Arrêter les gouttes";gb.setAttribute("aria-pressed",String(stop))};
gb.type="button";gb.className="gp";gl();gb.addEventListener("click",()=>{stop=!stop;gl();o.again()});const lp=pr.closest("figure").querySelector(".lg-p");if(lp)lp.append(gb);
// The hatched square ties the sentence to the hatches on the map, however small they are; it never leaves its word.
// The radar's scale on its own line above its sentence (.lgr), never read as part of it: its first and last classes,
// its blues (TI), the theme's.
const scale=(mm)=>{const s=document.createElement("span"),i=document.createElement("i");s.className="lgs lgr";i.className="vgrad";i.style.background="linear-gradient(90deg,"+TI[dark()?1:0].join(",")+")";const c=mm?SM:SC;s.append(c[0],i,c[1]);return s};
const show=(el,t,bad,down,mm)=>{el.textContent=t;if(t.startsWith("En bleu"))el.prepend(scale(mm));if(bad){const i=document.createElement("i"),w=document.createElement("span");i.className="hsw";w.className="hsn";w.append(i,"\u00a0"+BW);el.append(" ",w,bad.slice(BW.length+1))}if(down)el.append(down);el.hidden=false};
const land=()=>Lp||(Lp=new Promise((ok,ko)=>{const im=new Image();im.onload=()=>{const c=document.createElement("canvas");c.width=im.width;c.height=im.height;const x=c.getContext("2d");x.drawImage(im,0,0);
const a=x.getImageData(0,0,im.width,im.height).data;LW=im.width;LH=im.height;ok(L=a.filter((v,i)=>i%4===0))};im.onerror=ko;im.src=pr.dataset.alt}));
// A grid made the one drawn, alone.
const use=(j)=>{d=j;P=[dist(j),null,0];return dist(j).bad};
// The drops stay where they fall when the image changes; the animation starts when rain comes, and for those who ask
// for less motion, the still picture is drawn again with the image.
const turn=(was,nw)=>{if(cw)paint();if(!was&&moving()||nw&&calm())o.again()};
// In the replay (past), the image's date and the past tense: never "hier".
const dm_=(t)=>{const x=loc(t);return p2(x.getUTCDate())+"/"+p2(x.getUTCMonth()+1)};
// An image of an hour (de), the strongest rain of each of its quarters; the rain gauges' 3 hours spread between them
// (pg, wet when one measured rain); their hours as « entre 14 h et 15 h le 31/10 » (marketing).
// The blues get darker with the rain in light, lighter in dark: the legend says which.
const fo=()=>(dark()?"plus c'est clair":"plus c'est foncé")+", plus elle est forte.";
const hx=(t)=>loc(t).getUTCHours()+"\u00a0h",span=(j)=>"entre "+hx(j.de)+" et "+hx(j.fin)+" le "+dm_(j.fin),Cap=(x)=>x[0].toUpperCase()+x.slice(1);
// The drops' sentence (marketing), after the legend: what they show, and the wind they follow (WT: "live", the round
// hour of the replay's, or none).
const gd=()=>hush()?"":"Les gouttes sont un effet visuel\u00a0: plus la pluie est forte, plus elles sont nombreuses et grosses"+(WT==null?". Le vent de cette heure n'est pas connu\u00a0: elles tombent droit.":
", et elles ${motion === "M1" ? "penchent" : "vont"} dans le sens du vent estimé d'après les anémomètres "+(WT==="live"?"les plus proches, à leur dernière mesure.":"de Météo-France les plus proches, à "+hm(new Date(WT).toISOString())+".")+" Loin de tout anémomètre, elles tombent droit.");
const say_=(j,bad,head,tail,past)=>show(head.el,(j.pg?(j.wet?"En bleu\u00a0: la pluie mesurée par les pluviomètres de Météo-France "+span(j)+", étalée entre eux par calcul\u00a0; "+fo()+" Entre deux pluviomètres, c'est une estimation, pas une mesure\u00a0: une averse qui tombe loin d'eux peut manquer.":Cap(span(j))+", aucun pluviomètre de Météo-France n'a mesuré de pluie.")
:dist(j).cells.length?"En bleu\u00a0: "+(j.de?"à chaque endroit, la pluie la plus forte vue par le radar de Météo-France "+span(j):"la pluie estimée par le radar de Météo-France "+(past?"le "+dm_(j.fin)+" à "+hm(j.fin):at_(j.fin)))+"\u00a0; "+fo()
:j.de?Cap(span(j))+", le radar de Météo-France n'a pas vu de pluie sur l'île.":past?"Le "+dm_(j.fin)+" à "+hm(j.fin)+", le radar de Météo-France ne voyait pas de pluie.":"Le radar de Météo-France ne voit pas de pluie "+(tail?"sur l'île ":"")+at_(j.fin)+".")+tail,bad,(j.pannes.length?" "+radars(j.pannes):"")+" "+gd(),j.pg);
const get=()=>{if(asked||!inp.checked)return;asked=true;Promise.all([fetch(pr.dataset.pluie).then((r)=>{if(!r.ok)throw new Error(String(r.status));return r.json()}),land()]).then(([j])=>{
if(L.length!==j.w*j.h)throw new Error("grille");
if(Date.now()-Date.parse(j.fin)>45*6e4){show(say,"Pas d'image radar récente : la dernière date "+when(j.fin)+" et n'est pas affichée.");return}live=j;
if(RJ.on){say_(j,"",{el:say},"");RJ.redraw();return}say_(j,use(j),{el:say},"");go()}).catch(()=>{})};
// The replay's images (pluie-retro.ts): each its own rain and hatches, kept once read; a gap, nothing but its sentence.
// The legend of a trail: how long the zones seen badly linger, before the time shown.
const ago=${ago};
const none=(w,h)=>({fin:"",pannes:[],w,h,pluie:"0".repeat(w*h),mal_vu:"0".repeat(w*h)});
const un=(s)=>s.split(",").map((r)=>r?r[0].repeat(parseInt(r.slice(1),36)):"").join("");
const Dg=new Map(),grid=(e,gr)=>{let j=Dg.get(e);if(!j){j={fin:e.fin,de:e.de,pg:e.pg,wet:e.wet,tail:e.tail||"",pannes:e.pannes,w:gr.w,h:gr.h,pluie:un(e.pluie),mal_vu:un(e.mal_vu)};Dg.set(e,j);if(Dg.size>16)Dg.delete(Dg.keys().next().value)}return j};
const ok=(gr)=>L&&L.length===gr.w*gr.h,empty=(w,h)=>{mx=null;use(none(w,h));turn(true,true)};
RJ.p={prep:land,dims:()=>L&&{w:LW,h:LH,L},wind:(ws,t)=>{WS=ws||[];WT=ws?t:null},
// Between two images (f of the way), with the trail of those before as [image, share left], over wm minutes.
mix:(a,z,f,el,gr,tr,wm)=>{if(!ok(gr))return;const A=grid(a,gr),Z=grid(z,gr),n=f<.5?A:Z,was=moving(),nw=d!==n,tg=tr&&tr.map(([e,w])=>[grid(e,gr),w]);mx=[A,Z,f,tg];d=n;P=[dist(A),dist(Z),f];
if(nw)say_(n,tg?(dist(Z).bad||tg.some(([j])=>dist(j).bad)?" "+BW+"\u00a0: zones que le radar a mal vues "+ago(wm)+", où la pluie peut être manquée.":""):n.de&&dist(n).bad?" "+BW+"\u00a0: zones que le radar a mal vues pendant cette heure, où la pluie peut être manquée.":dist(n).bad,{el},n.tail,1);turn(was,nw)},
gap:(e,el,gr)=>{if(!ok(gr))return;empty(gr.w,gr.h);const one=Date.parse(e.a)-Date.parse(e.de)<=3e5;show(el,one?"Pas d'image radar à "+hm(e.a)+".":"Pas d'image radar de "+hm(e.de)+" à "+hm(e.a)+".")},
clear:(el)=>{if(d)empty(d.w,d.h);if(el)el.textContent=""},
back:()=>{const was=moving();mx=null;WS=WL;WT=WV?"live":null;if(live)say_(live,use(live),{el:say},"");else if(d)use(none(d.w,d.h));turn(was,true)}};
inp.addEventListener("change",get);get()}`;
const PLUIE_SCRIPT = pluieScript(MOTION, REPLAY_DROPS);

/**
 * The replay bar (replayBar), shown by the page's script. Its own script (REJEU_JS) is asked on the first touch of a
 * length or of the button, which then plays it; until it has come, the button says it loads, and the bar says so if it
 * cannot come.
 */
const REJEU_SCRIPT = `const rb=document.querySelector("[data-rejeu]");if(rb){const b=rb.querySelector(".rj-b"),ko=rb.querySelector(".rj-ko");let s=null,name="";rb.hidden=false;
RJ.ko=()=>{b.textContent="▶ Lire";b.disabled=false;if(name)b.setAttribute("aria-label",name);ko.hidden=false};
RJ.load=(d)=>{ko.hidden=true;if(RJ.go)return RJ.go(d);RJ.want=d;if(s)return;name=b.getAttribute("aria-label")||name;b.textContent="Chargement…";b.disabled=true;b.removeAttribute("aria-label");
s=document.createElement("script");s.src=rb.dataset.rejeu;s.onerror=()=>{s.remove();s=null;RJ.ko()};document.head.append(s)};
const pick=()=>{const c=rb.querySelector("[name=rjd]:checked")||rb.querySelector("[name=rjd]");c.checked=true;return c.value};
rb.addEventListener("change",(e)=>{if(e.target.name==="rjd")RJ.load(e.target.value)});b.addEventListener("click",()=>{if(!RJ.go)RJ.load(pick())});ko.querySelector("button").addEventListener("click",()=>RJ.load(pick()))}`;

/** A radar image of the replay, as its script keeps them: its time and its grid. */
type Kept = { t: number; e: unknown };
/**
 * The trail at T of the radar's images `p`, each with its share left, from 1 at its time to 0 `w` ms of radar later:
 * those of the span before the time shown s, s itself in, alone (the legend says « au cours de l'heure précédente »).
 * The replay's script takes it as its text.
 */
export const trailOf = (p: Kept[], T: number, s: number, w: number): [unknown, number][] =>
  p.filter((x) => x.t <= T && x.t <= s && x.t > s - w && T - x.t < w).map((x) => [x.e, 1 - (T - x.t) / w]);
/** Where the replay is: on a measure (`m`), or between two (`a`, `z`, `f` the share of the way). */
type At = { m?: { t: number }; a?: { t: number }; z?: { t: number }; f?: number } | null;
/**
 * The time of what the map shows at T: a measure's, or between the radar's two images the one its legend names (the
 * next from half way through the fade, as mix() swaps them), never a minute the radar has no image of; else T. The
 * replay's script takes it as its text.
 */
export const shownAt = (T: number, r: At, l: string): number =>
  r && r.m ? r.m.t : r && r.a && r.z && l === "p" ? ((r.f ?? 0) < 0.5 ? r.a : r.z).t : T;
/** A full play, whatever the length (data-run, 29/10). */
const PLAY_MS = 12_000;
/**
 * How long, in a play, where the radars saw badly lingers on the map, fading: an hour of the radar over 6 hours, 4 hours
 * over 24 (the user, 31/10/2026: « on verra plutôt une grande zone grise »). Never in the live map, nor for those who
 * ask for less motion.
 */
const TRAIL_MS = 2_000;

/**
 * The replay, asked by REJEU_SCRIPT when its visitor first touches the bar: the file of the length chosen
 * (rejeu.ts), then the moment shown, from the first measure kept to the latest, on the layer shown. Each layer's
 * measures are its moments: the radar's images (5 minutes apart, or 15 over 24 hours), the stations' round hours, and
 * the live measures at the end. A moment on one (within SNAP) shows it, « mesuré »; between two, the temperatures' and
 * the wind's grids are mixed cell by cell and the radar's images faded, « estimé », never past the latest measure (the
 * radar's rain, on an image or between two, « estimé par radar »: an estimate, as its legend says, never « mesuré »); a
 * gap is said; the stations' rain, an hour's total, is shown for its hour and never mixed. The end of the bar is the
 * live map. A play takes PLAY_MS; those who ask for less motion get the slider alone. The time is written on the
 * map; to a screen reader, the slider says it, and it is said once the play stops or the slider is let go.
 */
function rejeuJs(): string {
  const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  const labels = Object.fromEntries(DUREES.map((d) => [d, REVOIR[d][1]]));
  return `(()=>{const rb=document.querySelector("[data-rejeu]");if(!rb||typeof RJ!=="object")return;
const P=${js(REJEU_PATHS)},LB=${js(labels)},N=new Set(${js([...NAMED])}),C=${js(STOPS)},R=${js(RAIN_STEPS)},DRY=${js(RAIN_DRY)},PLAY=${PLAY_MS},TRAIL=${TRAIL_MS};
const ST={"6h":3e5,"24h":36e5,"7j":36e5},SN={"6h":6e4,"24h":18e4,"7j":6e5},DU={"6h":216e5,"24h":864e5,"7j":6048e5},DAYS=["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
const fig=rb.closest("figure"),b=rb.querySelector(".rj-b"),rng=rb.querySelector("input[type=range]"),q=rb.querySelector(".rj-q"),ann=rb.querySelector("[aria-live]"),
hd=fig.querySelector(".rj-d"),hh=fig.querySelector(".rj-h"),hs=fig.querySelector(".rj-s"),dots=fig.querySelector(".rj-st"),lg=(l)=>fig.querySelector(".lg-"+l+" .rj-lg"),
rm=matchMedia("(prefers-reduced-motion: reduce)").matches,F={},G=new Map();
let d="",J=null,st=[],n=0,fin=0,S=0,E=0,T=0,K={},TR=[],LT=new Map(),TD=null,PD=null,playing=false,raf=0,last=0,nx=0,cur="",was=null;
const lx=(t)=>new Date(t+144e5),hmm=(t)=>{const x=lx(t);return p2(x.getUTCHours())+":"+p2(x.getUTCMinutes())},dm=(t)=>{const x=lx(t);return p2(x.getUTCDate())+"/"+p2(x.getUTCMonth()+1)};
const lay=()=>["t","p","v"].find((l)=>{const i=document.getElementById("wxl-"+l);return i&&i.checked})||"";
const chip=(t)=>{let i=0;while(i<C.length-2&&t>C[i+1][0])i++;const[[t0,c0],[t1,c1]]=[C[i],C[i+1]],k=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));return"rgb("+c0.map((c,j)=>Math.round(c+(c1[j]-c)*k)).join(",")+")"};
const NS="http://www.w3.org/2000/svg",mk=(e,a,p)=>{const x=document.createElementNS(NS,e);for(const k in a)x.setAttribute(k,a[k]);p.append(x);return x};
// The names of places are placed again around what the map shows (NOMS_SCRIPT, on a change): the replay's dots, or the live ones.
const renames=()=>document.dispatchEvent(new Event("change"));
// Each station's dot for a measure of the file, with its value for the tour's stations (and a rain of 1 mm or more).
const ring=(f)=>{const g=mk("g",{},dots),out=[];g.style.display="none";for(const s of st){if(!s[f].some((v)=>v!=null))continue;const big=N.has(s.id);
out.push({s,big,c:mk("circle",{cx:s.x,cy:s.y,r:big?34:17},g),t:big||f==="rr"?mk("text",{class:"mv",x:s.x,y:s.y+11},g):null})}return{g,out}};
// A layer's moments at T: on one, or between two (f of the way), or none (before its first, or across a long hole).
const at=(l)=>{const k=K[l];if(!k||!k.length||T<k[0].t-SN[d])return null;let i=0;while(i<k.length-1&&k[i+1].t<=T)i++;const a=k[i],z=k[i+1];
if(!z||T-a.t<=SN[d])return{m:a};if(z.t-T<=SN[d])return{m:z};if(z.t-a.t>(l==="p"?2*(d==="7j"?108e5:ST[d]):72e5)+6e4)return null;return{a,z,f:(T-a.t)/(z.t-a.t)}};
// The stations of an hour, as the page's scripts take them: [x, y, altitude, °C], or [x, y, u, v] in km/h (y down).
const sx=(l,i)=>l==="t"?st.filter((s)=>s.t[i]!=null).map((s)=>[s.x,s.y,s.alt,s.t[i]]):st.filter((s)=>s.ff[i]!=null&&(s.dd[i]!=null||s.ff[i]===0)).map((s)=>{const a=(s.dd[i]||0)*Math.PI/180,v=s.ff[i];return[s.x,s.y,-Math.sin(a)*v,Math.cos(a)*v]});
const gridOf=(l,k)=>{if(k.i<0)return RJ[l].now;const key=l+k.i;let g=G.get(key);if(!g){g=RJ[l].grid(sx(l,k.i));G.set(key,g);if(G.size>16)G.delete(G.keys().next().value)}return g};
const tv=(s,k)=>k.i<0?LT.get(s.x+","+s.y)??null:s.t[k.i];
const once=(k,f)=>{if(cur!==k){cur=k;f()}};
// The radar's images of the trail at T (trailOf), lingering TRAIL of a play: none for those who ask for less motion.
const keep=${trailOf},trail=(s)=>rm||d!=="6h"?null:keep(K.p,T,s,DU[d]*TRAIL/PLAY),wm=()=>Math.round(DU[d]*TRAIL/PLAY/6e4);
// Over 24 hours and 7 days, each image is seen alone 0.3 s of its 0.5, then faded into the next over 0.2 s (researcher,
// 31/10/2026); the time and the legend change half way through the fade.
const ease=(f)=>{if(d==="6h")return f;const x=Math.max(0,Math.min(1,(f-.6)/.4));return x*x*(3-2*x)};
// The wind the drops follow (RJ.p.wind): the anemometers of the round hour nearest t, within 1 h 30 min; none without.
let WH=0;const blow=(t)=>{if(!RJ.p)return;let b=null;for(const x of K.v||[])if(Math.abs(x.t-t)<=54e5&&(!b||Math.abs(x.t-t)<Math.abs(b.t-t)))b=x;const key=b?b.t:-1;if(key===WH)return;WH=key;
RJ.p.wind(b?(b.i<0?RJ.v&&RJ.v.live:sx("v",b.i)):null,b&&b.t)};
// A station's rain over 3 hours, with all three measured; and the 3 hours spread between the gauges, as the radar's images.
const three=(s,k)=>k.w.some((i)=>s.rr[i]==null)?null:k.w.reduce((a,i)=>a+s.rr[i],0);
const RN=new Map(),field=${gaugeField},enc=(x)=>x.replace(/(.)\\1*/g,(m)=>m[0]+m.length.toString(36)+",");
const rain=(k)=>{let e=RN.get(k.t);if(e)return e;const gr=RJ.p.dims(),pts=[];for(const s of st){const v=three(s,k);if(v!=null)pts.push([s.x*gr.w/${W},s.y*gr.h/${H},v])}
e={fin:new Date(k.end).toISOString(),de:new Date(k.end-108e5).toISOString(),pg:1,pannes:[],pluie:enc(field(pts,gr.L,gr.w,gr.h,${JSON.stringify(CLASSES)})),mal_vu:"0"+(gr.w*gr.h).toString(36)+",",
wet:pts.some((x)=>x[2]>0),tail:" Points : la pluie mesurée par chaque pluviomètre pendant ces 3\u00a0heures, en mm. Point blanc : pas de pluie mesurée."};RN.set(k.t,e);return e};
// The layer shown at T; what it is, for the word under the time.
const draw=(l)=>{TD&&(TD.g.style.display=l==="t"?"":"none");PD&&(PD.g.style.display=l==="p"?"":"none");
if(l==="p"&&d!=="7j"){const gr=J.radar,el=lg("p");if(!RJ.p||!gr)return null;const h=TR.find(([a,z])=>T>a&&T<z);if(h){once("g"+h[0],()=>RJ.p.gap(h[2],el,gr));return{gap:h}}
const r=at("p");if(r&&r.a)r.f=ease(r.f);if(r)blow(shown(T,r,l));if(!r)once("n",()=>RJ.p.clear(el));else if(r.m)once("m"+r.m.t,()=>RJ.p.mix(r.m.e,r.m.e,0,el,gr,trail(r.m.t),wm()));else{cur="";RJ.p.mix(r.a.e,r.z.e,r.f,el,gr,trail(shown(T,r,l)),wm())}return r}
// 7 days: the rain gauges' 3 hours spread between them (rain), faded from one to the next around the time shown, and
// the gauges' own measures on their dots.
if(l==="p"){const k=K.p.find((x)=>x.end>=T&&x.end-T<108e5),gr=RJ.p&&RJ.p.dims(),el=lg("p");if(gr){const r=at("p");if(r&&r.a)r.f=ease(r.f);blow(T);
if(!r)once("n",()=>RJ.p.clear(el));else if(r.m)once("m"+r.m.t,()=>RJ.p.mix(rain(r.m),rain(r.m),0,el,gr,null,0));else{cur="";RJ.p.mix(rain(r.a),rain(r.z),r.f,el,gr,null,0)}}
for(const o of PD?PD.out:[]){const v=k?three(o.s,k):null;if(o.t)o.t.textContent="";if(v==null){o.c.setAttribute("style","display:none");continue}const lab=v>0&&(o.big||v>=1);
o.c.setAttribute("r",lab?34:v>0?17:14);o.c.setAttribute("style",v>0?"fill:"+R.find(([x])=>v>=x)[1]:"fill:#fff;stroke:"+DRY+";stroke-width:5");
if(o.t&&lab)o.t.textContent=String(Math.round(v*10)/10).replace(".",",")}return k?{h:k}:null}
const r=at(l);if(!RJ[l])return r;if(!r)once("x"+l,()=>RJ[l].show(null));else if(r.m)once(l+r.m.t,()=>RJ[l].show(gridOf(l,r.m)));else{cur="";RJ[l].mix(gridOf(l,r.a),gridOf(l,r.z),r.f)}
if(l==="t"&&TD)for(const o of TD.out){let v=null;if(r){const a=tv(o.s,r.m||r.a),z=r.m?a:tv(o.s,r.z);if(a!=null&&z!=null)v=r.m?a:a+(z-a)*r.f}
o.c.style.display=v==null?"none":"";if(v==null){if(o.t)o.t.textContent="";continue}o.c.setAttribute("fill",chip(v));if(o.t)o.t.textContent=Math.round(v)+"°"}return r};
// The time of what the map shows (shownAt).
const shown=${shownAt};
// The time written on the map, the word under it, and what the slider says.
const show=()=>{const l=lay();if(!l||!J)return"";const end=T>=E;fig.classList.toggle("rj-fin",end);RJ.on=!end;let r=null,t=T;if(end!==was){was=end;renames()}
if(end){once("fin",()=>{for(const x of["t","v","p"])if(RJ[x])RJ[x].back()})}else r=draw(l);
t=end?E:shown(T,r,l);let w="",said=dm(t)+" à "+hmm(t);
if(end){w="dernière mesure";said+=", dernière mesure"}else if(r&&r.gap){said+=". Pas d'image radar de "+hmm(r.gap[0])+" à "+hmm(r.gap[1])+"."}
else if(r&&r.h){w="estimé entre les pluviomètres";said+=", pluie de "+hmm(r.h.end-108e5)+" à "+hmm(r.h.end)+", estimée entre les pluviomètres"}
else if(r&&l==="p"){w="estimé par radar";said+=r.m?", pluie estimée par le radar":", pluie estimée par le radar entre ses images de "+hmm(r.a.t)+" et de "+hmm(r.z.t)}
else if(r&&r.m){w="mesuré";said+=", mesuré"}else if(r){w="estimé";said+=", estimé entre les mesures de "+hmm(r.a.t)+" et de "+hmm(r.z.t)}
// The hours of the rain shown, an hour's or 3 hours' (marketing: « 14 h – 15 h »).
const im=l==="p"&&r&&(r.m||(r.a&&(r.f<.5?r.a:r.z))),de=r&&r.h?r.h.end-108e5:im&&im.e&&im.e.de?Date.parse(im.e.de):0,hx=(x)=>lx(x).getUTCHours()+"\u00a0h";
if(r&&r.h)t=r.h.end;hd.textContent=d==="7j"?DAYS[lx(t).getUTCDay()]+" "+dm(t):d==="24h"||dm(S)!==dm(E)?dm(t):"";hh.textContent=!end&&de?hx(de)+" – "+hx(t):hmm(t);hs.textContent=w;
rng.value=String((T-S)/ST[d]);rng.setAttribute("aria-valuetext",said);return said};
const btn=()=>{const end=!!J&&T>=E;b.disabled=false;b.textContent=playing?"❚❚ Pause":end?"↻ Relire":"▶ Lire";b.setAttribute("aria-label",playing?"Mettre en pause":end?"Relire":LB[d||"6h"])};
// The bar of the layer shown: from its first measure in the file (not before the length asked), to the latest; its
// steps on the clock's (every 5 minutes, quarter of an hour or hour), where the measures are.
const range=()=>{const l=lay(),k=K[l]||[],t0=Math.min(...k.map((x)=>x.t),...(l==="p"?TR.map((x)=>x[0]):[]));S=Math.min(E,Math.ceil(Math.max(E-DU[d],isFinite(t0)?t0:E)/ST[d])*ST[d]);
const late=S>E-DU[d]+(l==="p"&&d!=="7j"?2*ST[d]:36e5+6e4);q.hidden=!late;q.textContent=late?"Historique gardé depuis le "+dm(S)+" à "+hmm(S)+".":"";
T=Math.max(S,Math.min(E,T));rng.max=String((E-S)/ST[d]||0)};
// The live map's colour scale in front, the same for the whole play.
const legend=(l,k,one,many,text)=>{const el=lg(l);if(!el||!K[l].length)return;const c=st.filter((s)=>s[k].some((v)=>v!=null)).length,sc=fig.querySelector(".lg-"+l+" .lg-now .lgs");
el.replaceChildren(...(sc?[sc.cloneNode(true)]:[]),text(c+" "+(c>1?many:one)))};
const setup=()=>{const h=J.heures;st=h?h.st:[];n=h?h.heures:0;fin=h?Date.parse(h.fin):0;G.clear();cur="";was=null;
const live=Date.parse(rb.dataset.fin)||0,th=(i)=>fin-(n-1-i)*36e5,hours=(f)=>{const k=[];for(let i=0;i<n;i++)if(st.some((s)=>s[f][i]!=null))k.push({t:th(i),i});return k};
// The week's rain by 3 hours, midnight to 3, 3 to 6… in La Réunion: each at its middle, the time its spread is drawn whole.
const windows=()=>{const k=[];for(let i=2;i<n;i++){const w=[i-2,i-1,i];if(((th(i)/36e5+4)%24)%3===0&&st.some((s)=>three(s,{w})!=null))k.push({t:th(i)-54e5,end:th(i),i,w})}return k};
K={t:RJ.t?hours("t"):[],v:RJ.v?hours("ff"):[],p:[]};for(const l of["t","v"])if(K[l].length&&live>fin)K[l].push({t:live,i:-1});
TR=[];RN.clear();WH=0;if(RJ.p){if(d==="7j")K.p=windows();else if(J.radar)for(const e of J.radar.entrees)if(e.trou)TR.push([Date.parse(e.de),Date.parse(e.a),e]);else K.p.push({t:Date.parse(e.fin),e})}
E=Math.max(live,fin,...K.p.map((x)=>x.t),...TR.map((x)=>x[1]));LT=new Map();if(RJ.t)for(const[x,y,,t]of RJ.t.live)LT.set(Math.round(x*10)/10+","+Math.round(y*10)/10,t);
dots.replaceChildren();TD=RJ.t?ring("t"):null;PD=d==="7j"&&RJ.p?ring("rr"):null;
legend("t","t","station","stations",(x)=>"Température sous abri de "+x+" de Météo-France, une mesure par heure. Entre les stations, les couleurs sont estimées selon l'altitude : ce n'est pas une mesure.");
legend("v","ff","anémomètre","anémomètres",(x)=>"Vent moyen sur 10 minutes de "+x+" de Météo-France, une mesure par heure. Entre eux, le mouvement et les couleurs sont estimés : ce n'est pas une mesure. Les aéroports et les balises de vent ne sont pas dans ce rejeu.");
fig.classList.add("rejeu");rng.hidden=false;range();return K.t.length||K.v.length||K.p.length};
const pace=${pace},tick=(t)=>{raf=requestAnimationFrame(tick);const was=last;${STEP}const dt=was?k*${FRAME_MS}:0;T=Math.min(E,T+(E-S)*dt/PLAY);show();if(T>=E)stop(true)};
const play=()=>{if(T>=E)T=S;playing=true;last=nx=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);btn()};
const stop=(say)=>{playing=false;cancelAnimationFrame(raf);btn();if(say)ann.textContent=show()};
// Back to the live map when the file cannot come: the bar says so.
const fail=()=>{J=null;fig.classList.remove("rejeu","rj-fin");RJ.on=false;rng.hidden=true;q.hidden=true;cur="";was=null;renames();for(const x of["t","v","p"])if(RJ[x])RJ[x].back();RJ.ko();b.setAttribute("aria-label",LB[d])};
RJ.go=(x)=>{stop(false);d=x;const c=document.getElementById("rjd-"+x);if(c)c.checked=true;b.textContent="Chargement…";b.disabled=true;b.removeAttribute("aria-label");
(F[x]||(F[x]=Promise.all([fetch(P[x]).then((r)=>{if(!r.ok)throw new Error(String(r.status));return r.json()}),RJ.p?RJ.p.prep():0]).then(([j])=>j))).then((j)=>{if(d!==x)return;J=j;
if(!setup())throw new Error("vide");T=S;if(rm){btn();ann.textContent=show()}else{show();play()}}).catch(()=>{delete F[x];if(d===x)fail()})};
RJ.redraw=()=>{if(J){cur="";show()}};
b.addEventListener("click",()=>{if(J)playing?stop(true):play()});
rng.addEventListener("input",()=>{if(playing)stop(false);T=S+(+rng.value)*ST[d];show();btn()});rng.addEventListener("change",()=>{ann.textContent=show()});
rng.addEventListener("keydown",(e)=>{const v=+rng.value,m=+rng.max;let x=null;if(e.key==="ArrowRight"||e.key==="ArrowUp")x=Math.floor(v+1e-6)+1;else if(e.key==="ArrowLeft"||e.key==="ArrowDown")x=Math.ceil(v-1e-6)-1;
else if(e.key==="Home")x=0;else if(e.key==="End")x=m;else if(e.key===" "){e.preventDefault();b.click();return}else return;e.preventDefault();if(playing)stop(false);T=S+Math.max(0,Math.min(m,x))*ST[d];ann.textContent=show();btn()});
document.querySelectorAll("[name=wxl]").forEach((i)=>i.addEventListener("change",()=>{if(J){cur="";range();show()}}));
if(RJ.want)RJ.go(RJ.want)})()`;
}

let rejeuText: string | undefined;
/** The replay's script, served at its address (site.ts), kept a year there: it changes with the script. */
export const rejeuScript = () => (rejeuText ??= rejeuJs());
let rejeuPath: string | undefined;
export const rejeuScriptPath = () => (rejeuPath ??= `/meteo/rejeu-${hash(rejeuScript())}.js`);

/** /meteo's own script: the stations' list (filter, sort, unfold), then the veil, the wind and the radar's rain, and their replay. */
export const METEO_SCRIPT = `const stl=document.getElementById("stl");if(stl){const sel=document.getElementById("stc"),bs=document.querySelectorAll("[data-s]");
const m=document.getElementById("stm"),open=()=>{stl.classList.remove("plie");if(m)m.parentElement.hidden=true};if(m)m.addEventListener("click",open);
const f=()=>{const c=sel.value;open();stl.querySelectorAll("li").forEach((li)=>{li.hidden=!!c&&li.dataset.c!==c})};sel.addEventListener("change",f);
bs.forEach((b)=>b.addEventListener("click",()=>{const k=b.dataset.s;open();bs.forEach((x)=>x.setAttribute("aria-pressed",x===b));
[...stl.children].sort((a,z)=>k==="n"?a.dataset.n.localeCompare(z.dataset.n,"fr"):k==="t"?(z.dataset.t===""?-99:+z.dataset.t)-(a.dataset.t===""?-99:+a.dataset.t):a.dataset.z-z.dataset.z).forEach((li)=>stl.append(li))}))}
// What the layers share: the time in La Réunion (UTC+4, no summer time), « hier » before midnight, and the replay's
// hooks (RJ, read by REJEU_JS too, a script of the page's own).
const p2=(n)=>String(n).padStart(2,"0"),loc=(t)=>new Date(Date.parse(t)+144e5),hm=(t)=>{const x=loc(t);return p2(x.getUTCHours())+":"+p2(x.getUTCMinutes())};
const at_=(t)=>(loc(t).toISOString().slice(0,10)===loc(new Date().toISOString()).toISOString().slice(0,10)?"à ":"hier à ")+hm(t),RJ={};
// The map's canvases drawn by the processor, not the graphics card: Safari puts a canvas drawn on the card in a layer
// of its own, which a foreignObject then paints unscaled, off the map and over the text below (iPhone, 29/10).
const c2d=(c)=>c.getContext("2d",{willReadFrequently:true});
${VOILE_SCRIPT}
${ANIM}
${VENT_SCRIPT}
${PLUIE_SCRIPT}
${REJEU_SCRIPT}`;

/** /meteo's script with another motion of the drops, or none in a replay, for the proposals to choose from. */
export const meteoVariant = (motion: Motion, rd = REPLAY_DROPS) => METEO_SCRIPT.replace(PLUIE_SCRIPT, pluieScript(motion, rd));
