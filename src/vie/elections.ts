/**
 * The results of the elections in each commune of La Réunion (src/vie/elections.json, scripts/build-elections.py): the
 * ministry of the Interior's, aggregated by data.gouv.fr. For each commune, every scrutin of the file, from 1999 (none
 * before), round by round, and the participation in the first round of each scrutin where the whole commune votes (the
 * bureaux change their perimeter from one election to the next). The ballot lines in the order of their panels, the ministry's,
 * whatever the result: nothing here ranks them nor says who leads. Never a political nuance (the user's decision).
 * Bundled: no read at all.
 */
import type { SourceInfo } from "../types.js";
import data from "./elections.json" with { type: "json" };

export type Type = "muni" | "legi" | "euro" | "pres" | "regi" | "dpmt" | "cant";

/**
 * Each type's name, what its ballot lines are, what a commune split between several races is split into, and a block's
 * heading when the file does not name its race; in the order of the page.
 */
export const TYPES: Record<Type, { nom: string; ligne: string; parties: string | null; anonyme: string | null }> = {
  muni: { nom: "Municipales", ligne: "Liste", parties: null, anonyme: null },
  legi: { nom: "Législatives", ligne: "Candidat", parties: "circonscriptions", anonyme: "Circonscription non nommée dans le fichier" },
  euro: { nom: "Européennes", ligne: "Liste", parties: null, anonyme: null },
  pres: { nom: "Présidentielle", ligne: "Candidat", parties: null, anonyme: null },
  regi: { nom: "Régionales", ligne: "Liste", parties: null, anonyme: null },
  dpmt: { nom: "Départementales", ligne: "Binôme", parties: "cantons", anonyme: "Canton non nommé dans le fichier" },
  // Half the cantons each time, under the cantons of before 2015.
  cant: { nom: "Cantonales", ligne: "Candidat", parties: "cantons", anonyme: "Canton non nommé dans le fichier" },
};

export interface Chiffres {
  inscrits: number;
  abstentions: number;
  votants: number;
  /** Null up to 2015: the file counts them with the nuls. */
  blancs: number | null;
  nuls: number;
  exprimes: number;
}

/**
 * A ballot line as published: a candidate (« NOM Prénom »), a binôme, or a list with its head when the file names it;
 * a list the file names only by its head has no name. No panel in the européennes 2004 and 2009 nor in the municipales
 * 2008: their lines in the order of the alphabet.
 */
export interface Ligne {
  panneau: number | null;
  nom: string | null;
  tete: string | null;
  voix: number;
}

/** One race in the commune: the whole commune, or the bureaux of one circonscription or one canton. */
export interface Bloc extends Chiffres {
  /** The circonscription's or the canton's name, when the file gives it for all the block's bureaux. */
  lieu: string | null;
  lignes: Ligne[];
}

export interface Scrutin {
  id: string;
  type: Type;
  annee: number;
  /** « Municipales 2026 ». */
  nom: string;
  /** Round by round, the commune's blocks; none in a round the commune did not need. */
  tours: Bloc[][];
}

type RawBloc = { g: (number | null)[]; v: [number, number][]; lieu?: string };
type Raw = { lignes: [number | null, string | null, string | null][]; communes: Record<string, RawBloc[]> };

const bloc = (t: Raw, b: RawBloc): Bloc => {
  const [inscrits, abstentions, votants, blancs, nuls, exprimes] = b.g as [number, number, number, number | null, number, number];
  const lignes = b.v.map(([i, voix]) => {
    const [panneau, nom, tete] = t.lignes[i]!;
    return { panneau, nom, tete, voix };
  });
  return { inscrits, abstentions, votants, blancs, nuls, exprimes, lieu: b.lieu ?? null, lignes };
};

const SCRUTINS = (data.scrutins as unknown as { id: string; tours: Raw[] }[]).map((s) => {
  const type = s.id.slice(5) as Type;
  const annee = Number(s.id.slice(0, 4));
  return { id: s.id, type, annee, nom: `${TYPES[type].nom} ${annee}`, tours: s.tours };
});

/** The commune's scrutins, newest first: those of the cantonales only where some of its bureaux voted. */
export function ofCommune(commune: string): Scrutin[] {
  return SCRUTINS.filter((s) => s.tours[0]!.communes[commune])
    .map(({ tours, ...s }) => ({ ...s, tours: tours.map((t) => (t.communes[commune] ?? []).map((b) => bloc(t, b))) }));
}

/** The commune's scrutins type by type, in the order of the page, each type's newest first. */
export function parType(commune: string): { type: Type; scrutins: Scrutin[] }[] {
  const all = ofCommune(commune);
  return (Object.keys(TYPES) as Type[]).map((type) => ({ type, scrutins: all.filter((s) => s.type === type) })).filter((x) => x.scrutins.length);
}

/** The year of the file's first scrutin. */
export const DEBUT = Math.min(...SCRUTINS.map((s) => s.annee));

/** Its inscrits and votants in the first round of each scrutin where the whole commune votes, type by type. */
export function participation(commune: string): { type: Type; nom: string; tours: { annee: number; inscrits: number; votants: number }[] }[] {
  const all = data.participation as unknown as Partial<Record<Type, { annees: number[]; communes: Record<string, [number, number][]> }>>;
  return (Object.keys(TYPES) as Type[]).flatMap((type) => {
    const s = all[type]?.communes[commune];
    return s ? [{ type, nom: TYPES[type].nom, tours: s.map(([inscrits, votants], i) => ({ annee: all[type]!.annees[i]!, inscrits, votants })) }] : [];
  });
}

/**
 * A block's heading in a commune split between races: « 1ère circonscription », « Canton de Saint-Denis-2 », as the file
 * names them; « Canton non nommé dans le fichier (2 sur 3) » when it does not.
 */
export const partie = (type: Type, b: Bloc, i: number, n: number) =>
  b.lieu ? (type === "legi" ? b.lieu : `Canton de ${b.lieu}`) : `${TYPES[type].anonyme} (${i + 1} sur ${n})`;

/** « 46,36 % »: two decimals, as the ministry writes them. */
export const pourcent = (n: number, sur: number) => `${(sur ? (100 * n) / sur : 0).toFixed(2).replace(".", ",")} %`;

/** The day the dataset was last modified. */
export const MIS_A_JOUR: string = data.mis_a_jour;

export const SOURCE: SourceInfo = {
  id: "elections_agregees",
  nom: "Données des élections agrégées",
  organisme: "Ministère de l'Intérieur, data.gouv.fr",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Ministère de l'Intérieur, données agrégées par data.gouv.fr",
  url: data.page,
};
