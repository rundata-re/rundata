import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { site } from "../src/web/site.js";
import { DAES } from "../src/providers/dae.js";
import { RANDONNEES, SENTIERS } from "../src/providers/traces.js";
import { fr } from "../src/tools/format.js";
import { descriptionOf as decheteriesDescription } from "../src/web/decheteries.js";
import { bornesDescription, daePage, electriciteDescription, eauDescription, randonneesDescription, traceShort, velosDescription } from "../src/web/domains.js";
import { DESCRIPTION_MAX } from "../src/web/pages.js";
import { gardee } from "../src/web/sitemap-gardees.js";

const NOW = new Date("2026-11-24T05:00:00Z");
const O = "https://rundata.re";
const get = async (path: string) => (await site(new Request(`${O}${path}`), new Cache(new MemoryStore(), () => NOW.getTime()), () => {}, NOW))!.text();
const meta = (html: string) => html.match(/<meta name="description" content="([^"]*)">/)![1].replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

// A page has a description with the figures or the time of its copy, and a short one while the copy is not read. Each
// fits in the 160 signs a search engine shows (DESCRIPTION_MAX): the one with the figures with realistic values, at the
// largest (a time of 5 characters, counts of 3 digits), so that a page whose live description never fits is red here.
describe("descriptions", () => {
  it("of the sitemap's pages, as served before any copy is read, fit in 160 signs", async () => {
    const sm = await get("/sitemap.xml");
    const paths = [...sm.matchAll(/<loc>https:\/\/rundata\.re([^<]*)<\/loc>/g)].map((m) => m[1] || "/").filter(gardee);
    expect(paths.length).toBeGreaterThan(200);
    const trop: string[] = [];
    for (const p of paths) {
      const d = meta(await get(p));
      if (d.length > 160) trop.push(`${d.length} ${p} ${d}`);
    }
    expect(trop).toEqual([]);
  }, 120_000);

  it("with the figures of the copy fit with the largest realistic values, and say them", () => {
    const at = "le 24/11 à 05:07";
    const said: [string, string, string][] = [
      ["/velos", velosDescription(999), "999 vélos libres"],
      ["/eau", eauDescription(999, 999), "999 plages et bassins sur 999"],
      ["/randonnees", randonneesDescription(999, 999, 999), "999 fermés"],
      ["/electricite", electriciteDescription(at, 9999, 100), "9 999 MW"],
      ["/bornes", bornesDescription(`état du 24/11 à 05:07`, 999, 999), "999 points libres sur 999"],
      ["/decheteries", decheteriesDescription([{ a_jour: true, mis_a_jour: "24/11 05:07" }] as never), at],
    ];
    for (const [page, d, figure] of said) {
      expect(d.length, `${page} : ${d}`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(d.replace(/[\u00a0\u202f]/g, " "), page).toContain(figure);
    }
  });

  it("of a trail keep its whole name, the words around it giving way", () => {
    const long = "Sentier panoramique de Bois Rouge (ancien sentier Bassin Bleu)";
    expect(traceShort(long)).toBe(`${long} (La Réunion, 974) : trace GPS (GPX), longueur, dénivelé, profil et état d'après l'ONF.`);
    expect(traceShort("Chemin Charrette")).toBe("Chemin Charrette (La Réunion, 974) : trace GPS à télécharger (GPX), longueur, dénivelé, profil et état du sentier d'après l'ONF.");
    // Every trail and hike the site has a page for, its longest name included.
    const noms = [...Object.keys(SENTIERS), ...RANDONNEES.map((r) => r.nom)];
    expect(noms.length).toBeGreaterThan(300);
    for (const n of [long, "x".repeat(75), "x".repeat(90), ...noms]) {
      expect(traceShort(n).length, n).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(traceShort(n).startsWith(`${n} (`), n).toBe(true);
    }
    expect(traceShort("x".repeat(75))).toBe(`${"x".repeat(75)} (974) : trace GPS (GPX), longueur, dénivelé, profil et état d'après l'ONF.`);
    expect(traceShort("x".repeat(90))).toBe(`${"x".repeat(90)} (974) : trace GPS (GPX), longueur, dénivelé et état d'après l'ONF.`);
  });

  it("of the defibrillators count them from the bundled base, by the hundred below", () => {
    const n = Math.floor(DAES.length / 100) * 100;
    expect(n).toBeGreaterThanOrEqual(1200);
    expect(meta(daePage(O, null, NOW)).replace(/[\u00a0\u202f]/g, " ")).toContain(`plus de ${fr(n).replace(/[\u00a0\u202f]/g, " ")} appareils`);
  });
});
