import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryStore } from "../src/cache.js";
import * as raa from "../src/providers/raa.js";
import { actualites, RAA_A_SAVOIR } from "../src/tools/actualites.js";
import { ecarte, FILTRES, garder, parseListe, parseRecueil, prenoms } from "../scripts/raa-lire.js";

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
      const f = url.includes("clicanoo") ? "clicanoo.xml" : url.includes("freedom") ? "freedom.xml" : undefined;
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

  it("says that none names the place, and never reads the store for the whole island", async () => {
    const c = new Cache(new MemoryStore(), () => NOW.getTime());
    const b = body(await actualites(c, "Le Tampon", undefined, undefined, NOW));
    expect(b.arretes_prefecture).toMatchObject({ aucun: "Aucun titre des recueils des 15 derniers jours ne nomme Le Tampon.", dernier_recueil_lu: "Spécial n° 7 du 02 novembre 2026" });
    expect(b.arretes_prefecture.actes).toBeUndefined();
    const ile = body(await actualites(new Cache(new MemoryStore(), () => NOW.getTime()), undefined, undefined, undefined, NOW));
    expect(ile.arretes_prefecture).toBeUndefined();
    expect(reads).toBe(1);
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
