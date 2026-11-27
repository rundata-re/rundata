import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import * as serveur from "../src/server.js";

// The tools' JSON Schemas are made when the module loads, not at an isolate's first request (CPU of /mcp, 27/11/2026).
const list = (headers: Record<string, string>, meta?: object) =>
  handle(new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: meta ? { _meta: meta } : {} }),
  }), new Cache());

describe("tools' schemas made at load", () => {
  it("makes every tool's schema at load, and the first tools/list makes none", async () => {
    const atLoad = serveur.conversions;
    const a = await list({ "mcp-protocol-version": "2025-11-25" });
    const b = await list({ "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" }, {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {},
    });
    const tools = (await a.json()).result.tools;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(atLoad).toBe(tools.length);
    expect(serveur.conversions).toBe(atLoad);
  });
});
