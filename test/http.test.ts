import { afterEach, describe, expect, it, vi } from "vitest";
import { counted, PAGE_BUDGET } from "../src/budget.js";
import { getJson, getMatch, getText, IN_FLIGHT, patiently, permis, whenFailed } from "../src/http.js";
import { UpstreamError } from "../src/types.js";

afterEach(() => vi.unstubAllGlobals());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The platform as it opens a Worker's connections: six at a time, the next ones queued until one is done, the fetch's
 * signal running all along. Each site answers in `ms`.
 */
function platform(ms: number) {
  let open = 0;
  let most = 0;
  const queue: (() => void)[] = [];
  const started: Record<string, number> = {};
  const t0 = Date.now();
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    const aborted = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
    if (open >= 6) {
      await new Promise<void>((resolve, reject) => {
        queue.push(resolve);
        signal?.addEventListener("abort", () => reject(aborted()));
      });
    }
    open++;
    most = Math.max(most, open);
    started[new URL(url).hostname] = Date.now() - t0;
    try {
      await Promise.race([wait(ms), new Promise((_, reject) => signal?.addEventListener("abort", () => reject(aborted())))]);
      return new Response("ok");
    } finally {
      open--;
      queue.shift()?.();
    }
  });
  return { most: () => most, started };
}

describe("the fetches of an invocation", () => {
  const sites = Array.from({ length: 12 }, (_, i) => `https://agenda-${i}.example/`);

  it("wait for their place before their timeout starts: twelve slow sites, none cut while queued", async () => {
    // Each site answers in 300 ms, under its 450 ms timeout; twelve at once on six connections used to cut six of them,
    // queued 300 ms then read 300 ms. Half an answer of margin each way: a timer late by up to 150 ms under the load of
    // the whole suite cuts nothing (60 ms in 100 ms cut one, 06/11/2026), and a timeout started in the queue still cuts.
    const p = platform(300);
    const { value } = await counted(PAGE_BUDGET, () =>
      Promise.all(sites.map((u) => getText("agenda", u, 450).then(() => "lu", (err: Error) => err.message))),
    );
    expect(value).toEqual(sites.map(() => "lu"));
    expect(p.most()).toBeLessThanOrEqual(IN_FLIGHT);
    // Read in turns, not all at the same instant.
    const starts = Object.values(p.started).sort((a, b) => a - b);
    expect(starts.at(-1)! - starts[0]).toBeGreaterThanOrEqual(300);
  });

  it("keep a place for the stores: at most IN_FLIGHT under the platform's six", () => {
    expect(IN_FLIGHT).toBeLessThan(6);
  });

  it("give their place back when a site fails or is too slow", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const host = new URL(url).hostname;
      if (host === "lent.example") {
        await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))));
      }
      return new Response("", { status: host === "panne.example" ? 503 : 200 });
    });
    const { value } = await counted(PAGE_BUDGET, async () => {
      const bad = await Promise.allSettled([
        ...Array.from({ length: IN_FLIGHT }, () => getText("x", "https://panne.example/", 50)),
        ...Array.from({ length: IN_FLIGHT }, () => getText("x", "https://lent.example/", 20)),
      ]);
      // Every place given back: as many more fetches go through.
      const good = await Promise.all(Array.from({ length: IN_FLIGHT * 2 }, () => getText("x", "https://bon.example/", 50)));
      return { failed: bad.filter((r) => r.status === "rejected").length, read: good.length };
    });
    expect(value).toEqual({ failed: IN_FLIGHT * 2, read: IN_FLIGHT * 2 });
  });

  it("are given at least the patient delay inside `patiently`, their own delay elsewhere", async () => {
    // A site that answers in 150 ms, read with a 50 ms delay.
    platform(150);
    const read = () => getText("agenda", "https://lent.example/", 50).then(() => "lu", (err: Error) => err.message);
    const { value } = await counted(PAGE_BUDGET, async () => [await read(), await patiently(1_000, read)]);
    expect(value[0]).toMatch(/timeout/);
    expect(value[1]).toBe("lu");
  });

  it("do not wait outside a counted invocation (Node)", async () => {
    const p = platform(10);
    await Promise.all(sites.map((u) => getText("agenda", u, 1_000)));
    expect(p.most()).toBe(6);
  });
});

describe("a body that does not come in time", () => {
  afterEach(() => whenFailed(undefined));

  /** A site whose headers come at once, then a body: its first piece, then nothing until the read's signal ends it. */
  function stalls(first: string) {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull: (c) => {
          if (!sent) {
            sent = true;
            c.enqueue(new TextEncoder().encode(first));
            return;
          }
          return new Promise<void>((_, reject) =>
            signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))),
          );
        },
      });
      return new Response(body);
    });
  }

  it("is a source that does not answer, as a fetch cut by its delay, and is told as a failed read", async () => {
    stalls("2026-11-06T15:50|-21.2|55.7");
    const told: [string, string, UpstreamError][] = [];
    whenFailed((source, url, err) => told.push([source, url, err]));
    const err = await getText("ipgp", "https://lent.example/seismes", 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).toMatchObject({ source: "ipgp", message: expect.stringMatching(/^ipgp: .*timeout/) });
    expect(told).toEqual([["ipgp", "https://lent.example/seismes", err]]);
  });

  it("but a body that came whole and cannot be read stays ours to mend, told to no one", async () => {
    vi.stubGlobal("fetch", async () => new Response("{pas du json"));
    const told: string[] = [];
    whenFailed((source) => told.push(source));
    const err = await getJson("x", "https://example.org/", 1_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SyntaxError);
    expect(err).not.toBeInstanceOf(UpstreamError);
    expect(told).toEqual([]);
  });
});

describe("a link found in a third party's page", () => {
  it("is followed only in https, to one of its site's hosts, and a refusal says the host alone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(permis("s", "https://www.teat.re/spectacle/x?y=1", ["www.teat.re", "billetterie.seetickets.fr"])).toBe(true);
    expect(permis("s", "https://billetterie.seetickets.fr/event/x", ["www.teat.re", "billetterie.seetickets.fr"])).toBe(true);
    for (const lien of ["http://www.teat.re/x", "https://teat.re.pirate.example/x", "https://pirate.example/www.teat.re", "https://www.teat.re:8443/x", "javascript:alert(1)", "/relatif", ""]) {
      expect(permis("s", lien, ["www.teat.re"])).toBe(false);
    }
    expect(String(warn.mock.calls[1][0])).toBe("s : lien hors de www.teat.re ignoré (teat.re.pirate.example)");
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).not.toContain("/x");
    warn.mockRestore();
  });
});

describe("a page read until a pattern", () => {
  /** A page served in pieces, counting those the reader pulled. */
  function pieces(parts: string[]) {
    const pulled: number[] = [];
    let cancelled = false;
    vi.stubGlobal("fetch", async () => {
      let i = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          pulled.push(i);
          if (i < parts.length) c.enqueue(new TextEncoder().encode(parts[i++]));
          else c.close();
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body);
    });
    return { pulled, cancelled: () => cancelled };
  }

  it("finds it across two pieces, stops there and cancels the rest, never pulled", async () => {
    const p = pieces(["<p>filtres…</p>".repeat(50), '<span class="num', 'ber">628</span> offres', "<li>la suite</li>", "<li>et plus</li>"]);
    const m = await getMatch("t", "https://example.org/", 1000, /<span class="number">(\d+)<\/span> offres/);
    expect(m?.[1]).toBe("628");
    expect(p.cancelled()).toBe(true);
    expect(Math.max(...p.pulled)).toBeLessThan(4);
  });

  it("gives null when the page ends without it", async () => {
    pieces(["<p>rien</p>", "<p>toujours rien</p>"]);
    expect(await getMatch("t", "https://example.org/", 1000, /<span class="number">(\d+)/)).toBeNull();
  });
});
