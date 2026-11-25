import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceRevision } from "../src/web/revisions.js";

// An event's start time alone, the whole text's hour for a cut excerpt and OpenAgenda's links in /fr/ change what every
// agenda's read keeps; the quote that opens an article changes the island's news kept. Each revision says it, so that
// a copy made by the old code is built again at the deploy.
const REVISIONS = readFileSync(new URL("../src/web/revisions.ts", import.meta.url), "utf8");
/** The comment lines just above `family: N,`, in the table that starts at `table`. */
function why(table: string, family: string): string {
  const lines = REVISIONS.split("\n");
  const from = lines.findIndex((l) => l.startsWith(`export const ${table}`));
  const at = lines.findIndex((l, i) => i > from && new RegExp(`^  "?${family}"?: \\d+,$`).test(l));
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i].trim().startsWith("//"); i--) out.unshift(lines[i]);
  return out.join("\n");
}

describe("les révisions de l'heure de début et du chapeau", () => {
  it("raise every agenda's read and the events' page", () => {
    expect(why("SOURCE_REVISION", "agenda")).toMatch(/start time alone/);
    expect(why("RENDU_REVISION", "agenda")).toMatch(/start time alone/);
    expect(sourceRevision("agenda:cirest")).toBeGreaterThanOrEqual(2);
    expect(sourceRevision("agenda:le_tampon")).toBeGreaterThanOrEqual(2);
  });

  it("raise the news' read and page", () => {
    expect(why("SOURCE_REVISION", "actualites:fil")).toMatch(/opens on a quote/);
    expect(why("RENDU_REVISION", "actualites")).toMatch(/opens on a quote/);
  });
});
