import { describe, expect, it } from "vitest";
import { resume } from "../src/tools/resume.js";
import { periodeCoupure } from "../src/tools/coupures.js";
import { aujourdhuiPage } from "../src/web/aujourdhui.js";
import { courantItem, noticeCard } from "../src/web/domains.js";
import { sentence, shortOf } from "../src/tools/courant.js";
import type { AvisCourant } from "../src/providers/coupures-courant.js";
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

// A block from a mairie with an optional field missing: a sentence that says the source and what is missing, never
// « undefined » nor a hole (UX review of 20/11/2026, « Genres de défaut »).
describe("a mairie's blocks with a field missing", () => {
  const VIDE = /undefined|NaN|null|\[object|Invalid Date|\s[,.]|\(\s*\)|«\s*»|:\s*[.;]/;
  const texte = (html: string) => html.replace(/<[^>]+>/g, "");

  it("a water notice: no start, no end, neither, on its card", () => {
    const base = { ...sansDebut, communes: ["Saint-Philippe"], distributeur: "Mairie de Saint-Philippe" };
    const cards = [
      noticeCard({ ...base, coupure: { de: "lundi 23/11 à 08:00", a: undefined, etat: undefined } } as never),
      noticeCard({ ...base, coupure: { de: undefined, a: "lundi 23/11 à 12:00", etat: "en cours" } } as never),
      noticeCard({ ...base, coupure: undefined } as never),
      noticeCard({ ...base, coupure: { de: undefined, a: undefined, etat: undefined } } as never),
    ];
    expect(cards[0]).toContain("<b>À partir du lundi 23/11 à 08:00</b>");
    expect(cards[1]).toContain("<b>Jusqu&#39;au lundi 23/11 à 12:00</b> <span class=\"note\">(en cours)</span>");
    // No span at all: no empty line, the notice and its source still said.
    expect(cards[2]).not.toContain("<b></b>");
    expect(cards[3]).not.toContain("<b></b>");
    for (const c of cards) {
      expect(texte(c), c).toContain("Mairie de Saint-Philippe");
      expect(texte(c), c).not.toMatch(VIDE);
    }
  });

  it("a power cut relayed by a mairie: one hour only, no hour, no street, no slot", () => {
    const now = new Date("2026-11-20T06:30:00Z");
    const avis = (x: Partial<AvisCourant>): AvisCourant => ({ commune: "Saint-André", titre: "Coupure EDF", publie: "2026-11-19T08:00:00Z", lien: "https://example.org/edf", nature: "programmée", creneaux: [], secteurs: [], ...x });
    const said = [
      sentence(avis({ creneaux: [{ jour: "2026-11-23", de: "08:30", secteurs: ["Rue A"] }] }), now),
      sentence(avis({ creneaux: [{ jour: "2026-11-23", a: "12:00", secteurs: [] }] }), now),
      sentence(avis({ creneaux: [{ jour: "2026-11-23", secteurs: [] }] }), now),
      sentence(avis({}), now),
      sentence(avis({ nature: "en cours", publie: "2026-11-20T06:00:00Z" }), now),
      sentence(avis({ pdf: true }), now),
    ];
    expect(said[0]).toContain("le lundi 23/11 à partir de 08:30, secteur Rue A.");
    expect(said[1]).toContain("le lundi 23/11 jusqu'à 12:00.");
    expect(said[2]).toContain("coupure programmée le lundi 23/11.");
    expect(said[3]).toContain("« Coupure EDF »");
    expect(shortOf({ nature: "programmée", creneaux: [{ jour: "2026-11-23", a: "12:00", secteurs: [] }] }, now)).toBe("coupure d'électricité programmée le lundi 23/11 jusqu'à 12:00");
    for (const s of said) {
      expect(s, s).toMatch(/mairie|EDF/i);
      expect(s, s).not.toMatch(VIDE);
      const li = courantItem({ texte: s, lien: "https://example.org/edf", nature: "programmée" });
      expect(texte(li), li).not.toMatch(VIDE);
    }
  });
});
