import { describe, expect, it } from "vitest";
import { handle } from "../src/app.js";
import { Cache } from "../src/cache.js";
import { DISCRETE } from "../src/web/entreprises.js";
import { DESCRIPTION_MAX } from "../src/web/pages.js";

const BROWSER = "text/html,application/xhtml+xml";
const get = (path: string) => new Request(`https://rundata.re${path}`, { headers: { accept: BROWSER } });

describe("/entreprises, the companies' and bodies' space", () => {
  it("answers 200, with its title, its nine anchors and the guide for those without a technical team", async () => {
    const r = await handle(get("/entreprises"), new Cache());
    expect(r.status).toBe(200);
    const page = await r.text();
    expect(page).toContain("<h1>Espace entreprises et organismes</h1>");
    expect(page).toContain("<title>Entreprises et organismes : ouvrir vos données sans exposer vos systèmes · rundata.re</title>");
    for (const id of ["accord", "export", "lecture-seule", "formats", "dpo", "dsi", "licences", "rundata", "conseil"]) {
      expect(page, id).toContain(`<h2 id="${id}">`);
      expect(page, id).toContain(`<a href="#${id}">`);
    }
    // Levels 0 to 2 are cards.
    expect(page.match(/<div class="card" style="align-content:start">\s*<h2 id="(accord|export|lecture-seule)">/g)).toHaveLength(3);
    expect(page).toContain('<a href="/ouvrir-ses-donnees">Rendre ses données accessibles</a>');
    // The sentence the user took out on 17/11/2026.
    expect(page).not.toContain("aérien compris");
    // No team speaks: rundata.re in the third person.
    const texte = `${page.split('<p class="lead">')[1]?.split("</p>")[0]}${page.split('<section style="max-width:44rem')[1]?.split("</section>")[0]}`;
    expect(texte.length).toBeGreaterThan(5000);
    expect(texte).not.toMatch(/\bnous\b|l'équipe/i);
    const description = /<meta name="description" content="([^"]*)"/.exec(page)?.[1] ?? "";
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("answers 200 with a campaign's query, without a redirect", async () => {
    const r = await handle(get("/entreprises?ref=aeroport"), new Cache());
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });

  it("is in noindex, out of the sitemap and linked from no other page while it goes out quietly", async () => {
    expect(DISCRETE).toBe(true);
    const page = await (await handle(get("/entreprises"), new Cache())).text();
    expect(page).toContain('<meta name="robots" content="noindex">');
    const map = await (await handle(get("/sitemap.xml"), new Cache())).text();
    expect(map).not.toContain("/entreprises");
    for (const other of ["/", "/ouvrir-ses-donnees", "/a-propos", "/valeurs"]) {
      expect(await (await handle(get(other), new Cache())).text(), other).not.toContain('href="/entreprises');
    }
  });

  it("is reached from /organismes and /open-data with a 301", async () => {
    for (const alias of ["/organismes", "/open-data", "/organismes/", "/entreprises/"]) {
      const r = await handle(get(alias), new Cache());
      expect(r.status, alias).toBe(301);
      expect(r.headers.get("location"), alias).toBe("/entreprises");
    }
  });
});
