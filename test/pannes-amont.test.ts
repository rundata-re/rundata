import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PANNE_MAX_JOURS, pannesSummary, trierPannes, type PanneConnue } from "../src/bin/check-sources.js";

// The known breakdowns upstream (scripts/pannes-amont.json): a warning while in force, a failure again past it (23/11/2026).
const LISTE = JSON.parse(readFileSync(new URL("../scripts/pannes-amont.json", import.meta.url), "utf8")) as PanneConnue[];
const EDF: PanneConnue = { point: "electricite", motif: "production d'il y a ", depuis: "2026-11-20", jusqu_au: "2026-11-27", pourquoi: "L'open data d'EDF ne publie plus de production." };
const RETARD = { point: "electricite", motif: "production d'il y a 62,1 h (seuil 3 h)" };

describe("the known breakdowns upstream of the check of the sources", () => {
  it("has a list whose every entry can be used: point, motif, why, dates, 7 days at most", () => {
    expect(LISTE.length).toBeGreaterThan(0);
    expect(trierPannes([], LISTE, new Date("2026-11-23T03:11:00Z")).echecs).toEqual([]);
  });

  it("makes a warning of the problem it covers while in force, and fails every other", () => {
    const autre = { point: "qualite_air", motif: "mesure d'il y a 5 h (seuil 3 h)" };
    const http = { point: "electricite", motif: "HTTP 500" };
    const { connus, echecs } = trierPannes([RETARD, autre, http], [EDF], new Date("2026-11-23T03:11:00Z"));
    expect(connus).toEqual([{ probleme: RETARD, panne: EDF }]);
    expect(echecs).toEqual([autre, http]);
    expect(pannesSummary(connus)).toContain("| electricite | production d'il y a 62,1 h (seuil 3 h) | 2026-11-20 | 2026-11-27 | L'open data d'EDF ne publie plus de production. |");
    expect(pannesSummary([])).toBe("");
  });

  it("covers the problem until the last day ends in La Réunion, then fails it again, said to be reviewed", () => {
    expect(trierPannes([RETARD], [EDF], new Date("2026-11-27T19:59:00Z")).connus).toHaveLength(1);
    const after = trierPannes([RETARD], [EDF], new Date("2026-11-27T20:00:00Z"));
    expect(after.connus).toEqual([]);
    expect(after.echecs).toEqual([{ point: "electricite", motif: "production d'il y a 62,1 h (seuil 3 h)\u00a0; panne amont connue jusqu'au 2026-11-27 seulement : à revoir" }]);
    // Not before its first day either.
    expect(trierPannes([RETARD], [EDF], new Date("2026-11-19T12:00:00Z")).echecs).toEqual([RETARD]);
  });

  it("fails an entry that lasts more than 7 days or cannot be read, and covers nothing with it", () => {
    const long = { ...EDF, jusqu_au: "2026-11-28" };
    const r = trierPannes([RETARD], [long, { ...EDF, depuis: "20/11/2026" }], new Date("2026-11-23T03:11:00Z"));
    expect(PANNE_MAX_JOURS).toBe(7);
    expect(r.connus).toEqual([]);
    expect(r.echecs.map((p) => p.motif)).toEqual(["entrée « electricite » : plus de 7 jours (8)", "entrée « electricite » : dates illisibles (AAAA-MM-JJ)", RETARD.motif]);
  });
});
