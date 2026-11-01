/**
 * The doctors in private practice (vie/medecins.ts), answered by annuaire_services_publics when the question is about
 * them: how many in the place's commune, the general practitioners by sector, the specialists by speciality; a speciality
 * asked (« pédiatre ») keeps that one alone. Numbers only: the names and the addresses are on the Assurance Maladie's
 * directory, linked in each answer.
 */
import { resolvePlace } from "../places/resolve.js";
import * as medecins from "../vie/medecins.js";
import { slugify } from "../web/places.js";
import { a, credits, notFound, placeBlock, text } from "./format.js";

/** The specialities asked in a resident's words, and the directory's wording of each. */
const SPECIALTIES: [RegExp, RegExp][] = [
  [/g[ée]n[ée]raliste|m[ée]decin (?:traitant|de famille)/i, /^Médecin généraliste$/],
  [/p[ée]diatr/i, /Pédiatre/],
  [/ophtalmo|\byeux\b/i, /Ophtalmologiste/],
  [/gyn[ée]co|obst[ée]tri/i, /Gynécologue/],
  [/dermato/i, /Dermatologue/],
  [/cardiolog/i, /^Cardiologue/],
  [/psychiatr/i, /Psychiatre/],
  [/radiolog|\birm\b|scanner|[ée]chograph|mammograph/i, /Radiologue/],
  [/\borl\b|oto-?rhino/i, /Oto-Rhino/],
  [/rhumato/i, /Rhumatologue/],
  [/pneumo/i, /Pneumologue/],
  [/neurolog/i, /^Neurologue/],
  [/gastro|h[ée]patolog/i, /Gastro-entérologue/],
  [/endocrino|diab[ée]tolog/i, /Endocrinologue/],
  [/urolog/i, /Urologue/],
  [/n[ée]phrolog|dialyse/i, /Néphrologue/],
  [/anesth[ée]s/i, /Anesthésiste/],
  [/allergo/i, /llergolog/],
  [/g[ée]riatr/i, /Gériatre/],
  [/chirurgien(?![- ]dentiste)/i, /^Chirurgien/],
];

/** Whether `quoi` asks for a doctor, a speciality or a sector; not a dentist (not in this list) nor a vet. */
export const DOCTOR = new RegExp(
  `(?<!v[ée]t[ée]rinaire.*)(?:m[ée]decins?\\b(?! (?:v[ée]t[ée]rinaire|du monde))|docteur|sp[ée]cialiste|secteur [12]|optam|${SPECIALTIES.map(([re]) => re.source).join("|")})`,
  "i",
);

const C = medecins.COMPTES;
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const notes = () => [
  `Annuaire santé de l'Assurance Maladie, fichier du ${dmy(C.mis_a_jour)} : le nombre de médecins libéraux de chaque commune (un médecin qui a deux cabinets dans la commune y compte une fois). Les noms, les adresses et les horaires des médecins sont sur l'annuaire santé Ameli, ${medecins.AMELI}. L'annuaire ne dit pas si un médecin prend de nouveaux patients : le demander au cabinet.`,
  medecins.SECTORS,
  "En urgence : le 15.",
];

/** « 3 médecins », « 12 médecins généralistes », « 1 médecin (Pédiatre) »: the speciality as the directory writes it. */
const counted = (n: number, one: string | undefined, specialist = false) =>
  `${n} médecin${n > 1 ? "s" : ""}${one === medecins.GP ? ` généraliste${n > 1 ? "s" : ""}` : one ? ` (${one})` : specialist ? ` spécialiste${n > 1 ? "s" : ""}` : ""}`;

export function medecinsAnswer(quoi: string, lieu: string | undefined) {
  const res = lieu?.trim() ? resolvePlace(lieu) : null;
  if (lieu?.trim() && !res) return notFound(lieu);
  // A speciality named keeps it alone; « spécialiste » the specialists; otherwise (« médecin », « secteur 1 »…) all.
  const named = SPECIALTIES.filter(([re]) => re.test(quoi)).map(([, s]) => s);
  const gp = named.length ? named.some((s) => s.test(medecins.GP)) : !/sp[ée]cialiste/i.test(quoi);
  const specs = named.length ? medecins.SPECIALITES.filter((s) => named.some((re) => re.test(s))) : medecins.SPECIALITES;
  const one = gp ? (specs.length ? undefined : medecins.GP) : specs.length === 1 ? specs[0] : undefined;

  const of = (c: medecins.Comptes) => {
    const rows = specs.filter((s) => c.specialistes[s]).map((s) => ({ specialite: s, nombre: c.specialistes[s].total, secteur_1: c.specialistes[s].secteur_1 }));
    const g = gp ? c.generalistes.total : 0;
    const sp = rows.reduce((n, r) => n + r.nombre, 0);
    return {
      total: g + sp,
      sector1: (gp ? c.generalistes.secteur_1 : 0) + rows.reduce((n, r) => n + r.secteur_1, 0),
      words: gp && specs.length ? `${counted(g, medecins.GP)} et ${counted(sp, undefined, true)}` : counted(g + sp, one, !gp),
      block: { generalistes: gp ? c.generalistes : undefined, specialistes: specs.length ? rows : undefined },
    };
  };

  if (!res) {
    const all = of(C.ile);
    return text({
      resume: `${all.words} libéraux à La Réunion d'après l'annuaire santé de l'Assurance Maladie, dont ${all.sector1} en secteur 1. Leurs noms et adresses sont sur l'annuaire santé Ameli, ${medecins.AMELI}. Donner une commune ou un lieu pour ses nombres.`,
      ...all.block,
      par_commune: Object.fromEntries(
        Object.entries(C.communes)
          .map(([c, v]) => [c, of(v)] as const)
          .filter(([, x]) => x.total)
          .map(([c, x]) => [c, { nombre: x.total, secteur_1: x.sector1 }]),
      ),
      ameli: medecins.AMELI,
      avertissements: notes(),
      sources: credits([medecins.SOURCE]),
    });
  }
  const { commune } = res.lieu;
  const here = medecins.ofCommune(commune);
  const x = here && of(here);
  const links = gp ? (here?.codes_postaux ?? []).map((cp) => ({ code_postal: cp, lien: medecins.ameliGps(cp) })) : [];
  if (!x?.total) {
    const elsewhere = Object.entries(C.communes).map(([c, v]) => [c, of(v).total] as const).filter(([, n]) => n);
    return text({
      lieu: placeBlock(lieu!, res),
      resume: `Aucun ${one && one !== medecins.GP ? `médecin (${one})` : "médecin de ce type"} libéral ${a(commune)} dans l'annuaire santé de l'Assurance Maladie. Ailleurs dans l'île : ${elsewhere.map(([c, n]) => `${n} ${a(c)}`).join(", ")}. Leurs noms et adresses sont sur l'annuaire santé Ameli, ${medecins.AMELI}.`,
      par_commune: Object.fromEntries(elsewhere),
      ameli: medecins.AMELI,
      avertissements: notes(),
      sources: credits([medecins.SOURCE]),
    });
  }
  const where = links.length === 1 ? links[0].lien : medecins.AMELI;
  return text({
    lieu: placeBlock(lieu!, res),
    resume: `${x.words} libéraux ${a(commune)} d'après l'annuaire santé de l'Assurance Maladie, dont ${x.sector1} en secteur 1. Leurs noms, adresses et horaires sont sur l'annuaire santé Ameli : ${where}.`,
    ...x.block,
    ameli: { accueil: medecins.AMELI, generalistes: links.length ? links : undefined },
    page: `https://rundata.re/communes/${slugify(commune)}#medecins`,
    avertissements: notes(),
    sources: credits([medecins.SOURCE]),
  });
}
