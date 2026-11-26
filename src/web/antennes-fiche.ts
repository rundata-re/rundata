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
import island from "../places/island.json" with { type: "json" };
import { lienNom } from "./domains.js";
import { H, W } from "./map.js";
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

/** Each support's sheet, by its ANFR number: commune, height (0 when not declared), kind, rows, and [lon, lat] for the count around a point. */
export const fichesJson = () =>
  (body ??= JSON.stringify({
    du: FICHES_DU,
    s: Object.fromEntries(antennes.SUPPORTS.map((s) => [s.id, { c: COMMUNE[s.insee] ?? "", h: s.h, n: s.nature ?? "", e: trier(LIGNES[s.id] ?? []), p: [s.lon, s.lat] }])),
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
  aide: "Touchez ou cliquez une antenne de la carte pour voir sa fiche : opérateurs, technologies et bandes de fréquences, date de mise en service, hauteur, azimuts, et les antennes autour. Ailleurs sur la carte : les antennes autour de ce point.",
  puissance: "Puissance d'émission\u00a0: non publiée par l'ANFR.",
  mesures: "Les mesures d'exposition aux ondes près de chez vous sont sur ",
  moi: "Les antennes autour de moi",
  position: "Votre position ne quitte pas votre appareil.",
};

/** The sheet's box, and the button that counts the antennas around the visitor (hidden until the script runs). */
export const ficheBloc = () =>
  `<div class="autour" id="ant-moi-bloc" hidden><button type="button" class="btn sun" id="ant-moi">${MOTS.moi}</button>
<p class="note">${MOTS.position}</p><p class="note" id="ant-moi-msg" role="status" hidden></p></div>
<div class="card antfiche" id="antfiche" aria-live="polite" hidden></div>`;

/**
 * The sheet's script: the dot nearest the click (24 px at most, hidden ones left out) is chosen and ringed, the file is
 * asked once, the sheet written under the map. The map's own script holds back a drag and a double click's first click.
 */
export const ficheScript = () => `(()=>{const svg=document.getElementById("amap"),box=document.getElementById("antfiche");if(!svg||!box)return;
const [A,B,C,D]=${JSON.stringify(island.bbox)},WW=${W},HH=${H},NS="http://www.w3.org/2000/svg";
const S=[...svg.querySelectorAll("circle.s")];let data=null,sel=null;
const OP={o:"Orange",s:"SFR Réunion",f:"Free",z:"Zeop"},ET={s:"en service",o:"techniquement opérationnel",p:"projet approuvé"},G={GSM:"2G","UMTS":"3G","LTE":"4G","5G NR":"5G"};
const esc=(t)=>String(t).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const jour=(d)=>d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
const sys=(x)=>{const m=x.match(/^(.*) (\\d+)$/);if(!m||!G[m[1]])return esc(x);return G[m[1]]+" ("+esc(m[1])+"), bande des "+Number(m[2]).toLocaleString("fr-FR")+"\\u00a0MHz"};
const X='<button type="button" class="antf-x" aria-label="Fermer la fiche">Fermer</button>',SRC=()=>"Source\\u00a0: ANFR, données sur les réseaux mobiles, fichier du "+jour(data.du)+", Licence Ouverte 2.0. ${MOTS.mesures}"+${JSON.stringify(lienNom("https://www.cartoradio.fr", "cartoradio.fr", ' rel="noopener"'))}+".";
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742000*Math.asin(Math.sqrt(x))};
const dist=(m)=>m<1000?Math.round(m/10)*10+"\\u00a0m":(m/1000).toFixed(1).replace(".",",")+"\\u00a0km";
const actif=(f)=>f.e.some((r)=>r[2]!=="p");
const gens=(f)=>Object.keys(OP).map((k)=>{const g=[...new Set(f.e.filter((r)=>r[0]===k&&r[2]!=="p").map((r)=>G[r[1].replace(/ \\d+$/,"")]).filter(Boolean))].sort();return g.length?OP[k]+" ("+g.join(", ")+")":""}).filter(Boolean).join(", ");
let ici=null;const mark=(x,y)=>{const g=svg.querySelector(".ants");if(!g)return;if(!ici){ici=document.createElementNS(NS,"circle");ici.setAttribute("class","ici");ici.setAttribute("r","7")}ici.setAttribute("cx",x);ici.setAttribute("cy",y);g.appendChild(ici)};
const autour=(lat,lon,ou,sans)=>{const L=Object.keys(data.s).filter((id)=>id!==sans).map((id)=>{const f=data.s[id];return {id,f,d:km(lat,lon,f.p[1],f.p[0])}});
const R=[[500,"500\\u00a0m"],[1000,"1\\u00a0km"],[2000,"2\\u00a0km"]].map(([r,t])=>{const a=L.filter((x)=>x.d<=r),n=a.filter((x)=>actif(x.f)).length,p=a.length-n;return "<li>à moins de "+t+"\\u00a0: "+(n?n+" actif"+(n>1?"s":""):"aucun actif")+(p?", "+p+" en projet":"")+"</li>"});
const P=L.filter((x)=>actif(x.f)).sort((a,b)=>a.d-b.d)[0];
let h=X+"<h3>Autour de "+ou+"</h3><p>Supports d'antennes mobiles déclarés à l'ANFR, actifs (en service ou techniquement opérationnels) ou en projet, à vol d'oiseau\\u00a0:</p><ul>"+R.join("")+"</ul>";
if(P)h+="<p>Le plus proche des actifs\\u00a0: support n°\\u00a0"+esc(P.id)+(P.f.c?", "+esc(P.f.c):"")+", à "+dist(P.d)+", "+esc(gens(P.f))+'. <button type="button" class="antf-voir" data-i="'+esc(P.id)+'">Voir sa fiche</button></p>';
h+='<p class="note">Un nombre et une distance de supports déclarés, pas une mesure de l\\'exposition aux ondes. '+SRC()+"</p>";box.innerHTML=h};
const az=(a)=>{const l=a?a.split("|").map((x)=>x+"\\u00a0°"):[];return l.length?(l.length>1?l.slice(0,-1).join(", ")+" et "+l[l.length-1]:l[0]):"non publiés"};
const draw=(id)=>{const f=data.s[id];if(!f){box.innerHTML="<p>Fiche introuvable.</p>";return}
const lieu=f.c?"\\u00a0· "+esc(f.c):"";let h=X+'<h3>Support n°\\u00a0'+esc(id)+lieu+"</h3><p>"+(f.n?esc(f.n):"Nature du support non publiée")+", "+(f.h?"hauteur "+String(f.h).replace(".",",")+"\\u00a0m":"hauteur non publiée")+'.</p><p><button type="button" class="antf-voir antf-autour" data-i="'+esc(id)+'">Les antennes autour de ce support</button></p>';
for(const k of Object.keys(OP)){const R=f.e.filter((r)=>r[0]===k);if(!R.length)continue;const one=R.every((r)=>r[4]===R[0][4]);
h+="<h4>"+OP[k]+"</h4><ul>"+R.map((r)=>"<li>"+sys(r[1])+"\\u00a0: "+ET[r[2]]+(r[3]?", mise en service le "+jour(r[3]):", date de mise en service non publiée")+(one?"":"\\u00a0; azimuts\\u00a0: "+az(r[4]))+"</li>").join("")+"</ul>";
if(one)h+="<p>Azimuts des antennes\\u00a0: "+az(R[0][4])+" (0\\u00a0° = nord).</p>"}
if(!f.e.length)h+="<p>Systèmes non publiés.</p>";
h+="<p>${MOTS.puissance}</p><p class=\\"note\\">Valeurs déclarées par les opérateurs à l'ANFR, pas des mesures. "+SRC()+"</p>";
box.innerHTML=h};
const load=(fn)=>{box.hidden=false;if(data){fn();box.scrollIntoView({block:"nearest"});return}box.innerHTML="<p>Chargement de la fiche…</p>";
fetch("${fichesPath()}").then((r)=>{if(!r.ok)throw 0;return r.json()}).then((d)=>{data=d;fn();box.scrollIntoView({block:"nearest"})}).catch(()=>{box.innerHTML="<p>La fiche n'a pas pu être chargée\\u00a0: réessayez.</p>"})};
const pick=(c)=>{if(sel)sel.classList.remove("sel");sel=c;if(c)c.classList.add("sel")};
const open=(id)=>{pick(S.find((c)=>c.dataset.i===String(id))||null);load(()=>draw(id))};
svg.addEventListener("click",(e)=>{let best=null,bd=576;for(const c of S){if(c.classList.contains("h"))continue;const r=c.getBoundingClientRect(),dx=r.x+r.width/2-e.clientX,dy=r.y+r.height/2-e.clientY,d=dx*dx+dy*dy;if(d<bd){bd=d;best=c}}
if(best){pick(best);const id=best.dataset.i;load(()=>draw(id));return}
const m=svg.getScreenCTM&&svg.getScreenCTM();if(!m)return;const q=svg.createSVGPoint();q.x=e.clientX;q.y=e.clientY;const u=q.matrixTransform(m.inverse());
if(u.x<0||u.y<0||u.x>WW||u.y>HH)return;const lon=A+u.x/WW*(C-A),lat=D-u.y/HH*(D-B);pick(null);mark(u.x,u.y);load(()=>autour(lat,lon,"ce point"))});
box.addEventListener("click",(e)=>{const a=e.target.closest(".antf-autour");if(a){const id=a.dataset.i,f=data.s[id];pick(null);mark((f.p[0]-A)/(C-A)*WW,(D-f.p[1])/(D-B)*HH);autour(f.p[1],f.p[0],"ce support",id);box.scrollIntoView({block:"nearest"});return}
const v=e.target.closest(".antf-voir");if(v){open(v.dataset.i);return}if(e.target.closest(".antf-x")){box.hidden=true;pick(null);if(ici)ici.remove()}});
const bloc=document.getElementById("ant-moi-bloc"),moi=document.getElementById("ant-moi"),msg=document.getElementById("ant-moi-msg");
if(bloc&&moi&&msg){bloc.hidden=false;const say=(t)=>{msg.textContent=t;msg.hidden=!t};
moi.addEventListener("click",()=>{say("");if(!navigator.geolocation){say("Votre navigateur ne donne pas la position.");return}moi.disabled=true;
navigator.geolocation.getCurrentPosition((p)=>{moi.disabled=false;const lat=p.coords.latitude,lon=p.coords.longitude;if(lon<A||lon>C||lat<B||lat>D){say("Votre position n'est pas à La Réunion.");return}
pick(null);mark((lon-A)/(C-A)*WW,(D-lat)/(D-B)*HH);load(()=>autour(lat,lon,"votre position"))},(err)=>{moi.disabled=false;say(err.code===1?"Position non autorisée.":"Position introuvable\\u00a0: réessayez.")},{enableHighAccuracy:true,timeout:15000,maximumAge:60000})})}})();`;
