import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../src/cache.js";
import { temperatureMer, WEBCAMS_PLAGES } from "../src/tools/mer.js";
import { seaPage } from "../src/web/mer-page.js";

const CSV = readFileSync(new URL("./fixtures/coraux_dhw_5km_7j.csv", import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const LIEN = "https://www.reunion.fr/organisez/webcams/";

afterEach(() => vi.unstubAllGlobals());

describe("webcams des plages", () => {
  it("links /mer to the IRT's beach webcams, a link only: no picture, frame or thumbnail of them", () => {
    const html = seaPage("https://rundata.re", null, new Date("2026-11-26T06:00:00Z"));
    expect(html).toContain(`<a href="${LIEN}">Les webcams des plages en direct</a> (sur le site de l'IRT).`);
    expect(html).not.toMatch(/<(iframe|img|video)[^>]*(reunion\.fr|viewsurf)/i);
  });

  it("gives temperature_mer the same link as /mer, read from nothing", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(String(url));
      if (String(url).includes("dhw_5km")) return new Response(CSV);
      throw new Error("offline");
    });
    const now = new Date("2026-11-26T06:00:00Z");
    const r = body(await temperatureMer(new Cache(undefined, () => now.getTime()), undefined, now));
    expect(r.webcams_plages).toEqual({ texte: "Les webcams des plages en direct", lien: LIEN, site: "Île de la Réunion Tourisme (IRT)" });
    expect(r.webcams_plages).toEqual(WEBCAMS_PLAGES);
    expect(asked.some((u) => u.includes("reunion.fr") || u.includes("viewsurf"))).toBe(false);
  });
});
