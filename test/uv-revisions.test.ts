import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceRevision } from "../src/web/revisions.js";

// The UV index measured at Moufia goes into prevision_meteo's answer, which the weather page of each place keeps in its
// copy (web:lieu, PrevisionAnswer.indice_uv_mesure), and its two sources into the sources counted (web:chiffres). Each
// family's revision says it, so that a copy made by the old code, without the measure, is built again at the deploy.
const REVISIONS = readFileSync(new URL("../src/web/revisions.ts", import.meta.url), "utf8");
/** The comment lines just above `family: N,` in RENDU_REVISION. */
function why(family: string): string {
  const lines = REVISIONS.split("\n");
  const at = lines.findIndex((l) => new RegExp(`^  ${family}: \\d+,$`).test(l));
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i].trim().startsWith("//"); i--) out.unshift(lines[i]);
  return out.join("\n");
}

describe("les révisions de l'indice UV mesuré", () => {
  it("raise the weather page of the places, whose copy holds the measure", () => {
    expect(why("lieu")).toMatch(/UV index measured/i);
  });

  it("raise the figures, which count its two sources", () => {
    expect(why("chiffres")).toMatch(/UV index measured/i);
  });

  it("declare the revision of the measure's own entry", () => {
    const src = readFileSync(new URL("../src/providers/uv-mesure.ts", import.meta.url), "utf8");
    const key = /export const KEY = "([^"]+)"/.exec(src)?.[1];
    expect(key).toBeTruthy();
    expect(sourceRevision(key!), "lecture gardée sans révision déclarée dans SOURCE_REVISION").toBeGreaterThanOrEqual(1);
  });
});
