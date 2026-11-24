/**
 * The inline scripts of the pages, each declared by the code that writes it: `script(texte)` gives the tag and notes the
 * text. The page's Content-Security-Policy allows only the declared ones (securite.ts, `enTetes`), so that a `<script>`
 * arriving inside a text read elsewhere (a title, a notice) whose `esc` was forgotten is blocked by the browser, never
 * run. Their texts are the code's: constants, or a few options written as literals (`inScript`), so the list stays short.
 */

const declares = new Set<string>();
/** Far above the scripts of the code: past it, a new script is not declared (so blocked) and said once in the log. */
const MAX = 1000;
let plein = false;

/** The tag of an inline script whose text is `texte`, declared to the page's policy. */
export function script(texte: string, type?: "module"): string {
  if (/<\/script/i.test(texte)) throw new Error("Un script en ligne ne peut pas contenir « </script ».");
  if (declares.size < MAX) declares.add(texte);
  else if (!declares.has(texte) && !plein) {
    plein = true;
    console.warn(`csp : plus de ${MAX} scripts en ligne déclarés, les suivants seront bloqués`);
  }
  return `<script${type ? ` type="${type}"` : ""}>${texte}</script>`;
}

/** Whether `texte` was written by `script`. */
export function estDeclare(texte: string): boolean {
  return declares.has(texte);
}
