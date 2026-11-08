/**
 * NOAA's sea temperature in the tests. The day's pixels of an OPeNDAP ASCII answer of the THREDDS server of CoastWatch
 * (test/fixtures/acspo.ascii, read there on 23 October 2026, before its robots.txt was found to refuse /thredds/): the
 * tests' grids of a day, as the satellites' copy keeps them (tools/mer.ts). And the files of /pub/, which
 * providers/acspo.ts and providers/viirs.ts read, served from their reduced copies.
 */
import { readFileSync } from "node:fs";
import type { SstDay } from "../src/providers/acspo.js";

/** The lines of one part of an OPeNDAP ASCII answer (`name` then its values, up to a blank line). */
function part(text: string, name: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${name}[`));
  if (start < 0) throw new Error(`réponse OPeNDAP sans ${name}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "");
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

const numbers = (lines: string[]) => lines.join(",").split(",").filter((v) => v.trim() !== "").map(Number);

/**
 * OPeNDAP ASCII (each grid's rows « [0][i], v, v… », then its lat and lon maps) to the day's valid pixels. The
 * temperature is stored in hundredths of a degree above 0 °C (scale 0.01, offset 273.15 K), -32768 where there is none.
 */
export function parseAscii(text: string, date: string): SstDay {
  const rows = (v: string) => part(text, `${v}.${v}`).map((l) => numbers([l]).slice(1));
  const sst = rows("sea_surface_temperature");
  const ql = rows("quality_level");
  const lats = numbers(part(text, "sea_surface_temperature.lat"));
  const lons = numbers(part(text, "sea_surface_temperature.lon"));
  const pixels: [number, number, number][] = [];
  sst.forEach((r, i) =>
    r.forEach((v, j) => {
      if (v !== -32768 && ql[i]?.[j] === 5) pixels.push([lons[j], lats[i], v / 100]);
    }),
  );
  return { date, pixels };
}


/**
 * The files of CoastWatch's /pub/ in the tests: a granule of NOAA-20 (test/fixtures/viirs_l3u_n20.nc, the pass of 7
 * November 2026 at 21:39 UTC) for any granule asked, and a day of L3S (test/fixtures/acspo_l3s.nc, the 6th) for any day,
 * both reduced to the island by scripts/fixture-ghrsst.py; served by range when one is asked, as the server does.
 * Undefined for any other URL.
 */
export function coastwatch(url: string, init?: RequestInit): Response | undefined {
  const name = url.includes("/sst/nrt/viirs/") ? "viirs_l3u_n20.nc" : url.includes("/sst/nrt/l3s/") ? "acspo_l3s.nc" : undefined;
  if (!name) return undefined;
  const bytes = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  const range = /^bytes=(\d+)-(\d+)$/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ""));
  if (!range) return new Response(bytes);
  const [from, to] = [Number(range[1]), Math.min(Number(range[2]), bytes.length - 1)];
  return new Response(bytes.subarray(from, to + 1), { status: 206, headers: { "Content-Range": `bytes ${from}-${to}/${bytes.length}` } });
}
