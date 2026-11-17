/**
 * The water of the whole island (src/eau/ile.ts) as JSON for the Worker's KV store: `npx tsx scripts/eau-ile.ts eau-ile.json`.
 * Run four times a day by .github/workflows/eau.yml. Fails without writing when most sources did not answer, after one
 * more try 3 min later (ile.ts gatherForCopy): better the last good copy than a thin one. The log says each source's first error.
 */
import { writeFileSync } from "node:fs";
import "../src/bin/net.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { gatherForCopy, thin } from "../src/eau/ile.js";

const out = process.argv[2];
if (!out) throw new Error("usage : npx tsx scripts/eau-ile.ts <fichier.json>");
const ile = await gatherForCopy(new Cache(new MemoryStore()));
const tooThin = thin(ile);
if (tooThin) throw new Error(tooThin);
writeFileSync(out, JSON.stringify(ile));
console.log(`${ile.baignades.length} sites de baignade, ${ile.communes.length} communes`);
