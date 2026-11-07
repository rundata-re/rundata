import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adresseCoupable, departureLi, lienNom, nomsCoupables, traficPage } from "../src/web/domains.js";
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
    // A text with neither a name nor an address is written as it is, with no aria-label.
    expect(lienNom("/trafic", "la page circulation")).toBe('<a href="/trafic">la page circulation</a>');
  });

  it("in a link, may cut an address after each « . » and « @ » (« data.gou|v.fr » at 200 %), never a sentence's end", () => {
    expect(lienNom("https://www.data.gouv.fr/x", "sa fiche sur data.gouv.fr", ' rel="noopener"')).toBe(
      '<a href="https://www.data.gouv.fr/x" rel="noopener" aria-label="sa fiche sur data.gouv.fr">sa fiche sur data.<wbr>gouv.<wbr>fr</a>',
    );
    expect(lienNom("mailto:contact@rundata.re", "contact@rundata.re")).toBe(
      '<a href="mailto:contact@rundata.re" aria-label="contact@rundata.re">contact@<wbr>rundata.<wbr>re</a>',
    );
    expect(lienNom("https://www.3237.fr", "Pharmacie de garde : 3237.fr")).toContain(">Pharmacie de garde : 3237.<wbr>fr</a>");
    // A « . » before a space or a capital is a sentence's end or a name's (nomsCoupables), and « 1.0 » a version.
    expect(lienNom("/x", "Lire la suite. Puis ODbL 1.0")).toBe('<a href="/x">Lire la suite. Puis ODbL 1.0</a>');
    // The text is escaped once, the address too.
    expect(lienNom("https://x.re/?a=1&b=2", "l'eau sur eaudurobinet.re")).toBe(
      '<a href="https://x.re/?a=1&amp;b=2" aria-label="l&#39;eau sur eaudurobinet.re">l&#39;eau sur eaudurobinet.<wbr>re</a>',
    );
  });

  it("is used by every link whose words hold an address, other than « rundata.re », the site's own name", () => {
    // A link written in the source with an address in its words (<a href="…">monenfant.fr</a>, also inside <b>) is cut in
    // the middle of it on a narrow line: lienNom() or lienAdresse() writes it.
    const dir = new URL("../src/web/", import.meta.url);
    const nus = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) =>
        readFileSync(new URL(f, dir), "utf8")
          .split("\n")
          .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
          .flatMap((l) =>
            [...l.matchAll(/<a\b[^>]*>((?:<\/?(?:b|strong|em|i)>|[^<])*)<\/a>/g)]
              .map((m) => [m[0], m[1].replaceAll(/<\/?(?:b|strong|em|i)>/g, "")])
              .filter((m) => !m[1].includes("${") && (m[1].match(/[\w-]+(?:[.@][\w-]+)+/g) ?? []).some((x) => /[a-z0-9][.@][a-z]/.test(x) && x !== "rundata.re"))
              .map((m) => `${f} ${m[0]}`),
          ),
      );
    expect(nus).toEqual([]);
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

  it("never goes into a tool's answer: no <wbr>, nor nomsCoupables, lienNom or adresseCoupable, outside the site's pages", () => {
    const fichiers = (dir: URL): URL[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "web" ? [] : fichiers(new URL(`${e.name}/`, dir))) : e.name.endsWith(".ts") ? [new URL(e.name, dir)] : []));
    const avec = fichiers(new URL("../src/", import.meta.url)).filter((f) => /<wbr>|nomsCoupables|lienNom|adresseCoupable/.test(readFileSync(f, "utf8")));
    expect(avec.map((f) => f.pathname.split("/src/")[1])).toEqual([]);
  });

  it("has its place in /publier's titles (« Open<wbr>Agenda »), never in a link without its whole name, an attribute or the page's title", () => {
    const page = publierPage("https://rundata.re");
    expect(page).toContain('<h3 id="openagenda">3 · Open<wbr>Agenda</h3>');
    // A link may have one (lienNom: « data.<wbr>gouv.<wbr>fr » at the foot), with its whole text in aria-label.
    expect(page.match(/<a\b[^>]*>(?:(?!<\/a>).)*<\/a>/gs)!.filter((x) => x.includes("<wbr>") && !x.includes(' aria-label="'))).toEqual([]);
    expect(page).not.toMatch(/="[^"]*<wbr>/);
    expect(page.slice(page.indexOf("<title>"), page.indexOf("</title>"))).not.toContain("<wbr>");
    // No word changes: without its <wbr>, the page is the same text.
    expect(page.replaceAll("<wbr>", "")).toContain('<h3 id="openagenda">3 · OpenAgenda</h3>');
  });
});

describe("an address in a heading, a pill or a button", () => {
  // The words of src/web/'s sources, line by line, out of comments: [file, the element as written, its own words]. Its
  // own words leave out what ${…} writes (an icon, a value) and the tags.
  const ecrits = (motif: RegExp) => {
    const dir = new URL("../src/web/", import.meta.url);
    return readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) =>
        readFileSync(new URL(f, dir), "utf8")
          .split("\n")
          .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
          .flatMap((l) => [...l.matchAll(motif)].map((m) => [f, m[0], sansTags(sansExpressions(m[1]))])),
      );
  };
  // What ${…} writes, with the braces inside it (${f({a: 1})}), is left out.
  const sansExpressions = (t: string) => {
    let out = "", n = 0;
    for (let i = 0; i < t.length; i++) {
      if (n === 0 && t.startsWith("${", i)) { n = 1; i++; continue; }
      if (n > 0) { n += t[i] === "{" ? 1 : t[i] === "}" ? -1 : 0; if (n === 0) out += " "; continue; }
      out += t[i];
    }
    return out;
  };
  // The tags, cut out character by character (never a regex on markup).
  const sansTags = (t: string) => {
    let out = "", dedans = false;
    for (const c of t) { if (c === "<") dedans = true; else if (c === ">") { dedans = false; out += " "; } else if (!dedans) out += c; }
    return out;
  };
  const adresse = (t: string) => (t.match(/[\w\u00AD-]+(?:[.@][\w-]+)+/g) ?? []).some((x) => /[a-z0-9][.@][a-z]/.test(x) && x !== "rundata.re");

  it("may go to the next line after its « . » and « @ », and where a soft hyphen was put, escaped", () => {
    expect(adresseCoupable("info\u00ADtrafic.re")).toBe("info\u00ADtrafic.<wbr>re");
    expect(adresseCoupable("contact@rundata.re")).toBe("contact@<wbr>rundata.<wbr>re");
    expect(adresseCoupable("Bouchons, accidents, travaux. Puis <b>")).toBe("Bouchons, accidents, travaux. Puis &lt;b&gt;");
  });

  it("is never in a button: the address is in the sentence above it (a button at 200 % is narrower than « (infotrafic.re) »)", () => {
    const boutons = ecrits(/<a\b[^>]*\bclass="[^"]*\bbtn\b[^"]*"[^>]*>(.*?)<\/a>/g).filter(([, , t]) => adresse(t));
    expect(boutons.map(([f, e]) => `${f} ${e}`)).toEqual([]);
  });

  it("in a heading or a pill, is written by adresseCoupable(), never by hand (« infotrafic.r » cut by the card's edge)", () => {
    const ecrites = ecrits(/<(?:h[1-6]\b[^>]*|p class="pill"[^>]*)>(.*?)<\/(?:h[1-6]|p)>/g).filter(([, , t]) => adresse(t));
    expect(ecrites.map(([f, e]) => `${f} ${e}`)).toEqual([]);
  });

  it("on /trafic: the button says « Carte officielle ↗ », the card's title and the pill take their soft hyphen, the card keeps its name", () => {
    const page = traficPage("https://rundata.re", null, new Date("2026-11-07T08:00:00Z"));
    expect(page).toContain(`<a class="btn sun" href="https://www.infotrafic.re/">`);
    expect(page).toMatch(/<a class="btn sun" href="https:\/\/www\.infotrafic\.re\/"><svg[^]*?<\/svg>Carte officielle ↗<\/a>/);
    expect(page).toContain(`<h3 aria-label="infotrafic.re ↗"><svg`);
    expect(page).toContain("</svg>info\u00ADtrafic.<wbr>re ↗</h3>");
    expect(page.replaceAll("\u00a0", " ")).toContain("Bouchons, accidents, travaux : info\u00ADtrafic.<wbr>re</p>");
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
