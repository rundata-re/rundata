import { ageMinutes, ageText, compass, localTime, versant } from "../geo.js";
import { normalize, offIsland, type Resolution } from "../places/resolve.js";
import { withMentions } from "../mentions.js";

import { a as aCommune } from "../articles.js";
export { a, de } from "../articles.js";
import type { Reading, SourceInfo } from "../types.js";

/**
 * A time of day, in minutes since midnight, as every answer writes it: « 19:12 » with its minutes, « 18\u00a0h » on the
 * hour (« 24\u00a0h » for the end of a day). Never « 18h », nor « 19 h 12 ».
 */
export function heure(minutes: number): string {
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return m ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : `${h}\u00a0h`;
}

/**
 * Two times said together (a span, « entre … et … »): « 18\u00a0h » and « 21\u00a0h », or both « 12:00 », « 12:54 » when
 * one has minutes, or when `minutes` says another time of the same place has some (minutees()).
 */
export function paire(de: number, a: number, minutes = de % 60 !== 0 || a % 60 !== 0): [string, string] {
  if (!minutes) return [heure(de), heure(a)];
  const hm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  return [hm(de), hm(a)];
}

/** A span: « 18\u00a0h–21\u00a0h », « 08:30–12:00 ». */
export const tranche = (de: number, a: number, minutes?: boolean) => paire(de, a, minutes).join("–");

/**
 * Whether the hours of one place are all written with their minutes (kit.md): as soon as one of its times has some,
 * « 06:00 à 18:30 ; le dimanche de 06:00 à 12:00 », never « de 6\u00a0h à 12\u00a0h » beside it.
 */
export const minutees = (spans: [number, number][]) => spans.some(([de, a]) => de % 60 !== 0 || a % 60 !== 0);

/** One reading as a short string a model can quote: "24 °C", "ESE (112°)", "65 % (calculée)". */
/** A number written the French way: 24,6. */
export function fr(n: number): string {
  return String(n).replace(".", ",");
}

/**
 * A quantity with its thousands, as toLocaleString("fr-FR") writes them: « 3\u202f210 », from 4 digits, a narrow
 * no-break space that never cuts the number at a line's end (marketing's kit, « Nombres »). Never for a year, a
 * postcode, an INSEE code, a parcel, a bus line or a phone number; a JSON number stays a number.
 */
export function nombre(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 20 }).replace(/\s/g, "\u202f");
}

/** « Saint-Denis, Saint-Paul et Salazie ». */
export function enumeration(xs: string[]): string {
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} et ${xs.at(-1)}` : xs.join("");
}

/**
 * The commune to say beside a station: its own, when it is not `commune` (the one the answer or the page is about) and
 * the station's name does not say it already (« Saint-Leu - CIRAD », « Bellevue Bras-Panon »). Undefined otherwise, and
 * for a copy of before that does not hold it.
 */
export function communeDite(s: { station: string; commune?: string }, commune: string): string | undefined {
  if (!s.commune || s.commune === commune) return undefined;
  return ` ${normalize(s.station)} `.includes(` ${normalize(s.commune).replace(/^(?:le|la|les|l) /, "")} `) ? undefined : s.commune;
}

/**
 * Where a station of another commune than `commune` stands and how far, to put after its name: « à Grand-Coude, à
 * 9 km », or « , à 8,5 km » for « Bellevue Bras-Panon », whose name says it (Salazie, whose nearest station with a
 * temperature is Bellevue, 480 m up on the windward side). Empty for a station of the commune itself.
 */
export function ailleurs(s: { station: string; commune?: string; distance_km?: number | null }, commune: string): string {
  if (!s.commune || s.commune === commune) return "";
  const dite = communeDite(s, commune);
  return `${dite ? ` ${aCommune(dite)}` : ""}${s.distance_km != null ? `, à ${fr(s.distance_km)} km` : ""}`;
}

/**
 * What makes a station speak less well for the place, in a few words, from its warnings (tools/representativeness.ts,
 * fit): « 249 m plus haut », « autre versant\u00a0: est ». The pages say it where they name the station, as the tools do in
 * full. Nothing for a station of relevance « bonne ».
 */
export function ecartsCourts(s: { avertissements?: string[]; pertinence?: string }): string[] {
  if (!s.pertinence || s.pertinence === "bonne") return [];
  return (s.avertissements ?? []).flatMap((w) => {
    const alt = /^La station est (\d+) m (plus haut|plus bas) que /.exec(w);
    if (alt) return [`${nombre(Number(alt[1]))} m ${alt[2]}`];
    const side = /^La station est sur le versant (\S+)/.exec(w);
    if (side) return [`autre versant\u00a0: ${side[1] === "centre" ? "cirques et plaines" : side[1]}`];
    return [];
  });
}

export function show(r: Reading): string {
  if (r.variable === "vent_direction" && typeof r.valeur === "number") return `${compass(r.valeur)} (${r.valeur}°)`;
  const v = typeof r.valeur === "number" ? fr(r.valeur) : r.valeur;
  const unit = r.unite ? ` ${r.unite}` : "";
  return `${v}${unit}${r.nature === "derive" ? " (calculée)" : ""}`;
}

export function when(time: Date, now: Date) {
  const age = ageMinutes(time, now);
  // Models otherwise tend to read a bare "09:00" as UTC.
  return { heure_mesure: localTime(time), fuseau: "heure de La Réunion (UTC+4)", age_min: age, age_texte: ageText(age) };
}

/**
 * A place found on part of its name only, or on a name close to the one asked: said first in the answer, so that
 * « Bellecombe » read as the Rempart de Bellecombe is not taken for the place meant. Undefined for a name found whole.
 */
export function placeWarning(asked: string, r: Resolution): string | undefined {
  if ((r.correspondance !== "partielle" || r.ignores) && r.correspondance !== "approchee") return undefined;
  const p = r.lieu;
  if (r.tient_lieu) return `«\u00a0${asked.trim()}\u00a0» compris comme ${p.nom} (${p.type}, ${p.commune}), un lieu de ce secteur, pas tout le secteur\u00a0: le dire à l'utilisateur.`;
  return `«\u00a0${asked.trim()}\u00a0» compris comme ${p.nom} (${p.type}, ${p.commune}), dont le nom ne correspond ${r.correspondance === "approchee" ? "qu'à peu près" : "qu'en partie"}\u00a0: le dire à l'utilisateur.`;
}

export function placeBlock(asked: string, r: Resolution) {
  const p = r.lieu;
  return {
    avertissement: placeWarning(asked, r),
    demande: asked,
    trouve: p.nom,
    type: p.type,
    commune: p.commune || undefined,
    altitude_m: p.altitude_m ?? undefined,
    versant: versant(p.lon, p.lat),
    correspondance: r.correspondance,
    // A road is long: the answer is for one point of it, said so, not for the whole of it.
    route: p.type === "route" ? `Une route\u00a0: la réponse vaut pour un point de son tracé, ${aCommune(p.commune)}, pas pour toute sa longueur.` : undefined,
    autres_possibilites: r.autres.length ? r.autres.map((a) => `${a.nom} (${a.type}, ${a.commune})`) : undefined,
    // Said, so that a place not known is not taken for the commune named beside it.
    mots_ignores: r.ignores ? `«\u00a0${r.ignores.join(" ")}\u00a0» laissé de côté\u00a0: la réponse vaut pour ${p.nom}.` : undefined,
  };
}

// Every source credited so far, by name: what the citation of an answer is made from (citer.ts).
const CREDITED = new Map<string, SourceInfo>();

export const credited = (nom: string) => CREDITED.get(nom);

export function credits(sources: SourceInfo[]) {
  for (const s of sources) CREDITED.set(s.nom, s);
  return sources.map((s) => ({ source: s.nom, licence: s.licence, attribution: s.attribution }));
}

/** A tool's answer, each link to a site that asks for it with its mention beside it (mentions.ts). */
export function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: withMentions(payload) }] };
}

export function notFound(asked: string) {
  return {
    ...text({
      // « Paris », « Maurice »: not to be read as a place of the island that was not found.
      erreur: offIsland(asked) ? `«\u00a0${asked.trim()}\u00a0» n'est pas à La Réunion\u00a0: ces données ne couvrent que La Réunion.` : `Lieu introuvable à La Réunion : « ${asked} ».`,
      conseil:
        "Donner une commune (Saint-Paul, Cilaos…), une plage (Boucan Canot, l'Hermitage…), un quartier, un sommet, " +
        "ou des coordonnées « latitude, longitude » (ex. « -21.05, 55.22 »).",
    }),
    isError: true,
  };
}
