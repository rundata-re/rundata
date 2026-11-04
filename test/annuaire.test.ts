import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { justice, office, type JusticePlace } from "../src/providers/annuaire.js";
import { annuaireTool, COUVERT, hoursText, named, openNow } from "../src/tools/annuaire.js";
import { JUSTICE } from "../src/tools/justice.js";
import { withVide } from "../src/vide.js";

// A search for « mairie » in the 974 entries of service-public.fr's directory, 23/10/2026.
const offices = JSON.parse(readFileSync(new URL("./fixtures/annuaire_mairie.json", import.meta.url), "utf8")).results.map(office);
const saintPaul = offices.find((o: { nom: string }) => o.nom === "Mairie - Saint-Paul")!;
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("public services directory", () => {
  it("keeps names holding the words asked, not words inside other words", () => {
    const fake = (nom: string) => ({ ...saintPaul, nom });
    const list = [fake("Brigade de gendarmerie - La-Plaine-des-Cafres"), fake("Caisse d'allocations familiales (Caf) de La Réunion - accueil Sud")];
    expect(named(list, "CAF").map((o) => o.nom)).toEqual(["Caisse d'allocations familiales (Caf) de La Réunion - accueil Sud"]);
    expect(named([fake("Mairie - Saint-Paul")], "mairies")).toHaveLength(1);
  });

  it("reads address, position, hours and phone", () => {
    expect(saintPaul.adresse).toBe("Place du Général-de-Gaulle, 97460 Saint-Paul");
    expect(saintPaul.lat).toBeCloseTo(-21.014, 2);
    expect(hoursText(saintPaul)).toBe("lundi au jeudi 8\u00a0h–16\u00a0h\u00a0; vendredi 8\u00a0h–15\u00a0h");
    expect(saintPaul.telephone).toBe("02 62 45 43 45");
  });

  it("knows when it is open, in Réunion time", () => {
    expect(openNow(saintPaul, new Date("2026-10-22T06:00:00Z"))).toBe(true); // jeudi 10:00
    expect(openNow(saintPaul, new Date("2026-10-23T11:30:00Z"))).toBe(false); // vendredi 15:30
    expect(openNow(saintPaul, new Date("2026-10-24T06:00:00Z"))).toBe(false); // samedi
  });

  it("answers with the place's own town hall", async () => {
    const now = new Date("2026-10-22T06:00:00Z");
    const store = new MemoryStore();
    void store.put("annuaire:97415:mairie", { value: offices.filter((o: { insee: string }) => o.insee === "97415"), fetchedAt: now.getTime() });
    const r = body(await annuaireTool(new Cache(store, () => now.getTime()), "mairie", "Saint-Gilles-les-Bains", now));
    expect(r.resume).toMatch(/^Mairie - Saint-Paul, Place du Général-de-Gaulle, 97460 Saint-Paul \(à [\d,]+ km de Saint-Gilles/);
    expect(r.resume).toContain("Ouvert en ce moment");
    expect(r.page).toBe("https://rundata.re/communes/saint-paul");
  });

  it("gives no link to the site of Saint-Benoît's town hall, whose terms submit any link to its agreement", async () => {
    const now = new Date("2026-10-22T06:00:00Z");
    const store = new MemoryStore();
    void store.put("annuaire:97410:mairie", { value: offices.filter((o: { insee: string }) => o.insee === "97410"), fetchedAt: now.getTime() });
    const r = body(await annuaireTool(new Cache(store, () => now.getTime()), "mairie", "Saint-Benoît", now));
    // The directory gives it; the answer does not.
    expect(offices.find((o: { nom: string }) => o.nom === "Mairie - Saint-Benoît").site).toBe("https://www.saint-benoit.re/");
    expect(r.resultats[0]).toMatchObject({ nom: "Mairie - Saint-Benoît", telephone: expect.any(String) });
    expect(r.resultats[0].site).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("saint-benoit.re");
  });

  it("gives a defibrillator asked of it the page of the devices, and no page without a place", async () => {
    const now = new Date("2026-10-22T06:00:00Z");
    const store = new MemoryStore();
    void store.put("annuaire:974:défibrillateur", { value: [], fetchedAt: now.getTime() });
    void store.put("annuaire:974:mairie", { value: offices, fetchedAt: now.getTime() });
    const cache = new Cache(store, () => now.getTime());
    expect(body(await annuaireTool(cache, "défibrillateur", undefined, now)).page).toBe("https://rundata.re/defibrillateurs");
    expect(body(await annuaireTool(cache, "mairie", undefined, now)).page).toBeUndefined();
  });

  it("never gives another service for a word it does not know: « aucun service », what it covers, the hits apart", async () => {
    const now = new Date("2026-11-04T06:00:00Z");
    const store = new MemoryStore();
    const commissaires = { ...saintPaul, nom: "Chambre régionale des commissaires de justice de La Réunion", types: ["huissiers_justice"] };
    const cgss = { ...saintPaul, nom: "Caisse générale de sécurité sociale (CGSS) de La Réunion - accueil de Saint-Denis", types: ["cpam"] };
    void store.put("annuaire:974:élections", { value: [commissaires], fetchedAt: now.getTime() });
    void store.put("annuaire:974:cpam", { value: [cgss], fetchedAt: now.getTime() });
    void store.put("annuaire:974:caf", { value: [{ ...commissaires, types: undefined }], fetchedAt: now.getTime() });
    const cache = new Cache(store, () => now.getTime());
    const none = await withVide("annuaire_services_publics", () => annuaireTool(cache, "élections", undefined, now));
    const b = body(none.value);
    expect(b.resume).toBe("Aucun service public trouvé à La Réunion pour « élections ».");
    expect(b.resultats).toBeUndefined();
    expect(b.couvert).toBe(COUVERT);
    expect(b.couvert).not.toMatch(/médecin de garde/);
    expect(b.proches.noms).toEqual([commissaires.nom]);
    expect(none.vide).toBe(true);
    // Its kind says it: the CGSS's offices for « CPAM », whose names do not.
    expect(body(await annuaireTool(cache, "CPAM", undefined, now)).resultats[0].nom).toBe(cgss.nom);
    // A copy read before the kinds were kept: answered as before, until it is read again.
    expect(body(await annuaireTool(cache, "caf", undefined, now)).resultats[0].nom).toBe(commissaires.nom);
  });

  it("counts a word that finds no service as a question left without an answer, and only that", async () => {
    const now = new Date("2026-10-22T06:00:00Z");
    const store = new MemoryStore();
    void store.put("annuaire:974:observatoire", { value: [], fetchedAt: now.getTime() });
    void store.put("annuaire:974:mairie", { value: offices, fetchedAt: now.getTime() });
    const cache = new Cache(store, () => now.getTime());
    const none = await withVide("annuaire_services_publics", () => annuaireTool(cache, "observatoire", undefined, now));
    expect(body(none.value).resume).toBe("Aucun service public trouvé à La Réunion pour « observatoire ».");
    expect(none.vide).toBe(true);
    expect((await withVide("annuaire_services_publics", () => annuaireTool(cache, "mairie", undefined, now))).vide).toBe(false);
  });
});

// The places of justice in the 974 entries, as justice() asks for them, 03/11/2026: 48, of which 5 points-justice in a prison or at the EPSMR.
const justiceRows = JSON.parse(readFileSync(new URL("./fixtures/annuaire_justice.json", import.meta.url), "utf8")).results;

describe("places of justice", () => {
  afterEach(() => vi.unstubAllGlobals());

  const read = async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total_count: justiceRows.length, results: justiceRows }), { headers: { "content-type": "application/json" } })));
    const now = new Date("2026-11-03T06:00:00Z"); // mardi 10:00
    const cache = new Cache(new MemoryStore(), () => now.getTime());
    return { cache, now, places: (await justice(cache)).value };
  };

  it("asks for every kind of place in one request, and reads each one's kind", async () => {
    const { places } = await read();
    const url = decodeURIComponent(String(vi.mocked(fetch).mock.calls[0][0]));
    for (const t of ["point_justice", "cdad", "tgi", "ti", "te", "prudhommes", "cour_appel", "ta", "bav", "aav"]) expect(url).toContain(`pivot like "%\\"${t}\\"%"`);
    expect(url).toContain('startswith(code_insee_commune,"974")');
    expect(url).toContain("limit=100");
    expect(places).toHaveLength(48);
    expect(places.filter((o: JusticePlace) => o.type === "point_justice")).toHaveLength(32);
  });

  it("writes the courts' numbers as phones are written, and no hours where only a note is given", async () => {
    const { places, now } = await read();
    const at = (nom: string) => places.find((o: JusticePlace) => o.nom === nom)!;
    expect(at("Tribunal judiciaire de Saint-Pierre").telephone).toBe("02 62 96 10 00");
    const bav = at("Bureau d'aide aux victimes du tribunal judiciaire de St Denis");
    expect(hoursText(bav)).toBe("lundi au dimanche (Permanences lors des audiences de comparution immédiate)");
    expect(openNow(bav, now)).toBeNull();
    expect(openNow(at("Tribunal judiciaire de Saint-Denis"), now)).toBe(true);
  });

  it("gives the nearest point-justice, and says most publish no hours", async () => {
    const { cache, now } = await read();
    const r = body(await annuaireTool(cache, "point-justice", "Cilaos", now));
    expect(r.resume).toMatch(/^Point-justice le plus proche de Cilaos : Point-justice de Cilaos, 4 rue des Ecoles, 97413 CILAOS \(à [\d,]+ km\), horaires non publiés, tél\. 02 62 28 92 82\.$/);
    expect(r.points_justice).toHaveLength(3);
    expect(r.tribunaux).toBeUndefined();
    expect(r.avertissements[0]).toBe("26 des 27 points-justice ne publient pas leurs horaires sur service-public.fr : appeler avant d'y aller.");
    expect(r.page).toBe("https://rundata.re/communes/cilaos");
  });

  it("never gives the points-justice held in a prison or at the EPSMR", async () => {
    const { cache, now } = await read();
    const r = body(await annuaireTool(cache, "justice", undefined, now));
    expect(r.resume).toBe("À La Réunion, d'après l'annuaire de service-public.fr : 27 points-justice et le conseil départemental de l'accès au droit, 10 juridictions, 5 lieux d'aide aux victimes. Donner une commune pour les plus proches.");
    expect(JSON.stringify(r)).not.toMatch(/EPSMR de|détention|Pénitentiaire|Maison d'arrêt/);
  });

  it("gives only the court named, before the places for children", async () => {
    const { cache, now } = await read();
    const r = body(await annuaireTool(cache, "tribunal pour enfants", "Le Tampon", now));
    expect(r.tribunaux.map((o: { type: string }) => o.type)).toEqual(["tribunal pour enfants", "tribunal pour enfants"]);
    expect(r.tribunaux[0].nom).toBe("Tribunal pour enfants de Saint-Pierre");
    expect(r.avertissements).toContain("La juridiction compétente dépend de l'affaire et de l'adresse : la plus proche n'est pas forcément celle-là.");
    const v = body(await annuaireTool(cache, "aide aux victimes", "Saint-Benoît", now));
    expect(v.aide_aux_victimes).toHaveLength(3);
    expect(v.avertissements).toContain("En cas de danger immédiat : le 17.");
  });

  it("leaves the commissaires de justice and the victims of war to the directory's search", () => {
    expect(JUSTICE.test("commissaire de justice")).toBe(false);
    expect(JUSTICE.test("victimes de guerre")).toBe(false);
    expect(["point justice", "Point-justice", "tribunal", "prud'hommes", "aide aux victimes", "accès au droit"].every((q) => JUSTICE.test(q))).toBe(true);
  });
});
