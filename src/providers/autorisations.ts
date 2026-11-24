/**
 * The communes' sources, one line each: a commune's agenda or news, the notices of power cuts it relays. Since
 * 20/11/2026 every commune's own site is read as its public information (« publique »): slowly (one page a minute at
 * most, by the scheduled event, cached), under an honest User-Agent, each fact cited with its link and the hour it was
 * read; nothing technical is ever got round (captcha, login, a blocked address), and a commune that asks in writing to
 * be taken out is, within a day. They were switched in batches, each once its reader was checked: Le Tampon,
 * Saint-Denis and Saint-Pierre; La Possession, Petite-Île, Saint-Benoît and Sainte-Rose; Cilaos, Saint-Joseph and
 * Saint-Philippe, with the notices of power cuts of Cilaos, Saint-Philippe and Sainte-Suzanne (20/11/2026).
 *
 * Those that answered before, « accordee » or « permise » (Saint-Louis, Saint-Leu, La Plaine-des-Palmistes: « à des
 * fins d'information », not commercial), are read as they were.
 */
export interface Autorisation {
  /** The commune whose site it is. */
  commune: string;
  /**
   * What is read there once it agrees: its agenda's events, the events announced in its news, both, the notices of
   * power cuts it relays.
   */
  publie: "événements" | "actualités" | "événements et actualités" | "avis de coupure d'électricité";
  /**
   * « a_demander » until the letter asking for it has gone, « demandee » once it has, « refusee » only after a written
   * no, « accordee » after a yes; « permise » when the site's own terms allow it, without asking; « publique »: read as
   * the public information of a commune, since `publique_le`.
   */
  etat: "a_demander" | "demandee" | "accordee" | "permise" | "refusee" | "publique";
  /** The day it was first read as public information, « 2026-11-20 ». */
  publique_le?: string;
  /** The day the letter went, « 2026-10-26 », as given by who sent it: never guessed. */
  demandee_le?: string;
  /** The day of its written no. */
  refusee_le?: string;
  /** The day of its written yes, as given by who received it. */
  accordee_le?: string;
}

/**
 * By source: `agenda:<id>` for an agenda or a mairie's news (src/providers/agenda.ts, LISIBLES, or a commune whose site
 * is not read at all: `agenda:saint_denis`), `courant:<commune>`
 * for the notices of power cuts a mairie relays (src/providers/coupures-courant.ts, MAIRIES). In the order said.
 */
export const AUTORISATIONS: Record<string, Autorisation> = {
  "agenda:bras_panon": { commune: "Bras-Panon", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-10-28" },
  "agenda:cilaos": { commune: "Cilaos", publie: "actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:etang_sale": { commune: "L'Étang-Salé", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-06" },
  "agenda:la_possession": { commune: "La Possession", publie: "événements", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:le_tampon": { commune: "Le Tampon", publie: "événements", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:petite_ile": { commune: "Petite-Île", publie: "événements", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:plaine_des_palmistes": { commune: "La Plaine-des-Palmistes", publie: "actualités", etat: "permise" },
  "agenda:saint_andre": { commune: "Saint-André", publie: "événements", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" },
  "agenda:saint_benoit": { commune: "Saint-Benoît", publie: "événements", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:saint_denis": { commune: "Saint-Denis", publie: "actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:saint_joseph": { commune: "Saint-Joseph", publie: "actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:saint_leu": { commune: "Saint-Leu", publie: "actualités", etat: "permise" },
  "agenda:saint_louis": { commune: "Saint-Louis", publie: "événements", etat: "permise" },
  "agenda:saint_philippe": { commune: "Saint-Philippe", publie: "actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "agenda:saint_pierre": { commune: "Saint-Pierre", publie: "événements et actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  // No agenda to read: its menu's « Agenda » (/fr/ev/1771460/agenda-1212) leads to its 404 page, and its six news of
  // 20/11/2026 announce no dated event. Public all the same, so that it is no longer said « non repris ».
  "agenda:sainte_rose": { commune: "Sainte-Rose", publie: "événements et actualités", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "courant:Cilaos": { commune: "Cilaos", publie: "avis de coupure d'électricité", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "courant:Saint-André": { commune: "Saint-André", publie: "avis de coupure d'électricité", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-16" },
  "courant:Saint-Philippe": { commune: "Saint-Philippe", publie: "avis de coupure d'électricité", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
  "courant:Sainte-Suzanne": { commune: "Sainte-Suzanne", publie: "avis de coupure d'électricité", etat: "publique", publique_le: "2026-11-20", demandee_le: "2026-10-26" },
};

/**
 * The halls and the sports sites whose terms forbid taking their information without their written authorisation, as
 * read at the source on 26/10/2026: six halls' legal notices (the TÉAT, the Théâtre Luc Donat and the CDNOI on the same
 * model, the Cité des Arts, the Kabardock, Léspas), Bisik's (its texts « ne sauraient être reproduits librement sans
 * l'autorisation de leur auteur »), ffgolf's terms (IV), FFVoile's legal notice, Sportsregions' terms (7.2). Le
 * Séchoir's site has no legal notice: it is read. Until one agrees, nothing is read of it, and what was kept of it is
 * no longer served: the answers say so instead (tools/non-repris.ts). Once one has agreed in writing (« accordee »), it is
 * read again, as the request promised: each event's facts and the link to its page, said with « Source : » its name and
 * the hour it was read (providers/agenda.ts, `credit`), no text nor picture.
 */
export interface SourceNonReprise {
  /** As said: « Cité des Arts », « ffgolf ». */
  nom: string;
  /** With its article, in a list or before « a refusé » (marketing): « la Cité des Arts », « le TÉAT (Champ Fleuri et Plein Air) », « Bisik ». */
  cite: string;
  /** Shorter, after « Nous avons demandé cet accord à », when its citation has more (marketing): « le TÉAT ». */
  court?: string;
  /** After « Les mentions légales »: « du site de la Cité des Arts », « du site de la ffgolf ». */
  du_site: string;
  /** What its terms forbid, when not « d'en reprendre le contenu sans son accord » (Bisik's speak of its authors'). */
  interdit?: string;
  /** What its terms are called on its site. */
  textes: "mentions légales" | "conditions d'utilisation";
  famille: "salle" | "sport";
  /** After « rundata.re n'affiche donc pas », for it alone: « son programme », « les compétitions des golfs de La Réunion ». */
  publie: string;
  /** A hall's communes: its mention is said for them. */
  communes?: string[];
  /** The sport tool's sport whose answer says it; none for the clubs of every sport (Sportsregions). */
  sport?: "golf" | "voile";
  /** The day its terms were read, and where they are. */
  lues_le: string;
  conditions: string;
  etat: "a_demander" | "demandee" | "accordee" | "refusee";
  /** The day the letter went, as given by who sent it: never guessed. */
  demandee_le?: string;
  refusee_le?: string;
  /** The day of its written yes, as given by who received it. */
  accordee_le?: string;
}

/** By source: `agenda:<id>` for a hall's programme or the clubs' calendar (providers/agenda.ts, LISIBLES), `sport:<id>`. */
export const NON_REPRISES: Record<string, SourceNonReprise> = {
  "agenda:teat": { nom: "TÉAT Champ Fleuri et Plein Air", cite: "le TÉAT (Champ Fleuri et Plein Air)", court: "le TÉAT", du_site: "du site du TÉAT", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Saint-Denis", "Saint-Paul"], lues_le: "2026-10-26", conditions: "https://www.teat.re/articles/mentions-legales,6.htm", etat: "demandee", demandee_le: "2026-10-26" },
  "agenda:cite_des_arts": { nom: "Cité des Arts", cite: "la Cité des Arts", du_site: "du site de la Cité des Arts", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Saint-Denis"], lues_le: "2026-10-26", conditions: "https://www.citedesarts.re/Mentions-legales", etat: "demandee", demandee_le: "2026-10-26" },
  "agenda:kabardock": { nom: "Kabardock", cite: "le Kabardock", du_site: "du site du Kabardock", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Le Port"], lues_le: "2026-10-26", conditions: "https://kabardock.com/mentions-legales/", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-11-06" },
  "agenda:bisik": { nom: "Bisik", cite: "Bisik", interdit: "d'en reproduire les textes sans l'accord de leurs auteurs", du_site: "du site de Bisik", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Saint-Benoît"], lues_le: "2026-10-26", conditions: "https://bisik.re/mentions-legales/", etat: "demandee", demandee_le: "2026-11-08" },
  "agenda:luc_donat": { nom: "Théâtre Luc Donat", cite: "le Théâtre Luc Donat", du_site: "du site du Théâtre Luc Donat", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Le Tampon"], lues_le: "2026-10-26", conditions: "https://www.theatrelucdonat.re/articles/mentions-legales,6.html", etat: "accordee", demandee_le: "2026-10-26", accordee_le: "2026-10-27" },
  "agenda:cdnoi": { nom: "CDNOI", cite: "le CDNOI", du_site: "du site du CDNOI", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Saint-Denis"], lues_le: "2026-10-26", conditions: "https://www.cdnoi.re/articles/mentions-legales,7.htm", etat: "demandee", demandee_le: "2026-10-26" },
  "agenda:lespas": { nom: "Léspas", cite: "Léspas", du_site: "du site de Léspas", textes: "mentions légales", famille: "salle", publie: "son programme", communes: ["Saint-Paul"], lues_le: "2026-10-26", conditions: "https://lespas.re/mentions-legales/", etat: "demandee", demandee_le: "2026-11-08" },
  "sport:ffgolf": { nom: "ffgolf", cite: "la ffgolf", du_site: "du site de la ffgolf", textes: "conditions d'utilisation", famille: "sport", publie: "les compétitions des golfs de La Réunion", sport: "golf", lues_le: "2026-10-26", conditions: "https://www.ffgolf.org/conditions-generales-d-utilisation", etat: "refusee", demandee_le: "2026-10-26", refusee_le: "2026-11-09" },
  "sport:ffvoile": { nom: "FFVoile", cite: "la FFVoile", du_site: "du site de la FFVoile", textes: "mentions légales", famille: "sport", publie: "les régates de la Ligue de voile de La Réunion", sport: "voile", lues_le: "2026-10-26", conditions: "https://www.ffvoile.fr/ffv/web/infoslegales.asp", etat: "demandee", demandee_le: "2026-10-26" },
  "agenda:sportsregions": { nom: "Sportsregions", cite: "Sportsregions", du_site: "de Sportsregions", textes: "conditions d'utilisation", famille: "sport", publie: "les événements que les clubs y publient", lues_le: "2026-10-26", conditions: "https://www.sportsregions.fr/informations-legales", etat: "demandee", demandee_le: "2026-11-23" },
};

/**
 * A source whose site writes no licence for its data, asked in writing whether rundata.re may take them: not read until
 * it agrees, then read on the conditions of its answer. sensors.social (Robonomics): its code was under BSD 3-Clause and
 * nothing covered its measures (read on 29/10/2026); asked by its form on 08/11/2026, it agreed in writing on
 * 09/11/2026, its measures under ODbL 1.0 since 03/11/2026 (the NOTICE of its repository). MétéoR Océan Indien: its
 * measures under CC BY-NC 4.0, « l'utilisation systématique […] pour l'alimentation d'une rubrique météorologique » not
 * tolerated without its board's leave (its conditions, read on 29/10/2026); asked by its form on 01/11/2026, it agreed
 * in writing on 09/11/2026 for the wind, the temperature and the rain, rundata.re's use being non-commercial.
 */
export interface LicenceDemandee {
  nom: string;
  organisme: string;
  /** What is read there once it agrees. */
  publie: string;
  /**
   * « retiree » once the source asked for its measures to be taken down after it had agreed: nothing is read nor served
   * of it again, and what was kept of it is erased (scripts/meteor-retrait.ts for MétéoR-OI).
   */
  etat: "demandee" | "accordee" | "refusee" | "retiree";
  /** The day the request went, as given by who sent it: never guessed. */
  demandee_le: string;
  /** The day of its written yes, as given by who received it. */
  accordee_le?: string;
  refusee_le?: string;
  /** The day it asked for its measures to be taken down. */
  retiree_le?: string;
  /** The licence of what is taken, and the conditions of its answer. */
  licence?: string;
  conditions?: string;
}

/** By source: `capteurs:<id>` for a network of sensors (providers/capteurs.ts), `meteo:<id>` for a network of stations. */
export const LICENCES: Record<string, LicenceDemandee> = {
  "capteurs:sensors_social": {
    nom: "sensors.social",
    organisme: "Robonomics",
    publie: "les mesures de particules des capteurs de l'île",
    etat: "accordee",
    demandee_le: "2026-11-08",
    accordee_le: "2026-11-09",
    licence: "ODbL 1.0",
    conditions:
      "le crédit « Sensor data © sensors.social contributors, ODbL 1.0 » avec un lien vers sensors.social et un vers la licence partout où une mesure est dite, " +
      "une lecture par heure au plus pour l'île, un User-Agent qui nomme https://rundata.re et contact@rundata.re",
  },
  "meteo:meteor_oi": {
    nom: "MétéoR Océan Indien",
    organisme: "MétéoR Océan Indien (association)",
    publie: "le vent, la température et la pluie des stations de son réseau",
    etat: "accordee",
    demandee_le: "2026-11-01",
    accordee_le: "2026-11-09",
    licence: "CC BY-NC 4.0",
    conditions:
      "le crédit « Données : MétéoR-OI, licence CC BY-NC 4.0 » avec un lien vers https://www.meteor-oi.re sur la carte, dans la page des sources, à côté de chaque relevé et dans les réponses du connecteur, " +
      "une lecture de chaque page au plus toutes les 5 minutes, un User-Agent qui nomme https://rundata.re et contact@rundata.re\u00a0; " +
      "chaque mesure avec sa station et son heure, aucune station placée plus précisément que sur la carte de l'association, retrait sur simple demande",
  },
};

/** The states in which a source is read. */
export const LISIBLE: readonly string[] = ["accordee", "permise", "publique"];

/** Whether a source may be read: yes for one whose site asks nothing, allows it, or is a commune's public information. */
export const autorisee = (source: string) =>
  LISIBLE.includes(AUTORISATIONS[source]?.etat ?? NON_REPRISES[source]?.etat ?? LICENCES[source]?.etat ?? "accordee");

/** The halls or the sports sites not read until they agree, in the list's order. */
export const nonReprises = (famille: SourceNonReprise["famille"]): SourceNonReprise[] =>
  Object.entries(NON_REPRISES).filter(([k, x]) => x.famille === famille && !autorisee(k)).map(([, x]) => x);

/**
 * A medium or a site whose terms forbid reading it by a program, its titles included: not read at all, and said instead
 * where it was (tools/non-repris.ts). France Télévisions' terms (franceinfo.fr/cgu.html, art. 13.2 and 13.3), read on
 * 26/10/2026, forbid any automated access to extract or reuse the content of its sites, metadata included.
 */
export interface MediaNonRepris {
  nom: string;
  /** Who sets the terms. */
  organisme: string;
  /** The day its terms were read, « 2026-10-26 », and where they are; the day its reading stopped. */
  lues_le: string;
  conditions: string;
  non_lue_depuis: string;
  /** Where its information is, for the reader: its site, and its sport. */
  site: string;
  site_sport?: string;
  /** « a_demander » while no letter has gone: nothing is said of a request. */
  etat: "a_demander" | "demandee" | "accordee" | "refusee";
  /** The day the letter went, as given by who sent it: never guessed. */
  demandee_le?: string;
}

export const MEDIAS: Record<string, MediaNonRepris> = {
  "media:la1ere": {
    nom: "Réunion La 1ère",
    organisme: "France Télévisions",
    lues_le: "2026-10-26",
    conditions: "https://www.franceinfo.fr/cgu.html",
    non_lue_depuis: "2026-10-26",
    site: "https://la1ere.franceinfo.fr/reunion/",
    site_sport: "https://la1ere.franceinfo.fr/sport?r=reunion",
    etat: "a_demander",
  },
  // The tourist board's site (Île de La Réunion Tourisme): its legal notice, dated 01/10/2026 and read on 26/10, forbids
  // reproducing the site or any of its elements without the prior written authorisation of the Comité Réunionnais du
  // Tourisme. Its agenda of the big fêtes and festivals is no longer read.
  "site:reunion_fr": {
    nom: "reunion.fr",
    organisme: "Comité Réunionnais du Tourisme",
    lues_le: "2026-10-26",
    conditions: "https://www.reunion.fr/mentions-legales/",
    non_lue_depuis: "2026-10-26",
    site: "https://www.reunion.fr/organisez/actualites-de-l-ile/agenda/",
    etat: "demandee",
    demandee_le: "2026-10-26",
  },
};
