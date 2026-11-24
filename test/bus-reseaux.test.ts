import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import type { BusData } from "../src/web/data.js";
import { busPage } from "../src/web/domains.js";

const NOW = new Date("2026-11-24T07:20:00+04:00");
const cached = <T>(value: T): Cached<T> => ({ value, fetchedAt: NOW, stale: false }) as Cached<T>;
// The networks /bus listed on 24/11/2026: six of buses and the cable car of Saint-Denis.
const reseaux = [
  ["Car Jaune", 16], ["Citalis", 71], ["Téléphérique Papang", 1], ["Kar'Ouest", 76], ["Alternéo", 68], ["CarSud", 43], ["Estival", 37],
].map(([nom, lignes]) => ({ nom: nom as string, lignes: lignes as number, exploitant: "x", valide_jusqu_au: null }));

describe("/bus counts its bus networks", () => {
  it("without the cable car it names after them, from the networks it lists (« 7 réseaux de bus et le téléphérique » before)", () => {
    const html = busPage("https://rundata.re", cached<BusData>({ gares: [], reseaux, sources: [] } as unknown as BusData), NOW);
    expect(html).toContain(`<span class="big">6</span><p>réseaux de bus et le téléphérique de Saint-Denis : <b>312 lignes</b>`);
    expect(html).toContain("La page réunit 6 réseaux de bus et le téléphérique Papang, soit 312 lignes.");
    expect(html).not.toMatch(/\b7 réseaux|big">7</);
    // One network less served: the number follows the list, it is not written in the code.
    const sans = busPage("https://rundata.re", cached<BusData>({ gares: [], reseaux: reseaux.filter((r) => r.nom !== "CarSud"), sources: [] } as unknown as BusData), NOW);
    expect(sans).toContain("La page réunit 5 réseaux de bus et le téléphérique Papang");
  });
});
