/**
 * The schools, collèges and lycées (vie/ecoles.ts), answered by annuaire_services_publics when the question is about
 * them: those of the place's commune, the nearest the place first; a kind (« collège ») or a service (« internat »,
 * « ULIS ») asked keeps those alone. Never which school an address depends on from the distance. With an address
 * (`adresse`, its number and street, the commune in `lieu`): the public collège of its sector, from the map of sectors
 * (vie/carte-scolaire.ts), the same search as /ecoles. The address is matched and forgotten: never logged nor kept, and
 * its number never said back (test/etablissements-scolaires.test.ts); the measures keep its commune and « adresse » (usage.ts).
 */
import { distanceKm } from "../geo.js";
import { INSEE } from "../places/insee.js";
import { resolvePlace } from "../places/resolve.js";
import * as carteScolaire from "../vie/carte-scolaire.js";
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
  "Ne jamais déduire l'école ou le collège d'une adresse de la distance : la mairie fixe le secteur des écoles, le Département celui des collèges, et le rectorat affecte les élèves. Le collège public de secteur d'une adresse : redemander avec quoi = « collège », adresse = le numéro et la voie, lieu = la commune.",
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

const PAGE_COLLEGE = "https://rundata.re/ecoles#college";
const CONFIRME = "Le collège ou le Département confirme le secteur : en cas de doute, les appeler. Les collèges privés n'ont pas de secteur.";
const COTE = ["", " (côté impair)", " (côté pair)"];

/** A collège of a commune's file, as the answer gives it. */
const college = (d: carteScolaire.CarteCommune, i: number) => {
  const c = d.colleges[i];
  return { nom: c.nom, adresse: c.adresse, telephone: c.tel, site: c.web, fiche_onisep: c.onisep, uai: c.uai };
};
/** « « RUE DE LA GARE », LA SALINE »: a street of the file (in capitals), with its place. */
const said = (v: [string, string]) => `« ${v[0]} »${v[1] ? `, ${v[1]}` : ""}`;
/** The numbers of a stretch: all of them (1 or 2 to 9998 or 9999 in the file), from one on, or from one to another. */
const numeros = (deb: number, fin: number, cote: number) =>
  (fin >= 9998 ? (deb <= (cote === 2 ? 2 : 1) ? "tous les numéros" : `à partir du ${deb}`) : `du ${deb} au ${fin}`) + COTE[cote];

/**
 * The public collège of an address's sector (`adresse`: « 12 rue … », in the commune of `lieu`), from its commune's
 * map of sectors. Several streets of that name: each one's. Without its number, or past every stretch: the street's
 * collèges by number. Only a primary school asked: its sector is set by the mairie, not published.
 */
export async function collegeAnswer(quoi: string, lieu: string | undefined, adresse: string) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const base = { page: PAGE_COLLEGE, avertissements: [CONFIRME], sources: credits([carteScolaire.SOURCE]) };
  if (!res) return text({ resume: "Donner la commune de l'adresse dans lieu : le secteur se cherche dans la carte scolaire de la commune.", ...base });
  const commune = res.lieu.commune;
  if (/[ée]cole|maternelle|[ée]l[ée]mentaire/i.test(quoi) && !/coll[èe]ge/i.test(quoi)) {
    return text({
      resume: `Le secteur des écoles maternelles et élémentaires est fixé par la mairie ${de(commune)}, et il n'est pas publié en données ouvertes : demander à la mairie.`,
      page: `https://rundata.re/communes/${slugify(commune)}#ecoles`,
      sources: credits([ecoles.SOURCE]),
    });
  }
  let d: carteScolaire.CarteCommune | null = null;
  try {
    d = await carteScolaire.fichier(INSEE[commune]);
  } catch (err) {
    // The commune alone, never the address.
    console.error(`carte scolaire ${de(commune)} illisible:`, err instanceof Error ? err.name : "erreur");
  }
  if (!d) return { ...text({ erreur: `La carte scolaire ${de(commune)} ne se lit pas pour le moment : chercher le collège sur la page.`, ...base }), isError: true };
  const file = d;
  const found = carteScolaire.trouve(file, adresse, carteScolaire.motsVoie);
  const note = `D'après la carte scolaire des collèges publics, mise à jour le ${dmy(file.maj)}.`;
  switch (found.k) {
    case "unique":
      return text({ resume: `Un seul collège public pour toute la commune ${de(commune)} : ${file.colleges[found.c].nom}.`, college: college(file, found.c), note, ...base });
    case "college":
      return text({
        resume: `Pour ${said(found.voie)} ${a(commune)}, collège public de secteur : ${file.colleges[found.c].nom}.` +
          (found.hors ? " Ce numéro n'est dans aucune portion connue de la voie : le collège donné est celui de toute la voie." : ""),
        college: college(file, found.c),
        note,
        ...base,
      });
    case "numeros":
      return text({
        resume: `La voie ${said(found.voie)} ${a(commune)} dépend de plusieurs collèges selon le numéro` +
          (found.hors ? "\u00a0; ce numéro n'est dans aucune portion connue." : found.num ? "." : " : donner le numéro."),
        par_numero: found.rows.map(([deb, fin, cote, c]) => ({ numeros: numeros(deb, fin, cote), college: file.colleges[c].nom })),
        colleges: [...new Set(found.rows.map((r) => r[3]))].map((c) => college(file, c)),
        note,
        ...base,
      });
    case "choix": {
      // Several streets of that name, with different collèges: each one's, by its place.
      const voies = found.voies.map((v) => {
        const r = carteScolaire.trouve(file, adresse, carteScolaire.motsVoie, `${v[0]}|${v[1]}`);
        const noms = r.k === "college" ? [r.c] : r.k === "numeros" ? [...new Set(r.rows.map((x) => x[3]))] : [];
        return { voie: said(v), college: noms.map((c) => file.colleges[c].nom).join(" ou ") || undefined };
      });
      return text({ resume: `Plusieurs voies de ce nom ${a(commune)}, qui ne dépendent pas du même collège : préciser le quartier ou le lieu-dit.`, voies, note, ...base });
    }
    default:
      return text({
        resume: found.k === "vide"
          ? "Donner le numéro et le nom de la voie : « 12 rue … », « chemin … »."
          : `Voie introuvable dans la carte scolaire ${de(commune)} : vérifier son nom, ou la chercher sur la page.`,
        note,
        ...base,
      });
  }
}
