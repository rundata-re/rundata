import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { counted } from "../src/budget.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { enChargement, texteVisible } from "../src/robots.js";
import { COMMUNES } from "../src/web/commune.js";
import { STATIONS, stationPath } from "../src/web/station.js";
import { avisLus } from "../src/web/coupures.js";

const O = "https://rundata.re";
const NAVIGATEUR = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const get = (path: string, ua?: string) =>
  new Request(`${O}${path}`, { headers: { accept: "text/html", ...(ua ? { "user-agent": ua } : {}) } });

/**
 * A page that says its own subject is not read: every wording of it in the code (web/coupures.ts, tools/coupures.ts,
 * web/eau-cyclone.ts, tools/resume.ts). Not a source named beside the subject and not read (the OVPF's Facebook page,
 * on /volcan with its data: « que nous ne lisons pas »), nor a read still to come (« pas encore lues : prochaine lecture »), nor one
 * distributor of a commune whose others are read (« Les avis de la mairie ne sont pas lus »), nor the water's question
 * on a commune's page, whose subject is the commune (web/commune-texte.ts).
 */
const NON_LU = /(?:nous ne lisons|ne lit) pas (?:les |ses |d')avis|avis de coupure[^.]{0,80}ne sont pas (?:encore )?lus|leurs avis ne sont pas lus|avis du distributeur[^.]{0,40}ne sont pas lus/i;

async function sitemap(): Promise<string[]> {
  const xml = await (await handle(get("/sitemap.xml"), new Cache(new MemoryStore()))).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(O.length) || "/");
}

describe("the sitemap, as a search engine's robot reads it", () => {
  it("holds no page in noindex, none that says it does not read its source, and never one still loading", async () => {
    const urls = await sitemap();
    expect(urls.length).toBeGreaterThan(500);
    const fautes: string[] = [];
    for (const path of urls) {
      // Cold and with no subrequest allowed: every page that reads a source has nothing yet, the worst case.
      const { value: r } = await counted(0, () => handle(get(path, GOOGLEBOT), new Cache(new MemoryStore())));
      const text = await r.text();
      if (r.status === 503) {
        // Told to come back, never handed the page without its data.
        if (r.headers.get("retry-after") !== "60") fautes.push(`${path} : 503 sans Retry-After`);
      } else if (r.status !== 200) fautes.push(`${path} : ${r.status}`);
      else if (enChargement(text)) fautes.push(`${path} : « se charge »`);
      // As a browser sees it, its data loading or not: never in noindex, never saying that its source is not read.
      const { value: b } = await counted(0, () => handle(get(path, NAVIGATEUR), new Cache(new MemoryStore())));
      const vu = await b.text();
      // A page unavailable for now (503, the bus without their database here) is not indexed either way.
      if (b.status === 200 && (/<meta name="robots" content="[^"]*noindex/.test(vu) || /noindex/.test(b.headers.get("x-robots-tag") ?? ""))) fautes.push(`${path} : noindex`);
      const nonLu = texteVisible(vu).match(NON_LU);
      if (nonLu) fautes.push(`${path} : « ${nonLu[0]} »`);
    }
    expect(fautes.join("\n")).toBe("");
  }, 600_000);

  it("leaves out the weather stations' pages and the water cuts of a commune whose notices are not read, still online", async () => {
    const urls = new Set(await sitemap());
    for (const x of STATIONS) expect(urls.has(stationPath(x.id)), stationPath(x.id)).toBe(false);
    const nonLues = COMMUNES.filter((p) => !avisLus(p.nom));
    const lues = COMMUNES.filter((p) => avisLus(p.nom));
    expect(nonLues.length).toBeGreaterThan(0);
    expect(lues.length).toBeGreaterThan(0);
    for (const p of nonLues) expect(urls.has(`/coupures-eau/${p.slug}`), p.slug).toBe(false);
    for (const p of lues) expect(urls.has(`/coupures-eau/${p.slug}`), p.slug).toBe(true);
    expect(urls.has("/coupures-eau")).toBe(true);
    // Still served, in noindex for the water cuts only.
    const cache = new Cache(new MemoryStore());
    const coupure = await (await counted(0, () => handle(get(`/coupures-eau/${nonLues[0].slug}`), cache))).value.text();
    expect(coupure).toContain('<meta name="robots" content="noindex">');
    // What keeps it out: the guard above would see it.
    expect(texteVisible(coupure)).toMatch(NON_LU);
    const station = await (await counted(0, () => handle(get(stationPath(STATIONS[0].id)), cache))).value;
    expect(station.status).toBe(200);
    expect(await station.text()).not.toContain("noindex");
  });

  it("hands a browser the page that loads, and a robot a 503 that tells it to come back", async () => {
    const path = `/coupures-eau/${COMMUNES.find((p) => avisLus(p.nom))!.slug}`;
    const page = await (await counted(0, () => handle(get(path, NAVIGATEUR), new Cache(new MemoryStore())))).value;
    expect(page.status).toBe(200);
    expect(enChargement(await page.text())).toBe(true);
    const robot = await (await counted(0, () => handle(get(path, GOOGLEBOT), new Cache(new MemoryStore())))).value;
    expect(robot.status).toBe(503);
    expect(robot.headers.get("retry-after")).toBe("60");
    expect(robot.headers.get("cache-control")).toBe("no-store");
    // Google ignores a 5xx's headers: no noindex, which could only confuse another engine.
    expect(robot.headers.get("x-robots-tag")).toBeNull();
  });

  it("knows every wording of a page whose own subject is not read", () => {
    for (const t of [
      "Nous ne lisons pas les avis de coupure de Sudéau : voir la mairie.",
      "Pas d'avis en ligne lisible pour Le Tampon : rundata.re ne lit pas les avis de coupure de Sudéau, qui y distribue l'eau.",
      "D'après l'ARS, Sudéau distribue l'eau au Tampon, et rundata.re ne lit pas ses avis.",
      "Les avis de coupure de Sudéau ne sont pas lus par rundata.re\u00a0: voir son site.",
      "Ses avis de coupure ne sont pas lus par rundata.re : ils sont sur ses avis aux abonnés et auprès de la mairie.",
      "D'après l'ARS, deux distributeurs. Leurs avis ne sont pas lus par rundata.re.",
      "Les avis du distributeur du Tampon ne sont pas lus par rundata.re : voir la mairie.",
    ]) expect(t, t).toMatch(NON_LU);
    for (const t of [
      "Les offres ne sont pas encore lues : prochaine lecture prévue à 10:30.",
      "Les avis de la mairie ne sont pas lus par rundata.re.",
      "Sudéau, d'après le contrôle sanitaire de l'ARS. Ses avis ne sont pas encore lus par rundata.re : adressez-vous à la mairie ou au distributeur.",
      "Avis non lus par rundata.re : Sudéau (Le Tampon).",
      "L'OVPF publie aussi sur Facebook, que nous ne lisons pas : suivre sa page officielle.",
      "Programme sportif de la commune : rundata.re ne lit pas ce document, il en donne seulement le lien.",
      "Un événement Facebook n'est pas un flux ouvert, et rundata.re ne lit pas Facebook.",
    ]) expect(t, t).not.toMatch(NON_LU);
  });

  it("reads « se charge » in the visible text only, not in a script's message", () => {
    expect(enChargement("<p>Les mesures se chargent : rechargez la page.</p>")).toBe(true);
    expect(enChargement("<p>L'état des sentiers se charge.</p>")).toBe(true);
    expect(enChargement("<p>La vigilance se&nbsp;charge.</p>")).toBe(true);
    expect(enChargement('<script>const T={liste:"La liste n\'a pas pu se charger."}</script><p>Défibrillateurs</p>')).toBe(false);
    expect(enChargement("<p>La liste n'a pas pu se charger.</p>")).toBe(false);
  });
});
