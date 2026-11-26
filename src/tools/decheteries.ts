/**
 * The déchèteries whose skips are said now, the TCO's and the CASUD's (vie/decheteries.ts), answered by
 * annuaire_services_publics when the question is about waste: the nearest sites and what their skips take now, or which
 * take the kind of waste asked. A site whose staff have not updated it for hours is said to be « à vérifier », never as
 * it was. Elsewhere, the sites of the ADEME's directory, nearest first, and the site of their intercommunalité for their
 * hours.
 */
import type { Cache } from "../cache.js";
import { resolvePlace } from "../places/resolve.js";
import * as casud from "../providers/casud.js";
import * as tco from "../providers/tco.js";
import { slugify } from "../web/places.js";
import * as dech from "../vie/decheteries.js";
import { a, credits, de, fr, jourDuFichier, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about a déchèterie or getting rid of waste. */
export const WASTE = /d[ée]ch[eèé]t|encombrant|gravat|\bbenne|centre de propret|centres? de tri\b/i;

const ONLY_LIVE = "Seuls le TCO (Ouest) et la CASUD (Le Tampon, Saint-Joseph) publient l'état des bennes en direct. Ailleurs, la liste des déchèteries vient de l'annuaire de l'ADEME, sans les horaires.";
const km = (n: number) => `${fr(Math.round(n * 10) / 10)} km`;

/** Outside the TCO: the commune's sites and the nearest others, where they are, their hours on their intercommunalité's site. */
function elsewhere(lieu: string, res: NonNullable<ReturnType<typeof resolvePlace>>, commune: string) {
  const near = dech.elsewhereNear(commune, res.lieu.lon, res.lieu.lat);
  const epcis = [...new Map(near.map((s) => [s.epci.nom, s.epci])).values()];
  return text({
    lieu: placeBlock(lieu, res),
    resume: `Déchèteries les plus proches ${de(res.lieu.nom)}, ${dech.FROM_ADEME}\u00a0: ${near.map((s) => `${s.nom} (${s.commune}, à ${km(s.km)})`).join("\u00a0; ")}. ` +
      `Horaires\u00a0: voir le site de ${epcis.map((e) => `${e.nom} (${e.site})`).join(" ou de ")}.`,
    page: `https://rundata.re/decheteries#${slugify(commune)}`,
    decheteries: near.map((s) => ({
      nom: s.nom,
      commune: s.commune,
      adresse: s.adresse || undefined,
      distance_km: Math.round(s.km * 10) / 10,
      horaires: `voir le site de ${s.epci.nom}`,
      page: s.epci.site,
    })),
    avertissements: [ONLY_LIVE],
    mis_a_jour: jourDuFichier(dech.UPDATED),
    sources: credits([dech.ADEME]),
  });
}

export async function decheteriesAnswer(cache: Cache, quoi: string, lieu: string | undefined, now = new Date()) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const commune = res?.lieu.commune;
  // L'Entre-Deux and Saint-Philippe have no site of their own: the CASUD's nearest, whose skips are said.
  if (commune && !dech.LIVE_COMMUNES.includes(commune) && dech.epciOf(commune)?.nom !== "la CASUD") return elsewhere(lieu!, res!, commune);
  const live = await dech.meteo(cache);
  // The sites of the commune's own intercommunality: its residents' (L'Entre-Deux, the CASUD's; never the TCO's at Saint-Leu).
  const own = commune && dech.epciOf(commune)?.nom === "la CASUD" ? "casud" : commune ? "tco" : undefined;
  const sites = dech.sitesNow(live.etats, now).filter((s) => !own || s.par === own);
  const kind = dech.wasteAsked(quoi);
  const labels = kind ? dech.labelsOf(kind) : [];
  const label = kind ? dech.labelOf(kind) : undefined;
  const near = res ? dech.nearest(res.lieu.lon, res.lieu.lat, sites, kind ? 5 : 3) : sites.map((s) => ({ ...s, km: undefined }));
  const at = (s: dech.SiteNow) => (s.mis_a_jour ? s.mis_a_jour.split(" ")[1] : "?");
  const where = (s: dech.SiteNow & { km?: number }) => `${s.nom}${s.km != null ? ` (à ${km(s.km)})` : ` (${s.commune})`}`;
  // A site whose intercommunality did not answer has no state: said apart, never « à vérifier » as if it were old.
  const unread = (s: dech.Site) => !(s.par === "tco" ? live.tco : live.casud);
  const known = near.filter((s) => !unread(s));
  const lost = [...new Set(near.filter(unread).map((s) => (s.par === "tco" ? "du TCO" : "de la CASUD")))];
  let resume: string;
  if (!known.length) resume = `L'état des bennes ${lost.join(" et ")} n'est pas disponible pour le moment. Déchèteries ${res ? `les plus proches ${a(res.lieu.nom)}` : "en direct"} : ${near.map(where).join("\u00a0; ")}.`;
  else if (label) {
    const yes = known.filter((s) => s.a_jour && s.accepte.some((x) => labels.includes(x)));
    const full = known.filter((s) => s.a_jour && !s.accepte.some((x) => labels.includes(x)) && s.refuse.some((x) => labels.includes(x)));
    const old = known.filter((s) => !s.a_jour);
    resume = [
      yes.length ? `${label.charAt(0).toUpperCase()}${label.slice(1)} acceptés en ce moment : ${yes.map((s) => `${where(s)}, mis à jour à ${at(s)}`).join("\u00a0; ")}.` : `Aucune déchèterie proche ne dit accepter les ${label} en ce moment.`,
      full.length ? `Benne pleine : ${full.map(where).join("\u00a0; ")}.` : "",
      old.length ? `À vérifier sur place (mise à jour il y a plus de 6 h) : ${old.map(where).join("\u00a0; ")}.` : "",
    ].filter(Boolean).join(" ");
  } else {
    resume = known.slice(0, 3).map((s) => s.a_jour
      ? `${where(s)} : ${s.refuse.length ? `bennes pleines pour ${s.refuse.join(", ")}` : "toutes les bennes acceptent"}, mis à jour à ${at(s)}`
      : `${where(s)} : dernière mise à jour à ${at(s)}, à vérifier`).join("\u00a0; ") + ".";
  }
  if (known.length && lost.length) resume += ` État des bennes ${lost.join(" et ")} non disponible pour le moment.`;
  const par = new Set(near.map((s) => s.par));
  return text({
    ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
    resume,
    page: "https://rundata.re/decheteries",
    decheteries: near.map((s) => ({
      nom: s.nom,
      commune: s.commune,
      adresse: s.adresse || undefined,
      distance_km: s.km != null ? Math.round(s.km * 10) / 10 : undefined,
      horaires: s.horaires,
      mis_a_jour: s.mis_a_jour,
      etat: unread(s) ? "non disponible" : s.a_jour ? "à jour" : s.mis_a_jour ? `dernière mise à jour à ${s.mis_a_jour}, à vérifier sur place` : "pas de mise à jour",
      accepte: s.a_jour ? s.accepte : undefined,
      benne_pleine: s.a_jour ? s.refuse : undefined,
      page: s.lien,
    })),
    avertissements: [
      `État des bennes rempli par les agents sur place${par.has("tco") ? ", au TCO environ toutes les 2 heures" : ""}${par.has("casud") ? ", à la CASUD en général le matin" : ""} : une mise à jour de plus de 6 h est à vérifier sur place.`,
      ...(par.has("tco") ? ["Horaires des déchèteries du TCO sur leur page, qui les dit ouvertes 7 jours sur 7."] : []),
      ...(live.tco?.stale ? ["Copie de secours : le TCO n'a pas répondu."] : []),
      ...(live.casud?.stale ? ["Copie de secours : la CASUD n'a pas répondu."] : []),
      ONLY_LIVE,
    ],
    sources: credits([...(par.has("tco") ? [tco.SOURCE] : []), ...(par.has("casud") ? [casud.SOURCE] : [])]),
  });
}
