import { afterEach, describe, expect, it } from "vitest";
import { ALERTES_EN_LIGNE, ouvrir } from "../src/web/alertes-drapeau.js";
import { BOUTON, PATH } from "../src/web/alertes-page.js";
import { alertePage } from "../src/web/alerte-cyclone.js";
import { vigilancePage } from "../src/web/vigilance-page.js";
import { volcanPage } from "../src/web/volcan.js";

const O = "https://rundata.re";
const NOW = new Date("2026-11-27T05:00:00Z");
const PAGES: [string, () => string][] = [
  ["/vigilance", () => vigilancePage(O, null, NOW)],
  ["/alerte-cyclone", () => alertePage(O, null, NOW)],
  ["/volcan", () => volcanPage(O, null, NOW)],
];
const LIEN = `<a href="${PATH}">${BOUTON} →</a>`;

afterEach(() => ouvrir(ALERTES_EN_LIGNE));

describe("the link to the alerts on the phone", () => {
  it.each(PAGES)("is on %s once the alerts are open, with the button's words, once", (_, page) => {
    ouvrir(true);
    expect(page().split(LIEN).length - 1).toBe(1);
  });

  it.each(PAGES)("is not on %s while the alerts are closed", (_, page) => {
    ouvrir(false);
    expect(page()).not.toContain(`href="${PATH}"`);
  });
});
