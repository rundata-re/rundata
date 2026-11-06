import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The card beside a page's title (`mapcard`, in the band under the h1) opens with a h2: a h3 there skipped a level, and
// a screen reader's list of headings showed it under nothing. Read in the source, so that a new page cannot bring it back.
describe("the card beside a page's title", () => {
  it("opens with a h2 in every page that has one", () => {
    const dir = new URL("../src/web/", import.meta.url);
    const found = readdirSync(dir).filter((f) => f.endsWith(".ts")).flatMap((f) =>
      [...readFileSync(new URL(f, dir), "utf8").matchAll(/<figure class="card mapcard[^"]*">\s*<h([1-6])/g)].map((m) => `${f} h${m[1]}`),
    );
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(found.filter((x) => !x.endsWith(" h2"))).toEqual([]);
  });
});
