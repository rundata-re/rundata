import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The canyons and the « sentiers marmailles » are bundled lists, built from the Région's portal. Its date of change moves
// with no change of content (16/11/2026: both datasets « modified », both lists rebuilt the same): every Monday, each
// list is rebuilt in memory and compared with the bundled one, never written; the job fails when they differ.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("le contrôle du lundi des listes embarquées", () => {
  it("can rebuild the canyons and the sentiers marmailles in memory to compare them, writing nothing", () => {
    // The Monday job (.github/workflows/listes.yml) runs `python3 -I scripts/<script>.py --verifier 0` for each.
    for (const s of ["build-canyons", "build-marmailles"]) {
      const py = read(`scripts/${s}.py`);
      expect(py, s).toContain('"--verifier"');
      // Each entry by its id and all its fields, not the day it was built: a list rebuilt the same is the same.
      expect(py, s).toContain("def verifier(rows, ecart):");
      // Compared before anything is written.
      expect(py.indexOf("sys.exit(verifier("), s).toBeGreaterThan(0);
      expect(py.indexOf("sys.exit(verifier("), s).toBeLessThan(py.indexOf(".write_text("));
    }
  });

  it("checks the places we give against a second source, failing only on a gap the reference does not hold", () => {
    const yml = read(".github/workflows/listes.yml");
    expect(yml).toContain("python3 -I scripts/verifier-positions.py --verifier");
    expect(yml).toContain("steps.positions.outcome != 'success'");
    const py = read("scripts/verifier-positions.py");
    // One request to each source, under the reader's name, and the reference rewritten only on demand.
    expect(py).toContain('(Path(__file__).parent / "user-agent.txt").read_text(');
    expect(py.match(/^(ANNUAIRE|GEOCODAGE_CSV|OVERPASS) = /gm)).toHaveLength(3);
    expect(py.indexOf("if args.ecrire:")).toBeLessThan(py.indexOf(".write_text("));
    // The reference: the annuaire's gaps by the office's id, the communes' by their name; every commune has its town hall.
    const ref = JSON.parse(read("scripts/positions-reference.json")) as Record<string, Record<string, { ecart_m: number | null }>>;
    expect(Object.keys(ref).sort()).toEqual(["annuaire", "centres"]);
    for (const v of Object.values(ref.annuaire)) expect(v.ecart_m).toBeGreaterThan(300);
    for (const [c, v] of Object.entries(ref.centres)) expect(v.ecart_m, c).toBeGreaterThan(1000);
  });

  it("is run by the Monday job, each list on its own step, any difference failing it", () => {
    const yml = read(".github/workflows/listes.yml");
    for (const s of ["build-canyons", "build-marmailles", "build-monuments"]) expect(yml, s).toContain(`run: python3 -I scripts/${s}.py --verifier 0`);
    // The step that says what is to be redone names each of them.
    expect(yml).toContain("steps.canyons.outcome != 'success'");
    expect(yml).toContain("steps.marmailles.outcome != 'success'");
    expect(yml).toContain("steps.monuments.outcome != 'success'");
  });
});
