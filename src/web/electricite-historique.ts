/**
 * /electricite/historique.json: what /electricite's script asks for once its chart nears the screen or a duration is
 * chosen, never in the page itself: the chart over 7 days (a point an hour) and 30 days (one every 3 hours) from
 * rundata.re's archive (providers/edf.ts `archiver`), and EDF SEI's yearly production by filière. The archive kept in
 * memory and the data center's cache for an hour, EDF's years read at most once a day: never a request to EDF's
 * production here.
 */
import type { Cache } from "../cache.js";
import * as edf from "../providers/edf.js";
import { produced, renewable } from "../tools/electricite.js";
import type { Journee } from "./data.js";
import { HISTORIQUE_PATH, parts } from "./electricite-carte.js";

export const PATH = HISTORIQUE_PATH;
const ARCHIVE_FRESH_SECONDS = 3600;
const MAX_AGE = 900;

/** A duration of the chart as the script draws it: the points, each group's share of its MW installed (`f`), the step. */
export interface Serie {
  t0: number;
  s: number;
  p: number[][];
  f: number[][];
  pas: number;
  depuis?: string;
}

export interface Historique {
  /** The archive's first hour (ISO): « rundata.re les garde depuis le … ». */
  depuis?: string;
  j7?: Serie;
  j30?: Serie;
  annuel?: edf.Annuel & { lu: string };
}

const serie = (j: (Journee & { pas: number; depuis?: string }) | undefined): Serie | undefined => j && {
  t0: Date.parse(j.debut),
  s: Math.max(j.points[j.points.length - 1][0], 60),
  p: j.points.map((p) => p.map(Math.round)),
  f: parts(j.filieres ?? []),
  pas: j.pas,
  ...(j.depuis && { depuis: j.depuis }),
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** EDF's lines (or the archive's hours), each at its time, as the chart's points and their groups' MW (Journee). */
export function pointsOf(at: [number, edf.Mix][], t0: number): Pick<Journee, "points" | "filieres"> {
  const v = (x: number | undefined) => (typeof x === "number" && x > 0 ? x : 0);
  return {
    points: at.map(([t, l]) => {
      const m = { ...l, statut: "" };
      const ren = renewable(m);
      return [Math.round((t - t0) / 60_000), r1(ren), r1(produced(m) - ren), r1(l.total)];
    }),
    filieres: at.map(([, l]) => [r1(v(l.photovoltaique)), r1(v(l.eolien)), r1(v(l.hydraulique)), r1(v(l.bioenergies) + v(l.charbon) + v(l.diesel) + v(l.turbines_combustion)), r1(v(l.stockage))]),
  };
}

/**
 * The archive's last `jours` days (edf.ts `archiver`) as the chart's points, a point every `pas` hours, the mean of
 * its hours, each at the start of its step; `depuis` (ISO): its first hour, when the archive is shorter than that.
 * Undefined under two points.
 */
export function dureeOf(heures: edf.Heure[], jours: number, pas: number): (Journee & { pas: number; depuis?: string }) | undefined {
  if (!heures.length) return undefined;
  const last = heures[heures.length - 1][0];
  const from = last - jours * 24 + 1;
  const steps = new Map<number, edf.Heure[]>();
  for (const h of heures) {
    if (h[0] < from) continue;
    // Steps on La Réunion's hours (UTC+4): 00:00, 03:00…
    const k = Math.floor((h[0] + 4) / pas) * pas - 4;
    steps.set(k, [...(steps.get(k) ?? []), h]);
  }
  const at = [...steps].sort(([a], [b]) => a - b).map(([k, hs]): [number, edf.Mix] => {
    const mean = (i: number) => r1(hs.reduce((n, h) => n + h[i + 1], 0) / hs.length);
    return [k * 3600_000, { date: "", statut: "", ...Object.fromEntries(edf.HEURE_CHAMPS.map((c, i) => [c, mean(i)])) } as edf.Mix];
  });
  if (at.length < 2) return undefined;
  const t0 = at[0][0];
  const first = heures.find((h) => h[0] >= from)![0];
  return { debut: new Date(t0).toISOString(), ...pointsOf(at, t0), pas, ...(first > from && { depuis: new Date(first * 3600_000).toISOString() }) };
}

export async function historique(cache: Cache): Promise<Historique> {
  const [a, y] = await Promise.all([
    cache.get<edf.Archive>(`${edf.ARCHIVE_KEY}:vue`, ARCHIVE_FRESH_SECONDS, async () => (await cache.kept<edf.Archive>(edf.ARCHIVE_KEY))?.value ?? { heures: [] }).catch(() => undefined),
    edf.annuel(cache).catch(() => undefined),
  ]);
  const heures = a?.value.heures ?? [];
  const j7 = serie(dureeOf(heures, 7, 1));
  const j30 = serie(dureeOf(heures, 30, 3));
  return { ...(heures.length && { depuis: new Date(heures[0][0] * 3600_000).toISOString() }), ...(j7 && { j7 }), ...(j30 && { j30 }), ...(y && { annuel: { ...y.value, lu: y.fetchedAt.toISOString() } }) };
}

export async function historiqueResponse(cache: Cache): Promise<Response> {
  return new Response(JSON.stringify(await historique(cache)), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${MAX_AGE}` },
  });
}
