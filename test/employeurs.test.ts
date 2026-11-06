import { describe, expect, it } from "vitest";
import { employeurs, intitule } from "../src/tools/employeurs.js";
import { offreRow } from "../src/tools/emploi.js";

describe("the offers' titles and employers", () => {
  it("writes a title in capitals in the case of a sentence, its sigles kept, its employer named", () => {
    expect(intitule("UN AGENT POLYVALENT – CUISINE (H/F) - REGION ILE DE LA REUNION")).toBe("Un agent polyvalent – cuisine (H/F) - Conseil régional de La Réunion");
    expect(intitule("TECHNICIEN PILHI - COMMUNAUTE D'AGGLO VILLES SOLIDAIRES")).toBe("Technicien PILHI - CIVIS (Communauté Intercommunale des Villes Solidaires)");
    expect(intitule("AGENT DE GESTION ADMINISTRATIVE F/H - CONSEIL DEPARTEMENTAL DE LA REUNION")).toBe("Agent de gestion administrative F/H - Département de La Réunion");
    // Two words: a job, not a name.
    expect(intitule("AGENT SOCIAL - CTRE COM ACTION SOCIALE SAINT ANDRE")).toBe("Agent social - CCAS de Saint-André");
    expect(intitule("ANIMATEUR.TRICE CULTUREL.LE - COMMUNE DE SAINT LOUIS")).toBe("Animateur.trice culturel.le - Commune de Saint-Louis");
    // Its « (h/f) » in lowercase: still a title in capitals.
    expect(intitule("ASSISTANT DE SERVICE SOCIAL (h/f) - CTRE COM ACTION SOCIALE DE SAINT LOUIS")).toBe("Assistant de service social (H/F) - CCAS de Saint-Louis");
    // An end that names no employer: part of the title.
    expect(intitule("UN AGENT POLYVALENT - ENTRETIEN ET RESTAURATION (H/F) POUR LA BRIGADE VOLANTE")).toBe("Un agent polyvalent - entretien et restauration (H/F) pour la brigade volante");
  });

  it("gives back the accents of a closed list only, and « chargé » before its complement", () => {
    expect(intitule("EDUCATEUR SPECIALISE - COMMUNAUTE INTERCOMMUNALE REUNION EST")).toBe("Éducateur spécialisé - Communauté intercommunale Réunion Est (CIREST)");
    expect(intitule("CHARGE(E) D'ACCUEIL - COMMUNAUTE INTERCOMMUNALE NORD REUNION")).toBe("Chargé(e) d'accueil - Communauté intercommunale du Nord de La Réunion (CINOR)");
    expect(intitule("RESPONSABLE D'EQUIPE ETAT CIVIL")).toBe("Responsable d'équipe état civil");
    // The noun stays a noun; a word off the list keeps the employer's spelling.
    expect(intitule("AGENT DE PRISE EN CHARGE DES USAGERS")).toBe("Agent de prise en charge des usagers");
    expect(intitule("CHARGE DE MISSION ECONOMIE")).toBe("Chargé de mission économie");
    expect(intitule("CONSEILLER.ERE FUNERAIRE - COMMUNE DE SAINT LOUIS")).toBe("Conseiller.ère funéraire - Commune de Saint-Louis");
    expect(intitule("CHARGE DE MISSION ENERGIE")).toBe("Chargé de mission energie");
    // Written with lowercase letters: as written, accents too.
    expect(intitule("Educateur specialise - Commune de Saint-Paul")).toBe("Educateur specialise - Commune de Saint-Paul");
  });

  it("names a commune's employer with the commune's own name, even cut short", () => {
    expect(intitule("Agent d'entretien des locaux (h/f) - COMMUNE DU TAMPON")).toBe("Agent d'entretien des locaux (h/f) - Commune du Tampon");
    expect(intitule("Chef de projet (h/f) - COMMUNE DE SAINT DENIS (974)")).toBe("Chef de projet (h/f) - Commune de Saint-Denis");
    expect(intitule("Animateur petite enfance (H/F) - CTRE COM ACTION SOCIALE DE LA POSSESSI")).toBe("Animateur petite enfance (H/F) - CCAS de La Possession");
    expect(intitule("Agent d'accueil (h/f) - CTRE COM ACTION SOCIALE PLAINE DES PAL")).toBe("Agent d'accueil (h/f) - CCAS de La Plaine-des-Palmistes");
    expect(intitule("Agent d'entretien des espaces verts (h/f) - COMMUNE DE L'ENTRE DEUX")).toBe("Agent d'entretien des espaces verts (h/f) - Commune de l'Entre-Deux");
    expect(intitule("Référent de parcours - CAISSE DES ECOLES DE SAINT DENIS")).toBe("Référent de parcours - Caisse des écoles de Saint-Denis");
    // Absent from the table: each word with its capital, no accent added.
    expect(intitule("Assistant Administratif H/F - ESPACE CULTUREL LECONTE DE LISLE")).toBe("Assistant Administratif H/F - Espace Culturel Leconte de Lisle");
    // Written with lowercase letters: as written.
    expect(intitule("Cuisinier (h/f) - Commune de Saint-Paul")).toBe("Cuisinier (h/f) - Commune de Saint-Paul");
  });

  it("names the parts of an employer in capitals, and leaves a sigle as it is", () => {
    expect(employeurs("Office National des Forêts (ONF), OFFICE NATIONAL DES FORETS")).toBe("Office National des Forêts (ONF), Office national des forêts");
    expect(employeurs("Office français de l'immigration et de l'intégration, OFII")).toBe("Office français de l'immigration et de l'intégration, OFII");
    expect(employeurs("Direction Générale de l'Aviation Civile (DGAC), SIR/OI (SIR/OI)")).toBe("Direction Générale de l'Aviation Civile (DGAC), SIR/OI (SIR/OI)");
  });

  it("gives the tool and the page the title and employer so written", () => {
    const row = offreRow({
      ref: "2026-123456",
      intitule: "SECRETAIRE F/H - CONSEIL DEPARTEMENTAL DE LA REUNION",
      employeur: "Office National des Forêts (ONF), OFFICE NATIONAL DES FORETS",
      lien: "https://choisirleservicepublic.gouv.fr/offre-emploi/2026-123456/",
      publiee: "2026-11-02T20:00:00.000Z",
    });
    expect(row).toMatchObject({ intitule: "Secrétaire F/H - Département de La Réunion", employeur: "Office National des Forêts (ONF), Office national des forêts" });
  });
});
