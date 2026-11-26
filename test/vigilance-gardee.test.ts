import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { configure } from "../src/providers/mf-auth.js";
import * as mf from "../src/providers/vigilance.js";
import { alerte, vigilanceNow, BANNER_WAIT_MS } from "../src/web/data.js";
import { communePage } from "../src/web/commune.js";
import { homePage } from "../src/web/home.js";
import { pageOf } from "../src/web/places.js";
import { unzip } from "../src/zip.js";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const NOW = new Date("2026-10-26T00:10:00Z");
const ORIGIN = "https://rundata.re";
const WAIT = `<p class="td all">Se met à jour : rechargez la page dans quelques secondes.</p>`;

async function yellow(): Promise<mf.Vigilance> {
  const zip = fixture("vigilance_om.zip");
  const files = await unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, (n) => n.endsWith("_FMEE_.txt"));
  const v = mf.parse(JSON.parse(files.get("CDPV95_FMEE_.txt")!), JSON.parse(files.get("CDPV96_FMEE_.txt")!));
  v.zones[mf.ISLAND][mf.CYCLONE] = [];
  v.zones["VIGI974-12"][12] = [{ couleur: 2, debut: "2026-10-25T00:00:00Z" }];
  return v;
}

const vigilanceTile = (page: string) => page.match(/<li class="tile k-vigilance[^"]*">(.*?)<\/li>/s)![1];
// A commune's tiles have no category class: the one that leads to /vigilance.
const communeTile = (page: string) => page.match(/<li class="tile">(?:(?!<\/li>).)*?href="\/vigilance">Vigilance<\/a>.*?<\/li>/s)![0];
const banner = (page: string) => page.match(/<div class="alerte vg[^>]*>(.*?)<\/div><\/div>/s)?.[1];

beforeEach(() => {
  // The waits are the code's own (BANNER_WAIT_MS, Météo-France 300 ms later still): on a fake clock, moved on by `late`,
  // rather than 1.8 s of the machine's for each page.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  configure({ applicationId: "test" });
  // Météo-France answers, but later than a page waits for it.
  vi.stubGlobal("fetch", async (url: string) => {
    if (String(url).includes("/token")) return Response.json({ access_token: "t", expires_in: 3600 });
    await new Promise((resolve) => setTimeout(resolve, BANNER_WAIT_MS + 300));
    return new Response(fixture("vigilance_om.zip"));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  configure({});
});

/** The vigilance as a page gets it while Météo-France is late, with the last reading kept `ageMin` minutes ago. */
async function late(ageMin?: number) {
  const store = new MemoryStore();
  if (ageMin != null) await store.put(mf.KEY, { value: await yellow(), fetchedAt: NOW.getTime() - ageMin * 60_000 });
  const cache = new Cache(store, () => NOW.getTime(), false);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const pending: Promise<unknown>[] = [];
  const background = (p: Promise<unknown>) => void pending.push(p);
  const both = Promise.all([vigilanceNow(cache, background, BANNER_WAIT_MS, NOW), alerte(cache, background, NOW)]);
  // The pages' wait, then Météo-France's late answer.
  await vi.advanceTimersByTimeAsync(BANNER_WAIT_MS + 300);
  const [v, a] = await both;
  await Promise.all(pending);
  const home = homePage(ORIGIN, { meteo: null, vigilance: v }, NOW, a);
  const commune = communePage(ORIGIN, pageOf("saint-benoit")!, { place: null, vigilance: v }, NOW, a);
  return { v, a, tile: vigilanceTile(home), banner: banner(home), commune: communeTile(commune), logs: warn.mock.calls.map((c) => String(c[0])) };
}

/** The banner's line on a phone and its sentence on wider screens, with what follows them. */
const said = (after: string) => [
  `<span class="txt">Météo-France : vigilance jaune pluies-orages <span class="nw">· Est</span>${after}</span>`,
  `<span>⚠ Vigilance Météo-France : jaune fortes pluies / orages (Est).${after}</span>`,
];

describe("the vigilance while Météo-France is late", () => {
  it("serves the last reading kept within 15 min without waiting for Météo-France, read again after the answer", async () => {
    const store = new MemoryStore();
    await store.put(mf.KEY, { value: await yellow(), fetchedAt: NOW.getTime() - 10 * 60_000 });
    const cache = new Cache(store, () => NOW.getTime(), false);
    let served: unknown;
    // In a Worker's invocation, kept alive for the read (its waitUntil).
    const kept: Promise<unknown>[] = [];
    const page = counted(50, () => vigilanceNow(cache, () => {}, BANNER_WAIT_MS, NOW), (w) => void kept.push(w)).then((r) => (served = r.value));
    await vi.advanceTimersByTimeAsync(1);
    await page;
    expect(served).toMatchObject({ stale: true, fetchedAt: new Date(NOW.getTime() - 10 * 60_000) });
    expect(kept).toHaveLength(1);
    // Météo-France's answer, after the page's: kept for the next views.
    await vi.advanceTimersByTimeAsync(BANNER_WAIT_MS + 300);
    await vi.waitFor(async () => expect((await store.get(mf.KEY))!.fetchedAt).toBe(NOW.getTime()));
    // Past 15 min, the page waits for it as before (below), and says the reading's time.
  });

  it("serves the last reading kept, without its time within 15 min: tile and banner", async () => {
    const { v, a, tile, banner, logs } = await late(10);
    expect(v?.stale).toBe(true);
    // No page waited for Météo-France: no line.
    expect(logs).toHaveLength(0);
    expect(v?.fetchedAt).toEqual(new Date(NOW.getTime() - 10 * 60_000));
    expect(a?.texte).toBe("Vigilance Météo-France : jaune fortes pluies / orages (Est).");
    expect(a?.lue).toBeUndefined();
    expect(tile).toContain(`<p class="td all">fortes pluies / orages (Est). <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
    for (const s of said("")) expect(banner).toContain(s);
    // Then the link to Météo-France's own site.
    expect(banner).toContain(`Voir la vigilance zone par zone →</a> <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a>`);
  });

  it("says when the reading kept was read beyond 15 min, in full on a phone", async () => {
    const { a, tile, banner, commune } = await late(30);
    expect(a?.lue).toBe("lue le 26/10 à 03:40");
    expect(tile).toContain(`<p class="td all">fortes pluies / orages (Est) · lue le 26/10 à 03:40. <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
    expect(commune).toContain(`<p class="td all">Saint-Benoît est dans cette zone de Météo-France · lue le 26/10 à 03:40. <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
    expect(commune).toContain(`<p class="tv">Zone Est : <span class="vg vg2">jaune</span> fortes pluies / orages</p>`);
    for (const s of said(" · lue le 26/10 à 03:40")) expect(banner).toContain(s);
  });

  it("says Météo-France has not answered since, beyond an hour, however old the reading kept", async () => {
    const { v, tile, banner, logs } = await late(120);
    expect(v?.stale).toBe(true);
    expect(logs[0]).toMatch(/^source mf_vigilance trop lente : lecture gardée du 26\/10 02:10 servie, lue après/);
    expect(tile).toContain(`<p class="td all">fortes pluies / orages (Est) · lue le 26/10 à 02:10, sans réponse depuis. <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
    for (const s of said(" · lue le 26/10 à 02:10, sans réponse depuis")) expect(banner).toContain(s);
    // Read another day: the day too.
    expect((await late(26 * 60)).tile).toContain(` · lue le 25/10 à 02:10, sans réponse depuis. <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
  });

  it("says the time of the last reading kept when Météo-France fails, not only when it is late", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).includes("/token") ? Response.json({ access_token: "t", expires_in: 3600 }) : new Response("", { status: 503 }));
    const { v, tile, banner } = await late(180);
    expect(v?.stale).toBe(true);
    expect(tile).toContain(` · lue le 26/10 à 01:10, sans réponse depuis. <a href="https://vigilance.meteofrance.fr/fr/la-reunion" rel="noopener">Consulter le site officiel de Météo-France</a></p>`);
    for (const s of said(" · lue le 26/10 à 01:10, sans réponse depuis")) expect(banner).toContain(s);
  });

  it("says it is updating when nothing was kept", async () => {
    const { v, a, tile, banner } = await late();
    expect(v).toBeNull();
    expect(a).toBeUndefined();
    expect(banner).toBeUndefined();
    expect(tile).toContain(WAIT);
  });
});
