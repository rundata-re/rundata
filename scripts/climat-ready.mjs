/**
 * Fails when the climate archive is not in the D1 database yet: it is imported once by hand
 * (`python3 -I scripts/build-climat.py --dir … --out dist/climat.sql`, then `wrangler d1 execute rundata-climat --remote --file dist/climat.sql`;
 * the hourly one the same way with scripts/build-climat-h.py and rundata-climat-h), before the first deployment of a
 * version that reads it.
 *
 * It asks D1 itself, up to three times: an answer it cannot read (D1 or wrangler failing for a moment) is asked again,
 * then said as D1 not answering, not as an archive absent (the deployment of 02/11/2026 stopped on « 0 stations »).
 *
 * Usage: node scripts/climat-ready.mjs [horaire]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const hourly = process.argv[2] === "horaire";
const db = hourly ? "rundata-climat-h" : "rundata-climat";
const what = hourly ? "L'archive horaire" : "L'archive climatologique";
const TRIES = 3;

/** The number of stations in wrangler's answer, or undefined when the answer cannot be read. */
function stations(out) {
  try {
    const n = JSON.parse(out).flatMap((r) => r.results ?? [])[0]?.n;
    return typeof n === "number" ? n : undefined;
  } catch {
    return undefined;
  }
}

let n;
let last = "";
for (let i = 1; i <= TRIES && n === undefined; i++) {
  if (i > 1) await new Promise((r) => setTimeout(r, 10_000));
  try {
    const { stdout } = await promisify(execFile)("npx", ["wrangler", "d1", "execute", db, "--remote", "--json", "--command", "SELECT COUNT(*) AS n FROM postes"], { maxBuffer: 1 << 20 });
    n = stations(stdout);
    if (n === undefined) last = stdout.trim().slice(0, 300);
  } catch (err) {
    last = String(err.stderr || err.message).trim().slice(0, 300);
  }
  if (n === undefined) console.error(`D1 (${db}) : réponse illisible, essai ${i} sur ${TRIES}. ${last}`);
}
if (n === undefined) {
  console.error(`D1 (${db}) n'a pas répondu après ${TRIES} essais : l'archive n'a pas pu être comptée. Relancer le déploiement.`);
  process.exit(1);
}
// Some 250 stations in the daily archive since 1900, some 100 in the hourly one since 2000.
if (n < (hourly ? 50 : 100)) {
  console.error(`${what} est absente de D1 (${n} stations). L'importer d'abord avec scripts/build-climat${hourly ? "-h" : ""}.py.`);
  process.exit(1);
}
console.log(`${what} est dans D1 (${n} stations).`);
