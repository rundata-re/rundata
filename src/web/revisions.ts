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
  // The prefecture's RAA list moved (« …/Recueil-des-actes-administratifs », without « -RAA ») on 14/11/2026: its links.
  // « Mobilisation » for a strike or a blockade only, not money or firms set to work (« mobilisation financière »).
  // « Route » not for « un accident vasculaire » nor a day « sans accident »; « grévistes » a mobilisation.
  // The other subjects narrowed: « vigilance » with its colour, not « une pluie de médailles », « une éruption de joie »,
  // fireworks, flights, « conseil » alone, nor « annulé » or « reporté » alone for culture; « AVC » is health.
  // « Enquête publique » and « tribunal administratif » no crimes.
  // A headline « Saint-Denis : … » goes to the communes it names; « Bois de Nèfles » to the commune the text names.
  // « Mobilisation » no party, no football play-offs, and in the headline only unless the lead says a strike (22/11/2026).
  // A medium not read said « rundata.re ne sait pas ce qu'ils annoncent », never « nous » (23/11/2026).
  // Freedom's link at its own address, https://freedom.fr/, with the feed's revision 11 (24/11/2026).
  actualites: 26,
  // La veille demandée aux agendas WordPress : un spectacle de ce soir revient (#795).
  // L'agenda de L'Étang-Salé repris avec l'accord écrit de la mairie du 06/11/2026.
  // Le week-end du connecteur compté comme sa page (vendredi dès 17:00, lundi férié), ce qui y commence d'abord.
  // Les événements de Saint-Paul lus dans son export iCal tant que l'API de son site répond 404 (depuis le 06/11/2026).
  // L'agenda de Saint-André repris avec l'accord écrit de la commune du 16/11/2026.
  // Le Tampon, Saint-Denis et Saint-Pierre lus comme information publique de la commune (20/11/2026) : leurs événements,
  // leur couverture, et plus de mention « non repris » pour elles.
  // La Possession, Petite-Île, Saint-Benoît et Sainte-Rose lues comme information publique de la commune (20/11/2026) :
  // leurs événements, leur couverture, et plus de mention « non repris » pour elles.
  // Cilaos, Saint-Joseph and Saint-Philippe read as the commune's public information (20/11/2026): their events, the
  // coverage, and nothing said instead of a commune any more.
  // Chaque événement porte la clé de sa page (/evenements/<titre>-<clé>), et le titre des listes y mène.
  // Un billet de mairie dont l'extrait est coupé avant sa date : la date lue dans son texte entier (Saint-André, 21/11/2026).
  // Un appel à exposants donné par le nom de sa sortie, « annoncé par … dans un appel à exposants » (21/11/2026).
  // Ce nom avec ses majuscules quand le titre est tout en capitales (« Marché de Noël au Colosse », 21/11/2026).
  // The agendas not read « sans réponse à la dernière lecture de rundata.re »; the linked associations' licence names rundata.re (23/11/2026).
  // Each commune's own sites read, at their oldest read, for its tile when they announce nothing (23/11/2026).
  // A copy older than its keeping, with a read that failed after it, said « dernière lecture sans succès » at that try,
  // so that the commune's site is said without answer on its day and its tile (24/11/2026).
  // Its coverage says the mairies whose sites were all read and announce nothing to come, dated (24/11/2026).
  // Tales, magic and puppets each their own genre, no longer « cirque » (« Contes avec Aïdée », 24/11/2026).
  agenda: 50,
  // The sensors of sensors.social besides Sensor.Community's: each value with its network, and its credit (09/11/2026).
  // Tomorrow's index by commune, when Atmo Réunion diffused it, under the day's (21/11/2026).
  // The communes at the worst « pour Le Port et Saint-Pierre », counted beyond 3; tomorrow « Pas une mesure : … » (21/11/2026).
  // Atmo Réunion's site without « www. », which answers by a redirection (24/11/2026).
  // A sensor's commune, from its outline, no longer the nearest place's (24/11/2026).
  air: 17,
  bornes: 5,
  // Stop names, directions and lines' long names written all in capitals, or with a capital on every word, by their
  // network, as people read them (« Gare Saint-André », « Rue des Amphiboles »); an article between two hyphens stays
  // small (« St Gilles-les-Hauts »), and starts a part of the name after « - » or « <> » (« Les Jacarandas - La Plaine »).
  // Two quoted stop names of a network alert joined by a bare comma spaced (« "Bourg du 23ème", "Gare…" »).
  // A departure of today's service links its trip without « ?jour= » (robots.txt forbids the trips: one address a trip).
  // Every departure links its trip without « ?jour= », tomorrow's and yesterday's after midnight too (19/11/2026).
  bus: 16,
  // The Moon between its main phases said once in the summary: « Lune décroissante », not « Lune : Lune décroissante ».
  // Every public holiday named as people say it (« Jour de l'an », « Armistice de 1918 »), the 20 December « Fête de
  // l'abolition de l'esclavage » (24/11/2026).
  calendrier: 6,
  // sensors.social among the air's sources, under ODbL (09/11/2026).
  // MétéoR Océan Indien among the weather's sources, under CC BY-NC (09/11/2026).
  // The news of Saint-Denis and Saint-Pierre, and Le Tampon's agenda, among the sources counted (20/11/2026).
  // The agendas of La Possession, Petite-Île and Saint-Benoît among the sources counted (20/11/2026).
  // The news of Cilaos, Saint-Joseph and Saint-Philippe among the sources counted (20/11/2026).
  // The linked associations' licence names rundata.re, never « nos données ouvertes » (23/11/2026).
  // Atmo Réunion's site without « www. », which answers by a redirection (24/11/2026).
  // The UV index measured at Moufia among the weather's sources: SolarDB and NASA's ozone (24/11/2026).
  chiffres: 31,
  // The commune's stops, named as on /bus (« Gare Saint-André », « St Gilles-les-Hauts », « Lastic-La Mare »).
  // Its bus alerts with two quoted stop names joined by a bare comma spaced, as on /bus.
  // The stations of MétéoR Océan Indien besides the others, each with its credit (09/11/2026).
  // The amateur stations (MétéoR-OI) apart: never the station named first, marked in the answer (10/11/2026).
  // Its bus departures of today's service link their trip without « ?jour= », as on /bus.
  // All its bus departures link their trip without « ?jour= », as on /bus (19/11/2026).
  // Each station's kind in words, official or amateur, in the answer (`nature`) and its summary (20/11/2026).
  // Its bus stops with their page (/bus/arret/…), which the Bus block links (22/11/2026).
  // A mairie's site not read said « rundata.re ne sait pas ce qu'il annonce », never « nous » (23/11/2026).
  // Its water card says where a distributor not read publishes its notices, never « not read » (23/11/2026).
  // The commune of a station, a sensor or a trail given by a point, from its outline (24/11/2026).
  commune: 33,
  // A La Créole notice with the hours and the streets it writes (« de 8h à 15h », « secteur suivant : »).
  // A commune whose water the ARS shares between distributors read when one of them is (L'Étang-Salé, runéo's notices).
  // What to know after a cut in the words of the ARS La Réunion's leaflet, with its link (14/11/2026).
  // Sudéau's site linked on the pages of the communes whose water it distributes (14/11/2026).
  // Each commune's latest notices, past ones too, for its page (`derniers_avis`, 14/11/2026).
  // The notices of Saint-Philippe, Cilaos, Petite-Île and Les Trois-Bassins, read on the communes' sites (20/11/2026).
  // Sainte-Suzanne's orders allowing runéo's works, a block of their own (`arretes_sainte_suzanne`, 20/11/2026).
  // The sectors of the CIREST's notices on the quality of the water, « et les voies adjacentes » kept, said in
  // `secteurs_dits` (20/11/2026).
  // « Pas d'avis de coupure récent ou à venir sur les sites lus », never « aucun avis », in the summary (22/11/2026).
  // A feed not read said « rundata.re ne sait pas ce qu'il annonce », never « nous » (23/11/2026).
  // A notice's place on its card (`lieu`); a silent feed said with what its last read held for the commune (24/11/2026).
  // With the hour the notices were read (avis_lus_le), said by the commune's page instead of the copy's (24/11/2026).
  // Le Tampon's notices, Sudéau's read on the town's site (24/11/2026).
  coupures: 25,
  // Saint-André's notices read again, with its written agreement of 16/11/2026.
  // The notices of Cilaos, Saint-Philippe and Sainte-Suzanne read as the communes' public information (20/11/2026).
  // A notice written in the bold letters of Unicode read (Saint-André's of 19/11/2026, typographie.ts `unstyled`).
  // Each range of hours of a day its own cut, the streets after a house number read (« 650 chemin Balance », 21/11/2026).
  // A place a house number starts read, « Ch. » a street, the others said in the notice (`autres_lieux`, 21/11/2026).
  // A mairie not read said « rundata.re ne sait pas ce qu'il annonce », never « nous » (23/11/2026).
  // A cut with one hour written said « à partir de 09:00 » or « jusqu'à 15:00 », no longer silent.
  courant: 15,
  crues: 3,
  // An alert whose every period is over said lifted, never « prévue »; an alert not read said so (ALERTE_NON_LUE).
  cyclones: 12,
  // A device's name written all in capitals in the base, as people read it (« FEAR - Saint-Paul »), an article starting a
  // part of it after « - » (« Station Service - Les Sables »), each part in capitals of a name with lowercase letters
  // (« Lycée Polyvalent Paul Moreau - Loge »). Its floor as people read it, without « étage » before a text that says it
  // (« 1er étage », « rez-de-chaussée - Bât B »).
  // Its places' names as French writes them (noms.ts): « Collège des 2 Canons », « Église de La Ravine Sèche ».
  // Raised with each weekly Géo'DAE list (scripts/build-dae.py, its PR opened by the Monday timer).
  dae: 11,
  dechets: 2,
  // The communes whose notices are read, in the tap water's note, with those shared between distributors (L'Étang-Salé).
  // The distributors' « ne pas boire » notices in force, on their commune's line (`ne_pas_boire`, 23/11/2026).
  // Each bathing site's classification by the ARS, read in its own tag (« Excellent »), none when empty (24/11/2026).
  // Rebuilt from each site's entry read again (SOURCE_REVISION.baignade): the copy of 1.0.825 had no classification.
  eau: 7,
  // EDF's line older than an hour said first (perimee, avertissement), its day when not today's, never « en ce moment ».
  // Saint-André's notices read again, with its written agreement of 16/11/2026 (`coupures_annoncees`, from web:courant).
  // A past notice in `coupures_annoncees`: its sentence, its commune and its link only (19/11/2026).
  // `coupures_annoncees` with the notices of Cilaos, Saint-Philippe and Sainte-Suzanne, nothing said instead (20/11/2026).
  // The same strained hours day after day said once in `periodes_de_tension` (« du samedi 21/11 au jeudi 26/11, chaque
  // jour de 18 h à 22 h », 21/11/2026).
  // `coupures_annoncees` with a notice written in the bold letters of Unicode (21/11/2026).
  // `coupures_annoncees` with each range of hours of a day (21/11/2026).
  // `coupures_annoncees` with « et d'autres lieux nommés dans l'avis » (21/11/2026).
  // `coupures_annoncees.lu_le`, the hour of the notices' read, for the page's warning when it is old (23/11/2026).
  electricite: 27,
  // A title written all in capitals in the case of a sentence, its employer named (« Commune du Tampon »).
  emploi: 9,
  // The children's trails (sentiers marmailles) by the commune of their outline (24/11/2026).
  enfants: 16,
  // Un jour incomplet dit jusqu'à quelle heure, jamais présenté entier (10/11/2026).
  // Les records des six stations de référence rangés dans la copie (`records_reference`), pour le bloc Records de /meteo.
  // Hier heure par heure aux pluviomètres d'une commune, gardé à 00:20, tant que l'archive horaire ne l'a pas (avis n° 22).
  historique: 8,
  // A place said with its article (« Mesures les plus proches du Maïdo », « PRÉVISION … pour le Piton de la Fournaise »).
  // Its sea answer reads the waves of the west and the south from MFWAM, with the main swell (tools/mer.ts).
  // Its sea sentence: the satellite's pass first (« passage de cette nuit à 01:39 »), else « moyenne d'hier, 06/11 ».
  // The stations of MétéoR Océan Indien besides the others, each with its credit (09/11/2026).
  // The amateur stations (MétéoR-OI) apart: never the station named first, marked in the answer (10/11/2026).
  // A day without its hours of 10 h to 14 h has no UV index, never « UV 0 » (10/11/2026).
  // « <Lieu> en chiffres »: the figures of the nearest stations, their hours and their last 30 days (web/en-chiffres.ts).
  // The prefecture's RAA list moved (« …/Recueil-des-actes-administratifs », without « -RAA ») on 14/11/2026: its links.
  // « Repères du mois »: the month's normals and records at the station that speaks best for the place (19/11/2026).
  // Each station's kind in words, official or amateur, in the answer (`nature`) and its summary (20/11/2026).
  // « Pas d'avis de coupure récent ou à venir de …, lu à … » in the summary, never « pas de coupure annoncée » (22/11/2026).
  // Its measured rain: an hour not read says « la lecture de rundata.re n'a pas abouti », not « nous » (23/11/2026).
  // Its `couverture` the networks only, the detail left to sources_donnees; the rain's `convention` shorter (23/11/2026).
  // The nearest Candhis buoy that measured, in the sea's answer (houle_mesuree, 23/11/2026).
  // The UV index measured at Moufia in the forecast's answer (prevision_meteo, `indice_uv_mesure`, 24/11/2026).
  // The commune of a station or a place given by a point, from its outline, no longer the nearest place's (24/11/2026).
  lieu: 36,
  "marches-publics": 5,
  // The waves of the west and the south from Météo-France's MFWAM, with the main swell; WAM north and east.
  // The satellite's last pass first, its time and distance (« passage de cette nuit à 01:39 »), else « moyenne du 06/11 ».
  // Each beach with the satellite's pass time, and the corals' grid a view of /mer kept (the home page's sea bubble).
  // The prefecture's RAA list moved (« …/Recueil-des-actes-administratifs », without « -RAA ») on 14/11/2026: its links.
  // The Candhis buoys' last measurements, Météo-France's off Saint-Pierre since November 2026 (23/11/2026).
  // « En courbes »: the buoys' 30 days, the forecast at the buoy and the satellite's 30 days off four beaches, with their figures (24/11/2026).
  mer: 11,
  // The stations of MétéoR Océan Indien besides the others, each with its credit (09/11/2026).
  // The amateur stations (MétéoR-OI) apart: never the station named first, marked in the answer (10/11/2026).
  // The home page's sea (SeaNow) with each beach's pass time and the nearest corals' level.
  // Each station's kind in words, official or amateur, in the answer (`nature`) and its summary (20/11/2026).
  // The commune of a station off Météo-France, from its outline, no longer the nearest place's (24/11/2026).
  meteo: 14,
  // The communes of the hikes' trails, from their outlines (24/11/2026).
  randonnees: 16,
  // The levels of the order n°2026-2094 of 12/11/2026 while VigiEau serves the one it replaced, VigiEau's said beside.
  // A newer drought order out in the prefecture's recueil, not taken into account yet, said first (arrete_plus_recent).
  secheresse: 3,
  // Its copy keeps the fires' lines of sentiers_randonnee (tools/feux.ts `when`), now with their day.
  // Its copy keeps the trail pages' previews, which drop a weekend notice past its last day (web/domains.ts stateHead).
  // Its copies keep the notices' words (providers/sentiers.ts nuance): past its last day, a weekend notice is quoted, without « ouvert ».
  // Its copies keep a closed trail's state (web/data.ts closedState): « En partie fermé : … » first, « Fermé » said once.
  // Its copy keeps the middle of each forest road closed to traffic (web/data.ts routes_points), for the home page's map.
  // A trail's copy says when the ONF's map of the day no longer lists it (hors_carte), never « ouvert » (24/11/2026).
  // The communes of the trails and the forest roads, from their outlines (24/11/2026).
  sentiers: 25,
  // Its copy dates the volley league's tournaments by the days of their title, else « (dates données par la Ligue) ».
  // A volley match's sets written as its score, « 26-28 ».
  // The ffgolf's written refusal of 09/11/2026: its own line, dated, in the golf's mention.
  // No sentence for the communes' sports programmes not read any more (20/11/2026).
  // The link to Réunion La 1ère's sport news at its new address (« /sport?r=reunion »; the old one answers 404).
  // A Grand Raid course's climb with its thousands separator, « 10\u202f200\u00a0m D+ ».
  // A championship's page not read said « rundata.re ne sait pas ce qu'il annonce », never « nous » (23/11/2026).
  // The volley league or Sportsregions failing after an old copy said « dernière lecture sans succès » (24/11/2026).
  sport: 34,
  // A station's commune, from its outline, no longer the nearest place's (24/11/2026).
  station: 3,
  // Its copy keeps the bus feeds' times (`temps_reel`, data.ts `feedTimes`), now with their day.
  // Its bus alerts with two quoted stop names joined by a bare comma spaced, as on /bus.
  // Its news of the roads: « mobilisation » for a strike or a blockade only (« mobilisation financière » left out).
  // Its news of the roads: not « un accident vasculaire » nor a day « sans accident »; « grévistes » a mobilisation.
  // Its news of the roads: not « le trafic de drogue », nor the dam of Takamaka.
  // Its news of the roads by commune: a headline « Saint-Denis : … » to the communes it names (communesEnTete).
  trafic: 9,
  // A station's commune, from its outline, no longer the nearest place's (24/11/2026).
  velos: 8,
  // « Puis-je monter au volcan ? »: the Enclos' closed trails too, each with the ONF's reason (20/11/2026).
  // Its past alerts: the release of 13/02/2026 linked on the prefecture's site, without another assistant's tag.
  // The earthquakes' copy said « la dernière lecture de rundata.re », never « notre lecture » (23/11/2026).
  // Its texts name rundata.re instead of « nous » (« lus par rundata.re », « jusqu'à la lecture du … », the Enclos'
  // access, the past alerts' heads), and a no-break space before « : » (23/11/2026).
  volcan: 18,
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
  // Its subjects narrowed (sujetsOf): « vigilance » with its colour, « annulé » or « reporté » alone no culture, « AVC » health.
  // « Enquête publique » and « tribunal administratif » no crimes (sujetsOf).
  // « Mobilisation » no « Rassemblement national », no football's « barrages », and alone in the headline only (sujetsOf).
  // Freedom's home page at its own address, https://freedom.fr/ (accueils-medias.ts), no longer through a redirection.
  "actualites:fil": 11,
  // Every agenda's first sentence whole or none, never cut with « … » (lead()): the agendas without a key of their own
  // (CIREST, the halls' agenda:<hall> included), and the seven below raised with it.
  agenda: 1,
  // Read again with its written agreement of 28/10/2026, without the price and the sentence an older entry kept.
  "agenda:bras_panon": 2,
  // Read again with its written agreement of 06/11/2026, from its list: an older entry, read from its feed, is not served.
  "agenda:etang_sale": 2,
  // Read again with its written agreement of 16/11/2026, as its own source: an older entry was read as the mairies'.
  // The day of a post whose excerpt is cut before it, read in its whole text (content:encoded, 21/11/2026).
  "agenda:saint_andre": 3,
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
  // Read again as the commune's public information (20/11/2026), each event with its own page's link: an older entry
  // linked its home page.
  "agenda:le_tampon": 1,
  // An event without a place no longer takes the start of its text for one (20/11/2026).
  "agenda:petite_ile": 1,
  // With the time Atmo Réunion diffused the index (date_dif, `diffuse_le`), which an older entry lacks.
  atmo: 1,
  // A notice that awaits the return to normal keeps « ne pas boire » (#723), and a sector followed by the advice without
  // a blank line is kept (« TRAITEMENT ST FRANCOIS »). A commune written without its article (« commune de
  // Trois-Bassins »), and a list of streets ended by « Communiqué … » or by « Des perturbations » run on its last line.
  // A La Créole notice with its day and two hours, and its list of streets ended by « La régie La Créole remercie… ».
  // Four feeds more, the communes' sites (Saint-Philippe, Cilaos, Les Trois-Bassins, Petite-Île; 20/11/2026).
  // A list of streets ended by « Et (toutes) les voies adjacentes », kept last, or by « Il est recommandé… » (CIREST,
  // 20/11/2026).
  // La Créole's titles in the case of a sentence, and the place a notice names in its sentence (`lieu`, 24/11/2026).
  // Sudéau's notices posted by the town of Le Tampon, one feed more (24/11/2026).
  "avis-eau:flux": 7,
  // The date and the cause of a notice parted by « · » (avis(), Sentier Bayonne).
  "onf:sentiers": 1,
  // The trace of one trail (onf:trace:<slug>), its notice parted by « · » too (parseTrace, Sentier Bayonne).
  onf: 1,
  // CAMS's UV index: a day without its hours of 10 h to 14 h kept without an index, never « UV 0 » (10/11/2026).
  "uv:ile": 1,
  // The UV index measured at Moufia, with its ozone (providers/uv-mesure.ts, 24/11/2026).
  "uv-mesure": 1,
  // Each bathing site's results with its classification read in its own tag (« Excellent »): the entries read before,
  // with an empty one, read again (24/11/2026).
  baignade: 1,
  // The tap water's analyses of a commune (Hub'Eau) and the island's water restrictions (VigiEau): declared so that a
  // change of how they are read reads them again at the deploy (test/eau-revisions.test.ts).
  eau: 1,
  vigieau: 1,
};

/** The revision of the source whose entry is kept under `key`: its own, else its first part's; for a bundle's entry, its entry's. */
export const sourceRevision = (key: string): number | undefined => {
  // An entry of a bundle (cache.ts `bundle`) is kept under « bundle|entry »: the entry's own key says its revision
  // (« agendas|agenda:trois_bassins » is agenda:trois_bassins'), which « agendas|agenda » never matched (05/11/2026).
  const own = key.slice(key.lastIndexOf("|") + 1);
  return SOURCE_REVISION[own] ?? SOURCE_REVISION[own.split(":")[0]];
};
