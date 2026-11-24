/**
 * Fails when the bus timetables this version reads are not all in the D1 database yet. A network whose timetables
 * changed is imported first (`scripts/build-transit.py --d1 rundata-transports`, then the SQL it writes), then the
 * Worker is deployed: deployed before, it would find no departure for that network.
 *
 * It asks D1 itself, up to three times, as scripts/climat-ready.mjs does: an answer it cannot read (D1 or wrangler
 * failing for a moment) is asked again 10 s later, then said as D1 not answering, never as timetables absent. An
 * answer it can read is final at the first try.
 *
 * Usage: node scripts/transit-ready.mjs
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const DB = "rundata-transports";
const TRIES = 3;
const WAIT_MS = 10_000;

/** The feeds in wrangler's answer to « SELECT feed FROM feeds », or undefined when the answer cannot be read. */
export function feeds(out) {
  try {
    const answer = JSON.parse(out);
    if (!Array.isArray(answer) || !answer.length || !answer.every((r) => Array.isArray(r?.results))) return undefined;
    return new Set(answer.flatMap((r) => r.results).map((r) => r.feed));
  } catch {
    return undefined;
  }
}

/** The networks of src/transit/network.json whose feed is not among `present`, each as « id (feed) ». */
export function missing(network, present) {
  return Object.entries(network.networks).filter(([, n]) => !present.has(n.feed)).map(([id, n]) => `${id} (${n.feed})`);
}

/**
 * Asks D1 through `ask` (wrangler's standard output) until its answer can be read, TRIES times at most, `wait`ing
 * between two tries: whether every network's timetables are there, and after how many tries.
 */
export async function ready(network, ask, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}) {
  let last = "";
  for (let i = 1; i <= TRIES; i++) {
    if (i > 1) await wait(WAIT_MS);
    let present;
    try {
      const out = await ask();
      present = feeds(out);
      if (!present) last = String(out).trim().slice(0, 300);
    } catch (err) {
      last = String(err.stderr || err.message).trim().slice(0, 300);
    }
    if (present) {
      const absent = missing(network, present);
      return { ok: !absent.length, tries: i, present: present.size, missing: absent };
    }
    log(`D1 (${DB}) : réponse illisible, essai ${i} sur ${TRIES}. ${last}`);
  }
  return { ok: false, tries: TRIES, unread: true, last };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const network = JSON.parse(readFileSync(new URL("../src/transit/network.json", import.meta.url), "utf8"));
  const ask = async () => (await promisify(execFile)("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", "SELECT feed FROM feeds"], { maxBuffer: 1 << 20 })).stdout;
  const r = await ready(network, ask, undefined, (line) => console.error(line));
  if (r.unread) {
    console.error(`D1 (${DB}) n'a pas répondu après ${TRIES} essais : les horaires n'ont pas pu être vérifiés. Relancer le déploiement.`);
    process.exit(1);
  }
  if (!r.ok) {
    console.error(`Horaires absents de D1 pour : ${r.missing.join(", ")}. Importer d'abord avec scripts/build-transit.py --d1.`);
    process.exit(1);
  }
  console.log(`Les ${Object.keys(network.networks).length} réseaux de cette version sont dans D1 (${r.present} jeux d'horaires).`);
}
