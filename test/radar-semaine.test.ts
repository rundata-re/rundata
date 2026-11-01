import { afterEach, describe, expect, it } from "vitest";
import { BUILD_BUDGET, counted } from "../src/budget.js";
import { type Entree, fenetres, type Historique, type Image, isTrou, unrle } from "../src/web/pluie-retro.js";
import { ajouter, firstHour, jour, jourOf, lastHour, oublier, pool, semaine, type Stores } from "../src/web/radar-semaine.js";
import { written } from "../src/web/rejeu.js";

const H = 3_600_000;
const T0 = Date.parse("2026-11-01T06:00:00Z"); // 10:00 in La Réunion
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
// A grid of 3 × 2 cells: its rain, one character a cell.
const img = (ms: number, pluie: string, mal = "000000"): Image => ({
  fin: iso(ms),
  pannes: [],
  pluie: pluie.replace(/(.)\1*/g, (m) => m[0] + m.length.toString(36) + ","),
  mal_vu: mal.replace(/(.)\1*/g, (m) => m[0] + m.length.toString(36) + ","),
});
const hist = (entrees: Entree[]): Historique => ({ w: 3, h: 2, entrees });
const every = (from: number, to: number, step: number, pluie = "......") => {
  const out: Image[] = [];
  for (let t = from; t <= to; t += step) out.push(img(t, pluie));
  return out;
};

afterEach(() => oublier());

describe("the radar's week, an hour an image", () => {
  it("takes the 24 hours before the 6 hours, then the 6 hours", () => {
    const six = hist(every(T0 - 6 * H + 5 * 60_000, T0, 5 * 60_000));
    const day = hist(every(T0 - 24 * H + 15 * 60_000, T0, 15 * 60_000));
    const p = pool(six, day);
    expect(p.length).toBe(72 + 72);
    expect(Date.parse((p[71] as Image).fin)).toBe(T0 - 6 * H);
    expect(lastHour(p)).toBe(T0);
    // Another size of grid: the 6 hours alone.
    expect(pool(six, { ...day, w: 4 }).length).toBe(72);
  });

  it("keeps in each cell the strongest rain of the hour, an hour without an image a gap", () => {
    const p = [img(T0 - 2 * H - 55 * 60_000, "1....."), img(T0 - 2 * H - 5 * 60_000, "3..2.."), img(T0 - 2 * H, "2....."), img(T0 - 5 * 60_000, "....1.", "000001"), img(T0, "......")];
    const w = semaine(null, p, 3, 2, T0, new Date(T0 + 10 * 60_000))!;
    expect(w.entrees.map((e) => (isTrou(e) ? `trou ${e.de}-${e.a}` : `${e.de}-${e.fin}`))).toEqual([
      "2026-11-01T03:00:00Z-2026-11-01T04:00:00Z",
      "trou 2026-11-01T04:00:00Z-2026-11-01T05:00:00Z",
      "2026-11-01T05:00:00Z-2026-11-01T06:00:00Z",
    ]);
    expect(unrle((w.entrees[0] as Image).pluie)).toBe("3..2..");
    expect(unrle((w.entrees[2] as Image).pluie)).toBe("....1.");
    expect(unrle((w.entrees[2] as Image).mal_vu)).toBe("000001");
    // Nothing more to add.
    expect(semaine(w, p, 3, 2, T0, new Date(T0 + 10 * 60_000))).toBeUndefined();
  });

  it("adds the hours after its last one, and lets go of those over 7 days and 3 hours", () => {
    const old = hist([{ fin: iso(T0 - 172 * H), de: iso(T0 - 173 * H), pannes: [], pluie: ".6,", mal_vu: "06," }, { fin: iso(T0 - H), de: iso(T0 - 2 * H), pannes: [], pluie: ".6,", mal_vu: "06," }]);
    const p = every(T0 - H + 5 * 60_000, T0 + H, 5 * 60_000, "1.....");
    expect(firstHour(old.entrees, p, new Date(T0 + H))).toBe(T0);
    const w = semaine(old, p, 3, 2, T0 + H, new Date(T0 + H + 10 * 60_000))!;
    expect(w.entrees.map((e) => endOf(e))).toEqual([T0 - H, T0, T0 + H]);
  });

  it("puts each image in its day of La Réunion, after the day's last one", () => {
    // Midnight in La Réunion: 20:00 UTC.
    const midnight = Date.parse("2026-10-31T20:00:00Z");
    expect(jourOf(img(midnight, "......"))).toBe("2026-10-31");
    expect(jourOf(img(midnight + 5 * 60_000, "......"))).toBe("2026-11-01");
    const p = every(midnight - 20 * 60_000, midnight + 20 * 60_000, 5 * 60_000);
    const before = jour(null, p, "2026-10-31", 3, 2, midnight + H)!;
    expect(before.entrees.length).toBe(5);
    expect(jour(before, p, "2026-10-31", 3, 2, midnight + H)).toBeUndefined();
    expect(jour(null, p, "2026-11-01", 3, 2, midnight + 10 * 60_000)!.entrees.length).toBe(2);
  });

  it("writes the days and the week once an hour, outside of nothing else, with what the run has left", async () => {
    const kv = new Map<string, Historique>();
    const reads: string[] = [];
    const store = (k: string) => ({ get: async () => (reads.push(k), kv.get(k) ?? null), put: async (h: Historique) => void kv.set(k, h) });
    const stores: Stores = { heures: store("radar:7j"), jour: (d) => store(`radar:j:${d}`) };
    const six = hist(every(T0 - 6 * H + 5 * 60_000, T0 + 5 * 60_000, 5 * 60_000, "2....."));
    const day = hist(every(T0 - 24 * H + 15 * 60_000, T0, 15 * 60_000, "1....."));
    const first = await counted(BUILD_BUDGET, () => ajouter(stores, six, day, new Date(T0 + 7 * 60_000)));
    expect(first.value).toMatch(/semaine : 23 heures/);
    // The week, and the two days of the 24 hours: 10:00 back to 10:00 the day before, in La Réunion.
    expect(first.used).toBe(6);
    expect([...kv.keys()].sort()).toEqual(["radar:7j", "radar:j:2026-10-31", "radar:j:2026-11-01"]);
    const week = kv.get("radar:7j")!;
    expect(unrle((week.entrees.at(-1) as Image).pluie)).toBe("2.....");
    expect(unrle((week.entrees[0] as Image).pluie)).toBe("1.....");
    // The day holds the 6 hours' images 5 minutes apart, up to the last hour ended.
    expect(kv.get("radar:j:2026-11-01")!.entrees.at(-1)).toMatchObject({ fin: iso(T0) });
    // The same hour again: not even a read.
    reads.length = 0;
    const again = await counted(BUILD_BUDGET, () => ajouter(stores, six, day, new Date(T0 + 12 * 60_000)));
    expect([again.value, again.used, reads]).toEqual(["", 0, []]);
    // The next hour: the week and its day, read and written once.
    const later = hist(every(T0 - 5 * H + 5 * 60_000, T0 + H + 5 * 60_000, 5 * 60_000, "3....."));
    const next = await counted(BUILD_BUDGET, () => ajouter(stores, later, day, new Date(T0 + H + 7 * 60_000)));
    expect(next.used).toBe(4);
    expect(kv.get("radar:7j")!.entrees.length).toBe(24);
    expect(kv.get("radar:j:2026-11-01")!.entrees.at(-1)).toMatchObject({ fin: iso(T0 + H) });
  });

  it("leaves its hours to the next run when the run has too little left, and says a failed write", async () => {
    const stores: Stores = { heures: { get: async () => null, put: async () => { throw new Error("KV refuse"); } }, jour: () => ({ get: async () => null, put: async () => {} }) };
    const six = hist(every(T0 - 6 * H + 5 * 60_000, T0 + 5 * 60_000, 5 * 60_000));
    const short = await counted(3, () => ajouter(stores, six, null, new Date(T0 + 7 * 60_000)));
    expect([short.value, short.used]).toEqual([", semaine : remise, trop peu de sous-requêtes", 0]);
    const failed = await counted(BUILD_BUDGET, () => ajouter(stores, six, null, new Date(T0 + 7 * 60_000)));
    expect(failed.value).toBe(", semaine non écrite (KV refuse)");
  });
});

describe("the 7-day replay of the radar", () => {
  it("is shown from its first hour while it is written, 3 hours an hour apart", () => {
    const now = new Date(T0 + 10 * 60_000);
    const hours = (n: number) => hist(Array.from({ length: n }, (_, i) => ({ fin: iso(T0 - (n - 1 - i) * H), de: iso(T0 - (n - i) * H), pannes: [], pluie: ".6,", mal_vu: "06," })));
    expect(written(hours(1), now)).toBe(true);
    expect(written(hours(168), now)).toBe(true);
    expect(written(hist([{ trou: true, de: iso(T0 - H), a: iso(T0) }]), now)).toBe(false);
    const w = fenetres(hours(168), H, 3 * H);
    expect(w.entrees.length).toBe(168);
    expect(w.entrees.at(-1)).toMatchObject({ de: iso(T0 - 3 * H), fin: iso(T0) });
    // A week that stopped being written: not shown.
    expect(written(hours(168), new Date(T0 + 4 * H))).toBe(false);
  });
});

const endOf = (e: Entree) => Date.parse(isTrou(e) ? e.a : e.fin);
