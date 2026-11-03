/**
 * The places of justice of La Réunion (providers/annuaire.ts, `justice`), answered by annuaire_services_publics when
 * the question is about justice: the points-justice, the courts, the help to victims, nearest first. Most points-justice
 * publish no hours in the annuaire: the answer says so, with their phone. The points-justice held in a prison or at the
 * EPSMR are for the people there, and left out. Which court is competent depends on the case: never said.
 */
import type { Cache } from "../cache.js";
import { distanceKm } from "../geo.js";
import { INSEE } from "../places/insee.js";
import { resolvePlace } from "../places/resolve.js";
import * as annuaire from "../providers/annuaire.js";
import { why } from "../types.js";
import { pageOf, slugify } from "../web/places.js";
import { hoursText, openNow } from "./annuaire.js";
import { de, credits, fr, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about justice: a point-justice, a court, the help to victims (not the commissaires de justice). */
export const JUSTICE = /(?<!commissaires? de )justice|tribunal|prud.?hom|cour d.appel|acc[eè]s au droit|victime(?!s? de guerre)/i;

type Groupe = (typeof annuaire.JUSTICE_TYPES)[annuaire.JusticeType];

/** What each kind of place is, said beside its name. */
const KIND: Record<annuaire.JusticeType, string> = {
  point_justice: "point-justice",
  cdad: "conseil départemental de l'accès au droit",
  tgi: "tribunal judiciaire",
  ti: "tribunal de proximité",
  te: "tribunal pour enfants",
  prudhommes: "conseil de prud'hommes",
  cour_appel: "cour d'appel",
  ta: "tribunal administratif",
  bav: "bureau d'aide aux victimes",
  aav: "association d'aide aux victimes",
};

/** The groups asked: the courts, the help to victims, the points-justice; « justice » alone, the three. */
function asked(quoi: string): Groupe[] {
  const g: Groupe[] = [];
  if (/point.?justice|acc[eè]s au droit|maison de (?:la )?justice/i.test(quoi)) g.push("acces");
  if (/tribunal|prud.?hom|cour d.appel|palais de justice/i.test(quoi)) g.push("tribunal");
  if (/victime/i.test(quoi)) g.push("victimes");
  return g.length ? g : ["acces", "tribunal", "victimes"];
}

/** A court named in the question: only that kind is given (« tribunal pour enfants », « prud'hommes »…). */
const COURTS: [RegExp, annuaire.JusticeType][] = [
  [/enfant|mineur/i, "te"],
  [/prud.?hom/i, "prudhommes"],
  [/cour d.appel/i, "cour_appel"],
  [/administratif/i, "ta"],
  [/judiciaire/i, "tgi"],
  [/proximit[ée]/i, "ti"],
];

const NAMES: Record<Groupe, { cle: string; un: string; nombre: (l: annuaire.JusticePlace[]) => string }> = {
  acces: {
    cle: "points_justice",
    un: "Point-justice le plus proche",
    nombre: (l) => {
      const n = l.filter((o) => o.type === "point_justice").length;
      return `${n} point${n > 1 ? "s" : ""}-justice${l.some((o) => o.type === "cdad") ? ` et le ${KIND.cdad}` : ""}`;
    },
  },
  tribunal: { cle: "tribunaux", un: "Juridiction la plus proche", nombre: (l) => `${l.length} juridiction${l.length > 1 ? "s" : ""}` },
  victimes: { cle: "aide_aux_victimes", un: "Aide aux victimes la plus proche", nombre: (l) => `${l.length} lieu${l.length > 1 ? "x" : ""} d'aide aux victimes` },
};

export async function justiceAnswer(cache: Cache, quoi: string, lieu: string | undefined, now = new Date()) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  let all: annuaire.JusticePlace[];
  try {
    all = (await annuaire.justice(cache)).value.filter((o) => !annuaire.RESERVED.test(o.nom));
  } catch (err) {
    console.error(`source ${annuaire.SOURCE.id} indisponible:`, why(err));
    return { ...text({ erreur: "L'annuaire de l'administration ne répond pas pour le moment.", consulter: annuaire.SOURCE.url }), isError: true };
  }
  const p = res?.lieu;
  const code = p ? INSEE[p.commune] : undefined;
  const dist = (o: annuaire.Office) => (p && o.lon != null && o.lat != null ? distanceKm(p.lon, p.lat, o.lon, o.lat) : null);
  const groupes = asked(quoi).map((g) => {
    const court = g === "tribunal" ? COURTS.find(([re]) => re.test(quoi))?.[1] : undefined;
    const list = all.filter((o) => annuaire.JUSTICE_TYPES[o.type] === g && (!court || o.type === court));
    // Same commune first, then the nearest; without a place, all of them by name.
    const ranked = list
      .map((o) => ({ o, d: dist(o), same: code != null && o.insee === code }))
      .sort((a, b) => (p ? Number(b.same) - Number(a.same) || (a.d ?? 1e9) - (b.d ?? 1e9) : a.o.nom.localeCompare(b.o.nom, "fr")))
      .slice(0, p ? 3 : undefined);
    return { g, list, ranked };
  });
  const line = ({ o, d }: { o: annuaire.Office; d: number | null }) => {
    const h = hoursText(o);
    const open = openNow(o, now);
    return `${o.nom}, ${o.adresse}` +
      (d != null ? ` (à ${fr(Math.round(d * 10) / 10)} km)` : "") +
      (h ? `, ${h}` : ", horaires non publiés") +
      (open === null ? "" : open ? ", ouvert en ce moment" : ", fermé en ce moment") +
      (o.telephone ? `, tél. ${o.telephone}` : "");
  };
  const resume = p
    ? groupes.filter((x) => x.ranked.length).map((x) => `${NAMES[x.g].un} ${de(p.nom)} : ${line(x.ranked[0])}.`).join(" ")
    : `À La Réunion, d'après l'annuaire de service-public.fr : ${groupes.map((x) => NAMES[x.g].nombre(x.list)).join(", ")}. Donner une commune pour les plus proches.`;
  const sansHoraires = all.filter((o) => o.type === "point_justice" && !hoursText(o)).length;
  const points = all.filter((o) => o.type === "point_justice").length;
  const town = p && pageOf(slugify(p.commune));
  return text({
    lieu: res ? placeBlock(lieu!, res) : undefined,
    resume,
    ...Object.fromEntries(groupes.map((x) => [NAMES[x.g].cle, x.ranked.map(({ o, d }) => ({
      nom: o.nom,
      type: KIND[o.type],
      adresse: o.adresse,
      distance_km: d != null ? Math.round(d * 10) / 10 : undefined,
      horaires: hoursText(o),
      ouvert_maintenant: openNow(o, now) ?? undefined,
      telephone: o.telephone,
      courriel: o.courriel,
      fiche: o.fiche || undefined,
    }))])),
    avertissements: [
      groupes.some((x) => x.g === "acces") && sansHoraires
        ? `${sansHoraires} des ${points} points-justice ne publient pas leurs horaires sur service-public.fr : appeler avant d'y aller.`
        : undefined,
      groupes.some((x) => x.g === "acces") ? "Les points-justice tenus en prison ou à l'EPSMR ne sont pas donnés : ils reçoivent les personnes qui y sont." : undefined,
      groupes.some((x) => x.g === "tribunal") ? "La juridiction compétente dépend de l'affaire et de l'adresse : la plus proche n'est pas forcément celle-là." : undefined,
      groupes.some((x) => x.g === "victimes") ? "En cas de danger immédiat : le 17." : undefined,
      "Horaires publiés par chaque service sur service-public.fr : jours fériés et fermetures exceptionnelles non pris en compte.",
    ].filter(Boolean),
    page: town?.commune ? `https://rundata.re/communes/${town.slug}` : undefined,
    sources: credits([annuaire.SOURCE]),
  });
}
