import { afterEach, describe, expect, it, vi } from "vitest";
import { counted, PAGE_BUDGET, SCHEDULED_BUDGET, scheduled } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { type Realtime, realtime, realtimeKept, RT_BACKOFF_SECONDS, RT_TIMEOUT_MS } from "../src/providers/gtfsrt.js";
import { keptFeed } from "../src/web/site.js";

const T0 = new Date("2026-11-20T04:00:00Z").getTime();
const MIN = 60_000;

afterEach(() => vi.unstubAllGlobals());

// 20/11/2026: the feeds of Car Jaune and Car Sud silent, a page of a stop of the South waited for them up to 8 s about
// once a minute, 8.5 to 9.5 s in the middle for the robots reading these pages one after the other.
describe("a network's real-time feed that falls silent (providers/gtfsrt.ts `realtime`)", () => {
  it("is waited for 4 s at most, and asked again 5 minutes after it fell silent, its last copy served in between", async () => {
    expect(RT_TIMEOUT_MS).toBe(4000);
    expect(RT_BACKOFF_SECONDS).toBe(300);
    let t = T0;
    const cache = new Cache(new MemoryStore(), () => t);
    let asked = 0;
    let up = true;
    vi.stubGlobal("fetch", async () => {
      asked++;
      return up ? new Response(new Uint8Array(0)) : new Response("down", { status: 503 });
    });
    expect((await realtime(cache, "carsud"))?.stale).toBe(false);
    const first = asked;
    // The feed falls silent: the next read past its minute tries it, fails, and serves the copy.
    up = false;
    t += 2 * MIN;
    expect((await realtime(cache, "carsud"))?.fetchedAt.getTime()).toBe(T0);
    const failed = asked;
    expect(failed).toBeGreaterThan(first);
    // Within the 5 minutes: never asked, the copy at once.
    for (const after of [1, 3, 4.5]) {
      t = T0 + 2 * MIN + after * MIN;
      expect((await realtime(cache, "carsud"))?.fetchedAt.getTime(), `${after} min`).toBe(T0);
      expect(asked, `${after} min`).toBe(failed);
    }
    // Past them: asked again after the answer, the copy served; its new read taken by the next view once it answers.
    up = true;
    t = T0 + 2 * MIN + 5.5 * MIN;
    const { value, settled } = await counted(PAGE_BUDGET, () => realtime(cache, "carsud"));
    expect(value?.fetchedAt.getTime()).toBe(T0);
    expect(value?.stale).toBe(true);
    await settled();
    expect(asked).toBeGreaterThan(failed);
    expect((await realtime(cache, "carsud"))?.fetchedAt.getTime()).toBe(t);
  });

  // 20/11/2026, after the robots got the feed already read: Car Jaune and Car Sud silent for hours, a robot still waited
  // 1.2 to 2.1 s for their next try on the pages of the stations of Saint-Benoît and Saint-Louis.
  it("once silent, is not waited for at its next try: the page gets the last copy with its time, the try goes on after", async () => {
    let t = T0;
    const cache = new Cache(new MemoryStore(), () => t);
    let hung: ((r: Response) => void) | undefined;
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(0)));
    await realtime(cache, "carjaune");
    t += 2 * MIN;
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect((await realtime(cache, "carjaune"))?.stale).toBe(true);
    // Its next try hangs: the page does not wait for it.
    vi.stubGlobal("fetch", (_url: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      hung = resolve;
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    t += 6 * MIN;
    const kept: Promise<unknown>[] = [];
    const { value } = await counted(PAGE_BUDGET, () => realtime(cache, "carjaune"), (w) => kept.push(w));
    expect(value?.fetchedAt.getTime()).toBe(T0);
    expect(value?.stale).toBe(true);
    expect(kept.length).toBe(1);
    expect(hung).toBeDefined();
    hung!(new Response(new Uint8Array(0)));
    await Promise.all(kept);
    expect((await realtime(cache, "carjaune"))?.fetchedAt.getTime()).toBe(t);
  });

  it("is still waited for by the scheduled event", async () => {
    let t = T0;
    const cache = new Cache(new MemoryStore(), () => t);
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(0)));
    await realtime(cache, "carsud");
    t += 2 * MIN;
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    await realtime(cache, "carsud");
    t += 6 * MIN;
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(0)));
    const { value } = await counted(SCHEDULED_BUDGET, async () => {
      scheduled();
      return realtime(cache, "carsud");
    });
    expect(value?.fetchedAt.getTime()).toBe(t);
    expect(value?.stale).toBe(false);
  });
});

// 21-22/11/2026: a robot's view of a stop with no recent copy of the feed in its data center read the feed before the
// answer, 1.8 s in the middle for OAI-SearchBot when it answered, 3.3 to 4.5 s when it fell silent at that read (Loki).
describe("the feed for a robot (providers/gtfsrt.ts `realtimeKept`)", () => {
  const feed = (at: number): Realtime => ({ at: Math.floor(at / 1000), trips: {}, cancelled: [], alerts: [] });
  const hanging = () => {
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", (_url: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      release = () => resolve(new Response(new Uint8Array(0)));
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    // Let the read go once it has started: the read after the answer reaches fetch only past the cache's first step.
    return async () => {
      await vi.waitFor(() => expect(release).toBeDefined());
      release!();
    };
  };

  for (const [what, copy] of [["none", undefined], ["one past 15 minutes", 20 * MIN]] as const) {
    it(`is not waited for with ${what}: no live departures, the feed read after the answer`, async () => {
      const t = T0;
      const store = new MemoryStore();
      const cache = new Cache(store, () => t);
      if (copy) await store.put("rt:carsud", { value: feed(t - copy), fetchedAt: t - copy });
      const release = hanging();
      const kept: Promise<unknown>[] = [];
      const got = await realtimeKept(cache, "carsud", new Date(t), (w) => kept.push(w));
      expect(got).toBeUndefined();
      expect(kept.length).toBe(1);
      await release();
      await Promise.all(kept);
      expect((await cache.peek<Realtime>("rt:carsud"))?.fetchedAt.getTime()).toBe(t);
    });
  }

  it("gives a recent copy at once, past its minute read again after the answer", async () => {
    const t = T0;
    const store = new MemoryStore();
    const cache = new Cache(store, () => t);
    await store.put("rt:carsud", { value: feed(t - 3 * MIN), fetchedAt: t - 2 * MIN });
    const release = hanging();
    const kept: Promise<unknown>[] = [];
    const got = await realtimeKept(cache, "carsud", new Date(t), (w) => kept.push(w));
    expect(got?.fetchedAt.getTime()).toBe(t - 2 * MIN);
    expect(kept.length).toBe(1);
    await release();
    await Promise.all(kept);
  });
});

describe("who gets the feed already read on a stop's page (web/site.ts `keptFeed`)", () => {
  const req = (ua: string, person = false) =>
    new Request("https://rundata.re/bus/arret/le-tampon/casud", { headers: { "user-agent": ua, ...(person && { "accept-language": "fr-FR", "sec-fetch-mode": "navigate" }) } });
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  it("the assistants' and search engines' fetchers, the crawlers and the scripts", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "curl/8.18.0",
      CHROME,
    ]) expect(keptFeed(req(ua)), ua).toBe(true);
  });
  it("not a person's browser, nor the daily check of the sources", () => {
    expect(keptFeed(req(CHROME, true))).toBe(false);
    expect(keptFeed(req("rundata-check/verif"))).toBe(false);
  });
});
