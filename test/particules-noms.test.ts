import { describe, expect, it } from "vitest";
import rawClubs from "../src/sport/clubs.json" with { type: "json" };
import rawDae from "../src/dae/dae.json" with { type: "json" };
import rawEcoles from "../src/vie/ecoles.json" with { type: "json" };
import rawEnfants from "../src/vie/enfants.json" with { type: "json" };
import rawVelo from "../src/vie/velo.json" with { type: "json" };
import rawGazetteer from "../src/places/gazetteer.json" with { type: "json" };
import { particules } from "../src/noms.js";
import gazetteer from "../src/places/gazetteer.js";
import { normalize, resolvePlace } from "../src/places/resolve.js";
import { DAES } from "../src/providers/dae.js";
import { clubOf } from "../src/sport/clubs.js";
import { defibrillateurs } from "../src/tools/dae.js";
import { LIST } from "../src/vie/ecoles.js";
import { LIEUX } from "../src/vie/enfants.js";
import { ACCROCHES, VOIES } from "../src/vie/velo.js";

// Every name the rule changes in the six lists, as its source writes it and as it is shown: the 67 little words
// (« De », « Du », « Des », « D' »), the 3 « Et » and « En », and the four common words' accents.
const CHANGED: Record<string, [string, string][]> = {
  ecoles: [
    ["École élémentaire publique Leconte De Lisle", "École élémentaire publique Leconte de Lisle"],
    ["École maternelle publique Ann Mary Gaudin De Lagrange", "École maternelle publique Ann Mary Gaudin de Lagrange"],
    ["École primaire privée L'Etoile", "École primaire privée L'Étoile"],
    ["École secondaire privée Collège L'Etoile", "École secondaire privée Collège L'Étoile"],
    ["École secondaire privée Lycée l'Etoile Ravine des cabris Saint Pierre", "École secondaire privée Lycée l'Étoile Ravine des cabris Saint Pierre"],
    ["Lycée polyvalent Paule Pignolet De Fresne Rivière", "Lycée polyvalent Paule Pignolet de Fresne Rivière"],
  ],
  enfants: [
    ["Annexe Des Makes", "Annexe des Makes"],
    ["Bibliothèque Annexe De Palmiste Rouge", "Bibliothèque Annexe de Palmiste Rouge"],
    ["Bibliothèque Annexe De Ravine Du Pont", "Bibliothèque Annexe de Ravine du Pont"],
    ["Bibliothèque Annexe De Sainte-Anne", "Bibliothèque Annexe de Sainte-Anne"],
    ["Bibliothèque Du Bois De Nèfles", "Bibliothèque du Bois de Nèfles"],
    ["Bibliothèque Leconte De Lisle", "Bibliothèque Leconte de Lisle"],
    ["Bibliothèque Relais De Jacques Payet", "Bibliothèque Relais de Jacques Payet"],
    ["Bibliothèque Relais de La Plaine Des Grègues", "Bibliothèque Relais de La Plaine des Grègues"],
    ["Bibliothèque Relais Des Lianes", "Bibliothèque Relais des Lianes"],
    ["Bois De Palmas", "Bois de Palmas"],
    ["Médiathèque Du Sud Sauvage", "Médiathèque du Sud Sauvage"],
    ["Parc Des Palmiers", "Parc des Palmiers"],
    ["Parc Vert - Clinique De Saint-Joseph", "Parc Vert - Clinique de Saint-Joseph"],
  ],
  dae: [
    ["Aksin - Association Khodja Shia Isnashri Du Nord", "Aksin - Association Khodja Shia Isnashri du Nord"],
    ["CA Plaine Des Cafres", "CA Plaine des Cafres"],
    ["CA Ravine Des Cabris", "CA Ravine des Cabris"],
    ["Casse De La Source", "Casse de La Source"],
    ["Centre De Tir Saint Leu", "Centre de Tir Saint Leu"],
    ["Cfa Territoire Et Metiers St André", "Cfa Territoire et Metiers St André"],
    ["Cfa Territoire Et Metiers St Pierre", "Cfa Territoire et Metiers St Pierre"],
    ["Chantier Ecole d’architecture-SPLAR", "Chantier École d’architecture-SPLAR"],
    ["College Bourbon", "Collège Bourbon"],
    ["College Des 2 Canons", "Collège des 2 Canons"],
    ["College Michel Debre", "Collège Michel Debre"],
    ["Ecole Notre Dame De La Salette", "École Notre Dame de La Salette"],
    ["Ecole notre dame des enfants OGEC", "École notre dame des enfants OGEC"],
    ["Ecole Notre Dame Des Graces", "École Notre Dame des Graces"],
    ["Ecole privée CITE du SAVOIR", "École privée CITE du SAVOIR"],
    ["Ecole Saint Gabriel La Montagne", "École Saint Gabriel La Montagne"],
    ["Ecole Sainte Vivienne OGEC", "École Sainte Vivienne OGEC"],
    ["Eglise BDN St PAUL", "Église BDN St PAUL"],
    ["Eglise de Bellemene", "Église de Bellemene"],
    ["Eglise la Plaine St PAUL", "Église la Plaine St PAUL"],
    ["Eglise La Voie du Salut", "Église La Voie du Salut"],
    ["Irsam Fao - Fam Les Pailles En Queue", "Irsam Fao - Fam Les Pailles en Queue"],
    ["L'Eden Du Randonneur", "L'Eden du Randonneur"],
    ["La Petite Ile Des Calinous", "La Petite Ile des Calinous"],
    ["Le Domaine Du Grand Etang", "Le Domaine du Grand Etang"],
    ["Maison d'Arrêt De St Pierre", "Maison d'Arrêt de St Pierre"],
    ["Office De L'Eau De La Reunion", "Office de L'Eau de La Reunion"],
    ["OGEC - Ecole Ste Genevieve de Cluny", "OGEC - École Ste Genevieve de Cluny"],
    ["OLA Ravine Des Cabris", "OLA Ravine des Cabris"],
    ["Paroisse de Trois Mares Eglise St Esprit", "Paroisse de Trois Mares Église St Esprit"],
    ["Paroisse de Trois Mares Eglise Ste Famille", "Paroisse de Trois Mares Église Ste Famille"],
    ["PAROISSE DES AVIRONS - Eglise De La Ravine Sèche", "PAROISSE DES AVIRONS - Église de La Ravine Sèche"],
    ["Paroisse Sainte Thérèse D'Avila La Saline", "Paroisse Sainte Thérèse d'Avila La Saline"],
    ["Pharmacie Bras De Pontho", "Pharmacie Bras de Pontho"],
    ["Pharmacie De La Trinite", "Pharmacie de La Trinite"],
    ["Pharmacie Des Jacarandas", "Pharmacie des Jacarandas"],
    ["Regal Des Iles", "Regal des Iles"],
    ["Station Total Ravine Des Cabris", "Station Total Ravine des Cabris"],
    ["Sucrerie De Bois Rouge", "Sucrerie de Bois Rouge"],
    ["Tennis Club De Champ Fleuri", "Tennis Club de Champ Fleuri"],
  ],
  velo: [
    ["Cabane Des Pécheurs", "Cabane des Pécheurs"],
    ["Camping De L'Etang Salé", "Camping de L'Etang Salé"],
    ["Ecole Maternelle Du Centre", "École Maternelle du Centre"],
    ["Ecole Sheunon", "École Sheunon"],
    ["Eglise De Basse Terre", "Église de Basse Terre"],
    ["Eglise De La Ravine Blanche", "Église de La Ravine Blanche"],
    ["Eglise De Terre Sainte", "Église de Terre Sainte"],
    ["Eglise Des Avirons", "Église des Avirons"],
    ["Hôtel De Ville Des Avirons", "Hôtel de Ville des Avirons"],
    ["Parcours De Santé Casabona", "Parcours de Santé Casabona"],
    ["Piscine Et Stade De Football", "Piscine et Stade de Football"],
    ["Piscine Et Terrain De Tennis", "Piscine et Terrain de Tennis"],
    ["PLage De Terre Sainte", "PLage de Terre Sainte"],
    ["Port De Saint Pierre", "Port de Saint Pierre"],
    ["Site De Grand Anse", "Site de Grand Anse"],
    ["Stade De Foot", "Stade de Foot"],
    ["Stade De Football", "Stade de Football"],
    ["Stade Du Centenaire", "Stade du Centenaire"],
    ["Terrain De Tennis", "Terrain de Tennis"],
    ["Terrain De Tennis De Casabona", "Terrain de Tennis de Casabona"],
    ["Théatre De L'Etang Salé", "Théatre de L'Etang Salé"],
  ],
  clubs: [
    ["Ass Sportive Et De Loisirs De Piton St Leu", "Ass Sportive et de Loisirs de Piton St Leu"],
    ["Club Omnisports De La Montagne", "Club Omnisports de La Montagne"],
    ["Jeunesse Sportive De La Saline", "Jeunesse Sportive de La Saline"],
    ["Sporting Club De Sainte Marie", "Sporting Club de Sainte Marie"],
  ],
  gazetteer: [
    ["Cascade De Centrale", "Cascade de Centrale"],
    ["Domaine D'Anjou", "Domaine d'Anjou"],
    ["Pente D'orange", "Pente d'orange"],
    ["Plateau Eglise", "Plateau Église"],
    ["Pont D'Yves", "Pont d'Yves"],
  ],
};

type Named = { nom?: string };
/** The names a list changed as it was loaded, each once, in alphabetical order; and nothing else of its rows changed. */
function changed(raw: Named[], loaded: Named[]): [string, string][] {
  expect(loaded).toHaveLength(raw.length);
  const out = new Map<string, string>();
  raw.forEach((r, i) => {
    expect({ ...loaded[i], nom: r.nom }).toEqual(r);
    if (r.nom !== loaded[i].nom) out.set(r.nom!, loaded[i].nom!);
  });
  return [...out].sort(([a], [b]) => a.localeCompare(b, "fr"));
}

describe("names as French writes them (noms.ts)", () => {
  it("changes these names of the six lists, and only these, as each is loaded", () => {
    expect(changed(rawEcoles.etablissements, LIST)).toEqual(CHANGED.ecoles);
    expect(changed(rawEnfants.lieux, LIEUX)).toEqual(CHANGED.enfants);
    expect(changed(rawDae.defibrillateurs, DAES)).toEqual(CHANGED.dae);
    expect(changed([...rawVelo.voies, ...rawVelo.accroches], [...VOIES, ...ACCROCHES])).toEqual(CHANGED.velo);
    const clubs = [...rawClubs.volley.map((c) => clubOf("volley", c.sigle ?? c.nom)), ...rawClubs.handball.map((c) => clubOf("handball", c.nom))];
    expect(changed([...rawClubs.volley, ...rawClubs.handball], clubs as Named[])).toEqual(CHANGED.clubs);
    expect(changed([...rawGazetteer.places, ...rawGazetteer.places_ign], [...gazetteer.places, ...gazetteer.places_ign])).toEqual(CHANGED.gazetteer);
    expect(Object.values(CHANGED).flat()).toHaveLength(89);
    // The rule gives each one, and gives it once: shown again, a name stays as it is.
    for (const [from, to] of Object.values(CHANGED).flat()) {
      expect(particules(from)).toBe(to);
      expect(particules(to)).toBe(to);
    }
  });

  it("leaves the first word, a name in capitals, the articles of a place and the other words as they are", () => {
    // After a word all in capitals: a name written in capitals, left whole.
    expect(particules("Plateau A collège de BOIS D'OLIVES")).toBe("Plateau A collège de BOIS D'OLIVES");
    expect(particules("PAROISSE DES AVIRONS - Eglise De La Ravine Sèche")).toBe("PAROISSE DES AVIRONS - Église de La Ravine Sèche");
    // « La », « Le », « Les », « L' »: a place's own.
    expect(particules("Bibliothèque Départementale de La Réunion")).toBe("Bibliothèque Départementale de La Réunion");
    expect(particules("Collège Boris GAMALEYA Les Alizés")).toBe("Collège Boris GAMALEYA Les Alizés");
    expect(particules("Office De L'Eau De La Reunion")).toBe("Office de L'Eau de La Reunion");
    // The first word.
    expect(particules("Des Makes")).toBe("Des Makes");
    expect(particules("De La Salle")).toBe("De La Salle");
    expect(particules("Et Cetera")).toBe("Et Cetera");
    expect(particules("D'Anjou")).toBe("D'Anjou");
    // « D » only before an apostrophe; a word that only starts like one, untouched.
    expect(particules("Bâtiment D")).toBe("Bâtiment D");
    expect(particules("Rue Desbassyns")).toBe("Rue Desbassyns");
    expect(particules("Les Deux Canons")).toBe("Les Deux Canons");
    // The four accents, as whole words, the first word or not; no other word.
    expect(particules("Ecole Maternelle Du Centre")).toBe("École Maternelle du Centre");
    expect(particules("Lycée l'Etoile")).toBe("Lycée l'Étoile");
    expect(particules("Camping De L'Etang Salé")).toBe("Camping de L'Etang Salé");
    expect(particules("Ecoles")).toBe("Ecoles");
    expect(particules("St Leu")).toBe("St Leu");
  });

  it("finds the same places in the gazetteer: only what is shown changes", () => {
    // Each name and its new spelling read alike by the resolver.
    for (const p of [...rawGazetteer.places, ...rawGazetteer.places_ign]) expect(normalize(particules(p.nom))).toBe(normalize(p.nom));
    // The resolver's answers before the rule (main, 07/11/2026), whatever the text's case: « Pont d'Yves » was and is
    // the quartier « Le Pont d'Yves »; the places renamed are found where they were, by their old and new names.
    const before: [string[], string, number, number][] = [
      [["Pont D'Yves", "Pont d'Yves", "pont d'yves", "PONT D'YVES"], "Le Pont d'Yves", 55.50448, -21.23573],
      [["Domaine D'Anjou", "Domaine d'Anjou", "domaine d'anjou"], "Domaine d'Anjou", 55.22376, -21.04552],
      [["Cascade De Centrale", "cascade de centrale"], "Cascade de Centrale", 55.6787, -21.05398],
      [["Plateau Eglise", "Plateau Église", "plateau eglise"], "Plateau Église", 55.40557, -21.07006],
    ];
    for (const [texts, nom, lon, lat] of before)
      for (const text of texts) {
        const r = resolvePlace(text)!;
        expect([r.lieu.nom, r.lieu.lon, r.lieu.lat, r.correspondance], text).toEqual([nom, lon, lat, "exacte"]);
      }
    // An alias still leads to its place.
    for (const [alias, to] of Object.entries(rawGazetteer.aliases as Record<string, string>)) expect(gazetteer.aliases[alias]).toBe(particules(to));
  });

  it("says the names so in the tools' answers", () => {
    const b = JSON.parse(defibrillateurs("-20.89131, 55.47635").content[0].text);
    expect(b.resume).toMatch(/Défibrillateur le plus proche \(-20\.8913, 55\.4763\) : Collège des 2 Canons \(Saint-Denis\), à\s0\sm/u);
    expect(JSON.stringify(b)).not.toContain("College Des 2 Canons");
    // A club is still found by its name as the federation writes it.
    expect(clubOf("handball", "Sporting Club De Sainte Marie")?.nom).toBe("Sporting Club de Sainte Marie");
    expect(clubOf("handball", "sporting club de sainte marie 2")?.nom).toBe("Sporting Club de Sainte Marie");
  });
});
