import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { MAX_BYTES } from "../src/bin/check-sources.js";
import type { CourantAnswer } from "../src/tools/courant.js";
import { electricite } from "../src/tools/electricite.js";

// EDF's open data of 23/10/2026 around 03:15 heure de La Réunion (test/electricite.test.ts), and the two mairies whose
// notices are read with their notices as they were on 19/11/2026, moved to these days: Sainte-Marie's of a cut two days
// after it, gone by, and Saint-André's letter of EDF in PDF, of more than a month.
const fixture = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const NOW = new Date("2026-10-22T23:20:00Z");
const mix = () => { const { _id, _i, _rand, _score, _updatedAt, jour, ...m } = fixture("edf_mix.json").results[0]; return m; };
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

const COURANT: CourantAnswer = {
  avis: [
    {
      commune: "Sainte-Marie",
      titre: "Avis de coupure d’électricité",
      publie: "2026-10-12T10:42:00Z",
      lien: "https://www.ville-saintemarie.re/avis-de-coupure-delectricite-16/",
      nature: "programmée",
      creneaux: [{ jour: "2026-10-14", de: "09:00", a: "15:00", secteurs: [] }],
      secteurs: [],
    },
    {
      commune: "Saint-André",
      titre: "Avis de coupure d'EDF (PDF)",
      publie: "2026-09-04T05:34:00Z",
      lien: "https://www.saint-andre.re/wp-content/uploads/2026/09/CA26008704-EDF-Coupure-dElectricite-pour-Travaux-Mer.pdf",
      nature: "information",
      creneaux: [],
      secteurs: [],
      pdf: true,
    },
  ],
  lues: ["Sainte-Marie", "Saint-André"],
  indisponibles: [],
  sources: [],
};

beforeEach(() => vi.stubGlobal("fetch", async () => new Response("", { status: 404 })));
afterEach(() => vi.unstubAllGlobals());

describe("the size of electricite", () => {
  it("keeps the island's answer under the ceiling of the daily check of the sources, both mairies' past notices included", async () => {
    const store = new MemoryStore();
    void store.put("edf:mix", { value: mix(), fetchedAt: NOW.getTime() });
    void store.put("edf:signal", { value: fixture("edf_signal.json").results, fetchedAt: NOW.getTime() });
    void store.put("web:courant", { value: COURANT, fetchedAt: NOW.getTime() });
    const r = await electricite(new Cache(store, () => NOW.getTime()), NOW);
    const avis = body(r).coupures_annoncees.avis;
    // A notice of no cut today or later: its sentence and its link, the day it was published in the sentence.
    expect(avis.map((a: object) => Object.keys(a))).toEqual([["texte", "commune", "lien"], ["texte", "commune", "lien"]]);
    expect(avis[1].texte).toBe("Pas d'avis récent de la mairie de Saint-André : le dernier date du 04/09. Nous ne savons pas si une coupure est prévue.");
    // 19/11/2026, with both full entries: 5 590 bytes live, 4 340 here. The 1 250 between are what the server adds (citer,
    // lien, fraicheur, serveur) and the live day's longer words: kept, so that both full entries fail here as they did live.
    const bytes = new TextEncoder().encode(r.content[0].text).length;
    expect(bytes).toBeLessThanOrEqual(MAX_BYTES.electricite - 1_250);
  });
});
