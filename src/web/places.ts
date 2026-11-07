/**
 * The places that get a page of their own at /meteo/<slug>: the 24 communes, plus the few places people search
 * the weather of by their own name. Each is resolved through the gazetteer, like a question to the tools.
 */
import gazetteer from "../places/gazetteer.js";
import { resolvePlace } from "../places/resolve.js";
import type { Place } from "../places/resolve.js";

export interface PlacePage {
  slug: string;
  /** The name shown and searched for (« Piton de la Fournaise », not the viewpoint the gazetteer answers with). */
  nom: string;
  /** What `meteo_actuelle` and the other tools are asked about. */
  lieu: string;
  /** Short words after the name in titles: « cirque », « volcan »… */
  precision?: string;
  place: Place;
  commune: boolean;
}

const EXTRAS: { nom: string; lieu?: string; precision: string }[] = [
  { nom: "Piton de la Fournaise", precision: "volcan" },
  { nom: "Maïdo", precision: "belvédère" },
  { nom: "Plaine des Cafres", precision: "Hauts du Tampon" },
  { nom: "Hell-Bourg", precision: "cirque de Salazie" },
  { nom: "L'Hermitage", precision: "plage et lagon" },
  { nom: "Saint-Gilles-les-Bains", precision: "station balnéaire" },
];

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function page(nom: string, lieu: string, commune: boolean, precision?: string): PlacePage {
  const r = resolvePlace(lieu);
  if (!r) throw new Error(`lieu inconnu du gazetteer : ${lieu}`);
  return { slug: slugify(nom), nom, lieu, precision, place: r.lieu, commune };
}

const COMMUNES = (gazetteer as { places: { nom: string; type: string }[] }).places
  .filter((p) => p.type === "commune")
  .map((p) => p.nom)
  .sort((a, b) => a.localeCompare(b, "fr"));

export const PAGES: PlacePage[] = [
  ...COMMUNES.map((n) => page(n, n, true)),
  ...EXTRAS.map((e) => page(e.nom, e.lieu ?? e.nom, false, e.precision)),
];

const BY_SLUG = new Map(PAGES.map((p) => [p.slug, p]));

export function pageOf(slug: string): PlacePage | undefined {
  return BY_SLUG.get(slug);
}

/**
 * The 19 communes that have a shore, each touching one of Météo-France's 8 coastal zones (VIGI974-51 to 58). Not
 * from the altitude of their centre: Saint-André (97 m), Petite-Île, Les Avirons and Les Trois-Bassins (783 m) are
 * on the sea too. Cilaos, Salazie, La Plaine-des-Palmistes, Le Tampon and Entre-Deux are not.
 */
export const COMMUNES_COTIERES: ReadonlySet<string> = new Set([
  "Bras-Panon", "L'Étang-Salé", "La Possession", "Le Port", "Les Avirons", "Les Trois-Bassins", "Petite-Île",
  "Saint-André", "Saint-Benoît", "Saint-Denis", "Saint-Joseph", "Saint-Leu", "Saint-Louis", "Saint-Paul",
  "Saint-Philippe", "Saint-Pierre", "Sainte-Marie", "Sainte-Rose", "Sainte-Suzanne",
]);

/**
 * Beaches and the coast get the sea temperature and the waves-submersion vigilance; the Hauts and the cirques do not.
 * A commune by the list above; another place by its type or its altitude.
 */
export function coastal(p: PlacePage): boolean {
  if (p.commune) return COMMUNES_COTIERES.has(p.nom);
  return p.place.type === "plage" || (p.place.altitude_m ?? 999) < 80;
}
