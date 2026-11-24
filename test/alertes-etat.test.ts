import { describe, expect, it } from "vitest";
import { changements, detecter, ETAT_KEY, etatDe, type EtatAlertes } from "../src/alertes-etat.js";
import * as mf from "../src/providers/vigilance.js";
import type { VolcanAnswer } from "../src/web/data.js";

// The alerts a push would follow, read from the copies the site already keeps (vigilance, /volcan): no send yet, a log
// line at each change, so that how often it would send is measured before anyone is notified.

const NOW = new Date("2026-11-24T06:00:00Z");
const vigilance = (zones: mf.Vigilance["zones"]): mf.Vigilance => ({ emise: "2026-11-24T05:00:00Z", zones, suivi: [] });
const volcan = (niveau_orsec: string, inconnu = false) => ({ resume: "", etat: { eruption_en_cours: false, niveau_orsec, ...(inconnu ? { niveau_inconnu: true } : {}) } }) as unknown as VolcanAnswer;
const calme = vigilance({ "VIGI974-13": { 12: [{ couleur: 1, debut: "2026-11-24T00:00:00Z" }] } });

describe("the state of the alerts", () => {
  it("keeps the orange and red of each zone and phenomenon, the cyclone step in force and the volcano's level", () => {
    const v = vigilance({
      "VIGI974-13": { 12: [{ couleur: 2, debut: "2026-11-24T00:00:00Z", fin: "2026-11-24T12:00:00Z" }, { couleur: 3, debut: "2026-11-24T12:00:00Z" }] },
      "VIGI974-11": { 1: [{ couleur: 2, debut: "2026-11-24T00:00:00Z" }] },
      [mf.ISLAND]: { [mf.CYCLONE]: [{ couleur: 2, debut: "2026-11-24T00:00:00Z" }] },
    });
    expect(etatDe(v, volcan("Alerte 1"), NOW)).toEqual({ vigilance: { "VIGI974-13|12": 3 }, cyclone: 2, volcan: "Alerte 1" });
  });

  it("knows nothing of what it could not read: no copy, or the prefecture's phase not read", () => {
    expect(etatDe(undefined, volcan("Vérifier", true), NOW)).toEqual({});
  });
});

describe("the changes a push would follow", () => {
  const avant: EtatAlertes = { vigilance: { "VIGI974-13|12": 3 }, cyclone: -1, volcan: "Vigilance" };

  it("a vigilance that rises to orange or red, never one that falls", () => {
    expect(changements(avant, { ...avant, vigilance: { "VIGI974-13|12": 4, "VIGI974-15|1": 3 } })).toEqual([
      "vigilance rouge fortes pluies / orages, Sud-Est",
      "vigilance orange vents forts, Ouest",
    ]);
    expect(changements(avant, { ...avant, vigilance: {} })).toEqual([]);
  });

  it("a cyclone alert that starts, changes step or is lifted; a volcano level that changes", () => {
    expect(changements(avant, { ...avant, cyclone: 3 })).toEqual(["alerte cyclonique orange"]);
    expect(changements({ ...avant, cyclone: 4 }, { ...avant, cyclone: -1 })).toEqual(["alerte cyclonique levée"]);
    expect(changements(avant, { ...avant, volcan: "Alerte 1" })).toEqual(["volcan : Alerte 1 (était Vigilance)"]);
  });

  it("says nothing of a part it could not read this time, and nothing on its first run", () => {
    expect(changements(avant, { vigilance: avant.vigilance })).toEqual([]);
    expect(changements(undefined, { ...avant, cyclone: 3 })).toEqual([]);
  });
});

describe("one run of the scheduled event", () => {
  const kv = () => {
    const m = new Map<string, string>();
    let puts = 0;
    return { m, puts: () => puts, get: async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null), put: async (k: string, v: string) => void (m.set(k, v), puts++) };
  };

  it("writes a log line by change, and the state only when it changes", async () => {
    const store = kv();
    const lignes: string[] = [];
    const log = (l: string) => void lignes.push(l);
    await detecter(store, calme, volcan("Vigilance"), NOW, log);
    expect(lignes).toEqual([]);
    expect(store.puts()).toBe(1);
    await detecter(store, calme, volcan("Vigilance"), NOW, log);
    expect(store.puts()).toBe(1);
    await detecter(store, calme, volcan("Alerte 1"), NOW, log);
    expect(lignes).toEqual(["alertes push (essai, rien n'est envoyé) : volcan : Alerte 1 (était Vigilance)"]);
    expect(store.puts()).toBe(2);
    expect(JSON.parse(store.m.get(ETAT_KEY)!)).toMatchObject({ volcan: "Alerte 1" });
  });

  it("keeps the last state of a part it could not read", async () => {
    const store = kv();
    await detecter(store, calme, volcan("Alerte 1"), NOW, () => {});
    await detecter(store, undefined, volcan("Alerte 1"), NOW, () => {});
    expect(JSON.parse(store.m.get(ETAT_KEY)!)).toEqual({ vigilance: {}, cyclone: -1, volcan: "Alerte 1" });
  });
});
