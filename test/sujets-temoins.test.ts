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

describe("witness headlines of /actualites's other subjects (its filter by subject)", () => {
  // Real headlines from test/fixtures/actualites (October 2026) first; the others written for this test, said as such.
  it("« météo »: the weather, its vigilance with a colour; not « la vigilance » of a committee nor « une pluie de médailles »", () => {
    has("meteo", ["Météo : un samedi qui se couvre au fil des heures", "Tempête Austen : 288.600 foyers sans électricité, 23 départements en vigilance orange"]);
    hasNot("meteo", ["Week-end sous tension : Le CROS de La Réunion prône la vigilance et salue le report des rassemblements sportifs du 24 octobre"]);
    // Written for this test.
    hasNot("meteo", ["Une pluie de médailles pour les nageurs réunionnais"]);
  });

  it("« volcan »: the volcano; not « une éruption de joie »", () => {
    has("volcan", ["Piton de la Fournaise : « Éruption avortée », le réservoir reste sous pression"]);
    // Written for this test.
    hasNot("volcan", ["Éruption de joie au stade après le but de la victoire"]);
  });

  it("« eau »: the tap water and the power; not « des coupures de presse »", () => {
    has("eau", ["Plaine des Palmistes : la Cise alerte sur la qualité de l'eau, plusieurs citernes installées"]);
    // Written for this test.
    hasNot("eau", ["Coupures de presse : l'exposition des archives départementales"]);
  });

  it("« sécurité »: crimes, fires, the police; not fireworks nor flights", () => {
    has("securite", ["Saint-Denis : près de 3 kg de cocaïne, des armes saisis et un individu interpellé", "Braconnage dans la réserve naturelle : 79 kg de poissons et de crustacés saisis"]);
    // Written for this test.
    hasNot("securite", ["Feux d'artifice du 20 décembre : le programme", "Les vols vers Maurice reprennent ce week-end"]);
  });

  it("« santé »: health, a stroke included", () => {
    has("sante", ["Samedi à Saint-Benoît, grande “marche rose” contre le cancer du sein", "AVC à La Réunion : près de 1 900 hospitalisations par an"]);
    hasNot("sante", ["Face aux tensions sociales, les ligues sportives préfèrent reporter les compétitions ce samedi"]);
  });

  it("« politique »: the institutions; « conseil » only as one of them", () => {
    has("politique", ["Le Tampon : budget, cantines, associations… Découvrez les principales décisions du conseil municipal", "La commission permanente de la Région Réunion vote la prolongation de la réduction du coût des abonnements"]);
    // Written for this test.
    hasNot("politique", ["Conseil de lecture : nos romans de l'été"]);
  });

  it("« culture »: its own words; not an election cancelled, matches put off, nor « fête » the verb", () => {
    has("culture", ["Somèn Kréol 2026 : cuisine lontan, concours intergénérationnel et concerts au Chaudron ce samedi 24 octobre", "Mobilisation citoyenne : plusieurs concerts, festivals et compétitions sportives annulés ou reportés"]);
    hasNot("culture", [
      "Annulation de l'élection de Saint-André : […] devant le Conseil d'État",
      "Face aux tensions sociales, les ligues sportives préfèrent reporter les compétitions ce samedi",
      "Week-end sous tension : Le CROS de La Réunion prône la vigilance et salue le report des rassemblements sportifs du 24 octobre",
      "[…] fête sa victoire...et prépare les prochaines échéances",
    ]);
  });

  it("« sport »", () => {
    has("sport", ["Grand Raid : les joëlettes franchissent la ligne d’arrivée, l’émotion à son comble", "Face aux tensions sociales, les ligues sportives préfèrent reporter les compétitions ce samedi"]);
    hasNot("sport", ["Le Tampon : budget, cantines, associations… Découvrez les principales décisions du conseil municipal"]);
  });

  it("« route » and « mobilisation »: not a drug traffic, « un accident de parcours », nor a dam", () => {
    // Written for this test.
    hasNot("route", ["Le trafic de drogue démantelé à Saint-Louis", "Accident de parcours : le club perd à domicile"]);
    hasNot("mobilisation", ["Barrage de Takamaka : EDF lance des travaux"]);
    expect(ROAD_TITLE.test(normalize("Le trafic de drogue démantelé à Saint-Louis"))).toBe(false);
    expect(ROAD_TITLE.test(normalize("Barrage de Takamaka : EDF lance des travaux"))).toBe(false);
  });
});
