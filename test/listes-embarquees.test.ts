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
});
