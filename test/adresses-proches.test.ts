import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { proche } from "../src/web/site.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const get = (path: string, method = "GET") => new Request(`https://rundata.re${path}`, { method, headers: { accept: BROWSER } });
const to = async (path: string, method = "GET") => {
  const r = await handle(get(path, method), new Cache());
  return [r.status, r.headers.get("location")];
};

describe("an address near a page's", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline"); // a redirect reads nothing
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("goes to the section in the plural", async () => {
    for (const [asked, page] of [["/randonnee", "/randonnees"], ["/evenement", "/evenements"], ["/velo", "/velos"], ["/borne", "/bornes"], ["/sentier", "/sentiers"], ["/commune", "/communes"]]) {
      expect(await to(asked), asked).toEqual([301, page]);
    }
  });

  it("goes to the place's page written in capitals, with accents, « _ », « st- » or « ste- », the search kept", async () => {
    expect(await to("/meteo/Saint-Paul")).toEqual([301, "/meteo/saint-paul"]);
    expect(await to("/meteo/saint_paul")).toEqual([301, "/meteo/saint-paul"]);
    expect(await to("/communes/saint-beno%C3%AEt")).toEqual([301, "/communes/saint-benoit"]);
    expect(await to("/meteo/st-denis")).toEqual([301, "/meteo/saint-denis"]);
    expect(await to("/communes/st-paul")).toEqual([301, "/communes/saint-paul"]);
    expect(await to("/aujourdhui/ste-marie")).toEqual([301, "/aujourdhui/sainte-marie"]);
    expect(await to("/aujourd'hui/sainte-marie")).toEqual([301, "/aujourdhui/sainte-marie"]);
    expect(await to("/coupures-eau/St-Denis?ref=sms")).toEqual([301, "/coupures-eau/saint-denis?ref=sms"]);
    expect(await to("/commune/st-paul")).toEqual([301, "/communes/saint-paul"]);
  });

  it("stays a 404 when no page is there: never a redirect to another 404, never a loop, never for /mcp", async () => {
    for (const asked of ["/pas-une-page", "/meteo/nulle-part", "/Communes/Nulle-Part", "/.env", "/wp-admin", "/MCP", "/mcps"]) {
      expect(await to(asked), asked).toEqual([404, null]);
    }
    // The page itself: no redirect to itself, whatever it is written like.
    for (const page of ["/randonnees", "/meteo/saint-paul", "/communes/saint-benoit", "/aujourdhui/sainte-marie"]) {
      expect(proche(page), page).toBeUndefined();
    }
    // A form sent to an address near a page's is not turned into a visit of that page.
    expect(await to("/randonnee", "POST")).toEqual([404, null]);
    // The page found answers.
    expect((await handle(get("/communes"), new Cache())).status).toBe(200);
  });
});
