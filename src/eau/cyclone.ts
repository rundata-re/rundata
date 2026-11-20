/**
 * The tap water after a cyclone, as the prefecture's plan says it (dispositif spécifique ORSEC Cyclones, arrêté
 * 2026-182, consignes of the phase de sauvegarde, p. 18): quoted on /coupures-eau and each commune's page
 * (web/eau-cyclone.ts), and in the tools qualite_eau and coupures_eau in the cyclone season. Nothing is fetched.
 */

/** The plan, as the prefecture publishes it. */
export const ORSEC_PDF = "https://www.reunion.gouv.fr/contenu/telechargement/51165/386323/file/2026%2002%2010%20DSO%20Cyclones%20VD.pdf";

/** The plan's words, copied from the PDF (consignes of the phase de sauvegarde). */
export const CONSIGNE = "Vérifier la qualité de l'eau du robinet avant de la consommer ainsi que les aliments du réfrigérateur. Ne pas oublier que l'eau du robinet peut rester impropre à la consommation plusieurs jours après l'arrêt des pluies. En conséquence, il est impératif de la faire bouillir pendant 3 minutes avant de la boire.";
export const CONSIGNE_PAGE = 18;

/** November to April, as the cyclones tool says the season (src/tools/cyclones.ts), local time. */
export function inSeason(now: Date): boolean {
  const m = new Date(now.getTime() + 4 * 3600_000).getUTCMonth() + 1;
  return m >= 11 || m <= 4;
}

/**
 * The tools' block, in the cyclone season only: the page has it at its foot the rest of the year, and an answer
 * carries it to every question on water (about 450 characters).
 */
export function apresCyclone(now: Date) {
  return inSeason(now)
    ? { apres_un_cyclone: { consigne: `« ${CONSIGNE} »`, d_apres: `Dispositif ORSEC Cyclones de la préfecture (arrêté 2026-182), consignes de la phase de sauvegarde, p. ${CONSIGNE_PAGE}`, lien: `${ORSEC_PDF}#page=${CONSIGNE_PAGE}` } }
    : {};
}
