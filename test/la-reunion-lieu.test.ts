import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { understood } from "../src/usage.js";
import { COMMUNES } from "../src/web/commune.js";

// 24/11/2026: « La Réunion » asked as the place. resume_du_jour said « Lieu introuvable à La Réunion », and the record of
// the calls counted any failure of a tool asked for the whole island (the media or the forecasts not answering) as a
// « lieu inconnu ».
const ISLAND = ["La Réunion", "la Réunion", "Réunion", "l'île de la Réunion", "974"];

const rpc = (params: unknown) =>
  new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params }),
  });
const call = async (name: string, lieu: string) => {
  const r = (await (await handle(rpc({ name, arguments: { lieu } }), new Cache())).json()) as { result?: { isError?: boolean; content: { text: string }[] } };
  return { isError: !!r.result?.isError, body: JSON.parse(r.result!.content[0].text) as Record<string, unknown> };
};

describe("« La Réunion » as the place", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the day's summary of no commune: the answer asks for one and gives them all, with their day", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("hors ligne")));
    for (const lieu of ISLAND) {
      const { isError, body } = await call("resume_du_jour", lieu);
      expect(isError, lieu).toBe(false);
      expect(JSON.stringify(body), lieu).not.toContain("introuvable");
      expect(String(body.resume).startsWith("Le résumé du jour se fait par commune\u00a0: donner l'une des 24 communes de La Réunion (Saint-Denis, Saint-Paul, Saint-Pierre, Le Tampon…), ou un lieu, rapporté à sa commune."), lieu).toBe(true);
      const communes = body.communes as { nom: string; lien: string }[];
      expect(communes.map((c) => c.nom).sort(), lieu).toEqual(COMMUNES.map((p) => p.nom).sort());
      for (const c of communes) expect(c.lien).toBe(`https://rundata.re/aujourdhui/${COMMUNES.find((p) => p.nom === c.nom)!.slug}`);
      expect(body.toute_l_ile, lieu).toEqual(expect.arrayContaining(["vigilance_meteo", "meteo_actuelle", "prevision_meteo", "actualites", "evenements"]));
    }
  }, 60_000);

  it("is the whole island for the tools that have it, never a place not found", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("hors ligne")));
    for (const name of ["actualites", "meteo_actuelle", "prevision_meteo", "electricite"])
      for (const lieu of ["La Réunion", "974"]) expect(JSON.stringify((await call(name, lieu)).body), `${name} ${lieu}`).not.toMatch(/introuvable|n'est pas à La Réunion/);
  }, 60_000);

  it("is recorded as the island, so that a tool that fails then is not counted a place not understood", () => {
    for (const lieu of ISLAND) expect(understood(lieu), lieu).toEqual({ detail: "toute l'île", place: "île" });
    expect(understood("Plaine des Sables").place).toBe("résolu");
    expect(understood("Paris").place).toBe("inconnu");
  });
});
