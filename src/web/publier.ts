/**
 * /publier: the guide « Publier son agenda et ses données » for the mairies, associations and organisers, written by
 * marketing (web/publier-texte.ts). Each format says whether rundata.re reads it, from the code: a label turns to
 * « Déjà lu » only once its reader is merged. Nothing is read to build it.
 */
import type { Alerte } from "./data.js";
import { crumbBar, crumbs, nomsCoupables, webPage } from "./domains.js";
import { esc } from "./map.js";
import { layout } from "./pages.js";
import brand from "./brand.json" with { type: "json" };
import { enLigne } from "./associations-drapeau.js";
import { lienForm, TURNSTILE_SCRIPT } from "./propositions.js";
import { GUIDE, INTRO, KREOL, REFERENCER_FORMULAIRE } from "./publier-texte.js";

export const PATH = "/publier";
export const TITLE = "Publier agenda et données en open data · guide gratuit";
export const META = "Mairies, associations, organisateurs\u00a0: publiez votre agenda en flux ouvert, gratuitement, avec nos tutos pas à pas. Google, assistants IA, rundata.re.";
const H1 = "Publiez votre agenda et vos données\u00a0: le guide";
export const MAILTO = "mailto:contact@rundata.re?subject=Flux%20%C3%A0%20r%C3%A9f%C3%A9rencer";

/** The CSV template the guide's tutorial 6 links to, served at /publier/modele-agenda.csv. */
export const MODELE_CSV = `titre,date_debut,heure_debut,date_fin,heure_fin,lieu,adresse,commune,description,prix,lien,organisateur,contact_public
EXEMPLE à supprimer : Marché nocturne,2026-11-14,18:00,2026-11-14,23:00,Front de mer,Boulevard Hubert-Delisle,Saint-Pierre,"Producteurs locaux, artisans et musique.",gratuit,https://example.org/marche-nocturne,Association Exemple,contact@example.org
`;

/** What rundata.re does with each kind of feed: `ics` is the iCalendar reader (providers/agenda.ts, ics()). */
export const ETATS: Record<string, "lu" | "bientot" | "demande"> = { lu: "lu", ics: "lu", demande: "demande" };
const LABEL = {
  // After « rundata.re : » in the tutorials, as in the table: the name is not said twice.
  lu: ["Déjà lu", "Déjà lu"],
  bientot: ["Bientôt lu", "Bientôt lu"],
  demande: ["Sur demande", "Sur demande : écrivez-nous"],
} as const;

function etat(kind: string, short: boolean): string {
  const e = ETATS[kind];
  if (!e) throw new Error(`état inconnu : ${kind}`);
  const text = LABEL[e][short ? 0 : 1];
  return e === "demande" && !short ? `<a class="etat demande" href="${MAILTO}">${text}</a>` : `<span class="etat ${e}">${text}</span>`;
}

/** The tutorials of the table, by their number: their anchors. */
const TUTOS: Record<string, string> = {};

/** **gras**, *italique*, `code`, [lien](adresse), and the labels, on text already escaped. */
function inline(md: string): string {
  return esc(md)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, href: string) => `<a href="${href}">${t}</a>`)
    .replace(/\{\{(etat|court):([a-z]+)\}\}/g, (_, how: string, kind: string) => etat(kind, how === "court"));
}

/** The sections folded whole under their title and their number of words: the glossary, 4 000 px on a phone. */
const FOLDED = new Set(["glossaire"]);

const heading = (line: string) => /^(#{2,3}) (.+?)(?: \[#([a-z0-9-]+)\])?$/.exec(line);

/**
 * The guide's Markdown, as the page shows it: sections and tutorials with their anchors, lists, the table, the code.
 * Each tutorial (###) folded under its title, which holds its anchor: the three levels made 17 000 px on a phone. A link
 * of the table opens its tutorial (UNFOLD_SCRIPT, in every page), a search in the page too.
 */
export function render(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  // A tutorial's number (« 4 · WordPress… ») gives its anchor to the table above.
  for (const l of lines) {
    const h = heading(l);
    const n = h && /^(\d) · /.exec(h[2]);
    if (h?.[3] && n) TUTOS[n[1]] = h[3];
  }
  let open = false;
  // The last heading shown, the name of a table under it for a screen reader.
  let titre = "";
  // A tutorial or a section folded, closed before the next heading.
  let folding = false;
  // A run of folded tutorials, in one list (.plis) up to the next section.
  let run = false;
  const unfold = () => {
    if (folding) out.push("</details>");
    folding = false;
  };
  const close = () => {
    unfold();
    if (run) out.push("</div>");
    run = false;
    if (open) out.push("</section>");
    open = false;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = heading(line);
    if (h) {
      titre = h[2];
      if (h[1] === "##") {
        close();
        out.push(`<section${h[3] ? ` id="${h[3]}"` : ""} class="guide">`);
        if (h[3] && FOLDED.has(h[3])) {
          // Its words: the items of its list, up to the next section.
          let n = 0;
          for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) if (/^- /.test(lines[j])) n++;
          out.push(`<details class="pli"><summary><h2>${inline(h[2])} <small>· ${n}\u00a0mots</small></h2></summary>`);
          folding = true;
        } else out.push(`<h2>${inline(h[2])}</h2>`);
        open = true;
      } else {
        unfold();
        if (!run) out.push(`<div class="plis">`);
        run = true;
        out.push(`<details class="pli"><summary><h3${h[3] ? ` id="${h[3]}"` : ""}>${nomsCoupables(inline(h[2]))}</h3></summary>`);
        folding = true;
      }
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) {
        if (/^\|[-| ]+\|$/.test(lines[i])) continue;
        rows.push(lines[i].slice(1, -1).split("|").map((c) => c.trim()));
      }
      const [head, ...body] = rows;
      const cell = (c: string, k: number) => {
        const n = k === 0 && /^(\d) · /.exec(c);
        return n && TUTOS[n[1]] ? `<a href="#${TUTOS[n[1]]}">${inline(c)}</a>` : inline(c);
      };
      out.push(`<div class="table-wrap"><table class="drought niveaux">${titre ? `<caption class="sr">${inline(titre)}</caption>` : ""}<thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
        // Each cell names its column: on a phone, a row reads as a card (« Coût : gratuit »).
        .map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th scope="row">${cell(c, k)}</th>` : `<td data-label="${esc(head[k])}">${cell(c, k)}</td>`)).join("")}</tr>`)
        .join("")}</tbody></table></div>`);
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) quote.push(lines[i].replace(/^> ?/, ""));
      out.push(`<div class="card callout">${render(quote.join("\n")).replace(/<\/?section[^>]*>/g, "")}</div>`);
      continue;
    }
    const item = /^(\s*)(-|\d+\.) (.*)$/.exec(line);
    if (item) {
      out.push(list(lines, i, (next) => (i = next)));
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !heading(lines[i]) && !/^(\s*)(-|\d+\.) |^[|>`]/.test(lines[i]); i++) {
      para.push(lines[i].trim());
      // A line all in bold is a paragraph of its own (« **Votre flux est en ligne ? Dites-le-nous.** »).
      if (/^\*\*[^*]+\*\*$/.test(lines[i].trim())) { i++; break; }
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  close();
  return out.join("\n");
}

/** A list from line `start`, its items at the first one's indent, a deeper item opening a list inside. */
function list(lines: string[], start: number, done: (next: number) => void): string {
  const first = /^(\s*)(-|\d+\.) /.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = first[2] !== "-";
  const from = ordered ? Number.parseInt(first[2], 10) : 1;
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const m = /^(\s*)(-|\d+\.) (.*)$/.exec(lines[i]);
    if (!m || m[1].length < indent) break;
    if (m[1].length > indent) {
      const inner = list(lines, i, (next) => (i = next));
      items[items.length - 1] += inner;
      continue;
    }
    if ((m[2] === "-") === ordered) break;
    items.push(inline(m[3]));
    i++;
  }
  done(i);
  const tag = ordered ? "ol" : "ul";
  return `<${tag}${ordered && from !== 1 ? ` start="${from}"` : ""}>${items.map((x) => `<li>${x}</li>`).join("")}</${tag}>`;
}

export function publierPage(origin: string, alerte?: Alerte): string {
  const band = `${crumbBar("Publier ses données")}
<div class="wrap intro solo"><div class="pitch">
  <p class="pill">Guide gratuit</p>
  <h1>${esc(H1)}</h1>
  <p class="slogan" lang="${brand.slogan_lang}">${esc(KREOL)}</p>
  <p class="lead">${inline(INTRO[0])}</p>
  <p>${inline(INTRO[1])}</p>
</div></div>`;
  // Once the clubs' space is out: its box first, and « Référencer votre flux » with the form, the e-mail second.
  const open = enLigne();
  const guide = open ? GUIDE.replace(/^> \*\*Votre flux est en ligne[\s\S]*?remplacera bientôt cet e-mail\.$/m, REFERENCER_FORMULAIRE) : GUIDE;
  if (open && guide === GUIDE) throw new Error("publier : « Référencer votre flux » introuvable");
  // The address to write to opens the mail, with its subject.
  let body = render(guide).replaceAll("<strong>contact@rundata.re</strong>", `<a href="${MAILTO}"><strong>contact@rundata.re</strong></a>`);
  if (open) {
    body = `<aside class="card callout"><p>Petit club, peu de temps\u00a0? Commencez par l'<a href="/associations">Espace clubs et associations</a>\u00a0: quelques clics suffisent.</p></aside>\n${body.replace(`<section id="exemples" class="guide">`, `${lienForm(PATH)}\n<section id="exemples" class="guide">`)}${TURNSTILE_SCRIPT}`;
  }
  return layout(origin, { title: TITLE, description: META, path: PATH, jsonld: [crumbs(origin, "Publier ses données", PATH), webPage(origin, PATH, TITLE, META, null)], alerte }, band, body);
}
