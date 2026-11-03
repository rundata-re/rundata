/**
 * The acts of the prefecture's « recueil des actes administratifs » that name a place of the island, read from a
 * machine of the project and written to the Worker's KV store (src/providers/raa.ts), as the prefecture's releases are
 * (scripts/prefecture.ts): its site cuts the connection of Cloudflare's Workers. A run reads the year's list, then the
 * recueils of the last 15 days it has not read yet, 3 at most: 4 pages, one a minute with the other collectors'
 * (scripts/reunion-gouv.ts), even when many are left to read (the next runs read them). Every title goes through the
 * filters of scripts/raa-lire.ts before anything is kept: a title left out is never written.
 * What it read is kept on the machine (STATE), and written to the store only once the recueils of the 15 days are all
 * read: until then « no act names this place » would not be true. A copy written after that, while recueils are left
 * to read again (the site silent for hours), says since when they are all read (`lus_depuis`).
 * `npx tsx scripts/raa.ts [--kv]`, every hour with --kv (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
 * environment, scripts/kv.ts), writing only when something changed. Without --kv, reads as a first run would, prints
 * what it keeps and writes nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import "../src/bin/net.js";
import { getPage } from "../src/providers/prefecture.js";
import { type Copie, DAYS, KV_KEY, KV_TTL_SECONDS } from "../src/providers/raa.js";
import { why } from "../src/types.js";
import { getKv, putKv } from "./kv.js";
import { couverture, ecrire, garder, listeDe, parseListe, parseRecueil, prenoms, suite } from "./raa-lire.js";
import { readPage } from "./reunion-gouv.js";

const RECUEILS_MAX = 3;
const STATE = join(homedir(), ".local/state/rundata-collecte/raa.json");

/** What the collector read, and what it last wrote to the store (without its `lu_le`), if it did. */
interface Etat {
  copie: Copie;
  ecrite?: string;
}

const sansHeure = (c: Copie) => JSON.stringify({ ...c, lu_le: "" });

function etat(): Etat | undefined {
  try {
    return JSON.parse(readFileSync(STATE, "utf8")) as Etat;
  } catch {
    return undefined;
  }
}

const kv = process.argv.includes("--kv");
// Without the machine's state (its first run, or lost), the store's copy, which covers the 15 days.
const had = kv ? etat() ?? (await getKv<Copie>(KV_KEY).then((c) => c && { copie: c, ecrite: sansHeure(c) })) : undefined;
const before = had?.copie;
const now = new Date();
const today = new Date(now.getTime() + 4 * 3600_000);
const since = new Date(today.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
// The year's page: on the first days of January, the recueils of December are on the page of the year before, not read.
const page = await readPage(getPage, listeDe(today.getUTCFullYear()));
const liste = parseListe(page);
if (!liste.length) throw new Error(`aucun recueil dans la liste ${listeDe(today.getUTCFullYear())} : page changée ?`);

const recueils = (before?.recueils ?? []).filter((r) => r.date >= since);
const actes = (before?.actes ?? []).filter((a) => a.recueil.date >= since);
const noms = prenoms();
const todo = couverture(liste, suite(page), new Set(recueils.map((r) => r.lien)), since).a_lire;
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

const cover = couverture(liste, suite(page), new Set(recueils.map((r) => r.lien)), since);
if (cover.a_lire.length) console.log(`${cover.a_lire.length} recueils lus aux passages suivants`);
const order = <T extends { date: string }>(x: T, y: T) => y.date.localeCompare(x.date);
const next: Copie = {
  actes: actes.sort((x, y) => order(x.recueil, y.recueil)),
  recueils: recueils.sort(order),
  ...(cover.lus_depuis && { lus_depuis: cover.lus_depuis }),
  lu_le: now.toISOString(),
};
console.log(`${next.actes.length} actes nommant un lieu, de ${next.recueils.length} recueils${next.lus_depuis ? `, lus sans trou depuis le ${next.lus_depuis}` : ""} ; ${JSON.stringify(next).length} octets`);
if (kv) {
  let ecrite = had?.ecrite;
  const ready = ecrire(!!ecrite, cover);
  if (ready && sansHeure(next) !== ecrite) {
    await putKv(KV_KEY, next, KV_TTL_SECONDS);
    ecrite = sansHeure(next);
    console.log(`écrit dans KV : ${KV_KEY}`);
  } else if (!ready) console.log(`pas écrit dans KV : ${ecrite ? "le recueil le plus récent n'est pas lu" : "rattrapage des 15 jours en cours"}`);
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify({ copie: next, ...(ecrite && { ecrite }) } satisfies Etat));
}
