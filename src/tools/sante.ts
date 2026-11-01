/**
 * Pharmacies and hospitals (sante/etablissements.ts), answered by annuaire_services_publics when the question is
 * about them. The duty pharmacy is never guessed: only 3237.fr and the 32 37 know it, as the ARS La Réunion says.
 * Which hospital has an emergency department is not in FINESS either: the 15 first, which directs. Nor which doctor is on
 * duty: the 15 again.
 */
import { resolvePlace } from "../places/resolve.js";
import * as sante from "../sante/etablissements.js";
import * as garde from "../sante/garde.js";
import { credits, de, fr, notFound, placeBlock, text } from "./format.js";

/** Whether `quoi` asks about a pharmacy. */
export const PHARMACY = /pharmac|officine|m[ée]dicament/i;
/** Whether `quoi` asks about the emergencies or a hospital. */
export const EMERGENCY = /urgence|h[ôo]pita|clinique|\bchu\b|samu|\bsmur\b/i;

/**
 * Whether `quoi` asks for the doctor on duty: « médecin de garde », « garde », « maison médicale de garde »,
 * « SOS médecins », a doctor at night or on Sunday; not a child's care nor a vet's duty (« pharmacie de garde » is a
 * pharmacy's question, asked first).
 */
export const GARDE =
  /(?<!v[ée]t[ée]rinaires?.*)(?:\bgarde\b(?![- ](?:d['’]enfants?|des enfants|à vue|alternée|partagée|corps|côtes?|forestier|champêtre|meuble|robe|nationale|du corps|républicaine))|sos[- ]?m[ée]decins?|permanence des soins|maison m[ée]dicale|(?:m[ée]decin|docteur|toubib)s? (?:de nuit|la nuit|cette nuit|ce soir|le soir|le dimanche|ce dimanche|un dimanche|le week-?end|ce week-?end|un jour f[ée]ri[ée]|f[ée]ri[ée])|soins non programm)/i;

const km = (n: number) => `${fr(Math.round(n * 10) / 10)} km`;
const row = (e: sante.Etablissement & { km?: number }) => ({
  nom: e.nom,
  adresse: `${e.adresse}${e.adresse ? ", " : ""}${e.commune}`,
  distance_km: e.km != null ? Math.round(e.km * 10) / 10 : undefined,
  telephone: e.telephone ?? undefined,
});

export function pharmaciesAnswer(lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const near = res ? sante.nearest(res.lieu.lon, res.lieu.lat, ["pharmacie"]) : [];
  const garde = `Pharmacie de garde (${sante.GARDE.quand}) : le site 3237.fr, ou le ${sante.GARDE.telephone}, d'après l'ARS La Réunion.`;
  return text({
    ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
    resume: near.length
      ? `${garde} Les pharmacies les plus proches ${de(res!.lieu.nom)} : ${near.slice(0, 3).map((e) => `${e.nom} (${e.adresse}, ${e.commune}, à ${km(e.km)}${e.telephone ? `, tél. ${e.telephone}` : ""})`).join("\u00a0; ")}.`
      : `${garde} Donner un lieu pour les pharmacies les plus proches : ${sante.ETABLISSEMENTS.filter((e) => e.type === "pharmacie").length} pharmacies dans l'île.`,
    pharmacie_de_garde: { ...sante.GARDE, source: sante.ARS_GARDE.url },
    pharmacies: near.length ? near.map(row) : undefined,
    avertissements: [
      "rundata.re ne sait pas quelle pharmacie est de garde : seuls 3237.fr et le 32 37 le disent. Ne jamais en désigner une comme étant de garde.",
      "Horaires d'ouverture non publiés dans FINESS : appeler la pharmacie.",
    ],
    sources: credits([sante.FINESS, sante.ARS_GARDE]),
  });
}

export function urgencesAnswer(lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const near = res ? sante.nearest(res.lieu.lon, res.lieu.lat, ["hopital", "clinique"], 4) : [];
  const first = "Urgence : appeler le 15 (SAMU) ou le 112. Ne pas se rendre aux urgences sans avoir appelé le 15, qui oriente vers le bon service (Santé.fr).";
  return text({
    ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
    resume: near.length
      ? `${first} Hôpitaux et cliniques les plus proches ${de(res!.lieu.nom)} : ${near.slice(0, 3).map((e) => `${e.nom} (${e.commune}, à ${km(e.km)}${e.telephone ? `, standard ${e.telephone}` : ""})`).join("\u00a0; ")}.`
      : first,
    numeros: { samu: "15", europeen: "112", pompiers: "18", sourds_et_malentendants: "114" },
    urgences_pediatriques: { sites: ["CHU Nord (Saint-Denis)", "CHU Sud (Saint-Pierre)", "CHOR (Saint-Paul)"], source: sante.SANTE_FR.url, smur: garde.SMUR_PEDIATRIQUE.texte, smur_source: garde.SMUR_PEDIATRIQUE.source },
    etablissements: near.length ? near.map((e) => ({ ...row(e), type: e.type === "hopital" ? "hôpital" : "clinique" })) : undefined,
    avertissements: ["FINESS ne dit pas quels établissements ont un service d'urgences ouvert : le 15 oriente.", "Pharmacie de garde : 3237.fr ou le 32 37 (payant)."],
    sources: credits([sante.SANTE_FR, sante.FINESS]),
  });
}

/** « les urgences du CHU site Nord (Saint-Denis) ou du GHER (Saint-Benoît) ». */
const nights = (hospitals: string[]) => `les urgences ${hospitals.map((h) => `du ${h}`).join(" ou ")}`;

/** A territory of the duty, as the answer gives it: its communes, the place the arrêté plans, the dead of night. */
const territory = (t: garde.Territoire) => ({
  territoire: t.nom,
  communes: [...t.communes, ...Object.entries(t.quartiers).map(([c, qs]) => `${c} (${qs.join(", ")})`)],
  lieu_prevu_par_l_arrete: t.lieu_prevu,
  nuit_profonde: t.nuit
    ? `De 23 h à 7 h, une garde seulement là où des médecins sont volontaires\u00a0; sinon, le 15 oriente vers ${nights(t.nuit)}.`
    : "De 23 h à 7 h : le 15 oriente.",
});

/**
 * The doctor on duty: who is on duty tonight is published nowhere (the duty roster names the doctors and goes to the ARS,
 * the SAMU and the prefecture only), so the answer is where to turn: the 15 first, as the ARS asks; the hours and the
 * territory of the duty, the place the arrêté plans there and the hospital of the night (sante/garde.ts); the 32 37 for
 * the duty pharmacy; Santé.fr's map in the daytime; the duty medical centre FINESS lists.
 */
export function gardeAnswer(quoi: string, lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  const ts = res ? garde.territoires(res.lieu.commune, res.lieu.nom) : [];
  const h = garde.HORAIRES;
  const hours = `La garde des médecins, la même dans toute l'île d'après l'arrêté n°82/ARS/2026 : ${h.soirs}\u00a0; ${h.samedi}\u00a0; ${h.dimanches_et_feries}\u00a0; et ${h.ponts}.`;
  const nuit = [...new Set(ts.flatMap((t) => t.nuit ?? []))];
  const where = !res
    ? "Donner une commune pour son territoire de garde."
    : `${ts.length > 1 ? `${res.lieu.commune} relève de deux territoires de garde selon le quartier : ${ts.map((t) => t.nom).join(" et ")}.` : `${ts[0].nom === res.lieu.nom ? `${res.lieu.nom} est à lui seul un territoire de garde` : `${res.lieu.nom} est dans le territoire de garde ${ts[0].nom}`}${ts[0].lieu_prevu ? `, où l'arrêté prévoit ${ts[0].lieu_prevu}` : ""}.`} ${
        nuit.length ? `La nuit, de 23 h à 7 h, une garde seulement là où des médecins sont volontaires : sinon, le 15 oriente vers ${nights(nuit)}.` : "La nuit, de 23 h à 7 h : le 15 oriente."
      }`;
  const east = !res || ts.some((t) => t.communes.includes(sante.MAISON_DE_GARDE.commune));
  return text({
    ...(res ? { lieu: placeBlock(lieu!, res) } : {}),
    resume: `Médecin de garde : appelez le 15 avant de vous déplacer, comme le demande l'ARS La Réunion. Le médecin du 15 dit où consulter, ou envoie les secours. ${hours} ${where} Urgence vitale : le 15 ou le 112. Pharmacie de garde : le site 3237.fr, ou le ${sante.GARDE.telephone}. En journée, pour une consultation sans rendez-vous : la carte des lieux de soins de Santé.fr, ${sante.CARTE_SOINS}.`,
    numeros: { samu: "15", europeen: "112", sourds_et_malentendants: "114" },
    horaires_de_garde: { ...h, nuit_profonde: "de 23 h à 7 h, une garde seulement là où des médecins sont volontaires", source: garde.PDSA.url },
    territoires_de_garde: res ? ts.map(territory) : undefined,
    lieux_prevus_par_l_arrete: res ? undefined : garde.TERRITOIRES.filter((t) => t.lieu_prevu).map((t) => `${t.lieu_prevu} (${t.nom})`),
    maison_medicale_de_garde: east ? { nom: sante.MAISON_DE_GARDE.nom, adresse: sante.MAISON_DE_GARDE.adresse, a_savoir: "Appeler le 15 avant de s'y rendre. Ses horaires ne sont pas donnés ici." } : undefined,
    urgences_pediatriques: /p[ée]diatr|enfant|b[ée]b[ée]/i.test(quoi) ? { smur: garde.SMUR_PEDIATRIQUE.texte, source: garde.SMUR_PEDIATRIQUE.source } : undefined,
    pharmacie_de_garde: { site: sante.GARDE.site, telephone: sante.GARDE.telephone, source: sante.ARS_GARDE.url },
    consultation_en_journee: { carte: sante.CARTE_SOINS, source: sante.SANTE_FR.url },
    avertissements: [
      "rundata.re ne sait pas quel médecin est de garde : le tableau de garde n'est pas publié. Ne jamais désigner un médecin ni une pharmacie comme étant de garde.",
      "Les lieux de garde nommés par l'arrêté sont prévus : leur ouverture n'est pas vérifiée. Le 15 dit où aller.",
      ...(east ? ["La maison médicale de garde de l'Est est la seule que FINESS recense dans l'île : d'autres lieux de garde existent, le 15 les indique."] : []),
    ],
    sources: credits([garde.PDSA, sante.SANTE_FR, sante.ARS_GARDE, ...(east ? [sante.FINESS] : [])]),
  });
}
