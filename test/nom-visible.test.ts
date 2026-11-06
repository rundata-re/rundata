import { describe, expect, it } from "vitest";
import type { StationNow } from "../src/web/data.js";
import { islandMap, nameWithShown, type Marker } from "../src/web/map.js";
import { stationsMap } from "../src/web/meteo-carte.js";

// The words axe 4.14 compares (label-content-name-mismatch): no accent, case or sign, nothing in brackets.
const words = (s: string) => s.normalize("NFKD").toLowerCase().replace(/\([^()]*\)/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
const holds = (name: string, shown: string) => {
  const [n, s] = [words(name), words(shown)];
  return n.some((_, i) => s.every((w, j) => w === n[i + j]));
};
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("a map link's name holds what it shows (WCAG 2.5.3)", () => {
  it("starts with the figure as shown when the name says it otherwise", () => {
    expect(nameWithShown(["26°"], "Saint-Denis : 25,7 °C, voir le détail")).toBe("26°, Saint-Denis : 25,7 °C, voir le détail");
    expect(nameWithShown(["17"], "Boulevard Banks : 16,9 µg/m³, voir le détail")).toBe("17, Boulevard Banks : 16,9 µg/m³, voir le détail");
  });

  it("says the place under the figure once, when the name starts with it", () => {
    expect(nameWithShown(["24°", "Le Baril"], "Le Baril · 114 m : 23,6 °C, voir le détail")).toBe("24°, Le Baril · 114 m : 23,6 °C, voir le détail");
    expect(nameWithShown(["24°", "Saint-Benoît"], "Saint-Benoît · 43 m : 24 °C, voir le détail")).toBe("24°, Saint-Benoît · 43 m : 24 °C, voir le détail");
  });

  it("says the place shown too, when the name does not start with it", () => {
    expect(nameWithShown(["3", "Gare"], "Saint-Pierre : 3 vélos, voir le détail")).toBe("3, Gare, Saint-Pierre : 3 vélos, voir le détail");
  });

  it("changes nothing when the name holds it already, or nothing is shown but signs", () => {
    for (const [shown, said] of [
      [["45"], "Sainte-Marie : 45 points de charge libres sur 103, voir le détail"],
      [["24 °C"], "Saint-Denis : 24 °C, voir le détail"],
      [["↑"], "Cabris - RN3 · Saint-Pierre : 0,06 m, en hausse, voir le détail"],
      [[""], "Saint-Paul : sentier fermé, voir le détail"],
      [["24°", "Saint-Denis"], "24°, Saint-Denis : 24,2 °C, voir le détail"],
    ] as [string[], string][]) expect(nameWithShown(shown, said)).toBe(said);
  });

  it("gives every marker of a map a name that holds its figure, and its place when shown under it", () => {
    const markers: Marker[] = [
      { lon: 55.45, lat: -20.9, label: "26°", say: "26 °C", name: "Saint-Denis", round: true, href: "#a", tip: { place: "Saint-Denis · 25 m", value: "25,7 °C", detail: "mesurée le 06/11 à 17:06 par Météo-France" } },
      { lon: 55.5, lat: -21.3, label: "17", say: "16,9 µg/m³", place: "Boulevard Banks", name: "Boulevard Banks (Saint-Denis) : 16,9 µg/m³", quiet: true, href: "#b" },
      { lon: 55.7, lat: -21.0, label: "4", name: "Saint-Benoît", say: "4 bornes libres", href: "#c" },
    ];
    const html = islandMap({ markers, label: "Carte" });
    const links = [...html.matchAll(/<a class="mk" href="[^"]+" aria-label="([^"]+)"[^>]*>([^]*?)<\/a>/g)];
    expect(links).toHaveLength(3);
    for (const [, said, inner] of links) {
      const shown = [...inner.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((t) => unesc(t[1])).join(" ");
      expect(holds(unesc(said), shown), `${said} / ${shown}`).toBe(true);
    }
    expect(unesc(links[0][1])).toBe("26°, Saint-Denis · 25 m : 25,7 °C, mesurée le 06/11 à 17:06 par Météo-France, voir le détail");
    expect(unesc(links[1][1])).toBe("17, Boulevard Banks : 16,9 µg/m³, voir le détail");
    expect(unesc(links[2][1])).toBe("4, Saint-Benoît : 4 bornes libres, voir le détail");
  });

  it("names a station of /meteo's map by the figure of each layer it shows, the temperature's first", () => {
    const at = { source: "meteofrance", altitude_m: 9, time: "2026-11-06T13:00:00Z", stale: false };
    const list = [
      { ...at, nom: "Le Port", id: "97407520", lon: 55.29, lat: -20.94, temperature: 26.6, vent: 10, direction: 225 },
      { ...at, nom: "Le Tévelave", id: "97401520", lon: 55.37, lat: -21.2, temperature: 22.0 },
    ] as StationNow[];
    const html = stationsMap(list);
    const links = [...html.matchAll(/<a class="mk[^"]*" href="([^"]+)" aria-label="([^"]+)"[^>]*>([^]*?)<\/a>/g)];
    const port = links.find((l) => l[1] === "#st-le-port")!;
    expect(unesc(port[2])).toMatch(/^27°, Le Port · 9\u202fm : 26,6\u202f°C, vent [^,]+ 10\u202fkm\/h/);
    // Each layer's figure, shown alone when its layer is, is in the name.
    for (const [, , said, inner] of links)
      for (const [, t] of inner.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) expect(holds(unesc(said), unesc(t)), `${said} / ${t}`).toBe(true);
    // A station whose figure is not drawn (not on the tour): its name as before.
    expect(unesc(links.find((l) => l[1] === "#st-le-tevelave")![2])).toMatch(/^Le Tévelave · 9\u202fm : 22\u202f°C, mesures/);
  });
});
