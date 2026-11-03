/**
 * The acts of the prefecture's « recueil des actes administratifs » that name a place of the island, read from a
 * machine of the project and written to the Worker's KV store (src/providers/raa.ts), as the prefecture's releases are
 * (scripts/prefecture.ts): its site cuts the connection of Cloudflare's Workers. A run reads the year's list, then the
 * recueils of the last 15 days it has not read yet, 3 at most: 4 pages, one a minute with the other collectors'
 * (scripts/reunion-gouv.ts), even when many are left to read (the next runs read them). Every title goes through the
 * filters of scripts/raa-lire.ts before anything is kept: a title left out is never written.
 * `npx tsx scripts/raa.ts [--kv]`, every hour with --kv (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
 * environment, scripts/kv.ts), writing only when something changed. Without --kv, reads as a first run would, prints
 * what it keeps and writes nothing.
 */
import "../src/bin/net.js";
import { getPage } from "../src/providers/prefecture.js";
import { type Copie, DAYS, KV_KEY, KV_TTL_SECONDS } from "../src/providers/raa.js";
import { why } from "../src/types.js";
import { getKv, putKv } from "./kv.js";
import { garder, listeDe, parseListe, parseRecueil, prenoms } from "./raa-lire.js";
import { readPage } from "./reunion-gouv.js";

const RECUEILS_MAX = 3;

const kv = process.argv.includes("--kv");
const before = kv ? await getKv<Copie>(KV_KEY) : undefined;
const now = new Date();
const today = new Date(now.getTime() + 4 * 3600_000);
const since = new Date(today.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
// The year's page: on the first days of January, the recueils of December are on the page of the year before, not read.
const liste = parseListe(await readPage(getPage, listeDe(today.getUTCFullYear())));
if (!liste.length) throw new Error(`aucun recueil dans la liste ${listeDe(today.getUTCFullYear())} : page changée ?`);

const recueils = (before?.recueils ?? []).filter((r) => r.date >= since);
const actes = (before?.actes ?? []).filter((a) => a.recueil.date >= since);
const read = new Set(recueils.map((r) => r.lien));
const noms = prenoms();
const todo = liste.filter((r) => r.date >= since && !read.has(r.lien));
for (const r of todo.slice(0, RECUEILS_MAX)) {
  try {
    const lus = parseRecueil(await readPage(getPage, r.lien), r);
    const { ajoutes, gardes } = garder(lus, r, noms, actes);
    actes.push(...ajoutes);
    recueils.push({ ...r, actes: lus.length, gardes });
    console.log(`${r.titre} : ${lus.length} actes, ${gardes} gardés, ${ajoutes.length} nommant un lieu`);
  } catch (err) {
    // Read again at the next run.
    process.exitCode = 1;
    console.error(`recueil non lu : ${r.lien} : ${why(err)}`);
  }
}
if (todo.length > RECUEILS_MAX) console.log(`${todo.length - RECUEILS_MAX} recueils lus aux passages suivants`);

const order = <T extends { date: string }>(x: T, y: T) => y.date.localeCompare(x.date);
const next: Copie = {
  actes: actes.sort((x, y) => order(x.recueil, y.recueil)),
  recueils: recueils.sort(order),
  lu_le: now.toISOString(),
};
console.log(`${next.actes.length} actes nommant un lieu, de ${next.recueils.length} recueils ; ${JSON.stringify(next).length} octets`);
const same = before && JSON.stringify({ ...before, lu_le: "" }) === JSON.stringify({ ...next, lu_le: "" });
if (kv && !same) {
  await putKv(KV_KEY, next, KV_TTL_SECONDS);
  console.log(`écrit dans KV : ${KV_KEY}`);
}
