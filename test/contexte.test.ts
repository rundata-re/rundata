import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { installer } from "../src/contexte.js";
import * as airMesures from "../src/providers/air-mesures.js";
import * as carburants from "../src/providers/carburants.js";
import * as cpf from "../src/providers/cpf.js";
import * as emploi from "../src/providers/emploi.js";
import * as marches from "../src/providers/marches-publics.js";
import * as sitesHs from "../src/providers/sites-hs.js";
import { contexte } from "../src/contexte.js";
import * as irve from "../src/providers/irve.js";
import * as eauIle from "../src/eau/ile.js";
import * as prefectureCopie from "../src/providers/prefecture-copie.js";
import * as raa from "../src/providers/raa.js";
import * as candhis from "../src/providers/candhis.js";
import * as uvMesure from "../src/providers/uv-mesure.js";
import * as meteorOi from "../src/providers/meteor-oi.js";
import * as ovpfOcr from "../src/providers/ovpf-ocr.js";
import worker from "../src/worker.js";
import { dansLeWorker, horsWorker } from "./contexte.js";

// The Worker builds its modules' context in its own modules, dropped after (test/modules-neufs.ts).
await vi.hoisted(async () => (await import("./modules-neufs.js")).modulesNeufs());

/** A KV namespace in memory, every key read. */
class FakeKv {
  read: string[] = [];
  constructor(private data: Record<string, unknown> = {}) {}
  async get(key: string) {
    this.read.push(key);
    return this.data[key] ?? null;
  }
  async put() {}
  async list() {
    return { keys: [], list_complete: true };
  }
}

const robots = (kv: FakeKv) => worker.fetch(new Request("https://rundata.re/robots.txt"), { STORE: kv } as never, { waitUntil: () => {} });

describe("the modules' context (src/contexte.ts)", () => {
  it("is nothing outside the Worker: the modules do as when they were not configured", () => {
    horsWorker();
    expect(contexte()).toEqual({ worker: false });
  });

  it("is built by the Worker once per store binding, its reads of the store counted", async () => {
    const kv = new FakeKv({ [irve.KV_KEY]: { lu: "2026-11-28T07:00:00Z", points: {} } });
    await robots(kv);
    const premier = contexte();
    expect(premier.worker).toBe(true);
    // The binding itself too, for the modules that count their own reads (rejeu, pluie-radar, mf-auth).
    expect(premier.brut).toBe(kv);
    await robots(kv);
    // The same object from one request to the next: a module's copy kept for its context stays (capteurs.ts).
    expect(contexte()).toBe(premier);
    const avant = kv.read.length;
    const { value, used } = await counted(50, () => premier.kv!.json(irve.KV_KEY));
    expect(value).toEqual({ lu: "2026-11-28T07:00:00Z", points: {} });
    expect(used).toBe(1);
    expect(kv.read.slice(avant)).toEqual([irve.KV_KEY]);
    // Another binding (another test's Worker): a new context.
    await robots(new FakeKv());
    expect(contexte()).not.toBe(premier);
    horsWorker();
  });

  it("is the Worker's without a store too: the modules that never read their source there say it is absent", async () => {
    await worker.fetch(new Request("https://rundata.re/robots.txt"), {} as never, { waitUntil: () => {} });
    expect(contexte()).toEqual({ worker: true });
    horsWorker();
  });

  it("gives the sources' keys with the store only, and is built again when a key changes", async () => {
    const env = (e: Record<string, unknown>) => worker.fetch(new Request("https://rundata.re/robots.txt"), e as never, { waitUntil: () => {} });
    await env({ CANDHIS_API_KEY: "cle", SOLARDB_JETON: "jeton" });
    expect(contexte().secrets).toBeUndefined();
    expect([candhis.configured(), uvMesure.configured()]).toEqual([false, false]);
    const kv = new FakeKv();
    await env({ STORE: kv, CANDHIS_API_KEY: " cle ", SOLARDB_JETON: "jeton" });
    expect([candhis.configured(), uvMesure.configured()]).toEqual([true, true]);
    const premier = contexte();
    await env({ STORE: kv, CANDHIS_API_KEY: " cle " });
    expect(contexte()).not.toBe(premier);
    expect([candhis.configured(), uvMesure.configured()]).toEqual([true, false]);
    await env({ STORE: kv, CANDHIS_API_KEY: "  " });
    expect(candhis.configured()).toBe(false);
    horsWorker();
    expect([candhis.configured(), uvMesure.configured()]).toEqual([false, false]);
  });

  it("gives a test's data by key, a value or a function, any other key absent (test/contexte.ts)", async () => {
    let n = 0;
    dansLeWorker({ a: { x: 1 }, b: () => ++n });
    expect(await contexte().kv!.json("a")).toEqual({ x: 1 });
    expect([await contexte().kv!.json("b"), await contexte().kv!.json("b")]).toEqual([1, 2]);
    expect(await contexte().kv!.json("c")).toBeNull();
    // A second call adds its keys, as a module configured after another left the other's reader.
    dansLeWorker({ c: 3 });
    expect([await contexte().kv!.json("a"), await contexte().kv!.json("c")]).toEqual([{ x: 1 }, 3]);
    horsWorker();
    dansLeWorker({ c: 4 });
    expect(await contexte().kv!.json("a")).toBeNull();
    // The keys likewise; one given as undefined is taken back.
    dansLeWorker({}, { candhis: "k", solardb: "j" });
    dansLeWorker({}, { solardb: undefined });
    expect([candhis.configured(), uvMesure.configured()]).toEqual([true, false]);
    horsWorker();
  });

  describe("what each module does without a store, as before the context", () => {
    const lus: string[] = [];
    const reseau = () => vi.stubGlobal("fetch", async (u: string | URL | Request) => {
      const url = String(u instanceof Request ? u.url : u);
      lus.push(url);
      return url.startsWith(irve.LIVE_URL) ? new Response(readFileSync(new URL("./fixtures/irve_dynamique.csv", import.meta.url), "utf8")) : new Response("", { status: 404 });
    });
    const cache = () => new Cache(new MemoryStore(), () => Date.parse("2026-11-28T07:00:00Z"));

    it("irve: the Worker without a store reads the national file, as a local server", async () => {
      reseau();
      lus.length = 0;
      installer({ worker: true });
      const live = await irve.live(cache());
      expect(Object.keys(live.value.points).length).toBeGreaterThan(0);
      expect(lus.some((u) => u.startsWith(irve.LIVE_URL))).toBe(true);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("carburants: the Worker never reads the prefecture, even without a store", async () => {
      reseau();
      lus.length = 0;
      installer({ worker: true });
      await expect(carburants.prix(cache())).rejects.toThrow("prix des carburants absents du stockage");
      expect(lus).toEqual([]);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("emploi, CPF, antennes hors service, marchés publics: nothing outside the Worker, no error", async () => {
      horsWorker();
      expect(await emploi.offres(cache())).toBeNull();
      expect(await cpf.formations(cache())).toBeNull();
      expect(cpf.configured()).toBe(false);
      expect(await sitesHs.sites(cache())).toBeNull();
      expect(await marches.avis(cache())).toBeNull();
    });

    it("emploi, CPF, antennes hors service, marchés publics: in the Worker, the store only", async () => {
      reseau();
      lus.length = 0;
      installer({ worker: true });
      expect(cpf.configured()).toBe(true);
      await expect(emploi.offres(cache())).rejects.toThrow("offres d'emploi absentes du stockage");
      await expect(marches.avis(cache())).rejects.toThrow("avis de marchés absents du stockage");
      // These two say « not available » rather than fail.
      expect(await cpf.formations(cache())).toBeNull();
      expect(await sitesHs.sites(cache())).toBeNull();
      expect(lus).toEqual([]);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("eau de l'île: gathered from the sources without a store, in the Worker as outside it; the store's copy with one", async () => {
      const copie = { lu: "2026-11-28T06:00:00.000Z", baignades: [], communes: [] };
      for (const dedans of [false, true]) {
        reseau();
        lus.length = 0;
        if (dedans) installer({ worker: true });
        else horsWorker();
        await eauIle.ile(cache()).catch(() => undefined);
        expect(lus.length).toBeGreaterThan(0);
        expect(await eauIle.storedCopy(cache())).toBeNull();
        vi.unstubAllGlobals();
      }
      reseau();
      lus.length = 0;
      dansLeWorker({ [eauIle.KV_KEY]: copie });
      expect((await eauIle.ile(cache())).value).toEqual(copie);
      expect(await eauIle.storedCopy(cache())).toEqual(copie);
      expect(lus).toEqual([]);
      horsWorker();
      vi.unstubAllGlobals();
    });

    it("copie de la préfecture, recueil des actes: nothing outside the Worker; in the Worker, the store only", async () => {
      horsWorker();
      expect(prefectureCopie.configured()).toBe(false);
      expect(await prefectureCopie.copie()).toBeNull();
      expect(await prefectureCopie.page("https://www.reunion.gouv.fr/c")).toBeNull();
      expect(await raa.copie(cache())).toBeNull();
      installer({ worker: true });
      expect(prefectureCopie.configured()).toBe(true);
      expect(await prefectureCopie.copie()).toBeNull();
      expect(await prefectureCopie.page("https://www.reunion.gouv.fr/c")).toBeNull();
      expect(await raa.copie(cache())).toBeNull();
      const liste = { liste: [], lu_le: "2026-11-28T06:00:00.000Z" };
      const page = { page: { phrases: ["Le texte."] }, lu: 0 };
      const recueil = { actes: [], recueils: [], lu_le: "2026-11-28T06:00:00.000Z" };
      dansLeWorker({ [prefectureCopie.KV_KEY]: liste, [prefectureCopie.pageKey("https://www.reunion.gouv.fr/c")]: page, [raa.KV_KEY]: recueil });
      expect(await prefectureCopie.copie()).toEqual(liste);
      expect(await prefectureCopie.page("https://www.reunion.gouv.fr/c")).toEqual(page);
      expect(await prefectureCopie.page("https://www.reunion.gouv.fr/autre")).toBeNull();
      expect((await raa.copie(cache()))?.value).toEqual(recueil);
      horsWorker();
    });

    it("MétéoR-OI, texte de l'OVPF: nothing outside the Worker nor without a store; the store's copy with one", async () => {
      const post = { titre: "t", lien: "https://bsky.app/profile/ovpf.bsky.social/post/abc", date: "2026-11-28", image: "https://cdn.bsky.app/i.jpg" } as never;
      for (const c of [() => horsWorker(), () => installer({ worker: true })]) {
        c();
        expect((await meteorOi.observations(cache())).value).toEqual([]);
        expect(await ovpfOcr.resultat(cache(), post)).toBeUndefined();
      }
      const copie = { lu: "2026-11-28T06:55:00.000Z", mesures: [] };
      const lu = { statut: "lu", texte: "Le texte.", lu_a: "2026-11-28T06:00:00.000Z", outil: "t" };
      dansLeWorker({ [meteorOi.KV_KEY]: copie, [ovpfOcr.KEY("abc")]: lu });
      expect((await meteorOi.observations(cache(), new Date("2026-11-28T07:00:00Z"))).fetchedAt).toEqual(new Date(copie.lu));
      expect(await ovpfOcr.resultat(cache(), post)).toEqual(lu);
      // Another context (another test's): its own store, not the copy kept for the first.
      dansLeWorker({ [meteorOi.KV_KEY]: { ...copie, lu: "2026-11-28T06:58:00.000Z" } });
      expect((await meteorOi.observations(cache(), new Date("2026-11-28T07:00:00Z"))).fetchedAt).toEqual(new Date("2026-11-28T06:58:00.000Z"));
      horsWorker();
      dansLeWorker({ [meteorOi.KV_KEY]: { ...copie, lu: "2026-11-28T06:59:00.000Z" } });
      expect((await meteorOi.observations(cache(), new Date("2026-11-28T07:00:00Z"))).fetchedAt).toEqual(new Date("2026-11-28T06:59:00.000Z"));
      horsWorker();
    });

    it("air: nothing outside the Worker, no error", async () => {
      horsWorker();
      expect(await airMesures.mesures(cache())).toBeNull();
    });
  });
});

