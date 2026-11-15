/**
 * « A-t-il beaucoup plu à <commune> ? » asked of a whole commune: the rain since midnight at every rain gauge of
 * Météo-France in it, not at the nearest one only; yesterday's, hour by hour, is historique_meteo's (no read more here).
 * A commune of La Réunion runs from the coast to the Hauts, and its gauges often measure very different rain: on 15/11/2026 at 11:00, at Saint-Philippe, one had
 * 76,1 mm since midnight and the other 4,8 mm, and the answer gave the second alone.
 */
import { INSEE } from "../places/insee.js";
import type { RecentRain } from "../providers/meteofrance.js";
import { STATIONS_974 } from "../providers/meteofrance-stations.js";
import { a } from "./format.js";
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
  const stations = rows.map((x) => ({ station: x.nom, cumul_depuis_minuit: x.c.cumul }));
  const top = rows[0];
  const base = shown && sinceMidnight(rain, shown.id, now);
  const diverge = !!base && top.id !== shown!.id && top.c.total - base.total >= ECART_MM && top.c.total >= ECART_FOIS * base.total;
  const ecart = diverge
    ? `Fort écart entre les pluviomètres : ${top.nom} a mesuré ${top.c.cumul} (depuis minuit), ${shown!.nom} ${base!.cumul}. ` +
      `La pluie ${a(shown!.nom)} ne dit pas celle de toute la commune de ${commune} : dire les deux.`
    : undefined;
  const said = rows.map((x) => `${x.nom} ${x.c.cumul}`).join(" ; ");
  return {
    commune,
    nature: "mesure (pluviomètres Météo-France de la commune)",
    stations,
    ...(ecart ? { ecart } : {}),
    resume:
      `Pluie mesurée depuis minuit ${rows.length > 1 ? `aux ${rows.length} pluviomètres` : "au pluviomètre"} Météo-France de ${commune} : ${said}.` +
      (ecart ? ` ${ecart}` : "") +
      ` Pour hier à chacun de ces pluviomètres, heure par heure : historique_meteo.`,
  };
}
