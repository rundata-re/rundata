import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as trace from "../src/providers/cmrs-trace.js";
import type { Store } from "../src/providers/vigilance-carte.js";
import { withLectures } from "../src/lectures.js";
import { cite } from "../src/tools/citer.js";
import { cyclones } from "../src/tools/cyclones.js";
import { basinMap, label, W } from "../src/web/cyclones-bassin.js";
import { buildCyclones } from "../src/web/data.js";
import { cyclonesPage } from "../src/web/domains.js";

// An invented bulletin in the form of the RSMC's WTIO31 FMEE (system, name and positions made up), with forecasts
// that must never be read. GDACS as in test/cyclones.test.ts: FYTIA active on 03/02/2026.
const bulletin = (n: number, heure: string, pos: string, stade = "TEMPETE TROPICALE MODEREE", nom = " (OPALE)") => {
  const [d, h] = heure.split(" ");
  return `WTIO31 FMEE 030645
CMRS / CENTRE DES CYCLONES TROPICAUX DE LA REUNION
BULLETIN D'ANALYSE ET DE PREVISION CYCLONIQUE (SUD-OUEST OCEAN
INDIEN)

0.A NUMERO DU BULLETIN : ${n}/4/20252026
1.A ${stade} 4${nom}

2.A POSITION A ${h} UTC LE ${d} :
DANS UN RAYON DE 20 MN AUTOUR DU POINT ${pos}
(DIX-SEPT DEGRES SUD ET CINQUANTE-DEUX DEGRES EST)
DEPLACEMENT: SUD-OUEST 7 KT

4.A PRESSION AU CENTRE: 990 HPA
5.A VENT MAX (MOYEN/10 MN): 45 KT

1.B PREVISIONS (EXTENSIONS DES VENTS FORTS EN KM):
12H: 03/02/2026 18 UTC: 18.0 S / 51.0 E, VENT MAX= 055 KT, FORTE TEMPETE TROPICALE

24H: 04/02/2026 06 UTC: 19.5 S / 50.2 E, VENT MAX= 065 KT, CYCLONE TROPICAL

2.C COMMENTAIRES:
T=3.0 CI=3.0
`;
};
const B6 = bulletin(6, "03/02/2026 0000", "16.4 S / 53.1 E", "DEPRESSION TROPICALE", "");
const B7 = bulletin(7, "03/02/2026 0600", "17.0 S / 52.4 E");
const B9 = bulletin(9, "03/02/2026 1800", "18.2 S / 51.3 E", "FORTE TEMPETE TROPICALE");

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const GDACS_FILE = (url: string) => {
  if (url.includes("geteventlist")) return url.includes("pagenumber=2") ? "cyclones/liste_page2.json" : "cyclones/liste_page1.json";
  if (url.includes("getepisodedata") && url.includes("eventid=1001254")) return "cyclones/episode_fytia.json";
  if (url.includes("gettimeline?id=732239")) return "cyclones/timeline_fytia.json";
};
// FYTIA's day, in the reading window after 06 UTC; October has no active system.
const AT = new Date("2026-02-03T07:00:00Z");
const OCTOBER = new Date("2026-10-24T07:00:00Z");

class FakeKv implements Store {
  data = new Map<string, string | ArrayBuffer>();
  puts = 0;
  async json(key: string) {
    const v = this.data.get(key);
    return typeof v === "string" ? JSON.parse(v) : null;
  }
  async bytes() {
    return null;
  }
  async put(key: string, value: string | ArrayBuffer) {
    this.puts++;
    this.data.set(key, value);
  }
}

function stubFetch(wtio?: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string | Request) => {
    const u = typeof url === "string" ? url : url.url;
    calls.push(u);
    if (u === trace.URL) return wtio?.() ?? new Response("", { status: 503 });
    const f = GDACS_FILE(u);
    return f ? new Response(fixture(f)) : new Response("", { status: 503 });
  });
  return calls;
}
const cache = (now: Date) => new Cache(new MemoryStore(), () => now.getTime());

let kv: FakeKv;
beforeEach(() => {
  kv = new FakeKv();
  trace.configure(kv);
});
afterEach(() => {
  trace.configure();
  trace.ouvrir(trace.ACCORD !== null);
  vi.unstubAllGlobals();
});

describe("the bulletin, read", () => {
  it("keeps its number, the system's stage and name, and the position of « 2.A », never a forecast", () => {
    expect(trace.parse(B7)).toEqual({
      numero: 7, systeme: 4, saison: "20252026", nom: "Opale", stade: "tempête tropicale modérée",
      heure: "2026-02-03T06:00:00.000Z", emis: "2026-02-03T06:45:00.000Z", lon: 52.4, lat: -17,
    });
    expect(trace.parse(B6)).toMatchObject({ numero: 6, nom: "système n° 4 (non baptisé)", stade: "dépression tropicale", lat: -16.4 });
    expect(trace.parse(B7.replace(/\n/g, "\r\n"))).toMatchObject({ numero: 7, lat: -17 });
    expect(JSON.stringify(trace.parse(B7))).not.toMatch(/18\.0|51\.0|19\.5|PREVISION|KT/);
  });

  it("gives the RSMC's stages in its words, with their accents", () => {
    expect(trace.stade("DEPRESSION RESIDUELLE")).toBe("dépression résiduelle");
    expect(trace.stade("CYCLONE TROPICAL TRES INTENSE")).toBe("cyclone tropical très intense");
    expect(trace.stade("DEPRESSION EXTRA-TROPICALE")).toBe("dépression extratropicale");
    expect(trace.stade("STADE INCONNU")).toBe("stade inconnu");
  });

  it("reads nothing of another file, nor of a bulletin without its position or with a date that is not one", () => {
    expect(trace.parse("<html>introuvable</html>")).toBeUndefined();
    expect(trace.parse(B7.replace("WTIO31", "WTIO30"))).toBeUndefined();
    expect(trace.parse(B7.replace(/^2\.A.*\n.*\n/m, ""))).toBeUndefined();
    expect(trace.parse(B7.replace("03/02/2026 :", "30/02/2026 :"))).toBeUndefined();
    // The system's number of « 1.A » is not the bulletin's.
    expect(trace.parse(B7.replace("MODEREE 4", "MODEREE 5"))).toBeUndefined();
  });

  it("reads from 25 minutes to 2 h 30 after each synoptic hour", () => {
    const at = (h: number, m: number) => trace.due(new Date(Date.UTC(2026, 1, 3, h, m)));
    expect([[6, 20], [6, 25], [7, 0], [8, 25], [8, 30], [11, 59], [12, 30]].map(([h, m]) => at(h, m))).toEqual([false, true, true, true, false, false, true]);
  });
});

describe("the positions kept", () => {
  const e0: trace.Etat = { traces: [] };

  it("adds each advisory once, in order, named by the newest bulletin, and says the gaps by their numbers", () => {
    let e = trace.ajoute(e0, trace.parse(B7)!, AT);
    e = trace.ajoute(e, trace.parse(B6)!, AT);
    expect(trace.ajoute(e, trace.parse(B7)!, AT)).toBe(e);
    e = trace.ajoute(e, trace.parse(B9)!, AT);
    expect(e.traces).toHaveLength(1);
    expect(e.traces[0].nom).toBe("Opale");
    expect(e.traces[0].points.map((p) => p.numero)).toEqual([6, 7, 9]);
    const [p] = trace.parcours(e, new Date("2026-02-03T19:00:00Z"));
    expect(p).toEqual({
      nom: "Opale", stade: "forte tempête tropicale", heure: "2026-02-03T18:00:00.000Z",
      points: [[53.1, -16.4], [52.4, -17], [51.3, -18.2]], premier: 6, dernier: 9, manquent: 1,
    });
  });

  it("stops drawing a system 18 hours after its last advisory, and forgets it after 30 days", () => {
    const e = trace.ajoute(e0, trace.parse(B7)!, AT);
    expect(trace.parcours(e, new Date("2026-02-03T23:59:00Z"))).toHaveLength(1);
    expect(trace.parcours(e, new Date("2026-02-04T00:00:00Z"))).toEqual([]);
    const later = trace.ajoute(e, { ...trace.parse(B7)!, systeme: 5, numero: 1 }, new Date("2026-03-06T00:00:00Z"));
    expect(later.traces.map((t) => t.systeme)).toEqual([5]);
  });
});

describe("Météo-France's agreement", () => {
  it("is the written agreement of 02/11/2026, which turns the trace on", () => {
    expect(trace.ACCORD).toBe("2026-11-02");
    expect(trace.enLigne()).toBe(true);
  });

  it("off, as before it: no request, no read of KV, nothing on the page", async () => {
    trace.ouvrir(false);
    expect(trace.enLigne()).toBe(false);
    const calls = stubFetch(() => new Response(B7));
    expect(await trace.passage(cache(AT), AT)).toBe("pas d'accord");
    expect(calls).toEqual([]);
    kv.data.set("cmrs:trace", JSON.stringify(trace.ajoute({ traces: [] }, trace.parse(B7)!, AT)));
    const json = vi.spyOn(kv, "json");
    expect(await trace.kept(AT)).toEqual([]);
    expect(json).not.toHaveBeenCalled();
    const a = await buildCyclones(cache(AT), AT);
    expect(a.systemes_actifs?.length).toBeGreaterThan(0);
    expect(a.parcours).toBeUndefined();
    const page = cyclonesPage("https://rundata.re", { value: a, fetchedAt: AT, stale: false }, AT);
    expect(page).not.toContain('class="cur"');
    expect(page).toContain("Cette carte ne montre aucun système, ni sa position ni sa trajectoire.");
    expect(calls.some((u) => u.includes("noaa"))).toBe(false);
  });
});

describe("once Météo-France agrees", () => {
  beforeEach(() => trace.ouvrir(true));

  it("changes nothing on the page in calm weather, even with a trace kept", async () => {
    const calls = stubFetch(() => new Response(B7));
    kv.data.set("cmrs:trace", JSON.stringify(trace.ajoute({ traces: [] }, trace.parse(B7)!, OCTOBER)));
    const a = await buildCyclones(cache(OCTOBER), OCTOBER);
    expect(a.systemes_actifs ?? []).toEqual([]);
    expect(a.parcours ?? []).toEqual([]);
    const page = cyclonesPage("https://rundata.re", { value: a, fetchedAt: OCTOBER, stale: false }, OCTOBER);
    expect(page).not.toContain('class="cur"');
    expect(page).not.toContain("WTIO31");
    expect(calls.some((u) => u.includes("noaa"))).toBe(false);
  });

  it("reads nothing without an active system, outside its minutes, nor without KV", async () => {
    const calls = stubFetch(() => new Response(B7));
    expect(await trace.passage(cache(OCTOBER), OCTOBER)).toBe("aucun système actif");
    expect(await trace.passage(cache(AT), new Date("2026-02-03T08:40:00Z"))).toBe("rien à lire");
    trace.configure();
    expect(await trace.passage(cache(AT), AT)).toBe("rien à lire");
    expect(calls.some((u) => u.includes("noaa"))).toBe(false);
  });

  it("reads the bulletin once a turn, writes only a new position, and keeps the trace when the file fails", async () => {
    let body = B6;
    const calls = stubFetch(() => new Response(body));
    expect(await trace.passage(cache(AT), AT)).toBe("bulletin 6/4 (système n° 4 (non baptisé))");
    expect(calls.filter((u) => u === trace.URL)).toHaveLength(1);
    expect(await trace.passage(cache(AT), AT)).toBe("bulletin 6/4 (système n° 4 (non baptisé))");
    expect(kv.puts).toBe(1);
    body = B7;
    expect(await trace.passage(cache(AT), AT)).toBe("bulletin 7/4 (Opale)");
    expect(kv.puts).toBe(2);
    body = "<html>maintenance</html>";
    expect(await trace.passage(cache(AT), AT)).toBe("bulletin illisible");
    expect(await trace.passage(cache(AT), AT)).toBe("bulletin illisible");
    expect(kv.puts).toBe(3);
    const [p] = await trace.kept(AT);
    expect(p.points).toHaveLength(2);
  });

  it("writes the time of a read that changes nothing at most once every 15 minutes, read every 5 with GDACS active", async () => {
    stubFetch(() => new Response(B6));
    const at = (m: number) => new Date(AT.getTime() + m * 60_000);
    await trace.passage(cache(AT), AT);
    expect(kv.puts).toBe(1);
    await trace.passage(cache(AT), at(5));
    await trace.passage(cache(AT), at(10));
    expect(kv.puts).toBe(1);
    await trace.passage(cache(AT), at(15));
    expect(kv.puts).toBe(2);
    await trace.passage(cache(AT), at(20));
    expect(kv.puts).toBe(2);
  });

  it("draws the path on the basin's map under the RSMC's, its last position named, and no forecast", async () => {
    stubFetch(() => new Response(B7));
    let e = trace.ajoute({ traces: [] }, trace.parse(B6)!, AT);
    e = trace.ajoute(e, trace.parse(B7)!, AT);
    kv.data.set("cmrs:trace", JSON.stringify(e));
    const a = await buildCyclones(cache(AT), AT);
    expect(a.parcours?.[0]).toMatchObject({ nom: "Opale", premier: 6, dernier: 7, manquent: 0 });
    const page = cyclonesPage("https://rundata.re", { value: a, fetchedAt: AT, stale: false }, AT);
    expect(page).toContain('<g class="cur"><path d="M');
    expect(page).toContain('<text class="cn"');
    expect(page).toContain(">Opale</text>");
    expect(page).toContain("En trait plein, le chemin déjà parcouru : les positions du système aux avis du CMRS, la dernière plus grande, avec son nom. <b>Opale</b> : tempête tropicale modérée, position du 03/02 à 10:00 (heure de La Réunion) au dernier avis du CMRS.");
    expect(page).not.toContain(">tempête tropicale modérée, 03/02");
    expect(page).toContain("Aucune prévision ici : la trajectoire prévue est sur la carte officielle de Météo-France.");
    expect(page).toContain(" Opale : le chemin commence à l'avis n° 6, le premier lu par rundata.re.</p>");
    expect(page).toContain("Positions : Météo-France, CMRS de La Réunion (bulletins WTIO31 FMEE), avec son accord écrit du 02/11/2026, dernière position le 03/02 à 10:00 (heure de La Réunion).");
    expect(page).not.toContain("Cette carte ne montre aucun système, ni sa position ni sa trajectoire.");
    // Nothing of the bulletin's forecasts, winds or pressure, nor a distance to the island.
    // In the page's own part: the menu's icons have numbers of their own (the book's « 19.5 »).
    expect(page.slice(page.indexOf("<main"))).not.toMatch(/18\.0|19\.5|990 hPa|45 KT|km de La Réunion/);
    // The past tracks stay off while a system is watched.
    expect(page).not.toContain('class="trc"');
  });

  it("says where a path starts late and where advisories are missing, by the system's name", async () => {
    let e = trace.ajoute({ traces: [] }, trace.parse(B6)!, AT);
    e = trace.ajoute(e, trace.parse(B9)!, AT);
    kv.data.set("cmrs:trace", JSON.stringify(e));
    stubFetch();
    const a = await buildCyclones(cache(AT), AT);
    const page = cyclonesPage("https://rundata.re", { value: a, fetchedAt: AT, stale: false }, AT);
    expect(page).toContain(" Opale : le chemin commence à l'avis n° 6, le premier lu par rundata.re ; il manque 2 avis entre le n° 6 et le n° 9, le trait y relie les deux positions voisines.</p>");
  });

  it("says the path in the map's text for screen readers, and nothing of it without a system", () => {
    const p = trace.parcours(trace.ajoute({ traces: [] }, trace.parse(B7)!, AT), AT);
    expect(label(false, p)).toContain("En trait plein, le chemin déjà parcouru, d'après les avis du CMRS : Opale, tempête tropicale modérée, position du 03/02 à 10:00 (heure de La Réunion). Aucune trajectoire prévue.");
    expect(basinMap(true, p)).not.toContain('class="cur"');
    expect(basinMap(false, [])).not.toContain('class="cur"');
  });

  it("puts the name inside the map and clear of the islands' names", () => {
    const named = (points: [number, number][]) => {
      const svg = basinMap(false, [{ nom: "Opale", stade: "forte tempête tropicale", heure: "2026-02-03T06:00:00.000Z", points, premier: 1, dernier: points.length, manquent: 0 }]);
      const m = /<text class="cn" x="([\d.-]+)" y="([\d.-]+)"(?: style="text-anchor:(\w+)")?>Opale<\/text>/.exec(svg)!;
      const [x, y, anchor = "start"] = [+m[1], +m[2], m[3]];
      const w = 5 * 34 * 0.65, x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      return { svg, box: [x0, y - 20, x0 + w, y + 20] };
    };
    // By the map's east edge, the name goes inside it.
    const east = named([[86, -10], [88.5, -11]]);
    expect(east.box[2]).toBeLessThanOrEqual(W - 8);
    // Just north of Maurice: not over « Maurice » nor « La Réunion ».
    const near = named([[60.9, -14.2], [59.7, -15], [56.8, -17.8]]);
    const mada = /<text class="ln" x="([\d.-]+)" y="([\d.-]+)" transform="rotate[^>]*>Madagascar<\/text>/.exec(near.svg)!;
    expect(near.box[0] >= +mada[1] + 30 || near.box[1] >= +mada[2] + 96 || near.box[3] <= +mada[2] - 96, "Madagascar").toBe(true);
    for (const nom of ["Maurice", "La Réunion"]) {
      const t = new RegExp(`<text x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>${nom}</text>`).exec(near.svg)!;
      const [tx, ty] = [+t[1], +t[2]];
      const tw = nom.length * 34 * 0.6, tx0 = nom === "La Réunion" ? tx - tw / 2 : tx;
      const apart = near.box[2] <= tx0 || near.box[0] >= tx0 + tw || near.box[3] <= ty - 20 || near.box[1] >= ty + 20;
      expect(apart, nom).toBe(true);
    }
  });

  it("never gives the positions to the tool's answer", async () => {
    stubFetch();
    kv.data.set("cmrs:trace", JSON.stringify(trace.ajoute({ traces: [] }, trace.parse(B7)!, AT)));
    const r = await cyclones(cache(AT), undefined, AT);
    expect(r.content[0].text).not.toMatch(/parcours|52\.4/);
  });
});

// Two bulletins as the RSMC sent them, cut after their analysis (no forecast, no comment, but the sentence of a last
// bulletin): the disturbance n° 2 of 06/11/2026 (NOAA's copy, read at 15:25), Agueda's last of 23/10/2026 (the RSMC's PDF).
const ZP2 = readFileSync(new URL("./fixtures/cmrs/wtio31_zp2_2026110606.txt", import.meta.url), "utf8");
const AGUEDA_FIN = readFileSync(new URL("./fixtures/cmrs/wtio31_agueda_fin_2026102312.txt", import.meta.url), "utf8");
// 15:00 at La Réunion on 06/11/2026; 07:25 UTC, a quiet reading minute (85 after 06 UTC), 07:30 not one.
const NOV6 = new Date("2026-11-06T11:00:00Z");

describe("a system the RSMC follows before GDACS lists it", () => {
  beforeEach(() => trace.ouvrir(true));

  it("reads its number, stage and the bulletin's own time, and the RSMC's words of a last bulletin", () => {
    expect(trace.parse(ZP2)).toEqual({
      numero: 2, systeme: 2, saison: "20262027", nom: "système n° 2 (non baptisé)", stade: "zone perturbée",
      heure: "2026-11-06T06:00:00.000Z", emis: "2026-11-06T06:54:00.000Z", lon: 56.6, lat: -13.3,
    });
    expect(trace.parse(AGUEDA_FIN)).toMatchObject({ numero: 15, systeme: 1, nom: "Agueda", stade: "dépression résiduelle", emis: "2026-10-23T12:42:00.000Z", fin: true });
    // A bulletin sent after midnight on the 1st, about a position of the 31st: the next month.
    const late = ZP2.replace("FMEE 060654", "FMEE 010054").replace("LE 06/11/2026", "LE 31/10/2026").replace("A 0600 UTC", "A 1800 UTC");
    expect(trace.parse(late)?.emis).toBe("2026-11-01T00:54:00.000Z");
  });

  it("is read with GDACS empty, at the quiet minutes only, and an old bulletin adds nothing", async () => {
    const calls = stubFetch(() => new Response(ZP2));
    expect(await trace.passage(cache(NOV6), new Date("2026-11-06T07:30:00Z"))).toBe("aucun système actif");
    expect(calls.some((u) => u === trace.URL)).toBe(false);
    expect(await trace.passage(cache(NOV6), new Date("2026-11-06T07:25:00Z"))).toBe("bulletin 2/2 (système n° 2 (non baptisé))");
    expect(kv.puts).toBe(1);
    // The same bulletin 15 minutes later: written again for the time of the read alone, the system being followed.
    expect(await trace.passage(cache(NOV6), new Date("2026-11-06T07:40:00Z"))).toBe("bulletin 2/2 (système n° 2 (non baptisé))");
    expect(kv.puts).toBe(2);
    // The file keeps its last bulletin for weeks: 31 days after it, nothing added back, nothing written.
    kv.data.clear();
    expect(await trace.passage(cache(NOV6), new Date("2026-12-07T07:25:00Z"))).toBe("bulletin ancien");
    expect(kv.puts).toBe(2);
  });

  it("is said by the tool and the page, with the bulletin's time and source, never its position", async () => {
    stubFetch(() => new Response(ZP2));
    await trace.passage(cache(NOV6), new Date("2026-11-06T07:25:00Z"));
    const r = await cyclones(cache(NOV6), undefined, NOV6);
    const b = JSON.parse(r.content[0].text);
    const SAID = "1 système suivi par le CMRS de La Réunion\u00a0: zone perturbée n° 2, d'après son avis du 06/11 à 10:54 (heure de La Réunion). Une zone perturbée est le stade le plus faible\u00a0: ce n'est pas une tempête.";
    expect(b.resume).toContain(SAID);
    expect(b.resume).not.toContain("Aucun système tropical actif");
    expect(b.suivi_cmrs).toEqual([{ systeme: "zone perturbée n° 2", stade: "zone perturbée", dernier_avis: "06/11 à 10:54 (heure de La Réunion)", source: "Météo-France, CMRS de La Réunion, bulletin WTIO31 FMEE n° 2" }]);
    expect(b.systemes_actifs).toBeUndefined();
    expect(b.sources.map((x: { source: string }) => x.source).join(" ")).toContain("WTIO31");
    // Neither its position, its movement nor its pressure.
    expect(JSON.stringify(b)).not.toMatch(/13\.3|56\.6|10 KT|1007/);
    const a = await buildCyclones(cache(NOV6), NOV6);
    const page = cyclonesPage("https://rundata.re", { value: a, fetchedAt: NOV6, stale: false }, NOV6);
    expect(page).toContain(`<span class="big">1</span><p>${SAID.slice(2).replaceAll("'", "&#39;")}</p>`);
    expect(page).not.toContain("système tropical actif dans");
    expect(page).toContain("consulter le site officiel de Météo-France");
    expect(page.slice(page.indexOf("<main"))).not.toMatch(/13\.3|56\.6|1007 hPa/);
    expect(page).not.toContain('class="cur"');
  });

  it("dates the tool's answer by the RSMC's read too, the older of the two, and names the RSMC once", async () => {
    stubFetch(() => new Response(ZP2));
    await trace.passage(cache(NOV6), new Date("2026-11-06T07:25:00Z"));
    const { value: r, lectures } = await withLectures(() => cyclones(cache(NOV6), undefined, NOV6));
    expect(lectures.find((l) => l.key === "cmrs:trace")).toMatchObject({ fetchedAt: Date.parse("2026-11-06T07:25:00Z"), stale: false });
    const b = JSON.parse(cite("cyclones", r, { lectures, now: NOV6 }).content[0].text);
    // GDACS read at 15:00, the bulletin at 11:25: the answer is as old as the bulletin's read.
    expect(b.fraicheur.lue_a).toBe("06/11 11:25");
    expect(b.fraicheur.age).toBe("il y a 4 h");
    const CITER = "rundata.re, d'après les bulletins du CMRS de La Réunion (Météo-France) et GDACS";
    expect(b.citer).toBe(CITER);
    expect(b.resume).toContain(`Source : ${CITER}, https://rundata.re/cyclones?ref=mcp.`);
    // Without a system followed, the read of the bulletins dates nothing and the citation is GDACS's.
    const day = new Date("2026-11-07T07:00:00Z");
    const later = await withLectures(() => cyclones(cache(day), undefined, day));
    expect(later.lectures.some((l) => l.key === "cmrs:trace")).toBe(false);
    expect(JSON.parse(cite("cyclones", later.value, { lectures: later.lectures, now: day }).content[0].text).citer).toBe("rundata.re, d'après CMRS de La Réunion (Météo-France), via GDACS");
  });

  it("dates the answer by the last read of the bulletin, the state unchanged since: read again 6 hours later", async () => {
    stubFetch(() => new Response(ZP2));
    await trace.passage(cache(NOV6), new Date("2026-11-06T07:25:00Z"));
    expect(kv.puts).toBe(1);
    // 13:25 UTC, a quiet minute: the same bulletin, no new position, the time of the read written.
    await trace.passage(cache(NOV6), new Date("2026-11-06T13:25:00Z"));
    expect(kv.puts).toBe(2);
    expect(JSON.parse(kv.data.get("cmrs:trace") as string).lu).toBe("2026-11-06T13:25:00.000Z");
    const at = new Date("2026-11-06T13:30:00Z");
    const { value: r, lectures } = await withLectures(() => cyclones(cache(at), undefined, at));
    const b = JSON.parse(cite("cyclones", r, { lectures, now: at }).content[0].text);
    expect(b.fraicheur.lue_a).toBe("06/11 17:25");
    expect(b.fraicheur.avertissement).toBeUndefined();
  });

  it("is no longer followed 24 hours after its bulletin, nor after the RSMC's last one", async () => {
    stubFetch(() => new Response(ZP2));
    await trace.passage(cache(NOV6), new Date("2026-11-06T07:25:00Z"));
    const day = new Date("2026-11-07T07:00:00Z");
    const later = JSON.parse((await cyclones(cache(day), undefined, day)).content[0].text);
    expect(later.resume).toContain("Aucun système tropical actif");
    expect(later.suivi_cmrs).toBeUndefined();
    const e = trace.ajoute({ traces: [] }, trace.parse(AGUEDA_FIN)!, new Date("2026-10-23T13:00:00Z"));
    expect(trace.suivis(e, new Date("2026-10-23T14:00:00Z"))).toEqual([]);
    expect(trace.suivis(trace.ajoute({ traces: [] }, trace.parse(ZP2)!, NOV6), NOV6)).toEqual([{ systeme: 2, saison: "20262027", stade: "zone perturbée", numero: 2, emis: "2026-11-06T06:54:00.000Z" }]);
  });
});
