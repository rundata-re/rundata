/**
 * /carte's time cursor: under the map, one bar that replays the radar's rain and the stations over the last 6 or 24
 * hours, shown only while one of these two layers is ticked; the other layers stay as they are now. Its files are
 * /meteo's replay bar's (rejeu.ts: no source more, no file more), its words those of « Revoir ». The bar is written by
 * the server, hidden without a script; the page's script (carte.ts) shows it and asks this one (CURSEUR_JS) on the first
 * touch of a length or of « Lire », at its own address, kept a year there. While it replays, the moment is written over
 * the map's bottom left corner, the legend of each layer replayed says its time, and the rings circle the stations that
 * measured rain in the hour; at the end of the bar, the map is back to now. The address of the page does not change.
 * Its style is in carte-style.ts (`.kcur`, `.kcur-m`): the sheet does not import the page.
 */

import { daysOf, PLAY_MS, REVOIR } from "./meteo-carte.js";
import { hash } from "./pwa.js";
import { PATHS } from "./rejeu.js";
import { VITESSE_JS, vitesseBouton } from "./vitesse.js";

/** The lengths the cursor replays: /meteo's two first. */
export const LONGUEURS = ["6h", "24h"] as const;

/** The cursor's settings, in the page's settings (carte.ts, conf). */
export const curseurConf = () => ({
  fichiers: Object.fromEntries(LONGUEURS.map((d) => [d, PATHS[d]])),
  lire: Object.fromEntries(LONGUEURS.map((d) => [d, REVOIR[d][1]])),
  ms: Object.fromEntries(LONGUEURS.map((d) => [d, PLAY_MS[d]])),
});

/** The bar, under the map's buttons; hidden without a script. Its lengths are a radiogroup, as /meteo's (replayBar). */
export function curseurBar(): string {
  const radios = LONGUEURS.map((d) => `<input type="radio" name="kcd" id="kcd-${d}" value="${d}"><label for="kcd-${d}">${REVOIR[d][0]}</label>`).join("");
  return `<div class="kcur" data-cur="${curseurScriptPath()}" hidden><div class="tabs" role="radiogroup" aria-labelledby="kcur-n"><span class="tabs-n" id="kcur-n">Revoir :</span>${radios}</div>` +
    `<button type="button" class="kcur-b" aria-label="${REVOIR["6h"][1]}">▶ Lire</button>${vitesseBouton("kcur-v")}` +
    `<input type="range" min="0" max="1" step="1" value="1" aria-label="Moment affiché sur la carte" hidden>` +
    `<span class="kcur-ko" hidden>L'historique n'a pas pu être chargé : la carte reste sur la dernière mesure. <button type="button">Réessayer</button></span>` +
    `<span class="sr" aria-live="polite"></span></div><p class="kcur-m" aria-hidden="true" hidden><span></span><b></b></p>`;
}

/**
 * The cursor's script. Its hooks in the page's (`svg.kc`, carte.ts): the settings, the drawing of the rain and of the
 * map's elements, the rings' layer, a layer's legend and block drawn again (`show`), the map back to now (`live`); and
 * its own, read by the page: `on` while a moment of the past is shown, `said` its legend, `frame` the moment drawn
 * again, `stop`, `go`. A step of the bar is an image of the radar: 5 minutes over 6 hours, a quarter of an hour over 24
 * (each the strongest rain of the hour up to it, as on /meteo). The stations are those of the round hour up to the
 * moment. Less motion asked: no « Lire », the bar moved by hand.
 */
const curseurJs = () => `(()=>{const svg=document.getElementById("kmap"),KC=svg&&svg.kc,bar=document.querySelector(".kcur");if(!KC||!bar)return;
const {K,el,rain,pv,place,hm,jm}=KC,C=K.curseur,fig=svg.closest("figure"),b=bar.querySelector(".kcur-b"),rng=bar.querySelector("input[type=range]"),ko=bar.querySelector(".kcur-ko"),ann=bar.querySelector(".sr"),mo=document.querySelector(".kcur-m");
const rm=matchMedia("(prefers-reduced-motion: reduce)").matches,days=${daysOf},HR=36e5;
${VITESSE_JS}
const hx=(t)=>{const [h,m]=hm(t).split(":");return +h+"\\u00a0h"+(m!=="00"?"\\u00a0"+m:"")};
const F={},D=new Map();let J=null,d="",S=0,E=0,ST=3e5,T=0,cur=-1,playing=false,raf=0,last=0,img=[],gaps=[],hrs=null,W0=0,H0=0,R=null,HK=-1;
const unrle=(s)=>{let o="";for(const p of s.split(","))if(p)o+=p[0].repeat(parseInt(p.slice(1),36));return o};
const grid=(x)=>{let g=D.get(x);if(!g){g={w:W0,h:H0,pluie:unrle(x.e.pluie),mal_vu:unrle(x.e.mal_vu||"")};D.set(x,g)}return g};
// The file's images and hours; the bar from 6 or 24 hours before its latest, a step an image.
const setup=(j)=>{const r=j.radar,h=j.heures;W0=r?r.w:0;H0=r?r.h:0;D.clear();
img=r?r.entrees.filter((e)=>!e.trou).map((e)=>({t:Date.parse(e.fin),de:e.de?Date.parse(e.de):0,e})):[];gaps=r?r.entrees.filter((e)=>e.trou).map((e)=>[Date.parse(e.de),Date.parse(e.a)]):[];
hrs=h&&h.st.length?{fin:Date.parse(h.fin),n:h.heures,st:h.st}:null;const ts=img.map((x)=>x.t).concat(hrs?[hrs.fin]:[]);if(!ts.length)return false;
ST=d==="6h"?3e5:9e5;E=Math.max(...ts);S=E-(d==="6h"?6:24)*HR;rng.max=String(Math.round((E-S)/ST));rng.hidden=false;return true};
// The moment's image (none in a hole of the radar) and round hour of the stations.
const at=(t)=>{let x=null;for(let a=img.length-1;a>=0;a--)if(img[a].t<=t){x=img[a];break}if(x&&(t-x.t>(d==="6h"?9e5:HR)||gaps.some(([a,z])=>a>=x.t&&a<=t&&t<z)))x=null;
const k=hrs?Math.min(hrs.n-1,Math.floor((t-(hrs.fin-(hrs.n-1)*HR))/HR)):-1;return{x,k,h:hrs&&k>=0?hrs.fin-(hrs.n-1-k)*HR:0}};
const on=(id)=>KC.boxes.some((x)=>x.value===id&&x.checked);
const stations=(k)=>{const g=svg.querySelector('.kl[data-c="stations"]');g.replaceChildren();const wet=[];if(k<0){pv.replaceChildren();return}
for(const s of hrs.st){const v=s.t[k],r=s.rr[k];if(v==null&&r==null)continue;const d0="M"+s.x+" "+s.y+"h0",a=el("a",{class:"sp","aria-hidden":"true"});a.append(el("path",{class:"kr",d:d0}),el("path",{class:"kd",d:d0}));
if(v!=null){const t=el("text",{x:s.x,y:s.y,dy:"-.75em",class:"kt"});t.textContent=Math.round(v)+"°";a.append(t)}g.append(a);if(r>0)wet.push(s)}
pv.replaceChildren(...wet.flatMap((s)=>[el("circle",{class:"kpb",cx:s.x,cy:s.y,r:"12"}),el("circle",{cx:s.x,cy:s.y,r:"12"})]));place()};
// The moment over the map's bottom left corner, where the sea is.
const corner=()=>{if(mo.hidden)return;const a=svg.getBoundingClientRect(),f=fig.getBoundingClientRect();mo.style.left=a.left-f.left+12+"px";mo.style.top=a.bottom-f.top-mo.offsetHeight-12+"px"};
if(window.ResizeObserver)new ResizeObserver(corner).observe(svg);
// The moment T drawn, when its step changed or forced; the words of the moment said.
const frame=(force)=>{if(!J)return"";const i=Math.max(0,Math.min(+rng.max,Math.round((T-S)/ST))),t=S+i*ST;if(i===cur&&!force)return ann.dataset.s||"";cur=i;rng.value=String(i);R=at(t);
if(R.x)rain(grid(R.x));else rain({w:1,h:1,pluie:"",mal_vu:""});if(hrs&&(force||R.k!==HK)){HK=R.k;stations(R.k)}
const de=R.x&&R.x.de,dd=d!=="6h"||jm(S)!==jm(E)?days(de||0,R.x?R.x.t:t,false)+" ":"";mo.querySelector("span").textContent=dd;mo.querySelector("b").textContent=de?hx(de)+" – "+hx(R.x.t):hx(R.x?R.x.t:t);mo.hidden=false;corner();
["pluie","stations"].forEach((id)=>{if(on(id))KC.show(id)});const s=(dd+mo.querySelector("b").textContent).trim();rng.setAttribute("aria-valuetext",s);ann.dataset.s=s;return s};
KC.said=(c)=>{if(!KC.on||!R)return null;if(c.id==="pluie")return R.x?["image de "+(R.x.de?hm(R.x.de)+" – ":"")+hm(R.x.t)].concat(R.x.de?["à chaque endroit, la pluie la plus forte vue par le radar de Météo-France pendant les heures écrites sur la carte"]:[]):["pas d'image radar"];
if(c.id==="stations"&&R.h){const n=svg.querySelectorAll('.kl[data-c="stations"] a').length;return[n+"\\u00a0"+(n>1?c.unite[1]:c.unite[0]),"mesures de "+hm(R.h)]}return null};
KC.frame=frame;
const btn=()=>{b.disabled=false;b.textContent=playing?"❚❚ Pause":"▶ Lire";b.setAttribute("aria-label",playing?"Mettre en pause":C.lire[d||"6h"])};
// Back to now: the layers drawn again from their files, the bar at its end.
const live=()=>{stop(false);KC.on=false;R=null;cur=-1;HK=-1;mo.hidden=true;if(J)rng.value=rng.max;KC.live();btn()};
const tick=(t)=>{raf=requestAnimationFrame(tick);const dt=last?Math.min(100,t-last):0;last=t;T=Math.min(E,T+(E-S)*dt*V/C.ms[d]);frame(false);if(T>=E)live()};
const play=()=>{if(T>=E)T=S;KC.on=true;playing=true;last=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);btn()};
const stop=(say)=>{playing=false;cancelAnimationFrame(raf);btn();if(say)ann.textContent=ann.dataset.s||""};
KC.stop=()=>{if(KC.on)live()};
// A length: its file asked once, then played from its start (shown at its start with less motion).
KC.go=(x)=>{stop(false);d=x;for(const c of bar.querySelectorAll("[name=kcd]"))c.checked=c.value===x;ko.hidden=true;b.textContent="Chargement…";b.disabled=true;b.removeAttribute("aria-label");
(F[x]||(F[x]=fetch(C.fichiers[x]).then((r)=>{if(!r.ok)throw new Error(String(r.status));return r.json()}))).then((j)=>{if(d!==x)return;J=j;if(!setup(j))throw new Error("vide");
T=S;KC.on=true;cur=-1;HK=-1;if(rm){btn();ann.textContent=frame(true)}else{frame(true);play()}}).catch(()=>{delete F[x];if(d===x){J=null;KC.on=false;rng.hidden=true;mo.hidden=true;KC.live();btn();ko.hidden=false}})};
b.addEventListener("click",()=>{if(!J){KC.go(d||"6h");return}playing?stop(true):play()});
vbind([bar.querySelector(".kcur-v")].filter(Boolean));
rng.addEventListener("input",()=>{if(!J)return;if(playing)stop(false);KC.on=true;T=S+(+rng.value)*ST;if(T>=E)live();else frame(false)});
rng.addEventListener("change",()=>{ann.textContent=KC.on?ann.dataset.s||"":""});
if(rm){b.hidden=true;const v=bar.querySelector(".kcur-v");if(v)v.hidden=true}
if(KC.want)KC.go(KC.want)})()`;

let curseurText: string | undefined;
/** The cursor's script, served at its address (site.ts), kept a year there: it changes with the script. */
export const curseurScript = () => (curseurText ??= curseurJs());
let curseurPath: string | undefined;
export const curseurScriptPath = () => (curseurPath ??= `/carte/curseur-${hash(curseurScript())}.js`);
export const CURSEUR_FILE = /^\/carte\/curseur-\w+\.js$/;

/** The page's part (in CARTE_SCRIPT): the bar shown while the rain or the stations are ticked, its script asked on a first touch. */
export const CURSEUR_PAGE = `const cb=document.querySelector(".kcur");let cs=null;
const anim=()=>{if(!cb)return;const h=!boxes.some((b)=>b.checked&&(b.value==="pluie"||b.value==="stations"));if(h&&!cb.hidden&&KC.stop)KC.stop();cb.hidden=h};
if(cb){const lb=cb.querySelector(".kcur-b"),ko=cb.querySelector(".kcur-ko");
const load=(x)=>{ko.hidden=true;if(KC.go)return KC.go(x);KC.want=x;if(cs)return;lb.textContent=M.chargement;lb.disabled=true;
cs=document.createElement("script");cs.src=cb.dataset.cur;cs.onerror=()=>{cs.remove();cs=null;lb.textContent="▶ Lire";lb.disabled=false;ko.hidden=false};document.head.append(cs)};
const pick=()=>{const c=cb.querySelector("[name=kcd]:checked")||cb.querySelector("[name=kcd]");c.checked=true;return c.value};
cb.addEventListener("change",(e)=>{if(e.target.name==="kcd")load(e.target.value)});lb.addEventListener("click",()=>{if(!KC.go)load(pick())});ko.querySelector("button").addEventListener("click",()=>load(pick()))}`;

