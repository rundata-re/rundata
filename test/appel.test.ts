import { describe, expect, it } from "vitest";
import { eventRow } from "../src/tools/agenda.js";
import { agendaRow } from "../src/web/domains.js";
import { ficheIssue, fichePath } from "../src/web/fiche-evenement.js";
import { annonceAppel, appelAuPublic, nomUsage } from "../src/tools/appel.js";
import type { Evenement } from "../src/providers/agenda.js";

const ev = (titre: string, seances: Evenement["seances"]): Evenement => ({
  id: "https://www.saint-andre.re/appel/", titre, seances, commune: "Saint-André", categories: [],
  lien: "https://www.saint-andre.re/appel/", publie_par: "Ville de Saint-André",
});
const JOURS = ["04", "05", "06"].map((d) => ({ debut: `2026-12-${d}T15:00`, fin: `2026-12-${d}T22:00` }));

describe("appel à exposants", () => {
  it("gives the outing by its name, in the usual capitals, said to come from the call (Saint-André, 21/11/2026)", () => {
    const e = appelAuPublic(ev("Appel à exposants marché de noël au colosse !", JOURS));
    expect(e?.titre).toBe("Marché de Noël au Colosse");
    expect(e?.appel).toBe("exposants");
    const r = eventRow(e!, e!.seances, false, true);
    expect(r.titre).toBe("Marché de Noël au Colosse");
    expect(r.annonce).toBe("annoncé par la Ville de Saint-André dans un appel à exposants");
    expect(r.lien).toBe("https://www.saint-andre.re/appel/");
  });

  it("says it under the name in the list, linked to the post", () => {
    const e = appelAuPublic(ev("Appel à exposants marché de noël au colosse !", JOURS))!;
    const html = agendaRow({ ...eventRow(e, e.seances), fiche: undefined } as Parameters<typeof agendaRow>[0]);
    expect(html).toContain(">Marché de Noël au Colosse</a>");
    expect(html).toContain('<small class="said"><a href="https://www.saint-andre.re/appel/" rel="noopener">annoncé par la Ville de Saint-André dans un appel à exposants</a></small>');
  });

  it("sends the address under the call's title on to the outing's page (301, by its key)", () => {
    const e = appelAuPublic(ev("Appel à exposants marché de noël au colosse !", JOURS))!;
    const r = eventRow(e, e.seances);
    const before = fichePath({ titre: "Appel à exposants marché de noël au colosse !", fiche: r.fiche });
    expect(before).toMatch(/^\/evenements\/appel-a-exposants-marche-de-noel-au-colosse-[0-9a-f]{8}$/);
    const now = fichePath(r);
    expect(now).toMatch(/^\/evenements\/marche-de-noel-au-colosse-[0-9a-f]{8}$/);
    expect(ficheIssue(before, r.fiche!, [r] as Parameters<typeof ficheIssue>[2], undefined, "2026-11-21")).toEqual({ vers: now });
  });

  it("is no outing without the public's hours: the days of a call are most often its own", () => {
    expect(appelAuPublic(ev("Appel à exposants marché de noël au colosse !", [{ debut: "2026-11-30" }]))).toBeUndefined();
    expect(appelAuPublic(ev("Appel à candidatures", JOURS))).toBeUndefined();
  });

  it("reads « candidatures » and a colon, and leaves a name written with its capitals as written", () => {
    const e = appelAuPublic(ev("APPEL À CANDIDATURES : Festival Kaf La Réunion", JOURS));
    expect(e?.titre).toBe("Festival Kaf La Réunion");
    expect(e?.appel).toBe("candidatures");
  });

  it("leaves every other event as it is", () => {
    const e = ev("Marché de Noël", JOURS);
    expect(appelAuPublic(e)).toBe(e);
    expect(eventRow(e, e.seances).annonce).toBeUndefined();
  });

  it("gives its capitals back to a title in capitals throughout, as the live one in Unicode bold (1.0.712)", () => {
    expect(appelAuPublic(ev("APPEL À EXPOSANTS MARCHÉ DE NOËL AU COLOSSE !", JOURS))?.titre).toBe("Marché de Noël au Colosse");
    expect(eventRow(appelAuPublic(ev("APPEL À EXPOSANTS MARCHÉ DE NOËL AU COLOSSE !", JOURS))!, JOURS).titre).toBe("Marché de Noël au Colosse");
  });

  it("writes a word as its post writes it elsewhere, for a place the gazetteer does not hold", () => {
    const e = { ...ev("APPEL À EXPOSANTS FÊTE DES LETCHIS À BOIS-ROUGE", JOURS), description: "Une fête qui se tiendra à Bois-Rouge, sur le parvis." };
    expect(appelAuPublic(e)?.titre).toBe("Fête des letchis à Bois-Rouge");
    expect(nomUsage("marché de noël au kiosque", "Saint-Paul", "Rendez-vous au Kiosque de la plage.")).toBe("Marché de Noël au Kiosque");
  });

  it("gives the capitals of the feasts and of the commune's places only", () => {
    expect(nomUsage("fête de noël au colosse", "Saint-André")).toBe("Fête de Noël au Colosse");
    expect(nomUsage("fête de noël au colosse", "Saint-Paul")).toBe("Fête de Noël au colosse");
  });

  it("names the publisher with its article", () => {
    expect(annonceAppel("CINOR", "candidatures")).toBe("annoncé par la CINOR dans un appel à candidatures");
    expect(annonceAppel("Kabardock", "candidatures")).toBe("annoncé par Kabardock dans un appel à candidatures");
  });
});
