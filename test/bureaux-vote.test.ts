import { describe, expect, it } from "vitest";
import { INSEE } from "../src/places/insee.js";
import { electionsAnswer } from "../src/tools/elections.js";
import * as bv from "../src/vie/bureaux-vote.js";
import data from "../src/vie/bureaux-vote.json" with { type: "json" };
import { electionsPage } from "../src/web/commune.js";
import { pageOf } from "../src/web/places.js";

const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const flat = (s: string) => s.replaceAll(" ", " ");

describe("the polling stations (vie/bureaux-vote.ts)", () => {
  it("are the Insee's of September 2022, 929 bureaux in 435 places across the 24 communes", () => {
    expect(Object.keys(data.communes).sort()).toEqual(Object.values(INSEE).sort());
    const all = Object.keys(INSEE).flatMap((c) => bv.lieuxDe(c));
    expect(all).toHaveLength(435);
    expect(bv.nombreDe(all)).toBe(929);
    expect(bv.nombreDe(bv.lieuxDe("Saint-Denis"))).toBe(133);
    expect(bv.EXTRACTION).toBe("septembre 2022");
    expect(bv.A_SAVOIR).toContain("d'avant les municipales de 2026");
  });

  it("hold a place, its address and its bureaux' numbers only: nothing of an elector", () => {
    for (const c of Object.values(data.communes)) for (const l of c) expect(["adresse", "bureaux", "lieu"]).toEqual(expect.arrayContaining(Object.keys(l)));
    expect(JSON.stringify(data.communes)).not.toMatch(/electeur|électeur|nb_adresses|id_brut/i);
  });

  it("leave out a name that only repeats the bureau's number (« bureau 1 », « 1er bureau », « 10eme bureau »)", () => {
    const sp = bv.lieuxDe("Saint-Pierre");
    expect(sp[0]).toEqual({ adresse: "SALLE D'ACCUEIL DE L'HOTEL DE VILLE, 97410 saint pierre", bureaux: ["1"] });
    // Le Port and Cilaos name each bureau by its rank only.
    const numberOnly = /^(?:\d+\s*(?:er|ère|ere|e|ème|eme|nd|nde)\s+)?(?:bureau|bv)(?:\s+de\s+vote)?\s*(?:n°\s*)?\d*$/i;
    for (const c of Object.keys(INSEE)) expect(bv.lieuxDe(c).filter((l) => numberOnly.test(l.lieu ?? "")).map((l) => l.lieu), c).toEqual([]);
    expect(bv.lieuxDe("Le Port").find((l) => l.bureaux.includes("10"))).not.toHaveProperty("lieu");
  });

  it("say consecutive numbers as a span", () => {
    expect(bv.numeros(["4"])).toBe("bureau 4");
    expect(bv.numeros(["1", "2", "3", "4", "5", "6"])).toBe("bureaux 1 à 6");
    expect(bv.numeros(["2", "3", "73", "87"])).toBe("bureaux 2, 3, 73 et 87");
    expect(bv.numeros(["7", "8", "9", "12"])).toBe("bureaux 7 à 9 et 12");
  });
});

describe("the commune's elections page and the tool", () => {
  const sd = bv.lieuxDe("Saint-Denis");

  it("list the places on /communes/<commune>/elections, folded, with the date sentence and how to find one's own bureau", () => {
    const page = flat(electionsPage("https://rundata.re", pageOf("saint-denis")!)!);
    expect(page).toContain('<section id="bureaux"');
    expect(page).toContain(`<summary>133 bureaux de vote dans 31 lieux</summary>`);
    expect(page).toContain("<b>Hotel de ville</b> · bureaux 1 à 6<small>1 RUE PASTEUR, 97400 saint denis</small>");
    expect(page).toContain("d&#39;avant les municipales de 2026");
    expect(page).toContain(`href="${bv.ISE}"`);
    // The source and its licence, in the section's own line of sources.
    expect(page).toContain('<p class="sources">Source : Insee, d&#39;après le Répertoire électoral unique (Licence Ouverte Etalab 2.0).</p>');
  });

  it("give them when the question is where to vote, never which one is someone's", () => {
    const r = body(electionsAnswer("Saint-Denis", "bureaux de vote"));
    expect(r.resume).toBe("133 bureaux de vote à Saint-Denis, dans 31 lieux, d'après l'Insee (septembre 2022).");
    expect(r.bureaux_de_vote.lieux).toHaveLength(31);
    expect(r.bureaux_de_vote.lieux[0]).toEqual({ lieu: "Hotel de ville", adresse: sd[0].adresse, bureaux: "bureaux 1 à 6" });
    expect(r.a_savoir).toEqual([bv.A_SAVOIR, bv.SON_BUREAU, expect.stringContaining("ne dit pas quel est le bureau")]);
    expect(r.son_bureau).toBe(bv.ISE);
    expect(r.page).toBe("https://rundata.re/communes/saint-denis/elections#bureaux");
    expect(r.sources.map((s: { source: string }) => s.source)).toEqual(["Bureaux de vote et adresses de leurs électeurs"]);
    expect(r.scrutin).toBeUndefined();
    for (const q of ["où voter", "lieux de vote", "Bureau de vote"]) expect(body(electionsAnswer("Saint-Denis", q)).bureaux_de_vote, q).toBeDefined();
  });

  it("say in one line, with the results, that the list is there", () => {
    const r = body(electionsAnswer("Saint-Denis"));
    expect(r.scrutin).toBeDefined();
    expect(r.bureaux_de_vote).toBe("133 bureaux de vote dans 31 lieux : leur liste avec scrutin « bureaux de vote ».");
  });
});
