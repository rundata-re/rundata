/**
 * The sheet of a mobile antenna support on /antennes: a click on a dot opens what the ANFR publishes about it, each
 * system of each operator (its generation and band), its declared state, its day in service and its antennas'
 * azimuths, with the support's kind and height. A field the file leaves empty is said « non publié »; the power is never
 * in it. The data is one file served at its hashed address (bundled, src/vie/antennes-fiches.json, built by
 * scripts/build-antennes.py), asked on the first click only: the page keeps its weight. Values declared, not measures.
 */
import { INSEE } from "../places/insee.js";
import * as antennes from "../vie/antennes.js";
import fiches from "../vie/antennes-fiches.json" with { type: "json" };
import { lienNom } from "./domains.js";
import { hash } from "./pwa.js";

/** [operator's letter, system (« LTE 1800 »), state (s, o, p), day in service or "", azimuths « 60|140|225 » or ""]. */
export type Ligne = [string, string, string, string, string];

/** A system's order on the sheet: by generation, then by band (« GSM 900 » before « LTE 700 », « LTE 700 » before « LTE 1800 »). */
const GEN = ["GSM", "UMTS", "LTE", "5G NR"];
const rang = (x: string) => {
  const m = /^(.*) (\d+)$/.exec(x);
  return m ? (GEN.indexOf(m[1]) + 1) * 1e5 + Number(m[2]) : 9e5;
};
const trier = (e: Ligne[]) => [...e].sort((a, b) => "osfz".indexOf(a[0]) - "osfz".indexOf(b[0]) || rang(a[1]) - rang(b[1]));

const COMMUNE = Object.fromEntries(Object.entries(INSEE).map(([nom, code]) => [code, nom]));
const LIGNES = fiches.supports as unknown as Record<string, Ligne[]>;
export const FICHES_DU = fiches.fichier_du;

let body: string | undefined;
let path: string | undefined;

/** Each support's sheet, by its ANFR number: commune, height (0 when not declared), kind, rows. */
export const fichesJson = () =>
  (body ??= JSON.stringify({
    du: FICHES_DU,
    s: Object.fromEntries(antennes.SUPPORTS.map((s) => [s.id, { c: COMMUNE[s.insee] ?? "", h: s.h, n: s.nature ?? "", e: trier(LIGNES[s.id] ?? []) }])),
  }));

export const FICHES_FILE = /^\/antennes\/fiches-\w+\.json$/;
export const fichesPath = () => (path ??= `/antennes/fiches-${hash(fichesJson())}.json`);

/** The sheets' file, kept a year at its address (it changes with the data), five minutes at an older one. */
export function fichesFile(p: string): Response | null {
  if (!FICHES_FILE.test(p)) return null;
  return new Response(fichesJson(), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": p === fichesPath() ? "public, max-age=31536000, immutable" : "public, max-age=300", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" },
  });
}

// The words of the sheet.
export const MOTS = {
  aide: "Touchez ou cliquez une antenne de la carte pour voir sa fiche : opérateurs, technologies et bandes de fréquences, date de mise en service, hauteur, azimuts.",
  puissance: "Puissance d'émission\u00a0: non publiée par l'ANFR.",
  mesures: "Les mesures d'exposition aux ondes près de chez vous sont sur ",
};

/**
 * The sheet's script: the dot nearest the click (24 px at most, hidden ones left out) is chosen and ringed, the file is
 * asked once, the sheet written under the map. The map's own script holds back a drag and a double click's first click.
 */
export const ficheScript = () => `(()=>{const svg=document.getElementById("amap"),box=document.getElementById("antfiche");if(!svg||!box)return;
const S=[...svg.querySelectorAll("circle.s")];let data=null,sel=null;
const OP={o:"Orange",s:"SFR Réunion",f:"Free",z:"Zeop"},ET={s:"en service",o:"techniquement opérationnel",p:"projet approuvé"},G={GSM:"2G","UMTS":"3G","LTE":"4G","5G NR":"5G"};
const esc=(t)=>String(t).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const jour=(d)=>d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
const sys=(x)=>{const m=x.match(/^(.*) (\\d+)$/);if(!m||!G[m[1]])return esc(x);return G[m[1]]+" ("+esc(m[1])+"), bande des "+Number(m[2]).toLocaleString("fr-FR")+"\\u00a0MHz"};
const az=(a)=>{const l=a?a.split("|").map((x)=>x+"\\u00a0°"):[];return l.length?(l.length>1?l.slice(0,-1).join(", ")+" et "+l[l.length-1]:l[0]):"non publiés"};
const draw=(id)=>{const f=data.s[id];if(!f){box.innerHTML="<p>Fiche introuvable.</p>";return}
const lieu=f.c?" · "+esc(f.c):"";let h='<button type="button" class="antf-x" aria-label="Fermer la fiche">Fermer</button><h3>Support n°\\u00a0'+esc(id)+lieu+"</h3><p>"+(f.n?esc(f.n):"Nature du support non publiée")+", "+(f.h?"hauteur "+String(f.h).replace(".",",")+"\\u00a0m":"hauteur non publiée")+".</p>";
for(const k of Object.keys(OP)){const R=f.e.filter((r)=>r[0]===k);if(!R.length)continue;const one=R.every((r)=>r[4]===R[0][4]);
h+="<h4>"+OP[k]+"</h4><ul>"+R.map((r)=>"<li>"+sys(r[1])+"\\u00a0: "+ET[r[2]]+(r[3]?", mise en service le "+jour(r[3]):", date de mise en service non publiée")+(one?"":"\\u00a0; azimuts\\u00a0: "+az(r[4]))+"</li>").join("")+"</ul>";
if(one)h+="<p>Azimuts des antennes\\u00a0: "+az(R[0][4])+" (0\\u00a0° = nord).</p>"}
if(!f.e.length)h+="<p>Systèmes non publiés.</p>";
h+="<p>${MOTS.puissance}</p><p class=\\"note\\">Valeurs déclarées par les opérateurs à l'ANFR, pas des mesures. Source\\u00a0: ANFR, données sur les réseaux mobiles, fichier du "+jour(data.du)+", Licence Ouverte 2.0. ${MOTS.mesures}"+${JSON.stringify(lienNom("https://www.cartoradio.fr", "cartoradio.fr", ' rel="noopener"'))}+".</p>";
box.innerHTML=h};
svg.addEventListener("click",(e)=>{let best=null,bd=576;for(const c of S){if(c.classList.contains("h"))continue;const r=c.getBoundingClientRect(),dx=r.x+r.width/2-e.clientX,dy=r.y+r.height/2-e.clientY,d=dx*dx+dy*dy;if(d<bd){bd=d;best=c}}
if(!best)return;if(sel)sel.classList.remove("sel");sel=best;best.classList.add("sel");const id=best.dataset.i;box.hidden=false;
if(data){draw(id);box.scrollIntoView({block:"nearest"});return}box.innerHTML="<p>Chargement de la fiche…</p>";
fetch("${fichesPath()}").then((r)=>{if(!r.ok)throw 0;return r.json()}).then((d)=>{data=d;draw(id);box.scrollIntoView({block:"nearest"})}).catch(()=>{box.innerHTML="<p>La fiche n'a pas pu être chargée : réessayez.</p>"})});
box.addEventListener("click",(e)=>{if(e.target.closest(".antf-x")){box.hidden=true;if(sel)sel.classList.remove("sel");sel=null}})})();`;
