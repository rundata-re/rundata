import { describe, expect, it } from "vitest";
import data from "../src/vie/couverture.json" with { type: "json" };
import { antennesPage } from "../src/web/antennes.js";
import { couvertureFile, couverturePath, couvertureScript, MOTS } from "../src/web/couverture.js";
import { estDeclare } from "../src/web/scripts-declares.js";
import { CSS } from "../src/web/style.js";

/** The section's buttons, map and caption, as the script sees them; `fetch` answers with `answer`. */
function run(answer: Record<string, string> | null) {
  const checked = { co: "aucun", ct: "4g" };
  const path = { d: data.couches["aucun-4g"], getAttribute: () => path.d, setAttribute: (_: string, v: string) => (path.d = v) };
  const part = { textContent: "" };
  const fig = { querySelector: (s: string) => (s === "path.trou" ? path : s === ".cpart" ? part : null) };
  let change: () => void = () => {};
  const f = {
    hidden: true,
    closest: () => fig,
    querySelector: (s: string) => ({ value: s.includes("co") ? checked.co : checked.ct }),
    addEventListener: (_: string, fn: () => void) => (change = fn),
  };
  const asked: string[] = [];
  const fetch = (u: string) => {
    asked.push(u);
    return Promise.resolve({ ok: !!answer, json: () => Promise.resolve(answer) });
  };
  new Function("document", "fetch", couvertureScript())({ querySelector: (s: string) => (s === ".couvf" ? f : null) }, fetch);
  const pick = async (co: string, ct: string) => {
    Object.assign(checked, { co, ct });
    change();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { f, path, part, asked, pick };
}

describe("/antennes, the zones with no declared coverage (Arcep)", () => {
  it("bundles the Arcep's quarter: ten layers, the share of each, the four operators and « aucun »", () => {
    expect(data.trimestre).toBe("2026_T2");
    expect(data.date).toBe("2026-06-30");
    expect(Object.keys(data.couches).sort()).toEqual(["OF", "SRR", "TELC", "ZEOP", "aucun"].flatMap((o) => [`${o}-4g`, `${o}-voix`]).sort());
    for (const d of Object.values(data.couches)) expect(d).toMatch(/^M\d+ \d+l[-\d ]+z(M\d+ \d+l[-\d ]+z)*$/);
    // No operator covers less than the four together.
    for (const t of ["4g", "voix"] as const)
      for (const o of ["OF", "SRR", "TELC", "ZEOP"] as const) expect(data.parts[o][t]).toBeGreaterThanOrEqual(data.parts.aucun[t]);
    expect(data.parts.aucun).toEqual({ voix: 2.1, "4g": 2.8 });
    expect(data.parts.TELC["4g"]).toBe(34.5);
  });

  it("says a declared coverage, checked by sampling, never a measure, with the names of the site", () => {
    const page = antennesPage("https://rundata.re", null);
    expect(page).toContain('<h2 id="h-couv">Zones sans couverture déclarée</h2>');
    expect(page).toContain("C&#39;est la couverture déclarée par les opérateurs, vérifiée par sondage par l&#39;Arcep\u00a0: une carte théorique, pas une mesure.");
    expect(page).toContain("cartes de l&#39;Arcep du 2e\u00a0trimestre 2026 (situation au 30/06/2026)");
    expect(MOTS.intro).not.toMatch(/mesurée/);
    for (const n of ["Aucun opérateur", "Orange", "SFR Réunion", "Free", "Zeop", "Internet 4G", "Appels (2G, 3G)"]) expect(page).toContain(`>${n}</label>`);
    // The Arcep's codes never show: its visible words are the site's names (the page's ANFR note names Telco OI once, apart).
    const section = page.slice(page.indexOf('<h2 id="h-couv">'), page.indexOf('<h2 id="h-communes">'));
    // The visible text: what lies between the tags, outside the scripts and styles (cut at their bounds, no regex to strip).
    let visible = "";
    for (let i = 0; i < section.length; ) {
      const lt = section.indexOf("<", i);
      visible += section.slice(i, lt < 0 ? section.length : lt) + " ";
      if (lt < 0) break;
      const tag = /^<(script|style)\b/i.exec(section.slice(lt, lt + 8));
      const end = tag ? section.indexOf(`</${tag[1].toLowerCase()}>`, lt) : section.indexOf(">", lt);
      i = end < 0 ? section.length : tag ? end + tag[1].length + 3 : end + 1;
    }
    expect(visible).not.toMatch(/Telco OI|TELC|ZEOP|\bOF\b|\bSRR\b/);
    // The first layer is in the page, drawn without the script; the nine others are not.
    expect(page).toContain(`<path class="trou" fill-rule="evenodd" d="${data.couches["aucun-4g"]}"/>`);
    expect(page).not.toContain(data.couches["TELC-4g"]);
    expect(page).toContain("Arcep, Mon Réseau Mobile");
    expect(estDeclare(couvertureScript())).toBe(true);
  });

  it("serves the nine other layers at a hashed address, kept a year there, five minutes at an older one", async () => {
    const r = couvertureFile(couverturePath())!;
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const d = (await r.json()) as Record<string, string>;
    expect(Object.keys(d)).toHaveLength(9);
    expect(d).not.toHaveProperty("aucun-4g");
    expect(d["TELC-4g"]).toBe(data.couches["TELC-4g"]);
    expect(couvertureFile("/antennes/couverture-ancien.json")!.headers.get("cache-control")).toBe("public, max-age=300");
    expect(couvertureFile("/antennes")).toBeNull();
  });

  it("draws the layer asked for, reading the file once, and says its share", async () => {
    const layers = Object.fromEntries(Object.entries(data.couches).filter(([k]) => k !== "aucun-4g"));
    const s = run(layers);
    expect(s.f.hidden).toBe(false);
    await s.pick("TELC", "4g");
    expect(s.path.d).toBe(data.couches["TELC-4g"]);
    expect(s.part.textContent).toBe("Free, Internet 4G : 34,5\u00a0% de l'île");
    await s.pick("SRR", "voix");
    expect(s.path.d).toBe(data.couches["SRR-voix"]);
    expect(s.part.textContent).toBe("SFR Réunion, Appels (2G, 3G) : 4,2\u00a0% de l'île");
    await s.pick("aucun", "4g");
    expect(s.path.d).toBe(data.couches["aucun-4g"]);
    expect(s.asked).toEqual([couverturePath()]);
  });

  it("says when the file could not be read, and keeps the map as it was", async () => {
    const s = run(null);
    await s.pick("OF", "4g");
    expect(s.part.textContent).toBe("La carte n'a pas pu être chargée\u00a0: réessayez.");
    expect(s.path.d).toBe(data.couches["aucun-4g"]);
  });

  it("draws the zones in a solid colour, the same in light and dark, that the aerial photo has nowhere (27/11/2026)", () => {
    // A pale grey at 60 % read as clouds on the photo at 390 px (dark), a navy as its shadows (light): a magenta, no red
    // nor orange (they say danger on the site), no outline (a white one made the small zones look like clouds again).
    const regles = CSS.match(/\.couvmap\{--cv:([^}]+)\}/g) ?? [];
    expect(regles).toEqual([".couvmap{--cv:#c026d3}"]);
    expect(CSS).toMatch(/\.couvmap \.trou\{fill:var\(--cv\);fill-opacity:\.9;/);
    expect(CSS).not.toMatch(/\.couvmap \.trou\{[^}]*stroke/);
  });
});
