/**
 * The rundata.re app for phones (mobile/ in this repository) reads the public MCP endpoint like any client, without an
 * account: « rundata.re-android/<version> », and « … widget » when its home-screen widget reads in the background.
 *
 * Two things set it apart from the other clients.
 *
 * 1. Its answers are kept 5 minutes per tool and per place, in this data center's cache (the Cache API: free, no
 *    KV). The widget of each phone reads its commune every 30 minutes (WorkManager): without the copy, every phone
 *    would build the same summary of the day again, ~100 ms of CPU and ~40 subrequests each time (measured 19-22/11,
 *    Workers logs and Analytics Engine). With it, a commune's summary is built at most 288 times a day per data
 *    center, however many phones read it. The copy is the answer as it was built: its hours are the source's
 *    (« heure_mesure ») and the time rundata.re read them (« fraicheur.lue_a »), which the app shows; only « age_min »
 *    and « age_texte », which the app does not show, may be up to 5 minutes behind.
 *
 * 2. Nothing of the place it asks for is kept (metrics.ts, sansLieu): neither the place, nor its commune, nor the
 *    country, in the statistics or the log lines; only « appli » or « widget » and the app's version. The app's store
 *    pages can then say that it collects no data.
 */

/** The tools the app reads, whose answers are kept. Another tool the app comes to read is added here. */
export const APP_TOOLS = new Set(["resume_du_jour", "meteo_actuelle", "vigilance_meteo"]);

/** How long an answer is kept, seconds: the time a vigilance or a water notice may take to reach the widget, on top of its 30 minutes. */
export const COPY_SECONDS = 300;

/** The app, from its User-Agent: « appli » for its screen, « widget » for its widget, and its version. */
export function appliDe(userAgent: string): { type: "appli" | "widget"; version: string } | undefined {
  const m = /^rundata\.re-(?:android|ios)\/([\w.-]{1,30})(\s+widget\b)?/.exec(userAgent);
  return m ? { type: m[2] ? "widget" : "appli", version: m[1] } : undefined;
}

/**
 * The address of the kept answer for a request body: one tools/call of an app tool, whose arguments are short texts.
 * The arguments' values are written trimmed and in lower case, so that « Saint-Pierre » and « saint-pierre » share it.
 * Never kept beyond this data center's cache, and never logged.
 */
export function cleCopie(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const { method, params } = body as { method?: unknown; params?: { name?: unknown; arguments?: unknown } };
  if (method !== "tools/call" || typeof params?.name !== "string" || !APP_TOOLS.has(params.name)) return undefined;
  const args = params.arguments ?? {};
  if (typeof args !== "object" || Array.isArray(args)) return undefined;
  const q = new URLSearchParams();
  for (const k of Object.keys(args).sort()) {
    const v = (args as Record<string, unknown>)[k];
    if (typeof v !== "string" || v.length > 80 || !/^[\w-]{1,30}$/.test(k)) return undefined;
    q.set(k, v.trim().toLowerCase());
  }
  return `https://rundata.re/_appli/${params.name}?${q}`;
}

/** The part of the Cache API used here (caches.default in the Worker; none in Node, where nothing is kept). */
export interface CopyStore {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export function copyStore(): CopyStore | undefined {
  const c = (globalThis as { caches?: { default?: CopyStore } }).caches;
  return c?.default;
}

/** The kept answer for `key`, as the answer to the call `id`; undefined when none or unreadable. */
export async function copieLue(store: CopyStore, key: string, id: unknown): Promise<Response | undefined> {
  const r = await store.match(key);
  if (!r) return undefined;
  try {
    const message = (await r.json()) as Record<string, unknown>;
    return Response.json({ ...message, id }, { headers: { "cache-control": "no-store" } });
  } catch {
    return undefined;
  }
}

/**
 * Keeps the transport's answer to an app call: only a 200 in JSON whose result is not an error, so that a failed
 * build is tried again at the next read. Returns the text to put, or undefined.
 */
export async function copieAGarder(response: Response): Promise<string | undefined> {
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").startsWith("application/json")) return undefined;
  const text = await response.clone().text();
  try {
    const m = JSON.parse(text) as { result?: { isError?: boolean } };
    return m.result && !m.result.isError ? text : undefined;
  } catch {
    return undefined;
  }
}

export function garder(store: CopyStore, key: string, text: string): Promise<void> {
  return store.put(key, new Response(text, { headers: { "content-type": "application/json", "cache-control": `max-age=${COPY_SECONDS}` } }));
}
