/**
 * /emploi: the public sector's offers open at La Réunion, from Choisir le service public, newest first, to filter by
 * commune or by words, each with its link to apply on the site. In marketing's words (29/10/2026); the companies'
 * offers are not taken: a sentence with two links, and the user's line on the sites that do not allow it. Then « Se
 * former avec le CPF »: how many formations eligible to the CPF have an open session at La Réunion, by theme, without
 * a body's name nor a fee (03/11/2026); the tool gives them for words asked.
 */
import type { Cache, Cached } from "../cache.js";
import { localTime } from "../geo.js";
import { offres, prochaineLecture } from "../providers/emploi.js";
import { SITE as CPF_SITE } from "../providers/cpf.js";
import { A_SAVOIR as CPF_A_SAVOIR, themesCpf } from "../tools/cpf.js";
import { nombre } from "../tools/format.js";
import { COUVERTURE, emploi, ENTREPRISES, NON_REPRIS, type OffreRow } from "../tools/emploi.js";
import { connectorCta, crumbBar, crumbs, sourcesNote, warnings, webPage } from "./domains.js";
import type { Alerte } from "./data.js";
import { esc } from "./map.js";
import { folded, hm, layout, type Live, readAt, leAt } from "./pages.js";

export const PATH = "/emploi";
export const NOM = "Emploi public";

export interface EmploiAnswer {
  resume: string;
  nombre: number;
  offres: OffreRow[];
  injoignable?: string;
  couverture: string;
  sources: { source: string; licence: string; attribution: string }[];
  /**
   * When the feed was last read (ISO), said as the last read: not the page's copy's time, up to 5 minutes later.
   */
  lu?: string;
  /** The count of the site's search for La Réunion, read within a day (the tool's `total_site`). */
  total_site?: { nombre: number; lu_a: string; lien: string };
  /** No copy of the offers yet: when the scheduled event reads them next (ISO). */
  prochaine?: string;
  /** The formations eligible to the CPF, counted by theme; absent without a copy. */
  cpf?: NonNullable<Awaited<ReturnType<typeof themesCpf>>>;
}

/**
 * The page's copy: every offer open, from the tool's answer. Without a copy of the offers in the store, when they are
 * read next: reloading would not bring them sooner (a page copy lasts 5 minutes, then is built again).
 */
export async function buildEmploi(cache: Cache, now = new Date()): Promise<EmploiAnswer> {
  const r = await emploi(cache, undefined, undefined, now, Infinity);
  const cpf = (await themesCpf(cache)) ?? undefined;
  if ("isError" in r && r.isError) return { resume: "", nombre: 0, offres: [], couverture: COUVERTURE, sources: [], prochaine: prochaineLecture(now).toISOString(), ...(cpf ? { cpf } : {}) };
  const { resume, nombre, offres: list, injoignable, couverture, sources, total_site } = JSON.parse(r.content[0].text) as EmploiAnswer;
  // The copy the tool has just read, from memory: its time.
  const lu = (await offres(cache, now).catch(() => null))?.value.lu;
  return { resume, nombre, offres: list, ...(total_site ? { total_site } : {}), ...(lu ? { lu } : {}), ...(injoignable ? { injoignable } : {}), couverture, sources, ...(cpf ? { cpf } : {}) };
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** The right column: the closing date, else the day published, or the days of the offers of a line when they differ. */
function quand(o: OffreRow): string {
  if (o.date_limite) return `jusqu'au ${o.date_limite}`;
  if (o.publiee_le) return `publiée le ${o.publiee_le}`;
  const r = "references" in o ? o.references : [];
  return `publiées du ${r[r.length - 1].publiee_le} au ${r[0].publiee_le}`;
}

/** The nature most offers have: said once above the list when every offer has one, then only the others in their line. */
const OUVERT = "Emploi ouvert aux titulaires et aux contractuels";

/** An offer's line, without its commune, which its group says; without its nature when it is `OUVERT` and `once`. */
function row(o: OffreRow, once: boolean): string {
  const nature = once && o.nature === OUVERT ? undefined : o.nature;
  const small = [o.employeur, "metier" in o ? o.metier : "domaine" in o ? o.domaine : undefined, nature].filter(Boolean).map((x) => esc(x!)).join(" · ");
  // Several offers: the title alone, then, across the whole line, a link to each, its reference never cut, its day said
  // when the line has none.
  const refs = "references" in o
    ? `<span class="refs"><small>${o.nombre_offres} offres\u00a0:</small>` +
      o.references.map((r) => `<a href="${esc(r.lien)}" rel="noopener">Réf. <span class="nw">${esc(r.reference)}</span>${o.date_limite || o.publiee_le ? "" : `, publiée\u00a0le\u00a0${r.publiee_le}`}</a>`).join("") + "</span>"
    : "";
  const title = "references" in o ? `<b>${esc(o.intitule)}</b>` : `<a href="${esc(o.lien)}" rel="noopener">${esc(o.intitule)}</a>`;
  return `<li data-c="${esc("commune" in o && o.commune ? o.commune : "")}"${"references" in o ? ` data-n="${o.nombre_offres}"` : ""}><span>${title}<small>${small}</small></span>` +
    `<span class="q-none${"references" in o && !o.date_limite && !o.publiee_le ? " du" : ""}">${esc(quand(o))}</span>${refs}</li>`;
}

/**
 * The offers by commune, the one with the most first and those without a commune last, each folded under its name and
 * its number of offers: 476 offers in one list made a page of 105 000 px on a phone. The filter opens the groups it finds
 * (SCRIPT); a search in the page or a link opens one by itself.
 */
function groups(rows: OffreRow[], once: boolean): string {
  const by = new Map<string, OffreRow[]>();
  for (const o of rows) {
    const c = "commune" in o && o.commune ? o.commune : "";
    by.set(c, [...(by.get(c) ?? []), o]);
  }
  const count = (l: OffreRow[]) => l.reduce((n, o) => n + ("references" in o ? o.nombre_offres : 1), 0);
  return [...by]
    .sort(([a, x], [b, y]) => +!a - +!b || count(y) - count(x) || a.localeCompare(b, "fr"))
    .map(([c, l]) => {
      const n = count(l);
      return `<div class="card groupe">${folded(true, `<h3>${esc(c || "Commune non précisée")}\u00a0<span class="note">·\u00a0${n}\u00a0offre${n > 1 ? "s" : ""}</span></h3>`,
        `<ul class="rows eau">${l.map((o) => row(o, once)).join("")}</ul>`)}</div>`;
    }).join("");
}

/** « Se former avec le CPF »: the themes by name, each with its count; nothing without a copy. */
function cpfSection(c: EmploiAnswer["cpf"], now: Date): string {
  if (!c) return "";
  return `<section id="cpf" aria-labelledby="h-cpf">
  <div class="sec-h"><p class="eyebrow">Mon Compte Formation</p><h2 id="h-cpf">Se former avec le CPF</h2><p>${esc(`${nombre(c.nombre)} formations éligibles au CPF ont une session ouverte à La Réunion dans le catalogue de Mon Compte Formation, lu ${readAt(new Date(c.lu), now).a}. Par thème, dans l'ordre alphabétique :`)}</p></div>
  <details class="card"><summary>${esc(`Les ${c.themes.length} thèmes`)}</summary><div class="table-wrap"><table class="drought histo passe"><caption class="sr">${esc(`Les ${c.themes.length} thèmes`)}</caption><thead><tr><th scope="col">Thème</th><th scope="col">Formations</th></tr></thead><tbody>${c.themes.map((t) => `<tr><th scope="row">${esc(t.theme)}</th><td>${nombre(t.formations)}</td></tr>`).join("")}</tbody></table></div></details>
  <p>${esc(CPF_A_SAVOIR.replace(` (${CPF_SITE})`, ""))} <a href="${esc(CPF_SITE)}" rel="noopener">Chercher une formation sur moncompteformation.gouv.fr</a>.</p>
  <p class="note">${esc("Caisse des Dépôts et DGEFP, Mon Compte Formation, l'offre de formation, Licence Ouverte.")}</p>
</section>`;
}

const FILTER = `<form id="of" class="card filter" hidden role="search" aria-label="Filtrer les offres">
<label class="q">Chercher <input name="q" type="search" placeholder="infirmier, agent d'entretien, contractuel…" autocomplete="off"></label>
<label>Commune <select name="c"><option value="">toutes</option>COMMUNES</select></label>
<p class="note" id="of-n" aria-live="polite"></p></form>`;

const SCRIPT = `(()=>{const f=document.getElementById("of");if(!f)return;f.hidden=false;
const items=[...document.querySelectorAll("#offres li")];
const norm=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
for(const e of items)e.dataset.q=norm(e.textContent);
const run=()=>{const q=norm(f.q.value).split(" ").filter(Boolean),c=f.c.value;let n=0;
const all=items.reduce((t,e)=>t+(+e.dataset.n||1),0);
for(const e of items){const ok=q.every((t)=>e.dataset.q.includes(t))&&(!c||e.dataset.c===c);e.hidden=!ok;if(ok)n+=+e.dataset.n||1}
const on=q.length>0||!!c;for(const g of document.querySelectorAll("#offres .groupe")){const k=!!g.querySelector("li:not([hidden])");g.hidden=on&&!k;g.firstElementChild.open=on&&k}
document.getElementById("of-n").textContent=q.length||c?n+" offre"+(n>1?"s":"")+" sur "+all+".":"";};
f.addEventListener("input",run);f.addEventListener("submit",(e)=>e.preventDefault());})();`;

/**
 * The home page's tile, from the page's copy: its count of offers, when the feed was read. Never a read of the site:
 * the copy is rebuilt from the one the scheduled event keeps in KV (buildEmploi). In the page's words when it has none.
 */
export function emploiLive(data: Cached<EmploiAnswer> | null): Live | undefined {
  const d = data?.value;
  if (!d || !data) return undefined;
  if (d.prochaine) return { valeur: "", detail: `Les offres ne sont pas encore lues : prochaine lecture prévue à ${hm(d.prochaine)}.`, vide: true };
  const lu = readAt(d.lu ? new Date(d.lu) : data.fetchedAt).a;
  if (!d.nombre) return { valeur: "", detail: `Aucune offre publiée sur Choisir le service public pour La Réunion ${lu}.`, vide: true };
  return { valeur: plural(d.nombre, "offre", "offres"), detail: `${d.nombre > 1 ? "ouvertes" : "ouverte"} à la candidature, Choisir le service public lu ${lu}` };
}

export function emploiPage(origin: string, data: Cached<EmploiAnswer> | null, now = new Date(), alerte?: Alerte): string {
  const d = data?.value;
  // Their nature said once, only when every offer has one: an offer without would seem open to both.
  const once = !!d?.offres.length && d.offres.every((o) => o.nature) && d.offres.some((o) => o.nature === OUVERT);
  const communes = [...new Set((d?.offres ?? []).flatMap((o) => ("commune" in o && o.commune ? [o.commune] : [])))].sort((x, y) => x.localeCompare(y, "fr"));

  const lu = d?.lu ? new Date(d.lu) : data?.fetchedAt ?? now;
  const lecture = readAt(lu, now).a;
  const status = d && data && !d.prochaine
    ? `<p>${plural(d.nombre, "offre ouverte", "offres ouvertes")} à la candidature suivie${d.nombre > 1 ? "s" : ""} par rundata.re sur Choisir le service public, dernière lecture ${lecture}${d.total_site ? `. Le site en affiche ${d.total_site.nombre} pour La Réunion${d.total_site.lu_a === localTime(lu) ? "" : ` (compte lu le ${d.total_site.lu_a.replace(" ", " à ")})`}.` : "\u00a0; le site peut en compter davantage."}</p>`
    : "";
  const list = !d || !data
    ? `<p class="card">Les offres se chargent : rechargez la page dans quelques secondes.</p>`
    : d.prochaine
      ? `<p class="card">Les offres ne sont pas encore lues : prochaine lecture prévue à ${hm(d.prochaine)}.</p>`
      : d.offres.length
      ? `${FILTER.replace("COMMUNES", communes.map((c) => `<option>${esc(c)}</option>`).join(""))}${once ? `<p>Sauf mention, les offres sont ouvertes aux titulaires et aux contractuels.</p>` : ""}<div id="offres" class="plis">${groups(d.offres, once)}</div>`
      : `<p class="card">Aucune offre publiée sur Choisir le service public pour La Réunion ${leAt(d.lu ?? data.fetchedAt)}.</p>`;

  const title = "Emploi public Réunion : offres de l'État, des communes et des hôpitaux · 974";
  const description = "Les offres d'emploi de la fonction publique à La Réunion (974) : État, collectivités, hôpitaux, avec la commune et le lien pour postuler.";

  const band = `${crumbBar(NOM)}
<div class="wrap intro solo"><div class="pitch">
  <h1>Offres d'emploi public à La Réunion <span class="n974">974</span></h1>
  <p class="lead">Les offres de l'État, des collectivités et des hôpitaux publiées sur Choisir le service public, avec le lien pour postuler.</p>
  ${status}
</div></div>`;

  const body = `<section aria-labelledby="h-offres">
  <h2 id="h-offres" class="sr">Les offres</h2>
  ${d?.injoignable ? warnings([d.injoignable]) : ""}
  ${list}
  <p>Les offres des entreprises ne sont pas reprises ici : vous les trouvez sur ${ENTREPRISES.map((e) => `<a href="${esc(e.lien)}" rel="noopener">${esc(e.nom)}</a>`).join(" et sur ")}, le portail emploi et formation de La Réunion.</p>
  <p>${esc(NON_REPRIS)}</p>
</section>
<section aria-labelledby="h-couv">
  <div class="sec-h"><h2 id="h-couv">Ce qui est couvert</h2><p>${d ? esc(d.couverture) : ""}</p></div>
  ${d && data && !d.prochaine ? sourcesNote(d.sources, data) : ""}
</section>
${cpfSection(d?.cpf, now)}
${connectorCta("emploi", "les offres d'emploi public")}
<script>${SCRIPT}</script>`;

  return layout(origin, { title, description, path: PATH, jsonld: [crumbs(origin, NOM, PATH), webPage(origin, PATH, title, description, data)], alerte }, band, body);
}
