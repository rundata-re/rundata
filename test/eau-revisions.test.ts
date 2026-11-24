import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceRevision } from "../src/web/revisions.js";

// The water's sources: each reading the cache keeps declares its revision (web/revisions.ts SOURCE_REVISION), so that a
// change of how the source is read reads it again at the deploy (24/11/2026: the bathing sites' classifications, read
// by the new code, stayed empty 12 h in the readings of the old one, and /eau's copy was rebuilt from them).
const FILES = ["baignades", "eaupotable", "vigieau", "avis-eau"];
const READS = /cache\.(?:get|islandRead|bundle)(?:<[^>]*>)?\(\s*(?:`([a-z-]+):|"([a-z-]+:[^"]*)"|([A-Z_]+)\b)/g;

describe("les lectures gardées des sources de l'eau", () => {
  it("declare each its revision", () => {
    const keys: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(new URL(`../src/providers/${f}.ts`, import.meta.url), "utf8");
      for (const m of src.matchAll(READS)) {
        const name = m[3] ? new RegExp(`const ${m[3]} = "([^"]+)"`).exec(src)?.[1] : undefined;
        keys.push(m[1] ? `${m[1]}:x` : (m[2] ?? name ?? `${f}: ${m[3]} introuvable`));
      }
    }
    expect(keys.length).toBeGreaterThanOrEqual(4);
    expect(keys.filter((k) => sourceRevision(k) == null), "lecture gardée sans révision déclarée dans SOURCE_REVISION").toEqual([]);
  });
});
