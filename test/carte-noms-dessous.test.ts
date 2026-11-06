import { describe, expect, it } from "vitest";
import { cartePage } from "../src/web/carte.js";

// /carte wrote the communes' names over its layers: « Saint-Leu » covered the figure of its station (UX review,
// 04/11/2026). A measure is read before a name of the background: the layers are drawn over the names, nothing hidden.
describe("/carte's layers", () => {
  const html = cartePage("https://rundata.re");
  const map = html.slice(html.indexOf('id="kmap"'), html.indexOf("</svg>", html.indexOf('id="kmap"')));

  it("are drawn over the communes' names and the summits", () => {
    const layers = map.indexOf('<g class="kcs">');
    expect(layers).toBeGreaterThan(0);
    expect(map.indexOf('<g class="nm"')).toBeGreaterThan(0);
    expect(map.indexOf('<g class="nm"')).toBeLessThan(layers);
    expect(map.indexOf('<g class="pk">')).toBeLessThan(layers);
  });

  it("stay over the rain and the roads, each in its group", () => {
    expect(map.indexOf('class="kpluie"')).toBeLessThan(map.indexOf('<g class="kcs">'));
    expect(map.indexOf('class="rd')).toBeGreaterThan(0);
    expect(map.indexOf('class="rd')).toBeLessThan(map.indexOf('<g class="kcs">'));
    expect(map.match(/<g class="kl kc-[^"]+" data-c="[^"]+"><\/g>/g)?.length).toBe(14);
  });
});
