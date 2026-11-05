import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { parseVigilance, STATIONS, type Vigilance } from "../src/providers/vigicrues.js";
import { crues, islandLevels, levelRow, riverAsked, sentence, vigilanceText } from "../src/tools/crues.js";

// Vigicrues Réunion on 23/10/2026 at 23:45 UTC (03:45 in La Réunion): no flood vigilance, the ravine des Cabris
// rising a few centimetres from dry.
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-23T23:52:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());

describe("Vigicrues Réunion", () => {
  const asked: string[] = [];
  beforeEach(() => {
    asked.length = 0;
    // The site is a form posted: answer from the recordings, by page and measure.
    vi.stubGlobal("fetch", async (url: string, init?: { body?: URLSearchParams }) => {
      const form = init?.body ?? new URLSearchParams();
      asked.push(`${url.split("/").pop()} ${form.get("mesure") ?? ""} ${Object.keys(JSON.parse(form.get("liste") ?? "{}")).length}`);
      const file = url.endsWith("vigilance.php") ? "vigicrues_vigilance.json" : `vigicrues_${form.get("mesure")}.json`;
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the vigilance, its times in La Réunion's clock", () => {
    const v = parseVigilance(JSON.parse(fixture("vigicrues_vigilance.json")));
    expect(v.active).toBe(false);
    expect(v.date).toBe("2026-08-07T02:22:04.000Z");
    expect(v.rivieres).toHaveLength(21);
    expect(v.rivieres.every((r) => r.couleur === "vert")).toBe(true);
  });

  it("keeps only the text of a bulletin, even with broken tags", () => {
    const v = parseVigilance([[true, 1, "2026-10-24 06:00:00", "Pluies<br>faibles <b>partout</b>", "<scr<script>ipt>x</script> rien > à <signaler"], ["Rivière des Galets", 0, 0, "ce-1"]]);
    expect(v.observations).toBe("Pluies faibles partout");
    expect(v.anticipation).not.toMatch(/[<>]/);
  });

  it("knows a river by its name, and a town is not a river", () => {
    expect(riverAsked("la rivière des Galets est en crue ?").map((s) => s.id).sort()).toEqual(["L05", "L06"]);
    expect(riverAsked("rivière Saint-Denis").map((s) => s.id)).toEqual(["L24"]);
    expect(riverAsked("Saint-Denis")).toEqual([]);
  });

  it("sums up the island: the levels measured and their time first, then the vigilance and why no bulletin is out", async () => {
    const r = body(await crues(cache(), undefined, NOW));
    expect(r.resume).toMatch(/^En hausse sur la dernière demi-heure \(mesures de 03:45\)\u00a0: Cabris - RN3 \(ravine des Cabris, Saint-Pierre\) : 0,06 m, en hausse[^]*?\. (Sans mesure récente\u00a0: [^.]+\. )?Pas de vigilance crues en cours/);
    // The last bulletin is the end of the last episode, never the levels' date: Vigicrues Réunion publishes in vigilance only.
    expect(r.resume).toMatch(/Pas de vigilance crues en cours : toutes les rivières suivies sont au vert\. Aucun bulletin de vigilance depuis le 07\/08 à 06:22 : Vigicrues Réunion n'en publie que lorsqu'au moins une rivière est en vigilance jaune ou plus\.$/);
    expect(r.resume).not.toMatch(/dernier bulletin/);
    expect(r.vigilance_crues).toEqual({ active: false, aucun_bulletin_depuis: "07/08 à 06:22", pourquoi: expect.stringMatching(/^Vigicrues Réunion n'en publie que/), rivieres: expect.any(Array) });
    expect(r.vigilance_crues).not.toHaveProperty("date");
    expect(r.stations).toHaveLength(STATIONS.length);
  });

  it("gives the tool the reference floods of the rising gauges only, out of a vigilance; the page keeps them all", async () => {
    const page = body(await crues(cache(), undefined, NOW));
    const tool = body(await crues(cache(), undefined, NOW, true));
    type Row = { station: string; tendance_30_min?: string; crues_de_reference?: unknown };
    const onPage = (name: string) => !!(page.stations as Row[]).find((p) => p.station === name)!.crues_de_reference;
    for (const st of tool.stations as Row[]) expect(!!st.crues_de_reference, st.station).toBe(st.tendance_30_min === "en hausse" && onPage(st.station));
    expect((page.stations as Row[]).filter((st) => st.crues_de_reference).length).toBeGreaterThan((tool.stations as Row[]).filter((st) => st.crues_de_reference).length);
    // Nothing else is left out.
    expect(tool.stations.map((s: { station: string }) => s.station)).toEqual(page.stations.map((s: { station: string }) => s.station));
    // The MCP endpoint answers as the tool, at the same hour.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const rpc = new Request("https://rundata.re/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "crues_rivieres", arguments: {} } }) });
      const mcp = JSON.parse((await (await handle(rpc, cache())).json()).result.content[0].text);
      const kept = (l: Row[]) => l.filter((st) => st.crues_de_reference).map((st) => st.station.replace(/[\u00a0\u202f]/g, " "));
      expect(kept(mcp.stations)).toEqual(kept(tool.stations));
      expect(kept(mcp.stations).length).toBeLessThan(kept(page.stations).length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says the island's levels from the stations measured lately only, the others apart, their trend never said", () => {
    const at = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00+04:00`);
    const now = new Date(at("03:50"));
    type T = "en hausse" | "stable";
    const lvl = (i: number, hhmm?: string, tendance: T = "stable", v = 0.18) => ({ station: STATIONS[i], ...(hhmm ? { hauteur: { t: at(hhmm), v, tendance, max3h: v } } : {}) });
    const name = (i: number) => STATIONS[i].nom;
    const read = at("03:48");
    // n = 0: the time of our read, and that we do not know.
    expect(islandLevels([lvl(0, "03:00"), lvl(1)], now, read)).toBe("Aucune des 2 stations n'a de mesure de moins de 30 minutes dans notre lecture de 03:48\u00a0: nous ne savons pas pour l'instant si les rivières montent.");
    // n = 1: the station and its river, then the others named.
    expect(islandLevels([lvl(0, "03:45"), lvl(1, "03:00", "en hausse"), lvl(2)], now, read)).toBe(
      `La seule station à jour, ${name(0)} (${STATIONS[0].riviere}), n'est pas en hausse sur la dernière demi-heure (mesure de 03:45). Sans mesure récente\u00a0: ${name(1)}, ${name(2)}.`,
    );
    // n ≥ 2, none silent: no ending.
    expect(islandLevels([lvl(0, "03:40"), lvl(1, "03:45")], now, read)).toBe("Aucune des 2 stations à jour n'est en hausse sur la dernière demi-heure (mesures de 03:45).");
    // A rise: only the stations measured lately; a late one rising is not said rising, only without a recent measurement.
    const rise = islandLevels([lvl(0, "03:45", "en hausse", 0.42), lvl(1, "03:45"), lvl(2, "03:00", "en hausse")], now, read);
    expect(rise).toBe(`En hausse sur la dernière demi-heure (mesures de 03:45)\u00a0: ${name(0)} (${STATIONS[0].riviere}, ${STATIONS[0].commune}) : 0,42 m, en hausse. Sans mesure récente\u00a0: ${name(2)}.`);
    // More than five silent: counted, not named.
    const many = islandLevels([lvl(0, "03:40"), lvl(1, "03:45"), ...[2, 3, 4, 5, 6, 7].map((i) => lvl(i))], now, read);
    expect(many).toBe("Aucune des 2 stations à jour n'est en hausse sur la dernière demi-heure (mesures de 03:45). Sans mesure récente\u00a0: 6 stations.");
    expect(many).not.toContain(name(2));
  });

  it("puts apart the stations Vigicrues answered for with no level in 3 hours, never said late, then the late ones", async () => {
    const at = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00+04:00`);
    const now = new Date(at("03:50"));
    const lvl = (i: number, hhmm?: string, vide?: true) => ({ station: STATIONS[i], ...(hhmm ? { hauteur: { t: at(hhmm), v: 0.18, tendance: "stable" as const, max3h: 0.18 } } : {}), ...(vide ? { vide } : {}) });
    const name = (i: number) => STATIONS[i].nom;
    expect(islandLevels([lvl(0, "03:40"), lvl(1, "03:45"), lvl(2, undefined, true), lvl(3, "03:00"), lvl(4)], now, at("03:48"))).toBe(
      `Aucune des 2 stations à jour n'est en hausse sur la dernière demi-heure (mesures de 03:45). Aucune mesure publiée par Vigicrues depuis au moins 3 h\u00a0: ${name(2)}. Sans mesure récente\u00a0: ${name(3)}, ${name(4)}.`,
    );
    expect(islandLevels([lvl(0, "03:40"), lvl(1, "03:45"), lvl(2, undefined, true)], now, at("03:48"))).not.toContain("Sans mesure récente");
    expect(sentence(lvl(2, undefined, true), now)).toBe(`${name(2)} (${STATIONS[2].riviere}, ${STATIONS[2].commune}) : aucune mesure publiée par Vigicrues depuis au moins 3 h`);
    expect(sentence(lvl(4), now)).toMatch(/ : pas de mesure récente$/);
    expect(levelRow(lvl(2, undefined, true), now)).toMatchObject({ hauteur_m: null, avertissement: "Aucune mesure publiée par Vigicrues depuis au moins 3 h." });
    expect(levelRow(lvl(4), now)).not.toHaveProperty("avertissement");
    // From the site: a gauge it leaves out of its answer has no level in the window (an empty list), said apart.
    const r = body(await crues(cache(), undefined, NOW));
    const none = r.stations.filter((s: { hauteur_m: number | null }) => s.hauteur_m == null);
    expect(none.length).toBeGreaterThan(0);
    for (const s of none) expect(s.avertissement).toBe("Aucune mesure publiée par Vigicrues depuis au moins 3 h.");
    expect(r.resume).toContain(`Aucune mesure publiée par Vigicrues depuis au moins 3 h\u00a0: ${none.map((s: { station: string }) => s.station).join(", ")}.`);
  });

  it("says a late station's last level with its time, never its trend, and « Dernière mesure il y a … »", () => {
    const now = new Date(Date.parse("2026-10-23T05:22:00+04:00"));
    const l = { station: STATIONS[0], hauteur: { t: Date.parse("2026-10-23T04:00:00+04:00"), v: 0.18, tendance: "en hausse" as const, max3h: 0.2 } };
    expect(sentence(l, now)).toBe(`${STATIONS[0].nom} (${STATIONS[0].riviere}, ${STATIONS[0].commune}) : 0,18 m à 04:00, pas de mesure plus récente`);
    expect(sentence(l, new Date(Date.parse("2026-10-23T04:10:00+04:00")))).toMatch(/: 0,18 m, en hausse$/);
    expect(levelRow(l, now).avertissement).toBe("Dernière mesure il y a 82 min.");
  });

  it("asks only for the gauges near the place", async () => {
    const r = body(await crues(cache(), "Saint-Gilles", NOW));
    expect(r.stations[0]).toMatchObject({ station: "Saint-Gilles - RN1a", riviere: "ravine Saint-Gilles", hauteur_m: 0.177, tendance_30_min: "stable" });
    expect(r.stations[0].distance_km).toBeLessThan(2);
    expect(r.resume).toMatch(/^Rivières suivies près de Saint-Gilles-les-Bains, mesures de 03:45 : Saint-Gilles - RN1a/);
    expect(r.resume).toMatch(/Pour repère, la plus petite crue de référence à Saint-Gilles - RN1a : 0,7 m/);
    expect(asked.filter((a) => a.startsWith("valeurs.php")).every((a) => Number(a.split(" ")[2]) <= 4)).toBe(true);
    expect(r.consignes).toMatch(/radier/);
  });

  it("gives a river's levels with their time, before the vigilance", async () => {
    const r = body(await crues(cache(), "la rivière des Galets", NOW));
    expect(r.resume).toMatch(/^[^.]*rivière des Galets[^.]* \(mesures de \d\d:\d\d\)\. .*Pas de vigilance crues en cours : toutes les rivières suivies sont au vert\. Aucun bulletin de vigilance depuis le 07\/08 à 06:22/);
  });

  it("says a vigilance in force first, before the levels, for the island, a river and a place", async () => {
    // The recorded answer with an orange vigilance on the rivière des Galets.
    const orange = JSON.parse(fixture("vigicrues_vigilance.json"));
    orange[0] = [true, 3, "2026-10-24 03:30:00", "Fortes pluies sur l'ouest.", "", "", "", 0];
    orange.find((r: unknown[]) => r[0] === "rivière des Galets")[1] = 3;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: URLSearchParams }) =>
      new Response(url.endsWith("vigilance.php") ? JSON.stringify(orange) : fixture(`vigicrues_${init?.body?.get("mesure")}.json`), { headers: { "content-type": "application/json" } }));
    for (const lieu of [undefined, "la rivière des Galets", "Saint-Gilles"]) {
      const r = body(await crues(cache(), lieu, NOW));
      expect(r.resume, String(lieu)).toMatch(/^Vigilance crues en cours \(bulletin n° 3 du 24\/10 à 03:30\) : orange pour rivière des Galets\. Observations : Fortes pluies sur l'ouest\. \S/);
      expect(r.resume, String(lieu)).toMatch(/mesures de \d\d:\d\d/);
    }
  });

  it("says first that the vigilance could not be read", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: { body?: URLSearchParams }) => {
      if (url.endsWith("vigilance.php")) throw new TypeError("fetch failed");
      return new Response(fixture(`vigicrues_${init?.body?.get("mesure")}.json`), { headers: { "content-type": "application/json" } });
    });
    const r = body(await crues(cache(), undefined, NOW));
    expect(r.resume).toMatch(/^La vigilance crues n'a pas pu être lue\. En hausse sur la dernière demi-heure/);
    expect(r.indisponible).toBe("vigilance");
  });

  it("names the rivers under vigilance, the worst first", () => {
    const v: Vigilance = {
      active: true, bulletin: 12, date: "2026-02-03T08:00:00.000Z", observations: "Fortes pluies sur l'est.", anticipation: "",
      rivieres: [
        { nom: "rivière du Mât", couleur: "jaune", precedente: "vert" },
        { nom: "rivière des Roches", couleur: "orange", precedente: "jaune" },
        { nom: "rivière des Galets", couleur: "vert", precedente: "vert" },
      ],
    };
    expect(vigilanceText(v)).toBe("Vigilance crues en cours (bulletin n° 12 du 03/02 à 12:00) : orange pour rivière des Roches\u00a0; jaune pour rivière du Mât. Observations : Fortes pluies sur l'est.");
  });
});
