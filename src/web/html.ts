/**
 * Pages written with escaping by default. In `html\`…\``, every value put between `${` and `}` is escaped, so a text
 * read elsewhere (an event's title, a headline, a stop's name) can never open a tag or leave an attribute: only the
 * result of another `html\`…\`` and a `brut(…)` written on purpose go in as they are. With `esc()` called by hand
 * (map.ts), a `${titre}` without it reads like one with it in a review, and a forgotten one is an injection.
 *
 * Values: a text or a number is turned into a string and escaped; `null`, `undefined` and `false` give nothing, so that
 * `${cond && html\`…\`}` and `${x ?? ""}` read as usual; an array gives its items one after another, each by the same
 * rule. Anything else (an object, a function, `true`) is refused: it would print « [object Object] » or « true ».
 *
 * A link's address goes through `href()`, which refuses `javascript:` and every scheme not listed in SCHEMES.
 */

/** HTML already safe: written by `html\`…\`` or marked by `brut`. Its text goes in as it is. */
export class Html {
  constructor(readonly texte: string) {}
  toString(): string {
    return this.texte;
  }
}

export type Valeur = Html | string | number | null | undefined | false | readonly Valeur[];

const ENTITES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** The text `s` written so that it shows as such between tags and inside an attribute in quotes (as map.ts `esc`). */
export const echappe = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITES[c]);

function rendu(v: Valeur): string {
  if (v instanceof Html) return v.texte;
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map(rendu).join("");
  if (typeof v === "string") return echappe(v);
  if (typeof v === "number") return echappe(String(v));
  throw new TypeError(`html : valeur refusée (${typeof v === "object" ? "objet" : String(v)}) ; un texte, un nombre, un Html ou rien`);
}

/** A piece of page whose every interpolated value is escaped, except an `Html`. */
export function html(parts: TemplateStringsArray, ...valeurs: Valeur[]): Html {
  let out = parts[0];
  for (let i = 0; i < valeurs.length; i++) out += rendu(valeurs[i]) + parts[i + 1];
  return new Html(out);
}

/** `texte` put in the page as it is: only for HTML the code writes itself, never for a text read elsewhere. */
export const brut = (texte: string): Html => new Html(texte);

/** The schemes a link of the site may use; an address without a scheme (« /bus », « #mer », « ?jour= ») is the site's. */
const SCHEMES = new Set(["http", "https", "mailto", "tel", "geo", "sms"]);

/**
 * The address `url` for an `href` or a `src`, escaped; `#` instead of an address whose scheme is not listed (so
 * `javascript:`, `data:`, `vbscript:`). The browser drops tabs and line breaks inside an address and spaces and control
 * characters before it, so `java\tscript:` and ` javascript:` are read as they would be, before the scheme is looked at.
 */
export function href(url: string): Html {
  const lu = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(lu)?.[1].toLowerCase();
  if (scheme !== undefined && !SCHEMES.has(scheme)) return new Html("#");
  return new Html(echappe(url));
}
