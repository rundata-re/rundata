import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { MOTS_MAX, resolvePlace } from "../src/places/resolve.js";
import { TEXTE_MAX } from "../src/server.js";

// Bounds on the length of the tools' text arguments, and on the words of a place (23/11/2026).
const rpc = (method: string, params: unknown) =>
  new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
const call = async (method: string, params: unknown = {}) => (await (await handle(rpc(method, params), new Cache())).json()) as { result?: any; error?: { message: string } };

type Schema = { type?: string; maxLength?: number; enum?: unknown[]; properties?: Record<string, Schema>; items?: Schema; anyOf?: Schema[] };
/** The text fields of a schema without a bound, a list of values aside, as « tool.field ». */
const unbounded = (name: string, s: Schema, path = name): string[] =>
  [
    ...(s.type === "string" && !s.enum && !(s.maxLength! <= TEXTE_MAX * 5) ? [path] : []),
    ...Object.entries(s.properties ?? {}).flatMap(([k, v]) => unbounded(name, v, `${path}.${k}`)),
    ...(s.items ? unbounded(name, s.items, `${path}[]`) : []),
    ...(s.anyOf ?? []).flatMap((v) => unbounded(name, v, path)),
  ];

describe("the length of the tools' text arguments", () => {
  it("is bounded for every text argument of every tool", async () => {
    const tools: { name: string; inputSchema: Schema }[] = (await call("tools/list")).result.tools;
    expect(tools.length).toBeGreaterThan(25);
    expect(tools.flatMap((t) => unbounded(t.name, t.inputSchema))).toEqual([]);
    const lieu = tools.find((t) => t.name === "meteo_actuelle")!.inputSchema.properties!.lieu!;
    expect(lieu.maxLength).toBe(TEXTE_MAX);
  });

  it("refuses a place too long cleanly, before the tool runs, and at once", async () => {
    for (const [name, args] of [
      ["meteo_actuelle", { lieu: "Saint-Paul ".repeat(400) }],
      ["annuaire_services_publics", { quoi: "mairie", lieu: "x".repeat(TEXTE_MAX + 1) }],
      ["annuaire_services_publics", { quoi: "mairie ".repeat(100) }],
    ] as const) {
      const t0 = performance.now();
      const r = await call("tools/call", { name, arguments: args });
      expect(performance.now() - t0, name).toBeLessThan(1000);
      const said = r.error?.message ?? r.result?.content?.[0]?.text ?? "";
      expect(r.error || r.result?.isError, name).toBeTruthy();
      expect(said, name).toMatch(/200/);
    }
  });

  it("still answers a place at the bound", async () => {
    const r = await call("tools/call", { name: "calendrier", arguments: { lieu: `Saint-Paul${" ".repeat(TEXTE_MAX - 10)}` } });
    expect(r.error).toBeUndefined();
    expect(r.result.isError).toBeFalsy();
  });
});

describe("the words of a place (places/resolve.ts)", () => {
  it("finds the longest name of the gazetteer, and no place past MOTS_MAX words, at once", () => {
    expect(resolvePlace("Route Forestière Numéro 58 de la Scierie et du Haut des Makes")?.lieu.nom).toBe("Route Forestière Numéro 58 de la Scierie et du Haut des Makes");
    expect(resolvePlace("Gîte de la Roche Écrite ou de la Plaine des Chicots, Saint-Denis")?.lieu.nom).toBe("Gîte de la Roche Écrite ou de la Plaine des Chicots");
    const long = Array.from({ length: MOTS_MAX + 1 }, (_, i) => `Piton${i}`).join(" ");
    const t0 = performance.now();
    expect(resolvePlace(long)).toBeNull();
    expect(resolvePlace("Saint Paul ".repeat(18).trim())).toBeNull();
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
