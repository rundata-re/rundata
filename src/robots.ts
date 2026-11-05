/**
 * What robots.txt forbids every robot (`User-agent: *`, web/site.ts writes it from INTERDITS), and the robots that
 * name themselves but read those addresses anyway: they are answered 403 before anything is read or built.
 *
 * On 30/10/2026, meta-externalagent asked 12 285 pages in 2 hours, 9 493 of them trips (/bus/trajet/…, the same one
 * 4 times in 6 s), for 22 529 subrequests, though robots.txt forbids the trips to every robot since #356 and Meta had
 * read it that day. A link preview (facebookexternalhit) or a search engine is never refused here.
 *
 * A browser is refused those addresses only from a hosting network (HEBERGEURS) and from outside the site: on 04/11/2026,
 * a Chrome from Alibaba's cloud in Singapore (AS45102) asked 8 613 trips, none with a referer, counted as people. A
 * person behind a VPN of such a network still opens every other page, and a trip from a page of the site.
 */
import { HEBERGEURS, visitor } from "./metrics.js";
import { RENDU_PATH } from "./providers/vigilance-carte.js";
import { TRIP_PATH } from "./tools/transports.js";
import { STOP_PATH } from "./web/domains.js";

/** Forbidden to every robot, as robots.txt's Disallow lines write them: the start of the path and its query. */
export const INTERDITS = [`${STOP_PATH}?q=`, `${TRIP_PATH}/`, RENDU_PATH];

/** Robots that name themselves in their User-Agent and are refused what robots.txt forbids them. */
export const ROBOTS_NOMMES = ["meta-externalagent", "GPTBot", "ClaudeBot", "Bytespider", "CCBot", "Amazonbot", "PerplexityBot"];

/** Whether robots.txt forbids `url` to every robot: its path and query start with one of INTERDITS. */
export const interdit = (url: URL) => INTERDITS.some((p) => (url.pathname + url.search).startsWith(p));

/** The robot of ROBOTS_NOMMES a User-Agent names, whatever its case. */
export const robotNomme = (ua: string) => ROBOTS_NOMMES.find((n) => ua.toLowerCase().includes(n.toLowerCase()));

/** The ASN of `request` (request.cf.asn), undefined outside Cloudflare. */
function asnOf(request: Request): number | undefined {
  const asn = (request as { cf?: { asn?: unknown } }).cf?.asn;
  return typeof asn === "number" ? asn : undefined;
}

/** Whether the referer is a page of the site itself. */
function fromSite(request: Request, url: URL): boolean {
  try {
    return new URL(request.headers.get("referer") ?? "").host === url.host;
  } catch {
    return false;
  }
}

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/**
 * A 403 on an address robots.txt forbids every robot, for a named robot, or for a browser from a hosting network that
 * does not come from a page of the site; with a log line to count them (the robot or the network, and the path:
 * no address). Undefined otherwise.
 */
export function refusRobot(request: Request): Response | undefined {
  const ua = request.headers.get("user-agent") ?? "";
  const url = new URL(request.url);
  const nom = robotNomme(ua);
  if (nom) {
    if (!interdit(url)) return undefined;
    console.log(`robot refusé : ${nom} (${url.pathname})`);
    return new Response(`Interdit par ${url.origin}/robots.txt\n`, { status: 403, headers: TEXT_HEADERS });
  }
  const asn = asnOf(request);
  if (asn === undefined || !HEBERGEURS.includes(asn) || visitor(ua, asn) !== "navigateur" || !interdit(url) || fromSite(request, url)) return undefined;
  console.log(`navigateur d'hébergeur refusé : AS${asn} (${url.pathname})`);
  const section = `${url.origin}/${url.pathname.startsWith(RENDU_PATH) ? "vigilance" : "bus"}`;
  return new Response(
    `Cette page n'est pas servie au réseau d'un hébergeur (AS${asn})\u00a0: robots.txt l'interdit aux robots, et certains se présentent comme des navigateurs. ` +
      `Si vous passez par un VPN, coupez-le, ou ouvrez-la depuis ${section}. Les autres pages de rundata.re restent ouvertes.\n`,
    { status: 403, headers: TEXT_HEADERS },
  );
}
