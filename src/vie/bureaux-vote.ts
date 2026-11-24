/**
 * The polling stations of each commune of La Réunion, from the Insee's « Bureaux de vote et adresses de leurs électeurs »
 * (src/vie/bureaux-vote.json, scripts/build-bureaux-vote.py): each place, its address and the numbers of its bureaux,
 * as the Insee writes them. Never which bureau an address or a person votes in: the electors' addresses are not read
 * (24/11/2026); their card, their mairie and service-public.fr say it. An extraction of September 2022,
 * older than the municipal elections of 2026, said wherever the list is. Bundled: no read at all.
 */
import { INSEE } from "../places/insee.js";
import type { SourceInfo } from "../types.js";
import data from "./bureaux-vote.json" with { type: "json" };

export interface Lieu {
  /** The place's name, absent where the Insee gives only « bureau N » (Saint-Pierre: the place is in the address). */
  lieu?: string;
  adresse: string;
  /** The numbers of its bureaux, as the commune numbers them. */
  bureaux: string[];
}

export const SOURCE: SourceInfo = {
  id: "insee_bureaux_vote",
  nom: "Bureaux de vote et adresses de leurs électeurs",
  organisme: "Insee",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Insee, d'après le Répertoire électoral unique",
  url: data.page,
};

/** « septembre 2022 »: the month of the Insee's extraction. */
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const EXTRACTION = `${MOIS[Number(data.extraction.slice(5, 7)) - 1]} ${data.extraction.slice(0, 4)}`;

/** Said wherever the list is. */
export const A_SAVOIR = `Liste de l'Insee, d'après le Répertoire électoral unique de ${EXTRACTION}, mise à jour tous les cinq ans : elle date d'avant les municipales de 2026, et des bureaux ont pu changer depuis. Adresses telles que l'Insee les écrit.`;

/** The official service that tells an elector their bureau. */
export const ISE = "https://www.service-public.fr/particuliers/vosdroits/services-en-ligne-et-formulaires/ISE";
export const SON_BUREAU = "Son bureau de vote est indiqué sur sa carte électorale\u00a0; la mairie ou le service «\u00a0Interroger sa situation électorale\u00a0» de service-public.fr le confirment.";

const COMMUNES = data.communes as Record<string, Lieu[]>;

/** A commune's places, by its name as the gazetteer spells it; [] for a name that is not a commune. */
export function lieuxDe(commune: string): Lieu[] {
  const code = INSEE[commune];
  return (code && COMMUNES[code]) || [];
}

export const nombreDe = (lieux: Lieu[]) => lieux.reduce((n, l) => n + l.bureaux.length, 0);

/** « bureau 4 », « bureaux 1 à 6 », « bureaux 2, 3, 73 et 87 »: consecutive numbers said as a span. */
export function numeros(b: string[]): string {
  if (b.length === 1) return `bureau ${b[0]}`;
  const spans: string[][] = [];
  for (const x of b) {
    const last = spans.at(-1);
    if (last && /^\d+$/.test(x) && /^\d+$/.test(last.at(-1)!) && Number(x) === Number(last.at(-1)) + 1) last.push(x);
    else spans.push([x]);
  }
  const said = spans.flatMap((s) => (s.length >= 3 ? [`${s[0]} à ${s.at(-1)}`] : s));
  return `bureaux ${said.length === 1 ? said[0] : `${said.slice(0, -1).join(", ")} et ${said.at(-1)}`}`;
}
