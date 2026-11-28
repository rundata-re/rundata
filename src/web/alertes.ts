/**
 * The addresses of the alerts on the phone, behind web/alertes-drapeau.ts:
 * - GET /alertes/cle: the site's VAPID public key, which the browser subscribes with (`applicationServerKey`);
 * - POST /alertes/abonnement: a subscription (`PushSubscription.toJSON()`), kept; DELETE: forgotten. Counted as a
 *   form sent (limite.ts, 20 a minute an address); no Turnstile: a subscription publishes nothing, and only a known
 *   push service's address is kept (push/abonnements.ts);
 * - POST /alertes/essai: a test message to every subscription, for the team only (header rundata-jeton), to try the
 *   sends on real phones from the trial Worker.
 * The page with the button, and the service worker's `push`, come with the words agreed.
 */
import { equipe } from "../app.js";
import * as abonnements from "../push/abonnements.js";
import { b64u } from "../push/webpush.js";

export const CLE_PATH = "/alertes/cle";
export const ABONNEMENT_PATH = "/alertes/abonnement";
export const ESSAI_PATH = "/alertes/essai";

export { cleDuSecret } from "../push/abonnements.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const STATUS: Record<abonnements.Refus, number> = { invalide: 422, complet: 503, indisponible: 503 };

/** A body of JSON, at most 4 KB (a subscription is about 400 bytes); undefined for anything else. */
async function corps(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return undefined;
  const t = await request.text();
  if (t.length > 4096) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** The answer for a path under /alertes/, or undefined when it is not one of them. */
export async function route(request: Request, path: string): Promise<Response | undefined> {
  if (path === CLE_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ erreur: "méthode" }, 405);
    const cle = abonnements.cleDuSite();
    if (!cle) return json({ erreur: "indisponible" }, 503);
    return json({ cle: b64u((await cle).publique) });
  }
  if (path === ABONNEMENT_PATH) {
    if (request.method === "POST") {
      const a = abonnements.lire(await corps(request));
      if (a === "invalide") return json({ erreur: "invalide" }, 422);
      const issue = await abonnements.abonner(a);
      return issue === "ok" ? json({ ok: true }, 201) : json({ erreur: issue }, STATUS[issue]);
    }
    if (request.method === "DELETE") {
      const c = (await corps(request)) as { endpoint?: unknown } | undefined;
      if (typeof c?.endpoint !== "string" || !abonnements.serviceConnu(c.endpoint)) return json({ erreur: "invalide" }, 422);
      const issue = await abonnements.desabonner(c.endpoint);
      return issue === "ok" ? json({ ok: true }) : json({ erreur: issue }, 503);
    }
    return json({ erreur: "méthode" }, 405);
  }
  if (path === ESSAI_PATH) {
    // Not said to exist to anyone else.
    if (request.method !== "POST" || !equipe(request.headers)) return new Response("Page introuvable", { status: 404 });
    return json(await essai());
  }
  return undefined;
}

/** The test message, sent one subscription after another (the team's phones: a few). */
async function essai(now = Date.now()) {
  const m: abonnements.Message = { titre: "rundata.re : essai des alertes", corps: "Message d'essai, rien à faire.", lien: "https://rundata.re/vigilance" };
  const jwts = new Map<string, Promise<string>>();
  const compte: Record<abonnements.Issue, number> = { envoye: 0, efface: 0, echec: 0 };
  for (const a of await abonnements.tous()) compte[await abonnements.envoyer(a, m, false, jwts, now)]++;
  console.log(`alertes : essai, ${compte.envoye} envoyés, ${compte.efface} effacés, ${compte.echec} en échec`);
  return compte;
}
