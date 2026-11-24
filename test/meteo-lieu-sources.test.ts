import { describe, expect, it } from "vitest";
import { CITATION } from "../src/maree/calcul.js";
import * as climat from "../src/providers/climat.js";
import * as onf from "../src/providers/sentiers.js";
import * as traces from "../src/providers/traces.js";
import { placePage } from "../src/web/pages.js";
import { pageOf } from "../src/web/places.js";

const O = "https://rundata.re";
const NOW = new Date("2026-10-24T05:42:00Z");
const LO = "Licence Ouverte Etalab 2.0";
const OM = "CC BY 4.0 (ECMWF et Open-Meteo) ; API Open-Meteo gratuite réservée aux usages non commerciaux";
const station = { station: "Le Port", source: "Météo-France", altitude_m: 9, distance_km: 6.1, heure_mesure: "24/10 09:36", age_min: 6, mesures: { temperature: "26,2 °C" }, avertissements: [] };
const value = {
  meteo: { resume: "", stations: [station], sources: [{ source: "Stations Météo-France (mesures toutes les 6 minutes)", licence: LO, attribution: "" }] },
  mer: {
    resume: "Eau de mer près de Saint-Paul : 26,7 °C.",
    sources: [
      { source: "Température de surface de la mer par satellite", licence: "Domaine public (NOAA)", attribution: "" },
      { source: "Prévision des vagues du modèle WAM du Centre européen (ECMWF), via Open-Meteo", licence: OM, attribution: "" },
    ],
  },
  prevision: {
    resume: "",
    jours: [{ jour: "samedi 24/10", temperature_min: "22 °C", temperature_max: "29 °C" }],
    avertissements: [],
    sources: [
      { source: "Prévisions du modèle AROME outre-mer (Météo-France)", licence: LO, attribution: "" },
      { source: "Prévisions du modèle IFS du Centre européen (ECMWF), via Open-Meteo", licence: OM, attribution: "" },
    ],
  },
  reperes: { poste: "97415590", station: "Le Port", distance_km: 6.1, mois: 9, periode: "1991-2020", normale: { tx: 29.1, tn: 21.4, rr: 22 }, chaleur: { valeur: 33.4, annee: 2019 }, pluie: { valeur: 120.4, annee: 1998 }, depuis: 1967 },
};
const page = (slug: string, v: object | null = value) => placePage(O, pageOf(slug)!, v && ({ value: v, fetchedAt: NOW, stale: false } as never), NOW);
const mainOf = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const said = (html: string) => html.split(/<[^>]*>/).join("").replaceAll("&#39;", "'");

describe("the sources of a place's weather page", () => {
  it("are said once, at the page's end, the sources of one licence together, and no longer three times in its text", () => {
    const html = page("saint-paul");
    const main = mainOf(html);
    expect(main).not.toContain("Sources :");
    // No licence left in the text: the one « Source : » is the link to the shark centre's zones, by the bathing rule.
    expect(main.match(/Source :/g)).toHaveLength(1);
    expect(main).toContain('<p class="note">Source : <a href="https://securite-requin.re/');
    expect(main).not.toMatch(/Licence Ouverte|Open-Meteo gratuite|Domaine public/);
    // What each note says of the data itself stays where it was.
    expect(main).toMatch(/<p class="note">Mis à jour le 24\/10 à 09:42 \([^)]*\)\.<\/p>/);
    expect(main).toContain("pas celle du lagon ni du bord.");
    expect(main).toContain(`seule compte la vigilance de <a href="https://meteofrance.re/">Météo-France La Réunion</a>.</p></section>`);
    const end = html.slice(html.indexOf('<div class="wrap fin-sources"'), html.indexOf("<footer"));
    expect(end.match(/<p class="sources">Sources : /g)).toHaveLength(1);
    const text = said(end);
    // Each licence written once, for the sources of the three blocks.
    expect(text).toContain(`Stations Météo-France (mesures toutes les 6 minutes), Prévisions du modèle AROME outre-mer (Météo-France), ${climat.SOURCE.nom}, ${traces.SOURCES.ign.nom} (${LO})`);
    expect(text).toContain(`Prévision des vagues du modèle WAM du Centre européen (ECMWF), via Open-Meteo, Prévisions du modèle IFS du Centre européen (ECMWF), via Open-Meteo (${OM})`);
    expect(text.split("API Open-Meteo gratuite")).toHaveLength(2);
    expect(text).toContain("Température de surface de la mer par satellite (Domaine public (NOAA))");
  });

  it("name what the page's other blocks show: the tide's citation, the hikes' traces and the ONF's states", () => {
    const text = said(page("saint-paul").replace(/<wbr>/g, ""));
    const end = text.slice(text.lastIndexOf("Sources : "));
    expect(end).toContain(CITATION);
    expect(end).toContain(`${traces.SOURCES.osm.nom} (${traces.SOURCES.osm.licence})`);
    // The state of each hike (« ouvert », « N tronçons fermés ») is the ONF's, shown only with the hikers' copy.
    expect(end).not.toContain(onf.SOURCE.nom);
    const hikes = { value: { randonnees: [], secteurs: [], lignes: [], fermes: 0, suivis: 0, sources: [] }, fetchedAt: NOW, stale: false };
    const withStates = said(placePage(O, pageOf("saint-paul")!, { value, fetchedAt: NOW, stale: false } as never, NOW, undefined, hikes));
    expect(withStates.slice(withStates.lastIndexOf("Sources : "))).toContain(onf.SOURCE.nom);
    // A place in the Hauts: no sea, no tide.
    const cilaos = said(page("cilaos", { meteo: value.meteo }));
    expect(cilaos.slice(cilaos.lastIndexOf("Sources : "))).not.toContain("REFMAR");
  });

  it("leave the footer with the link to all the sources, without the whole site's credits", () => {
    const html = page("saint-paul");
    const foot = html.slice(html.indexOf("<footer"));
    expect(foot).toContain('<a href="/chiffres">Toutes les sources →</a>');
    expect(foot).not.toContain("<h3>Sources</h3>");
    expect(foot).not.toContain("Vélos : Altervélo");
    // The warning of every page's footer stays.
    expect(foot).toContain("seules comptent la vigilance de");
  });

  it("keep the amateur station's credit by its measure, as the association asked", () => {
    const amateur = { ...station, station: "La Bretagne", source: "meteor_oi", amateur: true };
    const html = page("cilaos", { meteo: { resume: "", stations: [station, amateur], sources: value.meteo.sources } });
    expect(mainOf(html)).toContain("MétéoR-OI</a>, licence ");
  });
});
