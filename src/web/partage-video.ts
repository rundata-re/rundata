/**
 * A video the team hands to Threads for a post: Threads fetches the MP4 itself, from a public address
 * (`video_url`), and refused the address of the file on Facebook's CDN (container in ERROR, 30/10 and 11/11/2026).
 * The file is served here for a day, then gone.
 *
 * - The team's script writes the file into KV in parts of PARTIE_OCTETS at most (a KV value holds 25 MiB at most, and a
 *   Reel's MP4 already reaches 24 MB), then its description under VIDEO_KV_PREFIX + id, each with a 24-hour expiry.
 *   Nothing is written by the Worker.
 * - The address, /partage/video/<id>.mp4, carries 32 random hexadecimal digits: linked from no page, in no sitemap, and
 *   the log lines and the statistics write it without its id (chemin-secret.ts). Not in robots.txt: Meta's fetcher must
 *   reach it.
 * - Never indexed, never kept: `noindex`, `no-store, no-transform`. A Range of bytes is answered with its part (206),
 *   as a video's fetcher may ask.
 * - Any other address under it, an id whose description is gone or unreadable, is the site's 404.
 */
import { count } from "../budget.js";

export const VIDEO_PATH = "/partage/video/";
export const VIDEO_KV_PREFIX = "partage-video:";
export const PARTIE_OCTETS = 8 * 1024 * 1024;

const ID = /^([0-9a-f]{32})\.mp4$/;

/** The part of the KV binding read here (worker.ts KvNamespace). */
export interface KvVideo {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
}

/** What the team's script writes under VIDEO_KV_PREFIX + id: the size in bytes and the number of parts. */
export interface Description { taille: number; parties: number }

let kv: KvVideo | undefined;

/** The KV that holds the videos; without it, every address under VIDEO_PATH is not found. */
export function configurerVideo(store: KvVideo | undefined) {
  kv = store;
}

const HEADERS = {
  "content-type": "video/mp4",
  "accept-ranges": "bytes",
  "cache-control": "no-store, no-transform",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

function valide(d: unknown): d is Description {
  const x = d as Description | null;
  return !!x && Number.isSafeInteger(x.taille) && Number.isSafeInteger(x.parties) && x.taille > 0 && x.parties === Math.ceil(x.taille / PARTIE_OCTETS);
}

/** The bytes asked by a Range header as [first, last], both included; null for the whole file; "hors" when unsatisfiable. */
export function plage(range: string | null, taille: number): [number, number] | null | "hors" {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  // Several ranges, or another unit: the whole file, as RFC 9110 allows.
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    const n = Number(m[2]);
    return n === 0 ? "hors" : [Math.max(0, taille - n), taille - 1];
  }
  const debut = Number(m[1]);
  const fin = m[2] ? Math.min(Number(m[2]), taille - 1) : taille - 1;
  if (debut >= taille || (m[2] && Number(m[2]) < debut)) return "hors";
  return [debut, fin];
}

/** The bytes [debut, fin] of the video, read one part at a time as the fetcher reads them. */
function flux(store: KvVideo, id: string, debut: number, fin: number): ReadableStream<Uint8Array> {
  let i = Math.floor(debut / PARTIE_OCTETS);
  const derniere = Math.floor(fin / PARTIE_OCTETS);
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      if (i > derniere) return c.close();
      const buf = await store.get(`${VIDEO_KV_PREFIX}${id}:${i}`, "arrayBuffer");
      if (!buf) return c.error(new Error(`partie ${i} absente`));
      const base = i * PARTIE_OCTETS;
      c.enqueue(new Uint8Array(buf, Math.max(0, debut - base), Math.min(buf.byteLength, fin - base + 1) - Math.max(0, debut - base)));
      i++;
    },
  });
}

/** The video at its address; null when the path is not under VIDEO_PATH or the video is not (or no longer) there. */
export async function partageVideo(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(VIDEO_PATH)) return null;
  const id = ID.exec(url.pathname.slice(VIDEO_PATH.length))?.[1];
  if (!id || !kv || (request.method !== "GET" && request.method !== "HEAD")) return null;
  let d: unknown;
  try {
    count(1, "read");
    d = await kv.get(`${VIDEO_KV_PREFIX}${id}`, "json");
  } catch {
    return null;
  }
  if (!valide(d)) return null;
  const p = plage(request.headers.get("range"), d.taille);
  if (p === "hors") return new Response(null, { status: 416, headers: { ...HEADERS, "content-range": `bytes */${d.taille}` } });
  const [debut, fin] = p ?? [0, d.taille - 1];
  const headers: Record<string, string> = { ...HEADERS, "content-length": String(fin - debut + 1) };
  if (p) headers["content-range"] = `bytes ${debut}-${fin}/${d.taille}`;
  const parts = Math.floor(fin / PARTIE_OCTETS) - Math.floor(debut / PARTIE_OCTETS) + 1;
  if (request.method === "HEAD") return new Response(null, { status: p ? 206 : 200, headers });
  count(parts, "read");
  return new Response(flux(kv, id, debut, fin), { status: p ? 206 : 200, headers });
}
