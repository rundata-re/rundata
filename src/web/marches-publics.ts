/**
 * /marches-publics: the public procurement notices open at La Réunion, from the BOAMP, newest first, to filter by
 * commune or by words, each with its link to the notice on boamp.fr. In marketing's words (29/10/2026). No invitation
 * to the connector yet: no tool answers it (the next one).
 */
import type { Cache, Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { avis, type Avis, prochaineLecture, SOURCE } from "../providers/marches-publics.js";
import { a as aCommune, credits } from "../tools/format.js";
import { injoignable } from "../tools/injoignable.js";
import { crumbBar, crumbs, sourcesNote, warnings, webPage } from "./domains.js";
import type { Alerte } from "./data.js";
import { esc } from "./map.js";
import { folded, hm, layout, type Live, readAt, leAt } from "./pages.js";

export const PATH = "/marches-publics";
export const NOM = "Marchés publics";

/** What is covered, in marketing's words. */
export const COUVERTURE = "Les avis de marché publiés au Bulletin officiel des annonces des marchés publics (BOAMP) pour La Réunion, lus chaque heure. Un avis reste ici jusqu'à sa date limite de réponse ; un rectificatif remplace l'avis qu'il corrige. La liste n'est pas complète : sous 90 000 € HT, l'acheteur choisit où il publie, et jusqu'aux seuils européens, il peut publier dans un journal d'annonces légales plutôt qu'au BOAMP. Le dossier de consultation se télécharge sur le profil d'acheteur, dont l'avis donne le lien : l'avis fait foi.";

export interface MarchesAnswer {
  nombre: number;
  avis: Avis[];
  injoignable?: string;
  sources: { source: string; licence: string; attribution: string }[];
  /**
   * When the list was read (ISO), said as the last read: not the page's copy's time, a few minutes later (on 29/10/2026
   * the page said 16:40 for the list read at 16:35).
   */
  lu?: string;
  /** No copy of the notices yet: when the scheduled event reads them next (ISO). */
  prochaine?: string;
  /**
   * How many notices read in the list wait for their full text, to tell the island's. Without a notice shown, the page
   * says them, never « no notice ».
   */
  enLecture?: number;
}

/**
 * The page's copy: every notice open, from the store. Without a copy in the store, when they are read next: reloading
 * would not bring them sooner.
 */
export async function buildMarches(cache: Cache, now = new Date()): Promise<MarchesAnswer> {
  let c;
  try {
    c = await avis(cache, now);
  } catch {
    c = null;
  }
  if (!c) return { nombre: 0, avis: [], sources: [], prochaine: prochaineLecture(now).toISOString() };
  const at = localTime(c.fetchedAt);
  return {
    nombre: c.value.avis.length,
    avis: c.value.avis,
    lu: c.value.lu,
    ...(c.value.echec ? { injoignable: injoignable("le BOAMP", at, localTime(new Date(c.value.echec)), now).texte } : {}),
    ...(c.value.attente?.length ? { enLecture: c.value.attente.length } : {}),
    sources: credits([SOURCE]),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 2026-11-14 » → « 14/11 », with its year when it is not this one: « 08/01/2027 ». */
function jour(d: string, now: Date): string {
  const year = new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 4);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}${d.slice(0, 4) === year ? "" : `/${d.slice(0, 4)}`}`;
}

function row(a: Avis, now: Date): string {
  const place = a.commune ? aCommune(a.commune) : a.communeAcheteur ? `acheteur ${aCommune(a.communeAcheteur)}` : undefined;
  const small = [a.acheteur, a.types.join(", "), place].filter(Boolean).map((x) => esc(x!)).join(" · ");
  return `<li data-c="${esc(a.commune ?? a.communeAcheteur ?? "")}"><span><a href="${esc(a.lien)}" rel="noopener">${esc(a.objet)}</a><small>${small}</small></span>` +
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
    .map(([c, l]) => `<div class="card groupe">${folded(true, `<h3>${esc(c || "Commune non précisée")}\u00a0<span class="note">·\u00a0${l.length}\u00a0avis</span></h3>`,
      `<ul class="rows eau">${l.map((a) => row(a, now)).join("")}</ul>`)}</div>`).join("");
}

const FILTER = `<form id="of" class="card filter" hidden role="search" aria-label="Filtrer les avis">
<label class="q">Chercher <input name="q" type="search" placeholder="voirie, restauration scolaire, nettoyage…" autocomplete="off"></label>
<label>Commune <select name="c"><option value="">toutes</option>COMMUNES</select></label>
<p class="note" id="of-n" aria-live="polite"></p></form>`;

const SCRIPT = `(()=>{const f=document.getElementById("of");if(!f)return;f.hidden=false;
const items=[...document.querySelectorAll("#marches li")];
const norm=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
for(const e of items)e.dataset.q=norm(e.textContent);
const run=()=>{const q=norm(f.q.value).split(" ").filter(Boolean),c=f.c.value;let n=0;
for(const e of items){const ok=q.every((t)=>e.dataset.q.includes(t))&&(!c||e.dataset.c===c);e.hidden=!ok;if(ok)n++}
const on=q.length>0||!!c;for(const g of document.querySelectorAll("#marches .groupe")){const k=!!g.querySelector("li:not([hidden])");g.hidden=on&&!k;g.firstElementChild.open=on&&k}
document.getElementById("of-n").textContent=q.length||c?n+" avis sur "+items.length+".":"";};
f.addEventListener("input",run);f.addEventListener("submit",(e)=>e.preventDefault());})();`;

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
  const communes = [...new Set((d?.avis ?? []).flatMap((a) => { const c = a.commune ?? a.communeAcheteur; return c ? [c] : []; }))].sort((x, y) => x.localeCompare(y, "fr"));

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
      ? `${FILTER.replace("COMMUNES", communes.map((c) => `<option>${esc(c)}</option>`).join(""))}<div id="marches" class="plis">${groups(d.avis, now)}</div>`
      : `<p class="card">Aucun avis de marché ouvert pour La Réunion sur le BOAMP ${leAt(data.fetchedAt)}.</p>`;

  const title = "Marchés publics Réunion : avis de marché et appels d'offres en cours · 974";
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
<script>${SCRIPT}</script>`;

  return layout(origin, { title, description, path: PATH, jsonld: [crumbs(origin, NOM, PATH), webPage(origin, PATH, title, description, data)], alerte }, band, body);
}
