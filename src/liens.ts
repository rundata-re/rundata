/**
 * The sites never linked to, from a page or a tool's answer, not even by their home page: none since 20/11/2026, when
 * Saint-Benoît's site, the last one here, became read as the commune's public information (autorisations.ts
 * « publique »), each fact with its page's link. Kept for a site that would ask in writing not to be linked.
 */
const SANS_LIEN: string[] = [];

/** Whether `url` leads to a site of SANS_LIEN, whatever its page: never given as a link. Nothing else is. */
export function sansLien(url: string | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  return SANS_LIEN.some((h) => host === h || host.endsWith(`.${h}`));
}
