import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX } from "../src/web/pages.js";
import { noticeOf, type TraceAnswer } from "../src/web/data.js";
import { stateHead, traceDescription, tracePage } from "../src/web/domains.js";

// The preview of a closed trail says so first (og:description), with the ONF's words of the audit of 04/11.
const trail = (nom: string, slug: string, etat: string, troncons: TraceAnswer["troncons"], over: Partial<TraceAnswer> = {}): TraceAnswer => ({
  nom, slug, genre: "sentier", km: 6.4, dplus: 412, etat, ferme: troncons.some((t) => t.etat === "fermé"), troncons,
  lignes: [], profil: [], randonnees: [], fermes: [], inconnus: [], sources: [], ...over,
});
const ENTITIES: Record<string, string> = { "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const og = (html: string) => (html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? "").replace(/&(?:#39|quot|lt|gt|amp);/g, (e) => ENTITIES[e]);
const page = (d: TraceAnswer) => og(tracePage("https://rundata.re", d.genre, d.slug, d.nom, { value: d, fetchedAt: new Date("2026-11-04T10:00:00Z"), stale: false }));

const KAPOR = trail("Sentier Kapor", "sentier-kapor", "Fermé : Éruption en cours (Sentier instable pour cause d'éruption récente, risques d'intoxication et de brulures)",
  [{ etat: "fermé", cause: "Éruption en cours", precision: "Sentier instable pour cause d'éruption récente, risques d'intoxication et de brulures" }]);
const LAVES = trail("Sentier des Laves", "sentier-des-laves", "Fermé : Sentier traversé par la coulée de lave de 2026",
  [{ etat: "fermé", cause: "Sentier traversé par la coulée de lave de 2026" }]);
const COUDE = trail("Grand Coude - Grand Galet", "grand-coude-grand-galet", "Fermé à cause de sa dangerosité · Pas de réouverture prévue à court terme",
  [{ etat: "fermé", cause: "Fermé à cause de sa dangerosité", precision: "Pas de réouverture prévue à court terme" }]);

describe("aperçu d'un sentier fermé", () => {
  it.each([KAPOR, LAVES, COUDE])("$nom : « Fermé » en premier, sans inviter à prendre la trace", (d) => {
    const said = page(d);
    expect(said).toMatch(/^Fermé/);
    expect(said).toContain(d.nom);
    expect(said).not.toMatch(/GPX|Trace GPS/);
    expect(said.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("la cause entière quand elle tient, l'état court sinon", () => {
    expect(traceDescription(LAVES, LAVES.nom, "Volcan, La Réunion", "repli")).toBe("Fermé : Sentier traversé par la coulée de lave de 2026. Sentier des Laves (Volcan, La Réunion) : 6,4 km, 412 m de dénivelé positif.");
    // Kapor's notice is long: it stays whole, the figures go.
    expect(traceDescription(KAPOR, KAPOR.nom, "Volcan, La Réunion", "repli")).toBe("Fermé : Éruption en cours (Sentier instable pour cause d'éruption récente, risques d'intoxication et de brulures). Sentier Kapor (La Réunion).");
    // Longer still: « Fermé » alone, then the name and the figures.
    const longer = { ...KAPOR, etat: `${KAPOR.etat}, et encore quelques mots de l'avis de l'ONF` };
    expect(traceDescription(longer, KAPOR.nom, "Volcan, La Réunion", "repli")).toBe("Fermé. Sentier Kapor (Volcan, La Réunion) : 6,4 km, 412 m de dénivelé positif.");
  });

  it("fermé sur un tronçon et ouvert sur un autre : « En partie fermé »", () => {
    const d = trail("Piste DFCI de la Glacière", "piste-dfci-de-la-glaciere",
      "Fermé : Travaux de réhabilitation de la piste en cours (Fermée jusqu'au 18 décembre 2026 inclus), en partie",
      [{ etat: "ouvert" }, { etat: "fermé", cause: "Travaux de réhabilitation de la piste en cours", precision: "Fermée jusqu'au 18 décembre 2026 inclus" }]);
    expect(stateHead(d)).toBe("En partie fermé");
    expect(page(d)).toMatch(/^(Fermé\s:\sTravaux|En partie fermé\.)/);
  });

  it("ouvert le week-end : l'avis de l'ONF, pas « Fermé » seul", () => {
    const d = trail("Sentier de Montplaisir", "sentier-de-montplaisir", "x",
      [{ etat: "fermé", cause: "Fermé jusqu'au 30/10/26 inclus - Sentier ouvert les samedis et dimanches durant cette période" }]);
    expect(stateHead(d)).toBe("Fermé sur la carte de l'ONF ; ouvert le samedi et le dimanche d'après l'avis de l'ONF");
  });

  it("un nom trop long garde l'état entier et se coupe", () => {
    const d = trail("Sentier ".repeat(30).trim(), "sentier-kapor", KAPOR.etat, KAPOR.troncons);
    const said = traceDescription(d, d.nom, "La Réunion", "repli");
    expect(said).toMatch(/^Fermé\. Sentier/);
    expect(said.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("hors gestion ONF avec un avis de fermeture (Bayonne) : l'avis, jamais « état non connu »", () => {
    const troncons = [{ etat: "hors gestion ONF", cause: "Fermé le 02/06/26", info: "Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs" }];
    const etat = noticeOf(troncons)!;
    expect(etat).toBe("Hors gestion ONF ; sur la carte de l'ONF : “Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs”");
    const d = trail("Sentier Bayonne", "sentier-bayonne", etat, troncons.map(({ etat, cause, info }) => ({ etat, cause, precision: info })));
    const said = page(d);
    expect(said).toMatch(/^Hors gestion ONF ; sur la carte de l'ONF : “Fermé le 02\/06\/26/);
    expect(said).not.toContain("état non connu");
    expect(said.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("ouvert d'après l'ONF et état inconnu : comme avant, le nom d'abord", () => {
    const open = trail("Sentier de la Roche Écrite", "sentier-de-la-roche-ecrite", "Ouvert d'après l'ONF", [{ etat: "ouvert" }]);
    expect(stateHead(open)).toBeUndefined();
    expect(page(open).replaceAll("\u00a0", " ")).toMatch(/^Sentier de la Roche Écrite \(.*\) : 6,4 km, 412 m de dénivelé positif\. Ouvert d'après l'ONF\. Trace GPS à télécharger \(GPX\) et profil\.$/);
    const unknown = trail("Sentier Dugain", "sentier-dugain", "Hors gestion ONF : état non connu", [{ etat: "hors gestion ONF" }]);
    expect(noticeOf([{}])).toBeUndefined();
    expect(stateHead(unknown)).toBeUndefined();
    expect(page(unknown).replaceAll("\u00a0", " ")).toMatch(/^Sentier Dugain .*Hors gestion ONF : état non connu\./);
    expect(page(unknown)).not.toMatch(/Ouvert/);
  });

  it("une randonnée qui passe par un tronçon fermé le dit d'abord", () => {
    const d = trail("Sentier du Trou de Fer", "sentier-du-trou-de-fer", "2 tronçons fermés : Sentier de l'École Normale, Sentier du Trou de Fer",
      [{ etat: "fermé", sentier: "Sentier de l'École Normale" }, { etat: "fermé", sentier: "Sentier du Trou de Fer" }],
      { genre: "randonnee", fermes: [{ sentier: "Sentier de l'École Normale" }, { sentier: "Sentier du Trou de Fer" }] });
    expect(stateHead(d)).toBe("2 tronçons fermés sur cet itinéraire");
    expect(page(d)).toMatch(/^2 tronçons fermés/);
    expect(page(d)).not.toMatch(/GPX/);
  });
});
