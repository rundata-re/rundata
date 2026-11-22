import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { lignesAVenir, ranger, typographie } from "../scripts/ranger-nouveautes.js";

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
