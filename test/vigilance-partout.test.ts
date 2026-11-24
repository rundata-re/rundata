import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { configure } from "../src/providers/mf-auth.js";
import * as mf from "../src/providers/vigilance.js";
import { CYCLONE_LIFTED, cyclone, cycloneLevel, vigilanceMeteo, vigilanceWarnings } from "../src/tools/vigilance.js";
import { PATH as APPLI } from "../src/web/appli.js";
import { alerteOf } from "../src/web/data.js";
import { site } from "../src/web/site.js";

// Tuesday 24 November 2026, 10:00 at La Réunion.
const NOW = new Date("2026-11-24T06:00:00Z");
const at = (h: number) => new Date(Date.UTC(2026, 10, 24, h - 4)).toISOString().replace(".000", "");

/**
 * Météo-France's map as its API gives it (test/fixtures/vigilance_om.zip): 24 periods of one hour from the bulletin's
 * time, each with its end, the cyclone alert in its own codes (7 to 10, 6) and -1 when there is none.
 */
function bulletin(from: number, cycloneAt: (h: number) => number, rainSud = 1) {
  const hours = Array.from({ length: 24 }, (_, i) => from + i);
  const items = (colour: (h: number) => number) => hours.map((h) => ({ color_id: colour(h), begin_time: at(h), end_time: at(h + 1) }));
  const land = (id: string, rain: number) => ({ domain_id: id, phenomenon_items: [{ phenomenon_id: 12, timelaps_items: items(() => rain) }, { phenomenon_id: 1, timelaps_items: items(() => 1) }] });
  return mf.parse({
    update_time: at(from),
    timelaps: {
      domain_ids: [
        { domain_id: mf.ISLAND, phenomenon_items: [{ phenomenon_id: mf.CYCLONE, timelaps_items: items(cycloneAt) }] },
        ...["VIGI974-11", "VIGI974-12", "VIGI974-13", "VIGI974-15"].map((z) => land(z, 1)),
        land("VIGI974-14", rainSud),
      ],
    },
  });
}

describe("the end of a cyclone alert announced in the bulletin, as Météo-France gives it", () => {
  // Issued at 04:00: red until 08:00, then no alert (-1) to the end of the 24 hours.
  const lifted = bulletin(4, (h) => (h < 8 ? 9 : -1));
  // Issued at 04:00: pré-alerte until 09:00, then no alert.
  const preLifted = bulletin(4, (h) => (h < 9 ? 7 : -1));

  it("says the alert lifted once its hours are over, in the tools and the warnings of the other tools", async () => {
    for (const v of [lifted, preLifted]) {
      expect(cycloneLevel(v.zones[mf.ISLAND][mf.CYCLONE], NOW)).toBe(-1);
      expect(cyclone(v, NOW)).toBe(CYCLONE_LIFTED);
    }
  });

  it("takes the banner away", () => {
    for (const v of [lifted, preLifted]) expect(alerteOf(v, NOW)).toBeUndefined();
  });

  it("keeps the alert in force before its end, and an alert announced after a gap « prévue »", () => {
    expect(cyclone(lifted, new Date(at(7)))).toMatch(/^ALERTE CYCLONIQUE rouge/);
    expect(alerteOf(lifted, new Date(at(7)))).toMatchObject({ couleur: 4 });
    const later = bulletin(4, (h) => (h < 8 ? 7 : h < 18 ? -1 : 8));
    expect(cyclone(later, NOW)).toMatch(/^Alerte cyclonique prévue : orange du 24\/11 18:00/);
    expect(alerteOf(later, NOW)).toMatchObject({ couleur: 3, court: { cyclone: 3, prevue: true } });
  });
});

describe("the banner on every page of the site", () => {
  const cacheWith = (v: mf.Vigilance) => {
    const store = new MemoryStore();
    void store.put(mf.KEY, { value: v, fetchedAt: NOW.getTime() });
    return new Cache(store, () => NOW.getTime());
  };
  beforeAll(() => {
    configure({ token: "test" });
    vi.stubGlobal("fetch", async () => new Response("non", { status: 503 }));
  });
  afterAll(() => {
    configure({});
    vi.unstubAllGlobals();
  });

  it("is on the pages that need no data too: press, news, legal pages, the app, a page not found", async () => {
    const orange = bulletin(4, () => -1, 3);
    for (const path of ["/presse", "/nouveautes", "/confidentialite", "/conditions", APPLI, "/sentiers/nexiste-pas", "/meteo/nexiste-pas"]) {
      const r = (await site(new Request(`https://rundata.re${path}`), cacheWith(orange), () => {}, NOW))!;
      expect(await r.text(), path).toContain('<div class="alerte vg vg3"');
    }
  });

  it("is said by vigilance_meteo for the zone, never for the commune", async () => {
    const r = JSON.parse((await vigilanceMeteo(cacheWith(bulletin(4, () => -1, 3)), "Saint-Pierre", NOW)).content[0].text);
    expect(r.resume).toContain("zone Sud (où se trouve Saint-Pierre) : orange fortes pluies / orages");
    expect((await vigilanceWarnings(cacheWith(bulletin(4, () => -1, 3)), NOW)).lignes[0]).toBe("Vigilance Météo-France en cours : orange fortes pluies / orages (Sud). Détails avec vigilance_meteo.");
  });
});
