import { describe, expect, it } from "vitest";
import { AGENDAS, echecPlanifie, gardeMs, nonServie } from "../src/providers/agenda.js";
import { silentOf } from "../src/tools/agenda.js";
import { derniereLecture } from "../src/tools/sport.js";

// 24/11/2026: saintjoseph.re answered the scheduled event once on 23/11 at 18:26, then no more (522). Its copy, older than
// its `garde`, was said « dernière lecture le 23/11 à 18:26 », its failures after it left out: resume_du_jour and
// /aujourdhui/saint-joseph no longer said that the commune's site does not answer, as sites_sans_reponse does.
const SJ = AGENDAS.find((a) => a.id === "saint_joseph")!;
const NOW = Date.parse("2026-11-23T23:40:00Z"); // 24/11 03:40 at La Réunion
const COPY = Date.parse("2026-11-23T14:26:00Z"); // 23/11 18:26
const TRY = Date.parse("2026-11-23T23:05:00Z"); // 24/11 03:05

const bundleOf = (entries: Record<string, { value: unknown; fetchedAt: number }>) => ({
  peek: (k: string) => (entries[k] ? { ...entries[k], ageMs: NOW - entries[k].fetchedAt } : undefined),
});

describe("an agenda of the scheduled event whose reads fail after its last good one", () => {
  it("is in the scheduled event's list, its copy kept less than a day", () => {
    expect(SJ?.planifie).toBe(true);
    expect(NOW - COPY).toBeGreaterThan(gardeMs(SJ));
  });

  it("is said read without success at its last try, its site then said without answer", () => {
    const b = bundleOf({ [`agenda:${SJ.id}`]: { value: [], fetchedAt: COPY }, [echecPlanifie(SJ)]: { value: true, fetchedAt: TRY } });
    const r = nonServie(b, SJ)!;
    expect(derniereLecture(r)).toBe("dernière lecture sans succès (le 24/11 à 03:05)");
    const silent = silentOf(undefined, "Saint-Joseph", "24/11 03:40", new Date(NOW), [`${SJ.nom} : ${derniereLecture(r)}`]);
    expect(silent.map((x) => x.at)).toEqual(["24/11 03:05"]);
  });

  it("is said by its last good read when no try failed after it, or when the site answered with nothing", () => {
    expect(derniereLecture(nonServie(bundleOf({ [`agenda:${SJ.id}`]: { value: [], fetchedAt: COPY } }), SJ)!)).toBe("dernière lecture le 23/11 à 18:26");
    const empty = bundleOf({ [`agenda:${SJ.id}`]: { value: [], fetchedAt: COPY }, [echecPlanifie(SJ)]: { value: "vide", fetchedAt: TRY } });
    expect(derniereLecture(nonServie(empty, SJ)!)).toBe("dernière lecture le 23/11 à 18:26");
  });

  it("is served while its copy is young enough, whatever failed since", () => {
    const young = bundleOf({ [`agenda:${SJ.id}`]: { value: [], fetchedAt: NOW - 3600_000 }, [echecPlanifie(SJ)]: { value: true, fetchedAt: NOW - 600_000 } });
    expect(nonServie(young, SJ)).toBeUndefined();
  });
});
