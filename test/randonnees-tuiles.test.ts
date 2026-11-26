import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { buildRandonnees, RANDONNEES_TUILES, randonneesTuiles, type RandonneesAnswer } from "../src/web/data.js";
import { COMMUNES, communePage } from "../src/web/commune.js";
import { hikesAround } from "../src/web/liens.js";
import { PAGES } from "../src/web/places.js";
import { rssItems } from "../src/web/rss.js";

// The weather pages and the communes' tiles and feeds read /randonnees's copy for a few fields: they read a small view
// of it now, the map's lines left out, and say the same.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/onf/${f}`, import.meta.url), "utf8");
const O = "https://rundata.re";
const NOW = new Date("2026-10-24T04:00:00Z");
const cache = (store = new MemoryStore()) => new Cache(store, () => NOW.getTime());

describe("the small view of the hikers' page's copy", () => {
  let full: RandonneesAnswer;
  beforeEach(async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("/5/query") ? "sentiers.json" : url.includes("/4/query") ? "routes.json" : "couche.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
    full ??= await buildRandonnees(cache(), NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves out the map's lines, the cloud sea, each trail's hikes and the trails without a state, and is less than half the copy", () => {
    const v = randonneesTuiles({ ...full, hauts: [{ nom: "Maïdo" } as never] });
    expect(v.lignes).toEqual([]);
    expect(v.hauts).toBeUndefined();
    expect(v.secteurs.flatMap((z) => z.sentiers).every((t) => t.randonnees.length === 0 && t.etat !== "inconnu")).toBe(true);
    expect(v.secteurs.flatMap((z) => z.sentiers).length).toBe(full.secteurs.flatMap((z) => z.sentiers).filter((t) => t.etat !== "inconnu").length);
    expect(v.randonnees).toEqual(full.randonnees);
    expect(JSON.stringify(v).length).toBeLessThan(JSON.stringify(full).length / 2);
  });

  it("gives the communes' pages and feeds and the weather pages the same words as the whole copy", () => {
    const whole = { value: full, fetchedAt: NOW, stale: false };
    const view = { value: randonneesTuiles(full), fetchedAt: NOW, stale: false };
    for (const c of COMMUNES) {
      expect(communePage(O, c, { place: null, randonnees: view } as never, NOW), c.nom).toBe(communePage(O, c, { place: null, randonnees: whole } as never, NOW));
      expect(rssItems(c, { randonnees: view } as never, NOW), c.nom).toEqual(rssItems(c, { randonnees: whole } as never, NOW));
    }
    let near = 0;
    for (const p of PAGES) {
      const said = hikesAround(p, whole);
      if (said.includes("/randonnees/")) near++;
      expect(hikesAround(p, view), p.slug).toBe(said);
    }
    expect(near).toBeGreaterThan(5);
  });

  it("is written with the copy, its time and cost with it, and again with each newer copy", async () => {
    const store = new MemoryStore();
    const c = cache(store);
    const fresh = 300;
    await c.get("web:randonnees", fresh, async () => full);
    const copy = (await c.peek<RandonneesAnswer>("web:randonnees"))!;
    const view = (await c.peek<RandonneesAnswer>(RANDONNEES_TUILES))!;
    expect(view.value).toEqual(randonneesTuiles(full));
    expect(view.fetchedAt).toEqual(copy.fetchedAt);
    expect(view.cost).toBe(copy.cost);
    // A newer copy, a newer view; a copy its view cannot be made of keeps the copy, never a broken view.
    const later = new Cache(store, () => NOW.getTime() + 600_000);
    await later.get("web:randonnees", fresh, async () => ({ ...full, fermes: full.fermes + 1 }));
    expect((await later.peek<RandonneesAnswer>(RANDONNEES_TUILES))!.value.fermes).toBe(full.fermes + 1);
    const odd = new Cache(store, () => NOW.getTime() + 1_200_000);
    await odd.get("web:randonnees", fresh, async () => ({}) as RandonneesAnswer);
    expect((await odd.peek("web:randonnees"))!.value).toEqual({});
    expect((await odd.peek<RandonneesAnswer>(RANDONNEES_TUILES))!.value.fermes).toBe(full.fermes + 1);
  });

  it("is what a commune's page and a weather page read, never the whole copy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const store = new MemoryStore();
    const asked: string[] = [];
    const get = store.get.bind(store);
    store.get = async (key: string) => (asked.push(key), get(key));
    const c = cache(store);
    await c.get("web:randonnees", 3600, async () => full);
    asked.length = 0;
    const commune = await (await handle(new Request(`${O}/communes/cilaos`), c)).text();
    const meteo = await (await handle(new Request(`${O}/meteo/cilaos`), c)).text();
    expect(asked).toContain(RANDONNEES_TUILES);
    expect(asked).not.toContain("web:randonnees");
    // And the state of the hikes, from it.
    expect(commune).toContain("Randonnée à Cilaos");
    expect(meteo).toMatch(/Randonner autour de Cilaos[\s\S]*class="q-(bonne|mauvaise|none)"/);
  });
});
