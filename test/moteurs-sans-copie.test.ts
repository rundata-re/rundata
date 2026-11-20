import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { snapshot } from "../src/web/data.js";
import { HOME_READER_WAIT_MS, ownWaits, withoutCopy } from "../src/web/site.js";

const NOW = new Date("2026-11-19T13:00:00Z");
const asking = (ua: string) => new Request("https://rundata.re/meteo/maido", { headers: { "user-agent": ua } });
const OAI = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot";
const BING = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36";
const CHATGPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
const PERSON = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// 17 to 19/11/2026: 103 of the robots' 503 « La page se construit », a page's own copy that the data center did not
// have, its build not done in the 800 ms of a reader's wait.
describe("a search engine's fetcher and a page's own copy this data center has none of", () => {
  // A build from nothing slower than a reader's wait for a copy, quicker than a search engine's for none.
  const slow = (ms: number) => async () => {
    await new Promise((r) => setTimeout(r, ms));
    return "construite";
  };
  const view = async (ua: string, having: boolean, ageMs = 3 * 60_000) => {
    let t = NOW.getTime() - ageMs;
    const c = new Cache(new MemoryStore(), () => t);
    if (having) await snapshot(c, "web:lieu:maido", async () => "copie", () => {}, new Date(t));
    t = NOW.getTime();
    const [waitMs, reader] = ownWaits(asking(ua));
    const got = await snapshot(c, "web:lieu:maido", slow(HOME_READER_WAIT_MS + 300), () => {}, NOW, waitMs ?? 300, reader, undefined, undefined, withoutCopy(asking(ua)));
    return got?.value ?? null;
  };

  it("waits for the build until a search engine's long wait, not a reader's short one", async () => {
    expect(withoutCopy(asking(OAI))).toBe(25_000);
    expect(withoutCopy(asking(BING))).toBe(25_000);
    expect(await view(OAI, false)).toBe("construite");
  });

  it("keeps the fetchers that answer someone now and people to their own wait, the page without its live block", async () => {
    expect(withoutCopy(asking(CHATGPT))).toBeUndefined();
    expect(withoutCopy(asking(PERSON))).toBeUndefined();
    expect(await view(CHATGPT, false)).toBeNull();
    expect(await view(PERSON, false)).toBeNull();
  });

  it("serves a copy it has at once, as before, its refresh behind", async () => {
    expect(await view(OAI, true)).toBe("copie");
  });

  // From 19/11 19:01 to 20/11/2026 11:41, five robots' 503 still answered at 850 to 982 ms: a copy there, more than a
  // day old (KEEP_SECONDS), so built again, and only the reader's 800 ms waited for it.
  it("waits as long for a copy too old to be served as for none", async () => {
    const dayAndMore = 25 * 3600_000;
    expect(await view(OAI, true, dayAndMore)).toBe("construite");
    expect(await view(CHATGPT, true, dayAndMore)).toBeNull();
  });
});
