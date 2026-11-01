/**
 * /meteo's « Pluie tombée » (the user's « Ok go » of 01/11/2026 to the mock-up C): the rain fallen around a place, in mm,
 * since the start of its shower or over the last 1, 3, 6 or 24 hours. The radar's lame d'eau of each image of 5 minutes
 * (pluie-radar.ts, decodeMm), added up in the browser from CUMULS_PATH; the place's rain gauge, its round hours, beside
 * it: the radar estimates, the gauge measures.
 * The shower around a place: going back from the last image, its rain within 2 km (any class, from 0.1 mm/h) after the
 * last hour without any. Shown by default while it rains there or ended less than 3 hours ago; otherwise the 24 hours.
 * The page holds only the section's title: the map and the places, with the script, are asked only when the visitor
 * comes near it (10.8 kB compressed in the page, 70 places and the island drawn a second time).
 */
import { esc, H, islandMap, KM, project, W } from "./map.js";
import { GH, GW, MM_CHARS, MM_MIN, MM_STEP } from "./pluie-radar.js";
import * as meteofrance from "../providers/meteofrance.js";
import { hash } from "./pwa.js";
import { CUMULS_PATH } from "./rejeu.js";

const HOUR_MS = 3_600_000;
/** The reach of a shower around a place, in km. */
export const RAYON_KM = 2;
/** The lengths one can choose, in hours. */
export const DUREES_H = [1, 3, 6, 24] as const;
/** A shower ended less than this ago is still the default length. */
export const FINIE_MS = 3 * HOUR_MS;
/** The steps of the map's colours, in mm, and the colours, light and dark (the radar's on the map above). */
export const PALIERS = [1, 5, 20, 50];
const TEINTES = { light: ["#abd8f3", "#7cb5f8", "#738be9", "#7561c5"], dark: ["#284972", "#405a9d", "#6469c3", "#8c79e0"] };

/**
 * The shower at the end of the images: `wet[i]` whether image i has rain around the place (null for a gap), `de[i]` and
 * `a[i]` its start and end (ms). From the last wet image back to the last hour without rain: its first wet image's start
 * (`de`, null when the hour is not in the images), and the last wet image's end (`fin`). Null without rain.
 */
export const averse = (wet: (boolean | null)[], de: number[], a: number[]): { de: number | null; fin: number } | null => {
  let i = wet.length - 1;
  while (i >= 0 && wet[i] !== true) i--;
  if (i < 0) return null;
  let first = de[i], dry = 0;
  for (let j = i; j >= 0; j--) {
    if (wet[j] === true) { first = de[j]; dry = 0; }
    else if (wet[j] === false && (dry += a[j] - de[j]) >= 3_600_000) return { de: first, fin: a[i] };
  }
  return { de: null, fin: a[i] };
};

/**
 * The lame d'eau in mm of each of the `n` cells summed over the images `ims` ([start, end, mm or null]) ending after
 * `from` up to `to`; NaN where none saw it. With it, the minutes of the length that no image with its mm covers.
 */
export const somme = (ims: [number, number, Float32Array | null][], n: number, from: number, to: number): [Float32Array, number] => {
  const out = new Float32Array(n).fill(NaN);
  let covered = 0;
  for (const [d, f, mm] of ims) {
    if (f <= from || f > to || !mm) continue;
    covered += f - Math.max(d, from);
    for (let k = 0; k < n; k++) if (mm[k] === mm[k]) out[k] = (out[k] === out[k] ? out[k] : 0) + mm[k];
  }
  return [out, Math.max(0, Math.round((to - from - covered) / 60_000))];
};

/**
 * A rain gauge's rain over the round hours within `from` to `to`: `rr` its hours, oldest first, the last ending at
 * `fin` (ms). [mm, start, end], mm null when an hour is not measured; null when no whole hour is within.
 */
export const pluvio = (rr: (number | null)[], fin: number, from: number, to: number): [number | null, number, number] | null => {
  let mm: number | null = 0, d = Infinity, f = -Infinity;
  rr.forEach((v, k) => {
    const e = fin - (rr.length - 1 - k) * 3_600_000;
    if (e - 3_600_000 < from || e > to) return;
    d = Math.min(d, e - 3_600_000);
    f = Math.max(f, e);
    mm = v == null || mm == null ? null : mm + v;
  });
  return f < 0 ? null : [mm, d, f];
};

/** The cells of a grid `w` × `h` within `r` cells of the cell cx, cy. */
export const autour = (cx: number, cy: number, w: number, h: number, r: number): number[] => {
  const out: number[] = [], n = Math.ceil(r);
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
    const gx = cx + dx, gy = cy + dy;
    if (gx >= 0 && gy >= 0 && gx < w && gy < h && dx * dx + dy * dy <= r * r) out.push(gy * w + gx);
  }
  return out;
};

/** RAYON_KM in cells of the radar's grid. */
const RAYON = Math.round((RAYON_KM / ((KM * W) / GW)) * 100) / 100;

/** The map and its controls, written by the script: the Météo-France stations to choose from, those without hours of rain left out then. */
function figure(): string {
  const options = meteofrance.stations().sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((s) => {
    const [x, y] = project(s.lon, s.lat);
    return `<option value="${esc(s.id)}" data-x="${Math.round(x)}" data-y="${Math.round(y)}">${esc(s.nom)}</option>`;
  }).join("");
  const radios = [`<input type="radio" name="cud" id="cud-a" value="a"><label for="cud-a">Début de l'averse</label>`,
    ...DUREES_H.map((h) => `<input type="radio" name="cud" id="cud-${h}" value="${h}"><label for="cud-${h}">${h}\u00a0h</label>`)].join("");
  const legend = PALIERS.map((p, i) => `<span class="cu-sw"><i style="--c:var(--cu${i})"></i>${i < PALIERS.length - 1 ? `${p} à ${PALIERS[i + 1]}\u00a0mm` : `${p}\u00a0mm et plus`}</span>`).join("");
  const canvas = `<foreignObject width="${W}" height="${H}" clip-path="url(#isl-clip)"><canvas class="voile" width="${GW}" height="${GH}"></canvas></foreignObject>`;
  const mark = `<circle class="cu-mk" r="${Math.round(RAYON_KM / KM)}" cx="-99" cy="-99"/>`;
  return `<div class="cu-c"><label for="cu-l">Lieu</label> <select id="cu-l">${options}</select></div>` +
    `<fieldset class="tabs cu-d"><legend>Depuis\u00a0:</legend>${radios}</fieldset><p class="cu-t" aria-live="polite">Chargement…</p>` +
    islandMap({ under: canvas, top: mark, label: "Carte de La Réunion (974) : la pluie estimée par le radar sur la durée choisie" }) +
    `<figcaption class="note"><span class="cu-lg">${legend}</span><span class="cu-n"></span></figcaption>`;
}

/** The section, hidden until the page's script shows it and asks its own. */
export const cumulsSection = (): string => `<section id="pluie-tombee" aria-labelledby="h-cumuls" data-cumuls="${cumulsScriptPath()}" hidden>
  <div class="sec-h"><p class="eyebrow">Radar et pluviomètres</p><h2 id="h-cumuls">Pluie tombée autour d'un lieu</h2>
  <p>La pluie estimée par le radar de Météo-France, en mm, depuis le début de l'averse ou sur la durée choisie, et la pluie mesurée au pluviomètre du lieu.</p></div>
  <figure class="card mapcard cumap"></figure>
</section>`;

/** The inline part, in /meteo's page: shows the section, and asks its script when the visitor comes near it. */
export const CUMULS_LOADER = `const cu=document.getElementById("pluie-tombee");if(cu){cu.hidden=false;const go=()=>{const s=document.createElement("script");s.src=cu.dataset.cumuls;document.head.append(s)};
if("IntersectionObserver"in window){const io=new IntersectionObserver((e)=>{if(e.some((x)=>x.isIntersecting)){io.disconnect();go()}},{rootMargin:"400px"});io.observe(cu)}else go()}`;

const cumulsJs = () => `(()=>{const cu=document.getElementById("pluie-tombee");cu.querySelector("figure").innerHTML=${JSON.stringify(figure())};const sel=document.getElementById("cu-l"),t=cu.querySelector(".cu-t"),nt=cu.querySelector(".cu-n"),cv=cu.querySelector("canvas"),mk=cu.querySelector(".cu-mk");
const averse=${averse},somme=${somme},pluvio=${pluvio},autour=${autour};
const C=${JSON.stringify(MM_CHARS)},V=Array.from(C,(_,k)=>${MM_MIN}*${MM_STEP}**k),P=${JSON.stringify(PALIERS)},T=${JSON.stringify(TEINTES)},NB="\\u00a0";
const p2=(n)=>String(n).padStart(2,"0"),loc=(ms)=>new Date(ms+144e5),hm=(ms)=>{const x=loc(ms);return p2(x.getUTCHours())+":"+p2(x.getUTCMinutes())};
const dm=(ms)=>p2(loc(ms).getUTCDate())+"/"+p2(loc(ms).getUTCMonth()+1),day=(ms)=>loc(ms).toISOString().slice(0,10),quand=(ms)=>{const d=day(ms),n=Date.now();return d===day(n)?"aujourd'hui à "+hm(ms):d===day(n-864e5)?"hier à "+hm(ms):"le "+dm(ms)+" à "+hm(ms)};
const span=(a,b)=>day(a)===day(b)?(day(a)===day(Date.now())?"":"le "+dm(a)+" ")+"de "+hm(a)+" à "+hm(b):"du "+dm(a)+" à "+hm(a)+" au "+dm(b)+" à "+hm(b);
const mmTxt=(v)=>(v>0&&v<.05?"moins de 0,1":v<.05?"0":v.toLocaleString("fr-FR",{maximumFractionDigits:1,minimumFractionDigits:v<10?1:0}))+NB+"mm";
const un=(s)=>s.split(",").map((r)=>r?r[0].repeat(parseInt(r.slice(1),36)):"").join("");
let D=null,ims=[],cls=[],w=0,h=0,lieu=null,choix=null;
try{lieu=localStorage.getItem("cumuls-lieu")}catch(e){}
const decode=(e)=>{const p=un(e.pluie),c=new Uint8Array(p.length);let mm=e.mm!=null?new Float32Array(p.length):null,n=0;
for(let k=0;k<p.length;k++){const x=p[k];c[k]=x==="."?255:+x;if(!mm)continue;if(x===".")mm[k]=NaN;else if(x!=="0"){if(n>=e.mm.length){mm=null;continue}mm[k]=V[C.indexOf(e.mm[n++])]}}
return[c,mm&&n===e.mm.length?mm:null]};
const st=()=>{const o=sel.selectedOptions[0];return{id:o.value,nom:o.textContent,x:+o.dataset.x,y:+o.dataset.y}};
const draw=(out)=>{const g=cv.getContext("2d",{willReadFrequently:true}),im=g.createImageData(w,h),pal=T[matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"].map((c)=>[1,3,5].map((i)=>parseInt(c.slice(i,i+2),16)));
for(let k=0;k<w*h;k++){const v=out[k];if(!(v>=P[0]))continue;let b=0;while(b<P.length-1&&v>=P[b+1])b++;im.data.set([...pal[b],235],k*4)}g.putImageData(im,0,0)};
const show=()=>{if(!D)return;const s=st(),cx=Math.floor(s.x*w/${W}),cy=Math.floor(s.y*h/${H}),ks=autour(cx,cy,w,h,${RAYON}),wet=cls.map((c)=>c?ks.some((k)=>c[k]!==255&&c[k]>0):null);
const de=ims.map((x)=>x[0]),a=ims.map((x)=>x[1]),to=a[a.length-1],av=averse(wet,de,a),first=de[0];
const on=av&&to-av.fin<${FINIE_MS};let m=choix??(on?"a":"24");cu.querySelector("#cud-a").disabled=!av;cu.querySelector("#cud-a+label").hidden=!av;if(m==="a"&&!av)m="24";
cu.querySelector("#cud-"+m).checked=true;const from=m==="a"?(av.de??first):Math.max(first,to-(+m)*36e5);
const[out,miss]=somme(ims,w*h,from,to),v=out[cy*w+cx];
draw(out);mk.setAttribute("cx",s.x);mk.setAttribute("cy",s.y);
const ici=v===v?mmTxt(v):"pas d'estimation du radar";
t.textContent=s.nom+NB+": "+ici+(m==="a"?(av.de==null?" depuis "+quand(from)+", l'averse avait déjà commencé":" depuis le début de l'averse, "+quand(from)):m==="1"?" sur la dernière heure":" sur les "+m+" dernières heures");
const hs=D.heures,g=hs&&hs.st.find((x)=>x.id===s.id),pv=g&&pluvio(g.rr,Date.parse(hs.fin),from,to);
nt.textContent=" Estimée par le radar "+span(from,to)+NB+": une estimation, pas une mesure."+(m!=="a"&&!av?" Pas de pluie vue par le radar à moins de 2"+NB+"km.":m!=="a"&&!on?" Dernière pluie vue par le radar à moins de 2"+NB+"km "+quand(av.fin)+".":"")+
(pv?pv[0]==null?" Le pluviomètre de "+s.nom+" n'a pas mesuré toutes les heures de cette durée.":" Pluviomètre de "+s.nom+NB+": "+mmTxt(pv[0])+" mesurés "+span(pv[1],pv[2])+".":" Le pluviomètre donne la pluie heure par heure"+NB+": pas d'heure entière sur cette durée.")+
(miss>=10?" Il manque "+(miss>=60?Math.floor(miss/60)+NB+"h"+(miss%60?NB+String(miss%60).padStart(2,"0"):""):miss+NB+"min")+" d'images du radar sur cette durée"+NB+": la pluie a pu être plus forte.":"")};
sel.addEventListener("change",()=>{try{localStorage.setItem("cumuls-lieu",sel.value)}catch(e){}choix=null;show()});
cu.querySelectorAll("[name=cud]").forEach((r)=>r.addEventListener("change",()=>{choix=r.value;show()}));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",show);
fetch(${JSON.stringify(CUMULS_PATH)}).then((r)=>{if(!r.ok)throw 0;return r.json()}).then((d)=>{const r=d.radar;if(!r||!r.entrees.length)throw 0;w=r.w;h=r.h;cv.width=w;cv.height=h;
for(const e of r.entrees){if("trou"in e){ims.push([Date.parse(e.de),Date.parse(e.a),null]);cls.push(null);continue}const[c,mm]=decode(e),f=Date.parse(e.fin);ims.push([f-3e5,f,mm]);cls.push(c)}
if(d.heures)for(const o of[...sel.options])if(!d.heures.st.some((x)=>x.id===o.value&&x.rr.some((v)=>v!=null)))o.remove();
if(lieu&&[...sel.options].some((o)=>o.value===lieu))sel.value=lieu;else if(d.heures){let best=-1;for(const o of sel.options){const g=d.heures.st.find((x)=>x.id===o.value),s=g?g.rr.reduce((x,y)=>x+(y||0),0):-1;if(s>best){best=s;sel.value=o.value}}}
D=d;show()}).catch(()=>{t.textContent="La pluie tombée n'a pas pu être chargée."})})()`;

let text: string | undefined;
/** The section's script, served at its address (site.ts), kept a year there: it changes with the script. */
export const cumulsScript = () => (text ??= cumulsJs());
let path: string | undefined;
export const cumulsScriptPath = () => (path ??= `/meteo/cumuls-${hash(cumulsScript())}.js`);
