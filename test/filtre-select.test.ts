import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// The search forms (.filter) set their select and their text field side by side, aligned at their foot. The browser
// gives a select a « normal » line-height, not the field's 1.6: 41 px against 45, so on /ecoles the label « Commune »
// sat 5 px below « Numéro et voie » at 1280 px, and the select was under the 44 px of a finger on a phone.
describe("a search form's select", () => {
  it("is as tall as the text field beside it: its line, its padding and its border", () => {
    expect(CSS).toContain(".filter select{min-height:calc(1.6em + 1.1rem + 2px)}");
    // The field's own padding and border, which the height adds up.
    expect(CSS).toMatch(/\.filter input\[type=search\],\.filter select\{[^}]*border:1px solid[^}]*padding:\.55rem \.7rem/);
  });
});
