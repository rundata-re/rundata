/**
 * annuaire_services_publics, asked about associations (« association de surf », « associations de quartier à Saint-Leu »):
 * the declared associations of La Réunion whose title or object hold the words asked, from the RNA (vie/associations.ts),
 * at most ten, with the page that has them all.
 */
import { INSEE } from "../places/insee.js";
import { resolvePlace } from "../places/resolve.js";
import { why } from "../types.js";
import { rienTrouve } from "../vide.js";
import * as rna from "../vie/associations.js";
import { slugify } from "../web/places.js";
import { credits, notFound, text } from "./format.js";

/** Asked of the annuaire: an association, never the town's « maison des associations » (an office of the directory). */
export const ASSOCIATION = /\b(associations?|asso)\b/i;
const MAISON = /maison\s+(des\s+)?associations?/i;
export const asksAssociation = (quoi: string) => ASSOCIATION.test(quoi) && !MAISON.test(quoi);

export const LIMIT = 10;
const PAGE = "https://rundata.re/associations";

/** The page of the search: its commune and its words. */
export function lienRecherche(commune?: string, mots?: string): string {
  const q = new URLSearchParams();
  if (commune) q.set("commune", slugify(commune));
  if (mots?.trim()) q.set("mot", mots.trim());
  const s = q.toString();
  return `${PAGE}${s ? `?${s}` : ""}#annuaire`;
}

/** The words of `quoi` that say what kind of association, « association » and its like set aside by rna.requete(). */
const motsDe = (quoi: string) =>
  quoi.replace(ASSOCIATION, " ").replace(/\s+/g, " ").trim().replace(/^(?:(?:de|des|du|d'|d’|pour|la|le|les|l'|l’)\s*)+/i, "").trim();

export async function associationsAnswer(quoi: string, lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const commune = res?.lieu.commune;
  const insee = commune ? INSEE[commune] : undefined;
  const mots = motsDe(quoi);
  if (!rna.lisible()) return { ...text({ erreur: "Le répertoire des associations ne se lit pas pour le moment.", consulter: rna.SOURCE.url }), isError: true };
  let found: Awaited<ReturnType<typeof rna.chercher>>;
  let imp: Awaited<ReturnType<typeof rna.importe>>;
  try {
    [found, imp] = await Promise.all([rna.chercher({ insee, mots, limit: LIMIT }), rna.importe()]);
  } catch (err) {
    console.error(`source ${rna.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "Le répertoire des associations ne se lit pas pour le moment.", consulter: rna.SOURCE.url }), isError: true };
  }
  // No import finished yet (the first one goes in two runs, under D1's daily writes): an empty or partial table, never
  // read as « no association ».
  if (!imp) return { ...text({ erreur: "Le répertoire des associations ne se lit pas pour le moment.", consulter: rna.SOURCE.url }), isError: true };
  const where = commune ? ` à ${commune}` : " à La Réunion";
  const said = rna.requete(mots) ? ` pour «\u00a0${mots}\u00a0»` : "";
  const page = lienRecherche(commune, mots);
  const a_jour = `fichier du ${rna.dateDite(imp.maj)}`;
  if (!found.total) {
    rienTrouve("annuaire_services_publics");
    return text({
      resume: `Aucune association déclarée${where}${said} dans le Répertoire national des associations${a_jour ? ` (${a_jour})` : ""}.`,
      conseil: "Essayer un mot plus court ou plus général (« surf », « quartier », « parents d'élèves »), ou sans commune.",
      page,
      sources: credits([rna.SOURCE]),
    });
  }
  return text({
    resume: `${found.total} association${found.total > 1 ? "s" : ""} déclarée${found.total > 1 ? "s" : ""}${where}${said}, d'après le Répertoire national des associations${a_jour ? ` (${a_jour})` : ""}${found.total > LIMIT ? `\u00a0; les ${LIMIT} premières ci-dessous, toutes sur la page` : ""}.`,
    resultats: found.liste.map((a) => ({
      nom: a.titre,
      commune: rna.communeOf(a.insee),
      objet: rna.court(a.objet).debut,
      creee_en: a.creee ? Number(a.creee.slice(0, 4)) : undefined,
      site: a.site ?? undefined,
    })),
    avertissements: [
      "Associations déclarées, telles que le répertoire les publie : une association dissoute sans l'avoir déclaré peut y figurer encore. Aucune adresse n'est donnée.",
      `Une association corrige sa fiche auprès du greffe des associations : ${rna.CORRIGER}`,
    ],
    page,
    sources: credits([rna.SOURCE]),
  });
}
