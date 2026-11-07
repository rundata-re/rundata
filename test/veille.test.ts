import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_BUDGET, counted, SCHEDULED_BUDGET, scheduled } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { KvStore, type KvBinding } from "../src/kv.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { configure, share, type Token } from "../src/providers/mf-auth.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const HEAD = fixture("meteofrance_horaire.csv").split("\n")[0];
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** An hourly package with the given hours of the given stations (rain in mm, temperatures in Kelvin, as published). */
function pack(rows: { id: string; time: number; rr1?: number; tn?: number; tx?: number }[]): string {
  const cols = HEAD.split(";");
  return [HEAD, ...rows.map((r) => cols.map((c) => {
    if (c === "geo_id_insee") return r.id;
    if (c === "validity_time") return iso(r.time);
    const v = (r as Record<string, unknown>)[c];
    return v == null ? "" : String(v);
  }).join(";"))].join("\n") + "\n";
}

// The day of 26/10/2026 at La Réunion: its first hour ends at 21:00 UTC on the 25th, its last at 20:00 UTC on the 26th.
const FIRST = Date.parse("2026-10-25T21:00:00Z");
const hoursOfDay = (f: (k: number) => { rr1?: number; tn?: number; tx?: number }, id: string, skip = -1) =>
  Array.from({ length: 24 }, (_, k) => k).filter((k) => k !== skip).map((k) => ({ id, time: FIRST + k * H, ...f(k) }));
const DAY = pack([
  // Rain in three hours, one of them the airport's -0.1, and the coolest and warmest hours.
  ...hoursOfDay((k) => ({ rr1: k === 3 ? 1.2 : k === 4 ? 0.4 : k === 10 ? -0.1 : 0, tn: k === 5 ? 293.15 : 295.15, tx: k === 14 ? 300.65 : 297.15 }), "97416463"),
  // The hour before the day and the hour after it: not counted.
  { id: "97416463", time: FIRST - H, rr1: 50, tn: 280.15, tx: 310.15 },
  { id: "97416463", time: FIRST + 24 * H, rr1: 50, tn: 280.15, tx: 310.15 },
  // Every hour of rain, one hour without its lowest temperature.
  ...hoursOfDay((k) => ({ rr1: 0.2, ...(k !== 7 && { tn: 296.15 }), tx: 299.15 }), "97418110"),
  // One hour missing altogether.
  ...hoursOfDay(() => ({ rr1: 1, tn: 285.15, tx: 290.15 }), "97424410", 12),
]);

describe("the day before at each station, from the hourly package", () => {
  it("adds up 0 h to 24 h at La Réunion, each value only over all 24 hours", () => {
    const v = meteofrance.parseDay(DAY, "2026-10-26");
    expect(v.jour).toBe("2026-10-26");
    expect(v.complet).toBe(true);
    expect(v.stations).toEqual({
      "97416463": { rr: 1.6, tn: 20, tx: 27.5 },
      "97418110": { rr: 4.8, tx: 26 },
    });
  });

  it("gives nothing for a day the package does not cover whole, and says when its last hour is missing", () => {
    // The recorded package (24/10 08:00 UTC to 25/10 08:00 UTC): neither day at La Réunion is in it whole.
    const recorded = fixture("meteofrance_horaire.csv");
    expect(meteofrance.parseDay(recorded, "2026-10-24").stations).toEqual({});
    expect(meteofrance.parseDay(recorded, "2026-10-25")).toEqual({ jour: "2026-10-25", complet: false, stations: {} });
    expect(meteofrance.parseDay(pack(hoursOfDay(() => ({ rr1: 0 }), "97416463", 23)), "2026-10-26").complet).toBe(false);
  });

  it("is kept at 00:20 and 00:35 at La Réunion only", () => {
    const at = (t: string) => meteofrance.veilleDue(new Date(t));
    expect(at("2026-10-26T20:20:07Z")).toBe(true);
    expect(at("2026-10-26T20:35:02Z")).toBe(true);
    expect(["2026-10-26T20:15:00Z", "2026-10-26T20:25:00Z", "2026-10-26T20:40:00Z", "2026-10-26T08:20:00Z"].some(at)).toBe(false);
  });
});

/** The KV namespace, with what was asked of it. */
class Namespace implements KvBinding {
  values = new Map<string, string>();
  asked: string[] = [];
  async get(key: string) {
    this.asked.push(`get ${key}`);
    const v = this.values.get(key);
    return v === undefined ? null : JSON.parse(v);
  }
  async put(key: string, value: string) {
    this.asked.push(`put ${key}`);
    this.values.set(key, value);
  }
}

describe("the scheduled pass that keeps the day before", () => {
  let packages: string[];
  let body: string;
  let token: Token | null;
  beforeEach(() => {
    packages = [];
    body = DAY;
    token = null;
    configure({ applicationId: "test" });
    share({ get: async () => token, put: async (t) => void (token = t) });
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "t", expires_in: 3600 });
      if (String(url).includes("/paquet/horaire")) {
        packages.push(String(url));
        return new Response(body);
      }
      // The slots of 6 minutes, which the step reads too: none here.
      if (String(url).includes("infrahoraire-6m")) return new Response("", { status: 404 });
      throw new Error(`unexpected ${url}`);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    configure({});
    share(undefined);
  });
  // Each event in a fresh isolate, as the scheduled event is: only KV carries over. As worker.ts runs it: the token and
  // the stations' step (providers/meteofrance.ts `refreshShared`) in the event, then the day before in the same isolate.
  const isolate = (kv: KvBinding, at: string) => new Cache(new MemoryStore(), () => Date.parse(at), false, new KvStore(kv));
  async function pass(kv: Namespace, at: string) {
    const cache = isolate(kv, at);
    await counted(SCHEDULED_BUDGET, async () => {
      scheduled();
      await meteofrance.keepFresh("cron");
      await meteofrance.refreshShared(cache, new Date(at));
    });
    return counted(BUILD_BUDGET, () => meteofrance.keepVeille(cache, new Date(at)));
  }
  const veilles = (kv: Namespace) => kv.asked.filter((k) => k.endsWith(` ${meteofrance.VEILLE}`));

  it("takes the step's package, never reads it itself, writes the day once at 00:20, and nothing more at 00:35 when it was whole", async () => {
    const kv = new Namespace();
    const first = await pass(kv, "2026-10-26T20:20:00Z");
    expect(first.value?.stations["97416463"]).toEqual({ rr: 1.6, tn: 20, tx: 27.5 });
    expect(first.value).toEqual(meteofrance.parseDay(DAY, "2026-10-26"));
    expect(first.used).toBe(1);
    expect([packages.length, veilles(kv)]).toEqual([1, [`put ${meteofrance.VEILLE}`]]);
    const second = await pass(kv, "2026-10-26T20:35:00Z");
    expect(second.value).toBeUndefined();
    expect(second.used).toBe(1);
    // The package, good until the next hour is due, not read again by the step.
    expect([packages.length, veilles(kv)]).toEqual([1, [`put ${meteofrance.VEILLE}`, `get ${meteofrance.VEILLE}`]]);
    // What historique_meteo reads afterwards, from another isolate.
    expect((await isolate(kv, "2026-10-27T03:00:00Z").kept<meteofrance.Veille>(meteofrance.VEILLE))?.value.jour).toBe("2026-10-26");
  });

  it("is made again at 00:35 from the package the step read again, when its last hour was not out at 00:20", async () => {
    const kv = new Namespace();
    body = pack(hoursOfDay(() => ({ rr1: 0 }), "97416463", 23));
    const first = await pass(kv, "2026-10-26T20:20:00Z");
    expect(first.value?.complet).toBe(false);
    body = DAY;
    const second = await pass(kv, "2026-10-26T20:35:00Z");
    expect(second.value?.complet).toBe(true);
    expect(second.value?.stations["97416463"]).toEqual({ rr: 1.6, tn: 20, tx: 27.5 });
    expect(second.used).toBeLessThanOrEqual(2);
    expect([packages.length, veilles(kv).filter((k) => k.startsWith("put")).length]).toEqual([2, 2]);
  });

  it("gives up without the step's package, rather than reading it", async () => {
    await expect(meteofrance.keepVeille(isolate(new Namespace(), "2026-10-26T20:20:00Z"), new Date("2026-10-26T20:20:00Z"))).rejects.toThrow(/paquet horaire/);
    expect(packages).toEqual([]);
  });
});

describe("the day before from the hourly package already parsed (`veilleDe`)", () => {
  it("is the day `parseDay` reads, whole or not", () => {
    const at = (t: string, csv: string, jour: string) => meteofrance.veilleDe(meteofrance.parseHourly(csv, Date.parse(t)), jour);
    expect(at("2026-10-26T20:20:00Z", DAY, "2026-10-26")).toEqual(meteofrance.parseDay(DAY, "2026-10-26"));
    expect(at("2026-10-26T20:35:00Z", DAY, "2026-10-26")).toEqual(meteofrance.parseDay(DAY, "2026-10-26"));
    const late = pack(hoursOfDay(() => ({ rr1: 0.5, tn: 290.15, tx: 295.15 }), "97416463", 23));
    expect(at("2026-10-26T20:20:00Z", late, "2026-10-26")).toEqual(meteofrance.parseDay(late, "2026-10-26"));
    const recorded = fixture("meteofrance_horaire.csv");
    expect(at("2026-10-25T08:20:00Z", recorded, "2026-10-25")).toEqual(meteofrance.parseDay(recorded, "2026-10-25"));
  });
});
