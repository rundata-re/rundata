import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache, type Cached, MemoryStore } from "../src/cache.js";
import type { AgendaAnswer, PlaceData } from "../src/web/data.js";
import { type Entree, type Fiche, FICHES, ficheDescription, ficheIssue, fichePage, fichePassee, fichePath, ficheOf, ficheTerminee, ficheUrls, registre, type Row } from "../src/web/fiche-evenement.js";
import { ficheDe } from "../src/tools/agenda.js";
import { site } from "../src/web/site.js";

const row = (over: Partial<Row> = {}): Row => ({
  titre: "Concert de maloya au Kerveguen",
  quand: "samedi 21/11 de 19:30 à 22:00",
  date: "2026-11-21T19:30",
  lieu: "Kerveguen",
  commune: "Saint-Pierre",
  genres: ["concert"],
  publie_par: "Mairie de Saint-Pierre",
  lien: "https://www.saintpierre.re/agenda/concert",
  fiche: "0a1b2c3d",
  ...over,
} as Row);

const copy = (rows: Row[]): Cached<AgendaAnswer> => ({ value: { resume: "", nombre: rows.length, evenements: rows, couverture: "", a_savoir: "", sources: [], ce_week_end: [] }, fetchedAt: new Date("2026-11-20T10:00:00Z") } as unknown as Cached<AgendaAnswer>);

describe("an event's page", () => {
  it("keeps its key when the title or the date changes, and reads it back from its address", () => {
    const k = ficheDe({ publie_par: "Mairie de Saint-Pierre", id: "https://www.saintpierre.re/agenda/concert" });
    expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(fichePath({ titre: "Concert de maloya : 21/11 !", fiche: k })).toBe(`/evenements/concert-de-maloya-21-11-${k}`);
    expect(ficheOf(`/evenements/concert-de-maloya-21-11-${k}`)).toBe(k);
    expect(ficheOf(`/evenements/un-autre-titre-${k}/`)).toBe(k);
    expect(ficheOf(`/evenements/${k}`)).toBe(k);
    // The pages of DOMAINS are not events.
    expect(ficheOf("/evenements/ce-week-end")).toBeUndefined();
    expect(ficheOf("/evenements/concerts")).toBeUndefined();
    // A long title cut at a word.
    expect(fichePath({ titre: "mot ".repeat(40), fiche: k }).length).toBeLessThan(90);
  });

  it("indexes only an event with a text of its own; the context first, then the text quoted", () => {
    const meteo = { prevision: { resume: "", sources: [], jours: [{ jour: "samedi 21/11", ciel_en_journee: "nuageux", temperature_min: "21 °C", temperature_max: "28 °C", pluie: "pas de pluie" }] } } as unknown as PlaceData;
    const autre = row({ titre: "Marché nocturne", fiche: "11112222", quand: "samedi 21/11 de 17:00 à 22:00" });
    const facts = fichePage("https://rundata.re", row(), copy([row(), autre]), meteo);
    expect(facts).toContain('<meta name="robots" content="noindex">');
    expect(facts).toContain('<link rel="canonical" href="https://rundata.re/evenements/concert-de-maloya-au-kerveguen-0a1b2c3d">');
    expect(facts).toContain("Prévision météo</b> pour samedi 21/11 à Saint-Pierre : nuageux, 21 °C à 28 °C, pluie : pas de pluie. C'est une prévision, pas une mesure.");
    expect(facts).toContain('<a href="/evenements/marche-nocturne-11112222">Marché nocturne</a>');
    expect(facts).toContain('<a href="/aujourdhui/saint-pierre">la journée à Saint-Pierre</a>');
    expect(facts).toContain('Le détail est sur <a href="https://www.saintpierre.re/agenda/concert" rel="noopener">la page de Mairie de Saint-Pierre</a>');
    expect(facts).toContain('"@type":"Event"');

    const texte = fichePage("https://rundata.re", row({ description: "Trois groupes sur la scène.\n\nEntrée libre." }), copy([row()]), undefined);
    expect(texte).not.toContain('content="noindex"');
    expect(texte).toContain("<blockquote><p>Trois groupes sur la scène.</p><p>Entrée libre.</p></blockquote>");
    expect(texte).toContain('D\'après <a href="https://www.saintpierre.re/agenda/concert" rel="noopener">Mairie de Saint-Pierre</a>');
    // No forecast without the commune's copy, and nothing invented in its place.
    expect(texte).not.toContain("Prévision météo</b>");
    // Its links to other sites, under data-sortie for the « sortie » signal.
    expect(texte).toMatch(/<p class="lead" data-sortie>[^]*rel="noopener">Mairie de Saint-Pierre<\/a><\/p>/);
    expect(texte).toMatch(/<section [^>]*data-sortie>[^]*D'après <a href="https:\/\/www.saintpierre.re/);
    // The context comes before the text.
    expect(texte.indexOf('id="autour"')).toBeLessThan(texte.indexOf('id="annonce"'));
  });

  it("gives each date of a series its own description, so that no two pages of the sitemap share one", () => {
    const texte = "Avec l'association les Échiquiers du Nord, viens apprendre à jouer aux échecs. Gratuit, dès 8 ans.";
    const serie = [["2026-11-21T14:00", "samedi 21/11 de 14:00 à 16:00", "1ad96848"], ["2026-11-25T14:00", "mercredi 25/11 de 14:00 à 16:00", "77c7ebe9"], ["2026-11-28T14:00", "samedi 28/11 de 14:00 à 16:00", "f0dfdce9"]]
      .map(([date, quand, fiche]) => row({ titre: "Atelier d'échecs", date, quand, fiche, lieu: "Médiathèque François-Mitterrand", commune: "Saint-Denis", description: texte }));
    const rows = [...serie, row({ description: "Trois groupes sur la scène." }), row({ titre: "Fête du quartier", fiche: "33334444", date: "2026-11-22", quand: "dimanche 22/11", description: "Un texte." })];
    expect(ficheDescription(serie[0])).toBe("Samedi 21/11 de 14:00 à 16:00, Médiathèque François-Mitterrand, Saint-Denis : Avec l'association les Échiquiers du Nord, viens apprendre à jouer aux…");
    expect(ficheDescription(serie[0]).length).toBeLessThanOrEqual(155);
    // The sitemap's events, each page rendered: its meta description, never the same twice.
    const urls = ficheUrls(registre(undefined, rows, "2026-11-20"), "2026-11-20").map(([u]) => u);
    expect(urls).toHaveLength(5);
    const descriptions = urls.map((u) => {
      const r = rows.find((x) => fichePath(x) === u)!;
      return /<meta name="description" content="([^"]*)">/.exec(fichePage("https://rundata.re", r, copy(rows), undefined))![1];
    });
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("says what its source does not give, the hour or the place, never a blank", () => {
    const sans = row({ date: "2026-11-21", quand: "samedi 21/11", lieu: undefined, description: "Un texte." });
    const page = fichePage("https://rundata.re", sans, copy([sans]), undefined);
    expect(page).toContain('<p class="note" data-sortie>L\'annonce ne donne ni l\'heure ni le lieu ; le détail est peut-être sur sa source : <a href="https://www.saintpierre.re/agenda/concert" rel="noopener">Mairie de Saint-Pierre</a>.</p>');
    // Its commune still said, and its day.
    expect(page).toMatch(/<p class="lead" data-sortie>samedi 21\/11, Saint-Pierre · /);
    const sansLien = fichePage("https://rundata.re", { ...sans, lien: undefined }, copy([sans]), undefined);
    expect(sansLien).toContain("L'annonce ne donne ni l'heure ni le lieu ; le détail est peut-être sur sa source : Mairie de Saint-Pierre.</p>");
    const sansHeure = fichePage("https://rundata.re", { ...sans, lieu: "Kerveguen" }, copy([sans]), undefined);
    expect(sansHeure).toContain("L'annonce ne donne pas l'heure ; le détail est peut-être sur sa source : <a ");
    const sansLieu = fichePage("https://rundata.re", { ...sans, date: "2026-11-21T19:30", quand: "samedi 21/11 à 19:30" }, copy([sans]), undefined);
    expect(sansLieu).toContain("L'annonce ne donne pas le lieu ; le détail est peut-être sur sa source : <a ");
    // Hour and place given: nothing said.
    expect(fichePage("https://rundata.re", row(), copy([row()]), undefined)).not.toContain("ne donne");
  });

  it("keeps the events over 30 days, with the day each row last changed, and puts in the sitemap those to come with a text", () => {
    const a = row({ description: "Un texte." });
    const b = row({ titre: "Fête du quartier", fiche: "33334444", date: "2026-11-22", quand: "dimanche 22/11" });
    const first = registre(undefined, [a, b], "2026-11-20");
    expect(first.map((x) => [x.f, x.texte, x.modifie])).toEqual([["0a1b2c3d", true, "2026-11-20"], ["33334444", false, "2026-11-20"]]);
    // Read again the next day, unchanged but for the reading's time: its day kept. Changed: today.
    const again = registre(first, [{ ...a, lu_le: "samedi 21/11 à 08:00" } as Row, { ...b, statut: "ANNULÉ" } as Row], "2026-11-21");
    expect(again.map((x) => x.modifie)).toEqual(["2026-11-20", "2026-11-21"]);
    expect(ficheUrls(again, "2026-11-21")).toEqual([["/evenements/concert-de-maloya-au-kerveguen-0a1b2c3d", "2026-11-20"]]);
    // Over, out of the copy: kept 30 days after its last day, then dropped; never in the sitemap.
    expect(registre(again, [], "2026-12-21").map((x) => x.f)).toEqual(["0a1b2c3d", "33334444"]);
    expect(ficheUrls(registre(again, [], "2026-12-21"), "2026-12-21")).toEqual([]);
    // Past those 30 days, its key alone, a year more, for its address to say gone; then nothing.
    expect(registre(again, [], "2026-12-23")).toEqual([{ f: "0a1b2c3d", fin: "2026-11-21", parti: true }, { f: "33334444", fin: "2026-11-22", parti: true }]);
    expect(registre(registre(again, [], "2026-12-23"), [], "2027-12-21").map((x) => x.f)).toEqual(["0a1b2c3d", "33334444"]);
    expect(registre(registre(again, [], "2026-12-23"), [], "2027-12-23")).toEqual([]);
    expect(ficheUrls(registre(again, [], "2026-12-23"), "2026-11-01")).toEqual([]);
    // Announced again: its page back.
    expect(registre(registre(again, [], "2026-12-23"), [a], "2026-12-24")[0]).toMatchObject({ f: "0a1b2c3d", titre: a.titre, modifie: "2026-12-24" });
  });

  it("says an event over took place, and a gone one is over", () => {
    const x: Fiche = { f: "0a1b2c3d", titre: "Souffle o.I. #7", date: "2026-10-27T10:00", fin: "2026-11-15", quand: "", commune: "Saint-Pierre", publie_par: "Mairie de Saint-Pierre", texte: true, modifie: "2026-10-27", sig: "" };
    const past = fichePassee("https://rundata.re", x);
    expect(past).toContain("Cet événement a eu lieu du mardi 27/10 au dimanche 15/11, Saint-Pierre.");
    expect(past).toContain('<a href="/aujourdhui/saint-pierre">Les prochaines sorties à Saint-Pierre →</a>');
    expect(past).toContain('content="noindex"');
    expect(ficheTerminee("https://rundata.re", "/evenements/x-0a1b2c3d")).toContain("Cet événement est terminé, ou n'est plus annoncé dans les agendas que nous lisons.");
  });

  describe("its address", () => {
    const a = row();
    const path = fichePath(a);
    const over: Fiche = { f: "0a1b2c3d", titre: a.titre, date: "2026-10-27T10:00", fin: "2026-11-15", quand: "", commune: "Saint-Pierre", publie_par: "Mairie de Saint-Pierre", texte: true, modifie: "2026-10-27", sig: "" };
    const toCome: Fiche = { ...over, date: "2026-11-28", fin: undefined };
    const gone: Entree = { f: "0a1b2c3d", fin: "2026-09-01", parti: true };

    it("serves the page of an event listed, and sends an older title on to it (301)", () => {
      expect(ficheIssue(path, "0a1b2c3d", [a], undefined, "2026-11-20")).toEqual({ page: a });
      expect(ficheIssue(`${path}/`, "0a1b2c3d", [a], undefined, "2026-11-20")).toEqual({ page: a });
      expect(ficheIssue("/evenements/ancien-titre-0a1b2c3d", "0a1b2c3d", [a], undefined, "2026-11-20")).toEqual({ vers: path });
      expect(ficheIssue("/evenements/0a1b2c3d", "0a1b2c3d", [a], undefined, "2026-11-20")).toEqual({ vers: path });
    });

    it("says an event over took place for 30 days, its older titles sent on, then gone (410)", () => {
      expect(ficheIssue(fichePath(over), "0a1b2c3d", [], [over], "2026-11-20")).toEqual({ passee: over });
      expect(ficheIssue("/evenements/autre-0a1b2c3d", "0a1b2c3d", [], [over], "2026-11-20")).toEqual({ vers: fichePath(over) });
      // Even without the copy: the register says it is over.
      expect(ficheIssue(fichePath(over), "0a1b2c3d", undefined, [over], "2026-11-20")).toEqual({ passee: over });
      expect(ficheIssue(path, "0a1b2c3d", [], [gone], "2026-11-20")).toEqual({ statut: 410 });
      expect(ficheIssue(path, "0a1b2c3d", undefined, [gone], "2026-11-20")).toEqual({ statut: 410 });
    });

    it("says gone (410) an event to come no agenda announces any more, never seen not found (404), and without the copy come back (503)", () => {
      expect(ficheIssue(path, "0a1b2c3d", [], [toCome], "2026-11-20")).toEqual({ statut: 410 });
      expect(ficheIssue(path, "0a1b2c3d", [], [], "2026-11-20")).toEqual({ statut: 404 });
      expect(ficheIssue(path, "0a1b2c3d", [], undefined, "2026-11-20")).toEqual({ statut: 404 });
      expect(ficheIssue(path, "0a1b2c3d", undefined, [toCome], "2026-11-20")).toEqual({ statut: 503 });
      expect(ficheIssue(path, "0a1b2c3d", undefined, undefined, "2026-11-20")).toEqual({ statut: 503 });
    });

    describe("through the site", () => {
      const NOW = new Date("2026-11-20T06:00:00Z");
      afterEach(() => vi.unstubAllGlobals());
      const serve = (p: string, kept: Entree[] | undefined, rows?: Row[]) => {
        vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
        const store = new MemoryStore();
        const t = NOW.getTime();
        if (rows) void store.put("web:agenda", { value: copy(rows).value, fetchedAt: t });
        if (kept) void store.put(FICHES, { value: kept, fetchedAt: t });
        const pending: Promise<unknown>[] = [];
        return site(new Request(`https://rundata.re${p}`, { headers: { accept: "text/html" } }), new Cache(store, () => t), (x) => void pending.push(x), NOW);
      };

      it("answers 301, 200, 410 and 404 with the copy there", async () => {
        const moved = (await serve("/evenements/ancien-titre-0a1b2c3d", [], [a]))!;
        expect([moved.status, moved.headers.get("location")]).toEqual([301, `https://rundata.re${path}`]);
        expect((await serve(fichePath(over), [over], []))!.status).toBe(200);
        const ended = (await serve(path, [gone], []))!;
        expect(ended.status).toBe(410);
        expect(await ended.text()).toContain("Cet événement est terminé");
        expect((await serve(path, [toCome], []))!.status).toBe(410);
        expect((await serve("/evenements/inconnu-99999999", [over], []))!.status).toBe(404);
      });

      it("answers 503, to come back, while the copy is not there", async () => {
        const wait = (await serve(path, [toCome]))!;
        expect([wait.status, wait.headers.get("retry-after")]).toEqual([503, "30"]);
        expect(await wait.text()).toContain("L'agenda se charge");
      });
    });
  });
});
