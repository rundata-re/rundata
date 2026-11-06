import { describe, expect, it } from "vitest";
import { islandMap, project, W, type Marker } from "../src/web/map.js";

// /mer's map at 1280 px cut « L'Ermitage-les-Bains », « Boucan-Canot », « Anse des Cascades » at its sides and
// « Grande Anse » at its bottom: a marker's name stays inside the frame.
describe("a marker's name stays inside the map's frame", () => {
  const beach = (name: string, lon: number, lat: number): Marker => ({ lon, lat, label: "26°", name, round: true, href: `#${name.length}` });
  const html = islandMap({
    label: "Carte",
    markers: [beach("L'Ermitage-les-Bains", 55.22, -21.08), beach("Anse des Cascades", 55.83, -21.18), beach("Grande Anse", 55.55, -21.37), beach("Salazie", 55.54, -21.03)],
  });
  const names = new Map([...html.matchAll(/<text ([^>]*) class="mn">([^<]*)<\/text>/g)].map((t) => [t[2].replaceAll("&#39;", "'"), t[1]]));
  const name = (n: string) => {
    const a = names.get(n);
    expect(a, n).toBeDefined();
    return { x: +a!.match(/x="([^"]+)"/)![1], y: +a!.match(/y="([^"]+)"/)![1], anchor: a!.match(/text-anchor:(\w+)/)?.[1] ?? "middle" };
  };

  it("is written from the side inwards near the west and east coasts", () => {
    expect(name("L'Ermitage-les-Bains")).toMatchObject({ x: 16, anchor: "start" });
    expect(name("Anse des Cascades")).toMatchObject({ x: W - 16, anchor: "end" });
  });

  it("is written beside its marker near the bottom, not under it", () => {
    const [x, y] = project(55.55, -21.37);
    expect(name("Grande Anse")).toEqual({ x: x + 42, y: y + 8, anchor: "start" });
  });

  it("is written beside its marker when under it, it would cover another marker", () => {
    const close = islandMap({ label: "Carte", markers: [beach("Boucan-Canot", 55.225, -21.03), beach("L'Ermitage-les-Bains", 55.22, -21.08)] });
    const [x, y] = project(55.225, -21.03);
    expect(close).toContain(`<text x="${x + 42}" y="${y + 8}" style="text-anchor:start" class="mn">Boucan-Canot</text>`);
  });

  it("stays centred under a marker far from the frame", () => {
    const [x, y] = project(55.54, -21.03);
    expect(name("Salazie")).toEqual({ x, y: y + 66, anchor: "middle" });
  });
});
