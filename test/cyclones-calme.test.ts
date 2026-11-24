import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { withLectures } from "../src/lectures.js";

// Its mocks its own: loaded for this file, dropped after it (test/modules-neufs.ts).
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

// The vigilance read, with or without a cyclone alert (`alerte`), as the tool's alert() turns it into its text.
let alerte: string | undefined;
vi.mock("../src/providers/vigilance.js", async (original) => ({
  ...(await original<typeof import("../src/providers/vigilance.js")>()),
  enabled: () => true,
  vigilance: async () => ({ value: {}, fetchedAt: new Date(), stale: false }),
}));
vi.mock("../src/tools/vigilance.js", async (original) => ({
  ...(await original<typeof import("../src/tools/vigilance.js")>()),
  cyclone: () => alerte,
}));
vi.mock("../src/tools/ecoles.js", async (original) => ({
  ...(await original<typeof import("../src/tools/ecoles.js")>()),
  ecolesBlock: () => undefined,
  quotidienLine: () => undefined,
}));
const { cyclones, CALME_COPIE_MAX_MS, CALME_WAIT_MS } = await import("../src/tools/cyclones.js");
const gdacs = await import("../src/providers/cyclones.js");

const fixture = (f: string) => readFileSync(new URL(`./fixtures/cyclones/${f}`, import.meta.url));
const NOW = new Date("2026-10-24T06:00:00Z");
const LISTE = [
  ...gdacs.parseList(JSON.parse(fixture("liste_page1.json").toString())),
  ...gdacs.parseList(JSON.parse(fixture("liste_page2.json").toString())),
];
// Each page of GDACS's list answering in 1.5 s: longer than CALME_WAIT_MS.
const GDACS_MS = 1500;

/** A cache holding GDACS's list as copied `minutes` ago, `actif` with a system active in it. */
async function avecCopie(minutes: number, actif = false) {
  const store = new MemoryStore();
  const value = actif
    ? [{ ...LISTE[0], debut: new Date(NOW.getTime() - 2 * 86400_000).toISOString(), fin: new Date(NOW.getTime() - 2 * 3600_000).toISOString() }, ...LISTE.slice(1)]
    : LISTE;
  await store.put("cyclones:liste", { value, fetchedAt: NOW.getTime() - minutes * 60_000 });
  return new Cache(store, () => NOW.getTime());
}

/** `work` run on the simulated clock, every timer through (GDACS's late read included): its value and its time. */
async function onClock<T>(work: () => Promise<T>) {
  const t = Date.now();
  let took = -1;
  const p = work().then((v) => ((took = Date.now() - t), v));
  await vi.advanceTimersByTimeAsync(4 * GDACS_MS);
  return { value: await p, took };
}

const timed = async (cache: Cache) => {
  const { value, took } = await onClock(() => cyclones(cache, undefined, NOW));
  return { r: JSON.parse(value.content[0].text), took };
};

// A copy 40 minutes old: past the list's freshness (30 min), within CALME_COPIE_MAX_MS.
describe("cyclones: GDACS's copy when the basin is calm", { timeout: 15_000 }, () => {
  beforeEach(() => {
    // The simulated clock: the 1.5 s of GDACS and the CALME_WAIT_MS wait without waiting, steady under load.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    alerte = undefined;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (url: string | Request) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.includes("geteventlist")) {
        await new Promise((r) => setTimeout(r, GDACS_MS));
        return new Response(fixture(u.includes("pagenumber=2") ? "liste_page2.json" : "liste_page1.json"));
      }
      return new Response("", { status: 503 });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gives the copy of the list, its read behind, past CALME_WAIT_MS when no system is active and no alert is up", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cache = await avecCopie(40);
    const { value: { value, lectures }, took } = await onClock(() => withLectures(() => cyclones(cache, undefined, NOW)));
    const r = JSON.parse(value.content[0].text);
    // Noted as a late read of its source: the answer says the copy's time (tools/fraicheur.ts).
    expect(lectures).toContainEqual(expect.objectContaining({ key: "cyclones:liste", fetchedAt: NOW.getTime() - 40 * 60_000, stale: true, tardive: true, source: "gdacs_cyclones" }));
    expect(took).toBeGreaterThanOrEqual(CALME_WAIT_MS);
    expect(took).toBeLessThan(GDACS_MS);
    expect(r.resume).toContain("Aucun système tropical actif dans le sud-ouest de l'océan Indien.");
    expect(logs.mock.calls.flat().join("\n")).toContain("lecture trop lente pour la réponse : cyclones:liste, copie du 2026-10-24T05:20:00.000Z servie, aucun système actif");
  });

  it("waits for GDACS while a system is active in the copy", async () => {
    const { took } = await timed(await avecCopie(40, true));
    expect(took).toBeGreaterThanOrEqual(GDACS_MS);
  });

  it("waits for GDACS while a cyclone alert is up, whatever the copy says", async () => {
    alerte = "Alerte orange cyclonique en cours à La Réunion.";
    const { took } = await timed(await avecCopie(40));
    expect(took).toBeGreaterThanOrEqual(GDACS_MS);
  });

  it("waits for GDACS when the copy is older than CALME_COPIE_MAX_MS", async () => {
    const { took } = await timed(await avecCopie(CALME_COPIE_MAX_MS / 60_000 + 1));
    expect(took).toBeGreaterThanOrEqual(GDACS_MS);
  });
});
