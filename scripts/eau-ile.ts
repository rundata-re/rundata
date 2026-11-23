/**
 * The water of the whole island (src/eau/ile.ts) as JSON for the Worker's KV store:
 * `npx tsx scripts/eau-ile.ts eau-ile.json [copie-avant.json]`. Run four times a day by .github/workflows/eau.yml.
 * A thin gathering gets one more try 3 min later (ile.ts gatherForCopy). If a source still does not answer, the half
 * it gives is kept from the copy already stored (`copie-avant.json`, read from the KV store), with its own time, and
 * the other half is written (ile.ts keep): each kept half is a `::warning::` of the run, not a failure. Nothing is
 * written when neither half was read and a copy is stored; the run fails only when nothing was read and no copy is
 * stored. The log says each source's first error.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import "../src/bin/net.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { gatherForCopy, keep, parseCopy } from "../src/eau/ile.js";

const [out, avant] = process.argv.slice(2);
if (!out) throw new Error("usage : npx tsx scripts/eau-ile.ts <fichier.json> [copie-avant.json]");
const before = avant && existsSync(avant) ? parseCopy(readFileSync(avant, "utf8")) : null;
const fresh = await gatherForCopy(new Cache(new MemoryStore()));
const { ile, warnings, fail } = keep(fresh, before);
for (const w of warnings) {
  console.log(`::warning title=Qualité de l'eau::${w}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ⚠️ ${w}\n`);
}
if (fail) throw new Error(fail);
if (ile) {
  writeFileSync(out, JSON.stringify(ile));
  console.log(`${ile.baignades.length} sites de baignade, ${ile.communes.length} communes`);
} else console.log("rien d'écrit : la copie gardée reste telle quelle");
