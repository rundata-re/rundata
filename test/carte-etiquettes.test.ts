import { describe, expect, it } from "vitest";
import { cartePage, recouvertes } from "../src/web/carte.js";
import { CARTE_CSS } from "../src/web/carte-style.js";
import { NOMS_SCRIPT } from "../src/web/map.js";

// /carte at 390 px wrote the figures of stations a few pixels apart over one another (« 21°18° », UX review, 04/11/2026):
// a figure that crosses one already written is hidden, its point kept, and comes back when a zoom pulls them apart.
describe("/carte's station figures", () => {
  it("hide a figure crossing one kept before it, in the order given", () => {
    expect(recouvertes([[0, 0, 20, 10], [15, 5, 35, 15], [40, 0, 60, 10], [18, 9, 30, 20]])).toEqual([false, true, false, true]);
    // Hidden figures do not hide others: the third crosses only the second, which is hidden.
    expect(recouvertes([[0, 0, 20, 10], [15, 0, 35, 10], [30, 0, 50, 10]])).toEqual([false, true, false]);
  });

  it("keep figures that only touch, and those not drawn", () => {
    expect(recouvertes([[0, 0, 20, 10], [20, 0, 40, 10], [0, 10, 20, 20], null])).toEqual([false, false, false, false]);
    expect(recouvertes([])).toEqual([]);
  });

  it("are sorted again after each drawing, zoom and resize, hidden by visibility only", () => {
    const html = cartePage("https://rundata.re");
    expect(html).toContain(`const hide=${recouvertes},tidy=()=>`);
    expect(html).toContain('ts.forEach((t,i)=>t.classList.toggle("kx",h[i]))');
    expect(html).toContain('new MutationObserver(later).observe(svg,{attributes:true,attributeFilter:["viewBox"]});addEventListener("resize",later);');
    expect(html).toContain('KC.frame(true);later()};');
    expect(html).toContain('if(c.id==="stations"||c.id==="pluie")later();');
    expect(CARTE_CSS).toContain(".kmapc .kt.kx{visibility:hidden}");
  });

  // « 3 070 m » under the « 27° » of the station by the Piton des Neiges at 1280 px (accessibility audit, 24/11/2026): the
  // summit's name and height keep off the figures shown, as off a marker's shape (else they are not shown, the figure is),
  // and are placed again once the figures are drawn and sorted.
  it("keep the summits' names off them, placed again once they are sorted", () => {
    expect(NOMS_SCRIPT).toContain(".sp:not(.off) .rg,.sp:not(.off) .kt:not(.kx),");
    expect(NOMS_SCRIPT).toContain('if(e.matches(".mk .sh,.kt"))hard.push(e.tagName==="circle"?[b.x+b.width/2,b.y+b.height/2,b.width/2]:box(b,0))');
    expect(cartePage("https://rundata.re")).toContain('ts.forEach((t,i)=>t.classList.toggle("kx",h[i]));document.dispatchEvent(new Event("change"))};');
  });
});
