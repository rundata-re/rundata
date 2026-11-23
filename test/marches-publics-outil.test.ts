import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import type { Avis } from "../src/providers/marches-publics.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { PROCUREMENT } from "../src/tools/marches-publics.js";
import { MARKET } from "../src/tools/marches.js";
import { communePage } from "../src/web/commune.js";
import type { MarchesAnswer } from "../src/web/marches-publics.js";
import { pageOf } from "../src/web/places.js";

// annuaire_services_publics and the public procurement notices: a commune's count as its page's tile says it, and the
// link to the list on the commune; « marché » alone stays the markets (23/11/2026).
const NOW = new Date("2026-11-23T10:05:00Z");
const avis = (id: string, x: Partial<Avis>): Avis => ({ id, objet: `Objet ${id}`, acheteur: "CIVIS", types: ["travaux"], parution: "2026-11-20", limite: "2026-12-15", lien: `https://www.boamp.fr/pages/avis/?q=idweb:${id}`, ...x });
const LISTE = [avis("1", { commune: "Saint-Pierre" }), avis("2", { communeAcheteur: "Saint-Pierre", types: ["services", "fournitures"] }), avis("3", { commune: "Saint-Paul" }), avis("4", {})];
const COPIE: MarchesAnswer = { nombre: LISTE.length, avis: LISTE, sources: [], lu: NOW.toISOString() };

function withCopy(v: MarchesAnswer = COPIE) {
  const st = new MemoryStore();
  void st.put("web:marches-publics", { value: v, fetchedAt: NOW.getTime() });
  return new Cache(st, () => NOW.getTime());
}
const ask = async (quoi: string, lieu?: string, cache = withCopy()) => JSON.parse((await annuaireTool(cache, quoi, lieu, NOW)).content[0]!.text);

describe("annuaire_services_publics and the public procurement notices", () => {
  it("tells the notices from the markets", () => {
    for (const q of ["marchés publics", "marché public", "appels d'offres", "appel d’offre", "avis BOAMP", "avis de marché", "commande publique"]) expect(PROCUREMENT.test(q), q).toBe(true);
    for (const q of ["marché", "marché forain", "marchés", "supermarché", "halle"]) expect(PROCUREMENT.test(q), q).toBe(false);
    expect(MARKET.test("marché forain")).toBe(true);
  });

  it("gives a commune's count in its page's words, the same read, its notices and the link to the list on it", async () => {
    const r = await ask("marchés publics", "Saint-Pierre");
    expect(r.resume).toBe("2 avis ouverts aux réponses à Saint-Pierre, d'après le BOAMP lu le 23/11 à 14:05.");
    expect(r.lien).toBe("https://rundata.re/marches-publics?commune=saint-pierre");
    expect(r.avis.map((x: { objet: string }) => x.objet)).toEqual(["Objet 1", "Objet 2"]);
    expect(r.avis[1]).toMatchObject({ types: "services, fournitures", lieu: "commune de l'acheteur", jusqu_au: "15/12/2026" });
    // The tile of /communes/saint-pierre says the same.
    const page = communePage("https://rundata.re", pageOf("saint-pierre")!, { place: null, commune: null, marches: { value: COPIE, fetchedAt: NOW, stale: false } }, NOW);
    expect(page).toContain("ouverts aux réponses à Saint-Pierre, d'après le BOAMP lu le 23/11 à 14:05");
    expect(page).toContain("/marches-publics?commune=saint-pierre");
    // The same from « appels d'offres », and from a place of the commune.
    expect((await ask("appels d'offres", "Saint-Pierre")).resume).toBe(r.resume);
    expect((await ask("avis BOAMP", "Terre-Sainte")).lien).toBe(r.lien);
  });

  it("says a commune without a notice as the page does, and the island's by commune without a place", async () => {
    const r = await ask("marchés publics", "Cilaos");
    expect(r.resume).toBe("Aucun avis de marché ouvert pour Cilaos dans la dernière lecture du BOAMP, le 23/11 à 14:05. Les avis sont rangés selon le lieu des travaux, ou à défaut la commune de l'acheteur.");
    expect(r.avis).toBeUndefined();
    expect(r.lien).toBe("https://rundata.re/marches-publics?commune=cilaos");
    const i = await ask("marchés publics");
    expect(i.resume).toBe("4 avis de marché ouverts aux réponses à La Réunion, d'après le BOAMP lu le 23/11 à 14:05. Donner une commune pour les siens.");
    expect(i.par_commune).toEqual({ "Saint-Pierre": 2, "Saint-Paul": 1 });
    expect(i.lien).toBe("https://rundata.re/marches-publics");
  });

  it("never says « no notice » without a list read, and keeps « marché » for the markets", async () => {
    const r = await ask("marchés publics", "Saint-Pierre", withCopy({ nombre: 0, avis: [], sources: [], prochaine: NOW.toISOString() }));
    expect(r.resume).toContain("n'est pas lue pour l'instant");
    expect(r.lien).toBe("https://rundata.re/marches-publics?commune=saint-pierre");
    const m = await ask("marché", "Saint-Pierre");
    expect(m.marches).toBeDefined();
    expect(m.lien).toBeUndefined();
  });
});
