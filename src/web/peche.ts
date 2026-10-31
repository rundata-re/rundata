/**
 * /peche: the rules of recreational fishing at La Réunion, for the day of the view: what is closed today, the sizes and
 * the quantities, the species never to take, the lagoons, from the prefect's two decrees (tools/peche.ts). Computed at
 * each view from the bundled rules: nothing is read but the vigilance's banner. In marketing's words (31/10/2026).
 */
import { longDate } from "../tools/calendrier.js";
import {
  AILLEURS, CARTE_BICHIQUES, especesDuJour, type Espece, HEURES_NOTE, INTERDITS, jourLocal, LAGONS, LAGONS_ARTICLE, LUES_LE, PAGE_DEAL, PAGE_DMSOI,
  PDF_1743, PDF_BICHIQUES, type Regle, TAILLES,
} from "../tools/peche.js";
import type { Alerte } from "./data.js";
import { connectorCta, crumbBar, crumbs, webPage } from "./domains.js";
import { esc } from "./map.js";
import { layout } from "./pages.js";

export const PATH = "/peche";
export const NOM = "Pêche";
export const TITLE = "Pêche de loisir à La Réunion\u00a0: fermetures du jour, tailles et quantités · rundata.re";
const META = "Langouste, bichiques, capucin nain, anguille marbrée\u00a0: ce qui est fermé aujourd'hui, les tailles et les quantités de la pêche de loisir, d'après les arrêtés du préfet.";
const H1 = "Pêche de loisir à La Réunion";
const LEAD = "Avant de partir pêcher\u00a0: ce qui est fermé aujourd'hui, les tailles minimales et les quantités, espèce par espèce, d'après les arrêtés du préfet.";

const upper = (s: string) => s.replace(/^\p{L}/u, (c) => c.toUpperCase());

function especeRow(e: Espece): string {
  return `<tr><th scope="row">${esc(e.nom)}</th><td data-label="État"><span class="badge${e.ferme ? "" : " m"}">${esc(e.etat)}</span>` +
    `<p>${esc(e.regles)}</p><p class="note"><a href="${esc(e.lien)}" rel="noopener">${esc(upper(e.texte))}</a></p></td></tr>`;
}

const regleRow = (r: Regle) =>
  `<tr><th scope="row">${esc(r.espece)}</th><td data-label="Règle">${esc(r.regle)}</td><td data-label="Texte">${esc(r.article)}</td></tr>`;

export function pechePage(origin: string, alerte?: Alerte, now = new Date()): string {
  const day = jourLocal(now);
  const especes = especesDuJour(day);
  const band = `${crumbBar(NOM)}
<div class="wrap intro solo"><div class="pitch">
  <p class="pill"><span class="dot"></span>Arrêtés du préfet</p>
  <h1>${esc(H1)}</h1>
  <p class="lead">${esc(LEAD)}</p>
</div></div>`;
  const today = `<section aria-labelledby="h-jour">
  <div class="sec-h"><h2 id="h-jour">Aujourd'hui, ${esc(longDate(day).replace(/ \d{4}$/, ""))}</h2></div>
  <div class="card"><table class="drought niveaux"><thead><tr><th scope="col">Espèce</th><th scope="col">Aujourd'hui</th></tr></thead><tbody>${especes.map(especeRow).join("")}</tbody></table>
  ${especes.some((e) => e.cle === "bichiques" && e.heures) ? `<p class="note">${esc(HEURES_NOTE)}</p>` : ""}</div>
</section>`;
  const sizes = `<section aria-labelledby="h-tailles">
  <div class="sec-h"><h2 id="h-tailles">Les tailles et les quantités</h2></div>
  <div class="card"><table class="drought niveaux"><thead><tr><th scope="col">Espèce</th><th scope="col">Règle</th><th scope="col">Texte</th></tr></thead><tbody>${TAILLES.map(regleRow).join("")}</tbody></table></div>
</section>`;
  const never = `<section aria-labelledby="h-interdits">
  <div class="sec-h"><h2 id="h-interdits">Interdits à la pêche de loisir, d'après l'arrêté\u00a0:</h2></div>
  <div class="card"><table class="drought niveaux"><thead><tr><th scope="col">Espèce</th><th scope="col">Règle</th><th scope="col">Texte</th></tr></thead><tbody>${INTERDITS.map(regleRow).join("")}</tbody></table></div>
</section>`;
  const lagons = `<section aria-labelledby="h-lagons">
  <div class="sec-h"><h2 id="h-lagons">Dans les lagons</h2></div>
  <div class="card"><p>${esc(LAGONS)}</p><p class="note">${esc(upper(LAGONS_ARTICLE))}.</p></div>
</section>
<section aria-labelledby="h-ailleurs"><div class="card warn"><h2 id="h-ailleurs">À savoir</h2><p>${esc(AILLEURS)}</p>
  <p><a href="${CARTE_BICHIQUES}" rel="noopener">La carte des zones de pêche des bichiques →</a></p></div></section>`;
  const lues = LUES_LE.split("-").reverse().join("/");
  const sources = `<section aria-labelledby="h-textes">
  <div class="sec-h"><h2 id="h-textes">Les textes</h2></div>
  <p class="sources">Sources\u00a0: arrêté préfectoral n° 1743 du 15 juillet 2008, <a href="${PDF_1743}" rel="noopener">version consolidée par la DMSOI</a> (Direction de la mer Sud océan Indien) au 1/1/2023, et <a href="${PAGE_DMSOI}" rel="noopener">la page de la DMSOI</a>. Arrêté préfectoral n° 2026-1319 du 17 août 2026 sur les bichiques (<a href="${PDF_BICHIQUES}" rel="noopener">arrêté signé</a>, <a href="${PAGE_DEAL}" rel="noopener">page de la DEAL de La Réunion</a>). Contenus sous Licence Ouverte 2.0 (etalab). Relus le ${lues}.</p>
</section>`;
  const body = `${today}\n${sizes}\n${never}\n${lagons}\n${sources}\n${connectorCta("peche_loisir", "les règles de la pêche de loisir")}`;
  return layout(origin, { title: TITLE, description: META, path: PATH, jsonld: [crumbs(origin, NOM, PATH), webPage(origin, PATH, TITLE, META, null)], alerte }, band, body);
}
