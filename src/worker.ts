/**
 * Cloudflare Worker entry: the same MCP endpoint as the Node server (app.ts), at the edge.
 *
 * Upstream answers are kept in isolate memory and in the Cloudflare cache of the data center, so that one
 * METAR call serves every isolate there for five minutes. The Cloudflare cache only works on a custom domain
 * (on *.workers.dev its calls do nothing). The AROME grids, filled every few minutes by the scheduled event,
 * live in KV instead: the event runs in some data center, the questions in all the others.
 */
import { failed, handle } from "./app.js";
import { contexte, fichiersStatiques, installer, stockageKv, type Ecriture, type Lecture, type Secrets } from "./contexte.js";
import { lenteSaid, withAttentes } from "./attentes.js";
import { minuit, minuitDu, minuitSaid, MINUIT_BUDGET } from "./web/minuit.js";
import { BUILD_BUDGET, PAGE_BUDGET, SCHEDULED_BUDGET, copiesSaid, copyRead, count, counted, later, readsSaid, reponseSaid, scheduled, spent } from "./budget.js";
import { Cache, CACHE_FORMAT, MemoryStore, TieredStore, type CacheEntry, type CacheStore } from "./cache.js";
import { KvStore } from "./kv.js";
import { toutesLesSources, VERSION } from "./server.js";
import { appliDe } from "./appli.js";
import { audience, device, language, origin, point, sansLieu, TEAM, teamVisit, visitor, type Hit } from "./metrics.js";
import * as irve from "./providers/irve.js";
import { HOTES_MEDIAS } from "./providers/actualites.js";
import { HOTES_AGENDAS } from "./providers/agenda.js";
import { HOTES_EAU } from "./providers/avis-eau.js";
import { HOTES_COURANT } from "./providers/coupures-courant.js";
import * as meteorOi from "./providers/meteor-oi.js";
import { autorisee } from "./providers/autorisations.js";
import * as meteofrance from "./providers/meteofrance.js";
import * as radar from "./providers/radar.js";
import * as vigilanceCarte from "./providers/vigilance-carte.js";
import * as mf from "./providers/vigilance.js";
import { detecter, type Changement } from "./alertes-etat.js";
import type { VolcanAnswer } from "./web/data.js";
import * as cmrsCarte from "./providers/cmrs-carte.js";
import * as cmrsTrace from "./providers/cmrs-trace.js";
import * as limite from "./limite.js";
import { refusRobot } from "./robots.js";
import * as espaceClubs from "./clubs/espace.js";
import * as connexions from "./connecteurs/connexions.js";
import * as lecture from "./connecteurs/lecture.js";
import * as propositions from "./propositions.js";
import * as sansReponse from "./sans-reponse.js";
import { themesDesSources } from "./chiffres.js";
import { whenFailed, whenRead } from "./http.js";
import { rafraichirConnecteurs, refreshPlanned } from "./tools/agenda.js";
import { prefetchForecasts } from "./tools/prevision.js";
import { listShared, SHARED, SHARED_AFTER, SharedFallback, warmShared } from "./web/partagees.js";
import * as pluieRetro from "./web/pluie-retro.js";
import * as radarSemaine from "./web/radar-semaine.js";
import { why } from "./types.js";
import { COLLECTEURS, dit, passage } from "./collecteurs.js";
import { cheminMasque } from "./chemin-secret.js";
import { plage } from "./web/plage.js";
import { sansIndex } from "./web/noindex.js";
import * as envoiAlertes from "./push/envoi.js";
import { enLigne as alertesEnLigne } from "./web/alertes-drapeau.js";
import { GARDE_TAPEE, gardeTapee } from "./providers/terrain.js";

// How long the edge keeps an entry. Much longer than any freshness window: an old copy is what gets served,
// marked as such, while a source is down.
const KEEP_SECONDS = 7 * 24 * 3600;

class EdgeStore implements CacheStore {
  // Per shape of the entries (cache.ts): a deploy keeps the data center's cache unless it changes that shape.
  private url(key: string) {
    return `https://cache.reunion-temps-reel.internal/upstream/format-${CACHE_FORMAT}/${encodeURIComponent(key)}`;
  }
  async get(key: string) {
    try {
      count(1, "read");
      const r = await (await caches.open("upstream")).match(this.url(key));
      if (!r) return undefined;
      // Its size for the log line of the subrequests (budget.ts copyRead), in characters, about its bytes: the same parse
      // as r.json(), its length added.
      const text = await r.text();
      copyRead(key, text.length);
      return JSON.parse(text) as CacheEntry;
    } catch {
      return undefined; // a cache problem must never cost an answer
    }
  }
  async put(key: string, entry: CacheEntry) {
    try {
      // What someone typed, or its point: 3 days at most (providers/terrain.ts gardeTapee).
      const keep = gardeTapee(key) ? GARDE_TAPEE : KEEP_SECONDS;
      const body = new Response(JSON.stringify(entry), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${keep}` },
      });
      count(1, true);
      await (await caches.open("upstream")).put(this.url(key), body);
    } catch {
      // same
    }
  }
}

/** The part of a KV namespace binding used here. */
interface KvNamespace {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>;
}

/** The Worker's bindings and secrets. */
interface Env {
  METEOFRANCE_APPLICATION_ID?: string;
  METEOFRANCE_API_KEY?: string;
  /** Optional: NASA FIRMS's MAP_KEY, for the fires seen by satellite (src/providers/feux.ts). */
  FIRMS_MAP_KEY?: string;
  /** Optional: the Cerema's key to the Candhis buoys, asked by the scheduled event (src/providers/candhis.ts). */
  CANDHIS_API_KEY?: string;
  /** Optional: the token SolarDB sent (ENERGY-Lab), as is: the UV index measured at Moufia, read by the scheduled event (src/providers/uv-mesure.ts). */
  SOLARDB_JETON?: string;
  STORE?: KvNamespace;
  USAGE?: AnalyticsDataset;
  TRANSIT?: D1Database;
  CLIMAT?: D1Database;
  CLIMAT_H?: D1Database;
  AVIS?: D1Database;
  /** Optional: the salt of the feedback senders' fingerprints (src/avis.ts). */
  AVIS_SEL?: string;
  /** Optional: the secret key of the Turnstile widget of the clubs' forms (web/propositions.ts). */
  TURNSTILE_SECRET?: string;
  /** Optional, both or nothing: the verify token chosen for Meta's webhook, and the Meta app's secret (src/meta-webhook.ts). */
  META_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  /** Optional: the key that encrypts the secrets of the associations' platforms (src/connecteurs/chiffre.ts), 32 bytes in base64. */
  CONNECTEURS_CLE?: string;
  /** Optional: the token of OpenAI's plugin portal, served at /.well-known/openai-apps-challenge (web/site.ts). */
  OPENAI_APPS_CHALLENGE?: string;
  /** Optional: the secret of the private page of an internal trial, /essais/uv-moufia/<secret> (web/uv-moufia.ts); without it, the page is not found. */
  UV_MOUFIA_JETON?: string;
  /** Optional: the team's secret, sent by its scripts in the header `rundata-jeton` so that their calls are not counted (src/app.ts). */
  EQUIPE_JETON?: string;
  /** Optional: the VAPID key of the alerts on the phone, a P-256 JWK (scripts/vapid-cles.mjs, src/push/webpush.ts); one for the trial Worker, another for production. */
  VAPID_PRIVE?: string;
  /** « 1 » on the trial Worker only (wrangler.essai.jsonc): the alerts' addresses open there (web/alertes-drapeau.ts). */
  ALERTES_ESSAI?: string;
  /** Cloudflare Email Sending: the confirmation of the events the clubs propose (src/propositions.ts). */
  EMAIL?: propositions.EmailBinding;
  /** Browser Rendering: the picture of Météo-France's official map of the vigilance (src/providers/vigilance-carte.ts). */
  BROWSER?: vigilanceCarte.Browser;
  /** The static assets (public/), served before the Worker; read through it by a tool: a commune's map of sectors (vie/carte-scolaire.ts). */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Rate Limiting: the calls to /mcp and the forms' sends, per address and per minute (src/limite.ts). */
  LIMITE_MCP?: limite.Limiteur;
  LIMITE_FORMULAIRES?: limite.Limiteur;
  LIMITE_TRAJETS?: limite.Limiteur;
}

/** A D1 binding's reads, as the modules make them (contexte.ts `Lecture`); each module counts its own. */
function lectureD1(d1: D1Database): Lecture {
  return { all: async <T>(sql: string, ...params: unknown[]) => (await d1.prepare(sql).bind(...params).all<T>()).results };
}

/** A D1 binding's writes (contexte.ts `Ecriture`), for the modules that write there; counted by `portesAvis` or by the module. */
function ecritureD1(d1: D1Database): Ecriture {
  return {
    run: async (sql: string, ...params: unknown[]) => (await d1.prepare(sql).bind(...params).run()).meta.changes,
    batch: async (statements) => (await d1.batch(statements.map(([sql, ...params]) => d1.prepare(sql).bind(...params)))).map((r) => r.meta.changes),
  };
}

/** The part of a D1 binding used here. */
interface D1Statement {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): D1Statement };
  /** Several statements in one call, in one transaction. */
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
}

/** The part of a Workers Analytics Engine binding used here. */
interface AnalyticsDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/**
 * One point per MCP message or page view (metrics.ts: `point` lists the columns, for the SQL API), and one log line
 * per MCP message, with the same fields.
 */
function recorder(env: Env, request: Request) {
  const usage = env.USAGE;
  const headers = request.headers;
  // The team's visits are written « interne », whatever their User-Agent says (metrics.ts, teamVisit).
  const team = teamVisit(headers, new URL(request.url));
  const cf = (request as { cf?: { country?: unknown; asn?: unknown } }).cf;
  // The network: a browser from Meta's is Meta checking a link (metrics.ts, META_ASN).
  const asn = typeof cf?.asn === "number" ? cf.asn : undefined;
  const who = team ? TEAM : visitor(headers.get("user-agent") ?? "", asn);
  const ua = headers.get("user-agent") ?? "";
  // Nothing of where the app's phone is, not even its country (appli.ts).
  const country = appliDe(ua) ? "" : String(cf?.country ?? "");
  // The campaign's channel, a page of the site (« interne ») or the referring site (metrics.ts, origin).
  const from = origin(headers.get("referer"), new URL(request.url));
  return (asked: Hit) => {
    const hit = sansLieu(asked, ua);
    if (hit.kind === "mcp" || hit.kind === "rpc") console.log(logLine(hit, who, country));
    if (!usage) return;
    try {
      // A signal comes from a page's browser: read as a page view is (web/signaux.ts).
      const page = hit.kind === "page" || hit.kind === "signal";
      usage.writeDataPoint(point(hit, { who, country, from, audience: page ? (team ? TEAM : audience(headers, asn)) : "", language: page ? language(headers.get("accept-language")) : "", mode: page && headers.get("rundata-mode") === "app" ? "app" : "", device: page ? device(headers, asn) : "" }));
    } catch (err) {
      console.error("analytics : écriture impossible", why(err));
    }
  };
}

/** The log line of an MCP message: an object, whose fields the Workers logs keep apart. */
function logLine(hit: Hit, visitor: string, country: string) {
  const line: Record<string, unknown> = {
    message: `mcp ${hit.method || hit.name}${hit.kind === "mcp" ? ` ${hit.name}` : ""} : ${hit.outcome}`,
    method: hit.method, tool: hit.kind === "mcp" ? hit.name : undefined, client: hit.client, client_version: hit.clientVersion,
    protocol: hit.protocol, outcome: hit.outcome, error: hit.message, args: hit.args, place: hit.detail, place_status: hit.place,
    commune: hit.commune, copie: hit.copie || undefined, ms: hit.ms, subrequests: hit.subrequests, cache_hits: hit.cacheHits, cache_loads: hit.cacheLoads,
    size: hit.size, visitor, country,
  };
  for (const k of Object.keys(line)) if (line[k] === undefined || line[k] === "") delete line[k];
  return line;
}

let cache: Cache | undefined;
// The bindings and the secrets the modules' context was built with (setup).
let contexteDe: unknown[] = [];

/**
 * The Worker's secrets as the modules read them (contexte.ts `secret`), each by what it is for. The buoys' and the
 * UV's keys only with the store: the state their source's reads keep is there.
 */
function secretsDe(env: Env): Secrets {
  return {
    ...(env.STORE && { candhis: env.CANDHIS_API_KEY, solardb: env.SOLARDB_JETON }),
    meteofranceApplication: env.METEOFRANCE_APPLICATION_ID,
    meteofranceCle: env.METEOFRANCE_API_KEY,
    firms: env.FIRMS_MAP_KEY,
    selAvis: env.AVIS_SEL,
    turnstile: env.TURNSTILE_SECRET,
    equipe: env.EQUIPE_JETON,
    uvMoufia: env.UV_MOUFIA_JETON,
    defiOpenai: env.OPENAI_APPS_CHALLENGE,
    metaVerification: env.META_VERIFY_TOKEN,
    metaApplication: env.META_APP_SECRET,
    connecteurs: env.CONNECTEURS_CLE,
    vapid: env.VAPID_PRIVE,
  };
}

function setup(env: Env): Cache {
  // What the modules read at the time they need it (contexte.ts), built once per isolate (the bindings do not change,
  // as for `cache` below): a module's copy kept in memory stays valid from one request to the next.
  const secrets = secretsDe(env);
  const de = [env.STORE, env.TRANSIT, env.CLIMAT, env.CLIMAT_H, env.AVIS, env.BROWSER, env.ASSETS, env.EMAIL, env.ALERTES_ESSAI, ...Object.values(secrets)];
  if (!contexte().worker || de.length !== contexteDe.length || de.some((v, i) => v !== contexteDe[i])) {
    installer({
      worker: true,
      ...(env.STORE && { kv: stockageKv(env.STORE), brut: env.STORE }),
      secrets,
      // The bus timetables; the daily measurements since 1900 and the hourly ones since 2000, imported by
      // scripts/build-climat.py and scripts/build-climat-h.py, the current year and month by .github/workflows/climat.yml;
      // in the first, the sea's history: the Candhis buoys since 1996 and the satellite since 2003 (scripts/mer.sql, the
      // current year by .github/workflows/mer.yml), an empty archive until its tables are imported; the declared
      // associations (RNA) in the feedback's database (scripts/associations.sql, .github/workflows/associations.yml),
      // where the feedback, the clubs' proposals and space, the alerts' subscriptions, the associations' links and the
      // sites that do not answer are written (scripts/avis.sql, propositions.sql, clubs.sql, alertes.sql, connecteurs.sql,
      // sans-reponse.sql).
      bases: {
        ...(env.TRANSIT && { transit: lectureD1(env.TRANSIT) }),
        ...(env.CLIMAT && { climat: lectureD1(env.CLIMAT) }),
        ...(env.CLIMAT_H && { climatHoraire: lectureD1(env.CLIMAT_H) }),
        ...(env.AVIS && { avis: lectureD1(env.AVIS), avisEcriture: ecritureD1(env.AVIS) }),
      },
      // Météo-France's official map of the vigilance photographed by the scheduled event, its bulletin and its picture
      // kept in the store (providers/vigilance-carte.ts), as the RSMC's maps (cmrs-carte.ts, cmrs-trace.ts) and the
      // bulletins above green (vigilance-episodes.ts); the collège of an address, from its commune's file in the static
      // assets (vie/carte-scolaire.ts).
      ...(env.BROWSER && { navigateur: env.BROWSER }),
      ...(env.ASSETS && { fichiers: fichiersStatiques(env.ASSETS) }),
      // The links of the clubs' proposals, of the associations' connectors and of the clubs' space, e-mailed through
      // Cloudflare: without the binding, a proposal is refused rather than kept unconfirmable, and nothing is linked.
      ...(env.EMAIL && { courriel: propositions.envoiCloudflare(env.EMAIL) }),
      // The trial Worker opens the alerts on the phone (web/alertes-drapeau.ts).
      ...(env.ALERTES_ESSAI === "1" && { essai: true }),
    });
    contexteDe = de;
  }
  // The public sites that do not answer, in the same database: a failed read is written after the response, and only
  // when it changes the host's state (sans-reponse.ts counts its own calls).
  sansReponse.inscrire(toutesLesSources(), themesDesSources(), HOTES_MEDIAS, HOTES_EAU, HOTES_COURANT, HOTES_AGENDAS);
  whenFailed((source, url, err) => {
    const constat = sansReponse.constatDe(err);
    if (constat) later(sansReponse.noter(source, url, constat));
  });
  whenRead((url) => sansReponse.lu(url));
  // Without the KV binding, the bundles stay in the data center's cache like everything else.
  // The page copies shared by every data center are read from KV when the data center's cache has none (web/partagees.ts).
  // Each page's copy says which version built it: one of another version is built again at its first view (cache.ts).
  const edge = env.STORE ? new SharedFallback(new EdgeStore(), env.STORE, Date.now, VERSION) : new EdgeStore();
  return (cache ??= new Cache(new TieredStore(new MemoryStore(), edge), Date.now, false, env.STORE && new KvStore(env.STORE), VERSION));
}

/** public/_headers' lines for /demo/*, which a response of the Worker does not get from it. */
const DEMO_HEADERS = { "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const arrived = Date.now();
    // A named robot, or a browser of a hosting network, on an address robots.txt forbids, before anything is read or
    // built (robots.ts).
    const robot = refusRobot(request);
    if (robot) return robot;
    // A connection past its threshold is answered before anything is read or built.
    const trop = await limite.refuse(request, { mcp: env.LIMITE_MCP, formulaire: env.LIMITE_FORMULAIRES, trajet: env.LIMITE_TRAJETS });
    if (trop) return trop;
    // The demo video, sent through the Worker for it alone (wrangler.jsonc, run_worker_first): the static assets answer
    // a byte range with the whole file, and Safari plays a video only from ranges (web/plage.ts). Same headers as
    // public/_headers gives /demo/*.
    if (env.ASSETS && new URL(request.url).pathname.startsWith("/demo/")) {
      return plage(request, await env.ASSETS.fetch(new Request(request.url)), DEMO_HEADERS);
    }
    const c = setup(env);
    // A page served from its last copy refreshes it after the response (web/data.ts); an agenda too slow for the
    // answer is still stored (tools/agenda.ts).
    // The path as the log lines write it, without the secret of a club's link (chemin-secret.ts).
    const path = cheminMasque(new URL(request.url).pathname);
    const { value: { value, attentes }, used, settled } = await counted(
      PAGE_BUDGET,
      () => withAttentes(() => handle(request, c, later, recorder(env, request)).catch((err) => failed(path, err))),
      (p) => ctx.waitUntil(p),
    );
    // Once the work after the response is done too: it counts against the same budget.
    ctx.waitUntil(settled().then((total) => {
      const after = total.used > used ? `, dont ${total.used - used} après la réponse` : "";
      const refused = total.refused ? `, ${total.refused} refusées (budget de ${PAGE_BUDGET})` : "";
      if (total.used) console.log(`sous-requêtes : ${total.used} (${path})${after}${refused}${readsSaid(total.reads)}${copiesSaid(total.copies)}`);
    }));
    // The wait of the visitor, apart from the invocation's duration (which counts the work after the response).
    const ms = Date.now() - arrived;
    console.log(reponseSaid(ms, path));
    // Past SLOW_MS, what the view waited for, in one line (attentes.ts).
    const lente = lenteSaid(ms, path, attentes);
    if (lente) console.log(lente);
    // A file that is not a page is kept out of search results (web/noindex.ts).
    return sansIndex(value);
  },

  async scheduled(controller: { cron?: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const c = setup(env);
    const kv = env.STORE;
    // MétéoR-OI's stations, in an event of their own cron (wrangler.jsonc) and their own budget: one file per station,
    // every 10 minutes, kept in KV (src/providers/meteor-oi.ts). Nothing else is done in it.
    if (controller.cron === meteorOi.CRON) {
      if (kv && autorisee(meteorOi.AUTORISATION)) {
        ctx.waitUntil(counted(BUILD_BUDGET, async () => {
          count();
          const now = new Date();
          const before = (await kv.get(meteorOi.KV_KEY, "json")) as meteorOi.Copie | null;
          let ecrite: meteorOi.Copie | undefined;
          const said = await meteorOi.collect(before, async (copie) => {
            ecrite = copie;
            count(1, true);
            await kv.put(meteorOi.KV_KEY, JSON.stringify(copie), { expirationTtl: meteorOi.KV_TTL_SECONDS });
          }, now, async (jour, stations) => {
            // At the pass of 23:53 in La Réunion only: the day of each station added to the days kept, for
            // historique_meteo (providers/meteor-oi.ts JOURS_KEY). A read and a write of KV, once a day.
            count();
            const gardes = (await c.kept<meteorOi.Jours>(meteorOi.JOURS_KEY))?.value;
            count(1, true);
            await c.keep(meteorOi.JOURS_KEY, meteorOi.ajouterJour(gardes, jour, stations), meteorOi.JOURS_TTL_SECONDS);
          });
          // The first pass after a round hour keeps that hour's rain, from the files it just read (meteor-oi.ts, heures).
          const h = meteorOi.heureDue(now);
          if (!ecrite || h === undefined) return said;
          count();
          const avant = (await kv.get(meteorOi.HEURES_KV_KEY, "json")) as meteorOi.Heures | null;
          const gardees = meteorOi.heures(avant, ecrite.mesures, h);
          count(1, true);
          await kv.put(meteorOi.HEURES_KV_KEY, JSON.stringify(gardees), { expirationTtl: meteorOi.HEURES_KV_TTL_SECONDS });
          const n = Object.values(gardees.st).filter((v) => v[v.length - 1] != null).length;
          return `${said}, pluie de l'heure gardée pour ${n} stations`;
        }, (p) => ctx.waitUntil(p))
          .then(({ value, used, reads }) => console.log(`stations MétéoR-OI : ${value}, sous-requêtes : ${used}${readsSaid(reads)}`))
          .catch((err) => console.error("stations MétéoR-OI : lecture impossible", why(err))));
      }
      return;
    }
    // The AROME grids first; then, with what is left of the invocation, the shared page copies that are due, and the
    // forecast's ensemble with what they left.
    // The radar's history waits for the Météo-France token only, never for the slow reads after it (web/pluie-retro.ts).
    // The changes the alerts follow, found with the copies below and sent after them (push/envoi.ts).
    let changements: Changement[] = [];
    let tokenDone = () => {};
    const token = new Promise<void>((r) => (tokenDone = r));
    // Its own budget, enough for every copy that is due: past it a subrequest is refused here (budget.ts).
    const reads = counted(SCHEDULED_BUDGET, async () => {
      scheduled();
      // The Météo-France token renewed before it is due, here rather than by a question (providers/mf-auth.ts): its
      // log line says when.
      await meteofrance.keepFresh("cron").catch((err) => (console.error("jeton Météo-France : renouvellement impossible", why(err)), null));
      tokenDone();
      const arome = await prefetchForecasts(c).catch((err) => (console.error("préchargement AROME impossible", why(err)), null));
      const aromeUsed = spent();
      // The Météo-France stations' slots and hourly package due, into the copy in KV that the questions and the views
      // read (providers/meteofrance.ts `refreshShared`, which takes no token: the one above, when it is held): before
      // the shared copies, whose /chiffres counts the stations from it, and the day before (`keepVeille`), its package.
      const stations = kv && meteofrance.enabled() ? await meteofrance.refreshShared(c).catch((err) => (console.error("stations Météo-France : copie impossible", why(err)), null)) : null;
      // One listing of KV for both.
      const listing = kv ? listShared(kv) : undefined;
      // The copies built alongside (the rivers', minutes long), waited for after everything else: never before it.
      const held: Promise<void>[] = [];
      const hold = (work: Promise<void>) => void held.push(work);
      const first = kv ? await warmShared(c, kv, new Date(), SHARED, listing, hold) : { written: [], left: [] };
      const after = kv ? await warmShared(c, kv, new Date(), SHARED_AFTER, listing, hold) : { written: [], left: [] };
      // Last, with what is left: the agendas read only here.
      const agendas = kv ? await refreshPlanned(c).catch((err) => (console.error("agendas planifiés impossibles", why(err)), null)) : null;
      await Promise.all(held);
      // The alerts a push follows, from the copies just kept (alertes-etat.ts): a log line a run when one goes, sent
      // below once the alerts are open, else nothing sent. The copies whole, so that a stale or late one is not read.
      // One KV read, one write only when the state changes.
      if (kv) {
        const [vig, vol] = await Promise.all([c.peek<mf.Vigilance>(mf.KEY), c.peek<VolcanAnswer>("web:volcan")]).catch(() => [undefined, undefined] as const);
        changements = await detecter(kv, vig, vol, new Date(), console.log, alertesEnLigne()).catch((err) => (console.error("alertes push : état impossible", why(err)), []));
      }
      const copies = { written: [...first.written, ...after.written], left: [...first.left, ...after.left] };
      return { arome, aromeUsed, stations, copies, agendas };
      // What a read hands over after it (a failed read written down) finishes within the event.
    }, (p) => ctx.waitUntil(p))
      .then(({ value, used, reads }) => console.log(`préchargement AROME : ${JSON.stringify(value.arome)}, sous-requêtes : ${value.aromeUsed}` +
        (value.stations ? ` ; stations Météo-France : ${JSON.stringify(value.stations)}` : "") +
        (value.copies.written.length ? ` ; copies partagées : ${value.copies.written.join(", ")}` : "") +
        (value.copies.left.length ? ` ; reportées : ${value.copies.left.map((x) => `${x.key} (${x.why})`).join(", ")}` : "") +
        (value.agendas?.lus.length || value.agendas?.gardes.length || value.agendas?.reportes.length || value.agendas?.trop_vieilles.length ? ` ; agendas planifiés : ${JSON.stringify(value.agendas)}` : "") +
        (value.copies.written.length || value.copies.left.length || value.agendas?.lus.length ? `, sous-requêtes en tout : ${used}` : "") +
        // Each source's reads in the event: one read more often than its freshness says its copy did not carry over.
        readsSaid(reads)))
      .catch((err) => console.error("préchargement impossible", why(err)));
    ctx.waitUntil(reads);
    const now = new Date();
    // The alerts on the phone, once open: this run's changes, then the next batch of the message going out, in a budget
    // of their own (push/envoi.ts). Closed (production until the flag), nothing here.
    if (kv && alertesEnLigne()) {
      ctx.waitUntil(reads.then(() => counted(envoiAlertes.ENVOI_BUDGET, () => envoiAlertes.passage(changements, kv, now)))
        .then(({ value, used }) => value && console.log(`envoi des alertes : ${JSON.stringify(value)}, sous-requêtes : ${used}`))
        .catch((err) => console.error("envoi des alertes impossible", why(err))));
    }
    // Every 15 minutes, at 5, 20, 35 and 50 past the hour: La Réunion's part of the national file of the charging points
    // (about 9 Mo), once the reads above are done, so that the file is never in memory with their copies.
    if (kv && irve.refreshDue(now)) {
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => irve.refresh(async (live) => {
        count(1, true);
        await kv.put(irve.KV_KEY, JSON.stringify(live), { expirationTtl: irve.LIVE_TTL_SECONDS });
      }, now)))
        .then(({ value, used, reads }) => console.log(`bornes de recharge : ${value} points de La Réunion, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("bornes de recharge : état impossible", why(err))));
    }
    // From 00:00 to 00:40 in La Réunion: the communes' page copies of the day, a few each event, once the reads above
    // are done, in a budget of their own (web/minuit.ts).
    if (kv && minuitDu(now)) {
      ctx.waitUntil(reads.then(() => counted(MINUIT_BUDGET, () => minuit(c, new Date()), (p) => ctx.waitUntil(p)))
        .then(({ value, used }) => console.log(`copies de minuit : ${minuitSaid(value, used)}`))
        .catch((err) => console.error("copies de minuit impossibles", why(err))));
    }
    // The collectors that keep one copy in KV (collecteurs.ts), each in a budget of its own once the reads above are done.
    if (kv) {
      for (const col of COLLECTEURS) {
        if (!col.due(now)) continue;
        ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => passage(col, kv, now)))
          .then((r) => console.log(dit(col, r)))
          .catch((err) => console.error(`${col.nom} : lecture impossible`, why(err))));
      }
    }
    // Every run: the radar's latest image added to its last 6 hours in KV when it is new, or a gap when it cannot be
    // read or is too old (web/pluie-retro.ts), once the Météo-France token is renewed, never after the reads above: the
    // rivers' could take two minutes when Vigicrues did not answer (06/11/2026), and Météo-France, which serves its latest
    // image only, had put out the next one by then. One read of KV; one write when it changed.
    // About once a quarter of an hour, one more read and write: the 24 hours, an image a quarter of an hour; once an
    // hour, the week and its days besides, outside the run's cost (web/radar-semaine.ts).
    if (kv && radar.enabled()) {
      ctx.waitUntil(Promise.race([token, reads.then(() => {}, () => {})]).then(() => counted(BUILD_BUDGET, () => pluieRetro.passage({
        get: async () => (await kv.get(pluieRetro.KV_KEY, "json")) as pluieRetro.Historique | null,
        put: (h) => kv.put(pluieRetro.KV_KEY, JSON.stringify(h), { expirationTtl: pluieRetro.KV_TTL_SECONDS }),
      }, c, now, {
        get: async () => (await kv.get(pluieRetro.LONG_KV_KEY, "json")) as pluieRetro.Historique | null,
        put: (h) => kv.put(pluieRetro.LONG_KV_KEY, JSON.stringify(h), { expirationTtl: pluieRetro.LONG_KV_TTL_SECONDS }),
      }, undefined, {
        heures: {
          get: async () => (await kv.get(radarSemaine.HEURES_KEY, "json")) as pluieRetro.Historique | null,
          put: (h) => kv.put(radarSemaine.HEURES_KEY, JSON.stringify(h), { expirationTtl: radarSemaine.TTL_SECONDS }),
        },
        jour: (date) => ({
          get: async () => (await kv.get(radarSemaine.JOUR_PREFIX + date, "json")) as pluieRetro.Historique | null,
          put: (h) => kv.put(radarSemaine.JOUR_PREFIX + date, JSON.stringify(h), { expirationTtl: radarSemaine.TTL_SECONDS }),
        }),
      })))
        .then(({ value, used, reads }) => console.log(`historique radar : ${value}, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("historique radar : passage impossible", why(err))));
    }
    // Every 30 minutes while GDACS has an active system: the RSMC's list of bulletins at 15 and 45 past the hour, its
    // track map at 20 and 50, one request each, kept in KV (src/providers/cmrs-carte.ts), once the reads above are done.
    if (kv && cmrsCarte.due(now)) {
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => cmrsCarte.passage(c, now)))
        .then(({ value, used, reads }) => console.log(`carte du CMRS : ${value}, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("carte du CMRS : lecture impossible", why(err))));
    }
    // Every 5 minutes, from 25 minutes to 2 h 30 after each synoptic hour, while GDACS has an active system and once
    // Météo-France agrees: the RSMC's last bulletin, its position kept in KV (src/providers/cmrs-trace.ts).
    if (kv && cmrsTrace.enLigne() && cmrsTrace.due(now)) {
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => cmrsTrace.passage(c, now)))
        .then(({ value, used, reads }) => console.log(`trace du CMRS : ${value}, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("trace du CMRS : lecture impossible", why(err))));
    }
    // Once a day, at 06:00 in La Réunion: each public site that did not answer asked again (sans-reponse.ts), once the
    // reads above are done, so that its one GET is never part of a run of ours.
    if (sansReponse.heureDuPassage(now)) {
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, async () => {
        const fait = await sansReponse.reverifier(now);
        // The rows just written replace this data center's copy, read before the recheck by the same event.
        if (fait) await sansReponse.relire(c).catch((err) => console.error("sites sans réponse : relecture impossible", why(err)));
        return fait;
      }))
        .then(({ value, used, reads }) => value && console.log(`sites sans réponse : ${value.essayes} revérifiés${value.changes.length ? `, ${value.changes.join(", ")}` : ""}, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("sites sans réponse : revérification impossible", why(err))));
    }
    // Once a day, at 00:20 in La Réunion (and 00:35 when the day's last hour was not out yet): the day before at each
    // Météo-France station, from the hourly package, kept in KV for historique_meteo until the daily file is loaded at
    // noon, once the reads above are done.
    if (kv && meteofrance.enabled() && meteofrance.veilleDue(now)) {
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => meteofrance.keepVeille(c, now)))
        .then(({ value, used, reads }) => value && console.log(`veille : ${value.jour}, ${Object.keys(value.stations).length} stations${value.complet ? "" : " (dernière heure absente)"}, sous-requêtes : ${used}${readsSaid(reads)}`))
        .catch((err) => console.error("veille : cumul impossible", why(err))));
    }
    // Once a day, at 04:00 in La Réunion (the run between 00:00 and 00:05 UTC): what the clubs sent is forgotten on
    // time even on the days nothing new is proposed (scripts/propositions.sql), and their links to a platform the same
    // (scripts/connecteurs.sql), and the clubs' own space (scripts/clubs.sql).
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
      ctx.waitUntil(propositions.purger(now)
        .then((n) => console.log(`propositions : purge quotidienne, ${n} lignes`))
        .catch((err) => console.error("propositions : purge impossible", why(err))));
      ctx.waitUntil(connexions.purger(now)
        .then((n) => console.log(`connecteurs : purge quotidienne, ${n} lignes`))
        .catch((err) => console.error("connecteurs : purge impossible", why(err))));
      ctx.waitUntil(espaceClubs.purger(now)
        .then((n) => console.log(`espace club : purge quotidienne, ${n} lignes`))
        .catch((err) => console.error("espace club : purge impossible", why(err))));
      // The clubs of MonClub, once a week: read when the last reading is 6 and a half days old.
      ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => espaceClubs.relireAnnuaire(now)))
        .then(({ value, used }) => value && console.log(`espace club : annuaire relu, ${value.lus} clubs, ${value.retires} retirés, sous-requêtes : ${used}`))
        .catch((err) => console.error("espace club : annuaire impossible", why(err))));
    }
    // At each run, once the reads above are done: the one association's platform due, if any (every 6 hours each).
    ctx.waitUntil(reads.then(() => counted(BUILD_BUDGET, () => lecture.lireUne(now, () => rafraichirConnecteurs(c, now))))
      .then(({ value, used }) => value && console.log(`connecteurs : ${JSON.stringify(value)}, sous-requêtes : ${used}`))
      .catch((err) => console.error("connecteurs : lecture impossible", why(err))));
  },
};
