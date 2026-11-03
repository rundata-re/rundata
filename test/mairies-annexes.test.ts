import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { office } from "../src/providers/annuaire.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import * as annexes from "../src/vie/mairies-annexes.js";
import { communePage } from "../src/web/commune.js";
import { esc } from "../src/web/map.js";
import { pageOf } from "../src/web/places.js";

// A search for « mairie » in the 974 entries of service-public.fr's directory, 23/10/2026.
const offices = JSON.parse(readFileSync(new URL("./fixtures/annuaire_mairie.json", import.meta.url), "utf8")).results.map(office);
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// No-break spaces as ordinary ones: what is checked is the words.
const flat = (s: string) => s.replaceAll(" ", " ");
const LISTE = "Liste de la Ville de Saint-Denis (export du 16/07/2026), sans horaires ni téléphone : les demander à l'Hôtel de Ville.";

describe("the mairies annexes of Saint-Denis (vie/mairies-annexes.ts)", () => {
  it("are the Ville's mairies annexes and centres municipaux, of its export of 16/07/2026, without the Hôtel de Ville", () => {
    expect(annexes.LIEUX).toHaveLength(20);
    expect(annexes.LIEUX.filter((l) => l.nature === "Mairie annexe")).toHaveLength(13);
    expect(annexes.LIEUX.filter((l) => l.nature === "Centre municipal")).toHaveLength(7);
    expect(annexes.EXPORT_DU).toBe("2026-07-16");
    expect(flat(annexes.LISTE)).toBe(LISTE);
    expect(annexes.SOURCE.licence).toBe("Licence Ouverte (Etalab)");
  });

  it("hold only the fields taken: never a name of an elected person, under any name", () => {
    for (const l of annexes.LIEUX) expect(Object.keys(l).sort()).toEqual(["adresse", "lat", "lon", "nature", "nom", "quartier"]);
  });

  it("spell the commune after the postcode, never twice, and leave the streets as written", () => {
    for (const { adresse } of annexes.LIEUX) {
      for (const c of ["Saint-Denis", "Sainte-Clotilde", "La Montagne"]) expect(adresse.split(c).length, adresse).toBeLessThanOrEqual(2);
      expect(adresse, adresse).not.toMatch(/Coltilde|\bSte?\s+(?:Denis|Clotilde)\b|\d,\S/);
      if (/974\d\d/.test(adresse)) expect(adresse).toMatch(/, 974(?:00|90|17) (?:Saint-Denis|Sainte-Clotilde|La Montagne)$/);
    }
    // Which of the two is right is not guessed.
    expect(annexes.LIEUX.map((l) => l.adresse)).toContain("10, rue impasse Florville, 97490 Sainte-Clotilde");
    // A street's name keeps its « St ».
    expect(annexes.LIEUX.map((l) => l.adresse)).toContain("127, Route de St François, 97400 Saint-Denis");
  });
});

describe("annuaire_services_publics in Saint-Denis", () => {
  const now = new Date("2026-11-03T06:00:00Z");
  const cache = () => {
    const store = new MemoryStore();
    void store.put("annuaire:97411:mairie", { value: offices.filter((o: { insee: string }) => o.insee === "97411"), fetchedAt: now.getTime() });
    return new Cache(store, () => now.getTime());
  };

  it("gives the Hôtel de Ville first, then the nearest mairies annexes, said as the Ville's list, with the Hôtel de Ville's phone", async () => {
    const r = body(await annuaireTool(cache(), "mairie annexe", "Le Moufia", now));
    expect(r.resume).toMatch(/^Mairie - Saint-Denis-de-La-Réunion, /);
    expect(flat(r.resume)).toContain("La plus proche des mairies annexes et centres municipaux, d'après la liste de la Ville : Mairie annexe Moufia, 40, rue des Jacynthe, 97490 Sainte-Clotilde (à ");
    expect(flat(r.mairies_annexes.liste)).toBe(LISTE);
    expect(r.mairies_annexes.telephone_hotel_de_ville).toBe("02 62 40 04 04");
    expect(r.mairies_annexes.lieux).toHaveLength(3);
    expect(r.mairies_annexes.lieux[0]).toMatchObject({ nature: "Mairie annexe", nom: "Moufia", quartier: "MOUFIA" });
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(annexes.SOURCE.nom);
  });

  it("asked only « mairie », gives them too; elsewhere, never", async () => {
    expect(body(await annuaireTool(cache(), "mairie", "Saint-Denis", now)).mairies_annexes.lieux).toHaveLength(3);
    const store = new MemoryStore();
    void store.put("annuaire:97415:mairie", { value: offices.filter((o: { insee: string }) => o.insee === "97415"), fetchedAt: now.getTime() });
    expect(body(await annuaireTool(new Cache(store, () => now.getTime()), "mairie", "Saint-Paul", now)).mairies_annexes).toBeUndefined();
  });
});

describe("the page of Saint-Denis", () => {
  const data = { place: null, commune: null };

  it("folds the list under the town hall, with its date and the Ville as its source", () => {
    const html = flat(communePage("https://rundata.re", pageOf("saint-denis")!, data, new Date("2026-11-03T06:00:00Z")));
    const tile = html.slice(html.indexOf("<h3>Mairie</h3>"), html.indexOf("<h3>", html.indexOf("<h3>Mairie</h3>") + 1));
    expect(tile).toContain('<summary>Mairies annexes et centres municipaux <span class="note">20</span></summary>');
    expect(tile).toContain(esc(LISTE));
    expect(tile).toContain('<b>Bois de Nèfles</b> · mairie annexe<small>132, route des ananas, <span class="nw">97490 Sainte-Clotilde</span></small>');
    expect(html).toContain(`${annexes.SOURCE.nom} (${annexes.SOURCE.licence})`);
  });

  it("is the only one", () => {
    const html = communePage("https://rundata.re", pageOf("saint-paul")!, data, new Date("2026-11-03T06:00:00Z"));
    expect(html).not.toContain("Mairies annexes");
  });
});
