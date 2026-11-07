// The contracted article before a place's name, for every text that names one: « la zone du Tampon », never « de Le Tampon »;
// « au Piton des Neiges », « de la plage de l'Ermitage-les-Bains », « au Maïdo », never « à Plage de l'Ermitage-les-Bains »
// (06/11/2026: the connector's answers and the pages' titles, « Météo à Maïdo »).

import gazetteer from "./places/gazetteer.js";

// The commune whose name has no article but takes one in a sentence: « à l'Entre-Deux », as the island and the commune
// say it; the name alone where no word comes before it (« Météo Entre-Deux », marketing).
const ENTRE_DEUX = "Entre-Deux";

type Genre = "m" | "f" | "p";

/**
 * The common nouns a place's name starts with, and their gender (« p »: plural): « Piton des Neiges » is « le Piton des
 * Neiges ». A name made of an adjective first (« Grand Coude », « Petite-Île ») takes none.
 */
const NOMS: Record<string, Genre> = {
  Aéroport: "m", Aire: "f", Anse: "f", Baie: "f", Barrage: "m", Bassin: "m", Belvédère: "m", Bois: "m", Bras: "m",
  Camp: "m", Canal: "m", Cap: "m", Cascade: "f", Cascades: "p", Caverne: "f", Centre: "m", Chapelle: "f", Chemin: "m",
  Cité: "f", Col: "m", Complexe: "m", Coteau: "m", Coulée: "f", Cratère: "m", Crête: "f", Domaine: "m", Dos: "m",
  Église: "f", Espace: "m", Étang: "m", Ferme: "f", Fond: "m", Forêt: "f", Gare: "f", Gîte: "m", Gouffre: "m",
  Grotte: "f", Îlet: "m", Ilet: "m", Jardin: "m", Lagon: "m", Ligne: "f", Lotissement: "m", Maison: "f", Mare: "f",
  Mont: "m", Morne: "m", Moulin: "m", Musée: "m", Nez: "m", Parc: "m", Pente: "f", Phare: "m", Pic: "m", Piscine: "f",
  Piton: "m", Pitons: "p", Place: "f", Plage: "f", Plaine: "f", Plateau: "m", Point: "m", Pointe: "f", Pont: "m",
  Port: "m", Puy: "m", Quai: "m", Rempart: "m", Ravine: "f", Rivière: "f", Roche: "f", Rocher: "m", Route: "f",
  Ruisseau: "m", Sentier: "m", Site: "m", Sommet: "m", Source: "f", Square: "m", Stade: "m", Stèle: "f", Terrain: "m",
  Théâtre: "m", Trou: "m", Zone: "f",
};

/**
 * Names that take an article in the island's usage, whatever their kind: « au Maïdo », « à la Plaine des Cafres ». The
 * Plaines that are not a commune; the commune keeps its own (« à La Plaine-des-Palmistes »).
 */
const USAGE: Record<string, Genre> = { Maïdo: "m", "Plaine des Cafres": "f", "Plaine des Makes": "f", "Plaine des Grègues": "f" };

/** Where people live: their name is said as it is (« à Grand Coude », « à Bois de Nèfles »), never with an article. */
const HABITES = new Set(["commune", "quartier", "localite", "lieu_dit"]);
/**
 * The common nouns written in lowercase after their article, when they start the name of a place of their kind: « la
 * plage de l'Ermitage-les-Bains », « le port de Saint-Gilles ». The others keep their capital, as the island's
 * toponymy writes them (« le Piton des Neiges », « l'Anse des Cascades »).
 */
const MINUSCULE: Record<string, string> = { Plage: "plage", Baie: "baie", Port: "port", Aéroport: "aeroport" };

interface Article { genre: Genre; minuscule: boolean }
let table: Map<string, Article | null> | undefined;

/** Each name of the gazetteer, with its article or none: a name a place where people live bears too takes none. */
function articles(): Map<string, Article | null> {
  if (table) return table;
  table = new Map();
  for (const p of [...gazetteer.places, ...gazetteer.places_ign] as { nom: string; type: string }[]) {
    if (table.get(p.nom) === null) continue;
    const premier = p.nom.split(/[\s-]/)[0];
    const genre = NOMS[premier];
    table.set(p.nom, HABITES.has(p.type) || !genre ? null : { genre, minuscule: MINUSCULE[premier] === p.type });
  }
  for (const [nom, genre] of Object.entries(USAGE)) table.set(nom, { genre, minuscule: false });
  return table;
}

const voyelle = (nom: string) => /^[aeiouyàâéèêëîïôöûüh]/i.test(nom);

/** The article a name takes, and the name as it reads after it, or none (a commune, a quartier, a name we do not know). */
function article(nom: string): { genre: Genre; elide: boolean; reste: string } | undefined {
  const a = articles().get(nom);
  if (!a) return undefined;
  const reste = a.minuscule ? nom.charAt(0).toLowerCase() + nom.slice(1) : nom;
  return { genre: a.genre, elide: a.genre !== "p" && voyelle(nom), reste };
}

/**
 * « de Saint-Paul », « du Tampon », « des Avirons », « de L'Étang-Salé », « de l'Entre-Deux », « du Maïdo », « de la
 * plage de… », « d'Îlet à Cordes ».
 */
export function de(nom: string): string {
  if (nom === ENTRE_DEUX) return `de l'${nom}`;
  const x = article(nom);
  if (x) return `${x.genre === "p" ? "des " : x.elide ? "de l'" : x.genre === "m" ? "du " : "de la "}${x.reste}`;
  return nom.replace(/^Le /, "du ").replace(/^Les /, "des ").replace(/^(?!du |des )/, /^[aeiouyàâéèêëîïôöûü]/i.test(nom) ? "d'" : "de ");
}

/** « à Saint-Paul », « au Tampon », « aux Avirons », « à L'Étang-Salé », « à l'Entre-Deux », « au Maïdo », « à la plage de… ». */
export function a(nom: string): string {
  if (nom === ENTRE_DEUX) return `à l'${nom}`;
  const x = article(nom);
  if (x) return `${x.genre === "p" ? "aux " : x.elide ? "à l'" : x.genre === "m" ? "au " : "à la "}${x.reste}`;
  return nom.replace(/^Le /, "au ").replace(/^Les /, "aux ").replace(/^(?!au |aux )/, "à ");
}

/** The name with its article, as the subject of a sentence: « le Maïdo », « la plage de l'Ermitage-les-Bains », « Saint-Paul ». */
export function le(nom: string): string {
  if (nom === ENTRE_DEUX) return `l'${nom}`;
  const x = article(nom);
  return x ? `${x.genre === "p" ? "les " : x.elide ? "l'" : x.genre === "m" ? "le " : "la "}${x.reste}` : nom;
}

/** « d'Alternéo », « de Citalis » : « de » before a name that has no article, elided before a vowel. */
export const deNom = (nom: string): string => (/^[aeiouyàâéèêëîïôöûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`);
