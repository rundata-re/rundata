import { distanceKm } from "../geo.js";
import { resolvePlace } from "../places/resolve.js";
import { BUILT, DAES, type Dae, SOURCE } from "../providers/dae.js";
import { credits, notFound, placeBlock, text } from "./format.js";

const NEAR_KM = 2;
const SHOWN = 5;
// Walking in town: about 80 m a minute, the streets a third longer than the straight line.
const walk = (km: number) => Math.max(1, Math.round((km * 1000 * 1.3) / 80));

/** Said after the emergency call, in the tool and on /defibrillateurs. */
export const SANS_FORMATION = "Il s'utilise sans formation : il guide par la voix et ne délivre un choc que si c'est nécessaire.";

export const URGENCE =
  "Arrêt cardiaque : appeler le 15 (SAMU) ou le 112, commencer tout de suite le massage cardiaque et envoyer quelqu'un chercher le défibrillateur. " +
  SANS_FORMATION;

/**
 * Outside is not « at any hour » by itself: Géo'DAE says so only with its hours « 24/7 ». An outside device without
 * them may be at the reception of a site that closes (Hibiscus, La Saline-les-Bains, 04/11/2026).
 */
export function access(d: Dae): string {
  const allDay = d.horaires === "24 h/24, 7 j/7";
  if (d.exterieur) return allDay ? "à l'extérieur, accessible à toute heure" : d.horaires ? `à l'extérieur, ${d.horaires}` : "à l'extérieur, horaires d'accès non déclarés";
  if (allDay) return "accessible 24 h/24";
  return d.acces_libre ? "en accès libre aux heures d'ouverture du lieu" : "accès réservé (demander à l'accueil ou au personnel)";
}

export function daeRow(d: Dae, from?: { lon: number; lat: number }) {
  const km = from ? distanceKm(from.lon, from.lat, d.lon, d.lat) : undefined;
  return {
    lieu: d.nom,
    adresse: [d.adresse, d.commune].filter(Boolean).join(", "),
    distance_m: km !== undefined ? Math.round(km * 1000 / 10) * 10 : undefined,
    a_pied_min: km !== undefined ? walk(km) : undefined,
    acces: access(d),
    emplacement: d.emplacement,
    etage: d.etage,
    horaires: d.horaires,
    carte: `https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=19/${d.lat}/${d.lon}`,
  };
}

/** Reachable at any hour: declared open day and night, outside or not. */
export const anyHour = (d: Dae) => d.horaires === "24 h/24, 7 j/7";

/** At any hour first, then free access or outside: what can be reached now. */
const reach = (d: Dae) => (anyHour(d) ? 0 : d.acces_libre || d.exterieur ? 1 : 2);

export function byCommune() {
  const by = new Map<string, Dae[]>();
  for (const d of DAES) by.set(d.commune, [...(by.get(d.commune) ?? []), d]);
  return [...by.entries()].sort((x, y) => y[1].length - x[1].length).map(([commune, list]) => ({ commune, list: list.sort((x, y) => reach(x) - reach(y) || x.nom.localeCompare(y.nom, "fr")) }));
}

export function defibrillateurs(lieu: string | undefined) {
  // The day the list was rebuilt from the national file, the date of what is said (tools/fraicheur.ts).
  const common = { urgence: URGENCE, mis_a_jour: BUILT.split("-").reverse().join("/"), sources: credits([SOURCE]) };
  if (!lieu?.trim()) {
    const communes = byCommune();
    return text({
      resume: `${DAES.length} défibrillateurs déclarés en service à La Réunion, dans les 24 communes\u00a0; préciser un lieu pour les plus proches.`,
      communes: communes.map((c) => ({ commune: c.commune, defibrillateurs: c.list.length, accessibles_a_toute_heure: c.list.filter((d) => reach(d) === 0).length })),
      ...common,
    });
  }
  const res = resolvePlace(lieu);
  if (!res) return notFound(lieu);
  const from = { lon: res.lieu.lon, lat: res.lieu.lat };
  const sorted = DAES.map((d) => ({ d, km: distanceKm(from.lon, from.lat, d.lon, d.lat) })).sort((x, y) => x.km - y.km);
  const near = sorted.filter((x) => x.km <= NEAR_KM);
  const picked = (near.length ? near : sorted.slice(0, 3)).slice(0, SHOWN);
  const first = picked[0];
  const anyHour = near.find((x) => reach(x.d) === 0);
  return text({
    lieu: placeBlock(lieu, res),
    resume: `${URGENCE.split(" : ")[0]} : appeler le 15 ou le 112. Défibrillateur le plus proche (${res.lieu.nom}) : ` +
      `${first.d.nom}${first.d.adresse ? `, ${first.d.adresse}` : ""} (${first.d.commune}), à ${Math.round(first.km * 1000 / 10) * 10} m, environ ${walk(first.km)} min à pied, ${access(first.d)}.` +
      (anyHour && anyHour !== first ? ` Accessible à toute heure : ${anyHour.d.nom}, à ${Math.round(anyHour.km * 1000 / 10) * 10} m.` : "") +
      (near.length ? "" : ` Aucun à moins de ${NEAR_KM} km.`),
    defibrillateurs: picked.map((x) => daeRow(x.d, from)),
    a_savoir: "Liste déclarée par les exploitants dans la base nationale : un appareil peut avoir été déplacé, ou être dans un lieu fermé à cette heure.",
    ...common,
  });
}
