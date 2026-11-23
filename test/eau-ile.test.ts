import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { GIVE_UP_AFTER, RETRY_MS, gatherForCopy, keep, oldestRead, parseCopy, thin, type Ile } from "../src/eau/ile.js";
import { INSEE } from "../src/places/insee.js";
import type { Cached } from "../src/cache.js";
import type { EauAnswer } from "../src/web/data.js";
import { eauPage } from "../src/web/domains.js";
import { SITES, SOURCE } from "../src/providers/baignades.js";

const fixture = (f: string, enc: BufferEncoding = "utf8") => readFileSync(new URL(`./fixtures/eau/${f}`, import.meta.url), enc);

const NOW = new Date("2026-11-17T00:20:00Z");
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());

/** The ARS's site: every site answers with the fixture's page, or fails while `down` says so; Hub'Eau answers a commune with nothing. */
function stub(down: () => boolean) {
  const ars: string[] = [];
  let inFlight = 0;
  let most = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    if (u.hostname !== "baignades.sante.gouv.fr") return new Response(JSON.stringify({ count: 0, data: [] }), { headers: { "content-type": "application/json" } });
    ars.push(url);
    most = Math.max(most, ++inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      if (down()) return new Response("", { status: 503 });
      return new Response(fixture(`baignade_974000709_${u.searchParams.get("annee")}.html`, "latin1"), { headers: { "content-type": "text/html; charset=ISO-8859-1" } });
    } finally {
      inFlight--;
    }
  });
  return { ars, most: () => most };
}

describe("the island's water for the workflow's copy (scripts/eau-ile.ts)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the ARS's site four pages at a time, and needs no new try when it answers", async () => {
    const s = stub(() => false);
    const log: string[] = [];
    const ile = await gatherForCopy(cache(), { waitMs: 0, log: (l) => log.push(l), now: () => NOW });
    expect(ile.baignades).toHaveLength(SITES.length);
    expect(s.ars).toHaveLength(2 * SITES.length);
    expect(s.most()).toBeLessThanOrEqual(4);
    expect(log.filter((l) => l.includes("baignade"))).toEqual([]);
    expect(log.some((l) => l.includes("nouvel essai"))).toBe(false);
  });

  it("says the ARS's first error, stops after the first sites that all fail, and tries once more, reading only what failed", async () => {
    let down = true;
    const s = stub(() => down);
    const log: string[] = [];
    const waited = vi.fn();
    // The cache remembers a failure a minute: the new try, 3 min later, asks again.
    let clock = NOW.getTime();
    const ile = await gatherForCopy(new Cache(new MemoryStore(), () => clock), {
      waitMs: 0,
      log: (l) => {
        log.push(l);
        if (l.includes("nouvel essai")) { waited(); down = false; clock += RETRY_MS; }
      },
      now: () => new Date(clock),
    });
    expect(waited).toHaveBeenCalledTimes(1);
    expect(log[0]).toMatch(new RegExp(`^${SOURCE.id} : première erreur \\(${SITES[0].nom}\\) : UpstreamError 503, HTTP 503, après \\d+ ms$`));
    expect(log).toContain(`${SOURCE.id} : les ${GIVE_UP_AFTER} premiers sites n'ont pas répondu, les ${SITES.length - GIVE_UP_AFTER} autres ne sont pas lus`);
    expect(log).toContain(`seulement 0 sites de baignade sur ${SITES.length} : nouvel essai dans 0 s`);
    // The first try: two pages for each of the first sites, and their second tries (results() asks twice).
    const firstTry = s.ars.length - 2 * SITES.length;
    expect(firstTry).toBe(2 * 2 * GIVE_UP_AFTER);
    expect(ile.baignades).toHaveLength(SITES.length);
    expect(thin(ile)).toBeUndefined();
  });

  it("reads every site when the ARS's site answers, even « not found » for the first ones", async () => {
    const s = stub(() => false);
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      if (u.hostname === "baignades.sante.gouv.fr" && SITES.slice(0, GIVE_UP_AFTER).some((x) => u.searchParams.get("site") === x.id)) {
        s.ars.push(url);
        return new Response("", { status: 404 });
      }
      if (u.hostname !== "baignades.sante.gouv.fr") return new Response(JSON.stringify({ count: 0, data: [] }), { headers: { "content-type": "application/json" } });
      s.ars.push(url);
      return new Response(fixture(`baignade_974000709_${u.searchParams.get("annee")}.html`, "latin1"), { headers: { "content-type": "text/html; charset=ISO-8859-1" } });
    });
    const log: string[] = [];
    const ile = await gatherForCopy(cache(), { waitMs: 0, log: (l) => log.push(l), now: () => NOW });
    expect(ile.baignades).toHaveLength(SITES.length - GIVE_UP_AFTER);
    expect(log.some((l) => l.includes("ne sont pas lus") || l.includes("nouvel essai"))).toBe(false);
  });

  it("fails as before when the new try is thin too, with the sentence the workflow throws", async () => {
    const s = stub(() => true);
    const log: string[] = [];
    let clock = NOW.getTime();
    const ile = await gatherForCopy(new Cache(new MemoryStore(), () => clock), {
      waitMs: 0,
      log: (l) => { log.push(l); if (l.includes("nouvel essai")) clock += RETRY_MS; },
      now: () => new Date(clock),
    });
    // Both tries stop after the first sites.
    expect(s.ars).toHaveLength(2 * 2 * 2 * GIVE_UP_AFTER);
    expect(log.filter((l) => l.includes("nouvel essai"))).toHaveLength(1);
    expect(thin(ile)).toBe(`seulement 0 sites de baignade sur ${SITES.length}`);
  });
});

// 22-23/11/2026: the ARS's site silent five runs in a row, each run failed, and the tap water read from Hub'Eau was not
// written either. A source that does not answer is neither gone nor empty: its half of the stored copy is kept.
describe("what the workflow writes when a source does not answer (ile.ts keep)", () => {
  const sites = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ site: `${tag} ${i}`, commune: "Saint-Paul" }) as unknown as Ile["baignades"][number]);
  const communes = (n: number, tag: string) => Object.keys(INSEE).slice(0, n).map((c) => ({ commune: c, reseaux: 1, analyses_6_mois: 1, non_conformes_6_mois: 0, a_surveiller: [], tag }) as unknown as Ile["communes"][number]);
  const ALL_SITES = SITES.length;
  const ALL_COMMUNES = Object.keys(INSEE).length;
  const before: Ile = { lu: "2026-11-22T14:20:00.000Z", baignades: sites(ALL_SITES, "avant"), communes: communes(ALL_COMMUNES, "avant") };
  const at = "2026-11-23T00:20:00.000Z";

  it("writes a full gathering as it is", () => {
    const fresh: Ile = { lu: at, baignades: sites(ALL_SITES, "neuf"), communes: communes(ALL_COMMUNES, "neuf") };
    expect(keep(fresh, before)).toEqual({ ile: fresh, warnings: [] });
  });

  it("keeps the earlier bathing sites with their time, and writes the tap water read now, the ARS silent", () => {
    const fresh: Ile = { lu: at, baignades: [], communes: communes(ALL_COMMUNES, "neuf") };
    const { ile, warnings, fail } = keep(fresh, before);
    expect(fail).toBeUndefined();
    expect(ile).toEqual({ lu: at, baignades: before.baignades, baignades_lu: before.lu, communes: fresh.communes });
    expect(oldestRead(ile!)).toBe(before.lu);
    expect(warnings).toEqual([`seulement 0 sites de baignade sur ${ALL_SITES} : ceux de la copie du ${before.lu} sont gardés, l'eau du robinet est écrite`]);
    // Silent again at the next run: the sites keep the time they were read, not that of the copy that carried them.
    const next = keep({ lu: "2026-11-23T06:20:00.000Z", baignades: [], communes: communes(ALL_COMMUNES, "neuf") }, ile!);
    expect(next.ile!.baignades_lu).toBe(before.lu);
  });

  it("keeps the earlier tap water with its time, Hub'Eau silent, and writes the bathing sites", () => {
    const { ile, warnings } = keep({ lu: at, baignades: sites(ALL_SITES, "neuf"), communes: communes(3, "neuf") }, before);
    expect(ile).toMatchObject({ lu: at, communes: before.communes, communes_lu: before.lu });
    expect(ile!.baignades[0].site).toBe("neuf 0");
    expect(warnings[0]).toContain(`seulement 3 communes sur ${ALL_COMMUNES}`);
  });

  it("writes nothing when neither source answered, the stored copy staying, and fails only without one", () => {
    const fresh: Ile = { lu: at, baignades: [], communes: [] };
    const { ile, warnings, fail } = keep(fresh, before);
    expect(ile).toBeUndefined();
    expect(fail).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(keep(fresh, null)).toEqual({ warnings: [], fail: `seulement 0 sites de baignade sur ${ALL_SITES}, et aucune copie gardée` });
    // One source answered, no copy: what was read is written.
    expect(keep({ lu: at, baignades: [], communes: communes(ALL_COMMUNES, "neuf") }, null).ile).toBeDefined();
  });

  it("reads the stored copy from wrangler's output, and nothing else as one", () => {
    expect(parseCopy(`\n${JSON.stringify(before)}\n`)).toEqual(before);
    expect(parseCopy("Value not found")).toBeNull();
    expect(parseCopy(undefined)).toBeNull();
    expect(parseCopy('{"lu":"x"}')).toBeNull();
  });

  it("says on /eau the time of the half kept, as the ARS's or Hub'Eau's silence", () => {
    const page = (v: Partial<Ile>) => eauPage("https://rundata.re", { value: { lu: at, baignades: [], communes: [], a_savoir: {}, sources: [], ...v }, fetchedAt: new Date(at), stale: false } as unknown as Cached<EauAnswer>, new Date(at)).replace(/&#39;/g, "'");
    expect(page({ baignades_lu: before.lu })).toContain("Le site de l'ARS n'a pas répondu à la dernière lecture\u00a0: résultats des plages et bassins lus le 22/11 à 18:20.");
    expect(page({ communes_lu: before.lu })).toContain("Hub'Eau n'a pas répondu à la dernière lecture\u00a0: analyses de l'eau du robinet rassemblées le 22/11 à 18:20.");
    const both = page({});
    expect(both).not.toContain("n'a pas répondu à la dernière lecture");
    // In Réunion's time: 00:20 UTC is 04:20 on the 23rd.
    expect(both).toContain("Analyses rassemblées le 23/11 à 04:20.");
  });
});
