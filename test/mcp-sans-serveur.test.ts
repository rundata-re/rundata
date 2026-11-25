import { describe, expect, it, vi } from "vitest";

// createServer counted: the requests with nothing for a server to answer are answered without building one.
const built = vi.hoisted(() => ({ n: 0 }));
vi.mock("../src/server.js", async (original) => {
  const m = await original<typeof import("../src/server.js")>();
  return { ...m, createServer: (...a: Parameters<typeof m.createServer>) => (built.n++, m.createServer(...a)) };
});
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

const { handle, hasRequest } = await import("../src/app.js");
const { Cache } = await import("../src/cache.js");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const answered = async (r: Request) => {
  built.n = 0;
  const response = await handle(r, new Cache());
  return { status: response.status, text: await response.text(), built: built.n };
};

describe("/mcp without a server for what has no request", () => {
  it("tells a request (a method and an id) from a notification or a response", () => {
    expect(hasRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBe(true);
    expect(hasRequest({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(false);
    expect(hasRequest({ jsonrpc: "2.0", id: 1, result: {} })).toBe(false);
    expect(hasRequest([{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "ping" }])).toBe(true);
    expect(hasRequest([])).toBe(false);
    expect(hasRequest(null)).toBe(false);
  });

  it("answers a notification 202, with no server built, as the transport did with one", async () => {
    expect(await answered(post({ jsonrpc: "2.0", method: "notifications/initialized" }))).toEqual({ status: 202, text: "", built: 0 });
    // The transport's own checks still apply: a client that does not accept both types gets its 406.
    const no = await answered(post({ jsonrpc: "2.0", method: "notifications/initialized" }, { accept: "application/json" }));
    expect([no.status, no.built]).toEqual([406, 0]);
    // What is not a JSON-RPC message gets the transport's parse error.
    const bad = await answered(post({ hello: 1 }));
    expect([bad.status, JSON.parse(bad.text).error.code, bad.built]).toEqual([400, -32700, 0]);
  });

  it("refuses a batch of a protocol without batches before building the server", async () => {
    const refused = await answered(post([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }], { "mcp-protocol-version": "2025-06-18" }));
    expect([refused.status, refused.built]).toEqual([400, 0]);
  });

  it("builds the server for a request, alone or in a batch with notifications", async () => {
    const init = await answered(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "t", version: "1" }, capabilities: {} } }));
    expect([init.status, init.built]).toEqual([200, 1]);
  });
});
