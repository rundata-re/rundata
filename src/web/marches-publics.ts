/**
 * /marches-publics: the public procurement notices open at La Réunion, from the BOAMP, newest first, to filter by
 * commune or by words, each with its link to the notice on boamp.fr. In marketing's words (29/10/2026). The
 * assistants get a commune's notices from annuaire_services_publics (tools/marches-publics.ts, 23/11/2026).
 */
import type { Cached } from "../cache.js";
import type { Avis } from "../providers/marches-publics.js";
import { acheteur, objet } from "../tools/employeurs.js";
import { a as aCommune } from "../tools/format.js";
import { communeOf, COUVERTURE, type MarchesAnswer, ouvertsA } from "../tools/marches-publics.js";
import { crumbBar, crumbs, lienNom, sourcesNote, warnings, webPage } from "./domains.js";
import type { Alerte } from "./data.js";
import { esc } from "./map.js";
import { folded, hm, layout, type Live, readAt, leAt } from "./pages.js";
import { PAGES, slugify } from "./places.js";
import { script } from "./scripts-declares.js";

export const PATH = "/marches-publics";
export const NOM = "Marchés publics";
export { COUVERTURE, ouvertsA };


// The page's copy and its type live with the tool, which reads them without the site's pages (BUDGET.md).
export { buildMarches, type MarchesAnswer } from "../tools/marches-publics.js";


/** The communes of /communes/<slug>, by slug: `?commune=<slug>` chooses one in the filter, even with no notice. */
const COMMUNE_NAMES = JSON.stringify(Object.fromEntries(PAGES.filter((p) => p.commune).map((p) => [p.slug, p.nom])));

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 2026-11-14 » → « 14/11 », with its year when it is not this one: « 08/01/2027 ». */
function jour(d: string, now: Date): string {
  const year = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 4);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}${d.slice(0, 4) === year ? "" : `/${d.slice(0, 4)}`}`;
}

function row(a: Avis, now: Date): string {
  const place = a.commune ? aCommune(a.commune) : a.communeAcheteur ? `acheteur ${aCommune(a.communeAcheteur)}` : undefined;
  const small = [acheteur(a.acheteur), a.types.join(", "), place].filter(Boolean).map((x) => esc(x!)).join(" · ");
  return `<li data-c="${esc(a.commune ?? a.communeAcheteur ?? "")}"><span>${lienNom(a.lien, objet(a.objet), ' rel="noopener"')}<small>${small}</small></span>` +
    `<span class="q-none">${esc(`jusqu'au ${jour(a.limite, now)}`)}</span></li>`;
}

/**
 * The notices by commune (the place of the work, else the buyer's), the one with the most first and those without a
 * commune last, each folded under its name and its number of notices: 103 notices in one list made a page of 22 000 px
 * on a phone. Each line keeps its place, which tells the work's from the buyer's. The filter opens the groups it finds.
 */
function groups(avis: Avis[], now: Date): string {
  const by = new Map<string, Avis[]>();
  for (const a of avis) {
    const c = a.commune ?? a.communeAcheteur ?? "";
    by.set(c, [...(by.get(c) ?? []), a]);
  }
  return [...by]
    .sort(([a, x], [b, y]) => +!a - +!b || y.length - x.length || a.localeCompare(b, "fr"))
    .map(([c, l]) => `<div class="card groupe">${folded(true, `<h3>${esc(c || "Commune non précisée")}\u00a0<span class="note">· ${l.length}\u00a0avis</span></h3>`,
      `<ul class="rows eau">${l.map((a) => row(a, now)).join("")}</ul>`)}</div>`).join("");
}

const FILTER = `<form id="of" class="card filter" hidden role="search" aria-label="Filtrer les avis">
<label class="q">Chercher <input name="q" type="search" placeholder="voirie, restauration scolaire, nettoyage…" autocomplete="off"></label>
<label>Commune <select name="c"><option value="">toutes</option>COMMUNES</select></label>
<p class="note" id="of-n" aria-live="polite"></p></form>
<p class="card" id="of-0" hidden>Aucun avis de marché ouvert pour <b></b> dans la dernière lecture du BOAMP, HEURE_LUE. Les avis sont rangés selon le lieu des travaux, ou à défaut la commune de l'acheteur. <a href="/marches-publics">Voir les avis de toute l'île →</a></p>`;

// `?commune=<slug>` (the slug of /communes/<slug>) chooses its commune at the opening, the other parameters kept (`ref`);
// choosing another one writes it in the address, to copy the link. A commune without a notice says so (`of-0`); a slug
// that is no commune's leaves the page as it is. Read in the browser: the Worker serves the same page whatever it says.
const SCRIPT = `(()=>{const f=document.getElementById("of");if(!f)return;f.hidden=false;
const items=[...document.querySelectorAll("#marches li")],list=document.getElementById("marches"),zero=document.getElementById("of-0");
const names=JSON.parse(f.dataset.communes||"{}"),opts=[...f.c.options];
const norm=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
for(const e of items)e.dataset.q=norm(e.textContent);
const run=()=>{const q=norm(f.q.value).split(" ").filter(Boolean),c=f.c.value;let n=0;
for(const e of items){const ok=q.every((t)=>e.dataset.q.includes(t))&&(!c||e.dataset.c===c);e.hidden=!ok;if(ok)n++}
const on=q.length>0||!!c;for(const g of document.querySelectorAll("#marches .groupe")){const k=!!g.querySelector("li:not([hidden])");g.hidden=on&&!k;g.firstElementChild.open=on&&k}
document.getElementById("of-n").textContent=q.length||c?n+" avis sur "+items.length+".":"";};
const none=(on)=>{zero.hidden=!on;list.hidden=on;};
const url=()=>{try{const p=new URLSearchParams(location.search),o=f.c.selectedOptions[0];if(o&&o.dataset.s)p.set("commune",o.dataset.s);else p.delete("commune");const s=p.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}catch{}};
const s=new URLSearchParams(location.search).get("commune");
if(s){const o=opts.find((x)=>x.dataset.s===s);if(o){f.c.value=o.value;run()}else if(Object.hasOwn(names,s)){zero.querySelector("b").textContent=names[s];none(true)}}
f.addEventListener("input",(e)=>{none(false);if(e.target===f.c)url();run()});f.addEventListener("submit",(e)=>e.preventDefault());})();`;

/**
 * The home page's tile, from the page's copy: its count of open notices, when the BOAMP was read. Never a read of the
 * BOAMP: the copy is rebuilt from the one the scheduled event keeps in KV (buildMarches). In the page's words otherwise.
 */
export function marchesLive(data: Cached<MarchesAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d || !data) return undefined;
  if (d.prochaine) return { valeur: "", detail: `Les avis ne sont pas encore lus : prochaine lecture prévue à ${hm(d.prochaine)}.`, vide: true };
  if (!d.avis.length && d.enLecture) return { valeur: "", detail: `${plural(d.enLecture, "avis lu", "avis lus")} au BOAMP ${leAt(d.lu ?? data.fetchedAt)} ${d.enLecture > 1 ? "sont" : "est"} en cours de tri, pour ne garder que ceux de l'île.`, vide: true };
  if (!d.nombre) return { valeur: "", detail: `Aucun avis de marché ouvert pour La Réunion sur le BOAMP ${leAt(data.fetchedAt)}.`, vide: true };
  return { valeur: `${d.nombre} avis`, detail: `de marché ${d.nombre > 1 ? "ouverts" : "ouvert"} aux réponses, BOAMP lu ${readAt(d.lu ? new Date(d.lu) : data.fetchedAt).a}` };
}

export function marchesPage(origin: string, data: Cached<MarchesAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  const communes = [...new Set((d?.avis ?? []).flatMap((a) => { const c = communeOf(a); return c ? [c] : []; }))].sort((x, y) => x.localeCompare(y, "fr"));

  const triage = !!d && !d.avis.length && !!d.enLecture;
  const status = d && data && !d.prochaine && !triage
    ? `<p>${plural(d.nombre, "avis de marché ouvert", "avis de marché ouverts")} aux réponses sur le BOAMP, dernière lecture ${readAt(d.lu ? new Date(d.lu) : data.fetchedAt, now).a}.</p>`
    : "";
  const list = !d || !data
    ? `<p class="card">Les avis se chargent : rechargez la page dans quelques secondes.</p>`
    : d.prochaine
      ? `<p class="card">Les avis ne sont pas encore lus : prochaine lecture prévue à ${hm(d.prochaine)}.</p>`
      : triage
      ? `<p class="card">${plural(d.enLecture!, "avis lu", "avis lus")} au BOAMP ${leAt(d.lu ?? data.fetchedAt)} ${d.enLecture! > 1 ? "sont" : "est"} en cours de tri, pour ne garder que ceux de l'île.</p>`
      : d.avis.length
      ? `${FILTER.replace("COMMUNES", communes.map((c) => `<option data-s="${slugify(c)}">${esc(c)}</option>`).join(""))
        .replace('role="search"', `role="search" data-communes="${esc(COMMUNE_NAMES)}"`)
        .replace("HEURE_LUE", esc(readAt(d.lu ? new Date(d.lu) : data.fetchedAt, now).a))}<div id="marches" class="plis">${groups(d.avis, now)}</div>`
      : `<p class="card">Aucun avis de marché ouvert pour La Réunion sur le BOAMP ${leAt(data.fetchedAt)}.</p>`;

  const title = "Marchés publics, appels d'offres en cours · La Réunion (974)";
  const description = "Les avis de marché publiés au BOAMP pour La Réunion (974) : travaux, services et fournitures des collectivités, de l'État et des hôpitaux, avec la date limite et le lien vers l'avis.";

  const band = `${crumbBar(NOM)}
<div class="wrap intro solo"><div class="pitch">
  <h1>Marchés publics à La Réunion <span class="n974">974</span></h1>
  <p class="lead">Les avis de marché des collectivités, de l'État et des établissements publics de l'île, publiés au BOAMP, avec la date limite de réponse et le lien vers l'avis.</p>
  ${status}
</div></div>`;

  const body = `<section aria-labelledby="h-marches">
  <h2 id="h-marches" class="sr">Les avis</h2>
  ${d?.injoignable ? warnings([d.injoignable]) : ""}
  ${list}
</section>
<section aria-labelledby="h-couv">
  <div class="sec-h"><h2 id="h-couv">Ce qui est couvert</h2><p>${esc(COUVERTURE)}</p></div>
  ${d && data && !d.prochaine ? sourcesNote(d.sources, data) : ""}
</section>
${script(SCRIPT)}`;

  return layout(origin, { title, description, path: PATH, jsonld: [crumbs(origin, NOM, PATH), webPage(origin, PATH, title, description, data)], alerte }, band, body);
}
