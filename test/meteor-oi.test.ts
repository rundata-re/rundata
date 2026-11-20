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
import { METEOR_READS, REGISTRY, worstMain } from "../src/registre.js";
import { BUILD_BUDGET } from "../src/budget.js";
import { CLES, refus } from "../scripts/meteor-retrait.js";

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

  it("keeps the rain of each round hour from the first pass after it, a measure at most 10 minutes from the hour, 25 hours", () => {
    // The passes at 3, 13… past the hour (CRON): only the first one after the hour keeps it.
    expect(meteorOi.heureDue(new Date("2026-11-16T04:03:00Z"))).toBe(Date.parse("2026-11-16T04:00:00Z"));
    expect(meteorOi.heureDue(new Date("2026-11-16T04:13:00Z"))).toBeUndefined();
    expect(meteorOi.heureDue(new Date("2026-11-16T04:53:00Z"))).toBeUndefined();
    const h = Date.parse("2026-11-16T04:00:00Z");
    const mesures: meteorOi.Mesure[] = [
      { code: "TBL105", mesure_a: "2026-11-16T04:02:00.000Z", pluie_1h: 33.7 },
      { code: "CJS400", mesure_a: "2026-11-16T03:55:00.000Z", pluie_1h: 0 },
      // Too far from the hour (a silent station's measure of the pass before): not that hour's rain.
      { code: "LIA570", mesure_a: "2026-11-16T03:45:00.000Z", pluie_1h: 4 },
      // No rain measured: nothing kept.
      { code: "MDM1570", mesure_a: "2026-11-16T04:00:00.000Z", temperature: 14 },
    ];
    const one = meteorOi.heures(null, mesures, h);
    expect(one.fin).toBe("2026-11-16T04:00:00Z");
    expect(Object.keys(one.st).sort()).toEqual(["CJS400", "TBL105"]);
    expect(one.st.TBL105).toHaveLength(meteorOi.HEURES);
    expect(one.st.TBL105.at(-1)).toBe(33.7);
    expect(one.st.TBL105.slice(0, -1).every((v) => v === null)).toBe(true);
    expect(one.st.CJS400.at(-1)).toBe(0);
    // The next hour: shifted by one, the hour before kept; an hour missed (no pass) stays empty.
    const two = meteorOi.heures(one, [{ code: "TBL105", mesure_a: "2026-11-16T06:03:00.000Z", pluie_1h: 1.2 }], h + 2 * 3_600_000);
    expect(two.fin).toBe("2026-11-16T06:00:00Z");
    expect(two.st.TBL105.slice(-3)).toEqual([33.7, null, 1.2]);
    expect(two.st.CJS400.slice(-3)).toEqual([0, null, null]);
    // After 25 hours, a station's hours are gone, and the station with them.
    const later = meteorOi.heures(two, [], h + 27 * 3_600_000);
    expect(later.st).toEqual({});
    // An older hour than the newest kept (a pass late) still goes in its place.
    const late = meteorOi.heures(two, [{ code: "CJS400", mesure_a: "2026-11-16T05:01:00.000Z", pluie_1h: 0.4 }], h + 3_600_000);
    expect(late.fin).toBe("2026-11-16T06:00:00Z");
    expect(late.st.CJS400.slice(-3)).toEqual([0, 0.4, null]);
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
    // The event's own reads, the queues after them left out (registre.ts `queue`); 399 with the airports' METAR (its request and its write);
    // 401 with the news of Saint-Denis and Saint-Pierre (one request an hour each).
    expect(worstMain().subrequests).toBeLessThanOrEqual(401);
  });

  it("has its own cron, never the minute of the event of every 5 minutes", () => {
    const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    expect(wrangler).toContain(`"crons": ["*/5 * * * *", "${meteorOi.CRON}"]`);
    const minutes = meteorOi.CRON.split(" ")[0].split(",").map(Number);
    expect(minutes.every((m) => m % 5 !== 0 && (m - meteorOi.REFRESH_OFFSET) % meteorOi.REFRESH_EVERY === 0)).toBe(true);
    expect(minutes).toHaveLength(60 / meteorOi.REFRESH_EVERY);
  });

  it("keeps each station's day at the pass of 23:53 in La Réunion only, from the files that pass reads, no read more", async () => {
    // 16/11/2026 at 23:50 in La Réunion: the day since midnight as the station's file writes it.
    const dayFile = (code: string): meteorOi.Daily => ({
      time: "16/11/2026 à 23h50",
      stats: {
        current: { outTemp: "18,2", rainSum1h: "0,0 mm" },
        sinceMidnight: code === "GPN1413" ? { rainSum: "12,4 mm" } : { rainSum: "3,6 mm", tempMinValue: "16,9°C", tempMaxValue: "27,1°C" },
      },
    });
    let asked = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      asked++;
      const code = meteorOi.STATIONS.find((s) => String(input) === meteorOi.fichier(s))!.code;
      return code === "PAM290" ? new Response("", { status: 503 }) : Response.json(dayFile(code));
    });
    const at = new Date("2026-11-16T19:53:20Z");
    const kept: [string, Record<string, meteorOi.JourStation>][] = [];
    const said = await meteorOi.collect(null, async () => {}, at, async (jour, st) => void kept.push([jour, st]));
    expect(asked).toBe(meteorOi.STATIONS.length);
    expect(kept).toHaveLength(1);
    expect(kept[0][0]).toBe("2026-11-16");
    expect(kept[0][1].CJS400).toEqual({ pluie_mm: 3.6, tmin: 16.9, tmax: 27.1, jusqu_a: "23:50" });
    expect(kept[0][1].GPN1413).toEqual({ pluie_mm: 12.4, jusqu_a: "23:50" });
    expect(kept[0][1].PAM290).toBeUndefined();
    expect(said).toContain(`jour du 2026-11-16 gardé pour ${meteorOi.STATIONS.length - 1} stations`);
    // Any other pass: no day kept.
    for (const t of ["2026-11-16T19:43:20Z", "2026-11-16T20:03:20Z", "2026-11-16T07:53:20Z"]) {
      expect(meteorOi.jourGarde(new Date(t)), t).toBeUndefined();
    }
    let other = 0;
    await meteorOi.collect(null, async () => {}, new Date("2026-11-16T19:43:20Z"), async () => void other++);
    expect(other).toBe(0);
  });

  it("keeps a day only from a measure of that day after 23:00, and never an absurd value", () => {
    const d = (time: string, m: Record<string, string>): meteorOi.Daily => ({ time, stats: { sinceMidnight: m } });
    expect(meteorOi.jourDe(d("16/11/2026 à 22h55", { rainSum: "1,0 mm" }), "2026-11-16")).toBeUndefined();
    expect(meteorOi.jourDe(d("15/11/2026 à 23h50", { rainSum: "1,0 mm" }), "2026-11-16")).toBeUndefined();
    expect(meteorOi.jourDe(d("16/11/2026 à 23h53", { rainSum: "N/A" }), "2026-11-16")).toBeUndefined();
    expect(meteorOi.jourDe(d("16/11/2026 à 23h53", { rainSum: "0,2 mm", tempMinValue: "-40,0°C", tempMaxValue: "25,0°C" }), "2026-11-16")).toEqual({ pluie_mm: 0.2, tmax: 25, jusqu_a: "23:53" });
  });

  it("keeps 400 days at most, says its first, and replaces a day kept again", () => {
    let j = meteorOi.ajouterJour(undefined, "2026-11-16", { MDM1570: { pluie_mm: 1, jusqu_a: "23:50" } });
    expect(j.debut).toBe("2026-11-16");
    j = meteorOi.ajouterJour(j, "2026-11-16", { MDM1570: { pluie_mm: 2, jusqu_a: "23:53" } });
    expect(j.jours["2026-11-16"].MDM1570.pluie_mm).toBe(2);
    j = meteorOi.ajouterJour(j, "2027-12-21", { MDM1570: { pluie_mm: 0, jusqu_a: "23:50" } });
    expect(Object.keys(j.jours)).toEqual(["2027-12-21"]);
    expect(j.debut).toBe("2027-12-21");
    expect(meteorOi.JOURS_TTL_SECONDS).toBe(430 * 86_400);
  });

  it("keeps its day within the budget of its own event, with the stations' files, once a day", () => {
    const st = REGISTRY.find((e) => e.id === "meteor:stations")!;
    const jours = REGISTRY.find((e) => e.id === "meteor:jours")!;
    expect(jours.trigger).toBe("planifiée à part");
    expect(jours.every).toBe(24 * 60);
    expect(jours.offset).toBe(19 * 60 + 53);
    expect(meteorOi.CRON.split(" ")[0].split(",").map(Number)).toContain(meteorOi.JOUR_MINUTE_UTC);
    expect(st.run.subrequests + jours.run.subrequests).toBeLessThanOrEqual(BUILD_BUDGET);
  });

  it("is taken down in one command, every key and the archive's copies, only once the agreement is withdrawn", () => {
    expect(CLES).toEqual(["meteor:stations", "meteor:heures", "meteor:jours"]);
    expect(refus("accordee")).toContain("« retiree »");
    expect(refus("retiree")).toBeUndefined();
    expect(autorisee(meteorOi.AUTORISATION)).toBe(true);
  });
});

