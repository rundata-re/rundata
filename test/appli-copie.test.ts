import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copiesPour, handle } from "../src/app.js";
import { APP_TOOLS, appliDe, cleCopie, COPY_SECONDS, type CopyStore } from "../src/appli.js";
import { Cache } from "../src/cache.js";
import { point, sansLieu, visitor, type Hit } from "../src/metrics.js";
import worker from "../src/worker.js";
import { meteoFrance } from "./contexte.js";

// The Worker sets the readers of its copies in the modules (worker.ts, at each request): its own modules, dropped after.
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

const ZIP = readFileSync(new URL("./fixtures/vigilance_om.zip", import.meta.url));

const APP = "rundata.re-android/0.1.2";
const WIDGET = "rundata.re-android/0.1.3 widget";
const call = (name: string, lieu: string, id: number | string = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: { lieu } } });
const post = (body: unknown, ua: string) =>
  new Request("https://rundata.re/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": ua },
    body: JSON.stringify(body),
  });

/** A data center's cache: what was put, with its headers, and how often it was read. */
function memoryStore() {
  const kept = new Map<string, Response>();
  const store: CopyStore & { kept: typeof kept; reads: number } = {
    kept,
    reads: 0,
    async match(key) {
      store.reads++;
      return kept.get(key)?.clone();
    },
    async put(key, response) {
      kept.set(key, response);
    },
  };
  return store;
}

// The app's answers kept 5 minutes per tool and place in the data center's cache, and nothing of its place kept
// in the statistics (22/11/2026): a widget on each phone reads its commune every 30 minutes.
describe("the app's calls to the MCP endpoint", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
    copiesPour(() => store);
    // Météo-France's vigilance bulletin, the only source read; anything else is offline.
    meteoFrance({ applicationId: "test" });
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("/token")) return Response.json({ access_token: "t", expires_in: 3600 });
      if (String(url).includes("vigilance")) return new Response(ZIP);
      throw new Error("offline");
    });
  });
  afterEach(() => {
    copiesPour(undefined);
    vi.unstubAllGlobals();
  });

  async function ask(body: unknown, ua: string) {
    const hits: Hit[] = [];
    const work: Promise<unknown>[] = [];
    const response = await handle(post(body, ua), new Cache(), (w) => work.push(w), (h) => hits.push(h));
    await Promise.all(work);
    return { hits, response, message: await response.json() };
  }

  it("knows the app, its widget and its version from the User-Agent", () => {
    expect(appliDe(APP)).toEqual({ type: "appli", version: "0.1.2" });
    expect(appliDe(WIDGET)).toEqual({ type: "widget", version: "0.1.3" });
    expect(appliDe("rundata.re-ios/1.0.0")).toEqual({ type: "appli", version: "1.0.0" });
    expect(appliDe("Mozilla/5.0 rundata.re-android/0.1.2")).toBeUndefined();
    expect([visitor(APP), visitor(WIDGET)]).toEqual(["appli", "widget"]);
  });

  it("keeps one copy per tool and place, the place written in lower case, and nothing else", () => {
    expect(cleCopie(call("resume_du_jour", " Saint-Pierre "))).toBe("https://rundata.re/_appli/resume_du_jour?lieu=saint-pierre");
    expect(cleCopie(call("resume_du_jour", "saint-pierre"))).toBe(cleCopie(call("resume_du_jour", "Saint-Pierre", 9)));
    expect(cleCopie(call("prevision_meteo", "Saint-Pierre"))).toBeUndefined(); // not a tool of the app
    expect(cleCopie([call("resume_du_jour", "Saint-Pierre")])).toBeUndefined(); // a batch
    expect(cleCopie({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBeUndefined();
    expect(cleCopie({ ...call("meteo_actuelle", "x"), params: { name: "meteo_actuelle", arguments: { lieu: 3 } } })).toBeUndefined();
    expect(cleCopie(call("meteo_actuelle", "x".repeat(81)))).toBeUndefined();
    // The cyclones, read without a place for the alert band (0.3.0): one copy for the whole island.
    expect(cleCopie({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "cyclones", arguments: {} } })).toBe("https://rundata.re/_appli/cyclones?");
    expect([...APP_TOOLS].sort()).toEqual(["cyclones", "meteo_actuelle", "resume_du_jour", "vigilance_meteo"]);
  });

  it("answers the second read from the copy, with the caller's id, and builds it once", async () => {
    const first = await ask(call("vigilance_meteo", "Saint-Pierre", 1), APP);
    expect(first.response.status).toBe(200);
    expect(first.message.result.isError).toBeFalsy();
    const [key] = [...store.kept.keys()];
    expect(key).toBe("https://rundata.re/_appli/vigilance_meteo?lieu=saint-pierre");
    expect(store.kept.get(key)!.headers.get("cache-control")).toBe(`max-age=${COPY_SECONDS}`);
    expect(COPY_SECONDS).toBe(300);
    const second = await ask(call("vigilance_meteo", "saint-pierre", "b"), WIDGET);
    expect(second.message).toEqual({ ...first.message, id: "b" });
    expect(second.response.headers.get("access-control-allow-origin")).toBe("*");
    expect(first.hits).toMatchObject([{ kind: "mcp", name: "vigilance_meteo", outcome: "ok" }]);
    expect(first.hits[0].copie).toBeUndefined();
    expect(second.hits).toMatchObject([{ kind: "mcp", name: "vigilance_meteo", outcome: "ok", ok: true, copie: true }]);
    expect(store.kept.size).toBe(1);
  });

  it("never keeps an error, nor answers another client from the app's copy", async () => {
    const unknown = await ask(call("resume_du_jour", "Zzyzx Qwrt"), APP);
    expect(unknown.message.result.isError).toBe(true);
    expect(store.kept.size).toBe(0);
    await ask(call("vigilance_meteo", "Saint-Pierre"), APP);
    expect(store.kept.size).toBe(1);
    const reads = store.reads;
    const assistant = await ask(call("vigilance_meteo", "Saint-Pierre"), "Claude-User");
    expect(assistant.hits[0].copie).toBeUndefined();
    expect(store.reads).toBe(reads);
  });

  it("keeps nothing of the app's place in the statistics: neither the place, nor the commune, nor the country", async () => {
    const { hits } = await ask(call("vigilance_meteo", "Saint-Pierre"), WIDGET);
    expect(hits[0]).toMatchObject({ place: "résolu", commune: "Saint-Pierre" }); // as the endpoint tells it
    const kept = sansLieu(hits[0], WIDGET);
    expect(kept).toMatchObject({ kind: "mcp", name: "vigilance_meteo", clientVersion: "0.1.3", outcome: "ok" });
    expect([kept.detail, kept.place, kept.commune]).toEqual([undefined, undefined, undefined]);
    const { blobs } = point(kept, { who: visitor(WIDGET), country: "", from: "", audience: "", language: "" });
    expect(blobs[3]).toBe("widget");
    expect(blobs[8]).toBe("0.1.3");
    expect(JSON.stringify(blobs)).not.toMatch(/saint-pierre|RE"/i);
    expect(point(sansLieu({ ...hits[0], copie: true }, APP), { who: "appli", country: "", from: "", audience: "", language: "" }).blobs[13]).toBe("copie");
    // Another client's hit is kept as before.
    expect(sansLieu(hits[0], "Claude-User")).toBe(hits[0]);
  });

  it("keeps the country Cloudflare gives out of the app's point and log line, through the Worker", async () => {
    // The country is read by the Worker from the request (request.cf), not given by the test: the app's is never kept,
    // another client's is.
    const asked = async (ua: string) => {
      const points: { blobs?: string[] }[] = [];
      const lines: unknown[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((l: unknown) => void lines.push(l));
      const request = post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ua);
      Object.defineProperty(request, "cf", { value: { country: "RE", asn: 37002 } });
      const env = { USAGE: { writeDataPoint: (p: { blobs?: string[] }) => void points.push(p) } };
      const after: Promise<unknown>[] = [];
      await worker.fetch(request, env as never, { waitUntil: (p) => void after.push(p) });
      await Promise.all(after);
      log.mockRestore();
      const mcp = points.filter((p) => p.blobs?.[0] === "rpc" || p.blobs?.[0] === "mcp");
      const line = lines.find((l): l is { country?: string } => typeof l === "object" && l !== null && "method" in l);
      return { countries: mcp.map((p) => p.blobs![4]), logged: line?.country };
    };
    expect(await asked(APP)).toEqual({ countries: [""], logged: undefined });
    expect(await asked(WIDGET)).toEqual({ countries: [""], logged: undefined });
    expect(await asked("Claude-User")).toEqual({ countries: ["RE"], logged: "RE" });
  });

  it("is told on the privacy page", async () => {
    const page = await (await handle(new Request("https://rundata.re/confidentialite", { headers: { accept: "text/html" } }), new Cache())).text();
    expect(page.replaceAll('<span class="ident">rundata.re</span>', "rundata.re")).toContain("L'appli rundata.re pour téléphone lit les mêmes outils que le connecteur. Depuis le 22 novembre 2026, pour ses demandes, les statistiques ne gardent ni le lieu demandé, ni sa commune, ni le pays : seulement « appli » ou « widget » et la version de l'appli. Notre copie d'un an des journaux techniques ne garde pas non plus le pays ni le réseau ; seuls les journaux que Cloudflare garde quelques jours les contiennent, comme pour toute visite. Pour ne pas refaire le même travail pour chaque téléphone, la réponse à une même question est gardée 5 minutes dans le cache de Cloudflare, sans rien qui dise qui l'a demandée.");
  });
});
