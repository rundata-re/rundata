/**
 * A post that calls stallholders or candidates to an outing (« Appel à exposants marché de noël au colosse ! », Ville de
 * Saint-André, 21/11/2026) reads as a notice for them, not as an outing. Shown by the outing's name, in the usual
 * capitals (« Marché de Noël au Colosse »), and said to come from that call, with the post's link (words by marketing,
 * 21/11/2026). Only when the post gives the public its days and hours: without them, the dates are most often the call's
 * own (« candidatures avant le 30/11 »), and the post is not given as an outing.
 */
import gazetteer from "../places/gazetteer.js";
import type { Evenement } from "../providers/agenda.js";
import { COMMON } from "./casse.js";

export type Appel = "exposants" | "candidatures";

const CALL = /^\s*appels?\s+(?:à|a|aux)\s+(exposants?|candidatures?)\b[\s:–—-]*(?:(?:pour|du|au)\s+(?:(?:le|la|les)\s+|l['’])?)?/iu;

/** The feasts whose names take a capital in a title written in small letters. */
const FEASTS: Record<string, string> = { noel: "Noël", paques: "Pâques", dipavali: "Dipavali", toussaint: "Toussaint" };

const fold = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const WORD = /[\p{L}\p{N}]+/gu;
const ARTICLES = new Set(["le", "la", "les", "l"]);

/** The names of a commune's places, without their article, longest first: « Colosse » for « Le Colosse ». */
function placesOf(commune: string | undefined): string[][] {
  if (!commune) return [];
  const all = [...gazetteer.places, ...gazetteer.places_ign] as { nom: string; type: string; commune?: string }[];
  return all
    .filter((p) => p.commune === commune && p.type !== "commune" && !COMMON.has(p.nom))
    .map((p) => {
      const words = p.nom.match(WORD) ?? [];
      return ARTICLES.has(fold(words[0] ?? "")) ? words.slice(1) : words;
    })
    .filter((w) => w.length)
    .sort((x, y) => y.length - x.length);
}

/**
 * The outing's name in the usual capitals: its first letter, the feasts, the names of its commune's places as the
 * gazetteer writes them. A name already written with capitals inside it is left as written.
 */
export function nomUsage(nom: string, commune?: string): string {
  const text = nom.replace(/[\s!.]+$/u, "").trim();
  const words = [...text.matchAll(WORD)];
  const out = words.map((m) => m[0]);
  if (!/\p{Lu}/u.test(text.slice(1))) {
    words.forEach((m, i) => { const f = FEASTS[fold(m[0])]; if (f) out[i] = f; });
    const between = (i: number) => text.slice(words[i].index! + words[i][0].length, words[i + 1].index);
    const known = placesOf(commune);
    for (let i = 0; i < words.length; i++) {
      const n = known.find((p) => i + p.length <= words.length
        && p.every((w, j) => fold(words[i + j][0]) === fold(w) && (j === 0 || /^[\s'’-]+$/u.test(between(i + j - 1)))));
      if (!n) continue;
      n.forEach((w, j) => { if (/\p{Lu}/u.test(w)) out[i + j] = w; });
      i += n.length - 1;
    }
  }
  let s = "", at = 0;
  words.forEach((m, i) => { s += text.slice(at, m.index) + out[i]; at = m.index! + m[0].length; });
  s += text.slice(at);
  return s.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("fr"));
}

/**
 * The event as an outing: unchanged when its title is no call; by the outing's name, with `appel`, when it is one and
 * every day it gives has its hours; undefined (not an outing) when it is one without them, or without a name.
 */
export function appelAuPublic<E extends Pick<Evenement, "titre" | "seances" | "commune">>(e: E): (E & { appel?: Appel }) | undefined {
  const m = e.titre.match(CALL);
  if (!m) return e;
  const nom = e.titre.slice(m[0].length);
  const heures = e.seances.length > 0 && e.seances.every((s) => s.debut.length > 10);
  if (!heures || !/\p{L}{3}/u.test(nom)) return undefined;
  const appel: Appel = fold(m[1]).startsWith("exposant") ? "exposants" : "candidatures";
  return { ...e, titre: nomUsage(nom, e.commune), appel };
}

/** « annoncé par la Ville de Saint-André dans un appel à exposants » (marketing, 21/11/2026), the page and the tool alike. */
export const annonceAppel = (publiePar: string, appel: Appel) => `annoncé par ${lePar(publiePar)} dans un appel à ${appel}`;

/** « la Ville de Saint-André », « la Mairie de Saint-Paul », « la CINOR », « le TCO »: the publisher with its article. */
function lePar(nom: string): string {
  return /^(?:Ville|Mairie|Commune|CINOR|CIREST|CIVIS|CASUD)\b/u.test(nom) ? `la ${nom}` : /^TCO\b/u.test(nom) ? `le ${nom}` : nom;
}
