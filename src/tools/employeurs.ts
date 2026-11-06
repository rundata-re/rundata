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
import { casse, casseArret, lieuEcrit, SIGLES, STOP_SIGLES } from "./casse.js";

/**
 * The sigles of the offers' titles kept in capitals, beside the island's bodies: « H/F », the services and schemes the
 * titles name (« ATTEE », « ASE », « GEMAPI », « FEDER »…).
 */
const TITRE_SIGLES = new Set([
  ...SIGLES, "ASA", "ASE", "ASEM", "ATSEM", "ATTEE", "CDG", "CLS", "DGA", "F", "FEDER", "FSE", "GEMAPI", "H", "MDE", "PEDT",
  "PI", "PILHI", "PRE", "QVCS", "SAFT", "SIGF", "SIRH", "SPIEP", "TS", "TU", "UTR",
  // The procurement notices' objects: the buyers and the schemes they name.
  "AFPAR", "MOE", "NPNRU", "SEMTO", "SPL", "SYDNE", "TRANSREO",
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
  "departement de la reunion": "Département de La Réunion",
  "region ile de la reunion": "Conseil régional de La Réunion",
  "conseil regional de la reunion": "Conseil régional de La Réunion",
  "communaute d agglo villes solidaires": "CIVIS (Communauté Intercommunale des Villes Solidaires)",
  "communaute d agglomeration du sud": "Communauté d'agglomération du Sud",
  "communaute intercommunale reunion est": "Communauté intercommunale Réunion Est (CIREST)",
  "communaute intercommunale nord reunion": "Communauté intercommunale du Nord de La Réunion (CINOR)",
  "communaute agglo territoire cote ouest ile de la reunion": "Communauté d'agglomération du Territoire de la Côte Ouest (TCO)",
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

/** The sigles of the employers' names, beside the stops': the local public companies (« SPL AFPAR »). */
const EMPLOYEUR_SIGLES = new Set([...STOP_SIGLES, "SPL"]);

/**
 * One employer written all in capitals, as named (« CCAS de Saint-Paul »); as written otherwise, and when it is one
 * word or two, which may be sigles (« OFII », « SIR/OI (SIR/OI) »).
 */
export function employeur(nom: string): string {
  if (/\p{Ll}/u.test(nom)) return nom;
  return connu(nom) ?? (nom.trim().split(/\s+/).length > 2 ? casseArret(nom, EMPLOYEUR_SIGLES) : nom);
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
    // « … - COMMUNAUTE AGGLO TERRITOIRE COTE OUEST Ile de la REUNION »: named by the table, though not all in capitals.
    const nomme = connu(fin);
    if (nomme) return `${phrase(tete)} - ${nomme}`;
    if (!/\p{Ll}/u.test(fin) && /\p{L}/u.test(fin) && /\p{Ll}/u.test(sansHF(tete))) return `${phrase(tete)} - ${employeur(fin)}`;
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
  // The procurement notices' objects read on 06/11/2026.
  accompagnee: "accompagnée", benefice: "bénéfice", complementaire: "complémentaire", constitue: "constitué",
  dechets: "déchets", deportes: "déportés", elagage: "élagage", evenements: "événements", hebergement: "hébergement",
  insemination: "insémination", interet: "intérêt", marche: "marché", marches: "marchés", mineralises: "minéralisés",
  prevoyance: "prévoyance", salaries: "salariés", sante: "santé",
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

/**
 * The lots' letters (« LOTS A,B,C ET K », « LOT A - VOIRIE »): kept in capitals, never read as the preposition « à ».
 * A list of them, or one alone before a punctuation or the end.
 */
const LOTS = /(?<![\p{L}])(lots?\s+)(\p{L}(?:\s*,\s*\p{L})+(?:\s+et\s+\p{L})?|\p{L}\s+et\s+\p{L}|\p{L}(?=\s*(?:[-–—:,;()/]|$)))(?![\p{L}'’])/giu;
/** « A » between two words of a title in capitals: the preposition (« MISE A DISPOSITION », « USINE A THE »). */
const A = /(?<=\p{L}\s)a(?=\s+\p{L})/gu;
/** The words of a road or a structure whose name follows, in the case of a sentence. */
const VOIE =
  /(?<!\ben\s)(?<![\p{L}])(rue|avenue|boulevard|chemin|allée|allee|route|impasse|place|tunnel|pont|quai|zac)((?:\s+(?:de|du|des|la|le|les)(?=\s)|\s+[ld]['’])*\s*?)(\s+\p{L}[^,;:()/–—]*?|(?<=['’])\p{L}[^,;:()/–—]*?)(?=\s+-\s|\s*[,;:()/–—]|\s+(?:tranche|tranches|lot|lots|phase|secteur|et|pour|dans|sur|au|aux|entre|à|a)(?![\p{L}])|$)/giu;
/** After a road's word, the words that make it a kind and not a name: « route nationale », « chemin de fer ». */
const PAS_UN_NOM = new Set(["chargement", "communale", "departementale", "départementale", "fer", "forestiere", "forestière", "nationale", "roulant"]);
const PETITS = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et"]);
/** A road's name, each word with its capital but its small words (« général de gaulle » → « Général de Gaulle »). */
const nom = (s: string) =>
  s.replace(/(^|[\s'’-])(\p{Ll}+)/gu, (m, a: string, w: string) => (PETITS.has(w) && a !== "" && a !== "-" ? m : a + w[0].toLocaleUpperCase("fr") + w.slice(1)));
const voies = (s: string) =>
  s.replace(VOIE, (m, v: string, petits: string, n: string) => (PAS_UN_NOM.has(n.trim().split(/[\s'’]/)[0].toLowerCase()) ? m : v + petits + nom(n)));

/**
 * Written in capitals, word by word: each word of two letters or more, beside « h/f ». A letter alone may be in
 * lowercase (« … MULTISPORT l'ETANG-SALE-LES-BAINS »); one word in lowercase is enough for a text in the case of a
 * sentence, sigles and all (« Travaux CINOR »).
 */
const capitales = (s: string) => {
  const mots = sansHF(s).match(/\p{L}{2,}/gu) ?? [];
  return mots.length > 0 && mots.every((m) => !/\p{Ll}/u.test(m));
};
/** Its letters alone in capitals: « l'ETANG » → « L'ETANG », for a text written in capitals (capitales()). */
const lettres = (s: string) => s.replace(/(?<![\p{L}])\p{Ll}(?![\p{L}])/gu, (c) => c.toUpperCase());

/**
 * A procurement notice's object as people read it: written in capitals (capitales()), in the case of a sentence as the
 * offers' titles (phrase()), its lots' letters in capitals, « A » between words the preposition, the names of the roads
 * and structures with their capitals (« REQUALIFICATION DE L'AVENUE PASTEUR » → « Requalification de l'avenue Pasteur »).
 * As written otherwise.
 */
export function objet(s: string): string {
  if (!capitales(s)) return s;
  return voies(phrase(lettres(s)).replace(LOTS, (_, l: string, x: string) => l + x.replace(/(?<![\p{L}])\p{L}(?![\p{L}])/gu, (c) => c.toUpperCase())).replace(A, "à"));
}

/** The words in capitals of a name otherwise in lowercase, joined by spaces, hyphens or apostrophes (« L'ETANG-SALE »). */
const EN_CAPITALES = /(?<![\p{L}'’-])\p{Lu}+(?:[\s'’-]+\p{Lu}+)*(?![\p{L}])/gu;

/**
 * A procurement notice's buyer as people read it: each part between « - » written in capitals named as an employer
 * (employeur(): « COMMUNE DE SAINT-JOSEPH » → « Commune de Saint-Joseph »); a part with words in lowercase kept as
 * written, but for the names of places in capitals it holds, written as the resolver writes them (« Mairie de
 * L'ETANG-SALE » → « Mairie de L'Étang-Salé »).
 */
export const acheteur = (nom: string) =>
  nom.split(" - ").map((part) => (capitales(part) ? employeur(lettres(part)) : part.replace(EN_CAPITALES, (m) => lieuEcrit(m) ?? m))).join(" - ");
