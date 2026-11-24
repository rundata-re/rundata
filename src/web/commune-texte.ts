/**
 * The stable text of a commune's page (wording validated on 14/11/2026): how to read it, then 3 to 5 questions built from what the
 * site already has, each asked only when its data exists. Its own figures for each commune, and durable; no person
 * named (no mayor, no elected official). The commune's portrait is for later.
 */
import { distributeur, phrasePartage } from "../eau/distributeurs.js";
import { reseauxDe } from "../providers/transit.js";
import * as mf from "../providers/vigilance.js";
import { a, de } from "../tools/format.js";
import { zoneShort } from "../tools/vigilance.js";
import * as ecoles from "../vie/ecoles.js";
import * as elections from "../vie/elections.js";
import { esc } from "./map.js";
import type { Faq } from "./texte-stable.js";

/** A cable car is not a bus network: after them, in lower case (« et le téléphérique Papang », wording validated on 22/11/2026). */
export const cable = (nom: string) => /^Téléphérique\b/.test(nom);

export const COMMUNE_LIRE = "<p>En haut, ce qui change dans la journée, chaque donnée avec son heure et sa source : météo mesurée, vigilance, mer, eau, bus, mairie ouverte ou non. Plus bas, ce qui change rarement : écoles, médecins, loyers, fibre, élections. Chaque bloc renvoie à la page de l'île pour son thème.</p>";

/** « A, B et C ». */
const liste = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs.at(-1)}`);

/**
 * The questions of a commune, each only with its data. `slug`: the commune's, for the link to its water cuts.
 * `desservis`: its stops most served, linked after its networks (wording validated on 22/11/2026).
 */
export function communeFaq(commune: string, slug: string, desservis: { nom: string; page: string }[] = []): Faq[] {
  const faq: Faq[] = [];
  const d = distributeur(commune);
  if (d) {
    faq.push({
      q: `Qui distribue l'eau ${a(commune)} ?`,
      // Shared between distributors: each with its networks, then where the notices read are (only ever read).
      a: d.partage
        ? `${esc(phrasePartage(commune, d.partage))} Les avis de coupure de ${esc(d.nom)} sont sur <a href="/coupures-eau/${esc(slug)}">la page Coupures d'eau ${esc(de(commune))}</a>.`
        : `${esc(d.nom)}, d'après le contrôle sanitaire de l'ARS. ${d.avis
        ? `Les avis de coupure sont sur <a href="/coupures-eau/${esc(slug)}">la page Coupures d'eau ${esc(de(commune))}</a>.`
        : "Ses avis ne sont pas encore lus par rundata.re : adressez-vous à la mairie ou au distributeur."}`,
    });
  }
  const reseaux = reseauxDe(commune);
  const jaune = reseaux.some((n) => n.nom === "Car Jaune");
  const locaux = reseaux.filter((n) => n.nom !== "Car Jaune");
  if (locaux.length) {
    const dits = [...locaux.filter((n) => !cable(n.nom)).map((n) => n.nom), ...(jaune ? ["le Car Jaune"] : [])];
    const cables = locaux.filter((n) => cable(n.nom)).map((n) => `le ${n.nom.replace(/^T/, "t")}`);
    // Counted as before, without the Car Jaune: « Le réseau Kar'Ouest et le Car Jaune », « Les réseaux Citalis et le Car
    // Jaune, et le téléphérique Papang » (the validated words).
    const own = dits.length - (jaune ? 1 : 0);
    const bus = !own ? (jaune ? "Le Car Jaune" : "") : `${locaux.length > 1 ? "Les réseaux" : "Le réseau"} ${liste(dits)}`;
    faq.push({
      q: `Quels bus desservent ${commune} ?`,
      a: esc(bus ? `${bus}${cables.length ? `, et ${liste(cables)}` : ""}.` : `${liste(cables).replace(/^l/, "L")}.`) +
        (desservis.length ? ` Les arrêts les plus desservis\u00a0: ${desservis.map((s) => `<a href="/bus/arret/${esc(s.page)}">${esc(s.nom)}</a>`).join(", ")}.` : ""),
    });
  }
  const zone = zoneShort(mf.ZONE_OF_COMMUNE[commune]);
  if (zone) {
    faq.push({ q: `Dans quelle zone de vigilance est ${commune} ?`, a: esc(`La zone ${zone} de Météo-France. Seul le site de Météo-France fait foi.`) });
  }
  const list = ecoles.inCommune(commune);
  if (list.length) {
    const n = ecoles.KINDS.map((k) => [k.type, list.filter((e) => e.type === k.type).length] as const).filter(([, x]) => x).map(([t, x]) => ecoles.counted(t, x));
    faq.push({ q: `Combien d'écoles, de collèges et de lycées ${a(commune)} ?`, a: esc(`${liste(n)}, publics et privés, d'après l'annuaire de l'Éducation nationale.`) });
  }
  const muni = elections.participation(commune).find((x) => x.type === "muni");
  const dernier = muni?.tours.reduce((b, t) => (t.annee > b.annee ? t : b));
  if (dernier) {
    faq.push({
      q: `Quelle était la participation aux dernières municipales ${a(commune)} ?`,
      a: esc(`${elections.pourcent(dernier.votants, dernier.inscrits)} des inscrits ont voté au 1er tour en ${dernier.annee}, d'après le ministère de l'Intérieur.`),
    });
  }
  return faq;
}
