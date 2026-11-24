import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { lignesAVenir, ranger, typographie } from "../scripts/ranger-nouveautes.js";
import { NOUVEAUTES } from "../src/nouveautes.js";
import { insecables } from "../src/typographie.js";

describe("the changes waiting to be listed (nouveautes-a-venir/)", () => {
  it("follow the rules of the list: one plain sentence each, 140 characters at most, nothing internal", () => {
    for (const { fichier, texte } of lignesAVenir()) {
      expect(texte.length, `${fichier} : ${texte}`).toBeLessThanOrEqual(140);
      expect(texte, fichier).not.toMatch(/quota|(?<!date )limite|sous-requête|cloudflare|staging|tailnet|NAS\b/i);
      expect(texte, fichier).not.toMatch(/\\u00a0|^\s*[-*] /);
    }
  });

  it("are read one per line, file by file, with the site's no-break spaces", () => {
    const dossier = mkdtempSync(join(tmpdir(), "nouv-"));
    writeFileSync(join(dossier, "b-branche.txt"), "Bus : une ligne.\n\n« Deux » ?\n");
    writeFileSync(join(dossier, "a-branche.txt"), "Mer : une autre.\n");
    writeFileSync(join(dossier, "README.md"), "pas une nouveauté");
    expect(lignesAVenir(pathToFileURL(dossier + "/"))).toEqual([
      { fichier: "a-branche.txt", texte: "Mer : une autre." },
      { fichier: "b-branche.txt", texte: "Bus : une ligne." },
      { fichier: "b-branche.txt", texte: "« Deux » ?" },
    ]);
    expect(typographie("  Volcan  ; éruption !  ")).toBe("Volcan ; éruption !");
  });

  it("get every no-break space the site and the assistants' answers put: figure and unit, « à » and its hour, thousands", () => {
    // Written with ordinary spaces in the pull request; said by sources_donnees through the same rule (src/typographie.ts):
    // a line filed without them was not the text the tool answers, and the check of that answer turned red at the merge.
    expect(typographie("Coupures : avis relus depuis plus de 2 h (eau) ou 6 h (courant), à 08:00, à 3 070 m.")).toBe(
      "Coupures\u00a0: avis relus depuis plus de 2\u00a0h (eau) ou 6\u00a0h (courant), à\u00a008:00, à\u00a03\u202f070\u00a0m.");
    // The same text whatever spaces the line already had.
    expect(typographie("2\u00a0h, 39 %")).toBe("2\u00a0h, 39\u00a0%");
    // In the source, both kinds are written as escapes, never as invisible characters.
    const rangee = ranger("export const NOUVEAUTES = [\n];\n", [typographie("Sommets à 3 070 m : neige.")], new Date("2026-11-24T00:00:00Z"));
    expect(rangee).toContain('texte: "Sommets à\\u00a03\\u202f070\\u00a0m\\u00a0: neige."');
  });

  it("leaves every line already listed as the tool says it: the list holds the site's no-break spaces", () => {
    for (const n of NOUVEAUTES.slice(0, 30)) expect(insecables(n.texte), n.date).toBe(n.texte);
  });

  it("go at the top of NOUVEAUTES, dated at the merge, never before the newest line", () => {
    const source = `x\nexport const NOUVEAUTES: { date: string; texte: string }[] = [\n  { date: "2026-11-22T10:29:00+04:00", texte: "Avant." },\n];\n`;
    const plusTard = ranger(source, ["Un : \"deux\"", "Trois."], new Date("2026-11-22T20:15:42Z"));
    expect(plusTard).toBe(`x\nexport const NOUVEAUTES: { date: string; texte: string }[] = [\n` +
      `  { date: "2026-11-23T00:15:00+04:00", texte: "Un\\u00a0: \\"deux\\"" },\n` +
      `  { date: "2026-11-23T00:15:00+04:00", texte: "Trois." },\n` +
      `  { date: "2026-11-22T10:29:00+04:00", texte: "Avant." },\n];\n`);
    // a clock behind the newest line: one minute after it
    expect(ranger(source, ["Un."], new Date("2026-11-22T05:00:00Z"))).toContain(`{ date: "2026-11-22T10:30:00+04:00", texte: "Un." }`);
  });
});
