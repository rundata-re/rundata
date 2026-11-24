import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { ECART_MAX_M, GEOCODAGE_CSV, justice, lignesCsv, type Office, OSM_MAIRIES, positionNote, positionSources, search, townHall } from "../src/providers/annuaire.js";
import { annuaireTool } from "../src/tools/annuaire.js";
import { justiceAnswer } from "../src/tools/justice.js";
import { resume } from "../src/tools/resume.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import { communePage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";
import { aller, notePosition } from "../src/web/aller.js";
import { esc } from "../src/web/map.js";
import hotels from "../src/places/mairies-osm.json" with { type: "json" };
import { RENDU_REVISION, sourceRevision } from "../src/web/revisions.js";

// The town hall of Les Trois-Bassins as the annuaire gives it on 24/11/2026: its address up in the town, its position
// 3.8 km away down by the sea. OSM has the town hall at its address, where the Base adresse nationale finds it too.
const row = (nom: string, insee: string, voie: string, cp: string, commune: string, lon: number, lat: number) => ({
  nom,
  code_insee_commune: insee,
  adresse: JSON.stringify([{ type_adresse: "Adresse", complement1: "", numero_voie: voie, code_postal: cp, nom_commune: commune, longitude: String(lon), latitude: String(lat) }]),
  plage_ouverture: "[]",
  telephone: "[]",
  site_internet: "[]",
  url_service_public: `https://lannuaire.service-public.fr/la-reunion/la-reunion/${insee}`,
  pivot: "[]",
});
const HALL = row("Mairie - Les Trois-Bassins", "97423", "2 rue du Général-de-Gaulle", "97426", "Les Trois-Bassins", 55.3309395, -21.1009479);
const OSM = hotels.mairies["Les Trois-Bassins"];
// An office that is no town hall, 4.2 km from its address (Info Jeunes in Le Port, 24/11/2026).
const OFFICE = row("Info Jeunes - Port", "97407", "99 avenue du 20-Décembre-1848", "97825", "Le Port", 55.30293, -20.9797);
const OFFICE_BAN = { lon: 55.29785, lat: -20.94233 };
// An office out at sea: the CGSS's in Saint-Paul, 110 km off on 24/11/2026.
const SEA = row("Caisse générale de sécurité sociale (CGSS) - accueil de Saint-Paul", "97415", "6 rue de la Buse", "97863", "Saint-Paul", 56.0675, -21.6609);
const SEA_BAN = { lon: 55.2747, lat: -21.007 };

// As the Géoplateforme's geocoding of a CSV answers, 24/11/2026: the columns asked after those sent, the first in capitals.
const csv = (lines: [string, number, { lon: number; lat: number }][]) =>
  new Response(`Q,citycode,result_type,result_score,longitude,latitude\n${lines.map(([t, s, p]) => `"x",974,${t},${s},${p.lon},${p.lat}`).join("\n")}\n`);

/** The annuaire answering `rows`, the geocoder of the Géoplateforme as `ban` says. */
function stub(rows: object[], ban: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("api-lannuaire")) return Response.json({ total_count: rows.length, results: rows });
      if (u === GEOCODAGE_CSV) return ban();
      throw new Error(`unexpected ${u}`);
    }),
  );
  return new Cache(new MemoryStore());
}

describe("an office of the annuaire placed at its address (items of 24/11)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives a town hall OSM's point past 300 m when the address base agrees, and says so as the tool does", async () => {
    const o = (await townHall(stub([HALL], () => csv([["housenumber", 0.97, { lon: 55.294927, lat: -21.105742 }]])), "97423"))!;
    expect(o).toMatchObject({ lon: OSM.lon, lat: OSM.lat, adresse: "2 rue du Général-de-Gaulle, 97426 Les Trois-Bassins" });
    expect(o.position_annuaire).toMatchObject({ lon: 55.3309395, lat: -21.1009479, source: "osm" });
    expect(ECART_MAX_M).toBe(300);
    const note = "Position d'après OpenStreetMap\u00a0: celle de l'annuaire est à 3,8 km de l'adresse.";
    expect(positionNote(o)).toBe(note);
    expect(positionSources([o])).toEqual([OSM_MAIRIES]);
    expect(OSM_MAIRIES.licence).toBe("ODbL 1.0");
    // The link « y aller » there, and the words beside it.
    const link = aller({ nom: o.nom, lon: o.lon!, lat: o.lat!, adresse: o.adresse }, false);
    expect(link).toContain(String(OSM.lat));
    expect(link).not.toContain("55.3309395");
    expect(notePosition(o)).toBe(` <span class="note">${esc(note)}</span>`);
    // One request for all the addresses of a search, each sent as number and street, postcode, commune.
    const posts = vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === GEOCODAGE_CSV);
    expect(posts).toHaveLength(1);
    const sent = await ((posts[0][1] as RequestInit).body as FormData).get("data") as Blob;
    expect(await sent.text()).toBe('q,citycode\n"2 rue du Général-de-Gaulle 97426 Les Trois-Bassins",97423');
  });

  it("gives a town hall OSM's point even with the street only found, where the address base lies within 100 m of it", async () => {
    const o = (await townHall(stub([HALL], () => csv([["street", 0.55, { lon: OSM.lon + 0.0005, lat: OSM.lat }]])), "97423"))!;
    expect(o.position_annuaire?.source).toBe("osm");
  });

  it("keeps a town hall's own point when OSM and the address base disagree (Saint-André, 24/11)", async () => {
    const o = (await townHall(stub([HALL], () => csv([["street", 0.59, { lon: 55.32, lat: -21.1 }]])), "97423"))!;
    expect(o).toMatchObject({ lon: 55.3309395, lat: -21.1009479 });
    expect(o.position_annuaire).toBeUndefined();
    expect(positionNote(o)).toBeUndefined();
    expect(notePosition(o)).toBe("");
  });

  it("gives another office the address base's point past 300 m, found to the house number and sure", async () => {
    const [o] = (await search(stub([OFFICE], () => csv([["housenumber", 0.84, OFFICE_BAN]])), "info jeunes", "97407")).value;
    expect(o).toMatchObject({ ...OFFICE_BAN, position_annuaire: { lon: 55.30293, lat: -20.9797, source: "ban" } });
    expect(positionNote(o)).toBe("Position d'après la Base adresse nationale\u00a0: celle de l'annuaire est à 4,2 km de l'adresse.");
  });

  it("keeps the annuaire's position when the geocoder finds only the street, is not sure, or fails", async () => {
    for (const ban of [() => csv([["street", 0.97, OFFICE_BAN]]), () => csv([["housenumber", 0.6, OFFICE_BAN]]), () => new Response("", { status: 503 })]) {
      const [o] = (await search(stub([OFFICE], ban), "info jeunes", "97407")).value;
      expect(o).toMatchObject({ lon: 55.30293, lat: -20.9797 });
      expect(o.position_annuaire).toBeUndefined();
      vi.unstubAllGlobals();
    }
  });

  it("never leaves a point at sea: the address base's whatever it matched, else none", async () => {
    const [o] = (await search(stub([SEA], () => csv([["street", 0.74, SEA_BAN]])), "cgss", "97415")).value;
    expect(o).toMatchObject({ ...SEA_BAN, position_annuaire: { source: "ban" } });
    vi.unstubAllGlobals();
    const [none] = (await search(stub([SEA], () => new Response("", { status: 503 })), "cgss", "97415")).value;
    expect(none).toMatchObject({ lon: null, lat: null, position_annuaire: { lon: 56.0675, lat: -21.6609, ecart_m: null } });
    expect(positionNote(none)).toBeUndefined();
  });

  it("says it in annuaire_services_publics too, with OpenStreetMap among the sources", async () => {
    stub([HALL], () => csv([["housenumber", 0.97, { lon: 55.294927, lat: -21.105742 }]]));
    const r = await annuaireTool(new Cache(new MemoryStore()), "mairie", "Trois-Bassins");
    const body = JSON.parse((r.content[0] as { text: string }).text) as { resultats: { position?: string }[]; sources: unknown };
    expect(body.resultats[0].position).toBe("Position d'après OpenStreetMap\u00a0: celle de l'annuaire est à 3,8 km de l'adresse.");
    expect(JSON.stringify(body.sources)).toContain("OpenStreetMap");
  });

  it("places the justice offices too, each keeping its own kind once the others are left out", async () => {
    // The annuaire's rows in its order: one of no justice kind (left out), a court where it says, a point-justice 4.2 km
    // from its address. The kind is the row's own, given back by its place in the list sent to the geocoder.
    const kind = (row: object, t: string) => ({ ...row, pivot: JSON.stringify([{ type_service_local: t }]) });
    const COURT = row("Tribunal judiciaire de Saint-Pierre", "97416", "1 rue de l'Exemple", "97410", "Saint-Pierre", 55.478, -21.339);
    const rows = [kind(HALL, "mairie"), kind(COURT, "tgi"), kind(OFFICE, "point_justice")];
    const cache = stub(rows, () => csv([["housenumber", 0.95, { lon: 55.478, lat: -21.339 }], ["housenumber", 0.84, OFFICE_BAN]]));
    const all = (await justice(cache)).value;
    expect(all.map((o) => [o.nom, o.type])).toEqual([["Tribunal judiciaire de Saint-Pierre", "tgi"], ["Info Jeunes - Port", "point_justice"]]);
    expect(all[0].position_annuaire).toBeUndefined();
    expect(all[1]).toMatchObject({ ...OFFICE_BAN, position_annuaire: { lon: 55.30293, lat: -20.9797, source: "ban" } });
    // One request for the two kept, none for the one left out.
    const posts = vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === GEOCODAGE_CSV);
    expect(posts).toHaveLength(1);
    const sent = await ((posts[0][1] as RequestInit).body as FormData).get("data") as Blob;
    expect((await sent.text()).split("\n")).toHaveLength(3);
  });

  it("says it in the justice tool, with the Base adresse nationale among the sources", async () => {
    const PJ = { ...OFFICE, nom: "Point-justice du Port", pivot: JSON.stringify([{ type_service_local: "point_justice" }]) };
    stub([PJ], () => csv([["housenumber", 0.84, OFFICE_BAN]]));
    const r = await justiceAnswer(new Cache(new MemoryStore()), "point justice", "Le Port");
    const body = JSON.parse((r.content[0] as { text: string }).text) as { points_justice: { nom: string; position?: string }[]; sources: unknown };
    expect(body.points_justice[0]).toMatchObject({ nom: "Point-justice du Port", position: "Position d'après la Base adresse nationale : celle de l'annuaire est à 4,2 km de l'adresse." });
    expect(JSON.stringify(body.sources)).toContain("Base adresse nationale");
  });

  it("says it beside « Y aller » on the commune's page, for its town hall and its point-justice, and on the day's page", () => {
    const NOW = new Date("2026-11-24T06:00:00Z");
    const cached = <T>(value: T) => ({ value, fetchedAt: NOW, stale: false });
    const hall: Office = { nom: "Mairie - Les Trois-Bassins", insee: "97423", adresse: "2 rue du Général-de-Gaulle, 97426 Les Trois-Bassins", lon: OSM.lon, lat: OSM.lat, horaires: [], fiche: "https://example.org", position_annuaire: { lon: 55.3309395, lat: -21.1009479, ecart_m: 3800, source: "osm" } } as unknown as Office;
    const pj: Office = { nom: "Point-justice des Trois-Bassins", insee: "97423", adresse: "1 rue de l'Exemple, 97426 Les Trois-Bassins", lon: 55.3, lat: -21.1, horaires: [], fiche: "", position_annuaire: { lon: 55.33, lat: -21.13, ecart_m: 4200, source: "ban" } } as unknown as Office;
    const osm = esc("Position d'après OpenStreetMap : celle de l'annuaire est à 3,8 km de l'adresse.");
    const ban = esc("Position d'après la Base adresse nationale : celle de l'annuaire est à 4,2 km de l'adresse.");
    const p = pageOf("les-trois-bassins")!;
    const page = communePage("https://rundata.re", p, { place: null, commune: cached({ mairie: hall, justice: { lieu: pj, dans_la_commune: 1 }, sources: [] }) } as never, NOW);
    expect(page).toContain(osm);
    expect(page).toContain(ban);
    // Without a position of its own, no words.
    const plain = communePage("https://rundata.re", p, { place: null, commune: cached({ mairie: { ...hall, position_annuaire: undefined }, justice: { lieu: { ...pj, position_annuaire: undefined }, dans_la_commune: 1 }, sources: [] }) } as never, NOW);
    expect(plain).not.toContain("Position d&#39;après");
    expect(plain).not.toContain("Position d'après");
    const today = resume(p, { commune: cached({ mairie: hall, sources: [] }) } as never, NOW);
    expect(aujourdhuiPage("https://rundata.re", p, today, null, undefined, hall)).toContain(osm);
    expect(aujourdhuiPage("https://rundata.re", p, today, null, undefined, { ...hall, position_annuaire: undefined })).not.toContain(osm);
  });

  it("reads a CSV's quoted fields, their commas and doubled quotes", () => {
    expect(lignesCsv('a,b\n"1, rue ""X""",2\r\n')).toEqual([["a", "b"], ['1, rue "X"', "2"]]);
  });

  it("reads the annuaire again at the deploy, and builds the commune's page again, both holding the points corrected", () => {
    // Without it, a copy kept from the old code gives the annuaire's point up to its next build (24/11/2026). The journée
    // of a commune (resume_du_jour, /aujourdhui) reads the commune's copy, web:commune.
    for (const k of ["annuaire:97423:mairie", "annuaire:974:info jeunes", "annuaire:justice"]) expect(sourceRevision(k), k).toBeGreaterThanOrEqual(1);
    expect(RENDU_REVISION.commune).toBeGreaterThanOrEqual(33);
  });

  it("has every commune's town hall in its dated OSM list", () => {
    expect(Object.keys(hotels.mairies)).toHaveLength(24);
    expect(hotels.construit).toMatch(/^\d{4}-\d\d-\d\d$/);
    for (const h of Object.values(hotels.mairies) as { lon: number; lat: number; osm: string }[]) expect(h.osm).toMatch(/^(node|way|relation)\/\d+$/);
  });
});
