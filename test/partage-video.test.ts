import { afterEach, describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { cheminMasque } from "../src/chemin-secret.js";
import { INTERDITS } from "../src/robots.js";
import { configurerVideo, PARTIE_OCTETS, plage, VIDEO_KV_PREFIX, VIDEO_PATH } from "../src/web/partage-video.js";

const O = "https://rundata.re";
const ID = "0123456789abcdef0123456789abcdef";
const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  handle(new Request(`${O}${path}`, { method, headers: { accept: "*/*", ...headers } }), new Cache(new MemoryStore()));

/** A KV holding a video of `taille` bytes, byte n = n % 251, in parts as the team's script writes them. */
function kvVideo(taille: number) {
  const octets = new Uint8Array(taille);
  for (let n = 0; n < taille; n++) octets[n] = n % 251;
  const valeurs = new Map<string, unknown>([[`${VIDEO_KV_PREFIX}${ID}`, { taille, parties: Math.ceil(taille / PARTIE_OCTETS) }]]);
  for (let i = 0; i * PARTIE_OCTETS < taille; i++) valeurs.set(`${VIDEO_KV_PREFIX}${ID}:${i}`, octets.slice(i * PARTIE_OCTETS, (i + 1) * PARTIE_OCTETS).buffer);
  const lus: string[] = [];
  return {
    octets,
    lus,
    async get(key: string) {
      lus.push(key);
      return valeurs.get(key) ?? null;
    },
  };
}

afterEach(() => configurerVideo(undefined));

describe("a video handed to Threads", () => {
  it("is served whole from its parts, as an MP4 neither kept nor indexed", async () => {
    const taille = 2 * PARTIE_OCTETS + 1000;
    const kv = kvVideo(taille);
    configurerVideo(kv);
    const r = await get(`${VIDEO_PATH}${ID}.mp4`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(r.headers.get("content-length")).toBe(String(taille));
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(kv.octets))).toBe(true);
    expect(kv.lus).toEqual([`${VIDEO_KV_PREFIX}${ID}`, `${VIDEO_KV_PREFIX}${ID}:0`, `${VIDEO_KV_PREFIX}${ID}:1`, `${VIDEO_KV_PREFIX}${ID}:2`]);
  });

  it("answers a range of bytes across two parts with that range only, reading only those parts", async () => {
    const taille = 2 * PARTIE_OCTETS + 1000;
    const kv = kvVideo(taille);
    configurerVideo(kv);
    const debut = PARTIE_OCTETS - 10;
    const r = await get(`${VIDEO_PATH}${ID}.mp4`, { range: `bytes=${debut}-${debut + 19}` });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes ${debut}-${debut + 19}/${taille}`);
    expect(r.headers.get("content-length")).toBe("20");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(kv.octets.slice(debut, debut + 20));
    expect(kv.lus).toEqual([`${VIDEO_KV_PREFIX}${ID}`, `${VIDEO_KV_PREFIX}${ID}:0`, `${VIDEO_KV_PREFIX}${ID}:1`]);
  });

  it("answers HEAD with the size and nothing read past the description", async () => {
    const kv = kvVideo(1000);
    configurerVideo(kv);
    const r = await get(`${VIDEO_PATH}${ID}.mp4`, {}, "HEAD");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("1000");
    expect(kv.lus).toEqual([`${VIDEO_KV_PREFIX}${ID}`]);
  });

  it("reads the ranges as RFC 9110 writes them", () => {
    expect(plage(null, 100)).toBeNull();
    expect(plage("bytes=0-", 100)).toEqual([0, 99]);
    expect(plage("bytes=10-19", 100)).toEqual([10, 19]);
    expect(plage("bytes=90-200", 100)).toEqual([90, 99]);
    expect(plage("bytes=-10", 100)).toEqual([90, 99]);
    expect(plage("bytes=-500", 100)).toEqual([0, 99]);
    expect(plage("bytes=100-", 100)).toBe("hors");
    expect(plage("bytes=20-10", 100)).toBe("hors");
    expect(plage("bytes=-0", 100)).toBe("hors");
    // Several ranges, another unit: the whole file.
    expect(plage("bytes=0-1,5-6", 100)).toBeNull();
    expect(plage("items=0-1", 100)).toBeNull();
  });

  it("answers 416 to a range past its end", async () => {
    configurerVideo(kvVideo(1000));
    const r = await get(`${VIDEO_PATH}${ID}.mp4`, { range: "bytes=1000-" });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */1000");
  });

  it("is the site's 404 once gone, with another id, another address under it, another method or no KV", async () => {
    const kv = kvVideo(1000);
    configurerVideo(kv);
    for (const path of [`${VIDEO_PATH}${"f".repeat(32)}.mp4`, `${VIDEO_PATH}${ID}`, `${VIDEO_PATH}${ID.toUpperCase()}.mp4`, `${VIDEO_PATH}${ID}.mp4/x`, VIDEO_PATH]) {
      expect((await get(path)).status, path).toBe(404);
    }
    expect((await get(`${VIDEO_PATH}${ID}.mp4`, {}, "POST")).status).not.toBe(200);
    configurerVideo(undefined);
    expect((await get(`${VIDEO_PATH}${ID}.mp4`)).status).toBe(404);
  });

  it("is the site's 404 when its description does not match its parts", async () => {
    configurerVideo({ async get(key: string) { return key === `${VIDEO_KV_PREFIX}${ID}` ? { taille: 1000, parties: 2 } : null; } });
    expect((await get(`${VIDEO_PATH}${ID}.mp4`)).status).toBe(404);
  });

  it("is written down without its id, and left out of robots.txt so that Meta's fetcher reaches it", () => {
    expect(cheminMasque(`${VIDEO_PATH}${ID}.mp4`)).toBe("/partage/video/*");
    expect(INTERDITS.some((p) => VIDEO_PATH.startsWith(p) || p.startsWith(VIDEO_PATH))).toBe(false);
  });
});
