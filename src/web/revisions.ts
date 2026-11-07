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
  // Témoignages read again, with its newsroom's written agreement of 06/11/2026: named in the sources and the coverage.
  // A rubric in capitals at the head of a first sentence left out (« LIBRE EXPRESSION Sous le bruit… »).
  actualites: 17,
  // La veille demandée aux agendas WordPress : un spectacle de ce soir revient (#795).
  // L'agenda de L'Étang-Salé repris avec l'accord écrit de la mairie du 06/11/2026.
  // Le week-end du connecteur compté comme sa page (vendredi dès 17:00, lundi férié), ce qui y commence d'abord.
  // Les événements de Saint-Paul lus dans son export iCal tant que l'API de son site répond 404 (depuis le 06/11/2026).
  agenda: 37,
  air: 12,
  bornes: 5,
  // Stop names, directions and lines' long names written all in capitals, or with a capital on every word, by their
  // network, as people read them (« Gare Saint-André », « Rue des Amphiboles »); an article between two hyphens stays
  // small (« St Gilles-les-Hauts »), and starts a part of the name after « - » or « <> » (« Les Jacarandas - La Plaine »).
  // Two quoted stop names of a network alert joined by a bare comma spaced (« "Bourg du 23ème", "Gare…" »).
  bus: 14,
  // The Moon between its main phases said once in the summary: « Lune décroissante », not « Lune : Lune décroissante ».
  calendrier: 5,
  chiffres: 23,
  // The commune's stops, named as on /bus (« Gare Saint-André », « St Gilles-les-Hauts », « Lastic-La Mare »).
  // Its bus alerts with two quoted stop names joined by a bare comma spaced, as on /bus.
  commune: 24,
  // A La Créole notice with the hours and the streets it writes (« de 8h à 15h », « secteur suivant : »).
  coupures: 13,
  courant: 8,
  crues: 3,
  cyclones: 11,
  // A device's name written all in capitals in the base, as people read it (« FEAR - Saint-Paul »), an article starting a
  // part of it after « - » (« Station Service - Les Sables »), each part in capitals of a name with lowercase letters
  // (« Lycée Polyvalent Paul Moreau - Loge »). Its floor as people read it, without « étage » before a text that says it
  // (« 1er étage », « rez-de-chaussée - Bât B »).
  // Its places' names as French writes them (noms.ts): « Collège des 2 Canons », « Église de La Ravine Sèche ».
  dae: 9,
  dechets: 2,
  eau: 3,
  // EDF's line older than an hour said first (perimee, avertissement), its day when not today's, never « en ce moment ».
  electricite: 19,
  // A title written all in capitals in the case of a sentence, its employer named (« Commune du Tampon »).
  emploi: 9,
  enfants: 15,
  historique: 5,
  // A place said with its article (« Mesures les plus proches du Maïdo », « PRÉVISION … pour le Piton de la Fournaise »).
  lieu: 21,
  "marches-publics": 5,
  mer: 5,
  meteo: 9,
  randonnees: 15,
  secheresse: 1,
  // Its copy keeps the fires' lines of sentiers_randonnee (tools/feux.ts `when`), now with their day.
  // Its copy keeps the trail pages' previews, which drop a weekend notice past its last day (web/domains.ts stateHead).
  // Its copies keep the notices' words (providers/sentiers.ts nuance): past its last day, a weekend notice is quoted, without « ouvert ».
  // Its copies keep a closed trail's state (web/data.ts closedState): « En partie fermé : … » first, « Fermé » said once.
  sentiers: 22,
  // Its copy dates the volley league's tournaments by the days of their title, else « (dates données par la Ligue) ».
  // A volley match's sets written as its score, « 26-28 ».
  sport: 28,
  station: 2,
  // Its copy keeps the bus feeds' times (`temps_reel`, data.ts `feedTimes`), now with their day.
  // Its bus alerts with two quoted stop names joined by a bare comma spaced, as on /bus.
  trafic: 5,
  velos: 7,
  volcan: 14,
};

/**
 * The oldest revision of a family whose copy its code can still read (cache.ts, `unreadable`). A copy of another
 * revision is served until its build is done (`outdated`), and while that build fails or is too slow for the view: the
 * code that reads it must then accept the shape an older build gave it. A copy stamped below its family's floor has a
 * shape the code no longer reads: it is never served, and the page is built as if it had none. Set the floor in the PR
 * that makes the code unable to read the copies of before, rather than CACHE_FORMAT, which builds every family again.
 */
export const RENDU_LISIBLE: Readonly<Record<string, number>> = {
  // Each trail with all its communes (`communes`, #786): read by the communes' tiles and feeds, whose copies of
  // revision 14 broke five commune pages and feeds after that deploy (05/11/2026).
  randonnees: 15,
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
  // Témoignages read again, with its newsroom's written agreement of 06/11/2026.
  // A rubric in capitals at the head of a first sentence left out (sansRubrique).
  "actualites:fil": 7,
  // Every agenda's first sentence whole or none, never cut with « … » (lead()): the agendas without a key of their own
  // (CIREST, the halls' agenda:<hall> included), and the seven below raised with it.
  agenda: 1,
  // Read again with its written agreement of 28/10/2026, without the price and the sentence an older entry kept.
  "agenda:bras_panon": 2,
  // Read again with its written agreement of 06/11/2026, from its list: an older entry, read from its feed, is not served.
  "agenda:etang_sale": 2,
  // The WordPress agendas, with their venue's position when the site gives one (« Y aller » of /evenements).
  // The volley league's weekend with its matches (`matchs`), for the sport tool to say another date.
  // The events not yet over (tribeUrl, `ends_after`): one begun before today kept, as the league's weekend of 04-07/11.
  // `ends_after` the day before (the API ignores the time): one ending later today kept too.
  "agenda:lrvb": 5,
  "agenda:saint_paul": 4,
  "agenda:le_port": 4,
  "agenda:trois_bassins": 4,
  "agenda:sainte_marie": 4,
  // A show without a venue in its field placed where its text says (lieuDit, « Bouches Cousues »); the events not yet
  // over, as the WordPress agendas above, a show of tonight included (« Bouches Cousues » of 05/11 20:00).
  "agenda:sechoir": 5,
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
