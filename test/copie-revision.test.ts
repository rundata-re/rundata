import { describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { snapshot } from "../src/web/data.js";
import { oldCopy, ownWaits } from "../src/web/site.js";

// 19/11/2026 at 17:00 in La Réunion.
const NOW = new Date("2026-11-19T13:00:00Z");
const MIN = 60_000;
const asking = (ua: string) => new Request("https://rundata.re/communes/sainte-marie", { headers: { "user-agent": ua } });
const OAI = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot";
const PERSON = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// 19/11/2026: after the day's deploys, a commune's copy of the revision before was served only past the whole wait,
// 800 ms to a reader, 4 s to a person: 4,241 and 4,280 ms on /meteo/saint-pierre and /meteo/la-possession.
describe("a page's own copy out of date by its revision alone", () => {
  const view = async (ua: string, ageMin: number, waitMs = 400) => {
    const store = new MemoryStore();
    await store.put("web:commune:sainte-marie", { value: "ancienne", fetchedAt: NOW.getTime() - ageMin * MIN, version: "rendu-0" });
    const c = new Cache(store, () => NOW.getTime(), false, undefined, "2.0.0");
    const later: Promise<unknown>[] = [];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // The clock and the timers are the test's: on a loaded machine, real ones measured the machine, not the wait.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const t = Date.now();
      let ms = -1;
      const [w, reader] = ownWaits(asking(ua));
      const build = () => new Promise<string>((r) => setTimeout(() => r("nouvelle"), 1500));
      const got = snapshot(c, "web:commune:sainte-marie", build, (p) => later.push(p), NOW, w ?? waitMs, reader, undefined, oldCopy(asking(ua)))
        .then((g) => ((ms = Date.now() - t), g));
      await vi.advanceTimersByTimeAsync(5000);
      const value = (await got)?.value ?? null;
      await Promise.all(later);
      return { value, ms };
    } finally {
      vi.useRealTimers();
      log.mockRestore();
    }
  };

  it("is served at once, to a person and to a search engine, its build behind", async () => {
    for (const ua of [PERSON, OAI]) {
      const { value, ms } = await view(ua, 60);
      expect(value, ua).toBe("ancienne");
      expect(ms, ua).toBeLessThan(200);
    }
  });

  it("past the age a reader is given (oldCopy), or made before midnight, waits as before", async () => {
    // 100 minutes: past OLD_MINUTES (90) for a search engine's fetcher, not for a person.
    expect((await view(OAI, 100)).ms).toBeGreaterThanOrEqual(700);
    expect((await view(PERSON, 100)).ms).toBeLessThan(200);
    // Made yesterday at 23:00, 18 hours old: what it says of « today » would be yesterday's.
    expect((await view(PERSON, 18 * 60)).ms).toBeGreaterThanOrEqual(350);
  });
});
