/**
 * The places in crèche (vie/creches.ts), answered by annuaire_services_publics when the question is about crèches or
 * childcare: the commune's own figures from the CAF, as its page says them; below 10 000 inhabitants the commune has
 * none, and its intercommunalité's are said as such, never as the commune's; without a place, the island, each commune
 * that has a figure and each intercommunalité, as the table of /enfants. A theoretical offer, of December of a year:
 * never a free place, never a crèche's name (the list is on monenfant.fr, which does not allow its reuse).
 * The sentences are shared with the pages (web/commune.ts, web/enfants.ts): one wording for both.
 */
import { resolvePlace } from "../places/resolve.js";
import * as creches from "../vie/creches.js";
import { SITE_URL } from "./citer.js";
import { credits, jourDuFichier, nombre, notFound, placeBlock, text } from "./format.js";

/**
 * Whether `quoi` asks about crèches or the care of the children under 3; never « médecin de garde », and never
 * « assistante maternelle », which keeps the annuaire's own answer (its offices): no list of them is here.
 */
export const NURSERY = /cr[èe]ches?\b|halte[- ]garderie|multi[- ]?accueil|modes? de garde|garde d['’ ]?(?:un |des |les )?enfants?|faire garder/i;

/** What the figures are, said after them on the commune's page and in the answer. */
export const theorique = () => `offre théorique fin ${creches.ANNEE}, d'après la CAF`;
/** Why a commune may have no figure of its own. */
export const SEUIL = "la CAF ne le donne que pour les communes de plus de 10 000 habitants";
/** The same, as a sentence of the table's introduction on /enfants. */
export const SEUIL_PHRASE = "La CAF ne donne le chiffre d'une commune qu'au-dessus de 10 000 habitants.";
/** A theoretical offer, what the figure counts: after « C'est une offre théorique : » on /enfants. */
export const accueil = "ce sont des places d'accueil, pas des places libres aujourd'hui";
/** The same, as a sentence of the answer. */
export const ACCUEIL = `${accueil[0].toUpperCase()}${accueil.slice(1)}.`;
const TROUVER = "Pour trouver une crèche et ses places : monenfant.fr, de la CAF.";
const SANS_NOM = "Aucune crèche n'est nommée ici : leur liste est sur monenfant.fr, dont les conditions d'utilisation ne permettent pas de la reprendre.";

/** After « 21,6 places » : the rest of a commune's figures, in the words of its page. */
export const offreDite = (o: creches.Offre) =>
  `en crèche pour 100 enfants de moins de 3 ans · ${creches.taux(o.global)} pour 100 en comptant les assistantes maternelles, la garde à domicile et l'école · ${nombre(o.places_creche)} places en crèche · ${theorique()}`;
/** After « pour » : an intercommunalité's figure, its communes counted together. */
export const epciDit = (e: creches.Epci) =>
  `${e.nom}, ses ${e.communes.length} communes ensemble : ${creches.taux(e.creche)} places en crèche pour 100 enfants de moins de 3 ans · ${theorique()}`;

const chiffres = (o: creches.Offre) => ({ en_creche_pour_100_enfants: o.creche, tous_modes_pour_100_enfants: o.global, places_en_creche: o.places_creche });

export function crechesAnswer(lieu: string | undefined) {
  const asked = lieu?.trim();
  const res = asked ? resolvePlace(asked) : null;
  if (asked && !res) return notFound(asked);
  const commun = {
    a_savoir: [SEUIL_PHRASE, ACCUEIL, TROUVER, SANS_NOM],
    trouver_une_creche: "https://monenfant.fr",
    page: `${SITE_URL}/enfants#creches`,
    annee: creches.ANNEE,
    publie_le: jourDuFichier(creches.PUBLIE_LE),
    sources: credits([creches.SOURCE]),
  };
  if (!res) {
    return text({
      resume: `La Réunion : ${creches.taux(creches.ILE.creche)} places ${offreDite(creches.ILE)}. ${ACCUEIL}`,
      ile: chiffres(creches.ILE),
      communes: creches.communes().map(([nom, o]) => ({ nom, ...chiffres(o) })),
      intercommunalites: creches.intercommunalites().map((e) => ({ nom: e.nom, communes: creches.nomsDe(e), ...chiffres(e) })),
      sans_chiffre: creches.sansChiffre(),
      ...commun,
    });
  }
  const commune = res.lieu.commune;
  const own = creches.ofCommune(commune);
  const e = creches.epciOf(commune);
  return text({
    lieu: placeBlock(asked!, res),
    resume: own
      ? `${commune} : ${creches.taux(own.creche)} places ${offreDite(own)}. ${ACCUEIL}`
      : e
        ? `Pas de chiffre pour ${commune} : ${SEUIL}. Pour ${epciDit(e)}. ${ACCUEIL}`
        : `Pas de chiffre pour ${commune} dans les données de la CAF.`,
    commune: own ? { nom: commune, ...chiffres(own) } : undefined,
    // Its intercommunalité's figure, the communes counted together: never to be read as the commune's.
    intercommunalite: e ? { nom: e.nom, communes: creches.nomsDe(e), ...chiffres(e) } : undefined,
    ile: chiffres(creches.ILE),
    ...commun,
  });
}
