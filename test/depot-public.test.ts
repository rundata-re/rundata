import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The repository is public: its code and tests say why a line is there, never the number a team gives a task, the name
// of who asked, nor a path to the team's own notes. A pull request's number (#1234) stays: it is public. The patterns
// are built from pieces, so that this file does not match them itself.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "fixtures" || e.name === "node_modules" ? [] : walk(join(dir, e.name))) : /\.(ts|js|mjs|css|py)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

const r = (...parts: string[]) => new RegExp(parts.join(""), "i");
const INTERNE: [string, RegExp][] = [
  ["a task's number", r("\\bitems?", " \\d{2,5}\\b")],
  ["a task's number before a date", r("\\(\\d{3,5}", ", \\d{2}/\\d{2}")],
  ["a team member's name", r("\\b(data", "-run|rundata", "-lead|rd-aud", "it-\\w+|community", "-manager|dev", "[2-9])\\b")],
  ["a team member's name", r("\\brevue ", "ux\\b|\\(u", "x[,):]|\\bu", "x's\\b|\\bby u", "x\\b")],
  // A word alone, in a comment as in a test's title: no text of the site needs it (say it otherwise if one ever does).
  ["a team member's name", r("(?<![-\\w./])mark", "eting(?![-\\w])")],
  // Only as a name: « sent to a researcher » is a plain word.
  ["a team member's name", r("\\(resear", "cher[,):]|\\bresear", "cher's\\b|\\b(by|as) resear", "cher\\b|\\bresear", "cher (read|wrote|found)\\b")],
  // The team's own notes, not in this repository (a User-Agent « rundata-interne » is not one).
  ["a path to the team's notes", r("(?<![-\\w])inter", "ne/|mark", "eting/|/mark", "eting\\b|\\bkit", "\\.md\\b|\\bident", "ite/")],
];

describe("the public repository", () => {
  it("names no internal task number nor team member in its code, tests and scripts", () => {
    const found: string[] = [];
    for (const f of [...walk("src"), ...walk("test"), ...walk("scripts")]) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const [what, re] of INTERNE) if (re.test(line)) found.push(`${f}:${i + 1} (${what}): ${line.trim().slice(0, 120)}`);
      });
    }
    expect(found).toEqual([]);
  });
});
