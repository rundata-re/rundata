import { describe, expect, it } from "vitest";
import { resume } from "../src/tools/resume.js";
import { periodeCoupure } from "../src/tools/coupures.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import { noticeCard } from "../src/web/domains.js";
import { pageOf } from "../src/web/places.js";
import { rssItems } from "../src/web/rss.js";

const NOW = new Date("2026-11-20T06:30:00Z");
const copy = <T>(value: T) => ({ value, fetchedAt: new Date(NOW.getTime() - 60_000), stale: false });
// A notice that writes no start (« dès maintenant ») and its end only: tools/coupures.ts gives `de` undefined.
const sansDebut = { titre: "Incident : fuite sur le réseau", communes: ["Saint-Louis"], distributeur: "runéo", publie_le: "20/11/2026 à 09:40", lien: "https://example.org/avis", texte: "Suite à une fuite, coupure dès maintenant.", secteurs: [], coupure: { de: undefined, a: "vendredi 20/11 à 12:00", etat: undefined } };

describe("a cut whose notice writes no start", () => {
  it("is said by its end, never « undefined »", () => {
    expect(periodeCoupure({ a: "vendredi 20/11 à 12:00" })).toBe("jusqu'au vendredi 20/11 à 12:00");
    expect(periodeCoupure({ de: "lundi 23/11 à 08:00" })).toBe("à partir du lundi 23/11 à 08:00");
    expect(periodeCoupure({ de: "lundi 23/11 à 08:00", a: "lundi 23/11 à 12:00" })).toBe("lundi 23/11 à 08:00 → lundi 23/11 à 12:00");
    expect(periodeCoupure({})).toBe("");
  });

  it("on /aujourdhui, /coupures-eau and the commune's feed", () => {
    const p = pageOf("saint-louis")!;
    const coupures = copy({ resume: "", couverture: "", a_savoir: "", sources: [], communes_suivies: [], avis: [sansDebut] });
    const html = aujourdhuiPage("https://rundata.re", p, resume(p, { coupures } as never, NOW), null);
    // Its scripts say « undefined » of their own: the line of the notice only.
    expect(html).toContain('<span class="note">jusqu&#39;au vendredi 20/11 à 12:00</span>');
    expect(html).not.toMatch(/undefined →|à partir du undefined/);

    const card = noticeCard(sansDebut as never);
    expect(card).toContain("<b>Jusqu&#39;au vendredi 20/11 à 12:00</b>");
    expect(card).not.toContain("undefined");

    const [item] = rssItems(p, { coupures: coupures as never }, NOW);
    expect(item.description).toContain("Coupure jusqu'au vendredi 20/11 à 12:00.");
    expect(item.description).not.toContain("undefined");
  });
});
