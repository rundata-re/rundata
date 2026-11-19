import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { realtime, RT_BACKOFF_SECONDS, RT_TIMEOUT_MS } from "../src/providers/gtfsrt.js";

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
    // Past them: asked again, and its copy taken once it answers.
    up = true;
    t = T0 + 2 * MIN + 5.5 * MIN;
    expect((await realtime(cache, "carsud"))?.fetchedAt.getTime()).toBe(t);
    expect(asked).toBeGreaterThan(failed);
  });
});
