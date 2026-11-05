/**
 * « Résumé du jour » for a place (resume_du_jour): the weather measured now and forecast for today, the vigilance, the
 * sea, the electricity, the roads and the news of the commune, its water cuts and its events of the day, its town hall
 * and its sun, its market of the day, the state of its déchèteries (TCO), the month's fuel prices and where to find the
 * duty pharmacy, in one call. Cut from the copies the site's pages keep (web/site.ts): only read, never built while the
 * call waits, so a call costs a dozen reads at most. A part without a recent copy is left out and named in
 * `non_inclus`, with the tool that answers it; the oldest of them is brought up to date after the answer when what
 * its build took last time is left of the invocation's subrequests.
 */
import { costOf, left, measured } from "../budget.js";
import type { Cache, Cached } from "../cache.js";
import { distributeur } from "../eau/distributeurs.js";
import { distanceKm, localTime } from "../geo.js";
import { apart, noteLecture } from "../lectures.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import * as atmo from "../providers/atmo.js";
import * as cal from "../providers/calendrier.js";
import { SOLEIL_NOTE } from "./calendrier.js";
import { phases } from "../providers/carburants.js";
import * as sante from "../sante/etablissements.js";
import * as col from "../vie/collecte.js";
import * as dech from "../vie/decheteries.js";
import * as marches from "../vie/marches.js";
import * as mf from "../providers/vigilance.js";
import * as volcanSrc from "../providers/volcan.js";
import { AGENDAS } from "../providers/agenda.js";
import { why } from "../types.js";
import {
  type ActualitesAnswer,
  type AgendaAnswer,
  type AirAnswer,
  type Background,
  buildActualites,
  buildAgenda,
  buildAir,
  buildCalendrier,
  buildCommune,
  buildCoupures,
  buildCourant,
  buildDechets,
  buildElectricite,
  buildPlace,
  buildSea,
  buildTrafic,
  buildVolcan,
  type CalendrierAnswer,
  type CommuneData,
  type CoupuresAnswer,
  type Credit,
  type DechetsAnswer,
  type ElectriciteAnswer,
  FRESH_SECONDS,
  joursDuJour,
  type PlaceData,
  type SeaData,
  snapshot,
  type TraficAnswer,
  type VolcanAnswer,
  withoutForecast,
} from "../web/data.js";
import { anchorOf } from "../web/decheteries.js";
import { coastal, PAGES, type PlacePage } from "../web/places.js";
import { mentionCommune, occurrences, repris, sourcesServies } from "./agenda.js";
import { HORAIRES_A_SAVOIR, hoursOn, openNow } from "./annuaire.js";
import { priceLine } from "./carburants.js";
import { ecoles, resumeLine } from "./ecoles.js";
import { compteAvis, muetPour } from "./coupures.js";
import { aheadRows, type CourantAnswer, followed, injoignable, shortOf } from "./courant.js";
import { mention } from "./non-repris.js";
import { SITE_URL } from "./citer.js";
import { a, ailleurs, credits, de, notFound, placeBlock, placeWarning, text } from "./format.js";
import { coastText, cyclone, forZone, highest, zoneLevels, zoneShort, zoneText } from "./vigilance.js";
import type { InfoRow } from "./actualites.js";
import { ENDS as LITTORAL_ENDS, forSummary, littoral, NONE as LITTORAL_NONE } from "./littoral.js";
import { enTete } from "./representativeness.js";
import { NETWORKS } from "./meteo.js";
import { PRODUCTS as SEA_PRODUCTS } from "./mer.js";
import { alerteVolcan, releaseDay } from "../web/volcan-alerte.js";

// How old an announcement of the route du Littoral may be to be told in a summary.
const LITTORAL_SUMMARY_HOURS = 12;

/** The copies a summary is cut from, each null or missing when there is none recent enough. */
export interface ResumeCopies {
  meteo?: Cached<PlaceData> | null;
  commune?: Cached<CommuneData> | null;
  vigilance?: Cached<mf.Vigilance> | null;
  air?: Cached<AirAnswer> | null;
  mer?: Cached<SeaData> | null;
  electricite?: Cached<ElectriciteAnswer> | null;
  actualites?: Cached<ActualitesAnswer> | null;
  trafic?: Cached<TraficAnswer> | null;
  coupures?: Cached<CoupuresAnswer> | null;
  agenda?: Cached<AgendaAnswer> | null;
  calendrier?: Cached<CalendrierAnswer> | null;
  dechets?: Cached<DechetsAnswer> | null;
  courant?: Cached<CourantAnswer> | null;
  volcan?: Cached<VolcanAnswer> | null;
}
type Part = Exclude<keyof ResumeCopies, "vigilance">;
/** A part left out of the summary, why, and the tool that answers it. */
export interface LeftOut {
  partie: string;
  raison: string;
  outil: string;
  /** The page of rundata.re that shows it. */
  page: string;
}

interface Copy {
  key: string;
  build: (cache: Cache, now: Date) => Promise<unknown>;
  /** How old a copy may be and still say something of today, in minutes. */
  max: number;
  /** A copy of another day says nothing of today: an air index, the events, the holidays. */
  sameDay?: boolean;
  /** What the part is, for `non_inclus`, and the tool that answers it. */
  nom: string;
  outil: string;
  /** Its page on the site, from the root. */
  page: string;
}

const H = 60;
const SEA = "température de la mer";

/** The copies of the commune's summary, for a place with its own weather page or not. */
function copiesOf(commune: PlacePage, place: PlacePage): Record<Part, Copy | undefined> {
  return {
    meteo: { key: `web:lieu:${place.slug}`, build: (c, now) => buildPlace(c, place, now), max: 30, nom: "météo mesurée et prévue", outil: "meteo_actuelle et prevision_meteo", page: `/meteo/${place.slug}` },
    commune: { key: `web:commune:${commune.slug}`, build: (c, now) => buildCommune(c, commune, now), max: 24 * H, nom: "mairie et info trafic des bus", outil: "annuaire_services_publics et transports", page: `/communes/${commune.slug}` },
    air: { key: "web:air", build: buildAir, max: 12 * H, sameDay: true, nom: "qualité de l'air", outil: "qualite_air", page: "/air" },
    mer: coastal(commune) ? { key: "web:mer", build: buildSea, max: 36 * H, nom: SEA, outil: "temperature_mer", page: "/mer" } : undefined,
    electricite: { key: "web:electricite", build: buildElectricite, max: H, nom: "électricité", outil: "electricite", page: "/electricite" },
    actualites: { key: "web:actualites", build: buildActualites, max: 2 * H, nom: "actualités de la commune", outil: "actualites", page: "/actualites" },
    trafic: { key: "web:trafic", build: buildTrafic, max: 2 * H, nom: "routes, circulation et prix des carburants", outil: "actualites (sujet routes) et annuaire_services_publics (carburants)", page: "/trafic" },
    coupures: { key: "web:coupures", build: buildCoupures, max: 3 * H, nom: "coupures d'eau", outil: "coupures_eau", page: `/coupures-eau/${commune.slug}` },
    agenda: { key: "web:agenda", build: buildAgenda, max: 24 * H, sameDay: true, nom: "événements du jour", outil: "evenements", page: "/evenements" },
    calendrier: { key: "web:calendrier", build: buildCalendrier, max: 24 * H, sameDay: true, nom: "jour férié et vacances", outil: "calendrier", page: "/calendrier" },
    // Only the TCO publishes the state of its skips: the other communes have no such part.
    dechets: dech.TCO_COMMUNES.includes(commune.nom)
      ? { key: "web:dechets", build: buildDechets, max: 3 * H, nom: "état des déchèteries", outil: "annuaire_services_publics", page: `/decheteries#${anchorOf(commune.nom)}` }
      : undefined,
    // Only the mairies that relay EDF's notices: elsewhere nothing is said, rather than the same « we do not know » each day.
    courant: followed(commune.nom)
      ? { key: "web:courant", build: (cache) => buildCourant(cache), max: 6 * H, nom: "coupures d'électricité relayées par la mairie", outil: "electricite", page: "/electricite#coupures" }
      : undefined,
    // The communes of the volcano: the Enclos and the RN2 of the lava flows (Sainte-Rose, Saint-Philippe), the road of
    // the volcano (Le Tampon), the south flank (Saint-Joseph). Elsewhere the volcano is not the day's news.
    volcan: VOLCANO_COMMUNES.includes(commune.nom)
      ? { key: "web:volcan", build: buildVolcan, max: 3 * H, nom: "volcan", outil: "volcan_seismes", page: "/volcan" }
      : undefined,
  };
}

/** The communes whose summary says the volcano's state (copiesOf). */
export const VOLCANO_COMMUNES = ["Sainte-Rose", "Saint-Philippe", "Le Tampon", "Saint-Joseph"];

const COMMUNES = PAGES.filter((p) => p.commune);
const localDay = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const hhmm = (d: Date) => localTime(d).split(" ")[1];
const DAY_FR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Reunion", weekday: "long", day: "numeric", month: "long" });
// The news of the roads: their subjects (actualites), and how far back a headline still says something of today.
const ROADS = ["route", "mobilisation"];
const NEWS_HOURS = 12;
const NEWS_MAX = 4;
const EVENTS_MAX = 10;
// A build whose cost was measured neither in this isolate nor with its copy is taken to cost this much (web/site.ts
// does the same).
const COST_UNKNOWN = 25;

/**
 * « 1 avis de coupure d'eau », the other notices (quality, return to normal) and those saying not to drink the water
 * apart: neither is a cut (tools/coupures.ts, compteAvis).
 */
function waterCount(avis: { titre: string; coupure?: unknown; ne_pas_boire?: boolean }[]): string {
  const c = compteAvis(avis);
  const parts = [
    c.coupures ? `${c.coupures} avis de coupure d'eau` : "",
    c.autres ? `${c.autres} ${c.coupures ? `autre${c.autres > 1 ? "s" : ""} ` : ""}avis sur l'eau` : "",
    c.ne_pas_boire ? `${c.ne_pas_boire} avis d'eau à ne pas boire dans les secteurs ${c.ne_pas_boire > 1 ? "des avis" : "de l'avis"}` : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, et ${parts.at(-1)}` : parts.join("");
}

const MARKETS_NOT_ALL = "D'après OpenStreetMap et les sites des mairies qui permettent de les reprendre : tous les marchés n'y sont pas, et les jours peuvent avoir changé.";
const NO_DUTY = "rundata.re ne sait pas quelle pharmacie est de garde : seuls 3237.fr et le 32 37 le disent.";
const FUEL_NOTE = "Prix maximum fixés chaque mois par le préfet, les mêmes dans toute l'île.";

/** « sans plomb 2,00 €/L, gazole 1,80 €/L », as marketing words the prices everywhere. */
function fuelShort(p: { produits: { produit: string; prix_eur: number }[] }): string {
  const litre = (re: RegExp, nom: string) => {
    const x = p.produits.find((y) => re.test(y.produit));
    return x ? `${nom} ${x.prix_eur.toFixed(2).replace(".", ",")} €/L` : "";
  };
  return [litre(/^supercarburant$/i, "sans plomb"), litre(/^gazole$/i, "gazole")].filter(Boolean).join(", ");
}

const NO_JAMS = "rundata.re ne mesure pas les bouchons : voir la carte officielle des bouchons, accidents et travaux sur https://www.infotrafic.re/ (Région Réunion), et https://rundata.re/trafic.";

/**
 * Why a part is left out when its copy was built by another revision (cache.ts, `outdated`): what it holds may be what
 * the code no longer allows (an event of an agenda since left unread), so it is not served, and is built again.
 */
export const UPDATING = "se met à jour, réessayer dans quelques minutes";

/**
 * Today's holiday and school holidays, and tomorrow's holiday: on the eve of All Saints' Day (31/10/2026) the block was
 * empty while calendrier said it. Undefined when there is nothing to say. The copy is today's (`sameDay`).
 */
function calendrierDuJour(c: CalendrierAnswer) {
  const out = {
    jour_ferie: c.jours_feries?.aujourd_hui ?? undefined,
    jour_ferie_demain: c.jours_feries?.prochains?.find((p) => p.dans_jours === 1)?.nom,
    vacances_scolaires: c.vacances_scolaires?.en_cours?.nom,
  };
  return Object.values(out).some((v) => v != null) ? out : undefined;
}

/** Whether a copy is recent enough for the summary of today. */
function usable(c: Copy, copy: Cached<unknown> | null | undefined, now: Date): copy is Cached<unknown> {
  if (!copy) return false;
  if (now.getTime() - copy.fetchedAt.getTime() > c.max * 60_000) return false;
  return !c.sameDay || localDay(copy.fetchedAt) === localDay(now);
}

function weather(d: PlaceData, fetchedAt: Date, now: Date) {
  // A station far below or on the other side says little of the place: one that stands for it, when there is one.
  const s = enTete(d.meteo?.stations);
  // From today's, a copy of before midnight starting with yesterday (web/data.ts).
  const jours = joursDuJour(d.prevision?.jours, fetchedAt, now);
  // In the evening, tomorrow too: what is left of today is short.
  const evening = new Date(now.getTime() + 4 * 3600_000).getUTCHours() >= 17;
  if (!s && !jours.length) return undefined;
  return {
    mesure: s
      ? { station: s.station, commune: s.commune, altitude_m: s.altitude_m, distance_km: s.distance_km, heure_mesure: s.heure_mesure, mesures: s.mesures, avertissements: s.avertissements.length ? s.avertissements : undefined }
      : undefined,
    prevision: jours.length
      ? { avertissement: "PRÉVISION de modèle, pas une mesure.", aujourd_hui: jours[0], demain: evening ? jours[1] : undefined, modele: d.prevision?.modele?.nom }
      : undefined,
  };
}

function vigilance(p: PlacePage, v: mf.Vigilance, now: Date) {
  // The zone of Météo-France, as its own, the commune only said to be in it: never a colour given to a commune.
  const zone = mf.ZONE_OF_COMMUNE[p.nom];
  const name = zoneShort(zone);
  const cyc = v.zones[mf.ISLAND]?.[mf.CYCLONE] ?? [];
  const alert = highest(cyc) >= 2;
  return {
    zone: name || undefined,
    // « Vigilance météo : verte pour l'Ouest (Météo-France), la zone de Saint-Paul. », « la zone du Tampon »: the zone named, never the commune coloured.
    maintenant: `Vigilance météo : ${zoneText(v, zone, now)} ${forZone(name)} (Météo-France), la zone ${de(p.nom)}.`,
    au_dessus_du_vert: zoneLevels(v, zone, now).above.length > 0,
    vagues_submersion: coastal(p) ? coastText(v) : undefined,
    alerte_cyclonique: alert ? cyclone(v, now) : undefined,
    /** The schools closed by the cyclone alert in force, in marketing's words (tools/ecoles.ts). */
    ecoles: resumeLine(ecoles(v, now)),
    emise: localTime(new Date(v.emise)),
    officiel: mf.officiel(alert ? mf.OFFICIEL_CYCLONE : mf.OFFICIEL_VIGILANCE),
  };
}

/** The water's temperature off the commune, and the sources of that copy (the sea's page, or else the weather page's). */
function sea(p: PlacePage, mer: SeaData | undefined, place: PlaceData | undefined) {
  const beaches = mer?.plages.filter((b) => b.commune === p.nom && b.valeur != null) ?? [];
  if (beaches.length) {
    const v = beaches.map((b) => b.valeur!);
    const [lo, hi] = [Math.round(Math.min(...v)), Math.round(Math.max(...v))];
    const row = { temperature_eau: lo === hi ? `${lo} °C` : `${lo} à ${hi} °C`, au_large_de: beaches.map((b) => b.nom), jour_mesure: beaches.map((b) => b.jour!).sort().pop(), mesure: "satellite" };
    return { row, sources: seaSources(mer!.sources) };
  }
  const m = place?.mer?.mesure;
  return m ? { row: { temperature_eau: m.temperature_eau, jour_mesure: m.jour_mesure, mesure: "satellite, au large" }, sources: seaSources(place!.mer!.sources) } : undefined;
}

const SATELLITES = SEA_PRODUCTS.map((x) => x.source.nom);

/**
 * The summary gives the water's temperature only, a measure by satellite: the satellites' sources, not the forecast of
 * the waves nor the tide gauges of /mer. A copy whose list names no satellite keeps it whole (rule 3, never fewer).
 */
function seaSources(all: Credit[] | undefined): Credit[] | undefined {
  const own = all?.filter((c) => SATELLITES.includes(c.source)) ?? [];
  return own.length ? own : all;
}

/**
 * The commune's ATMO index only: Atmo Réunion's, not the measures at the stations nor the amateur sensors, which the
 * summary does not give; nothing when the commune has no index in the copy. A list without the index's keeps it whole.
 */
function airSources(shown: boolean, all: Credit[] | undefined): Credit[] | undefined {
  if (!shown) return undefined;
  const own = all?.filter((c) => c.source === atmo.SOURCE.nom) ?? [];
  return own.length ? own : all;
}

/**
 * The volcano's state for a commune of the volcano (VOLCANO_COMMUNES), from the copy of /volcan, whose level and
 * eruption are the official texts' alone (tools/volcan.ts): the ORSEC level and who gives it, the eruption when one is
 * under way, the prefecture's release. pitonlive.com is never here, as on the banner of the pages (web/volcan-alerte.ts).
 */
function volcano(v: VolcanAnswer) {
  const e = v.etat;
  if (!e || typeof e !== "object") return undefined;
  const a = alerteVolcan(v);
  const niveau = e.niveau_inconnu ? undefined : e.niveau_orsec;
  const by = e.niveau_ovpf ? "OVPF" : "préfecture";
  const eruption = a?.eruption === true;
  const eruptionBy = e.eruption_ovpf?.en_cours ? "OVPF" : "préfecture";
  const c = e.communique_prefecture;
  return {
    texte: `volcan : ${eruption ? `éruption en cours (${eruptionBy}), ` : ""}${niveau ? `niveau ${niveau} du plan ORSEC (${by})` : `niveau du plan ORSEC ${e.niveau_orsec}`}`,
    bloc: {
      niveau_orsec: e.niveau_orsec,
      niveau_d_apres: niveau ? (by === "OVPF" ? volcanSrc.OVPF.organisme : "préfecture de La Réunion") : undefined,
      eruption_en_cours: eruption ? `oui, d'après ${eruptionBy === "OVPF" ? "l'OVPF" : "la préfecture"}` : undefined,
      alerte: !!a,
      communique_prefecture: c ? { titre: c.titre, lien: c.lien, jour: releaseDay(c) } : undefined,
      ovpf: e.niveau_ovpf ?? (e.eruption_ovpf?.en_cours ? { date: e.eruption_ovpf.date, lien: e.eruption_ovpf.lien } : undefined),
      page: `${SITE_URL}/volcan`,
    },
  };
}

/** The volcano's sources: the prefecture's and the OVPF's texts, not the seismic catalogue nor pitonlive.com. */
function volcanoSources(all: Credit[] | undefined): Credit[] | undefined {
  const own = all?.filter((c) => c.source === volcanSrc.PREFECTURE.nom || c.source === volcanSrc.OVPF.nom) ?? [];
  return own.length ? own : all;
}

// The ATMO index of the summary is Atmo Réunion's forecast for the day (qualite_air says the same).
const AIR_NATURE = "PRÉVISION du jour, calculée par Atmo Réunion : pas une mesure.";

/**
 * Today is a holiday: the town hall's published hours are a week's, so it is said probably closed, never « ouverte »
 * (11/11/2026 would have said it open at 10:00 in the 24 communes).
 */
const holidayText = (nom: string) => `Aujourd'hui est férié (${nom}) : la mairie est sans doute fermée, à vérifier auprès d'elle.`;

/** « 1,5 km », « 11 km ». */
const km = (d: number) => (d < 10 ? `${d.toFixed(1).replace(".", ",")}\u00a0km` : `${Math.round(d)}\u00a0km`);

const newsRow = (i: ActualitesAnswer["infos"][number]) => ({ quand: i.quand, media: i.media, titre: i.titre, lien: i.lien });

/**
 * The sources of the weather shown, never those of what the summary does not say: the network of the station given
 * (Météo-France for a station of Météo-France, not the airports' METAR nor the wind beacons), and the forecast's when a
 * day of it is given. The radar is not in the summary. Rule 3: what is credited is what the answer holds.
 */
function weatherSources(d: PlaceData | undefined, w: ReturnType<typeof weather>): Credit[] {
  if (!d || !w) return [];
  const all = d.meteo?.sources ?? [];
  const s = w.mesure ? enTete(d.meteo?.stations) : undefined;
  const network = s && NETWORKS.find((n) => n.id === s.source)?.nom;
  const own = network ? all.filter((c) => c.source === network) : [];
  // A measure shown whose network is not told (no station, an id NETWORKS lacks, a list without it): every network, as
  // for an agenda not told, never a measure credited to no one.
  return [...(w.mesure ? (own.length ? own : all) : []), ...(w.prevision ? (d.prevision?.sources ?? []) : [])];
}

/**
 * The agendas of the events the summary gives, not every agenda of the island read for /evenements: an event is
 * credited to the agenda that publishes it (its `publie_par`). One whose agenda is not told (proposed on rundata.re, read
 * on an association's platform, its state from the news) keeps the whole list, never fewer sources than the answer holds.
 */
function agendaSources(events: { publie_par: string; statut_d_apres?: unknown }[], all: Credit[] | undefined): Credit[] | undefined {
  if (!events.length) return undefined;
  const of = events.map((e) => (e.statut_d_apres ? [] : AGENDAS.filter((a) => a.nom === e.publie_par)));
  if (of.some((x) => !x.length)) return sourcesServies(all);
  return sourcesServies(credits(of.flat().map((a) => a.source)));
}

/** Every source the parts used, once each. */
function sourcesOf(lists: (Credit[] | undefined)[]): Credit[] {
  const seen = new Set<string>();
  return lists.flat().filter((c): c is Credit => !!c && !seen.has(c.source) && !!seen.add(c.source));
}

export type Resume = ReturnType<typeof resume>;

/**
 * The summary of one commune, from the copies given (each recent enough, or missing): what the tool answers and the
 * page shows. The weather is that of the place asked when it has its own page (Maïdo, Hell-Bourg), else the commune's.
 * `lieu`: the place asked when it is not the commune and has no weather page of its own (a beach, a quarter): the
 * weather given is the commune's centre's, said with how far it is from the place (Boucan Canot, 04/11/2026: the
 * station and its distance were the centre of Saint-Paul's, 11 km away, and the forecast's rain 8 times the beach's).
 */
export function resume(commune: PlacePage, l: ResumeCopies, now: Date, leftOut: LeftOut[] = [], lieu?: { nom: string; lon: number; lat: number }) {
  const today = localDay(now);
  const nom = commune.nom;
  const w = l.meteo ? weather(l.meteo.value, l.meteo.fetchedAt, now) : undefined;
  const away = lieu && w ? distanceKm(commune.place.lon, commune.place.lat, lieu.lon, lieu.lat) : 0;
  const centre = lieu && away >= 1 ? `météo du centre ${de(nom)}, à ${km(away)} de ${lieu.nom}` : undefined;
  const meteo = w && centre
    ? { ...w, lieu: `centre ${de(nom)}`, avertissement: `Météo du centre ${de(nom)}, à ${km(away)} de ${lieu!.nom} : la station, sa distance et la prévision sont celles du centre. Pour ${lieu!.nom} même : meteo_actuelle et prevision_meteo.` }
    : w;
  const news = [...(l.actualites?.value.en_direct ?? []), ...(l.actualites?.value.infos ?? [])]
    .filter((i) => i.communes?.includes(nom) && now.getTime() - Date.parse(i.publie) < NEWS_HOURS * 3600_000);
  const roads = news.filter((i) => i.sujets?.some((s) => ROADS.includes(s)));
  const others = news.filter((i) => !roads.includes(i));
  // At either end of the route du Littoral, its announcement of the last hours: from the news already read, none older.
  const asRead = (r: InfoRow) => ({ ...r, heure: r.il_y_a != null });
  const read = l.actualites && {
    infos: [...l.actualites.value.en_direct, ...l.actualites.value.infos].map(asRead),
    prefecture: l.actualites.value.prefecture.map((r) => ({ ...r, heure: false })),
  };
  // None in the last hours: said so (marketing's words) when the copy reaches that far back, a copy cut short
  // (NEWS_LISTED, web/data.ts) could have left one out; and not when an older one was read, which is not « none ».
  const covered = !!read && read.infos.some((i) => now.getTime() - Date.parse(i.publie) >= LITTORAL_SUMMARY_HOURS * 3600_000);
  const road = LITTORAL_ENDS.includes(nom) && read
    ? forSummary(littoral(read, now, LITTORAL_SUMMARY_HOURS), now) ?? (covered && !littoral(read, now) ? LITTORAL_NONE : undefined)
    : undefined;
  const avis = l.coupures?.value.avis.filter((n) => n.communes.includes(nom)) ?? [];
  const dist = distributeur(nom);
  // Its distributor's feed did not answer at the last read (tools/coupures.ts).
  const waterSilent = dist?.avis ? muetPour(l.coupures?.value.injoignable, nom) : undefined;
  const events = (l.agenda?.value.evenements ?? []).filter((r) => r.commune === nom && repris(r) && occurrences(r).some((o) => o.du <= today && today <= o.au));
  const mairie = l.commune?.value.mairie;
  const open = mairie ? openNow(mairie, now) : null;
  // Today's holiday, from the calendar's copy of today (sameDay); none known without it.
  const ferie = l.calendrier?.value.jours_feries?.aujourd_hui ?? undefined;
  const volc = l.volcan && VOLCANO_COMMUNES.includes(nom) ? volcano(l.volcan.value) : undefined;
  const notRead = mentionCommune(nom);
  const sun = cal.sun(today, commune.place.lon, commune.place.lat, cal.horizonDe(commune.place));
  const prod = l.electricite?.value.production;
  const airHere = l.air?.value.communes?.find((x) => normalize(x.commune) === normalize(nom));
  const c = l.calendrier?.value;
  const v = l.vigilance ? vigilance(commune, l.vigilance.value, now) : undefined;
  // Without the sea's page, the weather page's own reading of the sea, when it has one: then the sea is not left out.
  const seaPart = coastal(commune) ? sea(commune, l.mer?.value, l.meteo?.value) : undefined;
  const mer = seaPart?.row;
  const out = mer ? leftOut.filter((x) => x.partie !== SEA) : leftOut;
  // Held today, then those open all week, then those whose days no source gives, with the town hall's page.
  const markets = marches.heldOn(nom, now);
  const allWeek = marches.apart(nom, now);
  const noDays = marches.sansJours(nom);
  const townHall = marches.lienMairie(nom);
  // A town hall's market says where it comes from, and the date of its page when it gives one.
  const by = (m: marches.Lieu) =>
    m.source === marches.OSM ? undefined : `site de la mairie ${de(m.commune)}${m.source.date ? ` (page du ${marches.dayMonthYear(m.source.date)})` : ""}`;
  const marketSources = [...new Set([...markets, ...allWeek, ...noDays].map((m) => m.source))];
  // The prices of another month are not this month's; an order read before its 1st is not in force yet.
  const fuel = l.trafic?.value.carburants;
  const inForce = fuel && phases(fuel, now).vigueur;
  const prices = inForce && inForce.depuis.slice(0, 7) === today.slice(0, 7) ? inForce : undefined;
  // A site's state older than its staff's last round says nothing of now (vie/decheteries.ts).
  const sites = l.dechets && dech.TCO_COMMUNES.includes(nom) ? dech.sitesNow(l.dechets.value.etats, now).filter((s) => s.commune === nom) : undefined;
  const fresh = sites?.filter((s) => s.a_jour) ?? [];
  const green = fresh.filter((s) => s.accepte.includes("déchets verts")).length;
  const power = l.courant && followed(nom) ? aheadRows(l.courant.value, nom, now) : [];
  // A mairie not read until it agrees: what is said instead (tools/non-repris.ts).
  const powerNotRead = mention("courant", nom);
  // Its site did not answer at the last read: said, never left as no cut (tools/courant.ts).
  const powerSilent = l.courant ? injoignable(l.courant.value, nom, localTime(l.courant.fetchedAt), now) : undefined;

  const t = meteo?.mesure?.mesures.temperature;
  const f = meteo?.prevision?.aujourd_hui;
  const bins = col.COMMUNES.includes(nom);
  const resumeText = [
    `${nom}, ${DAY_FR.format(now)}`,
    centre ?? "",
    t ? `${t} mesurés à ${meteo!.mesure!.heure_mesure.split(" ")[1] ?? meteo!.mesure!.heure_mesure} (station ${meteo!.mesure!.station}${ailleurs(meteo!.mesure!, nom)})` : "",
    f?.temperature_min && f.temperature_max
      ? `${f.periode ? `prévision ${f.periode}\u00a0: ` : "prévision du jour "}${f.temperature_min} à ${f.temperature_max}${f.ciel_en_journee ? `, ${f.ciel_en_journee}` : ""}`
      : "",
    v ? `${v.maintenant.replace(/\.$/, "")}${v.alerte_cyclonique ? `, ${v.alerte_cyclonique}` : ""}` : "",
    v?.ecoles ? v.ecoles.replace(/\.$/, "") : "",
    volc?.texte ?? "",
    l.coupures ? (avis.length ? `${waterCount(avis)}${waterSilent ? ` (${waterSilent.court})` : ""}` : waterSilent ? `coupures d'eau : ${waterSilent.court}` : dist?.avis ? "pas de coupure d'eau annoncée" : "") : "",
    // None found is not none held: the agendas read are not all of them, the commune's own site may not be read at all.
    l.agenda
      ? events.length
        ? `${events.length} événement${events.length > 1 ? "s" : ""} aujourd'hui`
        : `aucun événement trouvé aujourd'hui dans les agendas lus (incomplets${notRead ? ", sans le site de la commune" : ""})`
      : "",
    roads.length ? `${roads.length} info${roads.length > 1 ? "s" : ""} sur les routes ou des blocages` : "",
    power.length ? shortOf(power[0], now) : "",
    markets.length ? `marché aujourd'hui : ${markets.map((m) => `${m.nom} ${m.horaires_aujourd_hui}`).join(", ")}` : "",
    prices && fuelShort(prices) ? `carburants (prix maximum) : ${fuelShort(prices)}` : "",
    fresh.length ? `déchets verts acceptés dans ${green} déchèterie${green > 1 ? "s" : ""} sur ${fresh.length}` : "",
    bins ? `collecte des déchets : le jour de votre rue sur rundata.re/collecte/${col.communeSlug(nom)}` : "",
    "pharmacie de garde : 3237.fr",
  ].filter(Boolean).join("\u00a0; ") + ".";

  return {
    commune: nom,
    resume: resumeText,
    meteo,
    vigilance: v,
    mer,
    volcan: volc?.bloc,
    air: airHere ? { nature: AIR_NATURE, jour: `${today.slice(8, 10)}/${today.slice(5, 7)}`, diffusion: l.air!.value.diffusion, indice_atmo: airHere.niveau, qualite: airHere.qualite, polluants: airHere.polluants.length ? airHere.polluants : undefined } : undefined,
    electricite: prod
      ? { heure: prod.heure_mesure, renouvelable_pct: prod.renouvelable_pct, total_mw: prod.total_mw, signal: l.electricite!.value.meteo_electricite?.maintenant?.signal, signal_mis_a_jour: l.electricite!.value.meteo_electricite?.mis_a_jour }
      : undefined,
    circulation: {
      mesure_des_bouchons: NO_JAMS,
      carte_officielle: "https://www.infotrafic.re/",
      route_du_littoral: road,
      infos_routes: l.actualites ? roads.slice(0, NEWS_MAX).map(newsRow) : undefined,
      routes_ile: l.trafic?.value.medias?.length ? l.trafic.value.medias.slice(0, 3) : undefined,
      bus: l.commune?.value.bus?.alertes?.length ? l.commune.value.bus.alertes : undefined,
    },
    actualites: l.actualites ? others.slice(0, 3).map(newsRow) : undefined,
    coupures_eau: l.coupures
      ? {
          avis: avis.map((n) => ({ titre: n.titre, coupure: n.coupure, secteurs: n.secteurs, secteurs_complets: n.secteurs_complets, ne_pas_boire: n.ne_pas_boire, lien: n.lien })),
          distributeur: dist?.nom,
          note: avis.length || dist?.avis ? undefined : `Les avis du distributeur ${a(nom)} ne sont pas lus par rundata.re : voir la mairie.`,
          injoignable: waterSilent && { texte: waterSilent.texte, site: waterSilent.site },
        }
      : undefined,
    evenements_du_jour: l.agenda
      ? {
          liste: events.slice(0, EVENTS_MAX).map((r) => ({ titre: r.titre, quand: r.quand, lieu: r.lieu, prix: r.prix, statut: r.statut, lien: r.lien, source: r.source })),
          autres: events.length > EVENTS_MAX ? events.length - EVENTS_MAX : undefined,
          aucun: events.length ? undefined : "Aucun événement trouvé aujourd'hui dans les agendas que lit rundata.re : ils sont incomplets, ce n'est pas la preuve qu'il ne se passe rien.",
          non_repris: notRead,
        }
      : undefined,
    calendrier: c ? calendrierDuJour(c) : undefined,
    soleil: { lever: hhmm(sun.lever), coucher: hhmm(sun.coucher), note: SOLEIL_NOTE },
    mairie: mairie
      ? {
          ouverte: ferie ? null : open,
          jour_ferie: ferie ? holidayText(ferie) : undefined,
          horaires_aujourd_hui: ferie ? undefined : hoursOn(mairie, now) ?? (open === null ? undefined : "fermée aujourd'hui"),
          adresse: mairie.adresse,
          telephone: mairie.telephone,
          avertissement: HORAIRES_A_SAVOIR,
        }
      : undefined,
    coupures_electricite: power.length || powerSilent ? { avis: power.length ? power : undefined, injoignable: powerSilent && { texte: powerSilent.texte, site: powerSilent.site } } : powerNotRead ? { non_repris: powerNotRead } : undefined,
    marches_du_jour: markets.length || allWeek.length || noDays.length || townHall
      ? {
          liste: markets.map((m) => ({ nom: m.nom, horaires_aujourd_hui: m.horaires_aujourd_hui, adresse: m.adresse ?? undefined, lien: m.lien, carte: m.osm, source: m.source.nom, d_apres: by(m) })),
          permanents: allWeek.length ? allWeek.map((m) => ({ nom: m.nom, horaires: m.horaires, horaires_aujourd_hui: m.horaires_aujourd_hui, adresse: m.adresse ?? undefined, lien: m.lien, carte: m.osm, source: m.source.nom, d_apres: by(m) })) : undefined,
          jours_non_trouves: noDays.length ? noDays.map((m) => ({ nom: m.nom, adresse: m.adresse ?? undefined, lien: m.lien, carte: m.osm })) : undefined,
          mairie: townHall ? { texte: `Jours et horaires des marchés : site de la mairie ${de(nom)}`, site: townHall } : undefined,
          avertissement: MARKETS_NOT_ALL,
        }
      : undefined,
    decheteries: sites
      ? {
          sites: sites.map((s) => ({
            nom: s.nom,
            mis_a_jour: s.mis_a_jour,
            etat: s.a_jour ? "à jour" : s.mis_a_jour ? `dernière mise à jour à ${s.mis_a_jour}, à vérifier sur place` : "pas de mise à jour",
            accepte: s.a_jour ? s.accepte : undefined,
            benne_pleine: s.a_jour ? s.refuse : undefined,
          })),
          page: `${SITE_URL}/decheteries#${anchorOf(nom)}`,
        }
      : undefined,
    // The days change from a street to the next: the commune's page, never « collecte aujourd'hui » (marketing).
    collecte_dechets: bins ? { texte: `Collecte des déchets : le jour de votre rue sur rundata.re/collecte/${col.communeSlug(nom)}.`, page: `${SITE_URL}/collecte/${col.communeSlug(nom)}` } : undefined,
    carburants: prices ? { prix_maximum: fuelShort(prices) || undefined, prix_maximums: prices.produits.map(priceLine), depuis: prices.depuis, a_savoir: FUEL_NOTE, lien: fuel!.lien } : undefined,
    pharmacie_de_garde: { site: sante.GARDE.site, telephone: sante.GARDE.telephone, quand: sante.GARDE.quand, a_savoir: NO_DUTY },
    non_inclus: out.length ? out : undefined,
    sources: sourcesOf([
      weatherSources(l.meteo?.value, meteo), l.vigilance ? credits([mf.SOURCE]) : undefined, airSources(!!airHere, l.air?.value.sources), seaPart?.sources,
      l.electricite?.value.sources, l.actualites?.value.sources, l.trafic?.value.sources, l.coupures?.value.sources, agendaSources(events, l.agenda?.value.sources), l.calendrier?.value.sources,
      l.commune?.value.sources, l.dechets?.value.sources, volc ? volcanoSources(l.volcan!.value.sources) : undefined, power.length ? l.courant!.value.sources : undefined, marketSources.length ? credits(marketSources) : undefined, credits([sante.ARS_GARDE]),
    ]),
  };
}

/** The commune of a place, and its own weather page when it has one. */
export function placeOf(lieu: string): { commune: PlacePage; place: PlacePage; res: NonNullable<ReturnType<typeof resolvePlace>> } | undefined {
  const res = resolvePlace(lieu);
  const commune = res && COMMUNES.find((p) => p.nom === res.lieu.commune);
  if (!res || !commune) return undefined;
  const own = PAGES.find((p) => p.place.nom === res.lieu.nom && p.place.commune === res.lieu.commune);
  return { commune, place: own ?? commune, res };
}

/** A copy a view may bring up to date after its answer. */
export interface Stale {
  key: string;
  build: () => Promise<unknown>;
  /** Its age, ms; Infinity without a copy. */
  age: number;
  /** Built by another revision of its family (cache.ts, `outdated`). */
  outdated?: boolean;
  /** What its build took where it was built, from its copy. */
  cost?: number;
}

/**
 * Brings these copies up to date after the answer: every one of another revision, then the oldest of the others. After
 * a deploy that raised several families, a page seldom seen would otherwise take a view for each: on 26/10/2026, the
 * first view of /aujourdhui/le-tampon after the deploy rebuilt the electricity's copy, and the events stayed « Se met à
 * jour » until the next one, eleven minutes later. Each only while what its build took last time (`costOf`, else its
 * copy's, else `unknown`) is left, counted with the builds started before it: one that does not fit waits for a later
 * view. The keys of the builds started.
 */
export function refresh(cache: Cache, stale: Stale[], background: Background, unknown: number): string[] {
  const oldest = stale.filter((s) => !s.outdated).sort((a, b) => b.age - a.age)[0];
  let room = left();
  const started: string[] = [];
  for (const s of [...stale.filter((x) => x.outdated), ...(oldest ? [oldest] : [])]) {
    const cost = costOf(s.key) ?? s.cost ?? unknown;
    if (cost > room) continue;
    room -= cost;
    started.push(s.key);
    background(apart(() => cache.get(s.key, FRESH_SECONDS, () => measured(s.key, s.build))).catch((err) => console.error(`page ${s.key} : rafraîchissement impossible`, why(err))));
  }
  return started;
}

/** The vigilance, or null when Météo-France does not answer or it is not plugged in. */
function vigilanceOf(cache: Cache): Promise<Cached<mf.Vigilance> | null> {
  return mf.enabled() ? mf.vigilance(cache).catch((err) => (console.error(`source ${mf.SOURCE.id} indisponible:`, why(err)), null)) : Promise.resolve(null);
}

/**
 * Reads the copies of the commune's summary, keeps those recent enough, names the others, and brings them up to date
 * after the answer when `background` is given (`refresh`), as the tiles are: one kept but older than FRESH_SECONDS
 * too, else it would stay as it is until it is too old to keep (31/10/2026: the electricity of 05:45 at 06:12 in the
 * summary, 06:05 on its page; two water notices where the tool said one). `vigilance`: the
 * vigilance as the caller has it already (a page waits for it only a moment), else it is read here. `held`: the
 * copies the caller has already (a page builds its weather), neither read again nor refreshed here.
 */
export async function readCopies(cache: Cache, commune: PlacePage, place: PlacePage, now: Date, background?: Background, vigilance?: Promise<Cached<mf.Vigilance> | null>, held: Partial<Record<Part, Cached<any> | null>> = {}) {
  const parts = Object.entries(copiesOf(commune, place)).filter((e): e is [Part, Copy] => !!e[1]);
  // One read each, as long as the invocation has subrequests left.
  const budget = left();
  let reads = 0;
  const [peeked, vig] = await Promise.all([
    Promise.all(parts.map(([name, c]) => (name in held ? Promise.resolve(held[name] ?? undefined) : reads++ < budget ? cache.peek<any>(c.key, now.getTime() - FRESH_SECONDS * 1000).catch(() => undefined) : Promise.resolve(undefined)))),
    vigilance ?? vigilanceOf(cache),
  ]);
  const copies: ResumeCopies = { vigilance: vig };
  const leftOut: LeftOut[] = [];
  const due: Stale[] = [];
  parts.forEach(([name, c], i) => {
    const copy = peeked[i];
    // Built by another revision: left out, however recent, and brought up to date first (`UPDATING`).
    if (copy?.outdated) {
      leftOut.push({ partie: c.nom, raison: UPDATING, outil: c.outil, page: `${SITE_URL}${c.page}` });
      if (!(name in held)) due.push({ key: c.key, build: () => c.build(cache, now), age: Infinity, outdated: true, cost: copy.cost });
      return;
    }
    if (usable(c, copy, now)) {
      (copies as Record<string, unknown>)[name] = copy;
      // The answer says how fresh it is from what it was served (tools/fraicheur.ts): these copies.
      noteLecture({ key: c.key, fetchedAt: copy.fetchedAt.getTime(), stale: false, freshSeconds: FRESH_SECONDS });
      const age = now.getTime() - copy.fetchedAt.getTime();
      if (!(name in held) && age >= FRESH_SECONDS * 1000) due.push({ key: c.key, build: () => c.build(cache, now), age, cost: copy.cost });
      return;
    }
    leftOut.push({ partie: c.nom, raison: copy ? `copie de ${localTime(copy.fetchedAt)}, trop ancienne` : "pas de copie récente", outil: c.outil, page: `${SITE_URL}${c.page}` });
    if (!(name in held)) due.push({ key: c.key, build: () => c.build(cache, now), age: copy ? now.getTime() - copy.fetchedAt.getTime() : Infinity, cost: copy?.cost });
  });
  if (!vig) leftOut.push({ partie: "vigilance", raison: mf.enabled() ? "Météo-France ne répond pas" : "vigilance non branchée", outil: "vigilance_meteo", page: `${SITE_URL}/vigilance` });
  return { copies, leftOut, refreshed: background ? refresh(cache, due, background, COST_UNKNOWN) : [] };
}

/** The short answer, the tool's default (Claude's directory asks for frugal answers): what it leaves out, and where. */
export const COURT = "Réponse courte : sans la liste de ce qu'accepte chaque déchèterie ni le prix de chaque carburant. Le détail : rappeler l'outil avec detail, ou la page de la commune (lien).";

/**
 * The summary without its long lists, every warning and every link kept. Its sources, half of the answer, keep their
 * name and licence, what the rule « Citer » of the instructions asks for; their attributions are in the answer with detail.
 */
export function court(r: Resume) {
  const fuel = r.carburants && (({ prix_maximums: _, ...c }) => c)(r.carburants);
  return {
    ...r,
    decheteries: r.decheteries && { ...r.decheteries, sites: r.decheteries.sites.map(({ accepte: _, ...s }) => s) },
    carburants: fuel,
    sources: r.sources.map(({ source, licence }) => ({ source, licence })),
    detail: COURT,
  };
}

/** `detail` false (the tool's default): the short answer, court(); the page reads resume() whole. */
export async function resumeDuJour(cache: Cache, lieu: string, now = new Date(), background?: Background, detail = true) {
  const found = placeOf(lieu);
  if (!found) return notFound(lieu);
  const { commune, place, res } = found;
  // The weather as /aujourdhui has it (web/site.ts): built when it has no copy, and one older than FRESH_SECONDS
  // refreshed, waited for a moment as by an assistant reading the page. Read as kept, it was 20 to 30 min older than
  // the page's (31/10/2026, Le Tampon: 21,1 °C measured at 05:48 in the tool, 19,9 °C at 06:06 on the page).
  const vigilance = vigilanceOf(cache);
  const meteo = await snapshot(cache, `web:lieu:${place.slug}`, () => buildPlace(cache, place, now), background ?? (() => undefined), now, undefined, true, withoutForecast);
  const { copies, leftOut } = await readCopies(cache, commune, place, now, background, vigilance, { meteo });
  // A place without a weather page of its own (a beach, a quarter): the weather is the commune's centre's, said so.
  const asked = place === commune && normalize(res.lieu.nom) !== normalize(commune.nom) ? res.lieu : undefined;
  const r = resume(commune, copies, now, leftOut, asked);
  // A place found on part of its name, said before the day (« Maurice », Fond Maurice at Les Avirons).
  const said = placeWarning(lieu, res);
  const day = said ? { ...r, resume: `${said} ${r.resume}` } : r;
  return text({ lieu: placeBlock(lieu, res), ...(detail ? day : court(day)) });
}
