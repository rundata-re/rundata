/**
 * The full screen of a map: the map, its buttons, its legend and its panel (views, backgrounds, layers) on one screen,
 * without scrolling. A button « Plein écran » joins the map's buttons (`barre`); pressed, the page's block (`boite`)
 * takes the whole screen: the map (`carte`) fills what is left, its buttons over its top left corner, and the panel's
 * pieces (`panneau`, moved there while it lasts, put back after) at its side on a wide screen, under it on a phone,
 * where the panel scrolls on its own. The browser's full screen when it allows one (a computer, Android); an iPhone
 * allows it only to a video, so there the block covers the page instead (position fixed, the screen's safe areas).
 * Escape or the button again leaves it. The map takes the largest size at its proportions; each change of size is told
 * to the page as a `resize`, so that the canvases, the IGN's tiles and the figures of the map are drawn again at the
 * map's new size. Written for any map: /carte first.
 */

import { inScript } from "./map.js";

export const MOTS = {
  entrer: "Plein écran",
  sortir: "Quitter le plein écran",
};

/** The selectors of a map's pieces, in its page. */
export interface PleinEcran {
  /** The block that takes the screen. */
  boite: string;
  /** The map and its legend, inside it: the map fills it. */
  carte: string;
  /** The map's buttons, which the button joins: over the map. */
  barre: string;
  /** What goes to the panel, in its order. */
  panneau: string[];
}

/** The script of a map's full screen, after its pieces in the page. Without a script, no button. */
export function pleinEcran(o: PleinEcran): string {
  return `<script>(()=>{const o=${inScript(o)},M=${inScript(MOTS)},box=document.querySelector(o.boite),map=box&&box.querySelector(o.carte),bar=box&&box.querySelector(o.barre);if(!map||!bar)return;
const b=document.createElement("button");b.type="button";b.className="pe-b";b.setAttribute("aria-pressed","false");b.textContent=M.entrer;bar.append(b);
const p=document.createElement("div");p.className="pe-p";const back=new Map(),root=document.documentElement;let on=false;
// The map as large as the room left allows, at its own proportions: no edge of the island cut, nothing shown outside its frame.
const size=()=>{const s=map.querySelector("svg");if(!s)return;s.style.flex=s.style.width=s.style.height="";if(!on)return;const v=s.viewBox.baseVal,r=v.width/v.height,w=s.clientWidth,h=s.clientHeight;if(!w||!h||!r)return;
s.style.flex="none";if(w/h>r){s.style.height=h+"px";s.style.width=Math.floor(h*r)+"px"}else s.style.height=Math.floor(w/r)+"px"};
const fit=()=>requestAnimationFrame(()=>{size();dispatchEvent(new Event("resize"))});
const enter=()=>{on=true;o.panneau.forEach((s)=>{const n=box.querySelector(s);if(!n)return;const c=document.createComment("pe");n.before(c);back.set(n,c);p.append(n)});box.append(p);
box.classList.add("pe-on");map.classList.add("pe-m");bar.classList.add("pe-c");root.classList.add("pe-lock");b.textContent=M.sortir;b.setAttribute("aria-pressed","true");
if(document.fullscreenEnabled&&box.requestFullscreen)box.requestFullscreen().catch(()=>{});fit()};
const leave=()=>{if(!on)return;on=false;back.forEach((c,n)=>c.replaceWith(n));back.clear();p.remove();
box.classList.remove("pe-on");map.classList.remove("pe-m");bar.classList.remove("pe-c");root.classList.remove("pe-lock");b.textContent=M.entrer;b.setAttribute("aria-pressed","false");
if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});fit()};
b.addEventListener("click",()=>on?leave():enter());
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement)leave();fit()});
addEventListener("resize",(e)=>{if(on&&e.isTrusted)fit()});
addEventListener("keydown",(e)=>{if(e.key==="Escape"&&on&&!document.fullscreenElement)leave()})})();</script>`;
}

/**
 * The full screen's style: a column on a phone (the map, then the panel), a row on a wide screen (the panel at the
 * map's side, never over it: what lies under the panel would be hidden).
 */
export const PLEIN_ECRAN_CSS = `
html.pe-lock,html.pe-lock body{overflow:hidden}
.pe-on{position:fixed;inset:0;z-index:1000;margin:0;display:flex;flex-direction:column;background:var(--bg);padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.pe-on .pe-m{flex:1;min-height:0;min-width:0;position:relative;display:flex;flex-direction:column;margin:0;border-radius:0;padding:.5rem}
.pe-on .pe-m>svg{flex:1;min-height:0;width:100%;height:100%;margin:auto}.pe-on .pe-m>figcaption{flex:none}
.pe-on .pe-c{position:absolute;top:.9rem;left:.9rem;z-index:2;margin:0;flex-wrap:wrap}.pe-on .pe-c button[data-z="0"]{margin-left:0}
.kzoom .pe-b{font-size:.9rem;padding:0 .8rem}
.pe-p{flex:none;max-height:38dvh;overflow:auto;overscroll-behavior:contain;padding:.6rem 1rem;border-top:1px solid var(--line);background:var(--bg)}
.pe-p>:first-child{margin-top:0}.pe-p .fonds{margin:.5rem 0}
@media (min-width:48rem){.pe-on{flex-direction:row}.pe-p{width:22rem;max-height:none;border-top:0;border-left:1px solid var(--line)}}
`.replace(/\n/g, "");
