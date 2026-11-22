import { describe, expect, it } from "vitest";
import type { Evenement } from "../src/providers/agenda.js";
import { matcher } from "../src/tools/agenda.js";
import { cite, citerOf } from "../src/tools/citer.js";
import { fraicheur } from "../src/tools/fraicheur.js";
import { fini, marchesDuJour } from "../src/vie/marches.js";

// Friday 20/11/2026 at La Réunion (UTC+4).
const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00+04:00`);

describe("the AI tools' review of 20/11/2026", () => {
  it("says a market of the day is over once its source's hours are past", () => {
    const camelias = (now?: Date) => marchesDuJour("2026-11-20", "Saint-Denis", now).find((m) => m.nom === "Marché forain des Camélias");
    expect(camelias(at("11:59"))?.termine).toBeUndefined();
    expect(camelias(at("12:26"))).toMatchObject({ horaires: "de 6\u00a0h à 12\u00a0h", termine: "terminé pour aujourd'hui" });
    // No time given (the pages): as before.
    expect(camelias()?.termine).toBeUndefined();
    expect(fini({ horaires_osm: "Fr 06:00-12:00" }, at("12:00"))).toBe(true);
    expect(fini({ horaires_osm: "Fr 06:00-12:00; Sa 06:00-12:00" }, at("08:00"))).toBe(false);
    expect(fini({ horaires_osm: undefined }, at("23:00"))).toBe(false);
  });

  it("does not answer « concert » with a market whose page alone speaks of music, but does when its title says concert", () => {
    const e = (titre: string) => ({ titre, categories: ["Économie"], description: "Pour les fêtes, offrez du local !", themes: ["concert"], publie_par: "Ville du Port" }) as unknown as Evenement;
    const concert = matcher("concert")!;
    expect(concert.test(e("Le Marché de Noël des Galeries Circulaires du Port"))).toBe(false);
    expect(concert.test(e("Concert au marché de Noël"))).toBe(true);
    expect(matcher("marché")!.test(e("Le Marché de Noël des Galeries Circulaires du Port"))).toBe(true);
  });

  it("dates the events' answer by its oldest read, the agendas read once a day included", () => {
    const now = at("11:30");
    const lectures = [
      { key: "agenda:departement", fetchedAt: at("10:00").getTime(), stale: false, freshSeconds: 86_400 },
      { key: "agenda:kabardock", fetchedAt: at("11:29").getTime(), stale: false, freshSeconds: 3_600 },
    ];
    expect(fraicheur({}, lectures, now).lue_a).toMatch(/11:29$/);
    expect(fraicheur({}, lectures, now, { lentes: true }).lue_a).toMatch(/10:00$/);
  });

  it("names a producer once in the citation, whatever its first letter's case", () => {
    const p = { sources: [
      { id: "a", nom: "Arrêtés sécheresse", attribution: "Préfecture de La Réunion" },
      { id: "b", nom: "VigiEau", attribution: "VigiEau" },
      { id: "c", nom: "Communiqués", attribution: "préfecture de La Réunion" },
    ] };
    const c = citerOf("restrictions_eau", p);
    expect(c).toBe("rundata.re, d'après Préfecture de La Réunion, VigiEau");
  });
  it("names a producer once when another credit lists it beside others: VigiEau's « VigiEau, préfecture de La Réunion » (22/11/2026)", () => {
    const p = { sources: [
      { id: "a", nom: "Arrêté sécheresse", attribution: "Préfecture de La Réunion" },
      { id: "b", nom: "Restrictions d'eau en cas de sécheresse (VigiEau, arrêtés préfectoraux)", attribution: "VigiEau, préfecture de La Réunion" },
    ] };
    expect(citerOf("restrictions_eau", p)).toBe("rundata.re, d'après Préfecture de La Réunion, VigiEau");
    // Two producers never named before: both kept.
    expect(citerOf("fiche_terrain_x", { sources: [{ id: "d", nom: "DVF", attribution: "DGFiP, Cerema" }] })).toBe("rundata.re, d'après DGFiP, Cerema");
  });
  it("names the prefecture once in restrictions_eau's « Source : » sentence of its résumé too, whichever credit comes first (23/11/2026)", () => {
    const prefecture = { id: "a", nom: "Communiqués de la préfecture", attribution: "Préfecture de La Réunion" };
    const vigieau = { id: "vigieau", nom: "Restrictions d'eau en cas de sécheresse (VigiEau, arrêtés préfectoraux)", attribution: "VigiEau, préfecture de La Réunion" };
    for (const sources of [[prefecture, vigieau], [vigieau, prefecture]]) {
      const r = cite("restrictions_eau", { content: [{ type: "text", text: JSON.stringify({ resume: "Sécheresse à La Réunion : alerte dans 13 communes.", sources }) }] });
      const out = JSON.parse(r.content[0].text) as { resume: string; citer: string };
      expect(out.resume.match(/préfecture/gi)).toHaveLength(1);
      expect(out.citer.match(/préfecture/gi)).toHaveLength(1);
      expect(out.resume).toContain(`Source : ${out.citer}, `);
    }
  });
});
