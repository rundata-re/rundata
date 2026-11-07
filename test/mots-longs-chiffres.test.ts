import { describe, expect, it } from "vitest";
import { enGrand, motsLongs, syllabes } from "../src/tools/format.js";
import { CSS } from "../src/web/pages.js";

const vu = (s: string) => s.replaceAll("­", "-");

// A tile's figure at 768 px with the text at 200 %: six words longer than their line were cut anywhere, without a hyphen
// (« événemen / ts », « mobilisat / ion », « renouvel / able », « novembr / e », « d'éruptio / n », « annoncé / e »).
describe("the long words of a tile's figure", () => {
  it("cuts a French word between its syllables, two letters before the cut and three after it at least", () => {
    expect(vu(syllabes("événements"))).toBe("évé-ne-ments");
    expect(vu(syllabes("mobilisation"))).toBe("mo-bi-li-sa-tion");
    expect(vu(syllabes("renouvelable"))).toBe("re-nou-ve-la-ble");
    expect(vu(syllabes("novembre"))).toBe("no-vem-bre");
    expect(vu(syllabes("éruption"))).toBe("érup-tion");
    expect(vu(syllabes("annoncée"))).toBe("an-non-cée");
    expect(vu(syllabes("défibrillateurs"))).toBe("dé-fi-bril-la-teurs");
    expect(vu(syllabes("baignade"))).toBe("bai-gnade");
    expect(vu(syllabes("quelquefois"))).toBe("quel-que-fois");
    // Never before an « x », never inside a group of vowels.
    expect(vu(syllabes("exemple"))).toBe("exem-ple");
    expect(vu(syllabes("éoliennes"))).toBe("éo-lien-nes");
  });

  it("puts a long word, or a compound one, in a box that keeps it whole where it fits, its soft hyphens in", () => {
    expect(vu(motsLongs("63 événements"))).toBe(`<span class="mc">63 évé-ne-ments</span>`);
    expect(vu(motsLongs("Pas d&#39;éruption annoncée"))).toBe(`Pas <span class="mc">d&#39;érup-tion</span> <span class="mc">an-non-cée</span>`);
    expect(motsLongs("Saint-Louis, Sainte-Suzanne")).toBe(`<span class="mc">Saint-Louis,</span> <span class="mc">Sainte-Suzanne</span>`);
    expect(motsLongs("3 rendez-vous")).toBe(`3 <span class="mc">rendez-vous</span>`);
  });

  it("leaves short words, names, tags and the text of a name's or a no-break box as they are", () => {
    expect(motsLongs("26 sentiers fermés")).toBe(`26 <span class="mc">sen­tiers</span> fermés`);
    expect(motsLongs("25 °C à Cilaos")).toBe("25 °C à Cilaos");
    expect(motsLongs("éruption à la Fournaise")).toBe(`<span class="mc">érup­tion</span> à la Fournaise`);
    expect(motsLongs(`crise à <span class="nm">Saint-Joseph</span>`)).toBe(`crise à <span class="nm">Saint-Joseph</span>`);
    expect(motsLongs(`<span class="nw">renouvelable</span>`)).toBe(`<span class="nw">renouvelable</span>`);
    expect(motsLongs(`<span class="nom">Sainte-Suzanne</span>`)).toBe(`<span class="nom">Sainte-Suzanne</span>`);
    expect(motsLongs(`<a href="/electricite-renouvelable">EDF</a>`)).toBe(`<a href="/electricite-renouvelable">EDF</a>`);
  });

  it("writes a tile's figure with them, its box never wider than its line", () => {
    expect(vu(enGrand("1 271 défibrillateurs"))).toBe(`1 271 <span class="mc">dé-fi-bril-la-teurs</span>`);
    expect(CSS).toContain(".mc{display:inline-block;max-width:100%;text-decoration:inherit}");
  });
});
