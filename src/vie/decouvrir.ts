/**
 * The remarkable places of each commune (src/vie/decouvrir.json, scripts/build-decouvrir.py): the « Lieux remarquables »
 * of the island's tourist information system (SIT, TourInSoft), on the Région's portal, which the SIT rebuilds every
 * week. Museums, gardens, estates, temples, distilleries: their name, their categories, their short text, and the
 * historic monument a place is, when it is one (vie/monuments.ts). No place named after a person, and none of the
 * « Terroir » alone (shops, workshops, markets): the heritage only.
 * Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./decouvrir.json" with { type: "json" };
import { MONUMENTS, type Monument } from "./monuments.js";

export interface Lieu {
  nom: string;
  insee: string;
  /** The SIT's: « Patrimoine culturel », « Patrimoine naturel », « Patrimoine agricole », « Patrimoine industriel », « Terroir ». */
  categories: string[];
  /** Its short text, as the SIT writes it. */
  texte?: string;
  /** The reference in the base Mérimée of the historic monument it is. */
  monument?: string;
}

export const LIEUX = data.lieux as Lieu[];
/** The day the SIT rebuilt the list that was taken, « 2026-11-01 ». */
export const LISTE_DU = data.liste_du;

/** The heritage first, then the terroir: the order of the list and of the counts. */
export const CATEGORIES = ["Patrimoine culturel", "Patrimoine naturel", "Patrimoine industriel", "Patrimoine agricole", "Terroir"];

const rank = (l: Lieu) => Math.min(...l.categories.map((c) => CATEGORIES.indexOf(c)).filter((i) => i >= 0), CATEGORIES.length);

/** The commune's places: the historic monuments first, then by category, then by name. */
export function ofCommune(nom: string): Lieu[] {
  const insee = INSEE[nom];
  return LIEUX.filter((l) => l.insee === insee)
    .sort((a, b) => Number(!a.monument) - Number(!b.monument) || rank(a) - rank(b) || a.nom.localeCompare(b.nom, "fr"));
}

/** How many of each category, the most first: a place of two categories counts in both. */
export function counts(list: Lieu[]): [string, number][] {
  return CATEGORIES.map((c) => [c, list.filter((l) => l.categories.includes(c)).length] as [string, number])
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1]);
}

// Where the SIT's summaries place a place without saying where: « situé en France », « Localisé à La Réunion ».
const NOWHERE = "(?:(?:(?:situé|localisé)e?s?\\s+)?(?:en France|en Outre-mer)|(?:situé|localisé)e?s?\\s+(?:à La Réunion|sur l'île de La Réunion|à une adresse non précisée|à un endroit non précisé|dans un lieu non précisé))";
const DAY = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?";
const END = "(?=[\\s,.]|$)";
// When or how to come, which may be old: « , ouvert du mardi au samedi », « , uniquement le jeudi matin », « sur rendez-vous ».
const WHEN = [
  new RegExp(`(?:,\\s*(?:ouverte?s?|accessibles?|fermée?s?|uniquement)${END}|\\s+ouverte?s?\\s+(?:du|le|les|tous|toute|en semaine|\\S+ jours)\\b|\\s+(?:du|le|les) ${DAY}${END}|,\\s*avec [^,]*(?:réservation|rendez-vous)).*$`, "i"),
  new RegExp(`\\s+(?:sur (?:réservation|rendez-vous)|en semaine)${END}`, "gi"),
];
// A sentence that is mostly about it: « Établissement accessible sur réservation, ouvert en semaine de 9h30 à 17h30. »
const ABOUT_WHEN = new RegExp(`^(?:établissement\\s+)?(?:ouvert|accessible|fermé|horaires?|tarifs?|accès|réservation|visites? (?:sur|uniquement)|${DAY})${END}`, "i");
// Off the island: « Atelier visitable sur réservation à Paris ». A space before « à », not \b: « à » is no word letter to \b.
// The same for END after « é ».
const ELSEWHERE = /(?:^|\s)(?:à Paris|en métropole|en France métropolitaine|en Europe|à l'étranger)\b/i;

/**
 * What the page says of a place: the first sentence of the SIT's summary, without the empty « situé en France » nor the
 * hours, days and bookings, which may be old (the page says to ask the place). Nothing when that sentence is about
 * them, or when the summary places it off the island.
 */
export function resume(texte: string | undefined): string | undefined {
  if (!texte || ELSEWHERE.test(texte)) return undefined;
  const first = texte.match(/^.+?[.!?](?=\s+[A-ZÀ-Ý]|$)/)?.[0] ?? texte;
  if (ABOUT_WHEN.test(first.trim())) return undefined;
  const s = first.replace(/[.!?]$/, "").replace(/\s*\((?:La )?Réunion\)/g, "")
    // « bois, situé dans un lieu non précisé » goes with its comma, « Établissement situé à La Réunion, composé » with the next one.
    .replace(new RegExp(`,\\s*${NOWHERE}${END}`, "gi"), "")
    .replace(new RegExp(`\\s+${NOWHERE},?${END}`, "gi"), "")
    // « avec des animations, une boutique et des horaires d'ouverture de 10h à 18h »: « des animations et une boutique ».
    .replace(/, ([^,]+) et des horaires.*$/i, " et $1")
    .replace(WHEN[0], "").replace(WHEN[1], "")
    .replace(/\s*,\s*$/, "").trim();
  return s.length > 15 ? `${s}.` : undefined;
}

/** The historic monument it is. */
export const monumentOf = (l: Lieu): Monument | undefined => (l.monument ? MONUMENTS.find((m) => m.ref === l.monument) : undefined);

export const SOURCE: SourceInfo = {
  id: "sit_lieux_remarquables",
  nom: "Les lieux remarquables de la Réunion (TourInSoft)",
  organisme: "Système d'Information Touristique (SIT) de l'île de La Réunion",
  licence: "Licence Ouverte Etalab",
  attribution: "SIT de La Réunion, via data.regionreunion.com",
  url: data.page,
};
