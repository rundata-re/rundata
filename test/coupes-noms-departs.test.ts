import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { departureLi, lienNom, nomsCoupables } from "../src/web/domains.js";
import { CSS } from "../src/web/pages.js";
import { publierPage } from "../src/web/publier.js";

// The rules of the narrow-screen block (under 19.9 rem), as the sheet writes them.
const etroit = CSS.slice(CSS.indexOf("@media (max-width:19.9rem){body{"), CSS.indexOf(".btn{flex-wrap:wrap}}", CSS.indexOf("@media (max-width:19.9rem){body{")));

describe("a name with a « . » or a capital inside, which Chrome does not hyphenate", () => {
  it("may go to the next line after its « . » and before its inner capital, in the text only", () => {
    expect(nomsCoupables("partagés sur Sensor.Community, ni étalonnés")).toBe("partagés sur Sensor.<wbr>Community, ni étalonnés");
    expect(nomsCoupables("3 · OpenAgenda")).toBe("3 · Open<wbr>Agenda");
    // An address and a sentence's end stay as they are; a tag and its attributes are never touched.
    expect(nomsCoupables("sur rundata.re. Le site")).toBe("sur rundata.re. Le site");
    expect(nomsCoupables('<a href="https://openagenda.com/OpenAgenda" title="OpenAgenda">x</a>')).toBe('<a href="https://openagenda.com/OpenAgenda" title="OpenAgenda">x</a>');
  });

  it("in a link, keeps the link's whole text as its name, as an address-link does", () => {
    expect(lienNom("https://maps.sensor.community/", "Sensor.Community", ' rel="noopener"')).toBe(
      '<a href="https://maps.sensor.community/" rel="noopener" aria-label="Sensor.Community">Sensor.<wbr>Community</a>',
    );
    // A text without such a name is written as it is, with no aria-label.
    expect(lienNom("https://rundata.re/", "le site de rundata.re")).toBe('<a href="https://rundata.re/">le site de rundata.re</a>');
  });

  it("is written so in the pages' text and links' text, wherever a name has a « . » before a capital (a link through lienNom)", () => {
    const dir = new URL("../src/web/", import.meta.url);
    const nus = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) =>
        readFileSync(new URL(f, dir), "utf8")
          .split("\n")
          .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
          .flatMap((l) => [...l.matchAll(/(<a\b[^>]*>|>)([^<>`$]*)</g)].filter((m) => /\p{Ll}\.\p{Lu}\p{Ll}/u.test(m[2])).map((m) => `${f} ${m[2]}`)),
      );
    expect(nus).toEqual([]);
  });

  it("never goes into a tool's answer: no <wbr>, nor nomsCoupables, outside the site's pages", () => {
    const fichiers = (dir: URL): URL[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "web" ? [] : fichiers(new URL(`${e.name}/`, dir))) : e.name.endsWith(".ts") ? [new URL(e.name, dir)] : []));
    const avec = fichiers(new URL("../src/", import.meta.url)).filter((f) => /<wbr>|nomsCoupables/.test(readFileSync(f, "utf8")));
    expect(avec.map((f) => f.pathname.split("/src/")[1])).toEqual([]);
  });

  it("has its place in /publier's titles (« Open<wbr>Agenda »), never in a link, an attribute or the page's title", () => {
    const page = publierPage("https://rundata.re");
    expect(page).toContain('<h3 id="openagenda">3 · Open<wbr>Agenda</h3>');
    expect(page.match(/<a\b[^>]*>(?:(?!<\/a>).)*<\/a>/gs)!.filter((x) => x.includes("<wbr>"))).toEqual([]);
    expect(page).not.toMatch(/="[^"]*<wbr>/);
    expect(page.slice(page.indexOf("<title>"), page.indexOf("</title>"))).not.toContain("<wbr>");
    // No word changes: without its <wbr>, the page is the same text.
    expect(page.replaceAll("<wbr>", "")).toContain('<h3 id="openagenda">3 · OpenAgenda</h3>');
  });
});

describe("a bus departure", () => {
  const li = departureLi({ ligne: "GECK", direction: "Gare de Saint-Joseph", reseau: "CarSud", dans_min: 12, heure: "08:40", trajet: "/bus/trajet/x" } as Parameters<typeof departureLi>[0], "dans 12 min", "08:40");

  it("has its line, its direction with the network, then its time", () => {
    expect(li).toMatch(/^<li><b>GECK<\/b><span><a href="\/bus\/trajet\/x">vers .*<\/a> <span class="note">\(CarSud\)<\/span><\/span><span class="note">dans 12 min<\/span><\/li>$/);
  });

  it("keeps its line's code whole at 100 %: a column as wide as the code, 2.6 rem at least (« GECK » was « GEC / K »)", () => {
    expect(CSS).toContain(".rows.departs li{grid-template-columns:minmax(2.6rem,max-content) minmax(0,1fr)}");
  });

  it("uses the whole row on a narrow screen: the direction from the line's line, the time below, « (Kar'Ouest) » whole at 200 %", () => {
    expect(etroit).toContain(".rows.departs li{display:block}.rows.departs li>b{margin-right:.6rem}.rows.departs li>:last-child{display:block;margin-top:.3rem}");
  });
});

describe("a list of figures and a page's key fact on a narrow screen", () => {
  it("puts the figure under its name, which has the whole line (« Saint-Leu » was « Sain / t- / Leu » at 200 %)", () => {
    expect(etroit).toContain(".bars li{grid-template-columns:minmax(0,1fr)}");
  });

  it("writes a key fact at 1.25 rem, so that « Réunion, » fits the line at 200 % (it was « Réunio / n »)", () => {
    expect(etroit).toContain(".facts dd{font-size:1.25rem}");
  });
});

describe("the home page's title under a page zoom", () => {
  it("keeps its block in the block's width, never the width of « Réunion »", () => {
    expect(CSS).toContain(".hero-txt{display:grid;grid-template-columns:minmax(0,1fr);");
  });

  it("is at most a fifth of the width under 190 px (a 320 px screen at 200 %), so that « Réunion » fits its column", () => {
    expect(CSS).toContain("@media (max-width:190px){.hero h1{font-size:min(2.6rem,20vw)}}");
  });
});
