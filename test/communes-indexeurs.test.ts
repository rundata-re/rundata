import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { communePage } from "../src/web/commune.js";
import { snapshot } from "../src/web/data.js";
import { pageOf } from "../src/web/places.js";
import { indexWaits, indexeur } from "../src/web/site.js";

// 22/11/2026 at 15:00 in La Réunion; the island's copy of Saint-Paul's page built at 12:00, 3 hours before.
const NOW = new Date("2026-11-22T11:00:00Z");
const MIN = 60_000;
const KEY = "web:commune:saint-paul";
const UA = {
  oai: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  chatgpt: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  personne: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  check: "rundata-check/ux",
};
const request = (ua: string) => new Request("https://rundata.re/communes/saint-paul", { headers: { "user-agent": ua } });
/** `snapshot`'s waits for `ua`, as web/site.ts passes them, the copy's `incomplete` left out. */
const waits = (ua: string) => {
  const [waitMs, reader, old, without] = indexWaits(request(ua), NOW);
  return [waitMs, reader, undefined, old, without] as const;
};

/** One view of the page's own copy, `ageMin` old, by `ua`: what it is given, and the builds started, awaited after it. */
async function view(ua: string, ageMin: number) {
  const store = new MemoryStore();
  await store.put(KEY, { value: { construite: "avant" }, fetchedAt: NOW.getTime() - ageMin * MIN });
  const cache = new Cache(store, () => NOW.getTime(), false);
  let builds = 0;
  const behind: Promise<unknown>[] = [];
  const got = await snapshot(cache, KEY, async () => (builds++, { construite: "neuve" }), (p) => void behind.push(p), NOW, ...waits(ua));
  await Promise.all(behind);
  return { got: (got?.value as { construite: string } | undefined)?.construite ?? null, builds };
}

describe("a commune's page, its copy of the day 3 hours old (web/site.ts `indexWaits`)", () => {
  it("is given as it is to a search engine's fetcher, and built again after the answer", async () => {
    expect(indexeur(request(UA.oai))).toBe(true);
    expect(indexeur(request(UA.google))).toBe(true);
    expect(await view(UA.oai, 180)).toEqual({ got: "avant", builds: 1 });
    expect(await view(UA.google, 180)).toEqual({ got: "avant", builds: 1 });
  });

  it("is not given to a fetcher that answers someone now: it waits for the new one, as before", async () => {
    expect(indexeur(request(UA.chatgpt))).toBe(false);
    expect(await view(UA.chatgpt, 180)).toEqual({ got: "neuve", builds: 1 });
  });

  it("is given to a person as before, built again after the answer", async () => {
    expect(indexeur(request(UA.personne))).toBe(false);
    expect(await view(UA.personne, 180)).toEqual({ got: "avant", builds: 1 });
  });

  it("is built again before the daily check of the sources sees it, as before", async () => {
    expect(indexeur(request(UA.check))).toBe(false);
    expect(await view(UA.check, 180)).toEqual({ got: "neuve", builds: 1 });
  });

  it("from before midnight, is never given to a search engine's fetcher as it is", async () => {
    // Built at 23:00 the day before, 16 hours old.
    expect(await view(UA.oai, 16 * 60)).toEqual({ got: "neuve", builds: 1 });
  });

  it("is built once after two views in a row, not twice", async () => {
    const store = new MemoryStore();
    await store.put(KEY, { value: { construite: "avant" }, fetchedAt: NOW.getTime() - 180 * MIN });
    const cache = new Cache(store, () => NOW.getTime(), false);
    let builds = 0;
    let done = () => {};
    const slow = new Promise<void>((r) => (done = r));
    const behind: Promise<unknown>[] = [];
    const build = async () => (builds++, await slow, { construite: "neuve" });
    for (let i = 0; i < 2; i++) {
      const got = await snapshot(cache, KEY, build, (p) => void behind.push(p), NOW, ...waits(UA.oai));
      expect(got?.value).toEqual({ construite: "avant" });
    }
    done();
    await Promise.all(behind);
    expect(builds).toBe(1);
  });
});

describe("a commune's page from a copy whose measure is past 90 minutes", () => {
  const p = pageOf("saint-paul")!;
  // The station's measure 10 minutes old when the copy was built.
  const page = (copyAgeMin: number) => {
    const fetchedAt = new Date(NOW.getTime() - copyAgeMin * MIN);
    const station = { station: "Le Port", mesures: { temperature: "25,9 °C" }, altitude_m: 10, heure_mesure: new Date(fetchedAt.getTime() - 10 * MIN).toISOString(), age_min: 10, distance_km: 6.1, pertinence: "bonne" };
    const place = { value: { meteo: { stations: [station] } }, fetchedAt, stale: false };
    return communePage("https://rundata.re", p, { place, commune: null } as unknown as Parameters<typeof communePage>[2], NOW);
  };
  it("says it is not the weather of now, as a place's page does", () => {
    expect(page(180)).toMatch(/<p class="note">Dernière mesure lue à la station Le Port : [^<]+\. Ce n&#39;est pas le temps qu&#39;il fait maintenant\.<\/p><div class="now">/);
    expect(page(5)).not.toContain("Ce n&#39;est pas le temps");
  });
});

// /meteo/<lieu> and /aujourdhui/<commune> read the place's own copy (web:lieu:<slug>) with the same waits.
describe("the place's weather of /meteo/<lieu> and /aujourdhui/<commune> (web/site.ts `placeWaits`)", () => {
  const PLACE = "web:lieu:saint-paul";
  async function placeView(path: string, ua: string, ageMin: number) {
    const store = new MemoryStore();
    await store.put(PLACE, { value: { construite: "avant" }, fetchedAt: NOW.getTime() - ageMin * MIN });
    const cache = new Cache(store, () => NOW.getTime(), false);
    let builds = 0;
    const behind: Promise<unknown>[] = [];
    const [waitMs, reader, old, without] = indexWaits(new Request(`https://rundata.re${path}`, { headers: { "user-agent": ua } }), NOW);
    const got = await snapshot(cache, PLACE, async () => (builds++, { construite: "neuve" }), (p) => void behind.push(p), NOW, waitMs, reader, undefined, old, without);
    await Promise.all(behind);
    return { got: (got?.value as { construite: string } | undefined)?.construite ?? null, builds };
  }

  for (const path of ["/meteo/saint-paul", "/aujourdhui/saint-paul"]) {
    it(`${path}: the copy of the day to a search engine's fetcher, the new one to the others that waited for it`, async () => {
      expect(await placeView(path, UA.oai, 180)).toEqual({ got: "avant", builds: 1 });
      expect(await placeView(path, UA.chatgpt, 180)).toEqual({ got: "neuve", builds: 1 });
      expect(await placeView(path, UA.personne, 180)).toEqual({ got: "avant", builds: 1 });
      expect(await placeView(path, UA.check, 180)).toEqual({ got: "neuve", builds: 1 });
      // Built yesterday (16 hours before, 23:00): never given as it is.
      expect(await placeView(path, UA.oai, 16 * 60)).toEqual({ got: "neuve", builds: 1 });
    });
  }
});
