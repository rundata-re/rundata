import { describe, expect, it } from "vitest";
import { CSS } from "../src/web/pages.js";

// /air at 320 px with the text at 150 %: the language choice and the source list went past the screen; nothing moves at 100 %.
describe("larger text on a narrow screen", () => {
  it("lets the second language go under the first, in a pill whose radius is over half its one-line height", () => {
    expect(CSS).toContain(".lang{display:inline-flex;flex-wrap:wrap;gap:.2rem;padding:.2rem;border-radius:calc(1.1rem + 1px);");
    // Half the one-line height: the buttons' .88rem line and .4rem padding each side, the group's .2rem each side, its 1 px border.
    expect(CSS).toContain(".lang button{display:inline-flex;align-items:center;gap:.4rem;font:600 .88rem/1 system-ui,sans-serif;padding:.4rem .8rem;");
    expect((0.88 + 0.8 + 0.4) / 2).toBeLessThan(1.1);
  });

  it("breaks a word of a fact that does not fit on its line", () => {
    expect(CSS).toContain(".facts dd{margin:0;font:800 1.45rem/1.15 system-ui,sans-serif;color:var(--ink);overflow-wrap:anywhere}");
  });
});
