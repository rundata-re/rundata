import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import data from "../src/electricite/installations.json" with { type: "json" };
import { POINTS_SCRIPT } from "../src/web/carte-points.js";
import * as edf from "../src/providers/edf.js";
import { buildElectricite, journeeOf } from "../src/web/data.js";
import { electricitePage } from "../src/web/domains.js";
import { anneeSection, diametre, INSTALLE, installationsList, installationsMap, installationsReplay, MIS_A_JOUR, productionChart } from "../src/web/electricite-carte.js";
import { esc, laterMap, NOMS_SCRIPT } from "../src/web/map.js";

// EDF's lines of 31/10/2026 05:15 and 05:20, read on its open data: the batteries charging (-2.1 MW) at 05:20.
const l1515 = { date: "2026-10-31T05:15:00+04:00", stockage: 1.5, diesel: 108, turbines_combustion: 14, bioenergies: 51, charbon: 77, photovoltaique: 2, total: 284, hydraulique: 25, eolien: 5, statut: "Estimé" };
const l0520 = { date: "2026-10-31T05:20:00+04:00", stockage: -2.1174, diesel: 107.732, turbines_combustion: 13.926, bioenergies: 51.316, charbon: 76.542, photovoltaique: 3.77, total: 281.028, hydraulique: 25.248, eolien: 4.612, statut: "Estimé" };

const j0 = journeeOf({ lignes: [l1515, l0520], mis_a_jour: "Sat, 31 Oct 2026 01:15:35 GMT" })!;

describe("the 24 hours of /electricite", () => {
  const j = journeeOf({ lignes: [l1515, l0520], mis_a_jour: "Sat, 31 Oct 2026 01:15:35 GMT" })!;

  it("keeps each point as minutes, renewable and non-renewable MW without the batteries, and EDF's total", () => {
    expect(j.debut).toBe("2026-10-31T01:15:00.000Z");
    // Biomasse and bioliquide renewable, as EDF names them; the batteries in no part, charging or not.
    expect(j.points).toEqual([[0, 268, 14, 284], [5, 269.2, 13.9, 281]]);
    expect(j.mis_a_jour).toBe("31/10 05:15");
  });

  it("keeps only the 24 hours before the latest line, oldest first", () => {
    // A stray line of 06/10 among the day's, as EDF's dataset held on 31/10/2026, newest first as read.
    const stray = { ...l1515, date: "2026-10-06T13:35:00+04:00" };
    expect(journeeOf({ lignes: [l0520, l1515, stray] })!.points).toEqual(j.points);
  });

  it("keeps each point's MW by filière, as the map names them: solar, wind, hydro, bioénergies, thermique, the batteries giving out", () => {
    // Bioénergies with EDF's biomasse and bioliquide (its columns charbon and diesel), the turbines apart; at 05:20
    // the batteries charging count for nothing.
    expect(j.mix).toEqual([[2, 5, 25, 51 + 77 + 108, 14, 1.5], [3.8, 4.6, 25.2, 235.6, 13.9, 0]]);
  });

  it("has no chart under two points", () => {
    expect(journeeOf({ lignes: [l0520] })).toBeUndefined();
  });

  it("says the latest moment under the chart, as the cursor says it, and the date of EDF's update", () => {
    const html = productionChart(j);
    expect(html).toContain("31/10 à 05:20 : 281 MW, dont 95 % renouvelable.");
    expect(html).toContain("estimée par EDF (mise à jour le 31/10 à 05:15)");
    // The replay's bar waits for the script; the points it plays, in whole MW.
    expect(html).toMatch(/<div class="rj ech-rj" hidden>/);
    const ech = JSON.parse(html.match(/data-ech="([^"]+)"/)![1].replace(/&quot;/g, '"'));
    expect(ech.p).toEqual([[0, 268, 14, 284], [5, 269, 14, 281]]);
    // Each filière's whole MW, for the chart « Par filière » and the map's rounds, with each group's MW installed.
    expect(ech.m).toEqual([[2, 5, 25, 236, 14, 2], [4, 5, 25, 236, 14, 0]]);
    expect(ech.i).toEqual(INSTALLE.map((mw) => Math.round(mw * 10) / 10));
  });

  it("offers the renewable part or each filière in the map's colours, the renewable first, the filières' legend under the chart", () => {
    const html = productionChart(j);
    expect(html).toContain('<div class="ech-d ech-v" role="group" aria-label="Vue du graphique" hidden><button type="button" aria-pressed="true" data-v="ren">Renouvelable</button><button type="button" aria-pressed="false" data-v="fil">Par filière</button></div>');
    const keys = html.match(/<span class="mlg ech-kf" hidden>(.*?)<\/span><span class="mls/)![1];
    expect([...keys.matchAll(/class="(f-[a-z]+)"/g)].map((m) => m[1])).toEqual(["f-bio", "f-sol", "f-hyd", "f-eol", "f-the"]);
    expect(keys).toContain("thermique non renouvelable</span>");
    // The durations without « depuis le … » in their buttons: under them, filled by the script.
    expect(html).toContain('data-d="j7" hidden>7\u00a0jours</button>');
    expect(html).toContain('<p class="mls ech-dd" hidden></p>');
  });

  it("draws its graduations by the style, no figures in the page that iOS would read as a phone number", () => {
    const html = productionChart(j);
    const axis = html.match(/<span class="ech-ax" aria-hidden="true">(.*?)<\/span><\/div>/)![1];
    // Nothing but its tags: no text between them.
    expect(axis).toMatch(/^(?:<[^<>]*>)+$/);
    expect(axis).toContain('class="cy" style="top:0.00%" data-v="300\u00a0MW"');
    expect(axis).not.toMatch(/>\d/);
  });

  it("has the map's replay with the words of the estimate, hidden until the script, none without the filières", () => {
    const r = installationsReplay(j);
    expect(r).toMatch(/^<div class="ip-rj" hidden>/);
    expect(r).toContain('aria-label="Lire les 24\u00a0dernières heures sur la carte"');
    expect(r).toContain('<input type="range" min="0" max="1" step="1" value="1" aria-label="Moment affiché sur la carte">');
    expect(r).toContain("Estimé\u00a0: chaque rond suit sa filière sur toute l'île, d'après la production publiée par EDF le ");
    expect(r).toContain("La taille d'un rond n'est pas la production de cette centrale\u00a0: EDF ne la publie pas.");
    expect(r).toContain(">Revenir à la puissance installée</button>");
    expect(installationsReplay({ ...j, mix: undefined })).toBe("");
    // A page's copy kept before the filières' MW, with only the groups of the map: no replay, no view by filière.
    const old = { ...j, mix: undefined, filieres: [[2, 5, 25, 250, 1.5], [3.8, 4.6, 25.2, 249.5, 0]] } as never;
    expect(installationsReplay(old)).toBe("");
    const chart = productionChart(old);
    expect(chart).toContain(productionChart(j).match(/<p class="ech-m"[^>]*>[^<]*<\/p>/)![0]);
    expect(chart.split("<script>")[0]).not.toMatch(/&quot;[fmi]&quot;|ech-v|ech-kf/);
  });

  it("shows EDF's years in the bars of « Filière par filière », a button per year, without the line of every year", () => {
    const a = anneeSection();
    expect(a).toContain('<div class="ech-d an-d" role="group" aria-label="Année du bilan"></div>');
    expect(a).toContain('<ul class="bars an-l"></ul>');
    expect(a).not.toContain("<table");
    const html = productionChart(j);
    expect(html).toContain('el("i",i<4?"ren":null)');
    expect(html).not.toContain("Par année");
  });

  it("puts the replay's bar right under the map, before its legend, so the map stays on a phone's screen while it moves", () => {
    const html = electricitePage("https://rundata.re", { value: { resume: "", avertissements: [], sources: [], journee: j }, fetchedAt: new Date(), stale: false } as never);
    const at = ['class="ipm"', 'class="ip-rj"', 'class="mlg ipk"'].map((c) => html.indexOf(c));
    expect(at[0]).toBeGreaterThan(0);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe("the map of the power installed", () => {
  const map = installationsMap();
  const marks = [...map.matchAll(/<a class="mk ip" href="#(inst-[^"]+)"[^>]*data-tp="([^"]+)"/g)];

  it("has one zone per commune of the register, leading to its line of the list", () => {
    expect(marks.map((m) => m[2]).sort()).toEqual(data.communes.map((c) => esc(c.commune)).sort());
    const list = installationsList();
    for (const [, id] of marks) expect(list).toContain(`id="${id}"`);
  });

  it("gives each round its group and its MW for the replay, the groups' MW summed from the register", () => {
    const rounds = [...map.matchAll(/<circle class="sh [^"]+" [^>]*\/>/g)].map((m) => m[0]);
    expect(rounds.length).toBe(data.communes.reduce((n, c) => n + c.filieres.length, 0));
    for (const r of rounds) expect(r).toMatch(/ data-g="[0-4]" data-mw="[\d.]+"/);
    const sum = (...noms: string[]) => data.communes.flatMap((c) => c.filieres).filter((f) => noms.includes(f.nom)).reduce((n, f) => n + f.mw, 0);
    expect(INSTALLE[0]).toBeCloseTo(sum("solaire"));
    expect(INSTALLE[3]).toBeCloseTo(sum("bioénergies", "thermique non renouvelable"));
  });

  it("draws a round's surface as its power, never under 30 units", () => {
    expect(diametre(0.1)).toBe(30);
    expect(diametre(200) / diametre(50)).toBeCloseTo(2, 5);
  });

  it("dates the register by its update", () => {
    expect(MIS_A_JOUR).toBe(data.mis_a_jour.split("-").reverse().join("/"));
    expect(map).toContain(esc(`registre d'EDF mis à jour le ${MIS_A_JOUR}`));
  });
});

describe("a map put in the page as it nears the screen", () => {
  it("waits in a template, then the scripts of the points and of the names take it", () => {
    const html = laterMap('<svg class="map"></svg>');
    expect(html).toMatch(/^<template class="carte"><svg class="map"><\/svg><\/template><script>/);
    expect(html).toContain("IntersectionObserver");
    expect(POINTS_SCRIPT).toContain('document.addEventListener("carte"');
    expect(POINTS_SCRIPT).toContain('document.querySelector("template.carte,svg.map[data-kc]")');
    expect(NOMS_SCRIPT).toContain('document.addEventListener("carte"');
  });
});

describe("one read of EDF's production for the page", () => {
  const NOW = new Date("2026-10-31T01:25:00Z");
  // EDF's answer, newest first as asked (sort=-date), with the fields data-fair adds to each line.
  const day = { results: [l0520, l1515].map((l, i) => ({ ...l, _id: `x${i}`, _i: i, _rand: 1, jour: "2026-10-31" })) };
  let asked: string[] = [];
  const stub = (dayStatus = 200) => {
    asked = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const u = String(input);
      asked.push(u);
      if (u.includes("njq-knwu0diqrdup6tya8qxi") && u.includes("size=300")) {
        return dayStatus === 200 ? Response.json(day, { headers: { "last-modified": "Sat, 31 Oct 2026 01:22:00 GMT" } }) : new Response("", { status: dayStatus });
      }
      if (u.includes("njq-knwu0diqrdup6tya8qxi") && u.includes("size=1&")) return Response.json({ results: [{ ...l0520, _id: "y" }] });
      return new Response("", { status: 404 });
    });
  };
  const production = () => asked.filter((u) => u.includes("njq-knwu0diqrdup6tya8qxi"));
  afterEach(() => vi.unstubAllGlobals());

  it("reads the 24 hours newest first in one request, keeps them oldest first, without data-fair's fields, dated by Last-Modified", async () => {
    stub();
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    const c = await edf.journee(cache);
    expect(production()).toHaveLength(1);
    expect(production()[0]).toContain("size=300&sort=-date");
    expect(c.value.lignes).toEqual([l1515, l0520]);
    expect(c.value.mis_a_jour).toBe("2026-10-31T01:22:00.000Z");
    // Within its freshness (the live line's, 4 min), not read again.
    await edf.journee(cache);
    expect(production()).toHaveLength(1);
  });

  it("gives the day's latest line as the live one, with the day's read time", async () => {
    stub();
    const c = await edf.journee(new Cache(new MemoryStore(), () => NOW.getTime()));
    const l = edf.latest(c);
    expect(l.value).toEqual(l0520);
    expect(l.fetchedAt).toEqual(c.fetchedAt);
  });

  it("builds the page's copy from that one read: the chart and the live line, EDF's production asked once", async () => {
    stub();
    const d = await buildElectricite(new Cache(new MemoryStore(), () => NOW.getTime()), NOW);
    // Once, and never the line alone besides: a second read would cost the page a subrequest more.
    expect(production()).toHaveLength(1);
    expect(production().some((u) => u.includes("size=1&"))).toBe(false);
    expect(d.journee?.points).toEqual(j0.points);
    expect(d.production?.total_mw).toBe(281);
  });

  it("reads the live line alone, and has no chart, when the 24 hours do not answer", async () => {
    stub(503);
    const d = await buildElectricite(new Cache(new MemoryStore(), () => NOW.getTime()), NOW);
    expect(production().filter((u) => u.includes("size=1&"))).toHaveLength(1);
    expect(d.journee).toBeUndefined();
    expect(d.production?.total_mw).toBe(281);
  });
});
