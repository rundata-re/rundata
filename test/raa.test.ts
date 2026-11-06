import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as raa from "../src/providers/raa.js";
import { actualites, RAA_A_SAVOIR } from "../src/tools/actualites.js";
import { couverture, ecarte, ecrire, FILTRES, garder, parseListe, parseRecueil, prenoms, suite, vusAssez, vusPage1, vusSuivante } from "../scripts/raa-lire.js";

// Every title and name here is made up: no act of a real recueil, no real person.
const NOW = new Date("2026-11-03T08:00:00Z");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const noms = prenoms();

const card = (lien: string, titre: string, publie: string) =>
  `<div class="fr-card__content"><h2 class="fr-card__title"><a class="fr-card__link" href="${lien}">\n  ${titre}\n</a></h2><div class="fr-card__end"><p class="fr-card__detail">Publié le ${publie}</p></div></div>`;
const LISTE = `<main>${card("/Publications/RAA/Recueil-des-actes-administratifs-2027/Special-n-3-du-04-janvier-2027", "Spécial n° 3 du 04 janvier 2027", "05/01/2027")}${card("/Publications/RAA/Recueil-des-actes-administratifs-2027/DECEMBRE", "DÉCEMBRE", "02/01/2027")}</main>`;

const pdf = (fichier: string, texte = fichier) =>
  `<div class=""><a id=x class="fr-link fr-link--download" href="/contenu/telechargement/1/2/file/${fichier}.pdf" target="_blank">\n  Télécharger ${texte}\n  <span class="fr-link__detail">PDF - 0,08 Mb - 04/01/2027</span>\n</a></div>`;
const RECUEIL = `<h1>Spécial n° 3 du 04 janvier 2027</h1><div class="fr-text--lead">RECUEIL DES ACTES ADMINISTRATIFS</div>` +
  `<p class=" text-left"><b>CABINET</b></p><p><b>30 décembre</b></p>` +
  pdf("Arrêté portant délégation de signature à Mme Zorglub _") +
  pdf("Arrêté réglementant la circulation rue de la Source à Saint-Denis _") +
  `<p class=" text-left"><b>DIRECTION DE LA MER</b></p><p><b>4 janvier</b></p>` +
  pdf("Arrêté de balisage du port de Saint-Gilles", `Arrêté de balisage du port de Saint-Gilles    <a class="fr-link" href="/Outils/Glossaire">ZMEL</a>\n<span class="fr-tooltip fr-placement" role="tooltip">Zone de mouillage</span>`) +
  pdf("Arrêté portant composition du conseil") +
  `<p><b>PRÉFECTURE DE LA RÉUNION</b></p></div><div class="fr-col-12 fr-col-md-4"><a class="fr-link fr-link--download" href="/x.pdf">Télécharger Autre <span class="fr-link__detail"></span></a>`;

describe("the prefecture's recueil des actes administratifs", () => {
  it("reads the year's list: each recueil's title, number, day and page", () => {
    expect(parseListe(LISTE)).toEqual([
      { titre: "Spécial n° 3 du 04 janvier 2027", numero: 3, date: "2027-01-04", lien: "https://www.reunion.gouv.fr/Publications/RAA/Recueil-des-actes-administratifs-2027/Special-n-3-du-04-janvier-2027" },
      // A monthly recueil, without a number: the day it was published.
      { titre: "DÉCEMBRE", numero: undefined, date: "2027-01-02", lien: "https://www.reunion.gouv.fr/Publications/RAA/Recueil-des-actes-administratifs-2027/DECEMBRE" },
    ]);
  });

  it("reads a recueil's acts under their service and day, without « Télécharger », the tooltips or the trailing « _ »", () => {
    const lus = parseRecueil(RECUEIL, { date: "2027-01-04" });
    expect(lus.map((a) => [a.titre, a.service, a.date])).toEqual([
      ["Arrêté portant délégation de signature à Mme Zorglub", "CABINET", "2026-12-30"],
      ["Arrêté réglementant la circulation rue de la Source à Saint-Denis", "CABINET", "2026-12-30"],
      ["Arrêté de balisage du port de Saint-Gilles ZMEL", "DIRECTION DE LA MER", "2027-01-04"],
      ["Arrêté portant composition du conseil", "DIRECTION DE LA MER", "2027-01-04"],
    ]);
    expect(lus[1].pdf).toBe("https://www.reunion.gouv.fr/contenu/telechargement/1/2/file/Arr%C3%AAt%C3%A9%20r%C3%A9glementant%20la%20circulation%20rue%20de%20la%20Source%20%C3%A0%20Saint-Denis%20_.pdf");
  });

  it("leaves out every title that may name a person or aim at one, by the filter the measure gives", () => {
    const out = (t: string) => ecarte(t, noms);
    expect(out("Arrêté autorisant M. Zorglub à exploiter un débit de boissons")).toBe("civilité");
    expect(out("Arrêté portant délégation de signature au directeur")).toBe("mots qui visent une personne");
    expect(out("arrete_subdelegation_signature_2027")).toBe("mots qui visent une personne");
    expect(out("Arrêté accordant une récompense pour actes de courage et de dévouement")).toBe("mots qui visent une personne");
    expect(out("Récépissé de déclaration n° SAP123456789")).toBe("services à la personne");
    expect(out("Arrêté portant mise en demeure de la société Exemple")).toBe("sanction d'un établissement");
    expect(out("Arrêté portant composition nominative de la commission")).toBe("composition nominative");
    expect(out("Arrêté autorisant Kevin Zorblat à organiser une course")).toBe("prénom");
    expect(out("Arrêté de tarification 2027 du CER de ZORBLAT")).toBe("tarification d'un établissement");
    expect(out("AP 12")).toBe("moins de 3 mots");
    expect(out("AP_12")).toBe("moins de 3 mots");
    expect(FILTRES.map((f) => f.nom)).toHaveLength(8);
  });

  it("keeps the titles of places and things named after someone, and of saints", () => {
    for (const t of [
      "Arrêté réglementant la circulation à Sainte-Marie pendant la fête",
      "Arrêté relatif à l'aéroport Roland Garros",
      "Arrêté portant fermeture de la route forestière du Maïdo",
      "Arrêté portant composition du conseil",
    ]) expect(ecarte(t, noms), t).toBeUndefined();
  });

  it("keeps only what passes the filters and names a place, each act once", () => {
    const r = parseListe(LISTE)[0];
    const lus = parseRecueil(RECUEIL, r);
    const { ajoutes, gardes } = garder(lus, r, noms, []);
    expect(gardes).toBe(3);
    expect(ajoutes.map((a) => [a.titre, a.communes, a.lieux])).toEqual([
      ["Arrêté réglementant la circulation rue de la Source à Saint-Denis", ["Saint-Denis"], []],
      ["Arrêté de balisage du port de Saint-Gilles ZMEL", ["Saint-Paul"], ["Saint-Gilles"]],
    ]);
    // What a filter leaves out is in nothing that is stored.
    expect(JSON.stringify(ajoutes)).not.toMatch(/Zorglub/);
    expect(ajoutes[0].recueil).toEqual({ numero: 3, date: "2027-01-04", lien: r.lien });
    // Read again (a monthly recueil listing them anew): not added twice.
    expect(garder(lus, r, noms, ajoutes).ajoutes).toEqual([]);
  });
});

describe("what the recueils read cover", () => {
  const r = (n: number, date: string): raa.Recueil => ({ titre: `Spécial n° ${n}`, numero: n, date, lien: `https://www.reunion.gouv.fr/${n}` });
  const lus = (...n: number[]) => new Set(n.map((k) => `https://www.reunion.gouv.fr/${k}`));
  // The 15 days from 19/10; the list, newest first, 3 recueils a page.
  const SINCE = "2026-10-19";
  const page1 = [r(5, "2026-11-03"), r(4, "2026-11-01"), r(3, "2026-10-28")];
  const page2 = [r(2, "2026-10-22"), r(1, "2026-10-15"), r(0, "2026-10-12")];

  it("reads the next pages of the list, then writes nothing to the store, until the recueils seen go back 15 days and are all read", () => {
    const vus1 = vusPage1(undefined, page1, true, SINCE);
    expect(vusAssez(vus1, SINCE)).toBe(false);
    const vus = vusSuivante(vus1, page2, true, SINCE);
    expect(vusAssez(vus, SINCE)).toBe(true);
    expect(vus.connus.map((x) => x.numero)).toEqual([5, 4, 3, 2]);
    // Page 1 alone read, all its recueils read: not yet.
    expect(ecrire(false, couverture(vus1, lus(5, 4, 3), SINCE))).toBe(false);
    const debut = couverture(vus, lus(5, 4, 3), SINCE);
    expect(debut.a_lire.map((x) => x.numero)).toEqual([2]);
    expect(ecrire(false, debut)).toBe(false);
    const fin = couverture(vus, lus(5, 4, 3, 2), SINCE);
    expect(fin).toEqual({ a_lire: [], lus_depuis: undefined, publiable: true, complet: true });
    expect(ecrire(false, fin)).toBe(true);
  });

  it("once the state covers the 15 days, reads page 1 only, though it holds fewer days, and says the 15 days", () => {
    const etat = { connus: [...page1, page2[0]], vu_jusqua: "2026-10-15" };
    // A new recueil: page 1 holds 3 of them, back to 01/11, and has a next page.
    const vus = vusPage1(etat, [r(6, "2026-11-04"), ...page1.slice(0, 2)], true, SINCE);
    expect(vusAssez(vus, SINCE)).toBe(true);
    const c = couverture(vus, lus(6, 5, 4, 3, 2), SINCE);
    expect(c.lus_depuis).toBeUndefined();
    expect(c.complet).toBe(true);
  });

  it("says since when the recueils are read without a gap once it lags again, and writes nothing while the newest is unread", () => {
    const vus = vusSuivante(vusPage1(undefined, page1, true, SINCE), page2, true, SINCE);
    // The site silent for hours: the 3 newest read again, n° 2 left to read.
    const retard = couverture(vus, lus(5, 4, 3), SINCE);
    expect(retard.lus_depuis).toBe("2026-10-28");
    expect(ecrire(true, retard)).toBe(true);
    expect(ecrire(true, couverture(vus, lus(4, 3, 2), SINCE))).toBe(false);
    // More published since the last run than page 1 holds: the pages between are read again.
    const saut = vusPage1(vus, [r(9, "2026-11-08"), r(8, "2026-11-07"), r(7, "2026-11-06")], true, SINCE);
    expect(saut).toEqual({ connus: [r(9, "2026-11-08"), r(8, "2026-11-07"), r(7, "2026-11-06")], vu_jusqua: "2026-11-06" });
    expect(vusAssez(saut, SINCE)).toBe(false);
  });

  it("follows the list's next page by its link", () => {
    expect(suite('<a id=x class="fr-pagination__link fr-pagination__link--next fr-pagination__link--lg-label" href="/RAA/Recueil-des-actes-administratifs-2026/(offset)/10">')).toBe("https://www.reunion.gouv.fr/RAA/Recueil-des-actes-administratifs-2026/(offset)/10");
    expect(suite('<a id=x class="fr-pagination__link fr-pagination__link--next">')).toBeUndefined();
  });
});

describe("the acts in the news of a place", () => {
  const acte = (titre: string, communes: string[], date: string): raa.Acte => ({
    titre, service: "CABINET", date, recueil: { numero: 7, date, lien: "https://www.reunion.gouv.fr/r" }, pdf: `https://www.reunion.gouv.fr/${titre.length}.pdf`, communes, lieux: [],
  });
  const stored: raa.Copie = {
    actes: [
      acte("Arrêté réglementant la circulation pendant le carnaval de Saint-Denis", ["Saint-Denis"], "2026-11-02"),
      acte("Arrêté portant fermeture du marché de Saint-Pierre", ["Saint-Pierre"], "2026-11-02"),
      // Older than 15 days: not given.
      acte("Arrêté relatif à la fête de Saint-Denis", ["Saint-Denis"], "2026-10-10"),
    ],
    recueils: [{ titre: "Spécial n° 7 du 02 novembre 2026", numero: 7, date: "2026-11-02", lien: "https://www.reunion.gouv.fr/r", actes: 12, gardes: 9 }],
    lu_le: "2026-11-03T07:10:00Z",
  };
  let reads: number;
  beforeEach(() => {
    reads = 0;
    // The media of test/actualites.test.ts, which name none of these acts.
    const fixture = (f: string) => readFileSync(new URL(`./fixtures/actualites/${f}`, import.meta.url), "utf8");
    vi.stubGlobal("fetch", async (url: string) => {
      const host = new URL(url).hostname;
      const f = host === "www.clicanoo.re" ? "clicanoo.xml" : host === "freedom.fr" ? "freedom.xml" : undefined;
      return f ? new Response(fixture(f)) : new Response("", { status: 503 });
    });
    raa.configure(async () => (reads++, stored));
  });
  afterEach(() => {
    raa.configure(undefined);
    vi.unstubAllGlobals();
  });

  it("gives the acts of the last 15 days that name the commune, with their recueil and PDF, and the store is read once", async () => {
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const b = body(await actualites(c, "Saint-Denis", undefined, undefined, NOW));
    expect(b.arretes_prefecture.actes).toEqual([{
      titre: "Arrêté réglementant la circulation pendant le carnaval de Saint-Denis", service: "CABINET", date: "2026-11-02",
      recueil: "recueil n° 7 du 02/11/2026", lien_recueil: "https://www.reunion.gouv.fr/r", pdf: stored.actes[0].pdf,
    }]);
    expect(b.arretes_prefecture.a_savoir).toBe(RAA_A_SAVOIR);
    expect(b.resume).toContain("Au recueil des actes administratifs de la préfecture, 1 acte des 15 derniers jours nomme Saint-Denis : « Arrêté réglementant la circulation pendant le carnaval de Saint-Denis » (recueil n° 7 du 02/11/2026).");
    expect(b.sources.map((s: { source: string }) => s.source)).toContain(raa.SOURCE.nom);
    await actualites(c, "Le Tampon", undefined, undefined, NOW);
    expect(reads).toBe(1);
  });

  it("says the commune's acts as the commune's for a place inside it, and the place only for those that name it", async () => {
    // Plage de l'Ermitage, 06/11/2026: « 2 actes nomment Plage de l'Ermitage-les-Bains » for an act on Mafate.
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const b = body(await actualites(c, "La Montagne", undefined, undefined, NOW));
    expect(b.resume).toContain("1 acte des 15 derniers jours nomme Saint-Denis, la commune de La Montagne\u00a0: « Arrêté réglementant la circulation pendant le carnaval de Saint-Denis »");
    raa.configure(async () => ({ ...stored, actes: [...stored.actes, { ...stored.actes[0], titre: "Arrêté portant fermeture de la route de La Montagne", lieux: ["La Montagne"] }] }));
    const both = body(await actualites(new Cache(new MemoryStore(), () => NOW.getTime()), "La Montagne", undefined, undefined, NOW));
    expect(both.resume).toContain("2 actes des 15 derniers jours nomment Saint-Denis, la commune de La Montagne, dont 1 qui nomme La Montagne\u00a0:");
    raa.configure(async () => ({ ...stored, actes: [{ ...stored.actes[0], titre: "Arrêté portant fermeture de la route de La Montagne", communes: [], lieux: ["La Montagne"] }] }));
    const own = body(await actualites(new Cache(new MemoryStore(), () => NOW.getTime()), "La Montagne", undefined, undefined, NOW));
    expect(own.resume).toContain("1 acte des 15 derniers jours nomme La Montagne (Saint-Denis)\u00a0:");
  });

  it("says that none names the place, and never reads the store for the whole island", async () => {
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const b = body(await actualites(c, "Le Tampon", undefined, undefined, NOW));
    expect(b.arretes_prefecture).toMatchObject({ aucun: "Aucun titre des recueils des 15 derniers jours ne nomme Le Tampon.", dernier_recueil_lu: "Spécial n° 7 du 02 novembre 2026" });
    expect(b.arretes_prefecture.actes).toBeUndefined();
    const ile = body(await actualites(new Cache(new MemoryStore(), () => NOW.getTime()), undefined, undefined, undefined, NOW));
    expect(ile.arretes_prefecture).toBeUndefined();
    expect(reads).toBe(1);
  });

  it("says the acts and their absence of the recueils read since a day, when they do not cover the 15 days", async () => {
    raa.configure(async () => ({ ...stored, lus_depuis: "2026-10-24" }));
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const b = body(await actualites(c, "Saint-Denis", undefined, undefined, NOW));
    expect(b.resume).toContain("1 acte des recueils lus depuis le 24/10 nomme Saint-Denis\u00a0:");
    expect(b.arretes_prefecture.recueils_lus_depuis).toBe("2026-10-24");
    const t = body(await actualites(c, "Le Tampon", undefined, undefined, NOW));
    expect(t.arretes_prefecture.aucun).toBe("Aucun titre des recueils lus depuis le 24/10 ne nomme Le Tampon.");
  });

  it("is not given where nothing is configured (a local server)", async () => {
    raa.configure(undefined);
    const b = body(await actualites(new Cache(new MemoryStore(), () => NOW.getTime()), "Saint-Denis", undefined, undefined, NOW));
    expect(b.arretes_prefecture).toBeUndefined();
    expect(JSON.stringify(b.sources)).not.toContain(raa.SOURCE.nom);
    expect(b.sources.length).toBeGreaterThan(0);
  });
});

it("ships the derived list of first names only, with its source, licence and threshold", () => {
  const text = readFileSync(new URL("../scripts/raa-prenoms.txt", import.meta.url), "utf8");
  expect(text).toMatch(/^# .*\n# Source : Insee, Fichier des prénoms .*Licence Ouverte\.\n# Seuil : 2000 naissances\./);
  expect(noms.size).toBe(2169);
});
