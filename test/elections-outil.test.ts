import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { LISTE_DU, OUTILS } from "../src/nouveautes.js";
import { INSEE } from "../src/places/insee.js";
import { electionsAnswer } from "../src/tools/elections.js";
import { textOf } from "../src/providers/avis-eau.js";
import * as elections from "../src/vie/elections.js";
import { electionsPage, electionsPath } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";

const O = "https://rundata.re";
/** A text without its no-break spaces: the tool writes ordinary ones (the server puts them), the page its own. */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const answer = (r: { content: { text: string }[] }) => JSON.parse(plain(r.content[0].text));
/** What a person reads of the commune's elections page (textOf, the site's own reader of a page's text), a space between two cells. */
const pageText = (slug: string) => plain(textOf(electionsPage(O, pageOf(slug)!)!.replace(/</g, " <"))).replace(/\s+/g, " ");
const ask = (lieu?: string, scrutin?: string, annee?: number) => answer(electionsAnswer(lieu, scrutin, annee));

const rpc = (method: string, params: unknown) =>
  new Request(`${O}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
const rpcResult = async (method: string, params: unknown = {}) => (await (await handle(rpc(method, params), new Cache())).json()).result;

describe("the tool elections, the commune's page said to an assistant", () => {
  it("answers a commune with its latest scrutin, the ministry's figures round by round, as its page shows them", () => {
    const r = ask("Saint-Paul");
    expect(r.scrutin.nom).toBe("Municipales 2026");
    expect(r.scrutin.tours.map((t: { tour: string }) => t.tour)).toEqual(["1er tour", "2nd tour"]);
    const first = r.scrutin.tours[0].resultats[0];
    expect(first).toMatchObject({ inscrits: 89425, votants: 45172, abstentions: 44253, abstentions_pourcent_des_inscrits: "49,49 %", blancs: 1066, nuls: 1004, exprimes: 43102 });
    expect(first.lignes).toHaveLength(5);
    expect(first.lignes[1]).toEqual({ panneau: 2, nom: "LISTE CONDUITE PAR EMMANUEL SÉRAPHIN", voix: 20325, pourcent_des_exprimes: "47,16 %" });
    expect(r.scrutin.tours[1].resultats[0].lignes).toHaveLength(2);
    // The same lines and votes as the page, every one of them.
    const page = pageText("saint-paul");
    for (const t of r.scrutin.tours) for (const b of t.resultats) for (const l of b.lignes) {
      // A list the file names with its head: the page writes the head under the name.
      const head = l.tete_de_liste ? ` Tête de liste : ${l.tete_de_liste}` : "";
      expect(page, l.nom).toContain(`${l.nom}${head} ${plain(l.voix.toLocaleString("fr-FR"))} ${l.pourcent_des_exprimes}`);
    }
    expect(page).toContain("Inscrits : 89 425 · votants : 45 172 · abstentions : 44 253, soit 49,49 % des inscrits · blancs : 1 066 · nuls : 1 004 · exprimés : 43 102");
    // Its page, the day of the file as the page says it, and the page's source.
    expect(r.page).toBe(`${O}/communes/saint-paul/elections`);
    expect(r.mis_a_jour).toBe("07/07/2026");
    expect(page).toContain("jeu mis à jour le 07/07/2026");
    expect(r.sources).toEqual([expect.objectContaining({ attribution: "Ministère de l'Intérieur, données agrégées par data.gouv.fr", licence: "Licence Ouverte Etalab 2.0" })]);
  });

  it("opens with the participation of the 1st round, the commune's against the island's, in the words of the commune's page", () => {
    expect(plain(ask("Saint-Paul").resume)).toContain("Municipales 2026, 1er tour : 50,51 % des inscrits ont voté à Saint-Paul, 55,27 % dans toute l'île.");
    // A scrutin asked: its own participation, never the latest's.
    expect(plain(ask("Cilaos", "présidentielle", 2022).resume)).toMatch(/^Présidentielle 2022 à Cilaos, 1er tour : \d\d,\d\d % des inscrits ont voté \(/);
  });

  it("keeps the ministry's order of the panels and ranks nothing: no leader, no winner, no political nuance", () => {
    for (const commune of ["Saint-Paul", "Saint-Denis", "Cilaos"]) {
      const r = ask(commune);
      for (const t of r.scrutin.tours) for (const b of t.resultats) {
        const panneaux = b.lignes.map((l: { panneau: number }) => l.panneau);
        expect(panneaux, commune).toEqual([...panneaux].sort((x: number, y: number) => x - y));
        for (const l of b.lignes) expect(Object.keys(l).sort(), commune).toEqual(expect.arrayContaining(["nom", "pourcent_des_exprimes", "voix"]));
      }
      const around = JSON.stringify({ ...r, scrutin: { nom: r.scrutin.nom } });
      expect(around, commune).not.toMatch(/en tête|\bélue?s?\b|vainqueur|gagn|l'emporte|battu|nuance(?!s politiques ne sont pas reprises)/i);
      expect(plain(r.a_savoir.join(" ")), commune).toContain("Les candidats et les listes sont dans l'ordre des panneaux (N°), celui du ministère, quel que soit le résultat, avec leurs voix et leur % des exprimés. Les nuances politiques ne sont pas reprises.");
    }
    // The second panel got the most votes at Saint-Paul: it still comes second.
    expect(ask("Saint-Paul").scrutin.tours[0].resultats[0].lignes.map((l: { voix: number }) => l.voix).slice(0, 2)).toEqual([4815, 20325]);
  });

  it("answers the scrutin asked by its name and its year, both rounds", () => {
    const r = ask("Cilaos", "présidentielle", 2022);
    expect(r.scrutin.nom).toBe("Présidentielle 2022");
    expect(r.scrutin.tours.map((t: { resultats: { lignes: unknown[] }[] }) => t.resultats[0].lignes.length)).toEqual([12, 2]);
    expect(r.scrutin.tours[0].resultats[0]).toMatchObject({ inscrits: 4980, blancs: 36, exprimes: 2142 });
    expect(r.scrutin.tours[0].resultats[0].lignes[0]).toMatchObject({ panneau: 1, nom: "ARTHAUD Nathalie", voix: 19 });
    expect(r.scrutin.tours[1].resultats[0].lignes[0]).toMatchObject({ nom: "MACRON Emmanuel", voix: 769 });
    // Without accents, in the singular or the plural, the type alone: its newest.
    expect(ask("Cilaos", "presidentielles").scrutin.nom).toBe("Présidentielle 2022");
    expect(ask("Saint-Paul", "Municipales").scrutin.nom).toBe("Municipales 2026");
    expect(ask("Saint-Paul", "élections régionales").scrutin.nom).toBe("Régionales 2021");
  });

  it("gives a commune split between circonscriptions each of them, named as the page names them", () => {
    const r = ask("Saint-Denis", "législatives", 2024);
    expect(r.scrutin.tours[0].resultats.map((b: { partie: string; inscrits: number; lignes: unknown[] }) => [b.partie, b.inscrits, b.lignes.length]))
      .toEqual([["1re circonscription", 88547, 9], ["6e circonscription", 22921, 8]]);
    expect(plain(r.a_savoir.join(" "))).toContain("La commune est partagée entre plusieurs circonscriptions : les résultats sont donnés pour chacune.");
    expect(pageText("saint-denis")).toContain("La commune est partagée entre plusieurs circonscriptions : les résultats sont donnés pour chacune.");
    // Not split, no such note, and no `partie`.
    const whole = ask("Cilaos", "présidentielle", 2022);
    expect(whole.a_savoir.join(" ")).not.toContain("partagée");
    expect(whole.scrutin.tours[0].resultats[0].partie).toBeUndefined();
  });

  it("says what the file does not hold as the page does: no panels before 2010, blancs counted with the nuls up to 2015, half the cantons", () => {
    const old = ask("Saint-Paul", "municipales", 2008);
    expect(old.scrutin.tours[0].resultats[0].lignes[0].panneau).toBeUndefined();
    expect(plain(old.a_savoir.join(" "))).toContain("Sans panneaux dans le fichier (Municipales 2008), les listes sont dans l'ordre alphabétique.");
    const before = ask("Saint-Paul", "municipales", 2014).scrutin.tours[0].resultats[0];
    expect(before.blancs).toBeUndefined();
    expect(before.blancs_et_nuls).toBeGreaterThan(0);
    expect(plain(ask("Saint-Paul", "municipales", 2014).a_savoir.join(" "))).toContain("Jusqu'en 2015, le fichier compte les blancs avec les nuls.");
    expect(ask("Saint-Paul").a_savoir.join(" ")).not.toMatch(/Sans panneaux|Jusqu'en 2015|cantonales/);
    expect(plain(ask("Saint-Paul", "cantonales", 2011).a_savoir.join(" "))).toContain("Aux cantonales, la moitié des cantons votait à chaque fois : seuls les bureaux des cantons qui votaient sont comptés.");
  });

  it("with a year alone, answers its newest scrutin and names the other of that year", () => {
    const r = ask("Saint-Paul", undefined, 2024);
    expect(r.scrutin.nom).toBe("Législatives 2024");
    expect(r.meme_annee).toEqual(["Européennes 2024"]);
    expect(ask("Saint-Paul", "européennes", 2024).scrutin.nom).toBe("Européennes 2024");
    expect(ask("Saint-Paul", "européennes", 2024).meme_annee).toBeUndefined();
  });

  it("lists every scrutin of the commune to ask again, newest first, and invents none", () => {
    const r = ask("Saint-Paul");
    expect(r.scrutins_disponibles).toEqual(elections.ofCommune("Saint-Paul").map((s) => s.nom));
    expect(r.scrutins_disponibles.slice(0, 3)).toEqual(["Municipales 2026", "Législatives 2024", "Européennes 2024"]);
    // A scrutin before the file, or one that does not exist: said, with what the file has, and no figure.
    for (const [quoi, annee] of [["municipales", 1995], ["présidentielle", 2024], ["référendum", undefined]] as const) {
      const none = ask("Saint-Paul", quoi, annee);
      expect(none.scrutin, quoi).toBeUndefined();
      expect(plain(none.resume), quoi).toMatch(/^Aucun scrutin .* à Saint-Paul dans le jeu de données du ministère de l'Intérieur, qui commence en 1999\./);
      expect(none.scrutins_disponibles, quoi).toHaveLength(30);
      expect(none.page, quoi).toBe(`${O}/communes/saint-paul/elections`);
    }
  });

  it("asks for a commune when none is given, and says a place it does not know", () => {
    const r = ask();
    expect(r.scrutin).toBeUndefined();
    expect(plain(r.resume)).toMatch(/^Résultats des élections commune par commune depuis 1999, tels que le ministère de l'Intérieur les publie .* Donner une commune\.$/);
    expect(r.page).toBe(`${O}/communes`);
    const nowhere = electionsAnswer("Zzyzx");
    expect(nowhere.isError).toBe(true);
    // A place of a commune: its commune's scrutins.
    expect(ask("Saint-Gilles-les-Bains").page).toBe(`${O}/communes/saint-paul/elections`);
  });

  it("answers each of the 24 communes and each of their scrutins with their page, light enough for an assistant", () => {
    let largest = 0;
    for (const commune of Object.keys(INSEE)) {
      const p = [...new Set([pageOf(commune.toLowerCase())])].find(Boolean);
      const r = ask(commune);
      expect(r.scrutin?.nom, commune).toBe(elections.ofCommune(commune)[0]!.nom);
      expect(r.page.startsWith(`${O}/communes/`) && r.page.endsWith("/elections"), commune).toBe(true);
      if (p) expect(r.page).toBe(`${O}${electionsPath(p)}`);
      for (const s of elections.ofCommune(commune)) {
        const one = electionsAnswer(commune, elections.TYPES[s.type].nom, s.annee);
        expect(answer(one).scrutin?.nom, `${commune} ${s.nom}`).toBe(s.nom);
        largest = Math.max(largest, new TextEncoder().encode(one.content[0].text).length);
      }
    }
    // The largest answer of the 24 communes' scrutins (a commune split between cantons, both rounds): what an assistant
    // takes in its context for one question.
    expect(largest).toBeLessThanOrEqual(12_000);
    expect(largest).toBeGreaterThan(3_000);
  });
});

describe("the tool elections on the server", () => {
  it("is listed, read-only, newest of the tools, and the list is dated the day it changed", async () => {
    const tools: { name: string; description: string; annotations: { readOnlyHint?: boolean } }[] = (await rpcResult("tools/list")).tools;
    const t = tools.find((x) => x.name === "elections")!;
    expect(t.annotations.readOnlyHint).toBe(true);
    expect(t.description).toContain("ministère de l'Intérieur");
    expect(OUTILS[0]).toMatchObject({ nom: "elections" });
    expect(Date.parse(`${LISTE_DU}T00:00:00+04:00`)).toBeGreaterThanOrEqual(Date.parse(OUTILS[0]!.depuis.slice(0, 10) + "T00:00:00+04:00"));
  });

  it("answers through /mcp with what to cite: the ministry, the commune's elections page, the day of the file", async () => {
    const r = await rpcResult("tools/call", { name: "elections", arguments: { lieu: "Saint-Paul" } });
    expect(r.isError).toBeFalsy();
    const b = JSON.parse(plain(r.content[0].text));
    expect(b.scrutin.nom).toBe("Municipales 2026");
    expect(b.lien).toBe(`${O}/communes/saint-paul/elections?ref=mcp`);
    expect(b.citer).toContain("Ministère de l'Intérieur");
    expect(JSON.stringify(b.fraicheur)).toContain("07/07/2026");
    // Listed by sources_donnees with the other tools.
    const s = JSON.parse((await rpcResult("tools/call", { name: "sources_donnees", arguments: {} })).content[0].text);
    expect(Object.keys(s.outils)).toContain("elections");
  });
});
