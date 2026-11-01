/**
 * The speed of the replays (the user, 01/11/2026: « un sélecteur de vitesse pour tous les écrans avec replay, la pluie
 * c'est trop lent »): one button next to « Lire », each touch the next speed, ×1 being the durations each replay had
 * before. The speed chosen is kept in the browser and shared by every replay, of this page and the next: the map of
 * /meteo and the chart and map of /electricite. Hidden with less motion asked, as « Lire ».
 */

import { inScript } from "./map.js";

/** The speeds, in the order a touch goes through them. */
export const VITESSES = [1, 2, 4, 0.5];

/** The button, as the server writes it; the script (VITESSE_JS) gives it the speed kept. */
export const vitesseBouton = (cls: string) => `<button type="button" class="${cls}" aria-label="Vitesse de lecture\u00a0: ×1">×1</button>`;

/**
 * A replay script's part: `V` the speed, `vbind(buttons, on)` its buttons, `on` called once the speed has changed, by
 * these buttons or by another replay's of the page. The browser's storage can be refused (a private window): the speed
 * then lasts as long as the page.
 */
export const VITESSE_JS = `const VS=${inScript(VITESSES)},VK="rundata-vitesse",vl=(v)=>"×"+String(v).replace(".",",");
let V=(()=>{try{const v=+localStorage.getItem(VK);return VS.includes(v)?v:1}catch(e){return 1}})();
const vbind=(bs,on)=>{const put=()=>{for(const b of bs){b.textContent=vl(V);b.setAttribute("aria-label","Vitesse de lecture\\u00a0: "+vl(V))}};put();
for(const b of bs)b.addEventListener("click",()=>{const v=VS[(VS.indexOf(V)+1)%VS.length];try{localStorage.setItem(VK,String(v))}catch(e){}document.dispatchEvent(new CustomEvent("rejeu-vitesse",{detail:v}))});
document.addEventListener("rejeu-vitesse",(e)=>{V=e.detail;put();if(on)on()})};`;
