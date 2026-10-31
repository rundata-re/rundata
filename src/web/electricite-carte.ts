/**
 * /electricite's map and chart (marketing's charter of the maps, 31/10/2026: the « rond proportionnel », the filières'
 * colours in each theme):
 * - The map: the power installed in each commune, filière by filière, from the national register of the installations
 *   as EDF SEI publishes it (src/electricite/installations.json, scripts/build-installations.py). It stays still: EDF
 *   publishes the production for the whole island, never plant by plant, so nothing on the map says what produces now.
 *   A round per filière, its area as its MW, grouped around the commune's centre, the biggest under; one zone to touch
 *   per commune, its bubble listing them all. Its replay, on the chart's moment, is an estimate said as one: each round
 *   its MW × its group's production on the island ÷ the group's MW on the island (GROUPES), back to the MW installed
 *   on a link.
 * - The chart: the island's production over EDF's last 24 hours, the renewable filières under, the others over (the
 *   batteries left out, `produced`), a cursor on the moment said under it. Its replay moves the cursor, and the map's
 *   rounds once a bar was touched (the chart's or the map's: the same moment).
 */
import data from "../electricite/installations.json" with { type: "json" };
import { resolvePlace } from "../places/resolve.js";
import type { Journee } from "./data.js";
import { esc, H, islandMap, project, W } from "./map.js";
import { slugify } from "./places.js";

interface Filiere { nom: string; mw: number; installations: number }
interface Commune { commune: string; filieres: Filiere[] }

const INSTALLATIONS = data as { mis_a_jour: string; communes: Commune[] };

/** Each filière of the register: its class, for its colour in each theme (ELECTRICITE_CSS). */
const CLASSE: Record<string, string> = {
  "bioénergies": "f-bio",
  "solaire": "f-sol",
  "hydraulique": "f-hyd",
  "éolien": "f-eol",
  "thermique non renouvelable": "f-the",
  "stockage non hydraulique": "f-sto",
};
/** The legend's order: the renewable filières, then the others. */
const ORDRE = Object.keys(CLASSE);

/**
 * The group of EDF's production each filière of the register follows in the replay (Journee.filieres): bioénergies
 * and thermique together, every plant that burns, since EDF counts as coal part of what the register files as
 * bioénergies (on 31/10/2026, up to 145 MW of coal for 249 MW of thermique installed, its diesel and turbines besides).
 */
const GROUPES: Record<string, number> = { "solaire": 0, "éolien": 1, "hydraulique": 2, "bioénergies": 3, "thermique non renouvelable": 3, "stockage non hydraulique": 4 };
/** The MW installed on the island in each group, as the register says. */
export const INSTALLE = INSTALLATIONS.communes.reduce((t, c) => {
  for (const f of c.filieres) if (f.nom in GROUPES) t[GROUPES[f.nom]] += f.mw;
  return t;
}, [0, 0, 0, 0, 0]);
/** Each group's production at each point, in thousandths of its MW installed, never over all of it. */
export const parts = (fs: number[][]) => fs.map((f) => f.map((mw, g) => (INSTALLE[g] > 0 ? Math.round(Math.min(1, mw / INSTALLE[g]) * 1000) : 0)));

/**
 * A round's diameter in the map's units: its area as its MW, 211 MW (the biggest) 120 units, about 64 px on the
 * computer's map and 40 px on a phone's; never under 30 units, 10 px on a phone, or it would not be seen.
 */
export const diametre = (mw: number) => Math.max(30, 8.26 * Math.sqrt(mw));

const mwText = (mw: number) => `${mw >= 10 ? Math.round(mw) : mw >= 1 ? mw.toFixed(1).replace(".", ",") : mw.toFixed(2).replace(".", ",")}\u00a0MW`;
const installations = (n: number) => `${n.toLocaleString("fr-FR")}\u00a0installation${n > 1 ? "s" : ""}`;
const jourMois = (iso: string) => iso.split("-").reverse().join("/");
export const MIS_A_JOUR = jourMois(INSTALLATIONS.mis_a_jour);

/** A commune's filières, the strongest first: « bioénergies 211 MW (1 installation) · solaire 12 MW (… installations) ». */
const total = (c: Commune) => c.filieres.reduce((n, f) => n + f.mw, 0);
export const filieresText = (c: Commune) =>
  c.filieres.map((f) => `${f.nom} ${mwText(f.mw)} (${installations(f.installations)})`).join(" · ");

/** Where each round of a commune goes: the biggest on the centre, the others around it, each touching its edge. */
function placer([x, y]: [number, number], fs: Filiere[]): { f: Filiere; x: number; y: number; r: number }[] {
  const [big, ...rest] = fs;
  const R = diametre(big.mw) / 2;
  return [{ f: big, x, y, r: R }, ...rest.map((f, k) => {
    const r = diametre(f.mw) / 2;
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / Math.max(rest.length, 3);
    const d = R * 0.7 + r * 0.5;
    return { f, x: x + d * Math.cos(a), y: y + d * Math.sin(a), r };
  })];
}

/** The map, the reference rounds at the map's own scale, then the legend. `HIT`: a finger's zone, 66 units (map.ts). */
export function installationsMap(): string {
  const communes = INSTALLATIONS.communes.flatMap((c) => {
    const at = resolvePlace(c.commune)?.lieu;
    return at && c.filieres.length ? [{ c, xy: project(at.lon, at.lat) }] : [];
  });
  const groups = communes.map(({ c, xy }) => {
    const rounds = placer(xy, c.filieres);
    const reach = Math.max(66, ...rounds.map((p) => Math.hypot(p.x - xy[0], p.y - xy[1]) + p.r));
    const said = `${c.commune} : ${filieresText(c)}, registre d'EDF mis à jour le ${MIS_A_JOUR}`;
    return `<a class="mk ip" href="#inst-${slugify(c.commune)}" aria-label="${esc(said)}" data-tp="${esc(c.commune)}" data-tv="${esc(filieresText(c))}" data-td="${esc(`registre d'EDF mis à jour le ${MIS_A_JOUR}`)}">` +
      `<title>${esc(c.commune)}</title><circle class="hit" cx="${xy[0]}" cy="${xy[1]}" r="${Math.round(reach)}" style="fill:transparent;stroke:none"/>` +
      rounds.map((p) => `<circle class="sh ${CLASSE[p.f.nom] ?? "f-sto"}" cx="${Math.round(p.x)}" cy="${Math.round(p.y)}" r="${Math.round(p.r)}"${p.f.nom in GROUPES ? ` data-g="${GROUPES[p.f.nom]}" data-mw="${p.f.mw}"` : ""}/>`).join("") + `</a>`;
  }).join("");
  const label = `Carte de La Réunion : puissance installée par commune et par filière, d'après le registre d'EDF mis à jour le ${MIS_A_JOUR}`;
  // The names of the communes with the most power first: a big round's commune keeps its name, its neighbour gives way.
  const first = [...communes].sort((a, b) => total(b.c) - total(a.c)).map(({ c }) => c.commune);
  const map = islandMap({ top: `<g class="ips">${groups}</g>`, label, first });
  return map;
}

/** The legend under the map: the filières present, three reference rounds at the map's scale, then the source. */
export function installationsLegend(): string {
  const present = new Set(INSTALLATIONS.communes.flatMap((c) => c.filieres.map((f) => f.nom)));
  const keys = ORDRE.filter((n) => present.has(n)).map((n) =>
    `<span><svg viewBox="-20 -20 40 40" aria-hidden="true"><circle class="${CLASSE[n]}" r="15"/></svg>${esc(n)}</span>`).join("");
  // The reference rounds at the map's scale: each in its own SVG, as wide against the legend as the round against the
  // map (the legend is as wide as the map); their words in HTML beside them, at the page's text size.
  const refs = [10, 50, 200].map((mw) => {
    const d = diametre(mw) + 8;
    return `<svg viewBox="0 0 ${d.toFixed(1)} ${d.toFixed(1)}" style="width:${((d / W) * 100).toFixed(2)}%" aria-hidden="true">` +
      `<circle cx="${(d / 2).toFixed(1)}" cy="${(d / 2).toFixed(1)}" r="${(diametre(mw) / 2).toFixed(1)}"/></svg><span>${mwText(mw)}</span>`;
  }).join("");
  return `<span class="mlg ipk">${keys}</span>` +
    `<span class="iprw">${refs}</span>` +
    `<span class="mls">Puissance installée par commune et par filière, d'après le registre national des installations, mis à jour par EDF SEI le ${MIS_A_JOUR}. EDF publie la production pour toute l'île, filière par filière, pas centrale par centrale\u00a0: la carte montre ce qui peut produire, pas ce qui produit en ce moment.</span>`;
}

/**
 * The map's replay, under its legend: its own bar on the chart's moment, then, once played, the words of the estimate
 * (marketing, 31/10/2026) and the way back to the MW installed. Hidden until the script shows it; none without the
 * filières' production.
 */
export function installationsReplay(j: Journee): string {
  if (!j.filieres?.length) return "";
  const n = j.points.length;
  return `<div class="ip-rj" hidden><div class="rj ech-rj"><button type="button" class="rj-b" aria-label="Lire les 24\u00a0dernières heures sur la carte">▶ Lire</button>` +
    `<input type="range" min="0" max="${n - 1}" step="1" value="${n - 1}" aria-label="Moment affiché sur la carte"></div>` +
    `<p class="ip-est" hidden><b>Estimé\u00a0: chaque rond suit sa filière sur toute l'île, d'après la production publiée par EDF le <span class="ip-h"></span>.</b> ` +
    `La taille d'un rond n'est pas la production de cette centrale\u00a0: EDF ne la publie pas. Bioénergies et thermique suivent ensemble toutes les centrales à combustion (bagasse, biomasse, charbon, fioul…)\u00a0: EDF ne les range pas dans les mêmes filières que le registre des installations. ` +
    `<button type="button" class="ip-re">Revenir à la puissance installée</button></p></div>`;
}

/** Each commune's line, where its zone on the map leads: its filières, the strongest first. */
export function installationsList(): string {
  return `<ul class="rows inst">${INSTALLATIONS.communes.map((c) =>
    `<li id="inst-${slugify(c.commune)}" class="tgt"><b>${esc(c.commune)}</b><span>${esc(filieresText(c))}</span></li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- the chart of the 24 hours

/** The plot in its own units; its graduations are HTML around it, at the page's text sizes on a phone as on a computer. */
const CW = 1000;
/** The file of the durations and the years (electricite-historique.ts), read by the chart's script. */
export const HISTORIQUE_PATH = "/electricite/historique.json";
const CH = 480;

const hm = (t: number) => new Date(t + 4 * 3600_000).toISOString().slice(11, 16);
const dm = (t: number) => { const d = new Date(t + 4 * 3600_000).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}`; };
const pct = (ren: number, non: number) => (ren + non > 0 ? Math.round((ren / (ren + non)) * 100) : 0);
const at = (v: number) => `${(v * 100).toFixed(2)}%`;

/** What the cursor says, as the script says it (CHART_SCRIPT): « 31/10 à 05:20 : 281 MW, dont 95 % renouvelable. » */
export const momentText = (t: number, total: number, ren: number, non: number) =>
  `${dm(t)} à ${hm(t)}\u00a0: ${Math.round(total)}\u00a0MW, dont ${pct(ren, non)}\u00a0% renouvelable.`;

/**
 * The chart, its cursor on the latest point; above it, once the script has read /electricite/historique.json, the
 * durations the archive has (24 h, 7 jours, 30 jours); beside it (under it on a phone) the words of that moment, the
 * replay's bar, the source.
 */
export function productionChart(j: Journee): string {
  const t0 = Date.parse(j.debut);
  const pts = j.points;
  const last = pts[pts.length - 1];
  const span = Math.max(last[0], 60);
  const top = Math.max(100, Math.ceil(Math.max(...pts.map((p) => p[1] + p[2])) / 100) * 100);
  const X = (m: number) => (CW * m) / span;
  const Y = (mw: number) => CH - (CH * mw) / top;
  // Each area down to the axis: the whole production behind, the renewable part over it; whole units, under a pixel.
  const area = (f: (p: (typeof pts)[number]) => number) =>
    `M${Math.round(X(pts[0][0]))} ${CH}L${pts.map((p) => `${Math.round(X(p[0]))} ${Math.round(Y(f(p)))}`).join("L")}L${Math.round(X(last[0]))} ${CH}Z`;
  const levels = Array.from({ length: top / 100 + 1 }, (_, k) => k * 100);
  const grid = levels.map((mw) => `<line x1="0" x2="${CW}" y1="${Y(mw)}" y2="${Y(mw)}"/>`).join("");
  // The hours: every 6 hours, on the round hour.
  const first = Math.ceil((t0 + 4 * 3600_000) / (6 * 3600_000)) * 6 * 3600_000 - 4 * 3600_000;
  const hours: number[] = [];
  for (let t = first; t <= t0 + span * 60_000; t += 6 * 3600_000) hours.push(t);
  const tl = t0 + last[0] * 60_000;
  const lows = Math.min(...pts.map((p) => pct(p[1], p[2])));
  const highs = Math.max(...pts.map((p) => pct(p[1], p[2])));
  const label = `Production d'électricité de l'île sur 24\u00a0h, de ${hm(t0)} à ${hm(tl)}\u00a0: part renouvelable de ${lows}\u00a0% à ${highs}\u00a0%.`;
  const svg = `<svg class="ech" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<g class="cg">${grid}</g><path class="ar ar-non" d="${area((p) => p[1] + p[2])}"/><path class="ar ar-ren" d="${area((p) => p[1])}"/>` +
    `<line class="cur" x1="${X(last[0])}" x2="${X(last[0])}" y1="0" y2="${CH}" vector-effect="non-scaling-stroke"/></svg>`;
  // The graduations drawn by the style (`data-v`), not written in the page: one after the other, « 400 MW300200100 »
  // and the hours read as a phone number to iOS, which underlined them as a link (the user's iPhone, 31/10/2026).
  const ys = levels.map((mw) => `<span class="cy" style="top:${at(Y(mw) / CH)}" data-v="${mw === top ? `${mw}\u00a0MW` : mw}"></span>`).join("");
  const xs = hours.map((t) => `<span class="cx" style="left:${at(X((t - t0) / 60_000) / CW)}" data-v="${hm(t)}"></span>`).join("");
  const keys = `<span class="mlg"><span><svg viewBox="-20 -20 40 40" aria-hidden="true"><rect class="ar-ren" x="-15" y="-15" width="30" height="30" rx="4"/></svg>renouvelable</span>` +
    `<span><svg viewBox="-20 -20 40 40" aria-hidden="true"><rect class="ar-non" x="-15" y="-15" width="30" height="30" rx="4"/></svg>non renouvelable</span></span>`;
  const bar = `<div class="rj ech-rj" hidden><button type="button" class="rj-b" aria-label="Lire les 24\u00a0dernières heures">▶ Lire</button>` +
    `<input type="range" min="0" max="${pts.length - 1}" step="1" value="${pts.length - 1}" aria-label="Moment affiché sur le graphique"></div>`;
  // The durations: the archive's, shown by the script once it has them; « depuis le … » while one is not full.
  const durees = `<div class="ech-d" role="group" aria-label="Durée du graphique" hidden><button type="button" aria-pressed="true" data-d="j1">24\u00a0h</button>` +
    `<button type="button" aria-pressed="false" data-d="j7" hidden>7\u00a0jours</button><button type="button" aria-pressed="false" data-d="j30" hidden>30\u00a0jours</button></div>`;
  const source = `Production d'électricité de l'île sur 24\u00a0h, toutes les 5\u00a0minutes, estimée par EDF${j.mis_a_jour ? ` (mise à jour le ${esc(j.mis_a_jour.replace(" ", " à "))})` : ""}. Part renouvelable selon les filières d'EDF, sans les batteries.`;
  const archive = `Moyennes par heure (7\u00a0jours) ou par 3\u00a0heures (30\u00a0jours), calculées par rundata.re d'après la production qu'EDF publie toutes les 5\u00a0minutes. EDF ne garde que les 24\u00a0dernières heures\u00a0: rundata.re les garde depuis le <span class="ech-dp"></span>.`;
  // The points for the script, in whole MW: what it says is rounded the same.
  // With each group's share of its MW installed, for the map's rounds, when the copy has the filières.
  const fs = j.filieres?.length === pts.length ? { f: parts(j.filieres) } : {};
  const data = esc(JSON.stringify({ t0, s: span, p: pts.map((p) => p.map(Math.round)), ...fs }));
  return `<figure class="card ecard" data-ech="${data}" data-h="${HISTORIQUE_PATH}">${durees}<div class="ech-g"><div class="ech-p">${svg}<span class="ech-ax" aria-hidden="true">${ys}${xs}</span></div>` +
    `<figcaption class="note"><p class="ech-m" aria-live="polite">${esc(momentText(tl, Math.round(last[3]), Math.round(last[1]), Math.round(last[2])))}</p>${bar}${keys}<span class="mls ech-src">${source}</span><span class="mls ech-n" hidden>${archive}</span></figcaption></div></figure><script>${CHART_SCRIPT}</script>`;
}

/**
 * The year's production by filière (EDF SEI's yearly figures, /electricite/historique.json): filled by the chart's
 * script once it has them, hidden until then and without a script.
 */
export function anneeSection(): string {
  return `<section aria-labelledby="h-annee" data-an hidden>
  <div class="sec-h"><p class="eyebrow">L'année</p><h2 id="h-annee">La production de <span class="an-y"></span>, filière par filière</h2></div>
  <div class="card an"><table class="an-t"><thead><tr><th scope="col">Filière</th><th scope="col">Production</th><th scope="col">Part</th></tr></thead><tbody></tbody></table>
  <p class="an-tot"></p><p class="mls an-ys"></p><p class="mls an-src"></p></div>
</section>`;
}

/**
 * The replay of the chart: each bar's slider and button (the chart's, the map's) move the cursor from point to point,
 * the words under the chart follow it; over PLAY_MS for the duration shown, from the start or from where the slider
 * is. Once a bar is touched, the map's rounds follow the moment too (`on`), each its MW × its group's share (`f`, in
 * thousandths), its words under it, until « Revenir à la puissance installée »; a map put in the page later takes the
 * moment when it comes (the event `carte`). Without a script, the cursor stays on the latest point, the bars hidden;
 * with less motion asked, no button (ELECTRICITE_CSS), the sliders only. The durations of the archive and the year's
 * figures: read once, when the chart nears the screen; the chart redrawn by the script for 7 and 30 days, its
 * graduations as the server draws them. Once the page is read: the map's bar and the year's section come after it.
 */
const PLAY_MS = 12_000;
const CHART_SCRIPT = `(()=>{const go=()=>{const f=document.querySelector("[data-ech]");if(!f)return;const D={j1:JSON.parse(f.dataset.ech)},svg=f.querySelector("svg.ech"),cur=f.querySelector(".cur"),m=f.querySelector(".ech-m"),ax=f.querySelector(".ech-ax"),src=f.querySelector(".ech-src"),note=f.querySelector(".ech-n"),du=f.querySelector(".ech-d"),an=document.querySelector("[data-an]"),
ip=D.j1.f&&document.querySelector(".ip-rj"),bars=[...document.querySelectorAll(".ech-rj")].filter((x)=>f.contains(x)||ip&&ip.contains(x)),est=ip&&ip.querySelector(".ip-est");
const hm=(t)=>new Date(t+144e5).toISOString().slice(11,16),dm=(t)=>{const d=new Date(t+144e5).toISOString();return d.slice(8,10)+"/"+d.slice(5,7)},dmy=(s)=>{const d=new Date(Date.parse(s)+144e5).toISOString();return d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4)},pc=(r,n)=>r+n>0?Math.round(r/(r+n)*100):0,nb=(v,d)=>v.toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});
const hh=(x)=>x%24?x+"\\u00a0h":"minuit",LIRE={j1:"Lire les 24\\u00a0dernières heures",j7:"Lire les 7\\u00a0derniers jours",j30:"Lire les 30\\u00a0derniers jours"},SUR={j7:"Production d'électricité de l'île sur 7\\u00a0jours, en moyenne par heure.",j30:"Production d'électricité de l'île sur 30\\u00a0jours, en moyenne par 3\\u00a0heures.",j1:svg.getAttribute("aria-label")};
let k="j1",J=D.j1,at=J.p.length-1,on=false,run=0;
const map=()=>{if(!ip)return;document.querySelectorAll(".ip circle[data-g]").forEach((c)=>{if(!c.dataset.r)c.dataset.r=c.getAttribute("r");c.setAttribute("r",on&&J.f?Math.max(3,4.13*Math.sqrt(c.dataset.mw*J.f[at][c.dataset.g]/1e3)).toFixed(1):c.dataset.r)})};
const show=(i,user)=>{at=i;const p=J.p[i],x=1e3*p[0]/J.s,t=J.t0+p[0]*6e4;cur.setAttribute("x1",x);cur.setAttribute("x2",x);bars.forEach((b)=>{const r=b.querySelector("input");r.max=J.p.length-1;r.value=i});const a=new Date(t+144e5).getUTCHours();m.textContent=k==="j1"?dm(t)+" à "+hm(t)+"\\u00a0: "+Math.round(p[3])+"\\u00a0MW, dont "+pc(p[1],p[2])+"\\u00a0% renouvelable.":dm(t)+", de "+hh(a)+" à "+hh(a+J.pas)+"\\u00a0: "+Math.round(p[3])+"\\u00a0MW en moyenne, dont "+pc(p[1],p[2])+"\\u00a0% renouvelable.";
if(ip&&J.f&&(user||on)){on=true;est.hidden=false;est.querySelector(".ip-h").textContent=dm(t)+" à "+hm(t);map()}else if(ip&&!J.f&&on){on=false;est.hidden=true;map()}};
const stop=()=>{cancelAnimationFrame(run);run=0;bars.forEach((x)=>{const b=x.querySelector("button");b.textContent="▶ Lire";b.setAttribute("aria-label",LIRE[k]+b.dataset.s)})};
bars.forEach((x)=>{const b=x.querySelector("button"),rg=x.querySelector("input");b.dataset.s=ip&&ip.contains(x)?" sur la carte":"";
b.addEventListener("click",()=>{if(run)return stop();const P=J.p;let from=at;if(from>=P.length-1)from=0;const s=performance.now()-from/(P.length-1)*${PLAY_MS};b.textContent="❚❚ Pause";b.setAttribute("aria-label","Arrêter");
const step=(now)=>{const i=Math.min(P.length-1,Math.round((now-s)/${PLAY_MS}*(P.length-1)));show(i,1);if(i>=P.length-1)return stop();run=requestAnimationFrame(step)};run=requestAnimationFrame(step)});
rg.addEventListener("input",()=>{if(run)stop();show(+rg.value,1)});x.hidden=false});
if(ip){ip.hidden=false;ip.querySelector(".ip-re").addEventListener("click",()=>{if(run)stop();on=false;est.hidden=true;map()});document.addEventListener("carte",()=>{if(on)map()})}
const NS="http://www.w3.org/2000/svg",sp=(c,st,v)=>{const e=document.createElement("span");e.className=c;e.setAttribute("style",st);e.dataset.v=v;return e};
const draw=()=>{const P=J.p,last=P[P.length-1],top=Math.max(100,Math.ceil(Math.max(...P.map((p)=>p[1]+p[2]))/100)*100),X=(v)=>1e3*v/J.s,Y=(v)=>480-480*v/top;
const area=(g)=>"M"+Math.round(X(P[0][0]))+" 480L"+P.map((p)=>Math.round(X(p[0]))+" "+Math.round(Y(g(p)))).join("L")+"L"+Math.round(X(last[0]))+" 480Z";
svg.querySelector(".ar-non").setAttribute("d",area((p)=>p[1]+p[2]));svg.querySelector(".ar-ren").setAttribute("d",area((p)=>p[1]));svg.setAttribute("aria-label",SUR[k]);
const lv=[];for(let v=0;v<=top;v+=100)lv.push(v);svg.querySelector(".cg").replaceChildren(...lv.map((v)=>{const l=document.createElementNS(NS,"line");l.setAttribute("x1",0);l.setAttribute("x2",1e3);l.setAttribute("y1",Y(v));l.setAttribute("y2",Y(v));return l}));
const H=k==="j1"?216e5:k==="j7"?864e5:432e6,lab=k==="j1"?hm:dm,t1=J.t0+last[0]*6e4,ts=[];for(let t=Math.ceil((J.t0+144e5)/H)*H-144e5;t<=t1;t+=H)ts.push(t);
ax.replaceChildren(...lv.map((v)=>sp("cy","top:"+(Y(v)/4.8).toFixed(2)+"%",v===top?v+"\\u00a0MW":v)),...ts.map((t)=>sp("cx","left:"+(X((t-J.t0)/6e4)/10).toFixed(2)+"%",lab(t))));
src.hidden=k!=="j1";note.hidden=k==="j1"};
du.querySelectorAll("button").forEach((b)=>b.addEventListener("click",()=>{const n=b.dataset.d;if(!D[n]||n===k)return;if(run)stop();k=n;J=D[n];du.querySelectorAll("button").forEach((x)=>x.setAttribute("aria-pressed",x===b));draw();show(J.p.length-1);stop()}));
const NOMS=["Photovoltaïque","Éolien","Hydraulique","Bioénergies","Charbon","Diesel","Turbines à combustion"],gwh=(v)=>nb(v/1e3,v<1e4?1:0)+"\\u00a0GWh",el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const year=(a)=>{const Y=a.annees[a.annees.length-1];an.querySelector(".an-y").textContent=Y.annee;
an.querySelector("tbody").replaceChildren(...Y.filieres.map((v,i)=>{const s=Y.total>0?v/Y.total*100:0,tr=el("tr"),th=el("th",null,NOMS[i]),b=el("span","an-b");b.style.width=s.toFixed(1)+"%";th.scope="row";th.append(b);tr.append(th,el("td",null,gwh(v)),el("td",null,nb(s,1)+"\\u00a0%"));return tr}));
an.querySelector(".an-tot").textContent="Total\\u00a0: "+gwh(Y.total)+". Part renouvelable, selon EDF\\u00a0: "+nb(Y.part_enr,1)+"\\u00a0%.";
an.querySelector(".an-ys").textContent="Par année, selon EDF · "+a.annees.map((y)=>y.annee+"\\u00a0: "+gwh(y.total)+" ("+nb(y.part_enr,1)+"\\u00a0% renouvelable)").join(" · ")+".";
an.querySelector(".an-src").textContent="Bilan annuel publié par EDF SEI"+(a.mis_a_jour?", mis à jour le "+dmy(a.mis_a_jour):"")+"\\u00a0: "+Y.annee+" est la dernière année publiée (lu le "+dmy(a.lu)+").";an.hidden=false};
let asked=0;const ask=()=>{if(asked)return;asked=1;fetch(f.dataset.h).then((r)=>r.ok?r.json():{}).catch(()=>({})).then((h)=>{["j7","j30"].forEach((n)=>{if(!h[n])return;D[n]=h[n];const b=du.querySelector('[data-d="'+n+'"]');if(h[n].depuis)b.textContent=n.slice(1)+"\\u00a0j (depuis le "+dm(Date.parse(h[n].depuis))+")";b.hidden=false});
if(h.j7||h.j30){du.hidden=false;if(h.depuis)note.querySelector(".ech-dp").textContent=dm(Date.parse(h.depuis))}if(h.annuel&&h.annuel.annees&&h.annuel.annees.length&&an)year(h.annuel)})};
if(window.IntersectionObserver){const o=new IntersectionObserver((e)=>{if(e.some((x)=>x.isIntersecting)){o.disconnect();ask()}},{rootMargin:"100% 0px"});o.observe(f)}else ask()};document.readyState==="loading"?addEventListener("DOMContentLoaded",go,{once:true}):go()})();`;

/** Their style, in the page's sheet: the filières' and the areas' colours in each theme (marketing, 31/10/2026). */
// `.ipm`: the map's room, kept while it waits to be put in the page (laterMap()).
export const ELECTRICITE_CSS = `.ipm{aspect-ratio:${W}/${H}}` +
  `:root{--f-sol:#b97f00;--f-bio:#2b8a46;--f-hyd:#1c6fc2;--f-eol:#4fa3c7;--f-the:#5a6672;--f-sto:#7048e8;--a-ren:#2b8a46;--a-non:#5a6672}` +
  `@media (prefers-color-scheme:dark){:root{--f-sol:#ffcf1f;--f-bio:#5ee08a;--f-hyd:#4dabf7;--f-eol:#a5d8ff;--f-the:#8a96a3;--f-sto:#b197fc;--a-ren:#5ee08a;--a-non:#8a96a3}}` +
  `.f-sol{fill:var(--f-sol)}.f-bio{fill:var(--f-bio)}.f-hyd{fill:var(--f-hyd)}.f-eol{fill:var(--f-eol)}.f-the{fill:var(--f-the)}.f-sto{fill:var(--f-sto)}` +
  `.map .ip circle:not(.hit){stroke:#fff;stroke-width:4}.mlg.ipk circle{stroke:#fff;stroke-width:4}` +
  `.iprw{display:flex;align-items:center;gap:.35rem;margin:.3rem 0 .5rem}.iprw svg{height:auto;flex:none}.iprw circle{fill:none;stroke:var(--muted);stroke-width:4}.iprw>span{color:var(--muted);font-weight:600;font-size:.82rem;white-space:nowrap;margin-right:.9rem}` +
  `.ech-g{display:grid;gap:1rem}@media (min-width:58rem){.ech-g{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);align-items:start}}` +
  `.ech-p{position:relative;margin:.6rem 0 1.9rem 3.1rem}.ech{display:block;width:100%;height:auto;aspect-ratio:${CW}/${CH};overflow:visible}.ech .cg line{stroke:var(--line);stroke-width:2;vector-effect:non-scaling-stroke}` +
  `.ech-p .cy,.ech-p .cx{position:absolute;color:var(--muted);font-size:.8rem;font-weight:600;line-height:1;white-space:nowrap}.ech-p .cy::before,.ech-p .cx::before{content:attr(data-v)}.ech-p .cy{right:calc(100% + .4rem);transform:translateY(-50%)}.ech-p .cx{top:calc(100% + .45rem);transform:translateX(-50%)}` +
  `.ar-ren{fill:var(--a-ren)}.ar-non{fill:var(--a-non)}.ech .cur{stroke:var(--ink);stroke-width:2.5}.ech-m{font-weight:700;font-size:1.05rem;color:var(--ink);margin:0 0 .5rem}` +
  `.ech-rj{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.4rem 0}.ech-rj[hidden]{display:none}` +
  `.ech-rj button{min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}` +
  `.ech-rj input{flex:1 1 12rem;min-height:44px;accent-color:var(--ink)}@media (prefers-reduced-motion:reduce){.ech-rj button{display:none}}` +
  `.ip-rj .ech-rj{margin:.6rem 0 .2rem}.ip-est{margin:.3rem 0 0;color:var(--muted)}.ip-est b{color:var(--ink)}.ip-re{display:block;margin-top:.5rem;min-height:44px;padding:.35rem .95rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}` +
  `.ech-d{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .6rem}.ech-d[hidden],.ech-d button[hidden]{display:none}.ech-d button{min-height:44px;padding:.35rem .9rem;border-radius:999px;border:1px solid var(--line);background:none;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}.ech-d button[aria-pressed=true]{background:var(--ink);color:var(--surface)}` +
  `.an-t{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.an-t th,.an-t td{padding:.4rem .5rem .4rem 0;text-align:left;border-bottom:1px solid var(--line)}.an-t td:nth-child(2),.an-t td:nth-child(3){text-align:right;white-space:nowrap}.an-t thead th{color:var(--muted);font-size:.82rem}.an-t tbody th{font-weight:600}` +
  `.ecard .mls[hidden]{display:none}.an-b{display:block;height:.45rem;margin-top:.3rem;border-radius:3px;background:var(--ink);min-width:2px}.an-tot{font-weight:700;margin:.8rem 0 .3rem}.an .mls{display:block;margin:.3rem 0 0}` +
  `.rows.inst li{display:flex;flex-wrap:wrap;gap:.2rem .8rem}.rows.inst li>span{color:var(--muted)}.ipc details{margin-top:.8rem}.ipc summary h3{display:inline;font-size:1rem}` +
  `@media (max-width:37.49rem){.ech{aspect-ratio:${CW}/700}}`;
