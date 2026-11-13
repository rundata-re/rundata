import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { communeFaq } from "../src/web/commune-texte.js";
import { iaAside } from "../src/web/pages.js";
import { faqPage, sansBalises, texteStable } from "../src/web/texte-stable.js";
import type { HomeData, StationNow } from "../src/web/data.js";
import network from "../src/transit/network.json" with { type: "json" };

const get = async (path: string) => (await handle(new Request(`https://rundata.re${path}`, { headers: { accept: "text/html" } }), new Cache(new MemoryStore()))).text();
const HEAD_PAGES = ["/coupures-eau", "/bus", "/sentiers", "/meteo", "/carburants", "/secheresse", "/communes/saint-paul"];
const mainOf = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const ldOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());

describe("the stable text of the head pages", () => {
  it("shows every question of a page's FAQPage in a visible <h3>, /meteo with its stations too", async () => {
    const cache = new Cache(new MemoryStore());
    // /meteo as it nearly always is: with stations (an empty copy shows its other page).
    const st = { nom: "Saint-Denis-Gillot", source: "meteofrance", lon: 55.52, lat: -20.89, altitude_m: 10, time: new Date(Date.now() - 6 * 60_000).toISOString(), stale: false, temperature: 25 } as StationNow;
    await cache.get("web:meteo", 3600, async (): Promise<HomeData> => ({ stations: [st], toutes: [st], sources: [], indisponibles: [], mer: [] }));
    const visible = (html: string) => {
      let s = html;
      let avant: string;
      do {
        avant = s;
        s = s.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, "").replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/(div|section|p)>/g, "");
      } while (s !== avant);
      return sansBalises(s);
    };
    for (const [path, c] of [["/meteo", cache], ...HEAD_PAGES.filter((p) => p !== "/meteo").map((p) => [p, undefined] as const)] as const) {
      const html = await (await handle(new Request(`https://rundata.re${path}`, { headers: { accept: "text/html" } }), c ?? new Cache(new MemoryStore()))).text();
      if (path === "/meteo") expect(html, path).toContain('<section id="stations" aria-labelledby="h-stations">');
      const faq = ldOf(html).find((x) => x["@type"] === "FAQPage");
      expect(faq, path).toBeDefined();
      const h3 = [...mainOf(html).matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => sansBalises(m[1]).replace(/&#39;/g, "'").replace(/[\s\u00a0\u202f]+/g, " ").trim());
      for (const q of faq.mainEntity as { name: string }[]) {
        const name = q.name.replace(/[\s\u00a0\u202f]+/g, " ").trim();
        expect(h3, `${path} : ${name}`).toContain(name);
      }
      // Never hidden: no question in a hidden block or a script.
      expect(visible(mainOf(html)).replace(/&#39;/g, "'").replace(/[\s\u00a0\u202f]+/g, " "), path).toContain((faq.mainEntity[0] as { name: string }).name.replace(/[\s\u00a0\u202f]+/g, " "));
    }
  });

  it("says how to read the page and answers its questions in <main>, with a FAQPage of the same questions", async () => {
    for (const path of HEAD_PAGES) {
      const html = await get(path);
      const main = mainOf(html);
      expect(main, path).toContain('<h2 id="h-lire">Comment lire cette page</h2>');
      expect(main, path).toContain('<h2 id="h-faq">Questions fréquentes</h2>');
      const faq = ldOf(html).find((x) => x["@type"] === "FAQPage");
      expect(faq, path).toBeDefined();
      const questions = [...main.matchAll(/<div class="card faq">([\s\S]*?)<\/div>/g)].flatMap((m) => [...m[1].matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((x) => x[1]));
      expect(questions.length, path).toBeGreaterThanOrEqual(3);
      // The same questions, as the page writes them (its no-break spaces too).
      expect(faq.mainEntity.map((q: { name: string }) => q.name.replace(/[\s\u00a0\u202f]+/g, " ")), path).toEqual(questions.map((q) => q.replace(/&#39;/g, "'").replace(/[\s\u00a0\u202f]+/g, " ")));
    }
  });

  it("moves both blocks about the assistants out of <main>, into one aside after it, and keeps one line with the page's question", async () => {
    for (const path of HEAD_PAGES) {
      const html = await get(path);
      const main = mainOf(html);
      expect(main, path).not.toContain('class="askbox"');
      expect(main, path).not.toMatch(/aria-labelledby="h-ia"/);
      expect(main, path).toMatch(/<p class="ia-ligne">Demandez à votre IA[^<]*<a href="#ia">→<\/a><\/p>/);
      const aside = html.slice(html.indexOf("</main>"));
      expect(aside, path).toMatch(/^<\/main>\n<aside class="wrap ia" id="ia" aria-label="Votre IA">/);
      expect(aside.slice(0, aside.indexOf("</aside>")), path).toMatch(/aria-labelledby="h-ia"/);
    }
    // The page's own question, its first sentence in French.
    expect(mainOf(await get("/coupures-eau"))).toMatch(/<p class="ia-ligne">Demandez à votre IA\s:\s«\sY a-t-il une coupure d(?:'|&#39;)eau à Saint-Denis\s\?\s»/);
  });

  it("leaves the other pages as they were: the question in <main>, no aside", async () => {
    for (const path of ["/vigilance", "/aujourdhui/saint-paul", "/air"]) {
      const html = await get(path);
      expect(html, path).not.toContain('<aside class="wrap ia"');
      expect(mainOf(html), path).not.toContain('class="ia-ligne"');
    }
    expect(mainOf(await get("/aujourdhui/saint-paul"))).toContain('class="askbox"');
  });

  it("asks a commune's questions only with their data, and never names a person", () => {
    const faq = communeFaq("Saint-Paul", "saint-paul");
    expect(faq.map((f) => f.q)).toEqual([
      "Qui distribue l'eau à Saint-Paul ?",
      "Quels bus desservent Saint-Paul ?",
      "Dans quelle zone de vigilance est Saint-Paul ?",
      "Combien d'écoles, de collèges et de lycées à Saint-Paul ?",
      "Quelle était la participation aux dernières municipales à Saint-Paul ?",
    ]);
    expect(faq[0].a).toContain('<a href="/coupures-eau/saint-paul">');
    expect(faq[1].a).toBe("Le réseau Kar&#39;Ouest et le Car Jaune.");
    expect(communeFaq("Saint-Denis", "saint-denis")[1].a).toBe("Les réseaux Citalis, Téléphérique Papang et le Car Jaune.");
    // A distributor whose notices are not read: said so, never « nous ne lisons pas ».
    const tampon = communeFaq("Le Tampon", "le-tampon")[0].a;
    expect(tampon).toContain("Ses avis ne sont pas encore lus par rundata.re");
  });

  it("names on /bus only networks that serve the station of Saint-Pierre, in their GTFS", async () => {
    expect(mainOf(await get("/bus"))).toContain("À la gare de Saint-Pierre, par exemple, on voit ensemble le Car Jaune, Alternéo et CarSud.");
    const stops = network.stops as unknown as [string, string, number, number, string][];
    const gare = (net: string) => stops.some(([n, nom, , , commune]) => n === net && commune === "Saint-Pierre" && /^gare( routi[eè]re)? (de )?s(ain)?t[ -]pierre$/i.test(nom.trim()));
    for (const net of ["carjaune", "alterneo", "carsud"]) expect(gare(net), net).toBe(true);
  });

  it("writes the JSON-LD's answers as text, without the links' tags", () => {
    const ld = faqPage([{ q: "Q ?", a: 'Voir <a href="/x">la page X</a> &amp; plus.' }]) as { mainEntity: { acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe("Voir la page X & plus.");
    expect(texteStable("<p>L</p>", [{ q: "Q ?", a: "R.", id: "h-q", note: "Vérifié." }])).toContain('<h3 id="h-q">Q ?</h3><p>R.</p><p class="note">Vérifié.</p>');
  });

  it("never leaves a < in the text taken from HTML, whatever the HTML", () => {
    expect(sansBalises("<scr<script>ipt>x &amp;lt; <b>y</b> a < b")).toBe("x &amp;lt; y a  b");
    for (const a of ["&amp;lt;script>alert(1)&amp;lt;/script>", "<scr<script>ipt>alert(1)</scr</script>ipt>"]) {
      const ld = faqPage([{ q: "Q ?", a }]) as { mainEntity: { acceptedAnswer: { text: string } }[] };
      expect(ld.mainEntity[0].acceptedAnswer.text).not.toMatch(/[<>]/);
      // The line under the text asks the box's French question, taken from the same kind of HTML.
      const band = `<div class="askbox"><div data-l="fr"><p class="askq">« ${a} Il pleut ? Lis la page. »</p></div></div>`;
      const line = iaAside(band, "<p>Texte</p>")[1].split("\n").pop()!;
      expect(line).toContain("Il pleut ?");
      expect(line.replace(/<\/?(p|a)\b[^>]*>/g, "")).not.toMatch(/[<>]/);
    }
  });
});
