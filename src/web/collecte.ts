/**
 * /collecte and /collecte/<commune>: the day each street's bins are collected in the West (vie/collecte.ts), in
 * marketing's words. The streets are grouped by calendar, the rhythm said once per group; a search box shows the
 * line of the streets typed. Built from the bundled calendars and the day: no source is read.
 */
import * as col from "../vie/collecte.js";
import { a, de, nombre } from "../tools/format.js";
import { insecables } from "../typographie.js";
import type { Alerte } from "./data.js";
import { connectorCta, crumbBar, crumbs, webPage } from "./domains.js";
import { esc } from "./map.js";
import { folded, layout } from "./pages.js";

// The texts of the pages, worded by marketing.
export const TITLE = "Collecte des déchets Ouest Réunion : jours par rue · 974";
const H1 = "Quel jour passent les poubelles ?";
const META = `Ordures ménagères, tri, déchets verts : le jour de collecte rue par rue à Saint-Paul, La Possession, Saint-Leu, Le Port et Trois-Bassins (974), calendriers ${col.YEAR} du TCO.`;
const titleOf = (c: string) => `Collecte des déchets ${a(c)} : jours par rue · 974`;
const h1Of = (c: string) => `Quel jour passent les poubelles ${a(c)} ?`;
const COLLECTE = { name: "Collecte des déchets", path: "/collecte" };
const metaOf = (c: string) => `Ordures ménagères, tri et déchets verts ${a(c)} (974) : le jour de collecte de votre rue, d'après le calendrier ${col.YEAR} du TCO. Cherchez votre rue.`;
const LEAD = `Tapez le nom de votre rue : le jour de passage pour les ordures ménagères, le tri et les déchets verts, d'après les calendriers ${col.YEAR} publiés par le TCO.`;
const { honesty, communeSlug } = col;
// With the list just below (marketing), and the tool's first words of `a_savoir` (honesty): only the West is read.
/** « Seulement les 5 communes de l'Ouest (TCO) pour l'instant. », the tool's words: under the field, and after a street not found. */
const OUEST = honesty().split(" Calendriers")[0];
const NOT_FOUND_HERE = `Rue non trouvée dans les calendriers du TCO. Vérifiez l'orthographe, essayez le nom du quartier, ou cherchez dans la liste ci-dessous. ${OUEST}`;
/**
 * The communes of the other intercommunalities, for the search box: typed alone or ending what is typed (« rue de
 * Paris, Saint-Denis »), the same sentence as the tool's (vie/collecte.ts `ailleurs`, marketing's words of 04/11/2026),
 * its last words a link to the site of who collects there, rather than a street to spell again.
 */
const ELSEWHERE = col.AILLEURS.flatMap((e) => e.communes.map((c) => {
  const said = col.ailleurs(c, e);
  const link = `le site de ${e.nom}`;
  const at = said.lastIndexOf(link);
  // Typed by the script, out of typoPage's reach: its no-break spaces put here.
  return { c, avant: insecables(said.slice(0, at)), lien: link, apres: insecables(said.slice(at + link.length)), url: e.site };
}));

/**
 * The commune of ELSEWHERE that ends what is typed, compared without accents, case or punctuation, as the tool does
 * (tools/collecte.ts `elsewhere`). Put in the page's script as it is: self-contained.
 */
export const horsTco = <T extends { c: string }>(typed: string, list: T[]): T | undefined => {
  // No function named inside: the build would wrap it in a helper the page does not have (esbuild's keepNames).
  const t = " " + typed.replace(/\b974\d\d\b/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return list.find((x) => t.endsWith(" " + x.c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
};
export { ELSEWHERE };
export const communeOf = (slug: string) => col.COMMUNES.find((c) => communeSlug(c) === slug);

// Shows the full line of the streets typed (3 letters at least, 20 at most), hides the groups without a match, and
// the communes of /collecte without one; opens those it finds. In a block: the page's own script has names of its own.
const SCRIPT = `{const q=document.getElementById("rue");if(q){const n=(s)=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();const out=document.getElementById("trouve");
const rien=document.getElementById("rien"),dit=rien.textContent,AI=${JSON.stringify(ELSEWHERE).replace(/</g, "\\u003c")},hors=${horsTco};
q.addEventListener("input",()=>{const t=n(q.value.trim());const hits=[];document.querySelectorAll(".voies li").forEach((li)=>{const ok=t.length<3||n(li.textContent).includes(t);li.hidden=!ok;if(ok&&t.length>=3)hits.push(li)});
document.querySelectorAll(".groupe").forEach((g)=>{g.hidden=![...g.querySelectorAll("li")].some((li)=>!li.hidden)});
document.querySelectorAll("details.commune").forEach((d)=>{const k=[...d.querySelectorAll(".groupe")].some((g)=>!g.hidden);d.hidden=!k;if(t.length>=3&&k)d.open=true});
if(t.length>=3)document.querySelectorAll(".groupe>details").forEach((d)=>{if(!d.parentNode.hidden)d.open=true});
document.querySelectorAll(".sans").forEach((s)=>{s.hidden=![...s.querySelectorAll(".groupe")].some((g)=>!g.hidden)});
out.className=hits.length?"card":"";out.replaceChildren(...hits.slice(0,20).map((li)=>{const p=document.createElement("p");const g=li.closest(".groupe");p.textContent=li.textContent+", "+g.dataset.c+" : "+g.dataset.r;return p}));
const o=hits.length?null:hors(q.value,AI);if(o){const l=document.createElement("a");l.href=o.url;l.rel="noopener";l.textContent=o.lien;rien.replaceChildren(o.avant,l,o.apres)}else rien.textContent=dit;
rien.hidden=t.length<3||hits.length>0})}}`;

function groups(today: number, commune?: string): string {
  const streets = commune ? col.STREETS.filter((s) => s.commune === commune) : col.STREETS;
  const byCal = new Map<string, { c: number; cals: number[]; commune: string; noms: string[] }>();
  for (const s of streets) {
    const k = `${s.calendrier}|${s.commune}`;
    const g = byCal.get(k) ?? { c: s.calendrier, cals: [s.calendrier], commune: s.commune, noms: [] };
    g.noms.push(s.nom.replace(/\s*\([^)]*\)$/, ""));
    byCal.set(k, g);
  }
  // Two calendars of a commune with the same days to the end of the year: one group, their streets together, both PDFs
  // (their codes, « 2026_SP2a_07 », tell nothing to whom reads them).
  const groupsOf: { c: number; cals: number[]; commune: string; noms: string[] }[] = [];
  for (const g of byCal.values()) {
    const cal = col.CALENDARS[g.c];
    const same = cal && groupsOf.find((o) => o.commune === g.commune && col.CALENDARS[o.c] && col.sameDays(col.CALENDARS[o.c], cal, today));
    if (same) {
      same.cals.push(g.c);
      same.noms.push(...g.noms);
    } else groupsOf.push(g);
  }
  const list = (g: { noms: string[] }) => `<ul class="voies plain">${[...new Set(g.noms)].sort((x, y) => x.localeCompare(y, "fr")).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
  // Each group folded under its rhythm's first part and its number of streets (marketing). Groups of a commune that
  // share that line get, under it, what tells them apart: the next collection whose rhythm differs, then the one
  // after while two still share it, or the first day that parts calendars said alike. A search opens the groups it
  // finds (SCRIPT).
  const count = (g: { noms: string[] }) => { const n = new Set(g.noms).size; return `${n}\u00a0rue${n > 1 ? "s" : ""}`; };
  const all = groupsOf;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const rhythms = all.filter((g) => col.CALENDARS[g.c]).map((g) => {
    const parts = col.rhythmParts(col.CALENDARS[g.c], today);
    // A calendar with no day left in its year (29-31/12 for some): an empty rhythm, as before, never no part at all.
    return { g, parts: parts.length ? parts.map((p) => p.texte) : [""], byKind: new Map(parts.map((p) => [p.kind, p.texte])), apart: [] as string[] };
  });
  const sharing = () => {
    const by = new Map<string, typeof rhythms>();
    for (const x of rhythms) {
      const k = [x.g.commune, x.parts[0], count(x.g), ...x.apart].join("|");
      by.set(k, [...(by.get(k) ?? []), x]);
    }
    return [...by.values()].filter((xs) => xs.length > 1);
  };
  for (const kind of ["CS", "DV", "EN"] as const) {
    for (const xs of sharing()) if (new Set(xs.map((x) => x.byKind.get(kind))).size > 1) for (const x of xs) x.apart.push(x.byKind.get(kind) ?? "");
  }
  for (const xs of sharing()) {
    for (const x of xs) x.apart.push(col.firstApart(col.CALENDARS[x.g.c], xs.filter((o) => o !== x).map((o) => col.CALENDARS[o.g.c]), today) ?? "");
  }
  // On a line of its own under the heading, inside it: the heading is inline on a commune's page.
  const apart = (x: (typeof rhythms)[number]) => {
    const said = x.apart.filter(Boolean).join(", ");
    return said ? `<br><span class="note">${esc(said)}</span>` : "";
  };
  // The calendars' PDFs: in a row up to three; past that (12 of them at Saint-Paul on 28/12, calendars that differ
  // no more by the year's last days), folded under their number.
  const pdfs = (g: { cals: number[]; commune: string }) => {
    const where = commune ? "" : `${esc(g.commune)} · `;
    const links = g.cals.map((c) => `<a href="${esc(col.CALENDARS[c].pdf)}" rel="noopener">calendrier ${esc(col.CALENDARS[c].code)} du TCO (PDF)</a>`).join(" · ");
    return g.cals.length > 3
      ? `<details class="note"><summary>${where}${g.cals.length}\u00a0calendriers du TCO (PDF)</summary><p>${links}</p></details>`
      : `<p class="note">${where}${links}</p>`;
  };
  const dated = rhythms
    .map((x) => {
      const { g } = x;
      const hx = commune ? "h3" : "h4";
      const cal = col.CALENDARS[g.c];
      const r = x.parts.join("\u00a0; ");
      const feries = col.holidays(cal, today).map((h) => (h.reportee ? esc(col.holidayLine(h)) : `Jour férié : vérifiez <a href="${esc(cal.pdf)}" rel="noopener">le calendrier du TCO (PDF) →</a>`));
      return `<div class="card groupe" data-c="${esc(g.commune)}" data-r="${esc(`${r}.`)}">${folded(true,
        `<${hx}>${esc(cap(x.parts[0]))}\u00a0<span class="note">· ${commune ? "" : `${esc(g.commune).replace(/^(Le|La|Les) /, "$1\u00a0")}, `}${count(g)}</span>${apart(x)}</${hx}>`,
        `<p>${esc(cap(r))}.</p>${feries.map((f) => `<p>${f}</p>`).join("")}
${list(g)}
${pdfs(g)}`)}</div>`;
    });
  // The streets without a calendar, after the others: the plural above their list, the singular in a street's line.
  const without = all.filter((g) => !col.CALENDARS[g.c]);
  const said = esc(col.NO_CALENDAR_LIST.slice(0, col.NO_CALENDAR_LIST.lastIndexOf("Renseignez")));
  const nc = without.length
    ? `<div class="sans"><h3>Voies sans calendrier du TCO</h3><p>${said}<a href="${col.TCO_CONTACT}" rel="noopener">Renseignez-vous auprès du TCO →</a></p>
${without.map((g) => `<div class="card groupe" data-c="${esc(g.commune)}" data-r="${esc(col.NO_CALENDAR)}">${commune ? list(g) : folded(true, `<h3>${esc(g.commune)}\u00a0<span class="note">· ${count(g)}</span></h3>`, list(g))}</div>`).join("\n")}</div>`
    : "";
  // On /collecte, the calendars by commune, each folded under its name, its number of calendars and of streets: the
  // 130 calendars' lines made 16 000 px on a phone. The search opens the ones it finds (SCRIPT).
  const byCommune = commune ? dated : [...new Set(rhythms.map((x) => x.g.commune))].map((c) => {
    const mine = rhythms.flatMap((x, i) => (x.g.commune === c ? [i] : []));
    const rues = new Set(mine.flatMap((i) => rhythms[i].g.noms)).size;
    return `<details class="pli commune"><summary><h3>${esc(c)} <small>· ${mine.length}\u00a0calendrier${mine.length > 1 ? "s" : ""}, ${nombre(rues)}\u00a0rue${rues > 1 ? "s" : ""}</small></h3></summary>
${mine.map((i) => dated[i]).join("\n")}</details>`;
  });
  return [commune ? byCommune.join("\n") : `<div class="plis">\n${byCommune.join("\n")}\n</div>`, nc].join("\n");
}

export function collectePage(origin: string, now: Date, commune?: string, alerte?: Alerte): string {
  const path = commune ? `/collecte/${communeSlug(commune)}` : "/collecte";
  const title = commune ? titleOf(commune) : TITLE;
  const description = commune ? metaOf(commune) : META;
  const today = col.todayOf(now);
  const others = col.COMMUNES.filter((c) => c !== commune).map((c) => `<a href="/collecte/${communeSlug(c)}">${esc(c)}</a>`).join(" · ");
  const band = `${crumbBar(commune ? `Collecte ${a(commune)}` : "Collecte des déchets", commune ? COLLECTE : undefined)}
<div class="wrap intro"><div class="pitch">
  <p class="pill">Calendriers du TCO · ${col.YEAR}</p>
  <h1>${esc(commune ? h1Of(commune) : H1)}</h1>
  <p class="lead">${esc(LEAD)}</p>
  <label class="search">Votre rue <input id="rue" type="search" placeholder="Rue, chemin, impasse…" autocomplete="off" aria-describedby="ouest"></label>
  <p class="note" id="ouest">${esc(OUEST)}</p>
</div></div>`;
  const body = `<section aria-label="Votre rue"><div id="trouve" aria-live="polite"></div><p id="rien" hidden>${esc(NOT_FOUND_HERE)}</p></section>
<section aria-labelledby="h-voies">
  <div class="sec-h"><h2 id="h-voies">${commune ? `Les rues ${esc(de(commune))}` : "Toutes les rues de l'Ouest"}</h2>
  <p class="note">${esc(honesty())}</p></div>
  ${col.pastYear(today) ? `<p class="card">${esc(col.notYet())}</p>` : `${col.nearYearEnd(today) ? `<p class="card">${esc(col.notYet())}</p>` : ""}${groups(today, commune)}`}
</section>
<section><p>${commune ? `Les autres communes : ${others}` : `Par commune : ${others}`}</p>
<p><a href="/decheteries">Les déchèteries de l'Ouest et leurs bennes en direct →</a></p></section>
${connectorCta("annuaire_services_publics", "les jours de collecte")}
<script>${SCRIPT}</script>`;
  return layout(origin, { title, description, path, jsonld: [crumbs(origin, commune ? `Collecte ${a(commune)}` : "Collecte des déchets", path, commune ? COLLECTE : undefined), webPage(origin, path, title, description, null)], alerte }, band, body);
}
