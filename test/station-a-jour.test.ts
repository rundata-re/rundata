import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { snapshot } from "../src/web/data.js";
import { site, STATION_STALE_MINUTES, stationWaits } from "../src/web/site.js";
import type { StationData } from "../src/web/station.js";

const NOW = new Date("2026-11-23T02:58:00Z");
const MIN = 60_000;
const KEY = "web:station:97422445";
const asking = (ua: string) => new Request("https://rundata.re/meteo/station/97422445", { headers: { "user-agent": ua } });
const PERSON = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// 23/11/2026 at 06:58: the first view of /meteo/station/97422445 (Bras-Sec) in its data center got the page with the
// measure of 06:06, while that of 06:48 was out: a person was given the data center's copy as it was, whatever its age.
describe("a station's page and a person (web/site.ts `stationWaits`)", () => {
  async function served(ua: string, ageMin: number, build2: () => Promise<number> = async () => 2) {
    let t = NOW.getTime() - ageMin * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    await snapshot(c, KEY, async () => 1, () => {}, new Date(t));
    t = NOW.getTime();
    const behind: Promise<unknown>[] = [];
    const [waitMs, reader] = stationWaits(asking(ua));
    const got = await snapshot(c, KEY, build2, (p) => behind.push(p), NOW, waitMs, reader);
    await Promise.all(behind.map((p) => p.catch(() => undefined)));
    return got?.value;
  }

  it("waits for the refresh of a copy older than STATION_STALE_MINUTES", async () => {
    expect(await served(PERSON, 52)).toBe(2);
    expect(await served(PERSON, STATION_STALE_MINUTES + 1)).toBe(2);
  });

  it("serves a younger copy at once, its refresh after the answer", async () => {
    expect(await served(PERSON, 8)).toBe(1);
  });

  it("serves the old copy, its measure dated, when its refresh fails", async () => {
    expect(
      await served(PERSON, 52, async () => {
        throw new Error("paquet 6 minutes indisponible");
      }),
    ).toBe(1);
  });

  it("leaves the readers as they were", () => {
    expect(stationWaits(asking(GOOGLEBOT))[1]).toBe(true);
  });
});

// The same view through site(): Météo-France's package slow to answer, the person's page waits for it before being sent
// (then gets the copy of 06:06, dated), where it was sent at once.
describe("a station's page for a person, its copy 52 minutes old, through site()", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("waits for the refresh before the answer", async () => {
    const copy: StationData = { id: "97422445", nom: "Bras-Sec", altitude_m: 1200, derniere: { time: "2026-11-23T02:06:00Z", mesures: { t: 16.4 } }, heures: [] };
    let t = NOW.getTime() - 52 * MIN;
    const c = new Cache(new MemoryStore(), () => t);
    await snapshot(c, KEY, async () => copy, () => {}, new Date(t));
    t = NOW.getTime();
    // Météo-France's package never answers; every other source fails at once.
    vi.stubGlobal("fetch", (url: string | URL | Request) =>
      String(url instanceof Request ? url.url : url).includes("meteofrance") ? new Promise(() => {}) : Promise.reject(new Error("hors ligne")),
    );
    const spies = (["log", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const start = Date.now();
    const r = (await site(new Request("https://rundata.re/meteo/station/97422445", { headers: { accept: "text/html", "user-agent": PERSON } }), c, () => {}, NOW))!;
    const took = Date.now() - start;
    spies.forEach((s) => s.mockRestore());
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("06:06");
    expect(took).toBeGreaterThan(3000);
  }, 30_000);
});
