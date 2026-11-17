import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { GIVE_UP_AFTER, RETRY_MS, gatherForCopy, thin } from "../src/eau/ile.js";
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
