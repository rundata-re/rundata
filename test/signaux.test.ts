import { describe, expect, it } from "vitest";
import { handle, JETON_EQUIPE } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { point, type Hit } from "../src/metrics.js";
import { connecteurPage } from "../src/web/connecteur.js";
import { legalPage } from "../src/web/legal-page.js";
import { CSS } from "../src/web/style.js";
import { lire, SIGNAL_SCRIPT, VENU } from "../src/web/signaux.js";
import { cles } from "./contexte.js";

const O = "https://rundata.re";
const BROWSER = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "accept-language": "fr-FR,fr;q=0.9",
  "sec-fetch-mode": "no-cors",
  "sec-fetch-site": "same-origin",
  origin: O,
};

const beacon = (body: string, headers: Record<string, string> = BROWSER, method = "POST") =>
  new Request(`${O}/signal`, { method, headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", ...headers }, body: method === "POST" ? body : undefined });

async function hitsOf(request: Request): Promise<{ hits: Hit[]; response: Response }> {
  const hits: Hit[] = [];
  const response = await handle(request, new Cache(), () => {}, (h) => hits.push(h));
  return { hits, response };
}

// The page's own function, as the browser runs it.
const venu = new Function(`${VENU}return venu;`)() as (m: unknown, j: string) => [string, { p: string; d: string }];

describe("What a page's browser tells, as read", () => {
  it("reads the four events, with their page and value", () => {
    expect(lire("e=a&v=&p=%2Fmeteo&t=412&l=1830")).toEqual({ event: "affichage", path: "/meteo", value: "", ttfb: 412, lcp: 1830 });
    expect(lire("e=c&v=&p=%2Fmcp")).toEqual({ event: "adresse copiée", path: "/mcp", value: "" });
    expect(lire("e=o&v=non&p=%2Fsentiers")).toEqual({ event: "aide", path: "/sentiers", value: "non" });
    expect(lire("e=r&v=l&p=%2F")).toEqual({ event: "retour", path: "/", value: "lendemain" });
    expect(["p", "j", "l", "s", "t"].map((v) => lire(`e=r&v=${v}&p=%2F`)?.value)).toEqual(["première", "même jour", "lendemain", "dans la semaine", "plus tard"]);
  });

  it("reads a link followed from an agenda as the site it leads to, its name only", () => {
    expect(lire("e=s&v=teat.re&p=%2Fevenements%2Fce-week-end")).toEqual({ event: "sortie", path: "/evenements/ce-week-end", value: "teat.re" });
    expect(lire("e=s&v=billetterie.example.re&p=%2Faujourdhui%2Fsaint-paul")?.value).toBe("billetterie.example.re");
    expect(lire("e=s&v=xn--sechoir-bya.re&p=%2Fevenements")?.value).toBe("xn--sechoir-bya.re");
    // Never a path, a query, an address or anything else in its place.
    for (const v of ["teat.re%2Fprogrammation", "https%3A%2F%2Fteat.re", "teat.re%3Fa%3D1", "localhost", "TEAT.RE", "", "-teat.re", "a b.re", `${"a".repeat(98)}.re`])
      expect(lire(`e=s&v=${v}&p=%2Fevenements`), v).toBeUndefined();
  });

  it("keeps nothing it does not know: no other event, value, page or time", () => {
    expect(lire("e=x&v=&p=%2F")).toBeUndefined();
    expect(lire("e=o&v=peut-etre&p=%2F")).toBeUndefined();
    expect(lire("e=r&v=2026-10-20&p=%2F")).toBeUndefined();
    expect(lire("e=a&v=quelque+chose&p=%2F")).toBeUndefined();
    expect(lire("e=o&v=oui&p=https%3A%2F%2Fexample.org%2F")).toBeUndefined();
    expect(lire("e=o&v=oui&p=%2F%2Fexample.org")).toBeUndefined();
    // The connector's address counts on its page only.
    expect(lire("e=c&v=&p=%2F")).toBeUndefined();
    // A time that is not one is left out, the rest kept.
    expect(lire("e=a&v=&p=%2F&t=-3&l=9999999")).toEqual({ event: "affichage", path: "/", value: "", ttfb: undefined, lcp: undefined });
  });
});

describe("POST /signal, as recorded", () => {
  it("records one signal point for a page of the site, never a page view", async () => {
    const { hits, response } = await hitsOf(beacon("e=o&v=oui&p=%2Fmeteo"));
    expect(response.status).toBe(204);
    expect(hits).toEqual([{ kind: "signal", name: "/meteo", detail: "aide", value: "oui", ok: true, ms: undefined, lcp: undefined }]);
    const shown = await hitsOf(beacon("e=a&v=&p=%2Fmeteo&t=380&l=1200"));
    expect(shown.hits[0]).toMatchObject({ kind: "signal", detail: "affichage", ms: 380, lcp: 1200 });
  });

  it("writes « interne » the signals of a device of the team, as its pages are", async () => {
    expect(lire("e=o&v=oui&p=%2F&i=1")).toEqual({ event: "aide", path: "/", value: "oui", team: true });
    expect(lire("e=o&v=oui&p=%2F&i=0")).toEqual({ event: "aide", path: "/", value: "oui" });
    const { hits } = await hitsOf(beacon("e=r&v=l&p=%2Fmeteo&i=1"));
    expect(hits).toEqual([{ kind: "signal", name: "/meteo", detail: "retour", value: "lendemain", ok: true, ms: undefined, lcp: undefined, team: true }]);
    const p = point(hits[0], { who: "navigateur", country: "RE", from: "", audience: "humain", language: "fr", device: "mobile" });
    expect([p.blobs[3], p.blobs[8]]).toEqual(["interne", "interne"]);
    // The page knows it by the mark of web/pwa.ts, set before its signals.
    const html = legalPage(O, "confidentialite");
    expect(SIGNAL_SCRIPT).toContain('...(typeof team!=="undefined"&&team?{i:"1"}:{})');
    expect(html.indexOf("let team=false")).toBeGreaterThan(0);
    expect(html.indexOf("let team=false")).toBeLessThan(html.indexOf("const sig="));
  });

  it("records nothing from another site, a script of the team, a body too long or a GET", async () => {
    const other = await hitsOf(beacon("e=o&v=oui&p=%2F", { ...BROWSER, "sec-fetch-site": "cross-site", origin: "https://example.org" }));
    expect(other.response.status).toBe(204);
    expect(other.hits).toEqual([]);
    expect((await hitsOf(beacon("e=o&v=oui&p=%2F", { ...BROWSER, "sec-fetch-site": "same-origin", origin: "https://example.org" }))).hits).toEqual([]);
    // The team is known by its secret, not by its User-Agent (src/app.ts).
    cles({ equipe: "secret-de-test-equipe" });
    try {
      expect((await hitsOf(beacon("e=o&v=oui&p=%2F", { ...BROWSER, [JETON_EQUIPE]: "secret-de-test-equipe" }))).hits).toEqual([]);
      expect((await hitsOf(beacon("e=o&v=oui&p=%2F", { ...BROWSER, "user-agent": "rundata-check/essai" }))).hits).toHaveLength(1);
    } finally {
      cles({ equipe: undefined });
    }
    // A valid signal made long by a key the page never sends: kept at 300 bytes, refused at 301 by the length alone.
    const long = (n: number) => { const b = "e=o&v=oui&p=%2F&x="; return b + "a".repeat(n - b.length); };
    expect((await hitsOf(beacon(long(300)))).hits).toHaveLength(1);
    expect((await hitsOf(beacon(long(301)))).hits).toEqual([]);
    const get = await hitsOf(beacon("", BROWSER, "GET"));
    expect(get.response.status).toBe(405);
    expect(get.hits).toEqual([]);
  });

  it("writes a signal as a page, with its event, its value and its times, and no referring site", () => {
    const p = point({ kind: "signal", name: "/meteo", detail: "affichage", value: "", ok: true, ms: 380, lcp: 1200 }, { who: "navigateur", country: "RE", from: "interne", audience: "humain", language: "fr", device: "mobile" });
    expect(p.indexes).toEqual(["signal"]);
    expect(p.blobs.slice(0, 12)).toEqual(["signal", "/meteo", "affichage", "navigateur", "RE", "", "meteo", "fr", "humain", "", "", "mobile"]);
    expect(p.doubles).toEqual([1, 380, 0, 0, 0, 1200]);
    const r = point({ kind: "signal", name: "/", detail: "retour", value: "dans la semaine", ok: true }, { who: "navigateur", country: "RE", from: "", audience: "humain", language: "fr" });
    expect(r.blobs[2]).toBe("retour");
    expect(r.blobs[9]).toBe("dans la semaine");
  });
});

/** The page's script run against a stub of the browser: its listeners, and what it sent by beacon. */
function page(path = "/evenements") {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const sent: Record<string, string>[] = [];
  class El {
    constructor(private readonly link?: { href: string; marked: boolean }) {}
    closest(selector: string) {
      return selector === "[data-sortie] a[href]" && this.link?.marked ? { href: this.link.href } : null;
    }
  }
  const globals = {
    navigator: { sendBeacon: (_u: string, b: URLSearchParams) => sent.push(Object.fromEntries(b)) },
    location: { pathname: path, host: "rundata.re", href: `https://rundata.re${path}` },
    addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] ??= []).push(f),
    document: { addEventListener: () => {}, querySelectorAll: () => [], referrer: "https://rundata.re/" },
    performance: { getEntriesByType: () => [] },
    PerformanceObserver: class { observe() {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    Element: El,
  };
  new Function(...Object.keys(globals), SIGNAL_SCRIPT)(...Object.values(globals));
  const fire = (type: string, button: number, href?: string, marked = true, extra = {}) =>
    (listeners[type] ?? []).forEach((f) => f({ type, button, target: new El(href ? { href, marked } : undefined), ...extra }));
  return { sent, fire };
}

describe("A link followed from an agenda of events", () => {
  it("sends the site's name and the page left, once per click, the middle button's and ctrl's too", () => {
    const { sent, fire } = page("/evenements/ce-week-end");
    fire("click", 0, "https://www.teat.re/programmation/?utm=x#a");
    fire("click", 0, "https://kabardock.com/agenda", true, { ctrlKey: true });
    fire("auxclick", 1, "https://bisik.re/agenda/");
    expect(sent).toEqual([
      { e: "s", v: "teat.re", p: "/evenements/ce-week-end" },
      { e: "s", v: "kabardock.com", p: "/evenements/ce-week-end" },
      { e: "s", v: "bisik.re", p: "/evenements/ce-week-end" },
    ]);
  });

  it("sends nothing for a link of the site, a link outside the agenda, a right click or a mail", () => {
    const { sent, fire } = page();
    fire("click", 0, "https://rundata.re/evenements/concerts");
    fire("click", 0, "/meteo");
    fire("click", 0, "https://www.teat.re/", false);
    fire("auxclick", 2, "https://www.teat.re/");
    fire("click", 0, "mailto:contact@example.re");
    fire("click", 0);
    expect(sent).toEqual([]);
  });

  it("is marked on the lists of events and the venues' programmes, not elsewhere", async () => {
    const { concertsPage } = await import("../src/web/evenements.js");
    const empty = { value: { evenements: [], couverture: "", sources: [] }, fetchedAt: new Date(), stale: false } as never;
    expect(concertsPage(O, empty)).toMatch(/<p data-sortie>Les programmes des salles/);
    const { longsCard } = await import("../src/web/agenda.js");
    expect(longsCard([{ titre: "Expo", date: "2026-11-20", quand: "du vendredi 20/11 au dimanche 20/12", genres: [], lien: "https://www.teat.re/expo" } as never], undefined as never, "x"))
      .toContain('<ul class="rows eau" data-sortie>');
  });
});

describe("The class of a visit, from the two days kept", () => {
  const today = "2026-10-27";
  it("tells the first visit, the same day, the next day, the week and later", () => {
    expect(venu(null, today)).toEqual(["p", { p: today, d: today }]);
    expect(venu({ p: "2026-09-01", d: today }, today)).toEqual(["j", { p: "2026-09-01", d: today }]);
    expect(venu({ p: "2026-09-01", d: "2026-10-26" }, today)).toEqual(["l", { p: "2026-09-01", d: today }]);
    expect(venu({ p: "2026-09-01", d: "2026-10-25" }, today)[0]).toBe("s");
    expect(venu({ p: "2026-09-01", d: "2026-10-20" }, today)[0]).toBe("s");
    expect(venu({ p: "2026-09-01", d: "2026-10-19" }, today)[0]).toBe("t");
  });

  it("never extends the mark: 13 months after the first visit, all is wiped and the visit is the first", () => {
    // The first visit's day is kept as it was, whatever the visits since.
    expect(venu({ p: "2025-09-28", d: "2026-10-26" }, today)).toEqual(["l", { p: "2025-09-28", d: today }]);
    expect(venu({ p: "2025-09-27", d: "2026-10-26" }, today)).toEqual(["p", { p: today, d: today }]);
    expect(venu({ p: "2024-01-01", d: "2026-10-26" }, today)).toEqual(["p", { p: today, d: today }]);
  });

  it("starts again from a mark it cannot read, or from a day after today", () => {
    for (const m of [{}, "x", 42, { p: "hier", d: today }, { p: "2026-10-01" }, { p: "2026-10-01", d: "2026-11-02" }]) {
      expect(venu(m, today)).toEqual(["p", { p: today, d: today }]);
    }
  });
});

describe("The pages' part", () => {
  it("asks « Cette page vous a aidé ? » just above the feedback form, only with a script", () => {
    const html = legalPage(O, "confidentialite");
    const at = html.indexOf('<aside class="aide wrap"');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(html.indexOf('id="avis"'));
    expect(html).toContain('data-js hidden>\n<p class="q">Cette page vous a aidé ? <button type="button" data-aide="oui">Oui</button> <button type="button" data-aide="non">Non</button></p>');
    expect(html).toContain('<p data-apres="oui" role="status" hidden>Merci !</p>');
    expect(html).toContain('<p data-apres="non" role="status" hidden>Merci. Dites à rundata.re ce qui vous a manqué : <a href="#avis">laisser un avis</a></p>');
    // The paragraphs' display must not show the hidden answers with the question (seen on phones, 29/10/2026).
    expect(CSS).toContain(".aide [hidden]{display:none}");
  });

  it("sends by beacon to this site, and keeps in the browser only the two days of the visits", () => {
    expect(SIGNAL_SCRIPT).toContain('navigator.sendBeacon("/signal"');
    expect(SIGNAL_SCRIPT.match(/localStorage\.setItem\(/g)).toHaveLength(1);
    expect(SIGNAL_SCRIPT).toContain('localStorage.setItem("venu",JSON.stringify(n));sig("r",c)');
    expect(SIGNAL_SCRIPT).not.toMatch(/sessionStorage|document\.cookie/);
  });

  it("marks the connector's copy buttons, counted on /mcp", () => {
    expect(connecteurPage(O)).toContain('data-copy="mcp-url" data-signal aria-label="Copier l\'adresse du connecteur"');
  });

  it("says on /confidentialite what is sent and what the browser keeps", () => {
    const html = legalPage(O, "confidentialite");
    expect(html).toContain("Le site ne pose aucun cookie et ne contient aucun traceur publicitaire. Dans votre navigateur, sans cookie, le site garde la date de votre première et de votre dernière visite, pour savoir s'il sert d'un jour à l'autre\u00a0; il n'en envoie qu'une catégorie (voir <a href=\"#retours\">«\u00a0Les retours\u00a0»</a>).");
    expect(html).not.toContain("Seule la vérification anti-robot");
    expect(html).toContain("La page envoie aussi, sans identifiant, le temps qu'elle a mis à s'afficher sur votre appareil ; sur la page du connecteur, le fait que son adresse a été copiée ; quand vous suivez un lien depuis l'agenda des événements, le nom du site où il mène (par exemple le site d'une salle) et la page d'où vous partez, sans l'adresse complète du lien ; et votre réponse au bouton « Cette page vous a aidé ? » (la page, et oui ou non).</p>\n  <p>Ces statistiques sont gardées par Cloudflare");
    expect(html).toContain('<p id="retours">Les retours. Pour savoir si le site sert d\'un jour à l\'autre, votre navigateur garde deux dates :');
    // What venu() does: past 13 months, wiped at the next visit, before anything is sent (« première »).
    expect(html).toContain("Passé 13 mois après votre première visite, il est effacé dès votre visite suivante, avant tout envoi\u00a0; il n'est jamais prolongé. Sans nouvelle visite, il reste sur votre appareil, sans être lu ni envoyé.");
    expect(html).toContain('(« Cookies : solutions pour les outils de mesure d\'audience », <a href="https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience" aria-label="cnil.fr"><span class="adrweb">cnil.<wbr>fr</span></a>).</p>');
  });

  it("says on /confidentialite what Cloudflare Web Analytics measures, after our own statistics", () => {
    const html = legalPage(O, "confidentialite");
    expect(html).toContain("Une mesure de Cloudflare, sans cookie, compte aussi les pages vues et leur vitesse d'affichage (voir <a href=\"#mesure-cloudflare\">«\u00a0La mesure de Cloudflare\u00a0»</a>). Rien n'est vendu");
    expect(html).toContain("trois mois au plus.</p>\n  <p id=\"mesure-cloudflare\">La mesure de Cloudflare. Chaque page charge aussi un petit script de Cloudflare Web Analytics");
    expect(html).toContain("Comme pour toute page, Cloudflare reçoit votre adresse IP\u00a0; selon sa documentation, il ne s'en sert pas, ni d'aucune autre donnée, pour suivre les visiteurs dans le temps ou d'un site à l'autre.");
    expect(html).toContain("Cloudflare garde chaque mesure 7 jours, puis un échantillon d'environ un dixième, que nous pouvons consulter pendant six mois.");
    expect(html).toContain("Mise à jour\u00a0: 30 octobre 2026.");
  });
});
