import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as climat from "../src/providers/climat.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { REGISTRY } from "../src/registre.js";
import { type Historique, rle } from "../src/web/pluie-retro.js";
import { assembler, configure, CUMULS_PATH, fill, FINS, freshSeconds, heures, HEURES, holes, jourPath, JOURS, joursEntre, joursOf, merge, PATHS, type Semaine, type Sources } from "../src/web/rejeu.js";
import { PREMIER_JOUR } from "../src/web/radar-semaine.js";
import { site } from "../src/web/site.js";

const csv = readFileSync(new URL("./fixtures/meteofrance_horaire.csv", import.meta.url), "utf8");
const hourly = meteofrance.parseHourly(csv, Date.parse("2026-10-25T08:57:00Z"));
const N = HEURES["7j"];
const at = (iso: string) => new Date(iso);
const ID = "97416463";

/** A store in memory, as KV, counting its writes. */
function sources(semaine: Semaine | null, six: Historique | null = null, day: Historique | null = null, week: Historique | null = null, jours: Record<string, Historique> = {}) {
  const kept = { semaine, writes: 0, jours: [] as string[] };
  const s: Sources = {
    six: async () => six,
    jour: async (d) => (kept.jours.push(d), jours[d] ?? null),
    day: async () => day,
    week: async () => week,
    semaine: { get: async () => kept.semaine, put: async (w) => void ((kept.semaine = w), kept.writes++) },
  };
  return { s, kept };
}

afterEach(() => {
  configure(undefined);
  climat.configure(undefined, undefined);
  meteofrance.configure({});
});

describe("the stations' week", () => {
  it("takes the package's 24 hours at the end of 169, the newest last, in the package's units", () => {
    const w = merge(null, hourly, at("2026-10-25T08:57:00Z"))!;
    expect(w.fin).toBe("2026-10-25T08:00:00Z");
    expect(w.st[ID].t).toHaveLength(N);
    // 97416463 at 08:00Z: 25.7 °C, 32 km/h from 130°; at 07:00Z, 24.7 °C.
    expect([w.st[ID].t[N - 1], w.st[ID].ff[N - 1], w.st[ID].dd[N - 1], w.st[ID].t[N - 2]]).toEqual([25.7, 32, 130, 24.7]);
    expect(w.st[ID].t.slice(0, N - 24).every((v) => v === null)).toBe(true);
  });

  it("keeps its hours when a newer package comes, shifted to end at the newest", () => {
    const w = merge(null, hourly, at("2026-10-25T08:57:00Z"))!;
    // A package ending an hour later, with no station yet: what was last is now one before.
    const shifted = { end: "2026-10-25T09:00:00Z", rr: {}, mesures: {} };
    const next = merge(w, shifted, at("2026-10-25T09:20:00Z"))!;
    expect(next.fin).toBe("2026-10-25T09:00:00Z");
    expect([next.st[ID].t[N - 2], next.st[ID].t[N - 1]]).toEqual([25.7, null]);
    // A package older than what is kept changes nothing; nothing newer than now is taken.
    expect(merge(next, hourly, at("2026-10-25T09:20:00Z"))!.st[ID].t[N - 2]).toBe(25.7);
    expect(merge(null, hourly, at("2026-10-25T07:00:00Z"))).toBeNull();
  });

  it("fills the hours no station has from the archive, whose hours are local time and wind m/s", () => {
    const w = merge(null, hourly, at("2026-10-25T08:57:00Z"))!;
    const empty = holes(w);
    expect(empty).toHaveLength(N - 24);
    // The hour ending at 2026-10-20 08:00Z is 12 h local on the 20th: index (20 − 1) × 24 + 12.
    const k = 19 * 24 + 12;
    const T = Array(31 * 24).fill(null);
    const FF = Array(31 * 24).fill(null);
    T[k] = 26.1;
    FF[k] = 5;
    const filled = fill(w, new Map([[ID, new Map([[202610, { T, FF }]])]]), at("2026-10-25T08:57:00Z"));
    const i = N - 1 - (Date.parse(w.fin) - Date.parse("2026-10-20T08:00:00Z")) / 3_600_000;
    expect([filled.st[ID].t[i], filled.st[ID].ff[i]]).toEqual([26.1, 18]);
    expect(filled.d1).toBe("2026-10-25T08:57:00.000Z");
    expect(holes(filled)).toHaveLength(N - 25);
  });

  it("gives a file its last hours at the stations that measured any, with their place and altitude", () => {
    const w = merge(null, hourly, at("2026-10-25T08:57:00Z"))!;
    const six = heures(w, HEURES["6h"])!;
    expect(six.fin).toBe("2026-10-25T08:00:00Z");
    const s = six.st.find((x) => x.id === ID)!;
    expect(s.t).toHaveLength(7);
    expect(s.t[6]).toBe(25.7);
    expect([typeof s.x, typeof s.y, s.alt > 0]).toEqual(["number", "number", true]);
    // A week of nothing but the package: the stations without hours are left out, none is empty.
    expect(six.st.every((x) => x.t.some((v) => v != null) || x.rr.some((v) => v != null) || x.ff.some((v) => v != null))).toBe(true);
    expect(heures(null, 7)).toBeNull();
  });
});

describe("the replay bar's files", () => {
  it("are kept as long as nothing newer can be in them", () => {
    expect(freshSeconds("6h", at("2026-10-25T08:57:00Z"))).toBe(300);
    expect(freshSeconds("24h", at("2026-10-25T08:57:00Z"))).toBe(900);
    // At 08:57 the hour of 09:00 is in the package at about 09:15; at 09:20 the next is that of 10:00, at 10:15.
    expect(freshSeconds("7j", at("2026-10-25T08:57:00Z"))).toBe(18 * 60);
    expect(freshSeconds("7j", at("2026-10-25T09:20:00Z"))).toBe(55 * 60);
  });

  it("answer the radar of their length and the stations' hours, and the week without radar", async () => {
    const now = at("2026-10-25T08:57:00Z");
    const image = (fin: string) => ({ fin, pannes: [], pluie: rle("0".repeat(14_000)), mal_vu: rle("0".repeat(14_000)) });
    const six: Historique = { w: 125, h: 112, entrees: [image("2026-10-25T01:00:00Z"), image("2026-10-25T08:55:00Z")] };
    const { s } = sources(merge(null, hourly, now), six, six);
    configure(s);
    const get = async (p: string) => {
      const res = await site(new Request(`https://rundata.re${p}`), new Cache(new MemoryStore(), () => now.getTime()), () => {}, now);
      return { res: res!, body: await res!.json() };
    };
    const a = await get(PATHS["6h"]);
    expect(a.res.headers.get("cache-control")).toBe("public, max-age=300");
    // Over 6 hours old, the image of 01:00 is left out; the 24 hours keep it.
    expect(a.body.radar.entrees.map((e: { fin: string }) => e.fin)).toEqual(["2026-10-25T08:55:00Z"]);
    expect(a.body.heures.heures).toBe(7);
    // The 24 hours an image a quarter of an hour, each the hour up to it (parHeure): those of 01:00 and of 08:45 (read at
    // 08:55), the time no hour has an image a gap.
    expect((await get(PATHS["24h"])).body.radar.entrees.map((e: { fin?: string; de: string; a?: string }) => e.a ? `${e.de}-${e.a}` : `${e.de}-${e.fin}`)).toEqual([
      "2026-10-25T00:00:00Z-2026-10-25T01:00:00Z", "2026-10-25T01:00:00Z-2026-10-25T07:45:00Z", "2026-10-25T07:45:00Z-2026-10-25T08:45:00Z",
    ]);
    const w = await get(PATHS["7j"]);
    expect(w.res.headers.get("cache-control")).toBe("public, max-age=1080");
    expect(w.body.radar).toBeUndefined();
    expect(w.body.heures.st[0].t).toHaveLength(N);
  });

  it("answer the radar's week, 3 hours an hour apart, from its first hour; without it, the rain gauges alone", async () => {
    const now = at("2026-10-25T08:57:00Z");
    const end = Date.parse("2026-10-25T08:00:00Z");
    const hours = (n: number): Historique => ({ w: 125, h: 112, entrees: Array.from({ length: n }, (_, i) => ({
      fin: new Date(end - (n - 1 - i) * 3_600_000).toISOString(), de: new Date(end - (n - i) * 3_600_000).toISOString(), pannes: [], pluie: rle("0".repeat(14_000)), mal_vu: rle("0".repeat(14_000)),
    })) });
    const get = async (week: Historique | null) => {
      configure(sources(merge(null, hourly, now), null, null, week).s);
      const res = await site(new Request(`https://rundata.re${PATHS["7j"]}`), new Cache(new MemoryStore(), () => now.getTime()), () => {}, now);
      return res!.json();
    };
    expect((await get(null)).radar).toBeUndefined();
    // A day of it: its 24 windows, the page shows the rain gauges for the hours before.
    expect((await get(hours(24))).radar.entrees).toHaveLength(24);
    const w = await get(hours(171));
    expect(w.radar.entrees).toHaveLength(171);
    expect(w.radar.entrees.at(-1)).toMatchObject({ de: "2026-10-25T05:00:00Z", fin: "2026-10-25T08:00:00Z" });
    expect(w.heures.st[0].t).toHaveLength(N);
  });

  it("say they have no history when KV holds none, and read the archive for the week's holes at most once in 6 hours", async () => {
    let now = at("2026-10-25T08:57:00Z");
    const cache = () => new Cache(new MemoryStore(), () => now.getTime());
    const { s, kept } = sources(merge(null, hourly, now));
    configure(s);
    let reads = 0;
    climat.configure(undefined, { all: async () => (reads++, []) as never });
    const later: Promise<unknown>[] = [];
    const get = async (p: string) => (await (await site(new Request(`https://rundata.re${p}`), cache(), (w) => void later.push(w), now))!.json());
    await get(PATHS["7j"]);
    await Promise.all(later);
    // The archive had nothing: the week says when it was read, written once.
    expect([reads, kept.writes, kept.semaine!.d1]).toEqual([1, 1, "2026-10-25T08:57:00.000Z"]);
    now = at("2026-10-25T10:00:00Z");
    await get(PATHS["7j"]);
    expect([reads, kept.writes]).toEqual([1, 1]);
    now = at("2026-10-25T15:00:00Z");
    await get(PATHS["7j"]);
    await Promise.all(later);
    expect([reads, kept.writes]).toEqual([2, 2]);
    configure(sources(null).s);
    expect(await get(PATHS["6h"])).toEqual({ radar: null, heures: null });
  });

  it("are written by the files only: the scheduled event neither reads nor writes the week", async () => {
    const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
    expect(worker).not.toContain("rejeu.passage");
    expect(worker).not.toContain("semaine des stations");
    expect(Object.keys(await import("../src/web/rejeu.js"))).not.toContain("passage");
    expect(REGISTRY.filter((e) => e.from.includes("src/web/rejeu.ts") && e.trigger === "planifiée")).toEqual([]);
  });
});

describe("the finer files and the days", () => {
  const M5 = 5 * 60_000;
  const image = (ms: number) => ({ fin: new Date(ms).toISOString().replace(".000Z", "Z"), pannes: [], pluie: rle("0".repeat(14_000)), mal_vu: rle("0".repeat(14_000)) });
  const every = (from: number, to: number, step = M5): Historique => {
    const entrees = [];
    for (let t = from; t <= to; t += step) entrees.push(image(t));
    return { w: 125, h: 112, entrees };
  };
  const fins = (h: { entrees: { fin?: string; de: string; a?: string }[] }) => h.entrees.map((e) => e.fin ?? `trou ${e.de}-${e.a}`);

  it("name the days of La Réunion, a day's images ending after its midnight up to the next", () => {
    // 01/11/2026 08:57 UTC is 12:57 in La Réunion: today and the 7 days before, none before the first day kept.
    const now = Date.parse("2026-11-01T08:57:00Z");
    expect(joursOf(now, "2026-10-20", JOURS)).toEqual(["2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25"]);
    expect(joursOf(now, PREMIER_JOUR, JOURS)).toEqual(["2026-11-01", "2026-10-31"]);
    // 20:00 UTC is midnight: 19:59 is still the 31st, 20:01 already the 1st.
    expect(joursOf(Date.parse("2026-10-31T19:59:00Z"), PREMIER_JOUR, 1)).toEqual(["2026-10-31"]);
    expect(joursOf(Date.parse("2026-10-31T20:01:00Z"), PREMIER_JOUR, 1)).toEqual(["2026-11-01"]);
    expect(joursEntre(now - 24 * 3_600_000, now)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(joursEntre(Date.parse("2026-10-31T20:00:00Z"), Date.parse("2026-11-01T20:00:00Z"))).toEqual(["2026-11-01"]);
    expect(joursEntre(now - 7 * 86_400_000, now)).toHaveLength(8);
  });

  it("put the days and the 6 hours together, oldest first, each image once, a gap the longest it was said", () => {
    const t = Date.parse("2026-11-01T06:00:00Z");
    const a: Historique = { w: 125, h: 112, entrees: [image(t - 2 * M5), { trou: true, de: "2026-11-01T05:55:00Z", a: "2026-11-01T06:00:00Z" }] };
    const b: Historique = { w: 125, h: 112, entrees: [{ trou: true, de: "2026-11-01T05:55:00Z", a: "2026-11-01T06:05:00Z" }, image(t + 2 * M5), image(t - 2 * M5)] };
    expect(fins(assembler([a, null, b, { ...every(t, t), w: 4 }], t - 3 * M5)!)).toEqual(["2026-11-01T05:50:00Z", "trou 2026-11-01T05:55:00Z-2026-11-01T06:05:00Z", "2026-11-01T06:10:00Z"]);
    expect(assembler([null, { w: 125, h: 112, entrees: [] }], 0)).toBeNull();
  });

  it("answer 24 hours every 5 minutes from the days and the 6 hours, the week every quarter of an hour for the hours the days hold, a day kept", async () => {
    const now = at("2026-11-01T08:57:00Z");
    const t = now.getTime();
    // The days up to the hour of 08:00, the 6 hours to 08:55.
    const jours = { "2026-10-31": every(Date.parse("2026-10-30T20:05:00Z"), Date.parse("2026-10-31T20:00:00Z")), "2026-11-01": every(Date.parse("2026-10-31T20:05:00Z"), Date.parse("2026-11-01T08:00:00Z")) };
    const six = every(t - 6 * 3_600_000 + 3 * 60_000, Date.parse("2026-11-01T08:55:00Z"));
    // The stations' week of the package, shifted to end at 08:00.
    const week = { ...merge(null, hourly, now)!, fin: "2026-11-01T08:00:00Z" };
    const { s, kept } = sources(week, six, null, null, jours);
    configure(s);
    const get = async (p: string) => {
      const res = await site(new Request(`https://rundata.re${p}`), new Cache(new MemoryStore(), () => t), () => {}, now);
      return { res: res!, body: res!.status === 200 ? await res!.json() : null };
    };
    const a = await get(FINS["24h"]);
    expect(a.res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(kept.jours).toEqual(["2026-10-31", "2026-11-01"]);
    // 24 hours after 08:57 the day before, every 5 minutes: 288 images, the last the 6 hours'.
    expect(a.body.radar.entrees).toHaveLength(288);
    expect(fins(a.body.radar).slice(0, 1).concat(fins(a.body.radar).slice(-1))).toEqual(["2026-10-31T09:00:00Z", "2026-11-01T08:55:00Z"]);
    expect(a.body.heures.heures).toBe(24);
    // The week: the days hold 2 of its 7, their images of the quarters of an hour, the rain gauges before them.
    kept.jours.length = 0;
    const w = await get(FINS["7j"]);
    expect(kept.jours).toHaveLength(8);
    expect(w.body.radar.entrees).toHaveLength(144);
    expect(fins(w.body.radar).slice(0, 1).concat(fins(w.body.radar).slice(-1))).toEqual(["2026-10-30T20:15:00Z", "2026-11-01T08:00:00Z"]);
    // Whole, its images of the quarters of an hour; the 5 minutes between them left out.
    const all: Record<string, Historique> = {};
    for (const d of joursEntre(t - 7 * 86_400_000, t)) {
      const end = Date.parse(`${d}T20:00:00Z`);
      all[d] = every(end - 86_400_000 + M5, Math.min(end, Date.parse("2026-11-01T08:00:00Z")));
    }
    configure(sources(week, null, null, null, all).s);
    const whole = (await get(FINS["7j"])).body;
    expect(whole.radar.entrees).toHaveLength(7 * 96 - 3);
    expect(fins(whole.radar).slice(-2)).toEqual(["2026-11-01T07:45:00Z", "2026-11-01T08:00:00Z"]);
    // The image of 07:30 missed alone, a gap of its 5 minutes in its day: the one of 07:35 in its place.
    const day1 = all["2026-11-01"].entrees, i30 = day1.findIndex((e) => "fin" in e && e.fin === "2026-11-01T07:30:00Z");
    day1.splice(i30, 1, { trou: true, de: "2026-11-01T07:25:00Z", a: "2026-11-01T07:30:00Z" });
    configure(sources(week, null, null, null, all).s);
    const missed = (await get(FINS["7j"])).body;
    expect(missed.radar.entrees).toHaveLength(7 * 96 - 3);
    expect(fins(missed.radar).slice(-4)).toEqual(["2026-11-01T07:15:00Z", "2026-11-01T07:35:00Z", "2026-11-01T07:45:00Z", "2026-11-01T08:00:00Z"]);
    // A day kept: its images and the stations' hours from its midnight; today up to now.
    configure(s);
    const day = await get(jourPath("2026-10-31"));
    expect(day.res.headers.get("cache-control")).toBe("public, max-age=21600");
    expect(day.body.radar.entrees).toHaveLength(288);
    expect(day.body.heures).toMatchObject({ fin: "2026-10-31T20:00:00Z", heures: 25 });
    const today = await get(jourPath("2026-11-01"));
    expect(today.res.headers.get("cache-control")).toBe("public, max-age=1080");
    expect(today.body.heures).toMatchObject({ fin: "2026-11-01T08:00:00Z", heures: 13 });
    // A day not kept, or before the first: not found.
    expect((await get(jourPath("2026-10-24"))).res.status).toBe(404);
    expect((await get(jourPath("2026-10-30"))).res.status).toBe(404);
  });

  it("leave out the lame d'eau in mm of the images, but the file of rain totals, which keeps it", async () => {
    const now = at("2026-11-01T08:57:00Z");
    const t = now.getTime();
    const lame = (h: Historique): Historique => ({ ...h, entrees: h.entrees.map((e) => ({ ...e, mm: "" })) });
    const jours = { "2026-10-31": lame(every(Date.parse("2026-10-30T20:05:00Z"), Date.parse("2026-10-31T20:00:00Z"))), "2026-11-01": lame(every(Date.parse("2026-10-31T20:05:00Z"), Date.parse("2026-11-01T08:00:00Z"))) };
    const six = lame(every(t - 6 * 3_600_000 + 3 * 60_000, Date.parse("2026-11-01T08:55:00Z")));
    configure(sources({ ...merge(null, hourly, now)!, fin: "2026-11-01T08:00:00Z" }, six, null, null, jours).s);
    const get = async (p: string) => (await (await site(new Request(`https://rundata.re${p}`), new Cache(new MemoryStore(), () => t), () => {}, now))!.json()).radar as Historique;
    const withMm = (h: Historique) => h.entrees.filter((e) => "mm" in e).length;
    for (const p of [PATHS["6h"], FINS["24h"], FINS["7j"], jourPath("2026-10-31")]) expect(withMm(await get(p)), p).toBe(0);
    const cumuls = await get(CUMULS_PATH);
    expect(cumuls.entrees).toHaveLength(288);
    expect(withMm(cumuls)).toBe(288);
  });
});
