/**
 * « A-t-il beaucoup plu à <commune> ? » asked of a whole commune: the rain since midnight at every rain gauge of
 * Météo-France in it, not at the nearest one only; yesterday's, hour by hour, is historique_meteo's (no read more here).
 * A commune of La Réunion runs from the coast to the Hauts, and its gauges often measure very different rain: on 15/11/2026 at 11:00, at Saint-Philippe, one had
 * 76,1 mm since midnight and the other 4,8 mm, and the answer gave the second alone.
 */
import { INSEE } from "../places/insee.js";
import type { RecentRain } from "../providers/meteofrance.js";
import { STATIONS_974 } from "../providers/meteofrance-stations.js";
import { a, enumeration } from "./format.js";
import { sinceMidnight } from "./pluie-recente.js";

/**
 * The gauges of a commune « diverge » when the wettest has measured at least ECART_MM more than the one the answer is
 * summed up by, and at least ECART_FOIS times as much. Read from the hourly archive of 2024 and 2025 (D1, every commune
 * with two gauges or more, 11 814 commune-days): from 00:00 to 11:00, the gap between a commune's wettest and driest
 * gauge reaches both on 2,8 % of the days (on 6,8 % of whole days); the median gap of a rainy day is 5,2 mm. Rare
 * enough to be said each time, and a gap that changes the answer to « a-t-il beaucoup plu ? ».
 */
export const ECART_MM = 20;
export const ECART_FOIS = 4;

/** The Météo-France stations of a commune (their id starts with its INSEE code), as STATIONS_974 lists them. */
export const gaugesOf = (commune: string) => {
  const code = INSEE[commune as keyof typeof INSEE];
  return code ? STATIONS_974.filter(([id]) => id.startsWith(code)) : [];
};

/**
 * The block for `commune`, or undefined when it has no gauge in the hourly package besides `shown` (the gauge the
 * answer's rain is read at).
 */
export function pluieCommune(rain: RecentRain, commune: string, shown: { id: string; nom: string } | undefined, now: Date) {
  const rows = gaugesOf(commune)
    .map(([id, nom]) => ({ id, nom, c: sinceMidnight(rain, id, now) }))
    .filter((x): x is { id: string; nom: string; c: NonNullable<typeof x.c> } => x.c !== undefined)
    .sort((x, y) => y.c.total - x.c.total);
  if (!rows.length || (rows.length === 1 && rows[0].id === shown?.id)) return undefined;
  // « 0,2 mm » and « de 00:00 à 07:42 »: the period said once when every gauge was read to the same minute, as it nearly
  // always is, and the gauges with the same rain named together (most often, all but one at 0 mm).
  const split = rows.map((x) => {
    const k = x.c.cumul.lastIndexOf(" de ");
    return { nom: x.nom, pluie: x.c.cumul.slice(0, k), periode: x.c.cumul.slice(k + 1) };
  });
  const periode = split.every((x) => x.periode === split[0].periode) ? split[0].periode : undefined;
  const dit = (x: (typeof split)[number]) => (periode ? x.pluie : `${x.pluie} ${x.periode}`);
  const groups = new Map<string, string[]>();
  for (const x of split) groups.set(dit(x), [...(groups.get(dit(x)) ?? []), x.nom]);
  const said = [...groups].map(([pluie, noms]) => `${enumeration(noms)} ${pluie}`).join(" ; ");
  const top = rows[0];
  const base = shown && sinceMidnight(rain, shown.id, now);
  const diverge = !!base && top.id !== shown!.id && top.c.total - base.total >= ECART_MM && top.c.total >= ECART_FOIS * base.total;
  // Said once, in the summary; the block only marks it. The gauge shown may be outside the commune: its own cumul then.
  const dite = split.find((x) => x.nom === shown?.nom);
  const ecart = diverge
    ? `Fort écart${periode ? ` ${periode}` : ""} : ${top.nom} a mesuré ${dit(split[0])}, ${shown!.nom} ${dite ? dit(dite) : base!.cumul}. ` +
      `La pluie ${a(shown!.nom)} ne dit pas celle de toute la commune : dire les deux.`
    : undefined;
  return {
    nature: "mesure (pluviomètres Météo-France de la commune)",
    ...(periode ? { periode } : {}),
    depuis_minuit: Object.fromEntries(split.map((x) => [x.nom, dit(x)])),
    ...(ecart ? { fort_ecart: true } : {}),
    resume:
      `Pluie mesurée ${periode ?? "depuis minuit"} ${rows.length > 1 ? `aux ${rows.length} pluviomètres` : "au pluviomètre"} Météo-France de ${commune} : ${said}.` +
      (ecart ? ` ${ecart}` : "") +
      ` Hier heure par heure à chacun : historique_meteo.`,
  };
}
