/**
 * The changes waiting in nouveautes-a-venir/, put at the top of the NOUVEAUTES list of src/nouveautes.ts when a pull
 * request is merged, dated then (heure de La Réunion); their files are then deleted, and `npm run changelog` rebuilds
 * CHANGELOG.md.
 *
 * Why: every pull request with a visible change used to add its line at the top of that list and rebuild CHANGELOG.md,
 * so each merge put every other open pull request in conflict on those same lines, and GitHub runs no test on a pull
 * request in conflict. A pull request now writes its line in a file of its own (nouveautes-a-venir/<branche>.txt): two
 * of them never touch the same file, and the line still goes through review with the rest of the change.
 *
 * Usage: npx tsx scripts/ranger-nouveautes.ts   (does nothing when no line waits)
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DOSSIER = new URL("../nouveautes-a-venir/", import.meta.url);
const SOURCE = new URL("../src/nouveautes.ts", import.meta.url);

/** The site's typography, so that a line can be written with ordinary spaces: a no-break space before « : ; ? ! » and inside « ». */
export function typographie(texte: string): string {
  return texte.trim().replace(/ +([:;?!])/g, " $1").replace(/« +/g, "« ").replace(/ +»/g, " »");
}

/** The waiting lines, file by file in name order, one change per non-empty line. */
export function lignesAVenir(dossier: URL = DOSSIER): { fichier: string; texte: string }[] {
  let noms: string[];
  try {
    noms = readdirSync(dossier).filter((n) => n.endsWith(".txt")).sort();
  } catch {
    return [];
  }
  return noms.flatMap((fichier) =>
    readFileSync(new URL(fichier, dossier), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => ({ fichier, texte: typographie(l) })));
}

/** La Réunion has no daylight saving time: UTC+4 all year. */
function heureReunion(ms: number): string {
  return `${new Date(ms + 4 * 3600_000).toISOString().slice(0, 16)}:00+04:00`;
}

/**
 * The source with `textes` at the top of NOUVEAUTES, in their order, all dated `maintenant`, or one minute after the
 * newest line already listed when that one is later (the list stays newest first).
 */
export function ranger(source: string, textes: string[], maintenant: Date): string {
  const debut = source.indexOf("export const NOUVEAUTES");
  const ouverture = source.indexOf("[\n", debut) + 2;
  if (debut < 0 || ouverture < 2) throw new Error("NOUVEAUTES introuvable dans src/nouveautes.ts");
  const dates = [...source.slice(debut).matchAll(/date: "([^"]+)"/g)].map((m) => Date.parse(m[1]));
  const minute = 60_000;
  const t = Math.max(Math.floor(maintenant.getTime() / minute) * minute, dates.length ? Math.max(...dates) + minute : 0);
  const lignes = textes.map((x) => `  { date: "${heureReunion(t)}", texte: ${JSON.stringify(x).replace(/ /g, "\\u00a0")} },\n`);
  return source.slice(0, ouverture) + lignes.join("") + source.slice(ouverture);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const lignes = lignesAVenir();
  if (lignes.length) {
    writeFileSync(SOURCE, ranger(readFileSync(SOURCE, "utf8"), lignes.map((l) => l.texte), new Date()));
    for (const fichier of new Set(lignes.map((l) => l.fichier))) rmSync(fileURLToPath(new URL(fichier, DOSSIER)));
  }
  console.log(`${lignes.length} nouveauté(s) rangée(s)`);
}
