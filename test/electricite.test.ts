import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { breakdown, constraints, electricite, PERIMEE_MIN, produced } from "../src/tools/electricite.js";
import { electriciteLive, electricitePage } from "../src/web/domains.js";

const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
// EDF's open data of 23/10/2026 around 03:15 heure de La Réunion: a night mix, peak hours in the evening.
const NOW = new Date("2026-10-22T23:20:00Z");
const mix = () => { const { _id, _i, _rand, _score, _updatedAt, jour, ...m } = fixture("edf_mix.json").results[0]; return m; };
const hours = () => fixture("edf_signal.json").results;
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("electricity", () => {
  // The mairies' notices of power cuts are not read here (test/courant.test.ts).
  beforeEach(() => vi.stubGlobal("fetch", async () => new Response("", { status: 404 })));
  afterEach(() => vi.unstubAllGlobals());

  it("shares out the production and adds up the renewables", () => {
    const b = breakdown(mix());
    expect(b.parts[0].filiere).toBe("bioliquide");
    expect(b.renouvelable_pct).toBe(100);
  });

  // EDF's line of 31/10/2026 05:20, read on its open data: the batteries charging (-2.1 MW).
  const line = { date: "2026-10-31T05:20:00+04:00", stockage: -2.1174, diesel: 107.732, turbines_combustion: 13.926, bioenergies: 51.316, charbon: 76.542, photovoltaique: 3.77, total: 281.028, hydraulique: 25.248, eolien: 4.612, statut: "Estimé" };

  it("counts biomass and bioliquid as renewable, as EDF titles its columns", () => {
    const b = breakdown(line);
    expect(b.renouvelable_pct).toBe(95.1);
    expect(b.parts.map((p) => [p.filiere, p.renouvelable])).toEqual([
      ["bioliquide", true],
      ["biomasse", true],
      ["bioénergies", true],
      ["hydraulique", true],
      ["turbines à combustion", false],
      ["éolien", true],
      ["solaire photovoltaïque", true],
    ]);
  });

  it("leaves the batteries out of the shares, in charge or not, and says EDF's total", async () => {
    expect(produced(line)).toBeCloseTo(283.146, 3);
    const b = breakdown(line);
    expect(b.parts.some((p) => p.filiere.startsWith("stockage"))).toBe(false);
    expect(b.parts.reduce((s, p) => s + p.part_pct, 0)).toBeCloseTo(100, 0);
    // Discharging, they give back what the others produced: the share does not move.
    expect(breakdown({ ...line, stockage: 5, total: 288.146 })).toEqual(b);
    const store = new MemoryStore();
    void store.put("edf:mix", { value: line, fetchedAt: Date.parse("2026-10-31T01:25:00Z") });
    const at = new Date("2026-10-31T01:25:00Z");
    const r = body(await electricite(new Cache(store, () => at.getTime()), at));
    expect(r.production).toMatchObject({ total_mw: 281, renouvelable_pct: 95.1 });
    expect(r.resume).toMatch(/^Production d'électricité à 05:20 \(il y a 5 min\) : 281 MW, dont 95,1 % renouvelable\./);
  });

  it("says a line older than an hour first, as not the production of now, in the tool and above the page's figure", async () => {
    const read = async (value: typeof line, at: Date) => {
      const store = new MemoryStore();
      void store.put("edf:mix", { value, fetchedAt: at.getTime() });
      return body(await electricite(new Cache(store, () => at.getTime()), at));
    };
    const after = (min: number) => new Date(Date.parse(line.date) + min * 60_000);
    // The line of 05:20 read 23 hours later: its age first, the value in the past.
    const warned = "Dernière mesure de production lue chez EDF : le 31/10 à 05:20, il y a 23 h. Ce n'est pas la production de maintenant.";
    const old = await read(line, after(23 * 60));
    expect(old.resume.startsWith(`${warned} La production était alors de 281 MW, dont 95,1 % renouvelable. Principales filières : `)).toBe(true);
    expect(old.production).toMatchObject({ heure_mesure: "31/10 05:20 heure de La Réunion", age_min: 1380, perimee: true, avertissement: warned });
    // The age as everywhere: in minutes up to 90, in days from 48 hours.
    expect((await read(line, after(PERIMEE_MIN + 1))).production.avertissement).toBe(
      "Dernière mesure de production lue chez EDF : le 31/10 à 05:20, il y a 61 min. Ce n'est pas la production de maintenant.");
    expect((await read(line, after(3 * 1440))).resume).toMatch(/^Dernière mesure de production lue chez EDF : le 31\/10 à 05:20, il y a 3 jours\. /);
    // An hour is not late yet: EDF puts a line every 5 minutes, about 5 minutes after its time.
    const hour = await read(line, after(PERIMEE_MIN));
    expect(hour.resume).toMatch(/^Production d'électricité à 05:20 \(il y a 60 min\) : 281 MW/);
    expect(hour.production).not.toHaveProperty("perimee");
    expect(hour.production).not.toHaveProperty("avertissement");
    // A line of yesterday is said with its day, even fresh: 23:55 read at 00:05.
    const late = { ...line, date: "2026-10-31T23:55:00+04:00" };
    expect((await read(late, new Date("2026-10-31T20:05:00Z"))).resume).toMatch(/^Production d'électricité le 31\/10 à 23:55 \(il y a 10 min\) : 281 MW/);

    // The page: the figure with its day and its time, never « en ce moment ».
    const fresh = { value: await read(line, after(5)), fetchedAt: after(5), stale: false };
    const page = electricitePage("https://rundata.re", fresh, after(5));
    expect(page).toContain("de l'électricité de l'île venait de sources <b>renouvelables</b> le 31/10 à 05:20, sur <b>281 MW</b> produits.</p>");
    expect(page).not.toContain("vient en ce moment");
    expect(page).not.toContain("Dernière mesure de production");
    expect(page).toContain(`<p class="pill"><span class="dot"></span>Production en direct</p>`);
    expect(electricitePage("https://rundata.re", fresh, after(PERIMEE_MIN))).toContain(`<p class="pill"><span class="dot"></span>Production en direct</p>`);
    // The same copy kept two hours while EDF does not answer: its age at this view, above the figure, a neutral note.
    const kept = electricitePage("https://rundata.re", fresh, after(125));
    expect(kept).toContain(`<p class="note">Dernière mesure de production lue chez EDF : le 31/10 à 05:20, il y a 2 h. Ce n&#39;est pas la production de maintenant.</p><div class="now">`);
    // Its pill no longer says « en direct », without the live dot.
    expect(kept).toContain(`<p class="pill">Dernière mesure lue chez EDF</p>`);
    expect(kept).not.toContain("Production en direct");
    // A copy built late says it as the tool did.
    const built = { value: old, fetchedAt: after(23 * 60), stale: false };
    expect(electricitePage("https://rundata.re", built, after(23 * 60))).toContain(`<p class="note">Dernière mesure de production lue chez EDF : le 31/10 à 05:20, il y a 23 h. Ce n&#39;est pas la production de maintenant.</p><div class="now">`);
  });

  it("runs the strained hours together", () => {
    const c = constraints(hours());
    expect(c[0]).toEqual({ quand: "vendredi 23/10 de 18\u00a0h à 22\u00a0h", signal: "heures de pointe", recharge_conseillee_pct: 50 });
  });

  it("answers from cached EDF data", async () => {
    const store = new MemoryStore();
    void store.put("edf:mix", { value: mix(), fetchedAt: NOW.getTime() });
    void store.put("edf:signal", { value: hours(), fetchedAt: NOW.getTime() });
    const r = body(await electricite(new Cache(store, () => NOW.getTime()), NOW));
    expect(r.resume).toMatch(/^Production d'électricité à 03:\d\d \(il y a \d+ min\) : \d+ MW, dont [\d,]+ % renouvelable\./);
    expect(r.resume).toContain("Météo de l'électricité EDF pour cette heure : optimal.");
    expect(r.resume).toContain("vendredi 23/10 de 18\u00a0h à 22\u00a0h (heures de pointe)");
  });

  it("says EDF's signal with the update of its dataset, as EDF's terms ask, in the tool, the page and the home tile", async () => {
    // The lines' Last-Modified is the dataset's update (« dataUpdatedAt » on opendata-reunion.edf.fr): one request.
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).includes("7tgfic35") ? new Response(JSON.stringify(fixture("edf_signal.json")), { headers: { "last-modified": "Thu, 22 Oct 2026 18:00:37 GMT" } }) : new Response("", { status: 404 }));
    const store = new MemoryStore();
    void store.put("edf:mix", { value: mix(), fetchedAt: NOW.getTime() });
    const r = body(await electricite(new Cache(store, () => NOW.getTime()), NOW));
    expect(r.resume).toContain("Météo de l'électricité EDF pour cette heure : optimal (annoncée par EDF le 22/10 à 22:00).");
    expect(r.meteo_electricite.mis_a_jour).toBe("22/10 22:00");
    const data = { value: r, fetchedAt: NOW, stale: false };
    expect(electricitePage("https://rundata.re", data, NOW)).toContain("Signal d'EDF pour le 23/10 de 3\u00a0h à 4\u00a0h : <b>optimal (le réseau électrique a de la marge)</b> (annoncé par EDF le 22/10 à 22:00).");
    expect(electriciteLive(data, NOW)?.detail).toContain("· signal EDF optimal (annoncé le 22/10 à 22:00)");
    // A copy of the signal kept from before: the hours alone, said without a date rather than not at all.
    const before = new MemoryStore();
    void before.put("edf:signal", { value: hours(), fetchedAt: NOW.getTime() });
    expect(body(await electricite(new Cache(before, () => NOW.getTime()), NOW)).resume).toContain("Météo de l'électricité EDF pour cette heure : optimal.");
  });
});
