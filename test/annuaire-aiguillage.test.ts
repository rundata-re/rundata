import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { annuaireTool, branche } from "../src/tools/annuaire.js";
import { cite } from "../src/tools/citer.js";

// Which part of practical life annuaire_services_publics answers, word by word: everyday words that went to another
// subject, sure of itself (23/11/2026), and those that must stay where they were.
const TABLE: [string, ReturnType<typeof branche>][] = [
  // Sent elsewhere before.
  ["résultats du bac lycée", "ecoles"],
  ["lycée résultats au bac", "ecoles"],
  ["résultats du bac", "ecoles"],
  ["résultats au brevet", "ecoles"],
  ["ramassage scolaire", "annuaire"],
  ["centre de tri", "decheteries"],
  ["marche nordique", "annuaire"],
  ["club de marche", "annuaire"],
  ["halle des sports", "annuaire"],
  ["marché de Noël", "evenement"],
  ["marché nocturne", "evenement"],
  ["clinique vétérinaire", "annuaire"],
  ["urgence vétérinaire", "annuaire"],
  ["hébergement d'urgence", "annuaire"],
  ["assistante maternelle", "annuaire"],
  ["auto-école", "annuaire"],
  ["auto école", "annuaire"],
  ["pompes funèbres", "annuaire"],
  ["Super U", "annuaire"],
  ["gaz de ville", "annuaire"],
  // Kept.
  ["bac jaune", "collecte"],
  ["sortie des bacs", "collecte"],
  ["tri sélectif", "collecte"],
  ["ramassage des encombrants", "collecte"],
  ["déchèterie", "decheteries"],
  ["marché forain", "marches"],
  ["marche forain", "marches"],
  ["marché", "marches"],
  ["halle", "marches"],
  ["marchés publics", "marches_publics"],
  ["urgences", "urgences"],
  ["clinique", "urgences"],
  ["hôpital", "urgences"],
  ["pharmacie", "pharmacies"],
  ["école maternelle", "ecoles"],
  ["maternelle", "ecoles"],
  ["lycée", "ecoles"],
  ["collège", "ecoles"],
  ["école", "ecoles"],
  ["super", "carburants"],
  ["sans plomb", "carburants"],
  ["pompe à essence", "carburants"],
  ["bouteille de gaz", "carburants"],
  ["gaz", "carburants"],
  ["médecin", "medecins"],
  ["aire de jeux", "enfants"],
  ["mairie", "annuaire"],
];

describe("annuaire_services_publics: which answer for which words", () => {
  it.each(TABLE)("« %s » → %s", (quoi, attendu) => {
    expect(branche(quoi)).toBe(attendu);
  });

  it("gives the collège of an address's sector only for the schools, the exams too", () => {
    expect(branche("collège de secteur", "12 rue de Paris, Saint-Denis")).toBe("college_de_secteur");
    expect(branche("résultats au brevet", "12 rue de Paris, Saint-Denis")).toBe("college_de_secteur");
    expect(branche("bac jaune", "12 rue de Paris, Saint-Denis")).toBe("collecte");
  });

  it("answers « résultats du bac » with the lycées, and a Christmas market with the tool that has it", async () => {
    const bac = JSON.parse((await annuaireTool(undefined as never, "résultats du bac", "Saint-Pierre")).content[0]!.text);
    expect(JSON.stringify(bac)).toMatch(/lyc[ée]e/i);
    expect(JSON.stringify(bac)).not.toMatch(/collecte|poubelle/i);
    const noel = JSON.parse((await annuaireTool(undefined as never, "marché de Noël", "Saint-Pierre")).content[0]!.text);
    expect(noel.resume).toContain("evenements");
  });
});

describe("annuaire_services_publics: the date of a bundled list, never « à l'instant » (23/11/2026)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const NOW = new Date("2026-11-23T09:00:00Z");

  it.each([
    ["aire de jeux", "Saint-Pierre"],
    ["aire de jeux", undefined],
    ["marché", "Saint-Pierre"],
    ["marché", undefined],
    ["école", "Saint-Pierre"],
    ["collège", undefined],
    ["médecin", "Saint-Pierre"],
    ["déchèterie", "Saint-Pierre"],
    ["pharmacie", "Saint-Pierre"],
    ["urgences", "Saint-Pierre"],
    ["collecte", "Saint-Paul"],
  ])("« %s » (%s) gives its list's day as the data's", async (quoi, lieu) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponible", { status: 503 })));
    const cache = new Cache(new MemoryStore(), () => NOW.getTime());
    const r = JSON.parse(cite("annuaire_services_publics", await annuaireTool(cache, quoi, lieu, NOW), { now: NOW }).content[0]!.text);
    expect(r.mis_a_jour, JSON.stringify(r).slice(0, 300)).toMatch(/^\d\d\/\d\d\/20\d\d$/);
    expect(r.fraicheur.donnee_du).toBe(r.mis_a_jour);
    expect(r.fraicheur.age).not.toBe("à l'instant");
  });
});

