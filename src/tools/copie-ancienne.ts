/**
 * The notices of water and power cuts are read by the scheduled event only (cache.ts `islandRead`, web/partagees.ts):
 * the pages and the tools serve its copy, however old. When the event has not read them again for a while, a cut that
 * ended or a new one may be missing, with no other sign than the hour of the read: said first, in marketing's words
 * (23/11/2026), past EAU_ANCIENNE_MS for the water and COURANT_ANCIENNE_MS for the power cuts (read every 15 minutes
 * and every 2 hours).
 */
import { localTime } from "../geo.js";

export const EAU_ANCIENNE_MS = 2 * 3600_000;
export const COURANT_ANCIENNE_MS = 6 * 3600_000;

const SUJETS = { eau: ["d'eau", EAU_ANCIENNE_MS], courant: ["de courant", COURANT_ANCIENNE_MS] } as const;

/** « le 22/11 à 08:47 », the day said even when it is today's (marketing). */
const leA = (d: Date) => {
  const [jour, heure] = localTime(d).split(" ");
  return `le ${jour} à ${heure}`;
};

/**
 * The sentence, without its « Voir … », or undefined while the copy is younger than its limit. `ou`: « affichés ici »
 * on a page, « de cette réponse » in a tool's answer.
 */
export function copieAncienne(sujet: keyof typeof SUJETS, lu: Date, now: Date, ou: "page" | "outil"): string | undefined {
  const [de, max] = SUJETS[sujet];
  if (now.getTime() - lu.getTime() <= max) return undefined;
  return `Les avis de coupure ${de} ${ou === "page" ? "affichés ici" : "de cette réponse"} ont été lus ${leA(lu)} et n'ont pas pu être relus depuis : une coupure terminée ou une nouvelle coupure peut ne pas y figurer.`;
}

/** The short form of a commune page's tile (half a column at 390 px), « Avis lus le 23/11 à 08:47, pas relus depuis. » (marketing, 23/11/2026). */
export function copieAncienneCourte(sujet: keyof typeof SUJETS, lu: Date, now: Date): string | undefined {
  return now.getTime() - lu.getTime() <= SUJETS[sujet][1] ? undefined : `Avis lus ${leA(lu)}, pas relus depuis.`;
}

export const VOIR_EAU = "Voir le site du distributeur d'eau ou de la mairie.";
export const VOIR_COURANT = "Voir le site de la mairie, qui relaie les avis d'EDF.";
