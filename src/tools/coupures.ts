import type { Cache, Cached } from "../cache.js";
import { distributeur, LIENS, lues, nomDit, partage, phrasePartage, SITES_DISTRIBUTEURS, SOURCE as DISTRIBUTEURS } from "../eau/distributeurs.js";
import { resolvePlace } from "../places/resolve.js";
import * as notices from "../providers/avis-eau.js";
import { BACK, lifts } from "../providers/avis-eau.js";
import * as potable from "../providers/eaupotable.js";
import { localTime } from "../geo.js";
import { why } from "../types.js";
import { slugify } from "../web/places.js";
import { deNom } from "../articles.js";
import { a, credits, enumeration, notFound, placeBlock, text } from "./format.js";
import { type Injoignable, injoignable } from "./injoignable.js";

const RECENT_DAYS = 5;
const QUALITY = /qualit|potab|boire|chlor|conformit|bouilli|embouteill/i;

/** « 2026-10-26T21:00 » → « lundi 26/10 à 21:00 ». */
function when(local?: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(`${local}:00Z`);
  const wd = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][d.getUTCDay()];
  return `${wd} ${local.slice(8, 10)}/${local.slice(5, 7)} à ${local.slice(11, 16)}`;
}
const published = (n: notices.Avis) => {
  const l = new Date(new Date(n.publie).getTime() + 4 * 3600_000).toISOString();
  // A source dated to the day only gets no hour.
  return `${l.slice(8, 10)}/${l.slice(5, 7)}/${l.slice(0, 4)}${n.jour ? "" : ` à ${l.slice(11, 16)}`}`;
};
const nowLocal = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 16);

/** The notices still worth telling: a cut not over yet, or anything published in the last few days. */
export function current(list: notices.Avis[], now: Date): notices.Avis[] {
  const here = nowLocal(now);
  const since = new Date(now.getTime() - RECENT_DAYS * 86400_000).toISOString();
  return list.filter((n) => (n.fin ? n.fin >= here : n.publie >= since));
}

/** Whether the water of a commune should not be drunk now: its latest notice about quality says so. */
export function doNotDrink(list: notices.Avis[], commune: string): notices.Avis | null {
  const latest = list.filter((n) => n.communes.includes(commune) && (QUALITY.test(n.titre + n.texte) || BACK.test(n.texte)))
    .sort((x, y) => y.publie.localeCompare(x.publie))[0];
  return latest && latest.ne_pas_boire && !lifts(latest.texte) ? latest : null;
}

/** `current`: whether it is the notice that says not to drink the water now; older ones are superseded. */
export function noticeRow(n: notices.Avis, now: Date, current = n.ne_pas_boire) {
  const here = nowLocal(now);
  const state = n.debut && n.fin ? (n.fin < here ? "terminée" : n.debut <= here ? "en cours" : "à venir") : undefined;
  // A notice dated after now (La Créole dates some by the day of the cut): the date it bears, not a publication.
  const future = n.publie > now.toISOString();
  return {
    titre: n.titre,
    communes: n.communes,
    precision: n.precision,
    distributeur: n.distributeur,
    publie_le: future ? undefined : published(n),
    date_de_l_avis: future ? published(n) : undefined,
    // Only the end, when the notice writes no start hour (« dès maintenant »): the end is never lost.
    coupure: n.debut || n.fin ? { de: when(n.debut), a: when(n.fin), etat: state } : undefined,
    // The whole list, or none: a list read in part would let one conclude a street is not concerned.
    secteurs: n.secteurs,
    secteurs_complets: n.secteurs_complets,
    ne_pas_boire: (n.ne_pas_boire && current) || undefined,
    forme: n.forme,
    extrait_coupe: n.extrait_coupe,
    texte: n.texte,
    lien: n.lien,
  };
}

/** The ARS La Réunion's leaflet « Coupure d'eau », the source of `AFTER_CUT` (read 14/11/2026). */
export const ARS_COUPURE = "https://www.lareunion.ars.sante.fr/system/files/2024-08/D%C3%A9pliant%20COUPURE%20D'EAU-web.pdf";
/**
 * What to know after a cut, in the ARS's words (its leaflet, `ARS_COUPURE`): no advice of our own. A notice that says not
 * to drink the water has its own instructions (how long to boil it, bottles given out), so the notice is what counts. The
 * tool ends it with its source and the name of the tool for the tap water, the pages with a link to the leaflet and to
 * /eau (web/domains.ts, `afterCutNote`).
 */
export const AFTER_CUT = "D'après l'ARS La Réunion, quand l'eau revient au robinet après une coupure, elle peut être impropre à la consommation pendant plusieurs heures\u00a0: ne pas la boire ni s'en servir pour préparer les repas, préférer l'eau en bouteille, et la garder pour la toilette, les WC et le ménage. Quand un avis dit de ne pas boire l'eau, suivre les consignes de cet avis.";

const COMMON = {
  // Worded by marketing: never « pas de coupure » where the sources say nothing.
  couverture: `Avis lus pour ${enumeration(lues())} (Dionéo, runéo, Eaux de La Possession, La Créole, la CIREST pour ses six communes, CISE Réunion par la ville de Sainte-Marie, Derichebourg Aqua OI par la commune de Saint-Leu)\u00a0: une coupure que ces sources n'annoncent pas n'apparaît pas ici. Ailleurs, voir la mairie ou le distributeur.`,
  a_savoir: `${AFTER_CUT} Source\u00a0: le dépliant «\u00a0Coupure d'eau\u00a0» de l'ARS La Réunion, ${ARS_COUPURE}. La conformité de l'eau du robinet d'après les analyses de l'ARS : qualite_eau.`,
};

// A title that says the water is cut or disturbed, whether or not its hours were read (« fermeture préventive de la
// distribution », Salazie, 22/10/2026; « lavage réservoir », La Créole).
const CUT_TITLE = /interruption|coupure|travaux|(?:arr[êe]t|fermeture)(?: \p{L}+)? de (?:la )?distribution|perturbation|fuite|casse|lavage/iu;
/**
 * A notice that announces a cut: its hours read, or its title says so; never one saying not to drink the water, nor a
 * quality notice (turbid water) or a return to normal, which were counted as « avis de coupure » (04/11/2026: Salazie,
 * Sainte-Marie, Saint-Benoît, Saint-Denis).
 */
export const annonceCoupure = (n: { titre: string; coupure?: unknown; ne_pas_boire?: boolean }) =>
  !n.ne_pas_boire && !BACK.test(n.titre) && (!!n.coupure || CUT_TITLE.test(n.titre));

/**
 * The notices of a commune counted by kind, the same everywhere: « 1 avis de coupure d'eau, 1 autre avis sur l'eau, et
 * 1 avis d'eau à ne pas boire dans les secteurs de l'avis ». `autre`: « avis sur l'eau » alone when there is no cut.
 */
export function compteAvis(avis: { titre: string; coupure?: unknown; ne_pas_boire?: boolean }[]): { coupures: number; autres: number; ne_pas_boire: number } {
  const ne_pas_boire = avis.filter((n) => n.ne_pas_boire).length;
  const coupures = avis.filter(annonceCoupure).length;
  return { coupures, autres: avis.length - coupures - ne_pas_boire, ne_pas_boire };
}

/** A feed that did not answer at the last read, said in marketing's words (tools/injoignable.ts), with its page. */
export interface FluxMuet extends Injoignable {
  /** « de la CIREST ». */
  de: string;
  site: string;
}

/** The feeds that did not answer at the last read: their notices kept, or their read said failed. */
export function muets(c: Cached<notices.Flux[]>, now: Date): FluxMuet[] {
  return c.value.filter((f) => f.muet).map((f) => ({ ...injoignable(`le site ${f.de}`, f.lu_a, localTime(c.fetchedAt), now), de: f.de, site: f.site }));
}

/** The silent feed that reads a commune's notices, if it is one: its distributor's site (src/eau/distributeurs.ts). */
export function muetPour<T extends { site: string }>(list: T[] | undefined, commune: string): T | undefined {
  const site = distributeur(commune)?.site;
  if (!site || !list) return undefined;
  const host = new URL(site).hostname;
  return list.find((f) => new URL(f.site).hostname === host);
}

export async function coupuresEau(cache: Cache, lieu: string | undefined, now = new Date()) {
  let all: notices.Avis[];
  let silent: FluxMuet[];
  try {
    const read = await notices.lecture(cache);
    all = read.value.flatMap((f) => f.avis).sort((x, y) => y.publie.localeCompare(x.publie));
    silent = muets(read, now);
  } catch (err) {
    console.error(`source ${notices.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "Les avis des distributeurs d'eau ne répondent pas pour le moment.", consulter: notices.SOURCE.url }), isError: true };
  }
  const live = current(all, now);
  const common = { ...COMMON, sources: credits([notices.SOURCE]) };

  if (!lieu?.trim()) {
    const dry = lues().map((c) => doNotDrink(all, c) && c).filter(Boolean) as string[];
    // A notice that still says not to drink the water is told however old it is, as on a commune's answer: the pages
    // cut from this one (the commune's water, its day) would otherwise say no notice where the water is not to be drunk.
    const stillDry = new Set(all.filter((n) => n.communes.some((c) => doNotDrink(all, c) === n)));
    const told = all.filter((n) => stillDry.has(n) || live.includes(n));
    return text({
      resume: (dry.length ? `Eau à ne pas boire en ce moment : ${dry.join(", ")}. ` : "") +
        (live.length ? `${live.length} avis des distributeurs d'eau récents ou à venir.` : silent.length ? "" : "Aucun avis de coupure récent ou à venir.") +
        silent.map((f) => ` ${f.texte}`).join(""),
      injoignable: silent.length ? silent : undefined,
      ne_pas_boire: dry.length ? dry : undefined,
      avis: told.map((n) => noticeRow(n, now, stillDry.has(n))),
      ...common,
    });
  }

  const res = resolvePlace(lieu);
  if (!res) return notFound(lieu);
  const commune = res.lieu.commune;
  const mine = live.filter((n) => n.communes.includes(commune));
  const dry = doNotDrink(all, commune);
  // Its distributor's notices are read (src/eau/distributeurs.ts), or some notice names it.
  const dist = distributeur(commune);
  const covered = !!dist?.avis || all.some((n) => n.communes.includes(commune));
  // Not read: the distributor the ARS names, as on the commune's page (worded by marketing); none named, the plain sentence.
  const unread = covered ? undefined : dist;
  // Shared between distributors (src/eau/distributeurs.ts): each with its networks, as the ARS gives them, and whose
  // notices are read; none chosen.
  const shared = dist?.partage ?? partage(commune);
  // A distributor of a shared commune whose notices are not read, and the mairie's site linked for it (LIENS).
  const unreadShare = !!shared?.par.some((d) => !d.site) && covered;
  const mairie = (!covered || unreadShare) && LIENS[commune] ? { libelle: LIENS[commune].libelle, lien: LIENS[commune].site } : undefined;
  const sharedText = shared && `${phrasePartage(commune, shared)} ${dist?.avis ? `Seuls les avis de ${dist.nom} sont lus.` : "Leurs avis ne sont pas lus par rundata.re."}` +
    (unreadShare && mairie ? ` ${mairie.libelle}\u00a0: ${mairie.lien}.` : "");
  // Where the commune's notices are read: who publishes them (the CIREST, a mairie, else the distributor) and its page.
  // The distributor is the ARS's; for a shared commune read through the CIREST alone, none is chosen (partage).
  const lus = dist?.avis ? { publie_par: dist.par ?? dist.nom, distributeur: dist.partage && dist.par ? undefined : dist.nom, lien: dist.site! } : undefined;
  // No notice found: the distributor and where its notices are, never the bare « aucun avis » (a question on Cambuston
  // was answered without naming the CIREST nor O2LEST).
  const where = !lus
    ? (dist ? `. D'après l'ARS, ${nomDit(dist)} distribue l'eau ${a(commune)}, et rundata.re ne lit pas ses avis` : "")
    : lus.distributeur === lus.publie_par
      ? ` dans les avis ${deNom(lus.publie_par)}${shared ? "" : ", qui y distribue l'eau d'après l'ARS"}\u00a0: ${lus.lien}`
      : ` dans les avis publiés par ${lus.publie_par}\u00a0: ${lus.lien}${shared || !lus.distributeur ? "" : `. D'après l'ARS, ${lus.distributeur} distribue l'eau ${a(commune)}`}`;
  // A distributor's own site, linked only (SITES_DISTRIBUTEURS): what the commune's page links.
  const siteDist = unread ? SITES_DISTRIBUTEURS[unread.nom] : undefined;
  // Its feed did not answer at the last read: its notices kept said so, or its read said failed, never « aucun avis ».
  const mute = dist?.avis ? muetPour(silent, commune) : undefined;
  // The résumé names the distributor (`where`): the ARS credited beside the notices.
  const named = covered && !mine.length && !mute;
  const resume = [
    dry ? `EAU À NE PAS BOIRE ${a(commune)} (secteurs dans l'avis), d'après l'avis du ${published(dry)} : « ${dry.titre} ».` : "",
    mine.length
      ? `${mine.length} avis récent${mine.length > 1 ? "s" : ""} ou à venir ${a(commune)} : ${mine.slice(0, 3).map((n) => n.titre).join("\u00a0; ")}.`
      : mute ? ""
      : covered ? `Aucun avis de coupure récent ou à venir ${a(commune)}${where}.`
      : unread ? `Pas d'avis en ligne lisible pour ${commune} : rundata.re ne lit pas les avis de coupure de ${unread.nom}, qui y distribue l'eau. ${siteDist ? `Voir le site ${deNom(unread.nom)}, rubrique «\u00a0L'eau dans ma commune\u00a0»\u00a0: ${siteDist}, ou la mairie.` : `Voir ${unread.nom} ou la mairie.`}`
      : `Pas d'avis en ligne lisible pour ${commune} : voir la mairie ou le distributeur d'eau.`,
    mute ? mute.texte : "",
    sharedText ?? "",
  ].filter(Boolean).join(" ");
  return text({
    lieu: placeBlock(lieu, res),
    resume,
    ne_pas_boire: dry ? noticeRow(dry, now) : undefined,
    // A mairie only linked to (src/eau/distributeurs.ts): where its notices are, nothing taken from them.
    mairie,
    avis_lus_sur: lus,
    distributeur: unread ? { nom: unread.nom, ...(siteDist ? { site: siteDist } : {}), d_apres: DISTRIBUTEURS } : undefined,
    distributeurs: shared ? { texte: sharedText, par: shared.par.map((d) => ({ nom: d.nom, reseaux: d.reseaux })), reseaux: shared.reseaux, d_apres: DISTRIBUTEURS } : undefined,
    contact: covered ? undefined : `Le numéro d'urgence du distributeur (fuite, coupure non annoncée) est sur la facture d'eau\u00a0; la mairie : https://rundata.re/communes/${slugify(commune)}`,
    injoignable: mute ? [mute] : undefined,
    avis: mine.map((n) => noticeRow(n, now, n === dry)),
    ...common,
    // The distributor named is the ARS's sanitary control's (src/eau/distributeurs.json), credited as the page does.
    ...(unread || shared || (named && dist) ? { sources: credits([notices.SOURCE, potable.SOURCE]) } : {}),
  });
}
