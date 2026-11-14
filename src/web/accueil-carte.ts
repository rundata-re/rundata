/**
 * The island at the top of the home page (the user's choice, 10/11/2026): one square label per subject around the
 * island, each tied by a track to the real place it speaks of, over the island's relief. The look is marketing's
 * « Lagon » (each subject in its colour, bends rounded, the places as hubs in a dashed ring, the coast's lagoon glow);
 * the placement is ux's « Circuit » (labels on the edges, tracks horizontal, vertical or at 45°, none crossing another).
 * A phone and a wide screen each have their layout, the island drawn once (reliefDefs()).
 *
 * Hover, keyboard focus or a first tap on a subject (the bubble's script marks the link `.on`, pages.ts): its tracks
 * light up and thicken, a pulse of its colour runs from the label to the place, its rings turn, the rest fades. The
 * tracks between the places of Météo, the bikes, the trails and the forest roads are not drawn at rest: the pulse makes
 * them grow, from the place nearest its label to the others, as it goes (the user, 11/11).
 *
 * Everything comes from the copies the home page reads already (HomeLive): nothing more is read. A subject without a
 * value is not shown; a track to a place the data does not locate is not drawn.
 */
import type { Cached } from "../cache.js";
import type { AgendaAnswer, AirAnswer, ElectriciteAnswer, HomeData, SeaNow, SentiersAnswer, TraficAnswer, VelosAnswer, VolcanAnswer } from "./data.js";
import { de } from "../articles.js";
import { NIVEAUX } from "../providers/coraux.js";
import { resolvePlace } from "../places/resolve.js";
import { fourchette, fr } from "../tools/format.js";
import { alerteVolcan } from "./volcan-alerte.js";
import { closedTrails } from "./domains.js";
import { esc, islandMap, type Marker, project, reliefDefs } from "./map.js";
import { chip, deg, hm, leAt, metres, shortName, stationId, thin, withTemp } from "./pages.js";

// ---------------------------------------------------------------- geometry, in map units

export type P = [number, number];
export type Seg = [number, number, number, number];
export type Box = [number, number, number, number];

const segBox = (s: Seg, pad = 0): Box => [Math.min(s[0], s[2]) - pad, Math.min(s[1], s[3]) - pad, Math.max(s[0], s[2]) + pad, Math.max(s[1], s[3]) + pad];
export const boxHit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Two segments crossing each other (touching at an end does not count). */
export function segSeg(a: Seg, b: Seg): boolean {
  const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const [p1, p2, p3, p4] = [[a[0], a[1]], [a[2], a[3]], [b[0], b[1]], [b[2], b[3]]];
  return o(p1, p2, p3) * o(p1, p2, p4) < 0 && o(p3, p4, p1) * o(p3, p4, p2) < 0;
}

/** A segment passing within `r` of a point. */
export function segNear(s: Seg, c: P, r: number): boolean {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((c[0] - x1) * dx + (c[1] - y1) * dy) / l));
  return Math.hypot(x1 + t * dx - c[0], y1 + t * dy - c[1]) < r;
}

/** A segment entering a box. */
export function segRect(s: Seg, b: Box): boolean {
  const inside = (x: number, y: number) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
  if (inside(s[0], s[1]) || inside(s[2], s[3])) return true;
  const e: Seg[] = [[b[0], b[1], b[2], b[1]], [b[2], b[1], b[2], b[3]], [b[2], b[3], b[0], b[3]], [b[0], b[3], b[0], b[1]]];
  return e.some((x) => segSeg(s, x));
}

/**
 * The ways from a to b of a circuit: straight (horizontal, vertical or 45°), or a 45° piece and a straight one, in
 * either order. `end`: the direction the way must end in (into a label's side, h; into its top or bottom, v).
 */
function octo(a: P, b: P, end?: "h" | "v"): Seg[][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const [sx, sy, ax, ay] = [Math.sign(dx), Math.sign(dy), Math.abs(dx), Math.abs(dy)];
  const out: Seg[][] = [];
  if (!dx || !dy || ax === ay) out.push([[a[0], a[1], b[0], b[1]]]);
  const d = Math.min(ax, ay);
  if (d && ax !== ay) {
    const m1: P = [a[0] + sx * d, a[1] + sy * d];
    const m2: P = [b[0] - sx * d, b[1] - sy * d];
    out.push([[a[0], a[1], m1[0], m1[1]], [m1[0], m1[1], b[0], b[1]]], [[a[0], a[1], m2[0], m2[1]], [m2[0], m2[1], b[0], b[1]]]);
  }
  const last = (r: Seg[]) => {
    const s = r[r.length - 1];
    return s[1] === s[3] ? "h" : s[0] === s[2] ? "v" : "d";
  };
  return end ? out.filter((r) => last(r) === end) : out;
}

/** A way's length, plus 40 a bend: the shorter and straighter first. */
const len = (r: Seg[]) => r.reduce((s, g) => s + Math.hypot(g[2] - g[0], g[3] - g[1]), 0) + 40 * (r.length - 1);

/** The pieces of a way in one direction joined, the empty ones left out. */
function merge(r: Seg[]): Seg[] {
  const o: Seg[] = [];
  for (const g of r) {
    if (g[0] === g[2] && g[1] === g[3]) continue;
    const p = o[o.length - 1];
    if (p && Math.sign(p[2] - p[0]) === Math.sign(g[2] - g[0]) && Math.sign(p[3] - p[1]) === Math.sign(g[3] - g[1]) &&
      Math.abs((p[2] - p[0]) * (g[3] - g[1]) - (p[3] - p[1]) * (g[2] - g[0])) < 1e-6) o[o.length - 1] = [p[0], p[1], g[2], g[3]];
    else o.push(g);
  }
  return o;
}

/** Longer ways, round something: through one waypoint of a 20-unit grid, each half an octo() way, the shortest first. */
function via(a: P, b: P, x0: number, y0: number, x1: number, y1: number): Seg[][] {
  const out: Seg[][] = [];
  for (let x = Math.floor(x0 / 20) * 20; x <= x1; x += 20) {
    for (let y = Math.floor(y0 / 20) * 20; y <= y1; y += 20) {
      for (const r1 of octo(a, [x, y])) for (const r2 of octo([x, y], b)) {
        const r = merge([...r1, ...r2]);
        if (r.length <= 4) out.push(r);
      }
    }
  }
  return out.sort((p, q) => len(p) - len(q));
}

// ---------------------------------------------------------------- the subjects

export type Id = "sortie" | "sentiers" | "routes" | "mer" | "volcan" | "velos" | "meteo" | "air" | "elec";
/** The order of reading (ux): the keyboard meets the labels in it. */
export const IDS: Id[] = ["sortie", "routes", "sentiers", "volcan", "mer", "velos", "meteo", "air", "elec"];

export interface Sujet {
  id: Id;
  /** The label's first line: the subject, then its source or its hour, in capitals; its second line, the value. */
  k: string;
  src: string;
  value: string;
  color: string;
  href: string;
  /** The real places it speaks of, in map units; none for a value of the whole island. */
  pts: P[];
  /** The volcano: its one place is the summit, drawn by the map. */
  summit?: boolean;
  /** Its value is never cut: too long for the label, it goes on two lines (« pas d'éruption annoncée », whole). */
  entier?: boolean;
  /** Météo: its places are the temperatures' discs, drawn by the map. */
  temp?: boolean;
  /** Its tracks between its places are not drawn at rest: the pulse makes them grow (Météo, vélos, sentiers, routes). */
  pousse?: boolean;
  /** One place to keep of `pts`, each with its bubble: the first a clean track reaches (the sea's beaches). */
  one?: Sujet["tip"][];
  /** The bubble: the place, the value in full, then its nature, time and source. */
  tip: { place: string; value: string; detail: string };
  /** When it was read, ISO: the caption's « Lu entre … et … ». */
  lu: string;
}

/** Marketing's colours (« Lagon »), light on the night of the hero in both themes; red for an alert only. */
const COLOURS: Record<Id, string> = {
  sortie: "#fdba74", sentiers: "#86efac", routes: "#93c5fd", mer: "#7dd3fc", volcan: "#c4b5fd", velos: "#5eead4", meteo: "#e2e8f0", air: "#fcd34d",
  elec: "#f0abfc",
};
const ALERT = "#f87171";
const HREF: Record<Id, string> = {
  sortie: "/evenements", sentiers: "/sentiers", routes: "/trafic", mer: "/mer", volcan: "/volcan", velos: "/velos", meteo: "/meteo", air: "/air", elec: "/electricite",
};

/** Météo-France's three stations of the map: the coast, a cirque, a plain (ux's mock-up): Gillot, Cilaos, Plaine des Cafres. */
export const TROIS = ["97418110", "97424410", "97422440"];
const NEIGES = project(55.4783, -21.0989) as P;
const FOURNAISE = project(55.7083, -21.2444) as P;
/** The cirques that are communes (Mafate is not one). */
const CIRQUES = ["Salazie", "Cilaos"];
const AIR_NAMES = ["", "bon", "moyen", "dégradé", "mauvais", "très mauvais", "extrêmement mauvais"];
const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const dayOf = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
/** « à HH:MM » when it was read today in La Réunion, else « le JJ/MM à HH:MM » (marketing). */
const when = (at: string, now: Date) => {
  const day = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  return day(new Date(at)) === day(now) ? `à\u00a0${hm(at)}` : leAt(at);
};
const placeOf = (name: string): P | undefined => {
  const l = resolvePlace(name)?.lieu;
  return l ? (project(l.lon, l.lat) as P) : undefined;
};
/** A forest road's number in the ONF's names: « Route Forestière de la Scierie (RF58) ». */
const roadCode = (s: string) => /RF ?0*(\d+)/.exec(s)?.[1];
/** At most three words of a title (marketing): the rest is in the bubble. */
const words3 = (s: string) => {
  const w = s.split(" ").filter(Boolean);
  if (w.length <= 3) return w.join(" ");
  const k = w.slice(0, 3);
  while (k.length > 1 && SMALL.has(k[k.length - 1].toLowerCase())) k.pop();
  return `${k.join(" ")}…`;
};

/** The three stations shown, those of TROIS that measured, in that order. */
export function trois(meteo: Cached<HomeData> | null | undefined) {
  const l = withTemp(meteo ?? null).filter((s) => s.source === "meteofrance" && s.id && TROIS.includes(s.id));
  return TROIS.map((id) => l.find((s) => s.id === id)).filter((s) => !!s);
}

function meteo(h: HomeLive, now: Date): Sujet | undefined {
  const l = trois(h.meteo);
  if (!l.length) return undefined;
  const t = l.map((s) => s.temperature!);
  const range = thin(`${fourchette(fr(Math.round(Math.min(...t))), fr(Math.round(Math.max(...t))))} °C`);
  const times = l.map((s) => s.time).sort();
  return {
    // The label says it is not the whole island: « 3 stations », Météo-France being in the bubble (too wide beside it).
    id: "meteo", k: "Météo", src: `${l.length} ${plural(l.length, "station", "stations")}`, value: range, color: COLOURS.meteo, href: HREF.meteo, temp: true, pousse: true,
    pts: l.map((s) => project(s.lon, s.lat) as P),
    // The bubble adds what the label has not (marketing): each station's value.
    tip: { place: l.map((s) => `${shortName(s.nom)} ${thin(`${fr(Math.round(s.temperature!))} °C`)}`).join(" · "), value: "", detail: `mesurées ${when(times[0], now)}${times.length > 1 && hm(times[0]) !== hm(times[times.length - 1]) ? ` et ${hm(times[times.length - 1])}` : ""} par Météo-France` },
    lu: times[times.length - 1],
  };
}

function volcan(h: HomeLive, now: Date): Sujet | undefined {
  const v = h.volcan?.value;
  if (!v?.etat) return undefined;
  const a = alerteVolcan(v);
  const lu = iso(h.volcan!.fetchedAt);
  const value = a ? (a.eruption ? "éruption" : a.niveau!.toLowerCase()) : "pas d'éruption annoncée";
  const quakes = v.seismes?.sous_le_volcan?.["7_jours"];
  return {
    id: "volcan", k: "Volcan", src: a && !a.eruption ? "Préfecture" : "OVPF", value, color: a ? ALERT : COLOURS.volcan, href: HREF.volcan, summit: true, entier: true,
    pts: [FOURNAISE],
    tip: {
      // Each fact with its source (the level: the prefecture's release, or the OVPF's newer post; the quakes: the OVPF's).
      place: v.etat.niveau_inconnu ? "Piton de la Fournaise" : `Niveau ORSEC\u00a0: ${v.etat.niveau_orsec.toLowerCase()} (${v.etat.niveau_ovpf ? "OVPF" : "préfecture"})${quakes == null ? "" : ` · ${quakes} ${plural(quakes, "séisme", "séismes")} sous le volcan en 7 jours (OVPF)`}`,
      value: "",
      detail: `selon l'OVPF et la préfecture, textes lus ${when(lu, now)}`,
    },
    lu,
  };
}

function sortie(h: HomeLive, now: Date): Sujet | undefined {
  const d = h.agenda?.value;
  if (!d?.evenements?.length) return undefined;
  const local = new Date(now.getTime() + 4 * 3600_000).toISOString();
  const [today, time] = [local.slice(0, 10), local.slice(11, 16)];
  const tomorrow = new Date(now.getTime() + 28 * 3600_000).toISOString().slice(0, 10);
  // After 21 h, tomorrow's; after 17 h, the evening's; else the day's (marketing): the first still to come, never one
  // cancelled or put off.
  const late = time >= "21:00";
  const day = late ? tomorrow : today;
  const open = d.evenements.filter((r) => !r.statut || r.statut === "complet");
  const of = open.filter((r) => r.date.slice(0, 10) === day && (late || r.date.length < 16 || r.date.slice(11, 16) >= time));
  const evening = !late && time >= "17:00";
  // An outing at a given hour before one of the whole day.
  const timed = of.filter((x) => x.date.length >= 16);
  const r = (evening ? timed.find((x) => x.date.slice(11, 16) >= "17:00") : undefined) ?? timed[0] ?? of[0];
  if (!r) return undefined;
  const at = r.date.length >= 16 ? r.date.slice(11, 16) : undefined;
  const k = late ? "Demain" : evening && at && at >= "17:00" ? "Ce soir" : "Aujourd'hui";
  const where = r.position ? (project(r.position.lon, r.position.lat) as P) : r.commune ? placeOf(r.commune) : undefined;
  const lu = d.lus_le ?? iso(h.agenda!.fetchedAt);
  return {
    id: "sortie", k, src: at ?? (r.commune ?? ""), value: words3(r.titre), color: COLOURS.sortie, href: HREF.sortie,
    pts: where ? [where] : [],
    tip: {
      place: r.titre,
      value: "",
      detail: [[r.lieu?.split(", ")[0], r.commune].filter(Boolean).join(", "), at && `à\u00a0${at}`, agendaOf(r.source)].filter(Boolean).join(", "),
    },
    lu,
  };
}

/** A day of the corals' grid older than this is not said: NOAA publishes a day about 2 days after, its mirror misses some. */
const CORAUX_MAX_JOURS = 5;
/** « Coraux : pas de stress thermique (NOAA) », NOAA's level near the beach (marketing); none without a recent day. */
function corauxDe(m: SeaNow, now: Date): string | undefined {
  const c = m.coraux;
  if (!c || !NIVEAUX[c.niveau] || now.getTime() - Date.parse(`${c.jour}T12:00:00Z`) > CORAUX_MAX_JOURS * 86_400_000) return undefined;
  const n = NIVEAUX[c.niveau];
  return `Coraux\u00a0: ${n.charAt(0).toLowerCase()}${n.slice(1)} (NOAA)`;
}
/** « mesurée par satellite le 13/11 à 13:49 (NOAA) », or the day alone for a day's mean. */
const measured = (m: SeaNow, now: Date) => `mesurée par satellite ${m.heure ? when(m.heure, now) : `le ${dayOf(m.jour)}`} (NOAA)`;
/** The bubble of a beach: the corals' level, then the water there with its pass (marketing); without the corals, the water. */
function seaTip(m: SeaNow, now: Date): Sujet["tip"] {
  const reef = corauxDe(m, now);
  return reef
    ? { place: reef, value: "", detail: `eau à ${thin(deg(m.valeur))} au large ${de(m.nom)}, ${measured(m, now)}` }
    : { place: m.nom, value: thin(deg(m.valeur)), detail: measured(m, now) };
}

function mer(h: HomeLive, now: Date): Sujet | undefined {
  const l = h.meteo?.value.mer ?? [];
  if (!l.length) return undefined;
  const v = l.map((m) => m.valeur);
  const value = `eau ${thin(fourchette(fr(Math.round(Math.min(...v))), fr(Math.round(Math.max(...v)))) + " °C")}`;
  // One beach, the first a clean track reaches (draw()), with its own bubble.
  const placed = l.flatMap((m) => {
    const at = placeOf(m.nom);
    return at ? [{ at, tip: seaTip(m, now) }] : [];
  });
  return {
    id: "mer", k: "Mer", src: "NOAA", value, color: COLOURS.mer, href: HREF.mer, pts: placed.map((x) => x.at), one: placed.map((x) => x.tip),
    tip: placed[0]?.tip ?? { place: l[0].nom || "En mer, près de la côte", value, detail: measured(l[0], now) },
    lu: iso(h.meteo!.fetchedAt),
  };
}

/** « RF58 Scierie » for « Route Forestière de la Scierie (RF58) » (marketing); a name of another shape, whole. */
function shortRoad(r: string): string {
  const i = r.lastIndexOf(" (RF");
  const code = i < 0 ? undefined : roadCode(r.slice(i));
  const lead = ["Route Forestière ", "Route forestière "].find((p) => r.startsWith(p));
  if (!code || !lead || !r.endsWith(")")) return r;
  const name = r.slice(lead.length, i);
  const art = ["de la ", "de l'", "du ", "des ", "de ", "d'"].find((a) => name.startsWith(a)) ?? "";
  return `RF${code} ${name.slice(art.length)}`;
}
/** « d'après l'agenda de la commune du Port », from the event's source; without one, « d'après son agenda en ligne ». */
function agendaOf(source: string | undefined): string {
  const cut = [" (", ","].map((c) => source?.indexOf(c) ?? -1).filter((i) => i > 0);
  let name = (cut.length ? source!.slice(0, Math.min(...cut)) : source ?? "").trim();
  if (name.startsWith("site de ")) name = name.slice("site de ".length);
  if (!name) return "d'après son agenda en ligne";
  const lower = name.toLowerCase();
  const of = lower.startsWith("le ") ? `du ${name.slice(3)}` : lower.startsWith("les ") ? `des ${name.slice(4)}` : /^[aeiouyéèêàâîôûh]/i.test(name) ? `d'${name}` : `de ${name}`;
  return `d'après l'agenda ${of}`;
}
/** From « dégradé » Air's label has a track (ux); up to 3 communes, the bubble names them, past that it counts them (marketing). */
const AIR_TRACE = 3;
const AIR_PAR_NOM = 3;
/** « (ozone) », « (ozone et particules PM10) »: the pollutants of communes, the most named first. */
function why(at: NonNullable<AirAnswer["communes"]>): string {
  const by = new Map<string, number>();
  for (const c of at) for (const p of c.polluants ?? []) by.set(p, (by.get(p) ?? 0) + 1);
  const all = [...by].sort((x, y) => y[1] - x[1]).map(([p]) => p);
  return all.length ? ` (${all.join(" et ")})` : "";
}
/** « Le Tampon : dégradé (ozone) · ailleurs moyen », or past 3 communes « moyen (ozone) dans 20 communes sur 24 · ailleurs bon ». */
function worstOf(l: NonNullable<AirAnswer["communes"]>, name: (n: number) => string): string {
  const worst = Math.max(...l.map((c) => c.niveau));
  const at = l.filter((c) => c.niveau === worst);
  // « Ailleurs », the communes where it is not the worst: never that level itself.
  const rest = l.filter((c) => c.niveau !== worst).map((c) => c.niveau);
  const [lo, hi] = [Math.min(...rest), Math.max(...rest)];
  const ailleurs = ` · ailleurs ${lo === hi ? name(lo) : `${name(lo)} à ${name(hi)}`}`;
  if (at.length > AIR_PAR_NOM) return `${name(worst)}${why(at)} dans ${at.length}\u00a0communes sur\u00a0${l.length}${ailleurs}`;
  const who = at.length > 1 ? `${at[0].commune} et ${at.length - 1} ${plural(at.length - 1, "autre commune", "autres communes")}` : at[0].commune;
  return `${who}\u00a0: ${name(worst)}${why(at.slice(0, 1))}${ailleurs}`;
}
/** The pollutants an index comes from, as Atmo names them, in the words of the bubble. */
const POLLUANTS: [RegExp, string][] = [[/^ozone/i, "de l'ozone"], [/^particules/i, "des particules"], [/^dioxyde d'azote/i, "du dioxyde d'azote"], [/^dioxyde de soufre/i, "du dioxyde de soufre"]];
/** « À cause de l'ozone (22 communes) et des particules (4 communes) », or « …, dans les 24 communes » when one alone. */
function cause(l: NonNullable<AirAnswer["communes"]>): string {
  const by = new Map<string, number>();
  for (const c of l) {
    const of = new Set((c.polluants ?? []).map((p) => POLLUANTS.find(([re]) => re.test(p))?.[1] ?? `de ${p}`));
    for (const w of of) by.set(w, (by.get(w) ?? 0) + 1);
  }
  const all = [...by].sort((a, b) => b[1] - a[1]);
  if (!all.length) return l.length === 24 ? "Les 24 communes" : `${l.length} communes`;
  if (all.length === 1 && all[0][1] === l.length) return `À cause ${all[0][0]}, dans ${l.length === 24 ? "les 24 communes" : `${l.length} communes`}`;
  const parts = all.map(([w, n]) => `${w} (${n} ${plural(n, "commune", "communes")})`);
  return `À cause ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}` : parts[0]}`;
}
/** « , diffusé le 09/11 à 11:24 », from Atmo's sentence, the day only when it is not today's. */
function diffused(sentence: string | undefined, now: Date): string {
  const m = /le (\d\d)\/(\d\d) à\s?(\d\d):(\d\d)/.exec(sentence ?? "");
  if (!m) return "";
  const local = new Date(now.getTime() + 4 * 3600_000).toISOString();
  const today = `${local.slice(8, 10)}/${local.slice(5, 7)}`;
  return `, diffusé ${`${m[1]}/${m[2]}` === today ? "" : `le ${m[1]}/${m[2]} `}à\u00a0${m[3]}:${m[4]}`;
}

function air(h: HomeLive, now: Date): Sujet | undefined {
  const l = h.air?.value.communes ?? [];
  if (!l.length) return undefined;
  const worst = Math.max(...l.map((c) => c.niveau));
  const best = Math.min(...l.map((c) => c.niveau));
  const name = (n: number) => AIR_NAMES[n] ?? "inconnu";
  const value = best === worst ? name(worst) : `${name(best)} à ${name(worst)}`;
  const at = l.filter((c) => c.niveau === worst);
  // A track only where the air is « dégradé » or worse, in 3 communes at most: one drawn to the first of 20 would say it
  // is worse there than elsewhere (ux).
  const place = best !== worst && worst >= AIR_TRACE && at.length <= AIR_PAR_NOM ? placeOf(at[0].commune) : undefined;
  return {
    id: "air", k: "Air", src: "prévu (Atmo)", value, color: COLOURS.air, href: HREF.air, pts: place ? [place] : [],
    tip: {
      // Where it is the worst first, then why (marketing): the communes by name up to 3, else how many.
      place: best !== worst ? worstOf(l, name) : l.length === 24 ? `${name(worst)}${why(at)} sur toute l'île` : cause(l),
      value: "",
      detail: `indice ATMO prévu par Atmo Réunion${diffused(h.air!.value.diffusion, now)}`,
    },
    lu: iso(h.air!.fetchedAt),
  };
}

/** « à HH:MM » or « le JJ/MM à HH:MM », from EDF's « 14/11 00:15 heure de La Réunion ». */
function edfWhen(heure: string, now: Date): string {
  const [day, time] = heure.split(" ");
  const local = new Date(now.getTime() + 4 * 3600_000).toISOString();
  return day === `${local.slice(8, 10)}/${local.slice(5, 7)}` ? `à\u00a0${time}` : `le ${day} à\u00a0${time}`;
}

function elec(h: HomeLive, now: Date): Sujet | undefined {
  const p = h.electricite?.value.production;
  // An old line is not the island's production now: the label leaves it to /electricite, which says so.
  if (!p || p.perimee || !/^\d\d\/\d\d \d\d:\d\d/.test(p.heure_mesure)) return undefined;
  return {
    // No track (ux): the figure is the whole island's, and EDF gives it by kind of plant, not by plant.
    id: "elec", k: "Électricité", src: "EDF", value: `${fr(Math.round(p.renouvelable_pct))}\u202f% renouvelable`, color: COLOURS.elec, href: HREF.elec, pts: [],
    tip: { place: `${fr(Math.round(p.total_mw))} MW produits`, value: "", detail: `${edfWhen(p.heure_mesure, now)}, d'après EDF` },
    lu: iso(h.electricite!.fetchedAt),
  };
}

function velos(h: HomeLive, now: Date): Sujet | undefined {
  const d = h.velos?.value;
  if (!d?.communes?.length) return undefined;
  const total = d.communes.reduce((n, c) => n + c.velos_disponibles, 0);
  // Where each commune's stations are, their middle.
  const pts = d.communes.flatMap((c): P[] => {
    const s = d.stations.filter((x) => x.commune === c.commune && x.lon != null && x.lat != null);
    if (!s.length) return [];
    return [project(s.reduce((a, x) => a + x.lon!, 0) / s.length, s.reduce((a, x) => a + x.lat!, 0) / s.length) as P];
  });
  const lu = iso(h.velos!.fetchedAt);
  return {
    id: "velos", k: "Vélos", src: "Altervélo", value: `${total} ${plural(total, "disponible", "disponibles")}`, color: COLOURS.velos, href: HREF.velos, pts, pousse: true,
    tip: { place: `${d.communes.map((c) => `${c.commune} ${c.velos_disponibles}`).join(" · ")}, dans ${d.stations.length} ${plural(d.stations.length, "station", "stations")}`, value: "", detail: `d'après Altervélo, lu ${when(lu, now)}` },
    lu,
  };
}

function sentiers(h: HomeLive, now: Date): Sujet | undefined {
  const d = h.sentiers?.value;
  if (!d) return undefined;
  const n = closedTrails(d);
  // The closed trails of the cirque with the most (ux): a small network where it is, inside the island, which no label
  // covers (those of the coasts, Sainte-Rose's, run under the labels of the sides).
  const top = d.fermes_par_commune.filter((c) => CIRQUES.includes(c.commune)).sort((a, b) => b.sentiers_fermes.length - a.sentiers_fermes.length)[0];
  const names = new Set(top?.sentiers_fermes.map((t) => t.sentier) ?? []);
  const seen = new Set<string>();
  const pts = d.points.filter((p) => names.has(p.nom) && !seen.has(p.nom) && seen.add(p.nom)).map((p) => project(p.lon, p.lat) as P);
  const lu = d.carte_lue ?? iso(h.sentiers!.fetchedAt);
  return {
    id: "sentiers", k: "Sentiers", src: "ONF", value: n ? `${n} ${plural(n, "fermé", "fermés")}` : "aucune fermeture lue", color: COLOURS.sentiers, href: HREF.sentiers, pts, pousse: true,
    tip: { place: top && pts.length ? `Toute l'île · tracés dessinés\u00a0: ${top.commune}` : "Toute l'île", value: `${n} ${plural(n, "sentier fermé", "sentiers fermés")} sur ${d.suivis} suivis par l'ONF`, detail: `selon l'ONF, carte lue ${when(lu, now)}` },
    lu,
  };
}

function routes(h: HomeLive, now: Date): Sujet | undefined {
  const t = h.trafic?.value.routes_forestieres;
  const s = h.sentiers?.value;
  const list = t?.interdites.map((r) => r.route) ?? s?.routes_forestieres_fermees.map((r) => r.route);
  if (!list) return undefined;
  // Only the roads the data places: the middle of each on the ONF's map, as the copy of /sentiers keeps it.
  const pts = list.flatMap((r): P[] => {
    const code = roadCode(r);
    const p = code ? s?.routes_points?.find((x) => roadCode(x.nom) === code) : undefined;
    return p ? [project(p.lon, p.lat) as P] : [];
  });
  const n = list.length;
  const lu = iso((t ? h.trafic : h.sentiers)!.fetchedAt);
  return {
    id: "routes", k: "Routes", src: "ONF", value: n ? `${n} ${plural(n, "fermée", "fermées")}` : "aucune fermeture lue", color: COLOURS.routes, href: HREF.routes, pts, pousse: true,
    tip: {
      place: n ? `${list.slice(0, 3).map(shortRoad).join(" · ")}${n > 3 ? ` et ${n - 3} ${plural(n - 3, "autre", "autres")}` : ""}` : "Routes forestières",
      value: n ? "" : "Aucune fermeture lue",
      detail: `selon l'ONF, carte lue ${when(lu, now)}`,
    },
    lu,
  };
}

/** What the home page's map says, from its copies: a subject without a value is left out. */
export interface HomeLive {
  meteo?: Cached<HomeData> | null;
  volcan?: Cached<VolcanAnswer> | null;
  air?: Cached<AirAnswer> | null;
  trafic?: Cached<TraficAnswer> | null;
  velos?: Cached<VelosAnswer> | null;
  sentiers?: Cached<SentiersAnswer> | null;
  agenda?: Cached<AgendaAnswer> | null;
  electricite?: Cached<ElectriciteAnswer> | null;
}

export function sujets(h: HomeLive, now: Date): Sujet[] {
  const all = [sortie(h, now), routes(h, now), sentiers(h, now), volcan(h, now), mer(h, now), velos(h, now), meteo(h, now), air(h, now), elec(h, now)];
  return all.filter((s): s is Sujet => !!s);
}

// ---------------------------------------------------------------- ux's placement

interface Layout {
  name: "tel" | "large";
  frame: Box;
  F1: number;
  F2: number;
  /** Each label's top-left corner, or top-right with « r ». */
  at: Record<Id, [number, number, ("r" | "l")?]>;
}

/** ux's « Circuit » (maquette-circuit.ts, c-phone and c-wide), Météo's place added by ux. */
export const LAYOUTS: Layout[] = [
  // ux, 14/11: the sea takes the top-left corner, the only way to the west coast; Air right under the island, which
  // nothing covers; Électricité beside Volcan.
  { name: "tel", frame: [-10, -270, 1010, 1200], F1: 24, F2: 36, at: {
    mer: [0, -260], meteo: [410, -260], routes: [150, -150], sentiers: [1000, -150, "r"],
    air: [0, 820], elec: [0, 930], volcan: [1000, 930, "r"], velos: [0, 1090], sortie: [460, 1090] } },
  // The left column 60 units further out, the coast's communes left free; Air between Mer and Vélos, Électricité in its
  // old place.
  { name: "large", frame: [-260, -70, 1200, 990], F1: 25, F2: 37, at: {
    sortie: [-250, 110], routes: [150, -60], sentiers: [1190, 60, "r"],
    mer: [-250, 420], air: [-250, 600], velos: [-250, 830], elec: [480, 878], volcan: [1190, 520, "r"], meteo: [1190, -60, "r"] } },
];

/** The widest a label may be, so that it never reaches its neighbour's place (ux's layouts); a few narrower. */
const CAP = 420;
// Électricité's value never cut (ux).
const CAPS: Partial<Record<`${Layout["name"]}:${Id}`, number>> = { "tel:sortie": 400, "tel:elec": 470, "large:elec": 480 };

/**
 * A text's width, guessed from its letters with room to spare (ux: 0,66 em a bold letter, the system font of an iPhone
 * being wider than Chromium's; 0,74 em a capital of the first line, with its spacing).
 */
const wide1 = (t: string, F1: number) => t.length * F1 * 0.74;
const wide2 = (t: string, F2: number) => t.length * F2 * 0.66;
/** Small words a cut text does not end on: « Dipavali 2026 à… » reads « Dipavali 2026… ». */
const SMALL = new Set(["à", "a", "au", "aux", "de", "du", "des", "d'", "la", "le", "les", "l'", "et", "en", "pour", "sur", "par", "-", "·", ":"]);

/**
 * A label's lines as it can show them, cut to its widest: the source left out, then the value cut at a word, or, for a
 * value never cut, its last words on a third line.
 */
export function fit(L: Pick<Layout, "F1" | "F2">, s: Pick<Sujet, "k" | "src" | "value" | "entier">, cap = CAP): { t1: string; t2: string; t3?: string; size: [number, number] } {
  const room = cap - 44;
  let t1 = `${s.k}${s.src ? ` · ${s.src}` : ""}`.toUpperCase();
  if (wide1(t1, L.F1) > room) t1 = s.k.toUpperCase();
  let t2 = s.value;
  if (s.entier && wide2(t2, L.F2) > room && t2.includes(" ")) {
    const w = t2.split(" ");
    const rest: string[] = [];
    while (w.length > 1 && wide2(w.join(" "), L.F2) > room) rest.unshift(w.pop()!);
    const t3 = rest.join(" ");
    t2 = w.join(" ");
    return { t1, t2, t3, size: [Math.round(Math.max(wide1(t1, L.F1), wide2(t2, L.F2), wide2(t3, L.F2)) + 44), L.F1 + 2 * L.F2 + 48] };
  }
  if (wide2(t2, L.F2) > room) {
    const w = s.value.split(" ");
    while (w.length > 1 && (wide2(`${w.join(" ")}…`, L.F2) > room || SMALL.has(w[w.length - 1].toLowerCase()))) w.pop();
    while (w.length > 1 && SMALL.has(w[w.length - 1].toLowerCase())) w.pop();
    t2 = `${w.join(" ")}…`;
  }
  return { t1, t2, size: [Math.round(Math.max(wide1(t1, L.F1), wide2(t2, L.F2)) + 44), L.F1 + L.F2 + 40] };
}

export interface Drawn {
  labels: Partial<Record<Id, Box>>;
  /** Each label's lines, as fit() cut them. */
  texts: Partial<Record<Id, { t1: string; t2: string; t3?: string }>>;
  /** The places drawn: those a clean track reaches (all of Météo's, its discs being there anyway). */
  places: Partial<Record<Id, P[]>>;
  /** The bubble of a subject that keeps one place of several (the sea): that place's. */
  tips: Partial<Record<Id, Sujet["tip"]>>;
  /** Every piece of track, its subject's, and whether it joins its places (`net`) or runs to its label. */
  segs: { own: Id; seg: Seg; net: boolean }[];
  /** Each label's track, from its place to the label. */
  leaders: Partial<Record<Id, Seg[]>>;
  /** Each subject's tracks between its places, from the one its label's track reaches: each with how far it starts. */
  nets: Partial<Record<Id, { route: Seg[]; from: number }[]>>;
  /** What could not be drawn cleanly, and was left out: nothing on a good day. */
  problems: string[];
}

/** The temperatures' discs (34 units), with the air a track keeps from them. */
const TEMP_R = 48;
/** Round a place's dot, from its hub's ring: a track of another subject, a label, keep off it. */
const near = (s: Sujet) => (s.summit ? 60 : s.pts.length > 1 && !s.one ? 11 : 18);

/**
 * Where everything goes, for a layout: the labels at their place, then each subject's places joined (a tree, each edge
 * a circuit's way) and its track to its label, each the shortest way that crosses no other track and touches no label,
 * no place, no temperature and no summit. A place under another subject's label, or that no clean way reaches, is left
 * out with its track (`problems`); a subject that keeps one place of several (the sea) takes the first that one reaches,
 * and the next when its track bars a network's.
 */
export function draw(L: Layout, list: Sujet[], temps: P[]): Drawn {
  const skip: P[] = [];
  let d = drawOnce(L, list, temps, skip);
  // The sea's track, drawn first, may bar the only way of a network's track (to Saint-Pierre's beach, Vélos' at 390 px):
  // the sea then takes its next beach, while that leaves fewer problems. A drawing more, only on such a day.
  const one = list.find((s) => s.one);
  const nets = list.filter((s) => !s.one && s.pts.length > 1).map((s) => `piste ${s.id}`);
  const barred = (x: Drawn) => x.problems.some((p) => nets.includes(p));
  while (one && barred(d) && d.places[one.id]?.length) {
    const next = drawOnce(L, list, temps, [...skip, d.places[one.id]![0]]);
    if (next.problems.length >= d.problems.length) break;
    skip.push(d.places[one.id]![0]);
    d = next;
  }
  return d;
}

function drawOnce(L: Layout, list: Sujet[], temps: P[], skip: P[]): Drawn {
  const labels: Drawn["labels"] = {};
  const texts: Drawn["texts"] = {};
  for (const s of list) {
    const [x, y, al] = L.at[s.id];
    const f = fit(L, s, CAPS[`${L.name}:${s.id}`] ?? CAP);
    const x0 = al === "r" ? x - f.size[0] : x;
    labels[s.id] = [x0, y, x0 + f.size[0], y + f.size[1]];
    texts[s.id] = { t1: f.t1, t2: f.t2, t3: f.t3 };
  }
  const problems: string[] = [];
  const pad = (b: Box, m: number): Box => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  const inBox = (p: P, b: Box) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3];
  // A place under another subject's label, on a temperature or the summit of another: left out.
  const free = (s: Sujet, p: P) =>
    !(Object.entries(labels) as [Id, Box][]).some(([k, b]) => k !== s.id && inBox(p, pad(b, 22))) &&
    (s.temp || !temps.some((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) < TEMP_R + 12)) &&
    (s.summit || Math.hypot(FOURNAISE[0] - p[0], FOURNAISE[1] - p[1]) > 72);
  const pts: Partial<Record<Id, P[]>> = {};
  for (const s of list) {
    pts[s.id] = s.pts.filter((p) => free(s, p));
    if (!s.one && pts[s.id]!.length < s.pts.length) problems.push(`${s.pts.length - pts[s.id]!.length} lieu(x) ${s.id} sous une étiquette`);
  }
  const obstacles: { own: Id | ""; c?: P; r?: number; box?: Box; temp?: boolean }[] = [];
  for (const t of temps) obstacles.push({ own: "", c: t, r: TEMP_R, temp: true });
  obstacles.push({ own: "", box: [NEIGES[0] - 18, NEIGES[1] - 18, NEIGES[0] + 18, NEIGES[1] + 14] });
  for (const [k, b] of Object.entries(labels) as [Id, Box][]) obstacles.push({ own: k, box: pad(b, 10) });
  // The places, but those of a subject that keeps one of several: its chosen one, once chosen.
  for (const s of list) if (!s.one && !s.temp) for (const p of pts[s.id]!) obstacles.push({ own: s.id, c: p, r: near(s) });
  const segs: Drawn["segs"] = [];
  // A temperature's disc is Météo's place: its tracks may end there (cut at its edge when drawn), never pass over one.
  const ends = (seg: Seg, c: P) => (seg[0] === c[0] && seg[1] === c[1]) || (seg[2] === c[0] && seg[3] === c[1]);
  const clean = (own: Id, seg: Seg) =>
    !obstacles.some((o) => o.own !== own && !(o.temp && own === "meteo" && ends(seg, o.c!)) && (o.c ? segNear(seg, o.c, o.r!) : segRect(seg, o.box!))) &&
    !segs.some((x) => x.own !== own && (segSeg(seg, x.seg) ||
      (boxHit(segBox(seg, 4), segBox(x.seg, 4)) && Math.abs((seg[2] - seg[0]) * (x.seg[3] - x.seg[1]) - (seg[3] - seg[1]) * (x.seg[2] - x.seg[0])) < 1e-6)));
  const add = (own: Id, r: Seg[], net: boolean) => merge(r).forEach((seg) => segs.push({ own, seg, net }));
  const centre = (id: Id): P => {
    const b = labels[id]!;
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  };
  const byDistance = (id: Id, l: P[]) => {
    const c = centre(id);
    return l.map((p, i) => [Math.hypot(p[0] - c[0], p[1] - c[1]), i] as const).sort((x, y) => x[0] - y[0]).map(([, i]) => i);
  };

  // The track from a place into the label's facing side, straight at its end: the shortest clean one, or none.
  const leader = (s: Sujet, [px, py]: P): Seg[] | undefined => {
    const b = labels[s.id]!;
    const m = 24;
    const side = px <= b[0] ? "l" : px >= b[2] ? "r" : py < b[1] ? "t" : "b";
    const hor = side === "l" || side === "r";
    const tries: P[] = hor
      ? [Math.min(Math.max(py, b[1] + m), b[3] - m), (b[1] + b[3]) / 2, b[1] + m, b[3] - m].map((y) => [side === "l" ? b[0] : b[2], y] as P)
      : [Math.min(Math.max(px, b[0] + m), b[2] - m), (b[0] + b[2]) / 2, b[0] + m, b[2] - m].map((x) => [x, side === "t" ? b[1] : b[3]] as P);
    const cand: Seg[][] = [];
    for (const e of tries) {
      cand.push(...octo([px, py], e, hor ? "h" : "v"));
      const dir = hor ? (side === "l" ? -1 : 1) : side === "t" ? -1 : 1;
      for (const f of [30, 60, 100, 150, 210, 280]) {
        const q: P = hor ? [e[0] + dir * f, e[1]] : [e[0], e[1] + dir * f];
        for (const r of octo([px, py], q)) cand.push([...r, [q[0], q[1], e[0], e[1]]]);
      }
    }
    const inner: Box = [b[0] + 2, b[1] + 2, b[2] - 2, b[3] - 2];
    const good = (c: Seg[]) => !c.some((sg) => segRect(sg, inner)) && c.every((sg) => clean(s.id, sg));
    let ok = cand.map(merge).sort((p, q) => len(p) - len(q)).find(good);
    for (const e of tries.slice(0, 2)) {
      if (ok) break;
      ok = via([px, py], e, Math.min(px, e[0]) - 120, Math.min(py, e[1]) - 120, Math.max(px, e[0]) + 120, Math.max(py, e[1]) + 120)
        .filter((r) => {
          const g = r[r.length - 1];
          return hor ? g[1] === g[3] : g[0] === g[2];
        })
        .find(good);
    }
    return ok && merge(ok);
  };

  const places: Drawn["places"] = {};
  const tips: Drawn["tips"] = {};
  const leaders: Drawn["leaders"] = {};
  const nets: Drawn["nets"] = {};
  // First the subjects that keep one place of several: the nearest to the label that a clean track reaches, free of
  // the others' places.
  for (const s of list.filter((x) => x.one)) {
    const l = pts[s.id]!;
    const hit = byDistance(s.id, l).find((i) => {
      if (skip.includes(l[i])) return false;
      if (obstacles.some((o) => o.c && o.own !== s.id && !o.temp && Math.hypot(o.c[0] - l[i][0], o.c[1] - l[i][1]) < near(s) + o.r!)) return false;
      const r = leader(s, l[i]);
      if (!r) return false;
      leaders[s.id] = r;
      return true;
    });
    if (hit == null) {
      problems.push(`piste ${s.id}`);
      places[s.id] = [];
      continue;
    }
    add(s.id, leaders[s.id]!, false);
    places[s.id] = [l[hit]];
    tips[s.id] = s.one![s.pts.indexOf(l[hit])];
    obstacles.push({ own: s.id, c: l[hit], r: near(s) });
  }
  // The networks: a tree from the place nearest the label (Prim), each edge a circuit's way; a place no clean edge
  // reaches is left out.
  for (const s of list.filter((x) => !x.one)) {
    const l = pts[s.id]!;
    if (l.length < 2) {
      places[s.id] = l;
      continue;
    }
    const root = byDistance(s.id, l)[0];
    const inT = [root];
    const rest = l.map((_, i) => i).filter((i) => i !== root);
    const from = new Map<number, number>([[root, 0]]);
    const edges: { route: Seg[]; from: number }[] = [];
    while (rest.length) {
      const pairs = inT.flatMap((i) => rest.map((j) => [Math.hypot(l[i][0] - l[j][0], l[i][1] - l[j][1]), i, j] as const)).sort((x, y) => x[0] - y[0]);
      let joined = false;
      for (const [, i, j] of pairs) {
        const [a, b] = [l[i], l[j]];
        const opts = [...octo(a, b).map(merge), ...via(a, b, Math.min(a[0], b[0]) - 140, Math.min(a[1], b[1]) - 140, Math.max(a[0], b[0]) + 140, Math.max(a[1], b[1]) + 140)];
        const ok = opts.find((o) => o.every((sg) => clean(s.id, sg)));
        if (!ok) continue;
        add(s.id, ok, true);
        edges.push({ route: merge(ok), from: from.get(i)! });
        from.set(j, from.get(i)! + len(ok) - 40 * (ok.length - 1));
        inT.push(j);
        rest.splice(rest.indexOf(j), 1);
        joined = true;
        break;
      }
      if (!joined) {
        problems.push(`${rest.length} lieu(x) ${s.id} hors du réseau`);
        break;
      }
    }
    // Météo's discs are drawn whatever: its places are all of them.
    places[s.id] = s.temp ? l : inT.map((i) => l[i]);
    nets[s.id] = edges;
  }
  // One track a label, from the place of its network nearest to it, else the next.
  for (const s of list.filter((x) => !x.one)) {
    const l = places[s.id]!;
    if (!l.length) continue;
    const lone = l.length === 1;
    const root = byDistance(s.id, l)[0];
    // A network's track starts at its root, where its edges start; a lone place has but one.
    const r = leader(s, l[root]);
    if (!r) {
      problems.push(`piste ${s.id}`);
      if (lone && !s.temp && !s.summit) places[s.id] = [];
      continue;
    }
    add(s.id, r, false);
    leaders[s.id] = r;
  }
  const ids = Object.keys(labels) as Id[];
  for (let i = 0; i < ids.length; i++) {
    const b = labels[ids[i]]!;
    for (let j = i + 1; j < ids.length; j++) if (boxHit(b, labels[ids[j]]!)) problems.push(`étiquettes ${ids[i]}/${ids[j]}`);
    for (const t of temps) if (boxHit(b, [t[0] - TEMP_R, t[1] - TEMP_R, t[0] + TEMP_R, t[1] + TEMP_R])) problems.push(`étiquette ${ids[i]} sur une température`);
    const f = L.frame;
    if (b[0] < f[0] || b[1] < f[1] || b[2] > f[2] || b[3] > f[3]) problems.push(`étiquette ${ids[i]} hors cadre`);
  }
  return { labels, texts, places, tips, segs, leaders, nets, problems };
}

// ---------------------------------------------------------------- the drawing

/** A way's points, from its first to its last. */
const points = (r: Seg[]): P[] => (r.length ? [[r[0][0], r[0][1]], ...r.map((g): P => [g[2], g[3]])] : []);

/** The disc of a temperature (34) and a little air: Météo's tracks stop at its edge, never over its figure (ux). */
const DISC = 36;

/** A way cut `r` before a place it reaches (a temperature's disc, the summit), at either end; a piece left shorter than 6 dropped. */
function trimmed(ps: P[], discs: P[], r = DISC): P[] {
  const cut = (a: P, b: P): P | undefined => {
    if (!discs.some((d) => d[0] === a[0] && d[1] === a[1])) return a;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l - r < 6) return undefined;
    return [a[0] + ((b[0] - a[0]) * r) / l, a[1] + ((b[1] - a[1]) * r) / l];
  };
  let out = [...ps];
  if (out.length >= 2) {
    const a = cut(out[0], out[1]);
    out = a ? [a, ...out.slice(1)] : out.slice(1);
  }
  if (out.length >= 2) {
    const n = out.length;
    const b = cut(out[n - 1], out[n - 2]);
    out = b ? [...out.slice(0, -1), b] : out.slice(0, -1);
  }
  return out.length >= 2 ? out : [];
}

/** A line through points, its bends rounded like a path's (marketing's « Lagon »). */
function soft(ps: P[], r = 16): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  if (ps.length < 3) return ps.map((p, i) => `${i ? "L" : "M"}${n(p[0])} ${n(p[1])}`).join("");
  let s = `M${n(ps[0][0])} ${n(ps[0][1])}`;
  for (let i = 1; i < ps.length - 1; i++) {
    const [a, b, c] = [ps[i - 1], ps[i], ps[i + 1]];
    const u = (p: P, q: P): P => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const t = Math.min(r, l / 2) / l;
      return [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t];
    };
    const [p1, p2] = [u(a, b), u(c, b)];
    s += `L${n(p1[0])} ${n(p1[1])}Q${n(b[0])} ${n(b[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${s}L${n(ps[ps.length - 1][0])} ${n(ps[ps.length - 1][1])}`;
}

const lengthOf = (ps: P[]) => Math.round(ps.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]), 0));

/** The aria name of a label's link: what it shows, then its bubble's lines. */
const said = (s: Sujet, tip = s.tip) => `${s.k}${s.src ? ` · ${s.src}` : ""}\u00a0: ${s.value}. ${tip.place}${tip.value ? `\u00a0: ${tip.value}` : ""}, ${tip.detail}, voir le détail`;

/**
 * The drawings already made in this isolate, by what their places and tracks depend on: a page drawn again with the same
 * copies, or with a value of the same width (« 49 disponibles »), costs no drawing (~200 ms each layout). The words and
 * the bubbles are this page's, never the kept ones'.
 */
type Kept = { d: Drawn; one: Partial<Record<Id, number>> };
const DRAWN = new Map<string, Kept>();
const KEPT = 8;
/** How many drawings this isolate keeps (for the tests). */
export const dessinsGardes = () => DRAWN.size;

/** The labels as fit() cuts them, and the key of the layout's drawing: everything its places and tracks depend on. */
function keyed(L: Layout, list: Sujet[], temps: P[]) {
  const sized = list.map((s) => ({ s, f: fit(L, s, CAPS[`${L.name}:${s.id}`] ?? CAP) }));
  const key = JSON.stringify([L.name, temps, sized.map(({ s, f }) => [s.id, f.size, s.pts, s.one?.length ?? 0, !!s.temp, !!s.summit])]);
  return { sized, key };
}

/** The layout's drawing, kept by its key: drawn when this isolate has none. */
function keptFor(L: Layout, list: Sujet[], temps: P[], key: string): Kept {
  let kept = DRAWN.get(key);
  if (kept) {
    DRAWN.delete(key);
  } else {
    const d = draw(L, list, temps);
    // A subject that keeps one place of several: which, by its rank, for this page's bubble.
    const one = Object.fromEntries(list.filter((s) => s.one && d.places[s.id]?.length).map((s) => [s.id, s.pts.indexOf(d.places[s.id]![0])]));
    kept = { d, one };
  }
  keep(key, kept);
  return kept;
}

function keep(key: string, kept: Kept): void {
  DRAWN.delete(key);
  if (DRAWN.size >= KEPT) DRAWN.delete(DRAWN.keys().next().value!);
  DRAWN.set(key, kept);
}

export function drawn(L: Layout, list: Sujet[], temps: P[]): Drawn {
  const { sized, key } = keyed(L, list, temps);
  const kept = keptFor(L, list, temps, key);
  const texts = Object.fromEntries(sized.map(({ s, f }) => [s.id, { t1: f.t1, t2: f.t2, t3: f.t3 }]));
  const tips = Object.fromEntries(list.filter((s) => s.one && kept.one[s.id] != null).map((s) => [s.id, s.one![kept.one[s.id]!]]));
  return { ...kept.d, texts, tips };
}

/** The keys of the page's drawings, one per layout; none when the page has no map. */
function pageKeys(h: HomeLive, now: Date): { L: Layout; list: Sujet[]; temps: P[]; key: string }[] {
  const list = sujets(h, now);
  if (!list.length) return [];
  const temps = tempMarkers(h, now).map((t) => project(t.lon, t.lat) as P);
  return LAYOUTS.map((L) => ({ L, list, temps, key: keyed(L, list, temps).key }));
}

/**
 * The drawings of a page, both layouts, as kept outside the isolate (web/accueil-dessins.ts): the keys they were drawn
 * for, joined (`cle`), and each layout's drawing.
 */
export interface DessinsCarte {
  cle: string;
  dessins: { key: string; d: Drawn; one: Partial<Record<Id, number>> }[];
}

/**
 * What the page's map depends on, for its drawings kept outside the isolate: their joined key, and whether this isolate
 * has them already. Null when the page has no map.
 */
export function cleCarte(h: HomeLive, now: Date): { cle: string; ici: boolean } | null {
  const pk = pageKeys(h, now);
  return pk.length ? { cle: pk.map((x) => x.key).join("\n"), ici: pk.every((x) => DRAWN.has(x.key)) } : null;
}

/** The page's drawings, drawn now where this isolate has none, to keep outside it. Null when the page has no map. */
export function dessinsCarte(h: HomeLive, now: Date): DessinsCarte | null {
  const pk = pageKeys(h, now);
  if (!pk.length) return null;
  return { cle: pk.map((x) => x.key).join("\n"), dessins: pk.map(({ L, list, temps, key }) => ({ key, ...keptFor(L, list, temps, key) })) };
}

/**
 * Gives this isolate drawings kept outside it, when they are those of the key `cle` (a page's, `cleCarte`): the page then
 * draws nothing. False, and nothing kept, for anything else.
 */
export function reprendreCarte(v: unknown, cle: string): boolean {
  const x = v as Partial<DessinsCarte> | null;
  if (!x || x.cle !== cle || !Array.isArray(x.dessins) || x.dessins.length !== LAYOUTS.length) return false;
  const keys = cle.split("\n");
  if (!x.dessins.every((k, i) => k && k.key === keys[i] && k.d && typeof k.d === "object" && Array.isArray(k.d.segs) && k.one && typeof k.one === "object")) return false;
  for (const { key, d, one } of x.dessins) keep(key, { d, one });
  return true;
}

/** One layout: the island, its temperatures, the tracks and their hubs under the labels. */
function layoutSvg(L: Layout, list: Sujet[], temps: Marker[]): { svg: string; problems: string[] } {
  const d = drawn(L, list, temps.map((t) => project(t.lon, t.lat) as P));
  const by = Object.fromEntries(list.map((s) => [s.id, s])) as Record<Id, Sujet>;
  const tracks: string[] = [];
  const hubs: string[] = [];
  for (const s of list) {
    const c = s.color;
    const lead = d.leaders[s.id];
    // The label's track, from the label to the place: the pulse runs that way.
    // Météo's ends at a temperature's disc; the volcano's at its summit's inner ring.
    const discs = s.temp || s.summit ? (d.places[s.id] ?? []) : [];
    const r = s.summit ? 38 : DISC;
    const ps = lead ? trimmed(points(lead).reverse(), discs, r) : [];
    if (ps.length) {
      const l = lengthOf(ps);
      tracks.push(`<path d="${soft(ps)}" class="tr cx" data-k="${s.id}" style="stroke:${c}"/>` +
        `<path d="${soft(ps)}" class="pu cx" data-k="${s.id}" style="stroke:${c};--l:${l}"/>`);
    }
    // Its places joined: drawn at rest, or grown by the pulse (pousse), each piece once the pulse reaches its start.
    const start = lead ? lengthOf(points(lead)) : 0;
    for (const e of d.nets[s.id] ?? []) {
      const qs = trimmed(points(e.route), discs, r);
      if (!qs.length) continue;
      const l = lengthOf(qs);
      tracks.push(s.pousse
        ? `<path d="${soft(qs)}" class="gr cx" data-k="${s.id}" style="stroke:${c};--l:${l};--a:${Math.round(start + e.from)}"/>` +
          `<path d="${soft(qs)}" class="gp cx" data-k="${s.id}" style="stroke:${c};--l:${l};--a:${Math.round(start + e.from)}"/>`
        : `<path d="${soft(qs)}" class="tr nt cx" data-k="${s.id}" style="stroke:${c}"/>`);
    }
    // The hubs: a dashed ring round each place; the volcano's two round its summit; a temperature's round its disc.
    const many = (d.places[s.id] ?? []).length > 1;
    for (const [x, y] of d.places[s.id] ?? []) {
      if (s.summit) {
        hubs.push(`<g class="hub cx" data-k="${s.id}"><circle cx="${x}" cy="${y}" r="38" class="rg" style="stroke:${c}"/><circle cx="${x}" cy="${y}" r="52" class="rg r2" style="stroke:${c}"/></g>`);
      } else if (s.temp) {
        if (s.pousse || many) hubs.push(`<circle cx="${x}" cy="${y}" r="44" class="rg cx" data-k="${s.id}" style="stroke:${c}"/>`);
      } else {
        hubs.push(`<g class="hub cx" data-k="${s.id}"><circle cx="${x}" cy="${y}" r="${many ? 16 : 22}" class="rg" style="stroke:${c}"/>` +
          `<rect x="${x - (many ? 7 : 10)}" y="${y - (many ? 7 : 10)}" width="${many ? 14 : 20}" height="${many ? 14 : 20}" rx="5" class="pd" style="stroke:${c}"/>` +
          `<circle cx="${x}" cy="${y}" r="${many ? 3.5 : 5}" style="fill:${c}"/></g>`);
      }
    }
  }
  // The labels, in the order of reading: one stop of the keyboard each, a link with its bubble.
  const boxes = IDS.filter((id) => d.labels[id]).map((id) => {
    const s = by[id];
    const [x, y, x2, y2] = d.labels[id]!;
    const lead = d.leaders[id];
    const end = lead?.[lead.length - 1];
    const port = end ? `<circle cx="${end[2]}" cy="${end[3]}" r="6" class="po" style="fill:${s.color}"/>` : "";
    const tip = d.tips[id] ?? s.tip;
    const { t1, t2, t3 } = d.texts[id]!;
    // The side its bubble opens on, away from the island so that it hides no track (pages.ts): above the top band,
    // below the bottom one, and beside the flanks on a wide screen.
    const [cx, cy] = [(x + x2) / 2, (y + y2) / 2];
    const cote = L.name === "tel" ? (cy < 448 ? "t" : "b") : cy < 0 ? "t" : cy > 896 ? "b" : cx < 500 ? "l" : "r";
    return `<a class="mk lb cx" href="${s.href}" data-k="${id}" data-h="${id}" aria-label="${esc(said(s, tip))}" data-cote="${cote}" data-tp="${esc(tip.place)}" data-tv="${esc(tip.value)}" data-td="${esc(tip.detail)}">` +
      `<rect x="${x}" y="${y}" width="${x2 - x}" height="${y2 - y}" rx="12" class="sh bx" style="stroke:${s.color}"/>` +
      `<rect x="${x}" y="${y}" width="9" height="${y2 - y}" rx="4" style="fill:${s.color}"/>` +
      `<text x="${x + 24}" y="${y + L.F1 + 13}" class="t1" style="fill:${s.color};font-size:${L.F1}px">${esc(t1)}</text>` +
      `<text x="${x + 24}" y="${y + L.F1 + L.F2 + 22}" class="t2" style="font-size:${L.F2}px">` +
      // A value on two lines stays one text, read whole: « pas d'éruption annoncée ».
      (t3 ? `<tspan>${esc(t2)} </tspan><tspan x="${x + 24}" dy="${L.F2 + 8}">${esc(t3)}</tspan>` : esc(t2)) + `</text>${port}</a>`;
  }).join("");
  const svg = islandMap({
    markers: temps, relief: true, frame: L.frame, cls: `hm hm-${L.name}`, peakNames: false, defs: false,
    label: "Carte de La Réunion (974)\u00a0: l'île en ce moment",
    top: `<g class="circuit">${tracks.join("")}${hubs.join("")}</g>${boxes}`,
  });
  return { svg, problems: d.problems };
}

/** The temperatures of TROIS on the map, as on /meteo: each its station's row there, its bubble. */
function tempMarkers(h: HomeLive, now: Date): Marker[] {
  const by = (s: { source: string }) => (s.source === "meteofrance" ? " par Météo-France" : "");
  return trois(h.meteo).map((s) => ({
    lon: s.lon, lat: s.lat, label: `${Math.round(s.temperature!)}°`, say: `${Math.round(s.temperature!)} °C`, name: shortName(s.nom), quiet: true,
    color: chip(s.temperature!), round: true, href: `/meteo#${stationId(s.nom)}`, subject: "meteo",
    tip: { place: `${shortName(s.nom)} · ${metres(s.altitude_m)}`, value: thin(deg(s.temperature!)), detail: `mesurée ${when(s.time, now)}${by(s)}` },
  }));
}

/** The glow of a subject's tracks once lit: a blur of them under them. */
const GLOW = `<filter id="hm-glow" filterUnits="userSpaceOnUse" x="-600" y="-600" width="2400" height="2400"><feGaussianBlur stdDeviation="3.5" result="b"/>` +
  `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/** « Sources : … » of the subjects shown (marketing): only those on the map. */
const SOURCES: Record<Id, string> = {
  volcan: "OVPF-IPGP, préfecture", routes: "ONF", sentiers: "ONF", sortie: "agendas des mairies et des salles", mer: "NOAA", air: "Atmo Réunion",
  velos: "Altervélo", meteo: "Météo-France", elec: "EDF",
};

/**
 * The home page's map: both layouts, the phone's and the wide screen's (the page's CSS shows one), the island's
 * definitions once, the bubble, and the line of the hours. Null when no subject has a value.
 */
export function accueilCarte(h: HomeLive, now: Date): string | null {
  const list = sujets(h, now);
  if (!list.length) return null;
  const temps = tempMarkers(h, now);
  const [tel, large] = LAYOUTS.map((L) => layoutSvg(L, list, temps));
  const times = list.map((s) => s.lu).sort();
  const sources = [...new Set(list.flatMap((s) => SOURCES[s.id].split(", ")))].join(", ");
  // The bubble of the label or temperature hovered, tapped or focused, filled and placed by the page's script.
  const bubble = `<a class="mtip" data-mtip hidden aria-hidden="true" tabindex="-1" href="/meteo"><span class="mt-p"></span><b class="mt-v"></b><span class="mt-d"></span><span class="mt-go">Voir le détail →</span></a>`;
  return `<figure class="hero-map ile">${reliefDefs(GLOW)}${tel.svg}${large.svg}${bubble}` +
    `<figcaption><span class="cap"><span class="dot"></span>Lu ${times[0] === times[times.length - 1] || leAt(times[0]) === leAt(times[times.length - 1]) ? when(times[0], now) : `entre ${when(times[0], now).startsWith("le") ? `${leAt(times[0])} et ${leAt(times[times.length - 1])}` : `${hm(times[0])} et ${hm(times[times.length - 1])}`}`}\u00a0· <a href="#en-ce-moment">tout voir par thème\u00a0→</a></span>` +
    `<small>Sources\u00a0: ${esc(sources)}. Chaque point dit son heure de lecture.</small></figcaption></figure>`;
}

/** The problems of both layouts: none on a good day (the tests, and a check in the browser). */
export function problemes(h: HomeLive, now: Date): string[] {
  const list = sujets(h, now);
  const temps = tempMarkers(h, now).map((t) => project(t.lon, t.lat) as P);
  return LAYOUTS.flatMap((L) => draw(L, list, temps).problems.map((p) => `${L.name} : ${p}`));
}

