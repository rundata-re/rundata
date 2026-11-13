/**
 * The prefect's drought order in force, as its text says it, for the days when VigiEau still serves the order it
 * replaced: the order n°2026-2094/SG/SCOPP/BCPE of 12/11/2026 took effect at its signature (article 5) and replaced the
 * order n°2026-1781 of 09/10/2026 (article 1), while VigiEau still served the latter on 14/11/2026. Written by hand from
 * the order's PDF (recueil des actes administratifs spécial n°229 du 13 novembre 2026), and versioned here: a new order
 * means a new table, never an edit of this one's levels.
 *
 * The levels are those of article 3, per commune, for the groundwater (« eaux souterraines ») and the rivers and springs
 * (« eaux superficielles »). The tap water takes the higher of the two, as article 3 says: « Lorsqu'une commune présente
 * des niveaux différents pour les eaux souterraines et les eaux superficielles, le niveau de restriction le plus élevé
 * s'applique ». The uses are the order's annex, its words as written, level by level.
 */
import type { SourceInfo } from "../types.js";
import type { Niveau, Usage } from "./vigieau.js";

export const SOURCE: SourceInfo = {
  id: "arrete_secheresse",
  nom: "Arrêté sécheresse n°2026-2094 du 12 novembre 2026 (recueil des actes administratifs)",
  organisme: "Préfecture de La Réunion",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Préfecture de La Réunion",
  url: "https://www.reunion.gouv.fr/contenu/telechargement/54342/411078/file/",
};

export interface Arrete {
  /** As the order writes it. */
  numero: string;
  /** The short number its text and VigiEau's file name may carry: « 2094 ». */
  court: string;
  /** Signed, YYYY-MM-DD. */
  signe_le: string;
  /** In force from, YYYY-MM-DD (article 5: « à compter de sa signature »). */
  depuis: string;
  /** Where it was published. */
  recueil: string;
  url: string;
  /** The order it replaces, as article 1 names it. */
  remplace: string;
  /** Per INSEE code: [groundwater, rivers and springs]. */
  niveaux: Record<string, readonly [Niveau, Niveau]>;
}

export const ARRETE: Arrete = {
  numero: "n°2026-2094/SG/SCOPP/BCPE",
  court: "2094",
  signe_le: "2026-11-12",
  depuis: "2026-11-12",
  recueil: "recueil des actes administratifs spécial n°229 du 13 novembre 2026",
  url: SOURCE.url,
  remplace: "n°2026-1781/SG/SCOPP/BCPE du 9 octobre 2026",
  niveaux: {
    "97402": ["alerte", "alerte"], // Bras-Panon
    "97406": ["alerte", "alerte"], // La Plaine-des-Palmistes
    "97409": ["alerte_renforcee", "alerte"], // Saint-André
    "97410": ["alerte_renforcee", "alerte_renforcee"], // Saint-Benoît
    "97419": ["vigilance", "vigilance"], // Sainte-Rose
    "97421": ["vigilance", "alerte_renforcee"], // Salazie
    "97408": ["alerte_renforcee", "alerte"], // La Possession
    "97407": ["alerte_renforcee", "alerte"], // Le Port
    "97401": ["vigilance", "alerte"], // Les Avirons
    "97423": ["vigilance", "alerte"], // Les Trois-Bassins
    "97413": ["vigilance", "alerte"], // Saint-Leu
    "97415": ["alerte", "alerte"], // Saint-Paul
    "97411": ["alerte", "alerte_renforcee"], // Saint-Denis
    "97418": ["alerte", "alerte"], // Sainte-Marie
    "97420": ["alerte", "vigilance"], // Sainte-Suzanne
    "97424": ["alerte_renforcee", "alerte_renforcee"], // Cilaos
    "97403": ["vigilance", "alerte_renforcee"], // L'Entre-Deux
    "97422": ["vigilance", "alerte_renforcee"], // Le Tampon
    "97404": ["vigilance", "alerte"], // L'Étang-Salé
    "97405": ["vigilance", "alerte"], // Petite-Île
    "97412": ["crise", "crise"], // Saint-Joseph
    "97414": ["vigilance", "alerte"], // Saint-Louis
    "97417": ["alerte", "alerte"], // Saint-Philippe
    "97416": ["vigilance", "alerte"], // Saint-Pierre
  },
};

const S = "Sensibilisation ; Règles de bon usage d’économie de l’eau";
const REGISTRE = "Registre des prélèvements transmis hebdomadairement au service en charge de la Police de l’eau";

/**
 * A row of the annex: the use, what each level says of it, and who it concerns (« P=Particuliers, C=Collectivités,
 * E=Entreprise, A=exploitant Agricole »). The cells the annex spans over several levels are repeated.
 */
interface Ligne {
  nom: string;
  niveaux: Record<Niveau, string>;
  usagers: string;
}

const all = (vigilance: string, alerte: string, alerte_renforcee: string, crise: string): Record<Niveau, string> => ({ vigilance, alerte, alerte_renforcee, crise });

export const ANNEXE: readonly Ligne[] = [
  { nom: "Arrosage des jardins potagers", niveaux: all(S, "Interdiction entre 8 h et 18 h", "Interdiction entre 6 h et 20 h", "Interdiction entre 6 h et 20 h"), usagers: "PCEA" },
  {
    nom: "Arrosage des espaces verts publics et privés",
    niveaux: all(S, "Interdiction entre 8 h et 18 h", "Interdiction ; Sauf les espaces récemment aménagés, qui peuvent être arrosés de 18h à 8h", "Interdiction ; Sauf les espaces récemment aménagés, qui peuvent être arrosés de 18h à 8h"),
    usagers: "PCE",
  },
  { nom: "Arrosage des pelouses", niveaux: all("Sensibilisation", "Interdit", "Interdit", "Interdit"), usagers: "PCEA" },
  {
    nom: "Arrosage des espaces sportifs",
    niveaux: all(S, "Interdiction entre 8 h et 18 h", "Interdiction entre 8 h et 18 h", "Interdiction ; Sauf les espaces récemment aménagés, qui peuvent être arrosés de 18h à 8h"),
    usagers: "CE",
  },
  {
    nom: "Arrosage des golfs",
    niveaux: all(
      S,
      `Interdiction de 8 h à 20 h ; Réduction de la consommation d’eau sur le volume hebdomadaire de 15 à 30 % par rapport à la situation habituelle ; ${REGISTRE}`,
      `Interdiction sauf arrosage des greens et départs de 20 h à 8 h ; Réduction des volumes d’eau d’au moins 60 % ; ${REGISTRE}`,
      `Interdiction sauf arrosage des greens de 20 h à 7 h ; Réduction des volumes d’eau d’au moins 80 % ; ${REGISTRE}`,
    ),
    usagers: "CE",
  },
  {
    nom: "Alimentation des fontaines publiques et privées d’ornement",
    niveaux: all(S, ...(Array(3).fill("Interdiction ; L’alimentation des fontaines publiques et privées en circuit ouvert est interdite sauf impossibilité technique") as [string, string, string])),
    usagers: "PCE",
  },
  {
    nom: "Remplissage et maintien du niveau d’eau des plans d’eau de loisirs et piscines privées",
    niveaux: all(S, "Interdiction ; Sauf remise à niveau et 1er remplissage si le chantier avait débuté avant les premières restrictions", "Interdiction ; Sauf remise à niveau et 1er remplissage si le chantier avait débuté avant les premières restrictions", "Interdiction"),
    usagers: "PE",
  },
  {
    nom: "Remplissage et maintien à niveau des piscines à usage collectif",
    niveaux: all(S, S, "Interdiction sauf remise à niveau ou en cas de premier remplissage ou pour la réglementation pour raisons sanitaires", "Interdiction sauf remise à niveau ou pour la réglementation pour raisons sanitaires"),
    usagers: "CE",
  },
  { nom: "Prélèvements d’eau à usage domestique dans le milieu naturel", niveaux: all("Pas de restriction", "Réduction de prélèvement de 50 %", "Interdiction", "Interdiction"), usagers: "P" },
  { nom: "Prélèvement par camion citerne dans le milieu naturel", niveaux: all("Pas de restriction", "Interdiction", "Interdiction", "Interdiction"), usagers: "CE" },
  {
    nom: "Prélèvement d’eau pour l’alimentation en eau potable des populations (usages prioritaires : santé, salubrité, sécurité civile)",
    niveaux: all(S, ...(Array(3).fill("Pas de limitation sauf arrêté municipal spécifique") as [string, string, string])),
    usagers: "CEP",
  },
  {
    nom: "Prélèvement d’eau pour les périmètres irrigués",
    niveaux: all(
      S,
      ...(Array(2).fill("Réduction de prélèvement ; Application du plan de coupure avec tours d’eau défini par le gestionnaire du périmètre irrigué pour les usages agricoles. Ce plan doit permettre d’atteindre les objectifs de réduction des prélèvements définis à l’article 6.4 et viser à éviter l’irrigation par aspersion entre 8 h et 18 h. Il doit être validé par le préfet") as [string, string]),
      "Interdiction ; Sauf pour les semences et plants par système d’irrigation localisée (goutte à gouttes)",
    ),
    usagers: "CEA",
  },
  {
    nom: "Prélèvement d’eau pour l’irrigation par aspersion des cultures (hors périmètres irrigués)",
    niveaux: all(S, "Interdiction entre 8 h et 18 h", "Interdiction entre 8 h et 18 h", "Interdiction"),
    usagers: "A",
  },
  {
    nom: "Prélèvement d’eau pour l’irrigation par système d’irrigation localisée (goutte à gouttes, micro-aspersion) (hors périmètres irrigués)",
    niveaux: all(S, "Autorisation", "Autorisation", "Interdiction ; Sauf pour les semences et plants"),
    usagers: "A",
  },
  {
    nom: "Lavage des véhicules, engins, bateaux (hors station de lavage)",
    niveaux: all(S, ...(Array(3).fill("Interdiction ; A titre privé à domicile") as [string, string, string])),
    usagers: "PCEA",
  },
  {
    nom: "Lavage des véhicules en station de lavage",
    niveaux: all(
      S,
      ...(Array(2).fill("Autorisation ; Uniquement sur les pistes équipées de haute-pression ou équipées de système de recyclage (minimum 70 % d’eau recyclée) ou portique programmé ECO sur ouverture partielle") as [string, string]),
      "Interdiction",
    ),
    usagers: "PCEA",
  },
  {
    nom: "Lavage des bâtiments, façades, toitures, trottoirs, voiries et autres surfaces imperméabilisées (dont les cours)",
    niveaux: all(
      S,
      "Interdiction ; Sauf si réalisé par une collectivité ou une entreprise de nettoyage professionnel",
      "Interdiction ; Sauf si réalisé par une collectivité ou une entreprise de nettoyage professionnel",
      "Interdiction ; Sauf si réalisé par une collectivité ou une entreprise de nettoyage professionnel avec impératif sanitaire ou sécuritaire",
    ),
    usagers: "PCEA",
  },
  {
    nom: "Travaux en cours d’eau",
    niveaux: all(
      "Pas de restriction",
      "Restriction ; Limitation au maximum des risques de perturbation des milieux aquatiques",
      ...(Array(2).fill("Restriction ; Report des travaux sauf après déclaration au service de la police de l’eau de la DEAL, pour les cas suivants : situation d’assec total ; pour des raisons de sécurité publique ; dans le cas d’une restauration, renaturation du cours d’eau") as [string, string]),
    ),
    usagers: "PCEA",
  },
  {
    nom: "Exploitation des installations classées pour la protection de l’environnement (ICPE)",
    niveaux: all(
      "Anticipation par les exploitants ICPE des règles de bon usage économique de l’eau",
      ...(Array(3).fill("Restriction ; Report des opérations exceptionnelles consommatrices d’eau ou génératrices d’eaux polluées (exemple d’opérations de nettoyage grande eau), sauf impératif sanitaire ou lié à la sécurité publique. Se référer aux dispositions prévues dans l’arrêté ministériel du 30/06/2023 modifié susvisé, éventuellement complété par l’arrêté préfectoral complémentaire, afin de tenir compte des process de chaque installation") as [string, string, string]),
    ),
    usagers: "CE",
  },
  {
    nom: "Installations de production d’électricité d’origine hydroélectrique, visées dans le Code de l’énergie",
    niveaux: all(
      S,
      ...(Array(3).fill("Les manœuvres d’ouvrages nécessaires à l’équilibre du réseau électrique ou à la délivrance d’eau pour le compte d’autres usagers ou des milieux aquatiques sont autorisées. Le préfet peut imposer des dispositions spécifiques pour la protection de la biodiversité, dès lors qu’elles n’interfèrent pas avec l’équilibre du système électrique et la garantie de l’approvisionnement en électricité. Ne sont dans tous les cas pas concernées les usines de pointe ou en tête de vallée présentant un enjeu de sécurisation du réseau électrique national dont la liste est fournie à l’article R.214-111-3 du Code de l’Environnement, à savoir les usines de Takamaka I, Takamaka II, de Langevin et de la rivière de l’Est") as [string, string, string]),
    ),
    usagers: "E",
  },
];

/**
 * A withdrawal from the river or the ground, by its name in the annex (« Prélèvement… »): article 3 applies them by the
 * level of their resource, never through the tap water.
 */
export const prelevement = (l: Ligne) => /^Prélèvements? /.test(l.nom);

/**
 * What the annex says of each use at one level. The tap water (`reseau`): every use but the withdrawals. A resource drawn
 * from directly (a well, a river): every use, at that resource's level (article 3).
 */
export function usages(niveau: Niveau, reseau: boolean): Usage[] {
  return ANNEXE.filter((l) => !reseau || !prelevement(l)).map((l) => ({
    nom: l.nom,
    restriction: l.niveaux[niveau],
    particulier: l.usagers.includes("P"),
    entreprise: l.usagers.includes("E"),
    collectivite: l.usagers.includes("C"),
    exploitation: l.usagers.includes("A"),
  }));
}
