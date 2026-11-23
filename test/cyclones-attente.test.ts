import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";

// The vigilance as read: switched on, its read only recorded, and failed: the alert is then said unread.
const read: string[] = [];
vi.mock("../src/providers/vigilance.js", async (original) => ({
  ...(await original<typeof import("../src/providers/vigilance.js")>()),
  enabled: () => true,
  vigilance: async () => {
    read.push("vigilance");
    throw new Error("non lue dans ce test");
  },
}));
const { cyclones } = await import("../src/tools/cyclones.js");

const fixture = (f: string) => readFileSync(new URL(`./fixtures/cyclones/${f}`, import.meta.url));
const NOW = new Date("2026-10-24T06:00:00Z");

describe("cyclones: the alert's wait", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    read.length = 0;
  });

  it("reads the alert while GDACS's list is still being read, not after it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let answer!: () => void;
    const list = new Promise<void>((r) => (answer = r));
    vi.stubGlobal("fetch", async (url: string | Request) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.includes("geteventlist")) {
        read.push("gdacs");
        await list;
        return new Response(fixture(u.includes("pagenumber=2") ? "liste_page2.json" : "liste_page1.json"));
      }
      return new Response("", { status: 503 });
    });
    const call = cyclones(new Cache(new MemoryStore(), () => NOW.getTime()), undefined, NOW);
    for (let i = 0; i < 50 && !(read.includes("gdacs") && read.includes("vigilance")); i++) await new Promise((r) => setTimeout(r, 0));
    // GDACS has not answered yet: the alert was asked all the same.
    expect(read).toContain("gdacs");
    expect(read).toContain("vigilance");
    answer();
    const r = JSON.parse((await call).content[0].text);
    expect(r.resume).toContain("Aucun système tropical actif dans le sud-ouest de l'océan Indien.");
  });

  it("says the alert could not be read, first, rather than nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (url: string | Request) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.includes("geteventlist")) return new Response(fixture(u.includes("pagenumber=2") ? "liste_page2.json" : "liste_page1.json"));
      return new Response("", { status: 503 });
    });
    const r = JSON.parse((await cyclones(new Cache(new MemoryStore(), () => NOW.getTime()), undefined, NOW)).content[0].text);
    expect(r.resume).toMatch(/^L'alerte cyclonique de Météo-France n'a pas pu être lue à l'instant : voir vigilance\.meteofrance\.fr et la préfecture \(reunion\.gouv\.fr\)\. Aucun système tropical actif/);
    expect(r.alerte_cyclonique).toBe("L'alerte cyclonique de Météo-France n'a pas pu être lue à l'instant : voir vigilance.meteofrance.fr et la préfecture (reunion.gouv.fr).");
  });
});
