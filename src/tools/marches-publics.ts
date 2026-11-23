/**
 * The public procurement notices (/marches-publics), answered by annuaire_services_publics when the question is about
 * them, not about a market (tools/marches.ts): a commune's open notices counted as its page's tile counts them
 * (web/commune.ts), in its words and with the time of the same read, and the link that opens the list on the commune
 * (23/11/2026). Read from the page's copy, never from the BOAMP while a call waits; without a copy (the local
 * server before the page is opened), the link.
 */
import type { Cache } from "../cache.js";
import { localTime } from "../geo.js";
import type { Avis } from "../providers/marches-publics.js";
import { resolvePlace } from "../places/resolve.js";
import type { MarchesAnswer } from "../web/marches-publics.js";
import { slugify } from "../web/places.js";
import { a, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about public procurement: « marchés publics », « appel d'offres », « avis BOAMP ». */
export const PROCUREMENT = /march[ée]s?\s+publics?|appels?\s+d.\s*offres?|\bboamp\b|avis\s+de\s+march[ée]|commande\s+publique/iu;

/** What is covered, in marketing's words: the page's (web/marches-publics.ts) and the tool's. */
export const COUVERTURE = "Les avis de marché publiés au Bulletin officiel des annonces des marchés publics (BOAMP) pour La Réunion, lus chaque heure. Un avis reste ici jusqu'à sa date limite de réponse ; un rectificatif remplace l'avis qu'il corrige. La liste n'est pas complète : sous 90 000 € HT, l'acheteur choisit où il publie, et jusqu'aux seuils européens, il peut publier dans un journal d'annonces légales plutôt qu'au BOAMP. Le dossier de consultation se télécharge sur le profil d'acheteur, dont l'avis donne le lien : l'avis fait foi.";

/** The commune of a notice: its place of work's, else its buyer's, as the page groups them. */
export const communeOf = (a: Avis) => a.commune ?? a.communeAcheteur;

/** How many of `avis` are the commune's whose page is /communes/`slug` (web/commune.ts). */
export const ouvertsA = (avis: Avis[], slug: string) => avis.filter((a) => { const c = communeOf(a); return !!c && slugify(c) === slug; }).length;

const KEY = "web:marches-publics";
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

export async function marchesPublicsAnswer(cache: Cache, lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  // The page's copy (web/site.ts), read as the commune pages read it, never built while a call waits.
  const c = await cache.peek<MarchesAnswer>(KEY).catch(() => undefined);
  const d = c?.value;
  const lien = res ? `${SITE}${PATH}?commune=${slugify(res.lieu.commune)}` : `${SITE}${PATH}`;
  if (!c || !d || d.prochaine) {
    return text({
      ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
      resume: "La liste des avis du BOAMP n'est pas lue pour l'instant. Elle est sur la page des marchés publics, et sur boamp.fr.",
      lien,
    });
  }
  const le = lu(d.lu ? new Date(d.lu) : c.fetchedAt);
  const common = { couverture: COUVERTURE, ...(d.injoignable ? { avertissements: [d.injoignable] } : {}), sources: d.sources, fraicheur: d.lu ?? c.fetchedAt.toISOString() };
  if (!res) {
    const par = new Map<string, number>();
    for (const x of d.avis) {
      const k = communeOf(x);
      if (k) par.set(k, (par.get(k) ?? 0) + 1);
    }
    return text({
      resume: `${d.nombre} avis de marché ${d.nombre > 1 ? "ouverts" : "ouvert"} aux réponses à La Réunion, d'après le BOAMP lu ${le}. Préciser une commune pour n'avoir que ses avis.`,
      par_commune: Object.fromEntries([...par].sort(([x, m], [y, n]) => n - m || x.localeCompare(y, "fr"))),
      lien,
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
    lien,
    ...common,
  });
}
