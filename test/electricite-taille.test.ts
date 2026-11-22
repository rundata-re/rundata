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
    const c = body(r).coupures_annoncees;
    // Notices of no cut today or later: one sentence for the island, their mairies and days, without their links
    // (marketing, 22/11/2026); their sentences and links in the answer for their commune.
    expect(c.avis).toEqual([]);
    expect(c.sans_date_a_venir).toBe("Dernier avis sans date à venir\u00a0: Sainte-Marie (avis du 12/10), Saint-André (avis du 04/09). Une coupure peut y être prévue sans que rundata.re l'ait lue.");
    // 19/11/2026, with both full entries: 5 590 bytes live, 4 340 here. The 1 250 between are what the server adds (citer,
    // lien, fraicheur, serveur) and the live day's longer words: kept, so that both full entries fail here as they did live.
    const bytes = new TextEncoder().encode(r.content[0].text).length;
    expect(bytes).toBeLessThanOrEqual(MAX_BYTES.electricite - 1_250);
  });

  it("says each mairie's notice to come briefly for the island, three of them under the ceiling, every field in the page's copy", async () => {
    // 22/11/2026: Saint-André's notice of 19/11 (three ranges, their streets), with Sainte-Marie's and Cilaos's, took the
    // island's answer to 6.3 KB live, past its 5.5 KB. Moved to these days: from 26/10, the day after the fixture's NOW.
    const slot = (jour: string, de: string, a: string, secteurs: string[], autres = false) => ({ jour, de, a, secteurs, ...(autres ? { autres_lieux: true } : {}) });
    const three: CourantAnswer = {
      avis: [
        {
          commune: "Saint-André",
          titre: "❗𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡 𝗖𝗢𝗨𝗣𝗨𝗥𝗘 𝗗'𝗘𝗟𝗘𝗖𝗧𝗥𝗜𝗖𝗜𝗧𝗘",
          publie: "2026-10-22T04:53:00Z",
          lien: "https://www.saint-andre.re/%e2%9d%97%f0%9d%97%9c%f0%9d%97%a1%f0%9d%97%99%f0%9d%97%a2%f0%9d%97%a5%f0%9d%97%a0%f0%9d%97%94%f0%9d%97%a7%f0%9d%97%9c%f0%9d%97%a2%f0%9d%97%a1-%f0%9d%97%96%f0%9d%97%a2%f0%9d%97%a8%f0%9d%97%a3/",
          nature: "programmée",
          creneaux: [
            slot("2026-10-26", "09:00", "12:30", ["237 avenue de la République", "Secteur Le Chrystel", "185 avenue de la République", "65 Centre commercial, bâtiment B", "N180 avenue de la République"], true),
            slot("2026-10-27", "09:00", "10:30", ["650 chemin Balance, à proximité du terrain de football"]),
            slot("2026-10-27", "10:00", "14:00", ["N176 ruelle Lacotte"]),
          ],
          secteurs: [],
        },
        {
          commune: "Sainte-Marie",
          titre: "Avis de coupure d’électricité",
          publie: "2026-10-21T10:42:00Z",
          lien: "https://www.ville-saintemarie.re/avis-de-coupure-delectricite-17/",
          nature: "programmée",
          creneaux: [slot("2026-10-28", "09:00", "15:00", ["Rue Marcel Pagnol", "Chemin Lefaguyes"])],
          secteurs: [],
        },
        {
          commune: "Cilaos",
          titre: "Coupures d'électricité à Cilaos",
          publie: "2026-10-20T08:00:00Z",
          lien: "https://ville-cilaos.fr/coupures-delectricite-a-cilaos-le-jeudi-29-octobre-2026/",
          nature: "programmée",
          creneaux: [slot("2026-10-29", "08:00", "14:10", ["Rue des Glycines", "Route du Bras Sec"]), slot("2026-10-29", "08:30", "14:30", [])],
          secteurs: [],
        },
      ],
      lues: ["Saint-André", "Sainte-Marie", "Cilaos"],
      indisponibles: [],
      sources: [],
    };
    const store = new MemoryStore();
    void store.put("edf:mix", { value: mix(), fetchedAt: NOW.getTime() });
    void store.put("edf:signal", { value: fixture("edf_signal.json").results, fetchedAt: NOW.getTime() });
    void store.put("web:courant", { value: three, fetchedAt: NOW.getTime() });
    const cache = new Cache(store, () => NOW.getTime());
    const r = await electricite(cache, NOW);
    const c = body(r).coupures_annoncees;
    // One range, how many others, the link; the streets in the notice and in the answer for the commune (marketing).
    expect(c.avis.map((a: { texte: string }) => a.texte)).toEqual([
      "Dernier avis de coupure d'électricité publié par la mairie de Saint-André le 22/10\u00a0: coupure programmée le lundi 26/10 de 09:00 à 12:30, et 2 autres plages dans l'avis\u00a0; secteurs dans l'avis.",
      "Dernier avis de coupure d'électricité publié par la mairie de Sainte-Marie le 21/10\u00a0: coupure programmée le mercredi 28/10 de 09:00 à 15:00\u00a0; secteurs dans l'avis.",
      "Dernier avis de coupure d'électricité publié par la mairie de Cilaos le 20/10\u00a0: coupure programmée le jeudi 29/10 de 08:00 à 14:10, et 1 autre plage dans l'avis\u00a0; secteurs dans l'avis.",
    ]);
    expect(c.avis.map((a: object) => Object.keys(a))).toEqual(Array(3).fill(["texte", "commune", "nature", "lien"]));
    expect(c.avis[0].lien).toBe(three.avis[0].lien);
    expect(c.detail).toBe("Plages, secteurs et lien de chaque avis\u00a0: appeler electricite avec la commune.");
    expect(c).not.toHaveProperty("sans_date_a_venir");
    // 22/11/2026 07:48 live: 6 329 bytes, 4 131 of them besides the notices; 3 293 here besides them. The 840 between
    // (the server's citer, lien, fraicheur, serveur, and EDF's line 39 hours old, said so) kept: three mairies' notices
    // to come, each with its link, then fit live, with Saint-André's long one.
    const bytes = new TextEncoder().encode(r.content[0].text).length;
    expect(bytes).toBeLessThanOrEqual(MAX_BYTES.electricite - 840);
    // The answer for Saint-André: its notice in full, each range and its streets.
    const own = body(await electricite(cache, NOW, "Saint-André")).coupures_annoncees.avis[0];
    expect(own.texte).toContain("le mardi 27/10 de 10:00 à 14:00, secteur N176 ruelle Lacotte");
    expect(own.creneaux).toHaveLength(3);
    // The page's copy keeps every field: the commune's tile reads the ranges and the day it was published.
    const page = body(await electricite(cache, NOW, undefined, undefined, true)).coupures_annoncees;
    expect(page.avis[0]).toMatchObject({ commune: "Saint-André", nature: "programmée", publie_le: "22/10 08:53" });
    expect(page.avis[0].creneaux).toHaveLength(3);
    expect(page).not.toHaveProperty("detail");
  });
});
