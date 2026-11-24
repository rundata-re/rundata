import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILD_BUDGET, counted } from "../src/budget.js";
import { COLLECTEURS, dit, passage } from "../src/collecteurs.js";

/** A KV namespace in memory that notes each read and each write with its TTL. */
class FakeKv {
  data = new Map<string, string>();
  read: string[] = [];
  written: { key: string; ttl?: number }[] = [];
  async get(key: string, type?: string) {
    this.read.push(key);
    const v = this.data.get(key);
    return v == null ? null : type === "json" ? JSON.parse(v) : v;
  }
  async put(key: string, value: string, o?: { expirationTtl?: number }) {
    this.data.set(key, value);
    this.written.push({ key, ttl: o?.expirationTtl });
  }
}

describe("the collectors of the scheduled event", () => {
  it("are one table, their log lines word for word those the dashboards read", () => {
    expect(COLLECTEURS.map((c) => c.nom)).toEqual([
      "bouées Candhis", "calendrier FFCK", "indice UV mesuré", "mesures de l'air", "capteurs amateurs", "offres d'emploi",
      "sites mobiles hors service", "formations CPF", "marchés publics", "série Candhis",
    ]);
    expect(new Set(COLLECTEURS.map((c) => c.cle)).size).toBe(COLLECTEURS.length);
    expect(dit(COLLECTEURS[1], { value: "2 pages", used: 3, reads: new Map([["ffck", 1]]) })).toBe("calendrier FFCK : 2 pages, sous-requêtes : 3, lectures : ffck 1");
  });

  it("each read its copy and write it back under its key, both counted, with its TTL", async () => {
    for (const c of COLLECTEURS) {
      const kv = new FakeKv();
      kv.data.set(c.cle, JSON.stringify({ avant: c.nom }));
      let avant: unknown;
      const r = await counted(BUILD_BUDGET, () => passage({ ...c, collect: async (b, ecrire) => {
        avant = b;
        await ecrire({ apres: c.nom });
        return "fait";
      } }, kv as never, new Date("2026-11-24T00:10:00Z")));
      expect(avant, c.nom).toEqual({ avant: c.nom });
      expect(kv.read, c.nom).toEqual([c.cle]);
      expect(kv.written, c.nom).toEqual([{ key: c.cle, ttl: c.ttl }]);
      expect(c.ttl, c.nom).toBeGreaterThan(0);
      expect(r.value, c.nom).toBe("fait");
      expect(r.used, c.nom).toBe(2);
    }
  });

  it("are no longer copied one by one in the Worker", () => {
    const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
    for (const c of COLLECTEURS) expect(worker, c.nom).not.toContain(`${c.nom} : lecture impossible`);
  });
});
