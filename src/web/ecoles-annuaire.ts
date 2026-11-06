/**
 * /ecoles: the schools, collèges and lycées of the 24 communes (vie/ecoles.ts, bundled), on a map and commune by commune,
 * filtered by kind and by what they declare (canteen, boarding, ULIS); and the collège of an address's sector, from the
 * public collèges' map of sectors (public/carte-scolaire/, scripts/build-carte-scolaire.py). The address is matched in
 * the browser, against the file of the commune chosen, which Cloudflare serves before the Worker: it never leaves the
 * phone, and nothing of it is kept, logged nor put in the page's address (test/ecoles-annuaire.test.ts checks it). The
 * primary schools' sectors are set by each mairie and not published: the page says so. Nothing read but the vigilance's banner.
 */
import { INSEE } from "../places/insee.js";
import { de, nombre } from "../tools/format.js";
import * as ecoles from "../vie/ecoles.js";
import * as ips from "../vie/ips.js";
import * as parcoursup from "../vie/parcoursup.js";
import { parCommune } from "../vie/parcoursup-formations.js";
import { CARTE, motsVoie, SOURCE as SOURCE_CARTE, trouve } from "../vie/carte-scolaire.js";
import { credit, type Alerte } from "./data.js";
import { crumbBar, crumbs, webPage } from "./domains.js";
import { esc, islandMap, project, W, zoomIsland } from "./map.js";
import { anchorId, credits, dayMonth, layout } from "./pages.js";
import { PAGES } from "./places.js";

export const PATH = "/ecoles";

export { CARTE, motsVoie, SOURCE as SOURCE_CARTE, trouve, type CarteCommune, type Troncon, type Trouve } from "../vie/carte-scolaire.js";

const COMMUNES = Object.keys(INSEE).sort((a, b) => a.localeCompare(b, "fr"));
const hub = (commune: string) => {
  const p = PAGES.find((x) => x.commune && x.nom === commune);
  return p ? `/communes/${p.slug}` : undefined;
};
const jma = (ymd: string) => ymd.split("-").reverse().join("/");

// The words of the page.
const T = {
  title: "Écoles à La Réunion : collège de secteur, cantine, internat, ULIS · 974",
  description: "Les écoles, collèges et lycées des 24 communes de La Réunion sur une carte, avec la cantine, l'internat et l'ULIS, et le collège de secteur d'une adresse.",
  h1: "Écoles, collèges et lycées",
  lead: (n: number) => `${nombre(n)} établissements publics et privés dans les 24 communes, avec la cantine, l'internat et l'ULIS quand ils les déclarent. Et le collège de secteur de votre adresse.`,
  college: "Quel collège pour votre adresse ?",
  collegeIntro: "Choisissez la commune, puis tapez le numéro et le nom de la voie. La recherche se fait sur votre téléphone ou votre ordinateur : l'adresse n'est envoyée nulle part, ni gardée.",
  commune: "Commune",
  choisir: "Choisir…",
  adresse: "Numéro et voie",
  exemple: "numéro, puis rue, chemin, impasse…",
  chercher: "Chercher",
  sansScript: "La recherche du collège demande JavaScript.",
  primaire: "Pour l'école maternelle et l'école élémentaire, le secteur est fixé par chaque mairie, et il n'est pas publié en données ouvertes : demandez à la mairie.",
  mairie: "La page de la commune",
  carteNote: (maj: string, n: number) => `D'après la carte scolaire des collèges publics de l'Éducation nationale, mise à jour le ${jma(maj)} : ${nombre(n)} voies ou portions de voie. Les collèges privés n'ont pas de secteur. En cas de doute, le collège ou le Département confirme le secteur.`,
  carte: "Sur la carte",
  liste: "Commune par commune",
  type: "Type",
  tous: "Tous",
  offre: "Avec",
  services: [["c", "Cantine"], ["i", "Internat"], ["u", "ULIS"]] as const,
  versCommune: (c: string) => `Les écoles sur la page ${de(c)}`,
  servicesNote: "La cantine, l'internat et l'ULIS sont ceux que l'établissement déclare à l'annuaire de l'Éducation nationale : un établissement qui ne les déclare pas peut quand même les avoir.",
};

/** The flags of what it declares, which the page's filter matches: c canteen, i boarding, u ULIS. */
const flags = (e: ecoles.Etablissement) => `${e.cantine ? "c" : ""}${e.internat ? "i" : ""}${e.ulis ? "u" : ""}`;
const rowId = (e: ecoles.Etablissement) => `e-${e.uai}`;

/**
 * A school, collège or lycée on two lines: its name (its site or Onisep sheet), what it declares; its address and phone.
 * No « Y aller »: a commune has up to 119 of them. `attrs`, the row's own (its id and the filter's data on /ecoles).
 */
export function schoolLi(e: ecoles.Etablissement, attrs = ""): string {
  const link = e.web ?? e.onisep;
  const name = link ? `<a href="${esc(link)}" rel="noopener">${esc(e.nom)}</a>` : esc(e.nom);
  const tel = e.tel ? ` <small><a href="tel:${esc(e.tel.replace(/\s/g, ""))}">${esc(e.tel)}</a></small>` : "";
  return `<li${attrs}><span>${name}<small>${esc(ecoles.services(e).join(" · "))}</small></span>` +
    `<span class="l2"><span><small class="adr">${esc(e.adresse)}</small>${tel}</span></span></li>`;
}

// ---------------------------------------------------------------- the collège of an address

/**
 * The search, in the browser: the commune's file loaded once (fetch of its static path, the only request), what was
 * typed matched there (trouve()). Nothing written anywhere: no address in the page's URL, no storage, no beacon.
 */
export const COLLEGE_SCRIPT = `(()=>{const f=document.getElementById("cs");if(!f)return;f.hidden=false;
const motsVoie=${motsVoie},trouve=${trouve};
const sel=f.querySelector("select"),inp=f.querySelector("input"),out=document.getElementById("cs-r"),mairie=document.getElementById("cs-m"),files={};
const nice=(s)=>s.toLowerCase().replace(/(^|[ '-])([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase()).replace(/ (De|Du|Des|La|Le|Les|Et|Aux?) /g,(m)=>m.toLowerCase());
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const say=(...n)=>{out.replaceChildren(...n)};
const named=(v)=>nice(v[0])+(v[1]?" ("+nice(v[1])+")":"");
const odd=["",", numéros impairs",", numéros pairs"];
const span=(r)=>r[0]<=1&&r[1]>=9999?"toute la voie":r[1]>=9999?"à partir du "+r[0]:"du "+r[0]+" au "+r[1];
const card=(c,lead)=>{const d=el("div","card csr");d.append(el("p","eyebrow",lead));const h=el("h3");if(c.web||c.onisep){const a=el("a",null,c.nom);a.href=c.web||c.onisep;a.rel="noopener";h.append(a)}else h.textContent=c.nom;d.append(h);if(c.adresse)d.append(el("p","adr",c.adresse));if(c.tel){const p=el("p"),a=el("a",null,c.tel);a.href="tel:"+c.tel.replace(/\\s/g,"");p.append(a);d.append(p)}return d};
const load=async()=>{const u=sel.value;if(!files[u])files[u]=fetch(u).then((r)=>{if(!r.ok)throw 0;return r.json()}).catch((e)=>{delete files[u];throw e});return files[u]};
const HORS="Ce numéro n'est pas dans la carte scolaire pour cette voie.";
const search=async(voie)=>{if(!sel.value){say(el("p",null,"Choisissez d'abord la commune."));return}let d;try{d=await load()}catch{say(el("p",null,"La carte scolaire n'a pas pu être chargée. Réessayez dans un instant."));return}
const de=sel.selectedOptions[0].dataset.de,r=trouve(d,inp.value,motsVoie,voie);
if(r.k==="unique")say(card(d.colleges[r.c],"Toute la commune "+de+" dépend du même collège"));
else if(r.k==="vide")say(el("p",null,"Tapez le nom de la voie, avec son numéro si vous le connaissez."));
else if(r.k==="inconnue")say(el("p",null,"Cette voie n'est pas dans la carte scolaire "+de+". Vérifiez son nom, ou tapez seulement le nom, sans « rue » ni « chemin »."));
else if(r.k==="college")say(card(d.colleges[r.c],"Collège de secteur, "+named(r.voie)),...(r.hors?[el("p","note",HORS+" C'est le collège de toute la voie.")]:[]));
else if(r.k==="numeros"){const ul=el("ul","rows");r.rows.forEach((x)=>{const li=el("li");li.append(el("span",null,d.colleges[x[3]].nom),el("small",null,span(x)+odd[x[2]]));ul.append(li)});
say(el("p",null,r.hors?HORS+" "+named(r.voie)+" est partagée entre plusieurs collèges\u00a0:":r.num?"Pour ce numéro, la carte scolaire donne plusieurs collèges\u00a0: le collège ou le Département vous dira lequel.":named(r.voie)+" est partagée entre plusieurs collèges\u00a0: tapez le numéro, ou voyez ci-dessous."),ul)}
else{const ul=el("ul","cs-choix");r.voies.forEach((v)=>{const b=el("button",null,named(v));b.type="button";b.addEventListener("click",()=>search(v[0]+"|"+v[1]));const li=el("li");li.append(b);ul.append(li)});
say(el("p",null,"Plusieurs voies portent ce nom "+de+". Laquelle ?"),ul)}};
f.addEventListener("submit",(e)=>{e.preventDefault();search()});
sel.addEventListener("change",()=>{const o=sel.selectedOptions[0];say();mairie.hidden=!o.dataset.p;if(o.dataset.p)mairie.href=o.dataset.p;if(o.dataset.u)search()})})();`;

function collegeSection(): string {
  const options = COMMUNES.map((c) => {
    const file = CARTE.communes[INSEE[c]];
    if (!file) return "";
    // A commune with a single sector: its collège shown as soon as it is chosen, no address asked.
    return `<option value="${esc(file)}" data-de="${esc(deCommune(c))}"${hub(c) ? ` data-p="${esc(hub(c)!)}"` : ""}${CARTE.uniques.includes(INSEE[c]) ? ' data-u="1"' : ""}>${esc(c)}</option>`;
  }).join("");
  // No name on the fields and no action: nothing typed can go into an address, even without the script.
  return `<section id="college" aria-labelledby="h-college">
  <div class="sec-h"><h2 id="h-college">${esc(T.college)}</h2><p>${esc(T.collegeIntro)}</p></div>
  <form id="cs" class="card filter cs" role="search" aria-label="Collège de secteur d'une adresse" autocomplete="off" hidden>
    <label>${esc(T.commune)} <select required><option value="">${esc(T.choisir)}</option>${options}</select></label>
    <label class="q">${esc(T.adresse)} <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${esc(T.exemple)}"></label>
    <button class="btn sun" type="submit">${esc(T.chercher)}</button>
  </form>
  <noscript><p class="card">${esc(T.sansScript)}</p></noscript>
  <div id="cs-r" aria-live="polite"></div>
  <p class="note">${esc(T.primaire)} <a id="cs-m" href="#" hidden>${esc(T.mairie)} →</a></p>
  <p class="note">${esc(T.carteNote(CARTE.maj, CARTE.troncons))}</p>
</section><script>${COLLEGE_SCRIPT}</script>`;
}

/** « de Saint-Paul », « du Port », « de L'Étang-Salé »: the commune after « de ». */
const deCommune = (c: string) => (c.startsWith("Le ") ? `du ${c.slice(3)}` : c.startsWith("Les ") ? `des ${c.slice(4)}` : `de ${c}`);

// ---------------------------------------------------------------- the map and the list, filtered

const KIND_CLS: Record<ecoles.Kind, string> = { ecole: "ty-ecole", college: "ty-college", lycee: "ty-lycee" };

/** The filter: the page's script shows the rows and the points that match the kind and every service ticked. */
const FILTER_SCRIPT = `(()=>{const f=document.getElementById("ef");if(!f)return;f.hidden=false;
const S=[...document.querySelectorAll("#emap a.sp")],L=[...document.querySelectorAll("#ecl li[data-t]")],C=[...document.querySelectorAll("#ecl>li")],n=document.getElementById("ef-n"),T=L.length;
const ok=(e,t,s)=>(!t||e.dataset.t===t)&&s.every((k)=>e.dataset.s.includes(k));
const go=()=>{const t=f.querySelector("[name=et]:checked").value,s=[...f.querySelectorAll("[name=es]:checked")].map((x)=>x.value);let k=0;
S.forEach((a)=>a.classList.toggle("off",!ok(a,t,s)));L.forEach((li)=>{const v=ok(li,t,s);li.hidden=!v;if(v)k++});
C.forEach((c)=>{c.querySelectorAll(".kind").forEach((g)=>{g.hidden=!g.querySelector("li[data-t]:not([hidden])")});const m=c.querySelectorAll("li[data-t]:not([hidden])").length,e=c.querySelector("summary .note");c.hidden=!m;e.textContent=m+(m>1?" établissements":" établissement")});
n.textContent=k===T?"":k+(k>1?" établissements":" établissement")+" sur "+T};
f.addEventListener("change",go);go()})();`;

function filterForm(): string {
  const kinds = [{ v: "", t: T.tous }, ...ecoles.KINDS.map((k) => ({ v: k.type, t: k.court[0].toUpperCase() + k.court.slice(1) }))];
  return `<form id="ef" class="ef" role="search" aria-label="Filtrer les établissements" hidden>` +
    `<div class="tabs aqtabs" role="radiogroup" aria-label="${esc(T.type)}"><span class="tl" aria-hidden="true">${esc(T.type)}</span>` +
    kinds.map((k) => `<input type="radio" name="et" id="et-${k.v || "tous"}" value="${k.v}"${k.v ? "" : " checked"}><label for="et-${k.v || "tous"}"${k.v ? ` class="${KIND_CLS[k.v as ecoles.Kind]}"` : ""}>${esc(k.t)}</label>`).join("") + `</div>` +
    `<div class="tabs aqtabs" role="group" aria-label="${esc(T.offre)}"><span class="tl" aria-hidden="true">${esc(T.offre)}</span>` +
    T.services.map(([v, t]) => `<input type="checkbox" name="es" id="es-${v}" value="${v}"><label for="es-${v}">${esc(t)}</label>`).join("") + `</div>` +
    `<p class="note" id="ef-n" aria-live="polite"></p></form>`;
}

function map(): string {
  // A dot per establishment, linked to its row; its bubble names it, its kind and its commune (carte-points.ts). Out of
  // the keyboard's way and unsaid (the group is hidden from screen readers): the list below says each of them.
  const unit = W / 340;
  const dots = ecoles.LIST.map((e) => {
    const [x, y] = project(e.lon, e.lat);
    const kind = ecoles.KINDS.find((k) => k.type === e.type)!.un;
    return `<a class="sp" href="#${rowId(e)}" data-t="${e.type}" data-s="${flags(e)}" data-pn="${esc(e.nom)}" data-p2="${esc([kind, ...ecoles.services(e).slice(0, 1)].join(" "))}" data-p3="${esc(e.commune)}" tabindex="-1">` +
      `<circle class="hit" cx="${x}" cy="${y}" r="${Math.round(6 * unit)}"/><path class="rg" d="M${x} ${y}h0"/><path class="pt ${KIND_CLS[e.type]}" d="M${x} ${y}h0"/></a>`;
  }).join("");
  const legend = ecoles.KINDS.map((k) => `<span><i class="ksw ${KIND_CLS[k.type]}"></i>${esc(k.court[0].toUpperCase() + k.court.slice(1))}</span>`).join("");
  return `<figure class="card mapcard emap">` +
    zoomIsland(islandMap({ overlay: `<g class="spots" aria-hidden="true">${dots}</g>`, peaks: true, fond: "e", label: "Carte de La Réunion (974) : les écoles, collèges et lycées" }), "e", { id: "emap" }) +
    `<figcaption class="note"><span class="lgc">${legend}</span></figcaption></figure>`;
}

function list(): string {
  return `<ul class="zones top" id="ecl">${COMMUNES.map((c) => {
    const of = ecoles.inCommune(c);
    if (!of.length) return "";
    const page = hub(c);
    return `<li class="card tgt" id="${anchorId("c", c)}"><details><summary><h3>${esc(c)} <span class="note">${of.length} établissements</span></h3></summary><div class="kinds">` +
      (page ? `<p><a href="${page}#ecoles">${esc(T.versCommune(c))} →</a></p>` : "") +
      ecoles.KINDS.map((k) => {
        const rows = of.filter((e) => e.type === k.type);
        return rows.length ? `<div class="kind"><h4>${esc(k.court[0].toUpperCase() + k.court.slice(1))}</h4><ul class="rows eau">${rows.map((e) => schoolLi(e, ` id="${rowId(e)}" data-t="${e.type}" data-s="${flags(e)}"`)).join("")}</ul></div>` : "";
      }).join("") + `</div></details></li>`;
  }).join("")}</ul>`;
}

// ---------------------------------------------------------------- the collèges' and lycées' social profile and results

const R = {
  eyebrow: "Ministère de l'Éducation nationale, DEPP",
  h2: "Collèges et lycées\u00a0: profil social et résultats",
  lead: (c: number, l: number, rentree: number, session: number) => `${nombre(c)} collèges et ${nombre(l)} lycées, publics et privés sous contrat : leur indice de position sociale à la rentrée ${rentree}, et leurs résultats au brevet et au bac ${session}, avec le taux attendu calculé par le ministère.`,
  ips: "« L'indice de position sociale (IPS) permet d'appréhender le statut social des élèves à partir des professions et catégories sociales (PCS) de leurs parents. » (ministère de l'Éducation nationale) Il décrit les familles des élèves, pas la qualité de l'établissement. Le ministère conseille de ne pas sur-interpréter des différences de 3 points ou moins.",
  attendu: "Le taux attendu est celui qu'aurait l'établissement s'il faisait réussir ses élèves ni plus ni moins que la moyenne des établissements qui lui ressemblent, compte tenu de l'âge des élèves, de leur niveau scolaire à l'entrée en sixième, de leur origine sociale et de leur sexe, et des caractéristiques du collège. Pour un lycée, on prend le niveau scolaire à l'entrée en seconde et les caractéristiques du lycée.",
  va: "L'écart entre le taux constaté et le taux attendu est la valeur ajoutée de l'établissement. « La valeur ajoutée est une approche relative et non pas absolue. » (ministère de l'Éducation nationale)",
  marge: "Le ministère ne publie pas de marge pour ces écarts. D'une année à l'autre, ils changent souvent de plusieurs points, et dans un collège de 50 candidats, un élève reçu de plus ou de moins fait 2 points.",
  classement: "Un palmarès ou un classement des établissements n'a guère de sens, écrit le ministère : ils sont ici dans l'ordre alphabétique.",
  credit: (rentree: number, session: number) => `Indices de position sociale (rentrée ${rentree}) et indicateurs de valeur ajoutée des collèges et des lycées (session ${session}), DEPP, ministère de l'Éducation nationale, Licence Ouverte.`,
  jeux: "Les jeux de données",
  plus: "Pour en savoir plus sur l'IPS : la Note d'information de la DEPP n° 23.16",
  sansBac: "Pas encore de résultats au bac.",
  gt: "Générale et technologique",
  pro: "Professionnelle",
};
const NOTE_IPS = "https://doi.org/10.48464/ni-23-16";

/** « 97,1 », as the ministry writes it. */
const ipsText = (v: number) => v.toFixed(1).replaceAll(".", ",");
/** « 95 % (attendu : 90 %) »: the rate with the terms of the comparison. */
const tauxText = (t: ips.Taux | null, candidats: number, seuil: number) => {
  if (!t) return "non calculé";
  const attendu = t.attendu !== null ? `${t.attendu}\u00a0%` : candidats < seuil ? "non calculé, trop peu de candidats" : "non calculé";
  return `${t.taux}\u00a0% (attendu\u00a0: ${attendu})`;
};
const compte = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;

/**
 * The collèges and lycées of each commune with their IPS and their rates beside the expected ones, in alphabetical
 * order: never sorted, coloured, averaged nor ranked, and nothing in the page to sort them by.
 */
function profileSection(): string {
  const all = ips.parCommune();
  const lyc = (e: ips.Lycee) => {
    const rows = ([[R.gt, e.gt, ips.SEUIL.gt], [R.pro, e.pro, ips.SEUIL.pro]] as const).filter(([, v]) => v)
      .map(([nom, v, seuil]) => `<tr><th scope="row">${esc(nom)}</th><td>${esc(tauxText(v!.acces, v!.presents, seuil))}</td><td>${esc(tauxText(v!.reussite, v!.presents, seuil))}</td><td>${nombre(v!.presents)}</td></tr>`);
    return `<h5>${esc(e.nom)} <span class="note">IPS ${ipsText(e.ips)}</span></h5>` + (rows.length
      ? `<div class="table-wrap defile"><table class="drought histo passe ipsva"><caption class="sr">${esc(e.nom)}</caption><thead><tr><th scope="col">Voie</th><th scope="col">Accès de la seconde au bac</th><th scope="col">Réussite au bac</th><th scope="col">Présents au bac</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`
      : `<p class="note">${esc(R.sansBac)}</p>`);
  };
  return `<section id="colleges-lycees" aria-labelledby="h-colleges-lycees">
  <div class="sec-h"><p class="eyebrow">${esc(R.eyebrow)}</p><h2 id="h-colleges-lycees">${esc(R.h2)}</h2><p>${esc(R.lead(ips.COLLEGES.length, ips.LYCEES.length, ips.RENTREE, ips.SESSION))}</p></div>
  <div class="card"><p>${esc(R.ips)}</p><p>${esc(R.attendu)} ${esc(R.va)}</p><p>${esc(R.marge)}</p><p>${esc(R.classement)}</p></div>
  <ul class="zones top" id="ipsl">${all.map(([c, cols, lycs]) => `<li class="card tgt" id="${anchorId("r", c)}"><details><summary><h3>${esc(c)} <span class="note">${esc([cols.length ? compte(cols.length, "collège", "collèges") : "", lycs.length ? compte(lycs.length, "lycée", "lycées") : ""].filter(Boolean).join(", "))}</span></h3></summary><div class="kinds">` +
    (cols.length ? `<div class="kind"><h4>Collèges</h4><div class="table-wrap defile"><table class="drought histo passe ipsva"><caption class="sr">${esc(`Collèges, ${c}`)}</caption><thead><tr><th scope="col">Collège</th><th scope="col">IPS</th><th scope="col">Réussite au brevet, série générale</th><th scope="col">Candidats</th></tr></thead><tbody>` +
      cols.map((e) => `<tr><th scope="row">${esc(e.nom)}</th><td>${ipsText(e.ips)}</td><td>${esc(tauxText(e.reussite, e.candidats, ips.SEUIL.college))}</td><td>${nombre(e.candidats)}</td></tr>`).join("") + `</tbody></table></div></div>` : "") +
    (lycs.length ? `<div class="kind"><h4>Lycées</h4>${lycs.map(lyc).join("")}</div>` : "") + `</div></details></li>`).join("")}</ul>
  <p class="note">${esc(R.credit(ips.RENTREE, ips.SESSION))} ${esc(R.jeux)} : ${ips.PAGES.map((j) => `<a href="${esc(j.page)}" rel="noopener">${esc(j.titre)}</a>`).join(", ")}. <a href="${NOTE_IPS}" rel="noopener">${esc(R.plus)}</a>.</p>
</section>`;
}

// ---------------------------------------------------------------- after the bac: Parcoursup

/**
 * The formations of the island in Parcoursup, by commune, establishment and formation, in alphabetical order: places,
 * taux d'accès and sheet. Never sorted by the taux, nor coloured, nor averaged; the ministry's words say what it is.
 */
function afterBacSection(): string {
  const all = parCommune();
  const n = all.reduce((k, [, list]) => k + list.reduce((m, e) => m + e.formations.length, 0), 0);
  const y = parcoursup.SESSION;
  return `<section id="apres-bac" aria-labelledby="h-apres-bac">
  <div class="sec-h"><p class="eyebrow">Parcoursup, session ${y}</p><h2 id="h-apres-bac">Après le bac</h2><p>${esc(`${nombre(n)} formations dans ${all.length} communes, hors apprentissage, avec leurs places et leur taux d'accès.`)}</p></div>
  <div class="card"><p>${esc("Le taux d'accès, selon le ministère de l'Enseignement supérieur : « rapport entre le nombre de candidats dont le rang de classement est inférieur ou égal au rang du dernier appelé de son groupe et le nombre de candidats ayant validé un vœu pour la formation étudiée en phase principale (hors GDD) ». « Si le taux est de 100 %, cela signifie qu'aucun candidat n'était en attente de proposition dans cette formation à la fin de la PP (hors GDD). »")}</p>
  <p class="note">${esc("PP : phase principale. GDD : « phase permettant de redistribuer les places laissées vacantes à l'issue de la phase principale aux néo-bacheliers sans proposition ».")}</p>
  <p>${esc("Un taux d'accès bas veut dire que les candidats étaient nombreux pour les places : il ne dit rien de la qualité de la formation. Chaque candidat fait jusqu'à 10 vœux.")}</p></div>
  <ul class="zones top" id="pbl">${all.map(([c, list]) => {
    const k = list.reduce((m, e) => m + e.formations.length, 0);
    return `<li class="card tgt" id="${anchorId("b", c)}"><details><summary><h3>${esc(c)} <span class="note">${k} formation${k > 1 ? "s" : ""}</span></h3></summary><div class="kinds">` +
      list.map((e) => `<div class="kind"><h4>${esc(e.nom)}</h4><div class="table-wrap"><table class="drought histo passe psup"><caption class="sr">${esc(e.nom)}</caption><thead><tr><th scope="col">Formation</th><th scope="col">Places</th><th scope="col">Taux d'accès</th></tr></thead><tbody>` +
        e.formations.map((f) => `<tr><th scope="row"><a href="${esc(f.fiche)}" rel="noopener">${esc(f.nom)}</a></th><td>${nombre(f.places)}</td><td>${f.tauxAcces}\u00a0%</td></tr>`).join("") +
        `</tbody></table></div></div>`).join("") + `</div></details></li>`;
  }).join("")}</ul>
  <p class="note">${esc(`Parcoursup - Traitement SIES, session ${y} (données arrêtées au ${parcoursup.jour(parcoursup.ARRETE_LE)}), Licence Ouverte.`)}</p>
</section>`;
}

/** Built at the first view: nothing in it changes until the next build. */
let built: { band: string; body: string } | undefined;

function build() {
  const counts = ecoles.KINDS.map((k) => ecoles.counted(k.type, ecoles.LIST.filter((e) => e.type === k.type).length)).join(", ");
  const band = `${crumbBar("Écoles")}
<div class="wrap intro"><div class="pitch">
  <h1>${esc(T.h1)} <span class="n974">974</span></h1>
  <p class="lead">${esc(T.lead(ecoles.LIST.length))}</p>
</div></div>`;
  const body = `${collegeSection()}
<section aria-labelledby="h-ecarte"><div class="sec-h"><h2 id="h-ecarte">${esc(T.carte)}</h2><p>${esc(counts)}.</p></div>
${filterForm()}${map()}</section>
<section aria-labelledby="h-eliste"><div class="sec-h"><h2 id="h-eliste">${esc(T.liste)}</h2></div>
${list()}
<p class="note">${esc(T.servicesNote)} ${esc(`Annuaire de l'Éducation nationale, lu le ${dayMonth(ecoles.BUILT)}.`)}</p>
<p class="sources">Sources : ${credits([credit(ecoles.SOURCE), credit(SOURCE_CARTE)])}.</p>
</section>
${profileSection()}
${afterBacSection()}<script>${FILTER_SCRIPT}</script>`;
  return { band, body };
}

export function annuaireEcolesPage(origin: string, alerte?: Alerte): string {
  built ??= build();
  return layout(origin, { title: T.title, description: T.description, path: PATH, jsonld: [crumbs(origin, "Écoles", PATH), webPage(origin, PATH, T.title, T.description, null)], alerte }, built.band, built.body);
}
