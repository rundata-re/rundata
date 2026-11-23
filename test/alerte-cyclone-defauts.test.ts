import { describe, expect, it } from "vitest";
import type { Info } from "../src/providers/actualites.js";
import * as pref from "../src/providers/prefecture.js";
import * as mf from "../src/providers/vigilance.js";
import { cyclone, cycloneLevel } from "../src/tools/vigilance.js";
import { alertePage } from "../src/web/alerte-cyclone.js";
import { alerteOf } from "../src/web/data.js";
import { ecolesPage } from "../src/web/ecoles.js";
import { vigilanceLive } from "../src/web/pages.js";

// Saturday 24 October 2026, 14:00 at La Réunion.
const NOW = new Date("2026-10-24T10:00:00Z");
const at = (local: string) => new Date(`${local}+04:00`).toISOString().replace(".000", "");

/** Météo-France's map as the API gives it, the cyclone alert with its own codes (7 to 10, 6). */
function map(periods: [number, string, string?][]) {
  const items = periods.map(([color_id, begin_time, end_time]) => ({ color_id, begin_time: at(begin_time), end_time: end_time && at(end_time) }));
  return mf.parse({
    update_time: at("2026-10-24T06:00:00"),
    timelaps: { domain_ids: [{ domain_id: mf.ISLAND, phenomenon_items: [{ phenomenon_id: mf.CYCLONE, timelaps_items: items }] }] },
  });
}
/** The page's text with its apostrophes, as the HTML escapes them (&#39;). */
const text = (html: string) => html.replaceAll("&#39;", "'");
const release = (titre: string, day: string): Info =>
  ({ titre, lien: `https://www.reunion.gouv.fr/x/${encodeURIComponent(titre).slice(0, 20)}`, publie: new Date(`${day}T12:00:00+04:00`).toISOString(), media: "Préfecture de La Réunion", heure: false, communes: [], lieux: [], sujets: [] }) as Info;

describe("an alert whose every period is over", () => {
  // The pré-alerte of the morning, ended at noon; the bulletin of 10:00 still served at 14:00.
  const lone = map([[7, "2026-10-24T06:00:00", "2026-10-24T12:00:00"]]);
  // An orange alert then a pré-alerte, both over.
  const two = map([[8, "2026-10-24T02:00:00", "2026-10-24T08:00:00"], [7, "2026-10-24T08:00:00", "2026-10-24T12:00:00"]]);

  it("is said lifted by the tools, as the pages say it, never « prévue » nor in force", () => {
    for (const v of [lone, two]) {
      expect(cycloneLevel(v.zones[mf.ISLAND][mf.CYCLONE], NOW)).toBe(-1);
      expect(cyclone(v, NOW)).toBe("Alerte cyclonique levée (bulletin de Météo-France).");
      expect(alertePage("https://rundata.re", { value: v, fetchedAt: NOW }, NOW)).toContain("Alerte levée (bulletin de Météo-France).");
    }
  });

  it("puts no cyclone alert in the banner nor in the tile", () => {
    for (const v of [lone, two]) {
      expect(alerteOf(v, NOW)).toBeUndefined();
      expect(vigilanceLive({ value: v, fetchedAt: NOW }, NOW)?.valeur ?? "").not.toContain("Cyclone :");
    }
  });

  it("leaves an alert announced for later « prévue », and one in force in force", () => {
    const later = map([[7, "2026-10-24T06:00:00", "2026-10-24T12:00:00"], [8, "2026-10-24T18:00:00"]]);
    expect(cyclone(later, NOW)).toBe("Alerte cyclonique prévue : orange à partir du 24/10 18:00.");
    expect(alerteOf(later, NOW)).toMatchObject({ couleur: 3, court: { cyclone: 3, prevue: true } });
    expect(cyclone(map([[7, "2026-10-24T06:00:00", "2026-10-24T18:00:00"]]), NOW)).toMatch(/^ALERTE CYCLONIQUE pré-alerte/);
  });
});

describe("the pages of the alert served from an old copy", () => {
  const v = map([]);
  const old = { value: v, fetchedAt: new Date(NOW.getTime() - 3 * 3600_000) };

  it("say when the vigilance was read, on /ecoles-cyclone and /alerte-cyclone", () => {
    for (const page of [ecolesPage("https://rundata.re", old, NOW), alertePage("https://rundata.re", old, NOW)]) {
      expect(page).toContain("Vigilance de Météo-France lue le 24/10 à 11:00, sans réponse depuis.");
    }
  });

  it("say nothing more for a copy just read", () => {
    for (const page of [ecolesPage("https://rundata.re", { value: v, fetchedAt: NOW }, NOW), alertePage("https://rundata.re", { value: v, fetchedAt: NOW }, NOW)]) {
      expect(page).not.toContain("Vigilance de Météo-France lue");
    }
  });
});

describe("a release of the prefecture ahead of the bulletin", () => {
  it("is said on /alerte-cyclone beside the bulletin's « pas d'alerte », as on /ecoles-cyclone", () => {
    const v = map([]);
    const decision = pref.decisionOf([release("Cyclone Test : déclenchement de l'alerte rouge « Je me confine » à 19h00", "2026-10-24")])!;
    const copy = { value: v, fetchedAt: NOW };
    const said = "Le communiqué de la préfecture du samedi 24/10 annonce l'alerte rouge";
    expect(text(ecolesPage("https://rundata.re", copy, NOW, undefined, { decision }))).toContain(said);
    expect(text(alertePage("https://rundata.re", copy, NOW, undefined, { decision }))).toContain(said);
  });

  it("a confirmation too", () => {
    const v = map([[9, "2026-10-24T06:00:00"]]);
    const decision = pref.decisionOf([release("Cyclone Test : déclenchement de l'alerte rouge « Je me confine » à 05h00", "2026-10-24")])!;
    expect(text(alertePage("https://rundata.re", { value: v, fetchedAt: NOW }, NOW, undefined, { decision }))).toContain("Alerte rouge, confirmée par le communiqué de la préfecture du samedi 24/10");
  });
});

describe("a title with two steps", () => {
  it("reads the step it goes to, not the one it lifts", () => {
    const d = (t: string) => pref.decisionOf([release(t, "2026-10-24")])?.niveau;
    expect(d("Levée de l'alerte violette, retour en alerte rouge")).toBe(4);
    expect(d("Fin de l'alerte rouge, passage en alerte orange")).toBe(3);
    expect(d("Levée de l'alerte orange, maintien de la pré-alerte cyclonique")).toBe(2);
    // One step only: still the end, and the sauvegarde before it.
    expect(d("Levée de l'alerte orange cyclonique")).toBe("levee");
    expect(d("Levée de l'alerte cyclonique")).toBe("levee");
    expect(d("Levée de l'alerte rouge, passage en phase de sauvegarde")).toBe(6);
  });
});
