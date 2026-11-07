import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cache } from "../src/cache.js";
import { CSS, narrowTwins, STYLE_PATH } from "../src/web/pages.js";
import { pleinEcran } from "../src/web/plein-ecran.js";
import { hash } from "../src/web/pwa.js";
import { site } from "../src/web/site.js";

// Text enlarged by the root's size (the browsers inside Facebook, Instagram and Messenger, Samsung Internet): the
// small-screen rules follow it through their twin on the page's container, the rest of the sheet is as before.
describe("small-screen rules on the page's container", () => {
  it("makes the whole page the container, html, so that the header, the menu and the footer are inside it", () => {
    expect(CSS).toContain("html{scroll-padding-top:5rem;-webkit-text-size-adjust:100%;container:page/inline-size}");
  });

  it("follows each @media (max-width:…rem) of the sheet by its twin @container page, with the same content", () => {
    const media = [...CSS.matchAll(/@media \(max-width:([\d.]+rem)\)\{/g)];
    expect(media.length).toBeGreaterThanOrEqual(16);
    for (const m of media) {
      const start = m.index + m[0].length;
      let end = start;
      for (let depth = 1; depth; end++) depth += CSS[end] === "{" ? 1 : CSS[end] === "}" ? -1 : 0;
      const body = CSS.slice(start, end - 1);
      expect(CSS.slice(end).startsWith(`@container page (max-width:${m[1]}){${body}}`), m[0] + body.slice(0, 60)).toBe(true);
    }
    expect(CSS.match(/@container page /g)?.length).toBe(media.length);
  });

  it("leaves the wide-screen rules, the compound queries and those in px as media queries, without a twin", () => {
    expect(CSS).not.toMatch(/@container page \((min-width|max-height|min-aspect-ratio)/);
    expect(CSS).not.toMatch(/@container page \(max-width:[\d.]+px\)/);
    expect(CSS).toContain("@media (min-width:48rem) and (max-height:35.98rem){");
    expect(CSS).toContain("@media (min-width:58rem){footer.foot .wrap{");
  });

  it("finds every small-screen rule written in src/web in the sheet with its twin", () => {
    const dir = new URL("../src/web/", import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/@media \(max-width:([\d.]+rem)\)\{/g)) {
        expect(CSS, `${f} : ${m[0]}`).toContain(`@container page (max-width:${m[1]}){`);
      }
    }
  });

  it("pairs the sheet once, when the module loads: the same file at the same address on every request", async () => {
    expect(STYLE_PATH).toBe(`/style-${hash(CSS)}.css`);
    expect(narrowTwins(CSS)).not.toBe(CSS); // twins of twins would be added again: CSS is never paired a second time
    const read = async () => {
      const res = await site(new Request(`https://rundata.re${STYLE_PATH}`), new Cache(), () => {});
      return { body: await res!.text(), cache: res!.headers.get("cache-control"), etag: res!.headers.get("etag") };
    };
    const [a, b] = [await read(), await read()];
    expect(a).toEqual(b);
    expect(a.body).toBe(CSS);
    expect(a.cache).toBe("public, max-age=31536000, immutable");
  });

  it("puts the page back where it was when the full screen closes, now and once the map has its size again", () => {
    // With html as a container, scroll anchoring moved the page by up to 2 200 px when the panel's nodes went back.
    const s = pleinEcran({ boite: ".b", carte: ".c", barre: ".z", panneau: [".p"], legende: ".c>figcaption" });
    expect(s).toContain("let on=false,lc=null,y=0;");
    expect(s).toContain("const enter=()=>{on=true;y=scrollY;");
    expect(s).toContain('const put=()=>scrollTo({top:y,behavior:"instant"});');
    const leave = s.slice(s.indexOf("const leave=(lien)=>"), s.indexOf("b.addEventListener("));
    expect(leave).toMatch(/^const leave=\(lien\)=>\{.*root\.classList\.remove\("pe-lock"\);.*if\(!lien\)put\(\);fit\(\);if\(!lien\)requestAnimationFrame\(put\)\};\n$/s);
  });

  it("leaves the page where a link of the full-screen box led, without putting it back", () => {
    // The link's own jump comes after the click handler: a put() at the next frame would undo it.
    const s = pleinEcran({ boite: ".b", carte: ".c", barre: ".z", panneau: [".p"], legende: ".c>figcaption" });
    expect(s).toContain("if(t&&!box.contains(t))leave(true)");
    expect(s.match(/leave\(true\)/g)).toHaveLength(1);
    // Not a link the page held back: a finger's first tap on a station of /meteo opens its bubble, and the full screen
    // stays (it closed, and the page jumped by 800 px under the bubble).
    expect(s).toContain('box.addEventListener("click",(e)=>{const a=on&&!e.defaultPrevented&&e.target.closest');
    // Every other way out (the button, Escape, the end of the browser's full screen) puts the page back.
    expect(s).toContain("b.addEventListener(\"click\",()=>on?leave():enter())");
    expect(s).toContain("if(!document.fullscreenElement)leave()");
    expect(s).toContain("&&!document.fullscreenElement)leave()");
  });

  it("copies a rule's whole content, nested braces included, and leaves the text around it as it was", () => {
    expect(narrowTwins("a{b:c}@media (max-width:20rem){d{e:f}g h{i:j}}k{l:m}")).toBe(
      "a{b:c}@media (max-width:20rem){d{e:f}g h{i:j}}@container page (max-width:20rem){d{e:f}g h{i:j}}k{l:m}",
    );
    expect(narrowTwins("@media (max-width:30rem) and (min-height:20rem){a{b:c}}@media (max-width:600px){d{e:f}}")).toBe(
      "@media (max-width:30rem) and (min-height:20rem){a{b:c}}@media (max-width:600px){d{e:f}}",
    );
  });
});
