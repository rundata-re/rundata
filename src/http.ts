import { AsyncLocalStorage } from "node:async_hooks";
import { count, countRead, isScheduled, perInvocation } from "./budget.js";
import { noteSource } from "./lectures.js";
import { UpstreamError } from "./types.js";

/**
 * A link read from a source, kept only as an absolute http(s) address: `javascript:`, `data:`, `mailto:`, a relative
 * link or « //hote » give no link. With `base`, the page it was read in, a relative link is resolved against it first,
 * and the address it gives must be http(s) all the same. Every link a reader takes from a source passes here: the
 * pages write it in a `href`, and the answers of the tools, the RSS and ICS feeds carry it as it is.
 */
export function httpUrl(raw: string | null | undefined, base?: string): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (base !== undefined) {
    try {
      const u = new URL(s, base);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
    } catch {
      return undefined;
    }
  }
  if (!/^https?:\/\/[^/]/i.test(s)) return undefined;
  try {
    new URL(s);
    return s;
  } catch {
    return undefined;
  }
}

/**
 * The ticket offices that count who sends them buyers, by a « ref » in the address: each host was checked on a real
 * event page on 05/11/2026, which answered 200 with the same page with « ?ref=rundata ». A link to one of them leaves
 * rundata.re with it; any other link, a commune's site included, is left as it is.
 */
export const BILLETTERIES: readonly string[] = ["www.monticket.re", "www.sportpro.re", "my.weezevent.com", "www.billetweb.fr"];

/** A link with « ref=rundata » added when it goes to one of BILLETTERIES in https and carries no « ref » yet. */
export function versBilletterie<T extends string | undefined>(lien: T): T {
  if (!lien) return lien;
  let u: URL;
  try {
    u = new URL(lien);
  } catch {
    return lien;
  }
  if (u.protocol !== "https:" || !BILLETTERIES.includes(u.host) || u.searchParams.has("ref")) return lien;
  u.searchParams.set("ref", "rundata");
  return u.href as T;
}

/**
 * Whether a link found in a third party's page may be followed: in https, to one of `hosts`. A page of that site gone
 * bad (a hacked site, a link planted in it) must never send the Worker to read elsewhere. A link refused is said in the
 * log, by its host only.
 */
export function permis(source: string, lien: string, hosts: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(lien);
  } catch {
    return false;
  }
  if (u.protocol === "https:" && hosts.includes(u.host)) return true;
  console.warn(`${source} : lien hors de ${hosts.join(", ")} ignoré (${u.protocol === "https:" ? u.host : u.protocol})`);
  return false;
}

/**
 * A request's body as text, read up to `max` bytes; undefined past them, the rest left unread. `content-length` is
 * only a first check: a body sent in chunks has none, and is counted as it comes.
 */
export async function bodyText(request: Request, max: number): Promise<string | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return undefined;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * The name rundata.re reads the sites under, with the block of /a-propos that says who reads them and how (#lecteur) (rule of 20/11/2026: a
 * commune's site is read slowly, under an honest name): the agendas, the halls, the news, the prefecture, fuel prices.
 */
export const UA_RUNDATA = "rundata.re (+https://rundata.re/a-propos#lecteur; contact@rundata.re)";
export const USER_AGENT = "reunion-temps-reel/0.2 (open source MCP server, real-time data for Reunion Island)"; // header values must be ASCII

/**
 * The fetches an invocation has in flight at once. The platform opens six connections at a time and queues the next
 * ones, those of KV and D1 included; a fetch's timeout ran from its call, so that a source behind six slow ones was cut
 * while it still waited for its turn (a dozen agendas « trop lente » at the same second, on a cold page of events).
 * Here a fetch first waits for its place, and its timeout starts once it has it, its body read included; one place is
 * left to the stores. Outside a counted invocation (Node, tests) nothing waits.
 */
export const IN_FLIGHT = 5;

class Places {
  private busy = 0;
  private waiting: (() => void)[] = [];
  take(): Promise<void> {
    if (this.busy < IN_FLIGHT) {
      this.busy++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  give() {
    const next = this.waiting.shift();
    if (next) next();
    else this.busy--;
  }
  /** The places taken and the fetches waiting for one, now. */
  now() {
    return { taken: this.busy, waiting: this.waiting.length };
  }
}

// Told when a fetch of the work it runs gets its place (`whenPlaced`).
const placed = new AsyncLocalStorage<() => void>();

/**
 * Runs `work`, calling `held` each time one of its fetches gets its place: tools/agenda.ts counts an agenda's delay
 * from then, in the scheduled event, rather than from its call.
 */
export function whenPlaced<T>(work: () => T, held: () => void): T {
  return placed.run(held, work);
}

// The least delay of the fetches of the work it runs (`patiently`).
const patience = new AsyncLocalStorage<number>();

/**
 * Runs `work`, each of its fetches given at least `ms` (from its place) whatever its own delay: tools/agenda.ts gives
 * the scheduled event's agendas, which nobody waits for, as long as a slow site takes.
 */
export function patiently<T>(ms: number, work: () => T): T {
  return patience.run(ms, work);
}

/**
 * A site that several sources read (a commune's: its water notices, its power cuts, its news) is asked at most once a
 * minute, whichever source asks (rule of 20/11/2026: a commune's site is read slowly). Cilaos's site answered 429 on
 * 20/11/2026; that day five pages had read its water notices within ten seconds, and the scheduled event had read two of
 * its sources in the same second (its power cuts and its news, its water and its news). Each source names
 * the sites it reads (`sharedSite`); a site two sources or more name is spaced: in the scheduled event, a request to it
 * waits until SITE_SPACING_MS after the event's last one to it, its delay counted from then. Elsewhere these sources
 * serve the copies the scheduled event keeps (cache.ts `islandRead`), not the sites.
 */
export const SITE_SPACING_MS = 60_000;
/** The spacing applied, SITE_SPACING_MS: a test that builds the copies of an event sets it to 0 not to wait. */
export const siteSpacing = { ms: SITE_SPACING_MS };

const readers = new Map<string, Set<string>>();
// One site with or without « www. » (www.saintleu.re, saintleu.re).
const siteOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** `source` reads these sites (their host names). */
export function sharedSite(source: string, ...urls: string[]): void {
  for (const url of urls) {
    const host = siteOf(url);
    let set = readers.get(host);
    if (!set) readers.set(host, (set = new Set()));
    set.add(source);
  }
}

/** Whether `url`'s site is read by two sources or more, and so spaced. */
export const spacedSite = (url: string) => (readers.get(siteOf(url))?.size ?? 0) > 1;

// When this invocation asked each site last, or will once its wait is over, ms.
const askedSites = () => perInvocation("http:sites", () => new Map<string, number>());

/** How long ago this invocation asked `url`'s site, ms (negative while a request to it waits its turn), if it did. */
export function siteAskedAgo(url: string): number | undefined {
  const at = askedSites().get(siteOf(url));
  return at == null ? undefined : Date.now() - at;
}

/** The time this request may go, written before any wait: two requests to one site at once take turns. */
function siteTurn(url: string): number {
  const host = siteOf(url);
  const sites = askedSites();
  const last = sites.get(host);
  const at = isScheduled() && last != null && spacedSite(url) ? Math.max(Date.now(), last + siteSpacing.ms) : Date.now();
  sites.set(host, at);
  return at;
}

/** This invocation's fetches holding a place and waiting for one, now (web/mesure.ts). */
export const places = () => perInvocation("http:places", () => new Places()).now();

/** Told of each failed read (worker.ts: the sites that do not answer, sans-reponse.ts); the refused budget is not one. */
let onFailure: ((source: string, url: string, err: UpstreamError) => void) | undefined;
export function whenFailed(f: typeof onFailure) {
  onFailure = f;
}

/** Told of each read as it leaves (worker.ts: the morning's recheck asks a host only once this isolate has left it alone). */
let onRead: ((url: string) => void) | undefined;
export function whenRead(f: typeof onRead) {
  onRead = f;
}

async function get<T>(
  source: string,
  url: string,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
  headers: Record<string, string> = {},
  body?: URLSearchParams | string,
  errorCode?: (res: Response) => Promise<string | undefined>,
): Promise<T> {
  count();
  countRead(source);
  noteSource(source);
  const turn = siteTurn(url);
  if (turn > Date.now()) await new Promise((resolve) => setTimeout(resolve, turn - Date.now()));
  const places = perInvocation("http:places", () => new Places());
  await places.take();
  placed.getStore()?.();
  try {
    let res: Response;
    const signal = AbortSignal.timeout(Math.max(timeoutMs, patience.getStore() ?? 0));
    const unanswered = (err: unknown) => {
      const failed = new UpstreamError(source, err instanceof Error ? err.message : String(err));
      onFailure?.(source, url, failed);
      return failed;
    };
    onRead?.(url);
    try {
      res = await fetch(url, {
        ...(body ? { method: "POST", body } : {}),
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal,
      });
    } catch (err) {
      throw unanswered(err);
    }
    if (!res.ok) {
      const code = errorCode ? await errorCode(res).catch(() => undefined) : undefined;
      await res.body?.cancel().catch(() => {});
      const failed = new UpstreamError(source, `HTTP ${res.status}`, res.status, code);
      onFailure?.(source, url, failed);
      throw failed;
    }
    try {
      return await read(res);
    } catch (err) {
      // The delay runs until the body has come: a body still coming when it ends is a source that does not answer in
      // time, as a fetch cut there (the IPGP's earthquakes, 8 s). A body that came and cannot be read stays ours to mend.
      if (signal.aborted) throw unanswered(err);
      throw err;
    }
  } finally {
    places.give();
  }
}

export async function getJson<T>(source: string, url: string, timeoutMs = 15_000, headers?: Record<string, string>): Promise<T> {
  return get(source, url, timeoutMs, (res) => res.json() as Promise<T>, headers);
}

export async function getText(
  source: string,
  url: string,
  timeoutMs = 15_000,
  headers?: Record<string, string>,
): Promise<string> {
  return get(source, url, timeoutMs, (res) => res.text(), headers);
}

export async function getBytes(
  source: string,
  url: string,
  timeoutMs = 15_000,
  headers?: Record<string, string>,
): Promise<ArrayBuffer> {
  return get(source, url, timeoutMs, (res) => res.arrayBuffer(), headers);
}

/**
 * A text file read line by line as it comes, never whole: for a file of several Mo of which a few lines are kept (the
 * LCSQA's file of the air's measures, src/providers/air-mesures.ts). Each line is given to `line`, without its end.
 */
export async function getLines(source: string, url: string, timeoutMs: number, line: (l: string) => void): Promise<void> {
  return get(source, url, timeoutMs, async (res) => {
    let rest = "";
    for await (const chunk of res.body!.pipeThrough(new TextDecoderStream())) {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) line(l.replace(/\r$/, ""));
    }
    if (rest) line(rest.replace(/\r$/, ""));
  });
}

/**
 * The first match of `motif` in a page read as it comes, never whole: the read stops there, the rest is not downloaded
 * and nothing of the page is kept but the match (the count of Choisir le service public's search, at 95 % of a page of
 * 4,5 Mo, src/providers/emploi.ts). null when the page ends without it. `motif` has no `g` flag and matches within
 * 200 characters, the part of a piece kept for the next.
 */
export async function getMatch(source: string, url: string, timeoutMs: number, motif: RegExp): Promise<RegExpExecArray | null> {
  return get(source, url, timeoutMs, async (res) => {
    const pieces = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let rest = "";
    try {
      for (;;) {
        const { done, value } = await pieces.read();
        if (done) return null;
        const t = rest + value;
        const m = motif.exec(t);
        if (m) return m;
        rest = t.slice(-200);
      }
    } finally {
      await pieces.cancel().catch(() => {});
    }
  });
}

/** A file's bytes with the time it was written, as its server says it (Last-Modified), when it says it. */
export async function getFile(
  source: string,
  url: string,
  timeoutMs = 15_000,
): Promise<{ bytes: ArrayBuffer; modifie?: string }> {
  return get(source, url, timeoutMs, async (res) => {
    const modifie = res.headers.get("last-modified") ?? undefined;
    return { bytes: await res.arrayBuffer(), ...(modifie && { modifie }) };
  });
}

/** A form posted as a web page's own script would, for the sites whose data has no other door (Vigicrues Réunion). */
export async function postForm<T>(source: string, url: string, fields: Record<string, string>, timeoutMs = 15_000): Promise<T> {
  return get(source, url, timeoutMs, (res) => res.json() as Promise<T>, {}, new URLSearchParams(fields));
}

/** The `error` of an OAuth refusal (RFC 6749, 5.2: a 400 or 401 in JSON), read from at most 4 KB; never its description. */
async function oauthError(res: Response): Promise<string | undefined> {
  if (res.status !== 400 && res.status !== 401) return undefined;
  const text = (await res.text()).slice(0, 4096);
  const error = (JSON.parse(text) as { error?: unknown }).error;
  return typeof error === "string" && /^[a-z_]{1,40}$/.test(error) ? error : undefined;
}

/**
 * A form posted to an OAuth token endpoint: as postForm, and a refusal carries its OAuth `error` (UpstreamError.code),
 * so that a refused secret is told apart from a firewall, a limit or an error page with the same status.
 */
export async function postFormOAuth<T>(source: string, url: string, fields: Record<string, string>, timeoutMs = 15_000): Promise<T> {
  return get(source, url, timeoutMs, (res) => res.json() as Promise<T>, {}, new URLSearchParams(fields), oauthError);
}

/** A form posted as is, for a page whose form expects its own encoding (the TÉAT's, in ISO-8859-1); its bytes. */
export async function postBytes(source: string, url: string, body: string, timeoutMs = 15_000, headers: Record<string, string> = {}): Promise<ArrayBuffer> {
  return get(source, url, timeoutMs, (res) => res.arrayBuffer(), { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body);
}

/** A JSON body posted, for a service that takes more than a URL holds (the IGN's altitudes of a whole trail). */
export async function postJson<T>(source: string, url: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  return get(source, url, timeoutMs, (res) => res.json() as Promise<T>, { "Content-Type": "application/json" }, JSON.stringify(body));
}
