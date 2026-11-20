import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { KEY as FIL } from "../src/providers/actualites.js";
import { configure } from "../src/providers/mf-auth.js";
import * as mf from "../src/providers/vigilance.js";
import { unzip } from "../src/zip.js";

// Météo-France's vigilance joins the answers of the tools on the weather's consequences, as on their pages: the sea, the
// tides, the rivers, the air, the past weather, the volcano. crues_rivieres also gives the headlines on the fords of /crues.
// Vigicrues Réunion as in crues.test.ts (23/10/2026, 03:52 in La Réunion); Météo-France's flow of 22/10/2026 as in
// vigilance.test.ts, with the island in orange cyclone alert and the East in heavy rain.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const zip = readFileSync(new URL("./fixtures/vigilance_om.zip", import.meta.url));
const NOW = new Date("2026-10-23T23:52:00Z");
const at = (iso: string) => new Date(iso).toISOString();

async function storm(): Promise<mf.Vigilance> {
  const f = await unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, (n) => n.endsWith("_FMEE_.txt") && n !== "CDPV87_FMEE_.txt");
  const v = mf.parse(JSON.parse(f.get("CDPV95_FMEE_.txt")!), JSON.parse(f.get("CDPV96_FMEE_.txt")!));
  v.zones["VIGI974-12"][12] = [{ couleur: 2, debut: "2026-10-23T06:00:00Z" }];
  v.zones[mf.ISLAND][mf.CYCLONE] = [{ couleur: 3, debut: "2026-10-22T12:02:24Z" }];
  return v;
}

// The news as the scheduled event left it: a media headline on a ford, one on a road only.
const info = (titre: string, publie: string, media = "Clicanoo") => ({ titre, media, lien: `https://example.re/${encodeURIComponent(titre)}`, publie: at(publie), heure: true, communes: [], lieux: [], sujets: ["route"] });
const NEWS = {
  infos: [info("Fortes pluies : le radier du Ouaki fermé à la circulation", "2026-10-23T23:30:00Z"), info("Bouchons sur la quatre voies", "2026-10-23T23:40:00Z")],
  prefecture: [],
  indisponible: [],
};

async function cacheWith(news?: unknown) {
  const store = new MemoryStore();
  await store.put("vigilance", { value: await storm(), fetchedAt: NOW.getTime() });
  if (news) await store.put(FIL, { value: news, fetchedAt: NOW.getTime() - 120_000 });
  return new Cache(store, () => NOW.getTime());
}

async function call(cache: Cache, name: string, args: Record<string, unknown> = {}) {
  const rpc = new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const r = (await (await handle(rpc, cache)).json()).result;
  // The typography's no-break spaces read as spaces.
  return { ...r, body: JSON.parse(r.content[0].text.replace(/[\u00a0\u202f]/g, " ")) };
}

beforeAll(() => configure({ token: "test" }));
afterAll(() => configure({}));

describe("Météo-France's vigilance in the tools on the weather's consequences", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", async (url: string, init?: { body?: URLSearchParams }) => {
      if (!String(url).includes("vigicrues")) return new Response("indisponible", { status: 503 });
      const file = String(url).endsWith("vigilance.php") ? "vigicrues_vigilance.json" : `vigicrues_${init?.body?.get("mesure")}.json`;
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("puts it first in crues_rivieres, with the headlines on the fords and their sources", async () => {
    const { body } = await call(await cacheWith(NEWS), "crues_rivieres");
    expect(Object.keys(body).slice(0, 2)).toEqual(["vigilance", "officiel"]);
    expect(body.vigilance[0]).toContain("ALERTE CYCLONIQUE orange");
    expect(body.vigilance[1]).toMatch(/^Vigilance Météo-France en cours : jaune fortes pluies \/ orages \(Est\)/);
    expect(body.officiel).toMatch(/https:\/\/meteofrance\.re\/fr\/cyclone$/);
    // The headline on a ford, with its day; the road headline left to actualites.
    expect(body.radiers.annonces).toEqual([
      { titre: "Fortes pluies : le radier du Ouaki fermé à la circulation", lien: expect.any(String), source: "Clicanoo", heure: "aujourd'hui à 03:30" },
    ]);
    expect(body.radiers.resume).toBe(
      "Annonces de la préfecture et des médias qui parlent d'un radier, d'après notre lecture du 24/10 à 03:50. Ce ne sont que des annonces : l'état officiel des routes et des radiers est sur la carte d'infotrafic.re, le site de la Région (https://www.infotrafic.re/).",
    );
    // Vigicrues Réunion's credit kept, the media's added once.
    const sources = body.sources.map((s: { source: string }) => s.source);
    expect(sources[0]).toMatch(/Vigicrues/);
    expect(sources.filter((s: string) => s === sources[1])).toHaveLength(1);
    expect(sources).toHaveLength(2);
  });

  it("says no headline on a ford for what it is, and nothing when the news was never read", async () => {
    const none = (await call(await cacheWith({ ...NEWS, infos: NEWS.infos.slice(1) }), "crues_rivieres")).body;
    expect(none.radiers).not.toHaveProperty("annonces");
    expect(none.radiers.resume).toBe(
      "Aucune annonce de la préfecture ni des médias sur un radier dans notre lecture du 24/10 à 03:50. Cela ne dit pas qu'ils sont ouverts : l'état officiel est sur infotrafic.re (https://www.infotrafic.re/).",
    );
    expect(none.sources).toHaveLength(1);
    const unread = (await call(await cacheWith(), "crues_rivieres")).body;
    expect(unread).not.toHaveProperty("radiers");
    expect(unread.vigilance).toHaveLength(2);
  });

  it("joins the five other tools to it, as meteo_actuelle, prevision_meteo and temperature_mer", () => {
    const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    for (const tool of ["meteo_actuelle", "prevision_meteo", "temperature_mer", "maree", "crues_rivieres", "qualite_air", "historique_meteo", "volcan_seismes"])
      expect(server, tool).toMatch(new RegExp(`track\\("${tool}", \\([^)]*\\) => withVigilance\\(cache,`));
  });
});
