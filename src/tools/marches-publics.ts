/**
 * The public procurement notices (/marches-publics), answered by annuaire_services_publics when the question is about
 * them, not about a market (tools/marches.ts): a commune's open notices counted as its page's tile counts them
 * (web/commune.ts), in its words and with the time of the same read, and the link that opens the list on the commune
 * (23/11/2026). Read from the page's copy, never from the BOAMP while a call waits.
 */
import { left } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import { resolvePlace } from "../places/resolve.js";
import { why } from "../types.js";
import { buildMarches, COUVERTURE, type MarchesAnswer, ouvertsA, PATH } from "../web/marches-publics.js";
import { readAt } from "../web/pages.js";
import { slugify } from "../web/places.js";
import { a, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about public procurement: « marchés publics », « appel d'offres », « avis BOAMP ». */
export const PROCUREMENT = /march[ée]s?\s+publics?|appels?\s+d.\s*offres?|\bboamp\b|avis\s+de\s+march[ée]|commande\s+publique/iu;

const KEY = "web:marches-publics";
const SITE = "https://rundata.re";
/** Notices listed with a commune's count: the page has the others. */
const AU_PLUS = 10;

/**
 * The page's copy (web/site.ts), as the commune pages read it. Outside the Worker (the local server, the tests), built
 * when there is none.
 */
async function copie(cache: Cache, now: Date): Promise<Cached<MarchesAnswer> | undefined> {
  const c = await cache.peek<MarchesAnswer>(KEY).catch(() => undefined);
  if (c || left() !== Infinity) return c;
  return cache.get(KEY, 3600, () => buildMarches(cache, now)).catch((err) => (console.error(`copie ${KEY} indisponible:`, why(err)), undefined));
}

/** « 23/11/2026 » from « 2026-11-23 ». */
const jour = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export async function marchesPublicsAnswer(cache: Cache, lieu: string | undefined, now = new Date()) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const c = await copie(cache, now);
  const d = c?.value;
  const lien = res ? `${SITE}${PATH}?commune=${slugify(res.lieu.commune)}` : `${SITE}${PATH}`;
  if (!c || !d || d.prochaine) {
    return text({
      ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
      resume: "La liste des avis du BOAMP n'est pas lue pour l'instant. Elle est sur la page des marchés publics, et sur boamp.fr.",
      lien,
    });
  }
  const lu = readAt(d.lu ? new Date(d.lu) : c.fetchedAt, now).a;
  const common = { couverture: COUVERTURE, ...(d.injoignable ? { avertissements: [d.injoignable] } : {}), sources: d.sources, fraicheur: d.lu ?? c.fetchedAt.toISOString() };
  if (!res) {
    const par = new Map<string, number>();
    for (const x of d.avis) {
      const k = x.commune ?? x.communeAcheteur;
      if (k) par.set(k, (par.get(k) ?? 0) + 1);
    }
    return text({
      resume: `${d.nombre} avis de marché ${d.nombre > 1 ? "ouverts" : "ouvert"} aux réponses à La Réunion, d'après le BOAMP lu ${lu}. Donner une commune pour les siens.`,
      par_commune: Object.fromEntries([...par].sort(([x, m], [y, n]) => n - m || x.localeCompare(y, "fr"))),
      lien,
      ...common,
    });
  }
  const commune = res.lieu.commune;
  const slug = slugify(commune);
  const n = ouvertsA(d.avis, slug);
  const siens = d.avis.filter((x) => { const k = x.commune ?? x.communeAcheteur; return !!k && slugify(k) === slug; });
  return text({
    lieu: placeBlock(lieu!, res),
    resume: n
      ? `${n} avis ${n > 1 ? "ouverts" : "ouvert"} aux réponses ${a(commune)}, d'après le BOAMP lu ${lu}.`
      : `Aucun avis de marché ouvert pour ${commune} dans la dernière lecture du BOAMP, ${lu}. Les avis sont rangés selon le lieu des travaux, ou à défaut la commune de l'acheteur.`,
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
