import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_BUDGET, count, counted, PAGE_BUDGET, SCHEDULED_BUDGET, scheduled, spent } from "../src/budget.js";
import { Cache, MemoryStore, TieredStore, type CacheEntry } from "../src/cache.js";
import { buildChiffres } from "../src/chiffres.js";
import { KvStore, type KvBinding } from "../src/kv.js";
import { withLectures } from "../src/lectures.js";
import * as meteofrance from "../src/providers/meteofrance.js";
import { configure, share, type Token } from "../src/providers/mf-auth.js";
import { checks, REGISTRY } from "../src/registre.js";
import { SHARED } from "../src/web/partagees.js";

// The Météo-France stations' copy in KV (providers/meteofrance.ts `refreshShared`, KV_BUNDLE): what the scheduled event's
// step reads and writes, what /chiffres no longer reads in the event, and what a question takes from it. Each fetch
// and each call to the data center's cache and to KV counted, as the Worker counts them (worker.ts).

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const SIX = fixture("meteofrance_6min.csv");
const HOURLY = fixture("meteofrance_horaire.csv");
// The recorded hourly package ends at 08:00 UTC on 25/10/2026: the event of 08:20, 12:20 at La Réunion.
const NOW = new Date("2026-10-25T08:20:00Z");
const MIN = 60_000;

/** The data center's cache, with the keys asked. */
class Edge extends MemoryStore {
  asked: string[] = [];
  async get(key: string) {
    count(1, "read");
    this.asked.push(`get ${key}`);
    return super.get(key);
  }
  async put(key: string, entry: CacheEntry) {
    count(1, true);
    this.asked.push(`put ${key}`);
    return super.put(key, entry);
  }
}

/** The KV namespace, with the keys asked. */
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

// The token shared through KV (worker.ts), apart from the copy's key: mf-auth.ts counts its own calls.
let token: Token | null;
let portal: () => Response;
const fetched: string[] = [];
const kind = (url: string) =>
  url.includes("/token") ? "jeton" : url.includes("infrahoraire-6m") ? "créneau" : url.includes("/paquet/horaire") ? "horaire" : url.includes("meteofrance") ? "autre MF" : "ailleurs";
const of = (k: string) => fetched.filter((f) => f === k).length;

let clock = NOW.getTime();
const isolate = (kv: Namespace, edge = new Edge(), durable = true) =>
  new Cache(new TieredStore(new MemoryStore(), edge), () => clock, false, durable ? new KvStore(kv) : undefined);

/** One scheduled event as worker.ts runs it, up to the step: the token kept, then the step. */
const event = (cache: Cache, at: Date, then?: () => Promise<unknown>) =>
  counted(SCHEDULED_BUDGET, async () => {
    scheduled();
    await meteofrance.keepFresh("cron").catch(() => null);
    const t0 = spent();
    const step = await meteofrance.refreshShared(cache, at);
    const t1 = spent();
    const after = then && (await then());
    return { step, stepUsed: t1 - t0, after, afterUsed: spent() - t1 };
  });

beforeEach(() => {
  clock = NOW.getTime();
  fetched.length = 0;
  token = null;
  portal = () => Response.json({ access_token: "t", expires_in: 3600 });
  configure({ applicationId: "test" });
  share({ get: async () => token, put: async (t) => void (token = t) });
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    fetched.push(kind(url));
    if (url.includes("/token")) return portal();
    if (url.includes("infrahoraire-6m")) return new Response(SIX);
    if (url.includes("/paquet/horaire")) return new Response(HOURLY);
    return new Response("", { status: 503 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  configure({});
  share(undefined);
});

describe("the scheduled event's step (meteofrance:stations)", () => {
  it("reads the 11 slots and the hourly package into KV's copy: 14 subrequests at most, as the registry says", async () => {
    const kv = new Namespace();
    const edge = new Edge();
    const { value } = await event(isolate(kv, edge), NOW);
    expect(value.step).toEqual({ creneaux: 11, horaire: "2026-10-25T08:00:00Z" });
    // The token was kept before it: the step takes none.
    expect([of("jeton"), of("créneau"), of("horaire")]).toEqual([1, 11, 1]);
    expect(kv.asked).toEqual([`get ${meteofrance.KV_BUNDLE}`, `put ${meteofrance.KV_BUNDLE}`]);
    expect(edge.asked).toEqual([]);
    const declared = REGISTRY.find((e) => e.id === "meteofrance:stations")!.run;
    expect(value.stepUsed).toBe(14);
    expect(value.stepUsed).toBeLessThanOrEqual(declared.subrequests);
    expect([declared.kvReads, declared.kvWrites]).toEqual([1, 1]);
  });

  it("weighs in KV what the pull request says", async () => {
    const kv = new Namespace();
    await event(isolate(kv), NOW);
    const size = kv.values.get(meteofrance.KV_BUNDLE)!.length;
    // 11 slots of the recorded packet (56 stations each) and 24 hours of the recorded package (6 stations): 89 136
    // bytes; about 142 000 with the package's 56 stations. Far under KV's 25 Mo a value.
    expect(size).toBeGreaterThan(50_000);
    expect(size).toBeLessThan(1_000_000);
  });

  it("reads again, at the next event, only what a question would read again", async () => {
    const kv = new Namespace();
    const cache = isolate(kv);
    await event(cache, NOW);
    fetched.length = 0;
    clock += 5 * MIN;
    const { value } = await event(cache, new Date(clock));
    // The new slot and the ones still filling up; the hourly package holds the newest hour, good for 2 hours.
    expect(of("horaire")).toBe(0);
    expect(of("créneau")).toBeGreaterThan(0);
    expect(of("créneau")).toBeLessThan(11);
    expect(value.stepUsed).toBeLessThanOrEqual(14);
  });

  it("takes no token and reads nothing when the token could not be kept before it", async () => {
    // KV holds no token and the portal does not answer: keepFresh fails, once.
    portal = () => new Response("", { status: 500 });
    const kv = new Namespace();
    const { value } = await event(isolate(kv), NOW);
    expect(value.step).toBe("sans jeton");
    expect(value.stepUsed).toBe(0);
    expect([of("jeton"), of("créneau"), of("horaire")]).toEqual([1, 0, 0]);
    expect(kv.asked).toEqual([]);
  });

  it("takes no token either from an isolate whose token is about to be due, when the portal fails", async () => {
    // A token good for 10 more minutes: keepFresh renews it (it is under 15 minutes) and fails; the step still uses it.
    token = { value: "vieux", until: Date.now() + 10 * MIN };
    portal = () => new Response("", { status: 500 });
    const { value } = await event(isolate(new Namespace()), NOW);
    expect(value.step).toMatchObject({ creneaux: 11 });
    expect(of("jeton")).toBe(1);
    expect(value.stepUsed).toBe(14);
  });
});

describe("/chiffres in the event, after the step (web:chiffres)", () => {
  it("reads neither Météo-France nor the stations' copies: 13 subrequests fewer than when it read them itself", async () => {
    const shared = SHARED.find((s) => s.key === "web:chiffres")!;
    expect(shared.build).toBe(buildChiffres);
    // Before: the stations read by /chiffres itself, from a cold data center, as the event read them (no copy in KV),
    // with the token the event kept first (meteofrance:jeton).
    await meteofrance.keepFresh("cron");
    fetched.length = 0;
    const edgeA = new Edge();
    const a = await counted(BUILD_BUDGET, () => buildChiffres(isolate(new Namespace(), edgeA, false), NOW));
    // Without KV, the copy is looked for in the data center's cache (cache.ts): a lookup the event never made before.
    const lookup = edgeA.asked.filter((k) => k === `get ${meteofrance.KV_BUNDLE}`).length;
    const mfA = { créneaux: of("créneau"), edge: edgeA.asked.filter((k) => k.includes("meteofrance") && !k.includes(meteofrance.KV_BUNDLE)) };
    expect(mfA).toEqual({ créneaux: 11, edge: ["get meteofrance:6min", "put meteofrance:6min"] });
    expect(lookup).toBe(1);
    // After: the same build in the event, after the step, in the same isolate.
    fetched.length = 0;
    const kv = new Namespace();
    const edgeB = new Edge();
    const cacheB = isolate(kv, edgeB);
    let stations: Awaited<ReturnType<typeof meteofrance.observations>> | undefined;
    const b = await event(cacheB, NOW, async () => {
      const c = await buildChiffres(cacheB, NOW);
      // What its count of the stations read: the step's copy, of the step's time, at no cost.
      const t = spent();
      stations = await meteofrance.observations(cacheB, NOW);
      expect(spent()).toBe(t);
      return c;
    });
    // Météo-France asked by the step only.
    expect([of("jeton"), of("créneau"), of("horaire"), of("autre MF")]).toEqual([0, 11, 1, 0]);
    expect(kv.asked.filter((k) => k.includes(meteofrance.KV_BUNDLE))).toEqual([`get ${meteofrance.KV_BUNDLE}`, `put ${meteofrance.KV_BUNDLE}`]);
    expect(edgeB.asked.filter((k) => k.includes("meteofrance"))).toEqual([]);
    expect(stations).toMatchObject({ stale: false, fetchedAt: NOW });
    expect(a.value.construite_le).toBe(NOW.toISOString());
    expect(a.used - lookup - b.value.afterUsed).toBe(13);
    // Its declared cold cost, the one measured (45) less these 13, and less the 6 of the Pioupiou beacon, no longer read.
    expect(shared.cold).toBe(45 - 13 - 6);
  });
});

describe("the registry with the step", () => {
  it("adds nothing to the worst scheduled pass: the step takes what /chiffres and the day before no longer read", () => {
    const of = (id: string) => REGISTRY.find((e) => e.id === id)!.run.subrequests;
    const chiffres = SHARED.find((s) => s.key === "web:chiffres")!;
    // Before the step: /chiffres measured at 45 cold, the day before at 3 (its own read of the hourly bundle).
    const given = 45 - chiffres.cold! + (3 - of("meteofrance:veille"));
    // The worst pass sums every scheduled entry: it does not grow as long as the step costs no more than that.
    expect(of("meteofrance:stations")).toBeLessThanOrEqual(given);
    expect(checks().filter((c) => c.value > c.limit)).toEqual([]);
  });

  it("counts one read of KV more for the views and questions that read the stations", () => {
    for (const id of ["/", "/meteo", "/meteo/*", "/communes/*", "/aujourdhui/*", "meteo_actuelle", "resume_du_jour"]) {
      const e = REGISTRY.find((x) => x.id === id)!;
      expect(e.run.kvReads, id).toBeGreaterThanOrEqual(1);
      expect(e.run.subrequests, id).toBeLessThanOrEqual(PAGE_BUDGET);
    }
  });
});

describe("a question after the step (meteo_actuelle)", () => {
  // The event's isolate writes the copy; the question runs in another isolate, its data center's cache empty.
  async function after(minutes: number) {
    const kv = new Namespace();
    await event(isolate(kv), NOW);
    fetched.length = 0;
    kv.asked.length = 0;
    clock = NOW.getTime() + minutes * MIN;
    const edge = new Edge();
    const q = await counted(PAGE_BUDGET, async () => {
      const { value: o, lectures } = await withLectures(() => meteofrance.observations(isolate(kv, edge), new Date(clock)));
      return { o, lectures };
    });
    return { q, kv, edge };
  }

  it("takes the final slots from KV's copy, with their time, and reads only the ones still filling up", async () => {
    // A minute after the event: every slot of KV's copy is as good as the question's own would have to be.
    const { q, kv } = await after(1);
    expect(of("créneau")).toBe(0);
    expect(kv.asked.filter((k) => k === `get ${meteofrance.KV_BUNDLE}`)).toHaveLength(1);
    expect(q.value.o.fetchedAt.getTime()).toBe(NOW.getTime());
    expect(q.used).toBeLessThanOrEqual(1 + 2);
  });

  it("reads Météo-France again for the slots that KV's copy holds for too long, as today", async () => {
    // 4 minutes after: the slots under 15 minutes old were good for 2 minutes only.
    const { q } = await after(4);
    expect(of("créneau")).toBeGreaterThan(0);
    expect(of("créneau")).toBeLessThan(11);
    expect(q.value.o.fetchedAt.getTime()).toBeLessThanOrEqual(clock);
  });

  it("reads Météo-France as today when the event is late and KV's copy too old", async () => {
    // 40 minutes after: none of KV's slots is a slot asked now but 5, final and good.
    const { q } = await after(40);
    expect(of("créneau")).toBeGreaterThan(0);
    expect(q.value.o.stale).toBe(false);
  });
});

describe("the day before (meteofrance:veille), from the step's copy", () => {
  it("reads neither Météo-France nor KV after the step, and writes the day once", async () => {
    // The day of 24/10 at La Réunion is not whole in the recorded package: kept as not complete, then at 00:35.
    const kv = new Namespace();
    const cache = isolate(kv);
    const at = new Date("2026-10-24T20:20:00Z");
    clock = at.getTime();
    fetched.length = 0;
    const { value } = await event(cache, at, async () => {
      const t = spent();
      const v = await meteofrance.keepVeille(cache, at);
      return { v, used: spent() - t };
    });
    expect(value.after).toBeDefined();
    const got = value.after as { v: meteofrance.Veille; used: number };
    expect(got.v.jour).toBe("2026-10-24");
    expect(got.used).toBe(1);
    expect(of("horaire")).toBe(1);
    expect(kv.asked.filter((k) => k.includes(meteofrance.VEILLE))).toEqual([`put ${meteofrance.VEILLE}`]);
    expect(REGISTRY.find((e) => e.id === "meteofrance:veille")!.run.subrequests).toBeGreaterThanOrEqual(2);
  });
});
