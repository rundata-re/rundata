// The contracted article before a place's name, for every text that names one: « la zone du Tampon », never « de Le Tampon ».

/** « de Saint-Paul », « du Tampon », « des Avirons », « de L'Étang-Salé ». */
export function de(nom: string): string {
  return nom.replace(/^Le /, "du ").replace(/^Les /, "des ").replace(/^(?!du |des )/, "de ");
}

/** « à Saint-Paul », « au Tampon », « aux Avirons », « à L'Étang-Salé ». */
export function a(nom: string): string {
  return nom.replace(/^Le /, "au ").replace(/^Les /, "aux ").replace(/^(?!au |aux )/, "à ");
}
