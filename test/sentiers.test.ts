import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import { motifs, nuance, parseRoads, parseTrails, raison } from "../src/providers/sentiers.js";
import { sentiersRandonnee, trailsNamed, warning } from "../src/tools/sentiers.js";
import { buildRandonnees, buildSentiers, type SentiersAnswer } from "../src/web/data.js";
import { communeHikes } from "../src/web/liens.js";
import { pageOf, slugify } from "../src/web/places.js";
import { communeAt } from "../src/places/resolve.js";
import { closedTrails, randonneesLive, randonneesPage, sentiersPage } from "../src/web/domains.js";

// The ONF's map of the trails on 24/10/2026, last edited on 20/10: 56 trails closed out of 351 (389 pieces).
const fixture = (f: string) => readFileSync(new URL(`./fixtures/onf/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-10-24T04:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const cache = () => new Cache(new MemoryStore(), () => NOW.getTime());

describe("sentiers de randonnée", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = url.includes("/5/query") ? "sentiers.json" : url.includes("/4/query") ? "routes.json" : "couche.json";
      return new Response(fixture(file), { headers: { "content-type": "application/json" } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says a trail of the commune closed in part, past its limit, closed and never open (Piste DFCI de la Glacière, 04/11/2026)", async () => {
    type F = { attributes: Record<string, unknown>; geometry?: { paths?: [number, number][][] } };
    const json = JSON.parse(fixture("sentiers.json")) as { features: F[] };
    const at = (f: F) => { const p = (f.geometry?.paths ?? []).flat(); return p.length ? communeAt(...p[Math.floor(p.length / 2)]) : undefined; };
    const open = json.features.find((f) => String(f.attributes.WS_Statut).includes("ouvert") && at(f) === "Les Trois-Bassins")!;
    const elsewhere = json.features.find((f) => at(f) === "Saint-Paul")!;
    const nom = String(open.attributes.WS_NomIti);
    // Only this trail named so, its open section in Les Trois-Bassins, a closed one in Saint-Paul.
    const features = [...json.features.filter((f) => f.attributes.WS_NomIti !== nom), open,
      { attributes: { ...open.attributes, WS_Statut: "Sentier fermé", WS_InfCaus: "Travaux", WS_LongM: 1800 }, geometry: elsewhere.geometry }];
    vi.stubGlobal("fetch", async (url: string) => new Response(url.includes("/5/query") ? JSON.stringify({ ...json, features }) : fixture(url.includes("/4/query") ? "routes.json" : "couche.json"), { headers: { "content-type": "application/json" } }));
    const b = body(await sentiersRandonnee(cache(), "Les Trois-Bassins", NOW));
    expect(b.autour.sentiers_ouverts.map((x: { sentier: string }) => x.sentier)).not.toContain(nom);
    expect(b.autour.sentiers_fermes.find((x: { sentier: string }) => x.sentier === nom)).toMatchObject({ etat: "fermé", ferme_en_partie: true, longueur_km: 1.8 });
    expect(b.resume).toMatch(/Dans Les Trois-Bassins|Aux Trois-Bassins/);
    expect(b.resume).toMatch(/\d+ sentiers? fermés? \(dont 1 en partie\)/);
  });

  it("counts as followed by the ONF only the trails it manages, and says the others have no state", async () => {
    const d = await buildSentiers(cache(), NOW);
    expect(d.suivis).toBe(324);
    expect(d.sans_etat).toBeGreaterThan(0);
    const page = sentiersPage("https://rundata.re", { value: d, fetchedAt: NOW, stale: false } as never, NOW);
    expect(page).toContain(`Les autres sentiers gérés par l'ONF sont ouverts sur sa carte\u00a0; les ${d.sans_etat} sentiers hors gestion ONF ou sans état n'ont pas d'état connu ici.`);
    expect(page).not.toContain("Les autres sentiers suivis par l'ONF sont ouverts");
  });

  it("reads each trail's state, cause and line", () => {
    const trails = parseTrails(JSON.parse(fixture("sentiers.json")).features);
    expect(trails).toHaveLength(389);
    expect(trails.filter((t) => t.statut === "fermé")).toHaveLength(56);
    expect(trails.find((t) => t.nom === "Sentier de la Roche Pendue")).toMatchObject({ statut: "fermé", cause: "Eboulements et arbres en travers", info: "Réouverture 2026" });
    expect(trails.every((t) => !t.nom.endsWith("(hors gestion ONF)"))).toBe(true);
    const roads = parseRoads(JSON.parse(fixture("routes.json")).features);
    expect(roads.filter((r) => r.circulation === "Circulation interdite")).toHaveLength(4);
    expect(roads.some((r) => r.circulation === "Circulation autorisé")).toBe(false);
  });

  it("lists the closed trails of the island by commune", async () => {
    const b = body(await sentiersRandonnee(cache(), undefined, NOW));
    expect(b.resume).toBe("56 sentiers fermés sur 324 suivis par l'ONF à La Réunion, et 4 routes forestières interdites à la circulation.");
    expect(b.carte_mise_a_jour).toBe("20/10/2026 (ONF)");
    expect(b.fermes_par_commune[0]).toMatchObject({ commune: "Sainte-Rose" });
    // 56 trails, two of them closed in each of their two communes (the Piste DFCI de la Glacière, the Point de vue sur
    // Grand Étang).
    const rows = b.fermes_par_commune.flatMap((c: { sentiers_fermes: { sentier: string }[] }) => c.sentiers_fermes.map((t) => t.sentier));
    expect(rows).toHaveLength(58);
    expect(new Set(rows).size).toBe(56);
  });

  it("keeps a trail closed on weekdays as the map classes it, its notice beside it, the same words on Sunday 23:59 and Monday 00:01", async () => {
    const said = (avis: string) => `Fermé sur la carte de l'ONF\u00a0; ouvert le samedi et le dimanche d'après l'avis de l'ONF\u00a0: « ${avis} »`;
    expect(nuance({ cause: "Fermé du lundi au vendredi, ouvert le week-end", info: "02/01/27" })).toBe(said("Fermé du lundi au vendredi, ouvert le week-end"));
    expect(motifs({ cause: "Fermé du lundi au vendredi, ouvert le week-end", info: "02/01/27" })).toEqual([said("Fermé du lundi au vendredi, ouvert le week-end"), "02/01/27"]);
    // A closure without such words, or only ended, is said as the map says it: nothing deduced.
    expect(nuance({ cause: "Travaux", info: "Fermé jusqu'au 30/10/26 inclus" })).toBeUndefined();
    expect(motifs({ cause: "Travaux", precision: "Réouverture 2026" })).toEqual(["Travaux", "Réouverture 2026"]);
    const montplaisir = said("Fermé jusqu'au 30/10/26 inclus - Sentier ouvert les samedis et dimanches durant cette période");
    const sunday = new Date("2026-11-01T19:59:00Z");
    const monday = new Date("2026-11-01T20:01:00Z");
    for (const at of [NOW, sunday, monday]) {
      const at_ = () => new Cache(new MemoryStore(), () => at.getTime());
      expect(body(await sentiersRandonnee(at_(), undefined, at)).resume).toMatch(/^56 sentiers fermés sur 324 /);
      expect(body(await sentiersRandonnee(at_(), "Sentier de Montplaisir est ouvert ?", at)).resume).toContain(`Sentier de Montplaisir : ${montplaisir} · Travaux d'exploitation forestière.`);
      const ici = body(await sentiersRandonnee(at_(), undefined, at)).fermes_par_commune.flatMap((c: { sentiers_fermes: { sentier: string }[] }) => c.sentiers_fermes);
      expect(ici.find((t: { sentier: string }) => t.sentier === "Sentier de la Onzième Ligne")).toMatchObject({ etat: "fermé", nuance: montplaisir });
    }
    // /sentiers drawn from a copy built on Sunday 23:59, shown on Monday 00:01: the same words, true both days.
    const copy = { value: await buildSentiers(new Cache(new MemoryStore(), () => sunday.getTime()), sunday), fetchedAt: sunday, stale: false };
    const html = sentiersPage("https://rundata.re", copy, monday);
    expect(html).toContain(`Sentier de Montplaisir</a><small>${montplaisir.replace(/'/g, "&#39;")} · Travaux d&#39;exploitation forestière</small>`);
    expect(html).not.toMatch(/ouvert aujourd/);
  });

  it("keeps the notice's date between brackets after a trail open on weekends, and the cause alone for the others", () => {
    const weekend = { cause: "Fermé du lundi au vendredi, ouvert le week-end", info: "02/01/27" };
    const said = `Fermé sur la carte de l'ONF ; ouvert le samedi et le dimanche d'après l'avis de l'ONF : « ${weekend.cause} » · 02/01/27`;
    expect(raison(weekend)).toBe(said);
    expect(raison({ cause: "Éboulement", info: "Réouverture 2026" })).toBe("Éboulement");
    // The summary's warning: a trail cut on a hike, and a closed trail asked alone.
    const rows = [{ randonnee: "PR1", troncons_onf: [{ sentier: "Sentier A", etat: "fermé", cause: weekend.cause, precision: weekend.info }] }];
    const trails = [{ nom: "Sentier B", statut: "fermé", ...weekend, longueur_km: 1, points: [] }];
    const m = warning(rows as never, trails as never)!.message;
    expect(m).toContain(`PR1 emprunte 1 sentier fermé : Sentier A (${said})`);
    expect(m).toContain(`Sentier B est fermé (${said})`);
    // The hikes cut on /randonnees.
    const hike = { k: "h1", nom: "PR1", slug: "pr1", km: 5, dplus: 300, dmoins: 300, boucle: true, secteur: "Mafate", inconnus: [], onf: 1, fermes: [{ sentier: "Sentier A", cause: weekend.cause, precision: weekend.info }] };
    expect(randonneesPage("https://rundata.re", { value: { randonnees: [hike], secteurs: [], lignes: [], fermes: 1, suivis: 1, sources: [], hauts: [] } as never, fetchedAt: NOW, stale: false }, NOW)).toContain(`Sentier A (${said.replace(/'/g, "&#39;")})`);
  });

  it("answers for a trail by its name", async () => {
    const b = body(await sentiersRandonnee(cache(), "le sentier de la Roche Pendue est ouvert ?", NOW));
    expect(b.resume).toMatch(/^Sentier de la Roche Pendue : FERMÉ \(Eboulements et arbres en travers\)\./);
    expect(b.avertissement.sentiers_fermes).toEqual([expect.objectContaining({ sentier: "Sentier de la Roche Pendue", reouverture: "Réouverture 2026", page: "https://rundata.re/sentiers/sentier-de-la-roche-pendue" })]);
    expect(trailsNamed(parseTrails(JSON.parse(fixture("sentiers.json")).features), "Roche Plate")).toHaveLength(6);
  });

  it("takes a cirque as a whole, not the places named after it", async () => {
    const b = body(await sentiersRandonnee(cache(), "sentiers fermés à Mafate", NOW));
    // A hike of the cirque crosses a closed trail: said first.
    expect(b.resume).toBe("ATTENTION : PR25 emprunte 1 sentier fermé : La Nouvelle - Maison Laclos par PR (Éboulement). Un sentier fermé est interdit : ne pas s'y engager, prendre une variante ouverte ou renoncer. " +
      "Dans le cirque de Mafate : 4 sentiers fermés, 58 ouverts, 2 hors gestion ONF (état non connu). 50 aires d'accueil de l'ONF dans le cirque de Mafate (voir aires_accueil). " +
      "58 sentiers ouverts dans le cirque de Mafate : 10 d'entre eux ici, par ordre alphabétique, avec tous les sentiers fermés. La liste complète : https://rundata.re/randonnees/mafate#h-sentiers");
    // 10 open trails out of 58, by name; every closed one stays (5/11/2026: the 58 were 11 KB of a 20 KB answer).
    const ouverts: string[] = b.autour.sentiers_ouverts.map((t: { sentier: string }) => t.sentier);
    expect(ouverts).toHaveLength(10);
    expect(ouverts).toEqual([...ouverts].sort((x, y) => x.localeCompare(y, "fr")));
    expect(b.autour.sentiers_ouverts_en_tout).toBe(58);
    expect(b.avertissement.sentiers_fermes).toEqual([expect.objectContaining({ sentier: "La Nouvelle - Maison Laclos par PR", cause: "Éboulement", randonnees: ["PR25"] })]);
    expect(b.sentiers_nommes).toBeUndefined();
    // The cirque's sector, as on its page (/randonnees/mafate): Cap Noir is in it, the Maïdo's rim is not.
    const fermes = b.autour.sentiers_fermes.map((t: { sentier: string }) => t.sentier);
    expect(fermes).toContain("Sentier de Cap Noir");
    expect(fermes).not.toContain("Piste DFCI de la Glacière");
    expect(fermes).toHaveLength(4);
  });

  it("around a precise place, gives the nearest open trails first, and says so", async () => {
    const b = body(await sentiersRandonnee(cache(), "Maïdo", NOW));
    expect(b.autour.sentiers_ouverts).toHaveLength(10);
    expect(b.autour.sentiers_ouverts_en_tout).toBe(42);
    expect(b.resume).toContain("42 sentiers ouverts à moins de 4 km de Maïdo : les 10 plus proches ici, avec tous les sentiers fermés. La liste complète : https://rundata.re/randonnees#h-secteurs");
  });

  it("answers for the forest roads of the island, or one by its code or its name, never a place not found", async () => {
    const shut = "Route Forestière de la Plaine d'Affouches (RF20), Route Forestière de la Scierie (RF58), Route Forestière de la Vallée Heureuse (RF37), Route Forestière du Vieux Port du Tremblet (RF17)";
    for (const lieu of ["route forestière", "routes forestières", "RF", "routes forestières fermées", "quelles routes forestières de l'ONF sont fermées ?"]) {
      const b = body(await sentiersRandonnee(cache(), lieu, NOW));
      expect(b.erreur, lieu).toBeUndefined();
      expect(b.resume, lieu).toBe(`Routes forestières sur la carte de l'ONF : 36, dont 4 en circulation interdite : ${shut}. L'état de chacune est dans routes_forestieres.`);
      expect(b.routes_forestieres_fermees.map((r: { route: string }) => r.route).join(", ")).toBe(shut);
      // The pieces in the same state are one row; a road in two states, two.
      expect(b.routes_forestieres).toHaveLength(38);
      expect(b.consulter).toBeDefined();
    }
    const affouches = body(await sentiersRandonnee(cache(), "la RF 20 est ouverte ?", NOW));
    expect(affouches.resume).toBe("Route Forestière de la Plaine d'Affouches (RF20) : Circulation interdite (Sécurité, décision n°18/2025).");
    expect(affouches.routes_forestieres).toEqual([expect.objectContaining({ route: "Route Forestière de la Plaine d'Affouches (RF20)", circulation: "Circulation interdite", longueur_km: expect.any(Number), commune: expect.any(String) })]);
    expect(affouches.routes_forestieres_fermees).toBeUndefined();
    expect(body(await sentiersRandonnee(cache(), "RF8", NOW)).resume).toBe("Route Forestière du Maïdo (RF08) : Circulation autorisée.");
    // A road in pieces of different states: each piece with its length, in the map's order.
    expect(body(await sentiersRandonnee(cache(), "route forestière du Tévelave", NOW)).resume)
      .toBe("Route Forestière du Tévelave (RF06), en 2 tronçons : Circulation autorisée sur 5,6 km\u00a0; Circulation autorisée de 5h à 22h sur 4,8 km.");
    // In pieces of the same state, one sentence a name.
    expect(body(await sentiersRandonnee(cache(), "RF05", NOW)).resume)
      .toBe("Route Forestière du Volcan (RF05) de Piton Sec au Pas des Sables : Circulation autorisée. Route Forestière du Volcan (RF05) du Pas des Sables au terminus : Circulation autorisée.");
    const none = body(await sentiersRandonnee(cache(), "RF99", NOW));
    expect(none.resume).toBe("Pas de route forestière « RF99 » sur la carte de l'ONF. L'état des 36 routes est dans routes_forestieres.");
    expect(none.routes_forestieres).toHaveLength(38);
    expect(body(await sentiersRandonnee(cache(), "route forestière de Zzyzx", NOW)).resume).toMatch(/^Pas de route forestière « Zzyzx » sur la carte/);
    // No road of that name, but a place: the place, as before.
    const cilaos = body(await sentiersRandonnee(cache(), "routes forestières à Cilaos", NOW));
    expect(cilaos.resume).toContain("Dans le cirque de Cilaos : ");
  });

  it("says a forest road closed on a piece only, and never « aucune » without the map's roads", async () => {
    const roads = JSON.parse(fixture("routes.json"));
    const piece = roads.features.find((f: { attributes: { WR_NomRF: string; WR_Circ: string } }) => f.attributes.WR_NomRF === "Route Forestière de Bébour Bélouve (RF02)" && f.attributes.WR_Circ === "Circulation autorisé");
    piece.attributes.WR_Circ = "Circulation interdite";
    const serve = (routes: unknown) => vi.stubGlobal("fetch", async (url: string) =>
      new Response(new URL(url).pathname.endsWith("/4/query") ? JSON.stringify(routes) : fixture(new URL(url).pathname.endsWith("/5/query") ? "sentiers.json" : "couche.json"), { headers: { "content-type": "application/json" } }));
    serve(roads);
    expect(body(await sentiersRandonnee(cache(), "route forestière", NOW)).resume).toMatch(/^Routes forestières sur la carte de l'ONF : 36, dont 5 en circulation interdite : Route Forestière de Bébour Bélouve \(RF02, sur une partie\), Route Forestière de la Plaine/);
    roads.features = roads.features.filter((f: { attributes: { WR_Circ: string } }) => f.attributes.WR_Circ !== "Circulation interdite");
    serve(roads);
    expect(body(await sentiersRandonnee(cache(), "route forestière", NOW)).resume).toBe("Routes forestières sur la carte de l'ONF : 32, aucune en circulation interdite. L'état de chacune est dans routes_forestieres.");
    serve({ features: [] });
    const empty = await sentiersRandonnee(cache(), "route forestière", NOW);
    expect(empty.isError).toBe(true);
    expect(body(empty).erreur).toBe("La carte des sentiers de l'ONF ne répond pas pour le moment.");
  });

  it("looks around a place, with the trails named after it", async () => {
    const b = body(await sentiersRandonnee(cache(), "Bélouve", NOW));
    expect(b.resume).toMatch(/^ATTENTION : Sentier de l'École normale emprunte 1 sentier fermé : Sentier de l'École Normale\u00a0; .+\. 4 sentiers portent ce nom : 1 fermé \(Sentier de la Tamarinaie de Bélouve\)\. À moins de 4 km de Bélouve : \d+ sentiers fermés/);
    // The closed trail asked by its name is in the warning too, with no hike.
    expect(b.avertissement.sentiers_fermes).toContainEqual(expect.objectContaining({ sentier: "Sentier de la Tamarinaie de Bélouve", randonnees: [] }));
    expect(b.autour.sentiers_fermes[0].distance_km).toBeTypeOf("number");
  });

  it("gives the ONF's reception areas of a zone, or along a trail asked by its name, under the ONF's names only", async () => {
    const b = body(await sentiersRandonnee(cache(), "Maïdo", NOW));
    expect(b.resume).toContain(" 48 aires d'accueil de l'ONF à moins de 4 km de Maïdo (voir aires_accueil).");
    expect(b.aires_accueil).toMatchObject({ ou: "à moins de 4 km de Maïdo", rayon_km: 4, nombre: 48 });
    expect(b.aires_accueil.aires).toHaveLength(10);
    expect(b.aires_accueil.aires[0]).toEqual({ nom: "Site du Maïdo", distance_km: 0.2, carte: expect.stringMatching(/^https:\/\/www\.openstreetmap\.org\/\?mlat=-21\.\d+&mlon=55\.\d+/) });
    expect(b.aires_accueil.a_savoir).toBe("Aires d'accueil de l'ONF, sous le nom que leur donne sa carte des sentiers (mise à jour le 20/05/2026), codes compris : « RF » désigne une route forestière, et « pk » le point kilométrique sur cette route. La carte ne dit pas ce qu'on trouve sur chaque aire, ni ce qu'on a le droit d'y faire (camper, faire du feu) : se renseigner auprès de l'ONF.");
    expect(b.sources.map((s: { source: string }) => s.source).join()).toContain("Aires d'accueil des forêts (ONF La Réunion)");
    // A commune: those of the commune (Cilaos, a cirque, takes the cirque's).
    const paul = body(await sentiersRandonnee(cache(), "Saint-Paul", NOW));
    expect(paul.aires_accueil).toMatchObject({ ou: "dans la commune de Saint-Paul", nombre: 52 });
    expect(paul.aires_accueil).not.toHaveProperty("rayon_km");
    expect(paul.resume).toContain(" 52 aires d'accueil de l'ONF dans la commune de Saint-Paul (voir aires_accueil).");
    const cilaos = body(await sentiersRandonnee(cache(), "Cilaos", NOW));
    expect(cilaos.aires_accueil).toMatchObject({ ou: "dans le cirque de Cilaos", rayon_km: 6, nombre: 29 });
    // A trail asked by its name, with no place: those within 300 m of it.
    const trail = body(await sentiersRandonnee(cache(), "le sentier de la Roche Pendue est ouvert ?", NOW));
    if (trail.aires_accueil) expect([trail.aires_accueil.ou, trail.aires_accueil.rayon_km]).toEqual(["à moins de 300 m du sentier", 0.3]);
    // The island: none, and never a word of what a place allows.
    const ile = body(await sentiersRandonnee(cache(), undefined, NOW));
    expect(ile.aires_accueil).toBeUndefined();
    // Camping is named only to say the map does not tell it (a forest road's « circulation autorisée » is not ours).
    for (const x of [b, cilaos, paul]) expect(JSON.stringify([x.aires_accueil, x.resume]).replace(x.aires_accueil.a_savoir, "")).not.toMatch(/bivouac|camping|camper|autoris/i);
  });

  it("ties a trail to its communes by one rule: the tool, the commune's tile and the closed trails by commune give the same numbers", async () => {
    const c = cache();
    const hikes = { value: await buildRandonnees(c, NOW), fetchedAt: NOW, stale: false };
    const island = body(await sentiersRandonnee(c, undefined, NOW));
    const trails = hikes.value.secteurs.flatMap((z) => z.sentiers);
    // Two communes each: open in Les Trois-Bassins, closed in Saint-Paul; hors gestion in Le Tampon, open in Entre-Deux.
    expect(trails.find((t) => t.nom === "Piste DFCI de la Glacière")?.communes).toEqual(["Les Trois-Bassins", "Saint-Paul"]);
    expect(trails.find((t) => t.nom === "Sentier du Voile de la Mariée de Grand Bassin")?.communes.sort()).toEqual(["Entre-Deux", "Le Tampon"]);
    for (const commune of ["Le Tampon", "Entre-Deux", "Saint-Paul", "Les Trois-Bassins", "Sainte-Suzanne"]) {
      const said = body(await sentiersRandonnee(c, commune, NOW)).resume as string;
      const [, shut, open] = said.match(/ : (\d+) sentiers? fermés?(?: \(dont \d+ en partie\))?, (\d+) ouverts?/)!.map(Number);
      const tile = communeHikes(pageOf(slugify(commune))!, hikes, NOW)!;
      expect(tile.live?.detail, commune).toContain(`sur ${shut + open} sentiers de l'ONF dans la commune`);
      expect(tile.live?.valeur, commune).toBe(shut ? `${shut} sentier${shut > 1 ? "s" : ""} fermé${shut > 1 ? "s" : ""}` : "Sentiers ouverts");
      const listed = island.fermes_par_commune.find((x: { commune: string }) => x.commune === commune)?.sentiers_fermes ?? [];
      expect(listed, commune).toHaveLength(shut);
    }
    // The Glacière closed in both its communes' lists, once in each.
    for (const commune of ["Saint-Paul", "Les Trois-Bassins"]) {
      const listed = island.fermes_par_commune.find((x: { commune: string }) => x.commune === commune).sentiers_fermes.map((t: { sentier: string }) => t.sentier);
      expect(listed.filter((n: string) => n === "Piste DFCI de la Glacière"), commune).toHaveLength(1);
    }
  });
});

describe("the count of closed trails on the pages", () => {
  // The ONF's map cuts some trails in several pieces, each a point on the map: counted by name, as the tool counts them
  // (26/10/2026: 62 points, 56 trails on /sentiers's description and the home page's tile, 56 in sentiers_randonnee).
  const answer = {
    resume: "", fermes_par_commune: [], routes_forestieres_fermees: [], a_savoir: [], sources: [], suivis: 351, randonnees: [],
    points: [{ nom: "Sentier A", lon: 55.5, lat: -21.1 }, { nom: "Sentier A", lon: 55.51, lat: -21.11 }, { nom: "Sentier B", lon: 55.6, lat: -21.2 }],
  } as unknown as SentiersAnswer;
  const copy = { value: answer, fetchedAt: NOW, stale: false };

  it("are the trails, not the pieces of the map, on /sentiers and the tiles", () => {
    const html = sentiersPage("https://rundata.re", copy, NOW);
    expect(html).toContain(`<span class="big">2</span><p>sentiers fermés sur <b>351</b>`);
    expect(html).not.toMatch(/\b3 sentiers fermés/);
    expect(randonneesLive(copy)?.valeur).toBe("2 sentiers fermés");
    expect(closedTrails(answer)).toBe(2);
  });
});
