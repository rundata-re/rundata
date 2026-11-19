import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { enChargement, texteVisible } from "../src/robots.js";
import { communePage } from "../src/web/commune.js";
import type { BusData, CommuneData } from "../src/web/data.js";
import { ATTENTE, busPage } from "../src/web/domains.js";
import { pageOf } from "../src/web/places.js";
import { isReader } from "../src/web/site.js";
import { typo } from "../src/web/typo.js";

const ORIGIN = "https://rundata.re";
const at = (local: string) => new Date(`${local}+04:00`);
// A copy of /bus 70 minutes old, as Google's URL inspection got it on 19/11/2026 at 17:33: one station's list run out.
const READ = at("2026-11-19T16:23");
const NOW = at("2026-11-19T17:33");
const cached = <T>(value: T): Cached<T> => ({ value, fetchedAt: READ, stale: true }) as Cached<T>;
type Row = BusData["gares"][number]["departs"][number];
const row = (heure: string, dans_min: number, ligne: string): Row => ({ heure, dans_min, ligne, direction: "St-Denis", reseau: "Car Jaune", arret: "Gare" });
const bus = cached<BusData>({
  gares: [
    { commune: "Saint-Pierre", arrets: [], departs: [row("16:30", 7, "O2"), row("17:00", 37, "S1")], complet_min: 60 },
    { commune: "Le Tampon", arrets: [], departs: [row("18:05", 102, "S3")], complet_min: 1200 },
  ],
  reseaux: [{ nom: "Car Jaune", lignes: 40, exploitant: "Région Réunion" }],
  sources: [],
} as BusData);

describe("a page with its data, one block waiting for its refresh, handed to a robot", () => {
  it("is not « loading » for a station's departures past its copy, and is when the page has no data", () => {
    const page = typo(busPage(ORIGIN, bus, NOW));
    expect(page).toContain(ATTENTE);
    // Still said to the visitor, word for word.
    expect(texteVisible(page)).toContain("Les horaires se chargent");
    expect(enChargement(page)).toBe(false);
    expect(enChargement(typo(busPage(ORIGIN, null, NOW)))).toBe(true);
  });

  it("is not « loading » for a commune's bus tile past its copy, its other blocks still looked at", () => {
    const p = pageOf("saint-pierre")!;
    const commune = cached<CommuneData>({ bus: { gare: true, arrets: [], departs: bus.value.gares[0].departs, complet_min: 60 }, sources: [] } as CommuneData);
    const html = typo(communePage(ORIGIN, p, { place: null, commune }, NOW));
    const tile = html.match(/<h3>(?:<a href="[^"]+">)?Bus(?:<\/a>)?<\/h3>(.*?)(?=<h3>)/s)![1];
    expect(tile).toContain(ATTENTE);
    expect(enChargement(tile)).toBe(false);
    expect(enChargement(`${tile}<p>Les mesures se chargent : rechargez la page dans quelques secondes.</p>`)).toBe(true);
  });

  it("takes the Search Console's URL inspection for a reader, as Googlebot", () => {
    const ua = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.8103.78 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)";
    expect(isReader(new Request("https://rundata.re/bus", { headers: { "user-agent": ua } }))).toBe(true);
  });
});
