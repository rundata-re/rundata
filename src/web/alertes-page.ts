/**
 * /alertes, « Les alertes sur votre téléphone »: the button that subscribes this phone to the alerts (web/alertes.ts,
 * push/abonnements.ts), and what sets one off (alertes-etat.ts). Behind the flag (alertes-drapeau.ts): until it opens,
 * the page answers 404 in production and shows only on the trial Worker.
 *
 * The button's script, inline and declared (scripts-declares.ts): it asks the browser for the notifications, subscribes
 * with the site's VAPID public key (GET /alertes/cle), gives the subscription to POST /alertes/abonnement, and on
 * « Ne plus recevoir » deletes it on the site (DELETE) before the browser forgets it. Its states are the words below,
 * agreed with the page; a subscription the site refused is undone in the browser, so the two never disagree.
 *
 * The words follow the code they describe: the list of what sets off an alert is alertes-etat.ts's rules, « 6 heures »
 * comes from push/abonnements.ts's TTL_S. A change of either changes this page in the same PR.
 */
import type { Alerte } from "./data.js";
import { crumbBar } from "./domains.js";
import { inScript } from "./map.js";
import { layout } from "./pages.js";
import { script } from "./scripts-declares.js";
import { TTL_S } from "../push/abonnements.js";
import { ABONNEMENT_PATH, CLE_PATH } from "./alertes.js";
import { ALERTES_PAGE, BOUTON_ALERTES } from "./alertes-drapeau.js";

export const PATH = ALERTES_PAGE;
/** How long the button waits for the service worker to be ready: one that cannot install never is, and the page says
 * the alerts are unavailable instead of staying silent. */
export const PRET_MS = 10_000;

const TITLE = "Les alertes sur votre téléphone";
const LEAD =
  "Une notification quand une vigilance orange ou rouge est émise, quand l'alerte cyclonique change, ou quand le niveau d'alerte du volcan change. Sans compte, sans nom, sans adresse électronique, et désactivable d'un geste.";
/** For search engines, which show 160 signs at most: the lead's first sentence, as it is. */
const DESCRIPTION = LEAD.slice(0, LEAD.indexOf(".") + 1);

/** The states the script shows, by name: the agreed words, word for word. */
export const ETATS = {
  abonne: "Alertes activées sur ce téléphone.",
  desabonne: "Ce téléphone ne recevra plus d'alertes. Son adresse de notification est effacée.",
  bloque: "Les notifications sont bloquées pour rundata.re dans les réglages de ce navigateur. Autorisez-les, puis appuyez de nouveau sur le bouton.",
  indisponible: "Les alertes ne peuvent pas être activées pour l'instant. Réessayez plus tard.",
  iphone: "Sur iPhone, les alertes ne marchent que depuis le site ajouté à l'écran d'accueil (iOS 16.4 ou plus récent).",
} as const;
export const BOUTON = BOUTON_ALERTES;
export const ARRETER = "Ne plus recevoir";


/**
 * The script of the button. Without Push (an old browser, an iPhone's Safari outside the home screen) it says so and
 * shows no button. Each step that fails leaves the phone as it was: a subscription the site refused is unsubscribed.
 * A service worker that is not ready after PRET_MS (one that could not install) is a failure like the others.
 */
const SCRIPT = `(()=>{const E=${inScript(ETATS)},$=(i)=>document.getElementById(i);
const msg=$("alertes-etat"),go=$("alertes-go"),stop=$("alertes-stop");
const show=(k,sub)=>{msg.textContent=k?E[k]:"";msg.hidden=!k;go.hidden=!!sub;stop.hidden=!sub};
const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const home=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)){show(ios&&!home?"iphone":"indisponible",false);go.hidden=true;return}
const reg=()=>navigator.serviceWorker.register(${inScript("/sw.js")}).then(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,n)=>setTimeout(()=>n(new Error("sw")),${PRET_MS}))]));
const key=(s)=>{const b=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,(c)=>c.charCodeAt(0))};
// The page's own reads, in the browser (registre.ts counts only the Worker's reads of other sites).
const cle=()=>fetch(${inScript(CLE_PATH)});
const send=(method,body)=>fetch(${inScript(ABONNEMENT_PATH)},{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
reg().then((r)=>r.pushManager.getSubscription()).then((s)=>show(s?"abonne":"",!!s)).catch(()=>show("",false));
go.addEventListener("click",async()=>{go.disabled=true;try{
const p=await Notification.requestPermission();if(p!=="granted")return show(p==="denied"?"bloque":"",false);
const r=await reg(),c=await cle();if(!c.ok)return show("indisponible",false);
const s=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key((await c.json()).cle)});
const a=await send("POST",s.toJSON());if(!a.ok){await s.unsubscribe().catch(()=>{});return show("indisponible",false)}
show("abonne",true)}catch{show(Notification.permission==="denied"?"bloque":"indisponible",false)}finally{go.disabled=false}});
stop.addEventListener("click",async()=>{stop.disabled=true;try{const r=await reg(),s=await r.pushManager.getSubscription();
if(s){const d=await send("DELETE",{endpoint:s.endpoint});if(!d.ok)return show("indisponible",true);await s.unsubscribe()}
show("desabonne",false)}catch{show("indisponible",true)}finally{stop.disabled=false}})})();`;

export function alertesPage(origin: string, alerte?: Alerte): string {
  const band = `${crumbBar(TITLE)}
<div class="wrap intro solo"><div class="pitch">
  <h1>${TITLE}</h1>
  <p class="lead">${LEAD}</p>
</div></div>`;
  const body = `<section class="app-page alertes">
  <div class="card">
    <h2>Ce qui déclenche une alerte</h2>
    <ul>
      <li><strong>Vigilance :</strong> une zone de Météo-France qui passe en vigilance orange ou rouge pour un phénomène, ou qui passe de l'orange au rouge. Une vigilance qui baisse n'envoie rien : la page <a href="/vigilance">Vigilance</a> le dit.</li>
      <li><strong>Cyclone :</strong> chaque changement de l'alerte cyclonique, de la pré-alerte à la phase de sauvegarde, dans un sens comme dans l'autre, et sa levée.</li>
      <li><strong>Volcan :</strong> chaque changement de niveau du dispositif ORSEC du Piton de la Fournaise à partir de l'Alerte 1, le retour à la Vigilance, et le début d'une éruption annoncé par la préfecture.</li>
    </ul>
    <p>Toutes les alertes arrivent sur chaque téléphone abonné : on ne choisit pas un sujet plutôt qu'un autre. Plusieurs changements au même moment arrivent dans une seule notification.</p>
  </div>
  <p class="appli-dl"><button type="button" class="app-go" id="alertes-go">${BOUTON}</button> <button type="button" class="app-go" id="alertes-stop" hidden>${ARRETER}</button></p>
  <p id="alertes-etat" role="status" hidden></p>
  <div class="note">
    <p>Une alerte rundata.re reprend Météo-France et la préfecture ; elle ne les remplace pas. En cas de doute, leurs consignes font foi.</p>
    <p>Un téléphone éteint ou hors réseau pendant plus de ${TTL_S / 3600} heures ne reçoit pas les alertes de cette période.</p>
  </div>
  <p><a href="/confidentialite#alertes">Ce qui est gardé, et comment l'effacer</a></p>
</section>
${script(SCRIPT)}`;
  return layout(origin, { title: TITLE, description: DESCRIPTION, path: PATH, jsonld: [], sansPartage: true, alerte }, band, body);
}
