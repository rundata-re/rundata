import { describe, expect, it } from "vitest";
import { avis, finWeekEnd, motifs } from "../src/providers/sentiers.js";
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
const page = (d: TraceAnswer, now = new Date()) => og(tracePage("https://rundata.re", d.genre, d.slug, d.nom, { value: d, fetchedAt: new Date("2026-11-04T10:00:00Z"), stale: false }, now));

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
    // Longer: the notice alone, the page's title names the trail.
    const longer = { ...KAPOR, etat: `${KAPOR.etat}, et encore quelques mots de l'avis de l'ONF` };
    expect(traceDescription(longer, KAPOR.nom, "Volcan, La Réunion", "repli")).toBe(`${longer.etat}.`);
    // Longer than a preview: « Fermé » alone, then the name and the figures.
    const longest = { ...KAPOR, etat: `${longer.etat}, puis d'autres encore, assez pour dépasser la place d'un aperçu` };
    expect(traceDescription(longest, KAPOR.nom, "Volcan, La Réunion", "repli")).toBe("Fermé. Sentier Kapor (Volcan, La Réunion) : 6,4 km, 412 m de dénivelé positif.");
  });

  it("fermé sur un tronçon et ouvert sur un autre : « En partie fermé »", () => {
    const d = trail("Piste DFCI de la Glacière", "piste-dfci-de-la-glaciere",
      "Fermé : Travaux de réhabilitation de la piste en cours (Fermée jusqu'au 18 décembre 2026 inclus), en partie",
      [{ etat: "ouvert" }, { etat: "fermé", cause: "Travaux de réhabilitation de la piste en cours", precision: "Fermée jusqu'au 18 décembre 2026 inclus" }]);
    expect(stateHead(d)).toBe("En partie fermé");
    expect(page(d)).toMatch(/^(Fermé\s:\sTravaux|En partie fermé\.)/);
  });

  // As the ONF's map of 27/10/2026 still wrote it on 06/11: the notice outlives its last day.
  const MONTPLAISIR = { etat: "fermé", cause: "Fermé jusqu'au 30/10/26 inclus - Sentier ouvert les samedis et dimanches durant cette période" };
  const montplaisir = trail("Sentier de Montplaisir", "sentier-de-montplaisir", motifs(MONTPLAISIR).join(" · "), [MONTPLAISIR]);
  // 31/10 at 00:30 in La Réunion, and 30/10 at 23:30: the first minutes past the notice, and its last hour.
  const AFTER = new Date("2026-10-30T20:30:00Z");
  const LAST = new Date("2026-10-30T19:30:00Z");

  it("ouvert le week-end jusqu'à une date à venir : l'avis de l'ONF avec sa date, pas « Fermé » seul", () => {
    for (const now of [new Date("2026-10-24T08:00:00Z"), LAST]) {
      expect(stateHead(montplaisir, now)).toBe("Fermé sur la carte de l'ONF\u00a0; avis\u00a0: ouvert le week-end jusqu'au 30/10/26");
      const said = page(montplaisir, now);
      expect(said).toMatch(/^Fermé sur la carte de l'ONF/);
      expect(said).toContain("30/10/26");
      expect(said.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it("l'avis du week-end passé sa date : fermé comme sur la carte, plus jamais « ouvert le samedi et le dimanche »", () => {
    expect(stateHead(montplaisir, AFTER)).toBe("Fermé sur la carte de l'ONF");
    expect(traceDescription(montplaisir, montplaisir.nom, "Ouest, La Réunion", "repli", AFTER))
      .toBe("Fermé sur la carte de l'ONF. Sentier de Montplaisir (Ouest, La Réunion) : 6,4 km, 412 m de dénivelé positif.");
    const said = page(montplaisir, new Date("2026-11-06T07:00:00Z"));
    expect(said).toMatch(/^Fermé sur la carte de l'ONF\./);
    expect(said).not.toMatch(/ouvert|samedi|dimanche|week-end/i);
    expect(said).not.toMatch(/GPX|Trace GPS/);
    // Partly closed past the date: the closed section, nothing of the weekend.
    const partly = { ...montplaisir, troncons: [{ etat: "ouvert" }, MONTPLAISIR] };
    expect(stateHead(partly, AFTER)).toBe("En partie fermé");
    expect(traceDescription(partly, partly.nom, "La Réunion", "repli", AFTER)).not.toMatch(/ouvert|samedi|week-end/i);
  });

  it("un avis du week-end sans date de fin : ses mots, quel que soit le jour", () => {
    const d = trail("Sentier X", "sentier-de-montplaisir", "x", [{ etat: "fermé", cause: "Fermé du lundi au vendredi, ouvert le week-end" }]);
    for (const now of [LAST, AFTER, new Date("2027-06-01T08:00:00Z")]) {
      expect(stateHead(d, now)).toBe("Fermé sur la carte de l'ONF\u00a0; ouvert le samedi et le dimanche d'après l'avis de l'ONF");
    }
  });

  it("la date de fin d'un avis du week-end, telle que l'ONF l'écrit", () => {
    expect(finWeekEnd(MONTPLAISIR, LAST)).toEqual({ dit: "30/10/26", jour: "2026-10-30", passe: false });
    expect(finWeekEnd(MONTPLAISIR, AFTER)).toEqual({ dit: "30/10/26", jour: "2026-10-30", passe: true });
    expect(finWeekEnd({ cause: "Travaux", info: "Fermé jusqu’à 5/1/2027, ouvert le samedi et le dimanche" }, AFTER)).toEqual({ dit: "5/1/2027", jour: "2027-01-05", passe: false });
    // No weekend in the notice: no last day to read, the closure stays as the map says.
    expect(finWeekEnd({ cause: "Fermée jusqu'au 18/12/26 inclus" }, AFTER)).toBeUndefined();
  });

  it("un nom trop long : l'état entier seul, le titre nomme le sentier", () => {
    const d = trail("Sentier ".repeat(30).trim(), "sentier-kapor", KAPOR.etat, KAPOR.troncons);
    expect(traceDescription(d, d.nom, "La Réunion", "repli")).toBe(`${KAPOR.etat}.`);
  });

  it("un état plus long qu'un aperçu se coupe entre deux mots, jamais « .… »", () => {
    // Outside the ONF's management, the state is the notice itself: nothing shorter to fall back on.
    const troncons = [{ etat: "hors gestion ONF", cause: "Avis de l'ONF très long. ".repeat(10).trim() }];
    const d = trail("Sentier ".repeat(30).trim(), "sentier-kapor", noticeOf(troncons)!, troncons);
    const said = traceDescription(d, d.nom, "La Réunion", "repli");
    expect(said.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(said).toMatch(/[^\s.,;:]…$/);
  });

  it("hors gestion ONF avec un avis de fermeture (Bayonne) : l'avis, jamais « état non connu »", () => {
    // As the ONF's map writes it (04/11/2026): the date and the cause in one field, a space between them.
    const cause = avis("Fermé le 02/06/26 Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs");
    expect(cause).toBe("Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs");
    const troncons = [{ etat: "hors gestion ONF", cause, info: undefined }];
    const etat = noticeOf(troncons)!;
    expect(etat).toBe("Hors gestion ONF ; sur la carte de l'ONF : “Fermé le 02/06/26 · Désordres constatés, glissements de terrain incompatibles avec la présence de randonneurs”");
    const d = trail("Sentier Bayonne", "sentier-bayonne", etat, troncons.map(({ etat, cause, info }) => ({ etat, cause, precision: info })));
    const said = page(d);
    expect(said).toMatch(/^Hors gestion ONF ; sur la carte de l'ONF : “Fermé le 02\/06\/26/);
    expect(said).toBe(`${etat}.`);
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
