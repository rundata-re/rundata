/**
 * How many doctors in private practice in each commune of La Réunion, from the Assurance Maladie's directory: the general
 * practitioners by sector and with the OPTAM option, the specialists by speciality and those of them in sector 1. Numbers
 * only, never a name nor an address (the user's decision of 01/11/2026): those are on the directory itself, linked
 * wherever the numbers are. Never whether one takes new patients (the directory does not say).
 * Counted by scripts/build-medecins.py, run by hand when the directory has published new files (each week).
 */
import type { SourceInfo } from "../types.js";
import data from "./medecins-comptes.json" with { type: "json" };

/** A commune's or the island's general practitioners. */
export interface Generalistes {
  total: number;
  secteur_1: number;
  secteur_2: number;
  depassement_permanent: number;
  non_conventionnes: number;
  /** The OPTAM or OPTAM-ACO option: a doctor who limits the excess fees. */
  optam: number;
}

/** A speciality's doctors, under the directory's name of the speciality. */
export interface Specialite {
  total: number;
  secteur_1: number;
}

export interface Comptes {
  generalistes: Generalistes;
  specialistes: Record<string, Specialite>;
}

export interface Commune extends Comptes {
  /** The postcodes where its general practitioners work. */
  codes_postaux: string[];
}

/**
 * The day the counts were made and the day of the directory's file. A doctor with practices in two communes is counted
 * in both, and once in the island's.
 */
export const COMPTES = data as { construit: string; mis_a_jour: string; ile: Comptes; communes: Record<string, Commune> };

export const ofCommune = (commune: string): Commune | undefined => COMPTES.communes[commune];

export const GP = "Médecin généraliste";

export const SOURCE: SourceInfo = {
  id: "annuaire_sante_ameli",
  nom: "Annuaire santé Ameli",
  organisme: "Caisse nationale de l'Assurance Maladie",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Annuaire santé Ameli (Assurance Maladie)",
  url: "https://www.data.gouv.fr/datasets/annuaire-sante-ameli/",
};

/** Where to find a doctor's name, address and hours: the directory itself; its general practitioners of a postcode. */
export const AMELI = "https://annuairesante.ameli.fr/";
export const ameliGps = (cp: string) => `https://annuairesante.ameli.fr/recherche/professions/37/974/${cp}`;

/** What the sectors mean, said wherever one is. */
export const SECTORS =
  "Secteur 1 : le tarif de la Sécurité sociale, sans dépassement d'honoraires sauf exigence particulière du patient. Secteur 2 : dépassements possibles, limités pour les médecins adhérents à l'OPTAM.";

/** The specialities in the plural, as a commune's page counts them; one missing here is written as the directory does. */
const PLURAL: Record<string, string> = {
  "Anatomo-Cyto-Pathologiste": "Anatomo-cyto-pathologistes",
  "Anesthésiste réanimateur": "Anesthésistes réanimateurs",
  "Cancérologue médical": "Cancérologues médicaux",
  "Cancérologue radiothérapeute": "Cancérologues radiothérapeutes",
  "Cardiologue": "Cardiologues",
  "Chirurgien général": "Chirurgiens généraux",
  "Chirurgien infantile": "Chirurgiens infantiles",
  "Chirurgien maxillo-facial": "Chirurgiens maxillo-faciaux",
  "Chirurgien maxillo-facial et stomatologiste": "Chirurgiens maxillo-faciaux et stomatologistes",
  "Chirurgien oral": "Chirurgiens oraux",
  "Chirurgien orthopédiste et traumatologue": "Chirurgiens orthopédistes et traumatologues",
  "Chirurgien plasticien": "Chirurgiens plasticiens",
  "Chirurgien thoracique et cardio-vasculaire": "Chirurgiens thoraciques et cardio-vasculaires",
  "Chirurgien urologue": "Chirurgiens urologues",
  "Chirurgien vasculaire": "Chirurgiens vasculaires",
  "Chirurgien viscéral": "Chirurgiens viscéraux",
  "Dermatologue et vénérologue": "Dermatologues et vénérologues",
  "Endocrinologue-diabétologue": "Endocrinologues-diabétologues",
  "Gastro-entérologue et hépatologue": "Gastro-entérologues et hépatologues",
  "Gériatre": "Gériatres",
  "Gynécologue / Obstétricien": "Gynécologues et obstétriciens",
  "Hématologue": "Hématologues",
  "Médecin biologiste": "Médecins biologistes",
  "Médecin spécialiste en médecine nucléaire": "Spécialistes en médecine nucléaire",
  "Médecine des Maladies infectieuses et tropicales": "Spécialistes des maladies infectieuses et tropicales",
  "Médecine vasculaire": "Médecins vasculaires",
  "Néphrologue": "Néphrologues",
  "Neurochirurgien": "Neurochirurgiens",
  "Neurologue": "Neurologues",
  "Ophtalmologiste": "Ophtalmologistes",
  "Oto-Rhino-Laryngologue (ORL) et chirurgien cervico-facial": "ORL et chirurgiens cervico-faciaux",
  "Pédiatre": "Pédiatres",
  "Pneumologue": "Pneumologues",
  "Psychiatre": "Psychiatres",
  "Radiologue": "Radiologues",
  "Radiothérapeute": "Radiothérapeutes",
  "Rhumatologue": "Rhumatologues",
  "Spécialiste en allergologie": "Spécialistes en allergologie",
  "Spécialiste en médecine interne": "Spécialistes en médecine interne",
  "Spécialiste en médecine physique et de réadaptation": "Spécialistes en médecine physique et de réadaptation",
  "Stomatologiste": "Stomatologistes",
};
export const plural = (specialite: string) => PLURAL[specialite] ?? specialite;
/** The specialities the directory has, by their name in it. */
export const SPECIALITES = Object.keys(PLURAL);
