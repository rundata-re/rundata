import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { LISTE_STATIONS_JS, METEO_SCRIPT } from "../src/web/meteo-carte.js";

// The stations' list of /meteo, folded to its 12 first rows (pages.ts: #stl.plie, nth-child(n+13) not shown), run on
// a page of 60 stations with a link to `hash`: what is unfolded and brought into view, at the load or on a new link.
const FOLD = 12;
function page(hash: string, opts: { commune?: string; loading?: boolean } = {}) {
  const on: Record<string, (() => void)[]> = {};
  const seen: string[] = [];
  const cls = new Set(["stations", "plie"]);
  const stl: Record<string, unknown> = { classList: { remove: (c: string) => cls.delete(c), contains: (c: string) => cls.has(c) } };
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: i === 30 ? "st-bellevue-bras-panon" : i === 3 ? "st-le-port" : `st-${i}`,
    hidden: false,
    dataset: { c: i === 30 ? "Bras-Panon" : "Saint-Denis", z: String(i), t: "20", n: `S${i}` },
    parentElement: stl,
    // Shown: not hidden by its commune, and among the first rows or the list unfolded.
    getClientRects() { return this.hidden || (cls.has("plie") && rows.indexOf(this) >= FOLD) ? [] : [{}]; },
    scrollIntoView() { seen.push(this.id); },
  }));
  Object.assign(stl, { children: rows, querySelectorAll: () => rows });
  const button = { attrs: { "aria-expanded": "false" } as Record<string, string>, parentElement: { hidden: false }, setAttribute(k: string, v: string) { this.attrs[k] = v; }, addEventListener() {} };
  const sel = { value: opts.commune ?? "", addEventListener() {} };
  if (opts.commune) rows.forEach((r) => (r.hidden = r.dataset.c !== opts.commune));
  const ids: Record<string, unknown> = { stl, stm: button, stc: sel };
  const location = { hash };
  runInNewContext(LISTE_STATIONS_JS, {
    location,
    document: { readyState: opts.loading ? "loading" : "complete", getElementById: (id: string) => ids[id] ?? rows.find((r) => r.id === id) ?? null, querySelectorAll: () => [] },
    addEventListener: (e: string, f: () => void) => (on[e] ??= []).push(f),
  });
  const fire = (e: string) => on[e]?.forEach((f) => f());
  return { folded: () => cls.has("plie"), seen, button, sel, rows, location, fire };
}

describe("stations' list of /meteo: the station aimed at is shown", () => {
  it("unfolds the list for a direct link to a folded station, and brings its row into view", () => {
    const p = page("#st-bellevue-bras-panon");
    expect(p.folded()).toBe(false);
    expect(p.seen).toEqual(["st-bellevue-bras-panon"]);
    // The button « Voir les 60 stations » says it, and goes, as when it is pressed.
    expect(p.button.attrs["aria-expanded"]).toBe("true");
    expect(p.button.parentElement.hidden).toBe(true);
  });

  it("unfolds nothing for a station already shown, nor without a station aimed at", () => {
    for (const hash of ["#st-le-port", "", "#carte", "#st-inconnue", "#%E0"]) {
      const p = page(hash);
      expect(p.folded(), hash).toBe(true);
      expect(p.seen, hash).toEqual([]);
      expect(p.button.attrs["aria-expanded"], hash).toBe("false");
      expect(p.button.parentElement.hidden, hash).toBe(false);
    }
  });

  it("does it on a new link too (a station's marker of the map), and at the load once the page's scripts have run", () => {
    const p = page("");
    p.location.hash = "#st-bellevue-bras-panon";
    p.fire("hashchange");
    expect([p.folded(), p.seen]).toEqual([false, ["st-bellevue-bras-panon"]]);
    // While the page loads, the list is not folded yet ([data-js] still hidden): it waits for DOMContentLoaded.
    const q = page("#st-bellevue-bras-panon", { loading: true });
    expect(q.seen).toEqual([]);
    q.fire("DOMContentLoaded");
    expect([q.folded(), q.seen]).toEqual([false, ["st-bellevue-bras-panon"]]);
  });

  it("shows every commune again when the station aimed at is of another", () => {
    const p = page("#st-le-port", { commune: "Bras-Panon" });
    expect(p.sel.value).toBe("");
    expect(p.rows.every((r) => !r.hidden)).toBe(true);
    expect(p.seen).toEqual(["st-le-port"]);
  });

  it("is the start of the page's script", () => {
    expect(METEO_SCRIPT.startsWith(LISTE_STATIONS_JS)).toBe(true);
  });
});
