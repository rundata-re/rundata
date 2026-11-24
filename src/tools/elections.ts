/**
 * The results of the elections in a commune (vie/elections.ts), as its page /communes/<commune>/elections shows them:
 * one scrutin at a time, the latest unless one is asked, round by round, the ministry's figures and the ballot lines in
 * the order of their panels, whatever the result. Nothing here ranks them, says who leads or who is elected, nor gives
 * a political nuance (the page's rules, the user's decision); the notes are the page's own sentences. Bundled data: no
 * read at all, and the day of the file as the answer's date.
 */
import { resolvePlace } from "../places/resolve.js";
import * as bureauxVote from "../vie/bureaux-vote.js";
import * as elections from "../vie/elections.js";
import { slugify } from "../web/places.js";
import { SITE_URL } from "./citer.js";
import { a, credits, jourDuFichier, nombre, notFound, placeBlock, text } from "./format.js";

/** The type a question names: « municipales », « la présidentielle », « elections regionales ». */
const DEMANDES: [RegExp, elections.Type][] = [
  [/municipal/, "muni"], [/legislativ/, "legi"], [/europeen/, "euro"], [/presidentiel/, "pres"],
  [/regional/, "regi"], [/departemental/, "dpmt"], [/cantonal/, "cant"],
];
const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const typeAsked = (quoi: string) => DEMANDES.find(([re]) => re.test(sansAccent(quoi)))?.[1];
/** A question about where to vote: « bureaux de vote », « où voter », « lieux de vote ». */
const OU_VOTER = /\bbureaux? de vote|\bou voter|\blieux? de vote/;
const NE_DIT_PAS = "rundata.re ne dit pas quel est le bureau d'une adresse ni d'un électeur : renvoyer à la carte électorale, à la mairie ou au service officiel (son_bureau).";

/** The commune's polling stations, the answer to « où voter ? »: its places, never someone's bureau (vie/bureaux-vote.ts). */
function pollingAnswer(asked: string, res: NonNullable<ReturnType<typeof resolvePlace>>, commune: string, page: string) {
  const lieux = bureauxVote.lieuxDe(commune);
  return text({
    lieu: placeBlock(asked, res),
    resume: `${bureauxVote.nombreDe(lieux)} bureaux de vote ${a(commune)}, dans ${lieux.length} lieux, d'après l'Insee (${bureauxVote.EXTRACTION}).`,
    bureaux_de_vote: { lieux: lieux.map((l) => ({ lieu: l.lieu, adresse: l.adresse, bureaux: bureauxVote.numeros(l.bureaux) })) },
    a_savoir: [bureauxVote.A_SAVOIR, bureauxVote.SON_BUREAU, NE_DIT_PAS],
    son_bureau: bureauxVote.ISE,
    page: `${page}#bureaux`,
    mis_a_jour: bureauxVote.EXTRACTION,
    sources: credits([bureauxVote.SOURCE]),
  });
}

const ASK_AGAIN = "Pour un autre scrutin de la commune : le donner dans scrutin, avec son année (liste dans scrutins_disponibles).";

/** One race of a round, in the ministry's words and order: its figures, then its ballot lines in the order of the panels. */
function resultat(s: elections.Scrutin, b: elections.Bloc, i: number, n: number) {
  return {
    partie: n > 1 ? elections.partie(s.type, b, i, n) : undefined,
    inscrits: b.inscrits,
    votants: b.votants,
    abstentions: b.abstentions,
    abstentions_pourcent_des_inscrits: elections.pourcent(b.abstentions, b.inscrits),
    // Up to 2015 the file counts the blancs with the nuls: said as one figure, never as « 0 blanc ».
    ...(b.blancs === null ? { blancs_et_nuls: b.nuls } : { blancs: b.blancs, nuls: b.nuls }),
    exprimes: b.exprimes,
    lignes: b.lignes.map((l) => ({
      panneau: l.panneau ?? undefined,
      nom: l.nom ?? `Liste conduite par ${l.tete}`,
      tete_de_liste: l.nom && l.tete ? l.tete : undefined,
      voix: l.voix,
      pourcent_des_exprimes: elections.pourcent(l.voix, b.exprimes),
    })),
  };
}

export function electionsAnswer(lieu?: string, scrutin?: string, annee?: number) {
  const sources = credits([elections.SOURCE]);
  const mis_a_jour = jourDuFichier(elections.MIS_A_JOUR);
  const asked = lieu?.trim();
  if (!asked) {
    return text({
      resume: `Résultats des élections commune par commune depuis ${elections.DEBUT}, tels que le ministère de l'Intérieur les publie : inscrits, votants, blancs, nuls, exprimés, puis les voix de chaque candidat ou liste. Donner une commune.`,
      scrutins_disponibles: elections.NOMS,
      a_savoir: [elections.ORDRE],
      page: `${SITE_URL}/communes`,
      mis_a_jour,
      sources,
    });
  }
  const res = resolvePlace(asked);
  if (!res) return notFound(asked);
  const commune = res.lieu.commune;
  const all = elections.ofCommune(commune);
  const page = `${SITE_URL}${elections.chemin(slugify(commune))}`;
  const disponibles = all.map((s) => s.nom);
  if (scrutin && OU_VOTER.test(sansAccent(scrutin)) && bureauxVote.lieuxDe(commune).length) return pollingAnswer(asked, res, commune, page);
  const bv = bureauxVote.lieuxDe(commune);
  const bureaux_de_vote = bv.length ? `${bureauxVote.nombreDe(bv)} bureaux de vote dans ${bv.length} lieux : leur liste avec scrutin « bureaux de vote ».` : undefined;
  // The year, given apart or in the words (« municipales 2020 »).
  const quoi = scrutin?.trim() ?? "";
  const year = annee ?? (Number(/\b(19|20)\d\d\b/.exec(quoi)?.[0]) || undefined);
  const type = quoi ? typeAsked(quoi) : undefined;
  // Words that name no type and no year (« référendum »): nothing is answered in their place.
  const unread = Boolean(quoi) && !type && !year;
  const matching = unread ? [] : all.filter((s) => (!type || s.type === type) && (!year || s.annee === year));
  const s = matching[0];
  if (!s) {
    const dit = [quoi.replace(/\b(19|20)\d\d\b/, "").trim(), year].filter(Boolean).join(" ");
    return text({
      lieu: placeBlock(asked, res),
      resume: `Aucun scrutin « ${dit} » ${a(commune)} dans le jeu de données du ministère de l'Intérieur, qui commence en ${elections.DEBUT}. Ceux de la commune sont dans scrutins_disponibles.`,
      scrutins_disponibles: disponibles,
      page,
      mis_a_jour,
      sources,
    });
  }
  const tours = s.tours.flatMap((blocs, t) => (blocs.length
    ? [{ tour: s.tours.length > 1 ? elections.TOURS[t] : "Tour unique", resultats: blocs.map((b, i) => resultat(s, b, i, blocs.length)) }]
    : []));
  // The participation of the 1st round. The latest scrutin, nothing asked: the sentence of the commune's page, against the
  // island's. A scrutin asked: its own figures, the commune's races added up (they share no bureau).
  const d = !quoi && !year ? elections.derniere(commune) : undefined;
  const first = s.tours[0]!;
  const inscrits = first.reduce((n, b) => n + b.inscrits, 0);
  const votants = first.reduce((n, b) => n + b.votants, 0);
  const resume = d && d.nom === s.nom
    ? `${d.nom}, 1er tour : ${elections.pourcent(d.votants, d.inscrits)} des inscrits ont voté ${a(commune)}, ${elections.pourcent(d.ile.votants, d.ile.inscrits)} dans toute l'île.`
    : `${s.nom} ${a(commune)}, 1er tour : ${elections.pourcent(votants, inscrits)} des inscrits ont voté (${nombre(votants)} votants sur ${nombre(inscrits)} inscrits${s.type === "cant" ? ", dans les cantons qui votaient" : ""}).`;
  const sameYear = year && !type ? matching.slice(1).map((x) => x.nom) : [];
  return text({
    lieu: placeBlock(asked, res),
    resume,
    scrutin: { nom: s.nom, tours },
    meme_annee: sameYear.length ? sameYear : undefined,
    bureaux_de_vote,
    a_savoir: [elections.ORDRE, ...elections.notes([s]), ...(s.type === "cant" ? [elections.CANTONALES] : []), ASK_AGAIN],
    scrutins_disponibles: disponibles,
    page,
    mis_a_jour,
    sources,
  });
}
