import type { Cache, Cached } from "../cache.js";
import { distanceKm, localTime } from "../geo.js";
import { resolvePlace, type Place } from "../places/resolve.js";
import * as acspo from "../providers/acspo.js";
import * as candhis from "../providers/candhis.js";
import * as coraux from "../providers/coraux.js";
import * as cetaces from "./cetaces.js";
import * as crwSerie from "../providers/crw-serie.js";
import { courbes, historiqueBlock } from "./mer-courbes.js";
import * as merHistoire from "./mer-historique.js";
import * as merArchive from "../providers/mer-historique.js";
import { parseDate } from "./historique.js";
import * as houle from "../providers/houle.js";
import * as modis from "../providers/modis.js";
import * as viirs from "../providers/viirs.js";
import * as requin from "../eau/requin.js";
import { later, left } from "../budget.js";
import { type SourceInfo, why } from "../types.js";
import { credits, de, fr, heure, notFound, placeBlock, text } from "./format.js";
import { dayLabel, localDate, localHour } from "./prevision.js";

// Answer for the whole island when no place is given: one spot per stretch of coast people swim on. All are BEACHES too:
// the home page takes them from the copy of /mer.
export const TOUR = ["Plage de Boucan-Canot", "Plage de l'Ermitage-les-Bains", "Saint-Leu", "Plage de Saint-Pierre",
  "Saint-Denis", "Saint-Benoît"];

// The page /mer: every stretch of coast with a beach or a bathing spot, clockwise from Saint-Denis.
export const BEACHES = ["Saint-Denis", "Sainte-Marie", "Saint-Benoît", "Anse des Cascades", "Plage du Tremblet",
  "Grande Anse", "Plage de Saint-Pierre", "Plage de L'Étang-Salé", "Saint-Leu", "Plage de la Saline les Bains",
  "Plage de l'Ermitage-les-Bains", "Plage de Boucan-Canot", "Plage de Saint-Paul", "Le Port"];

/**
 * Every source of a measure of the water: the satellite's passes first (providers/viirs.ts), then the products of a
 * day's mean. What the pages and the summary keep of a copy's sources when they show the water only.
 */
export const SEA_SOURCES: SourceInfo[] = [];

// Best first: ACSPO merges several satellites at 2 km; MODIS (one satellite, 4 km) stands in when ACSPO is
// down or clouded out near the place.
// `cost`: the subrequests of a product not in memory (budget.ts).
export const PRODUCTS: { source: SourceInfo; cost: number; grid: (c: Cache, now: Date) => Promise<Cached<acspo.SstDay[]> & { enCours?: boolean }> }[] = [
  { source: acspo.SOURCE, cost: acspo.COST, grid: acspo.grid },
  { source: modis.SOURCE, cost: modis.COST, grid: modis.grid },
];
SEA_SOURCES.push(viirs.SOURCE, ...PRODUCTS.map((p) => p.source));

// MFWAM's nearest cell read up to this far, WAM's beyond: on 08/11/2026 MFWAM's lay 1 to 5 km off the beaches of the
// west and the south, 7 to 20 km off those of the north and the east, where WAM's lay 3 to 9 km off (providers/houle.ts).
const MF_MAX_KM = 6;

export const COVERAGE =
  "Température de surface MESURÉE par satellite : le dernier passage de NOAA-20 au-dessus de l'île (vers 01:40 et vers 14:00, " +
  "publié moins de 1 h 30 après), quand il voit la mer à moins de 5 km du lieu, sinon la moyenne d'une journée (NOAA ACSPO, " +
  "ou NASA MODIS en secours), qui paraît au plus tôt le lendemain. Les jours de nuages il n'y a pas de mesure : la dernière peut " +
  "dater de plusieurs jours. " +
  `Vagues : PRÉVISION, jamais mélangée aux mesures, du modèle ${houle.MODEL_MF.nom}, ` +
  `qui distingue la houle principale du reste de la mer, là où il a un point à moins de ${MF_MAX_KM} km (ouest et sud), ` +
  `et du modèle ${houle.MODEL.nom} ailleurs (nord et est), sur ${houle.MODEL.echeance_jours} jours. ` +
  "Aucune bouée de l'île ne publie de mesure de houle en ce moment (réseau Candhis du Cerema : dernières mesures en juin 2024, à la Rivière des Galets).";

/** A buoy farther than this from a place does not measure its sea: none is said in its answer. */
export const BOUEE_MAX_KM = 25;

/**
 * The coverage, with the Candhis buoys once the Worker has their key (providers/candhis.ts): Météo-France's buoys off
 * Saint-Pierre and Sainte-Marie measure since November 2026 (veille Candhis, 23/11 and 28/11/2026). Without the key, as before.
 */
export function coverage(): string {
  return candhis.configured()
    ? COVERAGE.replace(/Aucune bouée de l'île[^]*$/, `Houle MESURÉE : les bouées du réseau Candhis du Cerema qui publient (au large de Sainte-Marie et de Saint-Pierre depuis novembre 2026), leur dernière mesure de moins de ${candhis.MESURE_MAX_HOURS} h, à moins de ${BOUEE_MAX_KM} km du lieu.`)
    : COVERAGE;
}

/** The buoys' last measurements the scheduled event keeps; none without the key, or when KV holds none. */
export async function boueesLues(cache: Cache, now: Date, near?: { lon: number; lat: number }): Promise<candhis.Releve[]> {
  if (!candhis.configured()) return [];
  try {
    return candhis.releves((await candhis.etat(cache)).value, now, near, distanceKm);
  } catch (err) {
    console.error(`source ${candhis.SOURCE.id} indisponible:`, why(err));
    return [];
  }
}

/** The buoys' series of 30 days the scheduled event keeps, up to their last measurement; null without the key, or when KV holds none. */
export async function serieLue(cache: Cache): Promise<candhis.Serie | null> {
  if (!candhis.configured()) return null;
  try {
    const [s, e] = await Promise.all([candhis.serie(cache), candhis.etat(cache).catch(() => null)]);
    return candhis.avecDernieres(s.value, e?.value);
  } catch (err) {
    console.error(`source ${candhis.SOURCE.id} : série indisponible:`, why(err));
    return null;
  }
}

/** The satellite's 30 days off four beaches (providers/crw-serie.ts); null when NOAA's mirror does not answer. */
async function serieSatellite(cache: Cache): Promise<crwSerie.SerieMer | null> {
  try {
    return (await crwSerie.serieMer(cache)).value;
  } catch (err) {
    console.error(`source ${crwSerie.SOURCE.id} : série indisponible:`, why(err));
    return null;
  }
}

/** The forecast at a point of the sea, for the curves (tools/mer-courbes.ts). */
export const previsionAu = (w: houle.Waves, now: Date) => (lon: number, lat: number) => {
  const at = wavesAt(w, lon, lat, now);
  return at && { steps: at.steps, model: at.model, modele: houle.modelOf(at.point) };
};

/** One buoy's measurement as an answer says it: always labelled a measurement, never merged into the forecast. */
export function releveBlock(r: candhis.Releve, near?: { lon: number; lat: number }) {
  const d = near ? Math.round(distanceKm(near.lon, near.lat, r.lon, r.lat) * 10) / 10 : undefined;
  return {
    nature: "mesure",
    bouee: r.nom,
    reseau: "Candhis (Cerema)",
    ...(d != null ? { distance_km: d } : {}),
    mesuree_a: localTime(new Date(r.t)),
    ...(r.hauteur != null ? { hauteur_significative: metres(r.hauteur), hauteur_selon: r.hauteur_selon } : {}),
    ...(r.hmax != null ? { vague_max: metres(r.hmax) } : {}),
    ...(r.periode != null ? { periode: `${Math.round(r.periode)} s`, periode_selon: r.periode_selon } : {}),
    ...(r.periode_pic != null ? { periode_pic: `${Math.round(r.periode_pic)} s` } : {}),
    ...(r.direction != null ? { venant: from(r.direction), direction_deg: Math.round(r.direction) } : {}),
    ...(r.temperature != null ? { temperature_eau: `${fr(Math.round(r.temperature * 10) / 10)}\u00a0°C` } : {}),
  };
}

/** « Houle MESURÉE à la bouée Saint-Pierre (large) du Cerema, à 3,2 km, le 23/11 à 09:20 : 1,1 m du sud, période 7 s, vagues jusqu'à 1,9 m. » */
export function releveSaid(b: ReturnType<typeof releveBlock>): string {
  const [jour, h] = b.mesuree_a.split(" ");
  const what = [
    b.hauteur_significative && `${b.hauteur_significative}${b.venant ? ` ${b.venant}` : ""}`,
    b.periode && `période ${b.periode}`,
    b.vague_max && `vagues jusqu'à ${b.vague_max}`,
  ].filter(Boolean).join(", ");
  return `Houle MESURÉE à la bouée ${b.bouee} du Cerema${b.distance_km != null ? `, à ${fr(b.distance_km)} km` : ""}, le ${jour} à ${h}\u00a0: ${what || "pas de hauteur mesurée"}.`;
}

/**
 * The beaches' webcams of Île de la Réunion Tourisme (Boucan Canot, l'Hermitage, Roches Noires, la Saline, Trou d'Eau,
 * les Colimaçons, Sainte-Rose): linked only, never shown here, the legal notices of the IRT and of Viewsurf forbidding
 * any picture, frame or thumbnail without a written agreement (26/11/2026). In the answer and on /mer.
 */
export const WEBCAMS_PLAGES = { texte: "Les webcams des plages en direct", lien: "https://www.reunion.fr/organisez/webcams/", site: "Île de la Réunion Tourisme (IRT)" };

const CAVEATS = [
  "Mesure satellite de la toute première couche d'eau, sur des carrés de 2 à 4 km : " +
    "c'est la température au large du lieu, pas au bord de la plage ni dans le lagon, qui peuvent différer.",
];

// A pass is used within 5 km of the place and for a day: further, or older, the day's mean answers.
const PASS_MAX_KM = 5;
const PASS_MAX_AGE_MS = 24 * 3600_000;

// The waves of the whole coast: a cache read, one request per model for every beach, the cache write.
const WAVE_SUBREQUESTS = 4;
// Further from the model's nearest sea cell, a place is not on the stretch of coast the cell stands for.
const WAVE_MAX_KM = 15;
const HOUR = 3600_000;

interface Grid {
  source: SourceInfo;
  cached: Cached<acspo.SstDay[]> & { enCours?: boolean };
}

/** A product's grid as the shared copy keeps it, in JSON: `lu` is when it was read. */
export interface GridCopy {
  source: string;
  jours: acspo.SstDay[];
  lu: number;
  stale?: boolean;
  /** ACSPO's day due being read, a range at each build (providers/acspo.ts). */
  enCours?: boolean;
}

const gridCopy = (g: Grid): GridCopy =>
  ({ source: g.source.id, jours: g.cached.value, lu: g.cached.fetchedAt.getTime(), ...(g.cached.stale ? { stale: true } : {}), ...(g.cached.enCours ? { enCours: true } : {}) });

/**
 * The satellites' grids, a shared copy (web/partagees.ts) that only the scheduled event builds: the copy of /mer, the
 * pages and the answers read it, however old, and never ask the satellites themselves. Their servers can take more
 * than 10 s to answer, or not answer.
 */
export const SATELLITES = "mer:satellites";

/**
 * Minutes until the grids are read again: 10 while ACSPO's day is being read (a range each time), half an hour while
 * ACSPO lacks the day it should have (acspo.due), else 3 hours.
 */
export function satellitesEvery(last: unknown, now = new Date()): number {
  if (!Array.isArray(last)) return 3 * 60;
  const a = (last as GridCopy[]).find((g) => g.source === acspo.SOURCE.id);
  if (a?.enCours) return 10;
  return (a?.jours[0]?.date ?? "") >= acspo.due(now) ? 3 * 60 : 30;
}

/** The scheduled event's build: ACSPO, and MODIS when ACSPO is down, or sees nothing near a beach of /mer. */
export async function buildSatellites(cache: Cache, now = new Date()): Promise<GridCopy[]> {
  const gs = await grids(cache, now);
  if (!gs.length) throw new Error("aucune grille satellite");
  const blind = tourOf(gs, now, BEACHES).readings.some((x) => !x.r);
  return (blind && gs.length < PRODUCTS.length ? await withFallback(cache, gs, now) : gs).map(gridCopy);
}

/** The shared copy of the grids, however old: the day of each reading says its age. */
async function copiedGrids(cache: Cache, now: Date): Promise<Grid[]> {
  // One in memory from the last half hour will do, the quickest the copy is renewed: the stores are asked only for a
  // newer one (one read each). Longer, an isolate would keep an old copy hours after a newer one is there.
  const hit = await cache.peek<GridCopy[]>(SATELLITES, now.getTime() - 30 * 60_000).catch(() => undefined);
  // Outside the Worker (Node), where no scheduled event runs and nothing is limited, a missing or old copy is brought up
  // to date after the answer, as the ensemble's (providers/ensemble.ts).
  const every = satellitesEvery(hit?.value, now);
  if (left() === Infinity && (!hit || now.getTime() - hit.fetchedAt.getTime() >= every * 60_000)) {
    later(cache.get(SATELLITES, every * 60, () => buildSatellites(cache, now)).catch((err) => console.error("grilles satellite indisponibles:", why(err))));
  }
  return (hit?.value ?? []).flatMap((s) => {
    const p = PRODUCTS.find((x) => x.source.id === s.source);
    return p ? [{ source: p.source, cached: { value: s.jours, fetchedAt: new Date(s.lu), stale: !!s.stale } }] : [];
  });
}

/**
 * The shared copy of the satellite's passes (providers/viirs.ts), however old: each pass says its time. Outside the
 * Worker, brought up to date after the answer, as the grids.
 */
async function copiedPasses(cache: Cache, now: Date): Promise<Cached<viirs.Passages> | undefined> {
  const hit = await cache.peek<viirs.Passages>(viirs.KEY, now.getTime() - 10 * 60_000).catch(() => undefined);
  const every = viirs.passagesEvery(hit?.value, now);
  if (left() === Infinity && (!hit || now.getTime() - hit.fetchedAt.getTime() >= every * 60_000)) {
    later(cache.get(viirs.KEY, every * 60, () => viirs.build(cache, now)).catch((err) => console.error("passages du satellite indisponibles:", why(err))));
  }
  return hit?.value?.passages ? hit : undefined;
}

/** The products that answer, in order of preference. A product that fails is skipped. */
async function grids(cache: Cache, now: Date): Promise<Grid[]> {
  const out: Grid[] = [];
  for (const p of PRODUCTS) {
    // Without the subrequests of a product not in memory, the page keeps what it has rather than fail on the limit.
    if (left() < p.cost) break;
    try {
      out.push({ source: p.source, cached: await p.grid(cache, now) });
    } catch (err) {
      console.error(`source ${p.source.id} indisponible:`, why(err));
    }
    if (out.length && out[0].source === acspo.SOURCE && !out[0].cached.stale) break; // no need for the fallback
  }
  return out;
}

/** The local time of a pass, « 01:39 ». */
const passHour = (t: number) => {
  const d = new Date(t + 4 * 3600_000);
  return heure(d.getUTCHours() * 60 + d.getUTCMinutes());
};

/**
 * When a pass was, for the reader, and the « passage … » that says it: « cette nuit à 01:39 » (« la nuit dernière » from
 * noon), « aujourd'hui à 14:02 », « hier à 14:02 », « le 06/11 à 14:02 ».
 */
function passWhen(t: number, now: Date): { quand: string; passage: string } {
  const day = localDate(new Date(t));
  const at = passHour(t);
  if (day === localDate(now) && localHour(new Date(t)) < 6) {
    const night = localHour(now) < 12 ? "cette nuit" : "la nuit dernière";
    return { quand: `${night} à ${at}`, passage: `passage de ${night} à ${at}` };
  }
  if (day === localDate(now)) return { quand: `aujourd'hui à ${at}`, passage: `passage d'aujourd'hui à ${at}` };
  if (day === localDate(new Date(now.getTime() - 86_400_000))) return { quand: `hier à ${at}`, passage: `passage d'hier à ${at}` };
  return { quand: `le ${shortDay(day)} à ${at}`, passage: `passage du ${shortDay(day)} à ${at}` };
}

/** The pass's reading first, within PASS_MAX_KM and PASS_MAX_AGE_MS; else the day's mean of the first product that has one. */
function reading(place: Place, gs: Grid[], now: Date, passes?: Cached<viirs.Passages>) {
  const p = passes ? viirs.latest(passes.value, place.lon, place.lat, now.getTime(), PASS_MAX_KM, PASS_MAX_AGE_MS) : null;
  if (p) {
    return {
      grid: { source: viirs.SOURCE, cached: { value: [], fetchedAt: passes!.fetchedAt, stale: passes!.stale } } as Grid,
      valeur: p.valeur,
      /** When the satellite passed, ISO: the copy of /mer keeps it for the home page's map (web/data.ts). */
      passe: new Date(p.heure).toISOString(),
      mesure: {
        temperature_eau: `${fr(p.valeur)} °C`,
        nature: "mesure_satellite",
        produit: "passage du satellite",
        satellite: p.satellite,
        heure_mesure: localTime(new Date(p.heure)),
        jour_mesure: localDate(new Date(p.heure)),
        quand: passWhen(p.heure, now).quand,
        passage: passWhen(p.heure, now).passage,
        distance_km: p.distance_km,
        position: { lat: p.lat, lon: p.lon },
        source: viirs.SOURCE.nom,
      },
    };
  }
  for (const g of gs) {
    const m = acspo.nearest(g.cached.value, place.lon, place.lat);
    if (!m) continue;
    return {
      grid: g,
      valeur: m.valeur,
      mesure: {
        temperature_eau: `${fr(m.valeur)} °C`,
        nature: "mesure_satellite",
        produit: "moyenne du jour",
        jour_mesure: m.date,
        age_jours: daysSince(m.date, now),
        distance_km: m.distance_km,
        position: { lat: m.lat, lon: m.lon },
        source: g.source.nom,
      },
    };
  }
  return null;
}

/**
 * A measure as an answer says it: without `passage`, which `quand` says, and for one place without `source`, which its
 * `sources` say; the tour keeps each point's product.
 */
function said<M extends { passage?: string; source: string }>(m: M, place = false) {
  const { passage: _passage, source, ...rest } = m;
  return place ? rest : { ...rest, source };
}

/**
 * Calendar days at La Réunion from the day of a measure to `now`: one on the morning after, whatever the hour. The one
 * count of a measure's age, for `age_jours` and for the words that say it.
 */
function daysSince(day: string, now: Date): number {
  return Math.round((Date.parse(localDate(now)) - Date.parse(day)) / 86_400_000);
}

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * What a measure is, for the reader: its pass, « passage de cette nuit à 01:39 », or the day's mean, « moyenne d'hier,
 * 06/11 », « moyenne du 04/11, il y a 3 jours ». A day is published the next morning at the earliest.
 */
function measuredOn(m: { jour_mesure: string; passage?: string }, now: Date): string {
  if (m.passage) return m.passage;
  const n = daysSince(m.jour_mesure, now);
  return n <= 1 ? `moyenne d'hier, ${shortDay(m.jour_mesure)}` : `moyenne du ${shortDay(m.jour_mesure)}, il y a ${n} jours`;
}

/**
 * What the measure means for the reader: a pass is an instant, not the day's; a day's mean is not today's, the clouds said
 * when it is older than yesterday's.
 */
function ageWarning(m: { jour_mesure: string; passage?: string }, now: Date): string {
  if (m.passage) {
    return `Mesure du ${m.passage}\u00a0: un instant, pas la moyenne de la journée. La surface de la mer est un peu plus fraîche la nuit ` +
      "et le matin, plus chaude l'après-midi.";
  }
  const day = m.jour_mesure;
  const n = daysSince(day, now);
  return n <= 1
    ? `Mesure d'hier (${shortDay(day)})\u00a0: ce n'est pas la température d'aujourd'hui. Une mesure par satellite paraît le lendemain.`
    : `Mesure du ${shortDay(day)}, il y a ${n} jours\u00a0: ce n'est pas la température d'aujourd'hui. Une mesure par satellite paraît le lendemain, ` +
      "et les jours de nuages il n'y en a pas\u00a0: la dernière peut donc dater de plusieurs jours.";
}

function staleWarning(g: Grid | undefined) {
  return g?.cached.stale ? ["Source momentanément injoignable : dernière valeur connue."] : [];
}

/** One reading per stretch of `names`, null where nothing has one, from the passes `ps` and the grids `gs`. */
function tourOf(gs: Grid[], now: Date, names = TOUR, ps?: Cached<viirs.Passages>) {
  const readings = names.map((n) => resolvePlace(n)!.lieu).map((p) => ({ p, r: reading(p, gs, now, ps) }));
  // One per source: each pass's reading carries a grid of its own.
  const used = [...new Map(readings.flatMap((x) => (x.r ? [[x.r.grid.source.id, x.r.grid] as const] : []))).values()];
  return { readings, used };
}

/** The tour of `names` from the shared copies of the passes and the grids, for the copy of /mer; null without them. */
export async function seaTour(cache: Cache, now = new Date(), names = TOUR) {
  const [gs, ps] = await Promise.all([copiedGrids(cache, now), copiedPasses(cache, now)]);
  return gs.length || ps ? tourOf(gs, now, names, ps) : null;
}

// --- Waves: a forecast, kept apart from the measurement ---------------------------------------------------------

/** The points the waves are asked for, all in one request: the beaches of the page /mer. */
const coast = () => BEACHES.map((n) => resolvePlace(n)!.lieu);

/**
 * The forecast of the waves along the coast, or null: an answer or a page goes without it rather than fail. Only with
 * twice its cost left: a page built alongside other parts must keep the writes of their copies (budget.ts).
 */
export async function wavesNow(cache: Cache): Promise<Cached<houle.Waves> | null> {
  if (left() < 2 * WAVE_SUBREQUESTS) return null;
  try {
    return await houle.coast(cache, "plages", coast());
  } catch (err) {
    console.error(`source ${houle.SOURCE.id} indisponible:`, why(err));
    return null;
  }
}

const SIDES = ["du nord", "du nord-est", "de l'est", "du sud-est", "du sud", "du sud-ouest", "de l'ouest", "du nord-ouest"];
const from = (deg: number | null) => (deg == null ? undefined : SIDES[Math.round(deg / 45) % 8]);
const metres = (h: number) => `${fr(Math.round(h * 10) / 10)} m`;

interface WaveStep {
  time: Date;
  hauteur: number;
  /** MFWAM's period is the mean one, WAM's the peak's (providers/houle.ts). */
  modele: houle.ModelId;
  periode: number | null;
  direction: number | null;
  /** MFWAM only: the main swell's height, kept when below the whole sea's. */
  houle: number | null;
}

function stepOf(w: houle.Waves, p: houle.WavePoint, i: number): WaveStep | null {
  const h = p.hauteur[i];
  const swell = p.houle?.[i];
  return h == null
    ? null
    : { time: houle.stepTime(w, i), hauteur: h, modele: houle.modelOf(p), periode: p.periode[i], direction: p.direction[i], houle: swell != null && swell < h ? swell : null };
}

const seconds = (s: WaveStep) => (s.periode == null ? undefined : `${Math.round(s.periode)} s`);

function stepText(s: WaveStep) {
  return {
    heures: `${dayLabel(localDate(s.time))} ${heure(localHour(s.time) * 60)}`,
    hauteur: metres(s.hauteur),
    ...(s.houle != null ? { houle_principale: metres(s.houle) } : {}),
    ...(s.modele === "mfwam" ? { periode_moyenne: seconds(s) } : { periode: seconds(s) }),
    venant: from(s.direction),
  };
}

/** « 0,8 m du sud-ouest, période 10 s » ; MFWAM : « 1,3 m du sud, dont 1 m de houle principale, période moyenne 10 s ». */
const waveWords = (s: WaveStep) =>
  [
    [metres(s.hauteur), from(s.direction)].filter(Boolean).join(" "),
    s.houle != null ? `dont ${metres(s.houle)} de houle principale` : undefined,
    s.periode == null ? undefined : `période ${s.modele === "mfwam" ? "moyenne " : ""}${Math.round(s.periode)} s`,
  ].filter(Boolean).join(", ");

function nearest(w: houle.Waves, lon: number, lat: number, model: houle.ModelId) {
  let best: { p: houle.WavePoint; km: number } | undefined;
  for (const p of w.points) {
    if (houle.modelOf(p) !== model) continue;
    const km = distanceKm(lon, lat, p.lon, p.lat);
    if (!best || km < best.km) best = { p, km };
  }
  return best;
}

/**
 * The sea cell a place reads, with its steps still to come; null away from the coast. MFWAM's nearest when within
 * MF_MAX_KM, else WAM's; MFWAM's alone when WAM was not read.
 */
export function wavesAt(w: houle.Waves, lon: number, lat: number, now: Date) {
  const mf = nearest(w, lon, lat, "mfwam");
  const wam = nearest(w, lon, lat, "wam");
  const best = mf && (mf.km <= MF_MAX_KM || !wam) ? mf : wam;
  if (!best || best.km > WAVE_MAX_KM) return null;
  const steps: WaveStep[] = [];
  best.p.hauteur.forEach((_, i) => {
    const s = stepOf(w, best!.p, i);
    if (s && s.time.getTime() + houle.STEP_H * HOUR > now.getTime()) steps.push(s);
  });
  if (!steps.length) return null;
  // The day's highest waves, today included.
  const days = [...new Set(steps.map((s) => localDate(s.time)))].map((date) =>
    steps.filter((s) => localDate(s.time) === date).reduce((a, b) => (b.hauteur > a.hauteur ? b : a)));
  const model = houle.MODELS[houle.modelOf(best.p)];
  return { point: best.p, model, km: Math.round(best.km * 10) / 10, now: steps[0], steps, days };
}

const WAVE_WARNINGS = [
  "PRÉVISION d'un modèle numérique de vagues, pas une mesure. Elle vaut au large, avant le récif : dans le lagon, " +
    "derrière une digue ou sur un spot abrité, les vagues sont bien plus petites\u00a0; sur une pointe exposée, plus fortes.",
  "Hauteur significative : celle du tiers des plus hautes vagues. Des vagues isolées peuvent approcher le double.",
  "Pour la sécurité : la vigilance vagues-submersion de Météo-France (vigilance_meteo), les drapeaux de baignade et les maîtres-nageurs.",
];

/** The waves of the step under way and the highest to come near a point, in words: for the answers and the pages. */
export function waveLine(w: houle.Waves, lon: number, lat: number, now: Date) {
  const at = wavesAt(w, lon, lat, now);
  if (!at) return null;
  const top = at.days.reduce((a, b) => (b.hauteur > a.hauteur ? b : a));
  return {
    at,
    hauteur_m: at.now.hauteur,
    maintenant: waveWords(at.now),
    heure: heure(localHour(at.now.time) * 60),
    max: metres(top.hauteur),
    max_jour: localDate(top.time) === localDate(now) ? "aujourd'hui" : dayLabel(localDate(top.time)),
  };
}

/** The models the places read, MFWAM first: what an answer about several places names and credits. */
export function modelsOf(at: ({ model: houle.WaveModel } | null | undefined)[]): houle.WaveModel[] {
  return [houle.MODEL_MF, houle.MODEL].filter((m) => at.some((a) => a?.model === m));
}

/** « modèle WAM du Centre européen (ECMWF) », « modèles MFWAM de Météo-France et WAM du Centre européen (ECMWF) ». */
const modelWords = (ms: houle.WaveModel[]) => `modèle${ms.length > 1 ? "s" : ""} ${ms.map((m) => m.nom).join(" et ")}`;

/** The block an answer carries: always labelled a forecast, never merged into the measurement. */
function waveBlock(w: Cached<houle.Waves>, place: Place, now: Date) {
  const l = waveLine(w.value, place.lon, place.lat, now);
  if (!l) return null;
  const at = l.at;
  return {
    model: at.model,
    resume:
      `Vagues PRÉVUES près ${de(place.nom)} (modèle ${at.model.nom}, pas une mesure) : ${l.maintenant} ` +
      `vers ${l.heure}\u00a0; jusqu'à ${l.max} ${l.max_jour}.`,
    bloc: {
      nature: "prevision",
      modele: { nom: at.model.nom, maille_km: at.model.maille_km, mise_a_jour: at.model.mise_a_jour },
      point_du_modele: { lat: at.point.lat, lon: at.point.lon, distance_km: at.km },
      maintenant: stepText(at.now),
      jours: at.days.map((d) => ({
        jour: dayLabel(localDate(d.time)),
        hauteur_max: metres(d.hauteur),
        ...(d.houle != null ? { houle_principale: metres(d.houle) } : {}),
        ...(d.modele === "mfwam" ? { periode_moyenne: seconds(d) } : { periode: seconds(d) }),
        venant: from(d.direction),
      })),
      // The 7 steps after `maintenant`, which is the first: the same 24 hours, said once.
      pas_de_3h: at.steps.slice(1, 8).map(stepText),
      mis_a_jour: localTime(w.fetchedAt),
      avertissements: [...WAVE_WARNINGS, ...(w.stale ? ["Service de prévision momentanément injoignable : prévision précédente, plus ancienne."] : [])],
    },
  };
}

function unavailable() {
  return {
    ...text({
      erreur: "Les sources satellite (NOAA) et la prévision des vagues ne répondent pas pour le moment, et rien n'est en cache.",
      couverture: COVERAGE,
      sources: credits(PRODUCTS.map((p) => p.source)),
    }),
    isError: true,
  };
}

/**
 * The risk of coral bleaching at the three points, in the validated words; null when NOAA's grid could not be read. Near
 * a place, its nearest point only: the other two are not about it.
 */
export async function corauxBlock(cache: Cache, near?: { lon: number; lat: number }) {
  let c: Cached<coraux.Coraux>;
  try {
    c = await coraux.coraux(cache);
  } catch (err) {
    console.error(`source ${coraux.SOURCE.id} indisponible:`, why(err));
    return null;
  }
  return {
    titre: coraux.TITRE,
    points: (near ? [c.value.points.reduce((a, b) => (distanceKm(near.lon, near.lat, b.lon, b.lat) < distanceKm(near.lon, near.lat, a.lon, a.lat) ? b : a))] : c.value.points).map((p) => ({
      lieu: p.nom,
      ...(p.niveau != null ? { niveau: `${coraux.NIVEAUX[p.niveau]} (selon NOAA)`, niveau_noaa: p.niveau } : {}),
      ...(p.dhw != null ? { chaleur_accumulee_12_semaines: coraux.chaleur(p.dhw) } : {}),
      ...(p.sst != null ? { temperature_satellite: `${fr(Math.round(p.sst * 10) / 10)}\u00a0°C` } : {}),
    })),
    // Without « estimation par satellite, pas une observation sur le récif », which the warnings say.
    niveau_sur: coraux.niveauSur(c.value.jours, false),
    jour_mesure: c.value.jour,
    nature: coraux.nature(c.value.jour),
    aide_chaleur: coraux.AIDE_CHALEUR,
    avertissements: [coraux.PAS_OBSERVATION, coraux.CASE],
    ...(c.stale ? { lecture: "Dernière valeur gardée : le serveur de NOAA ne répond pas pour le moment." } : {}),
  };
}

/** The history the tool was asked for (`historique`, or a past `date`): the same summary as /mer/historique. */
export interface Histoire {
  historique?: boolean;
  /** A past day: « 2010-03-15 », « 15/03/2010 », « 15/03 ». */
  date?: string;
}

export async function histoireMer(cache: Cache, now: Date, near: { lon: number; lat: number } | undefined, h?: Histoire) {
  if (!h?.historique && !h?.date?.trim()) return undefined;
  const today = merHistoire.aujourdhui(now);
  let jour: string | undefined;
  if (h.date?.trim()) {
    const d = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{4})?)$/.test(h.date.trim()) ? parseDate(h.date, false, today) : null;
    if (!d) return { erreur: "Date non comprise\u00a0: écrire « 2010-03-15 » ou « 15/03/2010 »." };
    if (d >= today) return { erreur: "Pas d'historique pour aujourd'hui ni pour un jour à venir\u00a0: la mesure du jour est dans ce bloc mesure ou sur_30_jours, la houle à venir dans etat_de_la_mer." };
    jour = d;
  }
  try {
    const r = (await merHistoire.resume(cache, now)).value;
    const valeurs = jour && r.importe ? (await merArchive.memeJour(cache, jour.slice(5))).value : undefined;
    return merHistoire.historiqueBlock(r, near, BOUEE_MAX_KM, jour && valeurs ? { jour, valeurs } : undefined);
  } catch (err) {
    console.error("historique de la mer indisponible:", why(err));
    return { etat: "Historique de la mer momentanément indisponible.", page: "https://rundata.re/mer/historique" };
  }
}

const histoireSources = (b: Awaited<ReturnType<typeof histoireMer>>) =>
  b && "bouees" in b ? [...(b.bouees.length ? [merArchive.SOURCE_CANDHIS] : []), ...(b.satellite.length ? [merArchive.SOURCE_CRW] : [])] : [];

/** `withCoraux`: false for a place's page (web/data.ts), whose copy shows no corals and does not pay for their read. */
export async function temperatureMer(cache: Cache, lieu: string | undefined, now = new Date(), withCoraux = true, h?: Histoire) {
  if (!lieu?.trim()) {
    const [gs, ps, w, reef, buoys, serie, crw] = await Promise.all([copiedGrids(cache, now), copiedPasses(cache, now), wavesNow(cache), withCoraux ? corauxBlock(cache) : null, boueesLues(cache, now), withCoraux ? serieLue(cache) : null, withCoraux ? serieSatellite(cache) : null]);
    const t = gs.length || ps ? tourOf(gs, now, TOUR, ps) : null;
    const histo = historiqueBlock(courbes(serie, crw, undefined, now));
    const passe = await histoireMer(cache, now, undefined, h);
    if (!t && !w && !reef && !buoys.length) return unavailable();
    const measuredWaves = buoys.map((b) => releveBlock(b));
    const at = TOUR.map((n) => resolvePlace(n)!.lieu).map((p) => ({ p, v: w ? wavesAt(w.value, p.lon, p.lat, now) : null }));
    const points = at.map(({ p, v }, i) => ({
      lieu: p.nom,
      ...(t?.readings[i].r ? said(t.readings[i].r!.mesure) : {}),
      ...(v ? { vagues_prevision: waveWords(v.now), vagues_modele: v.model.nom } : {}),
    }));
    const models = modelsOf(at.map((a) => a.v));
    const measured = points.flatMap((p, i) => {
      const r = t?.readings[i].r;
      return r ? [`${p.lieu}\u00a0: ${r.mesure.temperature_eau} (${measuredOn(r.mesure, now)})`] : [];
    });
    const waves = points.filter((p) => p.vagues_prevision).map((p) => `${p.lieu} ${p.vagues_prevision}`);
    return text({
      resume: [
        measured.length ? `Eau de mer, MESURÉE par satellite\u00a0: ${measured.join("\u00a0; ")}.` : "Pas de mesure satellite de l'eau pour le moment.",
        ...measuredWaves.map(releveSaid),
        ...(waves.length ? [`Vagues PRÉVUES maintenant (${modelWords(models)}, pas une mesure) : ${waves.join("\u00a0; ")}.`] : []),
        // Asked about the sea, whether one may swim (24/11/2026), not only in risque_requin.
        ...(requin.regleCourte(now) ? [requin.regleCourte(now)!] : []),
      ].join(" "),
      points,
      ...(measuredWaves.length ? { houle_mesuree: measuredWaves } : {}),
      avertissements: [...(t ? CAVEATS : []), ...(t?.used.flatMap(staleWarning) ?? []), ...(w ? WAVE_WARNINGS : [])],
      risque_requin: requin.requinBlock(now),
      ...(reef ? { coraux: reef } : {}),
      // The figures of « En courbes » on /mer, the same.
      ...(histo ? { sur_30_jours: histo } : {}),
      // Asked for: the years before, as /mer/historique says them.
      ...(passe ? { historique: passe } : {}),
      // The rules of approach of whales and dolphins, from the decrees in the code: nothing read.
      cetaces: cetaces.cetacesBlock(now),
      // Linked only, as on /mer.
      webcams_plages: WEBCAMS_PLAGES,
      couverture: coverage(),
      sources: credits([...(t?.used.map((g) => g.source) ?? []), ...(measuredWaves.length || histo?.bouees ? [candhis.SOURCE] : []), ...models.map((m) => m.source), requin.SOURCE, ...(reef || histo?.satellite ? [coraux.SOURCE] : []), cetaces.SOURCE, ...histoireSources(passe)]),
      // The oldest day measured among the points, not when rundata.re read the grids: what the answer's freshness says.
      jour_mesure: points.flatMap((p) => ("jour_mesure" in p && p.jour_mesure ? [p.jour_mesure] : [])).sort()[0],
    });
  }

  const r = resolvePlace(lieu);
  if (!r) return notFound(lieu);
  const [gs, ps, w, reef, buoys, serie, crw] = await Promise.all([copiedGrids(cache, now), copiedPasses(cache, now), wavesNow(cache), withCoraux ? corauxBlock(cache, r.lieu) : null, boueesLues(cache, now, r.lieu), withCoraux ? serieLue(cache) : null, withCoraux ? serieSatellite(cache) : null]);
  // The nearest buoy that measured, within BOUEE_MAX_KM: the sea off this place, said with its distance.
  const near = buoys.find((b) => distanceKm(r.lieu.lon, r.lieu.lat, b.lon, b.lat) <= BOUEE_MAX_KM);
  const buoy = near ? releveBlock(near, r.lieu) : undefined;
  if (!gs.length && !ps && !w && !buoy) return unavailable();
  const m = gs.length || ps ? reading(r.lieu, gs, now, ps) : null;
  const v = w ? waveBlock(w, r.lieu, now) : null;
  const histo = m || v ? historiqueBlock(courbes(serie, crw, undefined, now), r.lieu, BOUEE_MAX_KM, distanceKm) : undefined;
  const passe = await histoireMer(cache, now, r.lieu, h);
  const temperature = m
    ? `Eau de mer près ${de(r.lieu.nom)}\u00a0: ${m.mesure.temperature_eau}, mesurée par satellite ` +
      `(${measuredOn(m.mesure, now)}${"satellite" in m.mesure ? `, ${m.mesure.satellite}` : ""}, point de mesure à ${fr(m.mesure.distance_km)} km).`
    : gs.length || ps
      ? `Pas de mesure satellite exploitable à moins de 12 km ${de(r.lieu.nom)} sur les derniers jours ` +
        "(nuages, ou lieu trop loin de la mer)."
      : "Température de l'eau : les sources satellite ne répondent pas pour le moment.";
  const waves = v
    ? v.resume
    : w
      ? `Pas de prévision de vagues à moins de ${WAVE_MAX_KM} km ${de(r.lieu.nom)} (lieu loin de la côte).`
      : "Prévision des vagues momentanément indisponible.";
  return text({
    lieu: placeBlock(lieu, r),
    // On the coast, the swimming rule too, as on /mer; inland, nothing.
    resume: `${temperature}${buoy ? ` ${releveSaid(buoy)}` : ""} ${waves}${(m || v) && requin.regleCourte(now) ? ` ${requin.regleCourte(now)}` : ""}`,
    ...(m ? { mesure: said(m.mesure, true) } : {}),
    ...(buoy ? { houle_mesuree: buoy } : {}),
    ...(v ? { etat_de_la_mer: v.bloc } : {}),
    ...(m
      ? {
          avertissements: [
            ...CAVEATS,
            ageWarning(m.mesure, now),
            ...staleWarning(m.grid),
          ],
        }
      : {}),
    // On the coast only: a place far from the sea gets no waves and no measure near it.
    ...(m || v ? { risque_requin: requin.requinBlock(now, r.lieu) } : {}),
    // On the coast only too: the three points of the island, the reef's first.
    ...((m || v) && reef ? { coraux: reef } : {}),
    // On the coast only too: the figures of « En courbes » on /mer near the place.
    ...(histo ? { sur_30_jours: histo } : {}),
    // Asked for: the years before near the place, as /mer/historique says them.
    ...(passe ? { historique: passe } : {}),
    // On the coast only too: the rules of approach of whales and dolphins.
    ...(m || v ? { cetaces: cetaces.cetacesBlock(now) } : {}),
    // On the coast only too: the beaches' webcams, linked only.
    ...(m || v ? { webcams_plages: WEBCAMS_PLAGES } : {}),
    couverture: coverage(),
    sources: credits([...(m ? [m.grid.source] : gs.map((g) => g.source)), ...(buoy ? [candhis.SOURCE] : []), ...(v ? [v.model.source] : []), ...(m || v ? [requin.SOURCE] : []), ...((m || v) && reef || histo?.satellite ? [coraux.SOURCE] : []), ...(m || v ? [cetaces.SOURCE] : []), ...(histo?.bouees && !buoy ? [candhis.SOURCE] : []), ...histoireSources(passe)]),
  });
}

/** Adds the products not loaded yet (the fallback), for a place the loaded ones cannot answer. */
async function withFallback(cache: Cache, gs: Grid[], now: Date): Promise<Grid[]> {
  const out = [...gs];
  for (const p of PRODUCTS) {
    if (out.some((g) => g.source === p.source)) continue;
    try {
      out.push({ source: p.source, cached: await p.grid(cache, now) });
    } catch (err) {
      console.error(`source ${p.source.id} indisponible:`, why(err));
    }
  }
  return out;
}
