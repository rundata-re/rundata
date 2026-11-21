import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { counted, scheduled } from "../src/budget.js";
import { Cache, MemoryStore, TieredStore } from "../src/cache.js";
import { getJson, SITE_SPACING_MS, siteSpacing, spacedSite } from "../src/http.js";
import { lecture } from "../src/providers/avis-eau.js";
import "../src/providers/coupures-courant.js";
import { refreshPlanned } from "../src/tools/agenda.js";
import { buildCourant } from "../src/web/data.js";

// A commune's site read slowly (rule of 20/11/2026: one request a minute at most), whichever of its sources asks: its
// water notices, its power cuts, its news. On 20/11/2026 Cilaos's site answered 429; that day five pages had read its
// water notices within ten seconds, each from its own isolate, and the scheduled event had read two of its sources in
// the same second.

const fixture = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
const CILAOS = "ville-cilaos.fr";
const NOW = new Date("2026-11-21T06:00:00Z");

// Each request's site and time; Cilaos's water and news from their recordings, its power cuts none, the rest silent.
let asked: { host: string; url: string; at: number }[] = [];
const answer = async (url: string) => {
  const u = new URL(url);
  asked.push({ host: u.hostname, url, at: Date.now() });
  const posts = u.pathname.startsWith("/wp-json/wp/v2/");
  if (u.hostname === CILAOS && posts && u.searchParams.get("search") === "eau") return new Response(fixture("avis-eau/cilaos.json"));
  if (u.hostname === CILAOS && posts && u.searchParams.get("categories") === "17") return new Response(fixture("agenda/actus_cilaos.json"));
  if (posts) return new Response("[]");
  return new Response("", { status: 503 });
};
const toCilaos = () => asked.filter((a) => a.host === CILAOS);

// Two isolates of one data center: each its own memory, the data center's cache shared (worker.ts).
const dataCenter = (clock: () => number = Date.now) => {
  const shared = new MemoryStore();
  return () => new Cache(new TieredStore(new MemoryStore(), shared), clock, false);
};
const inEvent = async <T>(work: () => Promise<T>) => (await counted(1000, () => (scheduled(), work()))).value;

describe("a commune's site, read slowly whoever asks", () => {
  beforeEach(() => {
    asked = [];
    vi.stubGlobal("fetch", answer);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    siteSpacing.ms = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is read by two sources at least, and so spaced: Cilaos's, Saint-Philippe's; a distributor's own site is not", () => {
    expect(spacedSite(`https://${CILAOS}/`)).toBe(true);
    expect(spacedSite("https://saintphilippe.re/")).toBe(true);
    expect(spacedSite("https://lacreole.re/flash-infos")).toBe(false);
  });

  it("two pages at once without a copy of the water notices: one reads the sites, the other is told it is under way", async () => {
    const isolate = dataCenter();
    const [a, b] = await Promise.allSettled([inPage(() => lecture(isolate())), inPage(() => lecture(isolate()))]);
    expect(toCilaos()).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    const refused = [a, b].find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(String(refused.reason)).toContain("lecture déjà en cours ailleurs");
  });

  it("the pages serve the copy the scheduled event read, however old, with its time, and ask no site", async () => {
    let t = NOW.getTime() - 40 * 60_000;
    const isolate = dataCenter(() => t);
    await inEvent(() => lecture(isolate()));
    const read = asked.length;
    t = NOW.getTime();
    const [a, b] = await Promise.all([inPage(() => lecture(isolate())), inPage(() => lecture(isolate()))]);
    expect(asked).toHaveLength(read);
    expect(a.fetchedAt).toEqual(new Date(NOW.getTime() - 40 * 60_000));
    expect(b.fetchedAt).toEqual(a.fetchedAt);
    // The scheduled event reads them again, once 15 minutes old.
    await inEvent(() => lecture(isolate()));
    expect(toCilaos()).toHaveLength(2);
  });

  it("two pages at once without a copy of the power cuts: one reads the mairies' sites, once each", async () => {
    const isolate = dataCenter();
    const [a, b] = await Promise.allSettled([inPage(() => buildCourant(isolate())), inPage(() => buildCourant(isolate()))]);
    expect(toCilaos()).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("in the scheduled event, a spaced site's requests go the spacing apart, whichever source asks; another site's at once", async () => {
    siteSpacing.ms = 300;
    await inEvent(() =>
      Promise.all([
        getJson("avis_eau", `https://${CILAOS}/wp-json/wp/v2/posts?search=eau`).catch(() => undefined),
        getJson("mairies_edf", `https://${CILAOS}/wp-json/wp/v2/posts?search=%C3%A9lectri`).catch(() => undefined),
        getJson("avis_eau", "https://lacreole.re/flash-infos").catch(() => undefined),
      ]),
    );
    const [first, second] = toCilaos();
    expect(second.at - first.at).toBeGreaterThanOrEqual(290);
    expect(asked.find((a) => a.host === "lacreole.re")!.at - first.at).toBeLessThan(100);
    // At a question, nothing waits: the pages serve the copies, not the sites.
    asked = [];
    await inPage(() => Promise.all([getJson("avis_eau", `https://${CILAOS}/a`).catch(() => undefined), getJson("mairies_edf", `https://${CILAOS}/b`).catch(() => undefined)]));
    const [x, y] = toCilaos();
    expect(y.at - x.at).toBeLessThan(100);
  });

  it("Cilaos's news, due as its site was just read in the event, waits for the next event, never two in a row", async () => {
    let t = NOW.getTime();
    const store = new MemoryStore();
    const at = () => new Cache(store, () => t);
    await inEvent(() => refreshPlanned(at(), new Date(t)));
    expect(toCilaos()).toHaveLength(1);
    siteSpacing.ms = 300;
    // An hour on, the water read Cilaos's site just before: its news reported.
    t += 60 * 60_000 + 10_000;
    asked = [];
    const first = await inEvent(async () => {
      await getJson("avis_eau", `https://${CILAOS}/wp-json/wp/v2/posts?search=eau`);
      return refreshPlanned(at(), new Date(t));
    });
    expect(first.reportes).toContain("cilaos");
    expect(toCilaos()).toHaveLength(1);
    // The next event, five minutes on, the same: read this time, after its turn.
    t += 5 * 60_000;
    asked = [];
    const next = await inEvent(async () => {
      await getJson("avis_eau", `https://${CILAOS}/wp-json/wp/v2/posts?search=eau`);
      return refreshPlanned(at(), new Date(t));
    });
    expect(next.lus).toContain("cilaos");
    const [water, news] = toCilaos();
    expect(new URL(news.url).searchParams.get("categories")).toBe("17");
    expect(news.at - water.at).toBeGreaterThanOrEqual(290);
  }, 30_000);

  it("is a minute by default", () => {
    expect(SITE_SPACING_MS).toBe(60_000);
  });
});

// A page's invocation, not the scheduled event's.
async function inPage<T>(work: () => Promise<T>): Promise<T> {
  return (await counted(1000, work)).value;
}
