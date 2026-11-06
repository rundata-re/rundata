import type { Cache } from "../cache.js";
import { distanceKm } from "../geo.js";
import { INSEE } from "../places/insee.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import * as annuaire from "../providers/annuaire.js";
import * as annexesSd from "../vie/mairies-annexes.js";
import { why } from "../types.js";
import { pageOf, slugify } from "../web/places.js";
import { carburantsAnswer, FUEL } from "./carburants.js";
import { credits, de, fr, minutees, notFound, text, tranche } from "./format.js";
import { COLLECTION, collecteAnswer } from "./collecte.js";
import { decheteriesAnswer, WASTE } from "./decheteries.js";
import { CHILDREN, enfantsAnswer } from "./enfants.js";
import { collegeAnswer, ecolesAnswer, SCHOOL } from "./etablissements.js";
import { JUSTICE, justiceAnswer } from "./justice.js";
import { MARKET, marchesAnswer } from "./marches.js";
import { DOCTOR, medecinsAnswer } from "./medecins.js";
import { EMERGENCY, GARDE, gardeAnswer, PHARMACY, pharmaciesAnswer, urgencesAnswer } from "./sante.js";
import { sansLien } from "../liens.js";
import { rienTrouve } from "../vide.js";

// Asked of the annuaire, a defibrillator is not an office: its link is the page of the devices.
const DEFIBRILLATOR = /d[ée]fibrillateur|\bdae\b/i;

// A town hall asked, and one of a quarter: Saint-Denis's are only in the Ville's list (vie/mairies-annexes.ts).
const TOWN_HALL = /\bmairies?\b|centres? municipa/i;
const ANNEX = /annexe|quartier|centres? municipa/i;

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « 08:00 » (or « 08h00 » in a copy stored before 27/10/2026) → minutes after midnight. */
const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Whether an office's hours are all written with their minutes: when one of its times, any day, has some (format.ts). */
const withMinutes = (o: annuaire.Office) => minutees(o.horaires.flatMap((h) => h.plages.map(([d, f]) => [m(d), m(f)] as [number, number])));

/** A published span, « 08:00 » to « 16:00 »: « 8\u00a0h–16\u00a0h », « 08:30–12:00 », « 08:00–12:00 » beside « 13:30–16:30 ». */
const span = (d: string, f: string, all: boolean) => tranche(m(d), m(f), all);

/**
 * A note of the hours as it reads inside a parenthesis, its hours as the connector writes them (06/11/2026: « (Fermeture
 * de l'état civil à 15h15.) » → « (fermeture de l'état civil à 15:15) »). A first word in capitals stays (« CCAS »).
 */
export function noteDite(note: string): string {
  const hh = (h: string) => h.padStart(2, "0");
  return note.trim().replace(/\.$/, "")
    .replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase())
    .replace(/\b([01]?\d|2[0-3])\s?h\s?([0-5]\d)\b/g, (_, h: string, mn: string) => `${hh(h)}:${mn}`)
    .replace(/\b(à|de|dès|jusqu'à|jusqu’à|avant|après|vers)\s([01]?\d|2[0-3])\s?h\b(?!\s?\/)/gu, (_, w: string, h: string) => `${w} ${hh(h)}:00`);
}

/** « lundi au jeudi 8\u00a0h–16\u00a0h ; vendredi 8\u00a0h–15\u00a0h », « lundi au vendredi 08:00–12:00 et 13:30–16:30 ». */
export function hoursText(o: annuaire.Office): string | undefined {
  if (!o.horaires.length) return undefined;
  const all = withMinutes(o);
  return o.horaires
    .filter((h) => h.plages.length || h.note)
    .map((h) => `${h.de === h.a ? h.de : `${h.de} au ${h.a}`}${h.plages.map(([d, f]) => ` ${span(d, f, all)}`).join(" et")}${h.note ? ` (${noteDite(h.note)})` : ""}`)
    .join("\u00a0; ") || undefined;
}

/** What the published hours do not account for, said wherever they are. */
export const HORAIRES_A_SAVOIR = "Horaires publiés par chaque service sur service-public.fr : jours fériés et fermetures exceptionnelles non pris en compte.";

/** Open at `now` (local time), from the published hours; null when no hours are published. */
export function openNow(o: annuaire.Office, now: Date): boolean | null {
  // Days with only a note (« permanences lors des audiences »): no hours to tell.
  if (!o.horaires.some((h) => h.plages.length)) return null;
  const local = new Date(now.getTime() + 4 * 3600_000);
  const day = local.getUTCDay();
  const hm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return o.horaires.some((h) => {
    const [d0, d1] = [DAYS.indexOf(h.de), DAYS.indexOf(h.a)];
    if (d0 < 0 || d1 < 0) return false;
    const inRange = d0 <= d1 ? day >= d0 && day <= d1 : day >= d0 || day <= d1;
    // A copy stored before 27/10/2026 writes « 08h00 »: read the same.
    return inRange && h.plages.some(([d, f]) => hm >= d.replace("h", ":") && hm < f.replace("h", ":"));
  });
}

/** The hours of `now`'s day (local time), as « 07:45–12:00 et 13:30–16:00 » (withMinutes()) ; undefined when it is closed all day. */
export function hoursOn(o: annuaire.Office, now: Date): string | undefined {
  const day = new Date(now.getTime() + 4 * 3600_000).getUTCDay();
  const h = o.horaires.find((x) => {
    const [d0, d1] = [DAYS.indexOf(x.de), DAYS.indexOf(x.a)];
    return d0 >= 0 && d1 >= 0 && (d0 <= d1 ? day >= d0 && day <= d1 : day >= d0 || day <= d1);
  });
  const all = withMinutes(o);
  return h?.plages.length ? h.plages.map(([d, f]) => span(d, f, all)).join(" et ") : undefined;
}

/**
 * Keeps the offices whose kind of service holds every word asked (« CPAM » for the CGSS's offices, whose name does not
 * say it). A copy read before the kinds were kept: every office, as before.
 */
export function ofKind(list: annuaire.Office[], quoi: string): annuaire.Office[] {
  const words = wordsOf(quoi);
  return list.filter((o) => !o.types || words.every((w) => o.types!.some((t) => t.split("_").some((x) => x === w || x === `${w}s`))));
}

/** Said with « aucun service »: what the tool does answer, in marketing's words (04/11/2026). */
export const COUVERT =
  "Cet outil donne\u00a0: les services de l'annuaire de l'administration (mairie, préfecture, CAF, CGSS, impôts, France Travail, tribunal, gendarmerie…)\u00a0; " +
  "les pharmacies et les hôpitaux les plus proches (pharmacie de garde\u00a0: 3237.fr ou le 32\u00a037\u00a0; urgence et garde médicale\u00a0: le 15)\u00a0; " +
  "les marchés forains et couverts\u00a0; les déchèteries\u00a0; le jour de collecte des déchets dans l'Ouest (TCO)\u00a0; les prix maximum des carburants et du gaz\u00a0; " +
  "le nombre de médecins libéraux par commune\u00a0; les écoles, collèges et lycées\u00a0; les lieux où aller avec les enfants.";
export const PROCHES = "Trouvés par la recherche de l'annuaire, mais sans le mot demandé ni dans leur nom ni dans leur type\u00a0: sans doute d'autres services. Ne pas les donner comme réponse.";

/**
 * Keeps the offices whose name holds every word asked (as a whole word, plural or not): the API's full-text search
 * also matches inside words, so « CAF » near Le Tampon finds the gendarmerie of La Plaine-des-Cafres.
 */
const wordsOf = (quoi: string) => normalize(quoi).split(" ").filter((w) => w.length > 1).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w));

export function named(list: annuaire.Office[], quoi: string): annuaire.Office[] {
  const words = wordsOf(quoi);
  return list.filter((o) => {
    const name = ` ${normalize(o.nom)} `;
    return words.every((w) => new RegExp(` ${w}s? `).test(name));
  });
}

export async function annuaireTool(cache: Cache, quoi: string, lieu: string | undefined, now = new Date(), adresse?: string) {
  // Practical life, asked the same way: the pharmacies, the doctor on duty, the emergencies, the markets, the déchèteries,
  // the fuel prices, the doctors, the schools, where to go with children; the places of justice first (« tribunal pour enfants »).
  if (JUSTICE.test(quoi)) return justiceAnswer(cache, quoi, lieu, now);
  if (PHARMACY.test(quoi)) return pharmaciesAnswer(lieu);
  if (GARDE.test(quoi)) return gardeAnswer(quoi, lieu);
  if (EMERGENCY.test(quoi)) return urgencesAnswer(lieu);
  if (MARKET.test(quoi)) return marchesAnswer(lieu);
  if (COLLECTION.test(quoi)) return collecteAnswer(lieu, now);
  if (WASTE.test(quoi)) return decheteriesAnswer(cache, quoi, lieu, now);
  if (FUEL.test(quoi)) return carburantsAnswer(cache, now);
  if (DOCTOR.test(quoi)) return medecinsAnswer(quoi, lieu);
  // An address: the collège of its sector; it goes nowhere else.
  if (SCHOOL.test(quoi) && adresse?.trim()) return collegeAnswer(quoi, lieu, adresse);
  if (SCHOOL.test(quoi)) return ecolesAnswer(quoi, lieu);
  if (CHILDREN.test(quoi)) return enfantsAnswer(quoi, lieu, now);
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const code = res ? INSEE[res.lieu.commune] : undefined;
  // In Saint-Denis, the Hôtel de Ville from the annuaire, its mairies annexes and centres municipaux beside it.
  const annexes = res?.lieu.commune === annexesSd.COMMUNE && TOWN_HALL.test(quoi);
  const asked = annexes && ANNEX.test(quoi) ? "mairie" : quoi;
  let found: annuaire.Office[];
  // The directory's own hits that neither name nor kind say the words of: never the answer (04/11/2026, « élections »
  // gave the commissaires de justice, « La Poste » a France services), only shown as such.
  let others: annuaire.Office[] = [];
  try {
    // The place's commune first; the whole island when it has no such office (one CAF, one prefecture…).
    found = code ? named((await annuaire.search(cache, asked, code)).value, asked) : [];
    if (!found.length) {
      const island = (await annuaire.search(cache, asked)).value;
      found = named(island, asked).length ? named(island, asked) : ofKind(island, asked);
      if (!found.length) others = island;
    }
  } catch (err) {
    console.error(`source ${annuaire.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "L'annuaire de l'administration ne répond pas pour le moment.", consulter: annuaire.SOURCE.url }), isError: true };
  }
  if (!found.length) {
    rienTrouve("annuaire_services_publics");
    return text({
      resume: `Aucun service public trouvé à La Réunion pour « ${quoi} ».`,
      conseil: "Essayer un autre mot : mairie, CAF, préfecture, impôts, France Travail, tribunal, CPAM…",
      couvert: COUVERT,
      proches: others.length ? { note: PROCHES, noms: [...new Set(others.map((o) => o.nom))].slice(0, 3) } : undefined,
      page: DEFIBRILLATOR.test(quoi) ? "https://rundata.re/defibrillateurs" : undefined,
      sources: credits([annuaire.SOURCE]),
    });
  }
  // Same commune first, then the nearest, then the search's own order.
  const p = res?.lieu;
  const dist = (o: annuaire.Office) => (p && o.lon != null && o.lat != null ? distanceKm(p.lon, p.lat, o.lon, o.lat) : null);
  const ranked = found
    .map((o, i) => ({ o, i, d: dist(o), same: code != null && o.insee === code }))
    .sort((a, b) => (p ? Number(b.same) - Number(a.same) || (a.d ?? 1e9) - (b.d ?? 1e9) : 0) || a.i - b.i)
    .slice(0, 5);
  const best = ranked[0];
  // The page of the place's commune, as the answers that carry their place link to it (citer.ts).
  const town = p && pageOf(slugify(p.commune));
  const h = hoursText(best.o);
  const open = openNow(best.o, now);
  const near = annexes ? annexesSd.nearest(p!.lon, p!.lat) : [];
  const hall = near.length ? found.find((o) => o.insee === code && /^mairie\b/i.test(o.nom)) : undefined;
  const km = (d: number) => `${fr(Math.round(d * 10) / 10)} km`;
  return text({
    resume:
      `${best.o.nom}, ${best.o.adresse}` +
      // Under 100 m, no distance: « à 0 km de Saint-Pierre » for the town hall of Saint-Pierre (06/11/2026).
      (best.d != null && best.d >= 0.1 ? ` (à ${fr(Math.round(best.d * 10) / 10)} km ${de(p!.nom)})` : "") +
      (h ? `. Horaires : ${h}` : "") +
      (open === null ? "" : open ? ". Ouvert en ce moment (d'après les horaires publiés)" : ". Fermé en ce moment (d'après les horaires publiés)") +
      (best.o.telephone ? `. Tél. ${best.o.telephone}` : "") +
      "." +
      (near.length ? ` La plus proche des mairies annexes et centres municipaux, d'après la liste de la Ville\u00a0: ${near[0].nature} ${near[0].nom}, ${near[0].adresse} (à ${km(near[0].km)} ${de(p!.nom)}).` : ""),
    resultats: ranked.map(({ o, d }) => ({
      nom: o.nom,
      adresse: o.adresse,
      distance_km: d != null ? Math.round(d * 10) / 10 : undefined,
      horaires: hoursText(o),
      ouvert_maintenant: openNow(o, now) ?? undefined,
      note_horaires: o.note_horaires,
      telephone: o.telephone,
      courriel: o.courriel,
      // Not a site that submits any link to its agreement (Saint-Benoît's town hall).
      site: sansLien(o.site) ? undefined : o.site,
      fiche: o.fiche || undefined,
    })),
    mairies_annexes: near.length
      ? {
        liste: annexesSd.LISTE,
        telephone_hotel_de_ville: hall?.telephone,
        lieux: near.map((l) => ({ nature: l.nature, nom: l.nom, quartier: l.quartier, adresse: l.adresse, distance_km: Math.round(l.km * 10) / 10 })),
      }
      : undefined,
    avertissements: [HORAIRES_A_SAVOIR],
    page: town?.commune ? `https://rundata.re/communes/${town.slug}` : undefined,
    sources: credits([annuaire.SOURCE, ...(near.length ? [annexesSd.SOURCE] : [])]),
  });
}
