import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legende, ROND } from "../src/web/carte-legende.js";
import type { DepuisMinuit } from "../src/web/data.js";
import { departureLi } from "../src/web/domains.js";
import { homePage } from "../src/web/home.js";
import { EVITE_SCRIPT, meteoPage, notFoundPage, sinceMidnightCard } from "../src/web/pages.js";

// What TalkBack reads, from its pass on the emulator (24/11/2026, TalkBack 14.2): the text of a piece of HTML as a screen
// reader joins it. What is hidden from it is dropped, tags join their texts with nothing between them: two words in two
// elements with no space between them are read as one (« bonnemoyennemauvaise »).
const lu = (html: string) => {
  // A walk over the tags, not a replacement: what follows a tag is read, a tag itself adds nothing.
  let out = "";
  let i = 0;
  /** Where the element opened by the tag ending at `from` ends, its nested namesakes counted. */
  const fin = (name: string, from: number) => {
    const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
    re.lastIndex = from;
    for (let depth = 1, m; (m = re.exec(html)); ) if ((depth += m[1] ? -1 : 1) === 0) return re.lastIndex;
    return html.length;
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { out += html.slice(i); break; }
    out += html.slice(i, lt);
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const tag = html.slice(lt, gt + 1);
    const name = /^<([a-z0-9]+)/i.exec(tag)?.[1].toLowerCase();
    const hidden = /\saria-hidden="true"/.test(tag) && !tag.endsWith("/>");
    i = name && (name === "script" || name === "style" || hidden) ? fin(name, gt + 1) : gt + 1;
  }
  return out.replace(/&nbsp;|\u00a0|\u202f/g, " ").replace(/\s+/g, " ").trim();
};

const ORIGIN = "https://rundata.re";
const NOW = new Date("2026-11-24T09:00:00Z");

describe("« Aller au contenu », for TalkBack", () => {
  for (const [name, html] of [
    ["the home page", homePage(ORIGIN, null, NOW)],
    ["/meteo", meteoPage(ORIGIN, null, NOW)],
    ["a page not found", notFoundPage(ORIGIN, "/nulle-part")],
  ] as const) {
    it(`${name}: the main landmark takes no focus, so it is not read as one block; the link's script is there`, () => {
      expect(html).toContain('<a class="evite" href="#contenu">');
      expect(html).toContain('<main id="contenu">');
      expect(html).not.toMatch(/<main[^>]*tabindex/);
      expect(html).toContain(EVITE_SCRIPT);
    });
  }

  /** The script against a page made of `items` (what `querySelectorAll` finds, in the page's order). */
  const run = (items: { tag: string; shown: boolean; link?: boolean }[]) => {
    let click: ((e: { preventDefault: () => void }) => void) | undefined;
    const els = items.map((x) => ({
      ...x,
      attrs: new Map<string, string>(),
      focused: false,
      getClientRects: () => (x.shown ? [{}] : []),
      matches: (s: string) => s === "a[href]" && !!x.link,
      setAttribute(a: string, v: string) {
        this.attrs.set(a, v);
      },
      focus() {
        this.focused = true;
      },
    }));
    const document = {
      querySelector: (s: string) => (s === ".evite" ? { addEventListener: (_: string, f: typeof click) => (click = f) } : null),
      querySelectorAll: () => els,
    };
    new Function("document", EVITE_SCRIPT)(document);
    let prevented = false;
    click!({ preventDefault: () => (prevented = true) });
    return { els, prevented };
  };

  it("puts the focus on the title, which TalkBack reads alone", () => {
    const { els, prevented } = run([{ tag: "h1", shown: true }]);
    expect(prevented).toBe(true);
    expect(els[0].focused).toBe(true);
    expect(els[0].attrs.get("tabindex")).toBe("-1");
  });

  it("puts it on the vigilance's band first, the one shown: its short line on a phone, a link already", () => {
    const phone = run([{ tag: "a", shown: true, link: true }, { tag: "span", shown: false }, { tag: "h1", shown: true }]);
    expect(phone.els.map((e) => e.focused)).toEqual([true, false, false]);
    expect(phone.els[0].attrs.size).toBe(0);
    const computer = run([{ tag: "a", shown: false, link: true }, { tag: "span", shown: true }, { tag: "h1", shown: true }]);
    expect(computer.els.map((e) => e.focused)).toEqual([false, true, false]);
  });

  it("leaves the link to the browser when there is nothing to read", () => {
    expect(run([{ tag: "h1", shown: false }]).prevented).toBe(false);
  });
});

describe("words in two elements, read with their space", () => {
  it("the legend of the maps of discs (/eau, /bornes, /velos): one word per mark, then the line under them", () => {
    const html = legende(
      [
        { forme: "rond", couleur: ROND.vert, dit: "bonne" },
        { forme: "rond", couleur: ROND.orange, dit: "moyenne" },
        { forme: "rond", couleur: ROND.gris, dit: "mauvaise" },
      ],
      "Qualité au dernier prélèvement",
    );
    expect(lu(html)).toBe("bonne moyenne mauvaise Qualité au dernier prélèvement");
  });

  it("« Depuis minuit » on /meteo/<lieu>: the label, the value, its hour", () => {
    const j: DepuisMinuit = {
      station: "Cilaos",
      distance_km: 0.4,
      pertinence: "",
      periode: "depuis minuit",
      maximum: { valeur: 28, unite: "°C", quand: "à 12:54" },
      minimum: { valeur: 14.2, unite: "°C", quand: "à 05:42" },
      avertissements: [],
    };
    const text = lu(sinceMidnightCard(j));
    expect(text).toContain("Au plus 28 °C à 12:54");
    expect(text).toContain("Au moins 14,2 °C à 05:42");
  });

  it("no other piece of the site puts a text and another one in two elements side by side without a space", () => {
    // The same pattern: « </span><b> », « </b><span> », « …<small> ». Kept: what a screen reader does not read
    // (aria-hidden, a link named by aria-label), and the bubbles of the maps, hidden from it.
    const glued = /<\/(span|b|strong|em|i|small|abbr|time)><(span|b|strong|em|small|abbr|time)[ >]|(\}|[0-9A-Za-zÀ-ÿ]|<\/a>)<small[ >]/;
    const kept = /mtip|kcur-m|class="ligne"|cta-ia|details class="menu"|class="pl/;
    const found: string[] = [];
    for (const f of readdirSync("src/web").filter((x) => x.endsWith(".ts"))) {
      readFileSync(`src/web/${f}`, "utf8").split("\n").forEach((l, i) => {
        if (glued.test(l) && !kept.test(l)) found.push(`${f}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});

describe("a bus line of one letter", () => {
  const row = (ligne: string) =>
    ({ ligne, direction: "ST-DENIS", reseau: "Car Jaune", trajet: "/bus/trajet/carjaune/1/x", dans_min: 6, heure: "13:10" }) as Parameters<typeof departureLi>[0];

  it("is read « ligne T », not « T majuscule »", () => {
    expect(lu(departureLi(row("T"), "dans 6 min"))).toMatch(/^ligne T vers St-Denis/);
  });

  it("leaves the others as they are: « E2 », « 32 »", () => {
    expect(lu(departureLi(row("E2"), "dans 6 min"))).toMatch(/^E2 vers St-Denis/);
    expect(lu(departureLi(row("32"), "dans 6 min"))).toMatch(/^32 vers St-Denis/);
  });
});
