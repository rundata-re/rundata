import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as mf from "../src/providers/vigilance.js";
import * as episodes from "../src/providers/vigilance-episodes.js";
import { vigilanceMeteo } from "../src/tools/vigilance.js";
import { vigilancePage } from "../src/web/vigilance-page.js";
import { unzip } from "../src/zip.js";
import { cartes, meteoFrance } from "./contexte.js";

const NOW = new Date("2026-11-24T06:00:00Z");
const zip = readFileSync(new URL("./fixtures/vigilance_om.zip", import.meta.url));
const zipBytes = new Uint8Array(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
async function files() {
  const f = await unzip(zipBytes.buffer, (n) => n.endsWith("_FMEE_.txt"));
  return { map: JSON.parse(f.get("CDPV95_FMEE_.txt")!), texts: JSON.parse(f.get("CDPV96_FMEE_.txt")!) };
}
/** The kept file's bulletin, orange heavy rain on the Sud from `update`, its texts as Météo-France gives them. */
async function orange(update = "2026-11-24T04:00:00Z", blocs?: unknown[]) {
  const { map, texts } = await files();
  map.update_time = update;
  for (const d of map.timelaps.domain_ids)
    if (d.domain_id === "VIGI974-14") for (const p of d.phenomenon_items) if (p.phenomenon_id === 12) for (const t of p.timelaps_items) t.color_id = 3;
  if (blocs) texts.text_bloc_items = blocs;
  return mf.parse(map, texts);
}

/** A KV in memory that counts its reads and writes. */
class Kv {
  data = new Map<string, unknown>();
  reads = 0;
  writes = 0;
  async json(key: string) {
    this.reads++;
    const v = this.data.get(key);
    return typeof v === "string" ? JSON.parse(v) : null;
  }
  async bytes(key: string) {
    this.reads++;
    return (this.data.get(key) as ArrayBuffer | undefined) ?? null;
  }
  ttl = new Map<string, number | undefined>();
  async put(key: string, value: string | ArrayBuffer, ttl?: number) {
    this.writes++;
    this.data.set(key, value);
    this.ttl.set(key, ttl);
  }
}

describe("the bulletins above green kept for replaying them", () => {
  it("keeps the zip of a bulletin above green once, under its time of issue, a year and more", async () => {
    const kv = new Kv();
    cartes(kv);
    const v = await orange();
    expect(episodes.episode(v)).toBe(true);
    await episodes.garder(zipBytes.buffer, v, NOW.getTime());
    await episodes.garder(zipBytes.buffer, v, NOW.getTime() + 300_000);
    // Each 5 min the same bulletin: one zip and one index written, never twice.
    expect(kv.writes).toBe(2);
    expect(new Uint8Array(kv.data.get("vigilance:episode:2026-11-24T04:00:00Z") as ArrayBuffer)).toEqual(zipBytes);
    expect(kv.ttl.get("vigilance:episode:2026-11-24T04:00:00Z")).toBeGreaterThanOrEqual(400 * 86_400);
    expect(JSON.parse(kv.data.get("vigilance:episodes") as string)).toMatchObject({ bulletins: [{ emise: "2026-11-24T04:00:00Z", taille: zipBytes.byteLength }] });
    // A new bulletin of the episode: kept beside it.
    await episodes.garder(zipBytes.buffer, await orange("2026-11-24T10:00:00Z"), NOW.getTime() + 6 * 3_600_000);
    expect(kv.writes).toBe(4);
    expect(JSON.parse(kv.data.get("vigilance:episodes") as string).bulletins.map((b: { emise: string }) => b.emise)).toEqual(["2026-11-24T04:00:00Z", "2026-11-24T10:00:00Z"]);
  });

  it("keeps a cyclone alert, announced, in force or its phase de sauvegarde, and nothing of a green bulletin", async () => {
    const { map, texts } = await files();
    const green = mf.parse(map, texts);
    expect(episodes.episode(green)).toBe(false);
    const kv = new Kv();
    cartes(kv);
    await episodes.garder(zipBytes.buffer, green, NOW.getTime());
    expect(kv.writes + kv.reads).toBe(0);
    for (const c of [2, 3, 6]) {
      const v = mf.parse(map, texts);
      v.zones[mf.ISLAND] = { [mf.CYCLONE]: [{ couleur: c, debut: "2026-11-25T00:00:00Z" }] };
      expect(episodes.episode(v)).toBe(true);
    }
  });

  it("does nothing without KV, and never throws", async () => {
    cartes(undefined);
    await expect(episodes.garder(zipBytes.buffer, await orange(), NOW.getTime())).resolves.toBeUndefined();
    cartes({ json: async () => { throw new Error("kv"); }, bytes: async () => null, put: async () => {} });
    await expect(episodes.garder(zipBytes.buffer, await orange(), NOW.getTime())).resolves.toBeUndefined();
  });
});

describe("Météo-France's texts by zone", () => {
  const bloc = (domain_id: string, title: string, text: string) => ({ domain_id, begin_time: "2026-11-24T04:00:00Z", end_time: null, bloc_title: "", text_items: [{ title, text: [text] }] });
  const blocs = [
    bloc("VIGI974", "Vagues-submersion", "Pas de vigilance particulière."),
    bloc("VIGI974-14", "Fortes pluies/Orages", "Pluies orageuses intenses sur le Sud, jusqu'à 200 mm."),
    bloc("VIGI974-12", "Fortes pluies/Orages", "Averses sur l'Est, sans gravité."),
  ];
  const cacheWith = (v: mf.Vigilance) => {
    const store = new MemoryStore();
    void store.put(mf.KEY, { value: v, fetchedAt: NOW.getTime() });
    return new Cache(store, () => NOW.getTime());
  };
  beforeAll(() => meteoFrance({ token: "test" }));
  afterAll(() => meteoFrance({}));

  it("keeps the zone of a text that has one, never one for the island's", async () => {
    const v = await orange(undefined, blocs);
    expect(v.suivi).toEqual([
      { titre: "Vagues-submersion", texte: "Pas de vigilance particulière." },
      { titre: "Fortes pluies/Orages", texte: "Pluies orageuses intenses sur le Sud, jusqu'à 200 mm.", zone: mf.ZONES["VIGI974-14"], domaine: "VIGI974-14" },
      { titre: "Fortes pluies/Orages", texte: "Averses sur l'Est, sans gravité.", zone: mf.ZONES["VIGI974-12"], domaine: "VIGI974-12" },
    ]);
  });

  it("gives the island all of them with their zone, and a commune its zone's and the island's, never another land zone's", async () => {
    const v = await orange(undefined, blocs);
    const ile = JSON.parse((await vigilanceMeteo(cacheWith(v), undefined, NOW)).content[0].text);
    expect(ile.suivi_meteo_france).toEqual([
      { titre: "Vagues-submersion", texte: "Pas de vigilance particulière." },
      { titre: "Fortes pluies/Orages", texte: "Pluies orageuses intenses sur le Sud, jusqu'à 200 mm.", zone: mf.ZONES["VIGI974-14"] },
      { titre: "Fortes pluies/Orages", texte: "Averses sur l'Est, sans gravité.", zone: mf.ZONES["VIGI974-12"] },
    ]);
    const sp = JSON.parse((await vigilanceMeteo(cacheWith(v), "Saint-Pierre", NOW)).content[0].text);
    expect(sp.suivi_meteo_france.map((t: { texte: string }) => t.texte)).toEqual(["Pas de vigilance particulière.", "Pluies orageuses intenses sur le Sud, jusqu'à 200 mm."]);
  });

  it("says the zone under the title on /vigilance", async () => {
    const page = vigilancePage("https://rundata.re", { value: await orange(undefined, blocs), fetchedAt: NOW }, NOW);
    expect(page).toContain(`<h3>Fortes pluies/<wbr>Orages</h3><p class="zone-suivi">Zone ${mf.ZONES["VIGI974-14"].replaceAll("'", "&#39;")}</p><p>Pluies orageuses intenses sur le Sud, jusqu&#39;à 200 mm.</p>`);
    expect(page).toContain(`<h3>Vagues-submersion</h3><p>Pas de vigilance particulière.</p>`);
  });
});
