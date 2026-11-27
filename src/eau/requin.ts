/**
 * The shark rule at sea: the prefect's yearly decree on bathing and wave sports in the 300 m band, and the zones
 * where they stay allowed (lagoons, rock pools, nets, the ZONEX). Fixed data in the package, read by hand: the
 * decree is signed again each February (the next one around 13 February 2027). No feed says whether a net or a
 * ZONEX is open today (the GIP Centre Sécurité Requin tells it in its Instagram and Facebook stories), so an answer
 * never says so: the flag on the spot does, and the answer points to those stories. Once the decree has ended,
 * nothing is said permitted or forbidden on its strength.
 */
import { de } from "../articles.js";
import { distanceKm } from "../geo.js";
import type { SourceInfo } from "../types.js";

export const RAA_URL =
  "https://www.reunion.gouv.fr/Publications/Publications-administratives-et-legales/Recueil-des-actes-administratifs/" +
  "Recueil-des-actes-administratifs-2026/Special-n-35-du-13-fevrier-2026";

export const ARRETE = {
  numero: "180",
  signe: "2026-02-13",
  du: "2026-02-16",
  /** The last day it applies (article 3). */
  au: "2027-02-15",
  recueil: "recueil des actes administratifs spécial n° 35 du 13 février 2026",
  url: RAA_URL,
};

/** The page of its map, the link its written agreement of 27/10/2026 asks for, with « Source : » its name. */
export const CSR_URL = "https://securite-requin.re/section/les-zones-de-pratique";
export const CSR = "GIP Centre Sécurité Requin";
/** Where it announces each day's nets and ZONEX, as its site links them. */
export const STORIES = {
  instagram: "https://www.instagram.com/centresecuriterequin_reunion/",
  facebook: "https://www.facebook.com/centresecuriterequin/",
};

export const SOURCE: SourceInfo = {
  id: "risque_requin",
  nom: `Arrêté préfectoral n° 180 du 13 février 2026 (baignade et activités nautiques, bande des 300 m) et zones du ${CSR}`,
  organisme: `Préfecture de La Réunion\u00a0; ${CSR}`,
  licence: `Information publique (arrêté préfectoral, reunion.gouv.fr)\u00a0; ${CSR} : zones reprises avec son accord écrit du 27/10/2026`,
  attribution: `Préfecture de La Réunion, ${CSR}`,
  url: RAA_URL,
};

/** « filet_ete » : a net put up in the summer only; « bassin_naturel » : a pool the GIP says open again, nothing more. */
export type ZoneType = "lagon" | "bassin" | "bassin_naturel" | "filet" | "filet_ete" | "zonex";

export interface Zone {
  nom: string;
  type: ZoneType;
  commune: string;
  lon: number;
  lat: number;
  /** Who keeps the ZONEX, only where the GIP says so. */
  par?: "BSAN et RESSAC";
  /** What a source says of the watch over the zone, said in place of its kind's line (rule and decree or not). */
  surveillance?: Surveillance;
  /** The days and hours the commune opens it, said in place of its kind's line (rule and decree or not: they come from the commune). */
  horaires?: Horaires;
}

/** A pool's days and hours, from its commune's page, with the order that page cites. */
export interface Horaires {
  /** The days and hours, after « bassin, »; then the swimming it forbids, in its own sentence. */
  ouverture: string;
  interdit: string;
  /** « la commune de Saint-Philippe »: linked to `url` on the pages. */
  source: string;
  url: string;
  /** The order the page cites: « arrêté n° 157/2026 AC du 06/11/2026 », linked to `url` on the pages. */
  arrete: { numero: string; du: string; url: string };
  /** ISO day the page says it was last updated, and the day it was read. */
  page_du: string;
  lu_le: string;
}

/** « aucune » : the commune says nobody watches it. With who says so, its page and the day it was read. */
export interface Surveillance {
  valeur: "aucune";
  /** Its reason, as the source gives it, in brackets after the source. */
  pourquoi: string;
  /** « la commune de Saint-Joseph »: linked to `url` on the pages. */
  source: string;
  url: string;
  /** ISO day the page says it was last updated: said by its year, an old page being told as such. */
  page_du: string;
  /** ISO day the page was read. */
  lu_le: string;
}

/**
 * As the GIP Centre Sécurité Requin lists them: its map (les-zones-de-pratique, read on 27/10/2026) and its written
 * corrections of 27/10/2026, by commune from the north-west to the south-east, each commune's from north to south. The
 * map gives no coordinates: they are ours, from the places' gazetteer (src/places/gazetteer.json).
 */
export const ZONES: Zone[] = [
  { nom: "Filet de la baie de Saint-Paul", type: "filet_ete", commune: "Saint-Paul", lon: 55.2589, lat: -20.9868 },
  { nom: "Piscine naturelle de Boucan-Canot", type: "bassin", commune: "Saint-Paul", lon: 55.2239, lat: -21.0298 },
  { nom: "Boucan-Canot", type: "filet", commune: "Saint-Paul", lon: 55.2239, lat: -21.0298 },
  { nom: "ZONEX de Boucan-Canot", type: "zonex", commune: "Saint-Paul", lon: 55.2239, lat: -21.0298 },
  { nom: "ZONEX des Aigrettes", type: "zonex", commune: "Saint-Paul", lon: 55.217, lat: -21.0364 },
  { nom: "Roches Noires", type: "filet", commune: "Saint-Paul", lon: 55.2232, lat: -21.0529 },
  { nom: "ZONEX des Roches Noires", type: "zonex", commune: "Saint-Paul", lon: 55.2232, lat: -21.0529, par: "BSAN et RESSAC" },
  { nom: "ZONEX des Brisants", type: "zonex", commune: "Saint-Paul", lon: 55.2225, lat: -21.0568, par: "BSAN et RESSAC" },
  { nom: "Lagon de l'Hermitage", type: "lagon", commune: "Saint-Paul", lon: 55.2265, lat: -21.0743 },
  { nom: "ZONEX de l'Hermitage", type: "zonex", commune: "Saint-Paul", lon: 55.2235, lat: -21.0854 },
  { nom: "ZONEX de Trois-Bassins", type: "zonex", commune: "Les Trois-Bassins", lon: 55.2534, lat: -21.1125 },
  { nom: "Lagon de Saint-Leu", type: "lagon", commune: "Saint-Leu", lon: 55.2882, lat: -21.1678 },
  { nom: "ZONEX de Saint-Leu (spots « la passe / le port » et « la Gauche »)", type: "zonex", commune: "Saint-Leu", lon: 55.2882, lat: -21.1678, par: "BSAN et RESSAC" },
  { nom: "L'Étang-Salé", type: "filet", commune: "L'Étang-Salé", lon: 55.3277, lat: -21.2605 },
  { nom: "ZONEX de L'Étang-Salé (spot « le bord »)", type: "zonex", commune: "L'Étang-Salé", lon: 55.3277, lat: -21.2605 },
  { nom: "Lagon de Saint-Pierre", type: "lagon", commune: "Saint-Pierre", lon: 55.4663, lat: -21.342 },
  { nom: "Bassin naturel de Grand-Anse", type: "bassin_naturel", commune: "Petite-Île", lon: 55.5482, lat: -21.37 },
  {
    nom: "Bassin de Manapany", type: "bassin", commune: "Saint-Joseph", lon: 55.5882, lat: -21.3733,
    // « A Saint-Joseph, aucune zone de baignade n'est aménagée […] n'étant pas surveillées, les baignades peuvent être dangereuses. »
    surveillance: {
      valeur: "aucune", pourquoi: "aucune zone de baignade aménagée", source: "la commune de Saint-Joseph",
      url: "https://saintjoseph.re/Zones-de-baignade", page_du: "2013-02-22", lu_le: "2026-11-26",
    },
  },
  {
    // Where the pool is (the bathing water of the ARS and the sports' census agree), not the middle of Le Baril, 1.9 km west.
    nom: "Piscine du Baril les Bains", type: "bassin", commune: "Saint-Philippe", lon: 55.7326, lat: -21.3695,
    // saintphilippe.re, « Piscine de Baril les Bains : jours et horaires d'ouverture », after the order 157/2026 AC of 06/11/2026.
    horaires: {
      ouverture: "ouvert du 1er octobre au 31 mai, du mercredi au samedi (aussi le mardi pendant les vacances scolaires d'octobre à mars), " +
        "de 11:00 à 18:30, jusqu'à 17:30 en avril et en mai\u00a0; fermé du 1er juin au 30 septembre.",
      interdit: "Baignade interdite pendant le remplissage et la vidange du bassin, et dès un avis de forte houle.",
      source: "la commune de Saint-Philippe",
      url: "https://saintphilippe.re/piscine-de-baril-les-bains-jours-et-horaires-douverture/",
      arrete: { numero: "157/2026 AC", du: "2026-11-06", url: "https://publiact.fr/documentPublic/1218895" },
      page_du: "2026-11-24", lu_le: "2026-11-27",
    },
  },
];

/** A beach this close to a zone is told about it. */
export const NEAR_KM = 3;

/** the validated words, as given. */
export const T = {
  regle:
    "À La Réunion, la baignade et les activités de vague (surf, bodyboard, bodysurf, longboard, paddleboard) sont interdites dans la bande des 300 m " +
    "de tout le littoral. Exceptions, dans les conditions fixées par les communes : les lagons et platiers, les espaces aménagés et surveillés, " +
    "et les ZONEX quand elles sont ouvertes et surveillées. Arrêté préfectoral n° 180 du 13/02/2026, en vigueur jusqu'au 15/02/2027.",
  reduit: "Ces zones réduisent le risque requin, elles ne le suppriment pas.",
  intro: `Zones citées par le ${CSR} (securite-requin.re) :`,
  ouverture: "rundata.re ne sait pas si une zone est ouverte aujourd'hui : regardez le drapeau sur place.",
  /** Under the zones of an answer, once one ZONEX is said: what a ZONEX is, said once rather than on each (the size of an answer). */
  zonex: "ZONEX : zone où la baignade et les activités de vague sont permises seulement quand elle est ouverte et surveillée.",
  /** Under the zones, once one kept by the BSAN is said. */
  bsan: "BSAN : Brigade de sécurité des activités nautiques.",
  /** Instagram and Facebook carry the links of STORIES on the pages. */
  stories: `Les filets et les ZONEX déployés dans la journée sont annoncés dans les stories Instagram et Facebook du ${CSR}.`,
  drapeaux: "Pas de drapeau : zone non surveillée, baignade interdite. Flamme requin hissée : baignade interdite sur la zone.",
  source: `Source : ${CSR}`,
  autres: `Le ${CSR} ne cite pas de zone dans les autres communes.`,
  echu:
    "L'arrêté préfectoral n° 180 sur la baignade et les activités de vague a pris fin le 15/02/2027. " +
    "rundata.re n'a pas encore lu celui qui le remplace : vérifiez la règle en vigueur sur reunion.gouv.fr.",
  h2: "Baignade et requins",
  lien: "Toutes les zones et la règle",
};

/**
 * The rule in one sentence, the validated words (20/11) for a place's page, said also in the résumé of temperature_mer and
 * at the top of /mer (24/11/2026): asked about the sea, one hears whether one may swim. While in force only.
 */
export const REGLE_COURTE = "Baignade, surf, bodyboard et paddle sont interdits dans la bande des 300 m de tout le littoral, sauf dans le lagon, " +
  `les espaces aménagés et surveillés, et les ZONEX ouvertes et surveillées (arrêté préfectoral n° ${ARRETE.numero}, jusqu'au ` +
  `${ARRETE.au.split("-").reverse().join("/")}).`;
export const regleCourte = (now: Date): string | undefined => (inForce(now) ? REGLE_COURTE : undefined);

/** Said the same before and after the decree: it comes from the GIP, not from the decree. */
const reopened = (z: Zone) => `${z.nom} : de nouveau ouvert au public, d'après le ${CSR} (27/10/2026).`;

const LINE: Record<ZoneType, (z: Zone) => string> = {
  lagon: (z) => `${z.nom} : lagon, baignade permise dans les conditions fixées par la commune (arrêté préfectoral n° 180, art. 2).`,
  bassin: (z) => `${z.nom} : bassin, baignade permise seulement quand il est ouvert et surveillé.`,
  bassin_naturel: reopened,
  filet: (z) => `${z.nom} : zone de baignade fermée par un filet, permise seulement quand elle est ouverte et surveillée.`,
  filet_ete: (z) => `${z.nom} : filet de baignade ponctuel, déployé en été\u00a0; baignade permise seulement quand il est ouvert et surveillé.`,
  zonex: (z) => `${z.nom} : ZONEX, zone où la baignade et les activités de vague sont permises seulement quand elle est ouverte et surveillée${z.par ? ` (${z.par})` : ""}.`,
};

/** Once the decree has ended: the kind of zone only, nothing permitted on its strength. What the GIP says stays. */
const KIND: Record<ZoneType, (z: Zone) => string> = {
  lagon: (z) => `${z.nom} : lagon.`,
  bassin: (z) => `${z.nom} : bassin.`,
  bassin_naturel: reopened,
  filet: (z) => `${z.nom} : zone de baignade fermée par un filet.`,
  filet_ete: (z) => `${z.nom} : filet de baignade ponctuel, déployé en été.`,
  zonex: (z) => `${z.nom} : ZONEX.`,
};

/** Up to the end of the last day of article 3, in Réunion time (UTC+4). */
export function inForce(now: Date): boolean {
  return now.getTime() < Date.parse(`${ARRETE.au}T00:00:00+04:00`) + 86_400_000;
}

/** The zones near a point, nearest first; with a commune, also every zone of that commune. */
export function zonesNear(lon: number, lat: number, commune?: string): (Zone & { km: number })[] {
  return ZONES.map((z) => ({ ...z, km: distanceKm(lon, lat, z.lon, z.lat) }))
    .filter((z) => z.km <= NEAR_KM || (!!commune && z.commune === commune))
    .sort((a, b) => a.km - b.km);
}

/** Whether T.bsan goes under these zones: once one is said with the BSAN. */
export const saysBsan = (zones: Zone[], now: Date) => inForce(now) && zones.some((z) => z.par);

/**
 * The lines of a list of zones in an answer, then T.zonex and T.bsan if they go under them. A ZONEX's line is its kind
 * only, « ZONEX des Brisants : ZONEX (BSAN et RESSAC). », and T.zonex says once what a ZONEX permits: the same words
 * on every ZONEX made an answer about Saint-Gilles go past its size (bin/check-sources.ts).
 */
export function zoneLines(zones: Zone[], now: Date): string[] {
  const zonex = inForce(now) && zones.some((z) => z.type === "zonex");
  const line = (z: Zone) => (zonex && z.type === "zonex" ? `${z.nom} : ZONEX${z.par ? ` (${z.par})` : ""}.` : zoneLine(z, now));
  return [...zones.map(line), ...(zonex ? [T.zonex] : []), ...(saysBsan(zones, now) ? [T.bsan] : [])];
}

/** « Bassin de Manapany : baignade non surveillée, d'après la commune de Saint-Joseph (aucune zone de baignade aménagée, page de 2013). » */
export const surveillanceLine = (z: Zone & { surveillance: Surveillance }) =>
  `${z.nom} : baignade non surveillée, d'après ${z.surveillance.source} (${z.surveillance.pourquoi}, page de ${z.surveillance.page_du.slice(0, 4)}).`;

/** « arrêté n° 157/2026 AC du 06/11/2026 »: the words linked to the order on the pages. */
export const arreteDe = (h: Horaires) => `arrêté n° ${h.arrete.numero} du ${h.arrete.du.split("-").reverse().join("/")}`;

/** « Piscine du Baril les Bains : bassin, ouvert du 1er octobre […]. Baignade interdite […]. D'après la commune […] (arrêté n° …). » */
export const horairesLine = (z: Zone & { horaires: Horaires }) =>
  `${z.nom} : bassin, ${z.horaires.ouverture} ${z.horaires.interdit} D'après ${z.horaires.source} (${arreteDe(z.horaires)}).`;

export function zoneLine(z: Zone, now: Date): string {
  if (z.surveillance) return surveillanceLine(z as Zone & { surveillance: Surveillance });
  if (z.horaires) return horairesLine(z as Zone & { horaires: Horaires });
  return (inForce(now) ? LINE : KIND)[z.type](z);
}

/** The sources of the zones' watch, for an answer: the page of each, and the day it was read. */
export const surveillances = (zones: Zone[]) =>
  zones.flatMap((z) => (z.surveillance ? [{ zone: z.nom, surveillance: z.surveillance.valeur, source: z.surveillance.source, lien: z.surveillance.url, page_du: z.surveillance.page_du, lu_le: z.surveillance.lu_le }] : []));

/** The days and hours of the zones that have them, for an answer: the commune's page, the order it cites, and the day it was read. */
export const horaires = (zones: Zone[]) =>
  zones.flatMap((z) => (z.horaires ? [{
    zone: z.nom, ouverture: z.horaires.ouverture, interdit: z.horaires.interdit, source: z.horaires.source, lien: z.horaires.url,
    arrete: { numero: z.horaires.arrete.numero, du: z.horaires.arrete.du, lien: z.horaires.arrete.url }, page_du: z.horaires.page_du, lu_le: z.horaires.lu_le,
  }] : []));

/** No zone near the place: where the list comes from, then the rule if it still applies. */
export function noneLine(nom: string, now: Date): string {
  const first = `Aucune zone du ${CSR} près ${de(nom)}.`;
  return inForce(now)
    ? `${first} Hors lagon et espace aménagé et surveillé, la baignade et le surf y sont interdits dans la bande des 300 m (arrêté préfectoral n° 180).`
    : first;
}

/** The rule's paragraph: the decree and what the zones do, or that it has ended. */
export function ruleText(now: Date): string {
  return inForce(now) ? `${T.regle} ${T.reduit}` : T.echu;
}

/** The block of the answers: the rule, the zones (near the place, or all), where the day's zones are told, the flags; never « open today ». */
export function requinBlock(now: Date, near?: { nom: string; lon: number; lat: number; commune?: string }) {
  const zones = near ? zonesNear(near.lon, near.lat, near.commune) : ZONES;
  const watch = surveillances(zones);
  const hours = horaires(zones);
  return {
    regle: ruleText(now),
    zones: zones.length ? [T.intro, ...zoneLines(zones, now), T.ouverture] : noneLine(near!.nom, now),
    ...(watch.length ? { surveillance_des_zones: watch } : {}),
    ...(hours.length ? { horaires_des_zones: hours } : {}),
    deploiements_du_jour: { texte: T.stories, ...STORIES },
    drapeaux: T.drapeaux,
    source_des_zones: { texte: T.source, lien: CSR_URL },
    arrete: inForce(now)
      ? { numero: ARRETE.numero, signe_le: ARRETE.signe, applicable_du: ARRETE.du, au: ARRETE.au, texte: ARRETE.url }
      : { consulter: "https://www.reunion.gouv.fr" },
  };
}
