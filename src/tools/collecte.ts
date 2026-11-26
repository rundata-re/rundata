/**
 * The day a street's bins are collected in the West and the East (vie/collecte.ts), answered by annuaire_services_publics when the
 * question is about the collection rather than a déchèterie. The street comes from `lieu` (« 12 rue des Lilas,
 * Saint-Paul »): its words besides the commune and the number. Never a day the calendar does not give.
 */
import { normalize, resolvePlace } from "../places/resolve.js";
import * as col from "../vie/collecte.js";
import { credits, jourDuFichier, text } from "./format.js";
const { communeSlug, honesty, NOT_FOUND } = col;

/** Whether `quoi` asks when the bins are collected. */
// Not the school bus (« ramassage scolaire ») nor a centre de tri, a déchèterie's (23/11/2026).
export const COLLECTION = /collecte|poubelle|ordures?\b|ramassage(?! scolaire)|\bbacs?\b|(?<!centres? de )\btri\b|camion/i;

const page = (commune?: string) => `https://rundata.re/collecte${commune ? `/${communeSlug(commune)}` : ""}`;
// The validated line for a commune, without a street.
const communeLine = (commune: string) => `Collecte des déchets : le jour de votre rue sur rundata.re/collecte/${communeSlug(commune)}.`;

/** The commune of the West or the East `lieu` names, and the street it gives besides (number and commune left out). */
export function parseLieu(lieu: string): { commune?: string; rue: string } {
  const flat = normalize(lieu);
  const commune = col.COMMUNES.find((c) => flat.includes(normalize(c)) || flat.includes(normalize(c.replace(/^Les /, ""))));
  let rue = flat;
  if (commune) rue = rue.replace(normalize(commune), " ").replace(normalize(commune.replace(/^Les /, "")), " ");
  rue = rue.replace(/\b974\d\d\b/g, " ").replace(/^\s*\d+\s*(bis|ter)?\b/, " ").replace(/\s+/g, " ").trim();
  return { commune, rue };
}

/** The commune whose calendars are not read (outside the TCO, the CIREST and the CINOR, or Sainte-Rose) `lieu` names (« 12 rue de Paris, Saint-Denis », « Le Chaudron »), and who collects there. */
export function elsewhere(lieu: string): { commune: string; epci: (typeof col.AILLEURS)[number] } | undefined {
  // The commune last, as an address ends (a postcode after it), not « rue de Saint-Denis » in a street of the West.
  const flat = ` ${normalize(lieu).replace(/\b974\d\d\b/g, " ").replace(/\s+/g, " ").trim()}`;
  const all = col.AILLEURS.flatMap((e) => e.communes.map((commune) => ({ commune, epci: e })));
  const named = all.find((x) => flat.endsWith(` ${normalize(x.commune)}`));
  if (named) return named;
  // Or a place of it named exactly (« Le Chaudron »); never a street guessed from part of its name.
  const r = resolvePlace(lieu);
  return r?.correspondance === "exacte" ? all.find((x) => x.commune === r.lieu.commune) : undefined;
}

export function collecteAnswer(lieu: string | undefined, now = new Date()) {
  const today = col.todayOf(now);
  const { commune, rue } = parseLieu(lieu ?? "");
  const base = { a_savoir: honesty(), mis_a_jour: jourDuFichier(col.UPDATED), sources: credits(col.EPCIS.map((e) => e.source)) };
  // A commune of another intercommunality: said before any street is looked for (04/11/2026, « rue non trouvée » at Saint-Denis).
  const other = !commune && lieu?.trim() ? elsewhere(lieu) : undefined;
  if (other) {
    // Nothing of the TCO's, the CIREST's nor the CINOR's in it: credited to nobody, the intercommunality named with its site (citer « rundata.re »).
    return text({ resume: col.ailleurs(other.commune, other.epci), intercommunalite: { nom: other.epci.nom.replace(/^la /, ""), site: other.epci.site }, page: page(), ...base, sources: [] });
  }
  if (rue.length < 3) {
    return text({
      resume: commune ? communeLine(commune) : `Le jour de collecte se donne rue par rue : précisez la rue et la commune (Saint-Paul, La Possession, Saint-Leu, Le Port, Trois-Bassins, Saint-André, Bras-Panon, Saint-Benoît, Salazie, La Plaine-des-Palmistes, Saint-Denis, Sainte-Marie ou Sainte-Suzanne). ${honesty()}`,
      page: page(commune),
      ...base,
    });
  }
  if (col.pastYear(today)) return text({ resume: col.notYet(col.epciDe(commune)), page: page(commune), ...base });
  const found = col.findStreets(rue, commune).slice(0, 5);
  if (!found.length) return text({ resume: NOT_FOUND, page: page(commune), ...base });
  const rows = found.map((s) => {
    const cal = col.CALENDARS[s.calendrier];
    const e = col.epciOf(s);
    return {
      rue: col.streetName(s),
      commune: s.commune,
      texte: col.streetLine(s, today),
      jours_feries: cal ? col.holidays(cal, today).map((h) => col.holidayLine(h, e)) : [],
      calendrier_pdf: cal?.pdf,
      contact: cal ? undefined : e.contact,
    };
  });
  // The sources of the streets answered, the TCO's, the CIREST's or the CINOR's.
  const from = col.EPCIS.filter((e) => found.some((s) => s.epci === e.id));
  return text({
    resume: [rows[0].texte, ...rows[0].jours_feries].join(" ") + (rows.length > 1 ? ` Autres rues au nom proche : ${rows.slice(1).map((r) => `${r.rue} (${r.commune})`).join(", ")}.` : ""),
    rues: rows,
    page: page(rows[0].commune),
    ...base,
    // The date of the first street's calendars, the one the summary gives.
    mis_a_jour: jourDuFichier(col.epciOf(found[0]).date),
    sources: credits(from.map((e) => e.source)),
  });
}
