import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { landslides, sales, SNAP_M } from "../src/providers/terrain.js";
import { BANNER_WAIT_MS, snapshot } from "../src/web/data.js";
import { homePage, type HomeLive } from "../src/web/home.js";
import { scheduledEvery } from "../src/web/partagees.js";
import type { MeteoAnswer } from "../src/tools/meteo.js";
import { placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";
import { HOME_READER_WAIT_MS, homeWaits, LIVE_READER_WAIT_MS, oldCopy, ownWaits, readerOf } from "../src/web/site.js";

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

  it("makes them wait, as before, once the scheduled event has fallen behind", async () => {
    // Past its rate (15), its margin (2.5) and the two events of slack (10).
    expect(await served("web:crues", GOOGLEBOT, 28)).toEqual({ value: 2, built: 2 });
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

// 08-12/11/2026: OAI-SearchBot read the /meteo/<lieu> pages 264 times in 4 days, 2,383 ms in the middle (p90 4,931 ms),
// waiting for the page's own copy to be built again; ChatGPT-User gave up 3 of its 17 reads.
describe("a page's own copy for a reader (web/site.ts `ownWaits`)", () => {
  const OAI = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot";
  const BUILD_MS = 1500;

  it("makes a reader wait HOME_READER_WAIT_MS for its refresh, the check of the sources 25 s, a person as before", () => {
    for (const ua of [OAI, GOOGLEBOT, CHATGPT]) expect(ownWaits(asking(ua)), ua).toEqual([HOME_READER_WAIT_MS, true]);
    expect(ownWaits(asking("rundata-check/1.0"))).toEqual([25_000, true]);
    expect(ownWaits(asking(PERSON))).toEqual([undefined, false]);
  });

  /** A page's own copy `ageMin` old (none when null), its build taking BUILD_MS, read by `ua`. */
  async function own(ua: string, ageMin: number | null) {
    let t = NOW.getTime() - (ageMin ?? 0) * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    let n = 0;
    if (ageMin != null) await snapshot(c, "web:lieu:piton-de-la-fournaise", async () => ++n, () => {}, new Date(t));
    t = NOW.getTime();
    const slow = () => new Promise<number>((resolve) => setTimeout(() => resolve(++n), BUILD_MS));
    const behind: Promise<unknown>[] = [];
    const start = Date.now();
    const got = await snapshot(c, "web:lieu:piton-de-la-fournaise", slow, (p) => behind.push(p), NOW, ...ownWaits(asking(ua)));
    const waited = Date.now() - start;
    await Promise.all(behind);
    return { value: got?.value ?? null, waited, built: n };
  }

  it("gives it the copy as it is past HOME_READER_WAIT_MS, 12 minutes or 2 hours old, its refresh going on after the answer", async () => {
    for (const age of [12, 120]) {
      const got = await own(OAI, age);
      expect(got.value, `${age} min`).toBe(1);
      expect(got.waited).toBeLessThan(BUILD_MS);
      expect(got.built).toBe(2);
    }
  });

  it("sends the page without its live block when there is no copy at all, as the home page does", async () => {
    const got = await own(CHATGPT, null);
    expect(got.value).toBeNull();
    expect(got.waited).toBeLessThan(BUILD_MS);
    expect(got.built).toBe(1);
  });

  it("still makes the daily check of the sources wait for the refresh", async () => {
    expect(await own("rundata-check/1.0", 12)).toMatchObject({ value: 2, built: 2 });
  });

  it("says the time of its measure on the page, and that it is not the weather of now past 90 minutes", () => {
    const p = pageOf("piton-de-la-fournaise")!;
    const meteo = {
      resume: "",
      stations: [{ station: "Bellecombe", source: "meteofrance", altitude_m: 2245, heure_mesure: "26/10/2026 18:24", age_min: 6, mesures: { temperature: "9,1 °C" }, avertissements: [], distance_km: 0.8, pertinence: "bonne" }],
      sources: [],
    } as unknown as MeteoAnswer;
    // Built at 18:30 (Réunion), the measure of 18:24: read at 19:40, then at 20:40.
    const copy = { value: { meteo }, fetchedAt: new Date(NOW.getTime() - 70 * MIN), stale: true };
    const hour = placePage("https://rundata.re", p, copy, NOW);
    expect(hour).toMatch(/mesurés <b>[^<]*18:24<\/b> par la station <b>Bellecombe<\/b>/);
    expect(hour).not.toContain("Ce n&#39;est pas le temps");
    const later = placePage("https://rundata.re", p, copy, new Date(NOW.getTime() + 60 * MIN));
    expect(later).toMatch(/mesurés <b>[^<]*18:24<\/b>/);
    expect(later).toContain("Dernière mesure lue à la station Bellecombe : ");
    expect(later).toContain("Ce n&#39;est pas le temps qu&#39;il fait maintenant.");
  });
});

// 12-14/11/2026: a page's own copy was given 677 times to a reader while it was rebuilt, 316 minutes old in the middle,
// up to 24 h; each data center keeps its own, rebuilt only by a view there. On 13/11 at 05:46 (Réunion), OAI-SearchBot
// read /meteo/saint-gilles-les-bains twice a second apart, from two data centers: copies 1,085 and 725 minutes old.
describe("a page's own copy too old to be told as the present (web/site.ts `oldCopy`)", () => {
  const AT = new Date("2026-11-13T01:46:00Z");
  const KEY = "web:lieu:saint-gilles-les-bains";
  const OAI = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot";
  const FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
  afterEach(() => vi.useRealTimers());

  /**
   * The copy of KEY `ageMin` old read by `ua` at AT, its next build taking `buildMs`: what the view got (null: its page
   * without its live block), after how long, the builds made once the work after the answer is done, and the lines.
   */
  async function read(ua: string, ageMin: number, buildMs = 3000) {
    vi.useFakeTimers({ now: AT });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let t = AT.getTime() - ageMin * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    let n = 0;
    await snapshot(c, KEY, async () => ++n, () => {}, new Date(t));
    t = AT.getTime();
    const request = new Request("https://rundata.re/meteo/saint-gilles-les-bains", { headers: { "user-agent": ua } });
    const build = () => new Promise<number>((resolve) => setTimeout(() => resolve(++n), buildMs));
    const behind: Promise<unknown>[] = [];
    let got: { value: number | null; at: number } | undefined;
    void snapshot(c, KEY, build, (p) => behind.push(p), AT, ...ownWaits(request), undefined, oldCopy(request)).then((r) => (got = { value: r?.value ?? null, at: Date.now() - AT.getTime() }));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all(behind);
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    return { ...got!, built: n, lines };
  }

  it("makes the search engines' fetchers wait for its refresh: the two copies of 13/11 05:46", async () => {
    for (const age of [1085, 725]) {
      const got = await read(OAI, age);
      expect(got, `${age} min`).toMatchObject({ value: 2, at: 3000, built: 2 });
      expect(got.lines.some((l) => l.startsWith("copie refusée"))).toBe(false);
    }
  });

  it("gives a fetcher that answers someone now the page without its live block past LIVE_READER_WAIT_MS, with a line of its own", async () => {
    expect(LIVE_READER_WAIT_MS).toBeLessThan(1500);
    for (const age of [1085, 725]) {
      const got = await read(CHATGPT, age);
      expect(got, `${age} min`).toMatchObject({ value: null, at: LIVE_READER_WAIT_MS, built: 2 });
      expect(got.lines).toContain(`copie refusée pour son âge : ${KEY}, âge ${age} min, d'avant minuit`);
      expect(got.lines.some((l) => l.startsWith("copie servie au lecteur"))).toBe(false);
    }
    // Made today, 2 hours old: refused too, past OLD_MINUTES (90).
    expect((await read(CHATGPT, 120)).lines).toContain(`copie refusée pour son âge : ${KEY}, âge 120 min`);
    // The page then says why it has no figures.
    expect(placePage("https://rundata.re", pageOf("saint-gilles-les-bains")!, null, AT)).toContain("Les mesures se chargent");
  });

  it("serves the refreshed copy when it comes within LIVE_READER_WAIT_MS", async () => {
    expect(await read(CHATGPT, 1085, 500)).toMatchObject({ value: 2, at: 500, built: 2 });
  });

  it("still gives a copy within OLD_MINUTES as it is at HOME_READER_WAIT_MS, its refresh behind", async () => {
    const got = await read(CHATGPT, 60);
    expect(got).toMatchObject({ value: 1, at: HOME_READER_WAIT_MS, built: 2 });
    expect(got.lines).toContain(`copie servie au lecteur pendant son rafraîchissement : ${KEY}, âge 60 min`);
  });

  it("gives a link's preview the copy, dated, at HOME_READER_WAIT_MS", async () => {
    expect(oldCopy(new Request("https://rundata.re/", { headers: { "user-agent": FB } }))).toBeUndefined();
    const got = await read(FB, 1085);
    expect(got).toMatchObject({ value: 1, at: HOME_READER_WAIT_MS, built: 2 });
    expect(got.lines).toContain(`copie servie au lecteur pendant son rafraîchissement : ${KEY}, âge 1085 min`);
  });

  it("gives a person the page without its live block for a copy made before midnight, and an old one of today at once", async () => {
    const got = await read(PERSON, 725, 5000);
    expect(got).toMatchObject({ value: null, at: 4000, built: 2 });
    expect(got.lines).toContain(`copie refusée pour son âge : ${KEY}, âge 725 min, d'avant minuit`);
    // 05:46: a copy of 03:46 is of today.
    expect(await read(PERSON, 120)).toMatchObject({ value: 1, at: 0, built: 2 });
  });

  it("leaves the daily check of the sources to wait for the refresh", async () => {
    expect(oldCopy(new Request("https://rundata.re/", { headers: { "user-agent": "rundata-check/dev4" } }))).toBeUndefined();
    expect(await read("rundata-check/1.0", 1085)).toMatchObject({ value: 2, at: 3000 });
  });
});
