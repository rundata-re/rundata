import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { counted, OutOfBudget } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { installer, portesAvis } from "../src/contexte.js";
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
import * as transit from "../src/providers/transit.js";
import * as climat from "../src/providers/climat.js";
import * as merHistorique from "../src/providers/mer-historique.js";
import * as rna from "../src/vie/associations.js";
import * as avis from "../src/avis.js";
import * as espace from "../src/clubs/espace.js";
import * as chiffre from "../src/connecteurs/chiffre.js";
import * as connexions from "../src/connecteurs/connexions.js";
import * as propositions from "../src/propositions.js";
import * as abonnements from "../src/push/abonnements.js";
import * as sansReponse from "../src/sans-reponse.js";
import * as vigilanceCarte from "../src/providers/vigilance-carte.js";
import * as vigilanceEpisodes from "../src/providers/vigilance-episodes.js";
import * as cmrsCarte from "../src/providers/cmrs-carte.js";
import * as carteScolaire from "../src/vie/carte-scolaire.js";
import { PROPOSITION_PATH } from "../src/web/propositions.js";
import { baseAvis, bases, cartes, dansLeWorker, fichiers, horsWorker } from "./contexte.js";

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
    expect(contexte()).toEqual({ worker: true, bases: {} });
    expect([transit.enabled(), climat.enabled(), climat.hourlyEnabled(), merHistorique.enabled(), rna.lisible()]).toEqual([false, false, false, false, false]);
    horsWorker();
  });

  it("gives each D1 database as its binding's reads, the same query and values, not counted here, and is built again when one changes", async () => {
    const env = (e: Record<string, unknown>) => worker.fetch(new Request("https://rundata.re/robots.txt"), e as never, { waitUntil: () => {} });
    const d1 = (nom: string, appels: string[]) => ({
      prepare: (sql: string) => ({ bind: (...v: unknown[]) => ({ all: async () => (appels.push(`${nom} ${sql} ${JSON.stringify(v)}`), { results: [{ nom }] }), run: async () => { throw new Error("écrit"); } }) }),
      batch: async () => { throw new Error("écrit"); },
    });
    const appels: string[] = [];
    const [TRANSIT, CLIMAT, CLIMAT_H, AVIS] = ["transit", "climat", "horaire", "avis"].map((n) => d1(n, appels));
    await env({ TRANSIT, CLIMAT, CLIMAT_H, AVIS });
    expect([transit.enabled(), climat.enabled(), climat.hourlyEnabled(), merHistorique.enabled(), rna.lisible()]).toEqual([true, true, true, true, true]);
    const b = contexte().bases!;
    const { value, used } = await counted(50, async () => [await b.transit!.all("SELECT ?", 1), await b.climat!.all("SELECT ?", 2), await b.climatHoraire!.all("SELECT ?", 3), await b.avis!.all("SELECT ?", 4)]);
    expect(value).toEqual([[{ nom: "transit" }], [{ nom: "climat" }], [{ nom: "horaire" }], [{ nom: "avis" }]]);
    // Each module counts its own calls (transit.ts, climat.ts, mer-historique.ts, associations.ts).
    expect(used).toBe(0);
    expect(appels).toEqual(["transit SELECT ? [1]", "climat SELECT ? [2]", "horaire SELECT ? [3]", "avis SELECT ? [4]"]);
    const premier = contexte();
    await env({ TRANSIT, CLIMAT, CLIMAT_H, AVIS });
    expect(contexte()).toBe(premier);
    await env({ TRANSIT, CLIMAT, AVIS });
    expect(contexte()).not.toBe(premier);
    expect([transit.enabled(), climat.enabled(), climat.hourlyEnabled(), merHistorique.enabled(), rna.lisible()]).toEqual([true, true, false, true, true]);
    horsWorker();
    expect(transit.enabled()).toBe(false);
  });

  it("gives the feedback database's writes, the same statements on the same binding, and nothing to write in the others", async () => {
    const env = (e: Record<string, unknown>) => worker.fetch(new Request("https://rundata.re/robots.txt"), e as never, { waitUntil: () => {} });
    const appels: string[] = [];
    const d1 = (nom: string) => ({
      prepare: (sql: string) => ({
        bind: (...v: unknown[]) => ({
          all: async () => (appels.push(`${nom} all ${sql} ${JSON.stringify(v)}`), { results: [] }),
          run: async () => (appels.push(`${nom} run ${sql} ${JSON.stringify(v)}`), { meta: { changes: 2 } }),
          sql,
          v,
        }),
      }),
      batch: async (st: { sql: string; v: unknown[] }[]) => (appels.push(`${nom} batch ${JSON.stringify(st.map((x) => [x.sql, ...x.v]))}`), st.map(() => ({ meta: { changes: 1 } }))),
    });
    await env({ TRANSIT: d1("transit"), CLIMAT: d1("climat"), CLIMAT_H: d1("horaire"), AVIS: d1("avis") });
    expect(Object.keys(contexte().bases!).sort()).toEqual(["avis", "avisEcriture", "climat", "climatHoraire", "transit"]);
    const e = contexte().bases!.avisEcriture!;
    expect(await e.run("UPDATE t SET a = ?", 1)).toBe(2);
    expect(await e.batch([["DELETE FROM t WHERE a = ?", 1], ["DELETE FROM u"]])).toEqual([1, 1]);
    expect(appels).toEqual(['avis run UPDATE t SET a = ? [1]', 'avis batch [["DELETE FROM t WHERE a = ?",1],["DELETE FROM u"]]']);
    expect([avis.enabled(), propositions.enabled(), propositions.lisible(), !!abonnements.d1(), !!connexions.portes(), espace.enabled()]).toEqual([true, true, true, true, true, true]);
    // Without the binding, none of them writes nor reads, and no other database is given to write.
    await env({ TRANSIT: d1("transit"), CLIMAT: d1("climat"), CLIMAT_H: d1("horaire") });
    expect(Object.keys(contexte().bases!).sort()).toEqual(["climat", "climatHoraire", "transit"]);
    expect([avis.enabled(), propositions.enabled(), propositions.lisible(), !!abonnements.d1(), !!connexions.portes(), espace.enabled()]).toEqual([false, false, false, false, false, false]);
    expect(portesAvis()).toEqual({ run: undefined, all: undefined, batch: undefined });
    horsWorker();
  });

  it("counts each call to the feedback database when it is made: a write in the room kept for writes, a read in the common one", async () => {
    horsWorker();
    const faits: string[] = [];
    baseAvis({ run: async (sql) => (faits.push(sql), 1), all: async <T>(sql: string) => (faits.push(sql), [] as T[]), batch: async (st) => (faits.push(st.map(([q]) => q).join(";")), st.map(() => 1)) });
    const { run, all, batch } = portesAvis();
    const { used } = await counted(10, async () => {
      await run!("W1");
      await all!("R1");
      await batch!([["B1"], ["B2"]]);
    });
    expect(used).toBe(3);
    // A tenth of the budget is kept for writes (budget.ts): the reads stop at 9 of 10, the writes go on.
    const fin = await counted(10, async () => {
      for (let i = 0; i < 9; i++) await all!("R");
      const lu = await all!("R10").then(() => "lu", (err) => (err instanceof OutOfBudget ? "refusé" : "autre"));
      await run!("W10");
      return lu;
    });
    expect(fin.value).toBe("refusé");
    expect(fin.used).toBe(10);
    expect(faits.slice(0, 3)).toEqual(["W1", "R1", "B1;B2"]);
    expect(faits).not.toContain("R10");
    // The sites that do not answer count their own calls, through the same database: once, not twice.
    const sr = await counted(10, () => sansReponse.dernierPassage());
    expect(sr.used).toBe(1);
    horsWorker();
  });

  it("asks each door it needs: the writes alone make no link nor space, and a secret unknown in one database is asked again in the next", async () => {
    horsWorker();
    chiffre.configure(Buffer.alloc(32, 7).toString("base64"));
    connexions.configure(async () => true);
    baseAvis({ run: async () => 1, all: async <T>() => [] as T[] });
    expect([connexions.enabled(), espace.enabled(), !!abonnements.d1()]).toEqual([true, true, true]);
    baseAvis({ run: async () => 1 });
    expect([connexions.enabled(), !!connexions.portes(), espace.enabled(), !!abonnements.d1(), propositions.enabled(), propositions.lisible()]).toEqual([false, false, false, false, true, false]);
    const jeton = "a".repeat(22);
    baseAvis({ all: async <T>() => [] as T[] });
    expect(await propositions.parJeton(jeton)).toBeUndefined();
    baseAvis({ all: async <T>() => [{ jeton: "x" }] as T[] });
    expect(await propositions.parJeton(jeton)).toEqual({ jeton: "x" });
    connexions.configure(undefined);
    chiffre.configure(undefined);
    horsWorker();
  });

  it("gives a test's databases in place, without putting the other modules in the Worker (test/contexte.ts)", async () => {
    horsWorker();
    const lecture = { all: async <T>() => [] as T[] };
    bases({ transit: lecture, climat: lecture });
    expect(contexte()).toEqual({ worker: false, bases: { transit: lecture, climat: lecture } });
    bases({ climat: undefined });
    expect(contexte().bases).toEqual({ transit: lecture });
    // The store given after keeps them.
    dansLeWorker({ a: 1 });
    expect(contexte().bases).toEqual({ transit: lecture });
    bases({ avis: lecture });
    expect(await contexte().kv!.json("a")).toBe(1);
    expect(Object.keys(contexte().bases!)).toEqual(["transit", "avis"]);
    horsWorker();
    expect(contexte()).toEqual({ worker: false });
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

describe("what a module keeps from one request to the next (src/contexte.ts)", () => {
  const requete = (e: Record<string, unknown>, chemin = "/robots.txt") => worker.fetch(new Request(`https://rundata.re${chemin}`), e as never, { waitUntil: () => {} });

  it("propositions: a secret found in nothing is not asked again at the next request, and 20 a minute at most are asked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T10:00:05Z"));
    const lus: unknown[][] = [];
    const d1 = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          all: async () => {
            if (sql.includes("FROM propositions WHERE jeton")) lus.push(params);
            return { results: [] };
          },
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
      batch: async () => [],
    };
    const env = { AVIS: d1 };
    try {
      const jeton = (i: number) => `${String(i).padStart(2, "0")}${"a".repeat(20)}`;
      expect((await requete(env, `${PROPOSITION_PATH}${jeton(0)}`)).status).toBe(404);
      expect(lus).toHaveLength(1);
      // The same secret at the next request: from the isolate's memory, not the database.
      expect((await requete(env, `${PROPOSITION_PATH}${jeton(0)}`)).status).toBe(404);
      expect(lus).toHaveLength(1);
      // One request per secret: once 20 were found in nothing within the minute, the others are not asked.
      for (let i = 1; i <= 25; i++) await requete(env, `${PROPOSITION_PATH}${jeton(i)}`);
      expect(lus).toHaveLength(20);
      // The next minute, they are asked again.
      vi.setSystemTime(new Date("2026-11-28T10:01:05Z"));
      await requete(env, `${PROPOSITION_PATH}${jeton(30)}`);
      expect(lus).toHaveLength(21);
    } finally {
      vi.useRealTimers();
      horsWorker();
    }
  });

  it("maps: the store as each map reads it, a file found in nothing not asked again at the next request, an episode's index read once", async () => {
    const kv = new FakeKv({ "vigilance:carte:png:abc": new Uint8Array([1, 2]).buffer });
    const gets: [string, string][] = [];
    const puts: [string, unknown, unknown][] = [];
    const store = {
      get: async (key: string, type: string) => (gets.push([key, type]), kv.get(key)),
      put: async (key: string, value: unknown, options: unknown) => void puts.push([key, value, options]),
      list: kv.list,
    };
    await requete({ STORE: store });
    expect(contexte().brut).toBe(store);
    const png = await counted(50, () => vigilanceCarte.fichier("png", "abc"));
    expect([new Uint8Array(png.value!)[1], png.used]).toEqual([2, 1]);
    expect(gets).toEqual([["vigilance:carte:png:abc", "arrayBuffer"]]);
    expect(await vigilanceCarte.fichier("pdf", "rien")).toBeNull();
    expect(await cmrsCarte.fichier("rien")).toBeNull();
    const avant = gets.length;
    await requete({ STORE: store });
    expect(await vigilanceCarte.fichier("pdf", "rien")).toBeNull();
    expect(await cmrsCarte.fichier("rien")).toBeNull();
    expect(await vigilanceCarte.fichier("png", "abc")).not.toBeNull();
    expect(gets.length).toBe(avant);
    // A bulletin above green kept once: at the next request, the index is not read again for it.
    const v = { emise: "2026-11-28T10:00:00Z", zones: { "974-1": { vent: [{ couleur: 2 }] } } } as never;
    await vigilanceEpisodes.garder(new Uint8Array([9]).buffer, v, Date.parse("2026-11-28T10:00:00Z"));
    expect(gets.slice(avant)).toEqual([["vigilance:episodes", "json"]]);
    expect(puts.map(([k, , o]) => [k, o])).toEqual([["vigilance:episode:2026-11-28T10:00:00Z", { expirationTtl: expect.any(Number) }], ["vigilance:episodes", { expirationTtl: expect.any(Number) }]]);
    await requete({ STORE: store });
    await vigilanceEpisodes.garder(new Uint8Array([9]).buffer, v, Date.parse("2026-11-28T10:00:00Z"));
    expect(gets.length).toBe(avant + 1);
    // Another store (another test's Worker): its own memory.
    const autre = { ...store };
    await requete({ STORE: autre });
    expect(await cmrsCarte.fichier("rien")).toBeNull();
    expect(gets.length).toBe(avant + 2);
    horsWorker();
  });

  it("gives the browser, with the store only, and the static assets, each read counted, and is built again when one changes", async () => {
    const browser = { quickAction: async () => new Response("") };
    const demandes: string[] = [];
    const assets = { fetch: async (r: Request) => (demandes.push(r.url), r.url.endsWith("/97407.json") ? Response.json({ troncons: [] }) : Response.json({ introuvable: true }, { status: 404 })) };
    await requete({ BROWSER: browser, ASSETS: assets });
    expect(contexte().navigateur).toBe(browser);
    expect(vigilanceCarte.configured()).toBe(false);
    const premier = contexte();
    await requete({ BROWSER: browser, ASSETS: assets });
    expect(contexte()).toBe(premier);
    const lu = await counted(50, () => contexte().fichiers!.json("/carte-scolaire/97407.json"));
    expect(lu).toMatchObject({ value: { troncons: [] }, used: 1 });
    expect(await contexte().fichiers!.json("/carte-scolaire/rien.json")).toBeNull();
    expect(demandes).toEqual(["https://rundata.re/carte-scolaire/97407.json", "https://rundata.re/carte-scolaire/rien.json"]);
    const autre = { ...browser };
    await requete({ BROWSER: autre, ASSETS: assets });
    expect(contexte().navigateur).toBe(autre);
    const neufs: string[] = [];
    await requete({ BROWSER: autre, ASSETS: { fetch: async (r: Request) => (neufs.push(r.url), new Response("", { status: 404 })) } });
    expect(await contexte().fichiers!.json("/carte-scolaire/97407.json")).toBeNull();
    expect([demandes.length, neufs]).toEqual([2, ["https://rundata.re/carte-scolaire/97407.json"]]);
    await requete({});
    expect([contexte().navigateur, contexte().fichiers]).toEqual([undefined, undefined]);
    expect(await carteScolaire.fichier("97407")).toBeNull();
    horsWorker();
  });

  it("gives a test's maps and files in place, without putting the other modules in the Worker (test/contexte.ts)", async () => {
    horsWorker();
    const ecrit: unknown[][] = [];
    cartes({ json: async () => ({ a: 1 }), bytes: async () => new Uint8Array([3]).buffer, put: async (...a) => void ecrit.push(a) });
    expect(contexte().worker).toBe(false);
    expect(await contexte().brut!.get("k", "json")).toEqual({ a: 1 });
    expect(new Uint8Array((await contexte().brut!.get("k", "arrayBuffer"))!)[0]).toBe(3);
    await contexte().brut!.put("k", "v", { expirationTtl: 60 });
    await contexte().brut!.put("k", "w");
    expect(ecrit).toEqual([["k", "v", 60], ["k", "w", undefined]]);
    fichiers({ json: async <T>() => ({ f: 1 }) as T });
    dansLeWorker();
    expect([!!contexte().brut, !!contexte().fichiers, contexte().worker]).toEqual([true, true, true]);
    cartes();
    fichiers();
    expect([contexte().brut, contexte().fichiers, contexte().worker]).toEqual([undefined, undefined, true]);
    horsWorker();
  });
});
