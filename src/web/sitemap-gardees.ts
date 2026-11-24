/**
 * The pages of the sitemap from 24/11/2026: marketing's list of that day, the pages with a content of their own that
 * people search. The sitemap named 893 pages: a young site with many pages of one model is judged as a whole, so it now
 * names 230 of them: the home page and the head pages, the 24 communes, a commune's water cuts where the page has
 * something of its own to say, and the trails, hikes, weather, waste collection and children's pages people look for.
 * The 662 others stay online, linked and indexable: the bus stops, a commune's elections and day, the events' pages,
 * the past cyclones, and the other trails, hikes and places.
 *
 * A page that is not here is not in the sitemap, a new one included: it comes in by a line here (the page in English,
 * /en, added to the list on 24/11/2026). test/sitemap-liste.test.ts counts them. Left out the same day: the Trou de Fer's
 * deviation by the RF Fleurs Jaunes, which the ONF took off its map (its page says so, without a state).
 */

/** The home page and the head pages. */
const TETE = [
  "/", "/a-propos", "/actualites", "/air", "/alerte-cyclone", "/antennes", "/application", "/associations",
  "/baignade", "/bornes", "/bus", "/calendrier", "/carburants", "/carte", "/chiffres", "/collecte", "/communes",
  "/conditions", "/confidentialite", "/coupures-eau", "/crues", "/cyclones", "/decheteries", "/defibrillateurs",
  "/eau", "/ecoles", "/ecoles-cyclone", "/electricite", "/emploi", "/en", "/enfants", "/evenements", "/feux",
  "/historique", "/kit-cyclone", "/marches-publics", "/mcp", "/mer", "/meteo", "/nouveautes", "/ouvrir-ses-donnees", "/peche",
  "/presse", "/publier", "/randonnees", "/secheresse", "/sentiers", "/sites-sans-reponse", "/sport", "/terrain",
  "/trafic", "/valeurs", "/velos", "/vigilance", "/volcan",
];

/** The 24 communes. */
const COMMUNES = [
  "bras-panon", "cilaos", "entre-deux", "l-etang-sale", "la-plaine-des-palmistes", "la-possession", "le-port",
  "le-tampon", "les-avirons", "les-trois-bassins", "petite-ile", "saint-andre", "saint-benoit", "saint-denis",
  "saint-joseph", "saint-leu", "saint-louis", "saint-paul", "saint-philippe", "saint-pierre", "sainte-marie",
  "sainte-rose", "sainte-suzanne", "salazie",
].map((x) => `/communes/${x}`);

/** A commune's water cuts, where its page is indexable (web/coupures.ts); Le Tampon since 24/11/2026, its notices read. */
const COUPURES_EAU = [
  "bras-panon", "cilaos", "l-etang-sale", "la-plaine-des-palmistes", "la-possession", "le-port", "le-tampon", "les-avirons",
  "les-trois-bassins", "petite-ile", "saint-andre", "saint-benoit", "saint-denis", "saint-leu", "saint-louis",
  "saint-paul", "saint-philippe", "saint-pierre", "sainte-marie", "sainte-rose", "sainte-suzanne", "salazie",
].map((x) => `/coupures-eau/${x}`);

/** The waste collection of a commune. */
const COLLECTE = [
  "la-possession", "le-port", "saint-leu", "saint-paul", "trois-bassins",
].map((x) => `/collecte/${x}`);

/** The children's places of a commune. */
const ENFANTS = [
  "saint-andre", "saint-joseph", "saint-leu",
].map((x) => `/enfants/${x}`);

/** The weather of a place. */
const METEO = [
  "l-etang-sale", "la-possession", "maido", "piton-de-la-fournaise", "saint-benoit", "saint-gilles-les-bains",
  "saint-paul",
].map((x) => `/meteo/${x}`);

/** The hikes and their sectors. */
const RANDONNEES = [
  "boucle-de-la-pointe-des-cascades", "boucle-moulin-kader", "chemin-cremont", "la-boucle-des-trous-blancs",
  "mafate", "pr25", "promenade-des-pitons", "salazie", "sentier-augustave", "sentier-bayonne",
  "sentier-botanique-de-la-providence", "sentier-botanique-de-mare-longue-petite-boucle", "sentier-cascade-blanche",
  "sentier-de-l-ecole-normale", "sentier-de-la-grande-jument", "sentier-du-cratere-dolomieu", "sentier-du-zebre",
  "sentier-jacky-inard",
].map((x) => `/randonnees/${x}`);

/** The ONF's trails. */
const SENTIERS = [
  "acces-a-l-aire-d-accueil-du-tour-du-rond", "chemin-charrette", "chemin-de-la-riviere-des-remparts",
  "chemin-de-pecheur-du-grand-cap", "chemin-des-anglais", "chemin-haut-diore", "chemins-des-casiers",
  "cilaos-bras-sec-par-bras-de-benjoin", "contre-allee-littorale", "la-nouvelle-col-des-boeufs",
  "la-nouvelle-fond-mafate", "la-porte-aurere", "le-belier-grand-sable", "le-bloc-piton-des-neiges",
  "nez-de-boeuf-roche-plate", "parcours-de-sante-de-l-etang-sale", "parcours-sportif-du-plateau-des-chenes",
  "parking-textor-piton-de-l-eau", "piste-de-l-opar", "piste-dfci-du-bioparc", "piste-du-chemin-du-rail",
  "piste-forestiere-de-la-plaine-des-merles-rf21", "roche-ancree-grand-place",
  "route-forestiere-de-bebour-belouve-rf02", "route-forestiere-de-l-eden-rf80",
  "route-forestiere-de-la-scierie-rf58", "route-forestiere-de-la-source-rf30",
  "route-forestiere-du-chalet-des-patres-rf49", "route-forestiere-du-piton-textor-rf46",
  "route-forestiere-du-puits-arabe-rf34", "route-forestiere-laverdure-rf42", "sentier-bassin-fouquet",
  "sentier-bayonne", "sentier-berenice", "sentier-botanique-de-la-petite-plaine",
  "sentier-botanique-de-roche-merveilleuse", "sentier-col-de-bellevue",
  "sentier-d-ilet-alcipe-par-bois-de-sans-soucis", "sentier-d-interpretation-de-bon-accueil",
  "sentier-d-interpretation-de-la-pointe-de-la-table", "sentier-d-interpretation-des-fougeres",
  "sentier-de-bras-plat-ancien-gr-r2", "sentier-de-decouverte-du-milieu-naturel-de-bellecombe", "sentier-de-diore",
  "sentier-de-duvernay", "sentier-de-l-ecole-normale", "sentier-de-l-eden-liberia", "sentier-de-la-bretagne",
  "sentier-de-la-cage-aux-lions", "sentier-de-la-canalisation-des-orangers", "sentier-de-la-cascade-biberon",
  "sentier-de-la-decouverte-de-bon-accueil", "sentier-de-la-onzieme-ligne", "sentier-de-la-providence-mercure",
  "sentier-de-la-reine-des-tamarins", "sentier-de-montplaisir", "sentier-de-roche-verre-bouteille",
  "sentier-de-takamaka", "sentier-des-branles", "sentier-des-citernes", "sentier-des-mares-et-des-bois-de-couleur",
  "sentier-des-ouvriers", "sentier-des-porteurs", "sentier-des-rampes-de-la-montagne", "sentier-des-ravenales",
  "sentier-des-trois-sources", "sentier-du-bras-des-merles", "sentier-du-bras-mapou", "sentier-du-cap-bouteille",
  "sentier-du-cimetiere-de-cayenne", "sentier-du-contrefort-de-la-scierie", "sentier-du-cratere-dolomieu",
  "sentier-du-gite-de-bellecombe", "sentier-du-grand-bord", "sentier-du-malbar-mort-et-de-la-piece-jeanne",
  "sentier-du-pare-feu-1970", "sentier-du-petit-bras-bemale-bassin-la-noix", "sentier-du-piton-hyacinthe",
  "sentier-du-quai-de-l-eglise", "sentier-farfouille",
  "sentier-francoise-francia", "sentier-jacky-inard", "sentier-kapor", "sentier-littoral-de-saint-philippe",
  "sentier-mario", "sentier-mere-canal", "sentier-mollaret",
  "sentier-panoramique-de-bois-rouge-ancien-sentier-bassin-bleu", "sentier-pedestre-de-la-coulee-verte",
  "sentier-piton-fougeres", "sentier-quai-de-sardines-sentier-des-pecheurs", "sentier-scout", "sentier-tapage",
  "terre-plate-source-manouilh", "tour-du-grand-etang", "tour-du-rond",
  "vaudeville-grand-benare-sentier-de-la-glaciere",
].map((x) => `/sentiers/${x}`);

const GARDEES = new Set([...TETE, ...COMMUNES, ...COUPURES_EAU, ...COLLECTE, ...ENFANTS, ...METEO, ...RANDONNEES, ...SENTIERS]);

/** How many pages the list holds. */
export const NOMBRE = GARDEES.size;

/** Whether a page of the site is one of the sitemap (marketing's list of 24/11/2026). */
export const gardee = (path: string) => GARDEES.has(path);
