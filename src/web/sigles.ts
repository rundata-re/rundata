/**
 * The acronyms of the site, spelled out at their first occurrence on each page (marketing, UX review of 04/11/2026): a
 * resident does not know that the TCO is the West's community of communes, nor what the CMRS is. The same list makes
 * the « Sigles » section of /a-propos. RECIL is not here: the ARS names it without spelling it out, so the text says
 * what it is instead (« RECIL, le distributeur d'eau de Cilaos »).
 */
import { esc } from "./map.js";

export const SIGLES: Readonly<Record<string, string>> = {
  ADEME: "Agence de la transition écologique",
  ARS: "Agence régionale de santé",
  CIVIS: "Communauté intercommunale des villes solidaires",
  CMRS: "Centre météorologique régional spécialisé (Météo-France La Réunion)",
  CRGT: "Centre régional de gestion du trafic",
  DAE: "défibrillateur automatisé externe",
  DEAL: "Direction de l'environnement, de l'aménagement et du logement",
  GNR: "gazole non routier",
  LCSQA: "Laboratoire central de surveillance de la qualité de l'air",
  ORSEC: "Organisation de la réponse de sécurité civile",
  TCO: "Territoire de la Côte Ouest",
  ULIS: "unité localisée pour l'inclusion scolaire",
};

// Inside these, no text is read: code, drawings, form fields, and an acronym already spelled out.
const SKIP = ["script", "style", "svg", "textarea", "code", "pre", "abbr", "title", "select", "option"];
const WORD = /[\p{L}\p{N}]/u;
// A name that holds an acronym is not the acronym: « Géo'DAE », the national base of defibrillators.
const NAMES = ["Géo'", "Géo&#39;", "Géo’"];

/**
 * The stretches of a part where no text is read (SKIP's elements and comments), merged and in order: found once per
 * part with the string's own search, so that checking an occurrence costs a binary search, not a walk back.
 */
function skipped(html: string): [number, number][] {
  const spans: [number, number][] = [];
  for (let o = html.indexOf("<!--"); o >= 0; o = html.indexOf("<!--", o + 4)) {
    const c = html.indexOf("-->", o + 4);
    spans.push([o, c < 0 ? html.length : c + 3]);
    if (c < 0) break;
  }
  for (const name of SKIP) {
    for (let o = html.indexOf(`<${name}`); o >= 0; o = html.indexOf(`<${name}`, o + 1)) {
      const next = html[o + name.length + 1];
      if (next !== ">" && next !== " " && next !== "\n" && next !== "/") continue;
      const c = html.indexOf(`</${name}`, o);
      spans.push([o, c < 0 ? html.length : c]);
      if (c < 0) break;
      o = c;
    }
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/** Whether `k` falls in one of the merged stretches. */
function covered(spans: [number, number][], k: number): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid][1] <= k) lo = mid + 1;
    else if (spans[mid][0] > k) hi = mid - 1;
    else return true;
  }
  return false;
}

/** Whether the occurrence of `word` at `k` is the acronym in the page's text. */
function inText(html: string, k: number, word: string, spans: [number, number][]): boolean {
  const before = k > 0 ? html[k - 1] : "";
  const after = html[k + word.length] ?? "";
  if (WORD.test(before) || WORD.test(after)) return false;
  if (NAMES.some((n) => html.slice(Math.max(0, k - n.length), k) === n)) return false;
  // In a tag: its name or an attribute.
  if (html.lastIndexOf("<", k) > html.lastIndexOf(">", k)) return false;
  return !covered(spans, k);
}

/**
 * The parts of a page in reading order, with the first occurrence of each acronym in their text spelled out in an
 * `<abbr>`: never in a tag's attributes, a comment, a script, a drawing or a form field. Each acronym is looked for
 * with the string's own search and only its occurrences are checked: a long page costs a few tenths of a millisecond.
 */
export function withSigles(parts: string[]): string[] {
  const seen = new Set<string>();
  return parts.map((html) => {
    const found: [number, string][] = [];
    let spans: [number, number][] | undefined;
    for (const sigle of Object.keys(SIGLES)) {
      if (seen.has(sigle)) continue;
      for (let k = html.indexOf(sigle); k >= 0; k = html.indexOf(sigle, k + 1)) {
        if (!inText(html, k, sigle, (spans ??= skipped(html)))) continue;
        found.push([k, sigle]);
        seen.add(sigle);
        break;
      }
    }
    let out = html;
    for (const [k, sigle] of found.sort((x, y) => y[0] - x[0])) {
      out = `${out.slice(0, k)}<abbr title="${esc(SIGLES[sigle])}">${sigle}</abbr>${out.slice(k + sigle.length)}`;
    }
    return out;
  });
}
