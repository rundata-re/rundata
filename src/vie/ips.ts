/**
 * The collèges and lycées of La Réunion with their indice de position sociale and their results (src/vie/ips.json,
 * scripts/build-ips.py): the ministry of Education's DEPP, the IPS of the last rentrée and the indicateurs de valeur
 * ajoutée of the last session. For each rate, the rate the ministry expected: the rate less its valeur ajoutée. Names
 * and communes are those of the annuaire (vie/ecoles.ts), by the UAI. In alphabetical order only: nothing here ranks
 * them, nor gives what to rank them by. Bundled: no read at all.
 */
import type { SourceInfo } from "../types.js";
import * as ecoles from "./ecoles.js";
import data from "./ips.json" with { type: "json" };

/** A rate in whole points, and the rate expected (« Valeur ajoutée = Taux constaté – Taux attendu »), when the ministry computes it. */
export interface Taux {
  taux: number;
  attendu: number | null;
}

export interface Voie {
  presents: number;
  /** From seconde to the bac; none for a lycée without the three years. */
  acces: Taux | null;
  reussite: Taux;
}

export interface College {
  uai: string;
  nom: string;
  commune: string;
  ips: number;
  /** In the brevet's série générale, which alone has an expected rate. */
  candidats: number;
  reussite: Taux;
}

export interface Lycee {
  uai: string;
  nom: string;
  commune: string;
  ips: number;
  gt: Voie | null;
  pro: Voie | null;
}

/** « 2025 »: the rentrée of the IPS. */
export const RENTREE: number = data.rentree;
/** « 2025 »: the session of the brevet and the bac. */
export const SESSION: number = data.session;

/** Below these, the ministry computes no expected rate (guides IVAC and IVAL 2025): too few candidates. */
export const SEUIL = { college: 40, gt: 40, pro: 20 } as const;

const BY_UAI = new Map(ecoles.LIST.map((e) => [e.uai, e]));
const of = (uai: string) => {
  const e = BY_UAI.get(uai);
  if (!e) throw new Error(`ips: ${uai} is not in the annuaire`);
  return { nom: e.nom, commune: e.commune };
};
const taux = (t: number, va: number | null): Taux => ({ taux: t, attendu: va === null ? null : t - va });
const voie = (v: (number | null)[] | null): Voie | null =>
  v && { presents: v[0]!, acces: v[1] === null ? null : taux(v[1]!, v[2]!), reussite: taux(v[3]!, v[4]!) };
const byName = <T extends { nom: string }>(a: T, b: T) => a.nom.localeCompare(b.nom, "fr");

export const COLLEGES: College[] = (data.colleges as [string, number, number, number, number | null][])
  .map(([uai, ips, candidats, reussite, va]) => ({ uai, ...of(uai), ips, candidats, reussite: taux(reussite, va) }))
  .sort(byName);

export const LYCEES: Lycee[] = (data.lycees as [string, number, (number | null)[] | null, (number | null)[] | null][])
  .map(([uai, ips, gt, pro]) => ({ uai, ...of(uai), ips, gt: voie(gt), pro: voie(pro) }))
  .sort(byName);

/** The communes with a collège or a lycée, in alphabetical order, each with its collèges and its lycées. */
export const parCommune = (): [string, College[], Lycee[]][] =>
  [...new Set([...COLLEGES, ...LYCEES].map((e) => e.commune))].sort((a, b) => a.localeCompare(b, "fr"))
    .map((c) => [c, COLLEGES.filter((e) => e.commune === c), LYCEES.filter((e) => e.commune === c)]);

const JEUX = data.jeux as Record<string, { titre: string; page: string; mis_a_jour: string }>;
/** The datasets' pages, in the order the page credits them. */
export const PAGES = Object.values(JEUX);

export const SOURCE_IPS: SourceInfo = {
  id: "depp_ips",
  nom: "Indices de position sociale des collèges et des lycées",
  organisme: "Ministère de l'Éducation nationale, DEPP",
  licence: "Licence Ouverte 2.0",
  attribution: "DEPP, ministère de l'Éducation nationale",
  url: JEUX["fr-en-ips-colleges-ap2023"]!.page,
};

export const SOURCE_VA: SourceInfo = {
  id: "depp_valeur_ajoutee",
  nom: "Indicateurs de valeur ajoutée des collèges et des lycées",
  organisme: "Ministère de l'Éducation nationale, DEPP",
  licence: "Licence Ouverte 2.0",
  attribution: "DEPP, ministère de l'Éducation nationale",
  url: JEUX["fr-en-indicateurs-valeur-ajoutee-colleges"]!.page,
};
