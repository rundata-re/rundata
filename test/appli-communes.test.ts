import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/places/resolve.js";
import { ZONE_OF_COMMUNE } from "../src/providers/vigilance.js";

// Les communes que l'appli Android envoie à vigilance_meteo (lieu = nom de la commune), lues dans son code.
const kotlin = readFileSync(new URL("../mobile/shared/src/commonMain/kotlin/re/rundata/app/Communes.kt", import.meta.url), "utf8");
const bloc = kotlin.slice(kotlin.indexOf("val COMMUNES"));
const noms = [...bloc.matchAll(/"[a-z-]+" to "([^"]+)"/g)].map((m) => m[1]);

describe("communes de l'appli", () => {
  it("sont les 24", () => {
    expect(new Set(noms).size).toBe(24);
  });

  // Sans zone, le serveur répond pour toute l'île, sans « niveaux » : l'appli ne dirait rien de la vigilance de la commune.
  it.each(noms)("%s se rattache à une zone de vigilance", (nom) => {
    const res = resolvePlace(nom);
    expect(res?.lieu.commune).toBe(nom);
    expect(ZONE_OF_COMMUNE[res!.lieu.commune]).toBeTruthy();
  });
});
