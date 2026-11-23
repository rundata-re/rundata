import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// A plain script, run by the deploy workflow before the Worker is deployed.
import { feeds, missing, ready } from "../scripts/transit-ready.mjs";

const network = JSON.parse(readFileSync(new URL("../src/transit/network.json", import.meta.url), "utf8")) as { networks: Record<string, { feed: string }> };
const all = Object.values(network.networks).map((n) => n.feed);
/** wrangler's answer to « SELECT feed FROM feeds », as `d1 execute --json` prints it. */
const answer = (list: string[]) => JSON.stringify([{ results: list.map((feed) => ({ feed })), success: true, meta: {} }]);

describe("the bus timetables checked before a deployment", () => {
  it("reads the feeds of wrangler's answer, and says an answer it cannot read apart from an empty table", () => {
    expect(feeds(answer(all))).toEqual(new Set(all));
    expect(feeds(answer([]))).toEqual(new Set());
    // D1 or wrangler failing for a moment: not JSON, an error object, nothing at all.
    expect(feeds("")).toBeUndefined();
    expect(feeds("✘ [ERROR] D1_ERROR: internal error")).toBeUndefined();
    expect(feeds(JSON.stringify({ error: "D1_ERROR" }))).toBeUndefined();
    expect(feeds(JSON.stringify([{ success: false }]))).toBeUndefined();
  });

  it("names each network of this version whose timetables are not in D1", () => {
    expect(missing(network, new Set(all))).toEqual([]);
    const [id, first] = Object.entries(network.networks)[0];
    expect(missing(network, new Set(all.slice(1)))).toEqual([`${id} (${first.feed})`]);
    expect(missing(network, new Set())).toHaveLength(all.length);
  });

  it("asks D1 again when its answer cannot be read, three times at most, without waiting after the last", async () => {
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    // Two failures (one thrown, one unreadable), then the feeds: read at the third try.
    const outs = [() => Promise.reject(Object.assign(new Error("exit 1"), { stderr: "fetch failed" })), async () => "pas du JSON", async () => answer(all)];
    let asked = 0;
    const third = await ready(network, () => outs[asked++](), wait);
    expect(third).toEqual({ ok: true, tries: 3, present: all.length, missing: [] });
    expect(waits).toEqual([10_000, 10_000]);

    // D1 never answers: said as D1 not answering, never as timetables absent.
    waits.length = 0;
    asked = 0;
    const never = await ready(network, async () => (asked++, ""), wait);
    expect(never).toMatchObject({ ok: false, tries: 3, unread: true });
    expect(never.missing).toBeUndefined();
    expect(asked).toBe(3);
    expect(waits).toEqual([10_000, 10_000]);
  });

  it("does not ask again an answer it could read: timetables absent stop the deployment at the first try", async () => {
    let asked = 0;
    const [id, first] = Object.entries(network.networks)[0];
    const r = await ready(network, async () => (asked++, answer(all.slice(1))), async () => {});
    expect(r).toEqual({ ok: false, tries: 1, present: all.length - 1, missing: [`${id} (${first.feed})`] });
    expect(asked).toBe(1);
  });

  it("is run by the deploy workflow on its own, with no pipe that would hide wrangler's failure", () => {
    const deploy = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
    expect(deploy).toContain("run: node scripts/transit-ready.mjs\n");
    expect(deploy).not.toMatch(/\|\s*node scripts\/transit-ready\.mjs/);
  });
});
