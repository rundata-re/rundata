import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurerEquipe, handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { sorteDe } from "../src/limite.js";
import * as abonnements from "../src/push/abonnements.js";
import { b64u, cleVapid } from "../src/push/webpush.js";
import * as alertes from "../src/web/alertes.js";
import { ALERTES_EN_LIGNE, configurer, ouvrir } from "../src/web/alertes-drapeau.js";

const subtle = crypto.subtle;
let db: DatabaseSync;

/** A browser's subscription: a real P-256 public key and a 16-byte secret, at FCM. */
async function navigateur(endpoint = "https://fcm.googleapis.com/fcm/send/abc:def") {
  const ua = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { endpoint, keys: { p256dh: b64u(await subtle.exportKey("raw", ua.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
}

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request(`https://rundata.re${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), new Cache());

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("scripts/alertes.sql", "utf8"));
  const paire = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const vapid = cleVapid(JSON.stringify(await subtle.exportKey("jwk", paire.privateKey)));
  abonnements.configure(
    async (sql, ...params) => Number(db.prepare(sql).run(...(params as never[])).changes),
    async <T,>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as never[])) as T[],
    vapid,
  );
  alertes.configure(vapid);
  ouvrir(true);
});

afterEach(() => {
  ouvrir(ALERTES_EN_LIGNE);
  abonnements.configure(undefined, undefined, undefined);
  alertes.configure(undefined);
  configurerEquipe(undefined);
  vi.unstubAllGlobals();
});

describe("the alerts' addresses", () => {
  it("answer in production now that the flag is open, with or without the trial Worker's variable", async () => {
    expect(ALERTES_EN_LIGNE).toBe(true);
    configurer(undefined);
    expect((await send("GET", alertes.CLE_PATH)).status).toBe(200);
    configurer("1");
    expect((await send("GET", alertes.CLE_PATH)).status).toBe(200);
    ouvrir(false);
    expect((await send("GET", alertes.CLE_PATH)).status).toBe(404);
    expect((await send("POST", alertes.ABONNEMENT_PATH, await navigateur())).status).toBe(404);
  });

  it("read the VAPID secret only while open: in production, flag off, nothing is imported and nothing logged", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    const importe = vi.spyOn(crypto.subtle, "importKey");
    // Production today: no secret, flag off. Even a secret set, flag off: not read.
    expect(alertes.cleDuSecret(undefined, false)).toBeUndefined();
    expect(alertes.cleDuSecret("pas un JWK", false)).toBeUndefined();
    expect(alertes.cleDuSecret(undefined, true)).toBeUndefined();
    expect(importe).not.toHaveBeenCalled();
    expect(erreurs).not.toHaveBeenCalled();
    // Open with a key that cannot be read: said once for that secret, however many setups.
    const k = alertes.cleDuSecret('{"kty":"EC"}', true);
    expect(alertes.cleDuSecret('{"kty":"EC"}', true)).toBe(k);
    await expect(k).rejects.toThrow("JWK");
    expect(erreurs).toHaveBeenCalledTimes(1);
    expect(erreurs.mock.calls[0][0]).toBe("alertes : clé VAPID illisible");
    erreurs.mockRestore();
    importe.mockRestore();
  });

  it("give the VAPID public key the browser subscribes with", async () => {
    const r = await send("GET", alertes.CLE_PATH);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const { cle } = (await r.json()) as { cle: string };
    expect(Buffer.from(cle, "base64url")).toHaveLength(65);
  });

  it("keep a subscription of a known push service, its keys replaced when it subscribes again, and forget it", async () => {
    const n = await navigateur();
    expect((await send("POST", alertes.ABONNEMENT_PATH, n)).status).toBe(201);
    const autre = await navigateur();
    expect((await send("POST", alertes.ABONNEMENT_PATH, { ...autre, endpoint: n.endpoint })).status).toBe(201);
    expect(db.prepare("SELECT endpoint, p256dh, auth FROM abonnements").all()).toEqual([{ endpoint: n.endpoint, ...autre.keys }]);
    expect((await send("DELETE", alertes.ABONNEMENT_PATH, { endpoint: n.endpoint })).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS n FROM abonnements").get()).toEqual({ n: 0 });
  });

  it("refuse any other address, a key of the wrong size, and a body that is not JSON", async () => {
    for (const endpoint of ["https://exemple.com/push", "http://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com:8443/x", "https://evil.fcm.googleapis.com.exemple.com/x", "https://notify.windows.com/x"]) {
      expect((await send("POST", alertes.ABONNEMENT_PATH, await navigateur(endpoint))).status, endpoint).toBe(422);
    }
    const n = await navigateur();
    expect((await send("POST", alertes.ABONNEMENT_PATH, { ...n, keys: { ...n.keys, auth: "AAAA" } })).status).toBe(422);
    const texte = await handle(new Request(`https://rundata.re${alertes.ABONNEMENT_PATH}`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(n) }), new Cache());
    expect(texte.status).toBe(422);
    expect(abonnements.serviceConnu("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(abonnements.serviceConnu("https://web.push.apple.com/QGv")).toBe(true);
    expect(abonnements.serviceConnu("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM abonnements").get()).toEqual({ n: 0 });
  });

  it("count a subscription and its removal as a form sent", () => {
    expect(sorteDe(new Request(`https://rundata.re${alertes.ABONNEMENT_PATH}`, { method: "POST" }))).toBe("formulaire");
    expect(sorteDe(new Request(`https://rundata.re${alertes.ABONNEMENT_PATH}`, { method: "DELETE" }))).toBe("formulaire");
    expect(sorteDe(new Request(`https://rundata.re${alertes.CLE_PATH}`))).toBeUndefined();
  });

  it("send the test message to the team only: encrypted, signed, 6 h to live; a 410 deletes the subscription", async () => {
    configurerEquipe("jeton-de-test");
    const vivant = await navigateur("https://fcm.googleapis.com/fcm/send/vivant");
    const parti = await navigateur("https://updates.push.services.mozilla.com/wpush/v2/parti");
    await send("POST", alertes.ABONNEMENT_PATH, vivant);
    await send("POST", alertes.ABONNEMENT_PATH, parti);
    const recus: { url: string; headers: Headers; taille: number }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      recus.push({ url, headers: new Headers(init.headers), taille: (init.body as Uint8Array).length });
      return new Response(null, { status: url.includes("parti") ? 410 : 201 });
    });
    expect((await send("POST", alertes.ESSAI_PATH)).status).toBe(404);
    expect(recus).toEqual([]);
    const r = await send("POST", alertes.ESSAI_PATH, undefined, { "rundata-jeton": "jeton-de-test" });
    expect(await r.json()).toEqual({ envoye: 1, efface: 1, echec: 0 });
    expect(recus.map((x) => x.url).sort()).toEqual([parti.endpoint, vivant.endpoint].sort());
    const h = recus[0].headers;
    expect(h.get("content-encoding")).toBe("aes128gcm");
    expect(h.get("ttl")).toBe("21600");
    expect(h.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    expect(recus[0].taille).toBeLessThan(4096);
    expect(db.prepare("SELECT endpoint FROM abonnements").all()).toEqual([{ endpoint: vivant.endpoint }]);
  });
});
