import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { toutesLesSources } from "../src/server.js";
import { DECOUVRIR_SHOWN, communePage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";
import { counts, LIEUX, LISTE_DU, monumentOf, ofCommune, resume, SOURCE } from "../src/vie/decouvrir.js";

// Saturday 31/10/2026, 01:13 at La Réunion.
const NOW = new Date("2026-10-30T21:13:00Z");
const page = (slug: string) => communePage("https://rundata.re", pageOf(slug)!, { place: null, commune: null }, NOW);
const tile = (html: string) => html.match(/<li class="tile[^>]*>(?:(?!<li class="tile).)*?<h3>À découvrir<\/h3>.*?(?=<li class="tile|<\/ul>\n\s*<p class="note">)/s)?.[0];

describe("the remarkable places (vie/decouvrir.ts)", () => {
  it("are the SIT's list of 01/11/2026, read one by one: no place named after a person, no « Terroir » alone", () => {
    // 263 places in the list, 122 of the heritage, 13 of them left out by name; the names kept are those read.
    expect(LIEUX.length).toBe(109);
    expect(LISTE_DU).toBe("2026-11-01");
    const lus = readFileSync(new URL("../scripts/decouvrir-lus.txt", import.meta.url), "utf8").trim().split("\n");
    expect(lus.length).toBe(109);
    const codes = new Set(Object.values(INSEE));
    for (const l of LIEUX) {
      expect(codes.has(l.insee), l.nom).toBe(true);
      // Neither an address nor a point in the repository: the page shows neither.
      expect(Object.keys(l).every((k) => ["nom", "insee", "categories", "texte", "monument"].includes(k)), l.nom).toBe(true);
      expect(l.nom).not.toMatch(/\((?:Le|La|Les|L['’])\)$/);
      expect(l.texte ?? "", l.nom).not.toMatch(/ [:;?!]|\s\s|^\.$/);
      // Shops, workshops, markets and chains: professionals, which the site does not list.
      expect(l.categories.some((c) => c !== "Terroir"), l.nom).toBe(true);
    }
    expect(LIEUX.map((l) => l.nom)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^(?:Etc Réunion|Le Forgeron)/)]));
    expect(SOURCE.licence).toBe("Licence Ouverte Etalab");
    expect(toutesLesSources()).toContainEqual(expect.objectContaining({ id: SOURCE.id }));
  });

  it("say which ones are historic monuments: the same name, or a word of their own beside one", () => {
    const monuments = LIEUX.filter((l) => l.monument).map((l) => [l.nom, monumentOf(l)?.nom]);
    expect(monuments).toHaveLength(9);
    expect(monuments).toContainEqual(["Maison Folio", "Villa Folio"]);
    expect(monuments).toContainEqual(["Musée de Villèle", "Domaine de Villèle"]);
    // Less than 150 m from five houses of the old centre, but none of them.
    expect(LIEUX.find((l) => l.nom === "Musée Léon Dierx")?.monument).toBeUndefined();
  });

  it("give a commune's monuments first, then the heritage, then the terroir", () => {
    const list = ofCommune("Saint-Paul");
    expect(list).toHaveLength(11);
    expect(list.slice(0, 2).map((l) => l.nom)).toEqual(["Musée de Villèle", "Villa Rivière"]);
    expect(counts(list)).toEqual([["Patrimoine naturel", 5], ["Patrimoine culturel", 4], ["Patrimoine agricole", 2], ["Patrimoine industriel", 1]]);
  });
});

describe("the short text of a place (resume)", () => {
  it("keeps the first sentence, without the place it gives no one nor the hours", () => {
    // « Le Labyrinthe en Champ Thé », Saint-Joseph.
    expect(resume("Établissement agricole situé en France, spécialisé dans la culture de thé et de géranium odorant pour la production d'huiles essentielles. Propose des visites guidées ou libres.")).toBe(
      "Établissement agricole spécialisé dans la culture de thé et de géranium odorant pour la production d'huiles essentielles.");
    expect(resume("Atelier familial proposant la fabrication traditionnelle de pain et un repas cuit au feu de bois, situé dans un lieu non précisé. Activité encadrée pour 15 à 30 participants, du lundi au samedi.")).toBe(
      "Atelier familial proposant la fabrication traditionnelle de pain et un repas cuit au feu de bois.");
    expect(resume("Kélonia est un centre dédié à la préservation des tortues marines, situé à Saint-Leu (La Réunion). Il combine boutique.")).toBe(
      "Kélonia est un centre dédié à la préservation des tortues marines, situé à Saint-Leu.");
    expect(resume("Musée présentant l'histoire des communautés de La Réunion, ouvert en semaine sur rendez-vous et le mercredi et samedi toute la journée.")).toBe(
      "Musée présentant l'histoire des communautés de La Réunion.");
    expect(resume("Jardin botanique situé à La Réunion présentant une diversité de plantes locales et leurs usages culturels, avec des animations, une boutique et des horaires d'ouverture de 10h à 18h.")).toBe(
      "Jardin botanique présentant une diversité de plantes locales et leurs usages culturels, avec des animations et une boutique.");
  });

  it("gives nothing when it is about hours or bookings, or places it off the island", () => {
    // « Etc Réunion », at Saint-Denis and at Saint-Pierre.
    expect(resume("Horaires d'ouverture d'un établissement du mardi au samedi, avec une pause de midi.")).toBeUndefined();
    expect(resume("Établissement ouvert du mardi au samedi, avec des horaires de 9h à 12h30 et de 14h à 18h, fermé les lundi et dimanche.")).toBeUndefined();
    expect(resume("Établissement accessible sur réservation, ouvert en semaine de 9h30 à 17h30. Accès payant à partir de 12 ans.")).toBeUndefined();
    // « Le Forgeron », Le Tampon.
    expect(resume("Artisan taillandier et ferronnier créant des objets contemporains avec des techniques traditionnelles. Atelier visitable sur réservation à Paris.")).toBeUndefined();
    expect(resume(undefined)).toBeUndefined();
    // But « rue de Paris » is at Saint-Denis.
    expect(resume("Établissement culturel situé rue de Paris à La Réunion, dans une villa historique classée Monument Historique depuis 1990.")).toBeDefined();
  });

  it("leaves no hours, days, bookings nor empty places on any page", () => {
    for (const l of LIEUX) {
      const t = resume(l.texte);
      if (!t) continue;
      expect(t, l.nom).toMatch(/^[^.]+(?:\.[^\sA-ZÀ-Ý][^.]*)*\.$/);
      expect(t, l.nom).not.toMatch(/(?:lun|mar|mercre|jeu|vendre|same|diman)dis?\b|\d+h\d* à \d|non précisée?|en France|Outre-mer|sur (?:réservation|rendez-vous)|horaires/i);
    }
  });
});

describe("the tile « À découvrir »", () => {
  it("names the first places with their text, folds the others, and dates the list", () => {
    const t = tile(page("saint-paul"))!;
    expect(t).toContain('<p class="tv">11 lieux</p>');
    expect(t).toContain("5 patrimoine naturel · 4 patrimoine culturel · 2 patrimoine agricole · 1 patrimoine industriel");
    expect(t).toMatch(/^.*?<ul class="rows lieux cols"><li><span><b>Musée de Villèle<\/b> · monument historique<small>/s);
    expect(t.split("<details")[0].match(/<li>/g)).toHaveLength(DECOUVRIR_SHOWN);
    expect(t).toContain(`<summary>Les ${11 - DECOUVRIR_SHOWN} autres lieux</summary>`);
    expect(t).toContain("Liste du SIT de La Réunion, mise à jour chaque semaine (version du 01/11). Horaires et visites\u00a0: à demander au lieu.");
    expect(t).not.toMatch(/en direct/i);
  });

  it("folds nothing for a commune with few places, and is left out where the list has none", () => {
    const t = tile(page("le-port"))!;
    expect(t).toContain('<p class="tv">2 lieux</p>');
    expect(t).not.toContain("<details");
    expect(page("le-port")).toContain(SOURCE.nom);
    // A place whose text is only about when to come shows its name alone.
    expect(tile(page("saint-philippe"))).toContain("<li><span><b>Vanille 100% Réunion</b></span></li>");
    for (const slug of ["les-trois-bassins", "sainte-marie"]) {
      expect(tile(page(slug)), slug).toBeUndefined();
      expect(page(slug), slug).not.toContain(SOURCE.nom);
    }
  });
});
