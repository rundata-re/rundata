/**
 * The offers' titles and employers as people read them. Choisir le service public carries the titles as each employer
 * typed them, a third of them all in capitals, most with the employer at the end in capitals too, cut to 38 letters
 * by the territorial recruiting site (« AGENT SOCIAL - CTRE COM ACTION SOCIALE SAINT ANDRE »). A title in capitals is
 * shown in the case of a sentence (casse()); an employer takes its name from the table below, or its commune's when it
 * is a commune's (« Commune du Tampon », « CCAS de Saint-André »), or each word's capital otherwise (casseArret()). No
 * accent is guessed: those of the table are the employers' own, read on their sites; those of the communes, INSEE's;
 * those of the titles, a closed list (ACCENTS).
 */
import { de } from "../articles.js";
import { INSEE } from "../places/insee.js";
import { casse, casseArret, SIGLES, STOP_SIGLES } from "./casse.js";

/**
 * The sigles of the offers' titles kept in capitals, beside the island's bodies: « H/F », the services and schemes the
 * titles name (« ATTEE », « ASE », « GEMAPI », « FEDER »…).
 */
const TITRE_SIGLES = new Set([
  ...SIGLES, "ASA", "ASE", "ASEM", "ATSEM", "ATTEE", "CDG", "CLS", "DGA", "F", "FEDER", "FSE", "GEMAPI", "H", "MDE", "PEDT",
  "PI", "PILHI", "PRE", "QVCS", "SAFT", "SIGF", "SIRH", "SPIEP", "TS", "TU", "UTR",
]);

/** A text folded to compare: no accent, no case, no apostrophe nor hyphen, « ST » and « STE » written out. */
const plie = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\(974\)/g, "").replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/\bste\b/g, "sainte").replace(/\bst\b/g, "saint");

/**
 * The employers written in capitals on the site, under the name each one gives itself: the Département, the Sidélec,
 * the ONF and the Office de l'eau on their sites (06/11/2026), the regional council in the directory of the public
 * services (« Conseil régional - La Réunion »; its site refuses our reading), the intercommunalities in the official
 * list of the State's geographic API (« CA du Sud »…) and the CIREST on its site (« Communauté Intercommunale Réunion
 * EST »). « La Réunion » always takes its capital La.
 */
const NOMS: Record<string, string> = {
  "conseil departemental de la reunion": "Département de La Réunion",
  "region ile de la reunion": "Conseil régional de La Réunion",
  "communaute d agglo villes solidaires": "CIVIS (Communauté Intercommunale des Villes Solidaires)",
  "communaute d agglomeration du sud": "Communauté d'agglomération du Sud",
  "communaute intercommunale reunion est": "Communauté intercommunale Réunion Est (CIREST)",
  "communaute intercommunale nord reunion": "Communauté intercommunale du Nord de La Réunion (CINOR)",
  "centre gestion fonction pub territor": "Centre de gestion de la fonction publique territoriale de La Réunion",
  "office de l eau de la reunion": "Office de l'eau Réunion",
  "sidelec reunion": "Sidélec Réunion",
  "office national des forets": "Office national des forêts",
};

/** The communes, folded, with and without their article: « la possession » and « possession ». */
const COMMUNES = Object.keys(INSEE).map((nom) => ({ nom, plie: plie(nom), nu: plie(nom).replace(/^(le|la|les|l) /, "") }));
/** The commune a name cut short names (« LA POSSESSI », « PLAINE DES PAL »): the only one it starts. */
function commune(reste: string): string | undefined {
  const r = plie(reste);
  const nu = r.replace(/^(le|la|les|l) /, "");
  const found = COMMUNES.filter((c) => c.plie === r || c.nu === nu || (nu.length >= 6 && c.nu.startsWith(nu)));
  return found.length === 1 ? found[0].nom : undefined;
}

/** The bodies of a commune, as the site writes them, and as they are named. */
const DE_COMMUNE: [RegExp, (c: string) => string][] = [
  [/^commune (?:de |d |du )?(.+)$/, (c) => `Commune ${de(c)}`],
  [/^(?:ctre|centre) com(?:munal)? (?:d )?action sociale (?:de |d |du )?(.+)$/, (c) => `CCAS ${de(c)}`],
  [/^caisse des ecoles (?:de |d |du )?(.+)$/, (c) => `Caisse des écoles ${de(c)}`],
];

/** An employer named by the table or as a commune's body; undefined for any other. */
function connu(nom: string): string | undefined {
  const p = plie(nom);
  if (NOMS[p]) return NOMS[p];
  for (const [re, name] of DE_COMMUNE) {
    const m = re.exec(p);
    // « DU TAMPON »: the article inside « du ».
    const c = m && commune(/^commune du |^(?:ctre|centre) .* du |^caisse des ecoles du /.test(p) ? `le ${m[1]}` : m[1]);
    if (c) return name(c);
  }
  return undefined;
}

/**
 * One employer written all in capitals, as named (« CCAS de Saint-Paul »); as written otherwise, and when it is one
 * word or two, which may be sigles (« OFII », « SIR/OI (SIR/OI) »).
 */
export function employeur(nom: string): string {
  if (/\p{Ll}/u.test(nom)) return nom;
  return connu(nom) ?? (nom.trim().split(/\s+/).length > 2 ? casseArret(nom, STOP_SIGLES) : nom);
}

/**
 * The employer field of an offer: its parts in capitals named (« Office National des Forêts (ONF), OFFICE NATIONAL DES
 * FORETS » → « …, Office national des forêts »), the others as written.
 */
export const employeurs = (s: string) => s.split(/(, | – )/).map((part, i) => (i % 2 ? part : employeur(part))).join("");

/**
 * An offer's title as people read it: in the case of a sentence when written all in capitals, its employer at the end
 * named (« UN AGENT POLYVALENT – CUISINE (H/F) - REGION ILE DE LA REUNION » → « Un agent polyvalent – cuisine (H/F) -
 * Conseil régional de La Réunion »). The end is an employer when the table or a commune names it, or when it alone is in
 * capitals (« Assistant Administratif H/F - ESPACE CULTUREL LECONTE DE LISLE »).
 */
export function intitule(titre: string): string {
  const at = titre.lastIndexOf(" - ");
  if (at > 0) {
    const [tete, fin] = [titre.slice(0, at), titre.slice(at + 3)];
    if (!/\p{Ll}/u.test(fin) && /\p{L}/u.test(fin) && (connu(fin) || /\p{Ll}/u.test(sansHF(tete)))) return `${phrase(tete)} - ${employeur(fin)}`;
  }
  return phrase(titre);
}

/** « (h/f) », « F/H »: the only lowercase letters of some titles in capitals (« ASSISTANT DE SERVICE SOCIAL (h/f) »). */
const HF = /\b[hf]\/[hf]\b/gi;
const sansHF = (s: string) => s.replace(HF, "");
/**
 * The words the titles in capitals carry without their accents in the offers read on 06/11/2026, the trades' common
 * words, and their families: the only accents given back, as the stops' STOP_NOUNS. Any other word stays as the
 * employer typed it; « REGION REUNION » too, a name.
 */
const ACCENTS: Record<string, string> = {
  amelioration: "amélioration", amenagement: "aménagement", amenagements: "aménagements", batiment: "bâtiment",
  batiments: "bâtiments", creche: "crèche", creches: "crèches", developpement: "développement", economie: "économie",
  educateur: "éducateur", educatrice: "éducatrice", equipe: "équipe", equipes: "équipes", etat: "état",
  funeraire: "funéraire", funeraires: "funéraires", legal: "légal", legale: "légale", lycee: "lycée", lycees: "lycées",
  medecin: "médecin", medecins: "médecins", medical: "médical", medicale: "médicale", medicaux: "médicaux",
  mobilite: "mobilité", mobilites: "mobilités", obesite: "obésité", operation: "opération", operations: "opérations",
  pedagogique: "pédagogique", pedagogiques: "pédagogiques", qualite: "qualité", referent: "référent",
  referente: "référente", remplacant: "remplaçant", remplacante: "remplaçante", reseau: "réseau", reseaux: "réseaux",
  secretaire: "secrétaire", secretaires: "secrétaires", solidarite: "solidarité", specialise: "spécialisé",
  specialisee: "spécialisée", specialite: "spécialité", systeme: "système", systemes: "systèmes",
};
/** The feminine ending of a title written for both (« CONSEILLER.ERE », « CONSEILLER(ERE) »): only after its point. */
const ERE = /(?<=[.(])ere(?![\p{L}])/gu;
/** « CHARGE DE MISSION », « CHARGE(E) D'ACCUEIL »: the participle, never the noun (« prise en charge de »). */
const CHARGE = /(?<!\ben )\b([Cc])harge(?=(?:\(e\)|\.e)?\s+(?:(?:de|du|des)(?!\p{L})|d['’]))/gu;
/** A title put in the case of a sentence, the accents of ACCENTS and CHARGE given back; sigles left in capitals. */
const accents = (s: string) =>
  s.replace(/\p{L}+/gu, (w) => {
    const a = ACCENTS[w.toLowerCase()];
    if (!a || w === w.toUpperCase()) return w;
    return w[0] === w[0].toUpperCase() ? a[0].toUpperCase() + a.slice(1) : a;
  }).replace(CHARGE, "$1hargé").replace(ERE, "ère");
/** A title in capitals, its « h/f » with them, in the case of a sentence; as written otherwise. */
const phrase = (s: string) =>
  /\p{Ll}/u.test(sansHF(s)) ? s : accents(casse(s.replace(HF, (x) => x.toUpperCase()), TITRE_SIGLES, false));
