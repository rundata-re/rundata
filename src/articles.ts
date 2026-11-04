// The contracted article before a place's name, for every text that names one: « la zone du Tampon », never « de Le Tampon ».

// The commune whose name has no article but takes one in a sentence: « à l'Entre-Deux », as the island and the commune
// say it; the name alone where no word comes before it (« Météo Entre-Deux », marketing).
const ENTRE_DEUX = "Entre-Deux";

/** « de Saint-Paul », « du Tampon », « des Avirons », « de L'Étang-Salé », « de l'Entre-Deux ». */
export function de(nom: string): string {
  if (nom === ENTRE_DEUX) return `de l'${nom}`;
  return nom.replace(/^Le /, "du ").replace(/^Les /, "des ").replace(/^(?!du |des )/, "de ");
}

/** « à Saint-Paul », « au Tampon », « aux Avirons », « à L'Étang-Salé », « à l'Entre-Deux ». */
export function a(nom: string): string {
  if (nom === ENTRE_DEUX) return `à l'${nom}`;
  return nom.replace(/^Le /, "au ").replace(/^Les /, "aux ").replace(/^(?!au |aux )/, "à ");
}

/** « d'Alternéo », « de Citalis » : « de » before a name that has no article, elided before a vowel. */
export const deNom = (nom: string): string => (/^[aeiouyàâéèêëîïôöûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`);
