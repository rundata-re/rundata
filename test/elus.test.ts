import { describe, expect, it } from "vitest";
import type { Cached } from "../src/cache.js";
import { INSEE } from "../src/places/insee.js";
import { COURT, court, resume } from "../src/tools/resume.js";
import * as elus from "../src/vie/elus.js";
import data from "../src/vie/elus.json" with { type: "json" };
import { communePage } from "../src/web/commune.js";
import type { CommuneData } from "../src/web/data.js";
import { pageOf } from "../src/web/places.js";

const NOW = new Date("2026-11-24T06:00:00Z");
const p = pageOf("saint-paul")!;
const commune = { place: null, commune: { value: { sources: [] }, fetchedAt: NOW, stale: false } as Cached<CommuneData> };
const flat = (s: string) => s.replaceAll(" ", " ");

describe("the mayors and deputy mayors (vie/elus.ts)", () => {
  it("are the RNE's of 20/11/2026, a mayor in each of the 24 communes and their deputies in rank", () => {
    expect(elus.MIS_A_JOUR).toBe("2026-11-20");
    expect(Object.keys(data.communes).sort()).toEqual(Object.values(INSEE).sort());
    for (const nom of Object.keys(INSEE)) {
      const e = elus.elusDe(nom)!;
      expect(e.maire.nom, nom).toBeTruthy();
      const rangs = e.adjoints.map((a) => a.rang);
      expect(rangs, nom).toEqual([...rangs].sort((x, y) => x - y));
      if (nom !== "Saint-Paul") expect(rangs, nom).toEqual(rangs.map((_, i) => i + 1));
    }
    // The ministry's file gives Saint-Paul two « 14ème adjoint » and no 15th: kept as written, never renumbered.
    expect(elus.elusDe("Saint-Paul")!.adjoints.map((a) => a.rang).slice(-3)).toEqual([14, 14, 16]);
    expect(Object.values(data.communes).reduce((n, c) => n + c.adjoints.length, 0)).toBe(258);
    expect(elus.SOURCE.licence).toBe("Licence Ouverte Etalab 2.0");
  });

  it("hold only a name and an office: never a date of birth, a sex, a profession nor a nuance", () => {
    for (const c of Object.values(data.communes)) {
      expect(Object.keys(c).sort()).toEqual(["adjoints", "maire"]);
      expect(Object.keys(c.maire).sort()).toEqual(["nom", "prenom"]);
      for (const a of c.adjoints) expect(Object.keys(a).sort()).toEqual(["nom", "prenom", "rang"]);
    }
    expect(JSON.stringify(data)).not.toMatch(/naissance|sexe|profession|socio|nuance|\d{4}-\d\d-\d\d.*\d{4}-\d\d-\d\d.*\d{4}-\d\d-\d\d/);
  });

  it("are said by office: « 1er adjoint », « 2e adjoint »", () => {
    expect(elus.fonctionDe({ rang: 1, prenom: "A", nom: "B" })).toBe("1er adjoint");
    expect(elus.fonctionDe({ rang: 12, prenom: "A", nom: "B" })).toBe("12e adjoint");
    expect(elus.DONNEES_DU).toBe("données du 20/11/2026");
  });
});

describe("the commune's page and its summary", () => {
  const e = elus.elusDe("Saint-Paul")!;

  it("name the mayor under the town hall, the deputies folded, with the day of the data and its source", () => {
    const page = flat(communePage("https://rundata.re", p, commune as never, NOW));
    expect(page).toContain(`Maire : ${elus.nomDe(e.maire)}`);
    expect(page).toContain(`<summary>Adjoints au maire <span class="note">${e.adjoints.length}</span></summary>`);
    expect(page).toContain(`1er adjoint : ${elus.nomDe(e.adjoints[0])}`);
    expect(page).toContain("Répertoire national des élus (ministère de l&#39;Intérieur), données du 20/11/2026");
    // And among the page's sources, at its foot.
    expect(page.match(/Répertoire national des élus/g)).toHaveLength(2);
  });

  it("give the mayor and the deputies in resume_du_jour, with the day of the data, and cite the RNE", () => {
    const r = resume(p, { commune: commune.commune } as never, NOW);
    expect(r.elus).toEqual({
      maire: elus.nomDe(e.maire),
      adjoints: e.adjoints.map((a) => ({ fonction: elus.fonctionDe(a), nom: elus.nomDe(a) })),
      donnees_du: "2026-11-20",
    });
    expect(r.sources.map((s) => s.source)).toContain("Répertoire national des élus");
  });

  it("keep the mayor and the number of deputies in the short answer, their list with detail", () => {
    const r = court(resume(p, { commune: commune.commune } as never, NOW));
    expect(r.elus).toEqual({ maire: elus.nomDe(e.maire), adjoints_au_maire: e.adjoints.length, donnees_du: "2026-11-20" });
    expect(COURT).toContain("ni la liste des adjoints au maire");
  });
});
