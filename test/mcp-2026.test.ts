import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import type { Hit } from "../src/metrics.js";

// The 2026-07-28 revision: no initialize, a `server/discover` probe, then each request with its `_meta` envelope and
// the Mcp-Method (and Mcp-Name) headers. Every outbound fetch answers 503 and the clock is fixed: the same answers on
// both paths depend on the code only.
const V = "2026-07-28";
const META = {
  "io.modelcontextprotocol/protocolVersion": V,
  "io.modelcontextprotocol/clientInfo": { name: "claude-ai", version: "0.2.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
type Message = { jsonrpc: "2.0"; id?: number; method: string; params?: Record<string, unknown> };

const ask = async (body: Message | string, headers: Record<string, string>) => {
  const hits: Hit[] = [];
  const r = await handle(new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), new Cache(), () => {}, (h) => hits.push(h));
  return { status: r.status, type: r.headers.get("content-type"), json: JSON.parse(await r.text()), hits };
};
/** A 2026-07-28 request, its envelope and headers as a client sends them. */
const modern = (id: number, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  ask({ jsonrpc: "2.0", id, method, params: { ...params, _meta: META } }, {
    "mcp-protocol-version": V,
    "mcp-method": method,
    ...(typeof params.name === "string" && { "mcp-name": params.name }),
    ...headers,
  });
/** The same request in 2025-11-25, the version the 2025 clients use. */
const legacy = (id: number, method: string, params: Record<string, unknown> = {}) =>
  ask({ jsonrpc: "2.0", id, method, params }, { "mcp-protocol-version": "2025-11-25" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T08:00:00+04:00"));
  vi.stubGlobal("fetch", async () => new Response("indisponible", { status: 503 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/mcp in the 2026-07-28 revision", () => {
  it("answers server/discover, then tools/list and tools/call, 200 in JSON", async () => {
    const discover = await modern(1, "server/discover");
    expect([discover.status, discover.type]).toEqual([200, "application/json"]);
    expect(discover.json.result.supportedVersions).toContain(V);
    expect(discover.json.result.capabilities.tools).toEqual({ listChanged: false });
    // The same instructions as the 2025 clients get at initialize.
    const init = await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, {});
    expect(discover.json.result.instructions).toBe(init.json.result.instructions);

    const list = await modern(2, "tools/list");
    expect(list.status).toBe(200);
    // The tools as listed to the 2025 clients, lightened alike (server.ts listeAllegee).
    expect(list.json.result.tools).toEqual((await legacy(2, "tools/list")).json.result.tools);

    const call = await modern(3, "tools/call", { name: "calendrier", arguments: { lieu: "Saint-Paul" } });
    expect([call.status, call.type, call.json.id]).toEqual([200, "application/json", 3]);
    expect(call.json.result.content[0].text).toMatch(/Saint-Paul/);
  });

  it("says each tool's own words for a place not understood as to the 2025 clients", async () => {
    const tools = (await legacy(1, "tools/list")).json.result.tools as { name: string; inputSchema: { properties?: object; required?: string[] } }[];
    const withPlace = tools.filter((t) => "lieu" in (t.inputSchema.properties ?? {}));
    expect(withPlace.length).toBeGreaterThan(20);
    const needed: Record<string, Record<string, unknown>> = { annuaire_services_publics: { quoi: "mairie" }, donner_avis: { type: "manque", message: "essai" } };
    for (const t of withPlace) {
      const args = { ...needed[t.name], lieu: "Zzyzxville" };
      const now = await modern(5, "tools/call", { name: t.name, arguments: args });
      const before = await legacy(5, "tools/call", { name: t.name, arguments: args });
      // The revision's own envelope added (`_meta` with the server's info, `resultType`), the tool's answer the same.
      const { _meta, resultType, ...answer } = now.json.result;
      expect([t.name, now.status, resultType, answer]).toEqual([t.name, 200, "complete", before.json.result]);
      expect(_meta["io.modelcontextprotocol/serverInfo"].name).toBe("reunion-temps-reel");
    }
  });

  it("records the call with the client and version of its envelope, without an initialize", async () => {
    const { hits } = await modern(3, "tools/call", { name: "calendrier", arguments: { lieu: "Saint-Paul" } });
    expect(hits.find((h) => h.kind === "mcp" && h.method === "tools/call")).toMatchObject({
      name: "calendrier", method: "tools/call", client: "claude-ai", clientVersion: "0.2.0", protocol: V, outcome: "ok", args: "lieu", place: "résolu", commune: "Saint-Paul",
    });
    const discover = await modern(1, "server/discover");
    expect(discover.hits).toEqual([expect.objectContaining({ kind: "rpc", name: "server/discover", client: "claude-ai", protocol: V, outcome: "ok" })]);
  });

  it("refuses headers that disagree with the body -32020, recorded with the SDK's reason", async () => {
    const version = await modern(4, "tools/list", {}, { "mcp-protocol-version": "2025-11-25" });
    expect([version.status, version.json.error.code]).toEqual([400, -32020]);
    expect(version.json.error.message).toMatch(/MCP-Protocol-Version header names 2025-11-25/);
    const method = await modern(4, "tools/list", {}, { "mcp-method": "tools/call" });
    expect([method.status, method.json.error.code]).toEqual([400, -32020]);
    expect(method.hits).toEqual([expect.objectContaining({ name: "tools/list", outcome: "rpc -32020", message: expect.stringMatching(/headers and body disagree/) })]);
  });

  it("serves on the 2025 path an envelope that names a 2025 version, as before the SDK 2", async () => {
    // A probe's tools/list as it reached the site: « 2025-06-18 » in the header and in the envelope (27/11/2026).
    const meta = { ...META, "io.modelcontextprotocol/protocolVersion": "2025-06-18" };
    const probe = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } }, { "mcp-protocol-version": "2025-06-18" });
    expect(probe.status).toBe(200);
    expect(probe.json.result.tools).toEqual((await legacy(2, "tools/list")).json.result.tools);
    expect(probe.hits).toEqual([expect.objectContaining({ name: "tools/list", outcome: "ok" })]);
    // Without the header alike; a version past 2026-07-28 stays the SDK's to refuse, with the versions it serves.
    expect((await ask({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } }, {})).status).toBe(200);
    const future = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2099-01-01" } } }, { "mcp-method": "tools/list" });
    expect([future.status, future.json.error.code]).toEqual([400, -32022]);
  });

  it("keeps the limit of a body's size, before the SDK reads it", async () => {
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META, x: "a".repeat(4 * 1024 * 1024) } });
    const r = await ask(big, { "mcp-protocol-version": V, "mcp-method": "tools/list" });
    expect(r.status).toBe(413);
  });

  it("lets a browser send the 2026-07-28 headers", async () => {
    const r = await handle(new Request("https://rundata.re/mcp", { method: "OPTIONS" }), new Cache());
    expect(r.headers.get("access-control-allow-headers")).toMatch(/mcp-method, mcp-name/);
  });
});
