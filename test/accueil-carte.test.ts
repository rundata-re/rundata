import { describe, expect, it, vi } from "vitest";
import { accueilCarte, IDS, problemes, sujets, type HomeLive } from "../src/web/accueil-carte.js";
import { CSS } from "../src/web/pages.js";

// 10:30 in La Réunion.
const NOW = new Date("2026-11-10T06:30:00Z");
const cached = <T>(value: T) => ({ value, fetchedAt: new Date("2026-11-10T06:00:00Z"), stale: false }) as never;
const station = (id: string, nom: string, temperature: number, lon: number, lat: number) => ({
  id, nom, source: "meteofrance", lon, lat, altitude_m: 10, time: "2026-11-10T06:00:00Z", stale: false, temperature,
});
const stations = [
  station("97418110", "Saint-Denis Gillot (aéroport)", 24.4, 55.5281, -20.8919),
  station("97424410", "Cilaos", 15.1, 55.4719, -21.1336),
  station("97422440", "Plaine des Cafres", 10.2, 55.5719, -21.2061),
];
const live: HomeLive = {
  meteo: cached({
    stations, toutes: stations, sources: [], indisponibles: [],
    mer: [{ nom: "Plage de Boucan-Canot", valeur: 26.2, jour: "2026-11-09" }, { nom: "Plage de l'Hermitage", valeur: 26.4, jour: "2026-11-09" }],
  }),
  volcan: cached({ etat: { niveau_orsec: "Vigilance", eruption_en_cours: false }, seismes: { sous_le_volcan: { "7_jours": 1 } } }),
  air: cached({
    communes: [{ commune: "Saint-Denis", niveau: 2, polluants: ["ozone"] }, { commune: "Le Port", niveau: 2, polluants: ["ozone", "particules PM10"] }],
    diffusion: "Prévision diffusée par Atmo Réunion la veille, le 09/11 à 11:24.",
  }),
  velos: cached({
    communes: [{ commune: "Saint-Pierre", velos_disponibles: 12 }],
    stations: [{ commune: "Saint-Pierre", lon: 55.478, lat: -21.341 }, { commune: "Saint-Pierre", lon: 55.472, lat: -21.334 }],
  }),
  sentiers: cached({
    suivis: 300,
    points: [
      { nom: "Sentier de Bélouve", lon: 55.533, lat: -21.06 },
      { nom: "Sentier du Piton d'Enchaing", lon: 55.51, lat: -21.05 },
    ],
    fermes_par_commune: [{ commune: "Salazie", sentiers_fermes: [{ sentier: "Sentier de Bélouve" }, { sentier: "Sentier du Piton d'Enchaing" }] }],
    // RF17 is closed, but the ONF's map does not place it: no track may lead to it.
    routes_forestieres_fermees: [{ route: "Route forestière de la Scierie (RF58)" }, { route: "Route forestière du Volcan (RF17)" }],
    routes_points: [{ nom: "Route Forestière de la Scierie (RF58)", lon: 55.4206, lat: -21.0306 }],
  }),
  agenda: cached({
    // Read the evening before.
    lus_le: "2026-11-09T19:45:00Z",
    evenements: [
      { titre: "Concert au kiosque du front de mer", date: "2026-11-10T19:00", commune: "Saint-Paul" },
      { titre: "Lecture publique", date: "2026-11-10T19:30", commune: "Le Port", source: "site de la commune du Port (© www.ville-port.re), lu le mardi 10/11 à 00:00" },
      { titre: "Fête annulée", date: "2026-11-10T11:00", commune: "Le Port", statut: "annulé" },
    ],
  }),
};

/** One layout's drawing: its <svg> element, from its class to its end. */
const layout = (html: string, name: string) => {
  const at = html.indexOf(`<svg class="map relief hm hm-${name}"`);
  return html.slice(at, html.indexOf("</svg>", at) + 6);
};
const attrs = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);

describe("the home page's island", () => {
  const html = accueilCarte(live, NOW)!;

  it("says each of the eight subjects, from the copies the page reads already, with no track that crosses another or a label", () => {
    expect(sujets(live, NOW).map((s) => s.id).sort()).toEqual([...IDS].sort());
    expect(problemes(live, NOW)).toEqual([]);
    // The outing still to come, never the cancelled one; « Ce soir » only after 17 h.
    expect(html).toContain("Concert au kiosque…");
    expect(html).not.toContain("Fête annulée");
    // Its hour on line 1, on a phone as on a wide screen.
    for (const name of ["tel", "large"]) expect(layout(html, name)).toContain(">AUJOURD&#39;HUI · 19:00<");
    // The caption says the day of a read that is not today's.
    expect(html).toMatch(/Lu entre le 09\/11 à[\u00a0 ]23:45 et le 10\/11 à[\u00a0 ]10:00\u00a0· /);
    // A read of today says its hour alone.
    expect(html).toContain("selon l&#39;ONF, carte lue à\u00a010:00");
  });

  it("says in each label's bubble what the label has not, from the same copies", () => {
    const tip = (k: string) => {
      const m = new RegExp(`data-k="${k}"[^>]* data-tp="([^"]*)" data-tv="([^"]*)" data-td="([^"]*)"`).exec(layout(html, "tel"))!;
      return [m[1], m[2], m[3]];
    };
    expect(tip("meteo")).toEqual(["Gillot 24\u202f°C · Cilaos 15\u202f°C · Plaine des Cafres 10\u202f°C", "", "mesurées à\u00a010:00 par Météo-France"]);
    expect(tip("volcan")).toEqual(["Niveau ORSEC\u00a0: vigilance (préfecture) · 1 séisme sous le volcan en 7 jours (OVPF)", "", "selon l&#39;OVPF et la préfecture, textes lus à\u00a010:00"]);
    expect(tip("air")).toEqual(["À cause de l&#39;ozone (2 communes) et des particules (1 commune)", "", "indice ATMO prévu par Atmo Réunion, diffusé le 09/11 à\u00a011:24"]);
    expect(tip("routes")).toEqual(["RF58 Scierie · RF17 Volcan", "", "selon l&#39;ONF, carte lue à\u00a010:00"]);
    expect(tip("velos")).toEqual(["Saint-Pierre 12, dans 2 stations", "", "d&#39;après Altervélo, lu à\u00a010:00"]);
    expect(tip("sortie")).toEqual(["Concert au kiosque du front de mer", "", "Saint-Paul, à\u00a019:00, d&#39;après son agenda en ligne"]);
    // The agenda named when the copy gives its source.
    const port = sujets({ agenda: cached({ evenements: [(live.agenda as unknown as { value: { evenements: unknown[] } }).value.evenements[1]] }) }, NOW)[0];
    expect(port.tip.detail).toBe("Le Port, à\u00a019:30, d'après l'agenda de la commune du Port");
  });

  it("opens each label's bubble away from the island: above the top band, below the bottom one, beside the flanks on a wide screen", () => {
    const side = (name: string) => Object.fromEntries([...layout(html, name).matchAll(/data-k="([a-z]+)" data-h="[a-z]+" aria-label="[^"]*" data-cote="([tblr])"/g)].map((m) => [m[1], m[2]]));
    expect(side("tel")).toEqual({ sortie: "t", routes: "t", sentiers: "t", volcan: "b", mer: "b", velos: "b", meteo: "t", air: "b" });
    expect(side("large")).toEqual({ sortie: "l", routes: "t", sentiers: "r", volcan: "r", mer: "l", velos: "l", meteo: "t", air: "b" });
  });

  it("draws Air's track only to a commune where it is worse than elsewhere, and names it in the bubble when no track gets there", () => {
    expect(layout(html, "tel")).not.toContain('<g class="hub cx" data-k="air">');
    const worse = (commune: string) => ({ ...live, air: cached({ communes: [{ commune: "Saint-Denis", niveau: 2, polluants: ["ozone"] }, { commune, niveau: 3, polluants: ["ozone"] }] }) });
    const map = accueilCarte(worse("Le Tampon"), NOW)!;
    expect(map).toContain(">moyen à dégradé<");
    expect(map).toMatch(/data-k="air"[^>]* data-tp="Le Tampon\u00a0: dégradé \(ozone\) · ailleurs moyen"/);
    for (const name of ["tel", "large"]) expect(layout(map, name).match(/<g class="hub cx" data-k="air">/g)).toHaveLength(1);
    expect(problemes(worse("Le Tampon"), NOW)).toEqual([]);
    // Le Port, behind the other subjects' tracks: no track crosses another, the bubble says where.
    const port = layout(accueilCarte(worse("Le Port"), NOW)!, "tel");
    expect(port).not.toContain('<g class="hub cx" data-k="air">');
    expect(port).toMatch(/data-k="air"[^>]* data-tp="Le Port\u00a0: dégradé \(ozone\) · ailleurs moyen"/);
  });

  it("draws Air's track only from « dégradé » and for 3 communes at most, and counts the communes past 3 in its bubble", () => {
    const COMMUNES = ["Les Avirons", "Bras-Panon", "Entre-Deux", "L'Étang-Salé", "Petite-Île", "La Plaine-des-Palmistes", "Le Port", "La Possession",
      "Saint-André", "Saint-Benoît", "Saint-Denis", "Saint-Joseph", "Saint-Leu", "Saint-Louis", "Saint-Paul", "Saint-Pierre", "Saint-Philippe",
      "Sainte-Marie", "Sainte-Rose", "Sainte-Suzanne", "Salazie", "Le Tampon", "Les Trois-Bassins", "Cilaos"];
    // The first n communes of the list (Le Tampon first, the island's south) at `worst`, the others at `rest` in turn.
    const island = (n: number, worst: number, ...rest: number[]): HomeLive => {
      const order = ["Le Tampon", ...COMMUNES.filter((c) => c !== "Le Tampon")];
      return { ...live, air: cached({ communes: order.map((commune, i) => ({ commune, niveau: i < n ? worst : rest[i % rest.length], polluants: ["ozone"] })), diffusion: "Prévision diffusée par Atmo Réunion la veille, le 09/11 à 11:24." }) };
    };
    const air = (h: HomeLive) => {
      const tel = layout(accueilCarte(h, NOW)!, "tel");
      const a = /<a class="mk lb cx" href="\/air"[^>]* aria-label="([^"]*)"[^>]* data-tp="([^"]*)" data-tv="([^"]*)"[^>]*>.*?class="t2"[^>]*>([^<]*)</.exec(tel)!;
      return { aria: a[1], place: a[2], value: a[3], label: a[4], track: tel.includes('<g class="hub cx" data-k="air">') };
    };
    // « dégradé » in 1 commune, then in 3: named, with a track.
    expect(air(island(1, 3, 2))).toMatchObject({ label: "moyen à dégradé", place: "Le Tampon\u00a0: dégradé (ozone) · ailleurs moyen", value: "", track: true });
    expect(air(island(3, 3, 2))).toMatchObject({ place: "Le Tampon et 2 autres communes\u00a0: dégradé (ozone) · ailleurs moyen", track: true });
    // In 4 communes, and in 20: counted, with no track.
    expect(air(island(4, 3, 2))).toMatchObject({ place: "dégradé (ozone) dans 4\u00a0communes sur\u00a024 · ailleurs moyen", track: false });
    const today = air(island(20, 2, 1));
    expect(today).toMatchObject({ label: "bon à moyen", place: "moyen (ozone) dans 20\u00a0communes sur\u00a024 · ailleurs bon", value: "", track: false });
    expect(today.aria).toBe("Air · prévu (Atmo)\u00a0: bon à moyen. moyen (ozone) dans 20\u00a0communes sur\u00a024 · ailleurs bon, indice ATMO prévu par Atmo Réunion, diffusé le 09/11 à\u00a011:24, voir le détail");
    // « moyen » or « bon » the worst in 1 commune: named, with no track.
    expect(air(island(1, 2, 1))).toMatchObject({ place: "Le Tampon\u00a0: moyen (ozone) · ailleurs bon", track: false });
    // « Ailleurs » of several levels: from the best to the next worst, never the worst.
    expect(air(island(2, 4, 1, 2, 3))).toMatchObject({ label: "bon à mauvais", place: "Le Tampon et 1 autre commune\u00a0: mauvais (ozone) · ailleurs bon à dégradé" });
    expect(air(island(5, 3, 1, 2))).toMatchObject({ place: "dégradé (ozone) dans 5\u00a0communes sur\u00a024 · ailleurs bon à moyen", track: false });
    // The same level on the whole island: that level alone, no track.
    expect(air(island(24, 2))).toMatchObject({ label: "moyen", place: "moyen (ozone) sur toute l&#39;île", value: "", track: false });
  });

  it("keeps its drawing for copies that place the same things, and writes the page as a new drawing would", async () => {
    const at = (velos: number, mer: number): HomeLive => ({
      ...live,
      velos: cached({ communes: [{ commune: "Saint-Pierre", velos_disponibles: velos }], stations: [{ commune: "Saint-Pierre", lon: 55.478, lat: -21.341 }, { commune: "Saint-Pierre", lon: 55.472, lat: -21.334 }] }),
      meteo: cached({ stations, toutes: stations, sources: [], indisponibles: [], mer: [{ nom: "Plage de Boucan-Canot", valeur: 26.2, jour: "2026-11-09" }, { nom: "Plage de l'Hermitage", valeur: mer, jour: "2026-11-09" }] }),
    });
    // A module of its own: the other tests' drawings, up to the 8 kept, would hide a new one.
    vi.resetModules();
    const M = await import("../src/web/accueil-carte.js");
    M.accueilCarte(at(12, 26.4), NOW);
    expect(M.dessinsGardes()).toBe(2);
    // 13 bikes, the Hermitage's sea 25.6 °C (« eau 26 °C » still): the same widths, the same places; no new drawing, the page's own words.
    const again = M.accueilCarte(at(13, 25.6), NOW)!;
    expect(M.dessinsGardes()).toBe(2);
    expect(again).toContain(">13 disponibles<");
    expect(/data-k="mer"[^>]* data-tv="([^"]*)"/.exec(layout(again, "tel"))![1]).toBe("25,6\u202f°C");
    vi.resetModules();
    const fresh = await import("../src/web/accueil-carte.js");
    expect(fresh.dessinsGardes()).toBe(0);
    expect(fresh.accueilCarte(at(13, 25.6), NOW)).toBe(again);
    // 130 bikes: a wider label, a new drawing.
    M.accueilCarte(at(130, 26.4), NOW);
    expect(M.dessinsGardes()).toBe(4);
  });

  it("reads its drawings from KV where its isolate has none, and draws a page's map only once for every isolate", async () => {
    // KV as the Worker has it: text, written and read again.
    const texts = new Map<string, string>();
    const kv = { get: async (k: string) => (texts.has(k) ? JSON.parse(texts.get(k)!) : undefined), put: async (k: string, e: unknown) => void texts.set(k, JSON.stringify(e)) };
    const after: Promise<unknown>[] = [];
    const background = (p: Promise<unknown>) => void after.push(p);
    const isolate = async (version = "1.0.540") => {
      vi.resetModules();
      const { Cache, MemoryStore } = await import("../src/cache.js");
      return { cache: new Cache(new MemoryStore(), Date.now, true, kv, version), A: await import("../src/web/accueil-dessins.js"), M: await import("../src/web/accueil-carte.js") };
    };
    // The first visit: nothing in KV, it draws, and writes its drawings after its response.
    const one = await isolate();
    expect(await one.A.dessinsAccueil(one.cache, live, NOW, background)).toBe("dessines");
    await Promise.all(after.splice(0));
    expect(texts.size).toBe(1);
    const page = one.M.accueilCarte(live, NOW);
    expect(await one.A.dessinsAccueil(one.cache, live, NOW, background)).toBe("ici");
    // Another isolate reads them: no drawing, nothing written, the same page.
    const two = await isolate();
    expect(await two.A.dessinsAccueil(two.cache, live, NOW, background)).toBe("lus");
    expect(after).toHaveLength(0);
    expect(two.M.dessinsGardes()).toBe(2);
    expect(two.M.accueilCarte(live, NOW)).toBe(page);
    expect(two.M.dessinsGardes()).toBe(2);
    // A wider label (130 bikes): other drawings, drawn and written once.
    const wider: HomeLive = { ...live, velos: cached({ ...(live.velos!.value as object), communes: [{ commune: "Saint-Pierre", velos_disponibles: 130 }] }) };
    expect(await two.A.dessinsAccueil(two.cache, wider, NOW, background)).toBe("dessines");
    await Promise.all(after.splice(0));
    expect(texts.size).toBe(2);
    // Another version of the code reads none of the old ones.
    const next = await isolate("1.0.541");
    expect(await next.A.dessinsAccueil(next.cache, live, NOW, background)).toBe("dessines");
    // Drawings of another key, or not drawings, are never taken.
    const d = next.M.dessinsCarte(live, NOW)!;
    const fresh = await isolate();
    expect(fresh.M.reprendreCarte(d, fresh.M.cleCarte(wider, NOW)!.cle)).toBe(false);
    expect(fresh.M.reprendreCarte({ cle: d.cle, dessins: [] }, d.cle)).toBe(false);
    expect(fresh.M.reprendreCarte("<html>", d.cle)).toBe(false);
    expect(fresh.M.dessinsGardes()).toBe(0);
  });

  it("gives Vélos its track at 390 px when the sea's nearest beach, Saint-Pierre's, would bar its way: the sea takes its next", () => {
    // Altervélo's stations where they are (station_information.json, read 12/11), the sea of the home page's six beaches.
    const at: [string, ...[number, number][]][] = [
      ["Saint-Pierre", [55.523416, -21.359026], [55.476235, -21.3437], [55.463545, -21.336658], [55.493469, -21.327042], [55.475255, -21.327384], [55.496996, -21.305695], [55.454998, -21.299014], [55.492238, -21.344748], [55.470232, -21.285993], [55.486542, -21.32557], [55.476875, -21.314816], [55.525556, -21.330927], [55.478779, -21.329059], [55.477406, -21.331613], [55.471081, -21.334082], [55.457105, -21.332738], [55.473258, -21.340894], [55.51177, -21.350426], [55.516462, -21.339433], [55.481414, -21.342959], [55.490734, -21.341835], [55.4684, -21.342451], [55.425795, -21.305038]],
      ["L'Étang-Salé", [55.373082, -21.276815], [55.335112, -21.262771], [55.336383, -21.272303]],
      ["Saint-Louis", [55.437744, -21.264711], [55.401759, -21.293055], [55.415033, -21.276133], [55.432253, -21.281166], [55.406598, -21.289943], [55.4357, -21.27228], [55.417489, -21.285726], [55.398277, -21.283282], [55.448572, -21.269679]],
    ];
    const beaches = ["Plage de Boucan-Canot", "Plage de l'Ermitage-les-Bains", "Saint-Leu", "Plage de Saint-Pierre", "Saint-Denis", "Saint-Benoît"];
    const h: HomeLive = {
      ...live,
      meteo: cached({ stations, toutes: stations, sources: [], indisponibles: [], mer: beaches.map((nom) => ({ nom, valeur: 26, jour: "2026-11-12", distance_km: 1 })) }),
      velos: cached({
        communes: at.map(([commune]) => ({ commune, velos_disponibles: 15 })),
        stations: at.flatMap(([commune, ...l]) => l.map(([lon, lat]) => ({ commune, lon, lat }))),
      }),
    };
    expect(problemes(h, NOW)).toEqual([]);
    const tel = layout(accueilCarte(h, NOW)!, "tel");
    // Vélos' label has its port, where its track ends; the sea's track goes to Saint-Leu.
    const velos = tel.slice(tel.indexOf('<a class="mk lb cx" href="/velos"'));
    expect(velos.slice(0, velos.indexOf("</a>"))).toContain('class="po"');
    expect(tel).toMatch(/data-k="mer"[^>]* data-tp="Saint-Leu"/);
  });

  it("gives each layout one keyboard stop per label, in reading order, and leaves rings and tracks out of the links", () => {
    for (const name of ["tel", "large"]) {
      const svg = layout(html, name);
      expect(attrs(svg, /<a class="mk lb cx" href="[^"]*" data-k="([a-z]+)"/g)).toEqual(IDS);
      const from = svg.indexOf('<g class="circuit">');
      const circuit = svg.slice(from, svg.indexOf('<a class="mk lb', from));
      expect(circuit).toContain('class="hub cx"');
      expect(circuit).not.toContain("<a ");
    }
  });

  it("draws its tracks horizontal, vertical or at 45°, bends rounded", () => {
    for (const name of ["tel", "large"]) {
      for (const d of attrs(layout(html, name), /<path d="([^"]+)" class="(?:tr|gr)\b/g)) {
        // Each straight piece runs from where the last command ended.
        let at: number[] = [];
        for (const [, c, nums] of d.matchAll(/([MLQ])([-\d. ]+)/g)) {
          const n = nums.trim().split(" ").map(Number);
          const to = n.slice(-2);
          if (c === "L") {
            const [dx, dy] = [Math.abs(to[0] - at[0]), Math.abs(to[1] - at[1])];
            expect(dx < 0.6 || dy < 0.6 || Math.abs(dx - dy) < 0.6, `${name} ${d}`).toBe(true);
          }
          at = to;
        }
      }
    }
  });

  it("leads only to places the data locates: no track to a forest road the ONF's map does not place", () => {
    for (const name of ["tel", "large"]) {
      expect(layout(html, name).match(/<g class="hub cx" data-k="routes">/g)).toHaveLength(1);
    }
    expect(html).toContain(">2 fermées<");
  });

  it("makes Météo's routes grow to its three stations from the pulse, and draws them at once when motion is reduced", () => {
    for (const name of ["tel", "large"]) {
      const svg = layout(html, name);
      expect(svg.match(/<a class="mk" href="\/meteo#st-[a-z0-9-]+" aria-label="[^"]+" data-h="meteo"/g)).toHaveLength(3);
      expect(svg.match(/class="gr cx" data-k="meteo"/g)).toHaveLength(2);
      expect(svg).toMatch(/class="gr cx" data-k="meteo" style="[^"]*--l:\d+;--a:\d+/);
    }
    expect(CSS).toContain("@media (prefers-reduced-motion:reduce){.hm .pu,.hm .gp{display:none}.hm .gr{stroke-dashoffset:0;animation:none!important}");
  });

  it("makes the bikes', the trails' and the forest roads' tracks between their places grow the same way, none drawn at rest", () => {
    const many = {
      ...live,
      velos: cached({
        communes: [{ commune: "Saint-Pierre", velos_disponibles: 7 }, { commune: "Saint-Louis", velos_disponibles: 6 }],
        stations: [{ commune: "Saint-Pierre", lon: 55.478, lat: -21.341 }, { commune: "Saint-Louis", lon: 55.411, lat: -21.286 }],
      }),
    };
    const map = accueilCarte(many, NOW)!;
    expect(problemes(many, NOW)).toEqual([]);
    for (const name of ["tel", "large"]) {
      const svg = layout(map, name);
      for (const k of ["velos", "sentiers"]) {
        expect(svg, `${name} ${k}`).toMatch(new RegExp(`class="gr cx" data-k="${k}" style="[^"]*--l:\\d+;--a:\\d+`));
        expect(svg, `${name} ${k}`).toContain(`class="gp cx" data-k="${k}"`);
      }
      for (const k of ["velos", "sentiers", "routes"]) expect(svg).not.toContain(`class="tr nt cx" data-k="${k}"`);
    }
    // A label lit does not grow like the maps' markers: on the edge of the map, it would be cut.
    expect(CSS).toContain(".map.hm a.lb:hover,.map.hm a.lb.on{transform:none}");
  });

  it("never cuts the volcano's value: on one line where it fits, else on two, read as one text", () => {
    expect(layout(html, "tel")).toContain(">pas d&#39;éruption annoncée</text>");
    expect(layout(html, "large")).toMatch(/<tspan>pas d&#39;éruption <\/tspan><tspan x="[\d.]+" dy="\d+">annoncée<\/tspan><\/text>/);
    expect(html).not.toContain("éruption…");
  });

  it("reads an older copy of the trails, without the forest roads' places: Routes without a track, and no error", () => {
    const s = (live.sentiers as unknown as { value: Record<string, unknown> }).value;
    const old = { ...live, sentiers: cached({ ...s, routes_points: undefined }) };
    const map = accueilCarte(old, NOW)!;
    expect(map).toContain(">2 fermées<");
    for (const name of ["tel", "large"]) expect(layout(map, name)).not.toContain('<g class="hub cx" data-k="routes">');
    expect(problemes(old, NOW)).toEqual([]);
  });

  it("keeps a label lit at its size, unlike the maps' markers: on the edge of the map, it would be cut", () => {
    expect(CSS).toContain(".map.hm a.lb:hover,.map.hm a.lb.on{transform:none}");
  });

  it("leaves the old map in place when no subject has a value", () => {
    expect(accueilCarte({}, NOW)).toBeNull();
  });
});
