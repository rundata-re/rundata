/**
 * The rules of approach of whales and dolphins at La Réunion, from the prefect's decree n° 944 of 4 June 2025, whose
 * article 6 (the speed on the west coast) was rewritten by the decree n° 1098 of 27 June 2025. The rules are bundled
 * and dated (LUES_LE): no source is read, no request is made. Every figure was read on the signed texts' page images
 * (944: pages 3 to 6; 1098: pages 1 and 2) on 4/11/2026.
 *
 * Never the old zone of article 6 (« du nord de la baie de Saint-Paul au Grand Cap »), which the DMSOI's summary table
 * and the prefecture's press release of 17/06/2026 still give: the decree n° 1098 alone is authoritative. The DMSOI's
 * page of the decree n° 944 does not mention the decree n° 1098: both are linked. Words (marketing, 4/11/2026): the
 * decree sets a period of rules for the humpback whales, never « la saison des baleines »; never « autorisé »; the
 * rules never say where the whales are.
 */
import type { SourceInfo } from "../types.js";

/** The day the rules were last read on the texts: raised by hand at each reading, never computed. */
export const LUES_LE = "2026-11-04";

export const PDF_944 =
  "https://www.dm.sud-ocean-indien.developpement-durable.gouv.fr/IMG/pdf/arrete_944_du_04_juin_2025_portant_reglementation_des_activites_nautiques_a_proximite_des_cetaces_dans_les_eaux_territoriales_de_la_reunion_cle0f9ff1.pdf";
export const PAGE_944 = "https://www.dm.sud-ocean-indien.developpement-durable.gouv.fr/arrete-prefectoral-no944-du-4-juin-2025-portant-a1263.html?lang=fr";
export const PDF_1098 =
  "https://www.reunion.gouv.fr/contenu/telechargement/47998/361477/file/arr%C3%AAt%C3%A9%20n%C2%B01098%20portant%20modification%20de%20l%27arr%C3%AAt%C3%A9%20n%C2%B0944%20du%2004%20juin%202025%20portant%20r%C3%A9glementation%20des%20activit%C3%A9s%20nautiques.pdf";
export const PAGE_1098 = "https://www.dm.sud-ocean-indien.developpement-durable.gouv.fr/arrete-no-1098-du-27-juin-2025-portant-a1270.html";

export const SOURCE: SourceInfo = {
  id: "dmsoi_cetaces",
  nom: "Arrêtés n° 944 du 4 juin 2025 et n° 1098 du 27 juin 2025 sur l'approche des cétacés (DMSOI)",
  organisme: "Préfecture de La Réunion, Direction de la mer Sud océan Indien (DMSOI)",
  licence: "Licence Ouverte 2.0",
  attribution: "Arrêté préfectoral n° 944 du 4 juin 2025, modifié par l'arrêté n° 1098 du 27 juin 2025",
  url: PDF_944,
};

const NB = "\u00a0";
/** « 9 h », the hour and its « h » never apart. */
const H = "\u00a0h";
const N944 = `arrêté n°${NB}944`;

/** The humpback whales' period of rules, both days included (944, art. 1): « MM-JJ ». */
export const PERIODE = { du: "07-01", au: "09-30" };

/** marketing's words (4/11/2026). */
export const T = {
  surtitre: `Arrêtés du préfet de La Réunion, lus le ${LUES_LE.split("-").reverse().join("/")}`,
  titre: `Baleines et dauphins${NB}: les règles d'approche`,
  pendant:
    `Du 1er${NB}juillet au 30${NB}septembre, l'arrêté encadre l'approche des baleines à bosse. ` +
    `Pour les autres cétacés (dauphins…), ses règles valent toute l'année.`,
  hors:
    `En dehors de la période du 1er${NB}juillet au 30${NB}septembre, l'arrêté demande aux navires de se tenir à plus de 300${NB}m des baleines à bosse. ` +
    `Pour les autres cétacés (dauphins…), ses règles valent toute l'année.`,
  presence: "Ces règles ne disent pas s'il y a des baleines en ce moment.",
  foi: `rundata.re résume les arrêtés${NB}: seul leur texte fait foi.`,
  source: "Préfecture de La Réunion, Direction de la mer Sud océan Indien (Licence Ouverte 2.0)",
};

/** A rule and its article. */
export interface Regle {
  regle: string;
  article: string;
}

/** The twelve rules, in marketing's order and words (4/11/2026). */
export const REGLES: Regle[] = [
  {
    regle: `Dans les 300${NB}m autour des cétacés${NB}: 3${NB}navires immatriculés au plus, jet-skis (véhicules nautiques à moteur) compris, et 3${NB}engins de plage.`,
    article: `${N944}, art.${NB}3`,
  },
  { regle: `Vitesse dans les 300${NB}m${NB}: 4${NB}nœuds au plus.`, article: `${N944}, art.${NB}3` },
  {
    regle:
      `Approche parallèle, en biais par l'arrière (trois-quarts arrière), à la vitesse du plus lent des cétacés${NB}; ` +
      `jamais par l'avant ni par l'arrière, ni en coupant leur route${NB}; ni poursuite ni encerclement${NB}; ` +
      `tous les navires du même côté du groupe, à 20${NB}m au moins les uns des autres.`,
    article: `${N944}, art.${NB}3`,
  },
  { regle: `Moteur au point mort à 100${NB}m d'une baleine, à 50${NB}m d'un dauphin.`, article: `${N944}, art.${NB}3` },
  { regle: `30${NB}minutes au plus par navire dans les 300${NB}m.`, article: `${N944}, art.${NB}3` },
  {
    regle:
      `Interdits dans les 300${NB}m${NB}: sondeurs, sonars et radars allumés${NB}; pêche${NB}; ski nautique, parachute ascensionnel, fly-board${NB}; ` +
      `drone sous-marin à moins de 100${NB}m${NB}; engin d'aide à la nage (sauf flottaison et handisport)${NB}; sons pour interagir${NB}; ` +
      "appâtage et jet de tout produit.",
    article: `${N944}, art.${NB}3`,
  },
  {
    regle: `Réserve naturelle marine${NB}: approche à moins de 100${NB}m interdite, mise à l'eau interdite.`,
    article: `${N944}, art.${NB}3 et 4.2`,
  },
  {
    regle:
      `Heures${NB}: observation de 9${H} à 16${H}${NB}; de 16${H} à 18${H}, seulement pour les navires à propulsion décarbonée et les engins de plage${NB}; ` +
      `mise à l'eau de 9${H} à 13${H}. En dehors de ces heures, s'éloigner à plus de 300${NB}m d'un cétacé.`,
    article: `${N944}, art.${NB}5`,
  },
  {
    regle:
      `Mise à l'eau${NB}: depuis un navire équipé, jamais depuis un engin de plage ou un jet-ski${NB}; palmes, masque, tuba et combinaison${NB}; ` +
      `à moins de 30${NB}m, ne plus avancer vers eux${NB}; jamais à moins de 15${NB}m, aucun contact${NB}; ni plongée en apnée ni en bouteille vers eux${NB}; ` +
      `7${NB}personnes au plus par palanquée encadrement compris, de 2 à 4${NB}personnes hors activité encadrée${NB}; 30${NB}minutes. ` +
      `Interdite sous 8${NB}ans, avec plus de 3${NB}navires dans les 300${NB}m, par mer forte ou plus (au-delà de 4 sur l'échelle de Douglas), ` +
      "ou lorsque les baleines sont actives (saut, chasse, mouvement de nageoire, râle, changements de direction répétés…).",
    article: `${N944}, art.${NB}4`,
  },
  {
    regle:
      `Vitesse sur la côte ouest, du 1er${NB}juillet au 30${NB}septembre aux heures d'observation${NB}: 10${NB}nœuds au plus entre la côte et l'isobathe des 100${NB}m, ` +
      `du chenal d'accès au Port Ouest aux feux de jetée du port de Saint-Gilles-les-Bains, puis entre la côte et l'isobathe des 50${NB}m ` +
      "jusqu'au méridien de l'îlot de Petite-Île (sauf pêche professionnelle, navires de l'État et service public).",
    article: `${N944}, art.${NB}6, rédigé par l'arrêté n°${NB}1098`,
  },
  { regle: `Radio${NB}: veille des canaux VHF 16 et 72.`, article: `${N944}, art.${NB}2` },
  {
    regle: `Peines maximales${NB}: 1${NB}an de prison et 150${NB}000${NB}€ d'amende (code des transports), retrait immédiat et définitif du permis plaisance.`,
    article: `${N944}, art.${NB}8`,
  },
];

/** The links, with marketing's words. */
export const LIENS = [
  { texte: `Arrêté n°${NB}944 du 4${NB}juin 2025`, pdf: PDF_944, page: PAGE_944 },
  { texte: `Arrêté n°${NB}1098 du 27${NB}juin 2025, qui réécrit l'article${NB}6`, pdf: PDF_1098, page: PAGE_1098 },
];

/** How an assistant says it (marketing, 4/11/2026). */
export const COMMENT_LE_DIRE =
  `Dire ces règles comme celles de l'arrêté, avec son article. Elles ne disent pas où sont les baleines${NB}: ` +
  `jamais «${NB}baleines visibles aujourd'hui${NB}». Seul le texte des arrêtés fait foi.`;

/** Whether the humpback whales' period of rules holds on a day at La Réunion (« 2026-08-15 »). */
export const enPeriode = (day: string) => day.slice(5) >= PERIODE.du && day.slice(5) <= PERIODE.au;

/** The day at La Réunion. */
const jourLocal = (now: Date) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

/** The state of the day, then the warning that the rules say nothing of the whales' presence. */
export const etatDuJour = (now: Date) => (enPeriode(jourLocal(now)) ? T.pendant : T.hors);

/** The block of temperature_mer: nothing read, the same for every place. */
export function cetacesBlock(now = new Date()) {
  return {
    titre: T.titre,
    etat: etatDuJour(now),
    presence: T.presence,
    comment_le_dire: COMMENT_LE_DIRE,
    regles: REGLES.map((r) => ({ regle: r.regle, texte: r.article })),
    a_savoir: T.foi,
    textes: {
      arrete_944: { lien: PDF_944, page_dmsoi: PAGE_944 },
      arrete_1098: { lien: PDF_1098, page_dmsoi: PAGE_1098, objet: "réécrit l'article 6 de l'arrêté n° 944 (vitesse sur la côte ouest)" },
    },
    // Not « derniere_verification »: the answer's date is the measure's, never the day the decrees were read (fraicheur.ts).
    textes_lus_le: LUES_LE.split("-").reverse().join("/"),
  };
}
