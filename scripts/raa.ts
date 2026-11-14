/**
 * The acts of the prefecture's « recueil des actes administratifs » that name a place of the island, read from a
 * machine of the project and written to the Worker's KV store (src/providers/raa.ts), as the prefecture's releases are
 * (scripts/prefecture.ts): its site cuts the connection of Cloudflare's Workers. A run reads page 1 of the year's list
 * (and its next pages, while the recueils seen do not go back 15 days), then the recueils of the last 15 days it has
 * not read yet: 4 pages at most, one a minute with the other collectors' (scripts/reunion-gouv.ts), even when many are
 * left to read (the next runs read them). Every title goes through the filters of scripts/raa-lire.ts before anything
 * is kept: a title left out is never written.
 * What it read is kept on the machine (STATE), and written to the store only once the recueils of the 15 days are all
 * read: until then « no act names this place » would not be true. A copy written after that, while recueils are left
 * to read again (the site silent for hours), says since when they are all read (`lus_depuis`).
 * A drought order (« usages de l'eau », « sécheresse ») is kept apart, whatever place it names: the newest seen, from
 * run to run (`Copie.secheresse`), so that /secheresse and restrictions_eau can say that a newer order than theirs is out
 * (tools/secheresse.ts). The first time one signed after the order written by hand (providers/arrete-secheresse.ts) is
 * seen, a line says it, and the command in RUNDATA_ALERTE, if any, is run once with that line as its only argument, to
 * tell the team its levels are to be read; the machine's state remembers it.
 * `npx tsx scripts/raa.ts [--kv]`, every hour with --kv (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
 * environment, scripts/kv.ts), writing only when something changed. Without --kv, reads as a first run would, prints
 * what it keeps and writes nothing.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import "../src/bin/net.js";
import { getPage } from "../src/providers/prefecture.js";
import { ARRETE } from "../src/providers/arrete-secheresse.js";
import { type ArreteSecheresse, type Copie, DAYS, KV_KEY, KV_TTL_SECONDS } from "../src/providers/raa.js";
import { why } from "../src/types.js";
import { getKv, putKv } from "./kv.js";
import { aLaNouvelleAdresse, couverture, ecrire, garder, ligneAlerte, listeDe, parseListe, parseRecueil, plusRecente, prenoms, secheresseDe, suite, type Vus, vusAssez, vusPage1, vusSuivante } from "./raa-lire.js";
import { readPage } from "./reunion-gouv.js";

const STATE = join(homedir(), ".local/state/rundata-collecte/raa.json");

/** What the collector read, the recueils of the list it saw, and what it last wrote to the store (without its `lu_le`). */
interface Etat {
  copie: Copie;
  vus?: Vus;
  ecrite?: string;
  /** The PDFs of the drought orders already told (RUNDATA_ALERTE), once each. */
  alertes?: string[];
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
const lu = kv ? etat() ?? (await getKv<Copie>(KV_KEY).then((c) => c && { copie: c, ecrite: sansHeure(c) })) : undefined;
// The links kept before the list moved (14/11/2026), at its new address: the recueils already read are not read again.
// `ecrite` stays as it was, so the copy is written once more with the new links.
const had: Etat | undefined = lu && { ...lu, copie: aLaNouvelleAdresse(lu.copie), vus: aLaNouvelleAdresse(lu.vus) };
const before = had?.copie;
const now = new Date();
const today = new Date(now.getTime() + 4 * 3600_000);
const since = new Date(today.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
// The year's list: on the first days of January, the recueils of December are on the list of the year before, not read.
// Page 1 at each run; while the recueils seen do not go back to `since` (the first runs), its next pages too, within
// the PAGES_MAX pages of a run.
const PAGES_MAX = 4;
let pages = 1;
const page = await readPage(getPage, listeDe(today.getUTCFullYear()));
const liste = parseListe(page);
if (!liste.length) throw new Error(`aucun recueil dans la liste ${listeDe(today.getUTCFullYear())} : page changée ?`);
let vus = vusPage1(had?.vus, liste, !!suite(page), since);
for (let lien = suite(page); lien && !vusAssez(vus, since) && pages < PAGES_MAX; pages++) {
  const html = await readPage(getPage, lien);
  vus = vusSuivante(vus, parseListe(html), !!suite(html), since);
  lien = suite(html);
}
if (!vusAssez(vus, since)) console.log(`liste vue jusqu'au ${vus.vu_jusqua} : la suite au passage suivant`);

const recueils = (before?.recueils ?? []).filter((r) => r.date >= since);
const actes = (before?.actes ?? []).filter((a) => a.recueil.date >= since);
const noms = prenoms();
let secheresse: ArreteSecheresse | undefined = before?.secheresse;
const todo = couverture(vus, new Set(recueils.map((r) => r.lien)), since).a_lire;
for (const r of todo.slice(0, PAGES_MAX - pages)) {
  try {
    const lus = parseRecueil(await readPage(getPage, r.lien), r);
    const { ajoutes, gardes } = garder(lus, r, noms, actes);
    actes.push(...ajoutes);
    const ds = secheresseDe(lus, r, noms);
    for (const x of ds.avec_date) secheresse = plusRecente(secheresse, x);
    for (const x of ds.sans_date) console.log(`arrêté sécheresse sans date lisible dans son titre, rien de dit : ${x.titre} (${r.titre})`);
    recueils.push({ ...r, actes: lus.length, gardes });
    console.log(`${r.titre} : ${lus.length} actes, ${gardes} gardés, ${ajoutes.length} nommant un lieu`);
  } catch (err) {
    // Read again at the next run.
    process.exitCode = 1;
    console.error(`recueil non lu : ${r.lien} : ${why(err)}`);
  }
}

const cover = couverture(vus, new Set(recueils.map((r) => r.lien)), since);
if (cover.a_lire.length) console.log(`${cover.a_lire.length} recueils lus aux passages suivants`);
const order = <T extends { date: string }>(x: T, y: T) => y.date.localeCompare(x.date);
const next: Copie = {
  actes: actes.sort((x, y) => order(x.recueil, y.recueil)),
  recueils: recueils.sort(order),
  ...(cover.lus_depuis && { lus_depuis: cover.lus_depuis }),
  ...(secheresse && { secheresse }),
  lu_le: now.toISOString(),
};
console.log(`${next.actes.length} actes nommant un lieu, de ${next.recueils.length} recueils${next.lus_depuis ? `, lus sans trou depuis le ${next.lus_depuis}` : ""} ; ${JSON.stringify(next).length} octets`);
// A drought order newer than the one written by hand: said once, and told with RUNDATA_ALERTE.
const alertes = new Set(had?.alertes ?? []);
const ligne = ligneAlerte(secheresse, alertes, ARRETE.signe_le);
if (secheresse && ligne) {
  console.log(ligne);
  const commande = process.env.RUNDATA_ALERTE;
  let dit = !kv || !commande;
  if (kv && commande) {
    try {
      execFileSync(commande, [ligne], { stdio: "inherit", timeout: 60_000 });
      dit = true;
    } catch (err) {
      // Told again at the next run.
      process.exitCode = 1;
      console.error(`alerte non envoyée : ${why(err)}`);
    }
  }
  if (kv && dit) alertes.add(secheresse.pdf);
}
if (kv) {
  let ecrite = had?.ecrite;
  const ready = ecrire(!!ecrite, cover);
  if (ready && sansHeure(next) !== ecrite) {
    await putKv(KV_KEY, next, KV_TTL_SECONDS);
    ecrite = sansHeure(next);
    console.log(`écrit dans KV : ${KV_KEY}`);
  } else if (!ready) console.log(`pas écrit dans KV : ${ecrite ? "le recueil le plus récent n'est pas lu" : "rattrapage des 15 jours en cours"}`);
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify({ copie: next, vus, ...(ecrite && { ecrite }), ...(alertes.size && { alertes: [...alertes] }) } satisfies Etat));
}
