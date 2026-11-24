import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detecter, type Changement } from "../src/alertes-etat.js";
import * as abonnements from "../src/push/abonnements.js";
import { message, passage, PAUSE_KEY } from "../src/push/envoi.js";
import { b64u, cleVapid } from "../src/push/webpush.js";

// The alerts sent to the phones by the scheduled event once open: once each, by batches from a cursor two events never
// share, the gone subscriptions deleted, a pause without a deploy, nothing past 6 h.

const subtle = crypto.subtle;
const T0 = Date.parse("2026-11-24T05:00:00Z");
const MIN = 60_000;
let db: DatabaseSync;
/** What each push service received: the endpoint, a POST each. */
let recus: string[];
/** Endpoints that answer 410 (the subscription gone). */
let partis: Set<string>;

const kv = (pause = false) => ({ get: async (k: string) => (pause && k === PAUSE_KEY ? new ArrayBuffer(1) : null) });

async function abonner(n: number) {
  const ua = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const p256dh = b64u(await subtle.exportKey("raw", ua.publicKey));
  for (let i = 0; i < n; i++) db.prepare("INSERT INTO abonnements VALUES (?, ?, ?)").run(`https://fcm.googleapis.com/fcm/send/${String(i).padStart(3, "0")}`, p256dh, b64u(crypto.getRandomValues(new Uint8Array(16))));
}

const pluie: Changement = { sujet: "vigilance", cle: "vigilance:2026-11-24T05:00:00Z:VIGI974-13:12:3", texte: "vigilance orange fortes pluies / orages, Sud-Est", urgent: false };
const volcan: Changement = { sujet: "volcan", cle: "volcan:2026-11-24T05:00:00.000Z:Alerte 1:calme", texte: "volcan : Alerte 1 (était Vigilance)", urgent: true };
const lignes = (t: string) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("scripts/alertes.sql", "utf8"));
  const paire = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  abonnements.configure(
    async (sql, ...params) => Number(db.prepare(sql).run(...(params as never[])).changes),
    async <T,>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as never[])) as T[],
    cleVapid(JSON.stringify(await subtle.exportKey("jwk", paire.privateKey))),
  );
  recus = [];
  partis = new Set();
  vi.stubGlobal("fetch", async (url: string) => {
    recus.push(url);
    return new Response(null, { status: partis.has(url) ? 410 : 201 });
  });
});

afterEach(() => {
  abonnements.configure(undefined, undefined, undefined);
  vi.unstubAllGlobals();
});

describe("the message of a run", () => {
  it("says each change with its source, opens the page of the most pressing, and is urgent when one is", () => {
    expect(message([pluie])).toEqual({ m: { titre: "rundata.re : alerte", corps: "Vigilance orange fortes pluies / orages, Sud-Est (Météo-France)", lien: "https://rundata.re/vigilance" }, urgent: false });
    expect(message([pluie, volcan])).toEqual({
      m: { titre: "rundata.re : 2 alertes", corps: "Vigilance orange fortes pluies / orages, Sud-Est (Météo-France)\nVolcan : Alerte 1 (était Vigilance) (préfecture)", lien: "https://rundata.re/volcan" },
      urgent: true,
    });
    expect(message([{ sujet: "cyclone", texte: "alerte cyclonique levée", urgent: true }, volcan]).m.lien).toBe("https://rundata.re/alerte-cyclone");
  });
});

describe("the sends of the scheduled event", () => {
  it("sends a change once to every subscription, by batches, and never again however many events read it", async () => {
    await abonner(5);
    const now = new Date(T0);
    expect(await passage([pluie], kv(), now, 2)).toEqual({ nouveaux: 1, envoye: 2, efface: 0, echec: 0, reste: true });
    // The next events: the same change found again (another data center, KV not yet there) is not taken twice.
    expect(await passage([pluie], kv(), new Date(T0 + 5 * MIN), 2)).toEqual({ nouveaux: 0, envoye: 2, efface: 0, echec: 0, reste: true });
    expect(await passage([], kv(), new Date(T0 + 10 * MIN), 2)).toEqual({ nouveaux: 0, envoye: 1, efface: 0, echec: 0, reste: false });
    expect(await passage([pluie], kv(), new Date(T0 + 15 * MIN), 2)).toBeUndefined();
    expect(recus.sort()).toEqual(db.prepare("SELECT endpoint FROM abonnements ORDER BY endpoint").all().map((r) => (r as { endpoint: string }).endpoint));
    expect(lignes("alertes_en_cours").n).toBe(0);
    expect(lignes("alertes_envoyees").n).toBe(1);
  });

  it("never sends a batch twice when two events overlap", async () => {
    await abonner(7);
    const now = new Date(T0);
    for (let i = 0; i < 5; i++) await Promise.all([passage([pluie], kv(), now, 2), passage([pluie], kv(), now, 2)]);
    expect(recus).toHaveLength(7);
    expect(new Set(recus).size).toBe(7);
  });

  it("keeps both changes when two overlapping events each take a different one", async () => {
    await abonner(3);
    await Promise.all([passage([pluie], kv(), new Date(T0), 2), passage([volcan], kv(), new Date(T0), 2)]);
    expect(lignes("alertes_envoyees").n).toBe(2);
    // Both in the message still going out: never one of them lost while its key is taken.
    const row = db.prepare("SELECT changements FROM alertes_en_cours").get() as { changements: string };
    expect((JSON.parse(row.changements) as { texte: string }[]).map((c) => c.texte).sort()).toEqual([pluie.texte, volcan.texte].sort());
  });

  it("deletes the subscriptions a push service says are gone", async () => {
    await abonner(3);
    partis.add("https://fcm.googleapis.com/fcm/send/001");
    expect(await passage([pluie], kv(), new Date(T0))).toEqual({ nouveaux: 1, envoye: 2, efface: 1, echec: 0, reste: false });
    expect(lignes("abonnements").n).toBe(2);
  });

  it("joins a change found while a message goes out, and starts again from the first subscription", async () => {
    await abonner(3);
    await passage([pluie], kv(), new Date(T0), 2);
    recus = [];
    expect(await passage([volcan], kv(), new Date(T0 + 5 * MIN), 2)).toMatchObject({ nouveaux: 1, envoye: 2, reste: true });
    // The batch of two from the first subscription; the pushes go out in parallel, in no set order.
    expect(recus.sort()).toEqual(["https://fcm.googleapis.com/fcm/send/000", "https://fcm.googleapis.com/fcm/send/001"]);
    const row = db.prepare("SELECT changements FROM alertes_en_cours").get() as { changements: string };
    expect((JSON.parse(row.changements) as { texte: string }[]).map((c) => c.texte)).toEqual([pluie.texte, volcan.texte]);
  });

  it("sends nothing while paused, and drops a message not finished after 6 h", async () => {
    await abonner(3);
    expect(await passage([pluie], kv(true), new Date(T0), 2)).toBeUndefined();
    expect(recus).toEqual([]);
    expect(lignes("alertes_envoyees").n).toBe(0);
    await passage([pluie], kv(), new Date(T0), 2);
    expect(await passage([], kv(), new Date(T0 + 6 * 60 * MIN + 1), 2)).toEqual({ nouveaux: 0, envoye: 0, efface: 0, echec: 0, reste: false, abandonne: true });
    expect(recus).toHaveLength(2);
    expect(lignes("alertes_en_cours").n).toBe(0);
  });

  it("does nothing without the database", async () => {
    abonnements.configure(undefined, undefined, undefined);
    expect(await passage([pluie], kv(), new Date(T0))).toBeUndefined();
  });
});

describe("the log line of a run", () => {
  it("says whether the push goes or would go", async () => {
    const m = new Map<string, string>();
    const store = { get: async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null), put: async (k: string, v: string) => void m.set(k, v) };
    const vol = (h: number, niveau_orsec: string) => ({ value: { resume: "", etat: { eruption_en_cours: false, niveau_orsec } }, fetchedAt: new Date(T0 + h * 60 * MIN), stale: false }) as never;
    const l: string[] = [];
    await detecter(store, undefined, vol(0, "Vigilance"), new Date(T0), (x) => l.push(x), true);
    await detecter(store, undefined, vol(1, "Alerte 1"), new Date(T0), (x) => l.push(x), true);
    const ch = await detecter(store, undefined, vol(2, "Alerte 1"), new Date(T0), (x) => l.push(x), true);
    expect(l).toEqual(["alertes push : volcan : Alerte 1 (était Vigilance)"]);
    expect(ch).toEqual([{ sujet: "volcan", cle: `volcan:${new Date(T0 + 120 * MIN).toISOString()}:Alerte 1:calme`, texte: "volcan : Alerte 1 (était Vigilance)", urgent: true }]);
  });
});
