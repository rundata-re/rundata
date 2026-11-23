/**
 * The parts of the island people name as places (« quel temps dans le Sud ? », « vigilance dans l'Est ? »): Météo-France's
 * land zones of vigilance, whose names they are, with their communes, and the commune the answers stand for: the chief
 * town of the part, in its zone. The resolver (resolve.ts) gives that commune, said a stand-in for the whole part,
 * rather than a lieu-dit whose name holds the word (« Sommet Nord », « Îlet Sud », 23/11/2026).
 */
import { normalize } from "./resolve.js";

export interface Region {
  /** As said: « le Sud ». */
  nom: string;
  /** Its zone of vigilance, as Météo-France names it (providers/vigilance.ts). */
  zone: string;
  /** The commune answers stand for. */
  pour: string;
  communes: string[];
}

export const REGIONS: Record<string, Region> = {
  nord: { nom: "le Nord", zone: "Nord", pour: "Saint-Denis", communes: ["Saint-Denis", "Sainte-Marie"] },
  est: { nom: "l'Est", zone: "Est", pour: "Saint-Benoît", communes: ["Sainte-Suzanne", "Saint-André", "Salazie", "Bras-Panon", "Saint-Benoît", "La Plaine-des-Palmistes", "Sainte-Rose"] },
  "sud est": { nom: "le Sud-Est", zone: "Sud-Est", pour: "Saint-Joseph", communes: ["Saint-Joseph", "Saint-Philippe"] },
  sud: { nom: "le Sud", zone: "Sud", pour: "Saint-Pierre", communes: ["Saint-Pierre", "Le Tampon", "Entre-Deux", "Saint-Louis", "Cilaos", "L'Étang-Salé", "Les Avirons", "Petite-Île"] },
  ouest: { nom: "l'Ouest", zone: "Ouest", pour: "Saint-Paul", communes: ["Saint-Leu", "Les Trois-Bassins", "Saint-Paul", "Le Port", "La Possession"] },
};
// « le Sud sauvage »: Saint-Joseph and Saint-Philippe, Météo-France's Sud-Est.
const SAME: Record<string, string> = { "sud sauvage": "sud est" };

// « le Sud », « dans l'Ouest », « côte est », « la région Nord », « le sud de l'île », folded by `normalize`.
const SAID = new RegExp(
  "^(?:(?:dans|vers|pour|sur|a|au|en)\\s+)?(?:(?:le|la|l|les)\\s+)?" +
    "(?:(?:cote|partie|region|zone|secteur|coin|microregion)\\s+(?:(?:du|de|d|des)\\s+)?(?:(?:le|la|l)\\s+)?)?" +
    "(nord|est|ouest|sud(?:\\s+(?:est|sauvage))?)" +
    "(?:\\s+(?:de\\s+)?(?:l\\s+)?(?:ile|la reunion|reunion|974))?$",
);

/** The part of the island a text names alone, if it does: « le Sud » → Sud. */
export function regionOf(text: string): Region | undefined {
  const m = SAID.exec(normalize(text).replace(/\s+/g, " "));
  if (!m) return undefined;
  const k = m[1]!.replace(/\s+/, " ");
  return REGIONS[SAME[k] ?? k];
}

/** Parts of the island that are no zone of one commune: no place, rather than a lieu-dit of the name (Lambert les Hauts). */
export const NO_PLACE = /^(?:(?:dans|vers|pour|sur|a|au|en)\s+)?(?:les?\s+)?(?:hauts|cirques|bas|ecarts)(?:\s+(?:de\s+)?(?:l\s+)?(?:ile|la reunion|reunion))?$/;
