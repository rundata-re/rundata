/**
 * « Arrêts autour de moi » on /bus and the search for a stop (24/11/2026): « mon prochain bus » on a phone needed the
 * exact name of one's stop, which each network writes its own way (« Gare de St-Pierre », « Gare Routière de St
 * Pierre »). The position is asked of the phone at the click only, and the nearest stops are worked out there, from the
 * compact list of the stop pages loaded on that click (ARRETS_LISTE), the same for everyone: the position never leaves
 * the phone, the server neither receives nor keeps it. As « Autour de moi » of /defibrillateurs (web/domains.ts).
 */
import * as transit from "../providers/transit.js";
import { script } from "./scripts-declares.js";

/** The stops listed nearest the phone. */
export const ARRETS_AUTOUR = 5;

/**
 * The list's address: it changes with the stops (the build of src/transit/network.json), so that it is kept by the
 * browsers and Cloudflare as long as it is the same.
 */
export const ARRETS_LISTE = `/bus/arrets.${transit.BUILD}.json`;

/** Each stop page as [its slug after /bus/arret/, its name, its commune's index in `communes`, lat, lon] (5 decimals, about a metre). */
export interface ArretsListe {
  communes: string[];
  a: [string, string, number, number, number][];
}

let liste: ArretsListe | undefined;
export function arretsListe(): ArretsListe {
  if (liste) return liste;
  const communes: string[] = [];
  const at = (c: string) => (communes.includes(c) ? communes.indexOf(c) : communes.push(c) - 1);
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const a = [...transit.stopPages().values()].flatMap((p): ArretsListe["a"] => {
    const g = p.groups[0];
    return g ? [[p.slug, p.nom, at(p.commune), r5(g.lat), r5(g.lon)]] : [];
  });
  return (liste = { communes, a });
}

/** The list served at ARRETS_LISTE, kept a year: its address changes with it. */
export const arretsListeResponse = () =>
  new Response(JSON.stringify(arretsListe()), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });

/** The button's script, inline, declared to the page's policy (scripts-declares.ts). */
export const SCRIPT = `{const box=document.getElementById("arrets-autour"),btn=document.getElementById("arrets-autour-btn"),msg=document.getElementById("arrets-autour-msg"),res=document.getElementById("arrets-autour-res"),ul=document.getElementById("arrets-autour-list");
if(box&&btn&&msg&&res&&ul){box.hidden=false;
const LIST=${JSON.stringify(ARRETS_LISTE)},STOP="/bus/arret/",N=${ARRETS_AUTOUR};
const T={nogeo:"Votre navigateur ne donne pas la position. Cherchez votre arrêt par son nom.",refus:"Position non autorisée. Cherchez votre arrêt par son nom.",perdue:"Position introuvable. Réessayez, ou cherchez votre arrêt par son nom.",liste:"La liste des arrêts n'a pas pu se charger. Réessayez, ou cherchez votre arrêt par son nom."};
const e=(s)=>String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const say=(t)=>{msg.textContent=t;msg.hidden=!t};
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
const far=(k)=>k<1?Math.max(10,Math.round(k*100)*10)+"\\u00a0m":(Math.round(k*10)/10).toFixed(1).replace(".",",")+"\\u00a0km";
let list=null;
const show=(la,lo)=>{const near=list.a.map((s)=>({s,k:km(la,lo,s[3],s[4])})).sort((x,y)=>x.k-y.k).slice(0,N);
ul.innerHTML=near.map(({s,k})=>"<li><a href=\\""+e(STOP+s[0])+"\\"><span>"+e(s[1])+"</span><small>"+e(far(k)+" · "+list.communes[s[2]])+"</small></a></li>").join("");res.hidden=false};
btn.addEventListener("click",()=>{say("");if(!navigator.geolocation){say(T.nogeo);return}btn.disabled=true;
navigator.geolocation.getCurrentPosition((p)=>(list?Promise.resolve(list):fetch(LIST).then((r)=>{if(!r.ok)throw new Error(String(r.status));return r.json()})).then((l)=>{list=l;show(p.coords.latitude,p.coords.longitude)}).catch(()=>say(T.liste)).finally(()=>{btn.disabled=false}),
(err)=>{say(err.code===1?T.refus:T.perdue);btn.disabled=false},{enableHighAccuracy:true,timeout:15000,maximumAge:60000})})}}`;

/** The button, hidden until its script runs (no script, no button), its notes and its list, then the script. */
export const arretsAutour = () =>
  `<div class="autour" id="arrets-autour" hidden><button type="button" class="btn sun" id="arrets-autour-btn">Arrêts autour de moi</button>
<p class="note">Votre position ne quitte pas votre appareil.</p><p class="note" id="arrets-autour-msg" role="status" hidden></p>
<div id="arrets-autour-res" hidden><h2>Les ${ARRETS_AUTOUR} arrêts les plus proches, à vol d'oiseau</h2><ul class="rows lieux" id="arrets-autour-list"></ul><p class="note">Chaque arrêt mène à ses prochains départs.</p></div></div>
${script(SCRIPT)}`;

