/**
 * Files that are not pages kept out of search results (X-Robots-Tag: noindex): the bulletins in PDF, the GPX of the
 * trails, the JSON the pages read, a CSV model. Search engines crawled them as pages, one more each day for the
 * vigilance's bulletin, kept a year. What a reader may look for stays indexable: the pages, the feeds and calendars,
 * the sitemap, robots.txt and llms.txt, and the pictures.
 */
const INDEXABLES = ["text/html", "application/rss+xml", "application/atom+xml", "text/calendar", "application/xml", "text/xml", "text/plain", "image/"];

/** True when a response of this type should not be indexed. A response without a type is left alone. */
export function nonIndexable(type: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return !INDEXABLES.some((x) => t.startsWith(x));
}

/** The response, with X-Robots-Tag: noindex when its type is not one a reader looks for and it says nothing itself. */
export function sansIndex(res: Response): Response {
  if (res.headers.has("x-robots-tag") || !nonIndexable(res.headers.get("content-type"))) return res;
  try {
    res.headers.set("x-robots-tag", "noindex");
    return res;
  } catch {
    // Headers of a fetched response are read-only: a copy of it, its body not read.
    const copie = new Response(res.body, res);
    copie.headers.set("x-robots-tag", "noindex");
    return copie;
  }
}
