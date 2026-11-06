import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as cpf from "../src/providers/cpf.js";
import * as emploiSource from "../src/providers/emploi.js";
import * as boamp from "../src/providers/marches-publics.js";
import { enGrand, nombre } from "../src/tools/format.js";
import { MOBILE_DU, SUPPORTS } from "../src/vie/antennes.js";
import { antennesLive } from "../src/web/antennes.js";
import { buildEmploi, emploiLive, type EmploiAnswer } from "../src/web/emploi.js";
import { homePage } from "../src/web/home.js";
import { buildMarches, marchesLive, type MarchesAnswer } from "../src/web/marches-publics.js";
import { pecheLive } from "../src/web/peche.js";
import { DOMAINS, HOME_TILES } from "../src/web/site.js";

// 06/11/2026 at 20:30 in La Réunion.
const NOW = new Date("2026-11-06T16:30:00Z");
const at = (iso: string) => new Date(iso);
const cached = <T>(value: T, fetchedAt = NOW) => ({ value, fetchedAt, stale: false });
const tiles = (page: string) => Object.fromEntries([...page.matchAll(/<li class="tile k-([a-z]+)[^"]*">(.*?)<\/li>/gs)].map((m) => [m[1], m[2]]));

afterEach(() => {
  emploiSource.configure(undefined);
  boamp.configure(undefined);
  cpf.configure(undefined);
  vi.unstubAllGlobals();
});

describe("the home page's tile of fishing", () => {
  it("says what is closed today, after the prefect's decrees, and the hours of the bichiques in their season", () => {
    expect(pecheLive(NOW)).toEqual({ valeur: "Capucin nain : pêche fermée", detail: "aujourd'hui 06/11, d'après les arrêtés du préfet ; bichiques : pêche ouverte de 05:04 à 19:00" });
    // Two closed or more: their number.
    expect(pecheLive(at("2026-12-05T08:00:00Z")).valeur).toBe("Pêche fermée pour 2 espèces");
    // The bichiques out of their season: closed, and no hours.
    const mars = pecheLive(at("2027-03-05T08:00:00Z"));
    expect(mars.valeur).toBe("Pêche fermée pour 3 espèces");
    expect(mars.detail).toBe("aujourd'hui 05/03, d'après les arrêtés du préfet");
    // The day of La Réunion, not of UTC: 21:00 UTC is already the next day there.
    expect(pecheLive(at("2026-11-06T21:00:00Z")).detail).toContain("aujourd'hui 07/11,");
  });
});

describe("the figures of the tiles", () => {
  it("take plain no-break spaces, in the tile only: the running text keeps the narrow one", () => {
    expect(enGrand(`1\u202f151 supports`)).toBe("1\u00a0151 supports");
    expect(enGrand(`25\u202f°C <span class="nw">à 10:00</span>`)).toBe(`25\u00a0°C <span class="nw">à 10:00</span>`);
    const page = homePage("https://rundata.re", { meteo: null }, NOW);
    expect([...page.matchAll(/<p class="tv">(.*?)<\/p>/gs)].filter((m) => m[1].includes("\u202f"))).toEqual([]);
    expect(tiles(page).antennes).toContain(`<p class="tv">${nombre(SUPPORTS.length).replace("\u202f", "\u00a0")} supports</p>`);
    expect(antennesLive().valeur).toBe(`${nombre(SUPPORTS.length)} supports`);
  });
});

describe("the home page's tile of the antennas", () => {
  it("counts the mobile supports of the bundled file, with its day", () => {
    expect(antennesLive()).toEqual({ valeur: `${nombre(SUPPORTS.length)} supports`, detail: `d'antennes mobiles déclarés à l'ANFR, fichier du ${MOBILE_DU.slice(8, 10)}/${MOBILE_DU.slice(5, 7)}/${MOBILE_DU.slice(0, 4)}` });
  });
});

describe("the home page's tiles of the public jobs and markets", () => {
  const emploi = { resume: "", nombre: 508, offres: [], couverture: "", sources: [], lu: "2026-11-06T16:25:00Z" } as EmploiAnswer;
  const marches = { nombre: 103, avis: [{}], sources: [], lu: "2026-11-06T15:35:00Z" } as unknown as MarchesAnswer;

  it("give their page's count, and when their source was read", () => {
    expect(emploiLive(cached(emploi))).toEqual({ valeur: "508 offres", detail: "ouvertes à la candidature, Choisir le service public lu le 06/11 à 20:25" });
    expect(marchesLive(cached(marches))).toEqual({ valeur: "103 avis", detail: "de marché ouverts aux réponses, BOAMP lu le 06/11 à 19:35" });
    expect(emploiLive(cached({ ...emploi, nombre: 1 }))!.valeur).toBe("1 offre");
    expect(marchesLive(cached({ ...marches, nombre: 1 }))!.detail).toContain("de marché ouvert aux réponses");
  });

  it("say in their page's words when there is nothing to count", () => {
    expect(emploiLive(cached({ ...emploi, prochaine: "2026-11-06T17:25:00Z" }))).toEqual({ valeur: "", detail: "Les offres ne sont pas encore lues : prochaine lecture prévue à 21:25.", vide: true });
    expect(marchesLive(cached({ ...marches, avis: [], nombre: 0, enLecture: 4 }))!.detail).toBe("4 avis lus au BOAMP le 06/11 à 19:35 sont en cours de tri, pour ne garder que ceux de l'île.");
    expect(emploiLive(cached({ ...emploi, nombre: 0 }))!.vide).toBe(true);
    expect(emploiLive(null)).toBeUndefined();
  });

  it("are on the home page, from the copies it reads", () => {
    const t = tiles(homePage("https://rundata.re", { meteo: null, emploi: cached(emploi), marches: cached(marches) }, NOW));
    expect(t.emploi).toContain(`<p class="tv">508 offres</p>`);
    expect(t.marches).toContain(`<p class="tv">103 avis</p>`);
    expect(t.peche).toContain(`<p class="tv">Capucin nain : pêche fermée</p>`);
    expect(t.antennes).toContain(`<p class="tv">${enGrand(nombre(SUPPORTS.length))} supports</p>`);
  });

  it("never read Choisir le service public nor the BOAMP from a view: their copies are rebuilt from the stored ones", async () => {
    // The home page reads their page's copy, and builds it again, after the answer, with the page's own build.
    expect(HOME_TILES).toContain("web:emploi");
    expect(HOME_TILES).toContain("web:marches-publics");
    expect(DOMAINS["/emploi"].build).toBe(buildEmploi);
    expect(DOMAINS["/marches-publics"].build).toBe(buildMarches);
    // The copies the scheduled event keeps in KV, and any request leaving the Worker counted.
    const fetch = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    const read = { emploi: 0, boamp: 0, cpf: 0 };
    emploiSource.configure(async () => (read.emploi++, { lu: "2026-11-06T16:25:00Z", offres: [] }));
    boamp.configure(async () => (read.boamp++, { lu: "2026-11-06T15:35:00Z", avis: [], ecartes: [] }));
    cpf.configure(async () => (read.cpf++, { lu: "2026-11-06T02:00:00Z", formations: [] }));
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    await buildEmploi(cache, NOW);
    await buildMarches(cache, NOW);
    expect(fetch).not.toHaveBeenCalled();
    expect(read.emploi).toBeGreaterThan(0);
    expect(read.boamp).toBe(1);
  });
});
