import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENDAS, TCO, TCO_COMMUNES, parseTco } from "../src/providers/agenda.js";

// The eight cards of https://www.tco.re/louest-i-bouz as the page gave them on 24/11/2026 at 23:23 (Réunion time).
const PAGE = readFileSync(new URL("./fixtures/agenda/agenda-tco-2411.html", import.meta.url), "utf8");
const at = (iso: string) => new Date(`${iso}+04:00`);

describe("the TCO's « Agenda des manifestations » (L'Ouest i bouz)", () => {
  it("gives an event its days and the one commune its title or text names, Le Port by its Creole name", () => {
    const ev = parseTco(PAGE, at("2026-11-24T23:30"));
    expect(ev.map((e) => [e.titre, e.commune, e.seances[0].debut.slice(0, 10)])).toEqual([["Dann Ker lé O : nou dsann Lo Port !", "Le Port", "2026-11-28"]]);
    expect(ev[0].lien).toBe("https://www.tco.re/?post_type=post&p=81684");
    expect(ev[0].publie_par).toBe("TCO");
  });

  it("never places an event that names no commune or several (« dans les Trokali … du Territoire de l'Ouest »)", () => {
    const titres = parseTco(PAGE, at("2026-11-24T23:30")).map((e) => e.titre);
    expect(titres.some((t) => t.startsWith("Trokafèt"))).toBe(false);
  });

  it("keeps an event until its last day, then drops it: Trois-Bassins on 14/11, not the day after", () => {
    const le = (iso: string) => parseTco(PAGE, at(iso)).map((e) => e.commune);
    expect(le("2026-11-14T08:00")).toContain("Les Trois-Bassins");
    expect(le("2026-11-15T08:00")).not.toContain("Les Trois-Bassins");
  });

  it("is read every six hours by the scheduled event, credited to the TCO, for its five communes", () => {
    expect(AGENDAS).toContain(TCO);
    expect(TCO).toMatchObject({ planifie: true, relecture: 6 * 3600, credit: "TCO, www.tco.re" });
    expect([...TCO_COMMUNES].sort()).toEqual(["La Possession", "Le Port", "Les Trois-Bassins", "Saint-Leu", "Saint-Paul"]);
  });
});
