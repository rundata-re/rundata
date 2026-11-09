import { afterEach, describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache, MemoryStore } from "../src/cache.js";
import { cheminMasque } from "../src/chemin-secret.js";
import { axeY, bonJeton, configurerUv, genereLe, heureLocale, pageUv, type Simulation, UV_KV_KEY, UV_PATH } from "../src/web/uv-moufia.js";

const SECRET = "Uq3vT8mWz1kP6sYd0nR4hB";
const O = "https://rundata.re";
const get = (path: string, init?: RequestInit) => handle(new Request(`${O}${path}`, { headers: { accept: "text/html" }, ...init }), new Cache(new MemoryStore()));

// Made up for the test: the team's file is never in the repo.
const DONNEES: Simulation = {
  meta: {
    titre: "Indice UV dessai",
    genere_le: "2026-11-09T12:53Z",
    methode: { a: "méthode a dessai", b: "méthode b dessai" },
    sources: [{ nom: "Source A dessai", donnees: "tension", licence: "licence A dessai" }],
    limites: ["Une limite dessai."],
    recalage: { k: 0.9, uvi_b_recale: "uvi_b × k", origine: "origine dessai", validite: "validité dessai" },
  },
  courbes: [{
    lieu: "urmoufia", date: "2025-12-19", pourquoi: "clair",
    colonnes: ["t", "sza", "mv", "uvi_a", "uvi_b", "cams", "cams_ciel_clair", "uve40_publie", "uvi_b_recale"],
    lignes: [["2025-12-19T04:15Z", 40, 500, 4, 5, 4.5, 5, null, 4.5], ["2025-12-19T08:15Z", 3, 1400, 12, 14, 13, 13.5, null, 12.6], ["2025-12-19T12:15Z", 40, 500, 4, 5, null, 5, null, 4.5]],
  }],
  jours: [{ date: "2025-12-19", lieu: "urmoufia", ciel: "clair", o3: 280.4, midi_t: "2025-12-19T08:15Z", midi_sza: 3, midi_a: 12, midi_b: 14, midi_b_recale: 12.6, midi_cams: 13, midi_cams_ciel_clair: 13.5, midi_uve40: null, max_b: 14.2, max_b_t: "2025-12-19T08:05Z", max_b_recale: 12.78 }],
  derive_mois: [{ lieu: "urmoufia", mois: "2025-11", jours: 20, rapport_p90: 1.2, rapport_median: 1.1 }, { lieu: "urmoufia", mois: "2026-02", jours: 20, rapport_p90: 1.1, rapport_median: 1 }],
  reference_sol: {
    bentham: {
      source: "Référence dessai", condition: "minutes stables", licence: "licence B dessai",
      stats: { "bentham: (b)/Bentham SZA 20-30 matin": { n: 3, mediane: 1.15, q25: 1.1, q75: 1.2 }, "bentham: (b)/Bentham SZA 20-30 après-midi": { n: 4, mediane: 1.16, q25: 1.1, q75: 1.2 } },
      colonnes: ["t", "sza", "uvi_a", "uvi_b", "uvi_bentham", "o3", "uvi_b_recale"],
      lignes: [["2025-06-25T05:45Z", 58, 3.2, 2.8, 2.5, 262, 2.5], ["2025-06-25T06:00Z", 55, 3.6, 3.3, 2.9, 263, 2.9]],
    },
    kipp_lacy: { source: "Radiomètre dessai", licence: "CC BY 4.0", stats: { "kipp lacy: (b)/Kipp par semestre, ciel clair SZA<50": { "2017-S2": { n: 10, mediane: 1.3, q25: 1.2, q75: 1.4 } } } },
  },
};

const kvDe = (valeur: unknown) => ({ lus: [] as string[], async get(key: string) { this.lus.push(key); return valeur; } });

afterEach(() => configurerUv(undefined, undefined));

describe("the secret of the private page", () => {
  it("is compared whole, whatever its length", async () => {
    expect(await bonJeton(SECRET, SECRET)).toBe(true);
    expect(await bonJeton(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(await bonJeton(`${SECRET}x`, SECRET)).toBe(false);
    expect(await bonJeton("", SECRET)).toBe(false);
    expect(await bonJeton(SECRET, undefined)).toBe(false);
  });

  it("is never written down: the path is masked in the log lines and the statistics", () => {
    expect(cheminMasque(`${UV_PATH}${SECRET}`)).toBe("/essais/uv-moufia/*");
    expect(cheminMasque(UV_PATH)).toBe(UV_PATH);
  });
});

describe("the private page", () => {
  it("opens with the secret, reads its data from KV once, and is neither kept nor indexed nor sent on", async () => {
    const kv = kvDe(DONNEES);
    configurerUv(SECRET, kv);
    const r = await get(`${UV_PATH}${SECRET}`);
    expect(r.status).toBe(200);
    expect(kv.lus).toEqual([UV_KV_KEY]);
    expect(r.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    const html = await r.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<p class="essai">Essai interne, non publié</p>');
    // No script, no link to another site, no canonical address.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("href=");
    // The credits and the limits as the data gives them.
    for (const t of ["Source A dessai", "licence A dessai", "Référence dessai", "licence B dessai", "Radiomètre dessai", "Une limite dessai.", "validité dessai"]) expect(html).toContain(t);
  });

  it("writes La Réunion's times (UTC+4)", () => {
    expect(heureLocale("2025-12-19T08:15Z")).toBe("12:15");
    expect(heureLocale("2025-12-19T21:30Z")).toBe("01:30");
    expect(heureLocale(null)).toBe("—");
    expect(genereLe("2026-11-09T12:53Z")).toBe("09/11/2026 à 16:53");
    const html = pageUv(DONNEES);
    // The day's midday and its maximum, local.
    expect(html).toContain("<td>12:15</td>");
    expect(html).toContain("<small>12:05</small>");
    // The day's chart, from 8 h to 16 h local.
    expect(html).toContain(">8\u00a0h</text>");
    expect(html).toContain(">16\u00a0h</text>");
  });

  it("draws the day's series that have values, (b) against the reference, and the drift with its gap", () => {
    const html = pageUv(DONNEES);
    for (const c of ["s-a", "s-b", "s-k", "s-c", "s-cc"]) expect(html).toContain(`<path class="${c}"`);
    // No publication of the UVE on that day: neither its line nor its legend.
    expect(html).not.toContain('class="s-u"');
    // The cloud, its line y = x and y = x / k.
    expect(html).toContain('<g class="s-b"><circle');
    expect(html).toContain('<line class="un"');
    expect(html).toContain('<line class="dk"');
    // A month without data cuts the drift's line in two.
    const p90 = html.slice(html.indexOf('<path class="d-p90 d-urmoufia"'));
    expect(p90.slice(0, p90.indexOf("/>")).match(/M/g)).toHaveLength(2);
    // The angles, morning and afternoon; the half-years.
    expect(html).toContain("<th scope=\"row\">20-30°</th><td>1,15 <small>(n = 3)</small></td><td>1,16 <small>(n = 4)</small></td>");
    expect(html).toContain("(b)/Kipp par semestre, ciel clair SZA&lt;50, 2017-S2");
  });

  it("says when the data is not loaded yet", async () => {
    configurerUv(SECRET, kvDe(null));
    const r = await get(`${UV_PATH}${SECRET}`);
    expect(r.status).toBe(503);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await r.text()).toContain("Les données de cette page ne sont pas encore chargées.");
  });

  it("is not found without the right secret, without one set, below it or for anything but a read", async () => {
    const kv = kvDe(DONNEES);
    configurerUv(SECRET, kv);
    for (const [path, init] of [[`${UV_PATH}${SECRET.slice(1)}`], [UV_PATH], [`${UV_PATH}${SECRET}/x`], [`${UV_PATH}${SECRET}`, { method: "POST" }]] as [string, RequestInit?][]) {
      const r = await get(path, init);
      expect(r.status).toBe(404);
      expect(r.headers.get("cache-control")).toBe("no-store, no-transform");
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    configurerUv(undefined, kv);
    expect((await get(`${UV_PATH}${SECRET}`)).status).toBe(404);
    // Nothing read without the secret.
    expect(kv.lus).toEqual([]);
  });

  it("is forbidden in robots.txt, and in no sitemap", async () => {
    const robots = await (await get("/robots.txt")).text();
    expect(robots.split("\n\n")[1]).toContain(`Disallow: ${UV_PATH}\n`);
    const map = await (await get("/sitemap.xml")).text();
    expect(map).not.toContain("/essais/");
  });

  it("rounds its scales", () => {
    expect(axeY(14.2).ticks.map((t) => t.v)).toEqual([0, 2.5, 5, 7.5, 10, 12.5, 15]);
    expect(axeY(1.46, 0.84).ticks.map((t) => t.v)).toEqual([0.8, 1, 1.2, 1.4, 1.6]);
  });
});
