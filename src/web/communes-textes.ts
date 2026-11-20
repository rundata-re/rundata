/**
 * The own text of a commune's page (/communes/<slug>), under its title: what the commune is, then what the page gathers.
 * Fixed words, the same at every visit, written for the residents (marketing, validated on 20/11/2026): the page's
 * tiles below say the moment. Only the communes listed here have one; the others open on their hook alone.
 *
 * Sources of the facts, read on 20/11/2026:
 * - population (municipale) and area: INSEE, through geo.api.gouv.fr; the ranks compare the 24 communes, same source;
 * - schools, water distributor, monuments, bus stations and places: the page's own blocks that day (annuaire de
 *   l'Éducation nationale, the distributors, Mérimée and DATAtourisme, Car Jaune); the trails: the ONF's.
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
};
