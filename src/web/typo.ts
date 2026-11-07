/**
 * French typography on the page as sent (typographie.ts, the same rule as the assistants' answers): only the text
 * between the tags. The tags themselves (their attributes, URLs, the metas), the comments and the inside of <script>
 * (the JSON-LD with it), <style>, <pre>, <code> and <textarea> are left as written.
 *
 * One pass, character by character: a regular expression over the whole page took twice as long as the page's render.
 */
import { spaceAt } from "../typographie.js";
import { enTetes } from "./securite.js";

// The elements whose inside is not prose, skipped up to their closing tag.
const RAW = /^<(script|style|pre|code|textarea)\b/;
const LT = 60;
const SPACE = 32;
const R = 114;

// « rundata.re » in the prose of a page, in a span without hyphenation (.ident, pages.ts): under 19.9 rem, where the page
// is hyphenated, Safari cuts it « runda-ta.re ». Not in a link's name, the tab's title, an <option> or an SVG, where a span
// is shown as text or hides it; nor in a path (« rundata.re/<wbr class="adr">associations », cheminsTexte) or a longer
// name (« mcp.rundata.re », « rundata.reunion »).
const SITE = "rundata.re";
const OUVRE = '<span class="ident">';
const GARDE = /^<(\/?)(a|title|option|svg)[\s>]/;
const AVANT = /[\p{L}\p{N}._/@-]/u;
const APRES = /[\p{L}\p{N}_/-]/u;

/** Whether the « rundata.re » at `i` is the site's name alone in a text, not already in its span. */
function nomSeul(html: string, i: number): boolean {
  if (!html.startsWith(SITE, i) || html.startsWith(OUVRE, i - OUVRE.length) || AVANT.test(html.charAt(i - 1))) return false;
  const j = i + SITE.length;
  return !APRES.test(html.charAt(j)) && !(html.charAt(j) === "." && APRES.test(html.charAt(j + 1)));
}

/** Where the tag, comment or raw element that starts at `i` ends (its last « > »); esc() writes no « > » in attributes. */
function skip(html: string, i: number): number {
  const at = (j: number, len: number) => (j < 0 ? html.length : j + len);
  if (html.startsWith("<!--", i)) return at(html.indexOf("-->", i + 4), 2);
  const raw = RAW.exec(html.slice(i, i + 10));
  const close = raw ? html.indexOf(`</${raw[1]}`, i) : i;
  return close < 0 ? html.length : at(html.indexOf(">", close), 0);
}

/**
 * `html` with its no-break spaces; with `nom`, a whole page's, its « rundata.re » in their span too (nomSeul). Never on a
 * text that goes in an attribute (the metas' description, the JSON-LD's).
 */
export function typo(html: string, nom = false): string {
  let out = "";
  let from = 0;
  let garde = 0;
  for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (c === LT) {
      const g = nom ? GARDE.exec(html.slice(i, i + 9)) : null;
      if (g) garde = g[1] ? Math.max(0, garde - 1) : garde + 1;
      i = skip(html, i);
    } else if (c === R && nom && garde === 0 && nomSeul(html, i)) {
      out += html.slice(from, i) + OUVRE + SITE + "</span>";
      from = i + SITE.length;
      i = from - 1;
    } else if (c === SPACE) {
      const kept = spaceAt(html, i);
      if (kept === " ") continue;
      out += html.slice(from, i) + kept;
      from = i + 1;
    }
  }
  return out + html.slice(from);
}

/**
 * A response of the site: its HTML through `typo`, anything else (feeds, files, redirects) as it is. The final HTML is
 * here, so the page's security headers are set here too, its inline scripts hashed (web/securite.ts).
 */
export async function typoPage(r: Response | null): Promise<Response | null> {
  if (!r?.body || !(r.headers.get("content-type") ?? "").startsWith("text/html")) return r;
  const html = typo(await r.text(), true);
  const headers = new Headers(r.headers);
  for (const [k, v] of Object.entries(await enTetes(html))) headers.set(k, v);
  return new Response(html, { status: r.status, statusText: r.statusText, headers });
}
