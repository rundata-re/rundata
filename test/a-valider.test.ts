import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A word waiting for validation is written « {à valider} … » in src (a commune's children's page, its legend): it must
// be replaced by the validated words, and the user's yes, before the page goes out.
const files = (dir: URL): URL[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(new URL(`${e.name}/`, dir)) : /\.(ts|json)$/.test(e.name) ? [new URL(e.name, dir)] : []));

describe("the words of the pages", () => {
  it("hold no « {à valider} » left to validate", () => {
    const left = files(new URL("../src/", import.meta.url)).filter((f) => readFileSync(f, "utf8").includes("{à valider}")).map((f) => f.pathname.replace(/^.*\/src\//, "src/"));
    expect(left).toEqual([]);
  });
});
