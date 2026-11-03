/**
 * The « sentiers marmailles » (src/vie/marmailles.json, scripts/build-marmailles.py): 45 walks for all, children
 * included, of the Conseil Général and the AGORAH, on the Région's open data portal, with their length and time as the
 * source gives them, their trace, and the ONF trails each follows. The source has no date, and says nothing of their
 * state: it is the ONF's, read live, on the stretches the ONF follows, never more. Bundled: no read at all.
 */
import { communeAt } from "../places/resolve.js";
import type { Sentier } from "../providers/sentiers.js";
import { decode } from "../providers/traces.js";
import type { SourceInfo } from "../types.js";
import data from "./marmailles.json" with { type: "json" };

export interface Marmaille {
  id: number;
  nom: string;
  /** As the source gives it. */
  km: number;
  /** « 1 h 30 », « 50 min », no-break spaces in. */
  duree: string;
  minutes?: number;
  /** The ONF trails it follows, by their name on the ONF's map. */
  sentiers_onf: string[];
  /** The share of its trace along them: the rest has no state anywhere. */
  part_onf: number;
  /** « aller-retour » when the source's length is twice the trace, « boucle » when it is the trace's; else unsaid. */
  parcours?: "aller-retour" | "boucle";
  /** Polylines (Google's encoding, 5 decimals), the longest first. */
  lignes: string[];
}

export const SENTIERS = data.sentiers as Marmaille[];
/** The day the list was read from the portal. */
export const LU_LE = data.construit;
/** Most of a walk along ONF trails: what is said open of them is said of nearly all of it. */
export const PRESQUE = 0.9;

export const points = (m: Marmaille) => decode(m.lignes[0]);
/** Its middle, the middle of its longest piece. */
export const milieu = (m: Marmaille) => {
  const p = points(m);
  return p[Math.floor(p.length / 2)];
};

const COMMUNES = new Map(SENTIERS.map((m) => [m.id, communeAt(...milieu(m))]));
/** Its commune, where its middle is. */
export const communeOf = (m: Marmaille) => COMMUNES.get(m.id)!;
export const inCommune = (c: string) => SENTIERS.filter((m) => communeOf(m) === c).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
export const communes = () => [...new Set(SENTIERS.map(communeOf))].sort((a, b) => a.localeCompare(b, "fr"));

/** « 4 km aller-retour · 2 h », « 3,1 km en boucle · 1 h 30 ». */
export const figures = (m: Marmaille) =>
  `${String(m.km).replace(".", ",")}\u00a0km${m.parcours === "boucle" ? " en boucle" : m.parcours ? ` ${m.parcours}` : ""} · ${m.duree}`;

/** Said with them, in the tool as on /enfants (data-run, 03/11). */
export const AVERTISSEMENT = "Tracés du Conseil Général, sans date\u00a0: un chemin a pu changer depuis.";

/**
 * The state of a walk from the ONF's map: its trails' when it follows some, said for what they cover only. « fermé » when
 * the ONF closes one of them; « ouvert sur les sentiers de l'ONF » when it opens them all; « en partie suivi par l'ONF »
 * when some are open and the others have no state there (« hors gestion ONF », or not on the map that day).
 */
export interface Etat {
  etat: "fermé" | "ouvert sur les sentiers de l'ONF" | "en partie suivi par l'ONF" | "non suivi par l'ONF";
  /** What to say: never « ouvert » alone. */
  texte: string;
  fermes?: { sentier: string; cause?: string; info?: string }[];
}

export function etat(m: Marmaille, onf: Pick<Sentier, "nom" | "statut" | "cause" | "info">[]): Etat {
  if (!m.sentiers_onf.length) return { etat: "non suivi par l'ONF", texte: "État non suivi par l'ONF\u00a0: ce sentier n'emprunte aucun sentier de sa carte." };
  const of = (nom: string) => onf.filter((s) => s.nom === nom);
  const fermes = m.sentiers_onf.flatMap((nom) => of(nom).filter((s) => s.statut === "fermé").slice(0, 1).map((s) => ({ sentier: nom, cause: s.cause, info: s.info })));
  if (fermes.length) return { etat: "fermé", texte: `Fermé par l'ONF\u00a0: ${fermes.map((f) => `${f.sentier}${f.cause ? ` (${f.cause})` : ""}`).join(", ")}.`, fermes };
  const open = m.sentiers_onf.filter((nom) => of(nom).some((s) => s.statut === "ouvert"));
  const other = m.sentiers_onf.filter((nom) => !open.includes(nom));
  if (!open.length) return { etat: "non suivi par l'ONF", texte: `État non connu\u00a0: ${other.join(", ")}, sans état sur la carte de l'ONF (hors gestion ONF).` };
  if (other.length) return { etat: "en partie suivi par l'ONF", texte: `Ouvert sur la carte de l'ONF\u00a0: ${open.join(", ")}. Sans état sur sa carte (hors gestion ONF)\u00a0: ${other.join(", ")}.` };
  return {
    etat: "ouvert sur les sentiers de l'ONF",
    texte: m.part_onf >= PRESQUE
      ? "Les sentiers de l'ONF qu'il emprunte sont ouverts."
      : "Les sentiers de l'ONF qu'il emprunte sont ouverts\u00a0; le reste du parcours n'est pas suivi par l'ONF.",
  };
}

export const SOURCE: SourceInfo = {
  id: "region_sentiers_marmailles",
  nom: "Les sentiers marmailles à La Réunion",
  organisme: "Conseil Général de La Réunion / AGORAH",
  licence: "Licence Ouverte (Etalab)",
  attribution: "Conseil Général de La Réunion / AGORAH",
  url: data.page,
};
