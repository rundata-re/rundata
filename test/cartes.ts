// The links of the island's maps on a page (src/web/map.ts), for the tests of each page that has one.

/** Each marker or commune of the page's maps that leads somewhere. */
export const mapLinks = (page: string) =>
  [...(page.match(/<svg class="map[^]*?<\/svg>/g) ?? []).join("").matchAll(/<a class="(mk|zn)" href="([^"]+)" aria-label="([^"]+)"/g)]
    .map(([, kind, href, label]) => ({ kind, href, label }));

/** The maps' links within the page whose anchor is missing: a tap there would lead nowhere. */
export function deadAnchors(page: string): string[] {
  const ids = new Set([...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  return mapLinks(page).filter((l) => l.href.startsWith("#") && !ids.has(l.href.slice(1))).map((l) => l.href);
}

/**
 * The headings that skip a level, as « h1→h3 Les réseaux »: a screen reader's list of headings then shows a section
 * under nothing. Each heading against the one before it in the page.
 */
export function sautsDeTitre(page: string): string[] {
  let before = 0;
  return [...page.matchAll(/<h([1-6])[ >]([^<]*)/g)].flatMap(([, n, text]) => {
    const level = Number(n);
    const jump = before > 0 && level > before + 1 ? [`h${before}→h${level} ${text.trim()}`] : [];
    before = level;
    return jump;
  });
}

/** The ids given twice: a link would only ever reach the first. */
export function doubleIds(page: string): string[] {
  const seen = new Set<string>();
  return [...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]).filter((id) => seen.has(id) || !seen.add(id));
}

/** The page's maps, an island's or a commune's (whose `id` comes first). */
const maps = (page: string) => (page.match(/<svg\b[^>]*\bclass="map\b[^]*?<\/svg>/g) ?? []).join("");

/** The links of the page's maps, in the Tab order or not: each point still leads somewhere for the mouse and a finger. */
export const mapPoints = (page: string) => [...maps(page).matchAll(/<a\b[^>]*\bhref="/g)].length;

/**
 * The stops of the Tab key inside the page's maps: each link with an address, field or button that does not say
 * `tabindex="-1"`. Each point that is one costs three stops (the point, its bubble's link, the point again).
 */
export const tabStops = (page: string) =>
  [...maps(page).matchAll(/<(?:a\b[^>]*\bhref="|button\b|input\b|select\b|textarea\b|[a-z]+\b[^>]*\btabindex="0")[^>]*>/g)]
    .filter(([tag]) => !tag.includes('tabindex="-1"')).length;
