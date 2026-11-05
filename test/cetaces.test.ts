import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../src/cache.js";
import * as cetaces from "../src/tools/cetaces.js";
import { temperatureMer } from "../src/tools/mer.js";
import { whaleSection } from "../src/web/pages.js";

const CSV = readFileSync(new URL("./fixtures/coraux_dhw_5km.csv", import.meta.url), "utf8");
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
// Réunion time is UTC+4: 30/06 at 20:00 UTC is already 1/07 at La Réunion.
const at = (iso: string) => new Date(iso);
// The page escapes the apostrophes.
const h = (t: string) => t.replace(/'/g, "&#39;");
const ALL = () => [cetaces.T.surtitre, cetaces.T.titre, cetaces.T.pendant, cetaces.T.hors, cetaces.T.presence, cetaces.T.foi, cetaces.T.regles, cetaces.COMMENT_LE_DIRE, ...cetaces.REGLES.flatMap((r) => [r.regle, r.article]), ...cetaces.LIENS.map((l) => l.texte)];

afterEach(() => vi.unstubAllGlobals());

describe("cétacés", () => {
  it("holds the humpback whales' period of rules from 1 July to 30 September, both days included, Réunion time", () => {
    expect(cetaces.enPeriode("2026-06-30")).toBe(false);
    expect(cetaces.enPeriode("2026-07-01")).toBe(true);
    expect(cetaces.enPeriode("2026-09-30")).toBe(true);
    expect(cetaces.enPeriode("2026-10-01")).toBe(false);
    expect(cetaces.etatDuJour(at("2026-06-30T19:59:00Z"))).toBe(cetaces.T.hors);
    expect(cetaces.etatDuJour(at("2026-06-30T20:00:00Z"))).toBe(cetaces.T.pendant);
    expect(cetaces.etatDuJour(at("2026-09-30T19:59:00Z"))).toBe(cetaces.T.pendant);
    expect(cetaces.etatDuJour(at("2026-09-30T20:00:00Z"))).toBe(cetaces.T.hors);
  });

  it("gives the twelve rules with their articles, the speed on the west coast as the decree n° 1098 wrote it", () => {
    expect(cetaces.REGLES).toHaveLength(12);
    for (const r of cetaces.REGLES) expect(r.article).toMatch(/^arrêté n°\u00a0944, art\.\u00a0\d/);
    const vitesse = cetaces.REGLES.find((r) => r.article.includes("1098"))!;
    expect(vitesse.article).toBe("arrêté n°\u00a0944, art.\u00a06, rédigé par l'arrêté n°\u00a01098");
    expect(vitesse.regle).toContain("Port Ouest");
    expect(vitesse.regle).toContain("Saint-Gilles-les-Bains");
    expect(vitesse.regle).toContain("isobathe des 50\u00a0m");
    expect(vitesse.regle).toContain("Petite-Île");
    expect(cetaces.LUES_LE).toBe("2026-11-04");
  });

  it("never says the old zone, « autorisé », a whales' season, their presence today, nor links to Globice; non-breaking spaces where marketing set them", () => {
    const all = ALL().join("\n");
    expect(all).not.toMatch(/Grand Cap|baie de Saint-Paul|autoris|saison|globice/i);
    for (const t of ALL()) {
      expect(t, t).not.toMatch(/ [:;?!»]/);
      expect(t, t).not.toMatch(/\d (m|h|nœuds?|minutes|navires|engins|personnes|ans|€)\b/);
      expect(t, t).not.toMatch(/n° |1er /);
    }
  });

  it("gives temperature_mer a short block « cetaces », read from nothing, credited to the DMSOI: the rules are on /mer", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(String(url));
      if (String(url).includes("dhw_5km")) return new Response(CSV);
      throw new Error("offline");
    });
    const now = at("2026-08-15T06:00:00Z");
    const r = body(await temperatureMer(new Cache(undefined, () => now.getTime()), undefined, now));
    expect(r.cetaces.etat).toBe(cetaces.T.pendant);
    expect(r.cetaces.presence).toBe(cetaces.T.presence);
    expect(r.cetaces.regles).toBe(cetaces.T.regles);
    expect(r.cetaces.regles).toMatch(/: https:\/\/rundata\.re\/mer#h-cetaces$/);
    expect(r.cetaces.textes).toBeUndefined();
    // The state, the warning and the link: under 600 bytes, where the twelve rules weighed 4,7 KB.
    expect(new TextEncoder().encode(JSON.stringify(r.cetaces)).length).toBeLessThan(600);
    expect(r.cetaces.textes_lus_le).toBe("04/11/2026");
    // The day the decrees were read is not the date of the sea's measure.
    expect(r.cetaces.derniere_verification).toBeUndefined();
    expect(r.sources.map((s: { source: string }) => s.source)).toContain(cetaces.SOURCE.nom);
    expect(asked.some((u) => u.includes("developpement-durable") || u.includes("reunion.gouv"))).toBe(false);
  });

  it("shows a section of /mer with the day's state, the twelve rules and both decrees, the second one's page linked", () => {
    const html = whaleSection(at("2026-11-04T09:00:00Z"));
    expect(html).toContain('id="h-cetaces"');
    expect(html).toContain("Arrêtés du préfet de La Réunion, lus le 04/11/2026");
    expect(html).toContain(h("Baleines et dauphins\u00a0: les règles d'approche"));
    expect(html).toContain("En dehors de la période du 1er\u00a0juillet au 30\u00a0septembre");
    expect(html).toContain(h("Ces règles ne disent pas s'il y a des baleines en ce moment."));
    expect(html.match(/<tr><td data-label="Règle">/g)).toHaveLength(12);
    for (const u of [cetaces.PDF_944, cetaces.PAGE_944, cetaces.PDF_1098, cetaces.PAGE_1098]) expect(html).toContain(`href="${u}"`);
    expect(whaleSection(at("2026-07-14T09:00:00Z"))).toContain(h("Du 1er\u00a0juillet au 30\u00a0septembre, l'arrêté encadre l'approche des baleines à bosse."));
  });
});
