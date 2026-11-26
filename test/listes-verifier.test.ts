import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/verifier.py, the checks the build scripts' --verifier share (.github/workflows/listes.yml): its two functions run
 * in Python on small lists, their exit code and what they print.
 */
function run(code: string, env: Record<string, string> = {}): { status: number; out: string } {
  const prelude = [
    "import importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('verifier', 'scripts/verifier.py')",
    "v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)",
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-c", `${prelude}\n${code}`], { encoding: "utf8", env: { ...process.env, LISTES_VIEILLIES: "", LISTES_CODES: "", ...env } });
  if (r.error) throw r.error;
  return { status: r.status ?? -1, out: r.stdout + r.stderr };
}

describe("the bundled lists' checks", () => {
  const avant = "[{'n': 'A', 'x': 1}, {'n': 'B', 'x': 2}, {'n': 'C', 'x': 3}]";

  it("pass when the source's records are the bundled ones, in any order", () => {
    const r = run(`sys.exit(v.ecarts('Liste', ${avant}, [{'n': 'C', 'x': 3}, {'n': 'A', 'x': 1}, {'n': 'B', 'x': 2}], lambda r: r['n'], 0, 'build-x.py'))`);
    expect(r.status).toBe(0);
    expect(r.out).toContain("Liste : 3 dans la liste embarquée, 3 dans la source aujourd'hui ; 0 nouveaux, 0 disparus");
    expect(r.out).not.toContain("::error::");
  });

  it("say each record added or gone, and fail only past the threshold", () => {
    const now = "[{'n': 'A', 'x': 1}, {'n': 'D', 'x': 4}, {'n': 'C', 'x': 3}]";
    const shown = "lambda r: f\"{r['n']} ({r['x']})\"";
    const within = run(`sys.exit(v.ecarts('Liste', ${avant}, ${now}, lambda r: r['n'], 2, 'build-x.py', ${shown}))`);
    expect(within.status).toBe(0);
    expect(within.out).toContain("1 nouveaux, 1 disparus");
    expect(within.out).toContain("  nouveau : D (4)");
    expect(within.out).toContain("  disparu : B (2)");
    const past = run(`sys.exit(v.ecarts('Liste', ${avant}, ${now}, lambda r: r['n'], 1, 'build-x.py', ${shown}))`);
    expect(past.status).toBe(1);
    expect(past.out).toContain("::warning::Liste : la liste embarquée a vieilli (la source, 2 écarts). 2 écarts, seuil 1. Lancer scripts/build-x.py et proposer la PR.");
    expect(past.out).not.toContain("::error::");
  });

  it("count two records of the same key twice", () => {
    const r = run(`sys.exit(v.ecarts('Liste', [{'n': 'A'}], [{'n': 'A'}, {'n': 'A'}], lambda r: r['n'], 0, 'build-x.py'))`);
    expect(r.status).toBe(1);
    expect(r.out).toContain("1 nouveaux, 0 disparus");
  });

  it("say a list aged when the source is of a later day, and a broken check when its date could not be read", () => {
    const same = run("sys.exit(v.plus_recent('Liste', '2026-05-12', '2026-05-12T09:11:58+00:00', 'build-x.py'))");
    expect(same.status).toBe(0);
    expect(same.out).toContain("Liste : liste embarquée du 2026-05-12, la source du 2026-05-12");
    expect(run("sys.exit(v.plus_recent('Liste', '2026-10-24', '2026-05-12', 'build-x.py'))").status).toBe(0);
    const newer = run("sys.exit(v.plus_recent('Liste', '2026-05-12', '2026-11-02', 'build-x.py', 'la ressource'))");
    expect(newer.status).toBe(1);
    expect(newer.out).toContain("::warning::Liste : la liste embarquée a vieilli (la ressource du 2026-11-02). Lancer scripts/build-x.py et proposer la PR.");
    // A date that could not be read is a broken check, not an aged list.
    const unread = run("sys.exit(v.plus_recent('Liste', '2026-05-12', None, 'build-x.py'))");
    expect(unread.status).toBe(2);
    expect(unread.out).toContain("::error::Liste : vérification impossible, la date de la source n'a pas pu être lue.");
  });

  // The workflow's way: each check through `python3 -I scripts/verifier.py <script> …`, then `--bilan`.
  function job(scripts: Record<string, string>): { codes: number[]; bilan: { status: number; out: string }; json: unknown; summary: string } {
    const dir = mkdtempSync(join(tmpdir(), "listes-"));
    const env = { LISTES_VIEILLIES: join(dir, "v.jsonl"), LISTES_CODES: join(dir, "c.jsonl"), GITHUB_STEP_SUMMARY: join(dir, "summary.md") };
    writeFileSync(env.GITHUB_STEP_SUMMARY, "");
    const load = "import importlib.util, sys\nspec = importlib.util.spec_from_file_location('verifier', sys.argv[1])\nv = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)\n";
    const codes = Object.entries(scripts).map(([name, body]) => {
      writeFileSync(join(dir, name), load + body + "\n");
      const r = spawnSync("python3", ["-I", "scripts/verifier.py", join(dir, name), `${process.cwd()}/scripts/verifier.py`], { encoding: "utf8", env: { ...process.env, ...env } });
      return r.status ?? -1;
    });
    const r = spawnSync("python3", ["-I", `${process.cwd()}/scripts/verifier.py`, "--bilan"], { encoding: "utf8", cwd: dir, env: { ...process.env, ...env } });
    return { codes, bilan: { status: r.status ?? -1, out: r.stdout + r.stderr }, json: JSON.parse(readFileSync(join(dir, "listes-vieillies.json"), "utf8")), summary: readFileSync(env.GITHUB_STEP_SUMMARY, "utf8") };
  }

  it("leave the workflow green when a list aged, and say it in the summary and listes-vieillies.json", () => {
    const j = job({
      "build-a.py": "sys.exit(v.plus_recent('Liste A', '2026-05-12', '2026-11-02', 'build-a.py'))",
      "build-b.py": "sys.exit(v.ecarts('Liste B', [{'n': 1}], [{'n': 1}], lambda r: r['n'], 0, 'build-b.py'))",
    });
    // The aged list's step stays green too: its warning says it.
    expect(j.codes).toEqual([0, 0]);
    expect(j.bilan.status).toBe(0);
    expect(j.json).toEqual([{ liste: "Liste A", script: "build-a.py", source: "la source", date: "2026-11-02", ecart: null, consigne: "Lancer scripts/build-a.py et proposer la PR." }]);
    expect(j.summary).toContain("| Liste A | la source | 2026-11-02 |  | Lancer scripts/build-a.py et proposer la PR. |");
    expect(j.summary).toContain("Vérifications faites : 2, aucune cassée.");
  });

  it("make it red when a check is broken: an exception, an exit with a message, or a 1 that names no list", () => {
    const j = job({
      "build-a.py": "sys.exit(v.plus_recent('Liste A', '2026-05-12', '2026-11-02', 'build-a.py'))",
      "build-c.py": "import urllib.request\nraise urllib.error.URLError('la source ne répond pas')",
      "build-d.py": "raise SystemExit('couche tronquée : lire par pages')",
      "build-e.py": "sys.exit(1)",
    });
    expect(j.codes).toEqual([0, 2, 2, 2]);
    expect(j.bilan.status).toBe(1);
    expect(j.bilan.out).toContain("::error::Vérifications cassées : build-c.py, build-d.py, build-e.py.");
    expect(j.summary).toContain("| Liste A |");
    expect(j.json).toHaveLength(1);
  });

  it("are offered by each list's build script, and run every Monday by the job that says which list is to be redone", () => {
    const yml = readFileSync(".github/workflows/listes.yml", "utf8");
    for (const name of ["sante", "radars", "accidents", "loyers", "internet", "creches", "vitesses", "velo", "carte-scolaire", "ips", "parcoursup", "traces", "aires"]) {
      expect(readFileSync(`scripts/build-${name}.py`, "utf8"), name).toMatch(/--verifier/);
      const id = name.replace("-", "_");
      expect(yml, name).toContain(`id: ${id}\n        continue-on-error: true\n        run: python3 -I scripts/verifier.py build-${name}.py --verifier`);
      // Not in the step that fails on any gap: an aged list of these is not a failure.
      expect(yml, name).not.toContain(`steps.${id}.outcome`);
    }
    expect(yml).toContain("LISTES_VIEILLIES: listes-vieillies.jsonl");
    expect(yml).toContain("LISTES_CODES: listes-codes.jsonl");
    expect(yml).toContain("        if: always()\n        run: python3 -I scripts/verifier.py --bilan");
    expect(yml).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40} # v\d.*\n        with:\n          name: listes-vieillies\n          path: listes-vieillies.json/);
  });
});
