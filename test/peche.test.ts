import { describe, expect, it } from "vitest";
import { sun } from "../src/providers/calendrier.js";
import { resolvePlace } from "../src/places/resolve.js";
import {
  CARTE_BICHIQUES, especesDuJour, heuresBichiques, INTERDITS, LAGONS, pecheLoisir, PDF_1743, PDF_BICHIQUES, SAISONS_BICHIQUES, TAILLES,
} from "../src/tools/peche.js";
import { lien } from "../src/tools/citer.js";
import { pechePage, TITLE } from "../src/web/peche.js";
import { seaPage } from "../src/web/pages.js";

const O = "https://rundata.re";
const NOW = new Date("2026-10-31T12:00:00Z");
const answer = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const state = (day: string, cle: string) => especesDuJour(day).find((e) => e.cle === cle)!;

describe("the rules of recreational fishing, day by day", () => {
  it("closes the spiny lobster from the 1st of December to the 31st of March, both included, and says only that otherwise", () => {
    expect(state("2026-11-30", "langouste")).toMatchObject({ ferme: false, etat: "Pas de fermeture aujourd'hui" });
    expect(state("2026-12-01", "langouste")).toMatchObject({ ferme: true, etat: "Fermée aujourd'hui" });
    expect(state("2027-03-31", "langouste").ferme).toBe(true);
    expect(state("2027-04-01", "langouste").ferme).toBe(false);
    expect(state("2026-12-01", "langouste").regles).toContain("l'arrêté interdit aussi de la saler, de la transporter et de l'employer");
  });

  it("closes the marbled eel in February and March", () => {
    expect(state("2027-01-31", "anguille").etat).toBe("Pas de fermeture aujourd'hui");
    expect(state("2027-02-01", "anguille").etat).toBe("Fermée aujourd'hui");
    expect(state("2027-03-31", "anguille").ferme).toBe(true);
    expect(state("2027-04-01", "anguille").ferme).toBe(false);
  });

  it("opens the capucin nain from February to April, on Friday, Saturday and Sunday only, from 5 to 9", () => {
    expect(state("2026-10-31", "capucin")).toMatchObject({ ferme: true, etat: "Fermé aujourd'hui" });
    // Friday 5 and Sunday 7 February 2027; Monday 8, closed.
    expect(state("2027-02-05", "capucin")).toMatchObject({ ferme: false, etat: "Saison ouverte", heures: "de 5 h à 9 h" });
    expect(state("2027-02-07", "capucin").ferme).toBe(false);
    expect(state("2027-02-08", "capucin")).toMatchObject({ ferme: true, etat: "Fermé aujourd'hui" });
    expect(state("2027-04-30", "capucin").ferme).toBe(false);
    expect(state("2027-05-01", "capucin").ferme).toBe(true);
  });

  it("opens the bichiques for the decree's five seasons, both days included, and closes them between", () => {
    expect(SAISONS_BICHIQUES).toHaveLength(5);
    expect(state("2026-08-27", "bichiques")).toMatchObject({ ferme: true, etat: "Fermée aujourd'hui" });
    expect(state("2026-08-27", "bichiques").regles).toContain("Prochaine saison du 28 août 2026 au 21 février 2027.");
    expect(state("2026-08-28", "bichiques")).toMatchObject({ ferme: false, etat: "Saison ouverte" });
    expect(state("2027-02-21", "bichiques").ferme).toBe(false);
    expect(state("2027-02-22", "bichiques").regles).toMatch(/^Prochaine saison du 16 septembre 2027 au 11 mars 2028\. Hors saison, l'arrêté interdit de les pêcher, de les détenir, de les transporter, de les vendre et de les acheter\.$/);
    expect(state("2031-03-10", "bichiques").regles).toContain("L'arrêté ne fixe aucune saison après le 9 mars 2031.");
  });

  it("gives the bichiques' hours from half an hour before sunrise to half an hour after sunset at Saint-Denis, never wider", () => {
    const sd = resolvePlace("Saint-Denis")!.lieu;
    for (const day of ["2026-10-31", "2026-12-21", "2027-02-21", "2027-06-21"]) {
      const s = sun(day, sd.lon, sd.lat);
      const h = heuresBichiques(day);
      const at = (hm: string) => Date.parse(`${day}T${hm}:00+04:00`);
      expect(at(h.debut)).toBeGreaterThanOrEqual(s.lever.getTime() - 30 * 60_000);
      expect(at(h.debut) - (s.lever.getTime() - 30 * 60_000)).toBeLessThan(60_000);
      expect(at(h.fin)).toBeLessThanOrEqual(s.coucher.getTime() + 30 * 60_000);
      expect(s.coucher.getTime() + 30 * 60_000 - at(h.fin)).toBeLessThan(60_000);
    }
    expect(heuresBichiques("2026-10-31")).toEqual({ debut: "05:07", fin: "18:57" });
    expect(state("2026-10-31", "bichiques").regles).toContain("aujourd'hui de 05:07 à 18:57 (une demi-heure avant le lever du soleil et après son coucher, calculés pour Saint-Denis), 2 vouves au plus, 3 kg par jour.");
  });

  it("never says « autorisé », nor links the repealed decree of 2021", () => {
    const all = [pechePage(O, undefined, NOW), JSON.stringify(answer(pecheLoisir(undefined, undefined, NOW)))];
    for (const day of ["2026-12-01", "2027-02-05", "2027-03-01", "2031-06-01"]) all.push(JSON.stringify(answer(pecheLoisir(undefined, day, NOW))));
    for (const t of all) {
      expect(t).not.toMatch(/autoris/i);
      expect(t).not.toContain("2687");
      expect(t).not.toContain("9ace21");
    }
    expect(CARTE_BICHIQUES).toBe("https://macarte.ign.fr/carte/9ace2I/Zones-de-peche-des-bichiques/");
  });
});

describe("the tool peche_loisir", () => {
  it("says the day's state of each species with its decree, article and link, and the general rules", () => {
    const r = answer(pecheLoisir(undefined, undefined, NOW));
    expect(r.resume).toBe(
      "Pêche de loisir à La Réunion aujourd'hui, samedi 31 octobre 2026, d'après les arrêtés du préfet : langouste, pas de fermeture aujourd'hui ; " +
        "bichiques, saison ouverte (de 05:07 à 18:57) ; capucin nain, fermé aujourd'hui ; anguille marbrée, pas de fermeture aujourd'hui.",
    );
    expect(r.especes.map((e: { espece: string }) => e.espece)).toEqual(["Langouste", "Bichiques", "Capucin nain", "Anguille marbrée"]);
    expect(r.especes[0]).toMatchObject({ texte: "d'après l'arrêté n° 1743 du 15 juillet 2008, version consolidée par la DMSOI au 1/1/2023, art. 8 et 11", lien: PDF_1743 });
    expect(r.especes[1].lien).toBe(PDF_BICHIQUES);
    expect(r.tailles_et_quantites).toHaveLength(TAILLES.length);
    expect(r.interdits).toHaveLength(INTERDITS.length);
    expect(r.lagons.regle).toBe(LAGONS);
    expect(r.a_savoir).toContain("seul leur texte fait foi");
    expect(r.derniere_verification).toBe("31/10/2026");
    // The states as written, never « permis » by deduction; the page /peche cited with them.
    expect(r.comment_le_dire).toContain("sans en faire un « c'est permis »");
    expect(lien("peche_loisir", r)).toBe("https://rundata.re/peche?ref=mcp");
    expect(r.sources.map((s: { source: string }) => s.source)).toEqual([
      "Arrêté n° 1743 du 15 juillet 2008 sur la pêche maritime de loisir (DMSOI)",
      "Arrêté n° 2026-1319 du 17 août 2026 sur la pêche des bichiques (DEAL)",
    ]);
  });

  it("answers for one species, another day, and says what it does not cover", () => {
    const one = answer(pecheLoisir("Les bichiques", "2027-03-01", NOW));
    expect(one.especes).toHaveLength(1);
    expect(one.resume).toBe("Pêche de loisir à La Réunion le lundi 1er mars 2027, d'après les arrêtés du préfet : bichiques, fermée ce jour-là.");
    expect(answer(pecheLoisir("langouste", "2026-12-24", NOW)).especes[0].etat).toBe("Fermée ce jour-là");
    const other = answer(pecheLoisir("zourite", undefined, NOW));
    expect(other.especes).toHaveLength(4);
    expect(other.resume).toContain("« zourite » n'a pas de règle propre dans ce résumé");
  });

  it("refuses a date it cannot read", () => {
    const r = pecheLoisir(undefined, "2026-02-30", NOW);
    expect(r).toMatchObject({ isError: true });
    expect(answer(r).erreur).toContain("AAAA-MM-JJ");
  });
});

describe("/peche", () => {
  it("shows today's species with their state, the tables, the lagoons and the texts, in marketing's words", () => {
    const html = pechePage(O, undefined, NOW);
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html).toContain("<h1>Pêche de loisir à La Réunion</h1>");
    expect(html).toContain("Aujourd'hui, samedi 31 octobre</h2>");
    expect(html).toContain('<span class="badge m">Pas de fermeture aujourd&#39;hui</span>');
    expect(html).toContain('<span class="badge">Fermé aujourd&#39;hui</span>');
    expect(html).toContain("Interdits à la pêche de loisir, d'après l'arrêté\u00a0:</h2>");
    expect(html).toContain(`href="${PDF_BICHIQUES}"`);
    expect(html).toContain(`href="${CARTE_BICHIQUES}"`);
    expect(html).toContain("Relus le 31/10/2026.");
  });

  it("is linked from /mer", () => {
    expect(seaPage(O, null, NOW)).toContain(`<a href="/peche">Pêche de loisir : langouste, bichiques, capucin nain, ce qui est fermé aujourd'hui →</a>`);
  });
});
