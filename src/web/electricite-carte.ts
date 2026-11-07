/**
 * /electricite's map and chart (marketing's charter of the maps, 31/10/2026: the « rond proportionnel », the filières'
 * colours in each theme):
 * - The map: the power installed in each commune, filière by filière, from the national register of the installations
 *   as EDF SEI publishes it (src/electricite/installations.json, scripts/build-installations.py). It stays still: EDF
 *   publishes the production for the whole island, never plant by plant, so nothing on the map says what produces now.
 *   A round per filière, its area as its MW, grouped around the commune's centre, the biggest under; one zone to touch
 *   per commune, its bubble listing them all. Its replay, on the chart's moment, is an estimate said as one: each round
 *   its MW × its group's production on the island ÷ the group's MW on the island (GROUPES), back to the MW installed
 *   on a link.
 * - The chart: the island's production over EDF's last 24 hours, the renewable filières under, the others over (the
 *   batteries left out, `produced`), a cursor on the moment said under it. Its replay moves the cursor, and the map's
 *   rounds once a bar was touched (the chart's or the map's: the same moment).
 */
import data from "../electricite/installations.json" with { type: "json" };
import { resolvePlace } from "../places/resolve.js";
import { a, enumeration } from "../tools/format.js";
import type { Journee } from "./data.js";
import { esc, H, inScript, islandMap, project, W } from "./map.js";
import { slugify } from "./places.js";
import { VITESSE_JS, vitesseBouton } from "./vitesse.js";

interface Filiere { nom: string; mw: number; installations: number }
interface Commune { commune: string; filieres: Filiere[] }
/** One of a filière's biggest installations, its name only when the register gives one. */
interface Grande { commune: string; mw: number; nom?: string }

const INSTALLATIONS = data as {
  mis_a_jour: string;
  communes: Commune[];
  grandes: Record<string, Grande[]>;
  moins_de_36_kw: { mw: number; installations: number };
};

/** Each filière of the register: its class, for its colour in each theme (ELECTRICITE_CSS). */
const CLASSE: Record<string, string> = {
  "bioénergies": "f-bio",
  "solaire": "f-sol",
  "hydraulique": "f-hyd",
  "éolien": "f-eol",
  "thermique non renouvelable": "f-the",
  "stockage non hydraulique": "f-sto",
};
/** The legend's order: the renewable filières, then the others. */
const ORDRE = Object.keys(CLASSE);

/**
 * The group of EDF's production each filière of the register follows in the replay (Journee.filieres): bioénergies
 * and thermique together, every plant that burns, since EDF counts as coal part of what the register files as
 * bioénergies (on 31/10/2026, up to 145 MW of coal for 249 MW of thermique installed, its diesel and turbines besides).
 */
const GROUPES: Record<string, number> = { "solaire": 0, "éolien": 1, "hydraulique": 2, "bioénergies": 3, "thermique non renouvelable": 3, "stockage non hydraulique": 4 };
/** The MW installed on the island in each group, as the register says. */
export const INSTALLE = INSTALLATIONS.communes.reduce((t, c) => {
  for (const f of c.filieres) if (f.nom in GROUPES) t[GROUPES[f.nom]] += f.mw;
  return t;
}, [0, 0, 0, 0, 0]);
/**
 * The filières of EDF's production in Journee.mix, by their names and colours on the map: solar, wind, hydro,
 * bioénergies, thermique non renouvelable, the batteries. The chart « Par filière » stacks the first five (the
 * batteries left out, as `produced` does), the steadiest under; its legend in the map's order.
 */
const MIX = [["solaire", "f-sol"], ["éolien", "f-eol"], ["hydraulique", "f-hyd"], ["bioénergies", "f-bio"], ["thermique non renouvelable", "f-the"]];
const PILE = [3, 2, 1, 0, 4];
const LEGENDE = ORDRE.flatMap((n) => { const i = MIX.findIndex(([m]) => m === n); return i < 0 ? [] : [i]; });

/**
 * A round's diameter in the map's units: its area as its MW, 211 MW (the biggest) 120 units, about 64 px on the
 * computer's map and 40 px on a phone's; never under 30 units, 10 px on a phone, or it would not be seen.
 */
export const diametre = (mw: number) => Math.max(30, 8.26 * Math.sqrt(mw));

const mwText = (mw: number) => `${mw >= 10 ? Math.round(mw) : mw >= 1 ? mw.toFixed(1).replace(".", ",") : mw.toFixed(2).replace(".", ",")}\u00a0MW`;
const installations = (n: number) => `${n.toLocaleString("fr-FR")}\u00a0installation${n > 1 ? "s" : ""}`;
const jourMois = (iso: string) => iso.split("-").reverse().join("/");
export const MIS_A_JOUR = jourMois(INSTALLATIONS.mis_a_jour);

/** A commune's filières, the strongest first: « bioénergies 211 MW (1 installation) · solaire 12 MW (… installations) ». */
const total = (c: Commune) => c.filieres.reduce((n, f) => n + f.mw, 0);
export const filieresText = (c: Commune) =>
  c.filieres.map((f) => `${f.nom} ${mwText(f.mw)} (${installations(f.installations)})`).join(" · ");

/** Where each round of a commune goes: the biggest on the centre, the others around it, each touching its edge. */
function placer([x, y]: [number, number], fs: Filiere[]): { f: Filiere; x: number; y: number; r: number }[] {
  const [big, ...rest] = fs;
  const R = diametre(big.mw) / 2;
  return [{ f: big, x, y, r: R }, ...rest.map((f, k) => {
    const r = diametre(f.mw) / 2;
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / Math.max(rest.length, 3);
    const d = R * 0.7 + r * 0.5;
    return { f, x: x + d * Math.cos(a), y: y + d * Math.sin(a), r };
  })];
}

/** The map, the reference rounds at the map's own scale, then the legend. `HIT`: a finger's zone, 66 units (map.ts). */
export function installationsMap(): string {
  const communes = INSTALLATIONS.communes.flatMap((c) => {
    const at = resolvePlace(c.commune)?.lieu;
    return at && c.filieres.length ? [{ c, xy: project(at.lon, at.lat) }] : [];
  });
  const groups = communes.map(({ c, xy }) => {
    const rounds = placer(xy, c.filieres);
    const reach = Math.max(66, ...rounds.map((p) => Math.hypot(p.x - xy[0], p.y - xy[1]) + p.r));
    const said = `${c.commune} : ${filieresText(c)}, registre d'EDF mis à jour le ${MIS_A_JOUR}`;
    return `<a class="mk ip" href="#inst-${slugify(c.commune)}" aria-label="${esc(said)}" data-tp="${esc(c.commune)}" data-tv="${esc(filieresText(c))}" data-td="${esc(`registre d'EDF mis à jour le ${MIS_A_JOUR}`)}">` +
      `<title>${esc(c.commune)}</title><circle class="hit" cx="${xy[0]}" cy="${xy[1]}" r="${Math.round(reach)}" style="fill:transparent;stroke:none"/>` +
      rounds.map((p) => `<circle class="sh ${CLASSE[p.f.nom] ?? "f-sto"}" cx="${Math.round(p.x)}" cy="${Math.round(p.y)}" r="${Math.round(p.r)}"${p.f.nom in GROUPES ? ` data-g="${GROUPES[p.f.nom]}" data-mw="${p.f.mw}"` : ""}/>`).join("") + `</a>`;
  }).join("");
  const label = `Carte de La Réunion : puissance installée par commune et par filière, d'après le registre d'EDF mis à jour le ${MIS_A_JOUR}`;
  // The names of the communes with the most power first: a big round's commune keeps its name, its neighbour gives way.
  const first = [...communes].sort((a, b) => total(b.c) - total(a.c)).map(({ c }) => c.commune);
  const map = islandMap({ top: `<g class="ips">${groups}</g>`, label, first });
  return map;
}

/** The legend under the map: the filières present, three reference rounds at the map's scale, then the source. */
export function installationsLegend(): string {
  const present = new Set(INSTALLATIONS.communes.flatMap((c) => c.filieres.map((f) => f.nom)));
  const keys = ORDRE.filter((n) => present.has(n)).map((n) =>
    `<span><svg viewBox="-20 -20 40 40" aria-hidden="true"><circle class="${CLASSE[n]}" r="15"/></svg>${esc(n)}</span>`).join("");
  // The reference rounds at the map's scale: each in its own SVG, as wide against the legend as the round against the
  // map (the legend is as wide as the map); their words in HTML beside them, at the page's text size.
  const refs = [10, 50, 200].map((mw) => {
    const d = diametre(mw) + 8;
    return `<svg viewBox="0 0 ${d.toFixed(1)} ${d.toFixed(1)}" style="width:${((d / W) * 100).toFixed(2)}%" aria-hidden="true">` +
      `<circle cx="${(d / 2).toFixed(1)}" cy="${(d / 2).toFixed(1)}" r="${(diametre(mw) / 2).toFixed(1)}"/></svg><span>${mwText(mw)}</span>`;
  }).join("");
  return `<span class="mlg ipk">${keys}</span>` +
    `<span class="iprw">${refs}</span>` +
    `<span class="mls">Puissance installée par commune et par filière, d'après le registre national des installations, mis à jour par EDF SEI le ${MIS_A_JOUR}. EDF publie la production pour toute l'île, filière par filière, pas centrale par centrale\u00a0: la carte montre ce qui peut produire, pas ce qui produit en ce moment.</span>`;
}

/**
 * The map's replay, right under the map and before its legend, so that the map stays on a phone's screen while the bar
 * moves: its own bar on the chart's moment, then, once played, the words of the estimate
 * (marketing, 31/10/2026) and the way back to the MW installed. Hidden until the script shows it; none without the
 * filières' production.
 */
export function installationsReplay(j: Journee): string {
  if (!j.mix?.length) return "";
  const n = j.points.length;
  return `<div class="ip-rj" hidden><div class="rj ech-rj"><button type="button" class="rj-b" aria-label="Lire les 24\u00a0dernières heures sur la carte">▶ Lire</button>${vitesseBouton("rj-v")}` +
    `<input type="range" min="0" max="${n - 1}" step="1" value="${n - 1}" aria-label="Moment affiché sur la carte"></div>` +
    `<p class="ip-est" hidden><b>Estimé\u00a0: chaque rond suit sa filière sur toute l'île, d'après la production publiée par EDF le <span class="ip-h"></span>.</b> ` +
    `La taille d'un rond n'est pas la production de cette centrale\u00a0: EDF ne la publie pas. Bioénergies et thermique suivent ensemble toutes les centrales à combustion (bagasse, biomasse, charbon, fioul…)\u00a0: EDF ne les range pas dans les mêmes filières que le registre des installations. ` +
    `<button type="button" class="ip-re">Revenir à la puissance installée</button></p></div>`;
}

/**
 * Each commune's line, where its zone on the map leads: its filières, the strongest first. « installations » in a <span>:
 * glued to its number, Chrome would not hyphenate it and left « ) » alone on a line; in the span it writes « installa-tions) ».
 * The bracket goes in the span too: after « installations</span> », WebKit put « ) » alone on the next line.
 */
export function installationsList(): string {
  return `<ul class="rows inst">${INSTALLATIONS.communes.map((c) =>
    `<li id="inst-${slugify(c.commune)}" class="tgt"><b>${esc(c.commune)}</b><span>${esc(filieresText(c)).replaceAll(/(\d)\u00a0(installations?\))/g, "$1\u00a0<span>$2</span>")}</span></li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- the filières, one by one

/**
 * What each filière is, in EDF SEI's words (the definitions of its yearly balance, « Production annuelle d'électricité
 * par filière »), in the map's order. Its share over a year (FIL_ANNEE): its columns of that balance (ANNEE_CHAMPS),
 * the coal, the diesel engines and the turbines in the thermique non renouvelable, as EDF counts them; over the 24 hours
 * (FIL_MIX): its column of Journee.mix, where EDF's live Biomasse and Bioliquide are bioénergies (electricite-historique.ts).
 */
const FIL_TEXTE: Record<string, string> = {
  "bioénergies": "Bois énergie, bagasse, autres biocombustibles solides ou liquides, biogaz, incinération des déchets ménagers\u00a0: la filière telle qu'EDF la définit.",
  "solaire": "",
  "hydraulique": "Les centrales au fil de l'eau, d'éclusée et de lac, comme EDF les compte.",
  "éolien": "",
  "thermique non renouvelable": "Charbon, moteurs diesel et turbines à combustion au fioul, comme EDF les compte\u00a0; ce qu'ils produisent à partir de bagasse, de bioliquide ou de bioéthanol va aux bioénergies.",
  "stockage non hydraulique": "Il rend au réseau de l'électricité produite avant\u00a0: il n'entre pas dans les parts de production.",
};
const FIL_MIX: Record<string, number> = { "solaire": 0, "éolien": 1, "hydraulique": 2, "bioénergies": 3, "thermique non renouvelable": 4 };
const FIL_ANNEE: Record<string, number[]> = { "solaire": [0], "éolien": [1], "hydraulique": [2], "bioénergies": [3], "thermique non renouvelable": [4, 5, 6] };
/** « au Port », « à l'Entre-Deux » (as aujourdhui.ts says it, without importing the pages through it). */
const aCommune = (nom: string) => (nom === "Entre-Deux" ? "à l'Entre-Deux" : a(nom));
const NOMBRES = ["", "une", "deux", "trois", "quatre", "cinq", "six", "sept"];
/** The register's MW to a tenth, as it gives them: « 99,5 », « 9 ». */
const mw1 = (mw: number) => String(Math.round(mw * 10) / 10).replace(".", ",");
const pctText = (v: number) => `${v.toFixed(1).replace(".", ",")}\u00a0%`;
/** The communes said for a filière's biggest installations, the biggest first. */
const GRANDES_COMMUNES = 3;
/** EDF's dataset pages, the sources under the section. */
const EDF_PAGE = "https://opendata-reunion.edf.fr/datasets/";

/**
 * A filière's biggest installations, commune by commune, the biggest first, in GRANDES_COMMUNES places at most:
 * « quatre de 40 MW à La Possession ». An installation the register names is a place of its own.
 */
function grandesText(gs: Grande[]): string {
  const groups: { at: string; mws: number[]; nom?: string }[] = [];
  for (const g of gs) {
    const same = !g.nom && groups.find((x) => x.at === g.commune && !x.nom);
    if (same) same.mws.push(g.mw);
    else groups.push({ at: g.commune, mws: [g.mw], ...(g.nom && { nom: g.nom }) });
  }
  return groups.slice(0, GRANDES_COMMUNES).map(({ at, mws, nom }) =>
    (mws.length > 1 && mws.every((v) => v === mws[0]) ? `${NOMBRES[mws.length] ?? mws.length} de ${mw1(mws[0])}\u00a0MW` : `${enumeration(mws.map(mw1))}\u00a0MW`) +
    ` ${aCommune(at)}${nom ? ` (« ${esc(nom)} », le seul nom que donne le registre)` : ""}`).join(", ");
}

/**
 * « Les filières »: each filière of the map, in its colour, what it is, the MW the register gives it and its biggest
 * installations, then its share of the production over EDF's last 24 hours and, once the chart's script has read the
 * yearly balance (/electricite/historique.json), over the last year published. Only figures read: the register's, EDF's.
 */
export function filieresSection(j?: Journee): string {
  const mix = j?.mix?.length ? j.mix : undefined;
  const produit = mix ? mix.reduce((t, f) => t + f.slice(0, 5).reduce((s, v) => s + Math.max(0, v), 0), 0) : 0;
  const items = ORDRE.map((nom) => {
    const fs = INSTALLATIONS.communes.flatMap((c) => c.filieres.filter((f) => f.nom === nom));
    if (!fs.length) return "";
    const mw = fs.reduce((t, f) => t + f.mw, 0);
    const n = fs.reduce((t, f) => t + f.installations, 0);
    const gs = INSTALLATIONS.grandes[nom] ?? [];
    const petites = nom === "solaire" && INSTALLATIONS.moins_de_36_kw.installations
      ? `, dont ${INSTALLATIONS.moins_de_36_kw.installations.toLocaleString("fr-FR")} de moins de 36\u00a0kW, ${mw1(INSTALLATIONS.moins_de_36_kw.mw)}\u00a0MW` : "";
    const all = gs.length === n && new Set(gs.map((x) => x.nom ?? x.commune)).size <= GRANDES_COMMUNES;
    const figures = all
      ? `${mwText(mw)} installés en ${installations(n)}\u00a0: ${grandesText(gs)}.`
      : `${mwText(mw)} installés (${installations(n)}${petites})${gs.length ? `\u00a0; les plus grandes\u00a0: ${grandesText(gs)}` : ""}.`;
    const g = FIL_MIX[nom];
    const part = g == null || !mix || !(produit > 0) ? "" :
      `<p class="fil-p">Part de la production\u00a0: <b>${pctText((mix.reduce((t, f) => t + Math.max(0, f[g]), 0) / produit) * 100)}</b> sur les dernières 24\u00a0h` +
      `<span class="fil-a" data-k="${FIL_ANNEE[nom].join(",")}" hidden></span>.</p>`;
    return `<li><h3><svg viewBox="-20 -20 40 40" aria-hidden="true"><circle class="${CLASSE[nom]}" r="15"/></svg>${esc(nom[0].toUpperCase() + nom.slice(1))}</h3>` +
      `${FIL_TEXTE[nom] ? `<p class="fil-t">${FIL_TEXTE[nom]}</p>` : ""}<p>${figures}</p>${part}</li>`;
  }).join("");
  return `<section aria-labelledby="h-filieres">
  <div class="sec-h"><p class="eyebrow">Les filières</p><h2 id="h-filieres">Les filières, une par une</h2></div>
  <div class="card fil"><ul class="fil-l">${items}</ul>
  <p class="mls">Puissance installée\u00a0: <a href="${EDF_PAGE}registre-national-des-installations-de-production-et-de-stockage-d-electricite-reunion">registre national des installations</a> (RTE, EDF SEI), mis à jour par EDF SEI le ${MIS_A_JOUR}\u00a0; il tait le nom de presque toutes les installations («\u00a0Confidentiel\u00a0»). ` +
    `Définitions et part sur l'année\u00a0: <a href="${EDF_PAGE}production-annuelle-delectricite-par-filiere-reunion">bilan annuel d'EDF SEI</a>. ` +
    `Part sur 24\u00a0h\u00a0: <a href="${EDF_PAGE}njq-knwu0diqrdup6tya8qxi">production en direct d'EDF SEI</a>, ses colonnes Bioénergies, Biomasse et Bioliquide comptées en bioénergies, ses turbines à combustion en thermique non renouvelable, sans le stockage. Licence Ouverte.</p></div>
</section>`;
}

// ---------------------------------------------------------------- the chart of the 24 hours

/** The plot in its own units; its graduations are HTML around it, at the page's text sizes on a phone as on a computer. */
const CW = 1000;
/** The file of the durations and the years (electricite-historique.ts), read by the chart's script. */
export const HISTORIQUE_PATH = "/electricite/historique.json";
const CH = 480;

const hm = (t: number) => new Date(t + 4 * 3600_000).toISOString().slice(11, 16);
const dm = (t: number) => { const d = new Date(t + 4 * 3600_000).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}`; };
const pct = (ren: number, non: number) => (ren + non > 0 ? Math.round((ren / (ren + non)) * 100) : 0);
const at = (v: number) => `${(v * 100).toFixed(2)}%`;

/** What the cursor says, as the script says it (CHART_SCRIPT): « 31/10 à 05:20 : 281 MW, dont 95 % renouvelable. » */
export const momentText = (t: number, total: number, ren: number, non: number) =>
  `${dm(t)} à ${hm(t)}\u00a0: ${Math.round(total)}\u00a0MW, dont ${pct(ren, non)}\u00a0% renouvelable.`;

/**
 * The chart, its cursor on the latest point; above it, once the script has read /electricite/historique.json, the
 * durations the archive has (24 h, 7 jours, 30 jours); beside it (under it on a phone) the words of that moment, the
 * replay's bar, the source.
 */
export function productionChart(j: Journee): string {
  const t0 = Date.parse(j.debut);
  const pts = j.points;
  const last = pts[pts.length - 1];
  const span = Math.max(last[0], 60);
  const top = Math.max(100, Math.ceil(Math.max(...pts.map((p) => p[1] + p[2])) / 100) * 100);
  const X = (m: number) => (CW * m) / span;
  const Y = (mw: number) => CH - (CH * mw) / top;
  // Each area down to the axis: the whole production behind, the renewable part over it; whole units, under a pixel.
  const area = (f: (p: (typeof pts)[number]) => number) =>
    `M${Math.round(X(pts[0][0]))} ${CH}L${pts.map((p) => `${Math.round(X(p[0]))} ${Math.round(Y(f(p)))}`).join("L")}L${Math.round(X(last[0]))} ${CH}Z`;
  const levels = Array.from({ length: top / 100 + 1 }, (_, k) => k * 100);
  const grid = levels.map((mw) => `<line x1="0" x2="${CW}" y1="${Y(mw)}" y2="${Y(mw)}"/>`).join("");
  // The hours: every 6 hours, on the round hour.
  const first = Math.ceil((t0 + 4 * 3600_000) / (6 * 3600_000)) * 6 * 3600_000 - 4 * 3600_000;
  const hours: number[] = [];
  for (let t = first; t <= t0 + span * 60_000; t += 6 * 3600_000) hours.push(t);
  const tl = t0 + last[0] * 60_000;
  const lows = Math.min(...pts.map((p) => pct(p[1], p[2])));
  const highs = Math.max(...pts.map((p) => pct(p[1], p[2])));
  const label = `Production d'électricité de l'île sur 24\u00a0h, du ${dm(t0)} à ${hm(t0)} au ${dm(tl)} à ${hm(tl)}\u00a0: part renouvelable de ${lows}\u00a0% à ${highs}\u00a0%.`;
  const svg = `<svg class="ech" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<g class="cg">${grid}</g><path class="ar ar-non" d="${area((p) => p[1] + p[2])}"/><path class="ar ar-ren" d="${area((p) => p[1])}"/>` +
    `<line class="cur" x1="${X(last[0])}" x2="${X(last[0])}" y1="0" y2="${CH}" vector-effect="non-scaling-stroke"/></svg>`;
  // The graduations drawn by the style (`data-v`), not written in the page: one after the other, « 400 MW300200100 »
  // and the hours read as a phone number to iOS, which underlined them as a link (the user's iPhone, 31/10/2026).
  const ys = levels.map((mw) => `<span class="cy" style="top:${at(Y(mw) / CH)}" data-v="${mw === top ? `${mw}\u00a0MW` : mw}"></span>`).join("");
  const xs = hours.map((t) => `<span class="cx" style="left:${at(X((t - t0) / 60_000) / CW)}" data-v="${hm(t)}"></span>`).join("");
  const keys = `<span class="mlg ech-kr"><span><svg viewBox="-20 -20 40 40" aria-hidden="true"><rect class="ar-ren" x="-15" y="-15" width="30" height="30" rx="4"/></svg>renouvelable</span>` +
    `<span><svg viewBox="-20 -20 40 40" aria-hidden="true"><rect class="ar-non" x="-15" y="-15" width="30" height="30" rx="4"/></svg>non renouvelable</span></span>`;
  const bar = `<div class="rj ech-rj" hidden><button type="button" class="rj-b" aria-label="Lire les 24\u00a0dernières heures">▶ Lire</button>${vitesseBouton("rj-v")}` +
    `<input type="range" min="0" max="${pts.length - 1}" step="1" value="${pts.length - 1}" aria-label="Moment affiché sur le graphique"></div>`;
  // The durations: the archive's, shown by the script once it has them; « depuis le … » under them while one is not
  // full (in the buttons, two lines on a phone).
  const durees = `<div class="ech-d" role="group" aria-label="Durée du graphique" hidden><button type="button" aria-pressed="true" data-d="j1">24\u00a0h</button>` +
    `<button type="button" aria-pressed="false" data-d="j7" hidden>7\u00a0jours</button><button type="button" aria-pressed="false" data-d="j30" hidden>30\u00a0jours</button></div><p class="mls ech-dd" hidden></p>`;
  const source = `Production d'électricité de l'île sur 24\u00a0h, toutes les 5\u00a0minutes, estimée par EDF${j.mis_a_jour ? ` (mise à jour le ${esc(j.mis_a_jour.replace(" ", " à "))})` : ""}. Part renouvelable selon les filières d'EDF, sans les batteries.`;
  const archive = `Moyennes par heure (7\u00a0jours) ou par 3\u00a0heures (30\u00a0jours), calculées par rundata.re d'après la production qu'EDF publie toutes les 5\u00a0minutes. EDF ne garde que les 24\u00a0dernières heures\u00a0: rundata.re les garde depuis le <span class="ech-dp"></span>.`;
  // The points for the script, in whole MW: what it says is rounded the same. With each filière's MW when the copy has
  // them (`m`), and each group's MW installed (`i`), for the map's rounds: none in a copy kept before them.
  const mix = j.mix?.length === pts.length ? j.mix : undefined;
  const fs = mix ? { m: mix.map((f) => f.map(Math.round)), i: INSTALLE.map((mw) => Math.round(mw * 10) / 10) } : {};
  const data = esc(JSON.stringify({ t0, s: span, p: pts.map((p) => p.map(Math.round)), ...fs }));
  // The view: the renewable part, or each filière in the map's colours, its legend under the chart.
  const vue = mix ? `<div class="ech-d ech-v" role="group" aria-label="Vue du graphique" hidden><button type="button" aria-pressed="true" data-v="ren">Renouvelable</button>` +
    `<button type="button" aria-pressed="false" data-v="fil">Par filière</button></div>` : "";
  const fkeys = mix ? `<span class="mlg ech-kf" hidden>${LEGENDE.map((i) =>
    `<span><svg viewBox="-20 -20 40 40" aria-hidden="true"><rect class="${MIX[i][1]}" x="-15" y="-15" width="30" height="30" rx="4"/></svg>${MIX[i][0]}</span>`).join("")}</span>` : "";
  return `<figure class="card ecard" data-ech="${data}" data-h="${HISTORIQUE_PATH}">${durees}${vue}<div class="ech-g"><div class="ech-p">${svg}<span class="ech-ax" aria-hidden="true">${ys}${xs}</span></div>` +
    `<figcaption class="note"><p class="ech-m" aria-live="polite">${esc(momentText(tl, Math.round(last[3]), Math.round(last[1]), Math.round(last[2])))}</p>${bar}${keys}${fkeys}<span class="mls ech-src">${source}</span><span class="mls ech-n" hidden>${archive}</span></figcaption></div></figure><script>${CHART_SCRIPT}</script>`;
}

/**
 * The year's production by filière (EDF SEI's yearly figures, /electricite/historique.json), in the bars of « Filière
 * par filière » (renewable in green, as EDF counts it), a button per year, the latest first shown: filled by the
 * chart's script once it has them, hidden until then and without a script.
 */
export function anneeSection(): string {
  return `<section aria-labelledby="h-annee" data-an hidden>
  <div class="sec-h"><p class="eyebrow">L'année</p><h2 id="h-annee">La production de <span class="an-y"></span>, filière par filière</h2></div>
  <div class="card an"><div class="ech-d an-d" role="group" aria-label="Année du bilan"></div>
  <p class="an-tot"></p><ul class="bars an-l"></ul><p class="mls an-src"></p></div>
</section>`;
}

/**
 * The replay of the chart: each bar's slider and button (the chart's, the map's) move the cursor from point to point,
 * the words under the chart follow it; over PLAY_MS for the duration shown at ×1, at the speed chosen (vitesse.ts),
 * from the start or from where the slider is. Once a bar is touched, the map's rounds follow the moment too (`on`), each its MW × its group's share (`f`, in
 * thousandths), its words under it, until « Revenir à la puissance installée »; a map put in the page later takes the
 * moment when it comes (the event `carte`). Without a script, the cursor stays on the latest point, the bars hidden;
 * with less motion asked, no button (ELECTRICITE_CSS), the sliders only. The durations of the archive and the year's
 * figures: read once, when the chart nears the screen; the chart redrawn by the script for 7 and 30 days, its
 * graduations as the server draws them. Once the page is read: the map's bar and the year's section come after it.
 */
const PLAY_MS = 12_000;
const CHART_SCRIPT = `(()=>{${VITESSE_JS}const go=()=>{const f=document.querySelector("[data-ech]");if(!f)return;const D={j1:JSON.parse(f.dataset.ech)},svg=f.querySelector("svg.ech"),cur=f.querySelector(".cur"),m=f.querySelector(".ech-m"),ax=f.querySelector(".ech-ax"),src=f.querySelector(".ech-src"),note=f.querySelector(".ech-n"),du=f.querySelector(".ech-d"),an=document.querySelector("[data-an]"),
ip=D.j1.m&&document.querySelector(".ip-rj"),bars=[...document.querySelectorAll(".ech-rj")].filter((x)=>f.contains(x)||ip&&ip.contains(x)),est=ip&&ip.querySelector(".ip-est");
const hm=(t)=>new Date(t+144e5).toISOString().slice(11,16),dm=(t)=>{const d=new Date(t+144e5).toISOString();return d.slice(8,10)+"/"+d.slice(5,7)},dmy=(s)=>{const d=new Date(Date.parse(s)+144e5).toISOString();return d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4)},pc=(r,n)=>r+n>0?Math.round(r/(r+n)*100):0,nb=(v,d)=>v.toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});
const I=D.j1.i,vw=f.querySelector(".ech-v"),kr=f.querySelector(".ech-kr"),kf=f.querySelector(".ech-kf"),dd=f.querySelector(".ech-dd"),MIX=${inScript(MIX)},PILE=${inScript(PILE)},LEG=${inScript(LEGENDE)};
const hh=(x)=>x%24?x+"\\u00a0h":"minuit",DUREE={j1:"24\\u00a0h",j7:"7\\u00a0jours",j30:"30\\u00a0jours"},LIRE={j1:"Lire les 24\\u00a0dernières heures",j7:"Lire les 7\\u00a0derniers jours",j30:"Lire les 30\\u00a0derniers jours"},SUR={j7:"Production d'électricité de l'île sur 7\\u00a0jours, en moyenne par heure.",j30:"Production d'électricité de l'île sur 30\\u00a0jours, en moyenne par 3\\u00a0heures.",j1:svg.getAttribute("aria-label")};
let k="j1",J=D.j1,at=J.p.length-1,on=false,run=0,v="ren";
const fil=()=>v==="fil"&&J.m&&J.m.length===J.p.length,sh=(r,g)=>{const x=g===3?r[3]+r[4]:r[g>3?5:g];return I[g]>0?Math.min(1,x/I[g]):0};
const map=()=>{if(!ip)return;document.querySelectorAll(".ip circle[data-g]").forEach((c)=>{if(!c.dataset.r)c.dataset.r=c.getAttribute("r");c.setAttribute("r",on&&J.m?Math.max(3,4.13*Math.sqrt(c.dataset.mw*sh(J.m[at],+c.dataset.g))).toFixed(1):c.dataset.r)})};
const show=(i,user)=>{at=i;const p=J.p[i],x=1e3*p[0]/J.s,t=J.t0+p[0]*6e4;cur.setAttribute("x1",x);cur.setAttribute("x2",x);bars.forEach((b)=>{const r=b.querySelector("input");r.max=J.p.length-1;r.value=i});const a=new Date(t+144e5).getUTCHours();m.textContent=(k==="j1"?dm(t)+" à "+hm(t)+"\\u00a0: "+Math.round(p[3])+"\\u00a0MW":dm(t)+", de "+hh(a)+" à "+hh(a+J.pas)+"\\u00a0: "+Math.round(p[3])+"\\u00a0MW en moyenne")+", dont "+(fil()?LEG.map((g)=>MIX[g][0]+" "+J.m[i][g]+"\\u00a0MW").join(", "):pc(p[1],p[2])+"\\u00a0% renouvelable")+".";
if(ip&&J.m&&(user||on)){on=true;est.hidden=false;est.querySelector(".ip-h").textContent=dm(t)+" à "+hm(t);map()}else if(ip&&!J.m&&on){on=false;est.hidden=true;map()}};
const stop=()=>{cancelAnimationFrame(run);run=0;bars.forEach((x)=>{const b=x.querySelector("button");b.textContent="▶ Lire";b.setAttribute("aria-label",LIRE[k]+b.dataset.s)})};
bars.forEach((x)=>{const b=x.querySelector("button"),rg=x.querySelector("input");b.dataset.s=ip&&ip.contains(x)?" sur la carte":"";
b.addEventListener("click",()=>{if(run)return stop();const P=J.p;let x=at,t0=0;if(x>=P.length-1)x=0;b.textContent="❚❚ Pause";b.setAttribute("aria-label","Arrêter");
const step=(now)=>{if(t0)x+=(now-t0)/${PLAY_MS}*(P.length-1)*V;t0=now;const i=Math.min(P.length-1,Math.round(x));show(i,1);if(i>=P.length-1)return stop();run=requestAnimationFrame(step)};run=requestAnimationFrame(step)});
rg.addEventListener("input",()=>{if(run)stop();show(+rg.value,1)});x.hidden=false});vbind(bars.map((x)=>x.querySelector(".rj-v")).filter(Boolean));
if(ip){ip.hidden=false;ip.querySelector(".ip-re").addEventListener("click",()=>{if(run)stop();on=false;est.hidden=true;map()});document.addEventListener("carte",()=>{if(on)map()})}
const NS="http://www.w3.org/2000/svg",sp=(c,st,v)=>{const e=document.createElement("span");e.className=c;e.setAttribute("style",st);e.dataset.v=v;return e};
const draw=()=>{const P=J.p,last=P[P.length-1],top=Math.max(100,Math.ceil(Math.max(...P.map((p)=>p[1]+p[2]))/100)*100),X=(v)=>1e3*v/J.s,Y=(v)=>480-480*v/top;
const area=(g)=>"M"+Math.round(X(P[0][0]))+" 480L"+P.map((p,i)=>Math.round(X(p[0]))+" "+Math.round(Y(g(p,i)))).join("L")+"L"+Math.round(X(last[0]))+" 480Z";
const F=fil();svg.querySelector(".ar-non").setAttribute("d",F?"":area((p)=>p[1]+p[2]));svg.querySelector(".ar-ren").setAttribute("d",F?"":area((p)=>p[1]));
let gf=svg.querySelector(".arf");if(!gf){gf=document.createElementNS(NS,"g");gf.setAttribute("class","arf");svg.insertBefore(gf,cur)}
gf.replaceChildren(...(F?PILE.map((g,n)=>{const e=document.createElementNS(NS,"path");e.setAttribute("class","ar "+MIX[g][1]);e.setAttribute("d",area((p,i)=>PILE.slice(0,n+1).reduce((x,h)=>x+J.m[i][h],0)));return e}).reverse():[]));
if(kf){kr.hidden=F;kf.hidden=!F}svg.setAttribute("aria-label",F?"Production d'électricité de l'île sur "+DUREE[k]+", par filière\\u00a0: "+LEG.map((g)=>MIX[g][0]).join(", ")+".":SUR[k]);
const lv=[];for(let v=0;v<=top;v+=100)lv.push(v);svg.querySelector(".cg").replaceChildren(...lv.map((v)=>{const l=document.createElementNS(NS,"line");l.setAttribute("x1",0);l.setAttribute("x2",1e3);l.setAttribute("y1",Y(v));l.setAttribute("y2",Y(v));return l}));
const H=k==="j1"?216e5:k==="j7"?864e5:432e6,lab=k==="j1"?hm:dm,t1=J.t0+last[0]*6e4,ts=[];for(let t=Math.ceil((J.t0+144e5)/H)*H-144e5;t<=t1;t+=H)ts.push(t);
ax.replaceChildren(...lv.map((v)=>sp("cy","top:"+(Y(v)/4.8).toFixed(2)+"%",v===top?v+"\\u00a0MW":v)),...ts.map((t)=>sp("cx","left:"+(X((t-J.t0)/6e4)/10).toFixed(2)+"%",lab(t))));
src.hidden=k!=="j1";note.hidden=k==="j1"};
if(vw){vw.hidden=false;vw.querySelectorAll("button").forEach((b)=>b.addEventListener("click",()=>{if(b.dataset.v===v)return;v=b.dataset.v;vw.querySelectorAll("button").forEach((x)=>x.setAttribute("aria-pressed",x===b));draw();show(at)}))}
du.querySelectorAll("button").forEach((b)=>b.addEventListener("click",()=>{const n=b.dataset.d;if(!D[n]||n===k)return;if(run)stop();k=n;J=D[n];du.querySelectorAll("button").forEach((x)=>x.setAttribute("aria-pressed",x===b));draw();show(J.p.length-1);stop()}));
const NOMS=["Photovoltaïque","Éolien","Hydraulique","Bioénergies","Charbon","Diesel","Turbines à combustion"],gwh=(v)=>nb(v/1e3,v<1e4?1:0)+"\\u00a0GWh",el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const year=(a)=>{const L=a.annees[a.annees.length-1],dd=an.querySelector(".an-d"),
pick=(Y)=>{an.querySelector(".an-y").textContent=Y.annee;dd.querySelectorAll("button").forEach((x)=>x.setAttribute("aria-pressed",x.textContent===String(Y.annee)));
an.querySelector(".an-tot").textContent="Total\\u00a0: "+gwh(Y.total)+". Part renouvelable, selon EDF\\u00a0: "+nb(Y.part_enr,1)+"\\u00a0%.";
an.querySelector(".an-l").replaceChildren(...Y.filieres.map((v,i)=>[v,i]).sort((x,y)=>y[0]-x[0]).map(([v,i])=>{const s=Y.total>0?v/Y.total*100:0,li=el("li"),b=el("i",i<4?"ren":null);b.style.width=Math.max(1,s).toFixed(1)+"%";li.append(el("span",null,NOMS[i]),el("b",null,gwh(v)+" · "+nb(s,1)+"\\u00a0%"),b);return li}))};
dd.replaceChildren(...a.annees.map((Y)=>{const b=el("button",null,String(Y.annee));b.type="button";b.addEventListener("click",()=>pick(Y));return b}));pick(L);
an.querySelector(".an-src").textContent="Bilan annuel publié par EDF SEI"+(a.mis_a_jour?", mis à jour le "+dmy(a.mis_a_jour):"")+"\\u00a0: "+L.annee+" est la dernière année publiée (lu le "+dmy(a.lu)+").";an.hidden=false};
const fy=(a)=>{const L=a.annees[a.annees.length-1];if(!(L.total>0))return;document.querySelectorAll(".fil-a").forEach((s)=>{const v=s.dataset.k.split(",").reduce((t,i)=>t+(L.filieres[+i]||0),0);s.replaceChildren(", ",el("b",null,nb(v/L.total*100,1)+"\\u00a0%")," en "+L.annee);s.hidden=false})};
let asked=0;const ask=()=>{if(asked)return;asked=1;fetch(f.dataset.h).then((r)=>r.ok?r.json():{}).catch(()=>({})).then((h)=>{const pa=["j7","j30"].filter((n)=>h[n]&&h[n].depuis);["j7","j30"].forEach((n)=>{if(!h[n])return;D[n]=h[n];du.querySelector('[data-d="'+n+'"]').hidden=false});
if(pa.length){dd.textContent=(pa.length>1?"7 et 30\\u00a0jours":DUREE[pa[0]])+"\\u00a0: depuis le "+dm(Date.parse(h[pa[0]].depuis))+", début de l'archive de rundata.re.";dd.hidden=false}
if(h.j7||h.j30){du.hidden=false;if(h.depuis)note.querySelector(".ech-dp").textContent=dm(Date.parse(h.depuis))}if(h.annuel&&h.annuel.annees&&h.annuel.annees.length){if(an)year(h.annuel);fy(h.annuel)}})};
if(window.IntersectionObserver){const o=new IntersectionObserver((e)=>{if(e.some((x)=>x.isIntersecting)){o.disconnect();ask()}},{rootMargin:"100% 0px"});o.observe(f)}else ask()};document.readyState==="loading"?addEventListener("DOMContentLoaded",go,{once:true}):go()})();`;

/** Their style, in the page's sheet: the filières' and the areas' colours in each theme (marketing, 31/10/2026). */
// `.ipm`: the map's room, kept while it waits to be put in the page (laterMap()).
export const ELECTRICITE_CSS = `.ipm{aspect-ratio:${W}/${H}}` +
  `:root{--f-sol:#b97f00;--f-bio:#2b8a46;--f-hyd:#1c6fc2;--f-eol:#4fa3c7;--f-the:#5a6672;--f-sto:#7048e8;--a-ren:#2b8a46;--a-non:#5a6672}` +
  `@media (prefers-color-scheme:dark){:root{--f-sol:#ffcf1f;--f-bio:#5ee08a;--f-hyd:#4dabf7;--f-eol:#a5d8ff;--f-the:#8a96a3;--f-sto:#b197fc;--a-ren:#5ee08a;--a-non:#8a96a3}}` +
  `.f-sol{fill:var(--f-sol)}.f-bio{fill:var(--f-bio)}.f-hyd{fill:var(--f-hyd)}.f-eol{fill:var(--f-eol)}.f-the{fill:var(--f-the)}.f-sto{fill:var(--f-sto)}` +
  `.map .ip circle:not(.hit){stroke:#fff;stroke-width:4}.mlg.ipk circle{stroke:#fff;stroke-width:4}` +
  `.iprw{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin:.3rem 0 .5rem}.iprw svg{height:auto;flex:none}.iprw circle{fill:none;stroke:var(--muted);stroke-width:4}.iprw>span{color:var(--muted);font-weight:600;font-size:.82rem;white-space:nowrap;margin-right:.9rem}` +
  `.ech-g{display:grid;gap:1rem}@media (min-width:58rem){.ech-g{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);align-items:start}}` +
  `.ech-p{position:relative;margin:.6rem 0 1.9rem 3.1rem}.ech{display:block;width:100%;height:auto;aspect-ratio:${CW}/${CH};overflow:visible}.ech .cg line{stroke:var(--line);stroke-width:2;vector-effect:non-scaling-stroke}` +
  `.ech-p .cy,.ech-p .cx{position:absolute;color:var(--muted);font-size:.8rem;font-weight:600;line-height:1;white-space:nowrap}.ech-p .cy::before,.ech-p .cx::before{content:attr(data-v)}.ech-p .cy{right:calc(100% + .4rem);transform:translateY(-50%)}.ech-p .cx{top:calc(100% + .45rem);transform:translateX(-50%)}` +
  `.ar-ren{fill:var(--a-ren)}.ar-non{fill:var(--a-non)}.ech .cur{stroke:var(--ink);stroke-width:2.5}.ech-m{font-weight:700;font-size:1.05rem;color:var(--ink);margin:0 0 .5rem}` +
  `.ech-rj{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.4rem 0}.ech-rj[hidden]{display:none}` +
  `.ech-rj button{min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}` +
  `.ech-rj .rj-v{min-width:3.6rem;padding-inline:.6rem}.ech-rj input{flex:1 1 12rem;min-height:44px;accent-color:var(--ink)}@media (prefers-reduced-motion:reduce){.ech-rj button{display:none}}` +
  `.ip-rj .ech-rj{margin:.6rem 0 .2rem}.ip-est{margin:.3rem 0 0;color:var(--muted)}.ip-est b{color:var(--ink)}.ip-re{display:block;margin-top:.5rem;min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}` +
  `.ech-d{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .6rem}.ech-d[hidden],.ech-d button[hidden]{display:none}.ech-d button{min-height:44px;padding:.35rem .9rem;border-radius:999px;border:1px solid var(--line);background:none;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}.ech-d button[aria-pressed=true]{background:var(--ink);color:var(--surface)}` +
  `.an-d button{padding:.35rem .75rem}.an-l{margin:.4rem 0 .2rem}.an-l b{font-variant-numeric:tabular-nums;white-space:nowrap}` +
  `.ecard .mls[hidden],.ecard .mlg[hidden]{display:none}.ech-dd{margin:-.2rem 0 .6rem;color:var(--muted);font-size:.85rem}.an-tot{font-weight:700;margin:.8rem 0 .3rem}.an .mls{display:block;margin:.3rem 0 0}` +
  `.rows.inst li{display:flex;flex-wrap:wrap;gap:.2rem .8rem}.rows.inst li>span{color:var(--muted)}.ipc details{margin-top:.8rem}.ipc summary h3{display:inline;font-size:1rem}` +
  `.fil-l{list-style:none;padding:0;margin:0;display:grid;gap:1.1rem 2rem}@media (min-width:48rem){.fil-l{grid-template-columns:1fr 1fr}}.fil-l h3{display:flex;align-items:center;gap:.5rem;font-size:1.05rem;margin:0 0 .25rem}.fil-l h3 svg{width:1.1rem;height:1.1rem;flex:none}.fil-l circle{stroke:#fff;stroke-width:4}` +
  `.fil-l p{margin:.15rem 0}.fil-t{color:var(--muted)}.fil-p b{font-variant-numeric:tabular-nums}.fil-a[hidden]{display:none}.fil .mls{margin:1rem 0 0;color:var(--muted);font-size:.85rem}` +
  `@media (max-width:37.49rem){.ech{aspect-ratio:${CW}/700}}`;
