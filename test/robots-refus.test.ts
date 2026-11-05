import { afterEach, describe, expect, it, vi } from "vitest";
import { interdit, INTERDITS, refusRobot, ROBOTS_NOMMES } from "../src/robots.js";
import worker from "../src/worker.js";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";

// The User-Agents as these robots send them.
const UA: Record<string, string> = {
  "meta-externalagent": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  ClaudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  Bytespider: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  CCBot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
  Amazonbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36",
  PerplexityBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
};
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const TRIP = "https://rundata.re/bus/trajet/alterneo/84/0_5105";
const req = (url: string, ua: string) => new Request(url, { headers: { "user-agent": ua } });
// A request as Cloudflare gives it to the Worker: request.cf.asn.
const fromNetwork = (url: string, ua: string, asn: number, referer?: string) =>
  Object.assign(new Request(url, { headers: { "user-agent": ua, "accept-language": "en-US,en;q=0.9", "sec-fetch-mode": "navigate", ...(referer ? { referer } : {}) } }), { cf: { asn, country: "SG" } });
const ctx = { waitUntil: () => {} };

describe("named robots on what robots.txt forbids them", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are answered 403 by the Worker before anything is read: no fetch, no binding touched", async () => {
    expect(Object.keys(UA)).toEqual(ROBOTS_NOMMES);
    const fetch = vi.fn(async () => new Response(""));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // No binding at all: anything past the refusal would fail on it.
    const env = new Proxy({}, { get: (_, k) => { throw new Error(`binding ${String(k)} read`); } });
    for (const [nom, ua] of Object.entries(UA)) {
      const r = await worker.fetch(req(TRIP, ua), env as never, ctx);
      expect(r.status, nom).toBe(403);
      expect(await r.text()).toBe("Interdit par https://rundata.re/robots.txt\n");
      expect(log).toHaveBeenLastCalledWith(`robot refusé : ${nom} (/bus/trajet/alterneo/84/0_5105)`);
    }
    expect(fetch).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("are refused every address of robots.txt's list for every robot, and only those", () => {
    for (const p of INTERDITS) expect(refusRobot(req(`https://rundata.re${p}x`, UA.GPTBot))?.status).toBe(403);
    expect(interdit(new URL("https://rundata.re/bus/arret?q=gare"))).toBe(true);
    expect(interdit(new URL("https://rundata.re/bus/arret/gare-de-saint-pierre"))).toBe(false);
    expect(interdit(new URL("https://rundata.re/bus/trajet"))).toBe(false);
    expect(refusRobot(req("https://rundata.re/bus", UA["meta-externalagent"]))).toBeUndefined();
    expect(refusRobot(req("https://rundata.re/meteo/saint-denis", UA.ClaudeBot))).toBeUndefined();
  });

  it("leave a browser, a link preview and a search engine as they were", () => {
    for (const ua of [BROWSER, GOOGLEBOT, "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", ""]) {
      expect(refusRobot(req(TRIP, ua))).toBeUndefined();
      expect(refusRobot(req("https://rundata.re/", ua))).toBeUndefined();
    }
  });

  it("is the list robots.txt gives every robot, so that the two never part", async () => {
    const robots = await (await handle(new Request("https://rundata.re/robots.txt"), new Cache(new MemoryStore()))).text();
    const all = robots.split("\n\n").find((b) => b.startsWith("User-agent: *"))!;
    expect(all.split("\n").filter((l) => l.startsWith("Disallow: ")).map((l) => l.slice(10))).toEqual(INTERDITS);
    // The same file as before the list was shared.
    expect(robots).toBe(
      "User-agent: Googlebot\nUser-agent: GoogleOther\nUser-agent: Bingbot\nDisallow: /*?maj=\nDisallow: /bus/arret?q=\nDisallow: /bus/trajet/\nDisallow: /vigilance/bulletin-rendu\nAllow: /\n\n" +
        "User-agent: *\nDisallow: /bus/arret?q=\nDisallow: /bus/trajet/\nDisallow: /vigilance/bulletin-rendu\nAllow: /\n\nSitemap: https://rundata.re/sitemap.xml\n",
    );
  });
});

describe("browsers of a hosting network on what robots.txt forbids every robot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are answered 403 without a referer from the site, before anything is read, with the network and the path logged", async () => {
    // As on 04/11/2026: Chrome from Alibaba's cloud in Singapore (AS45102), without a referer, on a trip.
    const fetch = vi.fn(async () => new Response(""));
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = new Proxy({}, { get: (_, k) => { throw new Error(`binding ${String(k)} read`); } });
    const r = await worker.fetch(fromNetwork(TRIP, BROWSER, 45102), env as never, ctx);
    expect(r.status).toBe(403);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await r.text()).toBe(
      "Cette page n'est pas servie au réseau d'un hébergeur (AS45102)\u00a0: robots.txt l'interdit aux robots, et certains se présentent comme des navigateurs. " +
        "Si vous passez par un VPN, coupez-le, ou ouvrez-la depuis https://rundata.re/bus. Les autres pages de rundata.re restent ouvertes.\n",
    );
    expect(log).toHaveBeenLastCalledWith("navigateur d'hébergeur refusé : AS45102 (/bus/trajet/alterneo/84/0_5105)");
    expect(fetch).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("are refused every address of the list, from any of these networks, and sent to /vigilance for the bulletin's rendering", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    for (const asn of [16509, 14618, 45102]) for (const p of INTERDITS) expect(refusRobot(fromNetwork(`https://rundata.re${p}x`, BROWSER, asn))?.status, `${asn} ${p}`).toBe(403);
    expect(await refusRobot(fromNetwork("https://rundata.re/vigilance/bulletin-rendu?x=1", BROWSER, 16509))!.text()).toContain("ouvrez-la depuis https://rundata.re/vigilance. ");
    vi.restoreAllMocks();
  });

  it("are served a trip opened from a page of the site, every other page, and leave other networks as they were", () => {
    // The same browser with a referer from the site: a person behind a VPN who clicked the trip.
    expect(refusRobot(fromNetwork(TRIP, BROWSER, 45102, "https://rundata.re/bus/arret/gare-routiere-de-saint-denis"))).toBeUndefined();
    // A referer from elsewhere is not the site.
    expect(refusRobot(fromNetwork(TRIP, BROWSER, 45102, "https://rundata.re.example.com/"))?.status).toBe(403);
    for (const url of ["https://rundata.re/", "https://rundata.re/bus", "https://rundata.re/sentiers", "https://rundata.re/bus/arret/gare-routiere-de-saint-denis"]) {
      expect(refusRobot(fromNetwork(url, BROWSER, 45102))).toBeUndefined();
    }
    // A home network (AS37002, Réunicable), Meta's checker, and a request without request.cf.
    expect(refusRobot(fromNetwork(TRIP, BROWSER, 37002))).toBeUndefined();
    expect(refusRobot(fromNetwork(TRIP, BROWSER, 32934))).toBeUndefined();
    expect(refusRobot(req(TRIP, BROWSER))).toBeUndefined();
    // A search engine from these networks keeps its own rules (Googlebot's block of robots.txt).
    expect(refusRobot(fromNetwork(TRIP, GOOGLEBOT, 16509))).toBeUndefined();
  });

  it("leave a named robot's refusal as it was, from any network and with a referer from the site", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (const asn of [45102, 37002]) {
      const r = refusRobot(fromNetwork(TRIP, UA.GPTBot, asn, "https://rundata.re/bus"))!;
      expect([r.status, await r.text()]).toEqual([403, "Interdit par https://rundata.re/robots.txt\n"]);
      expect(log).toHaveBeenLastCalledWith("robot refusé : GPTBot (/bus/trajet/alterneo/84/0_5105)");
    }
    log.mockRestore();
  });
});
