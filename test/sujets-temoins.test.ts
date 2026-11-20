/**
 * Witness headlines for every word that sets a state on the home page or /trafic: « mobilisation en cours », the
 * news of the roads, « eau à ne pas boire », the Enclos closed, a trail closed. Each subject has headlines that must be
 * in it and headlines that must not, the real ones first (test/fixtures, or the site on the day said), then sentences
 * written for this test on the model of the real ones, said as such. A word that files a headline wrongly gets its
 * witness here when it is fixed.
 */
import { describe, expect, it } from "vitest";
import { sujetsOf } from "../src/providers/actualites.js";
import { drinkSaid, lifts, surLEau } from "../src/providers/avis-eau.js";
import { statut } from "../src/providers/sentiers.js";
import { enclosIn } from "../src/providers/volcan.js";
import { normalize } from "../src/places/resolve.js";
import { ROAD_TITLE } from "../src/web/data.js";

const has = (sujet: string, textes: string[]) => { for (const t of textes) expect(sujetsOf(t), t).toContain(sujet); };
const hasNot = (sujet: string, textes: string[]) => { for (const t of textes) expect(sujetsOf(t), t).not.toContain(sujet); };

describe("witness headlines, by subject", () => {
  it("« mobilisation » (the home's tile, /trafic): a strike, a blockade, a march; not money, firms or means set to work", () => {
    has("mobilisation", [
      // test/fixtures/actualites, October 2026.
      "Enseignement privé indépendant : appel à la grève le 5 novembre 2026",
      "Les grévistes de la Cise demandent toujours « l’équité sur la prime de vie chère »",
      "Mobilisation du 24 octobre : ce qui est prévu",
      "Manifestations à La Réunion : ce que rappelle la police aux participants",
      // Written for this test.
      "Les planteurs maintiennent le blocage devant l'usine du Gol",
    ]);
    hasNot("mobilisation", [
      // Freedom and Imaz Press, 20/11/2026: « mobilisation en cours » above them on the home page.
      "Saint-André : « 84% des financements ANRU engagé; Notre commune accélère sa transformation » C’est un communiqué de la ville de Saint-André : « […] une mobilisation financière remarquable et une…",
      "Décrochage scolaire : la Région Réunion et les PSAD mobilisent les entreprises pour bâtir des passerelles vers l’emploi",
      "Saint-André mobilise 84% des financements de l'Agence nationale pour sa rénovation urbaine",
      // Written for this test.
      "Saint-Denis : la mairie mobilise ses moyens pour le nettoyage des plages",
    ]);
  });

  it("« route » (/trafic, the day of a commune): the roads; not an accident of health nor a day « sans accident »", () => {
    has("route", [
      // test/fixtures/actualites, October 2026.
      "Saint-Benoît : circulation interdite entre l’échangeur de Beaulieu et le giratoire des Plaines les nuits du 26 au 29 octobre",
      "Inforoute du samedi 24 octobre : routes fermées, rallye automobile, manifestations et travaux à prévoir sur l’île",
      // Written for this test.
      "Saint-Paul : un accident entre deux voitures sur la route des Tamarins",
    ]);
    hasNot("route", [
      // Freedom, 29/10/2026 (test/fixtures/actualites/freedom-2026-10-29.xml): headline and first words of the article.
      "AVC à La Réunion : près de 1 900 hospitalisations par an Ces symptômes peuvent annoncer un accident vasculaire cérébral (AVC).",
      "Rentrer du travail en bonne santé : la prévention passe aussi par le jeu Sur un chantier, on pense au travail à terminer. Mais la journée doit aussi se finir sans accident.",
    ]);
  });

  it("the headlines /trafic keeps: of the roads or the street, not a sporting gathering nor an accident of health", () => {
    const road = (t: string) => ROAD_TITLE.test(normalize(t));
    // test/fixtures/actualites, October 2026; then written for this test.
    for (const t of ["Saint-Benoît : circulation interdite entre l’échangeur de Beaulieu et le giratoire des Plaines", "Accident sur la quatre voies à Saint-Denis : un blessé grave"]) expect(road(t), t).toBe(true);
    for (const t of ["Rassemblement sportif des écoles à Saint-Paul", "AVC : un accident vasculaire cérébral toutes les quatre heures"]) expect(road(t), t).toBe(false);
  });

  it("a commune's post about its tap water: not its pool, its electricity, nor an irrigation canal alone", () => {
    // Cilaos, 19/10/2026: the irrigation network closed cut the tap water at night too. The others written for this test.
    expect(surLEau("Fermeture exceptionnelle du réseau d'irrigation agricole", "la distribution d'eau potable sera coupée la nuit")).toBe(true);
    expect(surLEau("Coupure d'eau à Bois-de-Nèfles", "")).toBe(true);
    expect(surLEau("Fermeture du réseau d'irrigation agricole", "pour travaux sur le canal")).toBe(false);
    expect(surLEau("Fermeture de la piscine : vidange du bassin d'eau", "")).toBe(false);
    expect(surLEau("Coupure d'électricité EDF ce jeudi", "")).toBe(false);
  });

  it("« eau à ne pas boire » only when a notice says so, not the usual advice after a cut, a lifted notice or a drought", () => {
    // Written for this test on the model of the distributors' notices.
    expect(drinkSaid("Avis aux usagers", "L'eau est impropre à la consommation : ne pas boire l'eau du robinet.")).toBe(true);
    expect(drinkSaid("Coupure d'eau ce mardi", "Après la remise en eau, l'eau peut être impropre à la consommation : faire bouillir.")).toBe(false);
    expect(drinkSaid("Fin de l'avis", "Retour à la normale : l'eau peut de nouveau être bue.")).toBe(false);
    expect(drinkSaid("Sécheresse", "Restrictions d'usage de l'eau : arrosage interdit.")).toBe(false);
    // A notice lifted: « retour à la normale », but not while waiting for it, nor with its restrictions kept.
    expect(lifts("Retour à la normale : l'eau est de nouveau propre à la consommation.")).toBe(true);
    expect(lifts("Dans l'attente d'un retour à la normale, ne buvez pas l'eau.")).toBe(false);
    expect(lifts("Retour à la normale de la distribution ; les restrictions d'usage sont maintenues.")).toBe(false);
  });

  it("the Enclos closed, reopened or reopened in part, and nothing said when the words say none of it", () => {
    // Written for this test on the model of the prefecture's releases.
    expect(enclosIn("Fermeture de l'Enclos Fouqué")).toBe("ferme");
    expect(enclosIn("Réouverture partielle de l'Enclos")).toBe("partiel");
    expect(enclosIn("L'Enclos est rouvert au public")).toBe("ouvert");
    expect(enclosIn("Le Piton de la Fournaise en phase de vigilance")).toBeUndefined();
  });

  it("a trail closed as the ONF's status says it, out of its management apart, unknown when the field is empty", () => {
    expect(statut("Fermé")).toBe("fermé");
    expect(statut("Fermé partiellement")).toBe("fermé");
    expect(statut("Ouvert")).toBe("ouvert");
    expect(statut("Hors gestion ONF")).toBe("hors gestion ONF");
    expect(statut("")).toBe("inconnu");
    expect(statut(null)).toBe("inconnu");
  });
});
