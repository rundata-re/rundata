import { describe, expect, it } from "vitest";
import { parseRss } from "../src/providers/agenda.js";
import { eventRow } from "../src/tools/agenda.js";
import { casse } from "../src/tools/casse.js";
import type { AgendaAnswer } from "../src/web/data.js";
import { agendaPage } from "../src/web/domains.js";

describe("an agenda's title written all in capitals", () => {
  it("takes the case of a sentence", () => {
    expect(casse("ATELIER DE GESTION BUDGETAIRE")).toBe("Atelier de gestion budgetaire");
    expect(casse("CONCERT AU PORT DE PLAISANCE")).toBe("Concert au port de plaisance");
  });

  it("leaves a title with one lowercase letter as written, and one short enough to be a sigle", () => {
    for (const t of ["Atelier de gestion budgétaire", "Soirée DJ au Kabardock", "Concert de ZAZA FLANBO", "DKLO", "CASUD", "BIS", "A"]) expect(casse(t)).toBe(t);
  });

  it("keeps the sigles, a word without a vowel, the roman numerals and the words with a digit", () => {
    expect(casse("RÉUNION PUBLIQUE DU CCAS ET DE LA CINOR")).toBe("Réunion publique du CCAS et de la CINOR");
    expect(casse("SALON DU LIVRE II, ÉDITION 2026")).toBe("Salon du livre II, édition 2026");
    expect(casse("TOURNOI DE FOOT EN 5X5")).toBe("Tournoi de foot en 5X5");
    expect(casse("GRAND PRIX LRGR DE GOLF")).toBe("Grand prix LRGR de golf");
  });

  it("keeps a short word no French word starts like, a name or a brand, and not one that starts as French words do", () => {
    expect(casse("DKLO TAN ROUGE")).toBe("DKLO Tan Rouge");
    expect(casse("CLUB DE LECTURE")).toBe("Club de lecture");
    expect(casse("TRÈS GRAND SPECTACLE PLUS FORT")).toBe("Très grand spectacle plus fort");
    expect(casse("SOIRÉE SLAM ET SKI NAUTIQUE")).toBe("Soirée slam et ski nautique");
  });

  it("gives back their capitals to the communes and villages the resolver knows, written in full or « St », « Ste »", () => {
    expect(casse("LE RALLYE GRAND EST FAIT ÉTAPE À ST-ANDRÉ")).toBe("Le rallye grand est fait étape à St-André");
    expect(casse("SORTIE À LA PLAINE-DES-PALMISTES ET À STE-MARIE")).toBe("Sortie à La Plaine-des-Palmistes et à Ste-Marie");
    expect(casse("MARCHÉ NOCTURNE DE SAINT-GILLES-LES-BAINS")).toBe("Marché nocturne de Saint-Gilles-les-Bains");
    expect(casse("FÊTE DES TROIS-BASSINS 2026")).toBe("Fête des Trois-Bassins 2026");
    expect(casse("RANDONNÉE À HELL-BOURG")).toBe("Randonnée à Hell-Bourg");
  });

  it("leaves in the sentence's case a village that is a common word, and « port » without its article", () => {
    expect(casse("MESSE À LA CHAPELLE")).toBe("Messe à la chapelle");
    expect(casse("FÊTE DE LA CROIX À BELLEVUE")).toBe("Fête de la croix à bellevue");
    expect(casse("VISITE DU PORT")).toBe("Visite du port");
    expect(casse("FÊTE DU PORT AU PORT")).toBe("Fête du port au port");
    expect(casse("FÊTE DU PORT À LE PORT")).toBe("Fête du port à Le Port");
  });

  it("gives each word a capital in a title of one or two words, more often a name than a sentence", () => {
    expect(casse("BOUCHES COUSUES")).toBe("Bouches Cousues");
    expect(casse("ZAZA FLANBO")).toBe("Zaza Flanbo");
    expect(casse("DKLO TROIS-BASSINS")).toBe("DKLO Trois-Bassins");
    expect(casse("TRANSLATIONS")).toBe("Translations");
  });

  it("reaches the event's row, the MCP tool's and the page's", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>ATELIER DE GESTION BUDGETAIRE SAMEDI 31 OCTOBRE 2026</title>` +
      `<link>https://www.trois-bassins.re/agenda/atelier</link><pubDate>Sat, 24 Oct 2026 06:00:00 +0400</pubDate></item>` +
      `<item><title>Atelier de l'ADIL samedi 31 octobre 2026</title><link>https://www.trois-bassins.re/agenda/adil</link>` +
      `<pubDate>Sat, 24 Oct 2026 06:00:00 +0400</pubDate></item></channel></rss>`;
    const events = parseRss(xml, "Ville des Trois-Bassins", "Les Trois-Bassins", true);
    const rows = events.map((e) => eventRow(e, e.seances));
    expect(rows.map((r) => r.titre)).toEqual(["Atelier de gestion budgetaire samedi 31 octobre 2026", "Atelier de l'ADIL samedi 31 octobre 2026"]);
    const d = { resume: "", nombre: rows.length, evenements: rows, couverture: "", a_savoir: "", sources: [], ce_week_end: rows } as unknown as AgendaAnswer;
    const now = new Date("2026-10-30T04:00:00Z");
    const html = agendaPage("https://rundata.re", { value: d, fetchedAt: now, stale: false }, now);
    expect(html).toContain(">Atelier de gestion budgetaire samedi 31 octobre 2026<");
    expect(html).not.toContain("BUDGETAIRE");
  });
});
