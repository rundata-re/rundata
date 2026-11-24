import { describe, expect, it } from "vitest";
import { esc } from "../src/web/map.js";
import { brut, echappe, href, Html, html, permis } from "../src/web/html.js";

const PIEGE = `<script>alert(1)</script>"'&`;

describe("html, the pages written with escaping by default", () => {
  it("escapes every text put in it, between tags and in an attribute", () => {
    const out = html`<p title="${PIEGE}">${PIEGE}</p>`.toString();
    expect(out).toBe(`<p title="&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;">&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;</p>`);
    expect(out).not.toContain("<script");
  });

  it("escapes as esc does, so a page moved to html shows the same", () => {
    expect(echappe(PIEGE)).toBe(esc(PIEGE));
  });

  it("turns a number into a string, escaped too", () => {
    expect(html`<b>${24.5}</b> ${0} ${-3}`.toString()).toBe("<b>24.5</b> 0 -3");
  });

  it("puts in as they are only another html and a brut written on purpose", () => {
    const li = html`<li>${PIEGE}</li>`;
    expect(html`<ul>${li}</ul>`.toString()).toBe(`<ul>${li.texte}</ul>`);
    expect(html`<i>${brut("<br>")}</i>`.toString()).toBe("<i><br></i>");
    // Escaped once, never twice.
    expect(html`${html`${"a&b"}`}`.toString()).toBe("a&amp;b");
  });

  it("gives nothing for null, undefined and false, and an array's items one after another", () => {
    const vide: string | undefined = undefined;
    expect(html`[${null}${vide}${false}]`.toString()).toBe("[]");
    expect(html`<ul>${["<a>", html`<li>b</li>`, 3, null]}</ul>`.toString()).toBe("<ul>&lt;a&gt;<li>b</li>3</ul>");
    expect(html`${[["x", ["<y>"]]]}`.toString()).toBe("x&lt;y&gt;");
  });

  it("refuses an object, a function and true, which would print [object Object] or true", () => {
    expect(() => html`${{ titre: "x" } as never}`).toThrow(TypeError);
    expect(() => html`${(() => "x") as never}`).toThrow(TypeError);
    expect(() => html`${true as never}`).toThrow(TypeError);
  });

  it("is a string where one is expected, for the pages not moved yet", () => {
    const h = html`<p>${"a"}</p>`;
    expect(h).toBeInstanceOf(Html);
    expect(`${h}`).toBe("<p>a</p>");
    expect(String(h) + "!").toBe("<p>a</p>!");
  });
});

describe("href, the address of a link", () => {
  it("keeps the site's addresses and the web's, escaped", () => {
    expect(href("/bus/arret/gare-saint-pierre").toString()).toBe("/bus/arret/gare-saint-pierre");
    expect(href("#mer").toString()).toBe("#mer");
    expect(href("?jour=2026-11-24&ligne=E1").toString()).toBe("?jour=2026-11-24&amp;ligne=E1");
    expect(href("https://atmo-reunion.net/").toString()).toBe("https://atmo-reunion.net/");
    expect(href("//transport.data.gouv.fr/x").toString()).toBe("//transport.data.gouv.fr/x");
    expect(href("mailto:contact@rundata.re").toString()).toBe("mailto:contact@rundata.re");
    expect(href("tel:+262262000000").toString()).toBe("tel:+262262000000");
    expect(href(`https://x.re/?q="><script>`).toString()).toBe("https://x.re/?q=&quot;&gt;&lt;script&gt;");
  });

  it("refuses javascript:, data:, vbscript: and every scheme it does not know, written in any way", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "\u0001javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "inconnu:x",
    ]) expect(href(u).toString(), JSON.stringify(u)).toBe("#");
  });

  it("says by permis() the same of an address given in JSON (the structured data's url)", () => {
    for (const u of ["https://rundata.re/evenements", "/bus", "mailto:contact@rundata.re", "tel:+262262000000"]) expect(permis(u), u).toBe(true);
    for (const u of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "inconnu:x"]) expect(permis(u), JSON.stringify(u)).toBe(false);
  });

  it("goes in html as it is, being already escaped", () => {
    expect(html`<a href="${href("/a?b=1&c=2")}">x</a>`.toString()).toBe(`<a href="/a?b=1&amp;c=2">x</a>`);
    expect(html`<a href="${href("javascript:alert(1)")}">x</a>`.toString()).toBe(`<a href="#">x</a>`);
  });
});
