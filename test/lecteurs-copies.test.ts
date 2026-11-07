import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { landslides, sales, SNAP_M } from "../src/providers/terrain.js";
import { BANNER_WAIT_MS, snapshot } from "../src/web/data.js";
import { homePage, type HomeLive } from "../src/web/home.js";
import { scheduledEvery } from "../src/web/partagees.js";
import { HOME_READER_WAIT_MS, homeWaits, readerOf } from "../src/web/site.js";

const NOW = new Date("2026-10-26T15:40:00Z");
const MIN = 60_000;
const asking = (ua: string) => new Request("https://rundata.re/crues", { headers: { "user-agent": ua } });
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const CHATGPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
const PERSON = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// 26/10/2026: /crues made Googlebot or ChatGPT-User wait up to 25 s for its copy to be built again, a copy the scheduled
// event keeps every 15 minutes.
describe("a reader and a copy the scheduled event keeps (web/data.ts `snapshot`, web/site.ts `readerOf`)", () => {
  it("knows the rate of each shared copy, and none for a page's own", () => {
    expect(scheduledEvery("web:crues", undefined)).toBe(15);
    expect(scheduledEvery("web:actualites", undefined)).toBe(30);
    expect(scheduledEvery("web:volcan", undefined)).toBe(30);
    expect(scheduledEvery("web:lieu:saint-paul", undefined)).toBeUndefined();
  });

  async function served(key: string, ua: string, ageMin: number) {
    let t = NOW.getTime() - ageMin * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    let n = 0;
    const build = async () => ++n;
    await snapshot(c, key, build, () => {}, new Date(t));
    t = NOW.getTime();
    const behind: Promise<unknown>[] = [];
    const got = await snapshot(c, key, build, (p) => behind.push(p), NOW, 1000, readerOf(asking(ua)));
    await Promise.all(behind);
    return { value: got?.value, built: n };
  }

  it("serves a shared copy at once within its rate, refreshed behind, to the fetchers of search engines and assistants", async () => {
    for (const ua of [GOOGLEBOT, CHATGPT]) {
      // 12 minutes old, kept every 15: the copy as it is, its refresh after the answer.
      expect(await served("web:crues", ua, 12)).toEqual({ value: 1, built: 2 });
      // 24 minutes: the scheduled event a slot late, within its two events of slack.
      expect(await served("web:crues", ua, 24)).toEqual({ value: 1, built: 2 });
    }
  });

  it("makes them wait, as before, once the scheduled event has fallen behind, and for a page's own copy", async () => {
    // Past its rate (15), its margin (2.5) and the two events of slack (10).
    expect(await served("web:crues", GOOGLEBOT, 28)).toEqual({ value: 2, built: 2 });
    expect(await served("web:lieu:saint-paul", GOOGLEBOT, 12)).toEqual({ value: 2, built: 2 });
  });

  it("makes the daily check of the sources wait always, and never a person", async () => {
    expect(readerOf(asking("rundata-check/1.0"))).toBe(true);
    expect(await served("web:crues", "rundata-check/1.0", 12)).toEqual({ value: 2, built: 2 });
    expect(readerOf(asking(PERSON))).toBe(false);
    expect(await served("web:crues", PERSON, 12)).toEqual({ value: 1, built: 2 });
  });
});

// 04-07/11/2026: ChatGPT-User gave up 94 of its 118 reads of the home page before it was sent, the page waiting for the
// stations to be read again (up to 25 s).
describe("an assistant's fetcher on the home page (web/site.ts `homeWaits`)", () => {
  const home = (ua: string) => new Request("https://rundata.re/", { headers: { "user-agent": ua } });
  afterEach(() => vi.useRealTimers());

  it("waits 800 ms for the weather and a person's time for the vigilance; the check of the sources 25 s; a person as before", () => {
    expect(HOME_READER_WAIT_MS).toBe(800);
    for (const ua of [CHATGPT, GOOGLEBOT]) expect(homeWaits(home(ua))).toMatchObject({ meteo: 800, vigilance: BANNER_WAIT_MS });
    expect(homeWaits(home("rundata-check/1.0"))).toEqual({ meteo: 25_000, reader: true, vigilance: 25_000 });
    expect(homeWaits(home(PERSON))).toEqual({ meteo: undefined, reader: false, vigilance: BANNER_WAIT_MS });
  });

  /**
   * The weather's copy served to `ua` on the home page: `ageMin` old (none if null), its next build taking `buildMs`.
   * What it has once `afterMs` have passed, and the builds made once the work after the answer is done.
   */
  async function served(ua: string, ageMin: number | null, buildMs: number, afterMs: number) {
    vi.useFakeTimers({ now: NOW });
    let t = NOW.getTime() - (ageMin ?? 0) * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    let n = 0;
    const build = () => new Promise<number>((resolve) => setTimeout(() => resolve(++n), buildMs));
    if (ageMin != null) {
      const first = snapshot(c, "web:meteo", build, () => {}, new Date(t));
      await vi.advanceTimersByTimeAsync(buildMs);
      await first;
    }
    t = NOW.getTime();
    const w = homeWaits(home(ua));
    const behind: Promise<unknown>[] = [];
    let got: { value: number | undefined } | undefined;
    void snapshot(c, "web:meteo", build, (p) => behind.push(p), NOW, w.meteo, w.reader).then((r) => (got = { value: r?.value }));
    await vi.advanceTimersByTimeAsync(afterMs);
    const at = got;
    await vi.advanceTimersByTimeAsync(buildMs);
    await Promise.all(behind);
    return { at: at?.value ?? (at ? null : "en attente"), built: n };
  }

  it("serves an old copy within 800 ms when its refresh is slow, the refresh going on after the answer", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (const ua of [CHATGPT, GOOGLEBOT]) {
      // 20 minutes old, a refresh of 3 s: the copy at 800 ms, and the refresh made behind.
      expect(await served(ua, 20, 3000, HOME_READER_WAIT_MS + 1)).toEqual({ at: 1, built: 2 });
    }
    // Its age said, to measure what the assistants are given.
    expect(log).toHaveBeenCalledWith("copie servie au lecteur pendant son rafraîchissement : web:meteo, âge 20 min");
    log.mockRestore();
  });

  it("serves the refreshed copy when its refresh takes less than 800 ms", async () => {
    expect(await served(CHATGPT, 20, 300, 301)).toEqual({ at: 2, built: 2 });
  });

  it("serves the page without its live block at 800 ms when there is no copy at all, the build going on", async () => {
    expect(await served(CHATGPT, null, 3000, HOME_READER_WAIT_MS + 1)).toEqual({ at: null, built: 1 });
    // The tiles then say why: no empty block.
    const html = homePage("https://rundata.re", { meteo: null } as unknown as HomeLive, NOW);
    const tile = /<li class="tile k-meteo">[\s\S]*?<\/li>/.exec(html)![0];
    expect(tile).toContain("Se met à jour : rechargez la page dans quelques secondes.");
  });

  it("makes the check of the sources wait for the refresh, and never a person", async () => {
    expect(await served("rundata-check/1.0", 20, 3000, HOME_READER_WAIT_MS + 1)).toEqual({ at: "en attente", built: 2 });
    expect(await served("rundata-check/1.0", 20, 3000, 3001)).toEqual({ at: 2, built: 2 });
    expect(await served(PERSON, 20, 3000, 1)).toEqual({ at: 1, built: 2 });
  });
});

// The audit of 26/10/2026: points a metre apart missed the cache of fiche_terrain, each one asking all its sources again.
describe("fiche_terrain's reads around a point (providers/terrain.ts)", () => {
  let urls: string[];
  // Landslides: one 499 m north of the point, one 503 m south of it (within 508 m of the snapped centre).
  const P = { lon: 55.27012, lat: -21.00988 };
  const north = (m: number) => P.lat + m / 111_195;
  const MVT = { data: [
    { type: "Glissement", date_debut: "2024-02-01", longitude: P.lon, latitude: north(499), fiabilite: "Fort" },
    { type: "Éboulement", date_debut: "2023-03-01", longitude: P.lon, latitude: north(-503), fiabilite: "Moyen" },
  ] };
  beforeEach(() => {
    urls = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url));
      return Response.json(String(url).includes("/mvt") ? MVT : { features: [] });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks the landslides once for points a few metres apart, and gives the same as around each point", async () => {
    const c = new Cache();
    const a = await landslides(c, P.lon, P.lat);
    // 2 m east and 1 m north.
    const b = await landslides(c, P.lon + 0.00002, P.lat + 0.00001);
    expect(urls.filter((u) => u.includes("/mvt"))).toHaveLength(1);
    expect(urls[0]).toContain(`rayon=${500 + SNAP_M}`);
    expect(a.value.map((x) => x.type)).toEqual(["Glissement"]);
    expect(b.value.map((x) => x.type)).toEqual(["Glissement"]);
    // With the wider radius asked, 503 m is read, then left out: more than 500 m from the point.
    expect(SNAP_M).toBeGreaterThanOrEqual(Math.ceil(Math.hypot(111_195 * 0.00005, 111_195 * Math.cos((21 * Math.PI) / 180) * 0.00005)));
  });

  it("asks the sales around once for points a few metres apart", async () => {
    const c = new Cache();
    await sales(c, P.lon, P.lat, 2021);
    await sales(c, P.lon + 0.00002, P.lat + 0.00001, 2021);
    expect(urls).toHaveLength(1);
  });
});
