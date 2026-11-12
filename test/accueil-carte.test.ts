import { describe, expect, it } from "vitest";
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
