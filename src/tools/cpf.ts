/**
 * The formations eligible to the CPF at La Réunion, as the tool emploi gives them for words asked (`formationsCpf`)
 * and the page /emploi counts them by theme (`themesCpf`): from the copy the scheduled event keeps
 * (providers/cpf.ts), never sorted by fee, duration or body, and never « aucune formation »: the catalogue has no
 * formation at a distance for La Réunion.
 */
import type { Cache } from "../cache.js";
import { localTime } from "../geo.js";
import { normalize } from "../places/resolve.js";
import * as cpf from "../providers/cpf.js";
import type { Formation } from "../providers/cpf.js";
import { injoignable } from "./injoignable.js";
import { nombre } from "./format.js";

/** The three things the catalogue does not say (03/11/2026). */
export const A_SAVOIR = "Le catalogue ne publie pas la commune des sessions, seulement le département. " +
  "Les formations à distance n'y sont rattachées à aucun département : elles ne sont pas ici, une formation absente de cette liste peut donc exister. " +
  `La fiche de chaque formation, ses dates et le reste à charge se lisent sur moncompteformation.gouv.fr (${cpf.SITE}).`;
/** In place of the name of a body that may be a person (providers/cpf.ts). */
export const ORGANISME_MASQUE = "nom sur moncompteformation.gouv.fr";
/** The tool lists this many formations at most; the rest are counted. */
export const MAX = 10;

const euros = (n: number) => `${nombre(Math.round(n))} €`;

/** « 1 568 € TTC » or « de 1 500 à 1 650 € TTC », fixed by the body. */
export const frais = (f: Formation) =>
  `${f.frais_min === f.frais_max ? euros(f.frais_min) : `de ${euros(f.frais_min).replace(" €", "")} à ${euros(f.frais_max)}`} TTC, fixés par l'organisme`;
/** « 35 h », « 14 à 21 h », or « non renseignée » for the catalogue's 0. */
export const duree = (f: Formation) =>
  f.heures_max === undefined ? "non renseignée" : f.heures_min === f.heures_max || !f.heures_min ? `${nombre(f.heures_max)} h` : `${nombre(f.heures_min)} à ${nombre(f.heures_max)} h`;

export function formationRow(f: Formation) {
  return {
    intitule: f.intitule,
    certification: `${f.certification} (${f.referentiel}${f.niveau ? `, ${f.niveau}` : ""})`,
    organisme: f.organisme ?? ORGANISME_MASQUE,
    frais: frais(f),
    duree: duree(f),
    sessions_ouvertes: f.sessions,
  };
}

/**
 * The text searched of each formation: its title, certification, theme and Formacode, normalized once per copy held in
 * the isolate (14 ms for the 1 176 formations of 03/11/2026, in Node).
 */
const searched = new WeakMap<Formation[], string[]>();
function texts(list: Formation[]): string[] {
  let t = searched.get(list);
  if (!t) searched.set(list, (t = list.map((f) => ` ${normalize([f.intitule, f.certification, f.theme, f.formacode].filter(Boolean).join(" "))} `)));
  return t;
}

const lecture = (lu: Date) => {
  const [jour, heure] = localTime(lu).split(" ");
  return `lecture du ${jour} à ${heure}, heure de La Réunion`;
};

/**
 * The block of the tool emploi for `words` (normalized), from `motCle` as asked; undefined where the formations are
 * not configured (a local server, the tests).
 */
export async function formationsCpf(cache: Cache, motCle: string, words: string[], now = new Date()) {
  if (!cpf.configured()) return undefined;
  const copie = await cpf.formations(cache);
  if (!copie) return { erreur: "Les formations éligibles au CPF ne sont pas disponibles pour le moment.", consulter: cpf.SITE, a_savoir: A_SAVOIR };
  const { value: c, fetchedAt } = copie;
  const t = texts(c.formations);
  const found = c.formations.filter((_, i) => words.every((w) => t[i].includes(w)));
  const asked = `« ${motCle.trim()} »`;
  const resume = found.length
    ? `${nombre(found.length)} formation${found.length > 1 ? "s" : ""} éligible${found.length > 1 ? "s" : ""} au CPF avec une session ouverte à La Réunion pour ${asked}, d'après le catalogue de Mon Compte Formation.`
    : `Le catalogue de Mon Compte Formation n'a pas, pour La Réunion, de session ouverte qui corresponde à ${asked}. Les formations à distance n'y sont pas : une formation peut exister, à chercher sur moncompteformation.gouv.fr.`;
  return {
    resume,
    nombre: found.length,
    formations: found.slice(0, MAX).map(formationRow),
    ...(found.length > MAX ? { autres: `${nombre(found.length - MAX)} autres, sur ${cpf.SITE}` } : {}),
    ordre: "Par ordre alphabétique d'intitulé : ni classement des organismes, ni comparaison des frais.",
    ...(c.echec ? { injoignable: injoignable("le catalogue de la Caisse des Dépôts", localTime(fetchedAt), localTime(new Date(c.echec)), now).texte } : {}),
    a_savoir: A_SAVOIR,
    lien: cpf.SITE,
    donnees: `Catalogue de Mon Compte Formation (${lecture(fetchedAt)}).`,
  };
}

/** The page's count: how many formations in each theme, the themes by name; null without a copy. */
export async function themesCpf(cache: Cache) {
  const copie = await cpf.formations(cache);
  if (!copie) return null;
  const n = new Map<string, number>();
  for (const f of copie.value.formations) n.set(f.theme ?? "Autres", (n.get(f.theme ?? "Autres") ?? 0) + 1);
  return {
    nombre: copie.value.formations.length,
    themes: [...n].map(([theme, formations]) => ({ theme, formations })).sort((x, y) => x.theme.localeCompare(y.theme, "fr")),
    lu: copie.value.lu,
    ...(copie.value.echec ? { echec: copie.value.echec } : {}),
  };
}
