/**
 * The formations of La Réunion in Parcoursup, one by one (src/vie/parcoursup-formations.json,
 * scripts/build-parcoursup.py): by commune, establishment and formation, in alphabetical order. For each, its places,
 * its taux d'accès as the ministry gives it, and its sheet on parcoursup.fr. Never sorted by its taux d'accès.
 */
import data from "./parcoursup-formations.json" with { type: "json" };

export interface Formation {
  nom: string;
  places: number;
  /** The ministry's taux d'accès, 0 to 100: it cannot be computed from the open data. */
  tauxAcces: number;
  fiche: string;
}

export interface Etablissement {
  commune: string;
  uai: string;
  nom: string;
  formations: Formation[];
}

/** Its sheet on parcoursup.fr: only its number is in the file. */
export const fiche = (n: number) => `https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=${n}&typeBac=0&originePc=0`;

export const ETABLISSEMENTS: Etablissement[] = data.etablissements.map((e) => ({
  commune: e.commune,
  uai: e.uai,
  nom: e.nom,
  formations: (e.formations as [string, number, number, number][]).map(([nom, places, tauxAcces, n]) => ({ nom, places, tauxAcces, fiche: fiche(n) })).sort((x, y) => x.nom.localeCompare(y.nom, "fr")),
}));

/** The communes with a formation, in alphabetical order, each with its establishments. */
export const parCommune = (): [string, Etablissement[]][] => {
  const by = new Map<string, Etablissement[]>();
  for (const e of ETABLISSEMENTS) by.set(e.commune, [...(by.get(e.commune) ?? []), e]);
  return [...by.entries()].map(([c, list]) => [c, list.sort((x, y) => x.nom.localeCompare(y.nom, "fr"))] as [string, Etablissement[]]).sort((a, b) => a[0].localeCompare(b[0], "fr"));
};
