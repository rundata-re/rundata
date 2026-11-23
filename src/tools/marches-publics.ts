/**
 * The public procurement notices (/marches-publics), answered by annuaire_services_publics when the question is about
 * them, not about a market (tools/marches.ts): a commune's open notices counted as its page's tile counts them
 * (web/commune.ts), in its words and with the time of the same read, and the link that opens the list on the commune
 * (23/11/2026). Read from the notices' stored copy as the page builds it (web/marches-publics.ts), never from the BOAMP
 * while a call waits; without a copy (the local server), the link.
 */
import type { Cache } from "../cache.js";
import { localTime } from "../geo.js";
import { avis, type Avis, prochaineLecture, SOURCE } from "../providers/marches-publics.js";
import { resolvePlace } from "../places/resolve.js";
import { slugify } from "../web/places.js";
import { a, credits, notFound, placeBlock, text } from "./format.js";
import { injoignable } from "./injoignable.js";

/** Whether `quoi` asks about public procurement: « marchés publics », « appel d'offres », « avis BOAMP ». */
export const PROCUREMENT = /march[ée]s?\s+publics?|appels?\s+d.\s*offres?|\bboamp\b|avis\s+de\s+march[ée]|commande\s+publique/iu;

/** What is covered, in marketing's words: the page's (web/marches-publics.ts) and the tool's. */
export const COUVERTURE = "Les avis de marché publiés au Bulletin officiel des annonces des marchés publics (BOAMP) pour La Réunion, lus chaque heure. Un avis reste ici jusqu'à sa date limite de réponse ; un rectificatif remplace l'avis qu'il corrige. La liste n'est pas complète : sous 90 000 € HT, l'acheteur choisit où il publie, et jusqu'aux seuils européens, il peut publier dans un journal d'annonces légales plutôt qu'au BOAMP. Le dossier de consultation se télécharge sur le profil d'acheteur, dont l'avis donne le lien : l'avis fait foi.";

/** The commune of a notice: its place of work's, else its buyer's, as the page groups them. */
export const communeOf = (a: Avis) => a.commune ?? a.communeAcheteur;

/** How many of `avis` are the commune's whose page is /communes/`slug` (web/commune.ts). */
export const ouvertsA = (avis: Avis[], slug: string) => avis.filter((a) => { const c = communeOf(a); return !!c && slugify(c) === slug; }).length;

const SITE = "https://rundata.re";
const PATH = "/marches-publics";
/** Notices listed with a commune's count: the page has the others. */
const AU_PLUS = 10;

/** « le 23/11 à 14:05 », as the page and the commune's tile say when the list was read (web/pages.ts `leAt`). */
function lu(at: Date): string {
  const [day, time] = localTime(at).split(" ");
  return `le ${day} à ${time}`;
}

/** « 23/11/2026 » from « 2026-11-23 ». */
const jour = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;


export interface MarchesAnswer {
  nombre: number;
  avis: Avis[];
  injoignable?: string;
  sources: { source: string; licence: string; attribution: string }[];
  /**
   * When the list was read (ISO), said as the last read: not the page's copy's time, a few minutes later (on 29/10/2026
   * the page said 16:40 for the list read at 16:35).
   */
  lu?: string;
  /** No copy of the notices yet: when the scheduled event reads them next (ISO). */
  prochaine?: string;
  /**
   * How many notices read in the list wait for their full text, to tell the island's. Without a notice shown, the page
   * says them, never « no notice ».
   */
  enLecture?: number;
}

/**
 * The page's copy: every notice open, from the store. Without a copy in the store, when they are read next: reloading
 * would not bring them sooner.
 */
export async function buildMarches(cache: Cache, now = new Date()): Promise<MarchesAnswer> {
  let c;
  try {
    c = await avis(cache, now);
  } catch {
    c = null;
  }
  if (!c) return { nombre: 0, avis: [], sources: [], prochaine: prochaineLecture(now).toISOString() };
  const at = localTime(c.fetchedAt);
  return {
    nombre: c.value.avis.length,
    avis: c.value.avis,
    lu: c.value.lu,
    ...(c.value.echec ? { injoignable: injoignable("le BOAMP", at, localTime(new Date(c.value.echec)), now).texte } : {}),
    ...(c.value.attente?.length ? { enLecture: c.value.attente.length } : {}),
    sources: credits([SOURCE]),
  };
}

export async function marchesPublicsAnswer(cache: Cache, lieu: string | undefined, now = new Date()) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  // The notices' stored copy, as the page builds it: not the page's copy in this data center, which may be a read behind
  // the page (23/11/2026: 43 notices at Saint-Denis said from the read of 11:35, 39 on the page read at 12:35).
  const d = await buildMarches(cache, now).catch(() => undefined);
  // The page that lists them, in `page`: `lien` and `fraicheur` are written by cite() (citer.ts), once.
  const page = res ? `${SITE}${PATH}?commune=${slugify(res.lieu.commune)}` : `${SITE}${PATH}`;
  if (!d || d.prochaine || !d.lu) {
    return text({
      ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
      resume: "La liste des avis du BOAMP n'est pas lue pour l'instant. Elle est sur la page des marchés publics, et sur boamp.fr.",
      page,
    });
  }
  const at = new Date(d.lu);
  const le = lu(at);
  // The time of the list's read, as fraicheur.ts reads it (`mis_a_jour`), and the BOAMP credited (credits(), in
  // buildMarches) so that `citer` names it.
  const common = { couverture: COUVERTURE, ...(d.injoignable ? { avertissements: [d.injoignable] } : {}), mis_a_jour: localTime(at), sources: d.sources };
  if (!res) {
    const par = new Map<string, number>();
    for (const x of d.avis) {
      const k = communeOf(x);
      if (k) par.set(k, (par.get(k) ?? 0) + 1);
    }
    return text({
      resume: `${d.nombre} avis de marché ${d.nombre > 1 ? "ouverts" : "ouvert"} aux réponses à La Réunion, d'après le BOAMP lu ${le}. Préciser une commune pour n'avoir que ses avis.`,
      par_commune: Object.fromEntries([...par].sort(([x, m], [y, n]) => n - m || x.localeCompare(y, "fr"))),
      page,
      ...common,
    });
  }
  const commune = res.lieu.commune;
  const slug = slugify(commune);
  const n = ouvertsA(d.avis, slug);
  const siens = d.avis.filter((x) => { const k = communeOf(x); return !!k && slugify(k) === slug; });
  return text({
    lieu: placeBlock(lieu!, res),
    resume: n
      ? `${n} avis ${n > 1 ? "ouverts" : "ouvert"} aux réponses ${a(commune)}, d'après le BOAMP lu ${le}.`
      : `Aucun avis de marché ouvert pour ${commune} dans la dernière lecture du BOAMP, ${le}. Les avis sont rangés selon le lieu des travaux, ou à défaut la commune de l'acheteur.`,
    avis: n
      ? siens.slice(0, AU_PLUS).map((x) => ({
          objet: x.objet,
          acheteur: x.acheteur,
          types: x.types.join(", "),
          lieu: x.commune ? undefined : "commune de l'acheteur",
          jusqu_au: jour(x.limite),
          lien: x.lien,
        }))
      : undefined,
    autres: n > AU_PLUS ? `${n - AU_PLUS} autres sur la page.` : undefined,
    page,
    ...common,
  });
}
