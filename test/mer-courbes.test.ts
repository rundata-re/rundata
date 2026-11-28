import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as candhis from "../src/providers/candhis.js";
import * as crwSerie from "../src/providers/crw-serie.js";
import { chiffresBouee, chiffresBlock, chiffresJours, courbes, degres, heures, historiqueBlock, metres, minuitLocal } from "../src/tools/mer-courbes.js";
import { chart } from "../src/web/graphe.js";
import { courbesSection as buoysSection, satelliteSection } from "../src/web/mer-courbes.js";

/** Block 1 (the buoys) and the satellite's days of block 4, as /mer shows them. */
const courbesSection = (c: ReturnType<typeof courbes>, now: Date) => buoysSection(c, now) + satelliteSection(c);
import { distanceKm } from "../src/geo.js";
import { seaPage } from "../src/web/mer-page.js";
import type { SeaData } from "../src/web/data.js";

// getCampTR as it answered for 97410 on 24/11/2026 (dates in UTC, oldest first), here newest first to check the sort,
// with a temperature the buoy did not measure (999.9999).
const NOW = new Date("2026-11-24T06:20:00Z"); // 10:20 in La Réunion
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const KEY = "00000000-1111-2222-3333-444444444444";
const TR = {
  apiVer: "1.00",
  success: true,
  message: "Données TR directionnel H13 campagne `97410` du 2026-10-25 au 2027-10-25",
  nbLig: 3,
  entete: ["Date", "H1/3 (m)", "Hmax (m)", "TH1/3 (s)", "Dir. au pic (°)", "Etal. au pic (°)", "Temp. mer (°C)"],
  results: [
    ["2026-11-24 05:50", "1.2000", "1.9000", "6.6000", "104.0000", "22.0000", "27.0000"],
    ["2026-11-24 04:50", "1.1000", "2.3000", "7.5000", "180.0000", "45.0000", "999.9999"],
    ["2026-11-19 13:50", "1.5000", "2.5000", "9.1000", "207.0000", "31.0000", "27.2000"],
  ],
};
const etat = (t: number, h = 1.3): candhis.Etat => ({
  essai: t,
  lu: t,
  types: { lu: t, actives: { "97410": 2 } },
  mesures: { "97410": { code: "97410", t, hauteur: h, hauteur_selon: "H1/3", hmax: 2, periode: 7, periode_selon: "TH1/3", periode_pic: null, direction: 180, etalement: 20, temperature: 26.9 } },
});

let asked: string[] = [];
let answer: (url: string) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  asked = [];
  answer = () => json(TR);
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(String(url));
    return answer(String(url));
  });
  candhis.configure(KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  candhis.configure(undefined);
});

function store(before: candhis.Serie | null = null) {
  const written: candhis.Serie[] = [];
  return { before, written, write: async (s: candhis.Serie) => void written.push(structuredClone(s)) };
}

describe("the buoys' series of 30 days", () => {
  it("is fed at 15 and 45 past the hour, five minutes after the state", () => {
    const due = Array.from({ length: 12 }, (_, i) => i * 5).filter((m) => candhis.serieDue(new Date(Date.UTC(2026, 10, 24, 8, m, 2))));
    expect(due).toEqual([15, 45]);
  });

  it("reads getCampTR by its header, oldest first, a value not measured as a hole", () => {
    const ms = candhis.parseSerieTR(TR, "97410");
    expect(ms.map((m) => new Date(m.t).toISOString())).toEqual(["2026-11-19T13:50:00.000Z", "2026-11-24T04:50:00.000Z", "2026-11-24T05:50:00.000Z"]);
    expect(ms[1]).toMatchObject({ hauteur: 1.1, hmax: 2.3, periode: 7.5, direction: 180, temperature: null, hauteur_selon: "H1/3", periode_selon: "TH1/3" });
  });

  it("asks getCampTR for 30 days once when it is empty, then not again the same day", async () => {
    const s = store();
    expect(await candhis.completer(null, s.write, NOW, etat(NOW.getTime() - 30 * 60_000))).toBe("1 bouées en série, 3 mesures ajoutées, 1 requêtes");
    // The state's measurement of 05:50 is getCampTR's too: kept once.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBe("https://candhis.cerema.fr/API/v1/getCampTR.php?camp=97410&dateDeb=2026-10-25&dateFin=2026-11-25");
    const one = s.written[0];
    expect(one.bouees["97410"].points.map((p) => p[0])).toEqual([...one.bouees["97410"].points.map((p) => p[0])].sort((a, b) => a - b));
    // A hole of days (19/11 to 24/11), but getCampTR was asked less than a day ago: nothing asked.
    asked = [];
    const later = new Date(NOW.getTime() + 30 * 60_000);
    await candhis.completer(one, s.write, later, etat(later.getTime() - 20 * 60_000, 1.4));
    expect(asked).toEqual([]);
    expect(s.written[1].bouees["97410"].points.at(-1)).toEqual([later.getTime() - 20 * 60_000, 1.4, 2, 7, 180, 26.9]);
  });

  it("fills a hole from its day, a day after the last getCampTR, and keeps a measurement once", async () => {
    const t0 = NOW.getTime();
    const before: candhis.Serie = {
      essai: t0 - DAY,
      tr: { "97410": t0 - DAY - 60_000 },
      rempli: { "97410": t0 - 2 * DAY },
      bouees: { "97410": { hauteur_selon: "H1/3", periode_selon: "TH1/3", points: [[Date.parse("2026-11-19T13:20:00Z"), 1.4, 2.4, 9, 200, 30, 27.1], [Date.parse("2026-11-24T05:50:00Z"), 1.2, 1.9, 6.6, 104, 22, 27]] } },
    };
    const s = store();
    await candhis.completer(before, s.write, NOW, etat(Date.parse("2026-11-24T05:50:00Z"), 1.2));
    expect(asked).toEqual(["https://candhis.cerema.fr/API/v1/getCampTR.php?camp=97410&dateDeb=2026-11-19&dateFin=2026-11-25"]);
    const times = s.written[0].bouees["97410"].points.map((p) => p[0]);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toHaveLength(4);
  });

  it("asks the 30 days again the next day when the first getCampTR failed, or brought nothing, whatever the state added", async () => {
    for (const fail of [() => new Response("indisponible", { status: 503 }), () => json({ ...TR, nbLig: 0, results: [] })]) {
      answer = fail;
      asked = [];
      const s = store();
      await candhis.completer(null, s.write, NOW, etat(NOW.getTime() - 30 * 60_000)).catch(() => undefined);
      expect(s.written[0].rempli).toBeUndefined();
      // The scheduled event goes on adding the state's measurements, every 30 minutes: no hole, but not filled.
      let serie = s.written[0];
      for (let k = 1; k <= 46; k++) {
        const at = new Date(NOW.getTime() + k * 30 * 60_000);
        await candhis.completer(serie, s.write, at, etat(at.getTime() - 20 * 60_000));
        serie = s.written.at(-1)!;
      }
      answer = () => json(TR);
      asked = [];
      const next = new Date(NOW.getTime() + DAY + 60_000);
      await candhis.completer(serie, s.write, next, etat(next.getTime() - 20 * 60_000));
      expect(asked).toEqual(["https://candhis.cerema.fr/API/v1/getCampTR.php?camp=97410&dateDeb=2026-10-26&dateFin=2026-11-26"]);
      expect(s.written.at(-1)!.rempli).toEqual({ "97410": next.getTime() });
    }
  });

  it("does not ask again for a hole getCampTR did not fill: the buoy did not measure then", async () => {
    const t0 = NOW.getTime();
    const hole = Date.parse("2026-11-20T00:00:00Z");
    const before: candhis.Serie = {
      essai: t0 - DAY, rempli: { "97410": t0 - 2 * DAY }, tr: { "97410": t0 - DAY - 60_000 },
      bouees: { "97410": { hauteur_selon: "H1/3", periode_selon: "TH1/3", points: [[hole, 1, 2, 7, 180, 27], [hole + 6 * HOUR, 1, 2, 7, 180, 27]] } },
    };
    answer = () => json({ ...TR, results: [] });
    const s = store();
    await candhis.completer(before, s.write, NOW, etat(hole + 6 * HOUR));
    expect(asked).toHaveLength(1);
    expect(s.written[0].trou_vu).toEqual({ "97410": hole });
    asked = [];
    const next = new Date(t0 + DAY + 60_000);
    await candhis.completer(s.written[0], s.write, next, etat(hole + 6 * HOUR));
    expect(asked).toEqual([]);
  });

  it("drops the days older than 30", async () => {
    const old = NOW.getTime() - 31 * DAY;
    const before: candhis.Serie = { essai: old, tr: { "97410": NOW.getTime() - HOUR }, rempli: { "97410": old }, bouees: { "97410": { hauteur_selon: "H1/3", periode_selon: "TH1/3", points: [[old, 1, 2, 7, 180, 26], [NOW.getTime() - HOUR, 1, 2, 7, 180, 26]] } } };
    const s = store();
    await candhis.completer(before, s.write, NOW, etat(NOW.getTime() - HOUR));
    expect(s.written[0].bouees["97410"].points.map((p) => p[0])).toEqual([NOW.getTime() - HOUR]);
  });

  it("stops asking until the next day in La Réunion on a quota reached or an address banned, and says why", async () => {
    for (const status of [429, 423]) {
      answer = () => json({ apiVer: "1.00", success: false, message: "quota" }, status);
      const s = store();
      await expect(candhis.completer(null, s.write, NOW, etat(NOW.getTime() - HOUR))).rejects.toThrow();
      expect(s.written[0].echec).toMatchObject({ status });
      // 24/11 10:20 in La Réunion: the next day starts at 24/11 20:00 UTC.
      expect(s.written[0].pause_jusqu_a).toBe(Date.parse("2026-11-24T20:00:00Z"));
      asked = [];
      await candhis.completer({ ...s.written[0], tr: {} }, s.write, new Date(NOW.getTime() + 2 * DAY / 4), etat(NOW.getTime()));
      expect(asked).toEqual([]);
    }
  });

  it("asks nothing without the key", async () => {
    candhis.configure(undefined);
    expect(await candhis.completer(null, store().write, NOW, etat(NOW.getTime()))).toBe("sans clé");
    expect(asked).toEqual([]);
  });
});

/** A buoy every 30 minutes over 30 days, a hole of 6 hours two days ago, the waves rising. */
function serie(): candhis.Serie {
  const points: candhis.Point[] = [];
  for (let t = NOW.getTime() - 30 * DAY + 10 * 60_000; t <= NOW.getTime() - 30 * 60_000; t += 30 * 60_000) {
    if (t > NOW.getTime() - 2 * DAY && t < NOW.getTime() - 2 * DAY + 6 * HOUR) continue;
    const d = (NOW.getTime() - t) / DAY;
    points.push([t, Math.round((2 - d / 20) * 100) / 100, Math.round((3 - d / 15) * 100) / 100, 8, 180, Math.round((27 - d / 30) * 100) / 100]);
  }
  return { essai: NOW.getTime(), bouees: { "97410": { hauteur_selon: "H1/3", periode_selon: "TH1/3", points } } };
}
const JOURS = Array.from({ length: 30 }, (_, i) => new Date(Date.parse("2026-10-24T00:00:00Z") + i * DAY).toISOString().slice(0, 10));
const crw: crwSerie.SerieMer = {
  jours: JOURS,
  points: crwSerie.POINTS.map((p, k) => ({ ...p, sst: JOURS.map((_, i) => (i === 10 ? null : 25 + i / 10 + k / 10)), ecart: JOURS.map((_, i) => (i === 29 ? 1.47 : 1)) })),
};

describe("the curves' figures", () => {
  it("say the last value, its move in 24 hours, the week's highest, and over the period mean, lowest and highest", () => {
    const pts = serie().bouees["97410"].points;
    const h = chiffresBouee(pts, "hauteur", NOW)!;
    expect(h.derniere).toBe(pts.at(-1)![1]);
    expect(h.sur_24h).toBeCloseTo(0.05, 2);
    expect(h.max_7j!.valeur).toBe(pts.at(-1)![1]);
    const t = chiffresBouee(pts, "temperature", NOW, true)!;
    expect(t.periode).toMatchObject({ jours: 30, max: pts.at(-1)![5] });
    expect(t.periode!.min).toBeLessThan(t.periode!.moyenne);
  });

  it("put a measurement missing as a hole on the grid of hours, never a value carried over", () => {
    const pts = serie().bouees["97410"].points;
    const debut = minuitLocal(NOW.getTime()) - 6 * DAY;
    const g = heures(pts, "hauteur", debut, 11 * 24);
    const hole = Math.round((NOW.getTime() - 2 * DAY + 3 * HOUR - debut) / HOUR);
    expect(g[hole]).toBeNull();
    expect(g[hole - 6]).not.toBeNull();
    // The future: no measurement.
    expect(g.at(-1)).toBeNull();
  });

  it("read a satellite day missing as a hole, and the gap to NOAA's reference of the last day", () => {
    const f = chiffresJours(crw.jours, crw.points[0].sst)!;
    expect(f).toMatchObject({ derniere: 27.9, le: "2026-11-22", sur_24h: 0.1, periode: { jours: 29 } });
    const per = crwSerie.parsePoint("time,latitude,longitude,CRW_SST,CRW_SSTANOMALY\nUTC,degrees_north,degrees_east,Celsius,Celsius\n2026-10-22T12:00:00Z,-21.075,55.225,25.23,1.03\n2026-10-24T12:00:00Z,-21.075,55.225,NaN,1.11\n");
    const a = crwSerie.assemble([per, per, per, per]);
    expect(a.jours).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(a.points[0].sst).toEqual([25.23, null, null]);
    expect(a.points[0].ecart).toEqual([1.03, null, 1.11]);
  });

  it("ask NOAA's mirror for one beach's own cell over 30 days", () => {
    expect(crwSerie.urlOf(crwSerie.POINTS[0])).toBe("https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.csv?CRW_SST%5Blast-29:last%5D%5B(-21.075):(-21.075)%5D%5B(55.225):(55.225)%5D,CRW_SSTANOMALY%5Blast-29:last%5D%5B(-21.075):(-21.075)%5D%5B(55.225):(55.225)%5D");
  });
});

const forecast = (lon: number, lat: number) => ({
  steps: Array.from({ length: 32 }, (_, i) => ({ time: new Date(Date.parse("2026-11-24T05:00:00Z") + i * 3 * HOUR), hauteur: 1.5 + i / 100, periode: 6 })),
  model: { nom: "MFWAM de Météo-France", source: { id: "openmeteo_houle_mf" } } as never,
  modele: "mfwam" as const,
  lon, lat,
});

describe("« En courbes » on /mer", () => {
  const c = courbes(serie(), crw, forecast, NOW);
  const html = courbesSection(c, NOW);

  it("draws the measured waves, then the forecast in dots from now, the temperature, and four beaches by satellite", () => {
    expect(html).toContain('id="h-courbes"');
    expect(html.match(/<svg class="ch"/g)).toHaveLength(7);
    expect(html).toContain('class="ln-no"');
    expect(html).toContain('<line class="now"');
    expect(html).toContain("hauteur prévue par le modèle MFWAM de Météo-France à la place de la bouée de Saint-Pierre (large), pas une mesure");
    for (const p of crwSerie.POINTS) expect(html).toContain(`Au large de ${p.nom}`);
    expect(html).toContain("Une seule bouée, au large de Saint-Pierre");
    expect(html).toContain("Écart à la référence de NOAA");
    expect(html).toContain("qui n&#39;est pas la normale climatique 1991-2020");
    expect(html).toContain("Les bouées en courbes");
    expect(html).toContain("maximum sur 7 jours");
    expect(html).not.toContain("normale de NOAA");
    // Each source with its licence.
    expect(html).toContain("Cerema / Candhis (Licence Ouverte Etalab 2.0)");
    expect(html).toContain("NOAA Coral Reef Watch (Domaine public (NOAA))");
  });

  it("leaves a hole in the line where the buoy did not measure: the path starts again", () => {
    const waves = html.slice(html.indexOf("Hauteur des vagues"), html.indexOf("Période des vagues"));
    const d = /<path class="ln-n" d="([^"]+)"/.exec(waves)![1];
    expect(d.match(/M/g)!.length).toBeGreaterThan(1);
  });

  it("says since when the buoy is silent, past two hours", () => {
    const later = new Date(NOW.getTime() + 5 * HOUR);
    const last = serie().bouees["97410"].points.at(-1)![0];
    expect(courbesSection(courbes(serie(), crw, forecast, later), later)).toContain(`Pas de mesure depuis le 24/11 à ${new Date(last + 4 * HOUR).toISOString().slice(11, 16)}`);
    expect(html).not.toContain("Pas de mesure depuis");
  });

  it("is left out when nothing was read", () => {
    expect(courbesSection(courbes(null, null, undefined, NOW), NOW)).toBe("");
  });

  it("gives temperature_mer the same figures, in the same words", () => {
    const b = historiqueBlock(c, { lon: 55.47, lat: -21.34 }, 25, distanceKm)!;
    expect(b.bouees![0].bouee).toBe("Saint-Pierre (large)");
    const h = chiffresBlock(c.bouees[0].chiffres.hauteur!, metres, "m");
    expect(b.bouees![0].hauteur_significative).toEqual(h);
    expect(html).toContain(`<b>${h.derniere.replace(/ /g, "\u202f")}</b>`);
    expect(html).toContain(`en 24\u00a0h\u00a0: ${h.evolution_24h!.replace(/ /g, "\u202f")}`);
    const t = chiffresBlock(c.bouees[0].chiffres.temperature!, degres, "°C");
    expect(html).toContain(`moyenne ${t.sur_la_periode!.moyenne.replace(/ /g, "\u202f")}`);
    // Near Saint-Pierre, its beach only by satellite; the island, all four.
    expect(b.satellite!.map((s) => s.au_large_de)).toEqual(["Saint-Pierre"]);
    expect(b.satellite![0].ecart_a_la_reference_noaa).toBe("+1,5\u00a0°C");
    expect(b.reference_noaa).toBe(crwSerie.REFERENCE_OUTIL);
    expect(historiqueBlock(c)!.satellite).toHaveLength(4);
    // Far from the buoy, no buoy.
    expect(historiqueBlock(c, { lon: 55.45, lat: -20.88 }, 25, distanceKm)!.bouees).toBeUndefined();
  });
});

describe("« En courbes » with the two buoys of Météo-France", () => {
  // Sainte-Marie measures since 26/11/2026 (Candhis getCampListe of 28/11): with Saint-Pierre (large), the page drew
  // Sainte-Marie's curves and still said « Une seule bouée, au large de Saint-Pierre ».
  const both = (): candhis.Serie => {
    const s = serie();
    return { ...s, bouees: { "97409": { ...s.bouees["97410"], points: s.bouees["97410"].points.map((p) => [p[0], p[1] / 2, p[2], p[3], 90, p[5]] as candhis.Point) }, ...s.bouees } };
  };
  const c = courbes(both(), crw, forecast, NOW);
  const html = courbesSection(c, NOW);

  it("draws each buoy, in the order of the list, each with the forecast at its own place", () => {
    expect(c.bouees.map((b) => b.nom)).toEqual(["Sainte-Marie", "Saint-Pierre (large)"]);
    expect(c.bouees.map((b) => b.prevision?.modele)).toEqual(["MFWAM de Météo-France", "MFWAM de Météo-France"]);
    expect(html.match(/<svg class="ch"/g)).toHaveLength(10);
    for (const nom of ["Sainte-Marie", "Saint-Pierre (large)"]) {
      expect(html).toContain(`Hauteur des vagues à la bouée de ${nom} <small>`);
      expect(html).toContain(`Période des vagues à la bouée de ${nom} <small>`);
      expect(html).toContain(`Température de la mer à la bouée de ${nom} <small>`);
    }
    expect(html).toContain("La houle mesurée aux bouées de Sainte-Marie et de Saint-Pierre (large) sur 7 jours, puis la prévision");
  });

  it("says which buoys measure, never one alone", () => {
    expect(html).toContain("Deux bouées, au large de Sainte-Marie et de Saint-Pierre\u00a0: leurs mesures ne valent pas pour toute l&#39;île.");
    expect(html).not.toContain("Une seule bouée");
  });

  it("names Sainte-Marie when it measures alone", () => {
    const s = both();
    delete s.bouees["97410"];
    const one = courbesSection(courbes(s, crw, forecast, NOW), NOW);
    expect(one).toContain("Une seule bouée, au large de Sainte-Marie\u00a0: sa mesure ne vaut pas pour toute l&#39;île.");
    expect(one).not.toContain("Saint-Pierre\u00a0: sa mesure");
    expect(one).toContain("La houle mesurée à la bouée de Sainte-Marie sur 7 jours");
  });

  it("gives temperature_mer Sainte-Marie's figures near it, and Saint-Pierre's near Saint-Pierre", () => {
    const nord = historiqueBlock(c, { lon: 55.55, lat: -20.89 }, 25, distanceKm)!;
    expect(nord.bouees!.map((b) => b.bouee)).toEqual(["Sainte-Marie"]);
    expect(nord.bouees![0].hauteur_significative).toEqual(chiffresBlock(c.bouees[0].chiffres.hauteur!, metres, "m"));
    expect(historiqueBlock(c, { lon: 55.47, lat: -21.34 }, 25, distanceKm)!.bouees!.map((b) => b.bouee)).toEqual(["Saint-Pierre (large)"]);
    expect(historiqueBlock(c)!.bouees!.map((b) => b.bouee)).toEqual(["Sainte-Marie", "Saint-Pierre (large)"]);
  });
});

describe("« En courbes » says only what it draws", () => {
  it("never speaks of a forecast when none is drawn", () => {
    const html = courbesSection(courbes(serie(), crw, undefined, NOW), NOW);
    expect(html).toContain('<p class="eyebrow">Mesures</p>');
    expect(html).not.toMatch(/prévi|prévue/i);
    expect(html).not.toContain('class="ln-no"');
    expect(html).toContain("La houle mesurée à la bouée de Saint-Pierre (large) sur 7 jours. ");
  });

  it("says since when a buoy measures when it covers fewer days than the chart", () => {
    const s = serie();
    const since = NOW.getTime() - 3 * DAY;
    s.bouees["97410"] = { ...s.bouees["97410"], points: s.bouees["97410"].points.filter((p) => p[0] >= since) };
    const html = courbesSection(courbes(s, crw, forecast, NOW), NOW);
    expect(html).toContain("La houle mesurée à la bouée de Saint-Pierre (large) depuis le 21/11, puis la prévision des 4 jours à venir en pointillé.");
    expect(html).toContain("Hauteur des vagues mesurée à la bouée de Saint-Pierre (large) depuis le 21/11");
    expect(html).toContain("Température de la mer mesurée à la bouée de Saint-Pierre (large) depuis le 21/11");
    expect(html).toContain("La température de la mer à la bouée de Saint-Pierre (large) depuis le 21/11.");
    expect(html).not.toContain("Saint-Pierre (large) sur 7 jours");
    expect(html).toContain('<p class="eyebrow">Mesures et prévision</p>');
  });

  it("starts a young buoy's temperature chart on its first day, and says its highest since then, never over 7 days", () => {
    const s = serie();
    const since = NOW.getTime() - 3 * DAY;
    s.bouees["97410"] = { ...s.bouees["97410"], points: s.bouees["97410"].points.filter((p) => p[0] >= since) };
    const c = courbes(s, crw, undefined, NOW);
    const b = c.bouees[0];
    // From the day of its first measurement (21/11) to the end of today: 4 days, not 30.
    expect(b.debut_t).toBe(minuitLocal(since));
    expect(b.temperature).toHaveLength(4 * 24);
    expect(b.temperature.slice(0, 24).some((v) => v != null)).toBe(true);
    // The buoy's block only: the satellite's 30 days keep their week.
    const html = buoysSection(c, NOW);
    expect(html).toContain("maximum depuis le 21/11");
    expect(html).not.toContain("maximum sur 7 jours");
    expect(html).toContain("Température de la mer mesurée à la bouée de Saint-Pierre (large) depuis le 21/11");
    // One label a day on a short chart.
    const svg = html.slice(html.indexOf("Température de la mer à la bouée"));
    for (const j of ["21/11", "22/11", "23/11", "24/11"]) expect(svg).toContain(`>${j}<`);
    // The tool says the same.
    const t = historiqueBlock(c)!.bouees![0].temperature_eau!;
    expect(t).not.toHaveProperty("maximum_sur_7_jours");
    expect(t.maximum_depuis_la_premiere_mesure).toMatch(/, mesures depuis le 21\/11$/);
  });

  it("keeps the 30 days and « maximum sur 7 jours » for a buoy measuring for a month", () => {
    const c = courbes(serie(), crw, undefined, NOW);
    expect(c.bouees[0].temperature).toHaveLength(30 * 24);
    expect(buoysSection(c, NOW)).toContain("maximum sur 7 jours");
    expect(historiqueBlock(c)!.bouees![0].temperature_eau).toHaveProperty("maximum_sur_7_jours");
  });

  it("gives each buoy its own span when they differ", () => {
    const s = serie();
    const since = NOW.getTime() - 3 * DAY;
    s.bouees["97409"] = { ...s.bouees["97410"], points: s.bouees["97410"].points.filter((p) => p[0] >= since) };
    const html = courbesSection(courbes(s, crw, undefined, NOW), NOW);
    expect(html).toContain("La houle mesurée à la bouée de Sainte-Marie depuis le 21/11 et à la bouée de Saint-Pierre (large) sur 7 jours.");
  });
});

describe("/mer as a whole: the buoys first, each subject once, every word from what is drawn", () => {
  const beach = (nom: string, lon: number, lat: number, valeur: number) => ({ nom, commune: "Saint-Paul", lon, lat, valeur, jour: "2026-11-23", heure: "2026-11-23T22:04:00Z", distance_km: 3, houle: { hauteur_m: 1.2, maintenant: "1,2 m de l'ouest, période 10 s", heure: "9 h", max: "1,6 m", max_jour: "mardi", modele: "MFWAM de Météo-France" } });
  const s = serie();
  s.bouees["97409"] = { ...s.bouees["97410"], points: s.bouees["97410"].points.filter((p) => p[0] >= NOW.getTime() - 3 * DAY) };
  const c = courbes(s, crw, forecast, NOW);
  // Saint-Pierre (large) measured 20 minutes ago; Sainte-Marie has been silent for 8 hours.
  const sea = {
    plages: [beach("Plage de Boucan-Canot", 55.22, -21.03, 26.9), beach("Plage de la Saline les Bains", 55.24, -21.1, 27.4)],
    bouees: [{ t: NOW.getTime() - 20 * 60_000, nature: "mesure", bouee: "Saint-Pierre (large)", reseau: "Candhis (Cerema)", mesuree_a: "24/11 10:00", hauteur_significative: "1,1\u00a0m", hauteur_selon: "H1/3", vague_max: "1,9\u00a0m", periode: "8 s", periode_selon: "TH1/3", temperature_eau: "26,8\u00a0°C" }],
    courbes: { ...c, bouees: c.bouees.map((b) => (b.code === "97409" ? { ...b, chiffres: Object.fromEntries(Object.entries(b.chiffres).map(([k, v]) => [k, { ...v!, le: NOW.getTime() - 8 * HOUR }])) } : b)) },
    maree: [{ maregraphe: "Sainte-Marie", hauteur_m: 0.45, reference: "au-dessus du zéro hydrographique (zéro des cartes marines)", tendance: "montante", heure_mesure: "24/11 10:10", age_texte: "il y a 10 min", derniers_extremes: [] }],
    sources: [],
  } as unknown as SeaData;
  const page = seaPage("https://rundata.re", { value: sea, fetchedAt: NOW, stale: false } as never, NOW);
  const band = page.slice(page.indexOf("<h1>"), page.indexOf('id="h-courbes"'));

  it("says each buoy at the top, the time first and the buoy named, then the satellite as a pass", () => {
    expect(page).toContain('<p class="pill">Mesure des bouées · 24/11 à 10:00</p>');
    expect(band).toMatch(/<b>Mesurée le 24\/11 à 10:00<\/b> à la bouée de Saint-Pierre \(large\)\u00a0: houle de <b>1,1\s?m<\/b>, vagues jusqu'à 1,9\s?m, période 8\s?s, mer à <b>26,8\s?°C<\/b>\./u);
    // No direction measured: none said.
    expect(band).not.toMatch(/houle de <b>1,1\u202fm<\/b> de l/);
    // Silent for more than 6 hours: said, never dropped without a word.
    expect(band).toContain("Bouée de Sainte-Marie\u00a0: <b>dernière mesure le 24/11 à 02:20</b>, plus rien depuis.");
    expect(band.indexOf("à la bouée de")).toBeLessThan(band.indexOf("vue par satellite"));
    expect(band).toContain("un instant et pas la moyenne de la journée");
  });

  it("says the tide right after the buoys: measured at its gauge, its time first, then the next ones computed, with a link", () => {
    const line = /<b>Marée mesurée le 24\/11 à 10:10<\/b> au marégraphe Sainte-Marie\u00a0: marée montante, 0,45\s?m\. Prochaines marées, un calcul, pas la prédiction du SHOM\u00a0: (pleine|basse) mer [^,]+, (pleine|basse) mer [^.]+\./u;
    expect(band).toMatch(line);
    expect(band).toContain('<a href="#h-maree">La marée en ce moment, et les prochaines →</a>');
    // The other gauge, without a reading: its computed tides, named.
    expect(band).toMatch(/Au marégraphe Pointe des Galets \(Le Port\), prochaines marées, un calcul, pas la prédiction du SHOM/);
    expect(band.indexOf("à la bouée de")).toBeLessThan(band.indexOf("Marée mesurée"));
    expect(band.indexOf("Marée mesurée")).toBeLessThan(band.indexOf("vue par satellite"));
  });

  it("puts each subject in one block, in the order of use", () => {
    // The beaches' map and the question to the assistant: once each, below.
    expect(page.match(/class="card mapcard"/g)).toHaveLength(1);
    expect(page.indexOf('class="card mapcard"')).toBeGreaterThan(page.indexOf('id="h-plages"'));
    // The 300 m rule: one line at the top, after the tide and before the satellite (a safety rule is said first).
    expect(band.match(/href="#h-requin"/g)).toHaveLength(1);
    expect(band.indexOf("Marée mesurée")).toBeLessThan(band.indexOf('href="#h-requin"'));
    expect(band.indexOf('href="#h-requin"')).toBeLessThan(band.indexOf("vue par satellite"));
    expect(band).not.toContain("Lis https://rundata.re/mer");
    expect(page).not.toContain("h-houle-mesuree");
    const order = ["h-courbes", "h-maree", "h-houle", "h-plages", "h-satellite-courbes", "h-requin", "h-lire-mer", "h-ia"].map((id) => page.indexOf(`id="${id}"`));
    for (const i of order) expect(i).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names the model of each beach's forecast, and says where the swell is measured", () => {
    expect(page).toContain("<span>modèle MFWAM de Météo-France</span>");
    expect(page).toContain("La houle est mesurée aux bouées de Saint-Pierre (large) et de Sainte-Marie, et prévue près des plages");
    expect(page).not.toContain("La houle, elle, est une prévision");
    expect(page).not.toContain("Au mieux, la mesure d&#39;hier");
  });

  it("links temperature_mer's 30 days to an anchor /mer draws: the buoys' block, else the satellite's when no buoy is shown", () => {
    const anchor = (url: string) => url.slice(url.indexOf("#") + 1);
    const avec = historiqueBlock(c)!.page;
    expect(avec).toBe("https://rundata.re/mer#h-courbes");
    expect(page).toContain(`id="${anchor(avec)}"`);
    // No buoy read (no key, or KV holds none): the satellite's days alone.
    const seul = courbes(null, crw, undefined, NOW);
    const sans = historiqueBlock(seul)!.page;
    expect(sans).toBe("https://rundata.re/mer#h-satellite-courbes");
    const pageSans = seaPage("https://rundata.re", { value: { ...sea, bouees: [], courbes: seul }, fetchedAt: NOW, stale: false } as never, NOW);
    expect(pageSans).toContain(`id="${anchor(sans)}"`);
    expect(pageSans).not.toContain('id="h-courbes"');
  });

  it("never announces a span the series does not draw", () => {
    const blocs = page.slice(page.indexOf('id="h-courbes"'), page.indexOf('id="h-houle"'));
    expect(blocs).toContain("à la bouée de Sainte-Marie depuis le 21/11");
    expect(blocs).not.toMatch(/Sainte-Marie sur (7|30) jours/);
    expect(blocs).toContain("Température de la mer mesurée à la bouée de Sainte-Marie depuis le 21/11");
    expect(blocs).toContain("Hauteur des vagues mesurée à la bouée de Saint-Pierre (large) sur 7 jours");
  });
});

describe("the curves and the top of /mer", () => {
  it("end on the same last measurement: the state's, added to a series completed after it", () => {
    const s = serie();
    const last = s.bouees["97410"].points.at(-1)!;
    const m: candhis.Mesure = { code: "97410", t: last[0] + 30 * 60_000, hauteur: 1.4, hauteur_selon: "H1/3", hmax: 2.4, periode: 10, periode_selon: "TH1/3", direction: 225, temperature: 27.3 } as candhis.Mesure;
    const etat = { essai: NOW.getTime(), mesures: { "97410": m } } as candhis.Etat;
    const plus = candhis.avecDernieres(s, etat);
    expect(plus.bouees["97410"].points.at(-1)).toEqual([m.t, 1.4, 2.4, 10, 225, 27.3]);
    expect(plus.bouees["97410"].points).toHaveLength(s.bouees["97410"].points.length + 1);
    // Already in the series: kept once; the series itself untouched.
    expect(candhis.avecDernieres(plus, etat).bouees["97410"].points).toHaveLength(plus.bouees["97410"].points.length);
    expect(s.bouees["97410"].points.at(-1)).toBe(last);
    const c = courbes(plus, crw, undefined, NOW);
    expect(c.bouees[0].chiffres.hauteur!.derniere).toBe(1.4);
    expect(c.bouees[0].chiffres.temperature!.derniere).toBe(27.3);
  });
});

describe("the small charts", () => {
  it("place a line that starts later and steps several labels, as the forecast every 3 hours", () => {
    const svg = chart({ label: "x", labels: ["a", "b", "c", "d", "e", "f", "g"], every: 1, min: 0, max: 2, lines: [{ pts: [1, 1, 1], cls: "ln-no", debut: 1, pas: 3 }] });
    const xs = [...svg.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    expect(xs[2] - xs[1]).toBeCloseTo(xs[1] - xs[0], 0);
    expect(xs[1] - xs[0]).toBeCloseTo(3 * ((600 - 52 - 10) / 7), 0);
  });
});

describe("the corals beside the curves", () => {
  it("say in temperature_mer exactly what they said before, whether the curves' series answer or not", async () => {
    const { Cache } = await import("../src/cache.js");
    const { temperatureMer } = await import("../src/tools/mer.js");
    const CORAUX = "time,latitude,longitude,CRW_HOTSPOT,CRW_DHW,CRW_SST\nUTC,degrees_north,degrees_east,Celsius,Celsius weeks,Celsius\n" +
      ["-21.075,55.225", "-21.375,55.475", "-21.125,55.825"].map((c) => `2026-11-22T12:00:00Z,${c},0.5,1.2,27.1`).join("\n") + "\n";
    const SERIE = "time,latitude,longitude,CRW_SST,CRW_SSTANOMALY\nUTC,degrees_north,degrees_east,Celsius,Celsius\n2026-11-22T12:00:00Z,-21.075,55.225,26.82,1.47\n";
    const run = async (series: boolean) => {
      vi.stubGlobal("fetch", async (url: string) => {
        if (String(url).includes("CRW_HOTSPOT")) return new Response(CORAUX);
        if (String(url).includes("CRW_SSTANOMALY") && series) return new Response(SERIE);
        throw new Error("offline");
      });
      const r = JSON.parse((await temperatureMer(new Cache(undefined, () => NOW.getTime()), undefined, NOW)).content[0].text);
      return { coraux: JSON.stringify(r.coraux), histo: r.sur_30_jours };
    };
    const [sans, avec] = [await run(false), await run(true)];
    expect(avec.histo.satellite).toHaveLength(4);
    expect(sans.histo).toBeUndefined();
    expect(avec.coraux).toBe(sans.coraux);
  });
});
