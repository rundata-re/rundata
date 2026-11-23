import { describe, expect, it } from "vitest";
import * as feux from "../src/providers/feux.js";
import * as irve from "../src/providers/irve.js";
import { cite, citerOf, DATED_BY } from "../src/tools/citer.js";
import { KEY as ACTUALITES_KEY } from "../src/providers/actualites.js";
import { collecteAnswer } from "../src/tools/collecte.js";
import { credits } from "../src/tools/format.js";
import { fraicheur } from "../src/tools/fraicheur.js";
import { prodAge } from "../src/tools/resume.js";

const t = (s: string) => Date.parse(`${s}+04:00`);
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("the AI tools say what their pages say", () => {
  it("cites NASA FIRMS by its short name, never its English attribution, and keeps the attribution whole in sources", () => {
    const p = { sources: credits([feux.SOURCE]) };
    const c = citerOf("vigilance_meteo", p);
    expect(c).toBe("rundata.re, d'après NASA FIRMS");
    expect(c).not.toMatch(/acknowledge|\(/);
    expect(p.sources[0].attribution).toBe(feux.SOURCE.attribution);
  });

  it("never cites a charging station as the station of a measurement", () => {
    const p = { lieu: { trouve: "Saint-Pierre" }, sources: credits([irve.SOURCE]), stations: [{ station: "IMMODEX", commune: "Saint-Pierre" }] };
    expect(citerOf("bornes_recharge", p)).not.toContain("station");
    expect(citerOf("velos_libre_service", { ...p, sources: [] })).toBe("rundata.re");
  });

  it("does not credit the TCO for a commune whose waste is collected by another intercommunality", () => {
    const r = body(collecteAnswer("Saint-Pierre"));
    expect(r.resume).toMatch(/CIVIS/);
    expect(r.sources).toEqual([]);
    expect(citerOf("annuaire_services_publics", r)).toBe("rundata.re");
    // A street of the West: the TCO's calendar, credited.
    expect(body(collecteAnswer("Saint-Paul")).sources[0].attribution).toBe("Territoire de l'Ouest (TCO)");
  });

  it("dates the news' answer by the media's read, the prefecture's slower read kept in the span", () => {
    // actualites at Saint-Pierre, 23/11/2026 12:55: « lue à 12:01 » over news of 12:40, the media read every 5 minutes.
    const now = new Date(t("2026-11-23T12:55:00"));
    const medias = { key: "actualites:fil", fetchedAt: t("2026-11-23T12:53:00"), stale: false, freshSeconds: 300 };
    const prefecture = { key: "prefecture:communiques:rubrique", fetchedAt: t("2026-11-23T12:01:00"), stale: false, freshSeconds: 900 };
    const r = { content: [{ type: "text", text: JSON.stringify({ resume: "…", sources: [] }) }] };
    expect(DATED_BY.actualites).toEqual([ACTUALITES_KEY]);
    const f = body(cite("actualites", r, { lectures: [medias, prefecture], now })).fraicheur;
    expect(f.lue_a).toBe("23/11 12:53");
    expect(f.lectures).toEqual({ plus_ancienne: "23/11 12:01", plus_recente: "23/11 12:53" });
    // Without a read of the media (a copy of the prefecture alone): that read.
    expect(fraicheur({}, [prefecture], now, { cles: ["actualites:fil"] }).lue_a).toBe("23/11 12:01");
    // Another tool reading the same two: the oldest, as before.
    expect(body(cite("restrictions_eau", r, { lectures: [medias, prefecture], now })).fraicheur.lue_a).toBe("23/11 12:01");
  });

  it("says EDF's line of three days ago as electricite says it in the day's summary, its age counted to now", () => {
    const built = new Date(t("2026-11-23T12:30:00"));
    const now = new Date(t("2026-11-23T12:53:00"));
    const old = { heure_mesure: "20/11 17:10 heure de La Réunion", age_min: 4 * 1440 - 280 };
    expect(prodAge(old, built, now)).toEqual({
      perimee: true,
      avertissement: expect.stringMatching(/^Dernière mesure de production lue chez EDF : le 20\/11 à 17:10, il y a \d+ jours?\. Ce n'est pas la production de maintenant\.$/),
    });
    // A line of 12:40 read at 12:45, served at 12:53: of now.
    expect(prodAge({ heure_mesure: "23/11 12:40 heure de La Réunion", age_min: 5 }, new Date(t("2026-11-23T12:45:00")), now)).toEqual({});
    // A line of 11:40 in a copy of 12:30, served at 12:53: 73 minutes, past the hour.
    expect(prodAge({ heure_mesure: "23/11 11:40 heure de La Réunion", age_min: 50 }, built, now)).toMatchObject({ perimee: true });
  });
});
