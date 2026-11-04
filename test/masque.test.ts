import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENRE_SCRIPT } from "../src/web/domains.js";
import { CSS } from "../src/web/pages.js";

// The filters of /emploi, /marches-publics and /evenements hide the lines that do not match with the attribute
// `hidden`. A rule of the sheet that sets a line's `display` (`.rows li{display:grid}`) used to win over it: the
// counter said « 1 offre sur 474 » above the 474 offers. A rule `!important` wins over every rule that is not, whatever
// its selector; only another `!important` rule could show a hidden element again.
const WEB = new URL("../src/web/", import.meta.url);
const sources = readdirSync(WEB).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(new URL(f, WEB), "utf8")] as const);

describe("éléments masqués", () => {
  it("hides any element with the attribute hidden, whatever the rules that set its display", () => {
    expect(CSS).toContain("[hidden]{display:none!important}");
    // A rule that sets a line's display, as the lists of the three pages have.
    expect(CSS).toMatch(/\.rows li\{display:grid/);
  });

  it("has no rule that would show a hidden element again: no display other than none set !important", () => {
    for (const [f, s] of sources) {
      for (const m of s.matchAll(/display:\s*([a-z-]+)\s*!important/g)) expect(m[1], f).toBe("none");
    }
  });

  it("hides the lines that do not match with the attribute hidden, on the three pages with a filter", () => {
    const script = (f: string) => sources.find(([n]) => n === f)![1];
    expect(script("emploi.ts")).toMatch(/for\(const e of items\)\{const ok=[^}]*e\.hidden=!ok/);
    expect(script("marches-publics.ts")).toMatch(/for\(const e of items\)\{const ok=[^}]*e\.hidden=!ok/);
    expect(GENRE_SCRIPT).toContain("li.hidden=!ok");
  });
});
