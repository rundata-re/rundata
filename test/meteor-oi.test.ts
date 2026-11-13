import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as meteorOi from "../src/providers/meteor-oi.js";
import { autorisee } from "../src/providers/autorisations.js";
import { communeAt } from "../src/places/resolve.js";
import { FICHES } from "../src/producteurs.js";
import { METEOR_CREDIT, credits } from "../src/web/pages.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { meteoActuelle } from "../src/tools/meteo.js";
import { NON_COMPTEES } from "../src/chiffres.js";
import { METEOR_READS, worstMain } from "../src/registre.js";

// The files of four stations of the association's portal, read on 09/11/2026 at 18:40, what is read of them only:
// Marla (calm, no direction, `tempsunix`), Petite-Île's college (wind, no `tempsunix`), the rain gauge of the Grandes
// Pentes (« 0.0 mm », nothing else), Parc à Moutons on the older server (« 18:40 »).
const DAILY = JSON.parse(readFileSync(new URL("./fixtures/meteor_oi_daily.json", import.meta.url), "utf8")) as Record<string, meteorOi.Daily>;
const AT = new Date("2026-11-09T14:45:00Z");
const st = (code: string) => meteorOi.STATIONS.find((s) => s.code === code)!;

afterEach(() => {
  vi.unstubAllGlobals();
  meteorOi.configure(undefined);
});

describe("MétéoR-OI's stations", () => {
  it("reads a station's measure from its file: temperature, humidity, wind with its direction and gusts, the rain of the hour", () => {
    expect(meteorOi.parse(st("CJS400"), DAILY.CJS400)).toEqual({
      code: "CJS400", mesure_a: "2026-11-09T14:40:00.000Z", temperature: 21.4, humidite: 80, vent: 16, direction: 135, rafales: 27, pluie_1h: 0,
    });
    // A calm: no direction (« N/A »), the speed still a measure.
    expect(meteorOi.parse(st("MDM1570"), DAILY.MDM1570)).toEqual({
      code: "MDM1570", mesure_a: "2026-11-09T14:40:00.000Z", temperature: 14.2, humidite: 99, vent: 0, rafales: 0, pluie_1h: 0,
    });
    // A rain gauge: its rain only, written with a point and its unit.
    expect(meteorOi.parse(st("GPN1413"), DAILY.GPN1413)).toEqual({ code: "GPN1413", mesure_a: "2026-11-09T14:39:00.000Z", pluie_1h: 0 });
    // The older server writes « 18:40 », in La Réunion's time.
    expect(meteorOi.parse(st("PAM290"), DAILY.PAM290)?.mesure_a).toBe("2026-11-09T14:40:00.000Z");
  });

  it("keeps nothing of a file without a time or a measure, nor an absurd value", () => {
    expect(meteorOi.parse(st("CJS400"), { stats: { current: { outTemp: "21,4" } } })).toBeUndefined();
    expect(meteorOi.parse(st("CJS400"), { time: "09/11/2026 à 18h40", stats: { current: { outTemp: "N/A" } } })).toBeUndefined();
    expect(meteorOi.parse(st("CJS400"), { time: "09/11/2026 à 18h40", stats: { current: { outTemp: "-50,0", humidity: "120", windSpeed: "16" } } })).toEqual({
      code: "CJS400", mesure_a: "2026-11-09T14:40:00.000Z", vent: 16,
    });
    expect(meteorOi.nombre("   N/A")).toBeUndefined();
    expect(meteorOi.nombre("1016,7")).toBe(1016.7);
    expect(meteorOi.nombre("0.4 mm")).toBe(0.4);
  });

  it("places each station in La Réunion to the hundredth of a degree at most, never more precisely than the association's map", () => {
    for (const s of meteorOi.STATIONS) {
      expect(Math.round(s.lat * 100) / 100, s.code).toBe(s.lat);
      expect(Math.round(s.lon * 100) / 100, s.code).toBe(s.lon);
      expect(communeAt(s.lon, s.lat), s.code).toBeTruthy();
    }
    expect(new Set(meteorOi.STATIONS.map((s) => s.code)).size).toBe(meteorOi.STATIONS.length);
    expect(new Set(meteorOi.STATIONS.map((s) => s.nom)).size).toBe(meteorOi.STATIONS.length);
    // The stations the request named: Mafate, the Hauts of the South, the coast of Saint-Joseph, the East.
    expect(["MDM1570", "CHAR645", "LIA570", "SJB030", "PAH575", "TBL105"].every((c) => meteorOi.STATIONS.some((s) => s.code === c))).toBe(true);
    expect(meteorOi.fichier(st("CJS400"))).toBe("https://obs.meteor-oi.re/CJS400/json/daily.json");
    expect(meteorOi.fichier(st("PAM290"))).toBe("https://obs.meteor-oi.re/stations-proxy/PAM290/json/daily.json");
  });

  it("reads every station's file once a pass, with the User-Agent the association asked for, and keeps a silent one's last measure", async () => {
    const asked: { url: string; ua: string | null }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push({ url, ua: new Headers(init?.headers).get("User-Agent") });
      const code = meteorOi.STATIONS.find((s) => url === meteorOi.fichier(s))!.code;
      if (code === "PAM290") return new Response("", { status: 503 });
      return Response.json(DAILY[code] ?? DAILY.CJS400);
    });
    const before: meteorOi.Copie = { lu: "2026-11-09T14:35:00.000Z", mesures: [{ code: "PAM290", mesure_a: "2026-11-09T14:30:00.000Z", temperature: 21.9 }] };
    let written: meteorOi.Copie | undefined;
    const said = await meteorOi.collect(before, async (c) => void (written = c), AT);
    expect(asked).toHaveLength(meteorOi.STATIONS.length);
    expect(new Set(asked.map((a) => a.url)).size).toBe(meteorOi.STATIONS.length);
    expect(asked.every((a) => a.ua === "rundata.re (https://rundata.re; contact@rundata.re)")).toBe(true);
    expect(written!.sans_reponse).toEqual(["PAM290"]);
    expect(written!.mesures.find((m) => m.code === "PAM290")).toEqual(before.mesures[0]);
    expect(written!.mesures).toHaveLength(meteorOi.STATIONS.length);
    expect(said).toBe(`${meteorOi.STATIONS.length} stations à jour sur ${meteorOi.STATIONS.length}, sans réponse : PAM290`);
  });

  it("writes nothing when no station answers, and leaves out a measure older than an hour", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const write = vi.fn(async () => {});
    await expect(meteorOi.collect(null, write, AT)).rejects.toThrow("aucune station de MétéoR-OI n'a répondu");
    expect(write).not.toHaveBeenCalled();
    const copie: meteorOi.Copie = { lu: AT.toISOString(), mesures: [{ code: "CJS400", mesure_a: "2026-11-09T13:44:00.000Z", vent: 16 }, { code: "LIA570", mesure_a: "2026-11-09T14:40:00.000Z", vent: 8 }] };
    expect(meteorOi.toObservations(copie, AT).map((o) => o.station.id)).toEqual(["LIA570"]);
  });

  it("gives each measure with its station and its time, read from KV only, and nothing without the store", async () => {
    expect((await meteorOi.observations(undefined as never, AT)).value).toEqual([]);
    const copie: meteorOi.Copie = { lu: AT.toISOString(), mesures: [meteorOi.parse(st("CJS400"), DAILY.CJS400)!] };
    meteorOi.configure(async () => copie);
    const got = await meteorOi.observations(undefined as never, AT);
    expect(got.stale).toBe(false);
    expect(got.value).toEqual([{
      station: { source: "meteor_oi", id: "CJS400", nom: "Collège Joseph-Suacot", lon: 55.56, lat: -21.35, altitude_m: 400, variables: ["temperature", "humidite", "vent", "pluie"] },
      time: new Date("2026-11-09T14:40:00Z"),
      readings: [
        { variable: "temperature", valeur: 21.4, unite: "°C", nature: "mesure" },
        { variable: "humidite", valeur: 80, unite: "%", nature: "mesure" },
        { variable: "vent_moyen", valeur: 16, unite: "km/h", nature: "mesure" },
        { variable: "vent_direction", valeur: 135, unite: "° (d'où vient le vent)", nature: "mesure" },
        { variable: "rafales", valeur: 27, unite: "km/h", nature: "mesure" },
        { variable: "pluie_1h", valeur: 0, unite: "mm", nature: "mesure" },
      ],
    }]);
    // A copy not written for three passes is said stale.
    meteorOi.configure(async () => ({ ...copie, lu: "2026-11-09T14:10:00.000Z" }));
    expect((await meteorOi.observations(undefined as never, AT)).stale).toBe(true);
  });

  it("is read with the association's written agreement, under CC BY-NC, with its credit word for word and a link to its site", () => {
    expect(autorisee(meteorOi.AUTORISATION)).toBe(true);
    expect(meteorOi.SOURCE.attribution).toBe("Données : MétéoR-OI, licence CC BY-NC 4.0");
    expect(FICHES.meteor_oi).toEqual({ famille: "cc_by_nc", producteurs: ["MétéoR Océan Indien"] });
    expect(METEOR_CREDIT).toBe(
      'Données : <a href="https://www.meteor-oi.re" rel="noopener">MétéoR-OI</a>, licence <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.fr" rel="noopener">CC BY-NC 4.0</a>',
    );
    // In a page's sources, its credit in place of its name.
    expect(credits([{ source: meteorOi.SOURCE.nom, licence: meteorOi.SOURCE.licence, attribution: meteorOi.SOURCE.attribution }])).toBe(METEOR_CREDIT);
  });

  it("gives the connector each of its stations with the association's credit and its link", async () => {
    // Every other network silent: the answer stands on MétéoR-OI's copy alone.
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    meteorOi.configure(async () => ({ lu: AT.toISOString(), mesures: [{ ...meteorOi.parse(st("MDM1570"), DAILY.MDM1570)! }] }));
    const answer = JSON.parse((await meteoActuelle(new Cache(new MemoryStore(), () => AT.getTime(), false), "Marla", AT)).content[0].text);
    expect(answer.stations).toEqual([expect.objectContaining({
      station: "Marla", commune: "Saint-Paul", source: "meteor_oi", credit: "Données : MétéoR-OI, licence CC BY-NC 4.0", lien: "https://www.meteor-oi.re", heure_mesure: "09/11 18:40",
    })]);
    expect(answer.sources).toContainEqual({ source: meteorOi.SOURCE.nom, licence: "CC BY-NC 4.0", attribution: "Données : MétéoR-OI, licence CC BY-NC 4.0" });
  });

  it("never adds to the scheduled event of every 5 minutes: /chiffres counts the stations without MétéoR-OI's", () => {
    expect(NON_COMPTEES.has(meteorOi.SOURCE.id)).toBe(true);
    expect(METEOR_READS.has("web:chiffres")).toBe(false);
    // The event's own reads, the queues after them left out (registre.ts `queue`).
    expect(worstMain().subrequests).toBeLessThanOrEqual(397);
  });

  it("has its own cron, never the minute of the event of every 5 minutes", () => {
    const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    expect(wrangler).toContain(`"crons": ["*/5 * * * *", "${meteorOi.CRON}"]`);
    const minutes = meteorOi.CRON.split(" ")[0].split(",").map(Number);
    expect(minutes.every((m) => m % 5 !== 0 && (m - meteorOi.REFRESH_OFFSET) % meteorOi.REFRESH_EVERY === 0)).toBe(true);
    expect(minutes).toHaveLength(60 / meteorOi.REFRESH_EVERY);
  });
});
