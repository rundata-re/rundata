import { describe, expect, it } from "vitest";
import { antennas, COUVERTURE, couvertureMobile } from "../src/tools/terrain.js";
import { systemesDu } from "../src/vie/antennes-systemes.js";
import { couvertureAu, loinDuLittoral, sansCouverture } from "../src/vie/couverture.js";
import { terrainPage } from "../src/web/terrain.js";

const plain = (html: string) => html.replaceAll("&#39;", "'").replaceAll("&amp;", "&");
// Near the summit of the Piton des Neiges, where the four operators do not all declare the same.
const PITON = [55.4783, -21.0989] as const;
// The Barachois, Saint-Denis: 13 supports within 500 m.
const BARACHOIS = [55.4481, -20.8789] as const;

describe("fiche_terrain: the antennas as the sheet of /antennes", () => {
  it("gives each system its azimuths when an operator's systems do not share them, and says a missing day « non publiée »", () => {
    const s = systemesDu(47190).find((o) => o.operateur === "SFR Réunion")!;
    expect(s.azimuts).toBeUndefined();
    // In the sheet's order: by generation, then by band.
    expect(s.systemes.map((x) => x.systeme)).toEqual(["2G (GSM), bande des 900 MHz", "3G (UMTS), bande des 900 MHz", "3G (UMTS), bande des 2 100 MHz", "4G (LTE), bande des 800 MHz", "4G (LTE), bande des 1 800 MHz", "4G (LTE), bande des 2 600 MHz"]);
    expect(s.systemes[0]).toEqual({ systeme: "2G (GSM), bande des 900 MHz", etat: "en service", mise_en_service: "09/04/2018", azimuts: "240 °" });
    expect(s.systemes[4]).toEqual({ systeme: "4G (LTE), bande des 1 800 MHz", etat: "en service", mise_en_service: "09/10/2019", azimuts: "200 ° et 240 °" });
    const projet = systemesDu(52884).find((o) => o.operateur === "SFR Réunion")!.systemes.find((x) => x.etat === "projet approuvé")!;
    expect(projet.mise_en_service).toBe("non publiée");
    expect(systemesDu(-1)).toEqual([]);
  });
});

describe("fiche_terrain: the mobile coverage declared at the point (Arcep)", () => {
  it("reads each operator's layers at the point, for 4G internet and for calls", () => {
    expect(couvertureAu(...PITON)).toEqual([
      { operateur: "Orange", internet_4g: false, appels: false },
      { operateur: "SFR Réunion", internet_4g: true, appels: true },
      { operateur: "Free", internet_4g: false, appels: true },
      { operateur: "Zeop", internet_4g: true, appels: false },
    ]);
    const c = couvertureMobile(...PITON);
    expect(c.ligne).toBe("couverture mobile déclarée à l'Arcep : internet 4G par SFR Réunion et Zeop, appels par SFR Réunion et Free");
    expect(c.bloc.operateurs![0]).toEqual({ operateur: "Orange", internet_4g: "pas de couverture déclarée", appels: "pas de couverture déclarée" });
    expect(c.bloc.note).toBe(COUVERTURE.note);
    expect(c.bloc.note).not.toMatch(/mesurée/);
  });

  it("agrees with the layer « no operator » of /antennes almost everywhere inland (the simplification aside)", () => {
    let ok = 0, ko = 0;
    for (let lon = 55.23; lon < 55.83; lon += 0.01) {
      for (let lat = -21.38; lat < -20.88; lat += 0.01) {
        if (!loinDuLittoral(lon, lat)) continue;
        for (const t of ["4g", "voix"]) {
          const tous = ["OF", "SRR", "TELC", "ZEOP"].every((k) => sansCouverture(`${k}-${t}`, lon, lat));
          if (tous === sansCouverture(`aucun-${t}`, lon, lat)) ok++;
          else ko++;
        }
      }
    }
    expect(ok).toBeGreaterThan(2000);
    expect(ko / (ok + ko)).toBeLessThan(0.01);
  });

  it("says nothing of the coverage in the coastal strip the maps leave out, and points to the map", () => {
    // The seafront of Saint-Pierre, at the edge of the sea.
    expect(loinDuLittoral(55.4783, -21.3428)).toBe(false);
    const c = couvertureMobile(55.4783, -21.3428);
    expect(c.ligne).toBeUndefined();
    expect(c.bloc).toMatchObject({ non_calculee: COUVERTURE.cote, carte: "https://rundata.re/antennes#h-couv" });
    expect(c.bloc).not.toHaveProperty("operateurs");
    // At sea: neither.
    expect(couvertureAu(55.3, -20.9)).toBeNull();
  });
});

describe("/terrain shows the same", () => {
  const fiche = (lon: number, lat: number) => ({
    resume: "…",
    lieu: { label: "Un point", lon, lat, precision: "adresse exacte" },
    cadastre: "aucune parcelle à ce point (domaine public, route, ou point imprécis)",
    antennes_a_moins_de_500_m: antennas(lon, lat).bloc,
    couverture_mobile_declaree: couvertureMobile(lon, lat).bloc,
    sources: [],
  });

  it("lists the nearest supports with their systems, bands, days and azimuts, and the power not published", () => {
    const html = plain(terrainPage("https://rundata.re", "x", { fiche: fiche(...BARACHOIS) } as never));
    expect(html).toContain("<summary>à 170 m, support n° 53020 (bâtiment, 30 m) : SFR Réunion</summary>");
    expect(html).toContain("<li>4G (LTE), bande des 1 800 MHz : en service, mise en service le 09/10/2019</li>");
    expect(html).toContain("Azimuts des antennes : 90 °, 185 ° et 330 ° (0 ° = nord).");
    expect(html).toContain("Puissance d'émission : non publiée par l'ANFR.");
    expect((html.match(/<details>/g) ?? []).length).toBe(5);
  });

  it("shows the coverage declared at the point by operator, with the Arcep's words and the map", () => {
    const html = plain(terrainPage("https://rundata.re", "x", { fiche: fiche(...PITON) } as never));
    expect(html).toContain('<h2 id="h-couverture">Couverture mobile déclarée</h2>');
    expect(html).toContain("D'après les cartes de l'Arcep du 2e trimestre 2026 (situation au 30/06/2026).");
    expect(html).toContain('<tr><th scope="row">Free</th><td data-label="Internet 4G">pas de couverture déclarée</td><td data-label="Appels (2G, 3G)">déclarée</td></tr>');
    expect(html).toContain("vérifiée par sondage par l'Arcep");
    expect(html).toContain('<a href="/antennes#h-couv">Zones sans couverture déclarée</a>');
    const cote = plain(terrainPage("https://rundata.re", "x", { fiche: fiche(55.4783, -21.3428) } as never));
    expect(cote).toContain("la couverture n'est pas calculée à ce point par rundata.re.");
    expect(cote).not.toContain("<caption>Couverture mobile déclarée à ce point");
  });
});
