import { afterEach, describe, expect, it, vi } from "vitest";
import { nonIndexable, sansIndex } from "../src/web/noindex.js";
import worker from "../src/worker.js";
import { readFileSync } from "node:fs";

const O = "https://rundata.re";

describe("the files that are not pages", () => {
  it("are kept out of search results, and the pages, feeds, calendars, sitemap, text and pictures are not", () => {
    for (const t of ["application/pdf", "application/gpx+xml; charset=utf-8", "application/json; charset=utf-8", "text/csv; charset=utf-8", "application/geo+json", "application/manifest+json; charset=utf-8", "text/event-stream"]) {
      expect(nonIndexable(t), t).toBe(true);
    }
    for (const t of ["text/html; charset=utf-8", "application/rss+xml; charset=utf-8", "text/calendar; charset=utf-8", "application/xml; charset=utf-8", "text/plain; charset=utf-8", "image/png", "image/webp", null]) {
      expect(nonIndexable(t), String(t)).toBe(false);
    }
  });

  it("get the header, keep the one they already say, and are copied when their headers are read-only", async () => {
    const pdf = sansIndex(new Response("%PDF", { headers: { "content-type": "application/pdf" } }));
    expect(pdf.headers.get("x-robots-tag")).toBe("noindex");
    const dit = sansIndex(new Response("{}", { headers: { "content-type": "application/json", "x-robots-tag": "noindex, nofollow" } }));
    expect(dit.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const page = sansIndex(new Response("<p>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(page.headers.has("x-robots-tag")).toBe(false);
    const figee = new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    vi.spyOn(figee.headers, "set").mockImplementation(() => { throw new TypeError("immutable"); });
    const copie = sansIndex(figee);
    expect(copie).not.toBe(figee);
    expect(copie.headers.get("x-robots-tag")).toBe("noindex");
    expect(await copie.text()).toBe("%PDF");
  });
});

describe("the Worker's responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("say noindex for a file that is not a page, and nothing for robots.txt or a page", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("")));
    const get = async (path: string) => {
      const after: Promise<unknown>[] = [];
      const res = await worker.fetch(new Request(`${O}${path}`, { headers: { accept: "text/html" } }), {} as never, { waitUntil: (p) => void after.push(p) });
      await Promise.allSettled(after);
      return res;
    };
    expect((await get("/publier/modele-agenda.csv")).headers.get("x-robots-tag")).toBe("noindex");
    expect((await get("/manifest.webmanifest")).headers.get("x-robots-tag")).toBe("noindex");
    expect((await get("/robots.txt")).headers.has("x-robots-tag")).toBe(false);
    expect((await get("/a-propos")).headers.has("x-robots-tag")).toBe(false);
  });
});

describe("the static JSON files", () => {
  it("say noindex in public/_headers, as pdf.js does", () => {
    const h = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
    for (const d of ["/dae/*", "/carte-scolaire/*", "/pdfjs/*"]) {
      const bloc = h.split(/\n(?=\/)/).find((b) => b.startsWith(`${d}\n`));
      expect(bloc, d).toContain("X-Robots-Tag: noindex");
    }
  });
});
