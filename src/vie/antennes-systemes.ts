/**
 * What the sheet of /antennes says of one mobile support, for fiche_terrain: each system of each operator (generation and
 * band), its declared state, its day in service and its antennas' azimuths, read from the same file
 * (src/vie/antennes-fiches.json, built by scripts/build-antennes.py) and said in the same words as the sheet's script
 * (web/antennes-fiche.ts). Values declared by the operators to the ANFR, not measures; the power is not in the file.
 */
import fiches from "./antennes-fiches.json" with { type: "json" };
import { date } from "./antennes.js";

/** [operator's letter, system (« LTE 1800 »), state (s, o, p), day in service or "", azimuths « 60|140|225 » or ""]. */
export type Ligne = [string, string, string, string, string];

const LIGNES = fiches.supports as unknown as Record<string, Ligne[]>;
export const FICHES_DU = fiches.fichier_du;

/** The sheet's words (web/antennes-fiche.ts, ficheScript). */
export const OPERATEUR: Record<string, string> = { o: "Orange", s: "SFR Réunion", f: "Free", z: "Zeop" };
const ETAT: Record<string, string> = { s: "en service", o: "techniquement opérationnel", p: "projet approuvé" };
const GEN: Record<string, string> = { GSM: "2G", UMTS: "3G", LTE: "4G", "5G NR": "5G" };
export const PUISSANCE = "non publiée par l'ANFR";
const ORDRE = ["GSM", "UMTS", "LTE", "5G NR"];

/** A system's order on the sheet: by generation, then by band. */
const rang = (x: string) => {
  const m = /^(.*) (\d+)$/.exec(x);
  return m ? (ORDRE.indexOf(m[1]) + 1) * 1e5 + Number(m[2]) : 9e5;
};

/** « LTE 1800 » → « 4G (LTE), bande des 1 800 MHz », as the sheet says it. */
export function systeme(x: string): string {
  const m = /^(.*) (\d+)$/.exec(x);
  if (!m || !GEN[m[1]]) return x;
  return `${GEN[m[1]]} (${m[1]}), bande des ${Number(m[2]).toLocaleString("fr-FR")} MHz`;
}

/** « 60|140|225 » → « 60 °, 140 ° et 225 ° », or « non publiés ». */
export function azimuts(a: string): string {
  const l = a ? a.split("|").map((x) => `${x} °`) : [];
  return l.length ? (l.length > 1 ? `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}` : l[0]) : "non publiés";
}

export interface Systeme {
  systeme: string;
  etat: string;
  mise_en_service: string;
  azimuts?: string;
}

/**
 * The systems of a support, by operator, in the sheet's order. The azimuts once for the operator when all its systems
 * share them (as the sheet says them under its list), else on each system.
 */
export function systemesDu(id: number): { operateur: string; systemes: Systeme[]; azimuts?: string }[] {
  const rows = LIGNES[String(id)] ?? [];
  return Object.keys(OPERATEUR).flatMap((k) => {
    const r = rows.filter((x) => x[0] === k).sort((a, b) => rang(a[1]) - rang(b[1]));
    if (!r.length) return [];
    const un = r.every((x) => x[4] === r[0][4]);
    return [{
      operateur: OPERATEUR[k],
      systemes: r.map((x) => ({
        systeme: systeme(x[1]),
        etat: ETAT[x[2]] ?? x[2],
        mise_en_service: x[3] ? date(x[3]) : "non publiée",
        ...(un ? {} : { azimuts: azimuts(x[4]) }),
      })),
      ...(un ? { azimuts: azimuts(r[0][4]) } : {}),
    }];
  });
}
