/**
 * The own text of a commune's page (/communes/<slug>), under its title: what the commune is, then what the page gathers.
 * Fixed words, the same at every visit, written for the residents (validated on 20/11/2026): the page's
 * tiles below say the moment. All 24 communes have one; a commune left out would open on its hook alone.
 *
 * Sources of the facts, read on 20/11/2026:
 * - population (municipale) and area: INSEE, through geo.api.gouv.fr; the ranks compare the 24 communes, same source;
 * - schools, water distributor, bus networks, monuments and places: the page's own blocks that day (annuaire de
 *   l'Éducation nationale, the distributors, the bus networks and Car Jaune, Mérimée and DATAtourisme); the trails:
 *   the ONF's, counted open or closed.
 * The counts of schools are checked against the directory the page reads (test/communes-textes.test.ts): a text that
 * no longer matches it fails the tests, and is written again rather than computed, the words being validated as they are.
 */
export const TEXTES: Record<string, readonly [string, string]> = {
  "saint-denis": [
    "Saint-Denis est le chef-lieu de La Réunion et sa commune la plus peuplée : 155 634 habitants d'après l'INSEE, sur 142 km², de la mer aux pentes de la Roche Écrite. La préfecture, la Région, le Département et le Barachois y sont réunis. La commune compte 20 mairies annexes et centres municipaux, de Bellepierre à Bois de Nèfles, du Brûlé à la Bretagne, ainsi que 84 écoles, 15 collèges et 11 lycées. La rue de Paris garde les grandes cases créoles du XIXe siècle : la Maison Carrère, où se trouve l'office de tourisme, et la Villa Repiquet sont classées monuments historiques.",
    "Cette page réunit ce qui concerne Saint-Denis aujourd'hui : la température mesurée à la station la plus proche, les coupures d'eau annoncées par Dionéo, la vigilance, les prochains bus, les sorties, les pharmacies et les médecins, avec pour chaque information sa source et son heure.",
  ],
  "saint-paul": [
    "Saint-Paul est la plus grande commune de La Réunion, avec 242 km² qui vont du lagon de l'Ermitage aux Hauts de l'Ouest, et la deuxième par sa population : 108 088 habitants d'après l'INSEE. C'est là que les premiers habitants de l'île se sont installés, et la ville en a été la première capitale. Elle rassemble des quartiers très différents : Saint-Gilles-les-Bains, La Saline, L'Éperon, Plateau Caillou, Bois de Nèfles, Le Guillaume. Le musée de Villèle, ancienne demeure des XVIIIe et XIXe siècles, est monument historique, et 41 sentiers de l'ONF passent sur la commune.",
    "Cette page rassemble Saint-Paul au jour le jour : la météo mesurée, l'eau distribuée par La Créole, les marchés forains de la ville et des quartiers, les sorties annoncées par la commune, les bus de la gare, les 69 écoles, 11 collèges et 7 lycées, avec la source et l'heure de chaque information.",
  ],
  "saint-pierre": [
    "Saint-Pierre est la capitale du Sud et la troisième commune de La Réunion par sa population : 85 038 habitants d'après l'INSEE, sur 97 km². Sous-préfecture, port de plaisance, front de mer et marché couvert font vivre le centre-ville, tandis que Terre-Sainte, Ravine des Cabris, Bois d'Olives et Mont-Vert montent vers les Hauts. L'aéroport de Pierrefonds, dont la station météo sert de référence à la commune, est sur son territoire. Le temple Narassingua Peroumal, bâti au XIXe siècle par des engagés indiens, compte parmi ses lieux à découvrir, comme le siège des Terres australes et antarctiques françaises, qui y présente des expositions.",
    "Cette page suit Saint-Pierre aujourd'hui : la température mesurée à Pierrefonds, l'eau distribuée par runéo et les analyses du robinet, la vigilance, les bus de la gare, les sorties, les 49 écoles, 12 collèges et 7 lycées, et les médecins, avec pour chaque information sa source et son heure.",
  ],
  "le-tampon": [
    "Le Tampon est la commune des Hauts du Sud : 82 579 habitants d'après l'INSEE, et 182 km², la troisième plus grande surface de l'île. Elle monte du centre-ville, à quelque 560 m d'altitude, jusqu'à la Plaine des Cafres et à Bourg-Murat, sur la route du volcan. On y trouve des quartiers comme Trois-Mares, le 14e et le 23e kilomètre. La Cité du Volcan, à Bourg-Murat, raconte la vie du Piton de la Fournaise. Ici, il fait souvent bien plus frais qu'au littoral : c'est pourquoi la page dit toujours de quelle station vient la température, et à quelle altitude elle se trouve.",
    "Cette page réunit Le Tampon au jour le jour : la météo mesurée, l'eau distribuée par Sudéau, la sécheresse, les bus de la gare et de la Plaine des Cafres, les sentiers, les 42 écoles, 8 collèges et 3 lycées, avec la source et l'heure de chaque information.",
  ],
  "les-avirons": [
    "Les Avirons est une commune de l'Ouest, entre Saint-Leu et L'Étang-Salé : 11 536 habitants d'après l'INSEE, sur 26 km², la deuxième plus petite surface de l'île après Le Port. Elle monte en pente douce du littoral jusqu'au Tévelave et aux Hauts, où la forêt touche les sentiers de l'ONF. La ligne S4 de Car Jaune, par les Hauts, relie Saint-Paul et Saint-Pierre en passant par sa gare. La commune compte 6 écoles, un collège et un lycée.",
    "Cette page suit Les Avirons aujourd'hui : la température mesurée à la station la plus proche, avec sa distance et son altitude, l'eau distribuée par CISE Réunion et les coupures annoncées, la vigilance, les prochains bus et les sorties. Chaque information dit sa source et son heure.",
  ],
  "saint-andre": [
    "Saint-André est la plus peuplée des communes de l'Est et la cinquième de l'île : 58\u00a0885 habitants d'après l'INSEE, sur 55\u00a0km². Ses quartiers vont de Champ-Borne, au bord de la mer, à Cambuston, à Rivière du Mât et à La Cressonnière. La route de Salazie part de la commune et remonte la rivière du Mât vers le cirque. La sucrerie de Bois-Rouge et la distillerie Savanna s'y visitent, tout comme le temple du Colosse.",
    "Cette page suit Saint-André aujourd'hui : la météo mesurée, l'eau distribuée par O2LEST et les analyses du robinet, la sécheresse, la vigilance, les bus du réseau Estival et du Car Jaune, les sorties, ainsi que les 31 écoles, 7 collèges et 3 lycées. Chaque information donne sa source et son heure.",
  ],
  "saint-louis": [
    "Saint-Louis est une commune du Sud, entre L'Étang-Salé et Saint-Pierre : 54\u00a0941 habitants d'après l'INSEE, ce qui en fait la sixième de l'île, sur 99\u00a0km². Elle monte du Gol et de La Rivière jusqu'aux Makes, dont l'observatoire astronomique se visite. Sur la commune, la sucrerie du Gol ouvre ses portes, et le musée des Arts décoratifs de l'océan Indien est classé monument historique. 17 sentiers de l'ONF y passent.",
    "Cette page réunit Saint-Louis au jour le jour : la température mesurée, l'eau distribuée par runéo, la sécheresse, la vigilance, les bus d'Alternéo et du Car Jaune, les sorties, ainsi que les 33 écoles, 5 collèges et 4 lycées. Chaque information donne sa source et son heure.",
  ],
  "sainte-marie": [
    "Sainte-Marie est la voisine de Saint-Denis, à l'est, sur la côte nord : 37\u00a0093 habitants d'après l'INSEE, sur 89\u00a0km². L'aéroport Roland-Garros se trouve sur la commune, à Gillot. Ses quartiers vont de La Mare et Rivière des Pluies, près de la mer, jusqu'à Beauséjour et Grande Montée, en montant vers les Hauts. 6 sentiers de l'ONF y passent.",
    "Cette page suit Sainte-Marie aujourd'hui : la météo mesurée, l'eau distribuée par CISE Réunion et les analyses du robinet, la vigilance, les bus de Citalis et du Car Jaune, les sorties, ainsi que les 21 écoles, 4 collèges et 2 lycées. Chaque information donne sa source et son heure.",
  ],
  "la-possession": [
    "La Possession relie le Nord et l'Ouest : 36\u00a0568 habitants d'après l'INSEE, sur 119\u00a0km². La commune va de la route du Littoral et de La Grande Chaloupe, où le lazaret est classé monument historique, jusqu'à Dos d'Âne et à une grande partie du cirque de Mafate. C'est pourquoi 47 sentiers de l'ONF passent sur la commune. Ses quartiers comprennent Rivière des Galets, Sainte-Thérèse, Ravine à Malheur et Pichette.",
    "Cette page réunit La Possession au jour le jour : la météo mesurée, l'eau distribuée par les Eaux de La Possession, la sécheresse, l'état des sentiers, les bus de Kar'Ouest, d'Estival et du Car Jaune, les sorties de la commune, ainsi que les 27 écoles, 3 collèges et 2 lycées. Chaque information donne sa source et son heure.",
  ],
  "saint-leu": [
    "Saint-Leu est une commune de la côte Ouest, entre Les Trois-Bassins et Les Avirons : 36\u00a0163 habitants d'après l'INSEE, sur 119\u00a0km². Elle monte du lagon jusqu'au Piton Saint-Leu, aux Colimaçons et à La Chaloupe Saint-Leu. Plusieurs lieux de visite s'y trouvent : Kélonia, consacré aux tortues marines, le musée Stella Matutina, installé dans une ancienne usine sucrière, Mascarin, le jardin botanique de La Réunion, et le musée du Sel.",
    "Cette page suit Saint-Leu aujourd'hui : la température mesurée à la station de Saint-Leu, la mer et la houle prévue, l'eau distribuée par Derichebourg Aqua OI, la sécheresse, les bus de Kar'Ouest et du Car Jaune, les sorties, ainsi que les 21 écoles, 3 collèges et le lycée. Chaque information donne sa source et son heure.",
  ],
  "entre-deux": [
    "L'Entre-Deux doit son nom à sa place entre deux rivières, le Bras de la Plaine et le Bras de Cilaos, au-dessus de Saint-Pierre et du Tampon : 7\u00a0176 habitants d'après l'INSEE, sur 52\u00a0km². Le village a gardé ses cases créoles et leurs jardins, qui se visitent, et 6 sentiers de l'ONF passent sur la commune, dont ceux du Dimitile.",
    "Cette page réunit l'Entre-Deux au jour le jour : la météo mesurée, l'eau distribuée par Sudéau et les analyses du robinet, la sécheresse, la vigilance, les bus de CarSud et du Car Jaune, les sorties, ainsi que les 5 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "saint-joseph": [
    "Saint-Joseph est la grande commune du Sud sauvage : 39\u00a0207 habitants d'après l'INSEE, sur 179\u00a0km². Elle va du littoral de Manapany, de Langevin et de Vincendo jusqu'aux Hauts des Lianes et de la Plaine des Grègues. Ses lieux de visite parlent de la terre : la Maison du Curcuma, une plantation de thé et de géranium, un jardin d'orchidées. 12 sentiers de l'ONF passent sur la commune.",
    "Cette page réunit Saint-Joseph au jour le jour : la météo mesurée, l'eau distribuée par Sudéau et les analyses du robinet, la sécheresse, la vigilance, les bus de CarSud et du Car Jaune, les sorties, ainsi que les 26 écoles, 4 collèges et 4 lycées. Chaque information donne sa source et son heure.",
  ],
  "saint-benoit": [
    "Saint-Benoît est la porte de l'Est : 38\u00a0604 habitants d'après l'INSEE, et 231\u00a0km², la deuxième plus grande surface de l'île après Saint-Paul. La route des Plaines y commence et monte vers La Plaine-des-Palmistes. La commune s'étend de la rivière des Marsouins jusqu'à Sainte-Anne. La distillerie de la Rivière du Mât y produit du rhum, et 18 sentiers de l'ONF passent sur son territoire.",
    "Cette page suit Saint-Benoît aujourd'hui : la météo mesurée, l'eau distribuée par CISE Réunion et les coupures annoncées, la vigilance, les bus d'Estival et du Car Jaune, les sorties, ainsi que les 27 écoles, 5 collèges et 5 lycées. Chaque information donne sa source et son heure.",
  ],
  "le-port": [
    "Le Port est la plus petite commune de La Réunion, avec 16\u00a0km², mais elle compte 33\u00a0969 habitants d'après l'INSEE. Elle porte le nom du grand port de l'île, Port Réunion, où arrivent la plupart des marchandises. La ville est bâtie sur la plaine de la rivière des Galets, entre La Possession et Saint-Paul. La fondation Abyss, qui étudie les cétacés, y est installée.",
    "Cette page suit Le Port aujourd'hui : la météo mesurée, l'eau distribuée par runéo et les coupures annoncées, la vigilance, les bus de Kar'Ouest et du Car Jaune, la collecte des déchets, les sorties, ainsi que les 28 écoles, 4 collèges et 4 lycées. Chaque information donne sa source et son heure.",
  ],
  "sainte-suzanne": [
    "Sainte-Suzanne est une commune du Nord-Est, entre Sainte-Marie et Saint-André : 25\u00a0551 habitants d'après l'INSEE, sur 58\u00a0km². Le phare de Bel-Air, le plus ancien de l'île, et la cascade Niagara se trouvent sur la commune. La Vanilleraie y fait visiter une plantation de vanille et son atelier.",
    "Cette page réunit Sainte-Suzanne au jour le jour : la température mesurée, l'eau distribuée par runéo et les coupures annoncées, la vigilance, les bus de Citalis, d'Estival et du Car Jaune, les sorties, ainsi que les 15 écoles, 2 collèges et 3 lycées. Chaque information donne sa source et son heure.",
  ],
  "l-etang-sale": [
    "L'Étang-Salé est une commune de l'Ouest, entre Les Avirons et Saint-Louis : 14\u00a0464 habitants d'après l'INSEE, sur 39\u00a0km². Elle est connue pour sa plage de sable noir et pour sa forêt, au bord de la mer. Elle monte jusqu'à L'Étang-Salé-les-Hauts. D'après l'ARS, runéo distribue l'eau de presque toute la commune, et la mairie celle d'un réseau des Hauts. 18 sentiers de l'ONF passent sur la commune.",
    "Cette page suit L'Étang-Salé aujourd'hui : la température mesurée, l'eau et ses distributeurs, la sécheresse, la vigilance, les bus d'Alternéo et du Car Jaune, les sorties, ainsi que les 11 écoles et 2 collèges. Chaque information donne sa source et son heure.",
  ],
  "petite-ile": [
    "Petite-Île est une commune du Sud, entre Saint-Pierre et Saint-Joseph : 13\u00a0067 habitants d'après l'INSEE, sur 34\u00a0km². Elle tient son nom de l'îlot rocheux posé devant sa côte, et on y trouve la plage de Grande Anse. La Maison de l'Abeille y présente le métier d'apiculteur.",
    "Cette page réunit Petite-Île au jour le jour : la météo mesurée, l'eau distribuée par la SPL Sources et Eaux et les coupures annoncées, la vigilance, les bus d'Alternéo, de CarSud et du Car Jaune, les sorties annoncées par la commune, ainsi que les 7 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "bras-panon": [
    "Bras-Panon est une commune de l'Est, entre Saint-André et Saint-Benoît : 13\u00a0012 habitants d'après l'INSEE, sur 88\u00a0km². C'est une terre de vanille, et la coopérative Provanille fait visiter la culture et la préparation des gousses.",
    "Cette page suit Bras-Panon aujourd'hui : la météo mesurée, l'eau distribuée par runéo et les coupures annoncées, la vigilance, les bus d'Estival et du Car Jaune, les sorties, ainsi que les 6 écoles, le collège et les 2 lycées. Chaque information donne sa source et son heure.",
  ],
  "salazie": [
    "Salazie est le cirque de l'Est : 7\u00a0268 habitants d'après l'INSEE, sur 104\u00a0km². Les cirques et les remparts de l'île sont inscrits au patrimoine mondial de l'UNESCO depuis 2010. Le village de Hell-Bourg a gardé ses cases créoles, dont la Maison Folio, classée monument historique. La cascade du Voile de la Mariée se voit depuis la route du cirque, et 28 sentiers de l'ONF passent sur la commune.",
    "Cette page réunit Salazie au jour le jour : la météo mesurée, l'eau distribuée par O2LEST et les coupures annoncées, la vigilance, l'état des sentiers, les bus d'Estival, les sorties, ainsi que les 8 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "les-trois-bassins": [
    "Les Trois-Bassins est une commune de l'Ouest, entre Saint-Paul et Saint-Leu : 7\u00a0221 habitants d'après l'INSEE, sur 43\u00a0km². En bande étroite, elle monte du littoral jusqu'aux Hauts de l'Ouest, et 4 sentiers de l'ONF passent sur la commune.",
    "Cette page suit Les Trois-Bassins aujourd'hui : la météo mesurée, l'eau distribuée par La Créole et les coupures annoncées, la vigilance, les bus de Kar'Ouest et du Car Jaune, les sorties, ainsi que les 7 écoles, le collège et le lycée. Chaque information donne sa source et son heure.",
  ],
  "la-plaine-des-palmistes": [
    "La Plaine-des-Palmistes est la commune des Hauts de l'Est, sur la route des Plaines entre Saint-Benoît et la Plaine des Cafres : 6\u00a0936 habitants d'après l'INSEE, sur 84\u00a0km². Elle est connue pour ses goyaviers, qu'on y cueille en saison, et c'est d'ici qu'on rejoint la forêt de Bébour. Il y fait souvent bien plus frais qu'au littoral, et 8 sentiers de l'ONF passent sur la commune.",
    "Cette page réunit La Plaine-des-Palmistes au jour le jour : la météo mesurée, l'eau distribuée par O2LEST et les coupures annoncées, la vigilance, les bus d'Estival et du Car Jaune, les sorties, ainsi que les 3 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "sainte-rose": [
    "Sainte-Rose est la commune de l'Est au pied du Piton de la Fournaise : 6\u00a0557 habitants d'après l'INSEE, sur 178\u00a0km². Les coulées de l'Enclos y descendent jusqu'à la mer. En 1977, la lave s'est arrêtée devant l'église de Piton Sainte-Rose, Notre-Dame-des-Laves. L'Anse des Cascades est sur la commune, la vanille s'y visite, et 25 sentiers de l'ONF y passent.",
    "Cette page suit Sainte-Rose aujourd'hui : la météo mesurée, le volcan, l'eau distribuée par O2LEST et les coupures annoncées, la vigilance, les bus d'Estival et du Car Jaune, les sorties, ainsi que les 7 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "saint-philippe": [
    "Saint-Philippe est au bout du Sud sauvage, au pied du Piton de la Fournaise : 5\u00a0082 habitants d'après l'INSEE, sur 155\u00a0km². Le Grand Brûlé, que les coulées du volcan traversent jusqu'à la mer, est sur son territoire, tout comme le Cap Méchant. À Mare Longue, le Jardin des Parfums et des Épices pousse dans une forêt sur une coulée de 800 ans. La vanille s'y visite, et 16 sentiers de l'ONF passent sur la commune.",
    "Cette page réunit Saint-Philippe au jour le jour : la météo mesurée, le volcan, l'eau distribuée par Sudéau et les coupures annoncées, la vigilance, les bus de CarSud et du Car Jaune, les sorties, ainsi que les 5 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
  "cilaos": [
    "Cilaos est le cirque du Sud, et la commune la moins peuplée de l'île : 5\u00a0040 habitants d'après l'INSEE, sur 85\u00a0km². On y monte depuis Saint-Louis par une route de lacets. Les cirques et les remparts sont inscrits au patrimoine mondial de l'UNESCO depuis 2010. C'est le point de départ de la montée au Piton des Neiges. On y fait du vin : le Chai de Cilaos se visite. 31 sentiers de l'ONF passent sur la commune.",
    "Cette page suit Cilaos aujourd'hui : la météo mesurée, l'eau distribuée par RECIL et les coupures annoncées, la vigilance, l'état des sentiers, les bus d'Alternéo, les sorties, ainsi que les 5 écoles et le collège. Chaque information donne sa source et son heure.",
  ],
};
