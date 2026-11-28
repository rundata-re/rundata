import { createECDH, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { counted, OutOfBudget } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { installer, portesAvis, secret, type Secrets } from "../src/contexte.js";
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
import * as meteofrance from "../src/providers/meteofrance.js";
import * as feux from "../src/providers/feux.js";
import * as formulaires from "../src/web/propositions.js";
import { equipe, JETON_EQUIPE } from "../src/app.js";
import { PROPOSITION_PATH } from "../src/web/propositions.js";
import { enteteVapid, unb64u } from "../src/push/webpush.js";
import { ALERTES_EN_LIGNE, enLigne as alertesEnLigne } from "../src/web/alertes-drapeau.js";
import { CLE_PATH } from "../src/web/alertes.js";
import { baseAvis, bases, cartes, cles, courriel, dansLeWorker, fichiers, horsWorker } from "./contexte.js";

/** The encryption key, as the secret CONNECTEURS_CLE (contexte.ts `secret`). */
const cle = (k?: string) => cles({ connecteurs: k });

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
    // Its secrets, none set here: each absent (toEqual leaves out the keys whose value is undefined).
    expect(contexte()).toEqual({ worker: true, bases: {}, secrets: {} });
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
    cle(Buffer.alloc(32, 7).toString("base64"));
    courriel(async () => true);
    baseAvis({ run: async () => 1, all: async <T>() => [] as T[] });
    expect([connexions.enabled(), espace.enabled(), !!abonnements.d1()]).toEqual([true, true, true]);
    baseAvis({ run: async () => 1 });
    expect([connexions.enabled(), !!connexions.portes(), espace.enabled(), !!abonnements.d1(), propositions.enabled(), propositions.lisible()]).toEqual([false, false, false, false, true, false]);
    const jeton = "a".repeat(22);
    baseAvis({ all: async <T>() => [] as T[] });
    expect(await propositions.parJeton(jeton)).toBeUndefined();
    baseAvis({ all: async <T>() => [{ jeton: "x" }] as T[] });
    expect(await propositions.parJeton(jeton)).toEqual({ jeton: "x" });
    courriel(undefined);
    cle(undefined);
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
    expect(Object.keys(contexte().secrets!)).not.toContain("candhis");
    expect(Object.keys(contexte().secrets!)).not.toContain("solardb");
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

describe("the Worker's secrets (src/contexte.ts `secret`)", () => {
  const requete = (e: Record<string, unknown>, chemin = "/robots.txt", init?: RequestInit) => worker.fetch(new Request(`https://rundata.re${chemin}`, init), e as never, { waitUntil: () => {} });
  // Each of the Worker's secrets, and the name the modules read it by.
  const NOMS: [string, keyof Secrets][] = [
    ["METEOFRANCE_APPLICATION_ID", "meteofranceApplication"],
    ["METEOFRANCE_API_KEY", "meteofranceCle"],
    ["FIRMS_MAP_KEY", "firms"],
    ["AVIS_SEL", "selAvis"],
    ["TURNSTILE_SECRET", "turnstile"],
    ["EQUIPE_JETON", "equipe"],
    ["UV_MOUFIA_JETON", "uvMoufia"],
    ["OPENAI_APPS_CHALLENGE", "defiOpenai"],
    ["META_VERIFY_TOKEN", "metaVerification"],
    ["META_APP_SECRET", "metaApplication"],
    ["CONNECTEURS_CLE", "connecteurs"],
    ["VAPID_PRIVE", "vapid"],
  ];
  // A VAPID key drawn from a fixed private number (a P-256 JWK, as scripts/vapid-cles.mjs writes it), never a real one.
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.alloc(32, 7));
  const publique = ecdh.getPublicKey();
  const D = Buffer.alloc(32, 7).toString("base64url");
  const JWK = JSON.stringify({ kty: "EC", crv: "P-256", d: D, x: publique.subarray(1, 33).toString("base64url"), y: publique.subarray(33).toString("base64url") });
  // The encryption key: 32 bytes in base64, as CONNECTEURS_CLE is.
  const CLE_CONNECTEURS = Buffer.alloc(32, 5).toString("base64");
  const valeur = (env: string) =>
    env === "VAPID_PRIVE" ? JWK : env === "CONNECTEURS_CLE" ? CLE_CONNECTEURS : `valeur-${env.toLowerCase().replace(/_/g, "-")}-0123456789`;
  // What must never be written of a secret: the JWK's private part, or the whole value.
  const trace = (env: string) => (env === "VAPID_PRIVE" ? D : valeur(env));
  const tous = Object.fromEntries(NOMS.map(([env]) => [env, valeur(env)]));
  /** Cloudflare's e-mail binding: each message kept, or refused with an error that says it. */
  const courrielCf = (envoyes: unknown[], echec = false) => ({
    send: async (m: unknown) => {
      if (echec) throw Object.assign(new Error(`refusé : ${JSON.stringify(m)}`), { code: "E_REFUS" });
      envoyes.push(m);
      return { messageId: "1" };
    },
  });

  it("gives each secret by its name, without its spaces, with the store or without it, and is built again when one changes", async () => {
    for (const [env, nom] of NOMS) {
      await requete({ [env]: ` ${valeur(env)}\n` });
      expect(secret(nom)).toBe(valeur(env));
      for (const [, autre] of NOMS) if (autre !== nom) expect(secret(autre)).toBeUndefined();
      await requete({ [env]: "  " });
      expect(secret(nom)).toBeUndefined();
    }
    await requete({ STORE: new FakeKv(), ...tous });
    for (const [env, nom] of NOMS) expect(secret(nom)).toBe(valeur(env));
    const premier = contexte();
    await requete({ STORE: premier.brut, ...tous });
    expect(contexte()).toBe(premier);
    await requete({ STORE: premier.brut, ...tous, FIRMS_MAP_KEY: "autre" });
    expect(contexte()).not.toBe(premier);
    expect(secret("firms")).toBe("autre");
    // The e-mail's binding and the trial Worker's variable: given, or changed, alone, the context is built again too.
    const sansCourriel = contexte();
    const EMAIL = courrielCf([]);
    await requete({ STORE: premier.brut, ...tous, FIRMS_MAP_KEY: "autre", EMAIL });
    expect([contexte() !== sansCourriel, !!contexte().courriel]).toEqual([true, true]);
    await requete({ STORE: premier.brut, ...tous, FIRMS_MAP_KEY: "autre", EMAIL, ALERTES_ESSAI: "1" });
    expect(contexte().essai).toBe(true);
    horsWorker();
    for (const [, nom] of NOMS) expect(secret(nom)).toBeUndefined();
  });

  it("without a secret, its module does as before it: off, and no error", async () => {
    const fetches: string[] = [];
    vi.stubGlobal("fetch", async (u: string | URL | Request) => (fetches.push(String(u instanceof Request ? u.url : u)), new Response("", { status: 500 })));
    const erreurs = vi.spyOn(console, "error");
    try {
      await requete({});
      // Météo-France's portal and FIRMS: nothing asked of them.
      expect([meteofrance.enabled(), feux.enabled()]).toEqual([false, false]);
      // The feedback's fingerprints: a salt drawn by this isolate, the same within the day.
      const jour = new Date("2026-11-28T10:00:00Z");
      const a = await avis.empreinte("203.0.113.7", jour);
      expect(await avis.empreinte("203.0.113.7", jour)).toBe(a);
      await requete({ AVIS_SEL: "sel" });
      const b = await avis.empreinte("203.0.113.7", jour);
      expect(b).not.toBe(a);
      await requete({ AVIS_SEL: "sel" });
      expect(await avis.empreinte("203.0.113.7", jour)).toBe(b);
      await requete({});
      // The forms: no person told apart, Cloudflare not asked.
      expect(await formulaires.human(new URLSearchParams({ "cf-turnstile-response": "jeton" }), "203.0.113.7", { hostname: "rundata.re", action: "lien" })).toBe(false);
      // The team: no one, whatever the header.
      expect(equipe(new Headers({ [JETON_EQUIPE]: "" }))).toBe(false);
      expect(equipe(new Headers({ [JETON_EQUIPE]: "x" }))).toBe(false);
      // The internal trial's page and OpenAI's challenge: not found, as any other address.
      expect((await requete({}, "/essais/uv-moufia/x")).status).toBe(404);
      expect((await requete({}, "/.well-known/openai-apps-challenge")).status).toBe(404);
      // Meta's webhook: not found, as any other address, to its check and its events.
      expect((await requete({}, "/meta/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1")).status).toBe(404);
      expect((await requete({}, "/meta/webhook", { method: "POST", body: "{}" })).status).toBe(404);
      // And with one of its two secrets only: an empty token is never taken for the one not given.
      for (const seul of ["META_VERIFY_TOKEN", "META_APP_SECRET"]) {
        expect((await requete({ [seul]: valeur(seul) }, "/meta/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1")).status).toBe(404);
      }
      await requete({});
      // The connectors: nothing encrypted, nothing linked, the encryption refused rather than done in clear.
      expect([chiffre.enabled(), connexions.enabled()]).toEqual([false, false]);
      await expect(chiffre.chiffrer("x", chiffre.lien("helloasso", "o", "j"))).rejects.toThrow("pas de clé");
      // The alerts: open by the flag, their key unavailable, no subscription signed for.
      expect(alertesEnLigne()).toBe(ALERTES_EN_LIGNE);
      expect(abonnements.cleDuSite()).toBeUndefined();
      expect((await requete({}, CLE_PATH)).status).toBe(503);
      // The e-mails: none sent, so no link made (propositions, connectors, the clubs' space read the same).
      expect(contexte().courriel).toBeUndefined();
      expect(await connexions.envoyer("club@example.org", { subject: "s", text: "t" })).toBe(false);
      // The connectors with their table and their key but no e-mail: still closed.
      await requete({ CONNECTEURS_CLE: CLE_CONNECTEURS });
      baseAvis({ run: async () => 0, all: async () => [] });
      expect([chiffre.enabled(), connexions.enabled()]).toEqual([true, false]);
      courriel(async () => true);
      expect(connexions.enabled()).toBe(true);
      await requete({});
      // The videos handed to Threads: not found without the store.
      expect((await requete({}, `/partage/video/${"a".repeat(32)}.mp4`)).status).toBe(404);
      expect(fetches).toEqual([]);
      expect(erreurs).not.toHaveBeenCalled();
      // With them, each is on.
      const envoyes: unknown[] = [];
      await requete({ ...tous, EMAIL: courrielCf(envoyes), ALERTES_ESSAI: "1" });
      expect([meteofrance.enabled(), feux.enabled()]).toEqual([true, true]);
      expect([chiffre.enabled(), contexte().essai]).toEqual([true, true]);
      expect(await connexions.envoyer("club@example.org", { subject: "s", text: "t" })).toBe(true);
      expect(envoyes).toMatchObject([{ to: "club@example.org", subject: "s" }]);
      const verif = await requete({ ...tous, EMAIL: courrielCf(envoyes), ALERTES_ESSAI: "1" }, `/meta/webhook?hub.mode=subscribe&hub.verify_token=${valeur("META_VERIFY_TOKEN")}&hub.challenge=42`);
      expect([verif.status, await verif.text()]).toEqual([200, "42"]);
      expect((await requete(tous, CLE_PATH)).status).toBe(200);
      expect(equipe(new Headers({ [JETON_EQUIPE]: valeur("EQUIPE_JETON") }))).toBe(true);
      const defi = await requete(tous, "/.well-known/openai-apps-challenge");
      expect([defi.status, await defi.text()]).toEqual([200, valeur("OPENAI_APPS_CHALLENGE")]);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      horsWorker();
    }
  });

  it("never writes a secret in a log line or an answer, even when what it is sent to fails", async () => {
    // Every service a secret is sent to fails, saying the address it was asked at (as the Worker's fetch does: never
    // the headers nor the body): what a module logs of it must not carry the secret, in the address either (FIRMS).
    const envoyes: string[] = [];
    vi.stubGlobal("fetch", async (u: string | URL | Request, init?: RequestInit) => {
      envoyes.push(`${String(u instanceof Request ? u.url : u)} ${String(init?.body ?? "")} ${JSON.stringify(init?.headers ?? {})}`);
      throw new TypeError(`refusé : ${String(u instanceof Request ? u.url : u)}`);
    });
    const niveaux = ["log", "info", "warn", "error", "debug"] as const;
    const espions = niveaux.map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const reponses: string[] = [];
    const lire = async (r: Response) => reponses.push(`${r.status} ${JSON.stringify([...r.headers])} ${await r.text()}`);
    try {
      const env = { STORE: new FakeKv(), ...tous };
      await lire(await requete(env));
      await lire(await requete(env, "/robots.txt", { headers: { [JETON_EQUIPE]: "mauvais" } }));
      await lire(await requete(env, "/essais/uv-moufia/mauvais"));
      await lire(await requete(env, "/associations/lien", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "cf-turnstile-response=jeton" }));
      await meteofrance.keepFresh("cron").catch((err) => console.error("jeton Météo-France : renouvellement impossible", String(err)));
      await feux.feuxNow(new Cache(new MemoryStore()), new Date()).catch((err) => console.error("feux", String(err)));
      await formulaires.human(new URLSearchParams({ "cf-turnstile-response": "jeton" }), "203.0.113.7", { hostname: "rundata.re", action: "lien" });
      await avis.empreinte("203.0.113.7", new Date());
      // Meta's webhook asked with a wrong token, and sent an event wrongly signed.
      await lire(await requete(env, "/meta/webhook?hub.mode=subscribe&hub.verify_token=mauvais&hub.challenge=1"));
      await lire(await requete(env, "/meta/webhook", { method: "POST", headers: { "x-hub-signature-256": "sha256=00" }, body: "{}" }));
      // A connector's secret opened for another row; an e-mail refused by Cloudflare.
      const chiffreAvant = await chiffre.chiffrer("x", chiffre.lien("helloasso", "o", "j"));
      await chiffre.dechiffrer(chiffreAvant, chiffre.lien("helloasso", "o", "autre")).catch((err) => console.error("connecteurs", String(err)));
      await requete({ ...env, EMAIL: courrielCf([], true) });
      await connexions.envoyer("club@example.org", { subject: "s", text: "t" });
      // The VAPID key's public half given, and a subscription's send signed and refused by its push service.
      await lire(await requete(env, CLE_PATH));
      await abonnements.envoyer({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: Buffer.from(publique).toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") }, { titre: "t", corps: "c", lien: "/" }, false).catch((err) => console.error("alertes", String(err)));
      // Keys that cannot be read: a VAPID secret that is not JSON, an encryption key that is not 32 bytes.
      const illisibles = { VAPID_PRIVE: "valeur-vapid-illisible-0123456789", CONNECTEURS_CLE: "valeur-cle-illisible-0123456789" };
      await lire(await requete({ ...env, ...illisibles }, CLE_PATH));
      await abonnements.cleDuSite()?.catch(() => {});
      await new Promise((r) => setTimeout(r, 0));
      chiffre.enabled();
      const ecrit = JSON.stringify(espions.flatMap((e) => e.mock.calls.map((c) => c.map(String))));
      // Something was logged: the failures are said; and the secrets were sent, so their absence above is no accident.
      expect(ecrit).toContain("refusé");
      for (const env of ["METEOFRANCE_APPLICATION_ID", "FIRMS_MAP_KEY", "TURNSTILE_SECRET"]) expect(envoyes.join(" ")).toContain(valeur(env));
      expect(envoyes.join(" ")).toContain("fcm.googleapis.com");
      expect(ecrit).toContain("clé VAPID illisible");
      expect(ecrit).toContain("connecteurs fermés");
      for (const [env] of NOMS) {
        expect(ecrit).not.toContain(trace(env));
        for (const r of reponses) expect(r).not.toContain(trace(env));
      }
      // Not even their first letters, which a parser's error quotes.
      for (const v of Object.values(illisibles)) {
        expect(ecrit).not.toContain(v.slice(0, 8));
        for (const r of reponses) expect(r).not.toContain(v.slice(0, 8));
      }
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      horsWorker();
    }
  });

  it("opens what was encrypted, signed and subscribed with before: the same key drawn from each secret, byte for byte", async () => {
    // Each value below was made by the code before the secrets were read by `secret` (its `configure`, given the same
    // secret): a connector's secret kept in D1, an event's signature from Meta, the public key the browsers subscribed with.
    const CHIFFRE_AVANT = "v1.c6F0PPmYb+FGwoKg.1TwbKxbpY7VrbU7vym8ugkNV14A5UIseC13B5r+ChipNMF3T6PLmE0Ye";
    const SIGNATURE_AVANT = "sha256=7d73ffac3b75ca9bcd050c9bc07a9e12206bd60662146a11879efc9d703ba311";
    const PUBLIQUE_AVANT = "BB4YUy_UdUwC8wQdnHXOszuD_9gax85P6ILMscmLxYlupGwxHE4v9A3ZajZT5uRURdMt_khuztdcepDGoYiBwKM";
    const corps = JSON.stringify({ object: "page", entry: [{ id: "1", time: 1, changes: [{ field: "feed" }] }] });
    const env = { CONNECTEURS_CLE: CLE_CONNECTEURS, META_VERIFY_TOKEN: "verif-d-essai", META_APP_SECRET: "secret-d-essai", VAPID_PRIVE: JWK };
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await requete(env);
      expect(await chiffre.dechiffrer(CHIFFRE_AVANT, chiffre.lien("helloasso", "club-de-petanque", "abc"))).toBe("jeton de rafraîchissement");
      // The signature is the HMAC of the body with the app's secret, accepted now as then.
      expect(`sha256=${createHmac("sha256", "secret-d-essai").update(corps).digest("hex")}`).toBe(SIGNATURE_AVANT);
      const r = await requete(env, "/meta/webhook", { method: "POST", headers: { "x-hub-signature-256": SIGNATURE_AVANT }, body: corps });
      expect([r.status, await r.text()]).toEqual([200, "EVENT_RECEIVED"]);
      const c = await requete(env, CLE_PATH);
      expect(await c.json()).toEqual({ cle: PUBLIQUE_AVANT });
      expect(Buffer.from((await abonnements.cleDuSite()!).publique)).toEqual(Buffer.from(unb64u(PUBLIQUE_AVANT)));
      // And what is signed now checks with the key the browsers already hold.
      const entete = await enteteVapid("https://fcm.googleapis.com/fcm/send/abc", (await abonnements.cleDuSite())!, abonnements.CONTACT);
      const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(entete)!;
      expect(k).toBe(PUBLIQUE_AVANT);
      const [h, b, sig] = jwt.split(".");
      const verifie = await crypto.subtle.importKey("raw", unb64u(PUBLIQUE_AVANT), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifie, unb64u(sig), new TextEncoder().encode(`${h}.${b}`))).toBe(true);
      // Rebuilt for another request with the same secrets: the same key, not imported again.
      const importe = vi.spyOn(crypto.subtle, "importKey");
      const premier = contexte();
      await requete({ ...env, FIRMS_MAP_KEY: "autre" });
      expect(contexte()).not.toBe(premier);
      expect(await chiffre.dechiffrer(CHIFFRE_AVANT, chiffre.lien("helloasso", "club-de-petanque", "abc"))).toBe("jeton de rafraîchissement");
      await requete(env, "/meta/webhook", { method: "POST", headers: { "x-hub-signature-256": SIGNATURE_AVANT }, body: corps });
      await requete(env, CLE_PATH);
      expect(importe).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      horsWorker();
    }
  });
});
