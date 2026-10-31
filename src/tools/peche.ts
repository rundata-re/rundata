/**
 * peche_loisir and /peche: the rules of recreational fishing at La Réunion, day by day, from the prefect's two decrees:
 * what is closed today, the sizes and the quantities. The rules are bundled and dated (LUES_LE): no source is read, no
 * request is made. Every figure was read by researcher on the texts (31/10/2026): the decree n° 1743 of 15/07/2008 in
 * the consolidated version of the DMSOI at 1/1/2023 (no signed copy of 2008 is online), and the signed decree
 * n° 2026-1319 of 17/08/2026 on the bichiques, read on its pages' images. Never a link to the decree on the bichiques
 * of 2021, repealed by the latter (art. 23), though the DMSOI's page still offers it.
 *
 * Words (data-run and marketing, 31/10/2026): « pas de fermeture aujourd'hui » where a decree only sets a closing time,
 * « saison ouverte » where it sets the open season; never « autorisé ». The rules of a place (the marine reserve's
 * zones, the river mouths, Sainte-Rose) are named, not detailed: the decrees alone are authoritative.
 */
import { holidays } from "../feries.js";
import { normalize, resolvePlace } from "../places/resolve.js";
import { sun } from "../providers/calendrier.js";
import type { SourceInfo } from "../types.js";
import { longDate } from "./calendrier.js";
import { credits, text } from "./format.js";

/** The day the rules were last read on the texts. */
export const LUES_LE = "2026-10-31";

export const PDF_1743 = "https://www.dm.sud-ocean-indien.developpement-durable.gouv.fr/IMG/pdf/1743_consolide_1-1-23_cle6fdc61.pdf";
export const PAGE_DMSOI = "https://www.dm.sud-ocean-indien.developpement-durable.gouv.fr/reglementation-generale-de-la-peche-de-loisir-a-la-a918.html?lang=fr";
export const PDF_BICHIQUES = "https://www.reunion.developpement-durable.gouv.fr/IMG/pdf/20260817_ap_2026-1319_reglementation_peche_bichiques_signe.pdf";
export const PAGE_DEAL = "https://www.reunion.developpement-durable.gouv.fr/reglementation-de-la-peche-des-bichiques-a1055.html?lang=fr";
// The decree's own map of the zones (art. 7), its address as the DEAL's page links it: a capital I.
export const CARTE_BICHIQUES = "https://macarte.ign.fr/carte/9ace2I/Zones-de-peche-des-bichiques/";

export const SOURCE_1743: SourceInfo = {
  id: "dmsoi_peche_loisir",
  nom: "Arrêté n° 1743 du 15 juillet 2008 sur la pêche maritime de loisir (DMSOI)",
  organisme: "Préfecture de La Réunion, Direction de la mer Sud océan Indien (DMSOI)",
  licence: "Licence Ouverte 2.0",
  attribution: "Arrêté préfectoral n° 1743 du 15 juillet 2008, version consolidée par la DMSOI au 1/1/2023",
  url: PDF_1743,
};
export const SOURCE_BICHIQUES: SourceInfo = {
  id: "deal_bichiques",
  nom: "Arrêté n° 2026-1319 du 17 août 2026 sur la pêche des bichiques (DEAL)",
  organisme: "Préfecture de La Réunion, DEAL",
  licence: "Licence Ouverte 2.0",
  attribution: "Arrêté préfectoral n° 2026-1319/SG/SCOPP du 17 août 2026 réglementant la pêche des bichiques",
  url: PDF_BICHIQUES,
};
export const SOURCES = [SOURCE_1743, SOURCE_BICHIQUES];

const AP_1743 = "l'arrêté n° 1743 du 15 juillet 2008, version consolidée par la DMSOI au 1/1/2023";
const AP_1743_COURT = "l'arrêté n° 1743";
const AP_BICHIQUES = "l'arrêté n° 2026-1319 du 17 août 2026";

/** The seasons of the bichiques for recreational and amateur fishing, both days included (AP 2026-1319, art. 5.1). */
export const SAISONS_BICHIQUES: [string, string][] = [
  ["2026-08-28", "2027-02-21"],
  ["2027-09-16", "2028-03-11"],
  ["2028-09-04", "2029-02-28"],
  ["2029-08-24", "2030-02-18"],
  ["2030-09-11", "2031-03-09"],
];

/** A rule of a size or a quantity, with its article. */
export interface Regle {
  espece: string;
  regle: string;
  article: string;
}

/** Sizes and quantities (marketing's table: species, rule, article). */
export const TAILLES: Regle[] = [
  { espece: "Poissons", regle: "au moins 10\u202fcm, du bout du museau à l'extrémité de la nageoire caudale, sauf les espèces qui restent plus petites à l'âge adulte", article: "arrêté n° 1743, art. 8" },
  { espece: "Langouste", regle: "au moins 23\u202fcm, de la pointe du rostre à l'extrémité de la queue\u00a0; jamais une femelle grainée", article: "arrêté n° 1743, art. 8" },
  { espece: "Anguille marbrée", regle: "plus de 30\u202fcm et moins de 60\u202fcm, 5 par jour, à la tâte seulement (de même pour l'anguille marbrée africaine)", article: "arrêté n° 1743, art. 10-1" },
  { espece: "Moules", regle: "au moins 4\u202fcm dans leur plus grande dimension", article: "arrêté n° 1743, art. 13" },
  { espece: "Bichiques", regle: "3\u202fkg par jour et par pêcheur non professionnel", article: "arrêté n° 2026-1319, art. 20" },
  { espece: "Réserve naturelle marine", regle: "5\u202fkg par pêcheur et par jour, y compris en dehors des lagons", article: "arrêté n° 1743, art. 21" },
];

/** What the decrees forbid to recreational fishing, whatever the day. */
export const INTERDITS: Regle[] = [
  { espece: "Requins de récif", regle: "pointe blanche, pointe noire, dagsit ou gris de récif, requin corail, nourrice fauve", article: "arrêté n° 1743, art. 15 bis" },
  { espece: "Loche des sables, anguille du Mozambique, anguille bicolore", regle: "toute capture", article: "arrêté n° 1743, art. 10-1" },
  { espece: "Corail", regle: "vivant ou mort", article: "arrêté n° 1743, art. 12" },
  { espece: "Coquillages vivants", regle: "tous, sauf les moules", article: "arrêté n° 1743, art. 13" },
  { espece: "Œufs de poissons et de crustacés", regle: "tous", article: "arrêté n° 1743, art. 8" },
  { espece: "Poissons venimeux ou vénéneux", regle: "notamment les bouftangues et les crapauds de mer", article: "arrêté n° 1743, art. 16" },
  { espece: "Bichiques juvéniles et adultes", regle: "les cabots bouche-ronde déjà pigmentés, en mer comme en rivière", article: "arrêté n° 2026-1319, art. 18" },
  { espece: "Bichiques en mer", regle: "pour les pêcheurs non professionnels", article: "arrêté n° 2026-1319, art. 4" },
  { espece: "Bichiques hors saison", regle: "ni pêche, ni détention, ni transport, ni vente, ni achat", article: "arrêté n° 2026-1319, art. 6" },
];

/** The lagoons (art. 17, word for word as researcher read it, in marketing's sentence). */
export const LAGONS =
  "L'arrêté n'y permet que la pêche du capucin nain et la pêche à pied à la ligne sans moulinet (la gaulette), de jour, sur les seuls fonds sableux, à 25\u00a0m au plus de la ligne des plus hautes eaux. La pêche depuis une embarcation y est interdite.";
export const LAGONS_ARTICLE = "arrêté n° 1743, art. 17";

/** What the page does not say, said plainly (data-run, 31/10/2026). */
export const AILLEURS =
  "D'autres règles dépendent du lieu\u00a0: réserve naturelle marine (zones de protection intégrale, pêche de nuit interdite), zones de pêche des bichiques, réserve de pêche de Sainte-Rose. Elles ne sont pas toutes ici. rundata.re résume les arrêtés\u00a0: seul leur texte fait foi.";

/** How an assistant says it: the states as written, never more than the decrees. */
export const COMMENT_LE_DIRE =
  "Reprendre l'état de chaque espèce tel quel (« pas de fermeture aujourd'hui », « saison ouverte », « fermée aujourd'hui »), avec « d'après l'arrêté » et l'article, sans en faire un « c'est permis » ni en tirer une règle que la réponse ne donne pas\u00a0: d'autres règles dépendent du lieu, et seul le texte des arrêtés fait foi.";

/** One species on a day: whether it is closed, its state in the fixed words, and its rules. */
export interface Espece {
  cle: "langouste" | "bichiques" | "capucin" | "anguille";
  nom: string;
  ferme: boolean;
  /** « Pas de fermeture aujourd'hui », « Saison ouverte », « Fermé aujourd'hui »… */
  etat: string;
  /** Today's hours, when the decree sets some and fishing is open: « de 05:05 à 18:58 ». */
  heures?: string;
  /** The rules, in sentences. */
  regles: string;
  /** « d'après l'arrêté n° 1743 …, art. 8 et 11 ». */
  texte: string;
  lien: string;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « 28 août 2026 », « 1er avril ». */
const dayOf = (ymd: string, year = true) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]}${year ? ` ${y}` : ""}`;
};
/** Whether `md` (« 12-25 ») is in a yearly window that may cross the new year. */
const inWindow = (md: string, from: string, to: string) => (from <= to ? md >= from && md <= to : md >= from || md <= to);
/** « 05:05 », Réunion time; `up`: to the next minute, so that a limit is never said earlier or later than it is. */
const hhmm = (t: number, up: boolean) => {
  const m = (up ? Math.ceil(t / 60_000) : Math.floor(t / 60_000)) + 4 * 60;
  const day = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
};

// The decree takes the sunrise and sunset at Saint-Denis (art. 5.2): the place /calendrier and the tool calendrier use.
const SAINT_DENIS = resolvePlace("Saint-Denis")!.lieu;
const HALF_HOUR = 30 * 60_000;

/**
 * The hours the bichiques may be fished on a day: from half an hour before sunrise to half an hour after sunset at
 * Saint-Denis (art. 5.2), computed here (providers/calendrier.ts) for the sea's horizon, as the almanacs give them,
 * within a minute or two of them; the decree refers to Météo-France's hours. The first minute rounded up and the last
 * down: never wider than computed.
 */
export function heuresBichiques(day: string): { debut: string; fin: string } {
  const s = sun(day, SAINT_DENIS.lon, SAINT_DENIS.lat);
  return { debut: hhmm(s.lever.getTime() - HALF_HOUR, true), fin: hhmm(s.coucher.getTime() + HALF_HOUR, false) };
}
export const HEURES_NOTE =
  "Heures calculées par rundata.re pour Saint-Denis, à une ou deux minutes près\u00a0: l'arrêté renvoie aux heures de lever et de coucher du soleil à Saint-Denis indiquées par Météo-France.";

function langouste(day: string): Espece {
  const ferme = inWindow(day.slice(5), "12-01", "03-31");
  return {
    cle: "langouste",
    nom: "Langouste",
    ferme,
    etat: ferme ? "Fermée aujourd'hui" : "Pas de fermeture aujourd'hui",
    regles: `Fermée du 1er décembre au 31 mars${ferme ? "\u00a0: pendant cette période, l'arrêté interdit aussi de la saler, de la transporter et de l'employer" : ""}. Au moins 23\u202fcm, jamais une femelle grainée.`,
    texte: `d'après ${AP_1743}, art. 8 et 11`,
    lien: PDF_1743,
  };
}

function anguille(day: string): Espece {
  const ferme = inWindow(day.slice(5), "02-01", "03-31");
  return {
    cle: "anguille",
    nom: "Anguille marbrée",
    ferme,
    etat: ferme ? "Fermée aujourd'hui" : "Pas de fermeture aujourd'hui",
    regles: "Fermée du 1er février au 31 mars, plus de 30\u202fcm et moins de 60\u202fcm, 5 par jour, à la tâte seulement.",
    texte: `d'après ${AP_1743_COURT}, art. 10-1`,
    lien: PDF_1743,
  };
}

function capucin(day: string): Espece {
  const saison = inWindow(day.slice(5), "02-01", "04-30");
  const ferie = holidays(Number(day.slice(0, 4))).get(day);
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  const jour = wd === 5 || wd === 6 || wd === 0;
  const ouvert = saison && jour && !ferie;
  const quand = "le vendredi, le samedi et le dimanche sauf les jours fériés, de 5\u00a0h à 9\u00a0h";
  // A day of the season it is closed: a holiday, said; another weekday, the days just said.
  const pourquoi = saison && jour && ferie ? ` Ce jour est férié (${ferie}).` : "";
  return {
    cle: "capucin",
    nom: "Capucin nain",
    ferme: !ouvert,
    etat: ouvert ? "Saison ouverte" : "Fermé aujourd'hui",
    ...(ouvert ? { heures: "de 5\u00a0h à 9\u00a0h" } : {}),
    regles: `${saison ? "Saison ouverte" : "Ouvert"} du 1er février au 30 avril, ${quand}.${pourquoi} Dans le chenal sableux, à 25\u00a0m au plus du rivage, avec un filet de 10\u00a0m de long et 3\u00a0m de chute au plus, maille d'au moins 16\u00a0mm.`,
    texte: `d'après ${AP_1743_COURT}, art. 15`,
    lien: PDF_1743,
  };
}

function bichiques(day: string): Espece {
  const saison = SAISONS_BICHIQUES.find(([a, b]) => day >= a && day <= b);
  const suivante = SAISONS_BICHIQUES.find(([a]) => a > day);
  const base = { cle: "bichiques" as const, nom: "Bichiques", lien: PDF_BICHIQUES };
  if (saison) {
    const h = heuresBichiques(day);
    return {
      ...base,
      ferme: false,
      etat: "Saison ouverte",
      heures: `de ${h.debut} à ${h.fin}`,
      regles:
        `Du ${dayOf(saison[0])} au ${dayOf(saison[1])}. En pêche de loisir, aujourd'hui de ${h.debut} à ${h.fin} ` +
        "(une demi-heure avant le lever du soleil et après son coucher, calculés pour Saint-Denis), 2 vouves au plus, 3\u202fkg par jour. " +
        "Jamais en mer pour les pêcheurs non professionnels.",
      texte: `d'après ${AP_BICHIQUES}, art. 4, 5, 16 et 20`,
    };
  }
  return {
    ...base,
    ferme: true,
    etat: "Fermée aujourd'hui",
    regles: (suivante
      ? `Prochaine saison du ${dayOf(suivante[0])} au ${dayOf(suivante[1])}.`
      : `L'arrêté ne fixe aucune saison après le ${dayOf(SAISONS_BICHIQUES[SAISONS_BICHIQUES.length - 1][1])}.`) +
      " Hors saison, l'arrêté interdit de les pêcher, de les détenir, de les transporter, de les vendre et de les acheter.",
    texte: `d'après ${AP_BICHIQUES}, art. 5 et 6`,
  };
}

/** The four species of the day, in the page's order. */
export function especesDuJour(day: string): Espece[] {
  return [langouste(day), bichiques(day), capucin(day), anguille(day)];
}

/** The day at La Réunion, « 2026-10-31 ». */
export const jourLocal = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

const ALIASES: [RegExp, Espece["cle"]][] = [
  [/langouste/, "langouste"],
  [/bichique|cabot|vouve/, "bichiques"],
  [/capucin/, "capucin"],
  [/anguille marbree|anguille/, "anguille"],
];

/**
 * The rules of recreational fishing on a day (today by default), for one species (`espece`) or the four the decrees
 * set dates for. Never reads anything.
 */
export function pecheLoisir(espece: string | undefined, date: string | undefined, now = new Date()) {
  const today = jourLocal(now);
  const day = date?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    return { ...text({ erreur: `Date illisible : « ${date} ». Écrire la date au format AAAA-MM-JJ (« 2026-12-24 »), ou ne rien donner pour aujourd'hui.` }), isError: true };
  }
  const all = especesDuJour(day);
  const asked = espece?.trim() ? normalize(espece) : "";
  const cle = asked ? ALIASES.find(([re]) => re.test(asked))?.[1] : undefined;
  const list = cle ? all.filter((e) => e.cle === cle) : all;
  const row = (e: Espece) => ({
    espece: e.nom,
    // Another day than today: its date is said once, in the summary.
    etat: day === today ? e.etat : e.etat.replace(" aujourd'hui", " ce jour-là"),
    ...(e.heures ? { heures: e.heures } : {}),
    regles: e.regles,
    texte: e.texte,
    lien: e.lien,
  });
  return text({
    resume:
      `Pêche de loisir à La Réunion ${day === today ? `aujourd'hui, ${longDate(day)}` : `le ${longDate(day)}`}, d'après les arrêtés du préfet\u00a0: ` +
      list.map((e) => `${e.nom.toLowerCase()}, ${row(e).etat.charAt(0).toLowerCase()}${row(e).etat.slice(1)}${e.heures ? ` (${e.heures})` : ""}`).join("\u00a0; ") +
      "." +
      (asked && !cle ? ` « ${espece!.trim()} » n'a pas de règle propre dans ce résumé\u00a0: voir les règles générales ci-dessous et le texte des arrêtés.` : ""),
    // Sonnet turned « pas de fermeture » into « ouverte », and the lagoons' rule into a ban on the lobster (bench, 31/10).
    comment_le_dire: COMMENT_LE_DIRE,
    date: day,
    especes: list.map(row),
    ...(list.some((e) => e.cle === "bichiques" && e.heures) ? { heures_bichiques: HEURES_NOTE } : {}),
    tailles_et_quantites: TAILLES.map((r) => ({ espece: r.espece, regle: r.regle, texte: r.article })),
    interdits: INTERDITS.map((r) => ({ espece: r.espece, regle: r.regle, texte: r.article })),
    lagons: { regle: LAGONS, texte: LAGONS_ARTICLE },
    a_savoir: AILLEURS,
    textes: {
      arrete_1743: { lien: PDF_1743, page_dmsoi: PAGE_DMSOI },
      arrete_bichiques: { lien: PDF_BICHIQUES, page_deal: PAGE_DEAL, carte_des_zones: CARTE_BICHIQUES },
    },
    // The day the rules were read on the texts: the date of what is said (tools/fraicheur.ts).
    derniere_verification: LUES_LE.split("-").reverse().join("/"),
    sources: credits(SOURCES),
  });
}
