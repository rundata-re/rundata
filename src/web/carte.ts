/**
 * /carte: the island's layers on one map, to see them together and what crosses (the user, 31/10/2026: curiosity and the
 * crossing of data, not speed; the sections' own pages stay the way to find a defibrillator fast). The island's map
 * that zooms (carte-zoom.ts), with the IGN's backgrounds; under it, the common legend, a line per layer ticked, and the
 * list of layers by theme; then « Couches affichées », a block per layer ticked: what it shows, its nature and time, its
 * precision, its source and licence, its count, a source's silence, its page and its file. Each layer's file
 * (couches.ts) is asked only when its box is ticked, then drawn by the page's script in its own group, in a fixed order
 * of drawing: the rain under the land's lines, the closed trails, then the points, the stations' figures on top. Every
 * point has the bubble of every map (carte-points.ts), its link the layer's page. The boxes ticked are in the page's
 * address (`#c=pluie,rivieres`), so that a view can be shared. Without a script, the map alone, and the pages.
 *
 * The words are marketing's (interne/ux/carte-mots-3110.md).
 */
import island from "../places/island.json" with { type: "json" };
import { MAX_ZOOM } from "./carte-zoom.js";
import { COUCHE_PATH, COUCHES, type Couche, type Nature, type Precision, type Theme } from "./couches.js";
import type { Alerte } from "./data.js";
import { ACCES, crumbBar, crumbs, webPage } from "./domains.js";
import { esc, FOND_ZOOM, H, islandMap, W, zoomIsland } from "./map.js";
import { RAIN_WASH, VENT_DE } from "./meteo-carte.js";
import { anchorId, layout } from "./pages.js";
import { CLASSES } from "./pluie-radar.js";
import { COMMUNES } from "./commune.js";
import { communePath as enfantsPath } from "./enfants.js";

export const PATH = "/carte";

/** The page's words, marketing's. */
export const MOTS = {
  title: "Carte de La Réunion : croisez les données publiques · 974",
  description: "La Réunion en direct sur une même carte : pluie au radar, stations météo, rivières, séismes, sentiers fermés, défibrillateurs… Source et heure de chaque couche.",
  h1: "La Réunion, couche par couche",
  accroche:
    "Cochez des couches pour les voir ensemble sur la même carte, et repérer ce qui se croise : la pluie au radar et la hauteur des rivières, les séismes et les sentiers fermés… Chacune dit ce qu'elle montre, d'où elle vient et de quelle heure date sa donnée.",
  vite: "Pour trouver vite un défibrillateur ou une borne libre, chaque couche a sa page : le lien est dans son panneau et dans chaque bulle.",
  couches: "Couches",
  affichees: "Couches affichées",
  aucune: "Cochez une couche pour la voir sur la carte.",
  sansScript: "Les couches s'affichent avec JavaScript. Chacune a aussi sa page :",
  themes: { meteo: "Météo", nature: "Nature", secours: "Secours", deplacements: "Se déplacer", sortir: "Sortir" } satisfies Record<Theme, string>,
  enfants: "Avec les enfants",
  natures: { mesure: "Mesure", prevision: "Prévision", estimation: "Estimation", fixe: "Fixe", annonce: "Annonce" } satisfies Record<Nature, string>,
  precisions: {
    adresse: "Position : l'objet lui-même, à quelques mètres près.",
    lieu: "Position : un lieu proche, à quelques centaines de mètres près.",
    commune: "Position : la commune seulement, pas l'adresse.",
  } satisfies Record<Precision, string>,
  telecharger: (licence: string) => `Télécharger cette couche (JSON, ${licence})`,
  voir: (rubrique: string) => `Voir la page ${rubrique} →`,
  // The script's words: {o} the source's organisation, {h} a time.
  ancienne: "Dernière lecture de {o} : {h}. La carte montre celle-là.",
  echec: "La lecture de {o} a échoué : la couche n'est pas affichée.",
  bornesSansEtat: "L'état des bornes n'a pas pu être lu : la carte montre la liste des bornes, sans dire lesquelles sont libres.",
  chargement: "Chargement…",
  fixe: "Liste fixe, lue dans la source le {d}.",
  mesure: "Mesure de {m}, lue à {h}.",
  lu: "Lue à {h}.",
  annonce: "Annonce de {o}, lue à {h}.",
  surLaCarte: "{n} sur la carte.",
  maj: ", données mises à jour le {d} à {h}, sans modification",
  radarMalVu: "zones que le radar voit mal",
};

/** What each layer shows (panel, line 2), its page's name in the site's menu, and its words in the bubble and legend. */
interface Dit {
  montre: string;
  /** Without its copy (the charging stations' state). */
  montreSans?: string;
  rubrique: string;
  /** The source, short, in the bubble's third line. */
  court: string;
  /** Its objects counted: one, many. */
  unite: [string, string];
  /** The organisation named when the source is silent. */
  organisme: string;
}

const DIT: Record<string, Dit> = {
  stations: {
    montre: "La dernière mesure de chaque station de Météo-France : la température, le vent, et la pluie tombée en une heure. Chaque station a son heure : une station en retard est grisée.",
    rubrique: "Météo", court: "Météo-France", unite: ["station", "stations"], organisme: "Météo-France",
  },
  pluie: {
    montre: "La pluie estimée par le radar de Météo-France, sur une grille d'un kilomètre, une nouvelle image toutes les 5 minutes. Hachures : zones que le radar voit mal, où la pluie peut être manquée.",
    rubrique: "Météo", court: "Radar de Météo-France", unite: ["image", "images"], organisme: "Météo-France",
  },
  rivieres: {
    montre: "La hauteur d'eau à chaque station de mesure des rivières, et si elle monte, baisse ou reste stable, à l'heure de sa dernière mesure.",
    rubrique: "Crues", court: "© VIGICRUES", unite: ["station", "stations"], organisme: "Vigicrues",
  },
  seismes: {
    montre: "Les séismes localisés par l'Observatoire volcanologique du Piton de la Fournaise (OVPF-IPGP) depuis 7 jours. Plus le rond est grand, plus la magnitude est forte.",
    rubrique: "Volcan", court: "OVPF-IPGP", unite: ["séisme", "séismes"], organisme: "l'OVPF-IPGP",
  },
  sentiers: {
    montre: "Les sentiers que l'Office national des forêts annonce fermés, avec la cause qu'il donne, tracés d'après sa carte. Sur place, l'arrêté et le panneau font foi.",
    rubrique: "Randonnée", court: "ONF", unite: ["sentier fermé", "sentiers fermés"], organisme: "l'ONF",
  },
  defibrillateurs: {
    montre: "Les défibrillateurs déclarés dans Géo'DAE. La liste est déclarée par les exploitants : un appareil peut avoir été déplacé. En cas d'arrêt cardiaque, appelez le 15 ou le 112.",
    rubrique: "Défibrillateurs", court: "Géo'DAE", unite: ["défibrillateur", "défibrillateurs"], organisme: "Géo'DAE",
  },
  bornes: {
    montre: "Les bornes de recharge de la base nationale, avec le nombre de points libres à l'heure de la dernière lecture de leur état.",
    montreSans: "L'état des bornes n'a pas pu être lu : la carte montre la liste des bornes, sans dire lesquelles sont libres.",
    rubrique: "Recharge", court: "Base nationale des IRVE", unite: ["borne", "bornes"], organisme: "la base nationale des IRVE",
  },
  "enfants-osm": {
    montre: "Les aires de jeux, parcs, musées, médiathèques et quelques zoos et parcs de loisirs cartographiés par les contributeurs d'OpenStreetMap. Les horaires viennent d'OpenStreetMap : vérifiez auprès du lieu avant de vous déplacer.",
    rubrique: "Enfants", court: "OpenStreetMap", unite: ["lieu", "lieux"], organisme: "OpenStreetMap",
  },
  "enfants-data-es": {
    montre: "Les piscines, skateparks, city-stades et sites d'escalade recensés par le ministère des Sports (Data ES).",
    rubrique: "Enfants", court: "Data ES", unite: ["lieu", "lieux"], organisme: "Data ES",
  },
  "enfants-basilic": {
    montre: "Les médiathèques et bibliothèques recensées par le ministère de la Culture (Basilic). Une même médiathèque peut aussi figurer dans « Jeux, parcs et musées » : les deux sources restent séparées.",
    rubrique: "Enfants", court: "Basilic", unite: ["lieu", "lieux"], organisme: "Basilic",
  },
};

/** Where each source of the children's places is said, under its name in the list (marketing). */
const SOUS: Record<string, string> = { "enfants-osm": "OpenStreetMap", "enfants-data-es": "ministère des Sports", "enfants-basilic": "ministère de la Culture" };

/**
 * The order of drawing, from the bottom: the trails' lines, then the points from the most to the fewest, the rarest
 * and the stations' figures on top, so that a crowded layer never hides another. The rain is under the land's lines.
 */
export const ORDRE = ["sentiers", "rivieres", "enfants-basilic", "enfants-data-es", "enfants-osm", "defibrillateurs", "bornes", "seismes", "stations"];

/** The layers ticked when the page's address names none: the weather now, the rain and the stations. */
export const PAR_DEFAUT = ["pluie", "stations"];

/** A layer's file, where the page asks it. */
export const fichierOf = (c: Couche) => c.fichier ?? `${COUCHE_PATH}${c.id}.json`;

/** A value written as a JavaScript literal or JSON inside an inline <script>. */
const UNSAFE: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
const inScript = (v: unknown) => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => UNSAFE[c]);

/** The script's settings: each layer as the page needs it, the communes' anchors, the words. */
function conf() {
  return {
    bbox: island.bbox,
    w: W,
    h: H,
    couches: COUCHES.map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, forme: c.forme, fichier: fichierOf(c), page: c.page, ...DIT[c.id], source: { attribution: c.source.attribution } })),
    // A defibrillator leads to its commune on /defibrillateurs, a child's place to its commune's page (marketing).
    dae: Object.fromEntries(COMMUNES.map((p) => [p.nom, anchorId("c", p.nom)])),
    enfants: Object.fromEntries(COMMUNES.map((p) => [p.nom, enfantsPath(p)])),
    acces: ACCES,
    vent: VENT_DE,
    pluie: { classes: CLASSES, couleurs: RAIN_WASH },
    mots: MOTS,
    defaut: PAR_DEFAUT,
  };
}

/** « 24/10 », a fixed list's day. */
const jm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A box of the list: the layer's short name, its nature and its time (the script's, once read). */
function caseOf(c: Couche): string {
  const sous = SOUS[c.id] ? ` · ${esc(SOUS[c.id])}` : "";
  return `<li><label class="kc-${esc(c.id)}"><input type="checkbox" name="c" value="${esc(c.id)}"><i class="km" aria-hidden="true"></i>` +
    `<span><b>${esc(c.nom)}</b><small><span class="nat n-${c.nature}">${MOTS.natures[c.nature]}</span>${sous}<span class="kh" data-c="${esc(c.id)}">${c.donnees ? ` · liste du ${jm(c.donnees().heure)}` : ""}</span></small></span></label></li>`;
}

/** The list of layers, by theme; the children's three under « Avec les enfants ». */
function choix(): string {
  const themes = Object.keys(MOTS.themes) as Theme[];
  return themes.map((t) => {
    const list = COUCHES.filter((c) => c.theme === t);
    const enfants = list.filter((c) => c.id.startsWith("enfants-"));
    const rest = list.filter((c) => !c.id.startsWith("enfants-"));
    return `<fieldset><legend>${MOTS.themes[t]}</legend><ul>${rest.map(caseOf).join("")}</ul>` +
      (enfants.length ? `<p class="ksg">${esc(MOTS.enfants)}</p><ul>${enfants.map(caseOf).join("")}</ul>` : "") + `</fieldset>`;
  }).join("");
}

/** A layer's block of « Couches affichées », shown once ticked: its lines in marketing's order, the script's left empty. */
function bloc(c: Couche): string {
  const d = DIT[c.id];
  const src = `Source : ${esc(c.source.attribution)}, ${esc(c.source.licence)}${c.id === "rivieres" ? '<span class="kmaj"></span>' : ""}.`;
  return `<article class="kp" data-c="${esc(c.id)}" hidden><h3><i class="km kc-${esc(c.id)}" aria-hidden="true"></i>${esc(c.nom)} <span class="nat n-${c.nature}">${MOTS.natures[c.nature]}</span></h3>` +
    `<p class="kmo">${esc(d.montre)}</p><p class="kt"></p><p>${esc(MOTS.precisions[c.precision])}</p><p>${src}</p><p class="kn"></p><p class="ks" role="status"></p>` +
    `<p class="kl2"><a href="${esc(c.page)}">${esc(MOTS.voir(d.rubrique))}</a><a href="${esc(fichierOf(c))}" download>${esc(MOTS.telecharger(c.source.licence))}</a></p></article>`;
}

/** The page: built once per isolate, its layers' data asked by the script. */
let built: string | undefined;

function corps(): string {
  // The rain's canvas under the roads, a group per layer over them in ORDRE's order.
  const under = `<foreignObject class="kpluie" x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" class="kpw"><canvas width="1" height="1"></canvas></div></foreignObject>`;
  const overlay = `<g class="kcs">${ORDRE.map((id) => `<g class="kl kc-${id}" data-c="${id}"></g>`).join("")}</g>`;
  const svg = islandMap({ under, overlay, peaks: true, fond: "k", label: "Carte de La Réunion (974) : les couches cochées dans la liste sous la carte" });
  const map = zoomIsland(svg, "k", { id: "kmap", mostFd: (MAX_ZOOM * FOND_ZOOM) / 2 }).replace('<svg id="kmap" class="map terrain', '<svg id="kmap" data-kc="" class="map terrain');
  const pages = [...new Map(COUCHES.map((c) => [c.page, DIT[c.id].rubrique])).entries()].map(([p, r]) => `<a href="${esc(p)}">${esc(r)}</a>`).join(", ");
  return `<section aria-labelledby="h-carte" class="kcarte"><h2 id="h-carte" class="sr">${esc(MOTS.h1)}</h2>
  <figure class="card mapcard kmapc">${map}<figcaption class="note"><ul class="klg" aria-live="polite"></ul><p class="kcr"></p></figcaption></figure>
  <noscript><p class="note">${esc(MOTS.sansScript)} ${pages}.</p></noscript>
  <details class="kch" open hidden><summary>${esc(MOTS.couches)} (<span class="kcn">0</span>)</summary><div class="kths">${choix()}</div></details>
</section>
<section aria-labelledby="h-aff" class="kaff" hidden><h2 id="h-aff">${esc(MOTS.affichees)}</h2><p class="note kvide">${esc(MOTS.aucune)}</p>${COUCHES.map(bloc).join("")}</section>
<script type="application/json" id="k-conf">${inScript(conf())}</script><script>${CARTE_SCRIPT}</script>`;
}

export function cartePage(origin: string, alerte?: Alerte): string {
  built ??= corps();
  const band = `${crumbBar("Carte")}
<div class="wrap intro"><div class="pitch">
  <h1>${esc(MOTS.h1)} <span class="n974">974</span></h1>
  <p class="lead">${esc(MOTS.accroche)}</p>
  <p class="note">${esc(MOTS.vite)}</p>
</div></div>`;
  const sources = [...new Map(COUCHES.map((c) => [c.source.attribution, c.source.licence])).entries()].map(([a, l]) => `${esc(a)} (${esc(l)})`).join(" ; ");
  // Not in the menu nor the sitemap yet, and kept out of the search engines until then: the views and the menu come next.
  return layout(origin, { title: MOTS.title, description: MOTS.description, path: PATH, noindex: true, jsonld: [crumbs(origin, "Carte", PATH), webPage(origin, PATH, MOTS.title, MOTS.description, null)], alerte }, band,
    `${built}\n<p class="sources">Sources : ${sources}.</p>`);
}

/**
 * The page's script. A box ticked asks for its layer's file once, draws it in its group and shows its line of the
 * legend and its block; unticked, it hides them (the file kept). Each point is a link (`a.sp`) with the bubble's lines
 * (carte-points.ts: `data-pn`, `data-p2`, `data-p3`, its link's words in `data-pt`), out of the keyboard's way: the
 * panel and the pages are the text of the map. The points keep their size on screen at any zoom (strokes that do not
 * scale); the stations' figures take theirs from `--u`, the map's units per pixel, set again at each zoom.
 */
const CARTE_SCRIPT = `(()=>{const cf=document.getElementById("k-conf"),svg=document.getElementById("kmap");if(!cf||!svg)return;
const K=JSON.parse(cf.textContent),M=K.mots,L=new Map(K.couches.map((c)=>[c.id,c])),NS="http://www.w3.org/2000/svg",[A,B,C,D]=K.bbox,W=K.w,H=K.h;
const X=(o)=>Math.round((o-A)/(C-A)*W*10)/10,Y=(a)=>Math.round((D-a)/(D-B)*H*10)/10,el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e};
const TZ={timeZone:"Indian/Reunion"},hm=(t)=>new Date(t).toLocaleTimeString("fr-FR",{...TZ,hour:"2-digit",minute:"2-digit"}),jm=(t)=>new Date(t).toLocaleDateString("fr-FR",{...TZ,day:"2-digit",month:"2-digit"}),
an=(t)=>new Date(t).toLocaleDateString("fr-FR",{...TZ,day:"2-digit",month:"2-digit",year:"numeric"}),jr=(t)=>new Date(t).toLocaleDateString("fr-CA",TZ),
quand=(t)=>jr(t)===jr(Date.now())?hm(t):"le "+jm(t)+" à "+hm(t),nb=(n)=>n.toLocaleString("fr-FR"),dec=(v)=>v.toLocaleString("fr-FR",{maximumFractionDigits:1}),
un=(n,u)=>nb(n)+"\\u00a0"+(n>1?u[1]:u[0]),put=(s,o)=>s.replace(/\\{(\\w)\\}/g,(_,k)=>o[k]);
const list=document.querySelector(".kch"),aff=document.querySelector(".kaff"),boxes=[...list.querySelectorAll("input[name=c]")],lg=document.querySelector(".klg"),cr=document.querySelector(".kcr");
list.hidden=false;aff.hidden=false;
const got=new Map(),asked=new Map();let wired=false;
const u=()=>{const v=svg.viewBox.baseVal;if(v&&svg.clientWidth)svg.style.setProperty("--u",v.width/svg.clientWidth)};u();
new MutationObserver(u).observe(svg,{attributes:true,attributeFilter:["viewBox"]});addEventListener("resize",u);
const lines=(c,o,j)=>{const i=o.infos||{},src=(h)=>c.court+", "+h;let p2="",p3="";
if(c.id==="stations"){p2=[i.temperature!=null&&dec(i.temperature)+"\\u00a0°C",i.vent!=null&&"vent "+(K.vent[Math.round((i.direction??-1)/45)%8]?K.vent[Math.round(i.direction/45)%8]+" ":"")+Math.round(i.vent)+"\\u00a0km/h"+(i.rafales!=null?", rafales "+Math.round(i.rafales)+"\\u00a0km/h":""),i.pluie_1h!=null&&dec(i.pluie_1h)+"\\u00a0mm en 1\\u00a0h"].filter(Boolean).join(" · ");p3=src("mesure de "+hm(o.heure))}
else if(c.id==="rivieres"){p2=i.hauteur_m!=null?dec(i.hauteur_m)+"\\u00a0m"+(i.tendance?", "+i.tendance:""):"";p3=src("mesure de "+(i.heure_mesure||hm(o.heure)))}
else if(c.id==="seismes"){p2="Magnitude "+dec(i.magnitude)+" · "+quand(o.heure)+(i.profondeur_km!=null?" · profondeur "+dec(i.profondeur_km)+"\\u00a0km":"");p3=c.court}
else if(c.id==="sentiers"){const k=/éruption/i.test(i.cause||"")?"instable après l'éruption récente, selon l'ONF":i.cause;p2=k?"Fermé\u00a0: "+k:"Fermé";p3=src("carte du "+jm(j.heure))}
else if(c.id==="defibrillateurs"){p2=K.acces[i.exterieur?0:i.horaires==="24 h/24, 7 j/7"?1:i.acces_libre?2:3]+(i.etage?" · "+i.etage:"");p3=src("liste du "+jm(j.heure))}
else if(c.id==="bornes"){const kw=" · jusqu'à "+dec(i.kw_max)+"\\u00a0kW"+(i.gratuit?" · gratuit":"")+(i.acces_reserve?" · accès réservé":"");
if(i.libres!=null){p2=(i.libres?nb(i.libres)+" libre"+(i.libres>1?"s":""):"aucun libre")+" sur "+nb(i.total)+kw;p3=src("état de "+hm(j.heure))}else{p2=un(i.points,["point de charge","points de charge"])+kw.replace(" · jusqu'à",", jusqu'à");p3=src("état non lu")}}
else{p2=[i.type,i.adresse].filter(Boolean).join(" · ");p3=src("liste du "+jm(j.heure))}
return[o.nom+(o.commune?" · "+o.commune:""),p2,p3]};
const lien=(c,o)=>c.id==="defibrillateurs"?"/defibrillateurs#"+(K.dae[o.commune]||""):c.id.startsWith("enfants-")?(K.enfants[o.commune]||c.page):o.lien||c.page;
const point=(c,o,j)=>{const x=X(o.lon),y=Y(o.lat),l=lines(c,o,j),a=el("a",{class:"sp",href:lien(c,o),tabindex:"-1","aria-label":l.filter(Boolean).join(", "),"data-pt":"Voir la page "+c.rubrique+" →"});["pn","p2","p3"].forEach((k,n)=>{if(l[n])a.setAttribute("data-"+k,l[n])});
const d="M"+x+" "+y+"h0",i=o.infos||{};a.append(el("circle",{class:"hit",cx:x,cy:y,r:"3"}),el("path",{class:"kr",d}),el("path",{class:"kd",d}));
if(c.id==="seismes"){const w=Math.max(7,Math.min(40,8+7*i.magnitude));a.style.setProperty("--w",w+"px")}
if(c.id==="bornes"&&i.libres===0)a.classList.add("k0");if(i.ancienne)a.classList.add("kv");
if(c.id==="stations"&&i.temperature!=null){const t=el("text",{x,y,dy:"-.75em",class:"kt"});t.textContent=Math.round(i.temperature)+"°";a.append(t)}return a};
const rain=(j)=>{const cv=svg.querySelector(".kpluie canvas");if(!cv)return;cv.width=j.w;cv.height=j.h;const g=cv.getContext("2d"),im=g.createImageData(j.w,j.h),P=K.pluie.couleurs.map((s)=>s.match(/[\\d.]+/g).map(Number));
for(let k=0;k<j.w*j.h;k++){const v=j.pluie.charCodeAt(k)-48,mal=j.mal_vu&&j.mal_vu[k]==="1",q=k*4;if(v>=1&&v<=8){const p=P[v-1];im.data[q]=p[0];im.data[q+1]=p[1];im.data[q+2]=p[2];im.data[q+3]=Math.round(p[3]*255)}
else if(mal&&((k%j.w)+Math.floor(k/j.w))%3===0){im.data[q]=70;im.data[q+1]=80;im.data[q+2]=95;im.data[q+3]=90}}g.putImageData(im,0,0)};
const draw=(c,j)=>{if(c.id==="pluie"){rain(j);return}const g=svg.querySelector('.kl[data-c="'+c.id+'"]');g.replaceChildren();
if(c.id==="sentiers")j.objets.forEach((o)=>{if(!o.trace||o.trace.length<2)return;const d="M"+o.trace.map((p)=>X(p[0])+" "+Y(p[1])).join("L");g.append(el("path",{class:"kth",d}),el("path",{class:"ktl",d}))});
j.objets.forEach((o)=>g.append(point(c,o,j)));
if(!wired&&j.objets.length){wired=true;svg.dispatchEvent(new Event("carte",{bubbles:true}))}};
const said=(c,j)=>{const o=j?j.objets||[]:[],hs=o.map((x)=>Date.parse(x.heure)).filter((t)=>t>0);
if(c.id==="stations"){const a=Math.min(...hs),b=Math.max(...hs);return[un(o.length,c.unite),"mesures de "+(hm(a)===hm(b)?hm(b):hm(a)+" à "+hm(b))]}
if(c.id==="pluie")return["image de "+hm(j.fin)];
if(c.id==="rivieres")return[un(o.length,c.unite),hm(j.heure)];
if(c.id==="seismes")return o.length?[nb(o.length)+" en 7\\u00a0jours","dernier "+quand(o[0].heure)]:["aucun localisé par l'OVPF-IPGP en 7\\u00a0jours"];
if(c.id==="sentiers")return[nb(o.length),"carte de l'ONF du "+jm(j.heure)];
if(c.id==="bornes"){if(j.copie==="absente")return[nb(o.length),"état non lu"];const f=o.reduce((n,x)=>n+(x.infos.libres||0),0),t=o.reduce((n,x)=>n+(x.infos.total||0),0);return[nb(f)+" libre"+(f>1?"s":"")+" sur "+nb(t),"état de "+hm(j.heure)]}
if(c.id.startsWith("enfants-"))return[un(o.length,c.unite),"liste du "+jm(j.heure)];return[nb(o.length),"liste du "+jm(j.heure)]};
const etat=(c,j)=>!j||j==="err"||j.erreur||j.copie==="absente"&&c.id!=="bornes"?"echec":j.copie==="ancienne"?"vieux":"ok";
const show=(c)=>{const on=boxes.find((b)=>b.value===c.id).checked,j=got.get(c.id),p=aff.querySelector('.kp[data-c="'+c.id+'"]'),g=c.id==="pluie"?svg.querySelector(".kpluie"):svg.querySelector('.kl[data-c="'+c.id+'"]');
p.hidden=!on;if(g){g.style.display=on?"":"none";g.classList.toggle("vieux",etat(c,j)==="vieux")}let li=lg.querySelector('[data-c="'+c.id+'"]');
if(!on){if(li)li.remove();return}if(!li){li=document.createElement("li");li.dataset.c=c.id;li.className="kc-"+c.id;lg.append(li);[...lg.children].sort((a,b)=>K.couches.findIndex((x)=>x.id===a.dataset.c)-K.couches.findIndex((x)=>x.id===b.dataset.c)).forEach((x)=>lg.append(x))}
const s=etat(c,j),q=(k)=>p.querySelector(k),h=aff.querySelector('.kh[data-c="'+c.id+'"]');
const tx=document.createElement("span");if(j===undefined){tx.textContent=c.nom+" · "+M.chargement;li.replaceChildren(el2("i","km"),tx);return}
const msg=s==="echec"?put(M.echec,{o:c.organisme}):s==="vieux"?put(M.ancienne,{o:c.organisme,h:quand(j.heure)}):c.id==="bornes"&&j.copie==="absente"?M.bornesSansEtat:"";
q(".ks").textContent=msg;li.classList.toggle("vieux",s!=="ok");
if(s==="echec"){tx.textContent=c.nom+" · "+put(M.echec,{o:c.organisme});li.replaceChildren(el2("i","km"),tx);q(".kt").textContent="";q(".kn").textContent="";return}
const bits=said(c,j);tx.append(c.nom);if(c.id==="pluie"){const sp=document.createElement("span");sp.className="kgr";sp.append(K.pluie.classes[0].toLocaleString("fr-FR")+"\\u202fmm/h",el2("i","kgrad"),"plus de "+K.pluie.classes[K.pluie.classes.length-1]+"\\u202fmm/h");tx.append(" ",sp)}
tx.append(" · "+bits.join(" · "));li.replaceChildren(el2("i","km"),tx);
const t=c.nature==="fixe"?put(M.fixe,{d:an(j.heure)}):c.nature==="annonce"?put(M.annonce,{o:c.organisme,h:quand(j.heure)}):c.id==="seismes"||c.id==="bornes"?put(M.lu,{h:quand(j.heure)}):
put(M.mesure,{m:hm(c.id==="pluie"?j.fin:Math.max(...(j.objets||[]).map((x)=>Date.parse(x.heure)))),h:quand(c.id==="pluie"?j.fin:j.heure)});q(".kt").textContent=t;
if(c.id==="rivieres"){const m=q(".kmaj");if(m)m.textContent=put(M.maj,{d:jm(j.heure),h:hm(j.heure)})}
if(c.id==="bornes")q(".kmo").textContent=j.copie==="absente"?c.montreSans:c.montre;
q(".kn").textContent=c.id==="pluie"?"":put(M.surLaCarte,{n:un((j.objets||[]).length,c.unite)});if(h)h.textContent=" · "+bits[bits.length-1]};
const el2=(n,k)=>{const e=document.createElement(n);e.className=k;return e};
const credit=()=>{const on=boxes.filter((b)=>b.checked).map((b)=>L.get(b.value).source.attribution);cr.textContent=[...new Set(on)].join(" · ");
document.querySelector(".kcn").textContent=boxes.filter((b)=>b.checked).length;aff.querySelector(".kvide").hidden=boxes.some((b)=>b.checked)};
const ask=(c)=>{if(asked.has(c.id))return;asked.set(c.id,1);fetch(c.fichier).then((r)=>r.ok?r.json():"err").catch(()=>"err").then((j)=>{got.set(c.id,j);if(etat(c,j)!=="echec")draw(c,j);show(c)})};
const hash=()=>{const on=boxes.filter((b)=>b.checked).map((b)=>b.value);history.replaceState(null,"",on.length?"#c="+on.join(","):location.pathname+location.search)};
const tick=(b)=>{const c=L.get(b.value);if(b.checked)ask(c);show(c);credit()};
list.addEventListener("change",(e)=>{const b=e.target;if(b.name!=="c")return;tick(b);hash()});
const m=/(?:^#|&)c=([a-z0-9,-]*)/.exec(location.hash),want=m?m[1].split(","):K.defaut;boxes.forEach((b)=>{b.checked=want.includes(b.value);tick(b)})})();`;
