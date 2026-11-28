import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type CacheEntry, type CacheStore, MemoryStore } from "../src/cache.js";
import { KV_KEEP_SECONDS } from "../src/kv.js";
import type { Info } from "../src/providers/actualites.js";
import * as copie from "../src/providers/prefecture-copie.js";
import { PHASE_KEEP_SECONDS, phase } from "../src/providers/volcan.js";
import { dansLeWorker, horsWorker } from "./contexte.js";

// 20/11/2026: the prefecture's latest 20 releases without a phase since the 17th, the phase kept for 3 days lost, the
// level said « à vérifier sur reunion.gouv.fr » on /volcan and in volcan_seismes.
const DAY = 24 * 3600_000;
const T0 = Date.parse("2026-11-17T06:00:00Z");
const LIEN = "https://www.reunion.gouv.fr/Actualites/Communiques-de-presse/Retour-en-phase-de-vigilance";

/** The durable store (the Worker's KV): a key forgotten `keepSeconds` after it was written, as kv.ts asks. */
class ExpiringStore implements CacheStore {
  private entries = new Map<string, { entry: CacheEntry; until: number }>();
  constructor(private clock: () => number) {}
  async get(key: string) {
    const e = this.entries.get(key);
    return e && this.clock() < e.until ? e.entry : undefined;
  }
  async put(key: string, entry: CacheEntry, keepSeconds = KV_KEEP_SECONDS) {
    this.entries.set(key, { entry, until: this.clock() + keepSeconds * 1000 });
  }
}

const release = (titre: string, jour: string, lien = `https://www.reunion.gouv.fr/${encodeURIComponent(titre)}`) =>
  ({ titre, lien, publie: new Date(`${jour}T12:00:00+04:00`).toISOString(), media: "Préfecture de La Réunion", heure: false, communes: [], lieux: [], sujets: [] }) as unknown as Info;

const VIGILANCE = release("Piton de la Fournaise : retour en phase de vigilance, réouverture partielle de l’enclos", "2026-10-26");
const OTHERS = Array.from({ length: 20 }, (_, i) => release(`Sécurité routière : bilan de la semaine ${i}`, "2026-11-18"));

/** An isolate at `t`: its memory and the data center's cache empty, the prefecture's list as given, fresh. */
function isolate(durable: CacheStore, t: number, liste: Info[]) {
  const store = new MemoryStore();
  void store.put("prefecture:communiques:rubrique", { value: { liste }, fetchedAt: t });
  return new Cache(store, () => t, true, durable);
}

afterEach(() => {
  horsWorker();
  vi.unstubAllGlobals();
});

describe("the ORSEC phase once no release of the prefecture's list declares one (providers/volcan.ts `phase`)", () => {
  it("is still known 4 days later: it is kept for years, not for the durable store's 3 days", async () => {
    expect(PHASE_KEEP_SECONDS).toBeGreaterThan(365 * 24 * 3600);
    let t = T0;
    const durable = new ExpiringStore(() => t);
    expect((await phase(isolate(durable, t, [VIGILANCE]), t)).value).toMatchObject({ niveau: "Vigilance", enclos: "partiel" });
    await new Promise((r) => setTimeout(r, 0));
    // The release leaves the list; 4 days after, a new isolate.
    vi.stubGlobal("fetch", async (url: string) => {
      throw new Error(`unexpected ${url}`);
    });
    t = T0 + 4 * DAY;
    const p = await phase(isolate(durable, t, OTHERS), t);
    expect(p.value).toMatchObject({ niveau: "Vigilance", enclos: "partiel", jour: "2026-10-26" });
  });

  it("comes back from the collector's record of the alerts when the phase kept is lost, its page's words read", async () => {
    const t = T0 + 4 * DAY;
    const releve: copie.ReleveEntree[] = [
      { jour: "2026-10-24", titre: "Piton de la Fournaise : passage en alerte 1, fermeture de l’enclos", lien: "https://www.reunion.gouv.fr/alerte-1", niveau: "Alerte 1", releve_le: "2026-11-05T03:25:08.000Z" },
      { jour: "2026-10-26", titre: "Retour en phase de vigilance", lien: LIEN, niveau: "Vigilance", releve_le: "2026-11-05T03:25:08.000Z" },
    ];
    const liste = OTHERS.map((r) => ({ ...r, publie: new Date(t - 3600_000).toISOString() }));
    dansLeWorker({
      [copie.KV_KEY]: { liste, releve, lu_le: new Date(t - 5 * 60_000).toISOString() },
      [copie.pageKey(LIEN)]: { page: { titre: "Piton de la Fournaise : réouverture partielle de l’enclos", phrases: ["Le préfet a décidé le retour en phase de vigilance."] }, lu: t - DAY },
    });
    const durable = new ExpiringStore(() => t);
    const p = await phase(new Cache(new MemoryStore(), () => t, true, durable), t);
    expect(p.value).toMatchObject({ niveau: "Vigilance", enclos: "partiel", jour: "2026-10-26", lien: LIEN });
    // Kept again, for years.
    await new Promise((r) => setTimeout(r, 0));
    expect((await durable.get("volcan:prefecture:derniere-phase"))?.value).toMatchObject({ niveau: "Vigilance", lien: LIEN });
  });
});
