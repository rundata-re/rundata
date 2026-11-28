import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { installer } from "../src/contexte.js";
import * as airMesures from "../src/providers/air-mesures.js";
import * as carburants from "../src/providers/carburants.js";
import { contexte } from "../src/contexte.js";
import * as irve from "../src/providers/irve.js";
import worker from "../src/worker.js";
import { dansLeWorker, horsWorker } from "./contexte.js";

// The Worker builds its modules' context in its own modules, dropped after (test/modules-neufs.ts).
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

/** A KV namespace in memory, every key read. */
class FakeKv {
  read: string[] = [];
  constructor(private data: Record<string, unknown> = {}) {}
  async get(key: string) {
    this.read.push(key);
    return this.data[key] ?? null;
  }
  async put() {}
  async list() {
    return { keys: [], list_complete: true };
  }
}

const robots = (kv: FakeKv) => worker.fetch(new Request("https://rundata.re/robots.txt"), { STORE: kv } as never, { waitUntil: () => {} });

describe("the modules' context (src/contexte.ts)", () => {
  it("is nothing outside the Worker: the modules do as when they were not configured", () => {
    horsWorker();
    expect(contexte()).toEqual({ worker: false });
  });

  it("is built by the Worker once per store binding, its reads of the store counted", async () => {
    const kv = new FakeKv({ [irve.KV_KEY]: { lu: "2026-11-28T07:00:00Z", points: {} } });
    await robots(kv);
    const premier = contexte();
    expect(premier.worker).toBe(true);
    await robots(kv);
    // The same object from one request to the next: a module's copy kept for its context stays (capteurs.ts).
    expect(contexte()).toBe(premier);
    const avant = kv.read.length;
    const { value, used } = await counted(50, () => premier.kv!.json(irve.KV_KEY));
    expect(value).toEqual({ lu: "2026-11-28T07:00:00Z", points: {} });
    expect(used).toBe(1);
    expect(kv.read.slice(avant)).toEqual([irve.KV_KEY]);
    // Another binding (another test's Worker): a new context.
    await robots(new FakeKv());
    expect(contexte()).not.toBe(premier);
    horsWorker();
  });

  it("is the Worker's without a store too: the modules that never read their source there say it is absent", async () => {
    await worker.fetch(new Request("https://rundata.re/robots.txt"), {} as never, { waitUntil: () => {} });
    expect(contexte()).toEqual({ worker: true });
    horsWorker();
  });

  it("gives a test's data by key, a value or a function, any other key absent (test/contexte.ts)", async () => {
    let n = 0;
    dansLeWorker({ a: { x: 1 }, b: () => ++n });
    expect(await contexte().kv!.json("a")).toEqual({ x: 1 });
    expect([await contexte().kv!.json("b"), await contexte().kv!.json("b")]).toEqual([1, 2]);
    expect(await contexte().kv!.json("c")).toBeNull();
    horsWorker();
  });

  describe("what each module does without a store, as before the context", () => {
    const lus: string[] = [];
    const reseau = () => vi.stubGlobal("fetch", async (u: string | URL | Request) => {
      const url = String(u instanceof Request ? u.url : u);
      lus.push(url);
      return url.startsWith(irve.LIVE_URL) ? new Response(readFileSync(new URL("./fixtures/irve_dynamique.csv", import.meta.url), "utf8")) : new Response("", { status: 404 });
    });
    const cache = () => new Cache(new MemoryStore(), () => Date.parse("2026-11-28T07:00:00Z"));

    it("irve: the Worker without a store reads the national file, as a local server", async () => {
      reseau();
      lus.length = 0;
      installer({ worker: true });
      const live = await irve.live(cache());
      expect(Object.keys(live.value.points).length).toBeGreaterThan(0);
      expect(lus.some((u) => u.startsWith(irve.LIVE_URL))).toBe(true);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("carburants: the Worker never reads the prefecture, even without a store", async () => {
      reseau();
      lus.length = 0;
      installer({ worker: true });
      await expect(carburants.prix(cache())).rejects.toThrow("prix des carburants absents du stockage");
      expect(lus).toEqual([]);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("air: nothing outside the Worker, no error", async () => {
      horsWorker();
      expect(await airMesures.mesures(cache())).toBeNull();
    });
  });
});

