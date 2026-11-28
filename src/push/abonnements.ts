/**
 * The subscriptions to the site's alerts on the phone (Web Push), in D1 (scripts/alertes.sql, the database bound as
 * AVIS): a subscription's address and its two keys, nothing else (no date, commune, IP address nor device). The
 * address is opaque, made by the browser's push service, but proper to one browser: the privacy page says so before
 * the alerts go out (web/alertes-drapeau.ts).
 *
 * Only the addresses of the known push services are kept: otherwise anyone could make the Worker send requests to an
 * address of their choice. A service that answers 404 or 410 says the subscription is gone: its row is deleted.
 */
import { count } from "../budget.js";
import { portesAvis, secret } from "../contexte.js";
import { enLigne } from "../web/alertes-drapeau.js";
import { chiffrer, cleVapid, enteteVapid, type CleVapid, unb64u } from "./webpush.js";

export type Run = (sql: string, ...params: unknown[]) => Promise<number>;
export type All = <T>(sql: string, ...params: unknown[]) => Promise<T[]>;

/**
 * The VAPID key of `jwk`, imported once for that value: only while the alerts' addresses are open (`ouvert`). Closed,
 * or without the secret, nothing is read and nothing is logged, so that production's logs never carry an error of a
 * feature that is off. A key that cannot be read is said once for that secret.
 */
let lue: { jwk: string; cle: Promise<CleVapid> } | undefined;
export function cleDuSecret(jwk: string | undefined, ouvert: boolean): Promise<CleVapid> | undefined {
  if (!ouvert || !jwk) return undefined;
  if (lue?.jwk !== jwk) {
    const k = cleVapid(jwk);
    k.catch((err) => console.error("alertes : clé VAPID illisible", err instanceof Error ? err.message : err));
    lue = { jwk, cle: k };
  }
  return lue.cle;
}

/** The site's VAPID key (secret VAPID_PRIVE, contexte.ts `secret`); none in Node. The subscriptions are in the AVIS database (contexte.ts `portesAvis`). */
export const cleDuSite = () => cleDuSecret(secret("vapid"), enLigne());

/** The D1 calls, for the scheduled sends (push/envoi.ts); undefined without the binding. */
export function d1(): { run: Run; all: All } | undefined {
  const { run, all } = portesAvis();
  return run && all ? { run, all } : undefined;
}

/** The address the push services may write to about our sends (RFC 8292 § 2.1), public already. */
export const CONTACT = "mailto:contact@rundata.re";

/**
 * The push services of the browsers, by host: Google (Chrome, Edge on Android, Android), Mozilla (Firefox), Apple
 * (Safari, iPhone and iPad from iOS 16.4), Microsoft (some Edge, WNS, one host per region).
 */
const SERVICES = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const SERVICES_SUFFIXES = [".notify.windows.com"];

/** Whether `endpoint` is a subscription's address at a known push service: https, no port nor credentials. */
export function serviceConnu(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password || endpoint.length > ENDPOINT_MAX) return false;
  return SERVICES.includes(u.hostname) || SERVICES_SUFFIXES.some((s) => u.hostname.endsWith(s) && u.hostname.length > s.length);
}

/** Longer than any service's address (FCM's are about 190 characters, WNS' about 300). */
const ENDPOINT_MAX = 1024;
/** Past it, a subscription is refused (« complet pour l'instant ») until the sends go through a queue. */
export const ABONNES_MAX = 10_000;

export interface Abonnement {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type Refus = "invalide" | "complet" | "indisponible";

/** A subscription as the browser gives it (`PushSubscription.toJSON()`), checked; else why it is refused. */
export function lire(corps: unknown): Abonnement | "invalide" {
  if (!corps || typeof corps !== "object") return "invalide";
  const { endpoint, keys } = corps as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !serviceConnu(endpoint)) return "invalide";
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return "invalide";
  try {
    const p = unb64u(p256dh);
    if (p.length !== 65 || p[0] !== 4 || unb64u(auth).length !== 16) return "invalide";
  } catch {
    return "invalide";
  }
  return { endpoint, p256dh, auth };
}

/** Keeps the subscription (its keys replaced when the browser subscribes again). */
export async function abonner(a: Abonnement): Promise<"ok" | Refus> {
  const { run, all } = portesAvis();
  if (!run || !all) return "indisponible";
  try {
    const [n] = await all<{ n: number }>("SELECT COUNT(*) AS n FROM abonnements");
    if ((n?.n ?? 0) >= ABONNES_MAX) {
      console.error(`alertes : ${ABONNES_MAX} abonnés atteints, inscription refusée`);
      return "complet";
    }
    await run("INSERT INTO abonnements (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth", a.endpoint, a.p256dh, a.auth);
    return "ok";
  } catch (err) {
    console.error("alertes : abonnement impossible", err instanceof Error ? err.message : err);
    return "indisponible";
  }
}

/** Forgets the subscription (« Ne plus recevoir »); an address not kept is no error. */
export async function desabonner(endpoint: string): Promise<"ok" | "indisponible"> {
  const { run } = portesAvis();
  if (!run) return "indisponible";
  try {
    await run("DELETE FROM abonnements WHERE endpoint = ?", endpoint);
    return "ok";
  } catch (err) {
    console.error("alertes : désabonnement impossible", err instanceof Error ? err.message : err);
    return "indisponible";
  }
}

/** What the service worker shows: a title, a body, and the page opened by a tap. */
export interface Message {
  titre: string;
  corps: string;
  lien: string;
}

/** A day-old alert means nothing: the services drop the message past 6 h. */
export const TTL_S = 6 * 3600;

export type Issue = "envoye" | "efface" | "echec";

/**
 * Sends `m` to one subscription: encrypted for it, signed with VAPID (one JWT a push service, kept by `jwts` for the
 * call). A 404 or 410 deletes the subscription, or hands its address to `parti` when given (deleted together after a
 * batch, push/envoi.ts). `urgent`: « Urgency: high » (red, the cyclone, the volcano). Counted as a subrequest.
 */
export async function envoyer(a: Abonnement, m: Message, urgent: boolean, jwts = new Map<string, Promise<string>>(), now = Date.now(), parti?: (endpoint: string) => void): Promise<Issue> {
  const cle = cleDuSite();
  if (!cle) return "echec";
  count(1, true);
  const k = await cle;
  const origine = new URL(a.endpoint).origin;
  let vapid = jwts.get(origine);
  if (!vapid) jwts.set(origine, (vapid = enteteVapid(a.endpoint, k, CONTACT, now)));
  const corps = await chiffrer(JSON.stringify(m), a.p256dh, a.auth);
  let r: Response;
  try {
    r = await fetch(a.endpoint, {
      method: "POST",
      headers: { authorization: await vapid, "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(TTL_S), urgency: urgent ? "high" : "normal" },
      body: corps,
    });
  } catch (err) {
    console.error(`alertes : envoi impossible (${new URL(a.endpoint).hostname})`, err instanceof Error ? err.message : err);
    return "echec";
  }
  if (r.status === 404 || r.status === 410) {
    if (parti) parti(a.endpoint);
    else await desabonner(a.endpoint);
    return "efface";
  }
  if (!r.ok) console.error(`alertes : ${new URL(a.endpoint).hostname} a répondu ${r.status}`);
  return r.ok ? "envoye" : "echec";
}

/** Every subscription, for the team's test send (web/alertes.ts); the scheduled sends read them by batches (push/envoi.ts). */
export async function tous(): Promise<Abonnement[]> {
  const { all } = portesAvis();
  return all ? all<Abonnement>("SELECT endpoint, p256dh, auth FROM abonnements") : [];
}
