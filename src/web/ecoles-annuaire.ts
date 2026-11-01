/**
 * /ecoles: the schools, collèges and lycées of the 24 communes (vie/ecoles.ts, bundled), on a map and commune by commune,
 * filtered by kind and by what they declare (canteen, boarding, ULIS); and the collège of an address's sector, from the
 * public collèges' map of sectors (public/carte-scolaire/, scripts/build-carte-scolaire.py). The address is matched in
 * the browser, against the file of the commune chosen, which Cloudflare serves before the Worker: it never leaves the
 * phone, and nothing of it is kept, logged nor put in the page's address (test/ecoles-annuaire.test.ts checks it). The
 * primary schools' sectors are set by each mairie and not published: the page says so. Nothing read but the vigilance's banner.
 */
import { INSEE } from "../places/insee.js";
import { nombre } from "../tools/format.js";
import * as ecoles from "../vie/ecoles.js";
import { CARTE, SOURCE as SOURCE_CARTE } from "../vie/carte-scolaire.js";
import { credit, type Alerte } from "./data.js";
import { crumbBar, crumbs, webPage } from "./domains.js";
import { esc, islandMap, project, W, zoomIsland } from "./map.js";
import { anchorId, credits, dayMonth, layout } from "./pages.js";
import { PAGES } from "./places.js";

export const PATH = "/ecoles";

export { CARTE, SOURCE as SOURCE_CARTE } from "../vie/carte-scolaire.js";

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
  versCommune: (c: string) => `Les écoles sur la page de ${c}`,
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

/** A row of a commune's file: the street, its place, its first and last numbers, both sides (0), odd (1) or even (2), its collège. */
export type Troncon = [string, string, number, number, number, number];
export interface CarteCommune {
  maj: string;
  colleges: { uai: string; nom: string; adresse?: string; tel?: string; web?: string; onisep?: string }[];
  v: Troncon[];
  /** The collège of the whole commune, when it has a single sector. */
  u?: number;
}
/** What the search found: the commune's one collège, a street's, its collèges by number, streets to pick from, or nothing. */
export type Trouve =
  | { k: "unique"; c: number }
  | { k: "college"; c: number; voie: [string, string]; hors: boolean }
  | { k: "numeros"; voie: [string, string]; num: boolean; hors: boolean; rows: [number, number, number, number][] }
  | { k: "choix"; voies: [string, string][] }
  | { k: "vide" }
  | { k: "inconnue" };

/**
 * The words of a street or of what was typed, to compare them: no accents, upper case, the usual abbreviations in full.
 * Pure, with nothing from the module: written into the page's script as it is (`${motsVoie}`).
 */
export function motsVoie(s: string): string[] {
  const ab: Record<string, string> = { R: "RUE", CH: "CHEMIN", CHE: "CHEMIN", CHEM: "CHEMIN", AV: "AVENUE", AVE: "AVENUE", BD: "BOULEVARD", BLD: "BOULEVARD", IMP: "IMPASSE", ALL: "ALLEE",
    PL: "PLACE", RTE: "ROUTE", LOT: "LOTISSEMENT", RES: "RESIDENCE", SQ: "SQUARE", SENT: "SENTIER", ST: "SAINT", STE: "SAINTE", PDT: "PRESIDENT", GAL: "GENERAL", DR: "DOCTEUR" };
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => ab[w] ?? w);
}

/**
 * The collège of what was typed (« 12 rue … »), in a commune's file. A street matches when every word typed is in its
 * name or its place (« rue », « chemin »… and « de », « la »… optional), the last one possibly cut short; the closest
 * names win. Several streets of that name with different collèges: the person picks one (`voie`, « name|place »). Then
 * the number, odd or even, picks the stretch; without it, or out of every stretch, the street's collèges by number.
 * Pure, `mots` given (motsVoie): written into the page's script as it is, and tested as it runs there.
 */
export function trouve(d: CarteCommune, saisie: string, mots: (s: string) => string[], voie?: string): Trouve {
  if (d.u != null && !d.v.length) return { k: "unique", c: d.u };
  const stop = new Set("DE DU DES LA LE LES D L ET A AU AUX EN".split(" "));
  const kinds = new Set("RUE CHEMIN AVENUE BOULEVARD IMPASSE ALLEE PLACE ROUTE LOTISSEMENT RESIDENCE SQUARE PASSAGE SENTIER RUELLE CITE VOIE ZA ZI QUAI MAIL TRAVERSE VENELLE LIGNE SENTE COUR COURS ROCADE PROMENADE CHAUSSEE DOMAINE ILET".split(" "));
  const w = mots(saisie);
  let n: number | null = null;
  if (w.length && /^\d+$/.test(w[0])) {
    n = Number(w.shift());
    while (w.length > 1 && /^(BIS|TER|QUATER|[A-Z])$/.test(w[0])) w.shift();
  }
  const streets = new Map<string, Troncon[]>();
  for (const v of d.v) {
    const k = `${v[0]}|${v[1]}`;
    if (!streets.has(k)) streets.set(k, []);
    streets.get(k)!.push(v);
  }
  let cand: Troncon[][] = [];
  if (voie && streets.has(voie)) cand = [streets.get(voie)!];
  else {
    const q = w.filter((x) => !stop.has(x) && !kinds.has(x));
    if (!q.length) return { k: "vide" };
    const kind = w.find((x) => kinds.has(x));
    let best = 0;
    for (const rows of streets.values()) {
      const sw = mots(rows[0][0]);
      const sk = sw.filter((x) => !stop.has(x) && !kinds.has(x));
      const lk = mots(rows[0][1]).filter((x) => !stop.has(x));
      if (!q.every((x, i) => sk.includes(x) || lk.includes(x) || (i === q.length - 1 && x.length > 2 && [...sk, ...lk].some((y) => y.startsWith(x))))) continue;
      const m = q.filter((x) => sk.includes(x) || (x.length > 2 && sk.some((y) => y.startsWith(x)))).length;
      if (!m) continue;
      const score = (m >= sk.length ? 2 : 1 + m / sk.length) + (kind && sw[0] === kind ? 0.5 : 0) + (q.some((x) => lk.includes(x)) ? 0.25 : 0);
      if (score > best) {
        best = score;
        cand = [];
      }
      if (score === best) cand.push(rows);
    }
    if (!cand.length) return { k: "inconnue" };
    if (cand.length > 1 && new Set(cand.flat().map((v) => v[5])).size > 1) return { k: "choix", voies: cand.slice(0, 12).map((r) => [r[0][0], r[0][1]]) };
  }
  const rows = cand.flat();
  const said: [string, string] = [rows[0][0], rows[0][1]];
  const by = n == null ? rows : rows.filter((v) => v[2] <= n! && n! <= v[3] && (!v[4] || n! % 2 === 2 - v[4]));
  const use = by.length ? by : rows;
  const cs = [...new Set(use.map((v) => v[5]))];
  const hors = n != null && !by.length;
  if (cs.length === 1) return { k: "college", c: cs[0], voie: said, hors };
  return { k: "numeros", voie: said, num: n != null, hors, rows: use.map((v) => [v[2], v[3], v[4], v[5]]) };
}

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
</section><script>${FILTER_SCRIPT}</script>`;
  return { band, body };
}

export function annuaireEcolesPage(origin: string, alerte?: Alerte): string {
  built ??= build();
  return layout(origin, { title: T.title, description: T.description, path: PATH, jsonld: [crumbs(origin, "Écoles", PATH), webPage(origin, PATH, T.title, T.description, null)], alerte }, built.band, built.body);
}
