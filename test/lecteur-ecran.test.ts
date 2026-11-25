import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legende, ROND } from "../src/web/carte-legende.js";
import type { DepuisMinuit } from "../src/web/data.js";
import { departureLi } from "../src/web/domains.js";
import { homePage } from "../src/web/home.js";
import type { StationNow } from "../src/web/data.js";
import { EVITE_SCRIPT, notFoundPage, stationsList } from "../src/web/pages.js";
import { sinceMidnightCard } from "../src/web/lieu-page.js";
import { meteoPage } from "../src/web/meteo-page.js";
import { CSS } from "../src/web/style.js";
import { lu as luCss, separateursEnFlex } from "./lecteur.js";

// What TalkBack reads (test/lecteur.ts), with the site's sheet: a space is the layout's, not the HTML's alone.
const lu = (html: string) => luCss(html, CSS);

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
    // The card is a grid, its value a flex: a space between their boxes is not one for the reader (« Au plus28 °Cà 12:54 »).
    expect(text).toContain("Au plus 28 °C à 12:54");
    expect(text).toContain("Au moins 14,2 °C à 05:42");
  });

  it("/meteo's stations: the temperature, when it was measured, the wind and the rain, each its words", () => {
    const st = { nom: "Bois-Rouge", source: "meteofrance", id: "97409240", lon: 55.65, lat: -20.9, altitude_m: 10, time: "2026-11-24T08:48:00Z", stale: false,
      temperature: 27.3, vent: 4, rafales: 8, direction: 45, pluie_1h: 0 } as StationNow;
    const text = lu(stationsList([st], NOW));
    expect(text).toContain("27,3 °C mesurée le 24/11 à 12:48");
    expect(text).not.toMatch(/[\p{L}\d]\p{Lu}|km\/h\p{L}|[\p{L}\d]pas de pluie/u);
  });

  it("a row of a list, its name and its state (the hikes around a place, the roads of /trafic): « ouvert » its own word", () => {
    const row = `<ul class="rows eau"><li><span><a href="/randonnees/gr-r2">GR R2</a> <small>144,4 km · passe à 0,5 km</small></span> <span class="q-bonne">ouvert</span></li></ul>`;
    expect(lu(row)).toBe("GR R2 144,4 km · passe à 0,5 km ouvert");
  });

  it("the space for the reader moves nothing on screen: never in a box that is itself a flex or a grid", () => {
    const st = { nom: "Bois-Rouge", source: "meteofrance", id: "97409240", lon: 55.65, lat: -20.9, altitude_m: 10, time: "2026-11-24T08:48:00Z", stale: false,
      temperature: 27.3, vent: 4, rafales: 8, direction: 45, pluie_1h: 0 } as StationNow;
    for (const html of [homePage(ORIGIN, null, NOW), notFoundPage(ORIGIN, "/nulle-part"), stationsList([st], NOW)])
      expect(separateursEnFlex(html, CSS)).toEqual([]);
  }, 30_000);

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
    // In its list (.rows, a grid), the hidden « ligne » taken out of the flow: its space must not be a collapsible one.
    expect(lu(`<ul class="rows">${departureLi(row("T"), "dans 6 min")}</ul>`)).toMatch(/^ligne T vers St-Denis/);
  });

  it("leaves the others as they are: « E2 », « 32 »", () => {
    expect(lu(`<ul class="rows">${departureLi(row("E2"), "dans 6 min")}</ul>`)).toMatch(/^E2 vers St-Denis/);
    expect(lu(`<ul class="rows">${departureLi(row("32"), "dans 6 min")}</ul>`)).toMatch(/^32 vers St-Denis/);
  });
});

describe("a link of one letter", () => {
  it("is named in words, never read « X majuscule »: the footer's list of the accounts", () => {
    for (const html of [homePage(ORIGIN, null, NOW), notFoundPage(ORIGIN, "/nulle-part")]) {
      const alone = [...html.matchAll(/<a ([^>]*)>(\p{L})<\/a>/gu)];
      expect(alone.length).toBeGreaterThan(0);
      for (const m of alone) expect(m[1]).toMatch(/aria-label="[^"]+ [^"]+"/);
    }
  });
});
