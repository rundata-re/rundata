import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { plage } from "../src/web/plage.js";

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);
const file = () => new Response(BYTES, { headers: { "content-type": "video/mp4" } });
const ask = (range?: string, method = "GET") => new Request("https://rundata.re/demo/v.mp4", { method, headers: range ? { range } : {} });
const bytes = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())];

describe("a byte range of a file", () => {
  it("answers 206 with the bytes asked and their Content-Range", async () => {
    for (const [range, a, b] of [["bytes=0-9", 0, 9], ["bytes=50-", 50, 99], ["bytes=-10", 90, 99], ["bytes=95-999", 95, 99]] as const) {
      const r = await plage(ask(range), file());
      expect(r.status, range).toBe(206);
      expect(r.headers.get("content-range"), range).toBe(`bytes ${a}-${b}/100`);
      expect(r.headers.get("content-length"), range).toBe(String(b - a + 1));
      expect(await bytes(r), range).toEqual([...BYTES.slice(a, b + 1)]);
      expect(r.headers.get("content-type")).toBe("video/mp4");
      expect(r.headers.get("accept-ranges")).toBe("bytes");
    }
  });

  it("answers the whole file without a range or with several, 416 past its end, and no body to HEAD", async () => {
    for (const range of [undefined, "bytes=0-1,5-6", "octets=0-9"]) {
      const r = await plage(ask(range), file());
      expect(r.status, range).toBe(200);
      expect(r.headers.get("accept-ranges")).toBe("bytes");
      expect((await bytes(r)).length, range).toBe(100);
    }
    for (const range of ["bytes=100-", "bytes=9-3", "bytes=-0"]) {
      const r = await plage(ask(range), file());
      expect(r.status, range).toBe(416);
      expect(r.headers.get("content-range")).toBe("bytes */100");
    }
    const head = await plage(ask("bytes=0-9", "HEAD"), file());
    expect([head.status, head.headers.get("content-length"), await head.text()]).toEqual([206, "10", ""]);
    const missing = new Response("absent", { status: 404 });
    expect(await plage(ask("bytes=0-9"), missing)).toBe(missing);
  });

  it("serves the demo video through the Worker, with public/_headers' lines for /demo/*", async () => {
    const asked: string[] = [];
    const env = { ASSETS: { fetch: async (r: Request) => (asked.push(`${r.url} ${r.headers.get("range")}`), file()) } };
    const r = await worker.fetch(ask("bytes=0-99"), env as never, { waitUntil: () => {} });
    expect([r.status, r.headers.get("content-range")]).toEqual([206, "bytes 0-99/100"]);
    // The file is read whole from the assets, without the range they would ignore.
    expect(asked).toEqual(["https://rundata.re/demo/v.mp4 null"]);
    const block = readFileSync("public/_headers", "utf8").split("/demo/*\n")[1].split(/\n(?! )/)[0];
    for (const line of block.split("\n")) {
      const [k, v] = line.trim().split(/:\s*/);
      expect(r.headers.get(k), k).toBe(v);
    }
    expect(readFileSync("wrangler.jsonc", "utf8")).toContain(`"run_worker_first": ["/demo/*"]`);
  });
});
