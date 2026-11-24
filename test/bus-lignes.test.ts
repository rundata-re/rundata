import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import * as transit from "../src/providers/transit.js";
import { linesNamed, transports } from "../src/tools/transports.js";
import { busPage } from "../src/web/domains.js";
import { LINE_NETWORKS, LINE_PATH, linePages } from "../src/web/ligne.js";
import { site } from "../src/web/site.js";

// 24/11/2026: no page for a bus line; one for each line of Car Jaune, Alternéo and Estival, from their GTFS (Licence
// Ouverte), linked from /bus and from the transports tool. And the tool's two failures of the week: asked with `lieu`, as
// every other tool takes the place, or with nothing, it answered « Donner un arrêt, un lieu ou une ligne » as an error.
const rows = JSON.parse(readFileSync(new URL("./fixtures/transit/rows.json", import.meta.url), "utf8")) as Record<string, { passes?: { id: number }[]; patterns?: { id: number }[]; pattern_stops?: { id: number }[] }>;
const fake: transit.TransitDb = {
  all: async <T>(sql: string, keys: unknown) =>
    (JSON.parse(String(keys)) as [string, number][]).flatMap(([feed, id]) =>
      (/FROM passes/.test(sql) ? rows[feed]?.passes : /FROM pattern_stops/.test(sql) ? rows[feed]?.pattern_stops : rows[feed]?.patterns)?.filter((r) => r.id === id).map((r) => ({ feed, ...r })) ?? [],
    ) as T[],
};
beforeEach(() => transit.configure(fake));
afterEach(() => transit.configure(undefined));
// Friday 23/10/2026, 7h30 in La Réunion.
const NOW = new Date("2026-10-23T03:30:00Z");
const O = "https://rundata.re";
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("a page for each line of Car Jaune, Alternéo and Estival", () => {
  it("has every line of those networks, once, and no other network's", () => {
    expect([...LINE_NETWORKS]).toEqual(["carjaune", "alterneo", "estival"]);
    const pages = [...linePages().values()];
    const routes = pages.flatMap((p) => p.routes).sort((a, b) => a - b);
    const wanted = transit.ROUTES.flatMap(([net], i) => (LINE_NETWORKS.includes(net as never) ? [i] : []));
    expect(routes).toEqual(wanted);
    expect(linePages().get("carjaune/s1")).toEqual({ slug: "carjaune/s1", reseau: "carjaune", ligne: "S1", nom: "St-Benoît / St-Pierre par le Grand Brûlé", routes: linesNamed("S1", "carjaune") });
    // Two lines of one name in a network are one page, as the tool reads them.
    expect(linePages().get("alterneo/sak")!.routes).toEqual(linesNamed("SAK", "alterneo"));
  });

  it("gives each direction's stops in order, each leading to its page, and the day's departures", async () => {
    const r = (await site(new Request(`${O}${LINE_PATH}/carjaune/s1`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW))!;
    expect(r.status).toBe(200);
    const html = await r.text();
    // Out of the index, by the tag and the header, until the review of Google's recovery (08/12/2026).
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).toContain("<h1>Ligne S1 Car Jaune</h1>");
    expect(html).toContain("St-Benoît / St-Pierre par le Grand Brûlé");
    expect(html).toContain("Gare de St-Benoît → Gare de St-Pierre");
    const first = html.slice(html.indexOf("Gare de St-Benoît → Gare de St-Pierre"));
    const stops = [...first.slice(0, first.indexOf("</ol>")).matchAll(/<a href="\/bus\/arret\/([^"]+)">/g)].map((m) => m[1]);
    expect(stops).toHaveLength(31);
    for (const s of stops) expect(transit.stopPages().has(s), s).toBe(true);
    expect(stops[0]).toBe(transit.pageOfStop(transit.GROUPS.find((g) => g.reseau === "carjaune" && g.nom === "Gare de St-Benoît")!.ids[0])!.slug);
    expect(first).toMatch(/31 arrêts · \d+ départs aujourd&#39;hui, de \d\d:\d\d à\s\d\d:\d\d/);
    expect(first).toMatch(/<li>\d\d:\d\d<\/li>/);
  });

  it("is not found for a line that is not, or of another network", async () => {
    for (const path of [`${LINE_PATH}/carjaune/zz9`, `${LINE_PATH}/citalis/${transit.ROUTES.find(([n]) => n === "citalis")![1].toLowerCase()}`]) {
      const r = (await site(new Request(`${O}${path}`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW))!;
      expect(r.status, path).toBe(404);
    }
  });

  it("is linked from /bus, every one of them", () => {
    const html = busPage(O, null, NOW);
    for (const p of linePages().values()) expect(html, p.slug).toContain(`href="${LINE_PATH}/${p.slug}"`);
  });

  it("is given by the tool for a line of those networks, not for another's", async () => {
    expect(body(await transports(undefined, "S1", NOW)).page).toBe(`${O}${LINE_PATH}/carjaune/s1`);
    const citalis = transit.ROUTES.find(([n]) => n === "citalis")![1];
    expect(body(await transports(undefined, `${citalis} Citalis`, NOW)).page).toBeUndefined();
  });
});

describe("the transports tool asked with `lieu`, or with nothing", () => {
  const rpc = (args: unknown) =>
    new Request(`${O}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "transports", arguments: args } }) });
  const call = async (args: unknown) => (await (await handle(rpc(args), new Cache())).json()) as { result: { isError?: boolean; content: { text: string }[] } };
  // The tool reads the clock: at NOW (07:30 in La Réunion), not at the hour the suite runs (24/11/2026: red after 20:30,
  // no departure left at Saint-Pierre's station that evening).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("takes the place as the stop, as the other tools take it", async () => {
    const asLieu = await call({ lieu: "Gare de St-Pierre" });
    expect(asLieu.result.isError).toBeFalsy();
    expect(body(asLieu.result).resume).toMatch(/^Prochains départs à Gare de St-Pierre/);
  });

  it("with nothing, says what to give and where the networks are, without an error", async () => {
    const r = await call({});
    expect(r.result.isError).toBeFalsy();
    const b = body(r.result);
    expect(b.resume).toMatch(/^Donner un arrêt, un lieu ou une ligne/);
    expect(b.lien).toBe(`${O}/bus?ref=mcp`);
    expect(b.reseaux.map((x: { nom: string }) => x.nom)).toEqual(expect.arrayContaining(["Car Jaune", "Citalis", "Alternéo", "Estival"]));
  });
});
