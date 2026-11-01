/**
 * The duty of the doctors in private practice (permanence des soins ambulatoires) in La Réunion, as the ARS's
 * specification adopted by the arrêté n°82/ARS/2026 of 31/03/2026 sets it (in force since 01/04/2026; it repeals the
 * n°54/ARS/2026 and the n°246/ARS/2022): its hours (p. 4-5, §1.2), its twelve territories (p. 5, §1.4.1), the hospital
 * the 15 sends to in the dead of night (p. 6, §1.4.2) and the fixed places it names (p. 13-14, §3.3.1).
 * Who is on duty is not in it: the roster names the doctors and goes to the ARS, the SAMU and the prefecture only.
 * Whether a place it names is open is not checked: the text says it is planned.
 */
import type { SourceInfo } from "../types.js";

export const PDSA: SourceInfo = {
  id: "ars_pdsa",
  nom: "Permanence des soins ambulatoires : cahier des charges (arrêté n°82/ARS/2026)",
  organisme: "Agence régionale de santé La Réunion",
  licence: "Information publique",
  attribution: "arrêté n°82/ARS/2026, ARS La Réunion",
  url: "https://www.reunion.gouv.fr/contenu/telechargement/51490/389150/file/Arr%C3%AAt%C3%A9%20n%C2%B082-ARS-2026%20portant%20adoption%20du%20cahier%20des%20charges%20de%20la%20permanence%20des%20soins%20ambulatoires%20dans%20le%20d%C3%A9partement%20de%20La%20R%C3%A9union.pdf",
};

/** The specification itself, annexed to the arrêté. */
export const CAHIER =
  "https://www.reunion.gouv.fr/contenu/telechargement/51492/389160/file/Cahier%20des%20charges%20de%20la%20permanence%20des%20soins%20ambulatoires%20D%C3%A9partement%20de%20La%20R%C3%A9union%20.pdf";

/** The same in every territory. */
export const HORAIRES = {
  soirs: "tous les soirs de 19 h à 23 h",
  samedi: "le samedi de 12 h à 19 h",
  dimanches_et_feries: "les dimanches et jours fériés de 7 h à 19 h",
  ponts: "les ponts que l'ARS fixe chaque année",
};

export interface Territoire {
  nom: string;
  /** Whole communes. */
  communes: string[];
  /** The quarters of a commune shared between two territories (Saint-Denis, Saint-Paul), as the text writes them. */
  quartiers: Record<string, string[]>;
  /** The fixed place the arrêté names, when it names one. */
  lieu_prevu?: string;
  /** Where the 15 sends in the dead of night when no doctor volunteers; unset where the text says nothing (Cilaos). */
  nuit?: string[];
}

const NORD = "CHU site Nord (Saint-Denis)";
const SUD = "CHU site Sud (Saint-Pierre)";
const GHER = "GHER (Saint-Benoît)";
const CHOR = "CHOR (Saint-Paul)";

// The text numbers « Est 1 » and « Est 2 » the other way round from 2022's (§1.4.1), and its table of §3.3.1 says « Est »
// and « Nord-Est »: the communes tell them apart, the table's names are kept.
export const TERRITOIRES: Territoire[] = [
  { nom: "Nord 1", communes: ["Sainte-Marie"], quartiers: { "Saint-Denis": ["Sainte-Clotilde", "Moufia", "Chaudron", "Bois de Nèfles", "La Bretagne", "Domenjod"] }, nuit: [NORD] },
  { nom: "Nord 2", communes: [], quartiers: { "Saint-Denis": ["centre-ville", "Montgaillard", "La Montagne", "Bellepierre", "Le Brûlé", "Saint-François"] }, lieu_prevu: "la maison médicale de garde hospitalière du CHU Nord", nuit: [NORD] },
  { nom: "Nord-Est", communes: ["Sainte-Suzanne", "Saint-André", "Salazie"], quartiers: {}, nuit: [NORD, GHER] },
  { nom: "Est", communes: ["Bras-Panon", "Saint-Benoît", "La Plaine-des-Palmistes", "Sainte-Rose"], quartiers: {}, lieu_prevu: "le cabinet de garde du GHER", nuit: [GHER] },
  { nom: "Nord-Ouest", communes: ["Le Port", "La Possession"], quartiers: {}, nuit: [CHOR] },
  {
    nom: "Ouest 1",
    communes: [],
    quartiers: { "Saint-Paul": ["Éperon", "Étang Saint-Paul", "Cambaie", "La Plaine", "centre-ville", "Bois de Nèfles", "Sans-Souci", "Bellemène", "Bois Rouge", "Bernica", "Le Guillaume", "Tan Rouge", "Fleurimont", "Plateau Caillou", "Saint-Gilles-les-Hauts"] },
    lieu_prevu: "la maison médicale de garde hospitalière du CHOR",
    nuit: [CHOR],
  },
  { nom: "Ouest 2", communes: ["Les Trois-Bassins", "Saint-Leu"], quartiers: { "Saint-Paul": ["Saint-Gilles-les-Bains", "La Saline", "La Saline-les-Bains", "Barrage", "Sacré-Cœur"] }, nuit: [CHOR] },
  { nom: "Sud Bas", communes: ["Saint-Pierre", "Entre-Deux"], quartiers: {}, lieu_prevu: "la maison médicale de garde hospitalière du CHU Sud", nuit: [SUD] },
  { nom: "Sud Haut", communes: ["Le Tampon"], quartiers: {}, nuit: [SUD] },
  { nom: "Sud-Ouest", communes: ["Saint-Louis", "L'Étang-Salé", "Les Avirons"], quartiers: {}, nuit: [SUD] },
  { nom: "Sud Est", communes: ["Saint-Philippe", "Saint-Joseph", "Petite-Île"], quartiers: {}, nuit: [SUD] },
  { nom: "Cilaos", communes: ["Cilaos"], quartiers: {} },
];

/** A quarter's name as compared: no case, no accent, no article, no hyphen (« L'Éperon » is « Éperon »). */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9œ]+/g, " ").split(" ").filter((w) => w && !["l", "le", "la", "les", "de", "du", "des", "d"].includes(w)).join(" ");

/**
 * The territories of a place: one for a whole commune, or for a quarter of Saint-Denis or Saint-Paul the text lists;
 * both of the commune's otherwise (the town itself, a quarter it does not list).
 */
export function territoires(commune: string, nom: string): Territoire[] {
  const whole = TERRITOIRES.filter((t) => t.communes.includes(commune));
  if (whole.length) return whole;
  const shared = TERRITOIRES.filter((t) => t.quartiers[commune]);
  const one = shared.filter((t) => t.quartiers[commune].some((q) => fold(q) === fold(nom)));
  return one.length === 1 ? one : shared;
}

/** The regional paediatric SMUR the ARS and the CHU announced (press release of 30/09/2026; no start date, no hours given). */
export const SMUR_PEDIATRIQUE = {
  texte: "SMUR pédiatrique régional (24 h/24, basé au CHU Nord), déclenché par le 15 : annoncé le 30/09/2026 par l'ARS et le CHU",
  source: "https://www.lareunion.ars.sante.fr/system/files/2026-09/CP%20annonce%20SMUR%20p%C3%A9diatrique.pdf",
};
