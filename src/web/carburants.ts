/**
 * The month's maximum fuel prices (/carburants), set by the prefect's order: the same in every station of the island.
 * Read from the stored copy of the order (providers/carburants.ts): nothing else is fetched. Before its 1st, a new
 * order is announced above the month in force, and the page turns by itself at 0 h (it is rendered per request).
 */
import type { Cached } from "../cache.js";
import * as carburants from "../providers/carburants.js";
import { eve, firstOf, fuelSay, INDISPONIBLE, keep } from "../tools/carburants.js";
import { connectorCta, crumbBar, crumbs, jourMois, lienNom, webPage } from "./domains.js";
import type { Alerte } from "./data.js";
import { esc } from "./map.js";
import { credits, DESCRIPTION_MAX, layout } from "./pages.js";
import { faqPage, texteStable, type Faq } from "./texte-stable.js";

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const signed = (p: carburants.Produit) =>
  p.precedent_eur == null ? "" : p.prix_eur === p.precedent_eur ? "stable" : `${p.prix_eur > p.precedent_eur ? "+" : "−"}${eur(Math.abs(p.prix_eur - p.precedent_eur))}`;
const find = (p: carburants.Prix, re: RegExp) => p.produits.find((x) => re.test(x.produit));

const say = (s: string) => jourMois(keep(s));

// The texts of the page, worded by marketing.
export const TITLE = "Prix carburants : essence, gazole, gaz · La Réunion (974)";

/** « Prix maximum en octobre 2026 à La Réunion (974) : sans plomb 2,00 €/L (+0,17 €), gazole 1,80 €/L (+0,12 €), bouteille de gaz 20,81 €. … » */
/**
 * The stable text (marketing, 14/11/2026), in place of the card « Des prix maximum, les mêmes dans toute l'île ». « Les
 * stations l'affichent en général tel quel » left out: nothing published says what the stations display.
 */
const LIRE = `<p>À La Réunion, le préfet fixe chaque mois les <b>prix maximum</b> des carburants et de la bouteille de gaz, par un arrêté. Ils tiennent compte des cours internationaux, du taux de change et du fret. Ils s'appliquent le 1er du mois, dans toutes les stations de l'île : aucune ne peut vendre plus cher.</p>
<p>La page donne les prix du mois en cours et ceux du mois précédent, avec l'écart pour chaque produit. Elle reprend aussi la phrase du communiqué de la préfecture qui résume la hausse ou la baisse. Nous relisons l'arrêté chaque jour : un nouveau prix apparaît sur le site dès que l'arrêté est publié.</p>
<p><b>Ce que la page réunit :</b></p>
<ul class="plain"><li>l'arrêté du mois, le précédent et l'écart entre les deux, sur une seule ligne par produit ;</li>
<li>les produits que l'on cherche moins souvent, comme le GNR, le pétrole lampant ou les carburants des professionnels de la mer.</li></ul>
<p><a href="/trafic">La circulation et l'état des routes →</a></p>`;

const FAQ: Faq[] = [
  { q: "Le prix est-il le même dans toutes les stations ?", a: "Le préfet fixe un prix maximum pour toute l'île : aucune station ne peut vendre plus cher." },
  { q: "Quand les prix changent-ils ?", a: "Le 1er de chaque mois, d'après l'arrêté du préfet. La page affiche le nouveau prix dès que l'arrêté est publié." },
  { q: "Où trouver le prix d'une station précise ?", a: "Il n'existe pas de relevé des prix station par station à La Réunion : les départements d'outre-mer ne sont pas dans le relevé national. Le prix maximum de cette page est donc la référence." },
  { q: "Pourquoi deux prix pour la bouteille de gaz ?", a: "L'arrêté donne le prix maximum de la bouteille de 12,5 kg, et un second prix une fois déduites les aides locales. La page reprend les deux tels quels." },
];

export function descriptionOf(p: carburants.Prix | undefined): string {
  if (!p) return "Prix maximum des carburants à La Réunion (974), fixés chaque mois par le préfet : sans plomb, gazole, bouteille de gaz. Partout sur l'île.";
  const sp = find(p, /^supercarburant$/i);
  const go = find(p, /^gazole$/i);
  const gaz = find(p, /^gaz$/i);
  const litre = (x?: carburants.Produit) => (x ? `${eur(x.prix_eur)}/L${signed(x) ? ` (${signed(x)})` : ""}` : "");
  const head = `Prix maximum en ${carburants.monthOf(p.depuis)} à La Réunion (974) : ${[sp && `sans plomb ${litre(sp)}`, go && `gazole ${litre(go)}`, gaz && `bouteille de gaz ${eur(gaz.prix_eur)}`].filter(Boolean).join(", ")}.`;
  // What search engines show: the end goes first when it does not fit.
  return [`${head} Fixés par le préfet, partout sur l'île.`, `${head} Fixés par le préfet.`].find((x) => x.length <= DESCRIPTION_MAX) ?? head;
}

export function carburantsPage(origin: string, data: Cached<carburants.Prix> | null, now = new Date(), alerte?: Alerte): string {
  const p = data?.value;
  const s = p && fuelSay(p, now);
  // Early in a month, before the new order is published or read: the order in force, said as such.
  const pending = s?.attente ? `<p class="note">${say(s.attente)}</p>` : "";
  const path = "/carburants";
  const description = descriptionOf(p);
  // The month in force: before the 1st, not the announced one.
  const h1 = s?.vigueur ? `Prix des carburants à La Réunion, ${carburants.monthOf(s.vigueur.depuis)}` : "Prix des carburants à La Réunion";
  // The prices unread (none in the store, the only place the Worker reads them): the tool's words, with the prefecture's link.
  const lead = !s ? `<p class="lead">${esc(INDISPONIBLE.slice(0, -1))}\u00a0: voir la préfecture (${lienNom(carburants.SOURCE.url, "reunion.gouv.fr", ' rel="noopener"')}).</p>`
    : s.annonce ? `<p class="lead">${say(s.annonce)}.</p>${s.jusquau ? `<p class="lead">${say(s.jusquau)}.</p>` : ""}`
    : `<p class="lead">${say(`${s.depuis} : ${s.lignes}`)}.</p>${pending}`;

  const band = `${crumbBar("Prix des carburants")}
<div class="wrap intro"><div class="pitch">
  <p class="pill">Arrêté du préfet${s?.vigueur ? ` · Prix depuis le ${esc(firstOf(s.vigueur.depuis).replace(/ \d{4}$/, ""))}` : ""}</p>
  <h1>${esc(h1)} <span class="n974">974</span></h1>
  ${lead}
</div></div>`;

  // Before the 1st, the columns say which prices apply when.
  const head = (day: string, prev: boolean) => (s?.avenir ? (prev ? `Jusqu'au ${firstOf(eve(p!.depuis))}` : `Au ${firstOf(day)}`) : firstOf(day));
  const table = p
    ? `<section aria-labelledby="h-prix"><div class="sec-h"><h2 id="h-prix">Tous les prix maximum</h2></div>
  <div class="card table-wrap"><table class="drought"><caption class="sr">Tous les prix maximum</caption><thead><tr><th scope="col">Produit</th><th scope="col">${say(head(p.depuis, false))}</th>${p.precedent_depuis ? `<th scope="col">${say(head(p.precedent_depuis, true))}</th>` : ""}<th scope="col">Écart</th></tr></thead><tbody>
  ${p.produits.map((x) => `<tr><th scope="row">${esc(carburants.label(x.produit))}${x.unite ? ` <span class="note">(${esc(x.unite)})</span>` : ""}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</th><td><b>${esc(eur(x.prix_eur))}</b></td>${p.precedent_depuis ? `<td>${x.precedent_eur != null ? esc(eur(x.precedent_eur)) : ""}</td>` : ""}<td>${esc(signed(x))}</td></tr>`).join("\n  ")}
  </tbody></table></div>
  <p class="note">D'après <a href="${esc(p.lien)}" rel="noopener">le communiqué de la préfecture</a> : « ${esc(p.titre)} ».</p></section>`
    : "";


  const body = `${table}
<section>${p && data ? `<p class="note">Source : ${credits([{ source: carburants.SOURCE.nom, licence: carburants.SOURCE.licence, attribution: carburants.SOURCE.attribution }])}.</p>` : ""}</section>
${texteStable(LIRE, FAQ)}
${connectorCta("annuaire_services_publics", "les prix des carburants")}`;
  return layout(origin, { title: TITLE, description, path, jsonld: [crumbs(origin, "Prix des carburants", path), webPage(origin, path, TITLE, description, data), faqPage(FAQ)], alerte, iaAside: true }, band, body);
}
