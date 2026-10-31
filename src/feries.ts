/**
 * The public holidays of La Réunion, computed: those of France, and the 20th of December. Nothing is read: the
 * calendar's source (providers/calendrier.ts) says them in the tool calendrier; the agenda's weekends
 * (web/evenements.ts) and the fishing rules (tools/peche.ts) need them for any year, without a request.
 */
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** The public holidays of a year in La Réunion: those of France, and the 20th of December. */
export function holidays(year: number): Map<string, string> {
  // Easter Sunday (anonymous Gregorian algorithm).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((8 * b + 13) / 25)) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const easter = `${year}-${String(month).padStart(2, "0")}-${String(((h + l - 7 * m + 114) % 31) + 1).padStart(2, "0")}`;
  return new Map([
    [`${year}-01-01`, "jour de l'an"], [addDays(easter, 1), "lundi de Pâques"], [`${year}-05-01`, "fête du Travail"], [`${year}-05-08`, "8 mai"],
    [addDays(easter, 39), "Ascension"], [addDays(easter, 50), "lundi de Pentecôte"], [`${year}-07-14`, "14 juillet"], [`${year}-08-15`, "Assomption"],
    [`${year}-11-01`, "Toussaint"], [`${year}-11-11`, "11 novembre"], [`${year}-12-20`, "Fèt Kaf"], [`${year}-12-25`, "Noël"],
  ]);
}
