import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { withLectures } from "../src/lectures.js";
import { SOURCES } from "../src/providers/terrain.js";
import { ficheLieu } from "../src/tools/terrain.js";

// The answers of 23/10/2026 for 7 rue de la Buse, Saint-Paul (terrain.test.ts), one source made slow or down.
const raw = (f: string) => readFileSync(new URL(`./fixtures/terrain/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-23T05:00:00Z");
const ADRESSE = "7 rue de la Buse, Saint-Paul";
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// The call's deadline for copies, kept short here: the bound is this plus 3 s (lectures.ts).
const WAIT_MS = 200;
// A source without a copy answering in 6 s: past WAIT_MS + 3 s.
const SLOW_MS = 6_000;

let slow: RegExp | undefined;
let down: RegExp | undefined;

beforeEach(() => {
  slow = down = undefined;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (url: string) => {
    const u = String(url);
    if (slow?.test(u)) await new Promise((r) => setTimeout(r, SLOW_MS));
    if (down?.test(u)) return new Response("", { status: 503 });
    if (u.includes("geo-dvf")) return u.includes("/2024/") ? new Response(raw("geo-dvf.csv")) : new Response("", { status: 404 });
    const f = u.includes("assiette-sup") ? "sup.json" : u.includes("catnat") ? "catnat.json" : u.includes("api/v1/mvt") ? "mvt.json"
      : u.includes("geocodage") ? "geocode.json" : u.includes("cadastre") ? "parcelle.json" : u.includes("zone-urba") ? "zone.json"
      : u.includes("altimetrie") ? "alti.json" : u.includes("dvf") ? "dvf.json" : null;
    if (!f) return new Response("", { status: 404 });
    return new Response(raw(f));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function timed(inCall = true, adresse = ADRESSE) {
  const cache = new Cache(new MemoryStore(), () => NOW.getTime());
  const t = Date.now();
  const r = inCall ? (await withLectures(() => ficheLieu(cache, adresse, NOW), WAIT_MS)).value : await ficheLieu(cache, adresse, NOW);
  return { r, b: body(r), took: Date.now() - t };
}

describe("fiche_terrain: a source without a copy, bounded within a tool call", { timeout: 20_000 }, () => {
  it("answers without the cadastre past the call's deadline plus 3 s, and names it in non_inclus", async () => {
    slow = /cadastre/;
    const { b, took } = await timed();
    expect(took).toBeLessThan(WAIT_MS + 3_000 + 700);
    expect(b.non_inclus).toEqual([expect.objectContaining({ partie: "parcelle cadastrale", source: SOURCES.cadastre.nom, raison: expect.stringMatching(/^pas de réponse en 3 s/) })]);
    // The rest of the fiche given: the PLU's zone, the altitude, the market.
    expect(b.urbanisme.zone).toBeTruthy();
    expect(b.altitude_m).toEqual(expect.any(Number));
    expect(b.sources.map((s: { nom: string }) => s.nom).join(" ")).not.toContain(SOURCES.cadastre.nom);
  });

  it("names a source that failed outright as unavailable", async () => {
    down = /zone-urba/;
    const { b } = await timed();
    expect(b.non_inclus).toEqual([expect.objectContaining({ partie: "zone du PLU", source: SOURCES.gpu.nom, raison: expect.stringContaining("indisponible") })]);
  });

  it("has no non_inclus when every source answered", async () => {
    const { b } = await timed();
    expect(b).not.toHaveProperty("non_inclus");
  });

  it("says the address base did not answer, never that the address is not found, and answers for the commune named", async () => {
    slow = /geocodage/;
    const { b, took } = await timed();
    expect(took).toBeLessThan(WAIT_MS + 3_000 + 700);
    expect(b.avertissement).toMatch(/^Adresse non lue\u00a0: la Base adresse nationale .* n'a pas répondu/);
    expect(b.avertissement).not.toMatch(/introuvable/);
    expect(b.lieu.precision).toBe("centre de la commune");
    expect(b.non_inclus).toEqual([expect.objectContaining({ partie: "adresse", source: SOURCES.ban.nom })]);
  });

  it("says the address base did not answer when no commune is named, never « introuvable »", async () => {
    slow = /geocodage/;
    const { r, b } = await timed(true, "7 rue de la Buse");
    expect(r.isError).toBe(true);
    expect(b.erreur).not.toMatch(/introuvable/);
    expect(b.erreur).toContain(`${SOURCES.ban.nom} n'a pas répondu`);
    expect(b.non_inclus).toEqual([expect.objectContaining({ partie: "adresse", source: SOURCES.ban.nom })]);
  });

  it("waits for the slow source outside a tool call (the page /terrain), as before", async () => {
    slow = /cadastre/;
    const { b, took } = await timed(false);
    expect(took).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect(b.cadastre).toMatchObject({ section: expect.any(String) });
    expect(b).not.toHaveProperty("non_inclus");
  });
});
