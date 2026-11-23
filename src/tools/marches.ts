/**
 * The markets (vie/marches.ts), answered by annuaire_services_publics when the question is about a market: those of
 * the place's commune, else the nearest; their days when OpenStreetMap or a town hall that allows it gives them, the
 * markets open all week said so, and the town hall's page where nothing is taken from it. The list is not complete,
 * and the answer says so.
 */
import { resolvePlace } from "../places/resolve.js";
import * as marches from "../vie/marches.js";
import { a, credits, de, fr, jourDuFichier, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about a market, not a supermarket. */
// Not a walk (« marche nordique », « club de marche ») nor a sports hall (23/11/2026).
export const MARKET = /(?<!super|hyper|club de |clubs de )march[ée]s?(?!\p{L})(?! (?:nordique|[àa] pied|afghane|sportive|rapide))|forain|halle(?!\p{L})(?! (?:des|de|du) (?:sports?|gymnase))/iu;

const NOT_ALL = "D'après OpenStreetMap, relevé par ses contributeurs, et les sites des mairies : tous les marchés n'y sont pas, et les jours peuvent avoir changé. La mairie a le calendrier des marchés forains. " +
  "Vous connaissez un marché absent ? Signalez-le avec donner_avis, ou ajoutez-le vous-même sur OpenStreetMap.";

export function marchesAnswer(lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const row = (m: marches.Lieu & { km?: number }) => ({
    nom: m.nom,
    commune: m.commune,
    quand: marches.jours(m) ?? m.note ?? `jours et heures non donnés ${marches.cherchesDans(m)}`,
    permanent: marches.permanent(m) || undefined,
    adresse: m.adresse ?? undefined,
    distance_km: m.km != null ? Math.round(m.km * 10) / 10 : undefined,
    carte: m.osm,
    source: m.source.nom,
    lien: m.source === marches.OSM ? undefined : m.lien,
  });
  const sourcesOf = (ms: marches.Lieu[]) => credits([...new Set(ms.map((m) => m.source))]);
  if (!res) {
    const all = marches.MARCHES();
    const communes = [...new Set(all.map((m) => m.commune))].sort((x, y) => x.localeCompare(y, "fr"));
    return text({
      resume: `${all.length} marchés dans ${communes.length} communes, ${all.filter((m) => marches.jours(m)).length} avec leurs jours. Donner une commune pour les siens.`,
      par_commune: Object.fromEntries(communes.map((c) => [c, all.filter((m) => m.commune === c).map(row)])),
      avertissements: [NOT_ALL],
      mis_a_jour: jourDuFichier(marches.OSM_LU),
      sources: sourcesOf(all),
    });
  }
  const commune = res.lieu.commune;
  const here = marches.inCommune(commune);
  const near = here.length ? here.map((m) => ({ ...m, km: undefined })) : marches.nearest(res.lieu.lon, res.lieu.lat, 3);
  const said = (m: marches.Lieu) => {
    const when = marches.jours(m) ?? m.note;
    return `${m.nom} (${marches.permanent(m) ? "marché permanent, " : ""}${when ?? `jours et heures non donnés ${marches.cherchesDans(m)}`})`;
  };
  const townHall = marches.lienMairie(commune);
  return text({
    lieu: placeBlock(lieu!, res),
    resume: here.length
      ? `Marchés ${a(commune)} : ${here.map(said).join("\u00a0; ")}.`
      : `Aucun marché trouvé ${a(commune)} dans OpenStreetMap ni sur les sites de mairie lus. Les plus proches : ${near.map((m) => `${said(m)}, ${a(m.commune)}, à ${fr(Math.round((m.km ?? 0) * 10) / 10)} km`).join("\u00a0; ")}.`,
    marches: near.map(row),
    mairie: townHall ? { texte: `Jours et horaires des marchés : site de la mairie ${de(commune)}`, site: townHall } : undefined,
    avertissements: [NOT_ALL],
    mis_a_jour: jourDuFichier(marches.OSM_LU),
    sources: sourcesOf(near),
  });
}
