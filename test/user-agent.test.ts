import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UA_RUNDATA, USER_AGENT } from "../src/http.js";

// rundata.re reads every source under one name, the one /a-propos#lecteur explains: the Worker, the build scripts and
// the workflows alike. The letters to the portals say it is so; this keeps it so.
const files = (dirs: string[]) => execFileSync("git", ["ls-files", ...dirs], { encoding: "utf8" }).split("\n").filter(Boolean);
const read = (f: string) => readFileSync(f, "utf8");
const lines = (f: string) => read(f).split("\n").map((l, i) => ({ at: `${f}:${i + 1}`, l }));

describe("the name rundata.re reads under", () => {
  it("is one: the Worker's default, and the scripts' file, are UA_RUNDATA", () => {
    expect(UA_RUNDATA).toBe("rundata.re (+https://rundata.re/a-propos#lecteur; contact@rundata.re)");
    expect(USER_AGENT).toBe(UA_RUNDATA);
    expect(read("scripts/user-agent.txt")).toBe(`${UA_RUNDATA}\n`);
  });

  it("is never the old one nor another written by hand, in src/, scripts/ or .github/", () => {
    const bad = files(["src", "scripts", ".github"]).flatMap(lines).filter(({ l }) =>
      /reunion-temps-reel\/|"reunion-temps-reel \(/.test(l) ||
      /["']User-Agent["']\s*:\s*["'`]/i.test(l) ||
      (/["'`]rundata\.re \(/.test(l) && !l.includes(UA_RUNDATA)));
    expect(bad.map((x) => x.at)).toEqual([]);
  });

  it("is sent by every Python script that reads the network: never Python-urllib's", () => {
    const silent = files(["scripts"]).filter((f) => f.endsWith(".py")).filter((f) => {
      const s = read(f);
      if (!/\burlopen\(|\burlretrieve\(/.test(s)) return false;
      // Its agent from the one file, or from build-traces' (bt.UA); and no urlopen of a bare address.
      return !(/user-agent\.txt|\bbt\.UA\b/.test(s)) || /\burlopen\(\s*(?:f?["']|[A-Z_]+\s*[,)]|url\s*[,)])/.test(s) || /\burlretrieve\(/.test(s);
    });
    expect(silent).toEqual([]);
  });

  it("is given to every curl of a workflow, but those that check rundata.re itself", () => {
    const bare = files([".github"]).flatMap(lines)
      .filter(({ l }) => /\bcurl\s/.test(l) && !/^\s*#/.test(l))
      .filter(({ l }) => !/\s(?:-A|--user-agent)\s/.test(l) && !/["']https:\/\/rundata\.re[$/"']/.test(l));
    expect(bare.map((x) => x.at)).toEqual([]);
  });
});
