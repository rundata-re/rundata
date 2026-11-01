/**
 * The schools, collèges and lycées (vie/ecoles.ts), answered by annuaire_services_publics when the question is about
 * them: those of the place's commune, the nearest the place first; a kind (« collège ») or a service (« internat »,
 * « ULIS ») asked keeps those alone. Never which school an address depends on: the mairie and the Département decide it.
 */
import { distanceKm } from "../geo.js";
import { resolvePlace } from "../places/resolve.js";
import * as ecoles from "../vie/ecoles.js";
import { slugify } from "../web/places.js";
import { a, credits, de, fr, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks for a school, a collège or a lycée, or one of their services; not a driving or surf school. */
export const SCHOOL = /(?<!\p{L})[ée]coles?(?! (?:de|d'|du) (?:conduite|surf|musique|danse|voile|plong[ée]e|kite|parapente|commerce|ing[ée]nieurs?))(?!\p{L})|coll[èe]ges?|lyc[ée]es?|maternelle|[ée]l[ée]mentaire|\bulis\b|\bsegpa\b|internat|cantine|[ée]tablissements? scolaires?/iu;

const KINDS: [RegExp, ecoles.Kind][] = [[/[ée]cole|maternelle|[ée]l[ée]mentaire/i, "ecole"], [/coll[èe]ge|segpa/i, "college"], [/lyc[ée]e/i, "lycee"]];
const SERVICES: [RegExp, (e: ecoles.Etablissement) => boolean][] = [
  [/internat/i, (e) => !!e.internat], [/\bulis\b/i, (e) => !!e.ulis], [/\bsegpa\b/i, (e) => !!e.segpa], [/cantine/i, (e) => !!e.cantine],
  [/maternelle/i, (e) => !!e.niveau?.includes("maternelle")], [/[ée]l[ée]mentaire/i, (e) => !!e.niveau?.includes("élémentaire")],
  [/priv[ée]/i, (e) => !!e.prive], [/public/i, (e) => !e.prive],
];
const SHOWN = 10;

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const NOTES = [
  `Annuaire de l'Éducation nationale, copie du ${dmy(ecoles.BUILT)} (lignes mises à jour jusqu'au ${dmy(ecoles.UPDATED)}). Les services sont ceux que l'établissement déclare : un service non déclaré n'est pas dit absent.`,
  "Ne jamais déduire l'école ou le collège d'une adresse de la distance : la mairie fixe le secteur des écoles, le Département celui des collèges, et le rectorat affecte les élèves. Renvoyer à la mairie, au Département ou au site de l'académie (ac-reunion.fr).",
];

const row = ({ e, km }: { e: ecoles.Etablissement; km?: number }) => ({
  nom: e.nom,
  type: ecoles.KINDS.find((k) => k.type === e.type)!.un,
  commune: e.commune,
  services: ecoles.services(e),
  adresse: e.adresse,
  distance_km: km != null ? Math.round(km * 10) / 10 : undefined,
  telephone: e.tel,
  site: e.web,
  fiche_onisep: e.onisep,
  uai: e.uai,
});

export function ecolesAnswer(quoi: string, lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const kinds = KINDS.filter(([re]) => re.test(quoi)).map(([, k]) => k);
  const tests = SERVICES.filter(([re]) => re.test(quoi)).map(([, t]) => t);
  const pool = ecoles.LIST.filter((e) => (!kinds.length || kinds.includes(e.type)) && tests.every((t) => t(e)));
  const count = (list: ecoles.Etablissement[]) =>
    ecoles.KINDS.map((k) => [k.type, list.filter((e) => e.type === k.type).length] as const).filter(([, n]) => n).map(([k, n]) => ecoles.counted(k, n)).join(", ");
  if (!res) {
    const communes = [...new Set(pool.map((e) => e.commune))].sort((x, y) => x.localeCompare(y, "fr"));
    return text({
      resume: `${pool.length} établissements à La Réunion d'après l'annuaire de l'Éducation nationale (${count(pool)}). Donner une commune ou un lieu pour la liste, les plus proches d'abord.`,
      par_commune: Object.fromEntries(communes.map((c) => [c, pool.filter((e) => e.commune === c).length])),
      avertissements: NOTES,
      sources: credits([ecoles.SOURCE]),
    });
  }
  const { commune, lon, lat } = res.lieu;
  const here = pool.filter((e) => e.commune === commune);
  // The commune's, the nearest the place first; the island's nearest when the commune has none.
  const ranked = (here.length ? here : pool).map((e) => ({ e, km: distanceKm(lon, lat, e.lon, e.lat) })).sort((x, y) => x.km - y.km);
  const shown = ranked.slice(0, SHOWN);
  return text({
    lieu: placeBlock(lieu!, res),
    resume: here.length
      ? `${here.length} établissement${here.length > 1 ? "s" : ""} ${a(commune)} (${count(here)}). Le plus proche ${de(res.lieu.nom)} : ${shown[0].e.nom}, ${shown[0].e.adresse}, à ${fr(Math.round(shown[0].km * 10) / 10)} km.`
      : `Aucun établissement de ce type ${a(commune)}. Les plus proches : ${shown.slice(0, 3).map(({ e, km }) => `${e.nom}, ${a(e.commune)}, à ${fr(Math.round(km * 10) / 10)} km`).join(" ; ")}.`,
    etablissements: shown.map(row),
    autres: here.length > SHOWN ? `${here.length - SHOWN} autre${here.length - SHOWN > 1 ? "s" : ""} ${a(commune)}, sur la page de la commune.` : undefined,
    page: `https://rundata.re/communes/${slugify(commune)}#ecoles`,
    avertissements: NOTES,
    sources: credits([ecoles.SOURCE]),
  });
}
