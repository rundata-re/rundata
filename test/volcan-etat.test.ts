import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type CacheEntry, MemoryStore, TieredStore } from "../src/cache.js";
import type { Info } from "../src/providers/actualites.js";
import { parse } from "../src/providers/seismes.js";
import { activityPosts, phaseOf } from "../src/providers/volcan.js";
import { buildVolcan, VOLCAN_ETAT, volcanEtat, type VolcanAnswer } from "../src/web/data.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import { demos, homePage, type HomeLive } from "../src/web/home.js";
import { type Kv, kvKey, SharedFallback } from "../src/web/partagees.js";
import { rssItems } from "../src/web/rss.js";
import { site } from "../src/web/site.js";
import { alerteVolcan, bannerHtml, withVolcan } from "../src/web/volcan-alerte.js";
import { volcanLive } from "../src/web/volcan.js";

// Every page's banner, the home page's and the communes' tiles, their feeds and /trafic read /volcan's copy for its
// state: they read a small view of it now, and say the same.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const O = "https://rundata.re";
const NOW = new Date("2026-10-25T06:20:00Z");

const release = (titre: string): Info =>
  ({ titre, lien: "https://www.reunion.gouv.fr/x/2026-10-24", publie: "2026-10-24T08:00:00.000Z", media: "Préfecture de La Réunion", heure: false, communes: [], lieux: [], sujets: [] }) as Info;

/** The sources of /volcan's copy: quiet, or under a release of the prefecture; the OVPF's newest post an image or a text. */
function sources(titre?: string, images = false) {
  const store = new MemoryStore();
  const t = NOW.getTime();
  const posts = activityPosts(JSON.parse(fixture(images ? "ovpf_bluesky_2026-10-25.json" : "ovpf_bluesky.json")));
  void store.put("seismes", { value: parse(fixture("ipgp_seismes.txt")), fetchedAt: t });
  void store.put("volcan:ovpf", { value: posts, fetchedAt: t });
  void store.put("volcan:pitonlive", { value: JSON.parse(fixture("pitonlive_state.json")), fetchedAt: t });
  void store.put("volcan:prefecture:phase", { value: titre ? phaseOf([release(titre)]) : null, fetchedAt: t });
  return new Cache(store, () => t);
}

const STATES: [string, string | undefined, boolean][] = [
  ["calme", undefined, false],
  ["calme, la dernière publication en images", undefined, true],
  ["alerte 1", "Piton de la Fournaise : passage en alerte 1, fermeture de l’enclos", true],
  ["éruption", "Piton de la Fournaise : passage en alerte 2-1, éruption en cours dans l'enclos", false],
];

/** A KV namespace in memory, counting its reads by key. */
class FakeKv implements Kv {
  data = new Map<string, string>();
  reads = new Map<string, number>();
  async get(key: string) {
    this.reads.set(key, (this.reads.get(key) ?? 0) + 1);
    const v = this.data.get(key);
    return v ? JSON.parse(v) : null;
  }
  async put(key: string, value: string) {
    this.data.set(key, value);
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  }
}

describe("the small view of /volcan's copy", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the state whole, the earthquakes' counts, the newest post without its text, and is a fraction of the copy", async () => {
    for (const [name, titre, images] of STATES) {
      const v = await buildVolcan(sources(titre, images), NOW);
      const view = volcanEtat(v);
      expect(view.etat, name).toEqual(v.etat);
      expect(view.sources, name).toEqual(v.sources);
      expect(view.seismes?.sous_le_volcan, name).toEqual(v.seismes?.sous_le_volcan);
      expect(view.alertes_precedentes, name).toBeUndefined();
      expect(view.puis_je_monter, name).toBeUndefined();
      expect(view.publications_ovpf, name).toHaveLength(1);
      expect(view.publications_ovpf![0].texte, name).toBe("");
      // The summary only while a feed says it.
      expect(view.resume, name).toBe(titre ? v.resume : "");
      // Under a fifth of it on the quiet days, under half during an alert, the feeds' summary with it.
      expect(JSON.stringify(view).length, name).toBeLessThan(JSON.stringify(v).length / (titre ? 2 : 5));
    }
  });

  it("gives the banner, the home page, the communes' pages and feeds the same words as the whole copy", async () => {
    let alerts = 0;
    let read = 0;
    for (const [name, titre, images, ocr] of [...STATES, ["alerte 1, le texte des images lu", STATES[2][1], true, true] as const]) {
      const built = await buildVolcan(sources(titre, images), NOW);
      // The text of the images read (providers/ovpf-ocr.ts): the home page says so, without the text.
      const v = ocr ? { ...built, publications_ovpf: built.publications_ovpf!.map((p, i) => (i ? p : { ...p, texte_lu_dans_l_image: "Le volcan s'est réveillé." })) } : built;
      if (v.etat?.image_ovpf_plus_recente && v.publications_ovpf?.[0].texte_lu_dans_l_image) read++;
      const whole = { value: v, fetchedAt: NOW, stale: false };
      const view = { value: volcanEtat(v), fetchedAt: NOW, stale: false };
      const a = alerteVolcan(view.value);
      expect(a, name).toEqual(alerteVolcan(v));
      if (a) alerts++;
      expect(bannerHtml(a, "/meteo"), name).toBe(bannerHtml(alerteVolcan(v), "/meteo"));
      expect(volcanLive(view, NOW), name).toEqual(volcanLive(whole, NOW));
      expect(demos({ volcan: view } as unknown as HomeLive, NOW), name).toEqual(demos({ volcan: whole } as unknown as HomeLive, NOW));
      expect(withVolcan(a, () => homePage(O, { volcan: view } as unknown as HomeLive, NOW)), name).toBe(withVolcan(a, () => homePage(O, { volcan: whole } as unknown as HomeLive, NOW)));
      for (const c of COMMUNES) {
        expect(communePage(O, c, { place: null, volcan: view } as never, NOW), `${name}, ${c.nom}`).toBe(communePage(O, c, { place: null, volcan: whole } as never, NOW));
        expect(rssItems(c, { volcan: view } as never, NOW), `${name}, ${c.nom}`).toEqual(rssItems(c, { volcan: whole } as never, NOW));
      }
    }
    expect(alerts).toBe(3);
    expect(read).toBe(1);
  });

  it("is what every page's banner reads, never the whole copy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const c = sources(STATES[2][1]);
    await c.get("web:volcan", 300, () => buildVolcan(c, NOW));
    const store = (c as unknown as { store: MemoryStore }).store;
    const asked: string[] = [];
    const get = store.get.bind(store);
    store.get = async (key: string, freshAfter?: number) => (asked.push(key), get(key, freshAfter));
    const later = new Date(NOW.getTime() + 61_000);
    const html = await (await site(new Request(`${O}/meteo`), c, () => {}, later))!.text();
    expect(html).toContain('class="alerte volcan"');
    expect(asked).toContain(VOLCAN_ETAT);
    expect(asked).not.toContain("web:volcan");
  });

  it("follows the shared copy through KV in the data centers where the scheduled event did not write it", async () => {
    const v = await buildVolcan(sources(STATES[2][1]), NOW);
    const t = NOW.getTime();
    const kv = new FakeKv();
    const edge = new MemoryStore();
    const fallback = new SharedFallback(edge, kv, () => t);
    // KV's copy, newer than this data center's view of the quiet volcano, made an hour ago.
    await kv.put(kvKey("web:volcan"), JSON.stringify({ value: v, fetchedAt: t - 60_000 }));
    const quiet = volcanEtat(await buildVolcan(sources(), NOW));
    await edge.put(VOLCAN_ETAT, { value: quiet, fetchedAt: t - 3600_000 } as CacheEntry);
    const cache = new Cache(new TieredStore(new MemoryStore(), fallback), () => t, false);
    const got = await cache.peek<VolcanAnswer>(VOLCAN_ETAT);
    expect(got!.value).toEqual(volcanEtat(v));
    expect(got!.fetchedAt.getTime()).toBe(t - 60_000);
    expect(alerteVolcan(got!.value)?.niveau).toBe("Alerte 1");
    // Put in the data center's cache: its next isolates read it there, without KV.
    expect((await edge.get(VOLCAN_ETAT))!.value).toEqual(volcanEtat(v));
    expect([...kv.reads]).toEqual([[kvKey("web:volcan"), 1]]);
    await new Cache(new TieredStore(new MemoryStore(), fallback), () => t, false).peek(VOLCAN_ETAT);
    expect([...kv.reads]).toEqual([[kvKey("web:volcan"), 1]]);
    // An old view newer than KV's copy is kept; none in KV, the view as it is.
    const newer = { value: quiet, fetchedAt: t - 3600_000 } as CacheEntry;
    await edge.put(VOLCAN_ETAT, newer);
    await kv.put(kvKey("web:volcan"), JSON.stringify({ value: v, fetchedAt: t - 2 * 3600_000 }));
    expect(await fallback.get(VOLCAN_ETAT)).toEqual(newer);
    expect(await new SharedFallback(new MemoryStore(), new FakeKv(), () => t).get(VOLCAN_ETAT)).toBeUndefined();
  });
});
