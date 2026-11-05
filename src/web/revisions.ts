/**
 * The revision of what each family of pages' copies holds (#272): the copy of `web:<family>` or
 * `web:<family>:<slug>` kept across a deploy only while its family's number stays the same (cache.ts, `outdated`).
 *
 * Raise a family's number in the PR that changes what its build puts in the copy: a field added, removed or computed
 * otherwise, a wording, a link or a source taken from the copy, a provider or tool its build calls that now answers
 * otherwise (a change of `src/tools/meteo.ts` can reach `lieu`, `commune` and `meteo`). Do not raise it for a change of
 * the page around the copy (web/pages.ts and the like, rendered at each view) nor for a change that leaves the copy the
 * same: the data centers then keep their copies across the deploy, instead of building them all again at once, which
 * the first views and the scheduled event pay for. A number forgotten shows the old copy until its next build, at its
 * usual rate (at most six hours, for the calendar).
 *
 * A family not listed here is built again after every deploy, as before this table: list a new family once its copy
 * is settled. A change that makes the new code unable to read an old copy raises `CACHE_FORMAT` instead (cache.ts).
 */
export const RENDU_REVISION: Readonly<Record<string, number>> = {
  actualites: 15,
  agenda: 30,
  air: 11,
  bornes: 4,
  bus: 8,
  calendrier: 4,
  chiffres: 22,
  commune: 18,
  // A La Créole notice with the hours and the streets it writes (« de 8h à 15h », « secteur suivant : »).
  coupures: 12,
  courant: 6,
  crues: 3,
  cyclones: 5,
  dae: 4,
  dechets: 2,
  eau: 3,
  electricite: 16,
  emploi: 7,
  enfants: 15,
  historique: 5,
  lieu: 20,
  "marches-publics": 5,
  mer: 5,
  meteo: 9,
  randonnees: 15,
  secheresse: 1,
  // Its copy keeps the fires' lines of sentiers_randonnee (tools/feux.ts `when`), now with their day.
  sentiers: 17,
  sport: 21,
  station: 2,
  // Its copy keeps the bus feeds' times (`temps_reel`, data.ts `feedTimes`), now with their day.
  trafic: 4,
  velos: 6,
  volcan: 13,
};

/** `web:lieu:le-port` → `lieu`. */
export const familyOf = (key: string) => key.slice("web:".length).split(":")[0];

/**
 * The revision of what a source's entry holds, as RENDU_REVISION for the pages' copies: an entry of `key` kept
 * across a deploy only while its number stays the same (cache.ts, `outdated`), so that a page built again after the
 * deploy is not built from what the old code read. Listed by key (`actualites:fil`) or by the first part of the keys
 * (`agenda` for every `agenda:<id>`).
 *
 * Raise a source's number, or list it at 1, in the PR that changes what its read keeps: a field, a link, a medium, a
 * filter. Raise the families of pages built from it too (RENDU_REVISION). A source not listed keeps its entry across
 * every deploy, as before this table. An entry out of date is still served when the source does not answer: the old
 * copy, dated, is worth more than nothing.
 */
export const SOURCE_REVISION: Readonly<Record<string, number>> = {
  // With the time the prefecture's list was last asked (prefectureLue), which it is every 15 minutes only.
  // With the time the prefecture's list shown was read (prefectureReussie), kept while its site does not answer.
  // The island's news only: France's and the world's left out (`local`).
  "actualites:fil": 5,
  // Every agenda's first sentence whole or none, never cut with « … » (lead()): the agendas without a key of their own
  // (CIREST, the halls' agenda:<hall> included), and the seven below raised with it.
  agenda: 1,
  // Read again with its written agreement of 28/10/2026, without the price and the sentence an older entry kept.
  "agenda:bras_panon": 2,
  // The WordPress agendas, with their venue's position when the site gives one (« Y aller » of /evenements).
  // The volley league's weekend with its matches (`matchs`), for the sport tool to say another date.
  "agenda:lrvb": 3,
  "agenda:saint_paul": 2,
  "agenda:le_port": 2,
  "agenda:trois_bassins": 2,
  "agenda:sainte_marie": 2,
  // A show without a venue in its field placed where its text says (lieuDit, « Bouches Cousues »).
  "agenda:sechoir": 3,
  // Two sessions of a show at two venues kept as two events (KiLLT).
  "agenda:luc_donat": 2,
  // With the time Atmo Réunion diffused the index (date_dif, `diffuse_le`), which an older entry lacks.
  atmo: 1,
  // A notice that awaits the return to normal keeps « ne pas boire » (#723), and a sector followed by the advice without
  // a blank line is kept (« TRAITEMENT ST FRANCOIS »). A commune written without its article (« commune de
  // Trois-Bassins »), and a list of streets ended by « Communiqué … » or by « Des perturbations » run on its last line.
  // A La Créole notice with its day and two hours, and its list of streets ended by « La régie La Créole remercie… ».
  "avis-eau:flux": 3,
  // The date and the cause of a notice parted by « · » (avis(), Sentier Bayonne).
  "onf:sentiers": 1,
  // The trace of one trail (onf:trace:<slug>), its notice parted by « · » too (parseTrace, Sentier Bayonne).
  onf: 1,
};

/** The revision of the source whose entry is kept under `key`: its own, else its first part's; for a bundle's entry, its entry's. */
export const sourceRevision = (key: string): number | undefined => {
  // An entry of a bundle (cache.ts `bundle`) is kept under « bundle|entry »: the entry's own key says its revision
  // (« agendas|agenda:trois_bassins » is agenda:trois_bassins'), which « agendas|agenda » never matched (05/11/2026).
  const own = key.slice(key.lastIndexOf("|") + 1);
  return SOURCE_REVISION[own] ?? SOURCE_REVISION[own.split(":")[0]];
};
