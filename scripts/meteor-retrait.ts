/**
 * Takes down everything rundata.re kept of MétéoR-OI's stations, as its agreement says (« retrait sur simple demande »),
 * in one command:
 *
 *   npx tsx scripts/meteor-retrait.ts [--archive <dossier>]…
 *
 * It erases from the Worker's KV the copy of the last measures (meteor:stations), the rain of each hour
 * (meteor:heures) and the days kept for historique_meteo (meteor:jours); then, in each `--archive` folder given (the
 * project's archive of KV and its copies), the folder `meteor/` that holds the copies of meteor:jours. Needs
 * CLOUDFLARE_API_TOKEN (a token that may write to Workers KV) and CLOUDFLARE_ACCOUNT_ID, as scripts/kv.ts.
 *
 * It refuses to run while the agreement is not « retiree » in src/providers/autorisations.ts, put online: before that,
 * the next pass of the scheduled event (every 10 minutes) would write the keys again. Once it is, nothing is read of the
 * association and nothing is written; the keys would expire anyway (meteor:stations in a day, meteor:heures in two,
 * meteor:jours in 430 days): this erases them now.
 */
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { LICENCES } from "../src/providers/autorisations.js";
import { AUTORISATION, HEURES_KV_KEY, JOURS_KEY, KV_KEY } from "../src/providers/meteor-oi.js";
import { deleteKv } from "./kv.js";

/** Every key of MétéoR-OI in KV. meteor:heures is the rain of each hour, kept for /meteo's replay. */
export const CLES = [KV_KEY, HEURES_KV_KEY, JOURS_KEY] as const;
/** The folder of the copies of meteor:jours in an archive of KV. */
export const DOSSIER_ARCHIVE = "meteor";

export function refus(etat = LICENCES[AUTORISATION]?.etat): string | undefined {
  return etat === "retiree"
    ? undefined
    : `L'accord de MétéoR-OI est « ${etat} » dans src/providers/autorisations.ts : le passer d'abord à « retiree » (avec retiree_le) et le mettre en ligne, sinon la passe suivante réécrit les clés.`;
}

async function main() {
  const { values } = parseArgs({ options: { archive: { type: "string", multiple: true } } });
  const non = refus();
  if (non) {
    console.error(non);
    process.exit(1);
  }
  for (const cle of CLES) {
    await deleteKv(cle);
    console.log(`KV : ${cle} effacée`);
  }
  for (const a of values.archive ?? []) {
    const d = join(resolve(a), DOSSIER_ARCHIVE);
    if (!existsSync(d)) {
      console.log(`archive : ${d} absent`);
      continue;
    }
    rmSync(d, { recursive: true, force: true });
    console.log(`archive : ${d} effacé`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
