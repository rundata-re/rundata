/**
 * The prefecture's press releases (src/providers/prefecture.ts `lireSite`) read from a machine of the project and written
 * to the Worker's KV store (src/providers/prefecture-copie.ts), where the Worker reads them: the prefecture's site cuts
 * the connection of Cloudflare's Workers (HTTP 520, 28/10/2026), while it answers that machine. With them, the pages of
 * the releases the volcano's phase is read from (src/providers/volcan.ts), which the Worker no longer reads either.
 * `npx tsx scripts/prefecture.ts [--kv]`, every 15 minutes with --kv (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in
 * the environment, scripts/kv.ts). Without --kv, prints what it read and writes nothing. Fails when the list cannot be
 * read: the copy in the store stays, said with its time by the Worker. With --kv, it also adds the releases about the
 * volcano that declare a phase to the record of its alerts (RELEVE_KV_KEY), never removing nor rewriting one, and
 * carries the record as it was before the run in the copy of the list (`Copie.releve`): the Worker reads it there.
 */
import "../src/bin/net.js";
import { ajouter, KV_KEY, KV_TTL_SECONDS, PAGE_AGAIN_MS, pageKey, RELEVE_KV_KEY, type Copie, type PageCopie, type Releve } from "../src/providers/prefecture-copie.js";
import { getPage, lireSite } from "../src/providers/prefecture.js";
import { doubtful, phaseOf, readReleasePage, volcanicPage, volcanReleases, type Page } from "../src/providers/volcan.js";
import { why } from "../src/types.js";
import { getKv, putKv } from "./kv.js";
import { readPage } from "./reunion-gouv.js";

// One page of the prefecture's site a minute at most, with the other collectors' (scripts/reunion-gouv.ts): the list,
// and the cyclone's section when its menu links one.
const read = (url: string) => readPage(getPage, url);

const kv = process.argv.includes("--kv");
const lu_le = new Date().toISOString();
const c: Copie = { ...(await lireSite(read)), lu_le };
// The record of the volcano's alerts, read before the list is written: carried by it, and added to below. A record
// that cannot be read is neither carried nor written (never replaced by a shorter one); the list is written all the same.
let before: Releve | undefined;
let releveLu = true;
if (kv) {
  try {
    before = await getKv<Releve>(RELEVE_KV_KEY);
  } catch (err) {
    releveLu = false;
    process.exitCode = 1;
    console.error(`relevé du volcan non lu : ${why(err)}`);
  }
  if (before?.entrees.length) c.releve = before.entrees;
}
console.log(`${c.liste.length} communiqués lus, le plus récent du ${c.liste[0].publie.slice(0, 10)} : « ${c.liste[0].titre} »${c.rubrique_non_lue ? " ; rubrique cyclone non lue" : ""}`);
if (kv) {
  await putKv(KV_KEY, c, KV_TTL_SECONDS);
  console.log(`écrit dans KV : ${KV_KEY}`);
}

// The pages of releases a run reads at most, beside the list: the others wait for the next run.
const PAGES_MAX = 3;
let pagesAsked = 0;
// The pages already had in this run: a release both doubtful and in force is asked once.
const known = new Map<string, Promise<Page | undefined>>();

/** A release's page: its copy while it is younger than a day, else read again, and copied with --kv. */
function pageOf(lien: string): Promise<Page | undefined> {
  if (!known.has(lien)) known.set(lien, readOrCopy(lien));
  return known.get(lien)!;
}

async function readOrCopy(lien: string): Promise<Page | undefined> {
  const had = kv ? await getKv<PageCopie>(pageKey(lien)) : undefined;
  if (had?.page && Date.now() - had.lu < PAGE_AGAIN_MS) return had.page;
  if (pagesAsked >= PAGES_MAX) {
    console.log(`page ${lien} : lue au passage suivant`);
    return had?.page;
  }
  pagesAsked++;
  try {
    const page = await readReleasePage(lien, read);
    if (kv) await putKv(pageKey(lien), { page, lu: Date.now() } satisfies PageCopie, KV_TTL_SECONDS);
    console.log(`page lue${kv ? " et écrite dans KV" : ""} : ${lien}, ${page.phrases.length} phrases`);
    return page;
  } catch (err) {
    // The list is written: the run fails for the page alone, its copy kept as it was.
    process.exitCode = 1;
    console.error(`page non lue : ${lien} : ${why(err)}`);
    return had?.page;
  }
}

// As the Worker reads the phase (volcan.ts readPhase): the pages of the releases whose list does not say whether they
// are about the volcano, then the page of the release in force.
const pages = new Map<string, Page>();
for (const r of doubtful(c.liste)) {
  const page = await pageOf(r.lien);
  if (page && volcanicPage(page)) pages.set(r.lien, page);
}
const phase = phaseOf(c.liste, pages);
if (phase) await pageOf(phase.lien);

// The record of the volcano's alerts: the releases of the list about it that declare a phase, added once each. A release
// about the volcano that declares none (a visit, a reminder) stays out, and is said.
const { phases, sans_phase } = volcanReleases(c.liste, pages);
for (const r of sans_phase) console.log(`relevé du volcan : « ${r.titre} » (${r.publie.slice(0, 10)}) ne déclare pas de phase, non ajouté`);
const { entrees, added } = ajouter(before?.entrees ?? [], phases.map((p) => ({ jour: p.jour, titre: p.titre, lien: p.lien, niveau: p.niveau })), new Date());
for (const e of added) console.log(`relevé du volcan : ajouté « ${e.titre} » du ${e.jour} (${e.niveau})${kv ? "" : ", sans écrire"}`);
// Written only when it grows: nothing else ever changes in it.
if (kv && releveLu && added.length) {
  await putKv(RELEVE_KV_KEY, { entrees, lu_le } satisfies Releve);
  console.log(`relevé du volcan : ${entrees.length} communiqués, écrit dans KV : ${RELEVE_KV_KEY}`);
  // The list written again with them, a few times a year: the Worker has them now, not at the next run.
  await putKv(KV_KEY, { ...c, releve: entrees } satisfies Copie, KV_TTL_SECONDS);
  console.log(`écrit dans KV : ${KV_KEY}, avec le relevé`);
}
