/**
 * The rain the radar sees now, for the rain layer of /meteo's map: the latest lame d'eau (providers/radar.ts),
 * resampled on the map's own grid (the altitudes' one, scripts/build-altitudes.py), one character a cell. The page's
 * script asks for it when the layer is first shown and lets drops fall where it rains. Nothing of its own is stored:
 * the image is the one the tools read, kept 4 minutes by each data center, and this answer 5 minutes by the browser.
 */
import type { Cache } from "../cache.js";
import * as radar from "../providers/radar.js";
import { H, W } from "./map.js";
import island from "../places/island.json" with { type: "json" };

export const PATH = "/meteo/pluie-radar.json";

// The altitudes' grid: 125 cells across, the map's proportions.
export const GW = 125;
export const GH = Math.round((GW * H) / W);

/** Rain rates in mm/h at which a cell goes up a class, « 1 » to « 8 » (the smallest step of the radar is 0.12 mm/h). */
export const CLASSES = [0.1, 0.5, 1, 2, 4, 8, 16, 32];
// Below this quality index (0 to 100), the relief hides the cell from both radars: its rain may be missed.
const POOR = 50;

export interface RainGrid {
  /** Start and end of the radar's 5 minutes, ISO UTC. */
  debut: string;
  fin: string;
  /** The radars reporting a malfunction, by name. */
  pannes: string[];
  w: number;
  h: number;
  /** One character a cell, row by row from the north-west: « . » not seen, « 0 » no rain, « 1 » to « 8 » the classes. */
  pluie: string;
  /** « 1 » where the radars see badly (quality index under POOR), else « 0 ». */
  mal_vu: string;
  /** Asked of grid() for the radar's history only: the lame d'eau of the 5 minutes in mm (encodeMm). */
  mm?: string;
}

/**
 * The lame d'eau kept with the radar's history (pluie-retro.ts), for rain totals over hours: in each cell where `pluie`
 * has rain (« 1 » to « 8 »), in the same order, the mean of its pixels over the 5 minutes, one character a cell. A
 * cell without rain has none: its lame d'eau is 0, or unknown where it is not seen. The character is a step of a
 * geometric scale, MM_MIN to about 27 mm in 5 minutes (320 mm/h), each step MM_STEP times the one before: a value is
 * within 6 % of its own. In plain mm each wet cell would take 3 characters with its run's length and comma; here one:
 * on the 117 images of the rainy 31/10/2026, +48 % on the history's entries, where plain mm would have made +140 %.
 */
// The printable ASCII from « # », without « \ »: nothing JSON escapes.
export const MM_CHARS = Array.from({ length: 92 }, (_, i) => String.fromCharCode(35 + i)).filter((c) => c !== "\\").join("");
export const MM_MIN = 0.001;
export const MM_STEP = 1.12;

/** The character of a lame d'eau in mm, MM_CHARS' nearest step on the log scale. */
export function mmChar(mm: number): string {
  const k = Math.round(Math.log(Math.max(mm, MM_MIN) / MM_MIN) / Math.log(MM_STEP));
  return MM_CHARS[Math.min(k, MM_CHARS.length - 1)];
}

/**
 * The lame d'eau in mm of each cell of an image of the history: 0 where `pluie` (unrle'd) is « 0 », NaN where it is
 * « . », its step elsewhere. Null when the image has none (`mm` absent, or not as long as its wet cells).
 */
export function decodeMm(pluie: string, mm: string | undefined): Float64Array | null {
  if (mm == null) return null;
  const out = new Float64Array(pluie.length);
  let n = 0;
  for (let k = 0; k < pluie.length; k++) {
    const c = pluie[k];
    if (c === ".") out[k] = NaN;
    else if (c !== "0") {
      if (n >= mm.length) return null;
      out[k] = MM_MIN * MM_STEP ** MM_CHARS.indexOf(mm[n++]);
    }
  }
  return n === mm.length ? out : null;
}

/**
 * The radar's image on the map's grid: the strongest rain seen within each cell, its mean quality; with `lame`, the
 * mean lame d'eau of the cells with rain besides (`mm`).
 */
export function grid(img: radar.RadarImage, lame = false): RainGrid {
  const [lon0, lat0, lon1, lat1] = island.bbox;
  const rain = radar.unb64(img.pluie);
  const quality = radar.unb64(img.qualite);
  const { row0, row1, col0, col1 } = radar.WINDOW;
  const width = col1 - col0;
  // The cells' edges on the radar's grid: its columns follow the longitude alone, its rows the latitude alone.
  const cols = Array.from({ length: GW + 1 }, (_, i) => radar.pixel(lon0 + (i / GW) * (lon1 - lon0), lat1).col);
  const rows = Array.from({ length: GH + 1 }, (_, j) => radar.pixel(lon0, lat1 - (j / GH) * (lat1 - lat0)).row);
  let pluie = "";
  let mal = "";
  let mm = "";
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      let max = -1;
      let sum = 0;
      let seen = 0;
      let qs = 0;
      let qn = 0;
      for (let r = Math.max(row0, rows[j]); r <= Math.min(row1 - 1, rows[j + 1]); r++) {
        for (let c = Math.max(col0, cols[i]); c <= Math.min(col1 - 1, cols[i + 1]); c++) {
          const k = (r - row0) * width + (c - col0);
          const v = rain[k];
          if (v !== radar.NODATA) {
            max = Math.max(max, v === radar.UNDETECT ? 0 : v * 0.12);
            if (v !== radar.UNDETECT) sum += v;
            seen++;
          }
          if (quality[k] <= 100) {
            qs += quality[k];
            qn++;
          }
        }
      }
      const c = max < 0 ? "." : String(CLASSES.filter((x) => max >= x).length);
      pluie += c;
      mal += qn && qs / qn < POOR ? "1" : "0";
      // Hundredths of a millimetre in 5 min, as the image's.
      if (lame && c !== "." && c !== "0") mm += mmChar(sum / seen / 100);
    }
  }
  return { debut: img.debut, fin: img.fin, pannes: img.pannes, w: GW, h: GH, pluie, mal_vu: mal, ...(lame ? { mm } : {}) };
}

/** The answer of PATH: the grid, or 503 when the radar cannot be read (never an empty grid passed off as no rain). */
export async function rainGrid(cache: Cache): Promise<Response> {
  const headers = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
  try {
    if (!radar.enabled()) throw new Error("radar non configuré");
    const img = await radar.image(cache);
    return new Response(JSON.stringify(grid(img.value)), { headers: { ...headers, "cache-control": "public, max-age=300" } });
  } catch {
    return new Response(JSON.stringify({ erreur: "image radar indisponible" }), { status: 503, headers: { ...headers, "cache-control": "no-store" } });
  }
}
