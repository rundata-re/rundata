import { describe, expect, it } from "vitest";
import { lien } from "../src/tools/citer.js";
import { STATIONS_974 } from "../src/providers/meteofrance-stations.js";

const O = "https://rundata.re";

describe("the page each tool cites", () => {
  it("gives the offers' page for emploi, never the home page nor a commune's page without offers", () => {
    expect(lien("emploi", {})).toBe(`${O}/emploi?ref=mcp`);
    expect(lien("emploi", { lieu: { trouve: "Saint-Pierre", commune: "Saint-Pierre" } })).toBe(`${O}/emploi?ref=mcp`);
  });

  it("gives the fiche of the same address for fiche_terrain, else the form", () => {
    expect(lien("fiche_terrain", { page: `${O}/terrain?adresse=7%20rue%20de%20la%20Buse%2C%20Saint-Paul` })).toBe(`${O}/terrain?adresse=7%20rue%20de%20la%20Buse%2C%20Saint-Paul&ref=mcp`);
    expect(lien("fiche_terrain", {})).toBe(`${O}/terrain?ref=mcp`);
  });

  it("gives the station's page for the measures of a district or a point, which its commune's page may not show", () => {
    const station = (nom: string, source = "meteofrance") => ({ stations: [{ station: nom, source }] });
    expect(lien("meteo_actuelle", { lieu: { trouve: "La Montagne", commune: "Saint-Denis" }, ...station("Saint-François") })).toBe(`${O}/meteo/station/97411150?ref=mcp`);
    expect(lien("meteo_actuelle", { lieu: { trouve: "-21.0545, 55.2270", commune: "" }, ...station("Saint-François") })).toBe(`${O}/meteo/station/97411150?ref=mcp`);
    // A place with its own page keeps it: the page shows the same station.
    expect(lien("meteo_actuelle", { lieu: { trouve: "Saint-Denis", commune: "Saint-Denis" }, ...station("Chaudron") })).toBe(`${O}/meteo/saint-denis?ref=mcp`);
    // A first station without a page of its own (a beacon, an amateur's): the commune's page, as before.
    expect(lien("meteo_actuelle", { lieu: { trouve: "La Montagne", commune: "Saint-Denis" }, ...station("Balise du Colorado", "ffvl") })).toBe(`${O}/meteo/saint-denis?ref=mcp`);
    // A beacon first, the temperature and the rain from the Météo-France station after it: that station's page, where the
    // values are (24/11/2026: near Saint-Gilles, /meteo/saint-paul showed neither).
    const pointe = {
      lieu: { trouve: "-21.0545, 55.2270", commune: "Saint-Paul" },
      stations: [
        { station: "Balise du Trou d'Eau", source: "ffvl" },
        { station: "Pointe des Trois-Bassins", source: "meteofrance" },
        { station: "Le Port", source: "meteofrance" },
        { station: "Mont Roquefeuil", source: "meteor_oi" },
      ],
    };
    const id = (nom: string) => STATIONS_974.find(([, n]) => n === nom)![0];
    expect(lien("meteo_actuelle", { ...pointe, temperature_depuis_minuit: { station: "Pointe des Trois-Bassins" }, pluie_recente: { station: "Pointe des Trois-Bassins" } }))
      .toBe(`${O}/meteo/station/${id("Pointe des Trois-Bassins")}?ref=mcp`);
    // The values from another Météo-France station than the first of the list: the values' station.
    expect(lien("meteo_actuelle", { ...pointe, temperature_depuis_minuit: { station: "Le Port" } })).toBe(`${O}/meteo/station/${id("Le Port")}?ref=mcp`);
    // The forecast has no station: the commune's page, which names its commune.
    expect(lien("prevision_meteo", { lieu: { trouve: "La Montagne", commune: "Saint-Denis" } })).toBe(`${O}/meteo/saint-denis?ref=mcp`);
  });
});
