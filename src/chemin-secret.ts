/**
 * The paths that carry a secret, e-mailed to a club: whoever holds one acts for the club. Nothing the Worker writes
 * down keeps the secret: its log lines, Analytics Engine's points and the signals of the pages see « …/* » in its place.
 *
 * - a proposal's page (web/propositions.ts, PROPOSITION_PATH);
 * - the link confirming or removing a platform's connection (web/connecteurs.ts, CONNEXION_PATH);
 * - the link that opens a club's space, and the space itself (web/club.ts): every path under /associations/club/ but
 *   the request of a link, /associations/club/demande;
 * - the private page of an internal trial, sent to a researcher (web/uv-moufia.ts, UV_PATH);
 * - a video handed to Threads for a day (web/partage-video.ts, VIDEO_PATH).
 */
const SECRETS = ["/associations/proposition/", "/associations/connexion/", "/associations/club/acces/", "/essais/uv-moufia/", "/partage/video/"];
const CLUB = "/associations/club/";
const CLUB_PUBLICS = new Set(["demande"]);

/** `path` with the secret after one of these paths replaced by « * »; any other path as it is. */
export function cheminMasque(path: string): string {
  const secret = SECRETS.find((s) => path.startsWith(s) && path.length > s.length);
  if (secret) return `${secret}*`;
  if (path.startsWith(CLUB) && path.length > CLUB.length && !CLUB_PUBLICS.has(path.slice(CLUB.length))) return `${CLUB}*`;
  return path;
}
