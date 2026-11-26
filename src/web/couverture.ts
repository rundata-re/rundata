/**
 * /antennes, « Zones sans couverture déclarée »: where an operator declares no mobile coverage, by the Arcep's theoretical
 * coverage maps (« Mon Réseau Mobile », Licence Ouverte 2.0), built once a quarter by scripts/build-couverture.py into
 * src/vie/couverture.json. Declared by the operators, checked by sampling by the Arcep: never a measure, and the page says
 * so in those words. The layer shown first (no operator at all, 4G) is in the page; the nine others are one file at its
 * hashed address, read when a button asks for another one. No request to the Arcep at serve time.
 */
import data from "../vie/couverture.json" with { type: "json" };
import { nombre } from "../tools/format.js";
import { esc, islandMap, zoomIsland } from "./map.js";
import { hash } from "./pwa.js";
import type { SourceInfo } from "../types.js";

/** The Arcep's operators, as the site names them (scripts/build-antennes.py: Telco OI sells as Free, SRR as SFR Réunion). */
const OPS = [["OF", "Orange"], ["SRR", "SFR Réunion"], ["TELC", "Free"], ["ZEOP", "Zeop"]] as const;
const TECHNOS = [["4g", "Internet 4G"], ["voix", "Appels (2G, 3G)"]] as const;
const PREMIERE = "aucun-4g";

const [an, t] = data.trimestre.split("_T");
const date = `${data.date.slice(8, 10)}/${data.date.slice(5, 7)}/${data.date.slice(0, 4)}`;

export const SOURCE_COUVERTURE: SourceInfo = {
  id: "arcep_couvertures_theoriques",
  nom: "Mon Réseau Mobile, cartes de couverture théorique",
  organisme: "Arcep",
  licence: "Licence Ouverte Etalab 2.0",
  attribution: "Arcep, Mon Réseau Mobile",
  url: "https://www.data.gouv.fr/datasets/mon-reseau-mobile",
};

// The words, the validated ones (25/11/2026): « déclarée par les opérateurs, vérifiée par sondage par
// l'Arcep », never « mesurée ».
export const MOTS = {
  titre: "Zones sans couverture déclarée",
  intro: `Les zones où aucun opérateur, ou l'opérateur choisi, ne déclare de couverture mobile, d'après les cartes de l'Arcep du ${t}e\u00a0trimestre ${an} (situation au ${date}). C'est la couverture déclarée par les opérateurs, vérifiée par sondage par l'Arcep\u00a0: une carte théorique, pas une mesure. À l'intérieur d'un bâtiment, le signal peut manquer même en zone couverte.`,
  operateur: "Opérateur :",
  aucun: "Aucun opérateur",
  techno: "Réseau :",
  legende: "En couleur : pas de couverture déclarée.",
  part: (p: number) => `${nombre(p)}\u00a0% de l'île`,
  tableau: "Part de l'île sans couverture déclarée",
  cote: "Calculé hors d'une bande de 100\u00a0m le long du littoral, où les contours de l'Arcep et ceux des communes diffèrent.",
  echec: "La carte n'a pas pu être chargée\u00a0: réessayez.",
};

const couches = () => Object.fromEntries(Object.entries(data.couches).filter(([k]) => k !== PREMIERE));
let file: string | undefined;
const fichier = () => (file ??= JSON.stringify(couches()));
let path: string | undefined;

export const COUVERTURE_FILE = /^\/antennes\/couverture-\w+\.json$/;
/** The layers other than the first, at an address that changes with them (immutable for a year). */
export const couverturePath = () => (path ??= `/antennes/couverture-${hash(fichier())}.json`);

export function couvertureFile(p: string): Response | null {
  if (!COUVERTURE_FILE.test(p)) return null;
  return new Response(fichier(), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": p === couverturePath() ? "public, max-age=31536000, immutable" : "public, max-age=300", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" },
  });
}

const choix = (name: string, label: string, list: readonly (readonly [string, string])[], on: string) =>
  `<div class="tabs aqtabs" role="radiogroup" aria-label="${esc(label.replace(/ :$/, ""))}"><span class="tl" aria-hidden="true">${esc(label)}</span>` +
  list.map(([v, tab]) => `<input type="radio" name="${name}" id="${name}-${v}" value="${v}"${v === on ? " checked" : ""}><label for="${name}-${v}">${esc(tab)}</label>`).join("") + `</div>`;

const parts = data.parts as Record<string, Record<string, number>>;

function tableau(): string {
  const rows = [["aucun", MOTS.aucun] as const, ...OPS].map(([k, nom]) =>
    `<tr><th scope="row">${esc(nom)}</th>${TECHNOS.map(([tk, tn]) => `<td data-label="${esc(tn)}">${nombre(parts[k][tk])}\u00a0%</td>`).join("")}</tr>`).join("");
  return `<div class="card table-wrap"><table class="drought niveaux"><caption>${esc(MOTS.tableau)}</caption><thead><tr><th scope="col">Opérateur</th>${TECHNOS.map(([, tn]) => `<th scope="col">${esc(tn)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><p class="note">${esc(MOTS.cote)}</p>`;
}

export function couvertureSection(): string {
  const overlay = `<path class="trou" fill-rule="evenodd" d="${data.couches[PREMIERE]}"/>`;
  const filtres = `<div class="couvf" hidden>${choix("co", MOTS.operateur, [["aucun", MOTS.aucun], ...OPS], "aucun")}${choix("ct", MOTS.techno, TECHNOS, "4g")}</div>`;
  return `<section aria-labelledby="h-couv"><h2 id="h-couv">${esc(MOTS.titre)}</h2>
  <p>${esc(MOTS.intro)}</p>
  <figure class="card mapcard couvmap">${filtres}` +
    zoomIsland(islandMap({ overlay, label: `Carte de La Réunion (974) : ${MOTS.titre.toLowerCase()} (Arcep)` }), "c", { id: "cmap" }) +
    `<figcaption class="note"><span class="sw"><i></i>${esc(MOTS.legende)}</span> <span class="cpart">${esc(MOTS.aucun)}, ${esc(TECHNOS[0][1])} : ${esc(MOTS.part(parts.aucun["4g"]))}</span></figcaption></figure>
  ${tableau()}</section>`;
}

/** The buttons: the layer asked for, from the page (the first) or the file, read once. */
// JSON put inside a <script>: never a « </script> », a « <!-- » nor a line separator that ends it or the statement.
const SANS: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
const js = (v: unknown) => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => SANS[c]);

export function couvertureScript(): string {
  const P = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v]));
  const N = Object.fromEntries([["aucun", MOTS.aucun], ...OPS]);
  const TN = Object.fromEntries(TECHNOS);
  return `(()=>{const f=document.querySelector(".couvf");if(!f)return;const fig=f.closest("figure"),path=fig.querySelector("path.trou"),part=fig.querySelector(".cpart"),
P=${js(P)},N=${js(N)},TN=${js(TN)},L={${js(PREMIERE)}:path.getAttribute("d")};let data=null,wait=null;
const nb=(x)=>String(x).replace(".",",");
const draw=()=>{const o=f.querySelector("input[name=co]:checked").value,t=f.querySelector("input[name=ct]:checked").value,k=o+"-"+t,show=(d)=>{path.setAttribute("d",d);part.textContent=N[o]+", "+TN[t]+" : "+nb(P[o][t])+"\\u00a0% de l'île"};
if(L[k]!=null)return show(L[k]);if(data)return show(data[k]);
wait??=fetch(${js(couverturePath())}).then((r)=>{if(!r.ok)throw 0;return r.json()});wait.then((d)=>{data=d;Object.assign(L,d);draw()}).catch(()=>{wait=null;part.textContent=${js(MOTS.echec)}})};
f.addEventListener("change",draw);f.hidden=false})();`;
}
