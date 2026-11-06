import { describe, expect, it } from "vitest";
import { RELIEF_LEGER, RELIEF_PATH, RELIEF_SCRIPT, W } from "../src/web/map.js";

type Fn = (...a: never[]) => void;

/**
 * A map of `width` px on screen whose viewBox is `vb` wide, with its relief image (reliefImage()), for the script; `href`,
 * the file named in the page (the home page's map).
 */
function map(width: number, vb = W, href?: string) {
  const attrs = new Map<string, string>(href ? [["href", href]] : []);
  const on = new Map<string, Fn>();
  const svg = {
    clientWidth: width,
    getBoundingClientRect: () => ({ width: svg.clientWidth }),
    viewBox: { baseVal: { width: vb } },
    querySelectorAll: () => [image],
  };
  const image = {
    ownerSVGElement: svg,
    dataset: {} as Record<string, string>,
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    addEventListener: (t: string, f: Fn) => void on.set(t, f),
  };
  return { svg, image, href: () => attrs.get("href"), fail: () => on.get("error")!() };
}

/** RELIEF_SCRIPT run on `maps`, the page `state` (« complete » once loaded), at `dpr`. */
function run(maps: ReturnType<typeof map>[], dpr = 2, state = "complete") {
  const resized: Fn[] = [];
  const mutated: Fn[] = [];
  const page = new Map<string, Fn>();
  const doc = new Map<string, Fn>();
  const window = {
    devicePixelRatio: dpr,
    ResizeObserver: class { constructor(f: Fn) { resized.push(f); } observe() {} },
    MutationObserver: class { constructor(f: Fn) { mutated.push(f); } observe() {} },
  };
  const document = {
    readyState: state,
    querySelectorAll: () => maps.map((m) => m.image),
    addEventListener: (t: string, f: Fn) => void doc.set(t, f),
  };
  new Function("window", "document", "addEventListener", RELIEF_SCRIPT)(window, document, (t: string, f: Fn) => void page.set(t, f));
  return {
    load: () => page.get("load")!(),
    resize: (m: ReturnType<typeof map>) => resized.forEach((f) => (f as (e: unknown) => void)([{ target: m.svg }])),
    zoom: (m: ReturnType<typeof map>, vb: number) => {
      m.svg.viewBox.baseVal.width = vb;
      mutated.forEach((f) => (f as (e: unknown) => void)([{ target: m.svg }]));
    },
    comes: (m: ReturnType<typeof map>) => (doc.get("carte") as (e: unknown) => void)({ target: { querySelectorAll: () => [m.image] } }),
  };
}

describe("the relief's file of a map, named once the page has loaded", () => {
  it("is the light one for the island on a phone, the full one when the map needs more pixels than it has", () => {
    // /randonnees at 390 px, a density of 2: 314 px on screen, 629 px of relief.
    const phone = map(314);
    run([phone]);
    expect(phone.href()).toBe(RELIEF_LEGER);
    // A density of 3: 942 px, more than the light one's 800.
    const dense = map(314);
    run([dense], 3);
    expect(dense.href()).toBe(RELIEF_PATH);
    // A commune's map: a fifth of the island in 450 px, 2 250 px of relief.
    const commune = map(450, W / 5);
    run([commune], 1);
    expect(commune.href()).toBe(RELIEF_PATH);
  });

  it("keeps the light one named in the page on a phone, and takes the full one for a denser screen", () => {
    // The home page's map at 390 px: 358 px on screen, 716 px of relief at a density of 2, 1 074 at 3.
    const phone = map(358, W, RELIEF_LEGER);
    run([phone]);
    expect(phone.href()).toBe(RELIEF_LEGER);
    const dense = map(358, W, RELIEF_LEGER);
    run([dense], 3);
    expect(dense.href()).toBe(RELIEF_PATH);
  });

  it("waits for the page's load, and for a hidden map to be shown", () => {
    const later = map(314);
    const hidden = map(0);
    const page = run([later, hidden], 2, "loading");
    expect(later.href()).toBeUndefined();
    page.load();
    expect(later.href()).toBe(RELIEF_LEGER);
    expect(hidden.href()).toBeUndefined();
    hidden.svg.clientWidth = 314;
    page.resize(hidden);
    expect(hidden.href()).toBe(RELIEF_LEGER);
  });

  it("takes the full one when the map zooms in, and keeps it once there", () => {
    const m = map(314);
    const page = run([m]);
    page.zoom(m, W / 2);
    expect(m.href()).toBe(RELIEF_PATH);
    page.zoom(m, W);
    expect(m.href()).toBe(RELIEF_PATH);
  });

  it("falls back on the light one when the full one cannot be had, and stays there", () => {
    const m = map(314, W / 5);
    const page = run([m]);
    expect(m.href()).toBe(RELIEF_PATH);
    m.fail();
    expect(m.href()).toBe(RELIEF_LEGER);
    page.zoom(m, W / 10);
    expect(m.href()).toBe(RELIEF_LEGER);
  });

  it("names it for a map put in the page later", () => {
    const m = map(314);
    const page = run([]);
    page.comes(m);
    expect(m.href()).toBe(RELIEF_LEGER);
  });
});
