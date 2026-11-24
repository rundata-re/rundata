import { apresCyclone } from "../eau/cyclone.js";
import type { Cache, Cached } from "../cache.js";
import { distributeur, LIENS, lues, nomDit, partage, phrasePartage, SITES_DISTRIBUTEURS, SOURCE as DISTRIBUTEURS } from "../eau/distributeurs.js";
import { resolvePlace } from "../places/resolve.js";
import * as notices from "../providers/avis-eau.js";
import { BACK, lifts } from "../providers/avis-eau.js";
import * as potable from "../providers/eaupotable.js";
import * as arretesVille from "../providers/arretes-travaux.js";
import { localTime } from "../geo.js";
import { why } from "../types.js";
import { slugify } from "../web/places.js";
import { deNom } from "../articles.js";
import { a, credits, enumeration, notFound, placeBlock, text } from "./format.js";
import { type Injoignable, injoignable, when as luLe } from "./injoignable.js";
import { copieAncienne, VOIR_EAU } from "./copie-ancienne.js";

const RECENT_DAYS = 5;
const QUALITY = /qualit|potab|boire|chlor|conformit|bouilli|embouteill/i;

/** « 2026-10-26T21:00 » → « lundi 26/10 à 21:00 ». */
function when(local?: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(`${local}:00Z`);
  const wd = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][d.getUTCDay()];
  return `${wd} ${local.slice(8, 10)}/${local.slice(5, 7)} à ${local.slice(11, 16)}`;
}
/**
 * A cut's span in words: « lundi 26/10 à 21:00 → mardi 27/10 à 06:00 », « à partir du lundi 26/10 à 21:00 » when only
 * its start is written (La Créole), « jusqu'au mardi 27/10 à 06:00 » when the notice writes no start (« dès
 * maintenant »): never « undefined ». Empty when it has neither.
 */
export const periodeCoupure = (c: { de?: string; a?: string }): string =>
  c.de && c.a ? `${c.de} → ${c.a}` : c.de ? `à partir du ${c.de}` : c.a ? `jusqu'au ${c.a}` : "";

const published = (n: notices.Avis) => {
  const l = new Date(new Date(n.publie).getTime() + 4 * 3600_000).toISOString();
  // A source dated to the day only gets no hour.
  return `${l.slice(8, 10)}/${l.slice(5, 7)}/${l.slice(0, 4)}${n.jour ? "" : ` à ${l.slice(11, 16)}`}`;
};
/**
 * When a cut is, said short for a résumé: « mercredi 25/11 de 08:00 à 17:00 », « dans la nuit du mardi 24 au mercredi
 * 25/11, de 21:00 à 04:00 », else « du … au … » ; only one end known, that end.
 */
export function cutSaid(debut?: string, fin?: string): string | undefined {
  const day = (l: string) => when(l)!.replace(/ à \d\d:\d\d$/, "");
  const hour = (l: string) => l.slice(11, 16);
  if (debut && fin) {
    if (debut.slice(0, 10) === fin.slice(0, 10)) return `${day(debut)} de ${hour(debut)} à ${hour(fin)}`;
    const next = new Date(`${debut.slice(0, 10)}T00:00:00Z`).getTime() + 86400_000 === new Date(`${fin.slice(0, 10)}T00:00:00Z`).getTime();
    if (next && fin.slice(11, 16) <= debut.slice(11, 16)) {
      // The month said once when both days are in it: « du mardi 24 au mercredi 25/11 ».
      const first = debut.slice(5, 7) === fin.slice(5, 7) ? day(debut).replace(/\/\d\d$/, "") : day(debut);
      return `dans la nuit du ${first} au ${day(fin)}, de ${hour(debut)} à ${hour(fin)}`;
    }
    return `du ${when(debut)} au ${when(fin)}`;
  }
  if (debut) return `à partir du ${when(debut)}`;
  if (fin) return `jusqu'au ${when(fin)}`;
}

/** How many notices the résumé of a commune tells one by one; the others are counted, and all are in `avis`. */
export const AVIS_AU_RESUME = 3;
/** Streets a résumé names for one notice; past them, how many others, all in its `secteurs_dits`. */
const VOIES_AU_RESUME = 2;

/**
 * A notice in a commune's résumé, told apart from the others of the same title: its title, when the cut is, and its
 * first streets (« Travaux sur le réseau, jeudi 26/11 de 21:00 à 04:00, rue Sainte Anne… »).
 */
export function noticeSaid(n: notices.Avis, now: Date): string {
  const here = nowLocal(now);
  // Begun: only what the notice plans, never « en cours » (the site does not know whether the water is cut now), in
  // words that agree with any title (« Travaux sur le réseau, jusqu'au … d'après l'avis »).
  const going = n.debut && n.debut <= here && n.fin && n.fin >= here;
  const cut = going ? `jusqu'au ${when(n.fin)} d'après l'avis` : cutSaid(n.debut, n.fin);
  const streets = n.secteurs_complets && n.secteurs.length ? n.secteurs : [];
  const more = streets.length - VOIES_AU_RESUME;
  const where = streets.length
    ? ` (${streets.slice(0, VOIES_AU_RESUME).join(", ")}${more > 0 ? ` et ${more} autre${more > 1 ? "s" : ""} voie${more > 1 ? "s" : ""}` : ""})`
    : n.lieu ? ` (${n.lieu})` : "";
  return `${n.titre}${cut ? `, ${cut}` : `, avis du ${publishedShort(n)}`}${where}`;
}

/**
 * Where the water is not to be drunk, said with every summary of a « ne pas boire » notice (a tile, a description, a
 * résumé, the map): the notice's sectors, never the whole commune (24/11/2026, Saint-Benoît's tile and day).
 */
export const DANS_LES_SECTEURS = (notices = 1) => `dans les secteurs ${notices > 1 ? "des avis" : "de l'avis"}`;
export const NE_PAS_BOIRE = (notices = 1) => `eau à ne pas boire ${DANS_LES_SECTEURS(notices)}`;

/**
 * The notice not to drink the water, in the same words in coupures_eau, qualite_eau and on /eau (23/11/2026): who
 * publishes it, when, its title, and its sectors, so that it is never read as the whole commune's, nor as the ARS's.
 */
export const drySaid = (n: notices.Avis, commune: string) =>
  `Eau à ne pas boire ${a(commune)} d'après ${n.distributeur} (avis du ${publishedShort(n)})\u00a0: « ${n.titre} »` +
  (n.secteurs_complets && n.secteurs.length ? `, secteurs\u00a0: ${notices.sectorsSaid(n.secteurs)}.` : ", secteurs dans l'avis.");

/** « 21/11 à 10:53 », the day only for a source dated to the day: a résumé's date, without the year. */
const publishedShort = (n: notices.Avis) => published(n).replace(/^(\d\d\/\d\d)\/\d{4}/, "$1");
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
    // The same words as the page: « Secteurs : … Chemin Pinguet et les voies adjacentes ».
    secteurs_dits: n.secteurs_complets && n.secteurs.length ? notices.sectorsSaid(n.secteurs) : undefined,
    // The one place named in its sentence, when it has no list: never a whole list (secteurs_complets stays false).
    lieu: n.lieu,
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
  couverture: `Avis lus pour ${enumeration(lues())} (Dionéo, runéo, Eaux de La Possession, La Créole, la CIREST pour ses six communes, CISE Réunion par la ville de Sainte-Marie, Derichebourg Aqua OI par la commune de Saint-Leu, Sudéau par la commune de Saint-Philippe et par la ville du Tampon, la SPL Sources et Eaux par la ville de Petite-Île, la ville de Cilaos, La Créole aussi par la ville de Trois-Bassins)\u00a0: une coupure que ces sources n'annoncent pas n'apparaît pas ici. Ailleurs, voir la mairie ou le distributeur.`,
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
  /** When its notices still given were read (« 24/10 08:00 »); none kept: absent. */
  lu_a?: string;
}

/** The feeds that did not answer at the last read: their notices kept, or their read said failed. */
export function muets(c: Cached<notices.Flux[]>, now: Date): FluxMuet[] {
  return c.value.filter((f) => f.muet).map((f) => ({ ...injoignable(`le site ${f.de}`, f.lu_a, localTime(c.fetchedAt), now), de: f.de, site: f.site, ...(f.lu_a ? { lu_a: f.lu_a } : {}) }));
}

/**
 * The silent feed that reads a commune's notices, if it is one: its distributor's site (src/eau/distributeurs.ts). With
 * the commune's notices kept (`avis`) and the hour of that read, said for the commune: none of them, what the read held
 * (« pas d'avis de coupure récent ou à venir à Saint-Pierre »), never « Ce qui suit peut avoir changé » with nothing
 * after it (24/11/2026); some, « ces avis », wherever they are said.
 */
export function muetPour<T extends { site: string; texte?: string; court?: string; de?: string; lu_a?: string }>(list: T[] | undefined, commune: string, avis?: number): T | undefined {
  const site = distributeur(commune)?.site;
  if (!site || !list) return undefined;
  const host = new URL(site).hostname;
  const f = list.find((x) => new URL(x.site).hostname === host);
  if (!f?.lu_a || avis === undefined || !f.de) return f;
  const at = luLe(f.lu_a);
  return avis
    ? { ...f, texte: `Lu ${at} : le site ${f.de} n'a pas répondu depuis. Ces avis peuvent avoir changé : voir son site.` }
    : {
      ...f,
      texte: `Lu ${at} : pas d'avis de coupure récent ou à venir ${a(commune)} sur le site ${f.de}. Il n'a pas répondu depuis : pour un avis publié depuis, voir son site.`,
      court: `pas d'avis lu ${at}, sans réponse depuis`,
    };
}

/** How many notices an assistant gets with their excerpt; the next ones with their link (MAX_BYTES, 21/11/2026). */
export const AVIS_AVEC_TEXTE = 3;
export const TEXTE_PAR_LE_LIEN = `Au-delà des ${AVIS_AVEC_TEXTE} premiers avis, leur texte n'est pas repris\u00a0: il est dans l'avis, à son lien. Un avis d'eau à ne pas boire garde toujours le sien.`;
/** The island's answer: past the same notices, their streets too, kept by the answer for their commune (MAX_BYTES, 23/11/2026). */
export const TEXTE_ET_SECTEURS_PAR_LE_LIEN = `Au-delà des ${AVIS_AVEC_TEXTE} premiers avis, leur texte et leurs secteurs ne sont pas repris\u00a0: ils sont dans l'avis, à son lien, et dans la réponse de coupures_eau pour sa commune. Un avis d'eau à ne pas boire garde toujours les siens.`;

/**
 * The notices as an assistant reads them, within the answer's size (scripts/check-sources.ts, 15,1 Ko on 20/11/2026 for
 * 12,5): the streets said once, in the page's words (`secteurs_dits`, given for a list read whole only), never as a list beside
 * them; past the first
 * `AVIS_AVEC_TEXTE`, the excerpt left to the notice's link, except where it says not to drink the water. The page keeps
 * every field (`complet`). `ile`: the island's answer, where those notices leave their streets to the answer for their
 * commune too (12,8 Ko on 23/11/2026 for 12,5, 16 notices of which 9 cuts to come, four nights at Saint-Denis).
 */
export function pourAssistant(rows: ReturnType<typeof noticeRow>[], ile = false): { avis: Record<string, unknown>[]; abreges: boolean } {
  let abreges = false;
  const avis = rows.map((r, i) => {
    const { secteurs, secteurs_complets, texte, extrait_coupe, ...rest } = r;
    // `secteurs_dits` is given for a list read whole only: it says so; a list read in part keeps its `false`.
    const said = r.secteurs_dits ? {} : { secteurs, secteurs_complets };
    if (i < AVIS_AVEC_TEXTE || r.ne_pas_boire || !r.lien) return { ...rest, ...said, extrait_coupe, texte };
    abreges = true;
    if (ile) {
      const { secteurs_dits: _, ...short } = rest;
      return short;
    }
    return { ...rest, ...said };
  });
  return { avis, abreges };
}

/**
 * The notices of a commune in its résumé, the one not to drink the water left out (said first, in its own words): the cuts soonest first, then the notices without hours, newest first; the
 * first `AVIS_AU_RESUME` told apart (`noticeSaid`), the others counted (Saint-Denis, 21/11/2026: three « Travaux sur
 * le réseau » said alike).
 */
export function resumeAvis(mine: notices.Avis[], now: Date): string {
  const order = [...mine].sort((x, y) => {
    const [kx, ky] = [x.debut ?? x.fin, y.debut ?? y.fin];
    return kx && ky ? kx.localeCompare(ky) : kx ? -1 : ky ? 1 : y.publie.localeCompare(x.publie);
  });
  const rest = order.length - AVIS_AU_RESUME;
  const shown = order.slice(0, AVIS_AU_RESUME).map((n) => ({ n, dit: noticeSaid(n, now) }));
  // Two notices said in the same words (runéo's two « Incident : fuite sur le réseau » of 24/11/2026 for Saint-Pierre,
  // same end, sectors cut from the excerpt) are told apart by their time of publication, as /coupures-eau does.
  const twice = (dit: string) => shown.filter((x) => x.dit === dit).length > 1;
  return shown.map(({ n, dit }) => (twice(dit) ? `${dit}, avis du ${publishedShort(n)}` : dit)).join("\u00a0; ") +
    (rest > 0 ? `\u00a0; et ${rest} autre${rest > 1 ? "s" : ""} avis, dans la liste des avis` : "");
}

/** `complet`: the page's build, every field of every notice; the tool's answer is cut to its size (`pourAssistant`). */
export async function coupuresEau(cache: Cache, lieu: string | undefined, now = new Date(), complet = false) {
  let all: notices.Avis[];
  let silent: FluxMuet[];
  // When the notices were read: « Pas d'avis … sur le site de Dionéo, lu le 22/11 à 08:47 ».
  let readAt: Date;
  try {
    const read = await notices.lecture(cache);
    readAt = read.fetchedAt;
    all = read.value.flatMap((f) => f.avis).sort((x, y) => y.publie.localeCompare(x.publie));
    silent = muets(read, now);
  } catch (err) {
    console.error(`source ${notices.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "Les avis des distributeurs d'eau ne répondent pas pour le moment.", consulter: notices.SOURCE.url }), isError: true };
  }
  const live = current(all, now);
  const common = { ...COMMON, ...apresCyclone(now), sources: credits([notices.SOURCE]) };
  // The scheduled event has not read them for a while: said first (tools/copie-ancienne.ts). Not in the pages' copy,
  // which say it at each view from its own hour.
  const ancienne = complet ? undefined : copieAncienne("eau", readAt, now, "outil");
  const avertissement = ancienne && `${ancienne} ${VOIR_EAU}`;

  if (!lieu?.trim()) {
    const dry = lues().map((c) => doNotDrink(all, c) && c).filter(Boolean) as string[];
    // A notice that still says not to drink the water is told however old it is, as on a commune's answer: the pages
    // cut from this one (the commune's water, its day) would otherwise say no notice where the water is not to be drunk.
    const stillDry = new Set(all.filter((n) => n.communes.some((c) => doNotDrink(all, c) === n)));
    const told = all.filter((n) => stillDry.has(n) || live.includes(n));
    const rows = told.map((n) => noticeRow(n, now, stillDry.has(n)));
    const cut = complet ? undefined : pourAssistant(rows, true);
    return text({
      avertissement,
      // The sites without an answer named once here, their words in `injoignable` (the page says them in full).
      resume: (dry.length ? `Eau à ne pas boire en ce moment, ${DANS_LES_SECTEURS(dry.length)} : ${dry.join(", ")}. ` : "") +
        (live.length ? `${live.length} avis des distributeurs d'eau récents ou à venir.` : silent.length ? "" : "Pas d'avis de coupure récent ou à venir sur les sites lus. Une coupure peut être annoncée ailleurs, par la mairie par exemple.") +
        (complet ? silent.map((f) => ` ${f.texte}`).join("")
          : silent.length ? ` Sans réponse à la dernière lecture\u00a0: ${enumeration(silent.map((f) => f.de.replace(/^d(?:e (?:la |l'|les? )?|es )/, "")))}\u00a0: ce que chacun annonçait, dans injoignable.` : ""),
      injoignable: silent.length ? silent : undefined,
      // When the notices were read, for the pages: their copy is built later from that read (24/11/2026: « lu le … à
      // 05:33 », the copy's hour, against 05:25 for the tool).
      ...(complet && { avis_lus_le: readAt.toISOString() }),
      ne_pas_boire: dry.length ? dry : undefined,
      avis: cut ? cut.avis : rows,
      ...(cut?.abreges && { avis_abreges: TEXTE_ET_SECTEURS_PAR_LE_LIEN }),
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
  const sharedText = shared && `${phrasePartage(commune, shared)} ${dist?.avis ? `Seuls les avis de ${dist.par ?? dist.nom} sont lus.` : "Leurs avis ne sont pas lus par rundata.re."}` +
    (unreadShare && mairie ? ` ${mairie.libelle}\u00a0: ${mairie.lien}.` : "");
  // Where the commune's notices are read: who publishes them (the CIREST, a mairie, else the distributor) and its page.
  // The distributor is the ARS's; for a shared commune read through the CIREST alone, none is chosen (partage).
  const lus = dist?.avis ? { publie_par: dist.par ?? dist.nom, distributeur: dist.partage && dist.par ? undefined : dist.nom, lien: dist.site! } : undefined;
  // No notice found: the distributor and where its notices are, never the bare « aucun avis » (a question on Cambuston
  // was answered without naming the CIREST nor O2LEST).
  // « Pas d'avis » with where it was looked for and when, never « aucun avis », which reads as « no cut » (marketing).
  const lu = `, lu le ${published({ publie: readAt.toISOString() } as notices.Avis).replace(/^(\d\d\/\d\d)\/\d{4}/, "$1")}`;
  // The mairie named as elsewhere, unless the notices read are its own (Cilaos, Sainte-Marie…).
  const ailleurs = lus && /^(?:la )?(?:ville|commune|mairie)\b/i.test(lus.publie_par) ? "Une coupure peut être annoncée ailleurs." : "Une coupure peut être annoncée ailleurs, par la mairie par exemple.";
  const where = !lus
    ? (dist ? `. D'après l'ARS, ${nomDit(dist)} distribue l'eau ${a(commune)}, et rundata.re ne lit pas ses avis` : "")
    : lus.distributeur === lus.publie_par
      ? ` sur le site ${deNom(lus.publie_par)}${lu}\u00a0: ${lus.lien}${shared ? "" : `. D'après l'ARS, ${lus.distributeur} y distribue l'eau`}`
      : ` sur le site ${deNom(lus.publie_par)}${lu}\u00a0: ${lus.lien}${shared || !lus.distributeur ? "" : `. D'après l'ARS, ${lus.distributeur} distribue l'eau ${a(commune)}`}`;
  // A distributor's own site, linked only (SITES_DISTRIBUTEURS): what the commune's page links.
  const siteDist = unread ? SITES_DISTRIBUTEURS[unread.nom] : undefined;
  // Its feed did not answer at the last read: its notices kept said so, or its read said failed, never « aucun avis ».
  const mute = dist?.avis ? muetPour(silent, commune, mine.length) : undefined;
  // The résumé names the distributor (`where`): the ARS credited beside the notices.
  const named = covered && !mine.length && !mute;
  // The notices the résumé lists: every one but the one not to drink the water, said before them.
  const cuts = mine.filter((n) => n !== dry);
  const resume = [
    // Always first, in its own words, never among the notices counted (the server's safety rule, worded by marketing).
    dry ? drySaid(dry, commune) : "",
    cuts.length
      ? `${cuts.length} avis récent${cuts.length > 1 ? "s" : ""} ou à venir ${a(commune)}\u00a0: ${resumeAvis(cuts, now)}.`
      : mute ? ""
      : covered ? `Pas d'avis de coupure récent ou à venir ${a(commune)}${where}. ${ailleurs}`
      : unread ? `Pas d'avis en ligne lisible pour ${commune} : rundata.re ne lit pas les avis de coupure de ${unread.nom}, qui y distribue l'eau. ${siteDist ? `Voir le site ${deNom(unread.nom)}, rubrique «\u00a0L'eau dans ma commune\u00a0»\u00a0: ${siteDist}, ou la mairie.` : `Voir ${unread.nom} ou la mairie.`}`
      : `Pas d'avis en ligne lisible pour ${commune} : voir la mairie ou le distributeur d'eau.`,
    mute ? mute.texte : "",
    sharedText ?? "",
  ].filter(Boolean).join(" ");
  // Sainte-Suzanne: the orders allowing runéo's works, a block of their own, never a notice (providers/arretes-travaux.ts).
  const arretes = commune === arretesVille.COMMUNE ? await arretesVille.bloc(cache, now) : undefined;
  return text({
    avertissement,
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
    ...(() => {
      const rows = mine.map((n) => noticeRow(n, now, n === dry));
      const cut = complet ? undefined : pourAssistant(rows);
      return { avis: cut ? cut.avis : rows, ...(cut?.abreges && { avis_abreges: TEXTE_PAR_LE_LIEN }) };
    })(),
    arretes_travaux_ville: arretes,
    ...common,
    // The distributor named is the ARS's sanitary control's (src/eau/distributeurs.json), credited as the page does.
    // Its notices not read and none shown: the ARS alone, no notice of any distributor is used.
    ...(unread && !mine.length && !dry ? { sources: credits([potable.SOURCE]) }
      : unread || shared || (named && dist) ? { sources: credits([notices.SOURCE, potable.SOURCE, ...(arretes ? [arretesVille.SOURCE] : [])]) }
      : arretes ? { sources: credits([notices.SOURCE, arretesVille.SOURCE]) } : {}),
  });
}
