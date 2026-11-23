import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as eauIle from "../src/eau/ile.js";
import * as irve from "../src/providers/irve.js";
import * as meteorOi from "../src/providers/meteor-oi.js";
import worker from "../src/worker.js";

// The Worker's scheduled event, whole: the passes chosen by the hour, the keys they write, and the same keys read back by
// the Worker that serves the questions (23/11/2026). Its pieces have their own tests; this one keeps them together.

const CSV = readFileSync(new URL("./fixtures/irve_dynamique.csv", import.meta.url), "utf8");

/** A KV namespace in memory: what is written, by key, and every key read. */
class FakeKv {
  data = new Map<string, string>();
  written: string[] = [];
  read: string[] = [];
  async get(key: string, type?: string) {
    this.read.push(key);
    const v = this.data.get(key);
    return v == null ? null : type === "json" ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.data.set(key, value);
    this.written.push(key);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async list({ prefix = "" }: { prefix?: string } = {}) {
    return { keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  }
}

/** Runs the event to its end: every promise handed to waitUntil, and those they hand over in turn. */
async function run(cron: string | undefined, kv: FakeKv) {
  const after: Promise<unknown>[] = [];
  await worker.scheduled({ cron }, { STORE: kv } as never, { waitUntil: (p) => void after.push(p) });
  for (let n = 0; n < after.length; n = after.length) await Promise.allSettled(after.slice(n));
  for (let i = 0; i < 3; i++) await Promise.allSettled(after);
}

describe("the Worker's scheduled event", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("writes the charging points at 5 past, though every other read of the event fails, and the Worker reads them back under the same key", async () => {
    // 00:35 UTC: the charging points are due (every 15 minutes from 5 past); every other source refuses.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T00:35:30Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      asked.push(url);
      if (url.startsWith(irve.LIVE_URL)) return new Response(CSV);
      return new Response("indisponible", { status: 503 });
    }));
    const kv = new FakeKv();
    expect(irve.refreshDue(new Date())).toBe(true);
    await run("*/5 * * * *", kv);
    // Written under the Worker's key, with La Réunion's points: an emptied event, or a key changed on one side, fails here.
    expect(asked.some((u) => u.startsWith(irve.LIVE_URL))).toBe(true);
    expect(kv.written).toContain(irve.KV_KEY);
    const written = JSON.parse(kv.data.get(irve.KV_KEY)!) as irve.Live;
    expect(Object.keys(written.points).length).toBeGreaterThan(0);
    // Read back by the Worker as it serves (worker.ts setup): from KV, the national file never asked again.
    asked.length = 0;
    const read = await irve.live(new Cache(new MemoryStore()));
    expect(read.value.points).toEqual(written.points);
    expect(kv.read).toContain(irve.KV_KEY);
    expect(asked.filter((u) => u.startsWith(irve.LIVE_URL))).toEqual([]);
  });

  it("leaves the charging points alone when they are not due, and the MétéoR-OI cron to its own pass", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T00:42:30Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      asked.push(String(input instanceof Request ? input.url : input));
      return new Response("indisponible", { status: 503 });
    }));
    const kv = new FakeKv();
    expect(irve.refreshDue(new Date())).toBe(false);
    await run("*/5 * * * *", kv);
    expect(kv.written).not.toContain(irve.KV_KEY);
    expect(asked.some((u) => u.startsWith(irve.LIVE_URL))).toBe(false);
    // At 5 past, but on the stations' cron: none of the main event's passes.
    vi.setSystemTime(new Date("2026-10-24T00:35:30Z"));
    asked.length = 0;
    const other = new FakeKv();
    await run(meteorOi.CRON, other);
    expect(other.written).not.toContain(irve.KV_KEY);
    expect(asked.some((u) => u.startsWith(irve.LIVE_URL))).toBe(false);
  });

  it("reads the island's water copy under the key the GitHub workflow writes it to", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponible", { status: 503 })));
    const kv = new FakeKv();
    const copie = { lu: "2026-10-24T00:00:00.000Z", baignades: [], communes: [] };
    await kv.put(eauIle.KV_KEY, JSON.stringify(copie));
    // Any request sets the Worker's readers up on its KV (worker.ts setup).
    const after: Promise<unknown>[] = [];
    await worker.fetch(new Request("https://rundata.re/robots.txt"), { STORE: kv } as never, { waitUntil: (p) => void after.push(p) });
    await Promise.allSettled(after);
    expect((await eauIle.ile(new Cache(new MemoryStore()))).value.lu).toBe(copie.lu);
    expect(kv.read).toContain(eauIle.KV_KEY);
    // The workflow reads and writes the same key.
    const yml = readFileSync(new URL("../.github/workflows/eau.yml", import.meta.url), "utf8");
    expect(yml).toContain(`kv key put ${eauIle.KV_KEY} `);
    expect(yml).toContain(`kv key get ${eauIle.KV_KEY} `);
  });
});
